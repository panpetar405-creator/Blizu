// Adresa tvog Workera (opciono), npr. "https://blizu-api.TVOJE-IME.workers.dev"
// Ostavi prazno ako ne koristiš Worker (aplikacija tada zove OpenStreetMap direktno).
window.BLIZU_API = "https://blizu-api.panpetar405.workers.dev";
window.BLIZU_MAPTILER_KEY = uKgtbdNiVgKul2x94r9f
// Opciono: vlastite naslovne fotografije po nazivu mjesta (imaju prednost nad Wikipedijom).
// window.BLIZU_HERO = { "Beograd":"img/beograd.jpg", "Kotor":"img/kotor.jpg" };

// Opciono: vlastiti događaji za ekran "Događaji" (price: 0 ili izostavi = besplatno; img i lat/lng su opcioni).
// window.BLIZU_EVENTS = [
//   { title:"Festival vina Kotor", city:"Kotor", date:"2026-10-17", time:"18:00", place:"Stari grad", price:0, img:"img/festival.jpg", lat:42.4247, lng:18.7712 },
//   { title:"Koncert klasične muzike", city:"Kotor", date:"2026-10-18", time:"20:00", place:"Katedrala Svetog Tripuna", price:12 }
// ];

// Opciono: e-mail na koji stižu upiti lokalnih partnera (ekran "Za lokalne partnere").
window.BLIZU_PARTNER_MAIL = "";

// PRAVNI PODACI (prikazuju se na stranicama privatnost.html i uslovi.html) — OBAVEZNO popuniti prije javne objave.
window.BLIZU_OPERATOR = "";      // npr. "Ime Prezime, Kotor, Crna Gora" ili naziv firme i adresa
window.BLIZU_CONTACT_MAIL = "";  // kontakt za pitanja o privatnosti i podacima
window.BLIZU_REPORT_MAIL = "";   // e-mail za prijave grešaka o mjestima (ako je prazno, koristi se BLIZU_CONTACT_MAIL)

// Javni Overpass serveri se pozivaju direktno iz telefona korisnika samo kao rezerva izvan vlastite baze (data/places).
// Za produkciju postavi na false kad provjeriš da vlastita baza pokriva tvoje područje.
window.BLIZU_PUBLIC_OVERPASS = true;

// Opciono: vlastita slika za određeno mjesto. Ključ = naziv malim slovima, bez kvačica (Babić -> "babic").
window.BLIZU_IMG = { "babic": "img/babic.png" };

// ---------- PARTNERSKI LINKOVI (plan i detalji mjesta) ----------
// Svaki partner: base = adresa pretrage, q = naziv parametra za pretragu (stavlja se naziv grada/mjesta),
// params = dodatni parametri iz tvog partnerskog panela (prazne vrijednosti se preskaču).
// paid:true = link je partnerski (dobija rel="sponsored" i napomenu o proviziji; tek tada se pokazuju i linkovi uz pojedino mjesto).
// Bez ID-a partnera linkovi rade kao obična pretraga. Tačan oblik linka uzmi iz svog partnerskog panela.
window.BLIZU_PARTNERS = {
  smjestaj:  { n: "Smještaj",        base: "https://www.booking.com/searchresults.html", q: "ss",    params: { aid: "" }, paid: false },
  ulaznice:  { n: "Ulaznice i ture", base: "https://www.viator.com/searchResults/all",   q: "text",  params: { pid: "", mcid: "", medium: "link" }, paid: false },
  restorani: { n: "Restorani",       base: "https://www.google.com/maps/search/",        q: "query", params: { api: "1" }, paid: false }
};

// ---------- PROMOVISANA MJESTA (lokalni partneri) ----------
// Prikazuju se u zasebnom dijelu „Promovisano”, samo ako je mjesto najviše `reach` km (podrazumijevano 3, najviše 15) od rute.
// cat: hrana | vid | pri | kul | ist   until: "GGGG-MM-DD" (poslije tog datuma se ne prikazuje)   mins: trajanje posjete
// window.BLIZU_PROMO = [
//   { name: "Konoba Primjer", cat: "hrana", lat: 42.4247, lng: 18.7712, note: "Svježa riba i domaće vino.", phone: "+38267000000", url: "https://primjer.me", until: "2026-12-31", mins: 60, reach: 3 }
// ];
window.BLIZU_PROMO = [];
