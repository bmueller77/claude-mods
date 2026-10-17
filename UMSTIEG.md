# Umstieg auf bjoern-mods (Stand 2026-10-18)

Für jede Claude-Code-Instanz, auf den Servern wie in der Desktop-App auf dem Laptop. Den Prompt
unten in einer Sitzung der Instanz abschicken. Er entfernt die alten Mods und richtet die aktuellen
für alle Chats ein (Scope user).

Quelle ist dieses Repo (`bmueller77/claude-mods`, Katalog "bjoern-mods"). Wer keinen Zugang zum
Repo hat, bekommt das Zip `bjoern-mods-2026-10-18.zip`; es enthält dasselbe.

## Prompt

```text
Richte die Claude-Code-Mods auf diesem Rechner neu ein, für alle Chats (Scope user). Quelle ist der
Katalog "bjoern-mods" aus dem privaten Repo bmueller77/claude-mods. Liegt dir statt Repo-Zugang das
Zip bjoern-mods-2026-10-18.zip vor, entpacke es nach ~/.claude/bjoern-mods und nimm diesen Ordner
als Katalog. Lösche keine Ordner, und rühre nichts an, was nicht hier steht.

1. Bestand: `claude --version` (mindestens 2.1.296), `claude plugin list`,
   `claude plugin marketplace list`. Halte das Ergebnis fest.
2. Alte Mods entfernen: Deinstalliere (`claude plugin uninstall <name>@<katalog>`) jedes Plugin aus
   den Katalogen claude-kit, claude-code-mods, catch-me-up, cache-tax, cache-tax-lokal,
   visible-compact, visible-compact-lokal, claude-code-playground, claude-code-playground-mods,
   savvy-progress-lokal, claude-mods und nateherk-mods, dazu aus bjoern-mods die alten Einträge
   savvy-progress, next-steps, cache-meter, cache-tax, catch-me-up, replay-theater, blast-radius,
   antwortzeit, zweiter-blick und context-bar, wo vorhanden. Entferne danach diese Kataloge
   (`claude plugin marketplace remove <katalog>`), aber nicht bjoern-mods. Plugins aus anderen
   Katalogen (Skills, MCP-Server und Ähnliches für deine Arbeit) bleiben; nenne sie im Bericht.
3. Katalog:
   - Mit Repo-Zugang: Zeigt bjoern-mods schon auf bmueller77/claude-mods, dann
     `claude plugin marketplace update bjoern-mods`, sonst
     `claude plugin marketplace add bmueller77/claude-mods`.
   - Mit Zip: Zeigt bjoern-mods auf etwas anderes, erst
     `claude plugin marketplace remove bjoern-mods`, dann
     `claude plugin marketplace add ~/.claude/bjoern-mods`.
4. Installieren, genau in dieser Reihenfolge, je mit `claude plugin install <name>@bjoern-mods --scope user`:
   glanceflow, statistik, naechste-schritte, zusammenfassung, visible-compact, nachtschicht,
   filetree, i-have-adhd. Ist eines danach nicht "enabled", `claude plugin enable <name>@bjoern-mods`.
   (install.sh im Repo tut dasselbe.)
5. Nur in der Claude-Desktop-App: In ~/.claude/settings.json unter permissions.allow den Eintrag
   "mcp__ccd_session_mgmt__set_remote_control" ergänzen, vorhandene Einträge behalten. Sonst
   lehnt der Auto-Modus den Knopf 🛜 ab.
6. Prüfen: `claude plugin list` zeigt die acht als enabled mit Scope user. Danach neu starten:
   die Desktop-App ganz beenden und öffnen; auf Servern laufende Sitzungen über ihren Dienst neu
   starten (z. B. die Remote-Control-Bridge per systemctl), nicht von Hand im tmux.
7. Bericht: was entfernt wurde, was installiert ist (mit Versionen), was stehen blieb, Fehler.
```

## Was die Instanz danach hat

| Mod | Was er tut |
|---|---|
| glanceflow | Checkliste über der Eingabe: Plan, Fortschritt, Helfer, Verlauf; Knopfzeile mit Schaltern |
| statistik | eine Zeile: Nachrichten, Kontext, Cache-Uhr mit Warmhalten, Limits |
| naechste-schritte | zwei oder drei Vorschläge für die nächste Eingabe, ganz unten |
| zusammenfassung | nach jeder Arbeitsrunde zwei Zeilen: getan, und was man leicht übersieht |
| visible-compact | Chat vor und nach `/compact` nebeneinander |
| nachtschicht | `/nachtschicht`: Claude arbeitet ohne Rückfragen weiter, mit Übergabe am Ende |
| filetree | Dateibaum |
| i-have-adhd | ADHS-Modus, Knopf 🧠 in GlanceFlow |

## Reihenfolge über dem Eingabefeld

Welcher Mod über dem Eingabefeld oben steht, legt die Engine fest, nicht die Reihenfolge der
Installation. Die Mods ordnen sich selbst: GlanceFlow oben, darunter die Statistik, die
Zusammenfassung, ganz unten Nächste Schritte unter einem Trennstrich. Gleich installiert heißt
deshalb gleiches Bild auf jeder Instanz.

## Hinweise

- Im Terminal (Server) zeichnen die Mods Text und Tastenkürzel, Knöpfe und Bildchen nur in der
  Desktop-App. 🛜 Remote Control gibt es nur dort.
- GlanceFlow startet in der Arbeitsweise "Auto-Mode" ohne Plan-Freigabe. Die Freigabe (und die
  Gruppenarbeit) erst einschalten, wenn jemand Start drücken kann. Bei laufender Nachtschicht
  startet ein wartender Plan nach 30 Sekunden von selbst.
- Kosten: Nächste Schritte und Zusammenfassung rufen je Antwort bzw. Arbeitsrunde Haiku auf;
  GlanceFlow benennt Aufträge mit Haiku; die Statistik kostet nur beim Warmhalten.
- Updates: `claude plugin marketplace update bjoern-mods`, dann `claude plugin update <mod>@bjoern-mods`
  und neu starten.
