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
