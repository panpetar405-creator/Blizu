# BLIZU — prva iteracija implementacije

## Izmene u ovoj verziji

1. **API refresh autentifikacija**
   - `GET /api/refresh` više ne prihvata `token` kroz URL query string.
   - Očekuje `Authorization: Bearer <REFRESH_TOKEN>`.
   - Razlog: izbegavanje curenja tajne kroz URL logove, istoriju i nadzorne sisteme.
   - Cron/automatizaciju koja poziva refresh potrebno je ažurirati da šalje zaglavlje.

2. **Validacija koordinata i radijusa**
   - API odbacuje geografski nemoguće latitude/longitude vrednosti.
   - Radijus se ograničava na 250–25.000 metara (isto u Workeru i u aplikaciji), sa podrazumevanom vrednošću 5.000 m.

3. **Realističnija, ali i dalje okvirna procena hodanja**
   - Planer koristi faktor 1,35 u odnosu na vazdušnu udaljenost i prosečnu brzinu 4,2 km/h.
   - UI jasno upozorava da to nije navigaciona garancija.
   - Ovo nije zamena za routing servis; sledeći korak je stvarna pešačka mreža i provera pristupačnosti rute.

## Obavezno pre objave

- U Cloudflare Worker-u proveriti da je `REFRESH_TOKEN` postavljen kao secret.
- Ažurirati cron/administrativni poziv na `Authorization: Bearer ...`; ne stavljati token u URL.
- Proveriti da nijedna tajna nije uključena u javne fajlove.
- Testirati `/api/places` za validne koordinate, latitude izvan ±90, longitude izvan ±180 i različite radijuse.
- Testirati ručni izbor grada, GPS odbijanje, gubitak mreže, prazne rezultate, sačuvane planove i navigaciju.
- Proveriti stvarni `Origin` i CORS ponašanje na produkcionom domenu.

## Sledeći razvojni prioriteti

1. Pešački routing servis umesto procene iz vazdušne udaljenosti.
2. Vidljiva svežina podataka i pouzdanost radnog vremena.
3. Funkcija „Imam još X minuta” i Plan B za zatvaranje/loše vreme.
4. Testiranje sa stvarnim korisnicima i analitika koja poštuje privatnost.
5. Portal/urednički tok za lokalne partnere i proveru preporuka.

## Napomena

Izmene su urađene u izvornom kodu, ali produkciona ispravnost nije potvrđena bez pristupa Cloudflare okruženju, konfiguraciji tajni, stvarnom domenu i testovima na uređajima.


## Druga iteracija — prilagođavanje preostalog vremena i alternativni plan

Dodato u `index.html`:

- Kontrola „Koliko vremena ti je još ostalo?” sa izborom od 15 do 420 minuta.
- Dugme „Prilagodi plan” koje ponovo pokreće planer sa izabranim vremenskim budžetom.
- Dugme „Pronađi alternativu” koje pokušava da izabere druga mesta iz dostupnog skupa.
- „Vrati početno vreme” za povratak na trajanje izabranog u početnom koraku.
- Pristupačna oznaka kontrole i napomena da su vremena kretanja procene.

### Ograničenja koja ostaju

- Aplikacija i dalje koristi procenu vremena kretanja na osnovu koordinata za rangiranje. Prikaz navigacije otvara Google Maps pešačku rutu; ovo izdanje ne računa sopstvenu mrežnu pešačku rutu unutar aplikacije.
- Alternativni plan zavisi od količine i raznovrsnosti mesta u trenutnoj kategoriji i okolini. Ako nema dovoljno alternativa, neke stanice mogu ostati iste.
- Potrebno je testirati ponašanje u pregledaču na mobilnim uređajima i sa stvarnim skupom lokacija pre produkcionog objavljivanja.

## Treća iteracija — dijeljenje plana i ispis

