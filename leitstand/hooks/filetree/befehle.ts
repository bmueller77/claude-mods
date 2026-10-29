import type { LeitstandBefehl } from '../logic'

/**
 * Das Seitenfenster Dateien. Die Fenster des Leitstands selbst heißen leitstand-history, -plan,
 * -recap und -settings. Wer es öffnet ($.ui.open mit dieser id), sieht den Baum, den Dateien seit dem Start hält.
 */
export const DATEIEN_FENSTER = 'leitstand-dateien'

const GRUPPE = 'Dateien'
const KOPF = 'oben im Fenster Dateien'

/** Die Befehle von Dateien (bis 2026-10-26 der Mod Filetree), in der Reihenfolge der Übersicht. */
export const FILETREE_BEFEHLE: readonly LeitstandBefehl[] = [
  {
    name: 'leitstand:dateien',
    description: 'Dateien im Seitenfenster zeigen',
    argumentHint: '[Pfad]',
    gruppe: GRUPPE,
    tut: 'Öffnet das Fenster Dateien: die Dateien des Projekts als Baum. Was Claude liest, leuchtet lila, was er schreibt orange, was er committet grün. Ohne Pfad folgt es dem Arbeitsordner, mit Pfad bleibt es bei diesem Ordner. Geht nur am Rechner.',
    knopf: `Button: 📂 unten links in der Leiste; ohne Pfad auch ⌂ ${KOPF}`,
    gilt: 'chat',
    argumente: 'Pfad (freiwillig): ein Ordner, absolut, relativ zum Arbeitsordner oder mit ~ für dein Benutzerverzeichnis.',
    beispiel: '/leitstand:dateien src',
  },
  {
    name: 'leitstand:dateien-versteckte-an',
    description: 'Versteckte Dateien zeigen (◉)',
    gruppe: GRUPPE,
    tut: 'Zeigt im Fenster Dateien auch versteckte Dateien und Ordner, die mit einem Punkt beginnen.',
    knopf: `Button: ○ ${KOPF}; danach zeigt er ◉.`,
    gilt: 'chat',
    argumente: '',
    beispiel: '/leitstand:dateien-versteckte-an',
  },
  {
    name: 'leitstand:dateien-versteckte-aus',
    description: 'Versteckte Dateien ausblenden (○)',
    gruppe: GRUPPE,
    tut: 'Blendet im Fenster Dateien versteckte Dateien und Ordner aus, die mit einem Punkt beginnen.',
    knopf: `Button: ◉ ${KOPF}; danach zeigt er ○.`,
    gilt: 'chat',
    argumente: '',
    beispiel: '/leitstand:dateien-versteckte-aus',
  },
  {
    name: 'leitstand:dateien-groessen-an',
    description: 'Dateien: Größe statt Datum zeigen (Σ)',
    gruppe: GRUPPE,
    tut: 'Die rechte Spalte im Fenster Dateien zeigt die Größe statt des Datums; die Größe von Ordnern zählt der Leitstand im Hintergrund zusammen.',
    knopf: `Button: Σ ${KOPF}; leuchtet danach.`,
    gilt: 'einstellung',
    option: 'Dateien: rechte Spalte',
    argumente: '',
    beispiel: '/leitstand:dateien-groessen-an',
  },
  {
    name: 'leitstand:dateien-groessen-aus',
    description: 'Dateien: Datum statt Größe zeigen (Σ)',
    gruppe: GRUPPE,
    tut: 'Die rechte Spalte im Fenster Dateien zeigt wieder das Datum der letzten Änderung.',
    knopf: `Button: Σ ${KOPF}; ist danach blass.`,
    gilt: 'einstellung',
    option: 'Dateien: rechte Spalte',
    argumente: '',
    beispiel: '/leitstand:dateien-groessen-aus',
  },
  {
    name: 'leitstand:dateien-neu-laden',
    description: 'Dateien neu einlesen (↻)',
    gruppe: GRUPPE,
    tut: 'Liest im Fenster Dateien die offenen Ordner, den Git-Stand und die Größen neu ein und wiederholt eine laufende Suche.',
    knopf: `Button: ↻ ${KOPF}`,
    gilt: 'einmal',
    argumente: '',
    beispiel: '/leitstand:dateien-neu-laden',
  },
  {
    name: 'leitstand:dateien-einklappen',
    description: 'Dateien: alle Ordner einklappen (⊟)',
    gruppe: GRUPPE,
    tut: 'Klappt im Fenster Dateien alle Ordner ein; zu sehen bleibt die oberste Ebene.',
    knopf: `Button: ⊟ ${KOPF}`,
    gilt: 'einmal',
    argumente: '',
    beispiel: '/leitstand:dateien-einklappen',
  },
]

/** Alte Namen aus der Zeit als eigener Mod, je mit dem vollen neuen Namen (/filetree-… → leitstand:…). */
export const FILETREE_ALTE: Readonly<Record<string, string>> = {
  'filetree-hilfe': 'leitstand:hilfe',
  'filetree-zeigen': 'leitstand:dateien',
  'filetree-versteckte-an': 'leitstand:dateien-versteckte-an',
  'filetree-versteckte-aus': 'leitstand:dateien-versteckte-aus',
  'filetree-groessen-an': 'leitstand:dateien-groessen-an',
  'filetree-groessen-aus': 'leitstand:dateien-groessen-aus',
  'filetree-neu-laden': 'leitstand:dateien-neu-laden',
  'filetree-einklappen': 'leitstand:dateien-einklappen',
}
