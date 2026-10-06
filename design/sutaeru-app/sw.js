/* Sutaeru service worker: offline app shell.
   Opening the app: network first, cached shell when offline.
   Scripts and styles: stale while revalidate. Photos: cache first (they never change).
   Thumbnails and document covers are cached at install so Files and Agent look complete offline. */
const VERSION = "sutaeru-v5";
const SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./scene.js",
  "./brand.js",
  "./photo.js",
  "./docs.js",
  "./app.js",
  "./pwa.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon.svg",
  "./icons/apple-touch-icon.png"
];
const PRECACHE_IMAGES = ["./img/t/angle-high.webp", "./img/t/angle-low.webp", "./img/t/angle-top.webp", "./img/t/eng-gemini.webp", "./img/t/eng-openai.webp", "./img/t/eng-wan.webp", "./img/t/light-backlit.webp", "./img/t/light-golden.webp", "./img/t/light-night.webp", "./img/t/light-studio.webp", "./img/t/light-window.webp", "./img/t/look-clay.webp", "./img/t/look-painted.webp", "./img/t/ref.webp", "./img/t/var-backlit-2.webp", "./img/t/var-backlit-3.webp", "./img/t/var-backlit-4.webp", "./img/t/var-golden-2.webp", "./img/t/var-golden-3.webp", "./img/t/var-golden-4.webp", "./img/t/var-night-2.webp", "./img/t/var-night-3.webp", "./img/t/var-night-4.webp", "./img/t/var-studio-2.webp", "./img/t/var-studio-3.webp", "./img/t/var-studio-4.webp", "./img/t/var-window-2.webp", "./img/t/var-window-3.webp", "./img/t/var-window-4.webp", "./img/c/cov-clay.webp", "./img/c/cov-jakarta-bw.webp", "./img/c/cov-jakarta.webp", "./img/c/cov-panels.webp", "./img/c/cov-pylons.webp", "./img/c/cov-solar.webp", "./img/c/cov-villa.webp", "./img/c/cov-village.webp"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    await Promise.all(PRECACHE_IMAGES.map((u) => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION && k !== VERSION + "-img" && k !== "sutaeru-fonts").map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try { const res = await fetch(req); const c = await caches.open(VERSION); c.put("./index.html", res.clone()); return res; }
      catch (err) { return (await caches.match("./index.html")) || (await caches.match("./")) || Response.error(); }
    })());
    return;
  }
  if (url.origin === location.origin && url.pathname.includes("/img/")) {
    e.respondWith((async () => {
      const hit = await caches.match(req); if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) { const c = await caches.open(VERSION + "-img"); c.put(req, res.clone()); }
      return res;
    })());
    return;
  }
  if (url.origin === location.origin || url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    const bucket = url.origin === location.origin ? VERSION : "sutaeru-fonts";
    e.respondWith((async () => {
      const c = await caches.open(bucket);
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })());
  }
});
