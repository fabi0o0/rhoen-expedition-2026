/* Offline-Unterstützung: App-Dateien, besuchte Kartenkacheln und letzte Wetterdaten bleiben auf dem Gerät. */
const SHELL = 'rhoen-shell-v2';
const TILES = 'rhoen-tiles-v1';
const DATA = 'rhoen-data-v1';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    const base = self.registration.scope;
    try {
      const res = await fetch(base, { cache: 'reload' });
      const html = await res.clone().text();
      await cache.put(base, res.clone());
      await cache.put(base + 'index.html', res.clone());
      const urls = new Set(['favicon.svg', 'manifest.webmanifest', 'icon-192.png', 'icon-180.png']);
      for (const m of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) urls.add(m[1].slice(2));
      await Promise.all([...urls].map((u) => cache.add(new Request(new URL(u, base), { cache: 'reload' })).catch(() => undefined)));
    } catch (e) { /* ohne Netz installiert: beim nächsten Besuch erneut */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('rhoen-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(fallbackKey || req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(fallbackKey || req);
    if (hit) return hit;
    throw e;
  }
}
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) { return Response.error(); }
}
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/sw.js')) return;
    if (req.mode === 'navigate') {
      event.respondWith(networkFirst(req, SHELL, self.registration.scope));
      return;
    }
    event.respondWith(staleWhileRevalidate(req, SHELL));
    return;
  }
  if (url.hostname === 'tile.openstreetmap.org') { event.respondWith(cacheFirst(req, TILES)); return; }
  if (url.hostname === 'api.open-meteo.com') { event.respondWith(networkFirst(req, DATA)); return; }
});
