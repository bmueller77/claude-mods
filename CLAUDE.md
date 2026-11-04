# BM-Mods: Björns Claude-Code-Mods (Katalog bm-mods)

Dieses Repo ist der Katalog `bm-mods` (bis 2026-10-29 `bjoern-mods`). Seit 2026-10-19 pflegt Claude ihn
hier auf GitHub, und `main` ist der Stand, den jede Instanz mit `claude plugin marketplace update bm-mods`
bekommt.
Die vollständige Übergabe vom PC steht in `docs/uebergabe-2026-10-19.md`.

Mit Björn immer Deutsch, kurz, Ergebnis zuerst.

## Aufbau

- Ein Ordner je Mod: `.claude-plugin/plugin.json` (mit Version), `hooks/`, `types/`, `tests/`.
- `.claude-plugin/marketplace.json` ist der Katalog. `i-have-adhd` ist fremd und kommt direkt aus
  `ayghri/i-have-adhd`. Seit 2026-10-28 gibt es davon die deutsche Fassung `kurzfassen` (eigener Mod, nur
  ein Skill, Björn mag den Namen ADHS nicht); i-have-adhd bleibt im Katalog. Seit 2026-11-04 gibt es
  `sorgfalt` (nur Skills `debuggen` und `belegen`, deutsche Fassung aus obra/superpowers, MIT); Superpowers
  und Everything Claude Code selbst installiert Björn nicht, sie stritten mit dem Leitstand um die Führung.
  Ebenfalls seit 2026-11-04 gibt es `clean-code` (nur der Skill `clean-code` mit drei Dateien in
  `references/`, deutsche und erweiterte Fassung aus markky21/claude-skills, MIT). Er lag vorher als
  persönlicher Skill unter `~/.claude/skills/clean-code`; die englische Fassung 1.3.0.0 liegt als
  Sicherung unter `~/.claude/skills-sicherung/clean-code-1.3.0.0/`. Seine Version zählt die des Skills
  weiter (1.4.0.0), nicht ab 0.1.0.0.
- Befehle heißen seit 2026-10-26 `/<mod>:<funktion>[-<wert>]` (Anthropics Schreibweise), `/<mod>:hilfe`
  listet sie. Jeder Mod hat dafür `<mod>/commands/<funktion>.md`; die App setzt `<mod>:` davor, der
  `command.run`-Hook des Mods beantwortet `e.command === '<mod>:<funktion>'`. Registriert
  (`$.command.register`) sind nur Grundbefehle ohne Doppelpunkt (`/statistik`, `/modellwahl`, …)
  und die Kurzformen des Leitstands. Für genau diese hält das Wurzel-`commands/` eine Datei; kopiert
  nach `~/.claude/commands/`, kennt die Desktop-App sie schon in der ersten Nachricht. Alte Namen
  `<mod>-<funktion>` nennen im Hook nur noch den neuen. Bekommt ein Mod einen Befehl dazu oder
  verliert er einen, müssen die Dateien mitziehen, ebenso `BEFEHLE.md`, die alle Befehle je Mod listet.
- Ein Mod ruft keinen anderen Mod auf, höchstens Skills und eingebaute Befehle wie `/compact` oder
  `/context` (Björn, 2026-10-26). Deshalb stecken Reflect, Filetree und Autopilot seit leitstand 0.57.0
  im Leitstand, als Teile unter `leitstand/hooks/<teil>/` (`teil.ts` meldet an, `befehle.ts` hält die
  Befehle für Übersicht und Kurzformen, `teile.ts` gibt ihnen ihre Einstellungen unter den alten
  Namen). Ihre alten Ordner bleiben im Repo, stehen aber nicht mehr im Katalog. Das Aufräumen mit
  Sicherungspunkt gehört seit statistik 0.18.0 der Statistik. Fremden Zustand nur lesen (etwa die
  Zeile der Modellwahl im Band) ist kein Aufruf.
- `README.md` sagt, was jeder Mod tut. `UMSTIEG.md` ist der Prompt für andere Instanzen,
  `UPDATE.md` der für ihre Updates, `install.sh` installiert alles. Was `UPDATE.md` installiert und
  deinstalliert, liest die Instanz aus `marketplace.json`. Fällt eine Datei aus `commands/` weg,
  kommt sie in Schritt 6 und die Tabelle von `UPDATE.md`.

## Arbeitsweise

- Vor der Arbeit an Mods den Skill `plugin-authoring` laden, für deutsche Texte `vermenschlichen`.
- Alle sichtbaren Texte deutsch mit echten Umlauten.
- Jede Änderung an einem Mod zählt dessen Version in `plugin.json` hoch. Commit-Titel wie bisher:
  `<mod> <version>: <was sich ändert>`; betrifft es mehrere Mods, eine Liste im Text. Autor ist
  Björn (`--author="Björn Müller <bjoern@mueller.family>"`), dazu die Zeile `Co-Authored-By`.
  Versionen seit 2026-10-29 vierstellig x.x.x.x (Björns Regel): Eine Korrektur zählt die vierte
  Stelle, ein Feature die dritte (aus 0.63.1 wird 0.63.1.1 bzw. 0.63.2.0). `claude plugin validate`
  nimmt das an, und `plugin update` aktualisiert bei jeder anderen Nummer, auch rückwärts (geprüft 2.1.309).
- Prüfen vor jedem Commit, je geändertem Mod: `claude plugin validate ./<mod>` und
  `claude plugin test ./<mod>`. Nach Änderungen am Katalog zusätzlich `claude plugin validate .`.
