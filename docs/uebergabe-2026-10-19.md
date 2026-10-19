# Übergabe: Björns Claude-Code-Mods (Stand 2026-10-19)

Für einen frischen Chat, der an Björns Mods weiterarbeitet. Sprache mit Björn: immer Deutsch, kurz, Ergebnis zuerst.

## Wo alles liegt (nicht hier wiederholt, dort nachlesen)

| Was | Ort |
|---|---|
| Mods (lokaler Katalog "bjoern-mods", wird direkt aus dem Ordner geladen) | `C:\Users\BjoernMueller\.claude\mods\<mod>` und `...\mods\.claude-plugin\marketplace.json` |
| Repo (privat, GitHub bmueller77/claude-mods), Stand `d518ea6`, gepusht, sauber | `E:\Development\claude-mods` (README.md, UMSTIEG.md = Prompt für andere Instanzen, install.sh, commands/) |
| Befehlsdateien für die Desktop-App (124 Stück) | `C:\Users\BjoernMueller\.claude\commands\` (gleich wie `commands/` im Repo) |
| Doku im Vault (Mod-Tabelle, Einstellungen je Chat, Befehle, Meldungen, Tokenkosten) | `C:\Users\BjoernMueller\Obsidian Vault\ClaudeCowork-Wiki\arbeitsumgebung\claude-code-mods.md` |
| Änderungsprotokoll (neuester Tag oben, Abschnitt `## 2026-10-19`) | `...\ClaudeCowork-Wiki\log.md`, Ablageorte in `...\arbeitsumgebung\ablageorte.md` |
| Letztes Zip für Instanzen ohne Repo | Sitzungsordner `bjoern-mods-2026-10-19.zip` (neu bauen: siehe Arbeitsweise) |
| Arbeits- und Hilfsskripte, Untersuchungen, Sicherungen | `d:\temp\claude\ns-tsc-7e39\` (tsconfig.<mod>.json, untersuchung-*/, store-backup-*) |
| Björns Gedächtnis zu Arbeitsregeln | `C:\Users\BjoernMueller\.claude\projects\...scratch-2026-10-17-cb7e05\memory\` (MEMORY.md als Index) |

## Stand in einem Satz je Mod

Elf Mods installiert (Versionen in den jeweiligen `plugin.json` bzw. Vault-Tabelle): leitstand 0.53.0, statistik 0.16.0,
naechste-schritte 0.3.0, zusammenfassung 0.6.0, visible-compact 0.5.0 (deutsch), autopilot 0.7.1, filetree 0.4.0 (deutsche
Fassung, Original `filetree@claude-code-filetree` nur abgeschaltet), reflect 0.2.1, prompt-upgrade 0.3.1, modellwahl 0.1.0,
dazu i-have-adhd (fremd). Was jeder tut: README.md im Repo und Vault-Tabelle.

Querschnitt (alles in Vault und Commits beschrieben):
- Einstellungen je Chat; Standard aus dem Einstellungsmenü (userConfig). Leitstand-Standard: Auto-Modus, Verdecken und Passwortschutz an, Ansicht minimal, Rest aus.
- Jeder Knopf hat einen Befehl `/<mod>-<funktion>[-<wert>]`, `/<mod>-hilfe`, `hilfe` hinter jedem Befehl; größere Aktionen wollen `ja`.
- Vorsatz der App vor Befehlsantworten ("leitstand: …") wird per `session.append`-Hook gestrichen, dafür "(gemeldet vom Mod …)" am Ende.
- Alle sichtbaren Texte deutsch mit echten Umlauten.
- Herkunft von Nachrichten: Desktop-App `origin.kind` = `sdk`, Handy (Remote Control) = `bridge`, Terminal = `composer`.
- Android-Regel: kein Mod hält etwas an, das auf dem Handy nicht sichtbar und per Text lösbar ist.
- Cache: Modell- UND Aufwandswechsel verwerfen den Cache (Modell: alles; Aufwand: mindestens den Verlauf). Deshalb wählt Modellwahl nur einmal je Aufgabe und fragt mitten im Chat bei Opus/Fable nach.

## Offen bzw. ungeprüft

1. **Live-Test nach Neustart** (Björn): Befehle für die Knöpfe, Modellwahl (automatische Wahl im neuen Chat, Statuszeile, `/modellwahl-zeigen`, Rückfrage mit `/modellwahl ja`, Rückzug bei manueller Umstellung), Prompt-Upgrade-Automatik am PC (jetzt `sdk`), Reflect-Band. Reflect lernt offenbar schon: Im Sitzungsordner steht eine `CLAUDE.md` mit "Antworte immer auf Deutsch." (vermutlich "Nur dieses Projekt" gespeichert).
2. **Modellwahl-Risiken:** Die App-Modellauswahl zeigt die Wahl nicht; unklar, ob die App nach unserem `/model` selbst ein `set_model` schickt (würde fälschlich "zurückgezogen"); Limit-Prozent-Schätzung kalibriert sich erst aus Runden.
3. **Schild-Funktion 🛡️** (`/leitstand-geheimnisse-sichern`): Björn wollte sie an einer anderen Instanz testen; Ergebnis steht aus.
4. **Instanzen umstellen:** Björn gibt `UMSTIEG.md` (Prompt) und das Zip an Server-Instanzen und Laptop weiter.
5. **Kleinkram:** Prompt Upgrade "Bearbeiten" ist einzeilig; tsc-Altfehler in visible-compact (1) und filetree (3); der alte, abgeschaltete Mod `nachtschicht` hat denselben `sdk`-Fehler (egal, solange aus).
6. Nach `claude plugin update` verschwinden in der laufenden Sitzung die `leitstand:*`-Arbeitertypen bis zum Neustart; dann `general-purpose` nutzen.

## Arbeitsweise (bewährt, bitte beibehalten)

- **Leitstand-Regeln:** Vor jedem Werkzeug `plan_steps`; in der Gruppenarbeit wartet der Plan auf "los"/Start. Gruppenarbeit: Umsetzung an `leitstand:*`-Arbeiter (schnell/leicht/mittel/sorgfaeltig/schwer/fable), selbst nur planen, entscheiden, prüfen; jeden Bericht am Diff prüfen.
- **Prüfen je Mod:** `claude plugin validate C:/Users/BjoernMueller/.claude/mods/<mod>`, `claude plugin test C:/Users/BjoernMueller/.claude/mods/<mod>` (Pfade mit Schrägstrichen), Typprüfung `node ~/AppData/Local/npm-cache/_npx/14bc6daa9daf5ec7/node_modules/typescript/bin/tsc -p d:/temp/claude/ns-tsc-7e39/tsconfig.<mod>.json` (Namen: leitstand, autopilot, statistik2, zf, naechste, reflect, prompt-upgrade, vc, filetree, modellwahl).
- **Zeilenenden:** gemischt je Mod (leitstand/statistik/visible-compact/filetree meist CRLF); erhalten. Änderungen per Python-Skript, das mit dem Write-Tool angelegt wird (Bash-Heredocs verschlucken Backslashes), `io.open(..., newline='')`, `python -I`.
- **Repo:** git hat systemweit `core.autocrlf=true` → `git -c core.autocrlf=false add …`, danach Bytes prüfen (`git cat-file -p :<datei> | cmp - <quelle>`). Commit-Identität wie in den bisherigen Commits (`git log`), mit Zeile `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Zip: `git -c core.autocrlf=false archive --format=zip --prefix=bjoern-mods/ -o <ziel> HEAD`.
- **Einspielen:** `claude plugin marketplace update bjoern-mods`, `claude plugin update <mod>@bjoern-mods` bzw. `install`; wirkt nach Neustart der App.
- **Pushen:** Björns Daueranweisung "pushen, wenn fertig"; läuft der Autopilot, nur lokal committen und in der Übergabe vermerken.
- **Vault:** bei jeder Änderung Tabelle/Abschnitte in `claude-code-mods.md` (inkl. `timestamp`) und eine Zeile im `log.md` unter dem heutigen Datum, mit Commit-Hash.
- **Nichts löschen** ohne ausdrückliche Bitte (alte Store-Schlüssel und Mods bleiben liegen).
- **Gedächtnis-Regeln** (siehe MEMORY.md): kurz antworten, immer Deutsch, nach Rückfrage-Runde erst Plan, Einstellungen je Chat, Android-Sichtbarkeit.
- Ein Passwort, das Björn früher in den Chat getippt hat, nie wiederholen.

## Empfohlene Skills

- `plugin-authoring` – vor jeder Arbeit an Mods (Typen, Hooks, Tests, reference.md).
- `claude-api` – bei Fragen zu Modellen, Preisen, Aufwand, Cache (nie aus dem Gedächtnis beantworten).
- `grilling` / `anthropic-skills:grill-me` – Björn nutzt sie, um Entwürfe vor dem Bau durchzusprechen.
- `anthropic-skills:vermenschlichen` bzw. `humanizer-de` – für deutsche Texte in Mods und Vault.
- `anthropic-skills:chrome-browser` – YouTube-Inhalte (eingebauter Browser wird von YouTube gesperrt; Björn öffnet das Transkript in Chrome).
- `anthropic-skills:handoff` – für die nächste Übergabe.
