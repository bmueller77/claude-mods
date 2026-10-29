/** Je Knopf ein Befehl /visible-compact:…: mit Hilfe, mit derselben Wirkung wie der Knopf; die alten Namen nennen den neuen. */
import type { CommandSpec, On, SessionAppendInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { BEFEHLE, BEFEHL_FEHLER, KURZFORM } from '../hooks/register'

const DIR = '/tmp/visible-compact/sessions/sitzung-1'
const META = {
  id: 'v1',
  at: Date.UTC(2026, 9, 17, 9, 44),
  durationMs: 80_800,
  trigger: 'manual',
  tokensBefore: 163_000,
  tokensAfter: 16_000,
  messages: { before: 240, after: 2 },
  chunks: { before: 1, after: 1 },
}
const PANE = {
  plugin: 'visible-compact',
  surface: 'desktop',
  component: 'Pane',
  requestId: 'visible-compact',
  props: { title: 'Verdichtungen des Chats', isFocused: false, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const plain = (path: string) => path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')

function welt(on: On, x: { verdichtet?: boolean; kaputt?: () => boolean } = {}) {
  const files = new Map<string, string>()
  if (x.verdichtet !== false) {
    files.set(`${DIR}/index.json`, JSON.stringify([META]))
    files.set(`${DIR}/v1.after.0.json`, JSON.stringify([{ m: 0, role: 'user', i: 0, n: 1, text: 'Kurz zusammengefasst.' }]))
    files.set(`${DIR}/v1.before.0.json`, JSON.stringify([{ m: 0, role: 'user', i: 0, n: 1, text: 'Lang und ausführlich.' }]))
  }
  const store = new Map<string, unknown>()
  const angemeldet: CommandSpec[] = []
  const geoeffnet: string[] = []
  mock.clock(on, { now: Date.UTC(2026, 9, 18) })
  on('store.get', (_, e) => ({ value: store.get(e.key) }) as never)
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined } as never
  })
  on('store.delete', (_, e) => {
    store.delete(e.key)
    return { value: undefined } as never
  })
  on('store.keys', () => ({ value: [...store.keys()] }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('command.register', (_, e) => {
    angemeldet.push(e)
    return { value: undefined } as never
  })
  on('session.id', () => {
    if (x.kaputt?.() === true) throw new Error('weg')
    return { value: 'sitzung-1' } as never
  })
  on('env.get', () => ({ value: undefined }) as never)
  on('fs.exists', (_, e) => ({ value: files.has(plain(e.path)) }) as never)
  on('fs.read', (_, e) => ({ value: files.get(plain(e.path)) ?? '' }) as never)
  on('fs.write', (_, e) => {
    files.set(plain(e.path), e.text)
    return { value: undefined } as never
  })
  on('ui.open', (_, e) => {
    geoeffnet.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('model.complete', () => ({ value: { isAnswered: true, text: '<uebersetzung>Deutsch.</uebersetzung>', usage: {} } }) as never)
  return { store, angemeldet, geoeffnet }
}

const start = ($: Engine) => $.session.start({ cwd: '/work', surface: 'desktop' } as never)

async function befehl($: Engine, command: string, args = '', kind = 'composer') {
  const r = await $.command.run({ command, args, origin: { kind }, presentation: { isFullscreen: true, columns: 160 } } as never)
  return String(r.text ?? '')
}

async function knoepfe($: Engine) {
  const ui = await $.ui.mount(PANE as never)
  const labels = (await ui.findAll({ type: 'Button' })).map(one => one.text)
  await ui.unmount()
  return labels
}

const NAMEN = [
  'visible-compact:hilfe',
  'visible-compact:zeigen',
  'visible-compact:uebersetzen-an',
  'visible-compact:uebersetzen-aus',
]

test('genau die freigegebenen Befehle, mit Beschreibung; angemeldet ist nur /show-last-compact', async ($, on) => {
  const w = welt(on)
  await start($)
  expect(BEFEHLE.map(b => b.name)).toEqual(NAMEN)
  for (const b of BEFEHLE) {
    expect(b.description.length).toBeGreaterThan(10)
    // Die Langform ist eine Datei in commands/: Einen Namen mit Doppelpunkt nimmt $.command.register nicht.
    expect(w.angemeldet.find(s => s.name === b.name)).toBeUndefined()
  }
  // Die Kurzform bleibt, die alten Namen mit Bindestrich sind nicht mehr angemeldet.
  expect(w.angemeldet.map(s => s.name)).toEqual(['show-last-compact'])
})

test('ein alter Name wie /visible-compact-zeigen sagt nur, wie der Befehl jetzt heißt', async ($, on) => {
  const w = welt(on)
  await start($)
  for (const name of NAMEN) {
    const alt = name.replace('visible-compact:', 'visible-compact-')
    for (const arg of ['', 'hilfe']) expect(await befehl($, alt, arg)).toBe(`Der Befehl heißt jetzt /${name}.`)
  }
  expect(w.geoeffnet).toEqual([])
  expect(w.store.has('translate:sitzung-1')).toBe(false)
})

test('jeder Befehl erklärt sich mit hilfe und mit ?', async ($, on) => {
  const w = welt(on)
  await start($)
  for (const name of NAMEN) {
    for (const arg of ['hilfe', '?', 'Hilfe']) {
      const text = await befehl($, name, arg)
      expect(text).toContain(`/${name} · `)
      for (const teil of ['Was:', 'Button:', 'Gilt:', 'Argumente:']) expect(text).toContain(teil)
    }
  }
  // Hilfe ändert nichts.
  expect(w.geoeffnet).toEqual([])
  expect(w.store.has('translate:sitzung-1')).toBe(false)
})

test('/show-last-compact hilfe und ? zeigen nur die Hilfe und öffnen kein Fenster', async ($, on) => {
  const w = welt(on)
  await start($)
  for (const arg of ['hilfe', '?', 'Hilfe']) {
    const text = await befehl($, 'show-last-compact', arg)
    expect(text).toContain('/show-last-compact · ')
    for (const teil of ['Was:', 'Button:', 'Gilt:', 'Argumente:']) expect(text).toContain(teil)
  }
  expect(w.geoeffnet).toEqual([])
  // Vom Handy dieselbe Textantwort wie /visible-compact:zeigen, kein Fenster.
  const handy = await befehl($, 'show-last-compact', '', 'bridge')
  expect(handy).toBe(await befehl($, 'visible-compact:zeigen', '', 'bridge'))
  expect(handy).toContain('Vom Handy öffnet sich kein Fenster.')
  expect(w.geoeffnet).toEqual([])
  // Ohne Argument öffnet er am Rechner das Fenster wie bisher.
  expect(await befehl($, 'show-last-compact')).toBe('"Verdichtungen des Chats" ist geöffnet.')
  expect(w.geoeffnet).toEqual(['visible-compact'])
})

test('/visible-compact:hilfe erklärt Arbeiten, Einstellen, Kosten, Handy und listet alle Befehle', async ($, on) => {
  const w = welt(on)
  await start($)
  const text = await befehl($, 'visible-compact:hilfe')
  for (const b of [...BEFEHLE, KURZFORM]) expect(text).toContain(`/${b.name} · ${b.description}`)
  // Das gemeinsame Gerüst: diese Überschriften in dieser Reihenfolge, unter Befehle zuerst der Satz zu den Umlauten.
  const zeilen = text.split('\n')
  const stellen = ['Was der Mod tut', 'So arbeitest du damit', 'Wo der Chat liegt', 'Einstellen', 'Kosten', 'Vom Handy (Remote Control)', 'Befehle'].map(k => zeilen.indexOf(k))
  expect(stellen.every(i => i >= 0)).toBe(true)
  expect([...stellen].sort((a, b) => a - b)).toEqual(stellen)
  expect(zeilen[stellen[6]! + 1]).toBe('Befehlsnamen schreiben Umlaute als ae, oe, ue und ss.')
  expect(zeilen[zeilen.length - 1]).toMatch(/^Mehr zu jedem Befehl: hilfe dahinter, etwa /)
  for (const teil of ['--values-stdin', 'Das gilt für Chats, die danach beginnen.', 'Das wirkt nach einem Neustart von Claude Code.', 'im Chat nicht umstellbar'])
    expect(text).toContain(teil)
  for (const teil of ['So arbeitest du damit', 'Einstellen', 'Nur in diesem Chat:', 'Standard für neue Chats:', 'claude plugin configure visible-compact@bm-mods', 'visible-compact@bjoern-mods', 'claude plugin disable visible-compact@bm-mods', 'Kosten', 'Vom Handy', 'Mehr zu jedem Befehl: hilfe dahinter'])
    expect(text).toContain(teil)
  // Keine Gedankenstriche, typografischen Anführungszeichen oder Auslassungszeichen im neuen Text.
  expect(text).not.toMatch(/[\u2013\u2014\u201c\u201d\u201e\u2026]/)
  expect(w.geoeffnet).toEqual([])
})

test('zeigen: Text sofort, Fenster dahinter; vom Handy nur Text; ohne Verdichtung ein Satz', async ($, on) => {
  const w = welt(on)
  await start($)
  expect(await befehl($, 'visible-compact:zeigen')).toBe('"Verdichtungen des Chats" öffnet sich.')
  expect(w.geoeffnet).toEqual(['visible-compact'])
  const handy = await befehl($, 'visible-compact:zeigen', '', 'bridge')
  expect(handy).toContain('Vom Handy öffnet sich kein Fenster.')
  expect(handy).toContain('von 163k auf 16k Tokens, 240 Nachrichten vorher, 2 danach')
  expect(w.geoeffnet).toEqual(['visible-compact'])
})

test('zeigen ohne Verdichtung sagt, was zu tun ist', async ($, on) => {
  const w = welt(on, { verdichtet: false })
  await start($)
  expect(await befehl($, 'visible-compact:zeigen')).toBe('In diesem Chat wurde noch nichts verdichtet. Führ zuerst /compact aus.')
  expect(w.geoeffnet).toEqual([])
})

test('uebersetzen-an und -aus wirken wie der Button, nur in diesem Chat', async ($, on) => {
  const w = welt(on)
  await start($)
  expect(await knoepfe($)).toContain('Übersetzen')
  expect(await befehl($, 'visible-compact:uebersetzen-an')).toContain('in diesem Chat an')
  expect(w.store.get('translate:sitzung-1')).toEqual({ at: Date.UTC(2026, 9, 18), isOn: true })
  expect(await knoepfe($)).toContain('Original zeigen')
  // Noch einmal an bleibt an (setzt, schaltet nicht um).
  await befehl($, 'visible-compact:uebersetzen-an')
  expect(await knoepfe($)).toContain('Original zeigen')
  expect(await befehl($, 'visible-compact:uebersetzen-aus')).toContain('in diesem Chat aus')
  expect(w.store.get('translate:sitzung-1')).toEqual({ at: Date.UTC(2026, 9, 18), isOn: false })
  expect(await knoepfe($)).toContain('Übersetzen')
  // Der Knopf und der Befehl schalten dasselbe.
  const ui = await $.ui.mount(PANE as never)
  await ui.press({ key: 'translate' })
  await ui.unmount()
  expect((w.store.get('translate:sitzung-1') as { isOn: boolean }).isOn).toBe(true)
  await befehl($, 'visible-compact:uebersetzen-aus')
  expect(await knoepfe($)).toContain('Übersetzen')
})

test('ein Fehler wird zu einem schlichten Satz', async ($, on) => {
  let kaputt = false
  welt(on, { kaputt: () => kaputt })
  await start($)
  kaputt = true
  for (const name of ['visible-compact:uebersetzen-an', 'visible-compact:uebersetzen-aus']) expect(await befehl($, name)).toBe(BEFEHL_FEHLER)
})

test('die Antworten der neuen Befehle bekommen den Zusatz statt des Vorsatzes', async ($, on) => {
  welt(on)
  await start($)
  const aus = (text: string) => `<local-command-stdout>${text}</local-command-stdout>`
  const ein: SessionAppendInput = {
    door: 'command',
    origin: { kind: 'composer' },
    uuid: 'befehl-1',
    message: { type: 'system', name: 'local_command', content: [{ type: 'text', text: aus('visible-compact: Die Übersetzung ist in diesem Chat an.') }] },
  }
  const r = await $.session.append(ein as unknown as Parameters<Engine['session']['append']>[0])
  const b = r.message?.content[0]
  expect(b?.type === 'text' ? b.text : '').toBe(aus('Die Übersetzung ist in diesem Chat an. (gemeldet vom Mod Visible Compact)'))
})
