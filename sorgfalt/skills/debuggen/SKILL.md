---
name: debuggen
description: 'Nutzen bei jedem Fehler, fehlschlagenden Test oder unerwarteten Verhalten, bevor du eine Korrektur vorschlägst oder einbaust. Auch bei Build-Fehlern, Leistungsproblemen und wenn eine Korrektur schon einmal nicht gewirkt hat.'
license: MIT
---

# Debuggen

Erst die Ursache finden und belegen, dann reparieren. Wer nur das Symptom wegmacht, hat den Fehler nicht
behoben, er sieht ihn bloß gerade nicht.

## Die Grundregel

```
KEINE KORREKTUR, BEVOR DIE URSACHE GEFUNDEN UND BELEGT IST
```

Solange Phase 1 nicht durch ist, schlägst du keine Korrektur vor und baust keine ein. Das gilt besonders
dann, wenn es eilt, wenn die schnelle Lösung offensichtlich wirkt oder wenn schon ein Versuch gescheitert
ist. Einfache Fehler haben auch eine Ursache, und bei ihnen geht die Suche schnell.

## Phase 1: Ursache suchen

1. **Fehlermeldung ganz lesen.** Auch Warnungen und den ganzen Stacktrace. Zeilennummern, Pfade und
   Fehlercodes notieren. Oft steht die Antwort schon da.
2. **Zuverlässig nachstellen.** Mit welchen Schritten tritt der Fehler auf, jedes Mal oder nur manchmal?
   Lässt er sich nicht nachstellen, sammelst du mehr Daten, statt zu raten.
3. **Letzte Änderungen ansehen.** `git diff`, `git log -p`, neue Abhängigkeiten, geänderte Einstellungen,
   Unterschiede der Umgebung (anderer Rechner, andere Shell, Cloud statt PC).
4. **Bei mehreren Bausteinen messen, wo es bricht.** Läuft der Weg über mehrere Stufen (Skript, Build,
   Dienst, Datenbank oder Hook, Engine, Oberfläche), an jeder Grenze ausgeben, was hineingeht und was
   herauskommt, und einmal laufen lassen. Erst danach die Stufe untersuchen, an der es kippt.
5. **Rückwärts verfolgen.** Steckt der Fehler tief im Aufruf: Wo entsteht der falsche Wert? Wer hat die
   Funktion damit aufgerufen? Weiter nach oben, bis zur Quelle. Repariert wird dort, nicht an der Stelle,
   an der es knallt. Kommst du von Hand nicht weiter, vor der kritischen Stelle den Wert samt
   `new Error().stack` ausgeben (in Tests über `console.error`, ein Logger ist dort oft stumm).

Beispiel für Punkt 4 unter Windows: Kommt eine Umgebungsvariable im Programm nicht an, an jeder Stufe
prüfen, ob sie da ist, ohne ihren Wert auszugeben:

```bash
# Git Bash
[ -n "${API_URL:-}" ] && echo "API_URL gesetzt" || echo "API_URL fehlt"
```

```powershell
# PowerShell
if ($env:API_URL) { 'API_URL gesetzt' } else { 'API_URL fehlt' }
```

Dabei an die Eigenheiten dieser Umgebung denken: Git Bash wandelt Argumente, die mit `/` beginnen, in
Windows-Pfade um (`MSYS_NO_PATHCONV=1` verhindert das), Zeilenenden können CRLF oder LF sein, und
PowerShell 5.1 kennt kein `&&`. Solche Unterschiede sind oft die ganze Ursache.

Am Ende von Phase 1 kannst du sagen, was passiert und warum.

## Phase 2: Muster vergleichen

1. **Funktionierendes Gegenstück suchen.** Gibt es im selben Code etwas Ähnliches, das läuft?
2. **Vorlage ganz lesen.** Setzt du ein Muster oder eine Bibliothek ein, die Vorlage oder Doku Zeile für
   Zeile lesen, nicht überfliegen.
3. **Jeden Unterschied auflisten**, auch die kleinen. Nicht vorher entscheiden, dass einer egal ist.
4. **Abhängigkeiten klären.** Welche Einstellungen, welche Umgebung, welche Annahmen braucht der Code?

## Phase 3: Hypothese prüfen

1. **Eine Hypothese aufschreiben**, konkret: "Ursache ist X, weil Y."
2. **Mit der kleinsten Änderung prüfen.** Eine Stellschraube auf einmal, nie mehrere Dinge zugleich.
3. **Ergebnis ansehen.** Bestätigt: weiter mit Phase 4. Widerlegt: neue Hypothese, keine zweite Änderung
   obendrauf.
4. **Weißt du es nicht, sag es.** "X verstehe ich nicht" ist eine brauchbare Aussage. Dann weiter lesen,
   messen oder nachfragen, statt Wissen vorzuspielen.

## Phase 4: Reparieren

1. **Erst einen Test, der fehlschlägt.** Die kleinste Nachstellung des Fehlers, als automatischer Test,
   wenn das Projekt welche hat, sonst als kurzes Skript. Er muss vor der Korrektur rot sein.
2. **Eine Korrektur an der Ursache.** Nur diese eine Änderung, kein Aufräumen nebenher, kein Umbau, der
   gerade passt.