- Typprüfung: `tsc -p <mod>`, sobald die Engine die Typen nach `<mod>/.claude-plugin/types/`
  gelegt hat (das tut sie beim Laden; der Ordner ist in `.gitignore`). Die tsconfig-Dateien am PC
  unter `d:\temp\claude\ns-tsc-7e39\` zeigen noch auf den alten Ordner `~/.claude/mods`. Für das
  Repo eine eigene anlegen: `include` mit der Typdatei, die der Skill `plugin-authoring` nennt, und
  `<mod>/hooks`, `<mod>/types`, `<mod>/tests`.
- Zeilenenden je Datei erhalten. In leitstand, statistik, visible-compact und filetree haben viele
  Dateien CRLF (`git ls-files --eol` zeigt es). Nach dem Ändern prüfen, dass `git diff` nicht die
  ganze Datei als geändert zeigt. Am PC gilt `core.autocrlf=true`, dort
  `git -c core.autocrlf=false add …`.
- Pushen auf `main`, wenn Validierung und Tests grün sind (Björns Daueranweisung „pushen, wenn
  fertig"). Läuft der Autopilot, nicht auf `main`, sondern auf einen eigenen Zweig pushen und das
  in der Übergabe vermerken. Ein nur lokaler Commit ginge in der Cloud mit dem Container verloren.
- Seit 2026-10-27 haben alle Instanzen Zugang zum Repo. Falls doch wieder eine ohne dazukommt, Zip:
  `git archive --format=zip --prefix=bm-mods/ -o bm-mods-<datum>.zip HEAD`. Datum und
  Zip-Name in `UMSTIEG.md` nachziehen. `.gitattributes` hält `CLAUDE.md` und `docs/` aus dem Zip.
- In einer Cloud-Sitzung ausprobieren: Mods mit
  `git archive HEAD <mod> | tar -x -C <Mod-Ordner der Sitzung>` kopieren. Den Ordner nennt der
  Skill `plugin-authoring` (`/root/.claude/dev-mods/<sitzung>/`). Nach Björns Freigabe lädt die
  Engine sie per Hot Reload. Nach jeder Änderung neu kopieren.
- Nichts löschen ohne ausdrückliche Bitte, auch keine alten Store-Schlüssel oder alten Mods.
- Ein Passwort, das Björn früher in einen Chat getippt hat, nie wiederholen.
- Den Obsidian-Vault (`claude-code-mods.md`, `log.md`) gibt es nur auf Björns PC. Aus der Cloud
  ist er nicht erreichbar; das Protokoll sind hier die Commits.

## Fachliches, das leicht verloren geht

- Einstellungen gelten je Chat, der Standard kommt aus `userConfig`. Leitstand-Standard: Auto-Modus,
  Verdecken und Passwortschutz an, Ansicht minimal, alles andere aus.
- userConfig mit `options`: Ein gespeicherter Wert außerhalb der Optionen kommt in `register` als Standard
  an, `$.config.list()` zeigt aber den rohen Wert. `$.settings.read({ key: 'pluginConfigs', source })` mit
  `user`, `flag` oder `policy` liest ihn in jedem Modus; `pluginConfigs` aus Projekt-Settings verwirft die
  Engine. In der Desktop-App und in `-p` fehlen die Plugin-Zeilen in `$.config.list()` bis zu einem Neuladen
  der Plugins, dort wirft `$.config.set`. Ein `$.config.set` des eigenen Felds lädt den Mod neu (geprüft
  2026-10-28, 2.1.309). So schreibt leitstand 0.61.1 ein altes `ausfuehrlich` auf `detailliert` um; bis
  dahin gilt es bei jedem Start schon als Detailliert.
- Regeln warten seit leitstand 0.63.2.0 im Fenster `leitstand-regeln` statt im Band (Björns Wunsch, die
  Zeile klemmte unter der Button-Reihe). Es öffnet sich bei jeder neuen Regel und schließt nach der
  letzten Entscheidung.
- Statistik seit 0.19.0 (Björns Wunsch): Nach einem Compact steht im Verlauf nur eine Zeile, die
  Zusammenfassung zeigt `/statistik:zusammenfassung-zeigen` im Fenster (vom Handy und ohne Fenster als
  Text), verdeckt, wenn der Leitstand verdeckt. `$.ui.log`-Zeilen lassen sich nicht zuklappen.
  Seit 0.19.6.1 zeigen die Fenster Zusammenfassung und Letzter Stand und der Befehl bis 60.000 Zeichen
  (`TEXT_GRENZE`) und sagen, wenn sie kürzen; vorher schnitten sie still bei 10.000 ab. Den Rahmen, den
  Claude Code um die Zusammenfassung legt (Satz vorn, `<system-reminder>` mit der Werkzeugliste, Hinweise
  hinten), lässt die Anzeige weg (`ohneRahmen`); gespeichert bleibt der ganze Text.
- Desktop-App: Denkblöcke, die in der Ansicht Normal offen bleiben und sich auch mit ▾ nicht zuklappen
  lassen (gesehen 2026-10-28 in einigen Chats, etwa mit Fable), sind ein Fehler der App. Kein Mod fasst
  Denkblöcke an.
- Jeder Button hat einen Befehl. `hilfe` hinter jedem Befehl erklärt ihn, größere Aktionen wollen `ja`.
  Leitstand seit 0.56.0 (Björns Wunsch, Anthropics Schreibweise): Langform `/leitstand:<funktion>`
  als Markdown-Datei in `leitstand/commands/` (die App setzt `leitstand:` davor; ein Name mit
  Doppelpunkt lässt sich nicht registrieren), beantwortet vom `command.run`-Hook, der `e.command`
  als `leitstand:pause` bekommt (geprüft mit `claude -p --plugin-dir`, 2.1.308). Kurzform `/pause`
  per `$.command.register` und Datei in `commands/`, außer `an`, `aus`, `hilfe`, `vermenschlichen`
  (`OHNE_KURZFORM` in `logic.ts`). Ein neuer Leitstand-Befehl braucht beide Dateien. Alte Namen
  (`/leitstand-pause`, `/adhs-an`) nennen nur den neuen (`ALTE_BEFEHLE`). Die Skill-Suche
  (`lookUpCommand`) übergeht `leitstand:…`, sonst fände `:vermenschlichen` den eigenen Befehl.
  Ungeprüft: ob `/leitstand:pause` mitten in einer Runde sofort wirkt (Markdown-Befehle haben kein
  `immediate`); die Kurzform tut es. Der ADHS-Modus heißt im Leitstand Kurzantworten, Button 📖 (aus) und 📝 (an), seit 0.56.1.
  Seit 0.61.0 startet der Button den Skill `kurzfassen:kurzfassen` (Rückfall `i-have-adhd`), aus mit
  "Kurzfassen aus" oder "normal antworten"; die Ansicht Ausführlich heißt Detailliert.
- Terminal-Band seit leitstand 0.61.0 (Björns Wunsch): dieselben Buttons an denselben Plätzen wie in der App.
  Zeichen im Terminal nur einzellige Nicht-Emoji oder ein Codepoint mit Emoji_Presentation, nie U+FE0F oder
  U+200D; deshalb dort 👤/👥, 🤖, 🔥, 🔐, 🔧, 📡 statt der App-Zeichen. Ein nacktes ⚙ (U+2699) zeichnet
  Windows Terminal zwei Zellen breit, die Lücke dahinter verschwindet.
  `claude -p "/befehl"` in Git Bash: MSYS macht aus einem Argument, das mit `/` beginnt, einen
  Windows-Pfad (`/pause` wird `C:/Program Files/Git/pause`), dann geht der Prompt ans Modell; Namen
  mit Doppelpunkt bleiben heil. Deshalb `MSYS_NO_PATHCONV=1` davor (oder PowerShell); dann laufen
  registrierte Befehle und Markdown-Befehle aus dem Plugin-Ordner (geprüft 2026-10-26).
- Den Vorsatz der App vor Befehlsantworten („leitstand: …") streicht ein `session.append`-Hook;
  dafür steht „(gemeldet vom Mod …)" am Ende. Im Leitstand bekommt es die Antwort, die zuletzt mit
  `merkeAntwort` (`hooks/antwort.ts`) gemerkt wurde; so melden auch seine Teile ihre Antworten.
- `claude plugin validate` lehnt ab, wenn `$` an eine Funktion aus einer anderen Datei geht: `$` nur in
  Funktionen derselben Datei, `on` darf weitergegeben werden. Deshalb beantwortet jeder Teil des
  Leitstands seine Befehle im eigenen `command.run`-Hook; der Leitstand meldet nur ihre Kurzformen an.
  Die Hooks eines Mods liegen in der Reihenfolge ihrer Anmeldung, die erste außen: Der Leitstand
  meldet sich vor seinen Teilen an und holt so die Zeile des Autopiloten nach oben.
- Ein `$.command.run` eines Mods erreicht dessen eigene `command.run`-Hooks nicht, auch nicht die seiner
  Teile (Re-entry-Regel, im Test-Kit geprüft 2026-10-26). Ein Button des Leitstands, der etwas eines Teils
  auslöst, läuft deshalb über einen `ui.press`-Hook im Teil (`{ plugin: 'leitstand', element: '<Key>' }`,
  so bei 🪞 und 🅰️; sofort, auch mitten in einer Runde), oder der Leitstand tut es selbst (📂 öffnet das
  Fenster `leitstand-dateien` direkt). Je Ereignis darf ein Mod nur einen Hook ohne Matcher haben, die Hooks
  der Tests mitgezählt; die Teile geben jedem Hook einen Matcher. Ein Hook, der wirft, verwirft, was die
  äußeren Hooks desselben Mods nach `next` noch tun wollten; die Teile fangen ihre Fehler selbst.
- Herkunft einer Nachricht (`origin.kind`): Desktop-App `sdk`, Handy über Remote Control `bridge`,
  Terminal `composer`. In einer Cloud-Sitzung (claude.ai/code, in der App angesehen) kommt Björns
  Nachricht als `composer` an, und `$.session.surfaces()` ist leer: Hooks, Tools und Befehle
  laufen, aber kein Band, kein Fenster und keine Statuszeile ist zu sehen (geprüft 2026-10-19).
- Passwortschutz des Leitstands seit 0.62.0, nach Herkunft: Unverändert durch gehen `plugin`,
  `task-notification`, `peer`, `peer-send-message`, `coordinator`, `projects-relay`, `observer` und
  `observer-activity`. Zurückgehalten (zwei Minuten, Zeile im Band, Text nur im Speicher) werden `composer`
  und `sdk`, solange eine Oberfläche das Band zeigt. Alles andere (`bridge`, Zeitplan, Slack, Kanal,
  `unclassified`, unbekannte Arten, `composer`/`sdk` ohne Oberfläche) geht ohne das Passwort weiter, mit
  Hinweis an Claude; ein Slash-Befehl läuft, seine Argumente verlieren das Passwort in `command.run`.
- Android-Regel: Kein Mod hält etwas an, das auf dem Handy nicht zu sehen und per Text zu lösen ist.
- Modell- und Aufwandswechsel verwerfen den Cache. Deshalb wählt Modellwahl nur einmal je Aufgabe
  und fragt mitten im Chat bei Opus oder Fable nach.
- Nach `claude plugin update` fehlen in der laufenden Sitzung die `leitstand:*`-Arbeitertypen bis
  zum Neustart; bis dahin `general-purpose` nehmen.
- Einen Katalog nie mit `claude plugin marketplace remove` umstellen: Das deinstalliert seine Mods
  und löscht ihre Einstellungen und Daten. Stattdessen in `settings.json` die Quelle unter
  `extraKnownMarketplaces.bm-mods.source` ändern, dann `claude plugin marketplace add <neue Quelle>`
  (in einer eigenen `CLAUDE_CONFIG_DIR` geprüft, 2.1.303). Solange der Eintrag nicht passt, lehnt
  `add` die neue Quelle ab. Harmlos ist `remove` erst, wenn `claude plugin list` nichts mehr aus dem
  Katalog zeigt; dann entfernt es nur Deklaration, Eintrag in known_marketplaces und Klon (2.1.309).
- Umbenannt am 2026-10-29: `bjoern-mods` heißt `bm-mods` (angezeigt BM-Mods, Repo gleich; geprüft mit 2.1.309).
  Alte Instanzen laufen unter `bjoern-mods` weiter, frische tragen `bm-mods` ein. Umzug in `UPDATE.md`: `marketplace
  add bmueller77/claude-mods#main` (ohne `#main` nur "already on disk"), `uninstall <mod>@bjoern-mods --keep-data`
  (löscht den `pluginConfigs`-Eintrag), `install <mod>@bm-mods`, `store/<mod>_<katalog>-<h>.json` (`<h>` = 12 Hex
  von sha256("<mod>@<katalog>")) kopieren, wenn das Ziel fehlt, Werte per `configure --values-stdin`, neu starten.
