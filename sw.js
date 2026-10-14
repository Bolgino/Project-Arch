// Cambia la versione per forzare l'aggiornamento sui telefoni
const CACHE_NAME = 'azimut-arch-v4';

const FILE_DEL_SITO = [
  './',
  './index.html',
  './armadio.html',
  './armadio.js',
  './cambusa.html',
  './cambusa.js',
  './common.js',
  './common.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './img/curve.svg',
  './fonts/BarlowCondensed-SemiBold.woff',
  './fonts/BarlowCondensed-Bold.woff',
  './fonts/AtkinsonHyperlegible-Regular.woff',
  './fonts/AtkinsonHyperlegible-Bold.woff'
];

// Librerie esterne da tenere anche offline (i dati di Supabase invece no: devono essere sempre freschi)
const ESTERNI = ['https://cdn.jsdelivr.net/'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(FILE_DEL_SITO)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nomi) => Promise.all(nomi.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Prima la rete (così si vede sempre l'ultima versione), la copia salvata solo se si è offline
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const daSalvare = url.origin === self.location.origin || ESTERNI.some((e) => req.url.startsWith(e));
  if (!daSalvare) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
