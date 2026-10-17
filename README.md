# bjoern-mods

Claude-Code-Marktplatz mit Björns eigenen Mods und den Fremd-Mods aus dem Video „Diese 10 Claude Code Mods solltest du unbedingt kennen“.
Die eigenen Mods liegen hier im Repo, die Fremd-Mods kommen direkt aus ihren Original-Repos.

Neue Instanz einrichten:

    git clone https://github.com/bmueller77/claude-mods && claude-mods/install.sh

## Installiert install.sh

| Mod | Quelle | Was er tut | Kostet Tokens |
|---|---|---|---|
| glanceflow | hier (deutsche Fassung von Antreas-Strb/glanceflow, MIT) | Checkliste über der Eingabe mit Plan, Fortschritt, Helfern, Verlauf, Teambericht; Arbeitsweisen Auto-Mode und Gruppenarbeit; `/glanceflow` | ja: Haiku benennt jeden Auftrag, in der Gruppenarbeit laufen Arbeiter-Subagenten |
| statistik | hier (Eigenbau) | eine Zeile mit Nutzungslimits, Tokens, Kontext und Cache-Uhr; Warmhalten, Compact, Kontext-Details | nur beim Warmhalten: jeder Ping liest den Kontext aus dem Cache |
| naechste-schritte | hier (nach next-steps von Hamza Zafar) | nach jeder Antwort zwei oder drei Vorschläge, per Ziffer 1 bis 3 oder Knopf ins Feld | ja, ein Haiku-Aufruf je Antwort |
| zusammenfassung | hier (Eigenbau) | nach jeder Arbeitsrunde: was getan wurde und was man leicht übersieht, mit Dateiliste und Replay | ja, ein Haiku-Aufruf je Arbeitsrunde |
| visible-compact | hier (deutsche Fassung von nvsravank/visible-compact, MIT) | Chat vor und nach `/compact` nebeneinander, Knopf Übersetzen; `/show-last-compact` | nur beim Übersetzen (Haiku) |
| nachtschicht | hier (Eigenbau) | Claude arbeitet ohne Rückfragen weiter und schreibt am Ende eine Übergabe; `/nachtschicht` | ja: jede angeschobene Runde kostet wie eine Nachricht |
| filetree | data-goblin/claude-code-filetree | Dateibaum, im Terminal mit `/tui fullscreen` | nein |
| i-have-adhd | ayghri/i-have-adhd (MIT) | ADHS-Modus: zuerst die nächste Handlung, nummerierte Schritte; Knopf 🧠 in GlanceFlow | nur der Skilltext im Kontext, solange der Modus an ist |
| you-should-know | in Claude Code eingebaut | wird von install.sh eingeschaltet | ja |

## Weiter im Katalog, ersetzt

Diese Mods bleiben im Katalog und lassen sich einzeln installieren (`claude plugin install <mod>@bjoern-mods`). install.sh richtet sie nicht mehr ein und rührt vorhandene Installationen nicht an.

| Alter Mod | Ersetzt durch |
|---|---|
| savvy-progress (JohnnyVizz/claude-kit) | glanceflow |
| next-steps (hamzafer/claude-code-mods) | naechste-schritte |
| cache-meter (hier, 0.2.0) | statistik |
| cache-tax (karanb192/cache-tax) | statistik |
| catch-me-up (oliverow/catch-me-up) | zusammenfassung |
| replay-theater (anthropics/claude-code-playground) | zusammenfassung |
| blast-radius (anthropics/claude-code-playground) | nichts; riskante Bash-Befehle werden nicht mehr angehalten |

visible-compact zeigt im Katalog jetzt auf die deutsche Fassung hier im Repo statt auf nvsravank/visible-compact.

## Plattformen

Kein Mod läuft nur unter Windows.

- GlanceFlow spielt Töne, Sprache und Desktop-Meldungen unter Windows über PowerShell. Auf dem Mac nimmt es den Player und die Stimme von Claude Code und `osascript` für Meldungen, unter Linux `paplay`, `pw-play` oder `aplay`, dazu `spd-say`, `espeak-ng` oder `espeak` und `notify-send`.
- 🛜 Remote Control gibt es nur in der Claude-Desktop-App.
- Knöpfe und Bildchen zeichnet nur die App. Im Terminal gibt es Text und Tastenkürzel.

## Updates

    claude plugin marketplace update bjoern-mods

Danach `claude plugin update <mod>@bjoern-mods` oder Claude Code neu starten.
