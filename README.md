# bjoern-mods

Claude-Code-Marktplatz mit Björns eigenen Mods, dazu i-have-adhd.
Die eigenen Mods und die deutschen Fassungen liegen hier im Repo, i-have-adhd kommt direkt aus seinem Original-Repo.

Einstellungen gelten je Chat: Ein Schalter, den du in einem Chat umlegst, ändert keinen anderen Chat. Neue Chats
starten mit dem Standard aus dem Einstellungsmenü der App (Leitstand, Zusammenfassung, Visible Compact).

Neue Instanz einrichten:

    git clone https://github.com/bmueller77/claude-mods && claude-mods/install.sh

Vorhandene Instanz umstellen (alte Mods raus, aktuelle rein): Prompt in [UMSTIEG.md](UMSTIEG.md).

In `commands/` liegen Befehlsdateien für die Desktop-App (`/autopilot`, `/statistik`, `/warmhalten`, `/zusammenfassung`, `/replay`, `/reflect`, `/better`). Nach `~/.claude/commands/` kopiert, kennt die App diese Befehle schon in der ersten Nachricht einer Sitzung.

## Befehle für jeden Knopf

Alles, was sich per Knopf schalten oder auslösen lässt, geht auch per Befehl, damit es auch vom Handy aus
geht. Die Namen folgen dem Muster `/<mod>-<funktion>[-<wert>]`, zum Beispiel `/leitstand-arbeitsmodus-gruppenarbeit`,
`/leitstand-verdecken-an`, `/statistik-warmhalten-aus`, `/autopilot-an`, `/reflect-speichern-global 2`. Jeder Mod hat
`/<mod>-hilfe` mit allen Befehlen, und jeder Befehl erklärt sich mit `hilfe` dahinter (`/leitstand-verdecken-an hilfe`).
Befehle, die wie ein doppelter Knopfdruck etwas Größeres auslösen (`/leitstand-neuer-chat`, `/leitstand-abschliessen`,
`/leitstand-geheimnisse-sichern`), wollen ein `ja` dahinter. Die alten Kurzformen (`/leitstand …`, `/better`, `/reflect …`,
`/autopilot`, `/warmhalten`) gehen weiter. In `commands/` liegt für jeden Befehl eine kleine Datei, damit die Desktop-App
ihn schon in der ersten Nachricht eines Chats kennt.

## Installiert install.sh

