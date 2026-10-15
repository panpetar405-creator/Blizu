# BLIZU — prva iteracija implementacije

## Izmene u ovoj verziji

1. **API refresh autentifikacija**
   - `GET /api/refresh` više ne prihvata `token` kroz URL query string.
   - Očekuje `Authorization: Bearer <REFRESH_TOKEN>`.
   - Razlog: izbegavanje curenja tajne kroz URL logove, istoriju i nadzorne sisteme.
   - Cron/automatizaciju koja poziva refresh potrebno je ažurirati da šalje zaglavlje.

2. **Validacija koordinata i radijusa**
   - API odbacuje geografski nemoguće latitude/longitude vrednosti.
   - Radijus se ograničava na 250–15.000 metara, sa podrazumevanom vrednošću 5.000 m.

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
