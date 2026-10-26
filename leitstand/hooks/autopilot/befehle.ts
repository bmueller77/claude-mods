import type { LeitstandBefehl } from '../logic'

const GRUPPE = 'Autopilot'

/** Die Befehle von Autopilot (früher ein eigener Mod), in der Reihenfolge der Übersicht. */
export const AUTOPILOT_BEFEHLE: readonly LeitstandBefehl[] = [
  {
    name: 'leitstand:autopilot-an',
    description: 'Autopilot einschalten: Claude arbeitet ohne Rückfragen weiter, während du weg bist',
    gruppe: GRUPPE,
    tut: 'Claude stellt keine Rückfragen mehr, schiebt Runden ohne Abschluss an und schreibt am Ende eine Übergabe. Ein angehaltener Autopilot läuft wieder.',
    knopf: '🅰️ (leuchtet, solange der Autopilot an ist)',
    gilt: 'chat',
    argumente: '',
    beispiel: '/leitstand:autopilot-an',
  },
  {
    name: 'leitstand:autopilot-aus',
    description: 'Autopilot ausschalten; danach steht der Bericht über dem Eingabefeld',
    gruppe: GRUPPE,
    tut: 'Beendet den Autopiloten. Sein Bericht steht danach über dem Eingabefeld, bis du ihn wegräumst.',
    knopf: '🅰️, solange er an ist, oder Beenden in der Autopilot-Zeile',
    gilt: 'chat',
    argumente: '',
    beispiel: '/leitstand:autopilot-aus',
  },
  {
    name: 'leitstand:autopilot-fragen-zeigen',
    description: 'Die Fragen, die Claude im Autopiloten selbst entschieden hat, als Text',
    gruppe: GRUPPE,
    tut: 'Zeigt die Rückfragen, die Claude während des Autopiloten selbst entschieden hat, als Liste im Chat.',
    knopf: 'Fragen in der Autopilot-Zeile, hier als Text statt aufgeklappt',
    gilt: 'einmal',
    argumente: '',
    beispiel: '/leitstand:autopilot-fragen-zeigen',
  },
  {
    name: 'leitstand:autopilot-bericht-weg',
    description: 'Den Bericht des beendeten Autopiloten über dem Eingabefeld wegräumen',
    gruppe: GRUPPE,
    tut: 'Räumt den Bericht des beendeten Autopiloten über dem Eingabefeld weg.',
    knopf: 'Weg in der Autopilot-Zeile',
    gilt: 'einmal',
    argumente: '',
    beispiel: '/leitstand:autopilot-bericht-weg',
  },
]

/**
 * Der Grundbefehl /autopilot [an|aus], wie er als eigener Mod hieß. Er steht nicht in der Übersicht des Leitstands (dort
 * stehen nur Befehle mit leitstand: davor); seine Hilfe kommt aus diesem Eintrag.
 */
export const AUTOPILOT_GRUNDBEFEHL: LeitstandBefehl = {
  name: 'autopilot',
  description: 'Autopilot ein- oder ausschalten: Claude arbeitet ohne Rückfragen weiter, während du weg bist',
  argumentHint: '[an|aus]',
  gruppe: GRUPPE,
  tut: 'Schaltet den Autopiloten ein oder aus, wie /leitstand:autopilot-an und /leitstand:autopilot-aus.',
  knopf: '🅰️',
  gilt: 'chat',
  argumente: 'an oder aus. Ohne Argument schaltet er um.',
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