- Björn will Uhrzeiten immer in Berliner Zeit, auch auf UTC-Servern und in der Cloud. Alle Mods tun
  das über `Intl.DateTimeFormat` mit `timeZone: 'Europe/Berlin'` (im Sandkasten vorhanden), seit
  statistik 0.16.1, leitstand 0.53.1, reflect 0.2.2, filetree 0.4.1 und visible-compact 0.5.1. Im
  Leitstand steckt das in `hooks/berlin.ts` (`inBerlin`), auch die Tagesschlüssel des Verlaufs.
  Neue Zeitanzeigen nie mit `getHours`, `getDay` oder `toLocale…` ohne `timeZone` bauen.
- Tests laufen auch in der Cloud (Linux, UTC), `TZ` ändert daran nichts. Zeitpunkte in Tests mit
  `Date.UTC` anlegen und Berliner Zeit erwarten, nie `new Date(j, m, t, h, min)`; der Leitstand-Test
  hat dafür `berlinZeit(j, m, t, h, min)`. Windows-Pfade wie `C:\…` sind unter Linux relativ; die
  Engine setzt den Mod-Ordner davor, Test-Attrappen müssen das abschneiden.
- Oberflächen: Das Band über der Eingabe (`AbovePrompt`) zeichnen laut API nur Terminal und
  Desktop-App, ein Fenster (`Pane`) jede Oberfläche.
