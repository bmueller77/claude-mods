# Befehle der Mods

Alle Befehle der Mods aus bm-mods, je Mod. Die Grundbefehle ohne Doppelpunkt stehen jeweils oben in der Tabelle. Sie wirken auch mitten in einer Runde sofort, ebenso die Kurzformen des Leitstands.

- `/<mod>:hilfe` listet die Befehle eines Mods.
- `hilfe` hinter einem Befehl erklärt ihn, etwa `/statistik:warmhalten-an hilfe`.
- Befehle mit "(mit ja)" tun erst etwas, wenn `ja` dahinter steht. Ohne `ja` sagen sie, was passieren würde.
- Ein alter Name wie `/statistik-zeigen` oder `/leitstand-pause` antwortet nur noch mit dem neuen.

## Leitstand

Die Checkliste über der Eingabe: Plan, Fortschritt, Helfer, Verlauf und Teambericht, dazu die Schalter in der Button-Zeile und die Einstellungen. Seit 2026-10-26 gehören Selbstkritik und Regeln (früher der Mod Reflect), Dateien (früher Filetree) und der Autopilot dazu. Bis auf `an`, `aus`, `hilfe` und `vermenschlichen` geht jeder Befehl auch ohne `leitstand:` davor, etwa `/pause`, `/selbstkritik` oder `/autopilot-an`.

| Befehl | Was er tut |
|---|---|
| `/leitstand …` | Grundbefehl mit den älteren englischen Unterbefehlen, etwa on, off, pause, continue, plan, week und tour |
| `/reflect [Schwerpunkt]` | Selbstkritik der bisherigen Arbeit, gelernte Regeln verwalten |
| `/filetree [Pfad]` | Öffnet die Dateien wie /dateien, ohne Pfad im Arbeitsordner |
| `/autopilot [an\|aus]` | Autopilot ein- oder ausschalten: Claude arbeitet ohne Rückfragen weiter, während du weg bist |

### Allgemein

| Befehl | Was er tut |
|---|---|
| `/leitstand:hilfe` | Alle Leitstand-Befehle im Überblick |
| `/leitstand:an` | Leitstand einschalten |
| `/leitstand:aus` | Leitstand ausschalten |
| `/leitstand:tour` | Die Begrüßung noch mal zeigen |
| `/leitstand:buttons-zeigen` | Die Buttons des Leitstands erklären |

### Ansicht

| Befehl | Was er tut |
|---|---|
| `/leitstand:ansicht-einfach` | Ansicht Einfach: Schritte und Fortschritt |
| `/leitstand:ansicht-detailliert` | Ansicht Detailliert: dazu Zeit und Tokens |
| `/leitstand:ansicht-minimal` | Ansicht Minimal: eine Zeile mit dem Stand |

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
| `/leitstand:neuer-chat [ja]` | Neuer Chat mit Übergabenotiz (mit ja) |
| `/leitstand:uebergabe-schreiben` | Übergabenotiz schreiben, ohne den Chat zu leeren |
| `/leitstand:uebergabe-zeigen` | Die letzte Übergabenotiz zeigen |
| `/leitstand:abschliessen [ja]` | Auf GitHub abschließen: Commit, Pull Request, Merge (mit ja) |

### Verlauf und Berichte

| Befehl | Was er tut |
|---|---|
| `/leitstand:verlauf-zeigen [gestern\|JJJJ-MM-TT]` | Den Verlauf eines Tages zeigen |
| `/leitstand:tagesbericht` | Tagesbericht für heute als Text |
| `/leitstand:wochenbericht` | Wochenbericht für diese Woche als Text |
| `/leitstand:meine-woche` | Deine Woche über alle Projekte |

### Helfer

| Befehl | Was er tut |
|---|---|
| `/leitstand:kurzantworten-an` | Kurzantworten einschalten |
| `/leitstand:kurzantworten-aus` | Kurzantworten ausschalten |
| `/leitstand:vermenschlichen` | Letzte Antwort natürlicher umschreiben |
| `/leitstand:ausfragen [Thema]` | Grill mich: Claude löchert dich mit Fragen |
| `/leitstand:sauberer-code` | Code prüfen lassen mit dem Skill clean-code |
| `/leitstand:skill-menue` | Liste aller installierten Skills zeigen; 🧩 im Band klappt sie auf |
| `/leitstand:fernsteuerung-an` | Remote Control einschalten |
| `/leitstand:fernsteuerung-aus` | Remote Control ausschalten |

### Selbstkritik

