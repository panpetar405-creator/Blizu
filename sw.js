const C = "blizu-v8";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== C).map((x) => caches.delete(x)))).then(() => self.clients.claim()))
);
// slike i ikone: odmah iz keša, osvježi u pozadini; ostalo: mreža prvo, ali keš nakon 0,8 s ako je mreža spora
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  const stat = /\.(jpg|jpeg|png|svg|webp|woff2?)$/i.test(u.pathname) || /\/data\/places\/.*\.json$/.test(u.pathname);
  e.respondWith((async () => {
    const c = await caches.open(C);
    const cached = await c.match(r);
    const net = fetch(r).then((res) => { if (res && res.ok) c.put(r, res.clone()); return res; });
    e.waitUntil(net.catch(() => {}));
    if (!cached) return net;
    if (stat) return cached;
    return Promise.race([net, new Promise((ok) => setTimeout(() => ok(cached), 800))]).catch(() => cached);
  })());
});
