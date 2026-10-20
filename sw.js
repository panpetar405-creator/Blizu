const C = "blizu-524ac381", T = "blizu-tiles-v1", MAXT = 800;
const SHELL = ["./", "index.html", "config.js", "curated.js", "manifest.json", "img/icon.svg", "privatnost.html", "uslovi.html", "i18n.js", "lib/blizu-lib.js"];
const CDN = /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\//;
const TILE = /^https:\/\/(tile\.openstreetmap\.org|api\.maptiler\.com)\//;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(C).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== C && x !== T).map((x) => caches.delete(x)))).then(() => self.clients.claim()))
);

async function trim(cache) {
  const ks = await cache.keys();
  if (ks.length > MAXT) await Promise.all(ks.slice(0, ks.length - MAXT).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;

  // mapa i Leaflet: prvo keš (radi i bez interneta), osvježi u pozadini
  if (TILE.test(r.url) || CDN.test(r.url)) {
    const name = TILE.test(r.url) ? T : C;
    e.respondWith((async () => {
      const c = await caches.open(name);
      const hit = await c.match(r);
      const net = fetch(r).then((res) => { if (res && (res.ok || res.type === "opaque")) { c.put(r, res.clone()).then(() => name === T && trim(c)); } return res; }).catch(() => hit);
      e.waitUntil(net.catch(() => {}));
      return hit || net;
    })());
    return;
  }

  if (u.origin !== location.origin) return;
  const stat = /\.(jpg|jpeg|png|svg|webp|woff2?)$/i.test(u.pathname) || /\/data\/places\/.*\.json$/.test(u.pathname);
  e.respondWith((async () => {
    const c = await caches.open(C);
    const cached = await c.match(r);
    const net = fetch(r).then((res) => { if (res && res.ok) c.put(r, res.clone()); return res; });
    e.waitUntil(net.catch(() => {}));
    if (!cached) {
      try { return await net; } catch (x) {
        // bez interneta: stranica se otvara iz keša
        if (r.mode === "navigate") { const i = await c.match("index.html") || await c.match("./"); if (i) return i; }
        throw x;
      }
    }
    if (stat) return cached;
    return Promise.race([net, new Promise((ok) => setTimeout(() => ok(cached), 800))]).catch(() => cached);
  })());
});
