# Befehle der Mods

Alle Befehle der Mods aus bjoern-mods, je Mod. Die Grundbefehle ohne Doppelpunkt stehen jeweils oben in der Tabelle. Sie wirken auch mitten in einer Runde sofort, ebenso die Kurzformen des Leitstands.

- `/<mod>:hilfe` listet die Befehle eines Mods.
- `hilfe` hinter einem Befehl erklärt ihn, etwa `/statistik:warmhalten-an hilfe`.
- Befehle mit „(mit ja)“ tun erst etwas, wenn `ja` dahinter steht. Ohne `ja` sagen sie, was passieren würde.
- Ein alter Name wie `/statistik-zeigen` oder `/leitstand-pause` antwortet nur noch mit dem neuen.

## Leitstand

Die Checkliste über der Eingabe: Plan, Fortschritt, Helfer, Verlauf und Teambericht, dazu die Schalter in der Knopfzeile und die Einstellungen. Bis auf `an`, `aus`, `hilfe` und `vermenschlichen` geht jeder Befehl auch ohne `leitstand:` davor, etwa `/pause` oder `/verdecken-an`.

| Befehl | Was er tut |
|---|---|
| `/leitstand …` | Grundbefehl mit den älteren englischen Unterbefehlen, etwa on, off, pause, continue, plan, week und tour |

### Allgemein

| Befehl | Was er tut |
|---|---|
| `/leitstand:hilfe` | Alle Leitstand-Befehle im Überblick |
| `/leitstand:an` | Leitstand einschalten |
| `/leitstand:aus` | Leitstand ausschalten |
| `/leitstand:tour` | Die Begrüßung noch mal zeigen |

### Ansicht

| Befehl | Was er tut |
|---|---|
| `/leitstand:ansicht-einfach` | Ansicht Einfach: Schritte und Fortschritt |
| `/leitstand:ansicht-ausfuehrlich` | Ansicht Ausführlich: dazu Modelle, Zeit und Tokens |
| `/leitstand:ansicht-minimal` | Ansicht Minimal: eine Zeile |

### Arbeitsweise

| Befehl | Was er tut |
|---|---|
| `/leitstand:arbeitsmodus-auto` | Auto-Modus: Claude entscheidet selbst über Helfer |
| `/leitstand:arbeitsmodus-gruppenarbeit` | Gruppenarbeit: Claude leitet, Arbeiter setzen um |

### Auftrag

| Befehl | Was er tut |
|---|---|
| `/leitstand:plan-starten` | Den wartenden Plan starten |
| `/leitstand:pause` | Claude anhalten |
| `/leitstand:weiter` | Claude weitermachen lassen |
| `/leitstand:plan-zeigen` | Den ganzen Plan zeigen |
| `/leitstand:letzter-stand-zeigen` | Den letzten Sicherungspunkt zeigen |
| `/leitstand:neuer-chat [ja]` | Neuer Chat mit Übergabenotiz (mit ja) |
| `/leitstand:abschliessen [ja]` | Auf GitHub abschließen: Commit, Pull Request, Merge (mit ja) |

### Verlauf und Berichte

| Befehl | Was er tut |
|---|---|
| `/leitstand:verlauf-zeigen [gestern\|JJJJ-MM-TT]` | Den Verlauf eines Tages zeigen |
| `/leitstand:tagesbericht` | Teambericht für heute als Text |
| `/leitstand:wochenbericht` | Teambericht für diese Woche als Text |
| `/leitstand:meine-woche` | Deine Woche über alle Projekte |

### Helfer

| Befehl | Was er tut |
|---|---|
| `/leitstand:ausfragen [Thema]` | Grill mich: Claude löchert dich mit Fragen |
| `/leitstand:sauberer-code` | Code prüfen mit clean-code |
| `/leitstand:reflexion` | Reflect starten |
| `/leitstand:vermenschlichen` | Letzte Antwort natürlicher umschreiben |
| `/leitstand:dateibaum` | Filetree öffnen |
| `/leitstand:kurzantworten-an` | Kurzantworten einschalten |
| `/leitstand:kurzantworten-aus` | Kurzantworten ausschalten |
| `/leitstand:fernsteuerung-an` | Remote Control einschalten |
| `/leitstand:fernsteuerung-aus` | Remote Control ausschalten |

### Schutz

| Befehl | Was er tut |
|---|---|
| `/leitstand:verdecken-an` | Verdecken einschalten |
| `/leitstand:verdecken-aus` | Verdecken ausschalten |
| `/leitstand:passwortschutz-an` | Passwortschutz einschalten |
| `/leitstand:passwortschutz-aus` | Passwortschutz ausschalten |
| `/leitstand:geheimnisse-sichern [ja]` | Passwörter aus dem Chat in die .env verschieben (mit ja) |

