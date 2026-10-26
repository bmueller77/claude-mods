# modellwahl

Schlägt einmal je Aufgabe Modell und Aufwand für den Chat vor. Haiku schätzt die
Aufgabe ein und nimmt das günstigste Modell, das sie beim ersten Mal sicher
schafft: Haiku, Sonnet, Opus oder Fable, Aufwand von niedrig bis maximal.

## Wann vorgeschlagen wird

- Automatisch bei der ersten echten Nachricht eines neuen Chats (frischer Start,
  nach `/clear`, neuer Chat mit Übergabe). Nicht in fortgesetzten Chats, nicht
  für Subagenten, nicht für Anstöße anderer Mods. Die Einschätzung dauert
  höchstens 5 s; kommt keine, bleibt alles, wie es ist. Die Nachricht selbst läuft
  sofort mit dem Modell aus dem Menü los.
- Mit `/modellwahl` oder `/modellwahl <Aufgabe>`, auch mitten im Chat. Der
  Vorschlag nennt die Tokens, die ein Wechsel neu liest, und schätzt, was das vom
  5-Stunden-Limit kostet.

## Wann der Vorschlag gilt

- Am Rechner (Desktop-App, Terminal): nach 15 Sekunden ohne Reaktion von selbst,
  ab dem nächsten Schritt. Über der Eingabe steht solange „Modellwahl schlägt …
  vor · gilt in 12 s“ mit **Übernehmen** und **Nein**. Das gilt für jedes Modell,
  auch für Opus und Fable mitten im Chat.
- Vom Handy (Remote Control): nie von selbst. Dort gibt es keine Knöpfe, und
  nichts wartet. Der Vorschlag steht im ersten Satz der Antwort; `ja`, `ok`,
  `Okay` oder `/modellwahl ja` übernehmen ihn (10 Minuten lang). Ein `ja` geht
  trotzdem an Claude, falls es auch einer Frage galt.
- Stellst du im Menü der App selbst um, ist der Vorschlag verworfen.

Die Wahl gilt bis zum Ende des Chats oder bis zum nächsten `/modellwahl`.
Stellst du Modell oder Aufwand selbst um, zieht sich der Mod in diesem Chat zurück.

## Befehle

- `/modellwahl [Aufgabe | ja | nein]`: jetzt vorschlagen, übernehmen oder verwerfen.
- `/modellwahl:uebernehmen`, `/modellwahl:ablehnen`: wie die Knöpfe.
- `/modellwahl:zeigen`: Wahl, Grund, ob zurückgezogen, offener Vorschlag, Kalibrierung.
- `/modellwahl:hilfe`: kurze Erklärung.
- `/modellwahl:auto-an`, `/modellwahl:auto-aus`: Automatik nur für diesen Chat.

Jeder Befehl versteht `hilfe` und `?`. Die Befehle mit Doppelpunkt liegen als
Dateien in `commands/` des Mods, Claude Code setzt `modellwahl:` davor. Wer noch
einen alten Namen wie `/modellwahl-zeigen` tippt, bekommt den neuen genannt.

## Einstellungen

- `autoBeiNeuemChat` (an): Standard für neue Chats.
- `modell` (`haiku`): schätzt die Aufgabe ein.

## Wie es wirkt

Jede Anfrage der Hauptschleife geht mit dem gewählten Modell und Aufwand
(`turn.step`). Die Modellauswahl der App und `/model` zeigen dabei weiter das
Modell der Sitzung; welches gerade antwortet, steht in der Statuszeile
(„Modellwahl: …“) und bei `/modellwahl:zeigen`. Selbst stellen kann der Mod die
Auswahl der App nicht: Ein `/model` übernimmt sie nicht, und ihr Werkzeug dafür
lehnt die eigene Sitzung ab. Deshalb schlägt er vor, und du kannst im Menü
selbst wählen.

Steht der Leitstand darüber, holt er die Zeile der Modellwahl ganz nach oben in
sein Band, mit ihren Knöpfen.

Die Prozent-Schätzung lernt aus jeder Runde: Anstieg des 5-Stunden-Limits gegen
die verbrauchten Tokens, umgerechnet auf Opus-Preise. Das Limit gilt für das
ganze Konto, die Zahl ist also grob.
