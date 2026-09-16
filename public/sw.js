/* Apont Auto — production offline service worker */
const VERSION = "apontauto-offline-v1-20260916";
const STATIC_CACHE = `${VERSION}:static`;
const PAGE_CACHE = `${VERSION}:pages`;

const PRECACHE = [
  "/",
  "/auth",
  "/corretiva-novo",
  "/manifest.webmanifest",
  "/apontauto-logo.png",
  "/pwa-192.png",
  "/pwa-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload", credentials: "include" });
            if (response && response.ok) await cache.put(url, response.clone());
          } catch {
            // Best effort: runtime caching will fill missing entries later.
          }
        }),
      );
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("apontauto-offline-") && key !== STATIC_CACHE && key !== PAGE_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(request) {
  const destination = request.destination;
  return ["script", "style", "font", "image"].includes(destination);
}

async function networkFirstNavigation(request) {
  const pageCache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await pageCache.put(request, response.clone());
      return response;
    }
    throw new Error("navigation response unavailable");
  } catch {
    const exact = await pageCache.match(request, { ignoreSearch: true });
    if (exact) return exact;

    const staticCache = await caches.open(STATIC_CACHE);
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith("/corretiva-novo")) {
      const corrective = await staticCache.match("/corretiva-novo");
      if (corrective) return corrective;
    }

    const root = await staticCache.match("/");
    if (root) return root;

    return new Response(
      "<!doctype html><html lang=\"pt-BR\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Apont Auto offline</title><body style=\"font-family:system-ui;background:#07101c;color:#fff;padding:32px\"><h1>Apont Auto</h1><p>Sem conexão e esta tela ainda não foi preparada neste aparelho. Conecte-se uma vez e abra Corretiva Novo para habilitar o uso offline.</p></body></html>",
      { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    network.catch(() => null);
    return cached;
  }

  const response = await network;
  return response || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(request) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(request));
  }
});
