# Legacy-Code umbauen und prüfen

Lade diese Datei bei einem größeren Umbau, bei Legacy-Code, bei einem Skript, das zu einem Werkzeug gewachsen ist, oder wenn du Feedback in einem Review gibst.

## Wann umbauen

Bau um, wenn:
- du ein Feature einbauen willst und die jetzige Struktur es schwer macht,
- derselbe Fehler wegen doppelten Codes an mehreren Stellen auftaucht,
- dieselbe Stelle das Team immer wieder verwirrt,
- Tests brüchig oder schwer zu schreiben sind.

Bau nicht um:
- stabilen Code, den niemand ändern muss,
- nur um des Umbauens willen,
- im selben Commit wie eine Verhaltensänderung.

## Die sichere Schleife

1. **Halte das heutige Verhalten mit Tests fest** (Charakterisierungstests), auch wenn es fehlerhaft ist. Fehler behebst du in einem eigenen Schritt.
2. **Mach eine kleine Änderung:** eine Funktion herauslösen, eine Variable umbenennen, ein Literal durch eine Konstante ersetzen.
3. **Halte den Code lauffähig** und die Tests nach jedem Schritt grün.
4. **Committe,** damit du leicht zurückkannst.
5. Von vorn.

IDEs erledigen viele dieser Schritte sicher (Umbenennen, Methode herauslösen, Konstante einführen); nimm sie statt Handarbeit.

## Charakterisierungstests ohne Build-Schritt

Auch Browser-Code ohne Bundler und ohne Test-Setup bekommt günstig ein Sicherheitsnetz:

1. **Löse reine Funktionen heraus** aus Zeichen- und Handler-Code (Filtern, Sortieren, Datumsrechnung, URLs bauen), in Module, die beim Import das DOM nicht anfassen.
2. **Teste sie direkt unter Node** (node:test, mocha, Jest) mit einfachen Ein- und Ausgaben.
3. **Für echtes DOM-Verhalten** jsdom für Prüfungen einzelner Komponenten und Playwright für ganze Abläufe (Dialog öffnen, speichern, Ergebnis prüfen).

Testet das Projekt schon einige reine UI-Helfer unter Node, bau auf diesem Muster auf, statt ein neues Werkzeug einzuführen.

## Eine Monster-Funktion zähmen (etwa 500 Zeilen)

1. **Finde die logischen Abschnitte:** Validierung, Datenzugriff, Berechnung, Benachrichtigung, Logging, Fehlerbehandlung.
2. **Löse einen Abschnitt nach dem anderen heraus,** angefangen beim am wenigsten verflochtenen.
3. **Wiederhole das,** bis die Hauptfunktion nur noch gut benannte Helfer aufruft.

Jeder Helfer ist danach klein und für sich testbar.

## Strategien für Legacy-Code

- **Strangler Fig:** Neue Features sauber neben dem alten Code schreiben und die Funktionen Stück für Stück umziehen, statt alles auf einmal neu zu schreiben.
- **Nahtstellen schaffen:** Eine Schnittstelle um eine Legacy-Komponente legen, damit der Code drumherum sicher getestet und geändert werden kann.
- **Die Drachen dokumentieren:** Wo empfindlicher Code vorerst bleiben muss, kommentiere, warum er seltsam ist, was bricht, wenn man ihn ändert, und wie die richtige Lösung aussähe.
- **Brennpunkte zuerst:** Bereiche, die oft geändert werden oder fehleranfällig sind. Stabilen Code in Ruhe lassen.

## Skripte, die zu Werkzeugen wurden

Code für Auswertung und Automatisierung geht oft diesen Weg: einmaliges Skript, dann Referenz, dann etwas, auf das sich andere verlassen. Ohne Struktur sammelt er Sonderfälle, kopierte Logik und unausgesprochene Annahmen, bis jede Änderung riskant ist.

- Überführe Skripte früh in Module.
- Teile nach Themen: Fachmodell, Berechnungen, Konfiguration, Ein- und Ausgabe, Darstellung.
- Nimm explizite Ein- und Ausgaben statt globalem Zustand.
- Lösche Duplikate und halte die Abhängigkeiten zwischen Modulen klein.
- Schreib Tests, die prüfen, ob die Ergebnisse Sinn ergeben (Invarianten, Referenzergebnisse), nicht nur, ob das Skript durchläuft.
- Bau um, bevor das nächste Feature kommt.

## Umgangsformen im Review

**Feedback geben**
- Kritisiere den Code, nicht die Person.
- Erkläre den Grund hinter jedem Vorschlag.
- Frag, wo die Absicht unklar ist ("Was passiert hier, wenn die Liste leer ist?").
- Konzentrier dich auf Korrektheit, Sicherheit und Wartbarkeit. Formatierung überlässt du den Werkzeugen.
- Kennzeichne optionale Vorschläge als optional und gib Code frei, der gut genug ist. Blockiere nicht wegen Perfektion.

**Feedback annehmen**
- Trenne die Kritik von deiner Person.
- Frag nach, wenn ein Kommentar unklar ist.
- Nimm Vorschläge ernst und widersprich mit Gründen, wenn du anderer Meinung bist.

**Regeln im Team**
- Schreibt die Konventionen für Namen, Kommentare, Aufbau der Tests und Formatierung auf; ein automatischer Formatter beendet Streit über Stil.
- Haltet Merge Requests klein, damit Reviews etwas taugen.
- Reviews gelten für alle, auch für erfahrene Leute.
- Klärt Meinungsverschiedenheiten über gemeinsame Ziele (Wartbarkeit) und Daten (Anzahl der Fehler), nicht über Meinungen.

## Commits und Branches

- Früh und oft committen; jeder Commit tut eine Sache und hat eine Nachricht, die sagt, warum.
- Kleine Pull Requests; Fehlerkorrekturen schnell zurückführen; keine langlebigen Forks.
- Nie wissentlich kaputten Code pushen; gemeinsame Branches stabil halten.
