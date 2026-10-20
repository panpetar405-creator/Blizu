// "Dimni" test: glavna skripta iz index.html se izvršava u Node-u uz lažni DOM.
// Hvata sintaksne greške, nedefinisane promjenljive pri učitavanju i greške u šablonima ekrana.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).sort((a, b) => b.length - a.length);
const main = scripts[0];

const stub = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => "" : k === "length" ? 0 : k === "then" ? undefined : stub()),
  apply: () => stub(), construct: () => stub(), set: () => true,
});
function makeCtx(hash = "") {
  const mem = {};
  const ctx = { console, Math, JSON, Date, Promise, Object, Array, Set, Map, WeakMap, Number, String, RegExp, Error, Uint8Array, TextEncoder, TextDecoder, URL, AbortSignal, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent, isNaN, parseInt, parseFloat, btoa, atob, Intl };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; } };
  ctx.document = stub(); ctx.navigator = { onLine: true, language: "sr" };
  ctx.location = { hash, origin: "https://x.test", pathname: "/", search: "", href: "https://x.test/" };
  ctx.history = { replaceState() {} }; ctx.addEventListener = () => {}; ctx.scrollTo = () => {};
  ctx.fetch = () => Promise.reject(new Error("net")); ctx.alert = ctx.confirm = ctx.prompt = () => {};
  ctx.L = stub(); ctx.print = () => {}; ctx.BLIZU_API = "https://api.test";
  ctx.BlizuLib = require("../lib/blizu-lib.js");
  ctx.I18N = { ui() {}, flush() {}, hl: () => "sr-Latn", loc: () => "sr-Latn", lang: () => "sr", T: (x) => x }; ctx._t = (x) => x;
  vm.createContext(ctx);
  return ctx;
}

test("glavna skripta se učitava bez izuzetka", () => {
  const ctx = makeCtx();
  assert.doesNotThrow(() => new vm.Script(main, { filename: "index-inline.js" }).runInContext(ctx, { timeout: 4000 }));
});

test("ekrani Profil / Favoriti / Planovi / Partner se crtaju bez greške", () => {
  const ctx = makeCtx();
  new vm.Script(main).runInContext(ctx, { timeout: 4000 });
  for (const f of ["drawProf", "drawFav", "drawSaved", "drawPartner"]) {
    if (vm.runInContext(`typeof ${f}`, ctx) === "function") assert.doesNotThrow(() => vm.runInContext(`${f}()`, ctx), f);
  }
});

test("upozorenja o radnom vremenu i kiši rade s lib funkcijama", () => {
  const ctx = makeCtx();
  new vm.Script(main).runInContext(ctx, { timeout: 4000 });
  const out = vm.runInContext(`warn({t:{opening_hours:"Mo-Su 08:00-10:00"},c:"hrana",v:30},300)`, ctx);
  assert.match(String(out), /Otvara tek u 08:00/);
});

test("dijeljeni link: readShared čita ispravan link, a loš ignoriše", () => {
  const L = require("../lib/blizu-lib.js");
  const ok = "#p=" + L.b64e(JSON.stringify({ v: 1, a: ["A", 42, 18], b: ["B", 43, 19], m: "car", e: 20, t: "09:00", d: "", s: [] }));
  let ctx = makeCtx(ok); new vm.Script(main).runInContext(ctx, { timeout: 4000 });
  assert.equal(vm.runInContext("readShared()&&readShared().B.name", ctx), "B");
  ctx = makeCtx("#p=@@@"); new vm.Script(main).runInContext(ctx, { timeout: 4000 });
  assert.equal(vm.runInContext("readShared()", ctx), null);
});

test("nijedan <script> u index.html nema sintaksnu grešku", () => {
  for (const s of scripts) assert.doesNotThrow(() => new vm.Script(s));
});

