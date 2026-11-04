---
description: "Was Clean Code tut, wann der Skill greift und wie du ihn abschaltest"
disable-model-invocation: true
---

Gib der Person genau den Text zwischen <hilfetext> und </hilfetext> aus, Wort für Wort und Zeile für Zeile, ohne die beiden Marken, ohne Codeblock und ohne etwas davor oder danach. Rufe den Skill nicht auf und tu sonst nichts.

<hilfetext>
Clean Code · Hilfe

Was der Mod tut
Clean Code ist ein Mod, also eine Erweiterung für Claude Code. Er bringt Claude einen Skill bei (eine Anleitung, die Claude bei Bedarf liest), mit dem er Code prüft und umbaut: Namen, Funktionen, Klassen, Fehlerbehandlung, Kommentare, Tests und Refactoring. Funde ordnet er nach ihren Folgen, von KRITISCH bis NIEDRIG. Bevor er die Struktur umbaut, sorgt er für Tests, und Annahmen hält er im Code fest statt in Kommentaren.

Wann der Skill greift
Von selbst, wenn Claude Code prüft oder umbaut, vor einem PR-Review und bei typischen Anzeichen wie langen Funktionen, unklaren Namen, magischen Zahlen, doppelter Logik oder verschluckten Fehlern. Bei Frontend-Code liest er zusätzlich die Frontend-Regeln (Komponenten, DOM ohne Framework, Sicherheit, Barrierefreiheit, Performance), sonst nicht. Ob Claude den Skill gelesen hat, siehst du im Verlauf als Aufruf des Skills.

Von Hand aufrufen
/clean-code:clean-code · Claude prüft den aktuellen Code nach der Anleitung
Du kannst auch einfach schreiben "Prüf das auf Clean Code" oder "Mach ein Clean-Code-Review".

Einstellen
Einstellen lässt sich nichts. Der Skill gilt in jedem Chat.
Ganz abschalten: `claude plugin disable clean-code@bm-mods` (wieder an mit `enable`), oder sag Claude, er soll den Mod abschalten. Das wirkt nach einem Neustart von Claude Code.

Kosten
Immer im Kontext steht nur die Beschreibung des Skills, gut 200 Tokens. Tokens sind die Einheit, in der Claude liest und schreibt; sie zählen gegen dein Nutzungslimit. Den ganzen Text (etwa 10.000 Tokens, mit den Frontend-Regeln rund 14.000) liest Claude erst, wenn der Skill greift oder du ihn aufrufst. Danach bleibt er im Chat und wird meist aus dem Zwischenspeicher (Cache) gelesen, also günstig.

Herkunft
Grundlage ist clean-code von markky21 (MIT). Diese Fassung ist mit dem Leitfaden "So schreiben Sie sauberen Code" von Sudonull und seinen acht Quellen abgeglichen, am Frontend von iobroker.kanban getestet und ins Deutsche übertragen. Quellen und Änderungen stehen in HERKUNFT.md im Ordner des Skills.
</hilfetext>
