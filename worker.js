// BLIZU API – Cloudflare Worker
// Dnevno povlači podatke iz OpenStreetMap-a (cron), čuva ih u KV i služi aplikaciji.
// Potrebno: KV namespace vezan kao PLACES, secret REFRESH_TOKEN, secret GOOGLE_KEY (Places API New).
// Opciono: secret ORS_KEY (OpenRouteService) za pešačke rute; bez njega se koristi javni OSRM foot server.

const CITIES = {
  tivat: [42.4364, 18.6961],
  kotor: [42.4247, 18.7712],
  budva: [42.2864, 18.84],
  hn: [42.4531, 18.5375],
};
// koji cron okida koji grad (podesi u Settings → Triggers → Cron)
const CRON_CITY = { "0 3 * * *": "tivat", "10 3 * * *": "kotor", "20 3 * * *": "budva", "30 3 * * *": "hn" };
const MIN_R = 250, MAX_R = 25000; // dozvoljeni radijus upita (m); klijent ga ograničava na isto
const COVER_M = 15000; // radijus oko centra grada koji se unapred povlači
const ORIGINS = ["https://panpetar405-creator.github.io"];
const OVP = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const OVP_TIMEOUT_MS = 20000; // koliko čekamo jedan Overpass server prije nego pređemo na sljedeći
const NEAR_FALLBACK_KM = 35; // ako uživo ne uspije, koristimo snimljene podatke najbližeg grada u ovom krugu

const QF = {
  jesti: 'nwr@[amenity~"^(restaurant|cafe|bar|pub|fast_food|ice_cream)$"][name];',
  videti: 'nwr@[tourism~"^(attraction|viewpoint|museum|gallery)$"][name];nwr@[historic~"^(castle|fort|monument|ruins|archaeological_site|memorial)$"][name];',
  odmoriti: 'nwr@[natural=beach];nwr@[leisure~"^(beach_resort|park|marina)$"][name];',
  dogadjaji: 'nwr@[amenity~"^(theatre|cinema|arts_centre|nightclub)$"][name];',
  prevoz: 'nwr@[amenity~"^(taxi|bus_station|bicycle_rental)$"];',
  info: 'nwr@[amenity~"^(pharmacy|atm|bank|hospital|clinic|doctors|post_office|police|fuel)$"];nwr@[tourism=information][name];',
};
const CATS = Object.keys(QF);
const KEEP = ["name", "name:sr", "name:en", "amenity", "tourism", "historic", "natural", "leisure", "cuisine", "opening_hours", "phone", "contact:phone", "brand", "operator", "description", "image", "wikimedia_commons", "wikidata", "website", "check_date", "survey:date",
  "diet:vegetarian", "diet:vegan", "wheelchair", "dog", "pets_allowed", "fee", "kids_area", "highchair", "changing_table"];

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
function json(obj, req, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors(req), ...extra } });
}
function query(A, cats, limit) {
  return "[out:json][timeout:60];(" + cats.map((k) => QF[k].replace(/@/g, A)).join("") + ");out center tags " + limit + ";";
}
async function ovpOne(u, q, ms, signal) {
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), ms);
  if (signal) signal.addEventListener("abort", () => ac.abort());
  try {
    const r = await fetch(u, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: ac.signal });
    if (!r.ok) return null;
    const j = await r.json();
    // Overpass ponekad vrati 200 uz "remark" o grešci/timeout-u i prazan odgovor
    if (j.remark && /error|timed out|out of memory/i.test(j.remark) && !(j.elements || []).length) return null;
    return (j.elements || []).map(slim);
  } catch (e) {
    return null;
  } finally {
    clearTimeout(tm);
  }
}
// par=true: svi serveri uporedo, prvi odgovor pobjeđuje (za žive upite korisnika).
// par=false: redom, nježnije prema javnim serverima (za cron osvježavanje).
async function overpass(q, par) {
  for (let round = 0; round < 2; round++) {
    if (par) {
      const stop = new AbortController();
      const res = await new Promise((resolve) => {
        let n = OVP.length;
        OVP.forEach((u) => ovpOne(u, q, 12000, stop.signal).then((v) => { if (v) resolve(v); else if (--n === 0) resolve(null); }));
      });
      stop.abort();
      if (res) return res;
    } else {
      for (const u of OVP) {
        const v = await ovpOne(u, q, OVP_TIMEOUT_MS);
        if (v) return v;
      }
    }
    if (round === 0) await sleep(1500);
  }
  throw new Error("overpass");
}
async function refreshCity(env, id) {
  const [lat, lng] = CITIES[id];
  const A = `(around:${COVER_M},${lat},${lng})`;
  const res = {};
  for (const k of CATS) {
    try {
      const els = await overpass(query(A, [k], 3000)); // overpass() sam pokušava sve servere dva puta
      await env.PLACES.put(`c:${id}:${k}`, JSON.stringify({ t: Date.now(), els }));
      res[k] = els.length;
    } catch (e) { res[k] = "greska"; }
    await sleep(2000);
  }
  return res;
}

