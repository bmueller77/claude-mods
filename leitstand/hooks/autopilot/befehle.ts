import type { LeitstandBefehl } from '../logic'

const GRUPPE = 'Autopilot'

/** Was der Autopilot tut, in der einen Fassung, die auch die Übersicht des Leitstands nennt. */
export const AUTOPILOT_TUT =
  'Ohne Rückfragen heißt: Claude stellt dir keine Fragen und entscheidet selbst, bei Zweifeln für das, was sich leicht rückgängig machen lässt; was du nicht vorher verlangt hast, löscht, veröffentlicht, verschickt oder pusht er nicht, und Buttons wie Push drückt der Autopilot nicht. ' +
  'Erlaubnis-Abfragen von Claude Code für Werkzeuge beantwortet er nicht; dann wartet die Arbeit, bis du zurück bist. ' +
  'Bleibt Claude nach einer Runde unfertig stehen, schiebt der Autopilot an: Er schickt eine neue Nachricht, weiterzumachen, so oft wie eingestellt (Option Autopilot: Höchstzahl angeschobener Runden, Standard 10); eine Nachricht von dir zählt von vorn. Solange Helfer im Hintergrund laufen, wartet er. Ein wartender Plan startet nach 30 Sekunden von selbst. ' +
  'Am Ende schreibt Claude eine Übergabe in den Chat: was fertig ist, was er selbst entschieden hat, was liegen blieb. Der Autopilot endet, wenn Claude fertig ist, die Grenze erreicht ist oder Claude ohne dich nicht weiterkommt; stoppen kannst du ihn mit 🅰️ (im Terminal 🤖) oder /leitstand:autopilot-aus.'

const AUTOPILOT_KNOPF = 'Button: 🅰️ unten links (im Terminal 🤖); leuchtet, solange der Autopilot läuft.'

/** Die Befehle von Autopilot (bis 2026-10-26 ein eigener Mod), in der Reihenfolge der Übersicht. */
export const AUTOPILOT_BEFEHLE: readonly LeitstandBefehl[] = [
  {
    name: 'leitstand:autopilot-an',
    description: 'Autopilot einschalten: Claude arbeitet ohne Rückfragen weiter, während du weg bist',
    gruppe: GRUPPE,
    tut: `${AUTOPILOT_TUT} Ein angehaltener Autopilot läuft wieder.`,
    knopf: AUTOPILOT_KNOPF,
    gilt: 'chat',
    argumente: '',
    beispiel: '/leitstand:autopilot-an',
  },
  {
    name: 'leitstand:autopilot-aus',
    description: 'Autopilot ausschalten; danach steht sein Bericht in der Leiste',
    gruppe: GRUPPE,
    tut: 'Beendet den Autopiloten. Sein Bericht steht danach in der Leiste über dem Eingabefeld, bis du ihn wegräumst: wie oft er angeschoben hat und welche Fragen Claude selbst entschieden hat. Claudes Übergabe steht im Chat.',
    knopf: 'Button: 🅰️ unten links (im Terminal 🤖), solange er leuchtet, oder Beenden in der Zeile des Autopiloten',
    gilt: 'chat',
    argumente: '',
    beispiel: '/leitstand:autopilot-aus',
  },
  {
    name: 'leitstand:autopilot-fragen-zeigen',
    description: 'Die Fragen, die Claude im Autopiloten selbst entschieden hat, als Text',
    gruppe: GRUPPE,
    tut: 'Zeigt die Rückfragen, die Claude während des Autopiloten selbst entschieden hat, als Liste im Chat.',
    knopf: 'Button: Fragen in der Zeile des Autopiloten; der klappt die Liste in der Leiste auf.',
    gilt: 'einmal',
    argumente: '',
    beispiel: '/leitstand:autopilot-fragen-zeigen',
  },
  {
    name: 'leitstand:autopilot-bericht-weg',
    description: 'Den Bericht des beendeten Autopiloten aus der Leiste wegräumen',
    gruppe: GRUPPE,
    tut: 'Räumt den Bericht des beendeten Autopiloten aus der Leiste über dem Eingabefeld weg.',
    knopf: 'Button: Schließen in der Zeile des Autopiloten',
    gilt: 'einmal',
    argumente: '',
    beispiel: '/leitstand:autopilot-bericht-weg',
  },
  {
    name: 'leitstand:autopilot-runden',
    description: 'Wie oft der Autopilot in diesem Chat höchstens in Folge anschiebt',
    argumentHint: '[Zahl]',
    gruppe: GRUPPE,
    tut: 'Stellt ein, wie oft der Autopilot Claude in diesem Chat höchstens in Folge anschiebt, bevor er endet; eine Nachricht von dir zählt von vorn. Gilt auch, wenn der Autopilot gerade aus ist, für den nächsten in diesem Chat. Den Standard für neue Chats hält die Option Autopilot: Höchstzahl angeschobener Runden.',
    knopf: 'Button: keiner; solange der Autopilot läuft, die Auswahl der Anstöße in seiner Zeile.',
    gilt: 'chat',
    argumente: 'Zahl von 1 bis 200; ohne Zahl nennt er die aktuelle Grenze',
    beispiel: '/leitstand:autopilot-runden 30',
  },
]

/**
 * Der Grundbefehl /autopilot [an|aus], wie er als eigener Mod hieß. Die Übersicht des Leitstands nennt ihn in der Gruppe
 * Autopilot; seine Hilfe kommt aus diesem Eintrag.
 */
export const AUTOPILOT_GRUNDBEFEHL: LeitstandBefehl = {
  name: 'autopilot',
  description: 'Autopilot ein- oder ausschalten: Claude arbeitet ohne Rückfragen weiter, während du weg bist',
  argumentHint: '[an|aus]',
  gruppe: GRUPPE,
  tut: 'Schaltet den Autopiloten ein oder aus, wie /leitstand:autopilot-an und /leitstand:autopilot-aus. Was er tut, erklärt /leitstand:autopilot-an hilfe.',
  knopf: 'Button: 🅰️ unten links (im Terminal 🤖)',
  gilt: 'chat',
  argumente: 'an oder aus (freiwillig). Ohne Argument schaltet er um.',
  beispiel: '/autopilot an',
}

/**
 * Alte Namen aus der Zeit als eigener Mod (bis autopilot 0.7), je mit dem vollen neuen Namen. Die meisten sind heute die
 * Kurzformen der neuen Befehle (/autopilot-an); die filtert der Leitstand heraus, sie laufen als Befehl.
 */
export const AUTOPILOT_ALTE: Readonly<Record<string, string>> = {
  'autopilot-hilfe': 'leitstand:hilfe',
  'autopilot-an': 'leitstand:autopilot-an',
  'autopilot-aus': 'leitstand:autopilot-aus',
  'autopilot-fragen-zeigen': 'leitstand:autopilot-fragen-zeigen',
  'autopilot-bericht-weg': 'leitstand:autopilot-bericht-weg',
}
