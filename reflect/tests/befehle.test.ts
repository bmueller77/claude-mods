/** Je Knopf und Schalter ein Befehl /reflect:…: mit Hilfe, mit derselben Wirkung wie der Knopf; die alten Namen nennen den neuen. */
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionAppendInput } from 'claude-code'

import { BEFEHLE, BEFEHL_FEHLER, auftragAus } from '../hooks/register'
import { REFLEXION, abschnittText, say, start, welt, zeilen } from './welt'
import type { Opts } from './welt'

const NAMEN = [
  'reflect:hilfe',
  'reflect:starten',
  'reflect:zeigen',
  'reflect:regeln',
  'reflect:speichern-global',
  'reflect:speichern-projekt',
  'reflect:speichern-chat',
  'reflect:bearbeiten',
  'reflect:verwerfen',
  'reflect:beheben',
  'reflect:kopieren',
  'reflect:pruefung-an',
  'reflect:pruefung-aus',
  'reflect:auto-an',
  'reflect:auto-aus',
]

const REGEL = 'Immer pnpm statt npm nutzen'

/** Die Welt aus welt.ts; sie zählt auch die Anmeldungen mit. */
const boden = (on: On, opts: Opts = {}) => welt(on, opts)

async function run($: Engine, command: string, args = '', kind = 'composer') {
  const r = await $.command.run({ command, args, origin: { kind }, presentation: { isFullscreen: true, columns: 160 } } as never)
  return String(r.text ?? '')
}

/** Eine wartende Regel, per "merke:" ohne Modellaufruf. */
async function mitRegel($: Engine, w: ReturnType<typeof boden>) {
  await say($, w, `merke: ${REGEL}`)
  expect(await zeilen($)).toEqual([`💡 „${REGEL}“`])
}

test('genau die freigegebenen Befehle, mit Beschreibung und Argument-Hinweis; angemeldet ist nur /reflect', async ($, on) => {
  const w = boden(on)
  await start($)
  expect(BEFEHLE.map(b => b.name)).toEqual(NAMEN)
  for (const b of BEFEHLE) {
    expect(b.description.length).toBeGreaterThan(10)
    // Die Langform ist eine Datei in commands/: Einen Namen mit Doppelpunkt nimmt $.command.register nicht.
    expect(w.angemeldet.find(s => s.name === b.name)).toBeUndefined()
  }
  for (const name of ['reflect:speichern-global', 'reflect:speichern-projekt', 'reflect:speichern-chat', 'reflect:bearbeiten', 'reflect:verwerfen'])
    expect(BEFEHLE.find(b => b.name === name)?.argumentHint).toBe('<Nr>')
  expect(BEFEHLE.find(b => b.name === 'reflect:starten')?.argumentHint).toBe('[Schwerpunkt]')
  // Die Kurzform bleibt, die alten Namen mit Bindestrich sind nicht mehr angemeldet.
  expect(w.angemeldet.map(s => s.name)).toEqual(['reflect'])
})

test('ein alter Name wie /reflect-zeigen sagt nur, wie der Befehl jetzt heißt', async ($, on) => {
  const w = boden(on)
  await start($)
  await mitRegel($, w)
  for (const name of NAMEN) {
    const alt = name.replace('reflect:', 'reflect-')
    for (const arg of ['', '1', 'hilfe']) expect(await run($, alt, arg)).toBe(`Der Befehl heißt jetzt /${name}.`)
  }
  expect(w.opened).toEqual([])
  expect(w.forks).toEqual([])
  expect(w.filled).toEqual([])
  expect(w.copied).toEqual([])
  expect(Object.keys(w.files)).toEqual([])
  expect(await zeilen($)).toEqual([`💡 „${REGEL}“`])
})

test('jeder Befehl erklärt sich mit hilfe und mit ?, ohne etwas zu tun', async ($, on) => {
  const w = boden(on)
  await start($)
  await mitRegel($, w)
  for (const name of NAMEN) {
    for (const arg of ['hilfe', '?', 'HILFE']) {
      const text = await run($, name, arg)
      expect(text).toContain(`/${name}`)
      for (const teil of ['Knopf:', 'Gilt:', 'Argumente:', 'Beispiel:']) expect(text).toContain(teil)
    }
  }
  expect(w.opened).toEqual([])
  expect(w.forks).toEqual([])
  expect(w.filled).toEqual([])
  expect(await zeilen($)).toEqual([`💡 „${REGEL}“`])
})

test('/reflect:hilfe listet alle Befehle mit einer Zeile', async ($, on) => {
  boden(on)
  await start($)
  const text = await run($, 'reflect:hilfe')
  for (const b of BEFEHLE) expect(text).toContain(`/${b.name}${b.argumentHint ? ` ${b.argumentHint}` : ''} – ${b.description}`)
})

