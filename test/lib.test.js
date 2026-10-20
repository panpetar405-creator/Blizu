const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../lib/blizu-lib.js");

const MODES = { car: {}, bike: {}, foot: {} };
const CATS = { hrana: {}, vid: {}, pri: {}, kul: {}, ist: {} };

test("fmt / hhmm / fkm", () => {
  assert.equal(L.fmt(5), "5 min");
  assert.equal(L.fmt(59.6), "1h 00min");
  assert.equal(L.fmt(65), "1h 05min");
  assert.equal(L.hhmm(0), "00:00");
  assert.equal(L.hhmm(1500), "01:00"); // prelazi ponoć
  assert.equal(L.hhmm(605), "10:05");
  assert.equal(L.fkm(0.01), "sada");
  assert.equal(L.fkm(0.5), "500 m");
  assert.equal(L.fkm(2.34), "2.3 km");
});

test("dk: Kotor–Tivat je oko 6 km", () => {
  const d = L.dk([42.4247, 18.7712], [42.4364, 18.6961]);
  assert.ok(d > 5.9 && d < 6.4, "dobijeno " + d);
  assert.equal(L.dk([1, 1], [1, 1]), 0);
});

// dan: 0 = ponedjeljak … 6 = nedjelja; vrijeme u minutama od ponoći
test("ohCheck: osnovni slučajevi", () => {
  assert.deepEqual(L.ohCheck("24/7", 100, 30, 2), { s: "ok" });
  assert.deepEqual(L.ohCheck("Mo-Fr 08:00-16:00", 600, 30, 1), { s: "ok" });
  assert.deepEqual(L.ohCheck("Mo-Fr 08:00-16:00", 930, 60, 1), { s: "soon", end: 960 }); // zatvara prije kraja posjete
  assert.deepEqual(L.ohCheck("Mo-Fr 08:00-16:00", 600, 30, 5), { s: "closed" }); // subota
  assert.deepEqual(L.ohCheck("Mo-Fr 08:00-16:00", 400, 30, 1), { s: "closed", open: 480 }); // otvara tek u 08:00
});

test("ohCheck: više pravila i intervala", () => {
  const oh = "Mo-Fr 08:00-16:00; Sa 09:00-13:00";
  assert.deepEqual(L.ohCheck(oh, 480, 30, 5), { s: "closed", open: 540 });
  assert.deepEqual(L.ohCheck(oh, 600, 30, 5), { s: "ok" });
  assert.deepEqual(L.ohCheck(oh, 600, 30, 6), { s: "closed" }); // nedjelja nije navedena
  assert.deepEqual(L.ohCheck("Mo-Su 08:00-12:00,14:00-20:00", 780, 30, 3), { s: "closed", open: 840 });
  assert.deepEqual(L.ohCheck("Mo-Su off", 600, 30, 3), { s: "closed" });
  assert.deepEqual(L.ohCheck("Mo-Fr 08:00-16:00; We off", 600, 30, 2), { s: "closed" }); // kasnije pravilo pregazi
});

test("ohCheck: preko ponoći i raspon koji se prelama", () => {
  assert.deepEqual(L.ohCheck("Fr 20:00-02:00", 1380, 30, 4), { s: "ok" }); // petak 23:00
  assert.deepEqual(L.ohCheck("Sa-Mo 10:00-12:00", 660, 30, 6), { s: "ok" }); // nedjelja u rasponu Sa–Mo
  assert.deepEqual(L.ohCheck("Sa-Mo 10:00-12:00", 660, 30, 2), { s: "closed" });
});

test("ohCheck: neprepoznat izraz vraća null (aplikacija ga onda ne ocjenjuje)", () => {
  assert.equal(L.ohCheck("sunrise-sunset", 600, 30, 1), null);
  assert.equal(L.ohCheck("Mo-Fr 08:00-16:00; PH off", 600, 30, 1), null);
  assert.equal(L.ohCheck("Xx 08:00-16:00", 600, 30, 1), null);
});