const norm = (x) => (x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "dj");
const toks = (x) => norm(x).split(/[^a-z0-9]+/).filter((t) => t.length > 2);
async function enrich(env, name, lat, lng) {
  const key = `g4:${name.toLowerCase().slice(0, 60)}:${lat.toFixed(4)}:${lng.toFixed(4)}`;
  const hit = await env.PLACES.get(key, "json");
  if (hit) return hit;
  // locationRestriction (pravougaonik ~450 x 650 m) garantuje da dobijemo mjesto sa te lokacije, a ne istoimeno mjesto negdje drugo
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.priceLevel,places.regularOpeningHours.weekdayDescriptions,places.nationalPhoneNumber,places.internationalPhoneNumber,places.photos.name,places.photos.authorAttributions.displayName",
    },
    body: JSON.stringify({
      textQuery: name,
      maxResultCount: 5,
      languageCode: "sr-Latn",
      locationRestriction: { rectangle: { low: { latitude: lat - 0.002, longitude: lng - 0.003 }, high: { latitude: lat + 0.002, longitude: lng + 0.003 } } },
    }),
  });
  if (!r.ok) {
    let m = "";
    try { m = ((await r.json()).error || {}).message || ""; } catch (e) {}
    throw { g: r.status, m: m.slice(0, 160) };
  }
  const want = toks(name);
  let best = null, bs = -1;
  for (const p of (await r.json()).places || []) {
    if (!p.location) continue;
    const d = km([lat, lng], [p.location.latitude, p.location.longitude]);
    const have = toks((p.displayName || {}).text);
    const ov = want.filter((t) => have.some((h) => h.includes(t) || t.includes(h))).length;
    if (!(ov > 0 || d < 0.15)) continue;
    const sc = ov * 10 - d * 10;
    if (sc > bs) { bs = sc; best = p; }
  }
  const p = best;
  const out = p ? { rating: p.rating || null, n: p.userRatingCount || 0, price: p.priceLevel || null, hours: (p.regularOpeningHours || {}).weekdayDescriptions || null, phone: p.internationalPhoneNumber || p.nationalPhoneNumber || null, gid: p.id, photo: ((p.photos || [])[0] || {}).name || null, by: ((((p.photos || [])[0] || {}).authorAttributions || [])[0] || {}).displayName || "" } : { none: true };
  await env.PLACES.put(key, JSON.stringify(out), { expirationTtl: p ? 2592000 : 86400 }); // 30 dana za pogodak (Google uslovi), 1 dan za "nema"
  return out;
}


// Pešačke dionice (metri po stvarnim stazama) za niz tačaka: lat,lng;lat,lng;...
// Sa ORS_KEY koristi OpenRouteService (preporučeno za produkciju); bez ključa javni OSRM "foot" server (samo lagana upotreba).
async function walkLegs(env, pts) {
  const key = "walk:" + pts.map((p) => p[0].toFixed(5) + "," + p[1].toFixed(5)).join(";");
  const hit = await env.PLACES.get(key, "json");
  if (hit) return hit;
  let legs;
  if (env.ORS_KEY) {
    const n = pts.length;
    const r = await fetch("https://api.openrouteservice.org/v2/matrix/foot-walking", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: env.ORS_KEY },
      body: JSON.stringify({ locations: pts.map((p) => [p[1], p[0]]), metrics: ["distance"], units: "m", sources: [...Array(n - 1).keys()], destinations: [...Array(n - 1).keys()].map((i) => i + 1) }),
    });
    if (!r.ok) throw new Error("ors");
    const d = (await r.json()).distances;
    legs = d.map((row, i) => row[i]);
  } else {
    const r = await fetch("https://routing.openstreetmap.de/routed-foot/route/v1/foot/" + pts.map((p) => p[1].toFixed(5) + "," + p[0].toFixed(5)).join(";") + "?overview=false", { headers: { "User-Agent": "Blizu/1.0 (walking legs)" } });
    if (!r.ok) throw new Error("osrm");
    const j = await r.json();
    if (j.code !== "Ok" || !j.routes || !j.routes[0]) throw new Error("osrm");
    legs = j.routes[0].legs.map((l) => l.distance);
  }
  if (legs.length !== pts.length - 1 || legs.some((m) => !Number.isFinite(m) || m < 0)) throw new Error("legs");
  legs = legs.map((m) => Math.round(m));
  await env.PLACES.put(key, JSON.stringify(legs), { expirationTtl: 604800 });
  return legs;
}