- „Podijeli link plana”: plan se kodira u URL (`#p=…`), bez backenda. Koristi Web Share API, a ako ga nema, kopira link u clipboard.
- Otvaranje linka učitava plan (A, B, stanice, prevoz, vrijeme polaska) i ponovo računa rutu. Podaci iz linka se validiraju (raspon koordinata, format ID-a, tipovi, dužine), jer je link nepouzdan ulaz.
- „Ispiši / sačuvaj PDF”: `window.print()` s posebnim print stilom (naslov, satnica, radno vrijeme, linkovi na plan i Google Maps). PDF se dobija kroz „Sačuvaj kao PDF” u dijalogu za štampu.
- `sw.js`: verzija keša podignuta na `blizu-v10` da klijenti dobiju novi `index.html`.

### Treba testirati
- Dijeljenje i otvaranje linka na iOS Safari i Android Chrome, te na starom linku iz drugog uređaja.
- Ispis/PDF na mobilnom (print dijalog se razlikuje po pregledaču).
- Dužina linka kod 12 stanica (poruke/WhatsApp ponekad skraćuju vrlo duge linkove).

## Četvrta iteracija — radno vrijeme u planu i prognoza

- U satnici plana svaka stanica se provjerava prema OSM `opening_hours` za vrijeme dolaska: „Zatvoreno u to vrijeme” / „Otvara tek u HH:MM” / „Zatvara u HH:MM”. Parser podržava uobičajene oblike (`Mo-Fr 08:00-16:00; Sa 09:00-13:00`, `24/7`, `off`, više intervala, prelazak preko ponoći). Sve ostalo (praznici `PH`, mjeseci, sunce) se ne tumači i ne daje upozorenje.
- Prognoza: Open-Meteo (bez ključa) za polaznu tačku, temperatura i vjerovatnoća kiše u vremenskom prozoru plana. Stanice na otvorenom (vidikovci, priroda) dobijaju upozorenje pri kiši od 50% i više.
- `sw.js`: keš `blizu-v11`.

### Ograničenja
- Plan nema datum, pa se radno vrijeme i prognoza računaju za današnji dan. Pravi datum putovanja ide uz višednevne planove.
- Prognoza je samo za polaznu tačku, ne za svaku stanicu.
- Radno vrijeme iz OSM-a često nedostaje ili je zastarjelo, pa ostaje napomena „provjeri prije dolaska”.

## Peta iteracija — partnerski linkovi i promovisana mjesta

- **Ekran „Za lokalne partnere”** (Profil → dugme na dnu): kratki opis, forma (vrsta, naziv, grad, kontakt, poruka) i slanje preko `mailto:` na `BLIZU_PARTNER_MAIL` iz `config.js`. Ništa se ne šalje automatski. Dok e-mail nije podešen, dugme je onemogućeno.
- **Partnerski linkovi** (`BLIZU_PARTNERS` u `config.js`): blok „Još za <grad>” na ekranu plana (smještaj, ulaznice i ture, restorani). Za linkove označene sa `paid:true` dodaje se `rel="sponsored"` i napomena o proviziji, a uz mjesta tipa hrana/kultura/istorija pojavljuje se i link uz pojedino mjesto.
- **Promovisana mjesta** (`BLIZU_PROMO`): zaseban dio „Promovisano · lokalni partneri” na ekranu izbora, samo ako je mjesto blizu rute. Jasno označeno („Promovisano”) na kartici, u satnici i u detaljima. Ne mijenja redoslijed organskih preporuka. Mjesta imaju ID `p<broj>` i mogu se dodati u plan i podijeliti linkom.
- Spoljni URL-ovi iz konfiguracije prolaze provjeru (samo http/https). Link za dijeljenje prihvata ID-eve `p1`–`p999`.
- `sw.js`: keš `blizu-v12`.

### Prije objave
- Upiši `BLIZU_PARTNER_MAIL`, partnerske ID-eve i postavi `paid:true` samo za linkove koji to stvarno jesu.
- Provjeri uslove partnerskih programa (npr. obavezne oznake i dozvoljena mjesta za linkove).
- Ugovorom s lokalnim partnerima odredi cijenu, trajanje (`until`) i pravila označavanja.

## Šesta iteracija — pouzdanost podataka i servisa (tačka 1 audita)