test("mtxt: upute za skretanje", () => {
  assert.deepEqual(L.mtxt({ maneuver: { type: "arrive" } }, true), ["flag", "Stižete na odredište"]);
  assert.deepEqual(L.mtxt({ maneuver: { type: "arrive" } }, false), ["flag", "Stižete na stanicu"]);
  assert.deepEqual(L.mtxt({ maneuver: { type: "turn", modifier: "left" }, name: "Ulica Mira" }, false), ["turn-left", "Skrenite lijevo – Ulica Mira"]);
  assert.deepEqual(L.mtxt({ maneuver: { type: "turn", modifier: "slight right" } }, false), ["arrow-up-right", "Skrenite blago desno"]);
  assert.deepEqual(L.mtxt({ maneuver: { type: "roundabout", exit: 2 }, name: "A1" }, false), ["roundabout", "U kružnom toku izađite na 2. izlazu – A1"]);
  assert.deepEqual(L.mtxt({ maneuver: { type: "rotary" } }, false), ["roundabout", "U kružnom toku izađite na sljedećem izlazu"]);
  assert.deepEqual(L.mtxt({ maneuver: { type: "turn", modifier: "uturn" } }, false), ["uturn", "Okrenite se"]);
  assert.deepEqual(L.mtxt({ maneuver: { type: "fork", modifier: "right" } }, false), ["turn-right", "Na račvanju držite se desno"]);
  assert.deepEqual(L.mtxt({ maneuver: { type: "merge" } }, false), ["arrow-up", "Uključite se"]);
  assert.deepEqual(L.mtxt({ maneuver: { type: "continue", modifier: "straight" }, name: "M2" }, false), ["arrow-up", "Nastavite pravo – M2"]);
  assert.deepEqual(L.mtxt({}, false), ["arrow-up", "Nastavite pravo"]);
});

/* ---------- dijeljeni link ---------- */
const stop = ["n123", "Kafić Čaršija", "hrana", 42.4, 18.7, 45, 12, 0.5, 1.2, "italian", "Mo-Su 08:00-20:00", 3];
const payload = (over = {}) => ({ v: 1, a: ["Kotor", 42.42, 18.77], b: ["Podgorica", 42.44, 19.26], m: "car", e: 20, t: "09:00", d: "2026-10-20", s: [stop], ...over });
const link = (o) => "#p=" + L.b64e(JSON.stringify(o));

test("b64e/b64d: kružno kretanje sa dijakriticima i ćirilicom", () => {
  for (const s of ["Šđčćž ŠĐČĆŽ", "Подгорица", "emoji 🚗", ""]) assert.equal(L.b64d(L.b64e(s)), s);
  assert.match(L.b64e("???>>>"), /^[\w-]*$/); // bez + / =
});

test("parseShared: ispravan link", () => {
  const r = L.parseShared(link(payload()), { MODES, CATS, extra: 30 });
  assert.equal(r.A.name, "Kotor");
  assert.equal(r.mode, "car");
  assert.equal(r.extra, 20);
  assert.equal(r.stops.length, 1);
  assert.deepEqual(r.stops[0].t, { name: "Kafić Čaršija", cuisine: "italian", opening_hours: "Mo-Su 08:00-20:00", fl: 3 });
  assert.equal(r.d0, "2026-10-20");
});

test("parseShared: odbija neispravne i zlonamjerne linkove", () => {
  const ctx = { MODES, CATS, extra: 30 };
  const bad = [
    payload({ v: 2 }), payload({ m: "rocket" }), payload({ t: "9am" }),
    payload({ s: Array(13).fill(stop) }),
    payload({ a: ["X", 91, 10] }), payload({ b: ["X", 10, 181] }),
    payload({ s: [["x1", ...stop.slice(1)]] }),                 // neispravan id
    payload({ s: [[stop[0], stop[1], "nepoznata", ...stop.slice(3)]] }), // nepoznata kategorija
    payload({ s: [[...stop.slice(0, 5), 99999, ...stop.slice(6)]] }),    // trajanje van opsega
    payload({ s: ["ne-niz"] }),
  ];
  for (const b of bad) assert.equal(L.parseShared(link(b), ctx), null, JSON.stringify(b).slice(0, 60));
  assert.equal(L.parseShared("#p=%%%", ctx), null);
  assert.equal(L.parseShared("#p=" + L.b64e("nije json"), ctx), null);
  assert.equal(L.parseShared("", ctx), null);
  assert.equal(L.parseShared("#x=1", ctx), null);
});

