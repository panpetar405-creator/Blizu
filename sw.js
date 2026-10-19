const C = "putni-v4";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== C).map((x) => caches.delete(x)))).then(() => self.clients.claim()))
);
// mreža prvo (najnovija verzija), ali ako je spora, odmah daj keš (1,5 s), a keš se osvježi u pozadini
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(C);
    const cached = await c.match(r);
    const net = fetch(r).then((res) => { if (res && res.ok) c.put(r, res.clone()); return res; });
    e.waitUntil(net.catch(() => {}));
    if (!cached) return net;
    return Promise.race([net, new Promise((ok) => setTimeout(() => ok(cached), 1500))]).catch(() => cached);
  })());
});
