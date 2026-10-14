// RUČNO BIRANA MJESTA (opciono) — daju planu konkretnost (opis, savjet, najbolje doba) i veći prioritet.
// Aplikacija radi na bilo kojoj lokaciji i bez ove liste; ovdje dodaješ samo gradove koje poznaješ.
// Svaki unos MORA imati geografsku odrednicu, da se ne poklopi s istoimenim mjestom u drugom gradu:
//   near: [lat, lng, km] + match (regex nad nazivom, bez kvačica, malim slovima)  ILI  lat/lng (tačno mjesto, do ~120 m).
// Polja note, tip, best i mins su opciona.
//   note: jedna rečenica zašto se isplati   tip: praktičan savjet
//   best: najbolje doba (npr. "ujutro")     mins: koliko vremena planirati
// OVO SU POČETNI NACRTI — provjeri i ispravi tekst prije objave.
window.BLIZU_CURATED = [
  { near: [42.4247, 18.7712, 4], match: "san giovanni|sv\\.? ?ivan|tvrdjava kotor|kotor fortress", mins: 90, best: "ujutro, prije vrućine",
    note: "Uspon iznad Starog grada i najbolji pogled na Bokokotorski zaliv.", tip: "Ponesi vodu i udobnu obuću." },
  { near: [42.4247, 18.7712, 4], match: "tripun|tryphon", mins: 30,
    note: "Romanička katedrala iz 12. vijeka u srcu Starog grada Kotora." },
  { near: [42.4247, 18.7712, 4], match: "pomorski muzej|maritime museum", mins: 60,
    note: "Priča o pomorskoj tradiciji Boke Kotorske." },
  { near: [42.4870, 18.6980, 6], match: "skrpjel|škrpjel|our lady of the rocks", mins: 45,
    note: "Vještačko ostrvo s crkvom, do kojeg se stiže čamcem iz Perasta." },
  { near: [42.2864, 18.8400, 4], match: "citadela|citadel", mins: 40,
    note: "Utvrda u starom gradu Budve s pogledom na more." },
  { near: [42.2864, 18.8400, 4], match: "mogren", mins: 90, best: "prijepodne",
    note: "Plaže ispod starog grada Budve, do kojih vodi staza uz more." },
  { near: [42.4531, 18.5375, 5], match: "spanjola|španjola", mins: 60,
    note: "Tvrđava iznad Herceg Novog s pogledom na zaliv." },
  { near: [42.4531, 18.5375, 5], match: "kanli kula", mins: 45,
    note: "Tvrđava u Herceg Novom s ljetnjom pozornicom." },
  { near: [42.4364, 18.6961, 4], match: "porto montenegro", mins: 60, best: "predvečerje",
    note: "Marina u Tivtu sa šetnjom, kafićima i restoranima." }
];
