# Update einer Instanz auf den neuesten Stand

Für jede Instanz, die den Katalog schon von GitHub bezieht (eingerichtet mit `UMSTIEG.md`). Den
Prompt unten in einer Sitzung der Instanz abschicken. Er holt die neuen Versionen, deinstalliert
Mods, die nicht mehr im Katalog stehen, und gleicht die Befehlsdateien der Desktop-App ab.

Am 2026-10-29 wurde der Katalog von bjoern-mods in bm-mods (BM-Mods) umbenannt. Eine Instanz, die
ihn noch unter dem alten Namen hat, läuft so weiter, bis sie einmal den Umzug macht. Der steht am
Anfang des Prompts und nimmt Einstellungen und gespeicherte Daten der Mods mit.

Was installiert und was entfernt wird, liest die Instanz aus dem Katalog selbst. Von Hand
nachziehen muss man hier nur die Liste der weggefallenen Befehlsdateien in Schritt 6.

## Prompt

```text
Bring die Claude-Code-Mods aus dem Katalog "bm-mods" (BM-Mods, Repo bmueller77/claude-mods) auf
den neuesten Stand, für alle Chats (Scope user). Bis 2026-10-29 hieß der Katalog "bjoern-mods".
Lösche keine Ordner und rühre nichts an, was nicht hier steht. `claude plugin marketplace remove`
nur für einen Katalog, aus dem kein Plugin mehr installiert ist: Mit installierten Mods
deinstalliert es sie samt Einstellungen und Daten.

Umzug von bjoern-mods auf bm-mods (einmalig, seit 2026-10-29)

Zuerst `claude plugin marketplace list` ansehen. Nur wenn dort bjoern-mods steht und bm-mods
fehlt, die Schritte U1 bis U10 ausführen. Steht bm-mods schon da und bjoern-mods nicht mehr, den
Umzug auslassen und mit Schritt 1 beginnen. Stehen beide da, ist ein früherer Umzug nicht fertig
geworden: der Person den Bestand zeigen und fragen, ob ab U4 weitergemacht wird.

U1. Sichern, nichts löschen: den Ordner ~/.claude/plugins/store/ als
    ~/.claude/plugins/store-<JJJJ-MM-TT>/ kopieren und ~/.claude/settings.json als
    ~/.claude/settings-<JJJJ-MM-TT>.json.
U2. In ~/.claude/settings.json unter `pluginConfigs` jeden Eintrag `<mod>@bjoern-mods` mit allen
    Werten notieren. U4 löscht diese Einträge.
U3. `claude plugin marketplace add bmueller77/claude-mods#main`. Das `#main` gehört dazu, ohne
    meldet add nur "already on disk" und trägt nichts ein. Danach zeigt
    `claude plugin marketplace list` bm-mods neben bjoern-mods.
U4. Jedes installierte Plugin `<mod>@bjoern-mods`, das in .claude-plugin/marketplace.json des
    Katalogs steht, deinstallieren: `claude plugin uninstall <mod>@bjoern-mods --keep-data`.
    Ohne `--keep-data` wäre auch der Ordner ~/.claude/plugins/data/<mod>-bjoern-mods weg.
U5. Die Plugins aus marketplace.json in dessen Reihenfolge installieren:
    `claude plugin install <mod>@bm-mods --scope user`.
