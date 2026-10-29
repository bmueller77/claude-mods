import type { LeitstandBefehl } from '../logic'

/*
 * Nur Daten: logic.ts importiert diese Datei, ein Wert-Import aus '../logic' ergäbe einen Kreis. Beantwortet werden die
 * Befehle in teil.tsx.
 */

const NR = 'Nr (Pflicht): die Nummer der Regel aus /leitstand:regeln.'
const MIT_NR = { argumentHint: '<Nr>', argumente: NR }
const FENSTER = 'im Fenster Regeln'
const AM_RECHNER = 'Das Eingabefeld ist das am Rechner.'

/** Ein Befehl von Selbstkritik und Regeln; ohne Argumente ist `argumente` leer, das Beispiel der Befehl selbst. */
const befehl = (
  gruppe: 'Selbstkritik' | 'Regeln',
  name: string,
  description: string,
  tut: string,
  knopf: string,
  gilt: LeitstandBefehl['gilt'],
  mehr: { argumentHint?: string; argumente?: string; beispiel?: string; option?: string; ort?: string; giltText?: string } = {},
): LeitstandBefehl => ({
  name,
  description,
  ...(mehr.argumentHint === undefined ? {} : { argumentHint: mehr.argumentHint }),
  gruppe,
  tut,
  knopf,
  gilt,
  ...(mehr.option === undefined ? {} : { option: mehr.option }),
  ...(mehr.ort === undefined ? {} : { ort: mehr.ort }),
  ...(mehr.giltText === undefined ? {} : { giltText: mehr.giltText }),
  argumente: mehr.argumente ?? '',
  beispiel: mehr.beispiel ?? `/${name}`,
})