| Mod | Quelle | Was er tut | Kostet Tokens |
|---|---|---|---|
| leitstand | hier (hervorgegangen aus GlanceFlow von Antreas-Strb, MIT) | Checkliste über der Eingabe mit Plan, Fortschritt, Helfern, Verlauf, Teambericht; Arbeitsweisen Auto-Mode und Gruppenarbeit; Schalter für ADHS-Modus, Remote Control, Autopilot, Verdecken; Öffner für Filetree; `/leitstand` | ja: Haiku benennt jeden Auftrag, in der Gruppenarbeit laufen Arbeiter-Subagenten |
| statistik | hier (Eigenbau) | eine Zeile mit Nutzungslimits, Tokens, Kontext und Cache-Uhr; Warmhalten, Compact, Kontext-Details über `/context` | nur beim Warmhalten: jeder Ping liest den Kontext aus dem Cache |
| naechste-schritte | hier (nach next-steps von Hamza Zafar) | nach jeder Antwort zwei oder drei Vorschläge, per Ziffer 1 bis 3 oder Knopf ins Feld | ja, ein Haiku-Aufruf je Antwort |
| zusammenfassung | hier (Eigenbau) | nach jeder Arbeitsrunde: was getan wurde und was man leicht übersieht, mit Dateiliste und Replay | ja, ein Haiku-Aufruf je Arbeitsrunde |
| visible-compact | hier (deutsche Fassung von nvsravank/visible-compact, MIT) | Chat vor und nach `/compact` nebeneinander, Knopf Übersetzen; `/show-last-compact` | nur beim Übersetzen (Haiku) |
| autopilot | hier (Eigenbau, früher nachtschicht) | Claude arbeitet ohne Rückfragen weiter und schreibt am Ende eine Übergabe; `/autopilot` | ja: jede angeschobene Runde kostet wie eine Nachricht |
| filetree | hier (deutsche Fassung von data-goblin/claude-code-filetree, MIT) | Dateibaum als Seitenfenster mit Git-Status, im Terminal mit `/tui fullscreen` | nein |
| reflect | hier (Teil 1 nach reflect-mod von BayramAnnakov/claude-reflect, MIT; Teil 2 Eigenbau) | lernt aus Korrekturen: eine Regel wird nach Knopfdruck für alle Projekte (`~/.claude/CLAUDE.md`), dieses Projekt (`./CLAUDE.md`) oder nur diesen Chat gemerkt; `/reflect` kritisiert die bisherige Arbeit im Seitenfenster; Knopf 🪞 im Leitstand | ja: ein Haiku-Aufruf je kurzer Nachricht (abschaltbar je Chat), `/reflect` ein Fork über den Chat |
| prompt-upgrade | hier (Eigenbau) | `/better <Prompt>`: bis zu drei Rückfragen, dann ein verbesserter Prompt neben dem Original, gesendet erst auf Ausführen; `/better an|aus` fängt am Rechner getippte Prompts ab (je Chat, Standard aus) | ja: zwei Haiku-Aufrufe je Upgrade |
| modellwahl | hier (Eigenbau) | wählt einmal je Aufgabe Modell (Haiku, Sonnet, Opus, Fable) und Aufwand: automatisch bei der ersten Nachricht eines neuen Chats, sonst per `/modellwahl [Aufgabe]`; mitten im Chat bei Opus/Fable erst nach Rückfrage mit geschätztem Limit-Verbrauch (`/modellwahl ja`) | ja: ein Haiku-Aufruf je Wahl; ein Wechsel mitten im Chat liest den Kontext einmal neu |
| i-have-adhd | ayghri/i-have-adhd (MIT) | ADHS-Modus: zuerst die nächste Handlung, nummerierte Schritte; Knopf 🧠 im Leitstand | nur der Skilltext im Kontext, solange der Modus an ist |
| you-should-know | in Claude Code eingebaut | wird von install.sh eingeschaltet | ja |

## Entfernt am 2026-10-18

Diese Mods aus dem Video sind nicht mehr im Katalog. Wo einer noch installiert ist: `claude plugin uninstall <mod>@bjoern-mods`.

| Alter Mod | Ersetzt durch |
|---|---|
| savvy-progress (JohnnyVizz/claude-kit) | leitstand |
| glanceflow (hier, bis 0.44.0) | leitstand (umbenannt) |
| nachtschicht (hier, bis 0.1.1) | autopilot (umbenannt) |
| next-steps (hamzafer/claude-code-mods) | naechste-schritte |
| cache-meter (hier, 0.2.0) | statistik |
| cache-tax (karanb192/cache-tax) | statistik |
| catch-me-up (oliverow/catch-me-up) | zusammenfassung |
| replay-theater (anthropics/claude-code-playground) | zusammenfassung |
| blast-radius (anthropics/claude-code-playground) | nichts; riskante Bash-Befehle werden nicht mehr angehalten |

visible-compact zeigt im Katalog auf die deutsche Fassung hier im Repo statt auf nvsravank/visible-compact.

## Plattformen

Kein Mod läuft nur unter Windows.

- Der Leitstand spielt Töne, Sprache und Desktop-Meldungen unter Windows über PowerShell. Auf dem Mac nimmt es den Player und die Stimme von Claude Code und `osascript` für Meldungen, unter Linux `paplay`, `pw-play` oder `aplay`, dazu `spd-say`, `espeak-ng` oder `espeak` und `notify-send`.
- 🛜 Remote Control gibt es nur in der Claude-Desktop-App.
- Knöpfe und Bildchen zeichnet nur die App. Im Terminal gibt es Text und Tastenkürzel.

## Updates

    claude plugin marketplace update bjoern-mods

Danach `claude plugin update <mod>@bjoern-mods` oder Claude Code neu starten.
