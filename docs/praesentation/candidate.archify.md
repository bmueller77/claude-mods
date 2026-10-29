# Was können die BM-Mods für Claude Code? {#bm-mods}

Der Katalog BM-Mods macht Claude Code sichtbar und steuerbar: **acht eigene Mods**, dazu ein fremder, mit dem Leitstand als Schaltzentrale über der Eingabe.

- Der Leitstand zeigt Plan, Fortschritt und Helfer über der Eingabe und schaltet die Arbeitsweise um.[](source:readme)
- Modellwahl und Prompt Upgrade setzen an, bevor Claude arbeitet: passendes Modell, besserer Prompt.
- Zusammenfassung, Nächste Schritte und Statistik melden nach jeder Runde, was passiert ist und was als Nächstes kommt.
- Jeder Button hat einen Befehl, deshalb geht alles auch vom Handy aus.[](source:befehle)

@answer scope="Stand 29.10.2026 · leitstand 0.63.1 · Desktop-App und Terminal · Reihenfolge vor der Arbeit vereinfacht"
@meta locale=en style=editorial
@source readme title="README des Katalogs BM-Mods" url=https://github.com/bmueller77/claude-mods
@source befehle title="BEFEHLE.md: alle Befehle je Mod" url=https://github.com/bmueller77/claude-mods/blob/main/BEFEHLE.md

## Was passiert mit einer Nachricht? {#nachricht}

@workflow id=runde title="Eine Nachricht auf ihrem Weg"
| lane vorher | Bevor Claude arbeitet |
| lane waehrend | Während Claude arbeitet |
| lane danach | Nach der Antwort |
| du | Du schreibst | external | vorher |
| schutz | Passwortschutz | security | vorher |
| upgrade | Prompt Upgrade | backend | vorher |
| wahl | Modellwahl | backend | vorher |
| plan | Plan im Band | frontend | waehrend |
| arbeit | Claude arbeitet | backend | waehrend |
| summe | Zusammenfassung | frontend | danach |
| vorschlag | Nächste Schritte | frontend | danach |
| stat | Statistik | frontend | danach |
| du > schutz | |
| schutz > upgrade | kein Passwort |
| upgrade > wahl | |
| wahl > plan | |
| plan > arbeit | Start | emphasis |
| arbeit > summe | fertig |
| arbeit > vorschlag | Ideen |
| arbeit > stat | Tokens |

@steps id=runde-schritte
| s-schutz | Passwortschutz | Sieht eine Nachricht aus, als enthielte sie ein Passwort, hält der Leitstand sie zwei Minuten zurück. Trotzdem senden schickt sie ab. | runde | schutz |
| s-upgrade | Prompt Upgrade | Mit `/better` stellt es bis zu drei Rückfragen und zeigt den besseren Prompt neben dem Original. | runde | upgrade |
| s-wahl | Modellwahl | Schlägt einmal je Aufgabe Modell und Aufwand vor. Am Rechner gilt der Vorschlag nach 15 Sekunden. | runde | wahl |
| s-plan | Plan im Band | Der Leitstand zeigt Plan, Fortschritt und Helfer über der Eingabe. In der Gruppenarbeit wartet der Plan auf Start. | runde | plan |
| s-summe | Zusammenfassung | Zwei Zeilen nach jeder Arbeitsrunde: was getan wurde und was man leicht übersieht. | runde | summe |
| s-vorschlag | Nächste Schritte | Zwei oder drei Vorschläge für die nächste Eingabe, per Ziffer oder Button ins Feld. | runde | vorschlag |
| s-stat | Statistik | Eine Zeile mit Nutzungslimits, Tokens, Kontext und Cache-Uhr. | runde | stat |

## Was steckt im Leitstand? {#leitstand}

