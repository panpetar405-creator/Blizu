// Testovi Workera: porijeklo, ograničenje zahtjeva, /api/refresh, potpis fotografija, dnevna granica.
// worker.js je ES modul bez package.json "type":"module", pa se prije uvoza kopira u privremeni .mjs.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const O = "https://panpetar405-creator.github.io";
let W;
const kv = new Map();
const KV = { get: async (k, t) => { const v = kv.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, put: async (k, v) => { kv.set(k, String(v)); } };
let googleCalls = 0;
const realFetch = globalThis.fetch;

test.before(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "blizu-w-"));
  const f = path.join(tmp, "worker.mjs");
  fs.copyFileSync(path.join(__dirname, "../worker.js"), f);
  W = (await import("file://" + f)).default;
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  globalThis.fetch = async (u) => {
    u = String(u);
    if (u.includes("places:searchText")) { googleCalls++; return new Response(JSON.stringify({ places: [{ id: "x", displayName: { text: "Kafe Test" }, location: { latitude: 42.4, longitude: 18.7 }, rating: 4.5, userRatingCount: 10, photos: [{ name: "places/ABC/photos/DEF" }] }] }), { status: 200 }); }
    if (u.includes("/media")) { googleCalls++; return new Response("IMG", { status: 200, headers: { "Content-Type": "image/jpeg" } }); }
    throw new Error("mreža blokirana u testu: " + u);
  };
});
test.after(() => { globalThis.fetch = realFetch; });

const call = (p, { method = "GET", origin = O, ip = "1.1.1.1", headers = {}, env = {}, body } = {}) =>
  W.fetch(new Request("https://w.test" + p, { method, body, headers: { ...(origin ? { Origin: origin } : {}), "CF-Connecting-IP": ip, ...headers } }), { PLACES: KV, GOOGLE_KEY: "k", REFRESH_TOKEN: "secret-token", ...env });
const ref = (extra = {}) => ({ origin: null, headers: { Referer: O + "/" }, ...extra });

test("Origin: bez njega i tuđi su 403, naš prolazi", async () => {
  assert.equal((await call("/api/places?lat=42.4&lng=18.7", { origin: null })).status, 403);
  assert.equal((await call("/api/places?lat=42.4&lng=18.7", { origin: "https://evil.example" })).status, 403);
  assert.equal((await call("/api/health")).status, 200);
});

test("ALLOWED_ORIGINS dodaje domene, a loše vrijednosti odbacuje", async () => {
  let r = await call("/api/health", { origin: "https://blizu.me", env: { ALLOWED_ORIGINS: "https://blizu.me, javascript:alert(1)" } });
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://blizu.me");
  r = await call("/api/health", { origin: "javascript:alert(1)", env: { ALLOWED_ORIGINS: "javascript:alert(1)" } });
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), O);
});

test("/api/refresh: samo POST, tačan token, ograničen broj pokušaja", async () => {
  assert.equal((await call("/api/refresh?city=kotor", { headers: { Authorization: "Bearer secret-token" } })).status, 405);
  assert.equal((await call("/api/refresh?city=kotor", { method: "POST", ip: "2.2.2.2", headers: { Authorization: "Bearer nope" } })).status, 403);
  assert.equal((await call("/api/refresh?city=kotor", { method: "POST", ip: "2.2.2.3" })).status, 403);
  assert.equal((await call("/api/refresh?city=nepoznat", { method: "POST", ip: "4.4.4.4", headers: { Authorization: "Bearer secret-token" } })).status, 400);
  let s; for (let i = 0; i < 7; i++) s = (await call("/api/refresh?city=kotor", { method: "POST", ip: "3.3.3.3", headers: { Authorization: "Bearer nope" } })).status;
  assert.equal(s, 429);
});

test("ograničenje zahtjeva: po IP adresi, i preko RL bindinga", async () => {
  let s; for (let i = 0; i < 62; i++) s = (await call("/api/geocode?q=a", { ip: "5.5.5.5" })).status;
  assert.equal(s, 429);
  assert.equal((await call("/api/geocode?q=a", { ip: "5.5.5.6" })).status, 200);
  let n = 0; const RL = { limit: async () => ({ success: ++n < 3 }) }; const st = [];
  for (let i = 0; i < 4; i++) st.push((await call("/api/geocode?q=a", { ip: "6.6.6.6", env: { RL } })).status);
  assert.deepEqual(st, [200, 200, 429, 429]);
});

