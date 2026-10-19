/** One slash command per header button: registered, with help, doing what the button does. */
import { expect, mock, test } from 'claude-code/testing'
import type { SessionAppendInput } from 'claude-code'

import { BEFEHLE, BEFEHL_FEHLER, TEXT_NICHT_OFFEN } from '../hooks/register'

const ROOT = '/home/k/proj'
const NAMEN = [
  'filetree-hilfe',
  'filetree-zeigen',
  'filetree-versteckte-an',
  'filetree-versteckte-aus',
  'filetree-groessen-an',
  'filetree-groessen-aus',
  'filetree-neu-laden',
  'filetree-einklappen',
]

type Dirs = Record<string, [string, 'file' | 'dir'][]>

/** A small Linux machine outside any git repository; what the engine would answer. */
function world(on: any, dirs: Dirs, x: { kaputt?: () => boolean } = {}) {
  const b = { opens: [] as any[], angemeldet: [] as any[] }
  mock.env(on, { HOME: '/home/k' })
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => {
    if (x.kaputt?.() === true) throw new Error('weg')
    return { value: ROOT }
  })
  on('session.id', () => ({ value: 'test-session' }))
  on('command.register', (_$: any, e: any) => {
    b.angemeldet.push(e)
    return { value: undefined }
  })
  on('ui.open', (_$: any, e: any) => {
    b.opens.push(e)
    return { value: { isPlaced: true } }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('fs.read', () => {
    throw new Error('no file')
  })
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^.*?(?=[A-Za-z]:\/)/, '').replace(/^[A-Za-z]:/, '')
  on('fs.list', (_$: any, e: any) => {
    const kids = dirs[norm(e.path)]
    if (!kids) throw new Error(`ENOENT ${e.path}`)
    return { value: kids.map(([name, kind]) => ({ name, kind, size: 1, mtimeMs: 1_700_000_000_000, isLink: false })) }
  })
  on('fs.stat', (_$: any, e: any) => {
    const p = norm(e.path)
    const parent = p.slice(0, p.lastIndexOf('/')) || '/'
    const name = p.slice(p.lastIndexOf('/') + 1)
    const hit = dirs[p] ? 'dir' : dirs[parent]?.find(([n]) => n === name)?.[1]
    if (!hit) throw new Error(`ENOENT ${e.path}`)
    return { value: { kind: hit, size: 1, mtimeMs: 1_700_000_000_000, isLink: false } }
  })
  on('process.run', (_$: any, e: any) => {
    const argv: string[] = [...e.argv]
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (argv[0] === 'uname') return ok('Linux\n')
    if (argv[0] === 'sh') return ok('missing\n')
    if (argv[0] === 'git') return { value: { exitCode: 128, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false } }
    return ok('')
  })
  on('tool.call', () => ({ result: { stdout: '', stderr: '' } }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text, context: e.context }))
  return { ...b, clock }
}

