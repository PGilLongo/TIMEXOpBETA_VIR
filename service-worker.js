const CACHE_NAME = "timex-pwa-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./PDF TIMEX.html",
  "./NAVEGADOR.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

const toAbs = (path) => new URL(path, self.registration.scope).toString();

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(ASSETS.map(toAbs));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Limpia cachés antiguos
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));

      // Habilita navigation preload si está disponible
      try {
        if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      } catch (_) {}

      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data && data.type === "SKIP_WAITING") {
    self.skipWaiting().catch(() => {});
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Solo intercepta recursos de este origen dentro del scope
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(self.registration.scope)) return;

  // Navegación: network-first con preload + fallback a caché
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          if (preload) return preload;

          const net = await fetch(req);
          // Guarda la última versión del documento principal para offline
          if (net && net.ok && net.type === "basic") {
            const cache = await caches.open(CACHE_NAME);
            cache.put(toAbs("./index.html"), net.clone()).catch(() => {});
          }
          return net;
        } catch {
          return (
            (await caches.match(toAbs("./index.html"), { ignoreSearch: true })) ||
            (await caches.match(toAbs("./"), { ignoreSearch: true })) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // Assets: cache-first con actualización en segundo plano
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) {
        event.waitUntil(
          (async () => {
            try {
              const res = await fetch(req);
              if (res && res.ok && res.type === "basic") {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(req, res.clone());
              }
            } catch (_) {}
          })()
        );
        return cached;
      }

      const res = await fetch(req);
      if (res && res.ok && res.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    })()
  );
});