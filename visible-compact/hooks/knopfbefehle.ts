/**
 * Ein eigener Slash-Befehl je Knopf und Schalter: die Beschreibung jedes Befehls und seine Hilfe.
 *
 * Jeder Befehl heißt /<mod>:<funktion> und ist eine Datei commands/<funktion>.md im Mod-Ordner; Claude Code setzt
 * <mod>: davor. Einen Namen mit Doppelpunkt nimmt `$.command.register` nicht, der command.run-Hook des Mods
 * beantwortet ihn trotzdem. Die alten Namen /<mod>-<funktion> sind nicht mehr angemeldet; ruft eine alte Datei in
 * ~/.claude/commands einen auf, sagt er nur, wie der Befehl jetzt heißt.
 *
 * Jeder Befehl versteht das Argument "hilfe" (auch "?") und sagt dann, was er tut, welchem Button er
 * entspricht, wie weit er wirkt und welche Argumente er nimmt.
 * Beantworten und die Wirkung stehen im Hooks-Modul selbst: $ und on gehen nie über einen Import.
 */
import type { CommandRunInput } from 'claude-code'

export type Knopfbefehl = {
  /** Ohne Schrägstrich, mit dem Mod davor: reflect:zeigen. */
  name: string
  /** Die kurze Zeile in der Befehlsliste. */
  description: string
  argumentHint?: string
  /** Der Titel hinter dem Namen in der ersten Zeile der Hilfe. */
  titel: string
  /** Was er tut, ein bis zwei Sätze, Verb vorn. */
  tut: string
  /** Welchem Button er entspricht, oder "keiner." */
  knopf: string
  /** Wie weit er wirkt (nur in diesem Chat, einmal sofort, ...). */
  geltung: string
  /** Die Argumente, als Satz. */
  argumente: string
  /** Ein Beispiel, wie getippt; nur bei Befehlen mit Argument. */
  beispiel?: string
}

/** Ob das Argument nach Hilfe fragt. */
export const istHilfe = (args: string) => /^(hilfe|\?)$/i.test(args.trim())

/** Ob der Befehl vom Handy kam (Remote Control), wo kein Fenster zu sehen ist. */
export const vomHandy = (e: Pick<CommandRunInput, 'origin'>) => e.origin?.kind === 'bridge'

/** Der alte Name eines Befehls, mit Bindestrich statt Doppelpunkt: reflect-zeigen für reflect:zeigen. */
export const alterName = (name: string) => name.replace(':', '-')

/** Die alten Namen aller Befehle eines Mods, je mit dem neuen. */
export const alteNamen = (liste: readonly Knopfbefehl[]): ReadonlyMap<string, string> =>
  new Map(liste.map(b => [alterName(b.name), b.name] as const))

/** Was ein alter Name antwortet: wie der Befehl jetzt heißt. Sonst tut er nichts. */
export const heisstJetzt = (name: string) => `Der Befehl heißt jetzt /${name}.`

/** Die Hilfe zu einem Befehl: Name und Titel, dann Was, Button, Gilt, Argumente und, wenn es ein Argument gibt, ein Beispiel. */
export function hilfeText(b: Knopfbefehl): string {
  return [
    `/${b.name}${b.argumentHint ? ` ${b.argumentHint}` : ''} · ${b.titel}`,
    `Was: ${b.tut}`,
    `Button: ${b.knopf}`,
    `Gilt: ${b.geltung}`,
    `Argumente: ${b.argumente}`,
    ...(b.beispiel ? [`Beispiel: ${b.beispiel}`] : []),
  ].join('\n')
}

/** Die Befehle eines Mods, je mit einer Zeile, als Liste für das Ende der Hilfe. */
export function befehlsliste(liste: readonly Knopfbefehl[]): string[] {
  return liste.map(b => `/${b.name}${b.argumentHint ? ` ${b.argumentHint}` : ''} · ${b.description}`)
}
