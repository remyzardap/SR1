// Sutaeru Service Worker — v4
//
// Offline policy:
//   - API traffic (/api/..., /trpc/...) never touches the cache. The streaming
//     chat endpoints are /api/kemma/stream and /api/fn/research; caching or
//     buffering a response there breaks SSE.
//   - Navigations are network-first with the cached shell as the offline answer.
//   - Other same-origin GETs are cache-first, and only successful same-origin
//     static assets are stored.
//
// The cache name carries the version, so `activate` drops every other cache and
// an update can never serve a shell asset from the previous build.
const CACHE_NAME = 'sutaeru-v4';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.svg',
  '/favicon.png',
];

const STATIC_DESTINATIONS = ['script', 'style', 'image', 'font', 'worker'];

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/trpc/');
}

function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

function isStaticAsset(request) {
  return STATIC_DESTINATIONS.includes(request.destination);
}

// A settled answer for "offline and nothing cached". Letting respondWith() reject
// would hand the browser an error page instead of something the UI can show.
function offlineResponse() {
  return new Response('Offline', {
    status: 504,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell());
  // Deliberately no skipWaiting(): a new worker must not replace the one a live
  // stream is running on. The page posts `skip-waiting` once it decides it is
  // safe for the update to take effect.
});

// One entry at a time. `cache.addAll()` rejects as soon as a single URL 404s,
// which aborts installation and leaves the worker redundant with no offline shell
// at all; a partial shell still answers navigations.
async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    APP_SHELL.map(async (url) => {
      try {
        const response = await fetch(url);
        if (response && response.ok) {
          await cache.put(url, response);
        }
      } catch {
        /* keep the entries that did resolve */
      }
    })
  );
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only same-origin GETs are ours to intercept.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Never cache API requests or SSE streams - always go to network.
  if (isApiRequest(url)) return;

  // Navigations: fresh shell when online, cached index.html when not.
  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstShell(request));
    return;
  }

  event.respondWith(cacheFirstAsset(request));
});

async function networkFirstShell(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match('/index.html');
    return cached || offlineResponse();
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  let response;
  try {
    response = await fetch(request);
  } catch {
    return offlineResponse();
  }

  // Store a clean copy only: clone before the page consumes the body, and accept
  // same-origin successes so a 404 or an opaque reply cannot be replayed forever
  // once the device is offline.
  if (response.ok && response.type === 'basic' && isStaticAsset(request)) {
    const copy = response.clone();
    caches
      .open(CACHE_NAME)
      .then((target) => target.put(request, copy))
      .catch(() => undefined);
  }

  return response;
}

// The page asks this worker to take effect now. The "no stream in flight" guard
// lives on the page side (client/src/lib/activeStreams.ts): postMessage() reaches
// the *controlling* worker while skipWaiting() has to run in the *waiting* one, so
// a counter kept here could never gate itself.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'skip-waiting') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Sutaeru', {
      body: data.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url ?? '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      const url = event.notification.data?.url ?? '/';
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })
  );
});