| Befehl | Was er tut |
|---|---|
| `/leitstand:selbstkritik [Schwerpunkt]` | Claude prüft die bisherige Arbeit kritisch |
| `/leitstand:selbstkritik-zeigen` | Die neueste Selbstkritik als Text zeigen |
| `/leitstand:selbstkritik-beheben` | Die Punkte der Selbstkritik als Auftrag ins Eingabefeld legen |
| `/leitstand:selbstkritik-kopieren` | Die neueste Selbstkritik kopieren |
| `/leitstand:selbstkritik-auto-an` | Selbstkritik nach jeder Runde mit Dateiänderungen |
| `/leitstand:selbstkritik-auto-aus` | Keine Selbstkritik nach Dateiänderungen |

### Regeln

| Befehl | Was er tut |
|---|---|
| `/leitstand:regeln` | Wartende Regeln mit Nummern zeigen |
| `/leitstand:regel-global <Nr>` | Eine wartende Regel für alle Projekte speichern |
| `/leitstand:regel-projekt <Nr>` | Eine wartende Regel für dieses Projekt speichern |
| `/leitstand:regel-chat <Nr>` | Eine wartende Regel nur für diesen Chat übernehmen |
| `/leitstand:regel-bearbeiten <Nr>` | Eine wartende Regel umformulieren |
| `/leitstand:regel-verwerfen <Nr>` | Eine wartende Regel verwerfen |
| `/leitstand:regelpruefung-an` | Korrekturen auf Regeln prüfen |
| `/leitstand:regelpruefung-aus` | Korrekturen nicht mehr auf Regeln prüfen |

### Dateien

| Befehl | Was er tut |
|---|---|
| `/leitstand:dateien [Pfad]` | Dateien im Seitenfenster zeigen |
| `/leitstand:dateien-versteckte-an` | Versteckte Dateien zeigen (◉) |
| `/leitstand:dateien-versteckte-aus` | Versteckte Dateien ausblenden (○) |
| `/leitstand:dateien-groessen-an` | Dateien: Größe statt Datum zeigen (Σ) |
| `/leitstand:dateien-groessen-aus` | Dateien: Datum statt Größe zeigen (Σ) |
| `/leitstand:dateien-neu-laden` | Dateien neu einlesen (↻) |
| `/leitstand:dateien-einklappen` | Dateien: alle Ordner einklappen (⊟) |

### Autopilot

| Befehl | Was er tut |
|---|---|
| `/leitstand:autopilot-an` | Autopilot einschalten: Claude arbeitet ohne Rückfragen weiter, während du weg bist |
| `/leitstand:autopilot-aus` | Autopilot ausschalten; danach steht sein Bericht in der Leiste |
| `/leitstand:autopilot-fragen-zeigen` | Die Fragen, die Claude im Autopiloten selbst entschieden hat, als Text |
| `/leitstand:autopilot-bericht-weg` | Den Bericht des beendeten Autopiloten aus der Leiste wegräumen |

### Schutz

| Befehl | Was er tut |
|---|---|
| `/leitstand:verdecken-an` | Verdecken einschalten |
| `/leitstand:verdecken-aus` | Verdecken ausschalten |
| `/leitstand:passwortschutz-an` | Passwortschutz einschalten |
| `/leitstand:passwortschutz-aus` | Passwortschutz ausschalten |
| `/leitstand:trotzdem-senden` | Zurückgehaltene Nachricht trotzdem senden |
| `/leitstand:nachricht-verwerfen` | Zurückgehaltene Nachricht verwerfen |
| `/leitstand:geheimnisse-sichern [ja]` | Passwörter aus dem Chat in die .env verschieben (mit ja) |

### Einstellungen

| Befehl | Was er tut |
|---|---|
| `/leitstand:einstellungen-zeigen` | Das Einstellungsfenster öffnen |
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
| `/leitstand:zuruecksetzen` | Einstellungen auf den Standard zurücksetzen |

## Statistik

Eine Leiste über der Eingabe mit Chatlänge, Kontext, Cache-Uhr und Nutzungslimits. Hält den Prompt-Cache auf Wunsch warm und räumt den Chat mit Sicherungspunkt auf.