const paneProps = { title: 'Files', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as any

async function texts($: any): Promise<string> {
  const ui = await $.ui.mount({ plugin: 'filetree', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps })
  const shown = JSON.stringify(await ui.drawn()) + JSON.stringify(await ui.drawn({ in: 'rows' }))
  await ui.unmount()
  // Press handles are new on every mount; what is drawn is the rest.
  return shown.replace(/"handle":\d+/g, '')
}

async function knopf($: any, key: string): Promise<any> {
  const ui = await $.ui.mount({ plugin: 'filetree', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps })
  const found = await ui.find({ type: 'Button', key })
  await ui.unmount()
  return found
}

async function run($: any, command: string, args = '', kind = 'composer', presentation = { isFullscreen: true, columns: 200 }): Promise<string> {
  const r = await $.command.run({ command, args, origin: { kind }, presentation } as any)
  return String(r.text ?? '')
}

const DIRS: Dirs = { [ROOT]: [['src', 'dir'], ['.env', 'file'], ['README.md', 'file']], [`${ROOT}/src`]: [['a.ts', 'file']] }

async function started($: any, on: any, dirs: Dirs = { ...DIRS }) {
  const w = world(on, dirs)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await w.clock.settle()
  return w
}

test('exactly the approved commands, all registered, each with a description', { timeoutMs: 20_000 }, async ($, on) => {
  const w = await started($, on)
  expect(BEFEHLE.map(b => b.name)).toEqual(NAMEN)
  for (const b of BEFEHLE) {
    const spec = w.angemeldet.find(s => s.name === b.name)
    expect(spec).toBeDefined()
    expect(String(spec?.description ?? '').length).toBeGreaterThan(10)
    expect(spec?.immediate).toBe(true)
    expect(spec?.argumentHint).toBe(b.argumentHint)
  }
  expect(w.angemeldet.find(s => s.name === 'filetree-zeigen')?.argumentHint).toBe('[Pfad]')
  expect(w.angemeldet.some(s => s.name === 'filetree')).toBe(true)
})

test('every command explains itself with hilfe and ?, changing nothing', { timeoutMs: 20_000 }, async ($, on) => {
  const w = await started($, on)
  const before = w.opens.length
  const shown = await texts($)
  for (const name of NAMEN) {
    for (const arg of ['hilfe', '?', 'Hilfe']) {
      const text = await run($, name, arg)
      expect(text).toContain(`/${name}`)
      for (const teil of ['Knopf:', 'Gilt:', 'Argumente:', 'Beispiel:']) expect(text).toContain(teil)
    }
  }
  await w.clock.settle()
  expect(w.opens.length).toBe(before)
  expect(await texts($)).toBe(shown)
})

test('/filetree-hilfe lists every command on one line', { timeoutMs: 20_000 }, async ($, on) => {
  await started($, on)
  const text = await run($, 'filetree-hilfe')
  for (const b of BEFEHLE) expect(text).toContain(`/${b.name}${b.argumentHint ? ` ${b.argumentHint}` : ''} – ${b.description}`)
})

test('zeigen: like /filetree, the answer first and the pane behind it; the phone gets a hint', { timeoutMs: 20_000 }, async ($, on) => {
  const w = await started($, on)
  const before = w.opens.length
  expect(await run($, 'filetree-zeigen')).toBe(`Dateibaum für ${ROOT.replace('/home/k', '~')} (folgt dem Arbeitsordner).`)
  await w.clock.settle()
  expect(w.opens.length).toBe(before + 1)
  expect(w.opens.at(-1)).toMatchObject({ id: 'filetree', focus: true })
  expect(await run($, 'filetree-zeigen', 'src')).toBe('Dateibaum für ~/proj/src.')
  await w.clock.settle()
  expect(await texts($)).toContain('a.ts')

  const count = w.opens.length
  expect(await run($, 'filetree-zeigen', '', 'bridge')).toBe('Der Dateibaum geht nur am Rechner; dort öffnet /filetree-zeigen ihn in der Seitenleiste.')
  expect(await run($, 'filetree-zeigen', '', 'composer', { isFullscreen: false, columns: 200 })).toContain('/tui fullscreen aus, dann /filetree-zeigen.')
  await w.clock.settle()
  expect(w.opens.length).toBe(count)
})

test('before the tree was ever opened the buttons commands say so', { timeoutMs: 20_000 }, async ($, on) => {
  world(on, { ...DIRS })
  for (const name of NAMEN.slice(2)) expect(await run($, name)).toBe(TEXT_NICHT_OFFEN)
})

test('versteckte-an and -aus do what ◉ and ○ do', { timeoutMs: 20_000 }, async ($, on) => {
  const w = await started($, on)
  expect(await texts($)).toContain('.env')
  expect(await run($, 'filetree-versteckte-aus')).toBe('Versteckte Dateien sind im Dateibaum jetzt ausgeblendet.')
  await w.clock.settle()
  expect(await texts($)).not.toContain('.env')
  expect((await knopf($, 'hidden'))?.props.label).toBe('○')
  // Twice off stays off: the command sets, the button flips.
  await run($, 'filetree-versteckte-aus')
  expect(await texts($)).not.toContain('.env')
  expect(await run($, 'filetree-versteckte-an')).toBe('Versteckte Dateien sind im Dateibaum jetzt zu sehen.')
  await w.clock.settle()
  expect(await texts($)).toContain('.env')
  expect((await knopf($, 'hidden'))?.props.label).toBe('◉')
})

test('groessen-an and -aus do what Σ does', { timeoutMs: 20_000 }, async ($, on) => {
  const w = await started($, on)
  expect((await knopf($, 'size'))?.props.dimColor).toBe(true)
  expect(await run($, 'filetree-groessen-an')).toBe('Der Dateibaum zeigt jetzt Größen statt Datum.')
  await w.clock.settle()
  expect((await knopf($, 'size'))?.props.dimColor).toBe(false)
  expect(await run($, 'filetree-groessen-aus')).toBe('Der Dateibaum zeigt jetzt das Datum statt der Größen.')
  await w.clock.settle()
  expect((await knopf($, 'size'))?.props.dimColor).toBe(true)
})

test('einklappen does what ⊟ does, neu-laden what ↻ does', { timeoutMs: 20_000 }, async ($, on) => {
  const dirs: Dirs = { ...DIRS }
  const w = await started($, on, dirs)
  const ui = await $.ui.mount({ plugin: 'filetree', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps })
  await ui.post({ press: `${ROOT}/src` }, { in: 'rows' })
  await w.clock.settle()
  await ui.unmount()
  expect(await texts($)).toContain(`"id":"${ROOT}/src/a.ts"`)
  expect(await run($, 'filetree-einklappen')).toBe('Alle Ordner im Dateibaum sind eingeklappt.')
  await w.clock.settle()
  expect(await texts($)).not.toContain(`"id":"${ROOT}/src/a.ts"`)

  dirs[ROOT] = [...(dirs[ROOT] ?? []), ['neu.md', 'file']]
  expect(await texts($)).not.toContain('neu.md')
  expect(await run($, 'filetree-neu-laden')).toBe('Der Dateibaum wird neu eingelesen.')
  await w.clock.settle()
  expect(await texts($)).toContain('neu.md')
})

test('an error becomes one plain sentence', { timeoutMs: 20_000 }, async ($, on) => {
  let kaputt = false
  const w = world(on, { ...DIRS }, { kaputt: () => kaputt })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await w.clock.settle()
  kaputt = true
  expect(await run($, 'filetree-zeigen')).toBe(BEFEHL_FEHLER)
})

test('the answers of the new commands get the note instead of the prefix', { timeoutMs: 20_000 }, async ($, on) => {
  await started($, on)
  const aus = (text: string) => `<local-command-stdout>${text}</local-command-stdout>`
  const ein: SessionAppendInput = {
    door: 'command',
    origin: { kind: 'composer' },
    uuid: 'befehl-1',
    message: { type: 'system', name: 'local_command', content: [{ type: 'text', text: aus('filetree: Alle Ordner im Dateibaum sind eingeklappt.') }] },
  }
  const r = await $.session.append(ein as any)
  const b = r.message?.content[0]
  expect(b?.type === 'text' ? b.text : '').toBe(aus('Alle Ordner im Dateibaum sind eingeklappt. (gemeldet vom Mod Filetree)'))
})