test("parseShared: skraćuje predugačke tekstove i zadržava podrazumijevane vrijednosti", () => {
  const r = L.parseShared(link(payload({ a: ["A".repeat(500), 1, 2], e: 99999, d: "ne-datum" })), { MODES, CATS, extra: 30 });
  assert.equal(r.A.name.length, 80);
  assert.equal(r.extra, 30); // van opsega → zadano
  assert.equal(r.d0, "");
});

/* ---------- izvoz / uvoz ---------- */
const mkStop = (id = "n1") => ({ id, t: { name: "Vidikovac", opening_hours: "24/7" }, c: "vid", p: [42.4, 18.7], v: 20, est: 8, d: 0.4, f: 0.3 });
const mkPlan = (k = 1700000000000) => ({ k, A: { name: "Kotor", lat: 42.42, lon: 18.77 }, B: { name: "Budva", lat: 42.29, lon: 18.84 }, mode: "car", extra: 20, t0: "09:00", d0: "2026-10-20", km: 30, stops: [mkStop()], tm: { a: [560], e: 700 } });
const ctx = { MODES, CATS };

test("izvoz → uvoz vraća iste podatke", () => {
  const fav = { n1: { ...mkStop(), fv: 1, est: 0, d: 0, f: 0 } };
  const b = L.exportBackup({ plans: [mkPlan()], trips: [{ id: 5, name: "Ljeto", days: [1700000000000] }], fav, fil: 5, mode: "foot" });
  const r = L.parseBackup(JSON.stringify(b), ctx);
  assert.equal(r.ok, true);
  assert.equal(r.skipped, 0);
  assert.deepEqual(r.data.plans, [mkPlan()]);
  assert.deepEqual(r.data.trips, [{ id: 5, name: "Ljeto", days: [1700000000000] }]);
  assert.equal(r.data.fav.n1.id, "n1");
  assert.equal(r.data.fil, 5);
  assert.equal(r.data.mode, "foot");
});

test("parseBackup: odbija tuđe i prevelike fajlove", () => {
  assert.equal(L.parseBackup("ne json", ctx).ok, false);
  assert.equal(L.parseBackup(JSON.stringify({ app: "drugo", v: 1 }), ctx).ok, false);
  assert.equal(L.parseBackup(JSON.stringify({ app: "blizu", v: 9 }), ctx).ok, false);
  assert.equal(L.parseBackup("x".repeat(2 * 1024 * 1024 + 1), ctx).ok, false);
  assert.equal(L.parseBackup(null, ctx).ok, false);
});

test("parseBackup: čisti nepoznata polja i opasne vrijednosti, loše stavke preskače", () => {
  const evil = mkPlan(); evil.stops[0].t.image = "javascript:alert(1)"; evil.stops[0].t.__proto__x = 1; evil.stops[0].t.name = "<img src=x onerror=alert(1)>"; evil.hack = "x";
  const good = mkPlan(1700000000001); good.stops[0].t.image = "https://upload.wikimedia.org/a.jpg";
  const brokenPlan = mkPlan(1700000000002); brokenPlan.mode = "teleport";
  const b = { app: "blizu", v: 1, plans: [evil, good, brokenPlan, "smeće"], trips: [{ id: 1, name: "", days: [] }, { id: 2, name: "OK", days: [1] }], fav: { n9: { ...mkStop("n8") }, n1: mkStop("n1") } };
  const r = L.parseBackup(JSON.stringify(b), ctx);
  assert.equal(r.ok, true);
  assert.equal(r.data.plans.length, 2);
  assert.equal(r.data.plans[0].t0, "09:00");
  assert.equal("hack" in r.data.plans[0], false);
  assert.equal("image" in r.data.plans[0].stops[0].t, false); // javascript: URL odbačen
  assert.equal(r.data.plans[1].stops[0].t.image, "https://upload.wikimedia.org/a.jpg");
  assert.equal(r.data.trips.length, 1);
  assert.deepEqual(Object.keys(r.data.fav), ["n1"]); // ključ i id se moraju poklapati
  assert.equal(r.skipped, 4); // pokvaren plan, "smeće", prazno ime putovanja, nepodudaran favorit
});

