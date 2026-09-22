import { offlineStorageService } from './offlineStorageService';
import { duringApi, RescueRequest } from '../api/duringApi';
import { authApi } from '../api/authApi';
import { connectivityService } from './connectivityService';
import { SosOutboxRecord, ActiveSosRecord } from './types';

export interface SyncReport {
  syncedCount: number;
  errors: string[];
}

/**
 * Explicit bounded exponential backoff schedule:
 * attempt 1 = 2s (2,000ms)
 * attempt 2 = 5s (5,000ms)
 * attempt 3 = 15s (15,000ms)
 * attempt 4 = 30s (30,000ms)
 * attempt 5+ = 60s maximum (60,000ms)
 */
export function getBackoffDelayMs(retryCount: number): number {
  if (retryCount <= 1) return 2000;
  if (retryCount === 2) return 5000;
  if (retryCount === 3) return 15000;
  if (retryCount === 4) return 30000;
  return 60000;
}

let isSyncing = false;
let isInitialized = false;

export const sosSyncManager = {
  /**
   * Recovers stale SYNCING or IN_FLIGHT mutations that were interrupted by a browser crash,
   * tab closure, or network freeze. Resets their status to PENDING while strictly preserving
   * the exact same clientOperationId.
   */
  async recoverStaleSyncingItems(forceAll = false, timeoutMs = 15000): Promise<number> {
    let recoveredCount = 0;
    try {
      const syncingItems = await offlineStorageService.getOutboxItemsByStatus('SYNCING');
      const inFlightItems = await offlineStorageService.getOutboxItemsByStatus('IN_FLIGHT');

      const candidateItems = [
        ...(syncingItems.ok && syncingItems.data ? syncingItems.data : []),
        ...(inFlightItems.ok && inFlightItems.data ? inFlightItems.data : []),
      ];

      if (candidateItems.length === 0) return 0;

      const now = Date.now();

      for (const item of candidateItems) {
        // On startup (forceAll = true), any SYNCING item is orphaned from a prior browser session.
        // In periodic recovery, verify item has been stuck longer than timeoutMs.
        const itemTimestamp = new Date(item.clientTimestamp).getTime();
        const isStale = forceAll || (now - itemTimestamp > timeoutMs);

        if (isStale) {
          console.warn(`[sosSyncManager] Recovering orphaned outbox mutation #${item.id.slice(0, 8)} to PENDING`);
          // Preserve EXACT same clientOperationId (item.id)
          item.syncStatus = 'PENDING';
          item.lastError = 'Previous transmission attempt was interrupted. Queued for retry.';
          await offlineStorageService.putOutboxItem(item);

          const localSos = await offlineStorageService.getActiveSos(item.id);
          if (localSos.ok && localSos.data) {
            const sos = localSos.data;
            sos.syncStatus = 'PENDING';
            await offlineStorageService.putActiveSos(sos);
          }
          recoveredCount++;
        }
      }
    } catch (err) {
      console.warn('[sosSyncManager] Error recovering stale syncing items:', err);
    }
    return recoveredCount;
  },

  /**
   * Initializes network connectivity listeners for automatic background synchronization.
   */
  init(): void {
    if (isInitialized || typeof window === 'undefined') return;
    isInitialized = true;

    // Immediately recover any orphaned SYNCING or IN_FLIGHT records from a prior crashed session
    this.recoverStaleSyncingItems(true).catch((err) => {
      console.warn('[sosSyncManager] Startup recovery error:', err);
    });

    window.addEventListener('online', () => {
      console.log('[sosSyncManager] Network online detected — triggering SOS outbox synchronization');
      this.syncPendingOutbox().catch((err) => {
        console.warn('[sosSyncManager] Reconnect sync error:', err);
      });
    });
  },

  /**
   * Checks if synchronization is currently active.
   */
  isSyncInProgress(): boolean {
    return isSyncing;
  },

  /**
   * Synchronizes all pending outbox mutations for the currently authenticated citizen.
   * Enforces strict user isolation, chronological FIFO ordering, and in-memory concurrency locks.
   */
  async syncPendingOutbox(): Promise<SyncReport> {
    if (isSyncing) {
      return { syncedCount: 0, errors: ['Sync already in progress'] };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { syncedCount: 0, errors: ['Device is offline'] };
    }

    const currentUser = authApi.getStoredUser();
    if (!currentUser || !currentUser.id) {
      return { syncedCount: 0, errors: ['No authenticated user found for sync'] };
    }

    isSyncing = true;
    connectivityService.setSyncing(true);
    let syncedCount = 0;
    const errors: string[] = [];

    try {
      // 0. Recover any stale SYNCING/IN_FLIGHT items before collecting pending items
      await this.recoverStaleSyncingItems(false);

      // 1. Retrieve all pending outbox mutations
      const outboxRes = await offlineStorageService.getOutboxItemsByStatus('PENDING');
      if (!outboxRes.ok || !outboxRes.data || outboxRes.data.length === 0) {
        return { syncedCount: 0, errors: [] };
      }

      // 2. Sort chronologically ascending
      const items = [...outboxRes.data].sort(
        (a, b) => new Date(a.clientTimestamp).getTime() - new Date(b.clientTimestamp).getTime()
      );

      for (const item of items) {
        // USER ISOLATION CHECK: Never synchronize another citizen's outbox item
        if (item.userId && item.userId !== currentUser.id) {
          console.warn(`[sosSyncManager] Skipping mutation for user ${item.userId} (current user: ${currentUser.id})`);
          continue;
        }

        // Only process CREATE_SOS mutations in Phase 2 Step 4 & 5
        if (item.actionType !== 'CREATE_SOS') {
          continue;
        }

        // Bounded exponential backoff check: Skip if still in cooldown
        if (item.nextRetryAt && Date.now() < item.nextRetryAt) {
          console.log(`[sosSyncManager] Skipping mutation #${item.id.slice(0, 8)}: backoff delay active until ${new Date(item.nextRetryAt).toLocaleTimeString()}`);
          continue;
        }

        // Mark outbox item and local SOS as SYNCING
        item.syncStatus = 'SYNCING';
        await offlineStorageService.putOutboxItem(item);

        const localSosResult = await offlineStorageService.getActiveSos(item.id);
        if (localSosResult.ok && localSosResult.data) {
          const sos = localSosResult.data;
          sos.syncStatus = 'SYNCING';
          await offlineStorageService.putActiveSos(sos);
        }

        try {
          const payload = item.payload || {};
          const serverSos = await duringApi.submitRescueRequest({
            ...payload,
            clientOperationId: item.id, // Preserves the exact clientOperationId across all retries
          });

          // Atomically update activeSos and mark outbox item SYNCED
          await offlineStorageService.reconcileSyncedSos(item.id, item.id, serverSos);

          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('stride_active_sos_id', serverSos.id);
          }

          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('stride_sos_synced', {
                detail: { clientOperationId: item.id, serverSos },
              })
            );
          }

          connectivityService.recordApiSuccess();
          syncedCount++;
        } catch (err: any) {
          connectivityService.recordApiFailure(err);
          const statusCode = err?.status || err?.statusCode;
          const errMsg = err?.message || 'Failed to transmit SOS to server.';
          errors.push(errMsg);

          if (statusCode === 400) {
            // Permanent validation failure — do not retry automatically
            item.syncStatus = 'FAILED';
            item.lastError = errMsg;
            await offlineStorageService.putOutboxItem(item);

            if (localSosResult.ok && localSosResult.data) {
              const sos = localSosResult.data;
              sos.syncStatus = 'FAILED';
              await offlineStorageService.putActiveSos(sos);
            }
          } else if (statusCode === 401 || statusCode === 403) {
            // Authentication error — keep mutation safe, require re-authentication
            item.syncStatus = 'FAILED';
            item.lastError = 'Authentication expired or unauthorized. Please log in again to sync.';
            await offlineStorageService.putOutboxItem(item);

            if (localSosResult.ok && localSosResult.data) {
              const sos = localSosResult.data;
              sos.syncStatus = 'FAILED';
              await offlineStorageService.putActiveSos(sos);
            }
          } else {
            // Transient network failure / 5xx / timeout — increment retry count, schedule backoff, and reset to PENDING
            item.retryCount = (item.retryCount || 0) + 1;
            item.syncStatus = 'PENDING';
            item.nextRetryAt = Date.now() + getBackoffDelayMs(item.retryCount);
            item.lastError = errMsg;
            await offlineStorageService.putOutboxItem(item);

            if (localSosResult.ok && localSosResult.data) {
              const sos = localSosResult.data;
              sos.syncStatus = 'PENDING';
              await offlineStorageService.putActiveSos(sos);
            }
          }
        }
      }
    } finally {
      isSyncing = false;
      connectivityService.setSyncing(false);
      await connectivityService.refreshPendingStatus().catch(() => {});
    }

    return { syncedCount, errors };
  },
};
