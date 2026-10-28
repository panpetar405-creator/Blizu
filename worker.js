// MESTIGO API – Cloudflare Worker
// Dnevno povlači podatke iz OpenStreetMap-a (cron), čuva ih u KV i služi aplikaciji.
// Potrebno: KV namespace vezan kao PLACES, secret REFRESH_TOKEN, secret GOOGLE_KEY (Places API New).
// Opciono: secret ORS_KEY (OpenRouteService) za pešačke rute; bez njega se koristi javni OSRM foot server.
// Sigurnost (sve opciono, vidi IMPLEMENTACIJA-PRVA-ITERACIJA.md):
//   ALLOWED_ORIGINS  dodatni dozvoljeni izvori, odvojeni zarezom (npr. "https://mestigo.me,https://www.mestigo.me")
//   RL, RL_STRICT    Cloudflare "Rate Limiting" bindinzi (opšti i strogi); bez njih radi približno ograničenje u memoriji
//   GOOGLE_DAILY_CAP najveći broj Google poziva dnevno (zasebno za podatke o mjestu i za fotografije); traži KV upise
//   PHOTO_SIGN_KEY   tajna za potpis fotografija (ako nije postavljena, koristi se REFRESH_TOKEN)
//   LIVE_BBOX        "jug,zapad,sjever,istok": uživo Overpass samo unutar ovog pravougaonika
//   ROUTE_URL        šablon OSRM-kompatibilnog servisa za rute sa {profile} i {coords} (vidi routeVia); bez njega javni FOSSGIS
//   DEBUG            "1" vraća tehničke poruke grešaka klijentu (samo za razvoj)

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
let ALLOW = ORIGINS; // dopunjava se iz env.ALLOWED_ORIGINS na početku svakog zahtjeva
function initEnv(env) {
  const extra = String(env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim().replace(/\/+$/, "")).filter((x) => /^(https:\/\/[a-z0-9.-]+|http:\/\/localhost)(:\d+)?$/i.test(x));
  ALLOW = [...new Set([...ORIGINS, ...extra])];
}
const okOrigin = (req) => ALLOW.includes(req.headers.get("Origin"));
const log = (evt, d = {}) => { try { console.log(JSON.stringify({ evt, ...d })); } catch (e) {} };
const dbg = (env, m) => (env.DEBUG === "1" && m ? { m } : {});
function safeEq(a, b) { // poređenje tajni bez curenja kroz vrijeme izvršavanja
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

// ---------- ograničenje broja zahtjeva ----------
// Sa Cloudflare Rate Limiting bindingom (RL / RL_STRICT) ili, bez njega, približnim brojačem u memoriji izolata.
// (Cache API ne radi na *.workers.dev, a KV bi trošio dnevnu kvotu upisa, pa se ne koriste za brojanje.)
const LIMITS = { places: 90, geocode: 60, photo: 90, walk: 30, enrich: 30, along: 80, route: 60, refresh: 5 }; // zahtjeva po IP adresi u minuti
const STRICT = new Set(["walk", "enrich", "along", "refresh"]);
const MEM = new Map();
async function limited(env, req, bucket) {
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  try {
    const rl = STRICT.has(bucket) ? env.RL_STRICT || env.RL : env.RL;
    if (rl && typeof rl.limit === "function") return !(await rl.limit({ key: bucket + ":" + ip })).success;
    const now = Date.now(), k = bucket + ":" + ip, e = MEM.get(k);
    if (MEM.size > 5000) { for (const [kk, v] of MEM) if (now - v.t > 60000) MEM.delete(kk); if (MEM.size > 20000) MEM.clear(); }
    if (!e || now - e.t > 60000) { MEM.set(k, { t: now, n: 1 }); return false; }
    return ++e.n > LIMITS[bucket];
  } catch (e) { return false; } // ograničavač nikad ne smije srušiti API
}
const tooMany = (req, bucket) => { log("rate_limited", { bucket }); return json({ error: "rate_limited" }, req, 429, { "Retry-After": "30" }); };

// Dnevna gornja granica Google poziva (opciono; štiti od neočekivanog računa). Nije atomično, pa je približna.
async function capOk(env, kind) {
  const cap = parseInt(env.GOOGLE_DAILY_CAP, 10);
  if (!cap) return true;
  const key = `cap:${kind}:${new Date().toISOString().slice(0, 10)}`;
  try {
    const n = parseInt((await env.PLACES.get(key)) || "0", 10);
    if (n >= cap) { log("google_cap_hit", { kind, cap }); return false; }
    await env.PLACES.put(key, String(n + 1), { expirationTtl: 172800 });
  } catch (e) {}
  return true;
}

// Potpis fotografije: /api/photo ne smije biti otvoren proxy za proizvoljne Google fotografije na naš račun.
async function photoSig(env, ref) {
  const k = env.PHOTO_SIGN_KEY || env.REFRESH_TOKEN;
  if (!k) return "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(k), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sg = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("photo:" + ref)));
  let b = ""; for (const x of sg.slice(0, 12)) b += String.fromCharCode(x);
  return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const OVP = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
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
  "barrier", "highway", "charge", "diet:vegetarian", "diet:vegan", "wheelchair", "dog", "pets_allowed", "fee", "kids_area", "highchair", "changing_table"];

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
  return { "Access-Control-Allow-Origin": ALLOW.includes(o) ? o : ALLOW[0], Vary: "Origin" };
}
function json(obj, req, status = 200, extra = {}) {
  const h = { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff", ...cors(req) };
  if (status >= 400) h["Cache-Control"] = "no-store";
  return new Response(JSON.stringify(obj), { status, headers: { ...h, ...extra } });
}
function query(A, cats, limit) {
  return "[out:json][timeout:60];(" + cats.map((k) => QF[k].replace(/@/g, A)).join("") + ");out center tags " + limit + ";";
}
let LAST_OVP = "";
function addWhy(s) { if (!LAST_OVP.includes(s) && LAST_OVP.length < 150) LAST_OVP += (LAST_OVP ? ", " : "") + s; } // zadnji razlog neuspjeha Overpass poziva (vraća se u odgovoru 502 radi dijagnostike)
async function ovpOne(u, q, ms, signal) {
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), ms);
  if (signal) signal.addEventListener("abort", () => ac.abort());
  const host = u.replace(/^https:\/\//, "").split("/")[0].slice(0, 14);
  try {
    // Overpass serveri traže prepoznatljiv User-Agent; bez njega ih dio odbija zahtjeve iz Workera
    const r = await fetch(u, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mestigo/1.0 (+https://github.com/panpetar405-creator/Mestigo)", Accept: "application/json" }, signal: ac.signal });
    if (!r.ok) { addWhy(host + " " + r.status); return null; }
    const j = await r.json();
    // Overpass ponekad vrati 200 uz "remark" o grešci/timeout-u i prazan odgovor
    if (j.remark && /error|timed out|out of memory/i.test(j.remark) && !(j.elements || []).length) { addWhy(host + " remark"); return null; }
    return (j.elements || []).map(slim);
  } catch (e) {
    if (!(signal && signal.aborted)) addWhy(host + " " + (e && e.name === "AbortError" ? "timeout" : "net"));
    return null;
  } finally {
    clearTimeout(tm);
  }
}
// par=true: svi serveri uporedo, prvi odgovor pobjeđuje (za žive upite korisnika).
// par=false: redom, nježnije prema javnim serverima (za cron osvježavanje).
// ---------- slojevi duž rute: benzinske pumpe i naplatne rampe ----------
// Klijent šalje pojednostavljenu liniju rute; Overpass traži samo objekte u uskom pojasu oko nje.
const ALONG = {
  fuel: { q: (a) => `nwr["amenity"="fuel"]${a};`, r: 1500, limit: 600, ttl: 21600 },
  toll: { q: (a) => `nwr["barrier"="toll_booth"]${a};nwr["highway"="toll_gantry"]${a};`, r: 400, limit: 300, ttl: 43200 },
};
// Ruta se siječe na dijelove; za svaki se traži običan okvir (brzo), pa se zadrže samo objekti uz samu rutu.
function dseg(p, a, b) {
  const k = Math.cos((p[0] * Math.PI) / 180) * 111.2, px = p[1] * k, py = p[0] * 111.2, ax = a[1] * k, ay = a[0] * 111.2;
  const dx = b[1] * k - ax, dy = b[0] * 111.2 - ay, L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx - px, y = ay + t * dy - py; return Math.sqrt(x * x + y * y);
}
async function alongFetch(cfg, pts) {
  LAST_OVP = "";
  const rad = cfg.r / 1000, pad = rad / 111 + 0.002;
  const lats = pts.map((p) => p[0]), lons = pts.map((p) => p[1]);
  const ext = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lons) - Math.min(...lons));
  const span = Math.max(1, ext / 6), ch = [];
  let cur = [pts[0]];
  const rng = (c, i) => { const v = c.map((p) => p[i]); return Math.max(...v) - Math.min(...v); };
  for (let i = 1; i < pts.length; i++) { cur.push(pts[i]); if (rng(cur, 0) > span || rng(cur, 1) > span) { ch.push(cur); cur = [pts[i]]; } }
  if (cur.length > 1 || !ch.length) ch.push(cur);
  const res = new Array(ch.length); let nx = 0;
  const one = async (i) => {
    const c = ch[i], la = c.map((p) => p[0]), lo = c.map((p) => p[1]);
    const bb = "(" + [Math.min(...la) - pad, Math.min(...lo) - pad, Math.max(...la) + pad, Math.max(...lo) + pad].map((x) => x.toFixed(5)).join(",") + ")";
    res[i] = await overpass(`[out:json][timeout:25];(${cfg.q(bb)});out center tags ${cfg.limit};`, true);
  };
  await Promise.all([0, 1, 2, 3].map(async () => { while (nx < ch.length) await one(nx++); }));
  const out = [], seen = new Set();
  for (const els of res) for (const el of els) {
    const k = el.type + el.id, p = pos(el);
    if (seen.has(k) || !p) continue;
    let near = false; for (let i = 1; i < pts.length && !near; i++) near = dseg(p, pts[i - 1], pts[i]) <= rad;
    if (near) { seen.add(k); out.push(el); }
  }
  return out;
}
function alongHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
async function overpass(q, par) {
  for (let round = 0; round < 2; round++) {
    if (par) {
      const stop = new AbortController();
      const res = await new Promise((resolve) => {
        let n = OVP.length;
        OVP.forEach((u, i) => sleep(i * 1000).then(() => (stop.signal.aborted ? null : ovpOne(u, q, 12000, stop.signal))).then((v) => { if (v) resolve(v); else if (--n === 0) resolve(null); }));
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
const HLS = { "sr-Latn": "sr-Latn", en: "en", de: "de", ru: "ru" }; // dozvoljeni jezici interfejsa
async function enrich(env, name, lat, lng, hl) {
  hl = HLS[hl] || "sr-Latn";
  const key = `g4:${name.toLowerCase().slice(0, 60)}:${lat.toFixed(4)}:${lng.toFixed(4)}` + (hl === "sr-Latn" ? "" : ":" + hl);
  const hit = await env.PLACES.get(key, "json");
  if (hit) return hit;
  if (!(await capOk(env, "enrich"))) throw { g: 429, m: "dnevna granica Google poziva" };
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
      languageCode: hl,
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
    const r = await fetch("https://routing.openstreetmap.de/routed-foot/route/v1/foot/" + pts.map((p) => p[1].toFixed(5) + "," + p[0].toFixed(5)).join(";") + "?overview=false", { headers: { "User-Agent": "Mestigo/1.0 (walking legs)" } });
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

// ---------- rute (OSRM format) ----------
// Aplikacija traži rute preko Workera, pa telefoni ne gađaju javni routing servis. Backend se bira sa ROUTE_URL:
// šablon sa {profile} (car|foot|bike) i {coords} (lng,lat;lng,lat…), npr. "https://osrm.tvoj-domen.me/route/v1/{profile}/{coords}".
// Mora vraćati OSRM JSON (geometries=geojson, steps=true). Bez ROUTE_URL koristi se javni FOSSGIS servis (samo za lagano testiranje).
const ROUTE_DEFAULT = "https://routing.openstreetmap.de/routed-{profile}/route/v1/driving/{coords}";
const ROUTE_PROFILES = new Set(["car", "foot", "bike"]);
async function routeVia(env, profile, pts) {
  const coords = pts.map((p) => p[1].toFixed(5) + "," + p[0].toFixed(5)).join(";");
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const ck = new Request("https://route.cache/" + profile + "/" + coords);
  try { const hit = cache && (await cache.match(ck)); if (hit) return await hit.json(); } catch (e) {}
  const tpl = /^https:\/\/\S*\{coords\}/.test(env.ROUTE_URL || "") ? env.ROUTE_URL : ROUTE_DEFAULT;
  const u = tpl.split("{profile}").join(profile).split("{coords}").join(coords) + (tpl.includes("?") ? "&" : "?") + "overview=full&geometries=geojson&steps=true";
  const r = await fetch(u, { headers: { "User-Agent": "Mestigo/1.0 (+https://github.com/panpetar405-creator/Mestigo)", Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  let j = null;
  try { j = await r.json(); } catch (e) {}
  // OSRM za "nema rute" vraća 400 sa code:"NoRoute"; to je valjan odgovor, ne greška servisa
  if (!j || typeof j.code !== "string" || (!r.ok && j.code === "Ok")) throw new Error("route_upstream");
  const out = { code: j.code, routes: (j.routes || []).slice(0, 1) };
  if (j.code === "Ok" && out.routes.length) {
    try { cache && (await cache.put(ck, new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } }))); } catch (e) {}
  }
  return out;
}

// Geokodiranje (pretraga adresa/mjesta). Podrazumijevano Photon (OSM podaci, dozvoljen autocomplete uz razumnu upotrebu);
// za produkciju postavi env GEOCODER_URL na vlastiti Photon ili plaćeni servis istog GeoJSON oblika (npr. Geoapify/MapTiler).
// Rezultati se keširaju u KV 7 dana, pa isti upit ne opterećuje vanjski servis.
async function geocode(env, q, hl) {
  const lg = hl === "de" ? "de" : "en"; // Photon podržava samo en/de/fr/podrazumijevani
  const key = "geo:" + (lg === "en" ? "" : lg + ":") + norm(q).slice(0, 100);
  const hit = await env.PLACES.get(key, "json");
  if (hit) return hit;
  const base = env.GEOCODER_URL || "https://photon.komoot.io/api/";
  const u = new URL(base);
  u.searchParams.set("q", q); u.searchParams.set("limit", "5"); u.searchParams.set("lang", lg);
  u.searchParams.set("lat", "43.5"); u.searchParams.set("lon", "19.0"); // blaga prednost Balkanu
  const r = await fetch(u.toString(), { headers: { "User-Agent": "Mestigo/1.0 (geocoding via worker)" } });
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
    initEnv(env);
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: { ...cors(req), "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "86400" } });
    }
    if (req.method !== "GET" && req.method !== "POST") return json({ error: "method" }, req, 405, { Allow: "GET, POST, OPTIONS" });
    if (url.pathname === "/api/health") return json({ ok: true }, req, 200, { "Cache-Control": "no-store" });
    if (url.pathname === "/api/refresh") {
      if (req.method !== "POST") return json({ error: "method" }, req, 405, { Allow: "POST" });
      if (await limited(env, req, "refresh")) return tooMany(req, "refresh");
      const city = url.searchParams.get("city");
      // Tajna se prima kroz Authorization zaglavlje, nikada kroz URL koji može završiti u logovima.
      const auth = req.headers.get("Authorization") || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!env.REFRESH_TOKEN || !token || !safeEq(token, env.REFRESH_TOKEN)) { log("refresh_denied"); return json({ error: "forbidden" }, req, 403); }
      if (!CITIES[city]) return json({ error: "city?", cities: Object.keys(CITIES) }, req, 400);
      return json({ city, result: await refreshCity(env, city) }, req);
    }
    if (url.pathname === "/api/enrich") {
      if (!okOrigin(req)) return json({ error: "forbidden", ...dbg(env, "origin") }, req, 403);
      if (!env.GOOGLE_KEY) return json({ error: "forbidden", ...dbg(env, "GOOGLE_KEY nije postavljen u Workeru") }, req, 403);
      if (await limited(env, req, "enrich")) return tooMany(req, "enrich");
      const name = (url.searchParams.get("name") || "").slice(0, 80);
      const la = parseFloat(url.searchParams.get("lat")), ln = parseFloat(url.searchParams.get("lng"));
      if (!name || !isFinite(la) || !isFinite(ln)) return json({ error: "bad params" }, req, 400);
      try {
        const out = await enrich(env, name, la, ln, url.searchParams.get("hl"));
        if (out && out.photo) { const sg = await photoSig(env, out.photo); if (sg) return json({ ...out, photo: out.photo + "~" + sg }, req); }
        return json(out, req);
      } catch (e) { log("enrich_failed", { g: e && e.g }); return json({ error: "upstream", g: e && e.g, ...dbg(env, e && e.m) }, req, e && e.g === 429 ? 503 : 502); }
    }
    if (url.pathname === "/api/geocode") {
      if (!okOrigin(req)) return json({ error: "forbidden" }, req, 403);
      if (await limited(env, req, "geocode")) return tooMany(req, "geocode");
      const q = (url.searchParams.get("q") || "").trim().slice(0, 120);
      if (q.length < 3) return json({ results: [] }, req);
      try { return json({ results: await geocode(env, q, url.searchParams.get("hl")) }, req, 200, { "Cache-Control": "public, max-age=86400" }); } catch (e) { return json({ error: "upstream" }, req, 502); }
    }
    if (url.pathname === "/api/walk") {
      if (!okOrigin(req)) return json({ error: "forbidden" }, req, 403);
      if (await limited(env, req, "walk")) return tooMany(req, "walk");
      const pts = (url.searchParams.get("pts") || "").split(";").slice(0, 16).map((t) => t.split(",").map(Number));
      const okp = (p) => p.length === 2 && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180 && p.every(Number.isFinite);
      if (pts.length < 2 || pts.length > 15 || !pts.every(okp) || pts.some((p, i) => i && km(pts[i - 1], p) > 30)) return json({ error: "bad params" }, req, 400);
      try { return json({ legs: await walkLegs(env, pts) }, req, 200, { "Cache-Control": "public, max-age=3600" }); } catch (e) { return json({ error: "upstream" }, req, 502); }
    }
    if (url.pathname === "/api/route") {
      if (!okOrigin(req)) return json({ error: "forbidden" }, req, 403);
      if (await limited(env, req, "route")) return tooMany(req, "route");
      const m = url.searchParams.get("m");
      const pts = (url.searchParams.get("pts") || "").split(";").slice(0, 22).map((t) => t.split(",").map(Number));
      const okp = (p) => p.length === 2 && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180 && p.every(Number.isFinite);
      if (!ROUTE_PROFILES.has(m) || pts.length < 2 || pts.length > 20 || !pts.every(okp) || pts.some((p, i) => i && km(pts[i - 1], p) > 1500)) return json({ error: "bad params" }, req, 400);
      try { return json(await routeVia(env, m, pts), req, 200, { "Cache-Control": "private, max-age=300" }); } catch (e) { log("route_failed"); return json({ error: "upstream" }, req, 502); }
    }
    if (url.pathname === "/api/along") {
      if (req.method !== "POST") return json({ error: "method" }, req, 405, { Allow: "POST, OPTIONS" });
      if (!okOrigin(req)) return json({ error: "forbidden" }, req, 403);
      if (await limited(env, req, "along")) return tooMany(req, "along");
      let b = null;
      try { b = await req.json(); } catch (e) { /* loš JSON */ }
      const cfg = b && ALONG[b.t], pts = b && b.pts;
      const okp = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
      if (!cfg || !Array.isArray(pts) || pts.length < 2 || pts.length > 700 || !pts.every(okp)) return json({ error: "bad params" }, req, 400);
      let len = 0; for (let i = 1; i < pts.length; i++) len += km(pts[i - 1], pts[i]);
      if (len > 1800) return json({ error: "bad params" }, req, 400);
      const flat = pts.map((p) => p[0].toFixed(2) + "," + p[1].toFixed(2)).join(","); // grublji ključ keša (~1 km): ista ruta se ne traži ponovo
      const key = `along:${b.t}:${alongHash(flat)}`;
      let hit = null; try { hit = await env.PLACES.get(key, "json"); } catch (e) { /* KV nedostupan: nastavi bez keša */ }
      if (hit) return json({ elements: hit, source: "cache" }, req, 200, { "Cache-Control": "public, max-age=600" });
      try {
        const els = await alongFetch(cfg, pts);
        try { await env.PLACES.put(key, JSON.stringify(els), { expirationTtl: cfg.ttl }); } catch (e) { /* keš nije obavezan */ }
        return json({ elements: els, source: "live" }, req, 200, { "Cache-Control": "public, max-age=600" });
      } catch (e) { log("along_upstream", { why: LAST_OVP }); return json({ error: "upstream", why: LAST_OVP || String(e && e.message) }, req, 502); }
    }
    if (url.pathname === "/api/photo") {
      const [ref, sg] = (url.searchParams.get("ref") || "").split("~");
      const rf = req.headers.get("Referer") || "";
      let ro = ""; try { ro = new URL(rf).origin; } catch (e) {}
      if (!env.GOOGLE_KEY || !/^places\/[\w-]+\/photos\/[\w-]+$/.test(ref) || !ALLOW.includes(ro)) return new Response("forbidden", { status: 403 });
      if (await limited(env, req, "photo")) return tooMany(req, "photo");
      const want = await photoSig(env, ref);
      if (want && !(sg && safeEq(sg, want))) { log("photo_bad_sig"); return new Response("forbidden", { status: 403 }); }
      const ck = new Request(url.origin + "/api/photo?ref=" + encodeURIComponent(ref));
      let res = await caches.default.match(ck);
      if (!res) {
        if (!(await capOk(env, "photo"))) return new Response("busy", { status: 503 });
        const g = await fetch(`https://places.googleapis.com/v1/${ref}/media?maxWidthPx=800&key=${env.GOOGLE_KEY}`);
        if (!g.ok) { log("photo_upstream", { g: g.status }); return new Response("upstream", { status: 502 }); }
        res = new Response(g.body, { headers: { "Content-Type": g.headers.get("Content-Type") || "image/jpeg", "Cache-Control": "public, max-age=604800", "X-Content-Type-Options": "nosniff" } });
        await caches.default.put(ck, res.clone());
      }
      return res;
    }
    if (url.pathname !== "/api/places") return json({ name: "MESTIGO API", usage: "/api/places?lat=&lng=&r=&cat=" }, req);

    if (!okOrigin(req)) return json({ error: "forbidden" }, req, 403);
    if (await limited(env, req, "places")) return tooMany(req, "places");
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
    const bb = String(env.LIVE_BBOX || "").split(",").map(Number);
    if (bb.length === 4 && bb.every(Number.isFinite) && !(lat >= bb[0] && lat <= bb[2] && lng >= bb[1] && lng <= bb[3])) return json({ error: "out_of_area" }, req, 422);
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