U6. Gespeicherte Daten (Verlauf, Regeln, Zustand) mitnehmen; die Engine übernimmt sie nicht von
    selbst. In ~/.claude/plugins/store/ je Mod die alte Datei an den neuen Namen kopieren, nur
    wenn das Ziel noch fehlt. Die alte Datei bleibt liegen.
      leitstand_bjoern-mods-2f9693e9c054.json -> leitstand_bm-mods-7c3458326462.json
      statistik_bjoern-mods-589055a4e75d.json -> statistik_bm-mods-2614510bbc6e.json
      naechste-schritte_bjoern-mods-dc0ac514633b.json -> naechste-schritte_bm-mods-a1ce8a036257.json
      zusammenfassung_bjoern-mods-8ec31878d5db.json -> zusammenfassung_bm-mods-d7607d037b65.json
      visible-compact_bjoern-mods-3790ef00a6a3.json -> visible-compact_bm-mods-a700758965b0.json
      prompt-upgrade_bjoern-mods-10799035fc8c.json -> prompt-upgrade_bm-mods-95e845de53e1.json
      modellwahl_bjoern-mods-b6614393a7aa.json -> modellwahl_bm-mods-84fe1dcf5987.json
      kurzfassen_bjoern-mods-3607625c2c3e.json -> kurzfassen_bm-mods-2e5c0126b90c.json
    Für einen Mod, der hier fehlt, heißt die Datei <mod>_<katalog>-<h>.json, <h> sind die ersten
    12 Hexzeichen von sha256("<mod>@<katalog>"). Ab hier ohne Pause bis U10: Was laufende
    Sitzungen vor dem Neustart noch speichern, landet in der alten Datei und fehlt in der neuen.
U7. Die Werte aus U2 wieder setzen, je Mod mit `claude plugin configure <mod>@bm-mods --values-stdin`.
    Die Werte kommen als JSON-Objekt auf stdin, jeder als einzeiliger String, etwa
    `echo '{"<option>": "<wert>"}' | claude plugin configure <mod>@bm-mods --values-stdin`.
    Nicht genannte Optionen behalten ihren Wert. `claude plugin configure <mod>@bm-mods` zeigt
    danach, was gesetzt ist.
U8. `claude plugin list` ansehen. Steht dort noch ein anderes Plugin `@bjoern-mods` (etwa die
    alten reflect, filetree oder autopilot), die Person fragen, bevor irgendetwas entfernt wird;
    bjoern-mods bleibt bis dahin stehen. Steht dort keines mehr, `claude plugin marketplace remove
    bjoern-mods`. Das entfernt dann nur die Deklaration, den Eintrag in known_marketplaces und den
    Klon.
U9. Nur in der Desktop-App: die Befehlsdateien wie in Schritt 6 neu kopieren.
U10. Kurz berichten (was umgezogen ist, welche Store-Dateien kopiert wurden, was offen ist), dann
    Claude sofort neu starten wie in Schritt 8. Danach diesen Prompt noch einmal abschicken: Der
    Umzug fällt dann weg, und die normalen Schritte laufen mit bm-mods.

Normale Schritte

1. Bestand festhalten: `claude --version`, `claude plugin list`, `claude plugin marketplace list`.
2. Claude Code selbst: `claude update`. In der Desktop-App aktualisiert sich die App selbst, dort
   diesen Schritt auslassen.
3. Katalog: Zeigt `claude plugin marketplace list` bei bm-mods nicht GitHub
   bmueller77/claude-mods, erst Schritt 3 aus UMSTIEG.md im Repo ausführen. Dann
   `claude plugin marketplace update bm-mods`. Der Katalog liegt danach unter
   ~/.claude/plugins/marketplaces/bm-mods/.
4. Je Plugin aus .claude-plugin/marketplace.json dieses Katalogs, in dessen Reihenfolge:
   `claude plugin update <name>@bm-mods`. Fehlt eines, `claude plugin install
   <name>@bm-mods --scope user`. Ist eines danach nicht "enabled", `claude plugin enable
   <name>@bm-mods`.
5. Jedes installierte Plugin @bm-mods, das nicht mehr in marketplace.json steht,
   deinstallieren: `claude plugin uninstall <name>@bm-mods`. Das löscht seine Einstellungen
   und Daten. So gehen reflect, filetree und autopilot, die seit leitstand 0.57.0 im Leitstand
   stecken und sonst doppelt liefen; die offenen Regelvorschläge von reflect gehen dabei
   verloren, Regeln, die schon in einer CLAUDE.md stehen, bleiben. Stehen sie noch unter
   @bjoern-mods, gilt U8: erst die Person fragen.
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
| 2026-10-29 | Katalogname bjoern-mods | bm-mods (BM-Mods), Umzug U1 bis U10 im Prompt |
