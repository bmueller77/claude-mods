---
name: belegen
description: 'Nutzen, bevor du Arbeit als fertig, behoben oder bestanden meldest, und vor Commit, Push oder Pull Request. Auch bevor du den Bericht eines Arbeiters oder Subagenten weitergibst oder zur nächsten Aufgabe gehst.'
license: MIT
---

# Belegen

Erst der Beleg, dann die Aussage. Immer.

## Die Grundregel

```
KEINE FERTIG-MELDUNG OHNE FRISCH AUSGEFÜHRTE PRÜFUNG
```

Hast du die Prüfung nicht in dieser Runde laufen lassen und ihre Ausgabe gelesen, kannst du nicht sagen,
dass sie besteht. Ein Lauf von vorhin zählt nicht, wenn seitdem etwas geändert wurde. Das gilt für jede
Formulierung, nicht nur für das Wort "fertig": auch für "behoben", "läuft", "grün", "erledigt" und für
jeden Satz, der Erfolg nahelegt.

## Die Prüfschritte

Vor jeder Aussage über den Stand:

1. **Bestimmen:** Welcher Befehl belegt die Aussage?
2. **Ausführen:** Den ganzen Befehl, frisch, nicht nur einen Teil.
3. **Lesen:** Die ganze Ausgabe, den Exit-Code, die Zahl der Fehler.
4. **Abgleichen:** Bestätigt die Ausgabe die Aussage? Wenn nein, sag den tatsächlichen Stand und zeig die
   Ausgabe. Wenn ja, sag es und nenn den Beleg dazu.
5. **Erst dann** die Aussage machen.

Wer einen Schritt auslässt, prüft nicht, er behauptet.

In dieser Umgebung (Windows, Git Bash und PowerShell) gehört zum Lesen auch: Kam der Befehl überhaupt an?
Git Bash macht aus einem Argument mit `/` am Anfang einen Windows-Pfad, PowerShell 5.1 kennt kein `&&`
und meldet bei Ausgaben auf stderr gern einen Fehler, obwohl der Exit-Code 0 ist. Ein leeres Ergebnis
kann auch heißen, dass gar nichts lief.

## Was als Beleg zählt

| Aussage | Belegt durch | Reicht nicht |
|---|---|---|
| Tests bestehen | Ausgabe des Testbefehls: 0 Fehler | Ein älterer Lauf, "sollte gehen" |
| Linter sauber | Ausgabe des Linters: 0 Fehler | Teilprüfung, Hochrechnung |
| Build läuft | Build-Befehl mit Exit-Code 0 | Linter grün, Log sieht gut aus |
| Typen stimmen | `tsc` ohne Fehler | Tests grün, Editor zeigt nichts |
| Fehler behoben | Das ursprüngliche Symptom tritt nicht mehr auf | Code geändert, angenommen behoben |
| Regressionstest wirkt | Rot ohne Korrektur, grün mit Korrektur | Test einmal grün gesehen |
| Arbeiter fertig | Diff und Prüfausgabe selbst angesehen | Arbeiter meldet Erfolg |
| Anforderungen erfüllt | Auftrag Punkt für Punkt abgehakt | Tests grün |

## Berichte von Arbeitern und Subagenten

Ein Bericht ist eine Behauptung, kein Beleg. Bevor du ihn als Ergebnis weitergibst:

1. Den Diff ansehen (`git diff`, `git status`): Ist die Änderung da, wo sie sein soll, und nichts
   anderes daneben?
2. Die Prüfung selbst laufen lassen oder wenigstens die genannte Ausgabe mit dem Diff abgleichen.
3. Dann den tatsächlichen Stand berichten, auch wenn er vom Bericht abweicht.

Bist du selbst der Arbeiter, gilt dasselbe für deinen Bericht: Befehl nennen, Ergebnis nennen, nichts
melden, was du nicht hast laufen sehen.

## Regressionstests

Ein neuer Test belegt nur dann etwas, wenn er ohne die Korrektur fehlschlägt:

```
Test schreiben, laufen lassen (grün), Korrektur zurücknehmen, laufen lassen (muss rot sein),
Korrektur wiederherstellen, laufen lassen (grün)
```

Zum Zurücknehmen keine Git-Befehle nehmen, die fremde Änderungen im Arbeitsordner mitreißen könnten
(`git stash`, `git checkout`, `git restore`). Die eine Stelle von Hand ändern und danach wiederherstellen.

## Anforderungen

Grüne Tests heißen nicht, dass der Auftrag erfüllt ist. Lies den Auftrag noch einmal und geh ihn Punkt für
Punkt durch. Was fehlt, sagst du, statt die Aufgabe als erledigt zu melden.

## Warnzeichen

Halt an, bevor du weiterschreibst, wenn:

- du "sollte", "müsste", "wahrscheinlich" oder "scheint" schreibst,
- du Zufriedenheit zeigst, bevor du geprüft hast ("Super!", "Perfekt!", "Erledigt!", "Passt!"),
- du committen, pushen oder einen Pull Request anlegen willst und die Prüfung noch nicht gelaufen ist,
- du dich auf den Erfolgsbericht eines Arbeiters verlässt,
- du nur einen Teil geprüft hast,
- du denkst "nur dieses eine Mal" oder einfach fertig werden willst.

| Ausrede | Was stimmt |
|---|---|
| "Jetzt sollte es gehen." | Dann lass die Prüfung laufen. |
| "Ich bin mir sicher." | Sicherheit ist kein Beleg. |
| "Nur dieses eine Mal." | Keine Ausnahme. |
| "Der Linter ist grün." | Der Linter ist kein Compiler und kein Test. |
| "Der Arbeiter hat Erfolg gemeldet." | Selbst nachsehen. |
| "Die Teilprüfung reicht." | Eine Teilprüfung belegt nur den Teil. |
| "Anders formuliert gilt die Regel nicht." | Es geht um die Aussage, nicht um das Wort. |

## Wann der Skill gilt

Immer vor:

- jeder Meldung, dass etwas fertig, behoben, bestanden oder erledigt ist, in welchen Worten auch immer,
- jedem zufriedenen oder positiven Satz über den Stand der Arbeit,
- Commit, Push und Pull Request,
- dem Wechsel zur nächsten Aufgabe oder zum nächsten Schritt eines Plans,
- dem Weitergeben eines Arbeiterberichts.

Kannst du etwas nicht prüfen (kein Testlauf möglich, nur live zu sehen), sag genau das: was du geprüft
hast, was nicht, und was offen bleibt. "Ungeprüft" ist eine ehrliche Meldung, "fertig" wäre keine.

Grundlage: verification-before-completion aus Superpowers von Jesse Vincent
(https://github.com/obra/superpowers, MIT), deutsche Fassung.
