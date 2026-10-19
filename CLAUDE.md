# Björns Claude-Code-Mods (Katalog bjoern-mods)

Dieses Repo ist der Katalog `bjoern-mods`. Seit 2026-10-19 pflegt Claude ihn hier auf GitHub, und
`main` ist der Stand, den jede Instanz mit `claude plugin marketplace update bjoern-mods` bekommt.
Die vollständige Übergabe vom PC steht in `docs/uebergabe-2026-10-19.md`.

Mit Björn immer Deutsch, kurz, Ergebnis zuerst.

## Aufbau

- Ein Ordner je Mod: `.claude-plugin/plugin.json` (mit Version), `hooks/`, `types/`, `tests/`.
- `.claude-plugin/marketplace.json` ist der Katalog. `i-have-adhd` ist fremd und kommt direkt aus
  `ayghri/i-have-adhd`.
- `commands/` hält eine kleine Datei je Befehl (`/<mod>-<funktion>[-<wert>]`, `/<mod>-hilfe` usw.).
  Kopiert nach `~/.claude/commands/`, kennt die Desktop-App die Befehle schon in der ersten
  Nachricht. Bekommt ein Mod einen Befehl dazu oder verliert er einen, muss die Datei mitziehen.
- `README.md` sagt, was jeder Mod tut. `UMSTIEG.md` ist der Prompt für andere Instanzen,
  `install.sh` installiert alles.

## Arbeitsweise

