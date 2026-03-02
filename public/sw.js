// Matria Service Worker
// Bump CACHE_VERSION to invalidate all caches on deploy.

const CACHE_VERSION = 'v20';
const STATIC_CACHE = `matria-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `matria-runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/logo.png',
  '/logo-dark.png',
  '/matria.png',
  '/apple-touch-icon.png',
];

// ---- INSTALL: precache app shell ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ---- ACTIVATE: purge old caches ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ---- FETCH: routing strategies ----
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Network-first for API routes (Pages Function + OpenFDA + RxNorm)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }
  if (url.hostname === 'api.fda.gov') {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }
  if (url.hostname === 'rxnav.nlm.nih.gov') {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }

  // Cache-first for Google Fonts
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  // Cache-first for same-origin static assets
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    return new Response(
      JSON.stringify({ error: 'You appear to be offline.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