### Einstellungen

| Befehl | Was er tut |
|---|---|
| `/leitstand:einstellungen-zeigen` | Die Leitstand-Einstellungen öffnen |
| `/leitstand:ton-aus` | Töne ausschalten |
| `/leitstand:ton-signalton` | Töne: Signalton |
| `/leitstand:ton-stimme` | Töne: Signalton und Stimme |
| `/leitstand:ton-anhoeren` | Den eingestellten Ton anhören |
| `/leitstand:benachrichtigungen-an` | Desktop-Benachrichtigungen einschalten |
| `/leitstand:benachrichtigungen-aus` | Desktop-Benachrichtigungen ausschalten |
| `/leitstand:andere-chats-an` | Andere Chats in der Leiste nennen |
| `/leitstand:andere-chats-aus` | Andere Chats nicht mehr nennen |
| `/leitstand:ruhemodus-an` | Ruhemodus einschalten |
| `/leitstand:ruhemodus-aus` | Ruhemodus ausschalten |
| `/leitstand:plan-freigeben-an` | Plan zuerst freigeben: an |
| `/leitstand:plan-freigeben-aus` | Plan zuerst freigeben: aus |
| `/leitstand:github-abschluss-an` | Auf GitHub abschließen: an |
| `/leitstand:github-abschluss-aus` | Auf GitHub abschließen: aus |
| `/leitstand:jetzt-aufraeumen` | Den Chat jetzt aufräumen |
| `/leitstand:zuruecksetzen` | Einstellungen auf den Standard zurücksetzen |

## Statistik

Eine Zeile über der Eingabe mit Nutzungslimits, Tokens, Kontext und Cache-Uhr. Hält den Prompt-Cache auf Wunsch warm.

| Befehl | Was er tut |
|---|---|
| `/statistik` | Cache, Kontext, Kosten und Warmhalten dieser Sitzung im Überblick |
| `/warmhalten [6h \| 90m \| immer \| aus \| status]` | Prompt-Cache warm halten. Ohne Angabe 6 h, eine Dauer wie 90m, immer, aus oder status |
| `/statistik:hilfe` | Alle Befehle der Statistik mit einer Zeile Erklärung |
| `/statistik:zeigen` | Cache, Kontext, Kosten und Warmhalten dieser Sitzung im Überblick, wie /statistik |
| `/statistik:kontext-zeigen` | Den Kontext im Detail zeigen: /context, die Anzeige der App |
| `/statistik:warmhalten-an [Dauer, z. B. 3h oder 90m]` | Prompt-Cache warm halten, ohne Angabe 6 h, sonst so lange wie angegeben |
| `/statistik:warmhalten-immer` | Prompt-Cache ohne Ende warm halten, bis dieser Chat endet |
| `/statistik:warmhalten-aus` | Warmhalten des Prompt-Caches sofort ausschalten |
| `/statistik:chat-aufraeumen` | Den Chat aufräumen: Sicherungspunkt und Verdichten, sofort ohne Countdown |
| `/statistik:verdichten` | Den Kontext verdichten (/compact), sofort ohne Countdown |

## Nächste Schritte

Nach jeder Antwort zwei oder drei Vorschläge für die nächste Eingabe. Im leeren Eingabefeld holt die Ziffer 1, 2 oder 3 einen Vorschlag als Entwurf. Einen Grundbefehl hat der Mod nicht.

| Befehl | Was er tut |
|---|---|
| `/naechste-schritte:hilfe` | Alle Befehle von Nächste Schritte mit einer Zeile Erklärung |
| `/naechste-schritte:zeigen` | Die aktuellen Vorschläge für den nächsten Schritt nummeriert als Text |
| `/naechste-schritte:1` | Den 1. Vorschlag für den nächsten Schritt gleich als Nachricht abschicken |
| `/naechste-schritte:2` | Den 2. Vorschlag für den nächsten Schritt gleich als Nachricht abschicken |
| `/naechste-schritte:3` | Den 3. Vorschlag für den nächsten Schritt gleich als Nachricht abschicken |

## Zusammenfassung

Nach jeder Arbeitsrunde steht über der Eingabe, was getan wurde und was man leicht übersieht, mit Dateiliste und Replay.

