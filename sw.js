// =============================================================================
// sw.js — service worker minimal : met les fichiers de l'app en cache pour un
// fonctionnement hors-ligne après le premier chargement. Les données restent
// dans IndexedDB (non concerné par ce cache).
//
// Strategie "network-first, cache en repli" : a chaque requete, on tente
// d'abord le reseau (pour avoir systematiquement la derniere version deployee
// sans avoir a recharger deux fois la page apres une mise a jour), et on ne
// retombe sur le cache que si le reseau echoue (mode hors-ligne). Le cache
// est mis a jour a chaque reponse reseau reussie, pour rester utilisable
// hors-ligne avec la derniere version vue.
// =============================================================================

const CACHE_NAME = 'turf-analyse-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/passwordGate.js',
  './js/app.js',
  './js/db.js',
  './js/engine/coteUtils.js',
  './js/engine/discipline.js',
  './js/engine/scoringEngine.js',
  './js/engine/probabilityEngine.js',
  './js/engine/raceAnalyzer.js',
  './js/engine/csvImporter.js',
  './js/engine/rubriques.js',
  './js/engine/basesEtDangers.js',
  './js/engine/cotesCibles.js',
  './js/engine/zeturfParser.js',
  './js/engine/pmuApi.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