test("mergeBackup: postojeće ima prednost, uvezeno se dodaje, najviše 40 planova", () => {
  const cur = { plans: [mkPlan(10)], trips: [{ id: 1, name: "Staro", days: [] }], fav: { n1: mkStop("n1") } };
  const inc = { plans: [mkPlan(10), mkPlan(20)], trips: [{ id: 1, name: "Novo ime", days: [] }, { id: 2, name: "Drugo", days: [] }], fav: { n1: mkStop("n1"), n2: mkStop("n2") } };
  const m = L.mergeBackup(cur, inc);
  assert.deepEqual(m.added, { plans: 1, trips: 1, fav: 1 });
  assert.deepEqual(m.plans.map((p) => p.k), [20, 10]); // najnoviji prvi
  assert.equal(m.trips.find((t) => t.id === 1).name, "Staro");
  const many = { plans: Array.from({ length: 60 }, (_, i) => mkPlan(1000 + i)), trips: [], fav: {} };
  assert.equal(L.mergeBackup({ plans: [], trips: [], fav: {} }, many).plans.length, 40);
});

/* ---------- zalazak sunca ---------- */
const hm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

test("ceOffset: ljetno/zimsko računanje vremena (CET/CEST)", () => {
  assert.equal(L.ceOffset("2026-01-15"), 60);
  assert.equal(L.ceOffset("2026-07-15"), 120);
  assert.equal(L.ceOffset("2026-03-28"), 60);  // dan prije posljednje nedjelje marta
  assert.equal(L.ceOffset("2026-03-29"), 120); // posljednja nedjelja marta 2026.
  assert.equal(L.ceOffset("2026-10-24"), 120);
  assert.equal(L.ceOffset("2026-10-25"), 60);  // posljednja nedjelja oktobra 2026. (uveče je već zimsko)
  assert.equal(L.ceOffset("nije datum"), null);
});

test("sunTimes: Kotor — razumne vrijednosti kroz godinu", () => {
  const dayLen = (d) => { const t = L.sunTimes(42.43, 18.77, d); return (t.set - t.rise) / 60; };
  assert.ok(Math.abs(dayLen("2026-03-20") - 12.1) < 0.25, "ravnodnevica");
  assert.ok(Math.abs(dayLen("2026-06-21") - 15.25) < 0.3, "ljetna dugodnevica");
  assert.ok(Math.abs(dayLen("2026-12-21") - 9.1) < 0.3, "zimska kratkodnevica");
  const jun = L.sunTimes(42.43, 18.77, "2026-06-21"), dec = L.sunTimes(42.43, 18.77, "2026-12-21");
  assert.match(hm(jun.set), /^20:[0-4]\d$/); // ljetni zalazak oko 20:25
  assert.match(hm(dec.set), /^16:[0-3]\d$/); // zimski zalazak oko 16:15
  assert.ok(jun.rise < jun.set && dec.rise < dec.set);
});

test("sunTimes: istočnije mjesto ima raniji zalazak; izvan regije i loš datum → null", () => {
  const west = L.sunTimes(42.4, 13.5, "2026-06-21").set, east = L.sunTimes(42.4, 23.5, "2026-06-21").set;
  assert.ok(west - east > 30, "10° dužine ≈ 40 min razlike");
  assert.equal(L.sunTimes(48.85, 2.35, "2026-06-21"), null); // Pariz: van regije
  assert.equal(L.sunTimes(42, 18, "x"), null);
});

test("sunWarn: poslije zalaska i zalazak usred posjete", () => {
  const set = L.sunTimes(42.4, 18.7, "2026-06-21").set;
  const stop = (v) => ({ p: [42.4, 18.7], v });
  assert.equal(L.sunWarn(stop(30), set - 120, "2026-06-21"), null);
  assert.deepEqual(L.sunWarn(stop(30), set - 10, "2026-06-21"), { k: "during", t: set });
  assert.deepEqual(L.sunWarn(stop(30), set + 5, "2026-06-21"), { k: "after", t: set });
  assert.deepEqual(L.sunWarn(stop(30), 1500, "2026-06-21"), { k: "after", t: set }); // sljedeći dan
  assert.equal(L.sunWarn({ p: [10, 10], v: 30 }, 1300, "2026-06-21"), null); // van regije
});

/* ---------- Plan B ---------- */
const cand = (id, c, f, est, oh, v = 30) => ({ id, c, f, est, v, t: { name: id, ...(oh ? { opening_hours: oh } : {}) } });
const OUTF = (c) => c === "vid" || c === "pri";
const base = (over = {}) => ({ sel: new Set(["a"]), arr: 600, di: 1, reason: "closed", avoidOut: false, out: OUTF, sunset: null, ...over });

