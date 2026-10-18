/** Der Vorsatz der Engine vor Befehlsantworten weicht dem Zusatz "(gemeldet vom Mod Visible Compact)". */
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { SessionAppendInput } from 'claude-code'

let nummer = 0
const aus = (text: string) => `<local-command-stdout>${text}</local-command-stdout>`
/** Hebt die Zeile, die die Engine fuer eine Befehlsantwort speichert, und liest sie so zurueck, wie sie gespeichert wurde. */
const zeile = async ($: Engine, text: string) => {
  const ein: SessionAppendInput = {
    door: 'command',
    origin: { kind: 'composer' },
    uuid: `vorsatz-${++nummer}`,
    message: { type: 'system', name: 'local_command', content: [{ type: 'text', text: aus(text) }] },
  }
  // Die Engine der Tests nimmt auch eine ganze Zeile mit Tuer und Herkunft an, wie eine Sitzung sie hebt.
  const r = await $.session.append(ein as unknown as Parameters<Engine['session']['append']>[0])
  const b = r.message?.content[0]
  return b?.type === 'text' ? b.text : undefined
}

test('eigener Name weg, Zusatz am Ende; andere Namen bleiben; mehrzeilig in eigener Zeile; fremde Zeilen unveraendert', async $ => {
  expect(await zeile($, 'visible-compact: Text')).toBe(aus('Text (gemeldet vom Mod Visible Compact)'))
  expect(await zeile($, 'andere+visible-compact: Text')).toBe(aus('andere: Text (gemeldet vom Mod Visible Compact)'))
  expect(await zeile($, 'visible-compact+andere: Text')).toBe(aus('andere: Text (gemeldet vom Mod Visible Compact)'))
  expect(await zeile($, 'visible-compact: Zeile eins\nZeile zwei')).toBe(aus('Zeile eins\nZeile zwei\n(gemeldet vom Mod Visible Compact)'))
  expect(await zeile($, 'andere: Text')).toBe(aus('andere: Text'))
  expect(await zeile($, 'Text ohne Vorsatz')).toBe(aus('Text ohne Vorsatz'))
})