/** Die Befehle von Selbstkritik und Regeln, in der Reihenfolge der Übersicht. */
export const REFLECT_BEFEHLE: readonly LeitstandBefehl[] = [
  befehl(
    'Selbstkritik',
    'leitstand:selbstkritik',
    'Claude prüft die bisherige Arbeit kritisch',
    'Claude sieht seine bisherige Arbeit in diesem Chat durch wie ein skeptischer Prüfer. Das läuft im Hintergrund als ein Modellaufruf, der den ganzen Chat liest; das Ergebnis erscheint im Fenster Selbstkritik, vom Handy holt es /leitstand:selbstkritik-zeigen als Text.',
    'Button: 🪞 unten links',
    'einmal',
    {
      argumentHint: '[Schwerpunkt]',
      argumente: 'Schwerpunkt (freiwillig): worauf die Prüfung achten soll, höchstens 300 Zeichen.',
      beispiel: '/leitstand:selbstkritik die Tests',
    },
  ),
  befehl(
    'Selbstkritik',
    'leitstand:selbstkritik-zeigen',
    'Die neueste Selbstkritik als Text zeigen',
    'Gibt die neueste Selbstkritik als Text aus und öffnet am Rechner dazu das Fenster Selbstkritik. Vom Handy kommt nur der Text.',
    'Button: keiner.',
    'einmal',
  ),
  befehl(
    'Selbstkritik',
    'leitstand:selbstkritik-beheben',
    'Die Punkte der Selbstkritik als Auftrag ins Eingabefeld legen',
    `Legt die Abschnitte Könnte falsch sein oder fehlen und Als Nächstes prüfen der neuesten fertigen Selbstkritik als Auftrag ins Eingabefeld. Was dort schon steht, bleibt, der Auftrag kommt dahinter; abgeschickt wird nichts. ${AM_RECHNER}`,
    'Button: Claude soll das beheben, im Fenster Selbstkritik',
    'einmal',
  ),
  befehl(
    'Selbstkritik',
    'leitstand:selbstkritik-kopieren',
    'Die neueste Selbstkritik kopieren',
    'Kopiert die neueste fertige Selbstkritik in die Zwischenablage. Vom Handy kommt sie als Text zum Kopieren.',
    'Button: Kopieren im Fenster Selbstkritik',
    'einmal',
  ),
  befehl(
    'Selbstkritik',
    'leitstand:selbstkritik-auto-an',
    'Selbstkritik nach jeder Runde mit Dateiänderungen',
    'Nach jeder Runde (einer Antwort von Claude mit allem, was er dabei tut), in der Claude Dateien geändert hat, läuft eine Selbstkritik im Hintergrund. Jede kostet einen Modellaufruf, der den ganzen Chat liest.',
    'Button: keiner.',
    'einstellung',
    { option: 'Selbstkritik nach Dateiänderungen' },
  ),
  befehl(
    'Selbstkritik',
    'leitstand:selbstkritik-auto-aus',
    'Keine Selbstkritik nach Dateiänderungen',
    'Schaltet die Selbstkritik nach Dateiänderungen aus; /leitstand:selbstkritik geht weiter von Hand.',
    'Button: keiner.',
    'einstellung',
    { option: 'Selbstkritik nach Dateiänderungen' },
  ),

  befehl(
    'Regeln',
    'leitstand:regeln',
    'Wartende Regeln mit Nummern zeigen',
    'Listet die Regeln, die Claude aus deinen Korrekturen herausgelesen hat und die auf deine Entscheidung warten, mit Nummern, dazu die Regeln, die nur in diesem Chat gelten. Am Rechner öffnet sich dazu das Fenster Regeln. Die Nummern brauchen die Befehle zum Speichern, Bearbeiten und Verwerfen.',
    'Button: keiner. Wartet eine neue Regel, öffnet sich das Fenster Regeln am Rechner von selbst.',
    'einmal',
  ),
  befehl(
    'Regeln',
    'leitstand:regel-global',
    'Eine wartende Regel für alle Projekte speichern',
    'Speichert die wartende Regel mit dieser Nummer in deine globale CLAUDE.md (eine Textdatei mit Anweisungen, die Claude bei jedem Start liest); sie gilt dann in allen Projekten. Ändern oder löschen: die Datei bearbeiten oder Claude darum bitten.',
    `Button: Alle Projekte ${FENSTER}`,
    'dauerhaft',
    { ...MIT_NR, beispiel: '/leitstand:regel-global 1', ort: 'deine globale CLAUDE.md (~/.claude/CLAUDE.md)' },
  ),
  befehl(
    'Regeln',
    'leitstand:regel-projekt',
    'Eine wartende Regel für dieses Projekt speichern',
    'Speichert die wartende Regel mit dieser Nummer in die CLAUDE.md dieses Projekts (eine Textdatei mit Anweisungen, die Claude bei jedem Start liest; sie wird oft mit dem Projekt geteilt); sie gilt dann in jedem Chat hier. Ändern oder löschen: die Datei bearbeiten oder Claude darum bitten.',
    `Button: Dieses Projekt ${FENSTER}`,
    'dauerhaft',
    { ...MIT_NR, beispiel: '/leitstand:regel-projekt 1', ort: 'die CLAUDE.md im Projektordner' },
  ),
  befehl(
    'Regeln',
    'leitstand:regel-chat',
    'Eine wartende Regel nur für diesen Chat übernehmen',
    'Übernimmt die wartende Regel mit dieser Nummer nur für diesen Chat; keine CLAUDE.md wird geändert.',
    `Button: Nur dieser Chat ${FENSTER}`,
    'chat',
    { ...MIT_NR, beispiel: '/leitstand:regel-chat 1' },
  ),
  befehl(
    'Regeln',
    'leitstand:regel-bearbeiten',
    'Eine wartende Regel umformulieren',
    `Legt die wartende Regel mit dieser Nummer als merke: <Regel> ins leere Eingabefeld und verwirft die alte. Umformuliert und abgeschickt kommt sie als neue Regel zurück. Steht schon etwas im Feld, bleibt alles, wie es ist. ${AM_RECHNER} Vom Handy sagt der Befehl nur, wie du die Regel neu schickst.`,
    `Button: Bearbeiten ${FENSTER}`,
    'einmal',
    { ...MIT_NR, beispiel: '/leitstand:regel-bearbeiten 2', giltText: 'dauerhaft: Die alte Regel ist verworfen, sobald die neue im Eingabefeld steht.' },
  ),
  befehl(
    'Regeln',
    'leitstand:regel-verwerfen',
    'Eine wartende Regel verwerfen',
    'Verwirft die wartende Regel mit dieser Nummer: Claude schlägt sie nicht wieder vor. Mit merke: <Regel> bringst du sie selbst wieder ein.',
    `Button: Verwerfen ${FENSTER}`,
    'dauerhaft',
    { ...MIT_NR, beispiel: '/leitstand:regel-verwerfen 3', giltText: 'dauerhaft: Der Leitstand merkt sich auf diesem Rechner, dass sie nicht mehr vorgeschlagen wird.' },
  ),
  befehl(
    'Regeln',
    'leitstand:regelpruefung-an',
    'Korrekturen auf Regeln prüfen',
    'Jede kurze Nachricht von dir (bis 500 Zeichen) geht zusätzlich an ein kleines Modell (Standard Haiku), das darin eine Regel für später sucht: ein kleiner Aufruf je kurzer Nachricht. Gefundene Regeln warten im Fenster Regeln auf deine Entscheidung.',
    'Button: keiner.',
    'einstellung',
    { option: 'Regeln: Korrekturen prüfen' },
  ),
  befehl(
    'Regeln',
    'leitstand:regelpruefung-aus',
    'Korrekturen nicht mehr auf Regeln prüfen',
    'Schaltet die Prüfung aus; merke: <Regel> am Anfang einer Nachricht geht weiter.',
    'Button: keiner.',
    'einstellung',
    { option: 'Regeln: Korrekturen prüfen' },
  ),
]

/** Alte Namen aus der Zeit als eigener Mod, je mit dem vollen neuen Namen (/reflect-… → leitstand:…). */
export const REFLECT_ALTE: Readonly<Record<string, string>> = {
  'reflect-hilfe': 'leitstand:hilfe',
  'reflect-starten': 'leitstand:selbstkritik',
  'reflect-zeigen': 'leitstand:selbstkritik-zeigen',
  'reflect-beheben': 'leitstand:selbstkritik-beheben',
  'reflect-kopieren': 'leitstand:selbstkritik-kopieren',
  'reflect-auto-an': 'leitstand:selbstkritik-auto-an',
  'reflect-auto-aus': 'leitstand:selbstkritik-auto-aus',
  'reflect-regeln': 'leitstand:regeln',
  'reflect-speichern-global': 'leitstand:regel-global',
  'reflect-speichern-projekt': 'leitstand:regel-projekt',
  'reflect-speichern-chat': 'leitstand:regel-chat',
  'reflect-bearbeiten': 'leitstand:regel-bearbeiten',
  'reflect-verwerfen': 'leitstand:regel-verwerfen',
  'reflect-pruefung-an': 'leitstand:regelpruefung-an',
  'reflect-pruefung-aus': 'leitstand:regelpruefung-aus',
}
