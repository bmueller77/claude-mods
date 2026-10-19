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
  gelegt hat (das tut sie beim Laden; der Ordner ist in `.gitignore`). Am PC liegen eigene
  tsconfig-Dateien unter `d:\temp\claude\ns-tsc-7e39\`.
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
  Terminal `composer`. Was eine Cloud-Sitzung in der App liefert, ist noch nicht geprüft.
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
- Tests laufen auch in der Cloud (Linux, UTC). Zeiten in Tests deshalb in Ortszeit anlegen
  (`new Date(j, m, t, h, min)`), nicht mit `Date.UTC`. Windows-Pfade wie `C:\…` sind unter Linux
  relativ; die Engine setzt den Mod-Ordner davor, Test-Attrappen müssen das abschneiden.
- `TZ` setzt die Zeitzone im Test-Sandkasten nicht. Wer Uhrzeiten anzeigt, zeigt in der Cloud UTC.
- Oberflächen: Das Band über der Eingabe (`AbovePrompt`) zeichnen laut API nur Terminal und
  Desktop-App, ein Fenster (`Pane`) jede Oberfläche.

## Offen (Stand 2026-10-19)

1. Live-Test am PC nach Neustart: Knopf-Befehle, Modellwahl (automatische Wahl, Statuszeile,
   `/modellwahl-zeigen`, Rückfrage mit `/modellwahl ja`, Rückzug bei manueller Umstellung),
   Prompt-Upgrade-Automatik (`sdk`), Reflect-Band.
2. Modellwahl: Die App-Auswahl zeigt die Wahl nicht. Unklar, ob die App nach unserem `/model`
   selbst ein `set_model` schickt (dann zöge sich Modellwahl fälschlich zurück).
3. Schild 🛡️ (`/leitstand-geheimnisse-sichern`): Björns Test an einer anderen Instanz steht aus.
4. Instanzen mit `UMSTIEG.md` und Zip umstellen (Björn).
5. Kleinkram: „Bearbeiten" in Prompt Upgrade ist einzeilig; tsc-Altfehler in visible-compact (1)
   und filetree (3).
6. Statistik zeigt Uhrzeiten in der Zeitzone des Rechners, auf UTC-Servern und in der Cloud also
   zwei Stunden daneben (Sommerzeit). Frage an Björn: immer Berlin-Zeit zeigen?
7. Die READMEs von reflect und modellwahl haben keine Installationszeile; `claude plugin validate`
   schlägt `/plugin install <mod> --marketplace bmueller77/claude-mods` vor.