test('starten und zeigen: Text sofort, Fenster dahinter; vom Handy nur Text', async ($, on) => {
  const w = boden(on)
  await start($)
  expect(await run($, 'reflect:zeigen')).toBe('Noch keine Reflexion. /reflect startet eine.')
  expect(await run($, 'reflect:starten', 'die Tests')).toBe('Reflexion läuft … Das Ergebnis erscheint im Fenster „Reflexion“; /reflect:zeigen gibt es als Text aus.')
  expect(w.opened).toEqual(['reflect', 'reflect'])
  await w.clock.settle()
  expect(w.forks[0]).toContain('Schwerpunkt der Prüfung: die Tests')
  const text = await run($, 'reflect:zeigen')
  expect(text).toMatch(/^Reflexion von \d\d:\d\d · Schwerpunkt: die Tests\n\n/)
  expect(text).toContain(REFLEXION)
  expect(w.opened).toHaveLength(3)

  // Vom Handy: kein Fenster, das Ergebnis als Text.
  expect(await run($, 'reflect:starten', '', 'bridge')).toBe('Reflexion läuft … Das Fenster geht nur am Rechner; /reflect:zeigen gibt das Ergebnis hier als Text aus.')
  await w.clock.settle()
  expect(await run($, 'reflect:zeigen', '', 'bridge')).toContain(REFLEXION)
  expect(w.opened).toHaveLength(3)
  expect(w.forks).toHaveLength(2)
})

test('regeln, speichern-global: wie „Alle Projekte“ im Band', async ($, on) => {
  const w = boden(on)
  await start($)
  await mitRegel($, w)
  expect(await run($, 'reflect:regeln')).toContain(`1. „${REGEL}“`)
  expect(await run($, 'reflect:speichern-global', '1')).toBe(`Gespeichert in /home/u/.claude/CLAUDE.md: „${REGEL}“`)
  expect(w.files['/home/u/.claude/CLAUDE.md']).toContain(`- ${REGEL}`)
  expect(await zeilen($)).toEqual([])
})

test('speichern-projekt: wie „Dieses Projekt“ im Band', async ($, on) => {
  const w = boden(on)
  await start($)
  await mitRegel($, w)
  expect(await run($, 'reflect:speichern-projekt', '1')).toContain('Gespeichert in /repo/CLAUDE.md')
  expect(w.files['/repo/CLAUDE.md']).toContain(`- ${REGEL}`)
})

test('speichern-chat: wie „Nur dieser Chat“ im Band, nur in diesem Chat', async ($, on) => {
  let sid = 'chat-a'
  const w = boden(on, { sid: () => sid })
  await start($)
  await mitRegel($, w)
  expect(await run($, 'reflect:speichern-chat', '1')).toBe(`Gilt jetzt nur in diesem Chat: „${REGEL}“`)
  expect(await abschnittText($, 'reflect:chat')).toContain(REGEL)
  expect(Object.keys(w.files)).toEqual([])
  sid = 'chat-b'
  expect(await abschnittText($, 'reflect:chat')).toBeUndefined()
})

test('bearbeiten: wie „Bearbeiten“ im Band; ein volles Eingabefeld bleibt, wie es ist', async ($, on) => {
  const w = boden(on)
  await start($)
  await mitRegel($, w)
  expect(await run($, 'reflect:bearbeiten', '1')).toBe(`Die Regel steht als „merke: ${REGEL}“ im Eingabefeld. Umformulieren und abschicken; die alte ist verworfen.`)
  expect(w.filled.map(f => f.text)).toEqual([`merke: ${REGEL}`])
  expect(await zeilen($)).toEqual([])
})

test('bearbeiten mit Text im Eingabefeld ändert nichts', async ($, on) => {
  const w = boden(on, { box: 'mein Entwurf' })
  await start($)
  await mitRegel($, w)
  expect(await run($, 'reflect:bearbeiten', '1')).toBe('Erst das Eingabefeld leeren – „Bearbeiten“ legt die Regel dort hinein.')
  expect(w.filled).toEqual([])
  expect(await zeilen($)).toEqual([`💡 „${REGEL}“`])
})

test('verwerfen: wie „Verwerfen“ im Band; ohne oder mit falscher Nummer ein Satz', async ($, on) => {
  const w = boden(on)
  await start($)
  await mitRegel($, w)
  expect(await run($, 'reflect:verwerfen')).toBe('Welche Regel? /reflect regeln zeigt die Nummern.')
  expect(await run($, 'reflect:speichern-global', '7')).toBe('Es gibt keine Regel 7. /reflect regeln zeigt die aktuelle Liste.')
  expect(await run($, 'reflect:verwerfen', '1')).toBe(`Verworfen: „${REGEL}“`)
  expect(await zeilen($)).toEqual([])
  expect(Object.keys(w.files)).toEqual([])
})