- **Geokodiranje preko Workera** (`/api/geocode`, provjera Origin-a, KV keš 7 dana). Podrazumijevano Photon; za produkciju postavi `GEOCODER_URL` (vlastiti Photon ili plaćeni servis istog GeoJSON oblika). Pretraga po slovu više nikad ne ide direktno na javni Nominatim; on se koristi samo kao rezerva pri izričitom pokretanju plana.
- **Svježina podataka**: u izboru stanica piše datum osvježavanja baze mjesta; u detaljima mjesta piše koliko je staro radno vrijeme (OSM `check_date` / `survey:date`), uz upozorenje za podatke starije od 24 mjeseca ili bez datuma.
- **Atribucija fotografija**: uz sliku se navodi izvor (Wikimedia Commons s linkom na stranicu fajla gdje su autor i licenca).
- **`BLIZU_PUBLIC_OVERPASS`** (`config.js`): kad se postavi na `false`, telefoni korisnika ne gađaju javne Overpass servere. Za sada je `true` jer duge rute izvan vlastite baze zavise od toga.
- Worker sada zadržava i `website`, `check_date`, `survey:date` (isto kao `tools/build-grid.py`). `sw.js`: keš `blizu-v15`.

### Treba uraditi / testirati
- Postaviti `GEOCODER_URL` i provjeriti da Worker vraća rezultate za „Kotor", „Mostar", „Beograd".
- Provjeriti da `data/places/index.json` pokriva sve ciljane gradove, pa isključiti javni Overpass.
- Zamijeniti OSM pločice i `routing.openstreetmap.de` produkcionim servisom (MapTiler ključ već podržan preko `BLIZU_MAPTILER_KEY`; za rute ORS/Valhalla) — to je sljedeći korak ove tačke.

## Sedma iteracija — navigacija i usklađene vrijednosti (tačka 2 audita)

- **Navigacija**: glavno dugme na planu sada otvara Google Maps sa svim stanicama kao međutačkama (radi i uz zaključan ekran). Google dozvoljava najviše 9 međutačaka po ruti, pa se duži plan dijeli na dijelove („dio 1 od N”), gdje kraj jednog dijela postaje početak sljedećeg. Međutačke su ispravno URL-kodirane.
- **Praćenje uživo u aplikaciji** ostaje kao dodatna opcija uz jasnu napomenu da radi samo dok je ekran upaljen. Dodano je ponovno traženje „wake lock”-a kad se aplikacija vrati u prvi plan i poruka kad preglednik to ne podržava.
- **Usklađeno**: hodanje 4,2 km/h (kod je imao 4,5); gornji radijus 25 km i u dokumentaciji, Workeru (`MIN_R`/`MAX_R`) i aplikaciji (prije je klijent mogao tražiti i više od dozvoljenog).

### Treba testirati
- Plan s 12+ stanica: provjeriti da dijelovi 1/2 i 2/2 otvaraju ispravne rute u Google Maps na Androidu i iOS-u.
- „Praćenje uživo”: ponašanje pri zaključavanju ekrana na iOS Safari i Android Chrome.
- Ruta s „Pješice” i dugim vremenom (60 min): potvrditi da se i dalje dobijaju rezultati.

## Osma iteracija — pravno i povjerenje (tačka 3 audita)

- **`privatnost.html` i `uslovi.html`**: nove stranice (svijetla/tamna tema, rade i bez interneta preko keša). Tabela u politici privatnosti nabraja svaki vanjski servis koji aplikacija zaista poziva i šta mu šalje.
- **Pravni podaci** se unose u `config.js`: `BLIZU_OPERATOR`, `BLIZU_CONTACT_MAIL`, `BLIZU_REPORT_MAIL`. Dok su prazni, stranice prikazuju žutu napomenu „[upiši … u config.js]". **Ne objavljivati prije nego što se popune.**
- **Obavještenje o lokaciji**: prije prvog traženja lokacije (dugme za polazište, mapa, praćenje) prikazuje se prozor s objašnjenjem; odluka se pamti (`geo_ok`).
- **„Prijavi grešku”** na svakom mjestu: izbor razloga otvara e-mail s popunjenim podacima (ništa se ne šalje automatski) i nudi direktan link za ispravku na OpenStreetMap-u.
- **Brisanje podataka** sada briše i postavke, filtere, keš i pristanak, a ne samo planove i favorite. Briše samo ključeve Blizu (ne `localStorage.clear()`).
- Linkovi na politiku privatnosti i uslove su u Profilu. `sw.js`: keš `blizu-v17`.

