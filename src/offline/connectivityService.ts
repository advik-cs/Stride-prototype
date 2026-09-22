import { offlineStorageService } from './offlineStorageService';
import { authApi } from '../api/authApi';
import type { ConnectivityState, ConnectivityStatus } from './types';

type ConnectivityListener = (status: ConnectivityStatus) => void;

class ConnectivityService {
  private currentState: ConnectivityState = 'ONLINE';
  private listeners: Set<ConnectivityListener> = new Set();
  private isSyncing = false;
  private hasPending = false;
  private serverReachable = true;
  private initialized = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.currentState = typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'ONLINE';
    }
  }

  /**
   * Initializes browser online/offline listeners and checks for pending outbox mutations.
   * Safe and non-blocking during startup.
   */
  async init(): Promise<void> {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    // Browser network events
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Sync notification event
    window.addEventListener('stride_sos_synced', this.handleSyncEvent);

    // Auth change event (login / logout)
    window.addEventListener('stride_auth_changed', this.handleAuthChanged);

    // Initial evaluation
    await this.refreshPendingStatus().catch(() => {});
  }

  private handleSyncEvent = (): void => {
    this.refreshPendingStatus().catch((err) => {
      console.warn('[connectivityService] Failed to refresh pending status on sync event:', err);
    });
  };

  private handleAuthChanged = (): void => {
    this.refreshPendingStatus().catch((err) => {
      console.warn('[connectivityService] Failed to refresh pending status on auth change:', err);
    });
  };

  /**
   * Destroys event listeners (for test cleanup).
   */
  destroy(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('stride_sos_synced', this.handleSyncEvent);
    window.removeEventListener('stride_auth_changed', this.handleAuthChanged);
    this.listeners.clear();
    this.initialized = false;
  }

  private handleOnline = (): void => {
    // navigator.onLine is true, but verify outbox state before determining ONLINE vs ONLINE_PENDING_SYNC
    this.refreshPendingStatus().catch((err) => {
      console.warn('[connectivityService] Error checking pending outbox on online event:', err);
    });
  };

  private handleOffline = (): void => {
    this.recomputeState();
  };

  /**
   * Inspects IndexedDB sosOutbox for pending mutations and recalculates state.
   */
  async refreshPendingStatus(): Promise<void> {
    try {
      const outboxRes = await offlineStorageService.getOutboxItemsByStatus('PENDING');
      if (outboxRes.ok && outboxRes.data) {
        const currentUser = authApi.getStoredUser();
        if (currentUser?.id) {
          // Strictly match current user's mutations (multi-user isolation)
          this.hasPending = outboxRes.data.some(
            (item) => item.userId === currentUser.id
          );
        } else {
          // Unauthenticated or logged-out users never have pending distress sync
          this.hasPending = false;
        }
      } else {
        this.hasPending = false;
      }
    } catch {
      this.hasPending = false;
    }

    this.recomputeState();
  }

  /**
   * Updates sync active state. Invoked by sosSyncManager during transmission lifecycle.
   */
  setSyncing(syncing: boolean): void {
    this.isSyncing = syncing;
    this.recomputeState();
  }

  /**
   * Records a successful API response, updating informational reachability.
   * Does NOT trigger continuous polling or pinging.
   */
  recordApiSuccess(): void {
    this.serverReachable = true;
    this.recomputeState();
  }

  /**
   * Records an API network failure, updating informational reachability.
   * Does NOT assume offline if browser is still connected to network.
   */
  recordApiFailure(_error?: unknown): void {
    this.serverReachable = false;
    this.recomputeState();
  }

  /**
   * Returns current coarse connectivity state.
   */
  getState(): ConnectivityState {
    return this.currentState;
  }

  /**
   * Returns complete typed connectivity status snapshot.
   */
  getStatus(): ConnectivityStatus {
    return {
      state: this.currentState,
      isOnline: this.currentState !== 'OFFLINE',
      isOffline: this.currentState === 'OFFLINE',
      isSyncing: this.isSyncing,
      hasPendingSync: this.hasPending,
      serverReachable: this.serverReachable,
    };
  }

  /**
   * Subscribes a listener to connectivity status updates.
   * Returns an unsubscription function.
   */
  subscribe(listener: ConnectivityListener): () => void {
    this.listeners.add(listener);
    // Emit current state immediately
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private recomputeState(): void {
    const isBrowserOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    let newState: ConnectivityState;
    if (isBrowserOffline) {
      newState = 'OFFLINE';
    } else if (this.isSyncing) {
      newState = 'SYNCING';
    } else if (this.hasPending) {
      newState = 'ONLINE_PENDING_SYNC';
    } else {
      newState = 'ONLINE';
    }

    this.currentState = newState;

    const snapshot = this.getStatus();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('[connectivityService] Subscriber error:', err);
      }
    });
  }
}

export const connectivityService = new ConnectivityService();
