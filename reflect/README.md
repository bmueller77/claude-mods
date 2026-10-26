# reflect

Zwei Dinge in einem Mod: Claude lernt aus deinen Korrekturen, und Claude prüft auf Abruf die eigene Arbeit.

## Aus Korrekturen lernen

Jede kurze Nachricht von dir (bis 500 Zeichen, kein Slash-Befehl, kein "ok"/"weiter", nichts, das nach
Passwort oder Token aussieht) geht im Hintergrund an ein kleines Modell (Standard `haiku`). Es entscheidet,
ob eine wiederverwendbare Regel drinsteckt, etwa "nein, nimm pnpm", und formuliert sie als eine Zeile auf
Deutsch. Sagst du dasselbe noch einmal, zählt die Regel hoch (×2).

Über dem Eingabefeld erscheint dann `💡 „Nutze pnpm statt npm in diesem Repo“` mit den Knöpfen:

- **Alle Projekte**: in die globale `CLAUDE.md` (`$HOME/.claude/`, unter Windows `%USERPROFILE%\.claude\`)
- **Dieses Projekt**: in die `CLAUDE.md` des Projekts
- **Nur dieser Chat**: keine Datei, die Regel gilt nur in diesem Chat, auch wenn du ihn später fortsetzt
- **Bearbeiten**: legt `merke: <Regel>` zum Umformulieren ins leere Eingabefeld
- **Verwerfen**

Der vorgeschlagene Ort ist hervorgehoben. Ohne Druck wird nichts geschrieben. In die Datei kommt ein markierter
Abschnitt "## Gelernte Regeln" (dieselben Marker wie bei claude-reflect, ein vorhandener Abschnitt wird
weiter benutzt). `merke: <Regel>` oder `remember: <Regel>` schlägt eine Regel direkt vor, ohne Modellaufruf.

## Selbstkritik

`/reflect` oder `/reflect <Schwerpunkt>` lässt Claude den bisherigen Chat im Hintergrund noch einmal
kritisch lesen, ohne Werkzeuge. Das Ergebnis erscheint im Fenster "Reflexion" mit den Abschnitten Auftrag,
Erledigt, Könnte falsch sein oder fehlen, Riskante Annahmen und Als Nächstes prüfen. "Claude soll das
beheben" legt die beiden letzten Punkte ins Eingabefeld (abgeschickt wird nichts). Die letzten fünf
Reflexionen bleiben, mit "← Ältere" und "Neuere →" zu blättern.

Mit `/reflect auto an` läuft nach jeder Runde mit Dateiänderungen automatisch eine Reflexion.

## Vom Handy aus

In der Android-App sind Band, Fenster und Hinweise nicht zu sehen. Dort geht alles über Textantworten:

```
/reflect regeln                              wartende Regeln mit Nummern
/reflect speichern <Nr> [global|projekt|chat]
/reflect verwerfen <Nr>
/reflect zeigen                              neueste Reflexion als Text
```

Jeder Knopf und Schalter hat außerdem einen eigenen Befehl, etwa `/reflect:speichern-projekt 1` oder
`/reflect:zeigen`. `/reflect:hilfe` listet sie alle, `hilfe` hinter einem Befehl erklärt ihn.

Nachrichten vom Handy werden genauso geprüft wie getippte. Gefundene Regeln warten einfach, bis du entscheidest.

## Einstellungen

Im Einstellungsmenü: "Korrekturen prüfen" (an), "Selbstkritik nach Dateiänderungen" (aus), das Modell für die
Prüfung. Das sind die Standards für neue Chats. `/reflect pruefung an|aus` und `/reflect auto an|aus` gelten
nur im Chat, in dem du sie eingibst. `/reflect hilfe` zeigt alle Befehle.

## Kosten

Je kurzer Nachricht ein kleiner Aufruf von `haiku`. Jede Reflexion ist ein Aufruf über den ganzen Chat mit
dem Modell des Chats; der Anfang kommt meist aus dem Prompt-Cache.

## Herkunft

Der Teil "Aus Korrekturen lernen" basiert auf reflect-mod von Bayram Annakov
(github.com/BayramAnnakov/claude-reflect, MIT). Siehe `LICENSE` und `ACKNOWLEDGEMENTS.md`.

## Entwickeln

```
claude plugin validate .
claude plugin test .
```
