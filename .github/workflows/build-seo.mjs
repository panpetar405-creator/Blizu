#!/usr/bin/env node
/**
 * Blizu — generator SEO stranica (faza 1): gradovi + situacije.
 *
 * Upotreba (iz korijena repozitorijuma, Node 18+):
 *   node tools/build-seo.mjs              # koristi keš ako postoji, inače povlači podatke sa Overpass-a
 *   node tools/build-seo.mjs --refresh    # ponovo povuci podatke
 *   node tools/build-seo.mjs --out ./docs # izlazni folder (podrazumijevano: korijen repozitorijuma)
 *
 * Izlaz:  grad/index.html, grad/<grad>/index.html, grad/<grad>/{sta-raditi-2-sata,jedan-dan,uvece}/index.html
 *         i osvježen sitemap.xml
 *
 * Izvor podataka: OpenStreetMap (© doprinosioci, ODbL) + tvoj curated.js. Google Places podaci se NE koriste.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const OUT = path.resolve(arg('--out', ROOT));
const CACHE = path.resolve(arg('--cache', path.join(ROOT, 'tools', 'cache')));
const REFRESH = !!arg('--refresh', false);

/* ===== PODEŠAVANJE ===== */
const BASE = 'https://panpetar405-creator.github.io/Blizu/';   // promijeni ako se adresa promijeni
const MIN_PLACES = 8;                                           // grad s manje mjesta ne dobija stranice
const TODAY = new Date().toISOString().slice(0, 10);

/* Uvodni tekstovi su pisani ručno — PROVJERI I PRILAGODI prije objave. */
const CITIES = [
  { slug: 'kotor', name: 'Kotor', loc: 'Kotoru', lat: 42.4247, lng: 18.7712, r: 3500,
    intro: 'Kotor je grad ispod brda Lovćen na samom kraju Bokokotorskog zaliva. Stari grad pod zaštitom UNESCO-a je prepun uskih ulica, trgova i crkava, a uspon do tvrđave Sv. Ivan nagrađuje pogledom na cijeli zaliv.' },
  { slug: 'budva', name: 'Budva', loc: 'Budvi', lat: 42.2864, lng: 18.8400, r: 3500,
    intro: 'Budva je jedan od najstarijih gradova na Jadranu. Stari grad na malom poluostrvu, šetalište i plaže u gradu čine je lakom za planiranje dana, a uveče je poznata po izlascima i muzici.' },
  { slug: 'herceg-novi', name: 'Herceg Novi', loc: 'Herceg Novom', lat: 42.4531, lng: 18.5375, r: 4000,
    intro: 'Herceg Novi je grad stepenica, tvrđava i dugog šetališta uz more na ulazu u Bokokotorski zaliv. Idealan je za sporiji tempo: šetnja obalom, kafa s pogledom i posjeta Starom gradu.' },
];

const SITUATIONS = [
  { slug: 'sta-raditi-2-sata', title: (c) => `Šta raditi u ${c.loc} za 2 sata`, h1: (c) => `Šta raditi u ${c.loc} za 2 sata`,
    lead: (c) => `Imaš samo par sati u ${c.loc}? Ovo je brz plan koji spaja kafu, šetnju i jednu posjetu — sve na pješačkoj udaljenosti.`,
    build: planTwoHours },
  { slug: 'jedan-dan', title: (c) => `Jedan dan u ${c.loc}: plan od jutra do večeri`, h1: (c) => `Jedan dan u ${c.loc}`,
    lead: (c) => `Plan za cio dan u ${c.loc}: jutarnja kafa, šetnja, posjeta, ručak, popodnevni pogled, večera i večernji izlazak.`,
    build: planFullDay },
  { slug: 'uvece', title: (c) => `Šta raditi uveče u ${c.loc}: večera, piće, izlazak`, h1: (c) => `Večeras u ${c.loc}`,
    lead: (c) => `Večera, piće i mjesto za kraj večeri u ${c.loc} — rasporedi su blizu jedan drugog da ne gubiš vrijeme na put.`,
    build: planEvening },
];

