# Herkunft

Quelle: https://github.com/markky21/claude-skills
Pfad: plugins/my-personal-tools/skills/clean-code/SKILL.md
Commit: d7ad73543c2dc4bc071c16eb4388dae34de8812d
Lizenz: MIT (Copyright (c) 2026 markky21), liegt dem Mod als `LICENSE` bei
Gefunden über: https://mcpmarket.com/tools/skills/clean-code-principles
Installiert: 2026-10-18 als persönlicher Skill, unverändert übernommen
SHA-256 der Original-SKILL.md: dd750648b35c85a6d8907e391ec4f2bd7621a59cc3f37b78cd60beb70926f49b
(am 2026-11-04 gegen den Commit auf GitHub geprüft)

# Änderungen

## 1.4.0.0 (2026-11-04)

Deutsche Fassung als Mod `clean-code` im Katalog bm-mods, wie sorgfalt und kurzfassen.

- SKILL.md und die drei Dateien in `references/` auf Deutsch. Code-Beispiele, Bezeichner und die
  englischen Namen der Code-Smells bleiben, wie sie sind.
- Schweregrade heißen KRITISCH, HOCH, MITTEL und NIEDRIG.
- Die persönliche Kopie (Version 1.3.0.0, englisch) liegt als Sicherung unter
  `~/.claude/skills-sicherung/clean-code-1.3.0.0/`, dort auch die Original-Datei
  `original/SKILL-1.0.0.0.md`.

## 1.3.0.0 (2026-11-04)

Praxistest: Ein frischer Agent hat mit Version 1.2.0.0 das Frontend von iobroker.kanban
(`www/`, Vanilla-JS ohne Framework, rund 7.500 Zeilen) geprüft. Sechs Funde wurden im Code
nachgeprüft und stimmen. Seine Rückmeldungen zum Skill sind hier eingearbeitet.

SKILL.md:
- Review-Ablauf: Charakterisierungstests ohne Build-Schritt; Lücke beim Linter (Ordner vom Lint
  ausgenommen) als eigener Fund; Sicherheits-Grundlagen in Schritt 3; neuer Absatz
  "Diff-Review oder Audit" für Prüfungen bestehenden Codes
- Fehler: Beispiel für async-Handler ohne catch, Zeilen zu Umfang des try, async und
  `new Error(msg, { cause })`; Schwere nach Folge (Nutzeraktion oder harmlose Hintergrundarbeit)
- Namens-Smells: gemischte natürliche Sprachen, Verschatten verbreiteter Namen (`t` für i18n)
- Klassengröße: Die Tests gelten auch für Module und große Closures
- Kommentare: WARUM-Kommentare kurz halten, lange Geschichte in Commit oder Doku
- Schweregrade: "nach Folgen, nicht nach Zahlen"; Korrektheitsfehler, Datenverlust und
  Ressourcen-Lecks aufgenommen; verschluckte Fehler nur noch kritisch bei Nutzeraktionen;
  Parameterzahl allein nur noch MITTEL; fehlende Lint-Abdeckung MITTEL
- Warnsignale und Ausreden ergänzt (async-Handler, zu breites try, "das findet doch der Linter")
- Kurzreferenz-Tabelle entfernt: Sie wiederholte Auslöser, Warnsignale und Schweregrade

references/frontend.md:
- Zielplattform zuerst klären (Website, Intranet, Kiosk, WebView, iframe)
- Neuer Abschnitt zu Vanilla-JS und DOM ohne Framework: Instanzen und Listener beim
  Neuzeichnen freigeben, Handler einmal registrieren, ein Einstieg pro Dialog-Modus mit
  Zurücksetzen, Regeln als reine Funktionen, Module ohne Wirkung beim Import, Hülle um den
  Browser-Speicher, gemeinsame Helfer
- Neuer Abschnitt Sicherheits-Grundlagen: `textContent` statt `innerHTML`, Bereinigen,
  URL-Schemata, CSP
- Styling: Tokens für Werte, die synchron bleiben müssen; Einzelwerte in handgeschriebenem CSS
  sind in Ordnung
