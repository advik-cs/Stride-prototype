import { sosSyncManager } from './sosSyncManager';

export const SOS_SYNC_TAG = 'stride-sos-sync';
export const SOS_PERIODIC_SYNC_TAG = 'stride-sos-periodic-sync';
export const SOS_PERIODIC_SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15-minute conservative default

class BackgroundSyncService {
  private initialized = false;
  private lastRegisteredSyncTime = 0;
  private registrationCooldownMs = 5000;

  /**
   * Feature detection for Background Sync API (One-shot Background Sync)
   */
  isBackgroundSyncSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'SyncManager' in window
    );
  }

  /**
   * Feature detection for Periodic Background Sync API
   */
  isPeriodicSyncSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PeriodicSyncManager' in window
    );
  }

  /**
   * Registers a one-shot Background Sync event with tag 'stride-sos-sync'.
   * Safe and non-blocking: never throws, never fails SOS creation if unsupported.
   */
  async registerSosSync(): Promise<boolean> {
    if (!this.isBackgroundSyncSupported()) {
      return false;
    }

    // Cooldown check to avoid redundant rapid registration
    const now = Date.now();
    if (now - this.lastRegisteredSyncTime < this.registrationCooldownMs) {
      return true;
    }

    try {
      const registration = await this.getServiceWorkerRegistration();
      if (!registration || !('sync' in registration)) {
        return false;
      }

      await (registration as any).sync.register(SOS_SYNC_TAG);
      this.lastRegisteredSyncTime = Date.now();
      return true;
    } catch (err) {
      console.warn('[backgroundSyncService] Failed to register background sync:', err);
      return false;
    }
  }

  /**
   * Registers optional Periodic Background Sync with tag 'stride-sos-periodic-sync'.
   * Non-fatal progressive enhancement: never required for core SOS delivery.
   */
  async registerPeriodicSosSync(minIntervalMs = SOS_PERIODIC_SYNC_INTERVAL_MS): Promise<boolean> {
    if (!this.isPeriodicSyncSupported()) {
      return false;
    }

    try {
      // Check periodic-background-sync permission if Permissions API is available
      if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
        try {
          const status = await (navigator.permissions as any).query({
            name: 'periodic-background-sync',
          });
          if (status && status.state !== 'granted') {
            return false;
          }
        } catch {
          // Some browsers throw on unknown permission names; treat gracefully
        }
      }

      const registration = await this.getServiceWorkerRegistration();
      if (!registration || !('periodicSync' in registration)) {
        return false;
      }

      await (registration as any).periodicSync.register(SOS_PERIODIC_SYNC_TAG, {
        minInterval: minIntervalMs,
      });
      return true;
    } catch (err) {
      console.warn('[backgroundSyncService] Periodic sync registration not permitted or failed:', err);
      return false;
    }
  }

  /**
   * Initializes background sync listeners on client startup.
   */
  init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    // Listen for wake-up messages from the service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'STRIDE_TRIGGER_SOS_SYNC') {
          console.log('[backgroundSyncService] Received SW sync notification — triggering SOS outbox flush');
          sosSyncManager.handleOnlineEvent().catch((err) => {
            console.warn('[backgroundSyncService] Background sync message flush error:', err);
          });
        }
      });
    }

    // Attempt optional one-time periodic sync registration on startup
    this.registerPeriodicSosSync().catch(() => {});
  }

  private async getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }

    try {
      // 3-second timeout for ready promise to prevent indefinite hanging in unsupported environments
      const readyPromise = navigator.serviceWorker.ready;
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
      return await Promise.race([readyPromise, timeoutPromise]);
    } catch {
      return null;
    }
  }
}

export const backgroundSyncService = new BackgroundSyncService();