- Desktop-App: Jeder Mod-Button bekommt denselben Innenabstand (`padding: 0 pad.md`, Höhe `h.control`),
  `plain` auch. Kein Prop macht ihn schmaler oder quadratisch, eine schmale Box drumherum auch nicht.
  Die App rechnet Box-Breiten in `ch`, Höhen in `lh` und Lücken in `ch`, Bruchteile gehen (gelesen
  im Oberflächen-Skript der App, 2026-10-27). Platz schaffen deshalb nur Lücken: Der Leitstand setzt
  seine Buttons seit 0.57.1 eine halbe Zelle auseinander.
- Desktop-App, Band: Senkrechte Zahlen (`marginTop`, `rowGap`, …) zählen halbe Zeilen (10 px), Tokens
  wie `'xs'` gehen auch. Ein Button zählt eine Zeile (20 px), ist aber 28 px hoch und ragt 4 px darüber
  und darunter (negativer `margin-block`). Zwei Button-Zeilen direkt untereinander berühren sich, eine
  7-px-Trennlinie daneben verschwindet unter dem Button. Seit leitstand 0.57.2, statistik 0.18.2,
  zusammenfassung 0.7.1 und naechste-schritte 0.4.1: Trennlinien 15 px (Linie in der Mitte), zwischen
  Button-Zeilen 1.2 halbe Zeilen (4 px frei).
- Am PC kommt der Katalog seit 2026-10-19 von GitHub, seit dem Umzug am 2026-10-30 als bm-mods (Klon
  unter `~/.claude/plugins/marketplaces/bm-mods`, Quelle `bmueller77/claude-mods@main`). Beim Umzug
  waren keine `pluginConfigs` gesetzt; sechs Store-Dateien wurden kopiert, die alten
  `<mod>_bjoern-mods-*.json` und die Sicherung `~/.claude/plugins/store-2026-10-30/` liegen noch da.
  i-have-adhd kommt hier weiter aus dem eigenen Katalog `i-have-adhd`, nicht als `@bm-mods`. Der alte
  Ordner `~/.claude/mods` bleibt liegen, wird aber nicht mehr gelesen. Vorher stand der GitHub-Eintrag in `settings.json` eine Ebene zu tief,
  und das `add` hatte nicht gegriffen. Nach jedem Umstellen `claude plugin marketplace list` ansehen.
