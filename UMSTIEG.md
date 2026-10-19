# Umstieg auf bjoern-mods (Stand 2026-10-19)

Für jede Claude-Code-Instanz, auf den Servern wie in der Desktop-App auf dem Laptop. Den Prompt
unten in einer Sitzung der Instanz abschicken. Er entfernt die alten Mods und richtet die aktuellen
für alle Chats ein (Scope user).

Quelle ist dieses Repo (`bmueller77/claude-mods`, Katalog "bjoern-mods"). Wer keinen Zugang zum
Repo hat, bekommt das Zip `bjoern-mods-2026-10-19.zip`; es enthält dasselbe.

## Prompt

```text
Richte die Claude-Code-Mods auf diesem Rechner neu ein, für alle Chats (Scope user). Quelle ist der
Katalog "bjoern-mods" aus dem privaten Repo bmueller77/claude-mods. Liegt dir statt Repo-Zugang das
Zip bjoern-mods-2026-10-19.zip vor, entpacke es in ~/.claude/ (es enthält den Ordner bjoern-mods)
und nimm ~/.claude/bjoern-mods als Katalog. Lösche keine Ordner, und rühre nichts an, was nicht hier steht.

1. Bestand: `claude --version` (mindestens 2.1.296), `claude plugin list`,
   `claude plugin marketplace list`. Halte das Ergebnis fest.
2. Alte Mods entfernen: Deinstalliere (`claude plugin uninstall <name>@<katalog>`) jedes Plugin aus
   den Katalogen claude-kit, claude-code-mods, catch-me-up, cache-tax, cache-tax-lokal,
   visible-compact, visible-compact-lokal, claude-code-playground, claude-code-playground-mods,
   savvy-progress-lokal, claude-mods und nateherk-mods, dazu aus bjoern-mods die alten Einträge
   glanceflow, nachtschicht, savvy-progress, next-steps, cache-meter, cache-tax, catch-me-up, replay-theater, blast-radius,
   antwortzeit, zweiter-blick und context-bar, wo vorhanden. Ebenso filetree aus dem Katalog
   claude-code-filetree (die deutsche Fassung kommt jetzt aus bjoern-mods) und reflect-mod bzw.
   claude-reflect aus claude-reflect-marketplace (sonst prüft reflect jede Korrektur doppelt).
   Entferne danach diese Kataloge (`claude plugin marketplace remove <katalog>`, also auch
   claude-code-filetree und claude-reflect-marketplace), aber nicht bjoern-mods. Plugins aus anderen
   Katalogen (Skills, MCP-Server und Ähnliches für deine Arbeit) bleiben; nenne sie im Bericht.
3. Katalog. Nicht `claude plugin marketplace remove bjoern-mods` nehmen: Das deinstalliert alle
   Mods daraus und löscht ihre Einstellungen und Daten.
   - Mit Repo-Zugang: Zeigt bjoern-mods schon auf bmueller77/claude-mods, dann
     `claude plugin marketplace update bjoern-mods`. Zeigt es auf etwas anderes (etwa einen
     lokalen Ordner), in ~/.claude/settings.json unter
     `extraKnownMarketplaces.bjoern-mods.source` den Wert
     `{ "source": "github", "repo": "bmueller77/claude-mods" }` eintragen, sonst nichts ändern,
     dann `claude plugin marketplace add bmueller77/claude-mods`. Gibt es bjoern-mods noch nicht,
     nur das `add`.
   - Mit Zip: genauso, aber mit `{ "source": "directory", "path": "<voller Pfad von ~/.claude/bjoern-mods>" }`
     und `claude plugin marketplace add ~/.claude/bjoern-mods`.
   Installierte Mods bleiben dabei installiert und holen Updates ab jetzt aus der neuen Quelle.
4. Installieren, genau in dieser Reihenfolge, je mit `claude plugin install <name>@bjoern-mods --scope user`:
   leitstand, statistik, naechste-schritte, zusammenfassung, visible-compact, autopilot,
   filetree, reflect, prompt-upgrade, modellwahl, i-have-adhd. Meldet install "already installed",
   holt `claude plugin update <name>@bjoern-mods` die neue Version (install allein tut das nicht).
   Ist eines danach nicht "enabled", `claude plugin enable <name>@bjoern-mods`.
   (install.sh im Repo tut dasselbe.)
5. Nur in der Claude-Desktop-App: In ~/.claude/settings.json unter permissions.allow den Eintrag
   "mcp__ccd_session_mgmt__set_remote_control" ergänzen, vorhandene Einträge behalten. Sonst
   lehnt der Auto-Modus den Knopf 🛜 ab. Außerdem die Dateien aus `commands/` im Repo (bzw. im
   Zip) nach ~/.claude/commands/ kopieren und eine alte ~/.claude/commands/nachtschicht.md
   entfernen; dann kennt die App alle Befehle der Mods (über 100, z. B. /leitstand-hilfe,
   /autopilot-an, /reflect-zeigen) schon in der ersten Nachricht.
6. Prüfen: `claude plugin list` zeigt die elf als enabled mit Scope user. Danach neu starten:
   die Desktop-App ganz beenden und öffnen; auf Servern laufende Sitzungen über ihren Dienst neu
   starten (z. B. die Remote-Control-Bridge per systemctl), nicht von Hand im tmux.
7. Bericht: was entfernt wurde, was installiert ist (mit Versionen), was stehen blieb, Fehler.
```

