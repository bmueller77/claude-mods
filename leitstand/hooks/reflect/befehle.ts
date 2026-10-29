import type { LeitstandBefehl } from '../logic'

/*
 * Nur Daten: logic.ts importiert diese Datei, ein Wert-Import aus '../logic' ergäbe einen Kreis. Beantwortet werden die
 * Befehle in teil.tsx.
 */

const NR = 'Die Nummer der Regel aus /leitstand:regeln.'
const MIT_NR = { argumentHint: '<Nr>', argumente: NR }

/** Ein Befehl von Selbstkritik und Regeln; ohne Argumente ist `argumente` leer, das Beispiel der Befehl selbst. */
const befehl = (
  gruppe: 'Selbstkritik' | 'Regeln',
  name: string,
  description: string,
  tut: string,
  knopf: string,
  gilt: LeitstandBefehl['gilt'],
  mehr: { argumentHint?: string; argumente?: string; beispiel?: string } = {},
): LeitstandBefehl => ({
  name,
  description,
  ...(mehr.argumentHint === undefined ? {} : { argumentHint: mehr.argumentHint }),
  gruppe,
  tut,
  knopf,
  gilt,
  argumente: mehr.argumente ?? '',
  beispiel: mehr.beispiel ?? `/${name}`,
})

/** Die Befehle von Selbstkritik und Regeln (früher der Mod Reflect), in der Reihenfolge der Übersicht. */
export const REFLECT_BEFEHLE: readonly LeitstandBefehl[] = [
  befehl(
    'Selbstkritik',
    'leitstand:selbstkritik',
    'Claude prüft die bisherige Arbeit kritisch',
    'Claude sieht die bisherige Arbeit in diesem Chat durch wie ein skeptischer Prüfer. Die Antwort kommt sofort, die Selbstkritik läuft im Hintergrund und erscheint im Fenster „Selbstkritik“; vom Handy aus holt /leitstand:selbstkritik-zeigen sie als Text.',
    '🪞 im Leitstand',
    'einmal',
    {
      argumentHint: '[Schwerpunkt]',
      argumente: 'Optional ein Schwerpunkt, worauf die Prüfung achten soll (höchstens 300 Zeichen).',
      beispiel: '/leitstand:selbstkritik die Tests',
    },
  ),
  befehl(
    'Selbstkritik',
    'leitstand:selbstkritik-zeigen',
    'Die neueste Selbstkritik als Text zeigen',
    'Gibt die neueste Selbstkritik als Text aus und öffnet am Rechner dazu das Fenster „Selbstkritik“. Vom Handy aus nur der Text.',
    'Keiner; wie /reflect zeigen.',
    'einmal',
  ),
  befehl(
    'Selbstkritik',
    'leitstand:selbstkritik-beheben',
    'Die Punkte der Selbstkritik als Auftrag ins Eingabefeld legen',
    'Legt die Abschnitte „Könnte falsch sein oder fehlen“ und „Als Nächstes prüfen“ der neuesten fertigen Selbstkritik als Auftrag ins Eingabefeld. Ein Entwurf dort bleibt, der Auftrag kommt dahinter; abgeschickt wird nichts.',
    '„Claude soll das beheben“ im Fenster „Selbstkritik“',
    'einmal',
  ),
  befehl(
    'Selbstkritik',
    'leitstand:selbstkritik-kopieren',
    'Die neueste Selbstkritik kopieren',
    'Kopiert die neueste fertige Selbstkritik in die Zwischenablage. Vom Handy aus kommt sie als Text zum Kopieren.',
    '„Kopieren“ im Fenster „Selbstkritik“',
    'einmal',
  ),
  befehl(
    'Selbstkritik',
    'leitstand:selbstkritik-auto-an',
    'Selbstkritik nach jeder Runde mit Dateiänderungen',
    'Nach jeder Runde, in der Claude Dateien geändert hat, läuft eine Selbstkritik im Hintergrund. Das kostet je Runde einen Modellaufruf über den ganzen Chat.',
    'Keiner; im Einstellungsmenü heißt der Schalter „Selbstkritik nach Dateiänderungen“.',
    'einstellung',
  ),
  befehl(
    'Selbstkritik',
    'leitstand:selbstkritik-auto-aus',
    'Keine Selbstkritik nach Dateiänderungen',
    'Schaltet die automatische Selbstkritik aus; /leitstand:selbstkritik geht weiter von Hand.',
    'Keiner; im Einstellungsmenü heißt der Schalter „Selbstkritik nach Dateiänderungen“.',
    'einstellung',
  ),

  befehl(
    'Regeln',
    'leitstand:regeln',
    'Wartende Regeln mit Nummern zeigen',
    'Listet die Regeln, die Claude aus deinen Korrekturen gelernt hat und die auf deine Entscheidung warten, mit Nummern, dazu die Regeln, die nur in diesem Chat gelten. Die Nummern nehmen die Befehle zum Speichern, Bearbeiten und Verwerfen.',
    'Keiner; am Rechner öffnet sich dazu das Fenster Regeln, das alle wartenden zeigt.',
    'einmal',
  ),
  befehl(
    'Regeln',
    'leitstand:regel-global',
    'Eine wartende Regel für alle Projekte speichern',
    'Speichert die wartende Regel mit dieser Nummer in die globale CLAUDE.md; sie gilt dann in allen Projekten.',
    '„Alle Projekte“ im Fenster Regeln',
    'einmal',
    { ...MIT_NR, beispiel: '/leitstand:regel-global 1' },
  ),
  befehl(
    'Regeln',
    'leitstand:regel-projekt',
    'Eine wartende Regel für dieses Projekt speichern',
    'Speichert die wartende Regel mit dieser Nummer in die CLAUDE.md dieses Projekts.',
    '„Dieses Projekt“ im Fenster Regeln',
    'einmal',
    { ...MIT_NR, beispiel: '/leitstand:regel-projekt 1' },
  ),
  befehl(
    'Regeln',
    'leitstand:regel-chat',
    'Eine wartende Regel nur für diesen Chat übernehmen',
    'Übernimmt die wartende Regel mit dieser Nummer nur für diesen Chat; keine CLAUDE.md wird geändert.',
    '„Nur dieser Chat“ im Fenster Regeln',
    'chat',
    { ...MIT_NR, beispiel: '/leitstand:regel-chat 1' },
  ),
  befehl(
    'Regeln',
    'leitstand:regel-bearbeiten',
    'Eine wartende Regel umformulieren',
    'Legt die wartende Regel mit dieser Nummer als „merke: …“ ins leere Eingabefeld. Umformuliert und abgeschickt kommt sie als neue Regel zurück, die alte ist verworfen. Steht schon etwas im Feld, bleibt alles, wie es ist.',
    '„Bearbeiten“ im Fenster Regeln',
    'einmal',
    { ...MIT_NR, beispiel: '/leitstand:regel-bearbeiten 2' },
  ),
  befehl(
    'Regeln',
    'leitstand:regel-verwerfen',
    'Eine wartende Regel verwerfen',
    'Verwirft die wartende Regel mit dieser Nummer; sie wird nicht mehr vorgeschlagen.',
    '„Verwerfen“ im Fenster Regeln',
    'einmal',
    { ...MIT_NR, beispiel: '/leitstand:regel-verwerfen 3' },
  ),
  befehl(
    'Regeln',
    'leitstand:regelpruefung-an',
    'Korrekturen auf Regeln prüfen',
    'Kurze Nachrichten gehen an ein kleines Modell, das darin Regeln für später sucht. Gefundene Regeln warten im Fenster Regeln, bis du entscheidest.',
    'Keiner; im Einstellungsmenü heißt der Schalter „Regeln: Korrekturen prüfen“.',
    'einstellung',
  ),
  befehl(
    'Regeln',
    'leitstand:regelpruefung-aus',
    'Korrekturen nicht mehr auf Regeln prüfen',
    'Schaltet die Prüfung aus; „merke: <Regel>“ geht weiter.',
    'Keiner; im Einstellungsmenü heißt der Schalter „Regeln: Korrekturen prüfen“.',
    'einstellung',
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
