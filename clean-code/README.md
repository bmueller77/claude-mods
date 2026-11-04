# clean-code

Ein Skill, den Claude von selbst liest, wenn er Code prüft oder umbaut, vor einem PR-Review und bei
Frontend-Code:

- **Review-Ablauf:** erst das Sicherheitsnetz prüfen (gibt es Tests?), Konventionen und Linter des Projekts
  respektieren, Funde nach Folgen ordnen, Refactoring von Verhaltensänderungen trennen, die kleinste
  Änderung vorschlagen, die hilft. Bei einem Audit bestehenden Codes liefert er einen Plan in Reihenfolge
  statt Merge-Blockern.
- **Regeln:** Namen, Funktionen, Klassen und Abhängigkeiten, Code-Smells, DRY mit Augenmaß,
  Fehlerbehandlung (auch async), Annahmen im Code, Kommentare, Tests und Refactoring, Werkzeuge, und wann
  die Regeln nicht gelten.
- **Schweregrade** KRITISCH, HOCH, MITTEL und NIEDRIG, nach Folgen statt nach Zahlen.

Drei Zusatzdateien liest der Skill nur bei Bedarf: `references/frontend.md` (Komponenten, DOM ohne
Framework, Sicherheit, Styling, Barrierefreiheit, Performance, Browser, Schreibrichtung),
`references/solid.md` (SOLID mit Beispielen) und `references/refactoring-and-reviews.md` (Legacy-Code,
Monster-Funktionen, Tests ohne Build-Schritt, Umgangsformen im Review).

Von Hand: `/clean-code:clean-code`. `/clean-code:hilfe` erklärt alles im Chat, auch vom Handy. Einstellen
lässt sich nichts; kein Hook erzwingt den Skill.

## Kosten

Immer im Kontext steht nur die Beschreibung, gut 200 Tokens. Den ganzen Text (etwa 10.000 Tokens, mit den
Frontend-Regeln rund 14.000) liest Claude erst, wenn der Skill greift.

## Herkunft

Deutsche, erweiterte Fassung von clean-code aus markky21/claude-skills
(https://github.com/markky21/claude-skills, MIT). Abgeglichen mit dem Leitfaden "So schreiben Sie sauberen
Code" von Sudonull und seinen acht Quellen (CERN, Old Dominion University, Mimo, Codility, freeCodeCamp, UAE
Design System), danach an einem echten Frontend getestet. Die Lizenz liegt in `LICENSE`, Quellen und
Änderungen in `skills/clean-code/HERKUNFT.md`.

## Installation

`/plugin install clean-code --marketplace bmueller77/claude-mods`
