/**
 * Guard for every tree the tests draw: the engine refuses a whole tree when a Select holds no option, more than 64, or
 * a value twice ("Select "<key>" options must be 1 to 64 entries"), and the test kit does not check it. A refused band
 * is skipped whole; so the tests check every Select they draw themselves.
 */

/** The most options a Select may hold. */
export const SELECT_MAX = 64

type Knoten = { type?: unknown; props?: { key?: unknown; options?: unknown }; children?: unknown }

/** What is wrong with the Selects of a tree, one line each; empty when nothing is. */
export function selectFehler(baum: unknown, wo = 'Baum'): string[] {
  const fehler: string[] = []
  const besuche = (knoten: unknown) => {
    if (Array.isArray(knoten)) return knoten.forEach(besuche)
    if (knoten === null || typeof knoten !== 'object') return
    const { type, props, children } = knoten as Knoten
    if (type === 'Select') {
      const key = String(props?.key ?? '?')
      const options = Array.isArray(props?.options) ? (props.options as { value?: unknown }[]) : []
      if (options.length === 0 || options.length > SELECT_MAX) fehler.push(`${wo}: Select "${key}" hat ${options.length} Optionen (erlaubt 1 bis ${SELECT_MAX})`)
      const werte = options.map(option => String(option?.value))
      const doppelt = werte.filter((wert, i) => werte.indexOf(wert) !== i)
      if (doppelt.length > 0) fehler.push(`${wo}: Select "${key}" hat doppelte Werte: ${[...new Set(doppelt)].join(', ')}`)
    }
    besuche(children)
  }
  besuche(baum)
  return fehler
}

/** Throws when a Select of the tree holds no option, more than 64, or a value twice. */
export function pruefeSelects(baum: unknown, wo = 'Baum'): void {
  const fehler = selectFehler(baum, wo)
  if (fehler.length > 0) throw new Error(fehler.join('\n'))
}

/** A mounted drawing, its first tree checked by pruefeSelects: `const ui = await geprueft(await $.ui.mount(...))`. */
export async function geprueft<T extends { drawn: () => Promise<unknown> }>(ui: T, wo = 'Baum'): Promise<T> {
  pruefeSelects(await ui.drawn(), wo)
  return ui
}

/** The tree a mounted drawing drew last, checked by pruefeSelects. */
export async function gepruefterBaum(ui: { drawn: () => Promise<unknown> }, wo = 'Baum'): Promise<unknown> {
  const baum = await ui.drawn()
  pruefeSelects(baum, wo)
  return baum
}
