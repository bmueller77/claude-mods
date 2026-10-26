# Björns Claude-Code-Mods (Katalog bjoern-mods)

Dieses Repo ist der Katalog `bjoern-mods`. Seit 2026-10-19 pflegt Claude ihn hier auf GitHub, und
`main` ist der Stand, den jede Instanz mit `claude plugin marketplace update bjoern-mods` bekommt.
Die vollständige Übergabe vom PC steht in `docs/uebergabe-2026-10-19.md`.

Mit Björn immer Deutsch, kurz, Ergebnis zuerst.

## Aufbau

- Ein Ordner je Mod: `.claude-plugin/plugin.json` (mit Version), `hooks/`, `types/`, `tests/`.
- `.claude-plugin/marketplace.json` ist der Katalog. `i-have-adhd` ist fremd und kommt direkt aus
  `ayghri/i-have-adhd`.
- `commands/` hält eine kleine Datei je Befehl (`/<mod>-<funktion>[-<wert>]`, `/<mod>-hilfe` usw.;
  beim Leitstand nur die Kurzformen, seine Langformen `/leitstand:…` liegen in `leitstand/commands/`).
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
  Leitstand seit 0.56.0 (Björns Wunsch, Anthropics Schreibweise): Langform `/leitstand:<funktion>`
  als Markdown-Datei in `leitstand/commands/` (die App setzt `leitstand:` davor; ein Name mit
  Doppelpunkt lässt sich nicht registrieren), beantwortet vom `command.run`-Hook, der `e.command`
  als `leitstand:pause` bekommt (geprüft mit `claude -p --plugin-dir`, 2.1.308). Kurzform `/pause`
  per `$.command.register` und Datei in `commands/`, außer `an`, `aus`, `hilfe`, `vermenschlichen`
  (`OHNE_KURZFORM` in `logic.ts`). Ein neuer Leitstand-Befehl braucht beide Dateien. Alte Namen
  (`/leitstand-pause`, `/adhs-an`) nennen nur den neuen (`ALTE_BEFEHLE`). Die Skill-Suche
  (`lookUpCommand`) übergeht `leitstand:…`, sonst fände `:vermenschlichen` den eigenen Befehl.
  Ungeprüft: ob `/leitstand:pause` mitten in einer Runde sofort wirkt (Markdown-Befehle haben kein
  `immediate`); die Kurzform tut es. Der ADHS-Modus heißt im Leitstand Kurzantworten.
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
  was gerade antwortet, zeigen die Statuszeile und `/modellwahl-zeigen`. Auch das Werkzeug der App
  (`set_session_model`) lehnt die eigene Sitzung ab ("a session must not silently re-price its own turns").
- Modellwahl seit 0.2.0 (Björns Wunsch): Sie schlägt vor. Am Rechner gilt der Vorschlag nach 15 s von
  selbst, für jedes Modell; die Zeile im Band (Schlüssel `modellwahl`) hat Übernehmen und Nein, der
  Leitstand holt sie nach oben wie die Autopilot-Zeile. Vom Handy (`bridge`) gilt er nie von selbst, nur
  auf `ja`, `ok`, `Okay` oder `/modellwahl ja`; die Nachricht geht trotzdem an Claude. Die erste
  Nachricht eines neuen Chats wartet nicht, sie läuft mit dem Modell aus dem Menü los.
- Leitstand seit 0.54.0, Gruppenarbeit und "Plan zuerst freigeben": Ein Prompt, der mit "Starte sofort"
  beginnt, braucht keine Freigabe (Triggerwort, auch für Cron per tmux; zählt auch mit "bevor" oder
  "nicht" im Satz). Herkunft `scheduled-trigger` (`/schedule`, Routine, `/loop`) startet nach 30 s wie
  beim Autopiloten; `sdk` ohne Oberfläche (`claude -p`) startet sofort, sonst endete der Lauf vor dem
  Start. `plan_steps` hat `nurLesen`: solche Pläne starten ohne Freigabe, Write/Edit/MultiEdit/
  NotebookEdit sind für sie gesperrt (Bash nicht, bekannte Lücke).
- Computersteuerung: Das Fenster der Claude-App selbst darf sie nicht bedienen (`request_access` für
  "Claude" wird grundsätzlich abgelehnt). Live-Tests im Band macht Björn; ohne Fenster prüft Claude mit
  `claude -p` und liest den Verlauf unter `~/.claude/projects/<ordner>/<sitzung>.jsonl`.
  Ein neuer Chat (`start_session`) lädt nach `claude plugin update` schon die neuen Versionen, ohne
  Neustart der App. Eine Nachricht aus einer anderen Sitzung (`send_message`, Herkunft `peer`) kommt
  als Text an; ein Slash-Befehl darin läuft nicht als Befehl.

## Offen (Stand 2026-10-26, nach dem Live-Test am PC)

1. Live-Test am PC (2026-10-19). Es klappen: Knopf-Befehle (`/leitstand-hilfe`, Verdecken an/aus,
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
   offen (Helfer als laufend gezählt? `turn.complete` nicht angekommen?); beobachten.
3. Schild 🛡️ (`/leitstand-geheimnisse-sichern`): Björns Test an einer anderen Instanz steht aus.
4. Instanzen mit `UMSTIEG.md` und Zip umstellen (Björn).
5. Kleinkram: „Bearbeiten" in Prompt Upgrade ist einzeilig; tsc-Altfehler in visible-compact (1)
   und filetree (3). Die Zusammenfassung las das Argument von `/modellwahl <Aufgabe>` als Auftrag
   und meldete, er sei "nicht bearbeitet" worden.
6. Die READMEs von reflect und modellwahl haben keine Installationszeile; `claude plugin validate`
   schlägt `/plugin install <mod> --marketplace bmueller77/claude-mods` vor.
