// Cambia la versione per forzare l'aggiornamento sui dispositivi degli utenti
const CACHE_NAME = 'azimut-arch-v3'; 

const urlsToCache = [
  './',
  './index.html',     
  './armadio.html',   
  './armadio.js',     
  './cambusa.html',
  './cambusa.js',     // AGGIUNTO: mancava la logica della cambusa
  './magazzino.html', // AGGIUNTO: mancava la pagina magazzino
  './magazzino.js',   // AGGIUNTO: mancava la logica del magazzino
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Installazione del Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Strategia: Network First (Cerca online, se non va usa la cache)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// Attivazione e pulizia vecchie cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
