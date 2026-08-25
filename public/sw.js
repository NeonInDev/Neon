const CACHE = "neon-hud-v2";
const CORE = [
  "/",
  "/manifest.json",
  "/public/hud/style.css",
  "/public/hud/app.js",
  "/public/hud/index.html",
  "/public/hud/holomap.html",
  "/public/icons/icon-192.png",
  "/public/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const rede = fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const cl = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, cl));
          }
          return res;
        })
        .catch(() => hit);
      return hit || rede;
    })
  );
});
