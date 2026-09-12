// Kova service worker — minimal offline shell (blueprint §1, PWA).
// App-shell + static assets are cached; dashboard/RSC data always hits the
// network so nutrition logs never show stale meals after add/delete.
const CACHE = "kova-v4";
const APP_SHELL = ["/", "/manifest.json", "/icons/icon.svg"];

function isStaticAsset(pathname) {
  return (
    pathname === "/manifest.json" ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/brand/") ||
    /\.(?:svg|png|jpe?g|gif|webp|ico|woff2?|ttf)$/i.test(pathname)
  );
}

/** Next.js RSC / flight refreshes must never be served from Cache Storage. */
function isAppDataRequest(request, url) {
  if (url.searchParams.has("_rsc")) return true;
  if (request.headers.get("RSC") === "1") return true;
  if (request.headers.get("Next-Router-State-Tree") != null) return true;
  if (request.headers.get("Next-Router-Prefetch") != null) return true;
  if (request.headers.get("Next-Url") != null) return true;
  const accept = request.headers.get("Accept") || "";
  if (accept.includes("text/x-component")) return true;
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache API/auth/sync or Next flight/RSC payloads — always network.
  if (url.pathname.startsWith("/api/") || isAppDataRequest(request, url)) {
    return;
  }

  // Next.js hashed bundles change every deploy — never serve stale JS/CSS.
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(fetch(request));
    return;
  }

  // Navigations: network-first, fall back to cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/").then((r) => r || Response.error())),
    );
    return;
  }

  // Icons / brand / fonts only — cache-first.
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Default: let the browser hit the network (no Cache Storage).
});
