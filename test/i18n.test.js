const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const I = require("../i18n.js");
const T = (lang, s) => { I.set(lang); return I.T(s); };

test("množina: engleski/njemački/ruski", () => {
  assert.equal(T("en", "1 stanica"), "1 stop");
  assert.equal(T("en", "5 stanica"), "5 stops");
  assert.equal(T("de", "1 stanica"), "1 Stopp");
  assert.equal(T("ru", "1 stanica"), "1 остановка");
  assert.equal(T("ru", "2 stanica"), "2 остановки");
  assert.equal(T("ru", "5 stanica"), "5 остановок");
  assert.equal(T("ru", "11 stanica"), "11 остановок");
  assert.equal(T("ru", "21 stanica"), "21 остановка");
  assert.equal(T("ru", "3 dan(a)"), "3 дня");
});

test("rečenice s brojevima, jedinicama i razdvajanjem po ' · '", () => {
  assert.equal(T("en", "Auto · 120 km · 5 stanica · ukupno 3h 20min"), "Car · 120 km · 5 stops · total 3h 20min");
  assert.equal(T("ru", "Auto · 120 km · 5 stanica · ukupno 3h 20min"), "Авто · 120 км · 5 остановок · всего 3 ч 20 мин");
  assert.equal(T("ru", "za 300 m"), "через 300 м");
  assert.equal(T("en", "Skrenite lijevo – Ulica Mira"), "Turn left – Ulica Mira");
  assert.equal(T("de", "U kružnom toku izađite na 2. izlazu"), "Nimm im Kreisverkehr die 2. Ausfahrt");
  assert.equal(T("en", "Kiša do 60% oko 14:00. Za kišu su bolje stanice u zatvorenom."), "Chance of rain up to 60% around 14:00. Indoor stops are better for rain.");
});

test("razmaci se čuvaju, nepoznat tekst i srpski ostaju netaknuti", () => {
  assert.equal(T("en", "  Nastavi  "), "  Continue  ");
  assert.equal(T("en", "Kafić Čaršija"), "Kafić Čaršija");
  assert.equal(T("sr", "Nastavi"), "Nastavi");
  assert.equal(T("en", ""), "");
});

test("svaki rječnički unos ima sva tri prevoda", () => {
  const D = I._dict;
  assert.ok(Object.keys(D).length > 200);
  for (const [k, v] of Object.entries(D)) {
    assert.equal(v.length, 3, k);
    for (const x of v) assert.ok(typeof x == "string" && x.trim().length, "prazan prevod za: " + k);
  }
});

test("svi statični tekstovi iz index.html su prevedeni (regresija pri dodavanju novog teksta)", () => {
  let html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  html = html.slice(html.indexOf("<body")).replace(/<svg width="0"[\s\S]*?<\/svg>/, "").replace(/<script[\s\S]*?<\/script>/g, "");
  const texts = [...html.matchAll(/>([^<>{}]*[A-Za-zČĆŽŠĐčćžšđ][^<>{}]*)</g)].map((m) => m[1].trim()).filter(Boolean);
  const attrs = [...html.matchAll(/(?:placeholder|aria-label|title|alt)="([^"]+)"/g)].map((m) => m[1]);
  const same = new Set(["Blizu", "km/h", "Profil"]); // isto u nekom jeziku
  const miss = [];
  for (const lang of ["en", "de", "ru"]) for (const x of new Set([...texts, ...attrs])) {
    if (same.has(x)) continue;
    if (T(lang, x) === x) miss.push(lang + ": " + x);
  }
  assert.deepEqual(miss, []);
});
