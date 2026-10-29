# Umstieg auf bm-mods (Stand 2026-10-29)

Für jede Claude-Code-Instanz, auf den Servern wie in der Desktop-App auf dem Laptop. Den Prompt
unten in einer Sitzung der Instanz abschicken. Er entfernt die alten Mods und richtet die aktuellen
für alle Chats ein (Scope user).

Quelle ist dieses Repo (`bmueller77/claude-mods`, Katalog "bm-mods", angezeigt als BM-Mods; bis
2026-10-29 hieß er "bjoern-mods"). Seit 2026-10-27 haben alle Instanzen Zugang dazu; das Zip
`bjoern-mods-2026-10-19.zip` braucht es nicht mehr. Eine schon umgestellte Instanz bringt der Prompt
in `UPDATE.md` auf den neuesten Stand, auch vom alten Namen auf den neuen.

## Prompt

```text
Richte die Claude-Code-Mods auf diesem Rechner neu ein, für alle Chats (Scope user). Quelle ist der
Katalog "bm-mods" aus dem privaten Repo bmueller77/claude-mods; bis 2026-10-29 hieß er "bjoern-mods".
Liegt dir statt Repo-Zugang ein Zip bm-mods-<datum>.zip vor, entpacke es in ~/.claude/ (es enthält
den Ordner bm-mods) und nimm ~/.claude/bm-mods als Katalog. Lösche keine Ordner, und rühre nichts
an, was nicht hier steht.

1. Bestand: `claude --version` (mindestens 2.1.296), `claude plugin list`,
   `claude plugin marketplace list`. Halte das Ergebnis fest.
2. Alte Mods entfernen: Deinstalliere (`claude plugin uninstall <name>@<katalog>`) jedes Plugin aus
   den Katalogen claude-kit, claude-code-mods, catch-me-up, cache-tax, cache-tax-lokal,
   visible-compact, visible-compact-lokal, claude-code-playground, claude-code-playground-mods,
   savvy-progress-lokal, claude-mods und nateherk-mods, dazu aus bm-mods oder bjoern-mods die alten Einträge
   glanceflow, nachtschicht, savvy-progress, next-steps, cache-meter, cache-tax, catch-me-up, replay-theater, blast-radius,
   antwortzeit, zweiter-blick und context-bar, wo vorhanden. Ebenso filetree aus dem Katalog
   claude-code-filetree (die deutsche Fassung kommt jetzt aus bm-mods) und reflect-mod bzw.
   claude-reflect aus claude-reflect-marketplace (sonst prüft der Leitstand jede Korrektur doppelt).
   Aus bm-mods oder bjoern-mods außerdem reflect, filetree und autopilot: Sie stecken seit 2026-10-26 im
   Leitstand und liefen sonst doppelt. Das löscht ihre Einstellungen und die offenen
   Regelvorschläge von reflect; Regeln, die schon in einer CLAUDE.md stehen, bleiben.
   Entferne danach diese Kataloge (`claude plugin marketplace remove <katalog>`, also auch
   claude-code-filetree und claude-reflect-marketplace), aber nicht bm-mods und nicht bjoern-mods. Plugins aus anderen
   Katalogen (Skills, MCP-Server und Ähnliches für deine Arbeit) bleiben; nenne sie im Bericht.
3. Katalog. `claude plugin marketplace remove` nie für einen Katalog nehmen, aus dem noch Mods
   installiert sind: Das deinstalliert sie und löscht ihre Einstellungen und Daten.
   - Steht in `claude plugin marketplace list` noch bjoern-mods, erst den Umzug aus UPDATE.md im
     Repo machen, Schritte U1 bis U9; neu gestartet wird hier in Schritt 6. Danach weiter mit
     Schritt 4.
   - Mit Repo-Zugang: Zeigt bm-mods schon auf bmueller77/claude-mods, dann
     `claude plugin marketplace update bm-mods`. Zeigt es auf etwas anderes (etwa einen
     lokalen Ordner), in ~/.claude/settings.json unter `extraKnownMarketplaces` den Eintrag
     bm-mods genau so setzen, sonst nichts ändern:
     `"bm-mods": { "source": { "source": "github", "repo": "bmueller77/claude-mods" } }`.
     Der neue Wert ersetzt den alten Inhalt von `source`, er kommt nicht als weitere Ebene
     hinein. Dann `claude plugin marketplace add bmueller77/claude-mods`. Gibt es bm-mods
     noch nicht, nur das `add`.
   - Mit Zip: genauso, aber mit
     `"bm-mods": { "source": { "source": "directory", "path": "<voller Pfad von ~/.claude/bm-mods>" } }`
     und `claude plugin marketplace add ~/.claude/bm-mods`.
   Installierte Mods bleiben dabei installiert und holen Updates ab jetzt aus der neuen Quelle.
   Prüfen: `claude plugin marketplace list` zeigt bei bm-mods jetzt GitHub (bzw. den neuen
   Ordner). Steht dort noch die alte Quelle, hat das `add` nicht gegriffen; dann den Eintrag in
   settings.json noch einmal ansehen.
4. Installieren, genau in dieser Reihenfolge, je mit `claude plugin install <name>@bm-mods --scope user`:
   leitstand, statistik, naechste-schritte, zusammenfassung, visible-compact, prompt-upgrade,
   modellwahl, kurzfassen, i-have-adhd. Meldet install "already installed",
   holt `claude plugin update <name>@bm-mods` die neue Version (install allein tut das nicht).
   Ist eines danach nicht "enabled", `claude plugin enable <name>@bm-mods`.
   (install.sh im Repo tut dasselbe.)
5. Nur in der Claude-Desktop-App: In ~/.claude/settings.json unter permissions.allow den Eintrag
   "mcp__ccd_session_mgmt__set_remote_control" ergänzen, vorhandene Einträge behalten. Sonst
   lehnt der Auto-Modus den Button 🛜 ab. Außerdem die Dateien aus `commands/` im Repo (bzw. im
   Zip) nach ~/.claude/commands/ kopieren und eine alte ~/.claude/commands/nachtschicht.md
   entfernen, ebenso alle alten ~/.claude/commands/<mod>-*.md der Mods von bm-mods
   (leitstand-, statistik-, zusammenfassung-, autopilot-, naechste-schritte-, reflect-,
   prompt-upgrade-, modellwahl-, visible-compact-, filetree-) und adhs-an.md, adhs-aus.md,
   reflexion.md, dateibaum.md, jetzt-aufraeumen.md, letzter-stand-zeigen.md.
   Seit 2026-10-26 heißen die Befehle /<mod>:…, die Dateien dafür bringt jeder Mod selbst mit.
   Dann kennt die App alle Befehle (z. B. /leitstand:hilfe, /pause, /selbstkritik, /dateien,
   /autopilot-an) schon in der ersten Nachricht.
6. Prüfen: `claude plugin list` zeigt die neun als enabled mit Scope user. Danach neu starten:
   die Desktop-App ganz beenden und öffnen; auf Servern laufende Sitzungen über ihren Dienst neu
   starten (z. B. die Remote-Control-Bridge per systemctl), nicht von Hand im tmux.
7. Bericht: was entfernt wurde, was installiert ist (mit Versionen), was stehen blieb, Fehler.
```

