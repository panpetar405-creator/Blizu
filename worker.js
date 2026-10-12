// BLIZU API – Cloudflare Worker
// Dnevno povlači podatke iz OpenStreetMap-a (cron), čuva ih u KV i služi aplikaciji.
// Potrebno: KV namespace vezan kao PLACES, secret REFRESH_TOKEN.

const CITIES = {
  tivat: [42.4364, 18.6961],
  kotor: [42.4247, 18.7712],
  budva: [42.2864, 18.84],
  hn: [42.4531, 18.5375],
};
// koji cron okida koji grad (podesi u Settings → Triggers → Cron)
const CRON_CITY = { "0 3 * * *": "tivat", "10 3 * * *": "kotor", "20 3 * * *": "budva", "30 3 * * *": "hn" };
const COVER_M = 15000; // radijus oko centra grada koji se unapred povlači
const ORIGINS = ["https://panpetar405-creator.github.io"];
const OVP = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

const QF = {
  jesti: 'nwr@[amenity~"^(restaurant|cafe|bar|pub|fast_food|ice_cream)$"][name];',
  videti: 'nwr@[tourism~"^(attraction|viewpoint|museum|gallery)$"][name];nwr@[historic~"^(castle|fort|monument|ruins|archaeological_site|memorial)$"][name];',
  odmoriti: 'nwr@[natural=beach];nwr@[leisure~"^(beach_resort|park|marina)$"][name];',
  dogadjaji: 'nwr@[amenity~"^(theatre|cinema|arts_centre|nightclub)$"][name];',
  prevoz: 'nwr@[amenity~"^(taxi|bus_station|bicycle_rental)$"];',
  info: 'nwr@[amenity~"^(pharmacy|atm|bank|hospital|clinic|doctors|post_office|police|fuel)$"];nwr@[tourism=information][name];',
};
const CATS = Object.keys(QF);
const KEEP = ["name", "name:sr", "name:en", "amenity", "tourism", "historic", "natural", "leisure", "cuisine", "opening_hours", "phone", "contact:phone", "brand", "operator", "description"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function km(a, b) {
  const r = Math.PI / 180, dl = (b[0] - a[0]) * r, dg = (b[1] - a[1]) * r;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dg / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}
function pos(el) {
  return el.type === "node" ? [el.lat, el.lon] : el.center ? [el.center.lat, el.center.lon] : null;
}
function slim(el) {
  const t = {};
  for (const k of KEEP) if (el.tags && el.tags[k]) t[k] = el.tags[k];
  const o = { type: el.type, id: el.id, tags: t };
  if (el.type === "node") { o.lat = el.lat; o.lon = el.lon; } else if (el.center) o.center = el.center;
  return o;
}
function cors(req) {
  const o = req.headers.get("Origin");
  return { "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], Vary: "Origin" };
}
function json(obj, req, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors(req) } });
}
function query(A, cats, limit) {
  return "[out:json][timeout:60];(" + cats.map((k) => QF[k].replace(/@/g, A)).join("") + ");out center tags " + limit + ";";
}
async function overpass(q) {
  for (const u of OVP) {
    try {
      const r = await fetch(u, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (r.ok) return ((await r.json()).elements || []).map(slim);
    } catch (e) {}
  }
  throw new Error("overpass");
}
async function refreshCity(env, id) {
  const [lat, lng] = CITIES[id];
  const A = `(around:${COVER_M},${lat},${lng})`;
  const res = {};
  for (const k of CATS) {
    try {
      const els = await overpass(query(A, [k], 3000));
      await env.PLACES.put(`c:${id}:${k}`, JSON.stringify({ t: Date.now(), els }));
      res[k] = els.length;
    } catch (e) { res[k] = "greska"; }
    await sleep(2000);
  }
  return res;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: { ...cors(req), "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" } });
    }
    if (url.pathname === "/api/refresh") {
      const city = url.searchParams.get("city");
      if (!env.REFRESH_TOKEN || url.searchParams.get("token") !== env.REFRESH_TOKEN) return json({ error: "forbidden" }, req, 403);
      if (!CITIES[city]) return json({ error: "city?", cities: Object.keys(CITIES) }, req, 400);
      return json({ city, result: await refreshCity(env, city) }, req);
    }
    if (url.pathname !== "/api/places") return json({ name: "BLIZU API", usage: "/api/places?lat=&lng=&r=&cat=" }, req);

    const lat = parseFloat(url.searchParams.get("lat")), lng = parseFloat(url.searchParams.get("lng"));
    const r = Math.min(parseInt(url.searchParams.get("r") || "5000", 10) || 5000, 15000);
    const cat = url.searchParams.get("cat") || "sve";
    if (!isFinite(lat) || !isFinite(lng) || (cat !== "sve" && !QF[cat])) return json({ error: "bad params" }, req, 400);
    const cats = cat === "sve" ? CATS.filter((k) => k !== "info") : [cat];

    // 1) unapred povučeni gradovi (KV)
    for (const [id, c] of Object.entries(CITIES)) {
      if (km([lat, lng], c) * 1000 + r <= COVER_M) {
        const out = []; let t = 0;
        for (const k of cats) {
          const d = await env.PLACES.get(`c:${id}:${k}`, "json");
          if (!d) continue;
          t = Math.max(t, d.t);
          for (const el of d.els) { const p = pos(el); if (p && km([lat, lng], p) * 1000 <= r) out.push(el); }
        }
        if (out.length || t) return json({ elements: out, source: "kv", updated: t }, req);
      }
    }
    // 2) ostalo: uživo sa Overpass-a, uz keš od 6 h u KV
    const key = `live:${lat.toFixed(3)}:${lng.toFixed(3)}:${r}:${cat}`;
    const hit = await env.PLACES.get(key, "json");
    if (hit) return json({ elements: hit, source: "cache" }, req);
    try {
      const els = await overpass(query(`(around:${r},${lat},${lng})`, cats, cat === "sve" ? 400 : 300));
      await env.PLACES.put(key, JSON.stringify(els), { expirationTtl: 21600 });
      return json({ elements: els, source: "live" }, req);
    } catch (e) { return json({ error: "upstream" }, req, 502); }
  },

  async scheduled(event, env, ctx) {
    const city = CRON_CITY[event.cron];
    if (city) ctx.waitUntil(refreshCity(env, city));
  },
};