- Vor der Arbeit an Mods den Skill `plugin-authoring` laden, für deutsche Texte `vermenschlichen`.
- Alle sichtbaren Texte deutsch mit echten Umlauten.
- Jede Änderung an einem Mod zählt dessen Version in `plugin.json` hoch. Commit-Titel wie bisher:
  `<mod> <version>: <was sich ändert>`; betrifft es mehrere Mods, eine Liste im Text. Autor ist
  Björn (`--author="Björn Müller <bjoern@mueller.family>"`), dazu die Zeile `Co-Authored-By`.
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
- Zip für Instanzen ohne Repo-Zugang:
  `git archive --format=zip --prefix=bjoern-mods/ -o bjoern-mods-<datum>.zip HEAD`. Datum und
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
- Jeder Knopf hat einen Befehl. `hilfe` hinter jedem Befehl erklärt ihn, größere Aktionen wollen `ja`.
- Den Vorsatz der App vor Befehlsantworten („leitstand: …") streicht ein `session.append`-Hook;
  dafür steht „(gemeldet vom Mod …)" am Ende.
- Herkunft einer Nachricht (`origin.kind`): Desktop-App `sdk`, Handy über Remote Control `bridge`,
  Terminal `composer`. In einer Cloud-Sitzung (claude.ai/code, in der App angesehen) kommt Björns
  Nachricht als `composer` an, und `$.session.surfaces()` ist leer: Hooks, Tools und Befehle
  laufen, aber kein Band, kein Fenster und keine Statuszeile ist zu sehen (geprüft 2026-10-19).
- Android-Regel: Kein Mod hält etwas an, das auf dem Handy nicht zu sehen und per Text zu lösen ist.
- Modell- und Aufwandswechsel verwerfen den Cache. Deshalb wählt Modellwahl nur einmal je Aufgabe
  und fragt mitten im Chat bei Opus oder Fable nach.
- Nach `claude plugin update` fehlen in der laufenden Sitzung die `leitstand:*`-Arbeitertypen bis
  zum Neustart; bis dahin `general-purpose` nehmen.
- Einen Katalog nie mit `claude plugin marketplace remove` umstellen: Das deinstalliert seine Mods
  und löscht ihre Einstellungen und Daten. Stattdessen in `settings.json` die Quelle unter
  `extraKnownMarketplaces.bjoern-mods.source` ändern, dann `claude plugin marketplace add <neue Quelle>`
  (in einer eigenen `CLAUDE_CONFIG_DIR` geprüft, 2.1.303). Solange der Eintrag nicht passt, lehnt
  `add` die neue Quelle ab.
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
- Am PC kommt bjoern-mods seit 2026-10-19 von GitHub (Klon unter
  `~/.claude/plugins/marketplaces/bjoern-mods`). Der alte Ordner `~/.claude/mods` bleibt liegen,
  wird aber nicht mehr gelesen. Vorher stand der GitHub-Eintrag in `settings.json` eine Ebene zu tief,
  und das `add` hatte nicht gegriffen. Nach jedem Umstellen `claude plugin marketplace list` ansehen.
- Desktop-App: Solange sie am Rundenende das Feld "nächster Schritt" mit einer Frage und Knöpfen
  zeigt, ist das ganze Band über der Eingabe ausgeblendet. Mit der nächsten Runde ist es wieder da.
  Das ist kein Mod-Fehler (Live-Test 2026-10-19). Soll Björn das Band sehen, die Runde ohne Frage
  abschließen.
- Desktop-App: Ihre Modellauswahl folgt einem `/model` oder `/effort` eines Mods nicht ("for this
  session only"), im Test blieb sie auf Opus · Extra hoch. Danach galt die Modellwahl als von Hand
  zurückgezogen. Seit modellwahl 0.1.1 stellt der Mod deshalb nur noch je Anfrage über `turn.step` um;
  was gerade antwortet, zeigen die Statuszeile und `/modellwahl-zeigen`.

## Offen (Stand 2026-10-19, nach dem Live-Test am PC)

1. Live-Test am PC (2026-10-19). Es klappen: Knopf-Befehle (`/leitstand-hilfe`, Verdecken an/aus,
   `hilfe`, `ja`-Abfrage), automatische Modellwahl im neuen Chat samt Statuszeile,
   Prompt-Upgrade-Automatik (App-Nachricht wird angehalten, Fenster mit Rückfragen, `>` geht direkt
   raus), Reflect-Band nach einer Korrektur, Berliner Zeit in Statistik (WL "So 02:00") und Verlauf.
   Gefunden und behoben: Modellwahl zog sich nach ihrem eigenen `/model` und `/effort` sofort
   fälschlich zurück und verglich danach mit dem alten Modell, sodass `/modellwahl <große Aufgabe>`
   "bleibt bei Opus" sagte statt nachzufragen (0.1.1). Der Leitstand machte aus einem Fortschritt
   ohne Schrittnamen (Haiku ließ ihn weg) einen neuen Schritt "Arbeitet daran" (0.53.2).
   Nach Update und Neustart nachprüfen: Modellwahl im neuen Chat (`/modellwahl-zeigen` nach der
   ersten Runde "Zurückgezogen: nein"; Rückfrage mit `/modellwahl <große Aufgabe>`, dann
   `/modellwahl ja`; Rückzug bei Umstellung von Hand in der App). Nicht ausdrücklich bestätigt:
   Abbrechen in Prompt Upgrade legt den Text zurück ins Feld.
2. Leitstand: Im Test-Chat (Haiku) stand das Band Minuten nach Rundenende noch auf "Arbeitet" mit
   "Nutzt eine verbundene App". Im Nachbau zeigt es nach Rundenende richtig "Braucht dich". Ursache
   offen (Helfer als laufend gezählt? `turn.complete` nicht angekommen?); beobachten.
3. Schild 🛡️ (`/leitstand-geheimnisse-sichern`): Björns Test an einer anderen Instanz steht aus.
4. Instanzen mit `UMSTIEG.md` und Zip umstellen (Björn).
5. Kleinkram: „Bearbeiten" in Prompt Upgrade ist einzeilig; tsc-Altfehler in visible-compact (1)
   und filetree (3). Die Zusammenfassung las das Argument von `/modellwahl <Aufgabe>` als Auftrag
   und meldete, er sei "nicht bearbeitet" worden.
6. Die READMEs von reflect und modellwahl haben keine Installationszeile; `claude plugin validate`
   schlägt `/plugin install <mod> --marketplace bmueller77/claude-mods` vor.
