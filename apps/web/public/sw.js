/*
 * Convene service worker — offline support for field capture.
 *
 * Strategy:
 *  - Navigations (HTML): network-first, falling back to the last cached copy,
 *    so a host who visited an event page can reopen it with no signal.
 *  - Static assets (/_next/static, fonts, icons): cache-first (immutable).
 *  - Everything else (API calls, auth): network only — the outbox in
 *    IndexedDB handles offline writes, not the SW.
 */

const VERSION = "v1";
const PAGE_CACHE = `pages-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== PAGE_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

const OFFLINE_FALLBACK = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline — Convene</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f5f5f4;color:#1c1917;
       display:grid;place-items:center;min-height:100dvh;margin:0;text-align:center}
  .card{background:#fff;border:1px solid #e7e5e4;border-radius:16px;
        padding:32px;max-width:320px;box-shadow:0 1px 2px rgb(0 0 0/.05)}
  h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#78716c;margin:0}
</style></head><body><div class="card">
<h1>You're offline</h1>
<p>This page isn't cached yet. Pages you've visited while online open offline automatically.</p>
</div></body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Static assets: cache-first (Next.js emits content-hashed, immutable files).
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(ASSET_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      })(),
    );
    return;
  }

  // Page navigations: network-first with cache fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(PAGE_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          return new Response(OFFLINE_FALLBACK, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
      })(),
    );
  }
});