- Barrierefreiheit: Touch-Ziele korrigiert auf mindestens 24x24 px (WCAG 2.2 AA, 2.5.8), 44x44
  als AAA und Vorgabe von Apple, das Ziel des Projekts gilt; Drag-and-drop braucht eine
  Alternative; Buttons nur mit Icon brauchen einen Namen
- Performance und Browser-Matrix nach Zielplattform; mobile-first nur für neue Stylesheets;
  RTL nur bei unterstützter RTL-Sprache
- Neuer Abschnitt "Wann die Frontend-Regeln nicht gelten"; Schweregrade angepasst

references/refactoring-and-reviews.md:
- Neuer Abschnitt "Charakterisierungstests ohne Build-Schritt"

Eigene Ergänzungen ohne Quelle aus dem Artikel: WCAG-Kriterien (2.1.1, 2.5.5, 2.5.7, 2.5.8),
`AbortController`, `new Error` mit `cause`.

## 1.2.0.0 (2026-11-04)

Neu:
- references/frontend.md: Komponenten (eine Aufgabe, lokaler Zustand, Datenzugriff in Services
  und Hooks), Styling (Basis erweitern statt überschreiben, Design-Tokens statt fester Werte),
  Barrierefreiheit (Tastatur, sichtbarer Fokus, Touch-Ziele, kein Hover-only, zuerst
  semantisches HTML), Performance (Lazy Loading, WebP/AVIF, gzip/Brotli, Caching/CDN, messen
  mit Lighthouse und WebPageTest), Browser-Support (Support-Matrix, Feature Detection statt
  Browser-Erkennung, mobile-first, `@supports`), Sprache und Schreibrichtung (`lang`,
  `dir="rtl"`, logische CSS-Eigenschaften, Schriften), Projektstruktur, Schweregrade für
  Frontends (UAE Design System 2024/2025, freeCodeCamp 2024/2025)
- SKILL.md: Review-Schritt 8 lädt die Datei nur bei Frontend-Code; Beschreibung um Frontend
  ergänzt

Eigene Ergänzungen ohne direkte Quelle: logische CSS-Eigenschaften für RTL, Hinweis auf den
European Accessibility Act bei der Schwere von Mängeln der Barrierefreiheit.

## 1.1.0.0 (2026-11-04)

