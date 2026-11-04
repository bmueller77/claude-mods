# sorgfalt

Zwei Skills, die Claude von selbst liest, wenn sie passen:

- **debuggen**: Bei einem Fehler, einem fehlschlagenden Test oder unerwartetem Verhalten sucht Claude erst
  die Ursache und belegt sie, bevor er etwas repariert. Eine Hypothese, die kleinste Prüfung, ein roter
  Test vor der Korrektur. Nach drei gescheiterten Korrekturen stellt er die Annahme oder die Architektur
  infrage, statt weiterzuprobieren.
- **belegen**: Bevor Claude etwas als fertig, behoben oder bestanden meldet, und vor Commit, Push oder Pull
  Request lässt er die passende Prüfung frisch laufen und nennt ihr Ergebnis. Berichte von Arbeitern und
  Subagenten prüft er am Diff nach.

Von Hand: `/sorgfalt:debuggen`, `/sorgfalt:belegen`. `/sorgfalt:hilfe` erklärt alles im Chat, auch vom
Handy. Einstellen lässt sich nichts; kein Hook erzwingt die Skills, und sie legen keine eigenen Pläne oder
Freigaben an (das macht der Leitstand).

## Kosten

Immer im Kontext stehen nur die beiden Beschreibungen, zusammen gut 100 Tokens. Den ganzen Text eines
Skills (je etwa 2.000 bis 3.000 Tokens) liest Claude erst, wenn der Skill greift.

## Herkunft

Deutsche Fassung von systematic-debugging und verification-before-completion aus Superpowers 7.0.2 von
Jesse Vincent (https://github.com/obra/superpowers, MIT). Die Lizenz liegt in `LICENSE`.

## Installation

`/plugin install sorgfalt --marketplace bmueller77/claude-mods`
