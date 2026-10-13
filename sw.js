// Retired: Interstellar Lens moved to https://leafactivity.com/interstellar/.
// This replacement worker clears the old offline cache, unregisters itself and sends open pages to the new home.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) { try { c.navigate('https://leafactivity.com/interstellar/'); } catch (x) { } }
})()));
self.addEventListener('fetch', () => { });