## Was die Instanz danach hat

| Mod | Was er tut |
|---|---|
| leitstand | Checkliste über der Eingabe: Plan, Fortschritt, Helfer, Verlauf; Knopfzeile mit Schaltern (früher GlanceFlow) |
| statistik | eine Zeile: Nachrichten, Kontext, Cache-Uhr mit Warmhalten, Limits |
| naechste-schritte | zwei oder drei Vorschläge für die nächste Eingabe, ganz unten |
| zusammenfassung | nach jeder Arbeitsrunde zwei Zeilen: getan, und was man leicht übersieht |
| visible-compact | Chat vor und nach `/compact` nebeneinander |
| autopilot | `/autopilot`: Claude arbeitet ohne Rückfragen weiter, mit Übergabe am Ende (früher Nachtschicht) |
| filetree | Dateibaum als Seitenfenster mit Git-Status, deutsche Fassung |
| reflect | lernt aus Korrekturen und fragt: Regel für alle Projekte, dieses Projekt oder nur diesen Chat; `/reflect` kritisiert die bisherige Arbeit; Knopf 🪞 im Leitstand |
| modellwahl | wählt einmal je Aufgabe Modell und Aufwand, automatisch zu Beginn eines neuen Chats oder per `/modellwahl` |
| prompt-upgrade | `/better <Prompt>`: bis zu drei Rückfragen, dann ein besserer Prompt neben dem Original, gesendet erst auf Ausführen |
| i-have-adhd | ADHS-Modus, Knopf 🧠 im Leitstand |

## Reihenfolge über dem Eingabefeld

Welcher Mod über dem Eingabefeld oben steht, legt die Engine fest, nicht die Reihenfolge der
Installation. Die Mods ordnen sich selbst: der Leitstand oben, darunter die Statistik, die
Zusammenfassung, ganz unten Nächste Schritte unter einem Trennstrich. Gleich installiert heißt
deshalb gleiches Bild auf jeder Instanz.

## Hinweise

- Im Terminal (Server) zeichnen die Mods Text und Tastenkürzel, Knöpfe und Bildchen nur in der
  Desktop-App. 🛜 Remote Control gibt es nur dort.
- Jeder Knopf hat einen Befehl nach dem Muster `/<mod>-<funktion>[-<wert>]`, etwa
  `/leitstand-arbeitsmodus-gruppenarbeit` oder `/statistik-warmhalten-aus`; `/<mod>-hilfe` listet sie, und jeder
  Befehl erklärt sich mit `hilfe` dahinter. Vom Handy (Remote Control) ist das der Weg zu allen Schaltern.
- Einstellungen gelten je Chat: Ein Schalter, den man in einem Chat umlegt, ändert keinen anderen
  Chat. Neue Chats starten mit dem Standard aus dem Einstellungsmenü der App bzw.
  `/plugin configure <mod>@bjoern-mods`. Standard des Leitstands: Auto-Modus, Verdecken und
  Passwortschutz an, Ansicht minimal, alles andere aus. Reflect prüft Korrekturen standardmäßig,
  die Automatik von Prompt Upgrade ist aus.
- Der Leitstand startet in der Arbeitsweise "Auto-Modus" ohne Plan-Freigabe. In der Gruppenarbeit
  nennt Claude den Plan im Chat und wartet auf "los" oder Start. Bei laufendem Autopilot startet
  ein wartender Plan nach 30 Sekunden von selbst; solange Arbeiter im Hintergrund laufen, stößt
  der Autopilot nicht an.
- Android-App (Remote Control): Kein Mod hält etwas an, das dort nicht zu sehen ist. Passwörter in
  Nachrichten vom Handy werden entfernt statt die Nachricht anzuhalten; `/better` und das
  Seitenfenster von Reflect gehen nur am Rechner, `/reflect zeigen` und `/reflect regeln` auch
  vom Handy.
- Kosten: Nächste Schritte und Zusammenfassung rufen je Antwort bzw. Arbeitsrunde Haiku auf;
  der Leitstand benennt Aufträge mit Haiku; Reflect prüft jede kurze Nachricht mit Haiku
  (je Chat abschaltbar: `/reflect pruefung aus`); Prompt Upgrade braucht zwei Haiku-Aufrufe je
  Upgrade; die Statistik kostet nur beim Warmhalten.
- Updates: `claude plugin marketplace update bjoern-mods`, dann `claude plugin update <mod>@bjoern-mods`
  und neu starten.