test("fotografije: potpisana referenca prolazi, ostalo ne", async () => {
  const j = await (await call("/api/enrich?name=Kafe%20Test&lat=42.4&lng=18.7", { ip: "7.7.7.7" })).json();
  assert.match(j.photo, /^places\/ABC\/photos\/DEF~[\w-]{16}$/);
  const photo = (r, ip) => call("/api/photo?ref=" + encodeURIComponent(r), ref({ ip }));
  assert.equal((await photo(j.photo, "7.7.7.8")).status, 200);
  assert.equal((await photo("places/ABC/photos/DEF", "7.7.7.9")).status, 403);
  assert.equal((await photo("places/ABC/photos/DEF~AAAAAAAAAAAAAAAA", "7.7.7.10")).status, 403);
  assert.equal((await call("/api/photo?ref=" + encodeURIComponent(j.photo), { origin: null, ip: "7.7.7.11", headers: { Referer: "https://evil.example/" } })).status, 403);
  assert.equal((await call("/api/photo?ref=" + encodeURIComponent(j.photo), { origin: null, ip: "7.7.7.12", headers: { Referer: O + ".evil.example/" } })).status, 403);
});

test("dnevna granica Google poziva (GOOGLE_DAILY_CAP)", async () => {
  kv.clear();
  const st = [];
  for (let i = 0; i < 4; i++) st.push((await call(`/api/enrich?name=Mjesto${i}&lat=42.4&lng=18.7`, { ip: "8.8.8." + i, env: { GOOGLE_DAILY_CAP: "2" } })).status);
  assert.deepEqual(st, [200, 200, 503, 503]);
});

test("greške ne otkrivaju interne poruke bez DEBUG, imaju no-store", async () => {
  const q = "/api/enrich?name=X&lat=1&lng=1";
  assert.equal("m" in (await (await call(q, { ip: "9.9.9.1", env: { GOOGLE_KEY: "" } })).json()), false);
  assert.equal("m" in (await (await call(q, { ip: "9.9.9.2", env: { GOOGLE_KEY: "", DEBUG: "1" } })).json()), true);
  const r = await call("/api/places?lat=1&lng=1", { origin: null });
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
});

test("LIVE_BBOX blokira uživo upite izvan područja; PUT je 405", async () => {
  assert.equal((await call("/api/places?lat=48.8&lng=2.3&r=1000", { ip: "10.0.0.1", env: { LIVE_BBOX: "40,13,47,24" } })).status, 422);
  assert.equal((await call("/api/places", { method: "PUT" })).status, 405);
});

test("/api/along: samo POST, ispravni parametri, tuđe porijeklo je 403", async () => {
  const ok = JSON.stringify({ t: "fuel", pts: [[43.85, 18.41], [43.3, 17.8]] });
  assert.equal((await call("/api/along", { method: "GET" })).status, 405);
  assert.equal((await call("/api/along", { method: "POST", body: ok, origin: "https://evil.example" })).status, 403);
  assert.equal((await call("/api/along", { method: "POST", body: "nije json", ip: "2.2.2.2" })).status, 400);
  assert.equal((await call("/api/along", { method: "POST", body: JSON.stringify({ t: "x", pts: [[1, 1], [2, 2]] }), ip: "2.2.2.3" })).status, 400);
  assert.equal((await call("/api/along", { method: "POST", body: JSON.stringify({ t: "toll", pts: [[43, 18]] }), ip: "2.2.2.4" })).status, 400);
  assert.equal((await call("/api/along", { method: "POST", body: JSON.stringify({ t: "toll", pts: [[0, 0], [60, 60]] }), ip: "2.2.2.5" })).status, 400); // predugačka ruta
});

test("/api/along: rezultat iz keša se vraća bez poziva Overpass-a", async () => {
  const pts = [[43.85, 18.41], [43.3, 17.8]];
  const flat = pts.map((p) => p[0].toFixed(2) + "," + p[1].toFixed(2)).join(","); // isto zaokruživanje kao u workeru
  let h = 2166136261; for (let i = 0; i < flat.length; i++) { h ^= flat.charCodeAt(i); h = Math.imul(h, 16777619); }
  kv.set(`along:fuel:${(h >>> 0).toString(36)}`, JSON.stringify([{ type: "node", id: 1, lat: 43.5, lon: 18, tags: { name: "Test pumpa" } }]));
  const r = await call("/api/along", { method: "POST", body: JSON.stringify({ t: "fuel", pts }), ip: "3.3.3.3" });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.source, "cache");
  assert.equal(j.elements[0].tags.name, "Test pumpa");
});