| Befehl | Was er tut |
|---|---|
| `/zusammenfassung` | Die Zusammenfassung nach jeder Arbeitsrunde aus- oder einschalten; das Replay bleibt |
| `/replay` | Die Dateiänderungen der letzten Runde Schritt für Schritt zeigen |
| `/zusammenfassung:hilfe` | Alle Befehle der Zusammenfassung mit einer Zeile Erklärung |
| `/zusammenfassung:an` | Die Zusammenfassung nach jeder Arbeitsrunde in diesem Chat einschalten |
| `/zusammenfassung:aus` | Die Zusammenfassung in diesem Chat ausschalten; das Replay bleibt |
| `/zusammenfassung:aufklappen` | Die Zusammenfassung aufklappen: ungekürzt, mit Erklärung zum Hinweis und Dateiliste |
| `/zusammenfassung:zuklappen` | Die aufgeklappte Zusammenfassung wieder zuklappen |
| `/zusammenfassung:replay` | Die Dateiänderungen der letzten Runde Schritt für Schritt zeigen |

## Visible Compact

Zeigt den Chat vor und nach /compact nebeneinander in einem Seitenfenster, auf Wunsch auf Deutsch.

| Befehl | Was er tut |
|---|---|
| `/show-last-compact` | Öffnet „Verdichtungen des Chats“ wieder: was verdichtet wurde, neben dem, was danach übrig blieb |
| `/visible-compact:hilfe` | Listet alle Befehle von Visible Compact |
| `/visible-compact:zeigen` | Öffnet das Fenster „Verdichtungen des Chats“ (wie /show-last-compact) |
| `/visible-compact:uebersetzen-an` | Zeigt englische Abschnitte im Fenster auf Deutsch, nur in diesem Chat |
| `/visible-compact:uebersetzen-aus` | Zeigt die Abschnitte im Fenster wieder im Original, nur in diesem Chat |

## Autopilot

Claude arbeitet ohne Rückfragen weiter, während du weg bist, und schreibt am Ende eine Übergabe.

| Befehl | Was er tut |
|---|---|
| `/autopilot [an\|aus]` | Autopilot ein- oder ausschalten. Claude arbeitet ohne Rückfragen weiter, während du weg bist |
| `/autopilot:hilfe` | Alle Befehle des Autopiloten mit einer Zeile Erklärung |
| `/autopilot:an` | Autopilot einschalten: Claude arbeitet ohne Rückfragen weiter, während du weg bist |
| `/autopilot:aus` | Autopilot ausschalten; danach steht der Bericht über dem Eingabefeld |
| `/autopilot:fragen-zeigen` | Die Fragen, die Claude im Autopiloten selbst entschieden hat, als Text |
| `/autopilot:bericht-weg` | Den Bericht des beendeten Autopiloten über dem Eingabefeld wegräumen |

## Filetree

Ein Dateibaum als Seitenfenster mit Git-Status. Er zeigt, welche Dateien Claude gerade liest, schreibt oder committet.

| Befehl | Was er tut |
|---|---|
| `/filetree [Pfad]` | Zeigt den Dateibaum, ohne Pfad den Arbeitsordner |
| `/filetree:hilfe` | Listet alle Befehle von Filetree |
| `/filetree:zeigen [Pfad]` | Zeigt den Dateibaum in der Seitenleiste (wie /filetree) |
| `/filetree:versteckte-an` | Zeigt versteckte Dateien im Dateibaum (◉) |
| `/filetree:versteckte-aus` | Blendet versteckte Dateien im Dateibaum aus (○) |
| `/filetree:groessen-an` | Zeigt Größen statt Datum im Dateibaum (Σ) |
| `/filetree:groessen-aus` | Zeigt wieder das Datum statt der Größen im Dateibaum (Σ) |
| `/filetree:neu-laden` | Liest den Dateibaum, Git und die Größen neu ein (↻) |
| `/filetree:einklappen` | Klappt alle Ordner im Dateibaum ein (⊟) |

## Reflect

Lernt aus Korrekturen Regeln für CLAUDE.md oder nur für den Chat und lässt Claude die bisherige Arbeit kritisch durchsehen.

