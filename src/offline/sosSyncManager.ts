import { offlineStorageService } from './offlineStorageService';
import { duringApi, RescueRequest } from '../api/duringApi';
import { authApi } from '../api/authApi';
import { SosOutboxRecord, ActiveSosRecord } from './types';

export interface SyncReport {
  syncedCount: number;
  errors: string[];
}

let isSyncing = false;
let isInitialized = false;

export const sosSyncManager = {
  /**
   * Initializes network connectivity listeners for automatic background synchronization.
   */
  init(): void {
    if (isInitialized || typeof window === 'undefined') return;
    isInitialized = true;

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
    let syncedCount = 0;
    const errors: string[] = [];

    try {
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

        // Only process CREATE_SOS mutations in Phase 2 Step 4
        if (item.actionType !== 'CREATE_SOS') {
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

          syncedCount++;
        } catch (err: any) {
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
            // Transient network failure / 5xx / timeout — increment retry count and reset to PENDING
            item.retryCount = (item.retryCount || 0) + 1;
            item.syncStatus = 'PENDING';
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
    }

    return { syncedCount, errors };
  },
};