@tree id=leitstand-buttons title="Die Buttons des Leitstands"
| root | Leitstand | - |
| arbeitsweise | Arbeitsweise | root |
| auto | Auto-Modus | arbeitsweise |
| gruppe | Gruppenarbeit | arbeitsweise |
| autopilot | Autopilot | arbeitsweise |
| helfer | Helfer | root |
| kurz | Kurzantworten | helfer |
| mensch | Vermenschlichen | helfer |
| grill | Grill mich | helfer |
| kritik | Selbstkritik | helfer |
| sauber | Sauberer Code | helfer |
| fenster | Fenster | root |
| dateien | Dateien | fenster |
| planfenster | Plan | fenster |
| verlauf | Verlauf | fenster |
| schutzgruppe | Schutz | root |
| verdecken | Verdecken | schutzgruppe |
| geheim | Geheimnisse sichern | schutzgruppe |
| passwort | Passwortschutz | schutzgruppe |
| steuerung | Steuerung | root |
| start | Start, Pause, Weiter | steuerung |
| neu | Neuer Chat | steuerung |
| push | Push | steuerung |
| fern | Remote Control | steuerung |

Selbstkritik, Dateien und Autopilot waren früher eigene Mods. Seit 26.10.2026 sind sie Teile des Leitstands, weil ein Mod keinen anderen aufruft.

## Wie läuft die Gruppenarbeit? {#gruppenarbeit}

@sequence id=gruppenarbeit-ablauf title="Planen, freigeben, delegieren"
| actor du | Du | external |
| actor leiter | Claude als Leiter | backend |
| actor band | Leitstand | frontend |
| actor arbeiter | Arbeiter | backend |
| phase | Planen |
| du | leiter | Auftrag |
| leiter | band | Plan mit Schritten |
| band | du | Plan wartet auf Start |
| du | band | Start oder los |
| phase | Umsetzen |
| leiter | arbeiter | Auftrag je Schritt | emphasis |
| arbeiter | leiter | Bericht | return |
| leiter | band | Fortschritt |
| leiter | du | Ergebnis, geprüft | return |

Claude plant und prüft, die Arbeiter setzen um. Die Stufe richtet sich nach der Aufgabe: Haiku sucht und liest, Sonnet ändert Mechanisches, Opus baut Features und sucht Fehler. Ein Plan, der nur liest, startet ohne Freigabe.

## Welcher Mod tut was? {#mods}

| Mod | Was er tut | Kostet Tokens |
| --- | --- | --- |
| Leitstand | Plan, Fortschritt, Helfer und Verlauf über der Eingabe; Arbeitsweisen, Schalter, Selbstkritik, Dateien, Autopilot | Ja, Haiku benennt jeden Auftrag |
| Statistik | Nutzungslimits, Tokens, Kontext und Cache-Uhr in einer Zeile; Warmhalten, Aufräumen, Compact | Nur beim Warmhalten und Aufräumen |
| Modellwahl | Schlägt je Aufgabe Modell und Aufwand vor | Ein Haiku-Aufruf je Wahl |
| Prompt Upgrade | `/better`: Rückfragen, dann ein besserer Prompt neben dem Original | Zwei Haiku-Aufrufe je Upgrade |
| Zusammenfassung | Nach jeder Runde: was getan wurde und was man übersieht, mit Dateiliste und Replay | Ein Haiku-Aufruf je Runde |
| Nächste Schritte | Zwei oder drei Vorschläge für die nächste Eingabe | Ein Haiku-Aufruf je Antwort |
| Visible Compact | Chat vor und nach `/compact` nebeneinander, auf Wunsch übersetzt | Nur beim Übersetzen |
| Kurzfassen | Skill: zuerst die nächste Handlung, dann nummerierte Schritte | Nur der Skilltext |
| i-have-adhd | Englisches Original von Kurzfassen, fremd | Nur der Skilltext |

## Wie kommen die Mods auf einen Rechner? {#installieren}

```bash title="Neue Instanz einrichten"
git clone https://github.com/bmueller77/claude-mods && claude-mods/install.sh
```

```bash title="Auf den neuesten Stand bringen"
claude plugin marketplace update bm-mods
```

@callout level=note title="Alles auch per Befehl"
Jeder Button hat einen Befehl der Form `/<mod>:<funktion>`, etwa `/leitstand:pause` oder `/statistik:warmhalten-aus`.
Das Wort `hilfe` dahinter erklärt den Befehl, `/<mod>:hilfe` listet alle.