| Befehl | Was er tut |
|---|---|
| `/statistik` | Zeigt Cache, Kontext, Kosten, Limits und Warmhalten dieses Chats als Text |
| `/warmhalten [6h \| 90m \| immer \| aus \| status]` | Hält den Cache warm: ohne Angabe 6 Stunden, eine Dauer wie 90m, immer, aus oder status |
| `/statistik:hilfe` | Zeigt, wie die Statistik arbeitet, was die Leiste bedeutet, wie du sie einstellst, und alle Befehle |
| `/statistik:zeigen` | Zeigt Cache, Kontext, Kosten, Limits und Warmhalten dieses Chats als Text, wie /statistik |
| `/statistik:kontext-zeigen` | Zeigt den Kontext im Detail mit /context, vom Handy als eine Zeile |
| `/statistik:warmhalten-an [Dauer, z. B. 3h oder 90m]` | Hält den Cache warm, ohne Angabe 6 Stunden, sonst so lange wie angegeben |
| `/statistik:warmhalten-immer` | Hält den Cache warm, bis dieser Chat endet |
| `/statistik:warmhalten-aus` | Schaltet das Warmhalten des Caches sofort aus |
| `/statistik:chat-aufraeumen` | Räumt den Chat auf: erst ein Sicherungspunkt, dann verdichten, sofort ohne Countdown |
| `/statistik:letzter-stand-zeigen` | Zeigt den Sicherungspunkt vom letzten Aufräumen dieses Chats |
| `/statistik:zusammenfassung-zeigen` | Zeigt die Zusammenfassung vom letzten Verdichten dieses Chats |
| `/statistik:verdichten` | Verdichtet den Chat (/compact), sofort ohne Countdown |

## Nächste Schritte

Nach jeder Antwort zwei oder drei Vorschläge für die nächste Eingabe. Im leeren Eingabefeld holt die Ziffer 1, 2 oder 3 einen Vorschlag als Entwurf. Einen Grundbefehl hat der Mod nicht.

| Befehl | Was er tut |
|---|---|
| `/naechste-schritte:hilfe` | Was Nächste Schritte tut, wie du damit arbeitest, alle Befehle |
| `/naechste-schritte:zeigen` | Die aktuellen Vorschläge als nummerierte Liste zeigen |
| `/naechste-schritte:1` | Den 1. Vorschlag für den nächsten Schritt sofort als deine Nachricht abschicken |
| `/naechste-schritte:2` | Den 2. Vorschlag für den nächsten Schritt sofort als deine Nachricht abschicken |
| `/naechste-schritte:3` | Den 3. Vorschlag für den nächsten Schritt sofort als deine Nachricht abschicken |

## Zusammenfassung

Nach jeder Arbeitsrunde steht über der Eingabe, was getan wurde und was man leicht übersieht, mit Dateiliste und Replay.

| Befehl | Was er tut |
|---|---|
| `/zusammenfassung` | Die Zusammenfassung nach jeder Runde in diesem Chat aus- oder einschalten |
| `/replay` | Jede Dateiänderung der letzten Runde Schritt für Schritt zeigen |
| `/zusammenfassung:hilfe` | Was die Zusammenfassung tut, wie du sie einstellst, alle Befehle |
| `/zusammenfassung:an` | Die Zusammenfassung nach jeder Runde in diesem Chat einschalten |
| `/zusammenfassung:aus` | Die Zusammenfassung in diesem Chat ausschalten; das Replay bleibt |
| `/zusammenfassung:aufklappen` | Die Zusammenfassung aufklappen: ganze Zeilen, Erklärung zum Hinweis, geänderte Dateien |
| `/zusammenfassung:zuklappen` | Die aufgeklappte Zusammenfassung wieder zuklappen |
| `/zusammenfassung:replay` | Jede Dateiänderung der letzten Runde Schritt für Schritt zeigen |

## Visible Compact

Zeigt den Chat vor und nach /compact nebeneinander in einem Seitenfenster, auf Wunsch auf Deutsch.

| Befehl | Was er tut |
|---|---|
| `/show-last-compact` | Öffnet „Verdichtungen des Chats“ wieder: was verdichtet wurde, neben dem, was danach übrig blieb |
| `/visible-compact:hilfe` | Zeigt, wie Visible Compact arbeitet, wie du es einstellst, und alle Befehle |
| `/visible-compact:zeigen` | Öffnet das Fenster "Verdichtungen des Chats" mit der neuesten Verdichtung, vom Handy als Text |
| `/visible-compact:uebersetzen-an` | Zeigt englische Abschnitte im Fenster auf Deutsch, nur in diesem Chat |
| `/visible-compact:uebersetzen-aus` | Zeigt die Abschnitte im Fenster wieder im Original, nur in diesem Chat |

## Prompt Upgrade

Macht aus einem groben Prompt mit bis zu drei Rückfragen einen besseren. Gesendet wird erst auf Ausführen.

