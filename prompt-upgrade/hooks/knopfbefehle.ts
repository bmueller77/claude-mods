/**
 * Ein eigener Slash-Befehl je Knopf und Schalter: die Beschreibung jedes Befehls und seine Hilfe.
 *
 * Jeder Befehl versteht das Argument "hilfe" (auch "?") und sagt dann, was er tut, welchem Knopf er
 * entspricht, ob er nur im Chat gilt, welche Argumente er nimmt, und gibt ein Beispiel.
 * Anmelden, Beantworten und die Wirkung stehen im Hooks-Modul selbst: $ und on gehen nie über einen Import.
 */
import type { CommandRunInput } from 'claude-code'

export type Knopfbefehl = {
  /** Ohne Schrägstrich. */
  name: string
  /** Die kurze Zeile in der Befehlsliste. */
  description: string
  argumentHint?: string
  /** Was er tut, ein bis zwei Sätze. */
  tut: string
  /** Welchem Knopf oder Schalter er entspricht. */
  knopf: string
  /** Wo er gilt (nur in diesem Chat, für alle Chats, ...). */
  geltung: string
  /** Die Argumente, als Satz. */
  argumente: string
  /** Ein Beispiel, wie getippt. */
  beispiel: string
}

/** Ob das Argument nach Hilfe fragt. */
export const istHilfe = (args: string) => /^(hilfe|\?)$/i.test(args.trim())

/** Ob der Befehl vom Handy kam (Remote Control), wo kein Fenster zu sehen ist. */
export const vomHandy = (e: Pick<CommandRunInput, 'origin'>) => e.origin?.kind === 'bridge'

/** Was `$.command.register` für einen Befehl bekommt; alle antworten sofort, auch während einer Runde. */
export const anmeldung = (b: Knopfbefehl) => ({
  name: b.name,
  description: b.description,
  ...(b.argumentHint ? { argumentHint: b.argumentHint } : {}),
  immediate: true as const,
})

/** Die Hilfe zu einem Befehl. */
export function hilfeText(b: Knopfbefehl): string {
  return [
    `/${b.name}${b.argumentHint ? ` ${b.argumentHint}` : ''}`,
    b.tut,
    `Knopf: ${b.knopf}`,
    `Gilt: ${b.geltung}`,
    `Argumente: ${b.argumente}`,
    `Beispiel: ${b.beispiel}`,
  ].join('\n')
}

/** Alle Befehle eines Mods, je mit einer Zeile. */
export function uebersicht(titel: string, liste: readonly Knopfbefehl[]): string {
  return [
    titel,
    ...liste.map(b => `/${b.name}${b.argumentHint ? ` ${b.argumentHint}` : ''} – ${b.description}`),
    `Mehr zu jedem Befehl: das Argument hilfe, z. B. /${liste[1]?.name ?? liste[0]?.name ?? ''} hilfe`,
  ].join('\n')
}