| Befehl | Was er tut |
|---|---|
| `/reflect [Schwerpunkt]` | Startet die Selbstkritik; mit zeigen, regeln, speichern &lt;Nr>, verwerfen &lt;Nr> oder hilfe dahinter wirkt er wie die Befehle unten |
| `/reflect:hilfe` | Listet alle Befehle von Reflect |
| `/reflect:starten [Schwerpunkt]` | Startet eine Selbstkritik der bisherigen Arbeit, Ergebnis im Fenster „Reflexion“ |
| `/reflect:zeigen` | Gibt die neueste Reflexion als Text aus und öffnet das Fenster |
| `/reflect:regeln` | Listet die wartenden Regeln mit Nummern |
| `/reflect:speichern-global <Nr>` | Speichert eine wartende Regel in die globale CLAUDE.md (alle Projekte) |
| `/reflect:speichern-projekt <Nr>` | Speichert eine wartende Regel in die CLAUDE.md dieses Projekts |
| `/reflect:speichern-chat <Nr>` | Übernimmt eine wartende Regel nur für diesen Chat |
| `/reflect:bearbeiten <Nr>` | Legt eine wartende Regel als „merke: …“ ins Eingabefeld zum Umformulieren |
| `/reflect:verwerfen <Nr>` | Verwirft eine wartende Regel |
| `/reflect:beheben` | Legt die Punkte der neuesten Reflexion als Auftrag ins Eingabefeld |
| `/reflect:kopieren` | Kopiert die neueste Reflexion in die Zwischenablage |
| `/reflect:pruefung-an` | Kurze Nachrichten auf Regeln prüfen, nur in diesem Chat |
| `/reflect:pruefung-aus` | Kurze Nachrichten nicht mehr auf Regeln prüfen, nur in diesem Chat |
| `/reflect:auto-an` | Selbstkritik nach jeder Runde mit Dateiänderungen, nur in diesem Chat |
| `/reflect:auto-aus` | Keine automatische Selbstkritik mehr, nur in diesem Chat |

## Prompt Upgrade

Macht aus einem groben Prompt mit bis zu drei Rückfragen einen besseren. Gesendet wird erst auf Ausführen.

| Befehl | Was er tut |
|---|---|
| `/better <Prompt>` | Verbessert einen Prompt mit Rückfragen; /better an, aus und verlauf wirken wie die Befehle unten |
| `/prompt-upgrade:hilfe` | Listet alle Befehle von Prompt-Upgrade |
| `/prompt-upgrade:starten <Prompt>` | Verbessert einen Prompt im Seitenfenster, bevor er rausgeht (wie /better &lt;Prompt>) |
| `/prompt-upgrade:automatik-an` | Getippte Prompts erst ins Seitenfenster, nur in diesem Chat |
| `/prompt-upgrade:automatik-aus` | Getippte Prompts gehen direkt raus, nur in diesem Chat |
| `/prompt-upgrade:verlauf` | Zeigt die letzten Upgrades als Text, am Rechner auch im Fenster |
| `/prompt-upgrade:jetzt-verbessern` | Überspringt die übrigen Rückfragen und verbessert jetzt |
| `/prompt-upgrade:ausfuehren` | Schickt den verbesserten Prompt ab |
| `/prompt-upgrade:original-senden` | Schickt nach einem Fehler den Original-Prompt unverändert ab |
| `/prompt-upgrade:kopieren` | Kopiert den verbesserten Prompt in die Zwischenablage |
| `/prompt-upgrade:abbrechen` | Bricht ab, schließt das Fenster und legt den Prompt zurück ins Eingabefeld |

## Modellwahl

Schlägt einmal je Aufgabe Modell und Aufwand vor. Am Rechner gilt der Vorschlag nach 15 s, vom Handy erst auf ja oder ok.

| Befehl | Was er tut |
|---|---|
| `/modellwahl [Aufgabe \| ja \| nein]` | Modell und Aufwand für diesen Chat passend zur Aufgabe vorschlagen; ja übernimmt, nein verwirft |
| `/modellwahl:hilfe` | Kurz erklären, was die Modellwahl tut und welche Befehle es gibt |
| `/modellwahl:uebernehmen` | Den offenen Vorschlag der Modellwahl sofort übernehmen |
| `/modellwahl:ablehnen` | Den offenen Vorschlag der Modellwahl verwerfen; Modell und Aufwand bleiben |
| `/modellwahl:zeigen` | Aktuelle Modellwahl mit Grund, ob sie zurückgezogen ist, und den Stand der Kalibrierung zeigen |
| `/modellwahl:auto-an` | Automatische Modellwahl bei der ersten Nachricht eines neuen Chats einschalten, nur für diesen Chat |
| `/modellwahl:auto-aus` | Automatische Modellwahl bei der ersten Nachricht eines neuen Chats ausschalten, nur für diesen Chat |

## i-have-adhd

Der fremde Mod hinter den Kurzantworten: zuerst die nächste Handlung, dann nummerierte Schritte. Er bringt nur einen Skill mit, keine Befehle. Ein- und ausgeschaltet wird er im Leitstand mit `/kurzantworten-an` und `/kurzantworten-aus` oder dem Knopf 📖/📝.