### Napomene
- Tekstovi su polazna osnova, a ne pravni savjet. Prije lansiranja ih treba pregledati pravnik upoznat s propisima Crne Gore i EU.
- Aplikacija je na domenu `panpetar405-creator.github.io`. `localStorage` je vezan za domen, a ne za putanju, pa svaki drugi projekat na istom domenu vidi iste ključeve. Vlastiti domen to rješava.

## Deveta iteracija — jezici (tačka 4 audita)

- **`i18n.js`**: sloj za prevod (srpski izvorni tekst → engleski, njemački, ruski). Prevodi svaki tekst čim se pojavi na ekranu (MutationObserver), uključujući `placeholder`/`aria-label`, `alert`/`confirm`/`prompt`. Rječnik (`a(...)`) za cijele rečenice i pravila (`r(...)`) za tekstove s brojevima, množinom (ruska množina s tri oblika), uputama za skretanje i vremenskom prognozom. Nepoznat tekst ostaje na srpskom. Dodavanje jezika = dopuna rječnika.
- **Izbor jezika**: na početnom ekranu i u Profilu (SR / EN / DE / RU). Pamti se (`lang`); prvi put se bira prema jeziku preglednika (sr/hr/bs/me → srpski, de, ru, ostalo → engleski). Promjena jezika ponovo učitava stranicu.
- **Datumi** prate jezik (`I18N.loc()`); pretraga adresa (Photon/Nominatim) i Google podaci o mjestu (opis, radno vrijeme) traže se na izabranom jeziku (`hl` parametar u Workeru; keš ključevi uključuju jezik).
- Ruske jedinice (мин, км, ч) i ispravna množina („1 остановка / 2 остановки / 5 остановок”).
- E-mailovi za prijavu greške i partnerske upite ostaju na srpskom jer ih čita operater.
- Pregled neprevedenog: otvori aplikaciju s `#i18n-debug` u adresi; konzola ispisuje tekstove bez prevoda.

### Nije prevedeno (treba odlučiti)
- `privatnost.html`, `uslovi.html` i SEO stranice (`grad/*`) su samo na srpskom. Pravne tekstove treba prevoditi uz pravnu provjeru.
- Nazivi mjesta, opisi i vrste kuhinje dolaze iz OpenStreetMap-a i ostaju kakvi jesu.
- Prevod je pisao AI; prije objave neka ga pregleda izvorni govornik za njemački i ruski.

## Deseta iteracija — sigurnost API-ja (tačka 5 audita)

