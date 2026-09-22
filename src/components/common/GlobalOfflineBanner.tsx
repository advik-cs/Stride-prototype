import React from 'react';
import { WifiOff, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useConnectivityStatus } from '../../offline/useConnectivityStatus';
import { sosSyncManager } from '../../offline/sosSyncManager';

export const GlobalOfflineBanner: React.FC = () => {
  const { state, isOffline, isSyncing, hasPendingSync, serverReachable } = useConnectivityStatus();

  // If online, with no pending outbox and server is reachable, show nothing
  if (state === 'ONLINE' && serverReachable && !hasPendingSync && !isSyncing) {
    return null;
  }

  const handleManualSync = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      sosSyncManager.syncPendingOutbox().catch((err) => {
        console.warn('[GlobalOfflineBanner] Manual sync trigger failed:', err);
      });
    }
  };

  if (isOffline) {
    return (
      <aside
        id="global-offline-banner"
        aria-label="Offline Mode Notification"
        className="w-full bg-amber-500/15 border-b border-amber-500/30 text-amber-950 px-4 py-2.5 transition-all duration-300"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1 rounded-md bg-amber-500/20 text-amber-900 flex-shrink-0">
              <WifiOff className="w-4 h-4" />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-bold tracking-wide uppercase text-[11px] text-amber-900">
                Offline Mode:
              </span>
              <span className="text-amber-950">
                Some live features are unavailable. Showing saved information.
              </span>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-amber-800/80 hidden sm:inline-block flex-shrink-0">
            All offline actions are safely stored on device
          </span>
        </div>
      </aside>
    );
  }

  if (isSyncing) {
    return (
      <aside
        id="global-syncing-banner"
        aria-label="Synchronization Active Notification"
        className="w-full bg-blue-500/15 border-b border-blue-500/30 text-blue-950 px-4 py-2.5 transition-all duration-300"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1 rounded-md bg-blue-500/20 text-blue-900 flex-shrink-0">
              <RefreshCw className="w-4 h-4 animate-spin" />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-bold tracking-wide uppercase text-[11px] text-blue-900">
                Synchronizing:
              </span>
              <span className="text-blue-950">
                {hasPendingSync
                  ? 'Connection restored. Sending pending emergency request...'
                  : 'Sending pending emergency updates...'}
              </span>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-blue-800/80 hidden sm:inline-block flex-shrink-0">
            Transmitting to emergency authorities
          </span>
        </div>
      </aside>
    );
  }

  if (hasPendingSync) {
    return (
      <aside
        id="global-pending-sync-banner"
        aria-label="Pending Synchronization Notification"
        className="w-full bg-amber-500/10 border-b border-amber-500/30 text-amber-950 px-4 py-2.5 transition-all duration-300"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1 rounded-md bg-amber-500/20 text-amber-900 flex-shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-bold tracking-wide uppercase text-[11px] text-amber-900">
                Pending Sync:
              </span>
              <span className="text-amber-950">
                Connection available. Pending emergency request queued for transmission.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleManualSync}
            className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition shadow-xs flex-shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Transmit Now</span>
          </button>
        </div>
      </aside>
    );
  }

  if (!serverReachable) {
    return (
      <aside
        id="global-unreachable-banner"
        aria-label="Server Connectivity Warning"
        className="w-full bg-amber-500/10 border-b border-amber-500/25 text-amber-950 px-4 py-2 transition-all duration-300"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
            <span>Connection unavailable. Unable to reach STRIDE servers. Showing saved information.</span>
          </div>
        </div>
      </aside>
    );
  }

  return null;
};
