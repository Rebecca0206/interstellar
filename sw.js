// Interstellar Lens service worker: offline app shell + data; TLE snapshots network-first.
const V = 'interstellar-v4';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'js/gate.js', 'vendor/qrcode.js',
  'js/core.js', 'js/state.js', 'js/render.js', 'js/ui-sheets.js', 'js/features.js', 'js/app.js',
  'data/sky-data.js', 'data/facts.js',
  'vendor/astronomy.browser.min.js', 'vendor/satellite.min.js', 'vendor/magvar.min.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'data/tle/stations.tle', 'data/tle/visual.tle', 'data/tle/gps-ops.tle', 'data/tle/weather.tle', 'data/tle/science.tle', 'data/tle/starlink.tle'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return; // CelesTrak requests go straight to the network
  if (u.pathname.includes('/data/tle/')) {
    e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(e.request, cp)); } return res; })));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./'))); });