**Šta je u Workeru (`worker.js`)**
- **Provjera porijekla svuda**, i na `/api/places` (ranije otvoren svima). `ALLOWED_ORIGINS` (zarezom odvojeni `https://` izvori) dodaje domene bez izmjene koda, pa prelazak na vlastiti domen ne vraća 403.
- **Ograničenje broja zahtjeva po IP adresi** (po minuti): places 90, geocode 60, photo 90, walk 30, enrich 30, refresh 5. Odgovor je `429` sa `Retry-After`. Koristi Cloudflare *Rate Limiting* binding ako postoji (`RL` opšti, `RL_STRICT` za enrich/walk/refresh), a inače približan brojač u memoriji.
- **`/api/refresh` samo POST**, poređenje tajne bez curenja kroz vrijeme izvršavanja, i vlastito ograničenje od 5 pokušaja u minuti (zaštita od pogađanja). Poziv: `curl -X POST -H "Authorization: Bearer $REFRESH_TOKEN" "https://…workers.dev/api/refresh?city=kotor"`.
- **Potpisane fotografije**: `/api/enrich` vraća referencu fotografije s potpisom (HMAC), a `/api/photo` prima samo potpisane. Bez toga je ovo bio otvoren proxy za Google fotografije na tvoj račun. Provjera `Referer`-a sada poredi tačan izvor (prije je `startsWith` propuštao i `https://panpetar405-creator.github.io.evil.example`).
- **Dnevna gornja granica Google poziva** (`GOOGLE_DAILY_CAP`, opciono): zasebno za podatke o mjestu i za fotografije. Kad se dostigne, vraća se 503 umjesto računa. Svaki Google poziv upisuje jedan KV zapis, pa uračunaj kvotu upisa.
- **`LIVE_BBOX`** (opciono, `jug,zapad,sjever,istok`): uživo Overpass samo unutar tog pravougaonika (npr. `40,13,47,24` za zapadni Balkan). Zatvara mogućnost da neko istim zahtjevima puni KV nasumičnim lokacijama.
- Tehničke poruke grešaka se više ne šalju klijentu (osim uz `DEBUG=1`). Greške imaju `Cache-Control: no-store` i `X-Content-Type-Options: nosniff`.
- Strukturirani logovi (`rate_limited`, `refresh_denied`, `photo_bad_sig`, `google_cap_hit`, `enrich_failed`) vidljivi u *Workers → Logs* ili `wrangler tail`; nad njima se mogu postaviti Cloudflare obavještenja.
- **`/api/health`** za uptime monitor (npr. UptimeRobot), bez KV poziva.

**Šta ti podešavaš (Cloudflare i Google)**
1. *Rate Limiting*: dodaj binding tipa `ratelimit`, npr. u `wrangler.toml`: `[[ratelimits]] name = "RL" namespace_id = "1001" simple = { limit = 90, period = 60 }` i `[[ratelimits]] name = "RL_STRICT" namespace_id = "1002" simple = { limit = 30, period = 60 }`. Period može biti samo 10 ili 60 sekundi. Brojanje je po Cloudflare lokaciji i približno (dobro za odvraćanje zloupotrebe, ne za strogu kvotu). Ako Worker uređuješ samo u dashboardu, a opcija za binding ne postoji, radi ugrađeni brojač u memoriji.
2. *Settings → Variables*: po potrebi `ALLOWED_ORIGINS`, `GOOGLE_DAILY_CAP` (npr. `1500`), `LIVE_BBOX`. Za `PHOTO_SIGN_KEY` postavi zasebnu dugu tajnu (inače se koristi `REFRESH_TOKEN`). `REFRESH_TOKEN` neka ima bar 32 nasumična znaka.
3. **Google ključ** (Cloud Console): ograniči ga samo na *Places API (New)*; postavi dnevne kvote i *budget alert* (npr. na 50% i 100% mjesečnog iznosa). Ograničenje po HTTP referreru/IP adresi ne radi jer Worker nema stalnu IP adresu.
4. **Vlastiti domen za Worker** se jako preporučuje. Cache API (koji Worker koristi za keširanje fotografija) **ne radi na `*.workers.dev`**, pa se na workers.dev svaka fotografija ponovo traži od Googlea (naplaćuje se). Na vlastitom domenu keš radi bez izmjena koda. Zatim stavi novi domen u `BLIZU_API` i, ako se mijenja domen aplikacije, u `ALLOWED_ORIGINS`.
5. Ako se cijene ili kvote promijene, provjeri ih u Google Cloud dokumentaciji; ovdje ih nisam navodio.

**Poznata ograničenja**
- Provjera porijekla (`Origin`) spriječava druge sajtove u browseru, ali je ne-browser klijent može lažirati. Stvarna zaštita su ograničenje broja zahtjeva, potpisane fotografije i dnevna granica.
- Brojanje po IP adresi: korisnici iza istog mobilnog operatera dijele adresu, pa su granice namjerno velikodušne.
- Aplikacija na 429 pada na rezervne puteve (npr. direktan Overpass) ili prikazuje opštu grešku; poseban tekst za 429 još nije dodan.

## Jedanaesta iteracija — kvalitet koda (tačka 6 audita)

