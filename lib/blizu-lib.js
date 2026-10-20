/* BLIZU — čista logika bez DOM-a (testira se u test/*.test.js)
 *  - geo / formatiranje: dk, fmt, hhmm, fkm
 *  - radno vrijeme (OSM opening_hours, podskup): ohCheck
 *  - upute za skretanje: mtxt
 *  - dijeljeni link: b64e, b64d, parseShared
 *  - izvoz/uvoz podataka: exportBackup, parseBackup, mergeBackup
 *  - zalazak sunca (sunTimes, sunWarn), Plan B zamjene (altFor), trajekt u ruti (ferryInfo)
 * U pregledniku postaje window.BlizuLib; u Node-u se učitava kao CommonJS modul.
 */
(function (g) {
  "use strict";
  var RAD = Math.PI / 180;

  /* ---------- geo i formatiranje ---------- */
  function dk(a, b) { // udaljenost u km između [lat,lon] tačaka (ravninska aproksimacija, dovoljna za kratke razdaljine)
    return 6371 * Math.hypot((b[1] - a[1]) * RAD * Math.cos((a[0] + b[0]) * RAD / 2), (b[0] - a[0]) * RAD);
  }
  var fmt = function (m) { m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + "h " + String(m % 60).padStart(2, "0") + "min" : m + " min"; };
  var hhmm = function (m) { m = Math.round(m) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
  var fkm = function (k) { return k < .05 ? "sada" : k < 1 ? Math.round(k * 100) * 10 + " m" : k.toFixed(1) + " km"; };

  /* ---------- radno vrijeme ---------- */
  var OD = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"], DAYS = "(?:Mo|Tu|We|Th|Fr|Sa|Su)",
    OHR = new RegExp("^((?:" + DAYS + "(?:-" + DAYS + ")?)(?:," + DAYS + "(?:-" + DAYS + ")?)*\\s+)?(off|closed|\\d{1,2}:\\d{2}-\\d{1,2}:\\d{2}(?:\\s*,\\s*\\d{1,2}:\\d{2}-\\d{1,2}:\\d{2})*)$", "i");
  /* ohCheck(oh, a, dur, di): provjera u minutima od ponoći `a` za posjetu od `dur` minuta; di = dan (0=Mo … 6=Su).
   * Vraća {s:"ok"} | {s:"soon",end} (zatvara prije kraja posjete) | {s:"closed",open?} | null (izraz nije podržan). */
  function ohCheck(oh, a, dur, di) {
    oh = String(oh).trim(); if (oh == "24/7") return { s: "ok" };
    di = di ?? (new Date().getDay() + 6) % 7; a %= 1440;
    var dm = function (x) { x = x.split(":"); return +x[0] * 60 + +x[1]; }, hit = null;
    for (var part of oh.split(";")) {
      var r = part.trim(); if (!r) continue;
      var m = OHR.exec(r); if (!m) return null;
      var on = true;
      if (m[1]) {
        on = false;
        for (var gr of m[1].trim().split(",")) {
          var xy = gr.split("-"), i = OD.indexOf(xy[0]), j = xy[1] ? OD.indexOf(xy[1]) : i;
          if (i < 0 || j < 0) return null;
          if (i <= j ? di >= i && di <= j : di >= i || di <= j) on = true;
        }
      }
      if (on) hit = m[2];
    }
    if (hit == null || /^(off|closed)$/i.test(hit)) return { s: "closed" };
    var nxt = null;
    for (var iv of hit.split(",")) {
      var p = iv.trim().split("-"), st = dm(p[0]), en = dm(p[1]);
      if (en <= st) en += 1440;
      if (st <= a && a < en) return en < a + dur ? { s: "soon", end: en } : { s: "ok" };
      if (st > a && (nxt == null || st < nxt)) nxt = st;
    }
    return { s: "closed", open: nxt };
  }

  /* ---------- upute za skretanje (OSRM maneuver → [ikona, tekst na srpskom]) ---------- */
  function mtxt(s, last) {
    var m = s.maneuver || {}, t = m.type, d = m.modifier || "", nm = s.name ? " – " + s.name : "";
    var dr = { left: "lijevo", right: "desno", "slight left": "blago lijevo", "slight right": "blago desno", "sharp left": "oštro lijevo", "sharp right": "oštro desno", straight: "pravo" }[d] || "";
    var ar = { left: "turn-left", right: "turn-right", "slight left": "arrow-up-left", "slight right": "arrow-up-right", "sharp left": "turn-left", "sharp right": "turn-right", straight: "arrow-up", uturn: "uturn" }[d] || "arrow-up";
    if (t == "arrive") return ["flag", last ? "Stižete na odredište" : "Stižete na stanicu"];
    if (/roundabout|rotary/.test(t)) return ["roundabout", "U kružnom toku izađite na " + (m.exit ? m.exit + ". izlazu" : "sljedećem izlazu") + nm];
    if (d == "uturn") return ["uturn", "Okrenite se"];
    if (t == "fork") return [ar, "Na račvanju držite se " + (dr || "pravo") + nm];
    if (t == "merge") return [ar, "Uključite se" + (dr ? " " + dr : "") + nm];
    if (d == "straight" || t == "continue" || !dr) return ["arrow-up", "Nastavite pravo" + nm];
    return [ar, "Skrenite " + dr + nm];
  }

  /* ---------- dijeljeni link (#p=...) ---------- */
  var b64e = function (s) { var r = ""; new TextEncoder().encode(s).forEach(function (x) { r += String.fromCharCode(x); }); return btoa(r).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  var b64d = function (s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; var r = atob(s), b = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) b[i] = r.charCodeAt(i); return new TextDecoder().decode(b); };
  var num = function (x, a, b) { return typeof x == "number" && Number.isFinite(x) && x >= a && x <= b; };
  var str = function (x, n) { return typeof x == "string" ? x.slice(0, n) : ""; };
  var ID = /^(?:[nwr]\d{1,15}|p\d{1,3})$/;
  /* ctx = {MODES, CATS, extra}. Linkovi dolaze od nepoznatih ljudi, pa se svako polje provjerava; neispravno → null. */
  function parseShared(hash, ctx) {
    var m = /^#p=([\w-]+)$/.exec(hash || ""); if (!m) return null;
    try {
      var j = JSON.parse(b64d(m[1])),
        pt = function (x) { if (!Array.isArray(x) || !num(x[1], -90, 90) || !num(x[2], -180, 180)) throw 0; return { name: str(x[0], 80) || "Lokacija", lat: x[1], lon: x[2] }; };
      if (j.v !== 1 || !ctx.MODES[j.m] || !Array.isArray(j.s) || j.s.length > 12 || !/^\d{1,2}:\d{2}$/.test(j.t)) return null;
      var stops = j.s.map(function (x) {
        if (!Array.isArray(x) || !ID.test(x[0]) || !ctx.CATS[x[2]] || !num(x[3], -90, 90) || !num(x[4], -180, 180) || !num(x[5], 0, 720) || !num(x[6], 0, 720) || !num(x[7], 0, 1) || !num(x[8], 0, 500)) throw 0;
        var t = { name: str(x[1], 100) };
        if (x[9]) t.cuisine = str(x[9], 80);
        if (x[10]) t.opening_hours = str(x[10], 200);
        if (num(x[11], 0, 63)) t.fl = x[11];
        return { id: x[0], t: t, c: x[2], p: [x[3], x[4]], v: x[5], est: x[6], f: x[7], d: x[8] };
      });
      return { A: pt(j.a), B: pt(j.b), mode: j.m, extra: num(j.e, 0, 1440) ? j.e : ctx.extra, t0: j.t, d0: /^\d{4}-\d{2}-\d{2}$/.test(j.d) ? j.d : "", stops: stops };
    } catch (e) { return null; }
  }

  /* ---------- izvoz / uvoz podataka ---------- */
  var BK_MAX = 2 * 1024 * 1024;
  function cleanT(t) {
    t = t && typeof t == "object" ? t : {};
    var o = { name: str(t.name, 100) };
    if (t.cuisine) o.cuisine = str(t.cuisine, 80);
    if (t.opening_hours) o.opening_hours = str(t.opening_hours, 200);
    if (t.phone) o.phone = str(t.phone, 40);
    if (t.description) o.description = str(t.description, 300);
    if (typeof t.image == "string" && /^https?:\/\/[^\s"'<>]{1,480}$/.test(t.image)) o.image = t.image;
    if (typeof t.wikimedia_commons == "string" && /^File:[^\n\r"'<>]{1,200}$/.test(t.wikimedia_commons)) o.wikimedia_commons = t.wikimedia_commons;
    if (typeof t.wikidata == "string" && /^Q\d{1,12}$/.test(t.wikidata)) o.wikidata = t.wikidata;
    if (num(t.fl, 0, 63)) o.fl = t.fl;
    return o;
  }
  function cleanStop(x, ctx, fav) {
    if (!x || typeof x != "object" || !ID.test(x.id) || !ctx.CATS[x.c] || !Array.isArray(x.p) || !num(x.p[0], -90, 90) || !num(x.p[1], -180, 180)) return null;
    var n = function (v, a, b) { return v == null && fav ? 0 : num(v, a, b) ? v : NaN; };
    var v = n(x.v, 0, 720), est = n(x.est, 0, 720), f = n(x.f, 0, 1), d = n(x.d, 0, 500);
    if ([v, est, f, d].some(Number.isNaN)) return null;
    var o = { id: x.id, t: cleanT(x.t), c: x.c, p: [x.p[0], x.p[1]], v: v, est: est, d: d, f: f };
    if (fav) o.fv = 1;
    return o;
  }
  function cleanPt(x) { return x && typeof x == "object" && num(x.lat, -90, 90) && num(x.lon, -180, 180) ? { name: str(x.name, 80) || "Lokacija", lat: x.lat, lon: x.lon } : null; }
  function cleanPlan(p, ctx) {
    if (!p || typeof p != "object" || !num(p.k, 1, 4e12) || !ctx.MODES[p.mode] || !Array.isArray(p.stops) || p.stops.length > 12 || !/^\d{1,2}:\d{2}$/.test(p.t0)) return null;
    var A = cleanPt(p.A), B = cleanPt(p.B); if (!A || !B) return null;
    var stops = p.stops.map(function (s) { return cleanStop(s, ctx, false); });
    if (stops.some(function (s) { return !s; })) return null;
    var o = { k: p.k, A: A, B: B, mode: p.mode, extra: num(p.extra, 0, 1440) ? p.extra : 20, t0: p.t0, d0: /^\d{4}-\d{2}-\d{2}$/.test(p.d0) ? p.d0 : "", km: num(p.km, 0, 20000) ? p.km : 0, stops: stops };
    if (p.tm && Array.isArray(p.tm.a) && p.tm.a.length == stops.length && p.tm.a.every(function (v) { return num(v, 0, 4000); }) && num(p.tm.e, 0, 4000)) o.tm = { a: p.tm.a.slice(), e: p.tm.e };
    return o;
  }
  function exportBackup(d) {
    return { app: "blizu", v: 1, exported: new Date().toISOString(), plans: d.plans || [], trips: d.trips || [], fav: d.fav || {}, fil: d.fil | 0, mode: d.mode || "" };
  }
  /* parseBackup(text, {MODES, CATS}) → {ok:true, data:{plans,trips,fav,fil,mode}, skipped:n} | {ok:false, error:"..."} */
  function parseBackup(text, ctx) {
    if (typeof text != "string" || text.length > BK_MAX) return { ok: false, error: "size" };
    var j; try { j = JSON.parse(text); } catch (e) { return { ok: false, error: "json" }; }
    if (!j || j.app !== "blizu" || j.v !== 1) return { ok: false, error: "format" };
    var skipped = 0, plans = [], trips = [], fav = {};
    (Array.isArray(j.plans) ? j.plans.slice(0, 200) : []).forEach(function (p) { var c = cleanPlan(p, ctx); if (c) plans.push(c); else skipped++; });
    (Array.isArray(j.trips) ? j.trips.slice(0, 100) : []).forEach(function (t) {
      if (t && typeof t == "object" && num(t.id, 1, 4e12) && str(t.name, 60).trim() && Array.isArray(t.days) && t.days.length <= 60 && t.days.every(function (k) { return num(k, 1, 4e12); })) trips.push({ id: t.id, name: str(t.name, 60), days: t.days.slice() });
      else skipped++;
    });
    var fe = j.fav && typeof j.fav == "object" && !Array.isArray(j.fav) ? Object.keys(j.fav).slice(0, 300) : [];
    fe.forEach(function (k) { var c = ID.test(k) ? cleanStop(j.fav[k], ctx, true) : null; if (c && c.id === k) fav[k] = c; else skipped++; });
    return { ok: true, skipped: skipped, data: { plans: plans, trips: trips, fav: fav, fil: num(j.fil, 0, 63) ? j.fil | 0 : 0, mode: ctx.MODES[j.mode] ? j.mode : "" } };
  }
  /* Uvoz se spaja s postojećim podacima (postojeće ima prednost); plan ima najviše 40 sačuvanih. */
  function mergeBackup(cur, inc) {
    var plans = cur.plans.slice(), have = new Set(plans.map(function (p) { return p.k; })), np = 0;
    inc.plans.forEach(function (p) { if (!have.has(p.k)) { plans.push(p); have.add(p.k); np++; } });
    plans.sort(function (a, b) { return b.k - a.k; });
    if (plans.length > 40) plans.length = 40;
    var trips = cur.trips.slice(), th = new Set(trips.map(function (t) { return t.id; })), nt = 0;
    inc.trips.forEach(function (t) { if (!th.has(t.id)) { trips.push(t); th.add(t.id); nt++; } });
    var fav = Object.assign({}, cur.fav), nf = 0;
    Object.keys(inc.fav).forEach(function (k) { if (!fav[k]) { fav[k] = inc.fav[k]; nf++; } });
    return { plans: plans, trips: trips, fav: fav, added: { plans: np, trips: nt, fav: nf } };
  }

  /* ---------- zalazak sunca (NOAA/„sunrise equation”, bez mreže) ---------- */
  // Vrijeme se vraća u lokalnom satu srednje Evrope (CET/CEST). To važi za Balkan i okolinu (lat 34–50, lon 12–30);
  // izvan tog područja nema pouzdane vremenske zone bez baze zona, pa se vraća null i upozorenje se ne prikazuje.
  function lastSunday(y, mo) { var d = new Date(Date.UTC(y, mo + 1, 0)); return d.getUTCDate() - d.getUTCDay(); }
  function ceOffset(dateStr) { // 60 (zima) ili 120 (ljeto) minuta
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || ""); if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var ls3 = lastSunday(y, 2), ls10 = lastSunday(y, 9);
    var summer = (mo > 3 && mo < 10) || (mo === 3 && d >= ls3) || (mo === 10 && d < ls10);
    return summer ? 120 : 60;
  }
  function sunTimes(lat, lon, dateStr) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || "");
    if (!m || !(lat >= 34 && lat <= 50 && lon >= 12 && lon <= 30)) return null;
    var Y = +m[1], Mo = +m[2], D = +m[3], r = Math.PI / 180;
    var jdNoon = Date.UTC(Y, Mo - 1, D, 12) / 86400000 + 2440587.5, n = Math.round(jdNoon - 2451545.0);
    var Js = n - lon / 360, M = (357.5291 + 0.98560028 * Js) % 360;
    var C = 1.9148 * Math.sin(M * r) + 0.02 * Math.sin(2 * M * r) + 0.0003 * Math.sin(3 * M * r);
    var lam = (M + C + 180 + 102.9372) % 360;
    var Jt = 2451545.0 + Js + 0.0053 * Math.sin(M * r) - 0.0069 * Math.sin(2 * lam * r);
    var sinD = Math.sin(lam * r) * Math.sin(23.4397 * r), cosD = Math.cos(Math.asin(sinD));
    var cw = (Math.sin(-0.833 * r) - Math.sin(lat * r) * sinD) / (Math.cos(lat * r) * cosD);
    if (cw < -1 || cw > 1) return null;
    var w = Math.acos(cw) / r, day0 = 2451545.0 + n - 0.5, off = ceOffset(dateStr);
    var loc = function (J) { return Math.round((J - day0) * 1440 + off); };
    return { rise: loc(Jt - w / 360), set: loc(Jt + w / 360) };
  }
  /* sunWarn(stop, arr, dateStr): upozorenje samo za stanice na otvorenom (poziva se za njih).
   * arr = dolazak u minutama od ponoći (>=1440 znači sljedeći dan). → {k:"after"|"during", t:zalazak} | null */
  function sunWarn(stop, arr, dateStr) {
    var st = sunTimes(stop.p[0], stop.p[1], dateStr); if (!st) return null;
    if (arr >= st.set) return { k: "after", t: st.set };
    if (arr + stop.v > st.set) return { k: "during", t: st.set };
    return null;
  }

  /* ---------- Plan B: zamjene za stanicu ---------- */
  /* altFor(stop, cands, ctx) → do 3 zamjene, najbolja prva.
   * ctx = {sel:Set(id), arr, di, reason:"closed"|"rain"|"sunset"|"any", avoidOut:bool, out:(kategorija)=>bool, sunset:min|null}
   * Isključuje: već izabrane, zatvorene/„uskoro zatvara” u trenutku dolaska, a pri kiši ili zalasku i stanice na otvorenom.
   * Ocjena: blizina po dužini puta, dodatno vrijeme, ista kategorija (kad je razlog zatvoreno), nepotvrđeno radno vrijeme je lošije. */
  function altFor(stop, cands, ctx) {
    var res = [];
    cands.forEach(function (c) {
      if (c.id === stop.id || ctx.sel.has(c.id)) return;
      var out = ctx.out(c.c);
      if (ctx.avoidOut && out) return;
      if (ctx.sunset != null && out && ctx.arr + c.v > ctx.sunset) return;
      var open = null, pen = 0;
      if (c.t && c.t.opening_hours) {
        var o = ohCheck(c.t.opening_hours, ctx.arr, c.v, ctx.di);
        if (o && o.s !== "ok") return;
        open = o ? true : null;
      }
      if (open == null) pen += 6;
      pen += Math.abs((c.f || 0) - (stop.f || 0)) * 100 + (c.est || 0) * 0.7;
      if (c.c !== stop.c) pen += ctx.reason === "closed" || ctx.reason === "any" ? 15 : 5;
      res.push({ id: c.id, open: open === true, indoor: !out, score: pen });
    });
    res.sort(function (a, b) { return a.score - b.score; });
    return res.slice(0, 3);
  }

  /* ---------- trajekt u ruti (OSRM step.mode === "ferry") ---------- */
  function ferryInfo(steps) {
    var n = 0, sec = 0, prev = false;
    (steps || []).forEach(function (s) { var f = !!s && s.mode === "ferry"; if (f) { sec += +s.duration || 0; if (!prev) n++; } prev = f; });
    return n ? { n: n, min: Math.round(sec / 60) } : null;
  }

  var api = { dk: dk, fmt: fmt, hhmm: hhmm, fkm: fkm, ohCheck: ohCheck, mtxt: mtxt, b64e: b64e, b64d: b64d, parseShared: parseShared, exportBackup: exportBackup, parseBackup: parseBackup, mergeBackup: mergeBackup, ceOffset: ceOffset, sunTimes: sunTimes, sunWarn: sunWarn, altFor: altFor, ferryInfo: ferryInfo };
  g.BlizuLib = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
