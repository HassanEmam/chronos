/*
  Chronos Service Worker
  - Caches app shell assets for offline load
  - Serves cached files first, then updates in the background
*/

const CACHE_NAME = 'chronos-v3';
const APP_SHELL = [
  './',
  './index.html',
  './browser.js',
  './manifest.webmanifest',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './js/app.js',
  './js/fileHandler.js',
  './js/uiManager.js',
  './js/dataDisplayManager.js',
  './js/exportManager.js',
  './js/integrityChecker.js',
  './js/resourceCurveManager.js',
  './js/ganttChart.js',
  './css/styles.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Stale-while-revalidate for same-origin GET requests
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navigation requests: serve cached index.html as fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
