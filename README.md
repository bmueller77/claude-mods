# bjoern-mods

Claude-Code-Marktplatz mit Björns eigenen Mods, dazu filetree und i-have-adhd.
Die eigenen Mods liegen hier im Repo, die beiden fremden kommen direkt aus ihren Original-Repos.

Neue Instanz einrichten:

    git clone https://github.com/bmueller77/claude-mods && claude-mods/install.sh

Vorhandene Instanz umstellen (alte Mods raus, aktuelle rein): Prompt in [UMSTIEG.md](UMSTIEG.md).

In `commands/` liegen Befehlsdateien für die Desktop-App (`/autopilot`, `/statistik`, `/warmhalten`, `/zusammenfassung`, `/replay`). Nach `~/.claude/commands/` kopiert, kennt die App diese Befehle schon in der ersten Nachricht einer Sitzung.

## Installiert install.sh

| Mod | Quelle | Was er tut | Kostet Tokens |
|---|---|---|---|
| leitstand | hier (hervorgegangen aus GlanceFlow von Antreas-Strb, MIT) | Checkliste über der Eingabe mit Plan, Fortschritt, Helfern, Verlauf, Teambericht; Arbeitsweisen Auto-Mode und Gruppenarbeit; Schalter für ADHS-Modus, Remote Control, Autopilot, Verdecken; Öffner für Filetree; `/leitstand` | ja: Haiku benennt jeden Auftrag, in der Gruppenarbeit laufen Arbeiter-Subagenten |
| statistik | hier (Eigenbau) | eine Zeile mit Nutzungslimits, Tokens, Kontext und Cache-Uhr; Warmhalten, Compact, Kontext-Details über `/context` | nur beim Warmhalten: jeder Ping liest den Kontext aus dem Cache |
| naechste-schritte | hier (nach next-steps von Hamza Zafar) | nach jeder Antwort zwei oder drei Vorschläge, per Ziffer 1 bis 3 oder Knopf ins Feld | ja, ein Haiku-Aufruf je Antwort |
| zusammenfassung | hier (Eigenbau) | nach jeder Arbeitsrunde: was getan wurde und was man leicht übersieht, mit Dateiliste und Replay | ja, ein Haiku-Aufruf je Arbeitsrunde |
| visible-compact | hier (deutsche Fassung von nvsravank/visible-compact, MIT) | Chat vor und nach `/compact` nebeneinander, Knopf Übersetzen; `/show-last-compact` | nur beim Übersetzen (Haiku) |
| autopilot | hier (Eigenbau, früher nachtschicht) | Claude arbeitet ohne Rückfragen weiter und schreibt am Ende eine Übergabe; `/autopilot` | ja: jede angeschobene Runde kostet wie eine Nachricht |
| filetree | data-goblin/claude-code-filetree | Dateibaum, im Terminal mit `/tui fullscreen` | nein |
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
