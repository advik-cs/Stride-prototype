import { useState, useEffect } from 'react';
import { connectivityService } from './connectivityService';
import type { ConnectivityStatus } from './types';

/**
 * React hook that subscribes to the centralized connectivity service.
 * Exposes current connectivity state without causing unnecessary re-renders.
 */
export function useConnectivityStatus(): ConnectivityStatus {
  const [status, setStatus] = useState<ConnectivityStatus>(() => connectivityService.getStatus());

  useEffect(() => {
    const unsubscribe = connectivityService.subscribe((newStatus) => {
      setStatus((prev) => {
        // Prevent re-render if primitive fields have not changed
        if (
          prev.state === newStatus.state &&
          prev.isOnline === newStatus.isOnline &&
          prev.isOffline === newStatus.isOffline &&
          prev.isSyncing === newStatus.isSyncing &&
          prev.hasPendingSync === newStatus.hasPendingSync &&
          prev.serverReachable === newStatus.serverReachable
        ) {
          return prev;
        }
        return newStatus;
      });
    });

    return unsubscribe;
  }, []);

  return status;
}