## Was die Instanz danach hat

| Mod | Was er tut |
|---|---|
| leitstand | Checkliste über der Eingabe: Plan, Fortschritt, Helfer, Verlauf; Button-Zeile mit Schaltern (früher GlanceFlow). Eingebaut: Selbstkritik 🪞 und Regeln (früher Reflect), Dateien 📂 (früher Filetree), Autopilot 🅰️ |
| statistik | eine Zeile: Nachrichten, Kontext, Cache-Uhr mit Warmhalten, Limits; Aufräumen mit Sicherungspunkt |
| naechste-schritte | zwei oder drei Vorschläge für die nächste Eingabe, ganz unten |
| zusammenfassung | nach jeder Arbeitsrunde zwei Zeilen: getan, und was man leicht übersieht |
| visible-compact | Chat vor und nach `/compact` nebeneinander |
| modellwahl | schlägt einmal je Aufgabe Modell und Aufwand vor, automatisch zu Beginn eines neuen Chats oder per `/modellwahl`; am Rechner gilt der Vorschlag nach 15 s, vom Handy auf ja |
| prompt-upgrade | `/better <Prompt>`: bis zu drei Rückfragen, dann ein besserer Prompt neben dem Original, gesendet erst auf Ausführen |
| kurzfassen | Kurzfassen als Skill, im Leitstand Kurzantworten mit Button 📖/📝 |
| i-have-adhd | englisches Original von kurzfassen, der Leitstand nutzt es nur, wenn kurzfassen fehlt |

