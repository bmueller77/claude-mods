# Update einer Instanz auf den neuesten Stand

Für jede Instanz, die bjoern-mods schon von GitHub bezieht (eingerichtet mit `UMSTIEG.md`). Den
Prompt unten in einer Sitzung der Instanz abschicken. Er holt die neuen Versionen, deinstalliert
Mods, die nicht mehr im Katalog stehen, und gleicht die Befehlsdateien der Desktop-App ab.

Was installiert und was entfernt wird, liest die Instanz aus dem Katalog selbst. Von Hand
nachziehen muss man hier nur die Liste der weggefallenen Befehlsdateien in Schritt 6.

## Prompt

```text
Bring die Claude-Code-Mods aus dem Katalog "bjoern-mods" (Repo bmueller77/claude-mods) auf den
neuesten Stand, für alle Chats (Scope user). Lösche keine Ordner und rühre nichts an, was nicht
hier steht. Nie `claude plugin marketplace remove bjoern-mods`: Das deinstalliert alle Mods daraus
samt Einstellungen und Daten.

1. Bestand festhalten: `claude --version`, `claude plugin list`, `claude plugin marketplace list`.
2. Claude Code selbst: `claude update`. In der Desktop-App aktualisiert sich die App selbst, dort
   diesen Schritt auslassen.
3. Katalog: Zeigt `claude plugin marketplace list` bei bjoern-mods nicht GitHub
   bmueller77/claude-mods, erst Schritt 3 aus UMSTIEG.md im Repo ausführen. Dann
   `claude plugin marketplace update bjoern-mods`. Der Katalog liegt danach unter
   ~/.claude/plugins/marketplaces/bjoern-mods/.
4. Je Plugin aus .claude-plugin/marketplace.json dieses Katalogs, in dessen Reihenfolge:
   `claude plugin update <name>@bjoern-mods`. Fehlt eines, `claude plugin install
   <name>@bjoern-mods --scope user`. Ist eines danach nicht "enabled", `claude plugin enable
   <name>@bjoern-mods`.
5. Jedes installierte Plugin @bjoern-mods, das nicht mehr in marketplace.json steht,
   deinstallieren: `claude plugin uninstall <name>@bjoern-mods`. Das löscht seine Einstellungen
   und Daten. So gehen reflect, filetree und autopilot, die seit leitstand 0.57.0 im Leitstand
   stecken und sonst doppelt liefen; die offenen Regelvorschläge von reflect gehen dabei
   verloren, Regeln, die schon in einer CLAUDE.md stehen, bleiben.
6. Nur in der Desktop-App: alle Dateien aus dem Ordner commands/ des Katalogs nach
   ~/.claude/commands/ kopieren, vorhandene überschreiben. Dann in ~/.claude/commands/ entfernen,
   wo vorhanden: reflexion.md, dateibaum.md, jetzt-aufraeumen.md, letzter-stand-zeigen.md,
   nachtschicht.md, ansicht-ausfuehrlich.md, knoepfe-zeigen.md, adhs-an.md, adhs-aus.md und alle alten <mod>-*.md (leitstand-, statistik-,
   zusammenfassung-, autopilot-, naechste-schritte-, reflect-, prompt-upgrade-, modellwahl-,
   visible-compact-, filetree-). Alle anderen Dateien dort bleiben.
7. Prüfen: `claude plugin list` zeigt jedes Plugin aus marketplace.json als enabled, Scope user,
   mit der Version aus <Katalog>/<name>/.claude-plugin/plugin.json (i-have-adhd kommt von außen
   und hat dort keinen Ordner).
8. Neu starten: die Desktop-App ganz beenden und wieder öffnen. Auf Servern die Sitzungen über
   ihren Dienst neu starten (z. B. die Remote-Control-Bridge per systemctl), nicht von Hand im
   tmux.
9. Bericht: Versionen vorher und nachher, was deinstalliert und entfernt wurde, Fehler.
```

## Weggefallen

| Seit | Was | Wohin |
|---|---|---|
| 2026-10-26 | Mods reflect, filetree, autopilot | in den Leitstand (0.57.0): Selbstkritik 🪞 und Regeln, Dateien 📂, Autopilot 🅰️ |
| 2026-10-26 | Befehlsdateien reflexion.md, dateibaum.md | `/selbstkritik`, `/dateien` |
| 2026-10-26 | Befehlsdateien jetzt-aufraeumen.md, letzter-stand-zeigen.md | `/statistik:chat-aufraeumen`, `/statistik:letzter-stand-zeigen` |
| 2026-10-26 | Befehlsdateien `<mod>-<funktion>.md` | `/<mod>:<funktion>`, die Dateien bringt jeder Mod selbst mit |
| 2026-10-28 | Befehlsdatei ansicht-ausfuehrlich.md | `/ansicht-detailliert` (Ansicht heißt jetzt Detailliert) |
| 2026-10-29 | Befehlsdatei knoepfe-zeigen.md | `/buttons-zeigen` (Knöpfe heißen jetzt Buttons) |