const CATS = {
  hrana: 'Restorani', kafa: 'Kafići i slastičarne', bar: 'Barovi i izlasci',
  atrakcije: 'Znamenitosti', kultura: 'Muzeji i kultura', more: 'Plaže i more', priroda: 'Parkovi i vidikovci',
};

/* ===== POMOĆNE ===== */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nz = (t) => (t || '').toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const km = (a, b) => { const r = Math.PI / 180, dl = (b[0] - a[0]) * r, dg = (b[1] - a[1]) * r, x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dg / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const walkMin = (a, b) => Math.max(1, Math.round(km(a, b) * 1.3 * 12));          // ~5 km/h uz faktor krivudanja
const BAD = /mesar|mesnic|butcher|pekar|bakery|market|prodavnic|kiosk|trafik|apotek|automat|bife|zalogaj|take\s*away/;
const HM = (m) => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const mapsUrl = (p) => `https://www.openstreetmap.org/?mlat=${p.c[0].toFixed(5)}&mlon=${p.c[1].toFixed(5)}#map=18/${p.c[0].toFixed(5)}/${p.c[1].toFixed(5)}`;
const write = (rel, html) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); };

/* ===== PODACI ===== */
const OVP = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const QS = 'nwr@[amenity~"^(restaurant|cafe|bar|pub|ice_cream|theatre|cinema|arts_centre|nightclub)$"][name];nwr@[tourism~"^(attraction|viewpoint|museum|gallery)$"][name];nwr@[historic~"^(castle|fort|monument|ruins|archaeological_site|memorial)$"][name];nwr@[natural=beach];nwr@[leisure~"^(beach_resort|park|marina)$"][name];';