Abgleich mit dem Artikel "So schreiben Sie sauberen Code" (Sudonull, 19.06.2026,
https://sudonull.com/de/how-to-write-clean-code-best-practices-guide) und allen acht darin
genannten Quellen.

Neu:
- Überblick: sauberer Code ist sicher änderbar; lesbar, vertrauenswürdig, wartbar (ODU)
- Review-Ablauf: erst Tests prüfen, Konventionen des Projekts respektieren, nach Schwere
  ordnen, Refactoring getrennt von Verhaltensänderung, eigene KI-Vorschläge prüfen (Mimo,
  freeCodeCamp 2025)
- Namen: Namens-Smells (Füllwörter, load2, Typ-Kodierung, Irreführung, unaussprechbar),
  Namenslänge passend zum Gültigkeitsbereich, Fachdomäne oder Technik, Gültigkeitsbereich
  klein halten (CERN-Folien, ODU, Codility)
- Funktionen: Test mit einem Satz ohne "und", eine Abstraktionsebene, Staffel für Argumente
  von 0 bis 3, Flag-Argumente, Command-Query-Separation, Guard Clauses (CERN-Folien, Mimo,
  Sudonull)
- Klassen: Größe nach Verantwortlichkeiten statt Zeilen, Test mit 25 Wörtern, Law of Demeter,
  fremde Bibliotheken kapseln, Projektstruktur (ODU, freeCodeCamp 2024, UAE)
- Smells: Flag Argument, Message Chain, Magic Number, Hardcoded Config/Secrets, Speculative
  Generality, Hidden Side Effect, Script Sprawl (Mimo, CERN ABP)
- DRY mit Augenmaß: gleiche Geschäftsregel sofort herauslösen, ähnlichen Code erst ab dem
  dritten Vorkommen (Sudonull, Mimo)
- Fehler: Fehlerbehandlung als eigene Aufgabe, Idiom der Sprache (Exceptions oder Result),
  Log-Level mit Kontext (ODU, Mimo)
- Annahmen im Code festhalten: Wertebereiche prüfen, Einheiten im Namen, keine stillen
  Standardwerte, ungültige Zustände unmöglich machen, "sei vorsichtig" ist kein Schutz (CERN ABP)
- Kommentare: Kommentare verrotten, TODO nur mit Ticket, Pflicht-Doku ohne Inhalt, "Hier sind
  Drachen" (CERN-Folien, Mimo)
- Teil VII Tests und Refactoring: Tests schützen die Bedeutung (Invarianten,
  Referenzergebnisse), Pfadfinder-Regel, erst die Struktur reparieren, kleine Schritte, erst
  entwerfen, korrekt vor schnell (CERN ABP, Mimo, Codility, Sudonull)
- Teil VIII Einheitlichkeit und Werkzeuge: Styleguide vorab, Formatter und Linter in
  Pre-Commit und CI, begründete Ausnahmen, Sprach-Idiome, saubere Commits (CERN ABP, Codility,
  freeCodeCamp)
- "Wann die Regeln nicht gelten": KISS und YAGNI, nicht zerstückeln, Performance, Prototypen,
  Termindruck (Mimo, Sudonull)
- references/solid.md: SOLID-Beispiele aus dem Original, ausgelagert und um "nicht überdehnen"
  ergänzt
- references/refactoring-and-reviews.md: Monster-Funktionen, Legacy (Strangler Fig,
  Nahtstellen), Skripte, Umgangsformen im Review, Commits

Geändert:
- Feature-Envy-Beispiel korrigiert (das Original rief `.applyDiscount()` auf einer Zahl auf)
- Klassen-Beispiele ohne Füllwörter (`OrderProcessor`, `EmailService` wurden `Invoice`,
  `WelcomeMailer` usw.)
- Längen-Tabelle als Richtwert formuliert, Warnung vor Zerstückelung
- Grenze für Parameter vereinheitlicht: ab 4 begründen (vorher widersprüchlich 3 bis 4 und 5)
- Schweregrade: God Class von KRITISCH auf HOCH (nur wenn durch die Änderung entstanden oder
  gewachsen); neu KRITISCH: Secrets im Code, versteckte Annahmen, ungetestete Änderung
  kritischer Logik
- Ausreden ergänzt und "Each line over 20 adds cognitive load" entschärft
- Entscheidungsgraph (dot) entfernt, die Liste der Auslöser deckt ihn ab und ist vollständiger

# Quellen des Abgleichs (1.1.0.0)

- Sudonull (2026): So schreiben Sie sauberen Code
  https://sudonull.com/de/how-to-write-clean-code-best-practices-guide
- CERN ABP Computing: Writing Clean Code
  https://abpcomputing.web.cern.ch/guides/clean_coding/
- CERN, B. Wolff (2014): Clean Code, Why you should care (Folien, nach R. C. Martin;
  nicht im Artikel genannt, bei der Suche nach der CERN-Quelle zusätzlich gefunden)
  https://indico.cern.ch/event/276139/contributions/621762/
- Old Dominion University, S. J. Zeil (2024): Clean Coding
  https://www.cs.odu.edu/~zeil/cs350/s24-live/Public/cleanCoding/index.html
- Mimo (2025): How to Write Clean Code: A Practical Guide for Developers
  https://mimo.org/blog/how-to-write-clean-code
- Codility Engineering (2025): How to Write Clean Code: 5 Tips for a Maintainable Codebase
  https://www.codility.com/blog/how-to-write-clean-code-5-essential-tips/
- freeCodeCamp, Shahan (2024): How to Write Clean Code, Tips for Developers with Examples
  https://www.freecodecamp.org/news/how-to-write-clean-code-tips-for-developers/
- freeCodeCamp, N. Sharma (2025): Simple Tips to Help You Write Clean Code
  https://www.freecodecamp.org/news/tips-for-writing-clean-code/
- UAE Design System (2024): The art of sustainable coding
  https://designsystem.gov.ae/series/the-art-of-sustainable-coding-writing
- UAE Design System (2025): Technical Coding Practices
  https://designsystem.gov.ae/guidelines/technical-coding

Die frontend-spezifischen Punkte der UAE-Quellen stehen seit 1.2.0.0 in
`references/frontend.md` und werden nur bei Frontend-Code geladen.
