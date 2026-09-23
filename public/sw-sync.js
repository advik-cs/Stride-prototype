// STRIDE Service Worker Background Sync & Periodic Sync Extension
// Handles 'sync' and 'periodicsync' events and bridges to active application clients.
// Preserves strict token authentication, idempotency, and server-authoritative priority rules.

self.addEventListener('sync', (event) => {
  if (event.tag === 'stride-sos-sync') {
    event.waitUntil(handleStrideSosBackgroundSync('stride-sos-sync'));
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'stride-sos-periodic-sync') {
    event.waitUntil(handleStrideSosBackgroundSync('stride-sos-periodic-sync'));
  }
});

async function handleStrideSosBackgroundSync(syncTag) {
  try {
    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    if (windowClients && windowClients.length > 0) {
      for (const client of windowClients) {
        client.postMessage({
          type: 'STRIDE_TRIGGER_SOS_SYNC',
          tag: syncTag,
          timestamp: Date.now(),
        });
      }
    }
    // Note on no-window scenario:
    // When no application window is open, JWT authentication credentials in localStorage
    // are inaccessible to the service worker environment. The IndexedDB outbox records
    // are safely preserved in PENDING status. As soon as the application mounts or connectivity
    // triggers a window event, the authenticated application-side sync manager immediately flushes the outbox.
  } catch (err) {
    // Non-fatal background sync error logging
  }
}
