import type { On, PluginOptions } from 'claude-code'

import { registerAutopilot } from './autopilot/teil'
import { registerFiletree } from './filetree/teil'
import { registerReflect } from './reflect/teil'

/**
 * Die Teile des Leitstands, die bis 2026-10-26 eigene Mods waren: Selbstkritik und Regeln (Reflect), Dateien
 * (Filetree) und Autopilot. Jeder liegt in einem eigenen Ordner. Ihre Befehle stehen in der Übersicht des Leitstands
 * (logic.ts), der auch ihre Kurzformen anmeldet; beantworten tut sie jeder Teil in seinen eigenen Hooks, denn `$` geht
 * nie über einen Import hinweg in eine Funktion.
 */

/** Die Einstellungen eines Teils unter den Namen, die er als eigener Mod hatte; was nicht gesetzt ist, bleibt weg. */
const unterAltenNamen = (options: PluginOptions, namen: Readonly<Record<string, string>>): PluginOptions =>
  Object.fromEntries(Object.entries(namen).flatMap(([alt, neu]) => (options[neu] === undefined ? [] : [[alt, options[neu]] as const])))

/** Meldet die Teile an, jeden mit seinen Einstellungen unter den Namen, die er als eigener Mod hatte. */
export function registerTeile(on: On, options: PluginOptions): void {
  registerReflect(on, unterAltenNamen(options, { pruefung: 'regelpruefung', selbstkritikAuto: 'selbstkritikAuto', modell: 'regelpruefungModell' }))
  registerFiletree(
    on,
    unterAltenNamen(options, { activity: 'dateienAktivitaet', glyphs: 'dateienSymbole', follow: 'dateienFolgen', column: 'dateienSpalte', open: 'dateienOeffnen' }),
  )
  registerAutopilot(on, unterAltenNamen(options, { maxRunden: 'autopilotMaxRunden' }))
}
