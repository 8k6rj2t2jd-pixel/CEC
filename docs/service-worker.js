'use strict';

// Guarda a app em cache para funcionar sem internet, mas sem nunca ficar
// "presa" numa versão antiga:
// - ficheiros da app (HTML/CSS/JS) -> tenta sempre a rede primeiro, só usa
//   a cópia em cache se estiver offline. Assim, cada atualização publicada
//   aparece já na próxima vez que abrir com internet.
// - ficheiros grandes do OCR (vendor/tesseract/*) -> nunca mudam, por isso
//   usam cache primeiro (mais rápido e poupa dados móveis).
const CACHE_NAME = 'cec-catalogo-v2';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './zip.js',
  './manifest.webmanifest',
  './icon.svg',
];
const VENDOR_ASSETS = [
  './vendor/tesseract/tesseract.min.js',
  './vendor/tesseract/worker.min.js',
  './vendor/tesseract/tesseract-core-lstm.wasm.js',
  './vendor/tesseract/tesseract-core-lstm.wasm',
  './vendor/tesseract/lang/eng.traineddata.gz',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([...APP_SHELL, ...VENDOR_ASSETS]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isVendorAsset(url) {
  return url.pathname.includes('/vendor/tesseract/');
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (isVendorAsset(url)) {
    // Cache-first: estes ficheiros são grandes e nunca mudam.
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return resp;
        });
      })
    );
    return;
  }

  // Network-first: o código da app deve atualizar-se sempre que houver
  // internet; a cópia em cache só serve de recurso para modo offline.
  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
