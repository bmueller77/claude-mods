---
description: "Was Kurzfassen tut, wie du es ein- und ausschaltest"
disable-model-invocation: true
---

Gib der Person genau den Text zwischen <hilfetext> und </hilfetext> aus, Wort für Wort und Zeile für Zeile, ohne die beiden Marken, ohne Codeblock und ohne etwas davor oder danach. Schalte Kurzfassen damit nicht ein und tu sonst nichts.

<hilfetext>
Kurzfassen · Hilfe

Was der Mod tut
Kurzfassen ist ein Mod, also eine Erweiterung für Claude Code. Ist er an, antwortet Claude so, dass du sofort handeln kannst: zuerst die nächste Handlung, mehrere Schritte nummeriert, keine Abschweifungen. Claude sagt in jeder Antwort, wo ihr gerade steht, und nennt Zeiten in Minuten oder Stunden statt "etwas Arbeit".

So arbeitest du damit
- Einschalten: Schick /kurzfassen:kurzfassen. Hast du auch den Leitstand (ein weiterer Mod mit einer Leiste über dem Eingabefeld), geht es dort mit dem Button 📖 (Kurzantworten).
- Ab dann gilt es für jede Antwort in diesem Chat, auch wenn das Thema wechselt.
- Ausschalten: Schreib "Kurzfassen aus" oder "normal antworten". Claude bestätigt das in einer Zeile. Im Leitstand geht es auch mit dem Button 📝.
- Ob es an ist, zeigt kein eigenes Zeichen. Frag Claude, ob Kurzfassen an ist, oder schau auf den Leitstand: 📝 heißt an, 📖 heißt aus.
- Nach /clear oder einem Verdichten (/compact, Claude fasst den Chat zusammen und arbeitet mit der Zusammenfassung weiter) schalte es bei Bedarf neu ein.
- Willst du etwas ausführlich erklärt haben, sag es. Dann erklärt Claude vollständig, auch wenn Kurzfassen an ist.

Einstellen
Einstellen lässt sich nichts, und einen Standard für neue Chats gibt es nicht: Jeder neue Chat beginnt ohne Kurzfassen. Ein- und ausschalten geht nur im Chat, wie oben.
Ganz abschalten: `claude plugin disable kurzfassen@bm-mods` (wieder an mit `enable`), oder sag Claude, er soll den Mod abschalten. Das wirkt nach einem Neustart von Claude Code.
Ältere Installationen heißen `kurzfassen@bjoern-mods`; `claude plugin list` zeigt den Namen.

Kosten
Beim Einschalten kommt die Anleitung für Claude (der Skill, knapp 3.000 Tokens) in den Chat. Tokens sind die Einheit, in der Claude liest und schreibt; sie zählen gegen dein Nutzungslimit. Die Anleitung bleibt im Chat und wird bei jeder Nachricht mitgelesen, meist aus dem Zwischenspeicher (Cache), also günstig.

Vom Handy (Remote Control)
Schick /kurzfassen:kurzfassen zum Einschalten und "Kurzfassen aus" oder "normal antworten" zum Ausschalten. Die Buttons des Leitstands gibt es dort nicht.

Befehle
Befehlsnamen schreiben Umlaute als ae, oe, ue und ss.
/kurzfassen:kurzfassen · Kurzfassen in diesem Chat einschalten
/kurzfassen:hilfe · Diese Hilfe
Mehr zu jedem Befehl: steht oben. hilfe dahinter gibt es bei Kurzfassen nicht: /kurzfassen:kurzfassen hilfe schaltet Kurzfassen ein.
</hilfetext>
