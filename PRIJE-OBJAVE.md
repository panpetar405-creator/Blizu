# Mestigo — kontrolna lista prije objave (bez domena)

Označavaj `[x]` kako ideš. Sve što zavisi od domena je na kraju, u dijelu „Poslije kupovine domena".

## 1. Cloudflare Worker (blizu-api)

**Settings → Variables and Secrets**
- [ ] `GOOGLE_KEY` postavljen kao **secret** (Places API New)
- [ ] `REFRESH_TOKEN` postavljen kao **secret**, najmanje 32 nasumična znaka
- [ ] `PHOTO_SIGN_KEY` postavljen kao zaseban **secret** (druga dugačka nasumična tajna, ne isti kao `REFRESH_TOKEN`)
- [ ] `GOOGLE_DAILY_CAP` postavljen (npr. `1500`; svaki Google poziv upisuje jedan KV zapis, pa uračunaj kvotu upisa)
- [ ] `LIVE_BBOX` postavljen (npr. `41.5,18,43.7,20.6` za Crnu Goru i okolinu; redoslijed je jug,zapad,sjever,istok)
- [ ] `DEBUG` **nije** postavljen na `1` (u produkciji se ne smije vraćati tehničke poruke)
- [ ] Opciono: `ORS_KEY` (OpenRouteService) za pešačke rute, `GEOCODER_URL` za vlastiti geocoder

**Bindings**
- [ ] KV `PLACES` vezan (ID u `wrangler.jsonc` mora biti tvoj namespace)
- [ ] Rate limiting: dodaj binding `RL` (limit 90 / 60 s) i `RL_STRICT` (limit 30 / 60 s). Bez njih radi približan brojač u memoriji.

**Provjere nakon objave Workera**
- [ ] `https://blizu-api.panpetar405.workers.dev/api/health` vraća `{"ok":true}`
- [ ] `/api/places` iz preglednika na tuđem sajtu je odbijen (403), a iz aplikacije radi
- [ ] Zahtjev sa `lat=100` ili `lng=200` je odbijen; radijus ispod 250 m i iznad 25 km je ograničen
- [ ] Cron okidači rade: u Workers → Triggers su 4 rasporeda (tivat, kotor, budva, hn). Cron koristi unutrašnji `scheduled` handler, ne poziva `/api/refresh`.
- [ ] Ako `/api/refresh` pozivaš ručno ili iz spoljnog planera, mora ići ovako:
  `curl -X POST -H "Authorization: Bearer $REFRESH_TOKEN" "https://…workers.dev/api/refresh?city=kotor"`
- [ ] Workers → Logs: nema neočekivanih `refresh_denied`, `photo_bad_sig`, `google_cap_hit`

## 2. Google Cloud

- [ ] API ključ ograničen samo na **Places API (New)**
- [ ] Dnevne kvote postavljene
- [ ] Budget alert na 50% i 100% mjesečnog iznosa
- [ ] Naplata uključena samo na projektu koji koristiš za Mestigo
- [ ] Napomena: ograničenje po HTTP referreru ili IP adresi ne radi jer Worker nema stalnu IP adresu

## 3. Servisi za rute, pločice i pretragu

- [ ] MapTiler ključ u `config.js` postoji; kad stigne domen, ograniči ga na taj domen
- [ ] Odluka o servisu za rute (OpenRouteService, Valhalla ili vlastiti OSRM). Trenutno aplikacija zove `routing.openstreetmap.de` direktno, a to nije za produkciju.
- [ ] Odluka o geocoderu: `GEOCODER_URL` (vlastiti Photon ili plaćeni servis istog GeoJSON oblika)
- [ ] Baza mjesta pokriva Kotor, Budva, Herceg Novi (provjereno: `data/places` pokriva Crnu Goru)
- [ ] Nakon testa na telefonu: `window.BLIZU_PUBLIC_OVERPASS = false` u `config.js`

## 4. `config.js` — pravni podaci

