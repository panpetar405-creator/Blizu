/* BLIZU — prevod interfejsa (SR izvorni tekst → EN / DE / RU)
 *
 * Kako radi: izvorni tekst u aplikaciji ostaje na srpskom. Ovaj fajl prevodi svaki tekst čim se pojavi na ekranu
 * (MutationObserver), pa je dodavanje jezika samo dopuna rječnika. Nepoznat tekst ostaje na srpskom.
 *
 *  a("srpski tekst","English","Deutsch","Русский")  — tačno podudaranje cijelog teksta
 *  r(/regex/, m => "...")                           — tekstovi s brojevima/nazivima (množina, vrijeme...)
 *
 * Provjera pokrivenosti: otvori aplikaciju s #i18n-debug u adresi; netumačeni tekst se ispisuje u konzolu.
 * E-mailovi (prijava greške, upit partnera) namjerno ostaju na srpskom jer ih čita operater.
 */
(function (g) {
  "use strict";
  var LANGS = { sr: "SR", en: "EN", de: "DE", ru: "RU" };
  var HL = { sr: "sr-Latn", en: "en", de: "de", ru: "ru" };
  var LOC = { sr: "sr-Latn", en: "en-GB", de: "de-DE", ru: "ru-RU" };
  var D = {}, R = [], lang = "sr", L = -1, debug = false;

  function a(s, e, d, r) { D[s] = [e, d, r]; }
  function r(re, f) { R.push([re, f]); }
  function P(n, f) { // množina: en/de 2 oblika, ru 3 oblika
    if (L === 2) { var a1 = n % 10, a2 = n % 100; return a1 === 1 && a2 !== 11 ? f[2][0] : (a1 >= 2 && a1 <= 4 && (a2 < 10 || a2 >= 20)) ? f[2][1] : f[2][2]; }
    return n === 1 ? f[L][0] : f[L][1];
  }
  function t(x) { var q = tr(String(x).trim(), 1); return q == null ? x : q; }

  /* ---------- rječnik ---------- */
  // početni ekran i forma
  a("Ne propusti", "Don't miss", "Verpasse nicht", "Не пропусти");
  a("ono između.", "what's in between.", "das Dazwischen.", "то, что между.");
  a("Otkrij skrivene dragulje, lokalne ukuse i mjesta vrijedna zaustavljanja — sve na tvojoj ruti.", "Discover hidden gems, local flavours and places worth stopping for — all along your route.", "Entdecke versteckte Juwelen, lokale Geschmäcker und Orte, die einen Halt wert sind – alles auf deiner Route.", "Открой скрытые жемчужины, местные вкусы и места, достойные остановки — всё на твоём маршруте.");
  a("Putujem od A do B.", "I'm travelling from A to B.", "Ich reise von A nach B.", "Я еду из пункта А в пункт Б.");
  a("Pronađi mi šta vrijedi doživjeti usput.", "Find me what's worth experiencing along the way.", "Finde, was sich unterwegs zu erleben lohnt.", "Найди, что стоит увидеть по дороге.");
  a("Planiraj put", "Plan a trip", "Reise planen", "Спланировать поездку");
  a("Otkrij najbolje stanice na svojoj ruti", "Discover the best stops on your route", "Entdecke die besten Stopps auf deiner Route", "Откройте лучшие остановки на своём маршруте");
  a("Ruta", "Route", "Route", "Маршрут");
  a("Polazište", "Start", "Startpunkt", "Откуда");
  a("Odredište", "Destination", "Ziel", "Куда");
  a("Prevoz", "Transport", "Verkehrsmittel", "Транспорт");
  a("Datum putovanja", "Travel date", "Reisedatum", "Дата поездки");
  a("Polazak", "Departure", "Abfahrt", "Отправление");
  a("Koliko dodatnog vremena imaš po stanici?", "How much extra time do you have per stop?", "Wie viel zusätzliche Zeit hast du pro Stopp?", "Сколько дополнительного времени у вас на каждую остановку?");
  a("Šta želiš da doživiš?", "What do you want to experience?", "Was möchtest du erleben?", "Что вы хотите увидеть и попробовать?");
  a("Filteri (opciono)", "Filters (optional)", "Filter (optional)", "Фильтры (по желанию)");
  a("Filteri koriste oznake iz OpenStreetMap. Mjesta bez oznake mogu biti u redu, ali ih ne možemo potvrditi.", "Filters use tags from OpenStreetMap. Places without a tag may be fine, but we can't confirm them.", "Die Filter nutzen Angaben aus OpenStreetMap. Orte ohne Angabe können trotzdem passen, wir können es aber nicht bestätigen.", "Фильтры используют метки OpenStreetMap. Места без меток могут подойти, но подтвердить это мы не можем.");
  a("Pronađi najbolje opcije", "Find the best options", "Beste Optionen finden", "Найти лучшие варианты");
  a("Rezultat pretrage", "Search results", "Suchergebnis", "Результаты поиска");
  a("Gotov izbor stanica", "Selected stops", "Ausgewählte Stopps", "Выбранные остановки");
  a("Pogledaj plan", "View plan", "Plan ansehen", "Смотреть план");
  a("Tvoj plan putovanja", "Your trip plan", "Dein Reiseplan", "Ваш план поездки");
  a("Navigacija (Google Maps)", "Navigate (Google Maps)", "Navigation (Google Maps)", "Навигация (Google Maps)");
  a("do cilja", "to destination", "bis zum Ziel", "до цели");
  a("do sljedeće stanice", "to next stop", "bis zum nächsten Stopp", "до следующей остановки");
  a("Tvoj put.", "Your journey.", "Deine Reise.", "Ваш путь.");
  a("Više doživljaja.", "More experiences.", "Mehr Erlebnisse.", "Больше впечатлений.");
  a("Od A do B — i sve što vrijedi vidjeti usput.", "From A to B — and everything worth seeing on the way.", "Von A nach B – und alles, was sich unterwegs zu sehen lohnt.", "От А до Б — и всё, что стоит увидеть по пути.");
  a("Sačuvaj plan", "Save plan", "Plan speichern", "Сохранить план");
  a("Novi plan", "New plan", "Neuer Plan", "Новый план");
  a("Za lokalne partnere", "For local partners", "Für lokale Partner", "Для местных партнёров");
  a("Dodaj u putovanje", "Add to trip", "Zur Reise hinzufügen", "Добавить в поездку");
  a("Putovanje", "Trip", "Reise", "Поездка");
  a("Planovi", "Plans", "Pläne", "Планы");
  a("Favoriti", "Favourites", "Favoriten", "Избранное");
  a("Profil", "Profile", "Profil", "Профиль");
  a("Početna", "Home", "Start", "Главная");
  a("Nazad", "Back", "Zurück", "Назад");
  a("npr. Sarajevo", "e.g. Sarajevo", "z. B. Sarajevo", "напр., Сараево");
  a("npr. Mostar", "e.g. Mostar", "z. B. Mostar", "напр., Мостар");
  a("Moja lokacija", "My location", "Mein Standort", "Моё местоположение");
  a("Uredi", "Edit", "Bearbeiten", "Изменить");
  a("Zatvori", "Close", "Schließen", "Закрыть");
  a("Jezik", "Language", "Sprache", "Язык");
  a("Nema interneta – prikazani su sačuvani podaci", "No internet – showing saved data", "Kein Internet – gespeicherte Daten werden angezeigt", "Нет интернета — показаны сохранённые данные");
  // prevoz i kategorije
  a("Auto", "Car", "Auto", "Авто");
  a("Bicikl", "Bike", "Fahrrad", "Велосипед");
  a("Pješice", "On foot", "Zu Fuß", "Пешком");
  a("Lokalna hrana", "Local food", "Lokale Küche", "Местная кухня");
  a("Vidikovci", "Viewpoints", "Aussichtspunkte", "Смотровые площадки");
  a("Priroda", "Nature", "Natur", "Природа");
  a("Kultura", "Culture", "Kultur", "Культура");
  a("Istorija", "History", "Geschichte", "История");
  // greške i statusi
  a("Lokacija nije dozvoljena.", "Location access was denied.", "Der Standortzugriff wurde verweigert.", "Доступ к геолокации запрещён.");
  a("Unesi polazište i odredište.", "Enter a start and a destination.", "Gib Start und Ziel ein.", "Укажите начальную и конечную точки.");
  a("Traženje adrese trenutno ne radi", "Address search isn't working right now", "Die Adresssuche funktioniert gerade nicht", "Поиск адреса сейчас не работает");
  a("Servis za rute trenutno ne radi", "The routing service isn't working right now", "Der Routendienst funktioniert gerade nicht", "Сервис маршрутов сейчас не работает");
  a("Ruta između ove dvije tačke nije pronađena", "No route found between these two points", "Zwischen diesen beiden Punkten wurde keine Route gefunden", "Маршрут между этими точками не найден");
  a("Izaberi bar jednu vrstu doživljaja.", "Choose at least one type of experience.", "Wähle mindestens eine Art von Erlebnis.", "Выберите хотя бы один тип впечатлений.");
  a("Nedostaje BLIZU_API u config.js.", "BLIZU_API is missing in config.js.", "BLIZU_API fehlt in config.js.", "В config.js отсутствует BLIZU_API.");
  a("Tražim adrese…", "Looking up addresses…", "Adressen werden gesucht…", "Ищу адреса…");
  a("Računam rutu…", "Calculating route…", "Route wird berechnet…", "Строю маршрут…");
  a("Tražim mjesta na odredištu…", "Looking for places at the destination…", "Orte am Ziel werden gesucht…", "Ищу места в пункте назначения…");
  a("Tražim mjesta duž puta…", "Looking for places along the way…", "Orte entlang der Strecke werden gesucht…", "Ищу места по пути…");
  a("Javni serveri s podacima o mjestima trenutno ne odgovaraju. Pokušaj ponovo za koji minut.", "The public place-data servers aren't responding right now. Try again in a few minutes.", "Die öffentlichen Ortsdaten-Server antworten gerade nicht. Versuche es in ein paar Minuten erneut.", "Публичные серверы с данными о местах сейчас не отвечают. Повторите попытку через несколько минут.");
  a("Nema pronađenih mjesta na ovoj ruti. Probaj više vremena ili druge interese.", "No places found on this route. Try more time or different interests.", "Auf dieser Route wurden keine Orte gefunden. Versuche mehr Zeit oder andere Interessen.", "На этом маршруте ничего не найдено. Добавьте времени или выберите другие интересы.");
  a("Nema internetske veze. Uključi internet i pokušaj ponovo.", "No internet connection. Turn on the internet and try again.", "Keine Internetverbindung. Schalte das Internet ein und versuche es erneut.", "Нет подключения к интернету. Включите интернет и повторите попытку.");
  a("Veza je prekinuta ili preslaba. Pokušaj ponovo.", "The connection was lost or is too weak. Try again.", "Die Verbindung wurde unterbrochen oder ist zu schwach. Versuche es erneut.", "Соединение прервано или слишком слабое. Повторите попытку.");
  a("Nešto nije u redu. Pokušaj ponovo.", "Something went wrong. Try again.", "Etwas ist schiefgelaufen. Versuche es erneut.", "Что-то пошло не так. Повторите попытку.");
  a("Ruta se trenutno ne može učitati. Pokušaj ponovo.", "The route can't be loaded right now. Try again.", "Die Route kann gerade nicht geladen werden. Versuche es erneut.", "Сейчас не удаётся загрузить маршрут. Повторите попытку.");
  a("Nema internetske veze. Ruta se može učitati samo uz internet.", "No internet connection. The route can only be loaded online.", "Keine Internetverbindung. Die Route kann nur online geladen werden.", "Нет интернета. Маршрут можно загрузить только онлайн.");
  a("Podijeljeni plan se trenutno ne može učitati. Pokušaj ponovo.", "The shared plan can't be loaded right now. Try again.", "Der geteilte Plan kann gerade nicht geladen werden. Versuche es erneut.", "Сейчас не удаётся загрузить плановую ссылку. Повторите попытку.");
  a("Nema internetske veze. Plan se može učitati samo uz internet.", "No internet connection. The plan can only be loaded online.", "Keine Internetverbindung. Der Plan kann nur online geladen werden.", "Нет интернета. План можно загрузить только онлайн.");
  a("Ovaj uređaj ne podržava lokaciju.", "This device doesn't support location.", "Dieses Gerät unterstützt keine Standortbestimmung.", "Это устройство не поддерживает геолокацию.");
  a("Kopiraj link plana:", "Copy the plan link:", "Planlink kopieren:", "Скопируйте ссылку на план:");
  a("Plan putovanja", "Trip plan", "Reiseplan", "План поездки");
  // obavještenje o lokaciji i prijava greške
  a("Koristimo tvoju lokaciju", "We use your location", "Wir verwenden deinen Standort", "Мы используем ваше местоположение");
  a("Lokacija se koristi samo kad je ti tražiš: za polazište, mapu i praćenje puta. Blizu nema korisničke naloge i ne povezuje tvoj položaj s tobom.", "Your location is used only when you ask for it: for the starting point, the map and live tracking. Blizu has no user accounts and does not link your position to you.", "Dein Standort wird nur verwendet, wenn du ihn anforderst: für den Startpunkt, die Karte und die Live-Verfolgung. Blizu hat keine Benutzerkonten und verknüpft deinen Standort nicht mit dir.", "Ваше местоположение используется только по вашему запросу: для начальной точки, карты и отслеживания в пути. В Blizu нет аккаунтов, и мы не связываем ваше положение с вами.");
  a("Da bismo našli rutu, mjesta i prognozu, koordinate se šalju vanjskim servisima. Detalji su u", "To find the route, places and forecast, coordinates are sent to external services. Details are in the", "Um Route, Orte und Wetter zu finden, werden Koordinaten an externe Dienste gesendet. Details findest du in der", "Чтобы найти маршрут, места и прогноз, координаты передаются внешним сервисам. Подробности — в");
  a("politici privatnosti", "privacy policy", "Datenschutzerklärung", "политике конфиденциальности");
  a("Politika privatnosti", "Privacy policy", "Datenschutzerklärung", "Политика конфиденциальности");
  a("Uslovi korištenja", "Terms of use", "Nutzungsbedingungen", "Условия использования");
  a("Nastavi", "Continue", "Weiter", "Продолжить");
  a("Ne sad", "Not now", "Jetzt nicht", "Не сейчас");
  a("Prijavi grešku", "Report an error", "Fehler melden", "Сообщить об ошибке");
  a("Izaberi šta nije u redu. Otvoriće se tvoja e-mail aplikacija; ništa se ne šalje automatski.", "Choose what's wrong. Your email app will open; nothing is sent automatically.", "Wähle aus, was nicht stimmt. Deine E-Mail-App wird geöffnet; es wird nichts automatisch gesendet.", "Выберите, что не так. Откроется ваше почтовое приложение; ничего не отправляется автоматически.");
  a("Trajno zatvoreno", "Permanently closed", "Dauerhaft geschlossen", "Закрыто навсегда");
  a("Pogrešna lokacija", "Wrong location", "Falscher Standort", "Неверное расположение");
  a("Pogrešno radno vrijeme", "Wrong opening hours", "Falsche Öffnungszeiten", "Неверные часы работы");
  a("Pogrešan opis ili kategorija", "Wrong description or category", "Falsche Beschreibung oder Kategorie", "Неверное описание или категория");
  a("Drugo", "Other", "Sonstiges", "Другое");
  a("Prijava e-mailom još nije podešena.", "Reporting by email isn't set up yet.", "Die Meldung per E-Mail ist noch nicht eingerichtet.", "Отправка жалоб по e-mail пока не настроена.");
  a("Podaci o mjestu dolaze iz OpenStreetMap-a. Ako znaš tačno stanje, možeš ga ispraviti direktno, a ispravku će vidjeti svi:", "Place data comes from OpenStreetMap. If you know the correct information, you can fix it directly, and everyone will see the fix:", "Die Ortsdaten stammen aus OpenStreetMap. Wenn du den richtigen Stand kennst, kannst du ihn direkt korrigieren, und alle sehen die Korrektur:", "Данные о месте берутся из OpenStreetMap. Если вы знаете, как правильно, можете исправить их напрямую — исправление увидят все:");
  a("otvori mjesto na OpenStreetMap-u", "open the place on OpenStreetMap", "Ort auf OpenStreetMap öffnen", "открыть место на OpenStreetMap");
  a("Obrisati sve što Blizu čuva na ovom uređaju (planove, putovanja, favorite, postavke i privremene podatke)?", "Delete everything Blizu stores on this device (plans, trips, favourites, settings and temporary data)?", "Alles löschen, was Blizu auf diesem Gerät speichert (Pläne, Reisen, Favoriten, Einstellungen und temporäre Daten)?", "Удалить всё, что Blizu хранит на этом устройстве (планы, поездки, избранное, настройки и временные данные)?");
  // plan i rezultat
  a("Početak putovanja", "Start of trip", "Reisebeginn", "Начало поездки");
  a("Cilj putovanja", "Destination", "Reiseziel", "Конец поездки");
  a("Otvori u Google Maps", "Open in Google Maps", "In Google Maps öffnen", "Открыть в Google Maps");
  a("Praćenje uživo u aplikaciji", "Live tracking in the app", "Live-Verfolgung in der App", "Отслеживание в приложении");
  a("Praćenje u aplikaciji radi samo dok je ekran upaljen i aplikacija otvorena. Za vođenje uz zaključan ekran koristi Google Maps.", "In-app tracking works only while the screen is on and the app is open. For guidance with the screen locked, use Google Maps.", "Die Verfolgung in der App funktioniert nur bei eingeschaltetem Bildschirm und geöffneter App. Für die Navigation bei gesperrtem Bildschirm nutze Google Maps.", "Отслеживание в приложении работает только при включённом экране и открытом приложении. Для навигации при заблокированном экране используйте Google Maps.");
  a("Podijeli link plana", "Share plan link", "Planlink teilen", "Поделиться ссылкой на план");
  a("Ispiši / sačuvaj PDF", "Print / save as PDF", "Drucken / als PDF speichern", "Печать / сохранить в PDF");
  a("Sačuvano", "Saved", "Gespeichert", "Сохранено");
  a("Link kopiran", "Link copied", "Link kopiert", "Ссылка скопирована");
  a("Google Maps prima najviše 9 međustanica po ruti, pa je plan podijeljen na dijelove. Kad stigneš do kraja jednog dijela, otvori sljedeći.", "Google Maps accepts at most 9 waypoints per route, so the plan is split into parts. When you reach the end of one part, open the next.", "Google Maps akzeptiert höchstens 9 Zwischenstopps pro Route, daher ist der Plan in Abschnitte geteilt. Wenn du das Ende eines Abschnitts erreichst, öffne den nächsten.", "Google Maps принимает не более 9 промежуточных точек на маршрут, поэтому план разбит на части. Дойдя до конца одной части, откройте следующую.");
  a("Preporučeni plan", "Recommended plan", "Empfohlener Plan", "Рекомендуемый план");
  a("Vidi sve", "See all", "Alle ansehen", "Показать все");
  a("vožnja (osnovna ruta)", "driving (base route)", "Fahrt (Basisroute)", "в пути на авто (основной маршрут)");
  a("vožnja biciklom (osnovna ruta)", "cycling (base route)", "Radfahren (Basisroute)", "на велосипеде (основной маршрут)");
  a("hodanje (osnovna ruta)", "walking (base route)", "Gehen (Basisroute)", "пешком (основной маршрут)");
  a("ukupno vrijeme putovanja", "total travel time", "Gesamtreisezeit", "общее время поездки");
  a("vožnja", "driving", "Fahrt", "в пути");
  a("dodatno vrijeme", "extra time", "zusätzliche Zeit", "дополнительное время");
  a("stanica", "stops", "Stopps", "остановок");
  a("(dodatno za ovu stanicu)", "(extra for this stop)", "(zusätzlich für diesen Stopp)", "(дополнительно для этой остановки)");
  a("Najbolje opcije, stvarno dodatno vrijeme, trajanje posjete i navigacija.", "Best options, actual extra time, visit duration and navigation.", "Beste Optionen, tatsächliche Zusatzzeit, Besuchsdauer und Navigation.", "Лучшие варианты, реальное дополнительное время, длительность посещения и навигация.");
  a("trajanje posjete", "visit duration", "Besuchsdauer", "длительность посещения");
  a("od centra", "from centre", "vom Zentrum", "от центра");
  a("od rute", "from route", "von der Route", "от маршрута");
  a("Dodaj u plan", "Add to plan", "Zum Plan hinzufügen", "Добавить в план");
  a("Ukloni iz plana", "Remove from plan", "Aus dem Plan entfernen", "Убрать из плана");
  a("Ukloni iz favorita", "Remove from favourites", "Aus Favoriten entfernen", "Убрать из избранного");
  a("Favorit", "Favourite", "Favorit", "Избранное");
  a("Odaberi datum", "Pick a date", "Datum wählen", "Выберите дату");
  a("Sat", "Hour", "Stunde", "Часы");
  a("Minute", "Minutes", "Minuten", "Минуты");
  a("Otkaži", "Cancel", "Abbrechen", "Отмена");
  a("Postavi", "Set", "Festlegen", "Готово");
  a("Sačuvaj i podijeli", "Save & share", "Speichern & teilen", "Сохранить и поделиться");
  a("Na putu", "On the road", "Unterwegs", "В пути");
  a("Obriši", "Delete", "Löschen", "Удалить");
  a("Navigacija do stanice", "Navigate to this stop", "Navigation zum Stopp", "Навигация до остановки");
  a("Web stranica", "Website", "Webseite", "Сайт");
  a("Rezervacija i recenzije", "Reservations and reviews", "Reservierung und Bewertungen", "Бронирование и отзывы");
  a("Ulaznice za ovo mjesto", "Tickets for this place", "Tickets für diesen Ort", "Билеты в это место");
  a("Partnerski link: Blizu može dobiti proviziju.", "Partner link: Blizu may earn a commission.", "Partnerlink: Blizu kann eine Provision erhalten.", "Партнёрская ссылка: Blizu может получить комиссию.");
  a("Neki su linkovi partnerski: Blizu može dobiti proviziju, a tvoja cijena ostaje ista.", "Some links are partner links: Blizu may earn a commission, and your price stays the same.", "Einige Links sind Partnerlinks: Blizu kann eine Provision erhalten, dein Preis bleibt gleich.", "Некоторые ссылки партнёрские: Blizu может получить комиссию, а ваша цена не изменится.");
  a("Promovisano", "Promoted", "Beworben", "Реклама");
  a("promovisano", "promoted", "beworben", "реклама");
  a("Promovisano · lokalni partneri", "Promoted · local partners", "Beworben · lokale Partner", "Реклама · местные партнёры");
  a("Plaćena mjesta uz tvoju rutu. Ne mijenjaju redoslijed preporuka iznad.", "Paid places along your route. They don't change the order of the recommendations above.", "Bezahlte Orte entlang deiner Route. Sie ändern die Reihenfolge der Empfehlungen oben nicht.", "Платные места вдоль вашего маршрута. Они не меняют порядок рекомендаций выше.");
  a("Djelimično pristupačno", "Partly accessible", "Teilweise barrierefrei", "Частично доступно");
  a("Vegetarijansko", "Vegetarian", "Vegetarisch", "Вегетарианское");
  a("Pristupačno", "Accessible", "Barrierefrei", "Доступно");
  a("Psi dozvoljeni", "Dogs allowed", "Hunde erlaubt", "Можно с собаками");
  a("Besplatno", "Free", "Kostenlos", "Бесплатно");
  a("Za djecu", "For kids", "Für Kinder", "Для детей");
  // detalji mjesta, fotografije, podaci
  a("Fotografija:", "Photo:", "Foto:", "Фото:");
  a("(autor i licenca su na stranici fajla)", "(author and licence are on the file page)", "(Urheber und Lizenz stehen auf der Dateiseite)", "(автор и лицензия указаны на странице файла)");
  a("Radno vrijeme nije nedavno provjereno u OpenStreetMap-u. Provjeri prije dolaska.", "Opening hours haven't been verified recently in OpenStreetMap. Check before you go.", "Die Öffnungszeiten wurden in OpenStreetMap länger nicht überprüft. Prüfe sie vor der Ankunft.", "Часы работы давно не проверялись в OpenStreetMap. Проверьте перед посещением.");
  a("Google: nema podataka za ovo mjesto", "Google: no data for this place", "Google: keine Daten für diesen Ort", "Google: нет данных об этом месте");
  a("Google podaci nedostupni (nema veze s Workerom)", "Google data unavailable (no connection to the Worker)", "Google-Daten nicht verfügbar (keine Verbindung zum Worker)", "Данные Google недоступны (нет связи с Worker)");
  a("Ocjene i radno vrijeme: Google", "Ratings and opening hours: Google", "Bewertungen und Öffnungszeiten: Google", "Оценки и часы работы: Google");
  // navigacija
  a("Čekam GPS signal…", "Waiting for GPS signal…", "Warte auf GPS-Signal…", "Ожидание сигнала GPS…");
  a("Drži aplikaciju otvorenu; za zaključan ekran koristi Google Maps", "Keep the app open; for a locked screen use Google Maps", "Lass die App geöffnet; bei gesperrtem Bildschirm nutze Google Maps", "Держите приложение открытым; при заблокированном экране используйте Google Maps");
  a("Ovaj preglednik ne može držati ekran upaljen — za vođenje koristi Google Maps", "This browser can't keep the screen on — use Google Maps for guidance", "Dieser Browser kann den Bildschirm nicht eingeschaltet lassen – nutze Google Maps zur Navigation", "Этот браузер не может держать экран включённым — для навигации используйте Google Maps");
  a("Nema signala lokacije", "No location signal", "Kein Standortsignal", "Нет сигнала геолокации");
  a("Van rute", "Off route", "Abseits der Route", "Вне маршрута");
  a("Preračunavam…", "Recalculating…", "Route wird neu berechnet…", "Пересчитываю…");
  a("Stižete na odredište", "You have arrived at your destination", "Du hast dein Ziel erreicht", "Вы прибыли в пункт назначения");
  a("Stižete na stanicu", "You have arrived at the stop", "Du hast den Stopp erreicht", "Вы прибыли на остановку");
  a("Okrenite se", "Make a U-turn", "Wende", "Развернитесь");
  a("za sada", "now", "jetzt", "сейчас");
  // vrijeme i upozorenja
  a("vedro", "clear", "klar", "ясно");
  a("pretežno vedro", "mostly clear", "überwiegend klar", "преимущественно ясно");
  a("oblačno", "cloudy", "bewölkt", "облачно");
  a("magla", "fog", "Nebel", "туман");
  a("kiša", "rain", "Regen", "дождь");
  a("snijeg", "snow", "Schnee", "снег");
  a("pljuskovi", "showers", "Schauer", "ливни");
  a("grmljavina", "thunderstorm", "Gewitter", "гроза");
  a("danas", "today", "heute", "сегодня");
  a("Prognoza za taj datum još nije dostupna. Provjeri bliže putovanju.", "The forecast for that date isn't available yet. Check closer to the trip.", "Die Vorhersage für dieses Datum ist noch nicht verfügbar. Schau kurz vor der Reise nach.", "Прогноз на эту дату пока недоступен. Проверьте ближе к поездке.");
  a("Bez veće šanse za kišu.", "No significant chance of rain.", "Keine nennenswerte Regenwahrscheinlichkeit.", "Значительного шанса дождя нет.");
  a("Za kišu su bolje stanice u zatvorenom.", "Indoor stops are better for rain.", "Bei Regen sind Stopps drinnen besser.", "В дождь лучше выбирать остановки в помещении.");
  a("Zatvoreno u to vrijeme", "Closed at that time", "Zu dieser Zeit geschlossen", "В это время закрыто");
  // ispis
  a("Vremena su procjena. Radno vrijeme provjeri prije dolaska. Podaci: OpenStreetMap.", "Times are estimates. Check opening hours before you go. Data: OpenStreetMap.", "Zeiten sind Schätzungen. Prüfe die Öffnungszeiten vor der Ankunft. Daten: OpenStreetMap.", "Время приблизительное. Проверьте часы работы перед посещением. Данные: OpenStreetMap.");
  a("Otvori ovaj plan u aplikaciji Blizu", "Open this plan in the Blizu app", "Diesen Plan in der Blizu-App öffnen", "Открыть этот план в приложении Blizu");
  a("Ruta u Google Maps", "Route in Google Maps", "Route in Google Maps", "Маршрут в Google Maps");
  // partneri
  a("Imaš restoran, smještaj ili iskustvo uz rutu?", "Do you have a restaurant, accommodation or experience along the route?", "Hast du ein Restaurant, eine Unterkunft oder ein Erlebnis an der Route?", "У вас есть ресторан, жильё или впечатления вдоль маршрута?");
  a("Promovisana mjesta vide putnici čija ruta prolazi blizu tebe. Uvijek su jasno označena kao „Promovisano” i ne mijenjaju redoslijed organskih preporuka.", "Promoted places are shown to travellers whose route passes near you. They are always clearly marked “Promoted” and don't change the order of organic recommendations.", "Beworbene Orte sehen Reisende, deren Route in deiner Nähe vorbeiführt. Sie sind immer klar als „Beworben“ gekennzeichnet und ändern die Reihenfolge der organischen Empfehlungen nicht.", "Рекламные места видят путешественники, чей маршрут проходит рядом с вами. Они всегда чётко помечены как «Реклама» и не меняют порядок обычных рекомендаций.");
  a("Restoran ili kafić", "Restaurant or café", "Restaurant oder Café", "Ресторан или кафе");
  a("Smještaj", "Accommodation", "Unterkunft", "Жильё");
  a("Ulaznice i ture", "Tickets and tours", "Tickets und Touren", "Билеты и экскурсии");
  a("Naziv objekta", "Business name", "Name des Betriebs", "Название заведения");
  a("Grad", "City", "Stadt", "Город");
  a("Telefon ili e-mail za kontakt", "Phone or email for contact", "Telefon oder E-Mail für den Kontakt", "Телефон или e-mail для связи");
  a("Kratko: šta nudiš i gdje se nalaziš", "Briefly: what you offer and where you are", "Kurz: was du anbietest und wo du bist", "Кратко: что вы предлагаете и где находитесь");
  a("Pošalji upit", "Send enquiry", "Anfrage senden", "Отправить запрос");
  a("Upit se otvara u tvojoj e-mail aplikaciji. Ništa se ne šalje automatski.", "The enquiry opens in your email app. Nothing is sent automatically.", "Die Anfrage öffnet sich in deiner E-Mail-App. Es wird nichts automatisch gesendet.", "Запрос откроется в вашем почтовом приложении. Ничего не отправляется автоматически.");
  a("E-mail za upite još nije podešen.", "The enquiry email isn't set up yet.", "Die E-Mail-Adresse für Anfragen ist noch nicht eingerichtet.", "E-mail для запросов пока не настроен.");
  a("Upiši naziv objekta i kontakt.", "Enter the business name and a contact.", "Gib den Namen des Betriebs und einen Kontakt ein.", "Укажите название заведения и контакт.");
  // plan B, zalazak sunca, trajekt
  a("Plan B", "Plan B", "Plan B", "План Б");
  a("Zamijeni", "Replace", "Ersetzen", "Заменить");
  a("Mjesto je u to vrijeme zatvoreno ili uskoro zatvara. Evo otvorenih opcija na sličnom dijelu puta.", "This place is closed at that time or closes soon. Here are open options along a similar part of the route.", "Dieser Ort ist zu dieser Zeit geschlossen oder schließt bald. Hier sind geöffnete Optionen an einem ähnlichen Abschnitt der Strecke.", "В это время место закрыто или скоро закроется. Вот открытые варианты на похожем участке пути.");
  a("Moguća je kiša. Evo opcija u zatvorenom na sličnom dijelu puta.", "Rain is possible. Here are indoor options along a similar part of the route.", "Regen ist möglich. Hier sind Optionen in Innenräumen an einem ähnlichen Abschnitt der Strecke.", "Возможен дождь. Вот варианты в помещении на похожем участке пути.");
  a("Dolaziš nakon zalaska sunca. Evo opcija koje nisu na otvorenom.", "You'd arrive after sunset. Here are options that aren't outdoors.", "Du kommst nach Sonnenuntergang an. Hier sind Optionen, die nicht im Freien sind.", "Вы приедете после захода солнца. Вот варианты не на открытом воздухе.");
  a("Evo sličnih opcija na istom dijelu puta.", "Here are similar options along the same part of the route.", "Hier sind ähnliche Optionen am gleichen Abschnitt der Strecke.", "Вот похожие варианты на том же участке пути.");
  a("Nema boljih zamjena u blizini. Probaj više vremena ili druge interese.", "No better replacements nearby. Try more time or different interests.", "Keine besseren Alternativen in der Nähe. Versuche mehr Zeit oder andere Interessen.", "Лучших замен поблизости нет. Добавьте времени или выберите другие интересы.");
  a("Otvoreno u to vrijeme", "Open at that time", "Zu dieser Zeit geöffnet", "В это время открыто");
  a("Radno vrijeme nije potvrđeno", "Opening hours unconfirmed", "Öffnungszeiten nicht bestätigt", "Часы работы не подтверждены");
  a("U zatvorenom", "Indoors", "In Innenräumen", "В помещении");
  a("Ruta uključuje trajekt. Čekanje i red vožnje nisu uračunati; provjeri prije polaska.", "The route includes a ferry. Waiting time and the timetable aren't included; check before you go.", "Die Route enthält eine Fähre. Wartezeit und Fahrplan sind nicht berücksichtigt; prüfe sie vor der Abfahrt.", "Маршрут включает паром. Время ожидания и расписание не учтены; проверьте перед выездом.");
  // putovanja, planovi, profil
  a("Izvezi podatke", "Export data", "Daten exportieren", "Экспортировать данные");
  a("Uvezi podatke", "Import data", "Daten importieren", "Импортировать данные");
  a("Izvoz čuva planove, putovanja i favorite u fajl, a uvoz ih spaja s onim što već imaš.", "Export saves your plans, trips and favourites to a file, and import merges them with what you already have.", "Der Export speichert deine Pläne, Reisen und Favoriten in einer Datei, der Import führt sie mit deinen vorhandenen Daten zusammen.", "Экспорт сохраняет ваши планы, поездки и избранное в файл, а импорт объединяет их с уже имеющимися данными.");
  a("Fajl nije ispravan Blizu izvoz.", "This file is not a valid Blizu export.", "Diese Datei ist kein gültiger Blizu-Export.", "Этот файл не является корректным экспортом Blizu.");
  a("Lokacija", "Location", "Standort", "Место");
  a("Izaberi putovanje ili napravi novo.", "Choose a trip or create a new one.", "Wähle eine Reise oder erstelle eine neue.", "Выберите поездку или создайте новую.");
  a("Naziv novog putovanja", "New trip name", "Name der neuen Reise", "Название новой поездки");
  a("Novo putovanje", "New trip", "Neue Reise", "Новая поездка");
  a("Putovanja", "Trips", "Reisen", "Поездки");
  a("Putovanje nije pronađeno.", "Trip not found.", "Reise nicht gefunden.", "Поездка не найдена.");
  a("Još nema dana. Dodaj prvi dan.", "No days yet. Add the first day.", "Noch keine Tage. Füge den ersten Tag hinzu.", "Дней пока нет. Добавьте первый день.");
  a("Dodaj dan", "Add day", "Tag hinzufügen", "Добавить день");
  a("Ispiši cijelo putovanje", "Print the whole trip", "Ganze Reise drucken", "Распечатать всю поездку");
  a("Obriši putovanje", "Delete trip", "Reise löschen", "Удалить поездку");
  a("Ukloni dan", "Remove day", "Tag entfernen", "Удалить день");
  a("bez datuma", "no date", "ohne Datum", "без даты");
  a("Obrisati putovanje? Planovi ostaju sačuvani.", "Delete the trip? Plans stay saved.", "Reise löschen? Die Pläne bleiben gespeichert.", "Удалить поездку? Планы останутся сохранёнными.");
  a("Još nema favorita. Dodaj mjesta srcem na stranici mjesta.", "No favourites yet. Add places with the heart on the place page.", "Noch keine Favoriten. Füge Orte mit dem Herz auf der Ortsseite hinzu.", "Избранного пока нет. Добавляйте места сердечком на странице места.");
  a("Još nema sačuvanih planova. Napravi plan i pritisni „Sačuvaj plan“.", "No saved plans yet. Make a plan and press “Save plan”.", "Noch keine gespeicherten Pläne. Erstelle einen Plan und tippe auf „Plan speichern“.", "Сохранённых планов пока нет. Составьте план и нажмите «Сохранить план».");
  a("Podrazumijevani prevoz", "Default transport", "Standard-Verkehrsmittel", "Транспорт по умолчанию");
  a("Obriši sačuvane podatke", "Delete saved data", "Gespeicherte Daten löschen", "Удалить сохранённые данные");

  /* ---------- pravila (brojevi, množina, nazivi) ---------- */
  var STOPS = [["stop", "stops"], ["Stopp", "Stopps"], ["остановка", "остановки", "остановок"]];
  var DAYS = [["day", "days"], ["Tag", "Tage"], ["день", "дня", "дней"]];
  var DIR = [
    { "lijevo": "left", "desno": "right", "blago lijevo": "slightly left", "blago desno": "slightly right", "oštro lijevo": "sharp left", "oštro desno": "sharp right", "pravo": "straight" },
    { "lijevo": "links", "desno": "rechts", "blago lijevo": "leicht links", "blago desno": "leicht rechts", "oštro lijevo": "scharf links", "oštro desno": "scharf rechts", "pravo": "geradeaus" },
    { "lijevo": "налево", "desno": "направо", "blago lijevo": "плавно налево", "blago desno": "плавно направо", "oštro lijevo": "резко налево", "oštro desno": "резко направо", "pravo": "прямо" }
  ];
  var ORD = function (n) { return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : n + "th"; };
  function nm(x) { return x || ""; }

  r(/^(\d+) stanica$/, function (m) { return m[1] + " " + P(+m[1], STOPS); });
  r(/^(.+) dodatno$/, function (m) { return m[1] + " " + ["extra", "zusätzlich", "дополнительно"][L]; });
  r(/^(.+) posjeta$/, function (m) { return m[1] + " " + ["visit", "Besuch", "посещение"][L]; });
  r(/^posjeta (.+)$/, function (m) { return ["visit ", "Besuch ", "посещение "][L] + m[1]; });
  r(/^([\d.,]+) km od (centra|rute)$/, function (m) { return m[1] + " km " + (m[2] === "centra" ? ["from centre", "vom Zentrum", "от центра"] : ["from route", "von der Route", "от маршрута"])[L]; });
  r(/^kuhinja: (.+)$/i, function (m) { return ["Cuisine: ", "Küche: ", "Кухня: "][L] + m[1]; });
  r(/^radno vrijeme: (.+)$/i, function (m) { return ["Opening hours: ", "Öffnungszeiten: ", "Часы работы: "][L] + m[1]; });
  r(/^Danas: (.+)$/, function (m) { return ["Today: ", "Heute: ", "Сегодня: "][L] + m[1]; });
  r(/^ukupno (.+)$/, function (m) { return ["total ", "insgesamt ", "всего "][L] + m[1]; });
  r(/^Kad stigneš u (.+)$/, function (m) { return [["When you arrive in ", ""], ["Bei Ankunft in ", ""], ["По прибытии в ", ""]][L][0] + m[1]; });
  r(/^Još za (.+)$/, function (m) { return ["More for ", "Mehr für ", "Ещё для "][L] + m[1]; });
  r(/^Dodaj u „(.+)”$/, function (m) { return [["Add to “", "”"], ["Zu „", "“ hinzufügen"], ["Добавить в «", "»"]][L][0] + m[1] + [["Add to “", "”"], ["Zu „", "“ hinzufügen"], ["Добавить в «", "»"]][L][1]; });
  r(/^Dan (\d+)(?: · (.+))?$/, function (m) { return ["Day ", "Tag ", "День "][L] + m[1] + (m[2] ? " · " + t(m[2]) : ""); });
  r(/^(\d+) dan\(a\)(.*)$/, function (m) { return m[1] + " " + P(+m[1], DAYS) + m[2]; });
  r(/^Uvezeno: (\d+) planova, (\d+) putovanja, (\d+) favorita\.$/, function (m) {
    return ["Imported: " + m[1] + " plans, " + m[2] + " trips, " + m[3] + " favourites.", "Importiert: " + m[1] + " Pläne, " + m[2] + " Reisen, " + m[3] + " Favoriten.", "Импортировано: планов — " + m[1] + ", поездок — " + m[2] + ", избранного — " + m[3] + "."][L];
  });
  r(/^Plan B: (.+)$/, function (m) { return ["Plan B: ", "Plan B: ", "План Б: "][L] + m[1]; });
  r(/^Dolazak nakon zalaska sunca \((\d\d:\d\d)\)$/, function (m) { return ["Arrival after sunset (" + m[1] + ")", "Ankunft nach Sonnenuntergang (" + m[1] + ")", "Прибытие после захода солнца (" + m[1] + ")"][L]; });
  r(/^Zalazak sunca u (\d\d:\d\d), prije kraja posjete$/, function (m) { return ["Sunset at " + m[1] + ", before the visit ends", "Sonnenuntergang um " + m[1] + ", vor Ende des Besuchs", "Закат в " + m[1] + ", до конца посещения"][L]; });
  r(/^Ruta uključuje trajekt \(oko (\d+) min prelaza\)\. Čekanje i red vožnje nisu uračunati; provjeri prije polaska\.$/, function (m) {
    return ["The route includes a ferry (about " + m[1] + " min crossing). Waiting time and the timetable aren't included; check before you go.", "Die Route enthält eine Fähre (Überfahrt ca. " + m[1] + " Min.). Wartezeit und Fahrplan sind nicht berücksichtigt; prüfe sie vor der Abfahrt.", "Маршрут включает паром (переправа около " + m[1] + " мин). Время ожидания и расписание не учтены; проверьте перед выездом."][L];
  });
  r(/^Putovanje (\d+)$/, function (m) { return ["Trip ", "Reise ", "Поездка "][L] + m[1]; });
  r(/^(\d+) sačuvanih planova · (\d+) favorita\. Podaci ostaju samo na ovom uređaju\.$/, function (m) {
    return [m[1] + " saved plans · " + m[2] + " favourites. Data stays only on this device.",
      m[1] + " gespeicherte Pläne · " + m[2] + " Favoriten. Die Daten bleiben nur auf diesem Gerät.",
      "Сохранённых планов: " + m[1] + " · избранного: " + m[2] + ". Данные остаются только на этом устройстве."][L];
  });
  r(/^(\d+) od (\d+) mjesta ima potvrđenu oznaku u OpenStreetMap\. Ostala mogu biti u redu, ali nisu označena\.( Isključi neki filter da vidiš više\.)?$/, function (m) {
    return [m[1] + " of " + m[2] + " places have a confirmed tag in OpenStreetMap. The others may be fine, but aren't tagged." + (m[3] ? " Turn off a filter to see more." : ""),
      m[1] + " von " + m[2] + " Orten haben eine bestätigte Angabe in OpenStreetMap. Die anderen können passen, sind aber nicht markiert." + (m[3] ? " Schalte einen Filter aus, um mehr zu sehen." : ""),
      "У " + m[1] + " из " + m[2] + " мест есть подтверждённая метка в OpenStreetMap. Остальные тоже могут подойти, но не помечены." + (m[3] ? " Отключите фильтр, чтобы увидеть больше." : "")][L];
  });
  r(/^(Google Maps|Navigacija) · dio (\d+) od (\d+)$/, function (m) {
    return (m[1] === "Navigacija" ? ["Navigate", "Navigation", "Навигация"][L] : "Google Maps") + " · " + ["part ", "Teil ", "часть "][L] + m[2] + [" of ", " von ", " из "][L] + m[3];
  });
  r(/^Tražim mjesta duž puta… (\d+)\/(\d+)$/, function (m) { return t("Tražim mjesta duž puta…") + " " + m[1] + "/" + m[2]; });
  r(/^Ne mogu pronaći: (.+)$/, function (m) { return ["Couldn't find: ", "Nicht gefunden: ", "Не удалось найти: "][L] + m[1]; });
  r(/^Dio zahtjeva nije uspio \((\d+)\/(\d+)\)\. Pokušaj ponovo za koji minut\.$/, function (m) {
    return ["Part of the request failed (" + m[1] + "/" + m[2] + "). Try again in a few minutes.",
      "Ein Teil der Anfrage ist fehlgeschlagen (" + m[1] + "/" + m[2] + "). Versuche es in ein paar Minuten erneut.",
      "Часть запроса не выполнена (" + m[1] + "/" + m[2] + "). Повторите попытку через несколько минут."][L];
  });
  r(/^Foto u blizini: (.+)$/, function (m) { return ["Nearby photo: ", "Foto in der Nähe: ", "Фото рядом: "][L] + m[1]; });
  r(/^(?:Foto|Fotografija): (.+)$/, function (m) { return ["Photo: ", "Foto: ", "Фото: "][L] + m[1]; });
  r(/^Google podaci nedostupni \((.*)\)$/, function (m) { return ["Google data unavailable (", "Google-Daten nicht verfügbar (", "Данные Google недоступны ("][L] + m[1] + ")"; });
  r(/^Otvara tek u (\d\d:\d\d)$/, function (m) { return ["Opens only at ", "Öffnet erst um ", "Откроется только в "][L] + m[1]; });
  r(/^Zatvara u (\d\d:\d\d)$/, function (m) { return ["Closes at ", "Schließt um ", "Закрывается в "][L] + m[1]; });
  r(/^Moguća kiša \((\d+)%\)$/, function (m) { return [["Rain possible (", "%)"], ["Regen möglich (", " %)"], ["Возможен дождь (", "%)"]][L][0] + m[1] + [["Rain possible (", "%)"], ["Regen möglich (", " %)"], ["Возможен дождь (", "%)"]][L][1]; });
  r(/^Radno vrijeme zadnji put provjereno (\d\d\/\d{4}) — može biti zastarjelo\.$/, function (m) {
    return ["Opening hours last verified " + m[1] + " — may be out of date.", "Öffnungszeiten zuletzt geprüft " + m[1] + " – möglicherweise veraltet.", "Часы работы последний раз проверялись " + m[1] + " — могут быть устаревшими."][L];
  });
  r(/^Radno vrijeme provjereno (\d\d\/\d{4})\.$/, function (m) { return ["Opening hours verified " + m[1] + ".", "Öffnungszeiten geprüft " + m[1] + ".", "Часы работы проверены " + m[1] + "."][L]; });
  r(/^Prognoza za (.+): ([^,]+), (.+)$/, function (m) { return ["Forecast for ", "Vorhersage für ", "Прогноз на "][L] + t(m[1]) + ": " + t(m[2]) + ", " + m[3]; });
  r(/^Kiša do (\d+)% oko (\d\d:\d\d)\.\s*(.*)$/, function (m) {
    return [["Chance of rain up to ", "% around "], ["Regenwahrscheinlichkeit bis zu ", " % gegen "], ["Вероятность дождя до ", "% около "]][L][0] + m[1] + [["Chance of rain up to ", "% around "], ["Regenwahrscheinlichkeit bis zu ", " % gegen "], ["Вероятность дождя до ", "% около "]][L][1] + m[2] + ". " + (m[3] ? t(m[3]) : "");
  });
  r(/^Vremena skretanja su procjena\. Podaci: OpenStreetMap(?: \(baza osvježena (.+)\))?\. Radno vrijeme provjeri prije dolaska\.$/, function (m) {
    return ["Detour times are estimates. Data: OpenStreetMap" + (m[1] ? " (database updated " + m[1] + ")" : "") + ". Check opening hours before you go.",
      "Umweg-Zeiten sind Schätzungen. Daten: OpenStreetMap" + (m[1] ? " (Datenbank aktualisiert " + m[1] + ")" : "") + ". Prüfe die Öffnungszeiten vor der Ankunft.",
      "Время на объезд приблизительное. Данные: OpenStreetMap" + (m[1] ? " (база обновлена " + m[1] + ")" : "") + ". Проверьте часы работы перед посещением."][L];
  });
  // navigacija: upute i udaljenost
  r(/^Skrenite (lijevo|desno|blago lijevo|blago desno|oštro lijevo|oštro desno)( – .*)?$/, function (m) {
    var d = DIR[L][m[1]]; return [("Turn " + d), ("Biege " + d + " ab"), ("Поверните " + d)][L] + nm(m[2]);
  });
  r(/^Nastavite pravo( – .*)?$/, function (m) { return ["Continue straight", "Fahre geradeaus weiter", "Продолжайте движение прямо"][L] + nm(m[1]); });
  r(/^Na račvanju držite se (lijevo|desno|blago lijevo|blago desno|oštro lijevo|oštro desno|pravo)( – .*)?$/, function (m) {
    var d = DIR[L][m[1]]; return [("At the fork, go " + d), ("Halte dich an der Gabelung " + d), ("На развилке двигайтесь " + d)][L] + nm(m[2]);
  });
  r(/^Uključite se(?: (lijevo|desno|blago lijevo|blago desno|oštro lijevo|oštro desno|pravo))?( – .*)?$/, function (m) {
    var d = m[1] ? " " + DIR[L][m[1]] : ""; return [("Merge" + d), ("Fädle dich ein" + d), ("Перестройтесь" + d)][L] + nm(m[2]);
  });
  r(/^U kružnom toku izađite na (?:(\d+)\. izlazu|sljedećem izlazu)( – .*)?$/, function (m) {
    var n = m[1] ? +m[1] : 0;
    return [("At the roundabout take the " + (n ? ORD(n) : "next") + " exit"), ("Nimm im Kreisverkehr die " + (n ? n + "." : "nächste") + " Ausfahrt"), ("На круговом движении выберите " + (n ? n + "-й" : "ближайший") + " съезд")][L] + nm(m[2]);
  });
  r(/^za ([\d.,]+ (?:m|km))(?: · stanica: (.+))?$/, function (m) { return ["in ", "in ", "через "][L] + m[1] + (m[2] ? " · " + ["stop: ", "Stopp: ", "остановка: "][L] + m[2] : ""); });

  /* ---------- jezgro ---------- */
  function U(s) { // ruske oznake jedinica
    return L !== 2 ? s : s.replace(/(\d)\s?min\b/g, "$1 мин").replace(/(\d)\s?km\b/g, "$1 км").replace(/(\d)h(?=\s?\d)/g, "$1 ч").replace(/(\d)\s?m(?![\w])/g, "$1 м");
  }
  function parts(c, sep, dp) {
    var ch = false, out = c.split(sep).map(function (p) { var q = tr(p, dp + 1); if (q == null) return p; ch = true; return q; });
    return ch ? out : null;
  }
  function tr(c, dp) {
    var e = D[c]; if (e) return e[L];
    for (var i = 0; i < R.length; i++) { var m = R[i][0].exec(c); if (m) { var o = R[i][1](m); if (o != null) return o; } }
    if (dp < 2 && c.indexOf(" · ") > 0) { var p1 = parts(c, " · ", dp); if (p1) return p1.join(" · "); }
    if (dp < 2) {
      var ss = c.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
      if (ss && ss.length > 1) { var p2 = parts(ss.map(function (x) { return x.trim(); }).join("\u0001"), "\u0001", dp); if (p2) return p2.join(" "); }
    }
    return null;
  }
  function T(s) {
    if (L < 0 || typeof s !== "string") return s;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    if (!m[2]) return s;
    var o = tr(m[2], 0), res = U(o == null ? m[2] : o);
    if (o == null && res === m[2]) { if (debug && /[A-Za-zČĆŽŠĐčćžšđ]{3,}/.test(m[2])) console.warn("i18n: nema prevoda:", m[2]); return s; }
    return m[1] + res + m[3];
  }

  /* ---------- posmatrač DOM-a ---------- */
  var ATTR = ["placeholder", "aria-label", "title", "alt"];
  var srcT = new WeakMap(), outT = new WeakMap(), outA = new WeakMap();
  function skip(n) { var p = n.parentNode; if (!p) return true; if (/^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/.test(p.nodeName)) return true; return !!(p.closest && p.closest("[translate=no]")); }
  function tnode(n) {
    if (outT.get(n) === n.data || skip(n)) return;
    var s = n.data, o = T(s);
    if (o !== s) { srcT.set(n, s); outT.set(n, o); n.data = o; }
  }
  function tattr(el, name) {
    var v = el.getAttribute(name); if (v == null) return;
    var m = outA.get(el) || {}; if (m[name] === v) return;
    var o = T(v); if (o !== v) { m[name] = o; outA.set(el, m); el.setAttribute(name, o); }
  }
  function walk(root) {
    if (root.nodeType === 3) return tnode(root);
    if (root.nodeType !== 1) return;
    var tw = document.createTreeWalker(root, 4), n;
    while ((n = tw.nextNode())) tnode(n);
    var els = [root].concat([].slice.call(root.querySelectorAll("[placeholder],[aria-label],[title],[alt]")));
    els.forEach(function (el) { ATTR.forEach(function (a1) { if (el.hasAttribute && el.hasAttribute(a1)) tattr(el, a1); }); });
  }
  var obs;
  function handle(recs) {
    recs.forEach(function (rc) {
      if (rc.type === "childList") rc.addedNodes.forEach(walk);
      else if (rc.type === "characterData") tnode(rc.target);
      else if (rc.type === "attributes") tattr(rc.target, rc.attributeName);
    });
  }
  function start() {
    walk(document.body);
    document.title = T(document.title);
    obs = new MutationObserver(handle);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR });
  }
  function flush() { if (obs) handle(obs.takeRecords()); }

  /* ---------- javni API ---------- */
  function detect() {
    var s = null; try { s = localStorage.getItem("lang"); } catch (e) {}
    if (s && LANGS[s]) return s;
    var n = String((navigator.languages && navigator.languages[0]) || navigator.language || "sr").toLowerCase().slice(0, 2);
    if (/^(sr|hr|bs|me|sh)$/.test(n)) return "sr";
    return n === "de" || n === "ru" ? n : "en";
  }
  function setLang(l) { lang = LANGS[l] ? l : "sr"; L = lang === "sr" ? -1 : { en: 0, de: 1, ru: 2 }[lang]; }
  var NAMES = { sr: "Srpski", en: "English", de: "Deutsch", ru: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439" };
  function ui(el) {
    if (!el) return;
    var items = Object.keys(LANGS).map(function (k) { return '<button type="button" role="option" data-l="' + k + '"' + (k === lang ? ' class="on" aria-selected="true"' : ' aria-selected="false"') + "><b>" + LANGS[k] + "</b> " + NAMES[k] + "</button>"; }).join("");
    el.innerHTML = '<button type="button" class="lg-cur" aria-haspopup="listbox" aria-expanded="false"><svg class="i" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3z"/></svg>' + LANGS[lang] + '<svg class="i lg-ch" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button><div class="lg-menu" role="listbox" hidden>' + items + "</div>";
    var cur = el.querySelector(".lg-cur"), menu = el.querySelector(".lg-menu");
    function close() { menu.hidden = true; cur.setAttribute("aria-expanded", "false"); el.classList.remove("open"); }
    cur.onclick = function (e) { e.stopPropagation(); var o = menu.hidden; menu.hidden = !o; cur.setAttribute("aria-expanded", o ? "true" : "false"); el.classList.toggle("open", o); };
    menu.onclick = function (e) {
      var b = e.target.closest && e.target.closest("button"); if (!b) return;
      if (b.dataset.l === lang) { close(); return; }
      try { localStorage.setItem("lang", b.dataset.l); } catch (x) {}
      location.reload();
    };
    el.onclick = function (e) { e.stopPropagation(); };
    document.addEventListener("click", close);
  }

  setLang(typeof document === "undefined" ? "sr" : detect());
  var api = { lang: function () { return lang; }, set: function (l) { setLang(l); }, T: T, flush: flush, ui: ui, hl: function () { return HL[lang]; }, loc: function () { return LOC[lang]; }, langs: LANGS, _dict: D, _rules: R };
  g.I18N = api; g._t = T;
  if (typeof document !== "undefined") {
    debug = /i18n-debug/.test(location.hash);
    document.documentElement.lang = lang === "sr" ? "sr" : lang;
    if (L >= 0) {
      var na = g.alert.bind(g), nc = g.confirm.bind(g), np = g.prompt.bind(g);
      g.alert = function (m) { return na(T(String(m))); };
      g.confirm = function (m) { return nc(T(String(m))); };
      g.prompt = function (m, d) { return np(T(String(m)), d); };
      if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
    }
  } else if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