// Geokodiranje (pretraga adresa/mjesta). Podrazumijevano Photon (OSM podaci, dozvoljen autocomplete uz razumnu upotrebu);
// za produkciju postavi env GEOCODER_URL na vlastiti Photon ili plaćeni servis istog GeoJSON oblika (npr. Geoapify/MapTiler).
// Rezultati se keširaju u KV 7 dana, pa isti upit ne opterećuje vanjski servis.
async function geocode(env, q) {
  const key = "geo:" + norm(q).slice(0, 100);
  const hit = await env.PLACES.get(key, "json");
  if (hit) return hit;
  const base = env.GEOCODER_URL || "https://photon.komoot.io/api/";
  const u = new URL(base);
  u.searchParams.set("q", q); u.searchParams.set("limit", "5"); u.searchParams.set("lang", "en");
  u.searchParams.set("lat", "43.5"); u.searchParams.set("lon", "19.0"); // blaga prednost Balkanu
  const r = await fetch(u.toString(), { headers: { "User-Agent": "Blizu/1.0 (geocoding via worker)" } });
  if (!r.ok) throw new Error("geocoder");
  const out = [];
  for (const f of (await r.json()).features || []) {
    const p = f.properties || {}, c = (f.geometry || {}).coordinates;
    if (!p.name || !Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    out.push({ name: p.name, full: [p.name, p.city || p.state, p.country].filter(Boolean).join(", "), lat: c[1], lon: c[0] });
  }
  await env.PLACES.put(key, JSON.stringify(out), { expirationTtl: out.length ? 604800 : 3600 });
  return out;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: { ...cors(req), "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "86400" } });
    }
    if (url.pathname === "/api/refresh") {
      const city = url.searchParams.get("city");
      // Tajna se prima kroz Authorization zaglavlje, nikada kroz URL koji može završiti u logovima.
      const auth = req.headers.get("Authorization") || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!env.REFRESH_TOKEN || !token || token !== env.REFRESH_TOKEN) return json({ error: "forbidden" }, req, 403);
      if (!CITIES[city]) return json({ error: "city?", cities: Object.keys(CITIES) }, req, 400);
      return json({ city, result: await refreshCity(env, city) }, req);
    }
    if (url.pathname === "/api/enrich") {
      if (!ORIGINS.includes(req.headers.get("Origin"))) return json({ error: "forbidden", m: "origin" }, req, 403);
      if (!env.GOOGLE_KEY) return json({ error: "forbidden", m: "GOOGLE_KEY nije postavljen u Workeru" }, req, 403);
      const name = (url.searchParams.get("name") || "").slice(0, 80);
      const la = parseFloat(url.searchParams.get("lat")), ln = parseFloat(url.searchParams.get("lng"));
      if (!name || !isFinite(la) || !isFinite(ln)) return json({ error: "bad params" }, req, 400);
      try { return json(await enrich(env, name, la, ln), req); } catch (e) { return json({ error: "upstream", g: e && e.g, m: (e && e.m) || "" }, req, 502); }
    }
    if (url.pathname === "/api/geocode") {
      if (!ORIGINS.includes(req.headers.get("Origin"))) return json({ error: "forbidden" }, req, 403);
      const q = (url.searchParams.get("q") || "").trim().slice(0, 120);
      if (q.length < 3) return json({ results: [] }, req);
      try { return json({ results: await geocode(env, q) }, req, 200, { "Cache-Control": "public, max-age=86400" }); } catch (e) { return json({ error: "upstream" }, req, 502); }
    }
    if (url.pathname === "/api/walk") {
      if (!ORIGINS.includes(req.headers.get("Origin"))) return json({ error: "forbidden" }, req, 403);
      const pts = (url.searchParams.get("pts") || "").split(";").slice(0, 16).map((t) => t.split(",").map(Number));
      const okp = (p) => p.length === 2 && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180 && p.every(Number.isFinite);
      if (pts.length < 2 || pts.length > 15 || !pts.every(okp) || pts.some((p, i) => i && km(pts[i - 1], p) > 30)) return json({ error: "bad params" }, req, 400);
      try { return json({ legs: await walkLegs(env, pts) }, req, 200, { "Cache-Control": "public, max-age=3600" }); } catch (e) { return json({ error: "upstream" }, req, 502); }
    }
    if (url.pathname === "/api/photo") {
      const ref = url.searchParams.get("ref") || "";
      const rf = req.headers.get("Referer") || "";
      if (!env.GOOGLE_KEY || !/^places\/[\w-]+\/photos\/[\w-]+$/.test(ref) || !ORIGINS.some((o) => rf.startsWith(o))) return new Response("forbidden", { status: 403 });
      const ck = new Request(url.origin + "/api/photo?ref=" + encodeURIComponent(ref));
      let res = await caches.default.match(ck);
      if (!res) {
        const g = await fetch(`https://places.googleapis.com/v1/${ref}/media?maxWidthPx=800&key=${env.GOOGLE_KEY}`);
        if (!g.ok) return new Response("upstream", { status: 502 });
        res = new Response(g.body, { headers: { "Content-Type": g.headers.get("Content-Type") || "image/jpeg", "Cache-Control": "public, max-age=86400" } });
        await caches.default.put(ck, res.clone());
      }
      return res;
    }
    if (url.pathname !== "/api/places") return json({ name: "BLIZU API", usage: "/api/places?lat=&lng=&r=&cat=" }, req);

    const lat = parseFloat(url.searchParams.get("lat")), lng = parseFloat(url.searchParams.get("lng"));
    const rawR = parseInt(url.searchParams.get("r") || "5000", 10);
    const r = Math.max(MIN_R, Math.min(Number.isFinite(rawR) ? rawR : 5000, MAX_R));
    const cat = url.searchParams.get("cat") || "sve";
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (cat !== "sve" && !QF[cat])) return json({ error: "bad params" }, req, 400);
    const cats = cat === "sve" ? CATS.filter((k) => k !== "info") : [cat];

    // 1) unapred povučeni gradovi (KV)
    for (const [id, c] of Object.entries(CITIES)) {
      if (km([lat, lng], c) * 1000 + r <= COVER_M) {
        const out = []; let t = 0;
        const ds = await Promise.all(cats.map((k) => env.PLACES.get(`c:${id}:${k}`, "json")));
        for (const d of ds) {
          if (!d) continue;
          t = Math.max(t, d.t);
          for (const el of d.els) { const p = pos(el); if (p && km([lat, lng], p) * 1000 <= r) out.push(el); }
        }
        if (out.length || t) return json({ elements: out, source: "kv", updated: t }, req, 200, { "Cache-Control": "public, max-age=300" });
      }
    }
    // 2) ostalo: uživo sa Overpass-a, uz keš od 6 h u KV
    // zaokruži na mrežu od ~1 km i radijus na 1 km: bliski korisnici dijele isti keš (važi za bilo koju lokaciju u svijetu)
    const sl = Math.round(lat * 100) / 100, sg = Math.round(lng * 100) / 100, sr = Math.min(25000, Math.ceil((r + 800) / 1000) * 1000);
    const key = `live:${sl.toFixed(2)}:${sg.toFixed(2)}:${sr}:${cat}`;
    const hit = await env.PLACES.get(key, "json");
    if (hit) return json({ elements: hit, source: "cache" }, req);
    try {
      const els = await overpass(query(`(around:${sr},${sl},${sg})`, cats, cat === "sve" ? 400 : 300), true);
      await env.PLACES.put(key, JSON.stringify(els), { expirationTtl: 21600 });
      await env.PLACES.put("stale:" + key, JSON.stringify(els), { expirationTtl: 604800 }); // 7 dana, samo za slučaj kvara
      return json({ elements: els, source: "live" }, req);
    } catch (e) {
      // 3) uživo ne radi: stariji keš za istu lokaciju
      const old = await env.PLACES.get("stale:" + key, "json");
      if (old && old.length) return json({ elements: old, source: "stale" }, req);
      // 4) najbliži unaprijed povučen grad (djelimičan odgovor je bolji od greške)
      let best = null, bd = 1e9;
      for (const [id, c] of Object.entries(CITIES)) { const d = km([lat, lng], c); if (d < bd) { bd = d; best = id; } }
      if (best && bd <= NEAR_FALLBACK_KM) {
        const out = [];
        const ds = await Promise.all(cats.map((k) => env.PLACES.get(`c:${best}:${k}`, "json")));
        for (const d of ds) {
          if (!d) continue;
          for (const el of d.els) { const p = pos(el); if (p && km([lat, lng], p) * 1000 <= r) out.push(el); }
        }
        if (out.length) return json({ elements: out, source: "kv-near" }, req);
      }
      return json({ error: "upstream" }, req, 502);
    }
  },

  async scheduled(event, env, ctx) {
    const city = CRON_CITY[event.cron];
    if (city) ctx.waitUntil(refreshCity(env, city));
  },
};
