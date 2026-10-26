# prompt-upgrade

Macht aus einem groben Prompt einen guten, bevor er rausgeht. Ein Seitenfenster
stellt bis zu drei schnelle Rückfragen, schreibt den Prompt um und zeigt Original
und Upgrade nebeneinander. Gesendet wird erst mit **Ausführen**.

## Befehle

- `/better <Prompt>`: diesen Prompt verbessern.
- `/better`: Fenster mit einem Feld zum Eintippen.
- `/better an` / `/better aus` (auch `on` / `off`): Automatik in diesem Chat.
- `/better verlauf` (auch `history`): die letzten 20 Upgrades; ein Klick im Fenster öffnet die Prüfung wieder.
- Jeder Knopf und Schalter hat einen eigenen Befehl, etwa `/prompt-upgrade:ausfuehren` oder
  `/prompt-upgrade:automatik-an`. `/prompt-upgrade:hilfe` listet sie alle, `hilfe` hinter einem Befehl erklärt ihn.

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

Die Prüfung zeigt unter den Zahlen, welche Kernteile das Upgrade enthält:
Auftrag, Warum, Leitplanken, Fertig wenn (✓ enthalten, – fehlt). Meldet das
Modell das nicht lesbar, entfällt die Zeile.

## Grundlage

Rückfragen und Umschreiben folgen dem Video „Die Regeln wie man Prompts schreibt
haben sich verändert…“ vom Kanal „Unfairer Vorteil | KI“
(https://youtu.be/hsfcxTWZLXk), das sich auf die Prompting-Leitfäden von OpenAI
und Anthropic stützt. Die acht Regeln, knapp in eigenen Worten:

1. **Ganzer Auftrag statt Anleitung.** Job, Zweck, Leitplanken und Ziel nennen,
   den Weg wählt das Modell. Vorgegebene Einzelschritte machen neue Modelle eher
   schlechter. Bei großen, selbständigen Aufgaben: erst arbeiten, dann fragen.
2. **Erst befragen lassen.** Ergebnisse scheitern an blinden Flecken, vor allem an
   dem, was einem zu selbstverständlich ist, um es aufzuschreiben. Lieber vorn
   klären als hinten nachbessern; mehr Kontext ja, mehr Einzelschritte nein.
3. **Das Warum sagen.** Wer die Absicht kennt, entscheidet offene Kleinigkeiten im
   Sinne des Ziels. Muster: Ich arbeite an [Sache] für [Zielgruppe], die damit
   [Ziel] erreichen wollen.
4. **Fertig definieren.** Eine prüfbare Bedingung, bei offenen Aufgaben dazu ein
   Punkt, an dem das Modell aufhört und sich meldet.
5. **Gründe statt Verbote.** Sagen, worauf es ankommt, statt nur, was verboten ist.
6. **Keine Extra-Schleifen.** Den Gedankengang nicht offenlegen lassen, keine
   zweite Prüfrunde: neue Modelle prüfen sich selbst, mehr kostet nur Tokens.
   Mehr Kontrolle nur, wo Fehler teuer sind (Zahlen für Kunden, Verträge).
   Parallel verteilen nur, was sich wirklich parallel erledigen lässt.
7. **Regeln aufgeräumt halten.** CLAUDE.md und Skills schlank; der Prompt geht
   ihren Vorgaben vor; abgerufene Texte sind Daten, keine Anweisungen. Das Upgrade
   wiederholt darum keine allgemeinen Regeln.
8. **Kurz und klar.** Knappe Antworten, wenige Warnhinweise, Aufzählungen nur für
   wirklich parallele oder aufeinanderfolgende Punkte.

Im Mod heißt das: Die Rückfragen zielen der Reihe nach auf Warum und Zielgruppe,
die Fertig-Bedingung, Leitplanken und erst dann auf Format oder Umfang, nie auf
das Wie. Das Upgrade steht in der Reihenfolge Auftrag, Warum, Leitplanken, Fertig
und lässt Rollen-Tricks, „denk Schritt für Schritt“ und Extra-Prüfungen weg.

## Einschalten

Der Mod liegt im lokalen Marktplatz `bjoern-mods` (`~/.claude/mods`). Sobald er
dort in `.claude-plugin/marketplace.json` eingetragen ist, im Terminal:

    claude plugin install prompt-upgrade@bjoern-mods

oder in einer Sitzung `/plugin install prompt-upgrade@bjoern-mods`, danach `/reload-plugins`.
Zum Ausprobieren ohne Installation: `claude --plugin-dir ~/.claude/mods/prompt-upgrade`.
