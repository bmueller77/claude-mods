# prompt-upgrade

Macht aus einem groben Prompt einen guten, bevor er rausgeht. Ein Seitenfenster
stellt bis zu drei schnelle Rückfragen, schreibt den Prompt um und zeigt Original
und Upgrade nebeneinander. Gesendet wird erst mit **Ausführen**.

## Befehle

- `/better <Prompt>`: diesen Prompt verbessern.
- `/better`: Fenster mit einem Feld zum Eintippen.
- `/better an` / `/better aus` (auch `on` / `off`): Automatik in diesem Chat.
- `/better verlauf` (auch `history`): die letzten 20 Upgrades; ein Klick im Fenster öffnet die Prüfung wieder.

## Automatik

Ist sie an, geht ein am Rechner getippter Prompt erst ins Fenster. Unverändert
durch gehen: alles vom Handy (Remote Control) und von anderen Plugins, Befehle
(`/…`, `!…`), Prompts mit Anhang oder `@datei`, alles, was getippt wird, während
Claude arbeitet, kurze Antworten wie „ja“ oder „mach weiter“. Mit `>` vorn geht
ein Prompt direkt raus, das `>` fällt weg.

## Einstellungen

- `automatik` (aus): Standard für neue Chats; `/better an|aus` gilt nur im Chat.
- `modell` (`haiku`): stellt die Rückfragen und schreibt um.

## Ablauf

Dein Prompt, Fragen, Umschreiben, Prüfen. Abbrechen (oder das Fenster schließen)
legt den Original-Prompt zurück ins Eingabefeld. Scheitert ein Modellaufruf, zeigt
eine Karte „Erneut versuchen“ und „Original senden“. Das Upgrade bleibt in der
Sprache des Originals; Unbekanntes steht als `[Platzhalter]` da.

## Einschalten

Der Mod liegt im lokalen Marktplatz `bjoern-mods` (`~/.claude/mods`). Sobald er
dort in `.claude-plugin/marketplace.json` eingetragen ist, im Terminal:

    claude plugin install prompt-upgrade@bjoern-mods

oder in einer Sitzung `/plugin install prompt-upgrade@bjoern-mods`, danach `/reload-plugins`.
Zum Ausprobieren ohne Installation: `claude --plugin-dir ~/.claude/mods/prompt-upgrade`.