test("altFor: preskače izabrane, zatvorene i one koje uskoro zatvaraju", () => {
  const stop = cand("a", "hrana", 0.5, 8, "Mo-Su 18:00-23:00");
  const cs = [stop, cand("b", "hrana", 0.5, 8, "Mo-Su 08:00-20:00"), cand("c", "hrana", 0.5, 5, "Mo-Su 18:00-23:00"), cand("d", "hrana", 0.5, 5, "Mo-Su 08:00-10:15")];
  const r = L.altFor(stop, cs, base());
  assert.deepEqual(r.map((x) => x.id), ["b"]);
  assert.equal(r[0].open, true);
});

test("altFor: ocjena — ista kategorija, blizina na putu, manje dodatnog vremena", () => {
  const stop = cand("a", "hrana", 0.5, 8, "Mo-Su 18:00-23:00");
  const cs = [cand("far", "hrana", 0.9, 8, "24/7"), cand("near", "hrana", 0.52, 8, "24/7"), cand("othercat", "kul", 0.5, 8, "24/7"), cand("slow", "hrana", 0.5, 40, "24/7")];
  const r = L.altFor(stop, cs, base()).map((x) => x.id);
  assert.deepEqual(r, ["near", "othercat", "slow"]); // druga kategorija (+15) je bolja od 32 min dodatno (+22), a daleko na putu ispada iz prva tri
  assert.equal(L.altFor(stop, cs, base({ reason: "rain" })).findIndex((x) => x.id === "othercat") < 2, true); // pri kiši je druga kategorija manja kazna (+5)
});

test("altFor: nepotvrđeno radno vrijeme je dozvoljeno, ali rangirano niže", () => {
  const stop = cand("a", "hrana", 0.5, 8, "Mo-Su 18:00-23:00");
  const r = L.altFor(stop, [cand("unk", "hrana", 0.5, 8, null), cand("ok", "hrana", 0.5, 8, "24/7")], base());
  assert.deepEqual(r.map((x) => [x.id, x.open]), [["ok", true], ["unk", false]]);
});

test("altFor: za kišu i zalazak isključuje stanice na otvorenom", () => {
  const stop = cand("a", "vid", 0.5, 8, null);
  const cs = [cand("v", "vid", 0.5, 2, "24/7"), cand("m", "kul", 0.5, 20, "24/7")];
  for (const reason of ["rain", "sunset"]) {
    const r = L.altFor(stop, cs, base({ reason, avoidOut: true }));
    assert.deepEqual(r.map((x) => x.id), ["m"]);
    assert.equal(r[0].indoor, true);
  }
  // otvoreno mjesto se ne preporučuje ako bi se zalazak desio usred posjete
  assert.deepEqual(L.altFor(stop, cs, base({ reason: "any", sunset: 610 })).map((x) => x.id), ["m"]);
});

test("altFor: najviše 3 prijedloga, a bez kandidata prazan niz", () => {
  const stop = cand("a", "hrana", 0.5, 8, null);
  const cs = Array.from({ length: 10 }, (_, i) => cand("x" + i, "hrana", 0.5 + i / 100, 5, "24/7"));
  assert.equal(L.altFor(stop, cs, base()).length, 3);
  assert.deepEqual(L.altFor(stop, [], base()), []);
});

/* ---------- trajekt ---------- */
test("ferryInfo: broji prelaze i trajanje iz OSRM koraka", () => {
  assert.equal(L.ferryInfo([{ mode: "driving", duration: 600 }]), null);
  assert.equal(L.ferryInfo([]), null);
  assert.equal(L.ferryInfo(undefined), null);
  assert.deepEqual(L.ferryInfo([{ mode: "driving", duration: 100 }, { mode: "ferry", duration: 600 }, { mode: "ferry", duration: 300 }, { mode: "driving", duration: 50 }]), { n: 1, min: 15 });
  assert.deepEqual(L.ferryInfo([{ mode: "ferry", duration: 300 }, { mode: "driving", duration: 5 }, { mode: "ferry", duration: 420 }]), { n: 2, min: 12 });
});
