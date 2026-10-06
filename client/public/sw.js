// Sutaeru Service Worker — v3
const CACHE_NAME = 'sutaeru-v3';
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

// Track if a stream/SSE connection is active
let activeStreams = 0;

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/trpc/');
}

function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Do NOT skipWaiting here - wait for activate to avoid breaking in-progress streams
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Never cache API requests or SSE streams - always go to network
  if (isApiRequest(url)) {
    return;
  }

  // For navigation requests, try network first, fall back to cached index.html
  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For app shell assets: cache-first strategy
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Cache successful responses for static assets
        if (response.ok && (request.destination === 'script' || request.destination === 'style' || request.destination === 'image' || request.destination === 'font')) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return response;
      });
    })
  );
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data === 'stream-start') {
    activeStreams++;
  } else if (event.data === 'stream-end') {
    activeStreams = Math.max(0, activeStreams - 1);
    // If a new SW is waiting and no streams are active, tell it to skipWaiting
    if (activeStreams === 0) {
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'check-update' }));
      });
    }
  } else if (event.data === 'skip-waiting') {
    self.skipWaiting();
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
    clients.matchAll({ type: 'window' }).then((clientList) => {
      const url = event.notification.data?.url ?? '/';
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});