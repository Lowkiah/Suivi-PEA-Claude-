/* Service worker : permet l'installation et l'ouverture hors connexion.
   Réseau d'abord pour les fichiers de l'app (mises à jour immédiates), cache en secours.
   Les cours de bourse ne sont jamais mis en cache. */
const CACHE = 'suivi-pea-v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'data.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const isShell = url.origin === location.origin ? !url.pathname.includes('/api/') : url.href.includes('chart.umd.min.js');
  if (!isShell) return; // cours Yahoo / proxys : toujours le réseau
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