async function fetchOverpass(c) {
  const A = `(around:${c.r},${c.lat},${c.lng})`;
  const q = `[out:json][timeout:60];(${QS.replace(/@/g, A)});out center tags 800;`;
  const tryOne = (u) => fetch(u, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'BlizuSEO/1.0 (+https://github.com/panpetar405-creator/Blizu)' }, signal: AbortSignal.timeout(75000) })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${new URL(u).host}: HTTP ${r.status}`)))).then((j) => (j.elements?.length ? j.elements : Promise.reject(new Error(`${new URL(u).host}: prazan odgovor`))))
    .catch((e) => Promise.reject(e.name === 'TimeoutError' ? new Error(`${new URL(u).host}: istekao rok`) : e));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await Promise.any(OVP.map(tryOne)); }
    catch (e) {
      console.warn(`  pokušaj ${attempt}/3 neuspješan:`, (e.errors || [e]).map((x) => x.message).join(' | '));
      if (attempt < 3) await new Promise((r) => setTimeout(r, 10000 * attempt));
    }
  }
  return null;
}
async function getElements(c) {
  const f = path.join(CACHE, c.slug + '.json');
  if (!REFRESH && fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log('  povlačim OSM podatke za', c.name, '…');
  const els = await fetchOverpass(c);
  if (els) { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(f, JSON.stringify(els)); }
  return els;
}

function loadCurated() {
  const f = path.join(ROOT, 'curated.js');
  if (!fs.existsSync(f)) return [];
  const w = {}; try { vm.runInNewContext(fs.readFileSync(f, 'utf8'), { window: w }); } catch { return []; }
  return Array.isArray(w.BLIZU_CURATED) ? w.BLIZU_CURATED : [];
}

function classify(t) {
  const { amenity: a, tourism: tr, historic: h, natural: n, leisure: l } = t;
  if (a === 'restaurant') return { cat: 'hrana', label: 'Restoran', ld: 'Restaurant' };
  if (a === 'cafe') return { cat: 'kafa', label: 'Kafić', ld: 'CafeOrCoffeeShop' };
  if (a === 'ice_cream') return { cat: 'kafa', label: 'Sladoled', ld: 'IceCreamShop' };
  if (a === 'bar' || a === 'pub') return { cat: 'bar', label: a === 'pub' ? 'Pub' : 'Bar', ld: 'BarOrPub' };
  if (a === 'nightclub') return { cat: 'bar', label: 'Noćni klub', ld: 'NightClub' };
  if (a === 'theatre') return { cat: 'kultura', label: 'Pozorište', ld: 'PerformingArtsTheater', evening: true };
  if (a === 'cinema') return { cat: 'kultura', label: 'Bioskop', ld: 'MovieTheater', evening: true };
  if (a === 'arts_centre') return { cat: 'kultura', label: 'Kulturni centar', ld: 'Place', evening: true };
  if (tr === 'museum') return { cat: 'kultura', label: 'Muzej', ld: 'Museum' };
  if (tr === 'gallery') return { cat: 'kultura', label: 'Galerija', ld: 'ArtGallery' };
  if (tr === 'viewpoint') return { cat: 'priroda', label: 'Vidikovac', ld: 'TouristAttraction' };
  if (h === 'castle' || h === 'fort') return { cat: 'atrakcije', label: 'Tvrđava', ld: 'TouristAttraction' };
  if (h === 'ruins' || h === 'archaeological_site') return { cat: 'atrakcije', label: 'Arheološki lokalitet', ld: 'TouristAttraction' };
  if (h === 'monument' || h === 'memorial') return { cat: 'atrakcije', label: 'Spomenik', ld: 'TouristAttraction', minor: true };
  if (tr === 'attraction') return { cat: 'atrakcije', label: 'Znamenitost', ld: 'TouristAttraction' };
  if (n === 'beach' || l === 'beach_resort') return { cat: 'more', label: 'Plaža', ld: 'Beach' };
  if (l === 'marina') return { cat: 'more', label: 'Marina', ld: 'Place' };
  if (l === 'park') return { cat: 'priroda', label: 'Park', ld: 'Park' };
  return null;
}

function buildPlaces(els, city, curated) {
  const center = [city.lat, city.lng], seen = new Map(), out = [];
  for (const e of els) {
    const t = e.tags || {}, c = e.type === 'node' ? [e.lat, e.lon] : e.center ? [e.center.lat, e.center.lon] : null;
    const name = (t['name:sr-Latn'] || t['name:sr'] || t.name || '').trim();
    if (!c || !name || name.length < 3 || BAD.test(nz(name))) continue;
    const k = classify(t); if (!k) continue;
    const d = km(center, c); if (d > city.r / 1000 + 0.3) continue;
    const key = nz(name) + '|' + k.cat; const prev = seen.get(key);
    if (prev && km(prev.c, c) < 0.15) continue;                                  // dupli unosi iz OSM-a
    const p = { name, c, d, ...k, tags: t, website: t.website || t['contact:website'] || '', note: '', tip: '', best: '', mins: 0 };
    const cur = curated.find((x) => x.lat != null ? km([x.lat, x.lng], c) <= 0.12
      : x.near && km([x.near[0], x.near[1]], c) <= x.near[2] && x.match && new RegExp(x.match).test(nz(name)));
    if (cur) Object.assign(p, { note: cur.note || '', tip: cur.tip || '', best: cur.best || '', mins: cur.mins || 0, curated: true });
    p.score = (t.wikidata || t.wikipedia ? 3 : 0) + (p.website ? 1 : 0) + (t.opening_hours ? 0.5 : 0) + (t.tourism === 'attraction' ? 1 : 0)
      + (p.curated ? 4 : 0) + (k.minor ? -2 : 0) - d * 0.35;
    seen.set(key, p); out.push(p);
  }
  return out.sort((a, b) => b.score - a.score);
}

/* ===== PLANOVI (isti princip kao u aplikaciji: kafa → šetnja → posjeta → ručak → ... ) ===== */
const pick = (pool, used, prev, pref = () => 0) => {
  const cost = (p) => (prev ? km(prev.c, p.c) : p.d) - pref(p) - p.score * 0.05;
  return pool.filter((p) => !used.has(p)).sort((a, b) => cost(a) - cost(b))[0] || null;
};
function sequence(places, steps, start) {
  const used = new Set(), plan = []; let prev = null, clock = start;
  for (const s of steps) {
    const t = Math.max(clock, s.min || 0);
    const p = pick(places.filter(s.f), used, prev, s.pref);
    if (!p) continue;
    used.add(p);
    const walk = prev ? walkMin(prev.c, p.c) : 0;
    plan.push({ time: HM(t + walk), label: s.label, mins: s.m, walk, p });
    prev = p; clock = t + walk + s.m + 10;
  }
  return plan;
}
const F = {
  cafe: (p) => p.label === 'Kafić', meal: (p) => p.cat === 'hrana', bar: (p) => p.cat === 'bar',
  walk: (p) => ['more', 'priroda'].includes(p.cat), visit: (p) => ['atrakcije', 'kultura'].includes(p.cat) && !p.minor && !p.evening,
  event: (p) => p.evening, sweet: (p) => p.label === 'Sladoled',
};
function planTwoHours(places) { return sequence(places, [
  { f: F.cafe, m: 30, label: 'Kafa za početak' }, { f: F.visit, m: 50, label: 'Posjeta' }, { f: F.walk, m: 40, label: 'Šetnja i pogled', pref: (p) => (p.label === 'Vidikovac' ? 0.4 : 0) }], 600); }
function planFullDay(places) { return sequence(places, [
  { f: F.cafe, m: 30, label: 'Jutarnja kafa' }, { f: F.walk, m: 60, label: 'Šetnja' }, { f: F.visit, m: 90, label: 'Posjeta' },
  { f: F.meal, m: 75, label: 'Ručak', min: 750 }, { f: F.walk, m: 60, label: 'Popodnevni pogled', pref: (p) => (['Vidikovac', 'Marina', 'Plaža'].includes(p.label) ? 0.5 : 0) },
  { f: F.meal, m: 90, label: 'Večera', min: 1140 }, { f: (p) => F.event(p) || F.bar(p), m: 90, label: 'Večernji izlazak', min: 1260 }], 540); }
function planEvening(places) { return sequence(places, [
  { f: F.walk, m: 45, label: 'Zalazak sunca', pref: (p) => (['Vidikovac', 'Plaža', 'Marina'].includes(p.label) ? 0.5 : 0) },
  { f: F.meal, m: 90, label: 'Večera', min: 1110 }, { f: (p) => F.event(p) || F.bar(p), m: 90, label: 'Piće ili program', min: 1230 }], 1050); }

/* ===== HTML ===== */
const CSS = `:root{--navy:#062b3a;--teal:#12647a;--yellow:#ffc400;--cream:#f7f5f2;--ink:#13212a;--muted:#5f6e77}*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--cream)}
header{background:var(--navy);color:#fff;padding:14px 18px}header a{color:#fff;text-decoration:none;font-weight:800;font-size:20px}header span{color:var(--yellow)}
main{max-width:760px;margin:0 auto;padding:18px}nav.bc{font-size:13px;color:var(--muted);margin-bottom:10px}nav.bc a{color:var(--teal)}h1{font-size:30px;line-height:1.15;margin:6px 0 10px;color:var(--navy)}h2{font-size:22px;margin:28px 0 10px;color:var(--navy)}
.lead{font-size:18px;color:#2b3a43}.cta{display:inline-block;background:var(--yellow);color:#111;font-weight:800;padding:13px 22px;border-radius:999px;text-decoration:none;margin:14px 0}
ol.plan{list-style:none;padding:0;margin:0}ol.plan li{background:#fff;border-radius:16px;padding:14px 16px;margin:0 0 10px;box-shadow:0 1px 4px #0001}ol.plan .t{font-weight:800;color:#b8860b}ol.plan .w{font-size:13px;color:var(--muted)}
ul.places{padding:0;list-style:none;margin:0}ul.places li{background:#fff;border-radius:14px;padding:11px 14px;margin:0 0 8px}ul.places small,.note{color:var(--muted)}.note{display:block;font-size:14px;margin-top:2px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.chips a{background:#fff;border:1.5px solid #dfe4e7;border-radius:999px;padding:7px 14px;text-decoration:none;color:var(--teal);font-weight:700;font-size:14px}
footer{max-width:760px;margin:30px auto;padding:0 18px 30px;font-size:13px;color:var(--muted)}a{color:var(--teal)}`;

function shell({ title, desc, url, body, ld }) {
  return `<!doctype html>
<html lang="sr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | Blizu</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}"><meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="website"><meta property="og:site_name" content="Blizu"><meta property="og:locale" content="sr_ME"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${BASE}img/og-image.jpg">
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#082a42"><link rel="icon" href="${BASE}icons/icon-round-192.png">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script><style>${CSS}</style></head>
<body><header><a href="${BASE}">Bli<span>zu</span></a></header><main>${body}</main>
<footer>Podaci o mjestima: © <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap doprinosioci</a>. Radno vrijeme i dostupnost mogu se razlikovati — provjeri prije polaska.</footer></body></html>`;
}
const crumbs = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x[0], item: x[1] })) });
const bcHtml = (items) => `<nav class="bc">${items.map((x, i) => (i < items.length - 1 ? `<a href="${x[1]}">${esc(x[0])}</a>` : esc(x[0]))).join(' › ')}</nav>`;
const itemList = (ps) => ({ '@type': 'ItemList', itemListElement: ps.map((p, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': p.ld, name: p.name, geo: { '@type': 'GeoCoordinates', latitude: +p.c[0].toFixed(5), longitude: +p.c[1].toFixed(5) } } })) });
const placeLi = (p) => `<li><strong>${esc(p.name)}</strong> <small>· ${esc(p.label)}${p.d < 1 ? ` · ${Math.round(p.d * 1000 / 10) * 10} m od centra` : ` · ${p.d.toFixed(1).replace('.', ',')} km od centra`}</small>${p.note ? `<span class="note">${esc(p.note)}</span>` : ''}${p.tip ? `<span class="note">Savjet: ${esc(p.tip)}</span>` : ''} <a href="${mapsUrl(p)}" rel="noopener">karta</a></li>`;

function cityPage(c, places) {
  const url = `${BASE}grad/${c.slug}/`, bc = [['Blizu', BASE], ['Gradovi', BASE + 'grad/'], [c.name, url]];
  const sections = Object.entries(CATS).map(([k, t]) => [k, t, places.filter((p) => p.cat === k).slice(0, 6)]).filter((s) => s[2].length >= 2);
  const body = `${bcHtml(bc)}<h1>Šta raditi u ${esc(c.loc)}</h1><p class="lead">${esc(c.intro)}</p>
<a class="cta" href="${BASE}">Napravi plan u aplikaciji Blizu</a>
<h2>Planovi za ${esc(c.name)}</h2><div class="chips">${SITUATIONS.map((s) => `<a href="${BASE}grad/${c.slug}/${s.slug}/">${esc(s.h1(c))}</a>`).join('')}</div>
${sections.map(([k, t, ps]) => `<h2>${t} u ${esc(c.loc)}</h2><ul class="places">${ps.map(placeLi).join('')}</ul>`).join('\n')}`;
  const all = sections.flatMap((s) => s[2]);
  return shell({ title: `Šta raditi u ${c.loc}: restorani, kafići, znamenitosti`, url,
    desc: `${c.name}: gdje na kafu, ručak i večeru, šta posjetiti i kako provesti dan. Gotovi planovi za 2 sata, jedan dan i večeras.`, body,
    ld: { '@context': 'https://schema.org', '@graph': [crumbs(bc), itemList(all.slice(0, 20))] } });
}
function situationPage(c, s, plan) {
  const url = `${BASE}grad/${c.slug}/${s.slug}/`, bc = [['Blizu', BASE], ['Gradovi', BASE + 'grad/'], [c.name, `${BASE}grad/${c.slug}/`], [s.h1(c), url]];
  const body = `${bcHtml(bc)}<h1>${esc(s.h1(c))}</h1><p class="lead">${esc(s.lead(c))}</p>
<ol class="plan">${plan.map((st) => `<li><span class="t">${st.time}</span> · <strong>${esc(st.label)}</strong> <span class="w">(oko ${st.mins} min${st.walk ? `, ${st.walk} min hoda od prethodne stanice` : ''})</span><br><strong>${esc(st.p.name)}</strong> <small>· ${esc(st.p.label)}</small>${st.p.note ? `<span class="note">${esc(st.p.note)}</span>` : ''}${st.p.tip ? `<span class="note">Savjet: ${esc(st.p.tip)}</span>` : ''} <a href="${mapsUrl(st.p)}" rel="noopener">karta</a></li>`).join('')}</ol>
<a class="cta" href="${BASE}">Prilagodi plan svom vremenu u Blizu</a>
<h2>Ostali planovi za ${esc(c.name)}</h2><div class="chips"><a href="${BASE}grad/${c.slug}/">Sve o ${esc(c.loc)}</a>${SITUATIONS.filter((x) => x !== s).map((x) => `<a href="${BASE}grad/${c.slug}/${x.slug}/">${esc(x.h1(c))}</a>`).join('')}</div>`;
  return shell({ title: s.title(c), url, desc: `${s.lead(c)} ${plan.length} stanice sa vremenima i pješačkim udaljenostima.`.slice(0, 300), body,
    ld: { '@context': 'https://schema.org', '@graph': [crumbs(bc), itemList(plan.map((x) => x.p))] } });
}
function hubPage(cities) {
  const url = BASE + 'grad/', bc = [['Blizu', BASE], ['Gradovi', url]];
  const body = `${bcHtml(bc)}<h1>Šta raditi u gradovima Crne Gore</h1><p class="lead">Izaberi grad i dobij gotove planove: kafa, šetnja, posjeta, ručak, večera i večernji izlazak.</p>
<ul class="places">${cities.map((c) => `<li><a href="${BASE}grad/${c.slug}/"><strong>${esc(c.name)}</strong></a> — ${SITUATIONS.map((s) => `<a href="${BASE}grad/${c.slug}/${s.slug}/">${esc(s.h1(c))}</a>`).join(' · ')}</li>`).join('')}</ul>`;
  return shell({ title: 'Šta raditi u gradovima Crne Gore', url, desc: 'Gotovi planovi za dan u Kotoru, Budvi i Herceg Novom: kafa, šetnja, posjete, ručak, večera i izlazak.', body,
    ld: { '@context': 'https://schema.org', '@graph': [crumbs(bc)] } });
}

/* ===== GLAVNI TOK ===== */
const curated = loadCurated(), built = [], urls = [BASE];
for (const c of CITIES) {
  console.log('•', c.name);
  const els = await getElements(c);
  if (!els) { console.warn('  preskačem (nema podataka)'); continue; }
  const places = buildPlaces(els, c, curated);
  if (places.length < MIN_PLACES) { console.warn(`  preskačem: samo ${places.length} mjesta (minimum ${MIN_PLACES})`); continue; }
  write(`grad/${c.slug}/index.html`, cityPage(c, places)); urls.push(`${BASE}grad/${c.slug}/`);
  for (const s of SITUATIONS) {
    const plan = s.build(places);
    if (plan.length < 3) { console.warn(`  ! ${s.slug}: premalo stanica (${plan.length}), preskačem`); continue; }
    write(`grad/${c.slug}/${s.slug}/index.html`, situationPage(c, s, plan)); urls.push(`${BASE}grad/${c.slug}/${s.slug}/`);
  }
  built.push(c); console.log(`  ${places.length} mjesta → stranice napravljene`);
}
if (built.length) { write('grad/index.html', hubPage(built)); urls.splice(1, 0, BASE + 'grad/'); }
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u, i) => ` <url><loc>${u}</loc><lastmod>${TODAY}</lastmod><changefreq>${i === 0 ? 'weekly' : 'monthly'}</changefreq><priority>${i === 0 ? '1.0' : u.split('/').length > 6 ? '0.6' : '0.8'}</priority></url>`).join('\n')}\n</urlset>\n`);
if (!built.length) { console.error('GREŠKA: nijedan grad nije napravljen (nema podataka sa Overpass-a). Pogledaj poruke iznad.'); process.exit(1); }
console.log(`Gotovo: ${urls.length} adresa u sitemap.xml (izlaz: ${OUT})`);
