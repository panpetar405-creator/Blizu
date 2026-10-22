# Mestigo — održavanje

## Struktura
| Šta | Gdje |
|---|---|
| Aplikacija (UI, planer, mapa) | `index.html` |
| Čista logika (radno vrijeme, formatiranje, dijeljeni link, izvoz/uvoz, upute za skretanje) | `lib/blizu-lib.js` |
| Prevod (SR/EN/DE/RU) | `i18n.js` |
| Servis-worker (offline, keš) | `sw.js` — ime keša postavlja `tools/stamp-sw.mjs` |
| API (Cloudflare Worker) | `worker.js` (lijepi se u Cloudflare; ne objavljuje se na GitHub Pages) |
| Alati za podatke i SEO | `tools/build-grid.py`, `tools/build-seo.mjs` |
| CI | `.github/workflows/` (`places.yml`, `seo.yml`, `test.yml`, `stamp-sw.yml`) |
| Testovi | `test/*.test.js` |

## Svakodnevno
- **Testovi:** `node --test` (Node 20+, bez ikakvih paketa). CI ih pokreće na svaki push i pull request.
- **Novi tekst u interfejsu:** dodaj ga u `index.html` na srpskom, pa u `i18n.js` (`a("srpski","English","Deutsch","Русский")`). Test „svi statični tekstovi…” pada ako zaboraviš statični tekst.
- **Nova logika:** ako ne treba DOM, stavi je u `lib/blizu-lib.js` i napiši test.
- **Nova verzija aplikacije:** samo napravi commit. `stamp-sw.yml` sam podiže ime keša kad se promijeni fajl ljuske. Ručno: `node tools/stamp-sw.mjs`.
- Ako dodaš novi fajl koji aplikacija učitava, dodaj ga u `SHELL` listu u `sw.js`.

## Čišćenje repozitorijuma (jednom)
U korijenu postoje stare kopije fajlova koji žive na drugom mjestu. CI koristi `tools/` i `.github/workflows/`, pa su ove kopije samo izvor zabune:

```
git rm build-grid.py places.yml icon.svg icons.gitkeep
```

- `build-grid.py` i `places.yml` u korijenu su **starije** verzije (nemaju oznake `diet:*`, `wheelchair`, `dog`… ni filtriranje svih država).
- `icon.svg` je isti fajl kao `img/icon.svg` (`sw.js` sada koristi `img/icon.svg`).
- `icons.gitkeep` je prazan.
- **`build-seo.mjs` u korijenu** razlikuje se od `tools/build-seo.mjs` samo u CSS paleti (`#082b36`, narandžasta `#f26b3a`, `#ffc83d`, što odgovara `manifest.json`) i u `theme-color`. Ako ti se nova paleta sviđa, prekopiraj korijenski fajl preko `tools/build-seo.mjs` i pokreni `seo.yml` ručno; u suprotnom ga samo obriši: `git rm build-seo.mjs`.