- [ ] `BLIZU_OPERATOR` (ime i adresa ili firma)
- [ ] `BLIZU_CONTACT_MAIL`
- [ ] `BLIZU_REPORT_MAIL`
- [ ] `BLIZU_PARTNER_MAIL` (bez njega je dugme „Za lokalne partnere" onemogućeno)
- [ ] Partneri (`BLIZU_PARTNERS`): ili popuni ID-eve i `paid:true` samo tamo gdje je stvarno partnerski link, ili ostavi obične pretrage
- [ ] Otvori `privatnost.html` i `uslovi.html`: nigdje se ne vidi žuta oznaka „[upiši … u config.js]"

## 5. Pravno i tekstovi

- [ ] Pravnik pregledao `privatnost.html` i `uslovi.html` (Crna Gora i EU/GDPR; lokacija, spoljni servisi)
- [ ] Izvorni govornik pregledao njemački i ruski prevod (`#i18n-debug` u adresi ispisuje neprevedene tekstove u konzolu)
- [ ] Atribucija fotografija vidljiva (Wikimedia Commons), lokalne slike (`hero.jpg`, `og-image.jpg`, `img/babic.png`) imaju pravo korištenja

## 6. Ime i čišćenje

- [ ] Ime „Mestigo" provjereno: domen (.me/.com/.app), Instagram, app storeovi, brza pretraga žigova (Crna Gora, EUIPO)
- [ ] Obrisan `og-image.jpg` iz korijena repoa (koristi se `img/og-image.jpg`)
- [ ] Obrisane stare kopije iz korijena ako postoje u repou (`build-grid.py`, `places.yml`, `icon.svg`, `icons.gitkeep`, `build-seo.mjs`)
- [ ] `robots.txt`: ukloni redove za nepostojeće fajlove kad se mijenja putanja (to ide uz domen)

## 7. Test na telefonima (Android Chrome i iPhone Safari)

| Test | Očekivano |
|---|---|
| Prvi put pritisni „moja lokacija" | Pojavi se prozor s objašnjenjem, pa sistemsko pitanje |
| Odbij GPS | Aplikacija ostaje upotrebljiva, ručni izbor grada radi |
| Isključi internet usred planiranja | Razumljiva poruka, nema bijelog ekrana |
| Instaliraj na početni ekran, pa otvori bez interneta | Otvara se, sačuvani planovi su vidljivi |
| Plan sa 12+ stanica | Plan se računa; „Navigacija" daje dijelove „1 od N" |
| Dijeli link plana (WhatsApp, Viber) | Link se otvara na drugom telefonu i učitava isti plan |
| „Ispiši / sačuvaj PDF" | PDF ima naslov, satnicu, radno vrijeme |
| Praćenje uživo i zaključan ekran | Poruka da radi samo dok je ekran upaljen |
| Promijeni jezik (SR/EN/DE/RU) | Nema miješanja jezika na glavnim ekranima |
| Izvezi pa uvezi podatke | Planovi i favoriti se vrate |
| „Obriši podatke" | Briše samo Mestigo podatke |
| Mnogo brzih pretraga u minuti | Poruka „Previše zahtjeva u kratkom vremenu…" (greška 429) |
| Ruta preko Kamenari–Lepetane | Plan prikazuje obavještenje o trajektu |
| „Prijavi grešku" na mjestu | Otvori se e-mail s popunjenim podacima |

## 8. Poslije kupovine domena (ne sada)

- [ ] DNS, HTTPS, povezivanje sa GitHub Pages ili Cloudflare
- [ ] Zamjena `/Blizu/` i `panpetar405-creator.github.io` u: `index.html` (og:image), `grad/**` (canonical, og), `sitemap.xml`, `robots.txt`, `tools/build-seo.mjs` (`BASE`), `worker.js` (`ORIGINS`)
- [ ] `ALLOWED_ORIGINS` u Cloudflare-u, `BLIZU_API` u `config.js` (ako Worker dobije vlastiti domen)
- [ ] Ograniči MapTiler ključ na novi domen
- [ ] Nova Google Search Console verifikacija (fajl `googlec47870d81feb0a92.html` je za stari domen), prijava `sitemap.xml`
- [ ] Uptime monitor na `/api/health`
- [ ] Preimenovanje GitHub repoa u `Mestigo`
