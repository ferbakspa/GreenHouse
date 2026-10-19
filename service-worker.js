const CACHE_NAME = 'greenhouse-planner-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './organics/conexion.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for external APIs (weather/geolocation/AI), cache-first for the app shell itself.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isAppShell = url.origin === self.location.origin;

  if (!isAppShell) {
    // Let external requests (open-meteo, ipwho.is, Anthropic API) go straight to the network.
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
