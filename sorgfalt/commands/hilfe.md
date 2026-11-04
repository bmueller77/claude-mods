---
description: "Was Sorgfalt tut, wann seine Skills greifen und wie du sie abschaltest"
disable-model-invocation: true
---

Gib der Person genau den Text zwischen <hilfetext> und </hilfetext> aus, Wort für Wort und Zeile für Zeile, ohne die beiden Marken, ohne Codeblock und ohne etwas davor oder danach. Rufe keinen der Skills auf und tu sonst nichts.

<hilfetext>
Sorgfalt · Hilfe

Was der Mod tut
Sorgfalt ist ein Mod, also eine Erweiterung für Claude Code. Er bringt Claude zwei Arbeitsregeln bei, als Skills (Anleitungen, die Claude bei Bedarf liest):
- debuggen: Bei einem Fehler sucht Claude erst die Ursache und belegt sie, bevor er etwas repariert. Nach drei gescheiterten Korrekturen probiert er nicht weiter, sondern stellt die Annahme dahinter infrage und sagt dir das.
- belegen: Bevor Claude etwas als fertig, behoben oder bestanden meldet, lässt er die passende Prüfung frisch laufen und nennt ihr Ergebnis. Berichte von Helfern prüft er am Diff nach, statt sie zu glauben.

Wann die Skills greifen
Von selbst. debuggen greift bei einem Fehler, einem fehlschlagenden Test oder unerwartetem Verhalten, bevor Claude eine Korrektur vorschlägt. belegen greift, bevor Claude Arbeit als fertig meldet, und vor Commit, Push oder Pull Request. Ob Claude einen Skill gelesen hat, siehst du im Verlauf als Aufruf des Skills.

Von Hand aufrufen
/sorgfalt:debuggen · Claude geht beim aktuellen Fehler nach der Anleitung vor
/sorgfalt:belegen · Claude prüft den Stand, bevor er ihn meldet
Du kannst auch einfach schreiben "Geh systematisch vor" oder "Beleg das".

Einstellen
Einstellen lässt sich nichts. Die Skills gelten in jedem Chat.
Ganz abschalten: `claude plugin disable sorgfalt@bm-mods` (wieder an mit `enable`), oder sag Claude, er soll den Mod abschalten. Das wirkt nach einem Neustart von Claude Code.

Kosten
Immer im Kontext stehen nur die beiden kurzen Beschreibungen der Skills, zusammen gut 100 Tokens. Tokens sind die Einheit, in der Claude liest und schreibt; sie zählen gegen dein Nutzungslimit. Den ganzen Text eines Skills (je etwa 2.000 bis 3.000 Tokens) liest Claude erst, wenn der Skill greift oder du ihn aufrufst. Danach bleibt er im Chat und wird meist aus dem Zwischenspeicher (Cache) gelesen, also günstig.

Vom Handy (Remote Control)
Alles geht genauso, auch /sorgfalt:debuggen und /sorgfalt:belegen.

Befehle
/sorgfalt:debuggen · Fehler systematisch untersuchen
/sorgfalt:belegen · Stand prüfen und mit Beleg melden
/sorgfalt:hilfe · Diese Hilfe
hilfe hinter einem Befehl gibt es bei Sorgfalt nicht: /sorgfalt:debuggen hilfe startet den Skill.
</hilfetext>
