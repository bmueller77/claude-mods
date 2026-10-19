# modellwahl

Wählt einmal je Aufgabe Modell und Aufwand für den Chat. Haiku schätzt die
Aufgabe ein und nimmt das günstigste Modell, das sie beim ersten Mal sicher
schafft: Haiku, Sonnet, Opus oder Fable, Aufwand von niedrig bis maximal.

## Wann gewählt wird

- Automatisch bei der ersten echten Nachricht eines neuen Chats (frischer Start,
  nach `/clear`, neuer Chat mit Übergabe). Nicht in fortgesetzten Chats, nicht
  für Subagenten, nicht für Anstöße anderer Mods. Die Nachricht wartet höchstens
  5 s; kommt keine Einschätzung, bleibt alles, wie es ist.
- Mit `/modellwahl` oder `/modellwahl <Aufgabe>`. Mitten im Chat fragt der Mod
  vor Opus oder Fable erst nach, nennt die Tokens, die neu gelesen werden, und
  schätzt, was das vom 5-Stunden-Limit kostet. `/modellwahl ja` führt aus
  (10 Minuten lang). Haiku und Sonnet stellt er sofort um.

Die Wahl gilt bis zum Ende des Chats oder bis zum nächsten `/modellwahl`.
Stellst du Modell oder Aufwand selbst um, zieht sich der Mod in diesem Chat zurück.

## Befehle

- `/modellwahl [Aufgabe | ja]`: jetzt wählen, oder einen Vorschlag ausführen.
- `/modellwahl-zeigen`: Wahl, Grund, ob zurückgezogen, Kalibrierung.
- `/modellwahl-hilfe`: kurze Erklärung.
- `/modellwahl-auto-an`, `/modellwahl-auto-aus`: Automatik nur für diesen Chat.

Jeder Befehl versteht `hilfe` und `?`.

## Einstellungen

- `autoBeiNeuemChat` (an): Standard für neue Chats.
- `modell` (`haiku`): schätzt die Aufgabe ein.

## Wie es wirkt

Jede Anfrage der Hauptschleife geht mit dem gewählten Modell und Aufwand
(`turn.step`). In der Desktop-App stellt der Mod nach der ersten Runde zusätzlich
die Sitzung mit `/model` und `/effort` um, nur für diese Sitzung; im Terminal
nicht, weil das dort die Einstellungen schreiben würde.

Die Prozent-Schätzung lernt aus jeder Runde: Anstieg des 5-Stunden-Limits gegen
die verbrauchten Tokens, umgerechnet auf Opus-Preise. Das Limit gilt für das
ganze Konto, die Zahl ist also grob.