/* ---------- Plan B u aplikaciji ---------- */
function withUi(ctx, d0) {
  let modalHtml = "";
  const mdl = { firstElementChild: { set innerHTML(v) { modalHtml = v; } }, set hidden(v) {}, set onclick(v) {} };
  ctx.document = { querySelector: (s) => (s === "#d0" ? { value: d0 } : s === "#mdl" ? mdl : stub()), createElement: () => stub(), body: stub(), documentElement: stub(), addEventListener() {}, querySelectorAll: () => [] };
  return () => modalHtml;
}
const S1 = (over) => ({ id: "n1", t: { name: "Plaža", opening_hours: "Mo-Su 08:00-22:00" }, c: "pri", p: [42.4, 18.7], v: 40, est: 5, d: 0.2, f: 0.5, ...over });

test("warn: zalazak sunca za stanicu na otvorenom + dugme Plan B", () => {
  const ctx = makeCtx(); new vm.Script(main).runInContext(ctx, { timeout: 4000 }); withUi(ctx, "2026-06-21");
  const out = vm.runInContext(`warn(${JSON.stringify(S1())},1290)`, ctx); // 21:30, poslije zalaska
  assert.match(out, /Dolazak nakon zalaska sunca \(20:\d\d\)/);
  assert.match(out, /planB\('n1',1290\)/);
  const noWarn = vm.runInContext(`warn(${JSON.stringify(S1())},600)`, ctx);
  assert.equal(noWarn, ""); // 10:00: otvoreno, nema kiše, prije zalaska
});

test("warn: stanica u zatvorenom ne dobija upozorenje o zalasku sunca", () => {
  const ctx = makeCtx(); new vm.Script(main).runInContext(ctx, { timeout: 4000 }); withUi(ctx, "2026-06-21");
  assert.doesNotMatch(vm.runInContext(`warn(${JSON.stringify(S1({ c: "kul", t: { name: "Muzej" } }))},1290)`, ctx), /zalaska/);
});

test("planB: nudi otvorene zamjene i izostavlja izabrane", () => {
  const ctx = makeCtx(); new vm.Script(main).runInContext(ctx, { timeout: 4000 });
  const html = withUi(ctx, "2026-06-21");
  const closed = S1({ id: "n1", c: "hrana", t: { name: "Konoba", opening_hours: "Mo-Su 18:00-23:00" } });
  const good = S1({ id: "n2", c: "hrana", t: { name: "Pekara", opening_hours: "Mo-Su 06:00-20:00" }, est: 4 });
  const shut = S1({ id: "n3", c: "hrana", t: { name: "Zatvoreno", opening_hours: "Mo-Su 18:00-23:00" } });
  vm.runInContext(`S.st=[${JSON.stringify(closed)}];opts=[${[closed, good, shut].map((x) => JSON.stringify(x)).join(",")}];cm=new Map(opts.map(o=>[o.id,o]));sel=new Set(["n1"])`, ctx);
  vm.runInContext(`planB("n1",600)`, ctx);
  const out = html();
  assert.match(out, /Plan B: Konoba/);
  assert.match(out, /Pekara/);
  assert.doesNotMatch(out, /Zatvoreno<\/b>/);
  assert.match(out, /swapStop\('n1','n2'\)/);
  assert.match(out, /Otvoreno u to vrijeme/);
});

test("planB: bez zamjena prikazuje poruku", () => {
  const ctx = makeCtx(); new vm.Script(main).runInContext(ctx, { timeout: 4000 });
  const html = withUi(ctx, "2026-06-21");
  const only = S1({ id: "n1", c: "hrana", t: { name: "Konoba", opening_hours: "Mo-Su 18:00-23:00" } });
  vm.runInContext(`S.st=[${JSON.stringify(only)}];opts=[${JSON.stringify(only)}];cm=new Map(opts.map(o=>[o.id,o]));sel=new Set(["n1"]);planB("n1",600)`, ctx);
  assert.match(html(), /Nema boljih zamjena u blizini/);
});