## Reihenfolge über dem Eingabefeld

Welcher Mod über dem Eingabefeld oben steht, legt die Engine fest, nicht die Reihenfolge der
Installation. Die Mods ordnen sich selbst: der Leitstand oben, darunter die Statistik, die
Zusammenfassung, ganz unten Nächste Schritte unter einem Trennstrich. Gleich installiert heißt
deshalb gleiches Bild auf jeder Instanz.

## Hinweise

- Seit leitstand 0.61.0 zeichnet auch das Terminal die Buttons des Leitstands. Sonst zeichnen die Mods dort (Server) Text und Tastenkürzel, Buttons nur in der
  Desktop-App. 🛜 Remote Control gibt es nur dort.
- Jeder Button hat einen Befehl nach dem Muster `/<mod>:<funktion>[-<wert>]`, etwa
  `/leitstand:arbeitsmodus-gruppenarbeit` oder `/statistik:warmhalten-aus`; `/<mod>:hilfe` listet sie, und jeder
  Befehl erklärt sich mit `hilfe` dahinter. Der Leitstand hat Kurzformen wie `/pause`. Vom Handy (Remote Control) ist das der Weg zu allen Schaltern.
- Einstellungen gelten je Chat: Ein Schalter, den man in einem Chat umlegt, ändert keinen anderen
  Chat. Neue Chats starten mit dem Standard aus dem Einstellungsmenü der App bzw.
  `/plugin configure <mod>@bm-mods`. Standard des Leitstands: Auto-Modus, Verdecken und
  Passwortschutz an, Ansicht minimal, alles andere aus. Die Regelprüfung im Leitstand ist an,
  die Automatik von Prompt Upgrade ist aus.
- Der Leitstand startet in der Arbeitsweise "Auto-Modus" ohne Plan-Freigabe. In der Gruppenarbeit
  nennt Claude den Plan im Chat und wartet auf "los" oder Start. Bei laufendem Autopilot startet
  ein wartender Plan nach 30 Sekunden von selbst; solange Arbeiter im Hintergrund laufen, stößt
  der Autopilot nicht an. Ohne Warten starten: ein Plan, der nur liest oder im Chat antwortet, ein
  Prompt, der mit "Starte sofort" beginnt (so auch Cron-Aufträge per tmux), und `claude -p` ohne
  Oberfläche. Ein Auftrag aus einer geplanten Aufgabe (`/schedule`, Routine) startet nach 30 Sekunden.
- Android-App (Remote Control): Kein Mod hält etwas an, das dort nicht zu sehen ist. Passwörter in
  Nachrichten vom Handy werden entfernt statt die Nachricht anzuhalten; `/better` und die
  Seitenfenster von Selbstkritik und Dateien gehen nur am Rechner, `/selbstkritik-zeigen` und
  `/regeln` auch vom Handy.
- Kosten: Nächste Schritte und Zusammenfassung rufen je Antwort bzw. Arbeitsrunde Haiku auf;
  der Leitstand benennt Aufträge mit Haiku und prüft jede kurze Nachricht mit Haiku auf Regeln
  (je Chat abschaltbar: `/regelpruefung-aus`); Prompt Upgrade braucht zwei Haiku-Aufrufe je
  Upgrade; die Statistik kostet nur beim Warmhalten.
- Updates: der Prompt in `UPDATE.md`. Er holt die neuen Versionen, deinstalliert, was nicht mehr
  im Katalog steht, und gleicht die Befehlsdateien ab.