3. **Prüfen.** Ist der neue Test grün, sind die anderen grün geblieben, ist das ursprüngliche Symptom weg?
   Bevor du "behoben" sagst, gilt der Skill `belegen`.
4. **Wirkt die Korrektur nicht:** anhalten und zählen, wie viele Korrekturen du schon versucht hast. Unter
   drei: zurück zu Phase 1, mit dem, was du gerade gelernt hast.

## Nach drei gescheiterten Korrekturen

Ab der dritten gescheiterten Korrektur versuchst du keine vierte. Dann ist sehr wahrscheinlich nicht die
Hypothese falsch, sondern die Annahme dahinter oder die Architektur. Anzeichen:

- Jede Korrektur legt eine neue Abhängigkeit oder einen geteilten Zustand an anderer Stelle frei.
- Die Korrektur bräuchte einen großen Umbau.
- Jede Korrektur erzeugt anderswo neue Symptome.

Stell die Grundlagen infrage: Trägt das Muster überhaupt? Bleibst du nur aus Gewohnheit dabei? Wäre ein
Umbau ehrlicher als das nächste Pflaster? Schreib auf, was du versucht hast, was jeweils passiert ist und
welche Annahme du jetzt anzweifelst, und leg das der Person vor. Arbeitest du als Arbeiter in einer
Gruppenarbeit, gehört das in deinen Bericht an den Leiter, statt weiterzuprobieren.

## Warnzeichen

Denkst du einen dieser Sätze, bist du zu früh am Reparieren. Zurück zu Phase 1.

| Ausrede | Was stimmt |
|---|---|
| "Erst mal schnell flicken, untersuchen später." | Die erste Korrektur gibt die Richtung vor. Später kommt selten. |
| "Ich ändere X und schau, ob es geht." | Das ist Raten. Ohne Hypothese lernst du aus dem Ergebnis nichts. |
| "Ich ändere mehreres auf einmal, das spart Zeit." | Dann weißt du nicht, was gewirkt hat, und baust neue Fehler ein. |
| "Den Test lasse ich weg, ich prüfe von Hand." | Eine Korrektur ohne Test hält nicht. Der rote Test belegt die Ursache. |
| "Es ist bestimmt X." | Bestimmt ist kein Beleg. Erst messen. |
| "Ganz verstehe ich es nicht, aber das könnte klappen." | Wenn es klappt, weißt du nicht warum, und es kommt wieder. |
| "Das Muster sagt X, ich mache es etwas anders." | Halb verstandene Vorlagen erzeugen genau solche Fehler. Ganz lesen. |
| "Die Doku ist zu lang, ich passe es an." | Siehe oben. Lesen ist billiger als der nächste Fehlversuch. |
| "Ich sehe das Problem, ich behebe es." | Ein Symptom sehen heißt nicht, die Ursache kennen. |
| "Es ist ein Notfall, keine Zeit für das Vorgehen." | Systematisch ist schneller als Herumprobieren. |
| "Noch ein Versuch." (nach zwei gescheiterten) | Nach drei gescheiterten Versuchen ist die Annahme falsch, nicht der Versuch. |

Ebenso ein Warnzeichen: eine Liste mit Lösungen, bevor der Datenfluss verfolgt ist.

Auch die Person zeigt es dir. Fragt sie "Passiert das denn überhaupt?", hast du etwas angenommen, statt es
zu prüfen. "Zeigt das, ob...?" heißt, du hättest messen sollen. "Hör auf zu raten" oder ein genervtes
"Kommen wir nicht weiter?" heißt: zurück zu Phase 1.

## Wenn es keine Ursache im Code gibt

Zeigt die Untersuchung, dass es wirklich an der Umgebung, am Timing oder an einem fremden Dienst liegt:
aufschreiben, was du untersucht hast, eine passende Behandlung einbauen (Wiederholen, Zeitlimit, klare
Fehlermeldung) und so viel Protokoll hinzufügen, dass der nächste Fall sich besser untersuchen lässt.
Meistens heißt "keine Ursache" aber nur, dass die Suche zu früh aufgehört hat.

Wartet ein Test mit festen Pausen (`sleep`, `setTimeout`) auf etwas und schlägt nur manchmal fehl, ist das
selbst die Ursache: Warte auf die Bedingung, die du brauchst, nicht auf eine geschätzte Zeit.

## Überblick

| Phase | Was du tust | Fertig, wenn |
|---|---|---|
| 1. Ursache | Meldung lesen, nachstellen, Änderungen ansehen, messen | Du weißt, was passiert und warum |
| 2. Muster | Funktionierendes Gegenstück suchen, vergleichen | Die Unterschiede liegen auf dem Tisch |
| 3. Hypothese | Eine Annahme, kleinste Prüfung | Bestätigt oder durch eine neue ersetzt |
| 4. Reparatur | Roter Test, eine Korrektur, prüfen | Test grün, nichts anderes kaputt, Symptom weg |

Grundlage: systematic-debugging aus Superpowers von Jesse Vincent (https://github.com/obra/superpowers,
MIT), deutsche Fassung.
