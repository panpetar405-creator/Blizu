// RUČNO BIRANA MJESTA — daju planu konkretnost (opis, savjet, najbolje doba) i veći prioritet.
// Svako mjesto se prepoznaje po nazivu iz OpenStreetMapa (match = regex, bez kvačica i malim slovima)
// i/ili po koordinatama (lat/lng, do ~120 m). Polja osim "match" ili "lat/lng" su opciona.
//   note: jedna rečenica zašto se isplati   tip: praktičan savjet
//   best: najbolje doba (npr. "ujutro")     mins: koliko vremena planirati
// OVO SU POČETNI NACRTI — provjeri i ispravi tekst prije objave.
window.BLIZU_CURATED = [
  { match: "san giovanni|sv\\.? ?ivan|tvrdjava kotor|kotor fortress", mins: 90, best: "ujutro, prije vrućine",
    note: "Uspon iznad Starog grada i najbolji pogled na Bokokotorski zaliv.", tip: "Ponesi vodu i udobnu obuću." },
  { match: "tripun|tryphon", mins: 30,
    note: "Romanička katedrala iz 12. vijeka u srcu Starog grada Kotora." },
  { match: "pomorski muzej|maritime museum", mins: 60,
    note: "Priča o pomorskoj tradiciji Boke Kotorske." },
  { match: "skrpjel|škrpjel|our lady of the rocks", mins: 45,
    note: "Vještačko ostrvo s crkvom, do kojeg se stiže čamcem iz Perasta." },
  { match: "citadela|citadel", mins: 40,
    note: "Utvrda u starom gradu Budve s pogledom na more." },
  { match: "mogren", mins: 90, best: "prijepodne",
    note: "Plaže ispod starog grada Budve, do kojih vodi staza uz more." },
  { match: "spanjola|španjola", mins: 60,
    note: "Tvrđava iznad Herceg Novog s pogledom na zaliv." },
  { match: "kanli kula", mins: 45,
    note: "Tvrđava u Herceg Novom s ljetnjom pozornicom." },
  { match: "porto montenegro", mins: 60, best: "predvečerje",
    note: "Marina u Tivtu sa šetnjom, kafićima i restoranima." }
];