test('beheben und kopieren: wie die Knöpfe im Fenster, mit der neuesten fertigen Reflexion', async ($, on) => {
  const w = boden(on)
  await start($)
  expect(await run($, 'reflect:beheben')).toBe('Noch keine fertige Reflexion. /reflect:starten startet eine.')
  expect(await run($, 'reflect:kopieren')).toBe('Noch keine fertige Reflexion. /reflect:starten startet eine.')
  await run($, 'reflect:starten')
  await w.clock.settle()
  expect(await run($, 'reflect:beheben')).toBe('Der Auftrag steht im Eingabefeld. Prüfen, dann abschicken.')
  expect(w.filled).toEqual([{ text: auftragAus(REFLEXION), mode: 'replace' }])
  expect(w.submitted).toEqual([])
  expect(await run($, 'reflect:kopieren')).toBe('Reflexion kopiert.')
  expect(w.copied.at(-1)).toContain(REFLEXION)
  // Vom Handy: der Text zum Kopieren statt der Zwischenablage am Rechner.
  const handy = await run($, 'reflect:kopieren', '', 'bridge')
  expect(handy).toContain('Kopieren geht nur am Rechner.')
  expect(handy).toContain(REFLEXION)
  expect(w.copied).toHaveLength(1)
})

test('pruefung-an und -aus: nur in diesem Chat', async ($, on) => {
  let sid = 'chat-a'
  const w = boden(on, { sid: () => sid })
  await start($)
  expect(await run($, 'reflect:pruefung-aus')).toContain('Korrekturen prüfen ist in diesem Chat aus')
  await say($, w, 'nein, nimm pnpm')
  expect(w.asked).toEqual([])
  sid = 'chat-b'
  await say($, w, 'nein, nimm pnpm')
  expect(w.asked).toHaveLength(1)
  sid = 'chat-a'
  expect(await run($, 'reflect:pruefung-an')).toContain('Korrekturen prüfen ist in diesem Chat an')
  await say($, w, 'nein, nimm yarn')
  expect(w.asked).toHaveLength(2)
})

test('auto-an und -aus: nur in diesem Chat', async ($, on) => {
  let sid = 'chat-a'
  const w = boden(on, { sid: () => sid })
  await start($)
  const runde = async (id: string) => {
    await $.turn.start({ text: 'mach', turnId: id } as never)
    await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' } as never)
    await $.turn.complete({ answer: 'Fertig.', durationMs: 1000, isAborted: false, turnId: id, reason: 'answer' } as never)
    await w.clock.settle()
  }
  expect(await run($, 'reflect:auto-an')).toContain('Automatische Selbstkritik ist in diesem Chat an')
  await runde('t1')
  expect(w.forks).toHaveLength(1)
  sid = 'chat-b'
  await runde('t2')
  expect(w.forks).toHaveLength(1)
  sid = 'chat-a'
  expect(await run($, 'reflect:auto-aus')).toContain('Automatische Selbstkritik ist in diesem Chat aus')
  await runde('t3')
  expect(w.forks).toHaveLength(1)
})

test('ein Fehler wird zu einem schlichten Satz', async ($, on) => {
  let kaputt = false
  boden(on, {
    sid: () => {
      if (kaputt) throw new Error('weg')
      return 'chat-a'
    },
  })
  await start($)
  kaputt = true
  for (const name of ['reflect:pruefung-an', 'reflect:pruefung-aus', 'reflect:auto-an', 'reflect:auto-aus'])
    expect(await run($, name, '1')).toBe(BEFEHL_FEHLER)
})

test('die Antworten der neuen Befehle bekommen den Zusatz statt des Vorsatzes', async ($, on) => {
  boden(on)
  await start($)
  const aus = (text: string) => `<local-command-stdout>${text}</local-command-stdout>`
  const ein: SessionAppendInput = {
    door: 'command',
    origin: { kind: 'composer' },
    uuid: 'befehl-1',
    message: { type: 'system', name: 'local_command', content: [{ type: 'text', text: aus('reflect: Verworfen: „x“') }] },
  }
  const r = await $.session.append(ein as unknown as Parameters<Engine['session']['append']>[0])
  const b = r.message?.content[0]
  expect(b?.type === 'text' ? b.text : '').toBe(aus('Verworfen: „x“ (gemeldet vom Mod Reflect)'))
})
