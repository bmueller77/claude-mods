# kurzfassen

Ein Skill für kurze, handlungsnahe Antworten. Das tut er, solange er an ist:

- Jede Antwort beginnt mit der nächsten Handlung.
- Mehrere Schritte stehen nummeriert untereinander.
- Claude sagt in jeder Antwort, wo ihr gerade steht.
- Keine Abschweifungen.
- Zeiten stehen in Minuten oder Stunden, nicht als "etwas Arbeit".
- Was fertig ist, steht konkret da.

Es gilt für jede Antwort im Chat, bis du es ausschaltest. Einstellen lässt sich nichts, und einen Standard für neue Chats gibt es nicht: Jeder neue Chat beginnt ohne Kurzfassen. Ob es an ist, zeigt kein eigenes Zeichen: Frag Claude, oder schau auf den Button des Leitstands (📝 an, 📖 aus). Nach /clear oder einem Verdichten (/compact) schalte es bei Bedarf neu ein. `/kurzfassen:hilfe` erklärt alles im Chat, auch vom Handy.

## Einschalten

Schick `/kurzfassen:kurzfassen`. Hast du auch den Leitstand (ein weiterer Mod mit einer Leiste über dem Eingabefeld), geht es dort mit dem Button 📖 "Kurzantworten".

## Ausschalten

Schreib "Kurzfassen aus" oder "normal antworten". Im Leitstand geht es auch mit dem Button 📝.

## Kosten

Beim Einschalten kommt die Anleitung für Claude (der Skill, knapp 3.000 Tokens) in den Chat. Sie bleibt dort und wird bei jeder Nachricht mitgelesen, meist aus dem Zwischenspeicher (Cache), also günstig.

## Herkunft

Deutsche Fassung von i-have-adhd 0.4.1 von Ayoub Ghriss (https://github.com/ayghri/i-have-adhd, MIT). Die Lizenz liegt in `LICENSE`.

## Installation

`/plugin install kurzfassen --marketplace bmueller77/claude-mods`