- Desktop-App: Solange sie am Rundenende das Feld "nächster Schritt" mit einer Frage und Buttons
  zeigt, ist das ganze Band über der Eingabe ausgeblendet. Mit der nächsten Runde ist es wieder da.
  Das ist kein Mod-Fehler (Live-Test 2026-10-19). Soll Björn das Band sehen, die Runde ohne Frage
  abschließen.
- Desktop-App: Ihre Modellauswahl folgt einem `/model` oder `/effort` eines Mods nicht ("for this
  session only"), im Test blieb sie auf Opus · Extra hoch. Danach galt die Modellwahl als von Hand
  zurückgezogen. Seit modellwahl 0.1.1 stellt der Mod deshalb nur noch je Anfrage über `turn.step` um;
  was gerade antwortet, zeigen die Statuszeile und `/modellwahl:zeigen`. Auch das Werkzeug der App
  (`set_session_model`) lehnt die eigene Sitzung ab ("a session must not silently re-price its own turns").
- Modellwahl seit 0.2.0 (Björns Wunsch): Sie schlägt vor. Am Rechner gilt der Vorschlag nach 15 s von
  selbst, für jedes Modell; die Zeile im Band (Schlüssel `modellwahl`) hat Übernehmen und Nein, der
  Leitstand holt sie nach oben wie die Autopilot-Zeile. Vom Handy (`bridge`) gilt er nie von selbst, nur
  auf `ja`, `ok`, `Okay` oder `/modellwahl ja`; die Nachricht geht trotzdem an Claude. Die erste
  Nachricht eines neuen Chats wartet nicht, sie läuft mit dem Modell aus dem Menü los.
- Leitstand seit 0.54.0, Gruppenarbeit und "Plan zuerst freigeben": Ein Prompt, der mit "Starte sofort"
  beginnt oder (seit 0.63.5.1) als letzter Satz endet, braucht keine Freigabe (Triggerwort, auch für Cron
  per tmux; zählt auch mit "bevor" oder "nicht" im Satz). Herkunft `scheduled-trigger` (`/schedule`,
  Routine, `/loop`) startet nach 30 s wie
  beim Autopiloten; `sdk` ohne Oberfläche (`claude -p`) startet sofort, sonst endete der Lauf vor dem
  Start. `plan_steps` hat `nurLesen`: solche Pläne starten ohne Freigabe, Write/Edit/MultiEdit/
  NotebookEdit sind für sie gesperrt, seit 0.63.5.2 auch Bash- und PowerShell-Befehle, die erkennbar
  schreiben (`writesFiles` in `logic.ts`, Heuristik; Skripte, `python -c` und Befehle über eine Variable
  prüft sie nicht).
- Leitstand seit 0.63.5.2, Plan überlebt Arbeiter und Einschübe: Solange ein Arbeiter (`kind === 'helper'`,
  keine Hintergrund-Shell) läuft, hakt `turn.complete` einen Plan mit offenem Schritt nicht ab, und ein
  Bericht für einen späteren Schritt ändert nur diesen (`applyProgress` mit `keepsEarlier`). Runden mit
  Herkunft `task-notification`, `peer`, `peer-send-message` oder `coordinator` zählen als von Claude selbst
  begonnen, nie als neuer Auftrag (`AGENT_MESSAGE_KINDS`; `plugin` nicht, Prompt Upgrade schickt so Björns
  Nachricht). "Send now" der App bricht die laufende Runde ab wie Esc; ein `prompt.submit` mit `turnId`
  der laufenden Runde bis 10 s vor dem Abbruch macht daraus einen Einschub, und der Auftrag läuft weiter
  (live ungeprüft). Der 30-s-Start (Autopilot, geplante Aufgabe) zählt erst ab sichtbarem Plan. Detailliert
  faltet nie, sondern zeigt so viele Schritte, wie Platz haben, und eine Zeile mit Zählzeichen.
- Leitstand seit 0.63.6.0 (Ideen aus Superpowers und Everything Claude Code, 2026-11-04): Ein angehaltener
  Auftrag (Pause, Esc, nach einem Neustart als pausiert zurückgeholt) läuft weiter, wenn der letzte Satz der
  Nachricht "mach weiter" ist (`endsWithContinue`), mit Plan und Freigabe. Fünfmal derselbe erfolgreiche
  Aufruf der Hauptschleife (`callSignature`, `LOOP_CALLS`) setzt "Claude wiederholt denselben Schritt" und
  gibt Claude bei jedem fünften eine Zeile über `context` des Werkzeugergebnisses ("nur zur Info");
  `mcp__ccd_turn__*` zählt nicht. Die Übergabenotiz (Neuer Chat) hat feste Abschnitte, darunter "Was nicht
  geklappt hat", und bekommt Plan und geänderte Dateien des Auftrags mit (`handoffFacts`);
  `/leitstand:uebergabe-schreiben` schreibt sie ohne zu leeren, `/leitstand:uebergabe-zeigen` ersetzt
  `/leitstand handoff note`. Regeln: Steht eine Regel schon als Projektregel in einem anderen Projekt,
  schlägt das Fenster "Alle Projekte" vor (`auchIn`). Statistik seit 0.19.6.0: Jede Verdichtung der
  Hauptschleife bekommt die Anweisung, festzuhalten, was nicht geklappt hat (`mitFehlwegen`, auch beim
  direkten Compact im Terminal). Ein Sicherungspunkt vor jedem automatischen Compact wurde verworfen: Die
  eingebaute Zusammenfassung deckt Ziel, Fehler, Offenes und nächsten Schritt schon ab, ein Fork kostete
  jedes Mal den vollen Chat.
- Computersteuerung: Das Fenster der Claude-App selbst darf sie nicht bedienen (`request_access` für
  "Claude" wird grundsätzlich abgelehnt). Live-Tests im Band macht Björn; ohne Fenster prüft Claude mit
  `claude -p` und liest den Verlauf unter `~/.claude/projects/<ordner>/<sitzung>.jsonl`.
  Ein neuer Chat (`start_session`) lädt nach `claude plugin update` schon die neuen Versionen, ohne
  Neustart der App. Eine Nachricht aus einer anderen Sitzung (`send_message`, Herkunft `peer`) kommt
  als Text an; ein Slash-Befehl darin läuft nicht als Befehl.
- `$.command.run` und `$.prompt.submit` eines Mods laufen erst, wenn die Sitzung still ist; mitten in einer
  Runde reiht die Engine sie ein, und das `await` löst erst danach auf. Seit leitstand 0.63.4.0, statistik
  0.19.4.0 und prompt-upgrade 0.4.3.0 sagt ein Button das sofort per Toast (`Befehl "/<name>" in die
  Warteschlange eingereiht...`, bei Nachrichten `Nachricht ...`), nur mitten in einer Runde der Hauptschleife.
- Leitstand seit 0.63.4.0: "Braucht dich", Start und der Ton eines wartenden Plans kommen erst mit dem
  `turn.complete` der Runde, die ihn angelegt hat (Atom `planVeiled`); die Werkzeuge sind ab `plan_steps`
  gesperrt. Solange das Band zu sehen ist, beantwortet er Claudes `mcp__ccd_turn__update_plan` selbst und
  reicht die Liste beim `wrap_up` per `$.mcp.call('ccd_turn', 'update_plan', …)` einmal an die App weiter;
  schlägt das fehl, gehen alle Aufrufe wieder an die App (live ungeprüft). Schloss und Schild erfassen IPs
  und Hostnamen an Netz-Stellen (`privacy.ts`), der Passwortschutz nicht. Seit 0.63.6.1 bleibt ein Vierer
  ohne Port oder CIDR sichtbar, wenn direkt davor ein Versionswort, ein `@` oder eine Versionskette steht
  (`isVersionAt`); vorher verdeckte das Schloss "auf Version 1.1.0.0" als IP (gesehen 2026-11-04).
- Nächste Schritte seit 0.4.4.0: Antworten, die Claude ausdrücklich anbietet (Antworte/Schreib/Sag + Phrase in
  Anführungszeichen), stehen vorn als hervorgehobene Buttons und gehen mit einem Klick ab. Für Buttons bei
  Entscheidungsfragen deshalb so fragen: Antworte "ja" oder "nein". Seit 0.4.5.0 bekommt auch eine
  Ja/Nein-Frage am Ende der Antwort ("Soll ich …?") die Buttons Ja und Nein. Seit 0.4.6.0 (Björns Wunsch)
  ist in der App jeder Vorschlag ein ganzer Button mit seinem Text, immer untereinander; die einzeilige Form
  gibt es nicht mehr, auch nicht im Terminal.
- Platz im Band (seit leitstand 0.63.5.0 u. a.): Die App gibt `maxRows` fest 12, sichtbar sind etwa 13
  Zeilen (`scroll.bodyRows`, gelesen im App-Code). `hooks/band.ts` ist in leitstand, statistik,
  zusammenfassung, naechste-schritte und modellwahl wortgleich (nur Zeilenenden verschieden; jede Änderung
  in alle fünf, `BAND_VERSION` hochzählen). Jeder Mod veröffentlicht `{ v, voll, klein }` im eigenen
  `$.state` (`bandHoehe`, Familie je Fläche, geschrieben per `$.clock.after(0)` nur bei Änderung; beim
  Zeichnen schreiben lehnt die Engine ab) und liest die der anderen (fremdes Lesen geht ohne
  `dependencies`). `plane` wählt für alle dieselbe Stufe: Zusammenfassung klein, dann Nächste Schritte
  einzeilig (seit naechste-schritte 0.4.6.0 ohne Wirkung, voll = klein), dann faltet der Leitstand wie in
  Normal; passt nichts, scrollt das Band. Die Hooks liegen in Ladereihenfolge, auf jeder Instanz anders;
  die Lösung hängt nicht davon ab.

## Offen (Stand 2026-10-26, nach dem Live-Test am PC)

1. Live-Test am PC (2026-10-19). Es klappen: Button-Befehle (`/leitstand-hilfe`, Verdecken an/aus,
   `hilfe`, `ja`-Abfrage), automatische Modellwahl im neuen Chat samt Statuszeile,
   Prompt-Upgrade-Automatik (App-Nachricht wird angehalten, Fenster mit Rückfragen, `>` geht direkt
   raus), Reflect-Band nach einer Korrektur, Berliner Zeit in Statistik (WL "So 02:00") und Verlauf.
   Gefunden und behoben: Modellwahl zog sich nach ihrem eigenen `/model` und `/effort` sofort
   fälschlich zurück und verglich danach mit dem alten Modell, sodass `/modellwahl <große Aufgabe>`
   "bleibt bei Opus" sagte statt nachzufragen (0.1.1). Der Leitstand machte aus einem Fortschritt
   ohne Schrittnamen (Haiku ließ ihn weg) einen neuen Schritt "Arbeitet daran" (0.53.2).
   Nachprüfung 0.1.1 am 2026-10-25 bestanden: "Zurückgezogen: nein" nach der ersten Runde,
   Rückfrage vor Opus, `/modellwahl ja`. Nicht gemacht: Rückzug bei Umstellung von Hand in der App.
   Nicht ausdrücklich bestätigt: Abbrechen in Prompt Upgrade legt den Text zurück ins Feld.
   Live-Test 2026-10-25/26 (modellwahl 0.2.0, leitstand 0.54.0) bestanden: erste Nachricht schlägt
   vor und läuft sofort mit dem Modell aus dem Menü, nach 15 s gilt der Vorschlag (nächste Runde von
   Haiku), nach 13 h noch "Zurückgezogen: nein"; `/modellwahl` vom Handy wartet auf ja ("10 Minuten
   lang"). Gruppenarbeit: "Starte sofort", eine Antwort nur im Chat und ein Lese-Plan ohne Startwort
   (Haiku setzte `nurLesen` selbst) liefen ohne "los"; ein Plan zum Ändern wartete. Gefunden und
   behoben: Grund endete auf "Doku,." (0.2.1). Noch nicht gesehen: Band mit Countdown, Übernehmen und
   Nein am Rechner; `ja`/`ok` vom Handy; geplante Aufgabe nach 30 s.
2. Leitstand: Im Test-Chat (Haiku) stand das Band Minuten nach Rundenende noch auf "Arbeitet" mit
   "Nutzt eine verbundene App". Im Nachbau zeigt es nach Rundenende richtig "Braucht dich". Ursache
   offen; am wahrscheinlichsten (Untersuchung 2026-10-31): ein MCP-Werkzeug der Hauptschleife kam nie
   zurück, `activity` steht vor `next`, und die 3-Minuten-Erkennung schweigt, weil auch Ereignisse der
   Helfer `noteSign` rufen. Nicht nachgestellt; beobachten.
3. Schild 🛡️ (`/leitstand-geheimnisse-sichern`): Björns Test an einer anderen Instanz steht aus.
4. Instanzen mit `UPDATE.md` aktualisieren (Björn). Alle haben seit 2026-10-27 Zugang zum Repo.
5. Kleinkram: tsc-Altfehler in filetree (3); der Mod steht nicht mehr im Katalog, sein Code im Leitstand
   ist sauber. Behoben am 2026-10-31: "Bearbeiten" in Prompt Upgrade ist zehn Zeilen hoch (0.4.3.1), der
   tsc-Fehler in visible-compact (0.6.2.2), und die Zusammenfassung gibt Slash-Befehle nur noch als
   `[Befehl] /name` ohne Argumente ans Modell (0.7.4.1; ob es die Regel befolgt, ist live ungeprüft).
6. Live-Test ausstehend: leitstand 0.57.0 (🪞 Selbstkritik mit Fenster, Regel-Fenster nach einer Korrektur
   (seit 0.63.2.0), 📂 Dateien, 🅰️ Autopilot, alles jetzt im Leitstand) und statistik 0.18.0 (Schwamm räumt mit
   Sicherungspunkt auf, `/statistik:letzter-stand-zeigen`). Das Fenster Dateien öffnet sich, wie bei
   Filetree, bei jedem Sitzungsstart. Behoben in 0.63.5.2: "Braucht dich" kam, bevor der Autopilot eine
   Rückfrage ablehnte, und Pause traf nach einer Helfer-Runde den Helfer (`runningTurn`).
7. Die READMEs von reflect und modellwahl haben keine Installationszeile; `claude plugin validate`
   schlägt `/plugin install <mod> --marketplace bmueller77/claude-mods` vor.
8. Live-Test ausstehend: leitstand 0.61.0 im echten Terminal (Breite der Zeichen, ob ❓ zwei Zellen zählt,
   Umbruch der Button-Zeile, Leuchten auf `suggestion`) und Kurzfassen per 📖/📝.
9. Leitstand (gesehen 2026-10-28): Endet eine Runde, während Helfer im Hintergrund laufen, hakt er den Plan
   als Fertig ab, und der Rest braucht eine neue Freigabe. Der Passwortschutz hielt am selben Tag
   vermutlich zweimal den Bericht eines Helfers als Eingabe zurück; der Bericht kam nicht an, und Björn
   bekam nur den Hinweis "Ein Hook hat deine Eingabe blockiert". Björn: mindestens eine Freigabe anbieten.
   Der Teil zum Passwortschutz ist behoben in leitstand 0.62.0: Berichte von Helfern gehen durch, eine
   zurückgehaltene Nachricht steht im Band mit Trotzdem senden und Verwerfen (`/trotzdem-senden`,
   `/nachricht-verwerfen`). Ungeprüft: ob die Desktop-App ein `$.prompt.submit` mit `asUser` annimmt.
   Das Abhaken ist behoben in 0.63.5.2 (siehe Fachliches). Nach einem Neustart der App kam der Plan als
   pausiert zurück, aber nur ein bloßes "weiter" setzte ihn fort; eine längere Nachricht mit "Mach bitte
   weiter" am Ende begann einen neuen Auftrag (gesehen 2026-10-31). Behoben in 0.63.6.0 (`endsWithContinue`).
10. Hilfe und Einstellungen (2026-10-29, Commit 56d3892): Zwei Runden mit Prüfern ohne Vorwissen
   (Explore-Helfer, die einzigen ohne CLAUDE.md; `claude -p` aus der App heraus ist nicht angemeldet).
   Leitfaden: gleiche Abschnitte je `/<mod>:hilfe`, Standard für neue Chats per "Sag Claude" oder
   `claude plugin configure <mod>@bm-mods --values-stdin`, `hilfe` an jedem Befehl ändert nichts.
   Noten zuletzt 2 bis 3,5. Offen, weil Feature statt Text: vom Handy erfährt man "Claude braucht dich"
   nicht (nur Leiste am Rechner); Statistik-Leiste, Nächste Schritte und das Fenster von Visible
   Compact lassen sich je Chat nicht abschalten (`/leitstand handoff note` heißt seit leitstand 0.63.6.0
   `/leitstand:uebergabe-zeigen`). Live-Test ausstehend: die neuen Texte und 2 px Luft unter den Buttons der
   Zusammenfassung (`marginTop={0.2}`).
11. Live-Test ausstehend (2026-10-31): Warteschlangen-Toasts, "Braucht dich" erst nach der Plan-Nachricht,
   Detailliert mit allen Schritten, App-Liste nur am Ende (erreicht `$.mcp.call` den Server `ccd_turn`?),
   Antwort-Buttons in Nächste Schritte, IPs/Hostnamen im Schloss. Dazu die Platz-Regel (leitstand 0.63.5.0,
   statistik 0.19.5.0, zusammenfassung 0.7.4.0, naechste-schritte 0.4.5.0, modellwahl 0.3.4.0) und die
   Ja/Nein-Buttons. Die Button-Reihe des Leitstands am Desktop misst seit 0.63.5.2 `appButtonRows` in
   `logic.ts` (Buchstabe 0,8 ch, Emoji 2,5 ch, geschätzt; `zeilenVon` in `band.ts` zählte 4,8 Zeilen bei 80
   Spalten, jetzt eine). Live prüfen, ob das Band dann noch überläuft oder Platz verschenkt.
12. Live-Test ausstehend (2026-10-31, leitstand 0.63.5.2, prompt-upgrade 0.4.3.1, zusammenfassung 0.7.4.1):
   Einschub per "Send now": am 2026-11-04 bestanden, aber anders als gedacht. Die App brach die Runde nicht
   ab, sondern schob den laufenden Befehl in den Hintergrund, und die Nachricht kam als `queued_command`
   in die laufende Runde (`remove` mit `reason: "absorbed_mid_turn"` im Verlauf); Plan und Werkzeuge
   blieben. Die Erkennung über `turnId` und Abbruch griff dabei nicht ein. Offen: Berichte von Arbeitern
   ohne neue Freigabe, Bash-Sperre in Lese-Plänen, Detailliert im engen Band, Bearbeiten-Feld im Fenster
   von Prompt Upgrade. Gesehen, nicht geklärt: `mcp__ccd_turn__update_plan` mit `advance` antwortete einmal
   "every step is done" nach dem ersten von acht Schritten.
13. Live-Test 2026-11-04 am PC (leitstand 0.63.6.0, statistik 0.19.6.0, naechste-schritte 0.4.6.0,
   sorgfalt 0.1.0.0). Bestanden: Schleifen-Melder (die `context`-Zeile kam nach dem fünften gleichen Aufruf
   bei Claude an; die Zeile im Band hat Björn nicht gesehen); Einschub (siehe Offen 12); Pause, dann "Kurz
   unterbrochen. Mach bitte weiter": derselbe Auftrag mit Plan und Freigabe; die Hintergrund-Zeile wird mit
   dem Rundenende nach dem Ende des Befehls abgehakt; `/uebergabe-schreiben` (alle Abschnitte samt "Stand
   laut Leitstand") und `/uebergabe-zeigen` (Eingabefeld); Nächste Schritte als ganze Buttons untereinander;
   `sorgfalt:debuggen` griff bei unerwartetem Verhalten. Gefunden und behoben: Das Schloss verdeckte
   "Version 1.1.0.0" (0.63.6.1) und "Versionen wie 1.1.0.0", wobei `cleanName` die Nummer aus der
   Schritt-Zusammenfassung warf (0.63.6.2). Der Abschnitt "Was nicht geklappt hat" steht in der
   Zusammenfassung des Compacts (ab Zeichen 15.042 von 17.295), aber das Fenster schnitt still bei 10.000
   ab und zeigte den Anfang als Rohtext, weil der `<system-reminder>`-Block ohne Leerzeile davor stand
   (statistik 0.19.6.1). Gesehen, offen:
   - Lange Pausen (`Start-Sleep 150`) sperrt die Umgebung. Als Zeitfenster für Björns Eingriffe dienen
     die Tests aller Mods nacheinander (etwa 115 s); vorher auf sein "bereit" warten.
   - Ein "ja" gab einen Plan nicht frei, als nach der Frage noch eine Stand-Zeile kam (Kurzfassen schreibt
     den Stand ans Ende); der Leitstand sieht die Frage nur am Ende der Antwort.
   - Nächste Schritte: Ein einzelner Backtick bleibt im Vorschlag stehen (`leseVorschlaege` schneidet nur
     am Rand).
   - Die Aufgabenliste der App zählte nach einem neuen Plan "Schritt 3, 4 von 7" bei sechs Schritten.
   - Schrittnamen über 40 Zeichen kürzt `cleanName` mit "…".
   - `mcp__ccd_turn__update_plan` mit `advance` meldete wieder "every step is done", diesmal nach Schritt 2
     von 4 (wie in Offen 12).
   Noch nicht gesehen: das Fenster Zusammenfassung von statistik 0.19.6.1 live, Vorschlag "Alle Projekte"
   im Fenster Regeln, `belegen` von selbst, Breite der Kürzung `knopfText` bei langen Vorschlägen.
