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

test("poruka za grešku 429 je prevedena na sva tri jezika", () => {
  const s = "Previše zahtjeva u kratkom vremenu. Sačekaj minut-dva pa pokušaj ponovo.";
  for (const l of ["en", "de", "ru"]) assert.notEqual(T(l, s), s);
  assert.equal(T("sr", s), s);
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
  const same = new Set(["Mestigo", "km/h", "Profil"]); // isto u nekom jeziku
  const miss = [];
  for (const lang of ["en", "de", "ru"]) for (const x of new Set([...texts, ...attrs])) {
    if (same.has(x)) continue;
    if (T(lang, x) === x) miss.push(lang + ": " + x);
  }
  assert.deepEqual(miss, []);
});

test("Plan B, zalazak sunca i trajekt su prevedeni", () => {
  assert.equal(T("en", "Dolazak nakon zalaska sunca (20:25)"), "Arrival after sunset (20:25)");
  assert.equal(T("de", "Zalazak sunca u 20:25, prije kraja posjete"), "Sonnenuntergang um 20:25, vor Ende des Besuchs");
  assert.equal(T("ru", "Plan B: Konoba"), "План Б: Konoba");
  assert.match(T("en", "Ruta uključuje trajekt (oko 15 min prelaza). Čekanje i red vožnje nisu uračunati; provjeri prije polaska."), /ferry \(about 15 min crossing\)/);
  assert.equal(T("en", "8 min dodatno · Otvoreno u to vrijeme · U zatvorenom"), "8 min extra · Open at that time · Indoors");
  for (const lang of ["en", "de", "ru"]) for (const x of ["Zamijeni", "Plan B", "Mjesto je u to vrijeme zatvoreno ili uskoro zatvara. Evo otvorenih opcija na sličnom dijelu puta.", "Radno vrijeme nije potvrđeno"]) assert.notEqual(T(lang, x), x === "Plan B" && lang !== "ru" ? "!" : x, lang + ": " + x);
});
