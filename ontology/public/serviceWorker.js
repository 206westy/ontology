// Kill-switch service worker.
// This app does not use a service worker. A stale registration left at the
// localhost scope (e.g. from a previous app on this port) keeps requesting
// /serviceWorker.js and 404s. Serving this file lets that worker unregister
// itself and clear any caches, stopping the 404.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        await self.registration.unregister();
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {
        // best-effort cleanup
      }
    })(),
  );
});