- **`lib/blizu-lib.js`**: čista logika izdvojena iz `index.html` (radno vrijeme `ohCheck`, `fmt`/`hhmm`/`fkm`/`dk`, upute `mtxt`, dijeljeni link `parseShared`, izvoz/uvoz). Ponašanje je isto, ali se sada može testirati u Node-u.
- **Testovi** (`node --test`, bez paketa; 34 testa): radno vrijeme, formatiranje, dijeljeni link (uključujući zlonamjerne), izvoz/uvoz, prevod (uključujući provjeru da su svi statični tekstovi prevedeni), Worker (porijeklo, ograničenja, refresh, potpisi, granice) i „dimni” test cijele skripte iz `index.html` uz lažni DOM. CI: `.github/workflows/test.yml`.
- **Automatski keš**: `tools/stamp-sw.mjs` postavlja ime keša na otisak sadržaja ljuske aplikacije; `stamp-sw.yml` ga sam upisuje pri svakoj izmjeni. Nema više ručnog „blizu-vN”. `sw.js` sada kešira `img/icon.svg` i `lib/blizu-lib.js`.
- **Izvoz/uvoz podataka** u Profilu (planovi, putovanja, favoriti kao JSON). Uvoz provjerava svako polje, odbacuje nepoznata i opasna (npr. `javascript:` adrese slika) i spaja s postojećim podacima.
- **`ODRZAVANJE.md`**: struktura projekta, kako se dodaje tekst/logika, i koje stare kopije u korijenu treba obrisati (`git rm …`).

### Nije urađeno
- Ostatak `index.html` (~95 KB) je i dalje jedna skripta s `onclick` atributima; dalje razdvajanje (planer, mapa, ekrani) traži testiranje u pravom pregledniku.
- Praćenje grešaka (npr. Sentry) nije dodato jer šalje podatke trećoj strani; ako ga želiš, treba ažurirati i politiku privatnosti.

## Dvanaesta iteracija — proizvod (tačka 7 audita)

- **Plan B**: uz svako upozorenje u planu (zatvoreno / uskoro zatvara, moguća kiša, zalazak sunca) pojavljuje se dugme „Plan B”. Otvara do 3 zamjene sa istog dijela puta: izostavlja već izabrane, zatvorene u trenutku dolaska, a pri kiši ili zalasku i sve na otvorenom. Rangira po blizini na putu, dodatnom vremenu i kategoriji; mjesta bez potvrđenog radnog vremena su dozvoljena, ali niže. Jedan dodir zamjenjuje stanicu i preračunava plan.
- **Zalazak sunca**: za stanice na otvorenom (vidikovci, priroda) plan upozorava na dolazak nakon zalaska ili zalazak usred posjete. Vrijeme se računa lokalno formulom (bez mreže), u srednjoevropskom vremenu s ljetnim računanjem, i to samo za Balkan i okolinu (geografska širina 34–50, dužina 12–30); izvan toga nema upozorenja jer nema pouzdane vremenske zone.
- **Trajekt**: ako ruta sadrži trajekt (OSRM korak `mode: "ferry"`), plan prikazuje obavještenje s trajanjem prelaza i napomenom da čekanje i red vožnje nisu uračunati.
- Sva logika je u `lib/blizu-lib.js` (`sunTimes`, `sunWarn`, `altFor`, `ferryInfo`) i pokrivena testovima, uključujući ponašanje u aplikaciji.

### Nije urađeno (i zašto)
- **Optimizacija redoslijeda**: stanice su već poređane po položaju duž puta, što je za koridor obično ispravno. Stvarno preslagivanje po radnom vremenu traži vremenske prozore i ima smisla tek uz podatke o radnom vremenu za većinu mjesta; sada ih OSM često nema.
- **Gužva u sezoni**: nema pouzdanog izvora podataka, pa se ne prikazuje procjena.
- **Trajekt Kamenari–Lepetane** nije posebno kodiran: prikazuje se samo ako ga javni servis za rute uključi u rutu. Provjeri na stvarnoj ruti da li ga uključuje, i da li je prelaz uračunat u vrijeme.