| Befehl | Was er tut |
|---|---|
| `/better <Prompt>` | Prompt-Upgrade: verbessert deinen Prompt mit Rückfragen, bevor du ihn sendest; an, aus, verlauf, hilfe |
| `/prompt-upgrade:hilfe` | Erklärt Prompt-Upgrade: wie du damit arbeitest, es einstellst und welche Befehle es gibt |
| `/prompt-upgrade:starten <Prompt>` | Öffnet deinen Prompt im Seitenfenster zum Verbessern; gesendet wird erst mit Ausführen |
| `/prompt-upgrade:automatik-an` | Hält jede Nachricht, die du am Rechner tippst, zum Verbessern an (nur dieser Chat) |
| `/prompt-upgrade:automatik-aus` | Was du tippst, wird wieder direkt gesendet (nur dieser Chat) |
| `/prompt-upgrade:verlauf` | Zeigt deine letzten 20 Upgrades aus allen Chats, am Rechner auch im Seitenfenster |
| `/prompt-upgrade:jetzt-verbessern` | Überspringt die offenen Rückfragen und schreibt den Prompt jetzt um |
| `/prompt-upgrade:ausfuehren` | Sendet das Upgrade an Claude und schließt das Seitenfenster |
| `/prompt-upgrade:original-senden` | Sendet nach einem Fehler deinen Prompt unverändert an Claude |
| `/prompt-upgrade:kopieren` | Legt das Upgrade in die Zwischenablage, ohne es zu senden |
| `/prompt-upgrade:abbrechen` | Bricht das Upgrade ab und legt deinen Prompt zurück ins Eingabefeld |

## Modellwahl

Schlägt einmal je Aufgabe Modell und Aufwand vor. Am Rechner gilt der Vorschlag nach 15 s, vom Handy erst auf ja oder ok.

| Befehl | Was er tut |
|---|---|
| `/modellwahl [Aufgabe \| ja \| nein]` | Modellwahl: Schlägt Modell und Aufwand für diesen Chat passend zur Aufgabe vor; ja übernimmt, nein verwirft, hilfe erklärt |
| `/modellwahl:hilfe` | Erklärt Modellwahl: wie du damit arbeitest, es einstellst und welche Befehle es gibt |
| `/modellwahl:uebernehmen` | Nimmt den offenen Vorschlag der Modellwahl an, wie /modellwahl ja |
| `/modellwahl:ablehnen` | Verwirft den offenen Vorschlag der Modellwahl; Modell und Aufwand bleiben |
| `/modellwahl:zeigen` | Zeigt, welches Modell und welcher Aufwand in diesem Chat gelten und warum |
| `/modellwahl:auto-an` | Vorschlag beim Neubeginn dieses Chats an: erste Nachricht, auch nach /clear (nur dieser Chat) |
| `/modellwahl:auto-aus` | Vorschlag beim Neubeginn dieses Chats aus: erste Nachricht, auch nach /clear (nur dieser Chat) |

## kurzfassen

Kurzfassen als Skill, die deutsche Fassung von i-have-adhd: zuerst die nächste Handlung, dann nummerierte Schritte. Außer dem Skill bringt er einen Befehl mit. Ein- und ausgeschaltet wird er im Leitstand mit `/kurzantworten-an` und `/kurzantworten-aus` oder dem Button 📖/📝, oder direkt mit `/kurzfassen:kurzfassen` und "Kurzfassen aus".

| Befehl | Was er tut |
|---|---|
| `/kurzfassen:hilfe` | Was Kurzfassen tut, wie du es ein- und ausschaltest |

## Sorgfalt

Zwei Skills, die von selbst greifen, deutsche Fassung aus Superpowers von Jesse Vincent: debuggen sucht bei einem Fehler erst die Ursache und belegt sie, belegen verlangt eine frisch ausgeführte Prüfung vor jeder Fertig-Meldung. Von Hand rufen sie die beiden Skill-Befehle.

| Befehl | Was er tut |
|---|---|
| `/sorgfalt:debuggen` | Den aktuellen Fehler systematisch untersuchen: erst die Ursache belegen, dann reparieren |
| `/sorgfalt:belegen` | Den Stand frisch prüfen und mit Beleg melden |
| `/sorgfalt:hilfe` | Was Sorgfalt tut, wann die Skills greifen, wie du sie abschaltest |

## Clean Code

Ein Skill, der von selbst greift, wenn Claude Code prüft oder umbaut, deutsche und erweiterte Fassung von clean-code aus markky21/claude-skills: Review-Ablauf mit Tests zuerst, Funde nach Folgen geordnet, Frontend-Regeln nur bei Frontend-Code. Von Hand ruft ihn der Skill-Befehl.

| Befehl | Was er tut |
|---|---|
| `/clean-code:clean-code` | Den aktuellen Code nach der Anleitung prüfen oder umbauen |
| `/clean-code:hilfe` | Was Clean Code tut, wann der Skill greift, wie du ihn abschaltest |

## i-have-adhd

Das englische Original von kurzfassen (fremd, bleibt im Katalog). Der Leitstand nutzt es für die Kurzantworten nur, wenn kurzfassen fehlt. Er bringt nur einen Skill mit, keine Befehle.
