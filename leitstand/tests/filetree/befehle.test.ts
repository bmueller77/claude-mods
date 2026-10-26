/** Dateien (früher Filetree): ein Befehl /leitstand:dateien-… je Knopf im Kopf des Fensters, mit Hilfe und Kurzform. */
import { expect, mock, test } from 'claude-code/testing'

import { DATEIEN_FENSTER, FILETREE_ALTE, FILETREE_BEFEHLE } from '../../hooks/filetree/befehle'
import { BEFEHL_FEHLER, TEXT_HANDY, TEXT_NICHT_OFFEN } from '../../hooks/filetree/teil'
import { LEITSTAND_BEFEHLE, kurzform } from '../../hooks/logic'

const ROOT = '/home/k/proj'
const NAMEN = [
  'leitstand:dateien',
  'leitstand:dateien-versteckte-an',
  'leitstand:dateien-versteckte-aus',
  'leitstand:dateien-groessen-an',
  'leitstand:dateien-groessen-aus',
  'leitstand:dateien-neu-laden',
  'leitstand:dateien-einklappen',
]
const kurz = (name: string) => name.slice('leitstand:'.length)

type Dirs = Record<string, [string, 'file' | 'dir'][]>

/** Ein kleiner Linux-Rechner außerhalb eines Git-Repos; was die Engine antworten würde. */
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
  on('tool.register', () => ({ value: undefined }))
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

const paneProps = { title: 'Dateien', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as any
const FENSTER = { plugin: 'leitstand', surface: 'terminal', component: 'Pane', requestId: DATEIEN_FENSTER, props: paneProps } as const

async function texts($: any): Promise<string> {
  const ui = await $.ui.mount(FENSTER)
  const shown = JSON.stringify(await ui.drawn()) + JSON.stringify(await ui.drawn({ in: 'rows' }))
  await ui.unmount()
  // Die Griffe der Knöpfe sind bei jedem Zeichnen neu; was gezeichnet ist, ist der Rest.
  return shown.replace(/"handle":\d+/g, '')
}

async function knopf($: any, key: string): Promise<any> {
  const ui = await $.ui.mount(FENSTER)
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

test('genau diese Befehle, jeder in der Übersicht des Leitstands; angemeldet werden die Kurzformen und /filetree', { timeoutMs: 20_000 }, async ($, on) => {
  const w = await started($, on)
  expect(FILETREE_BEFEHLE.map(b => b.name)).toEqual(NAMEN)
  const alle = LEITSTAND_BEFEHLE.map(b => b.name)
  // In der Übersicht hinter den Helfern, als eigene Gruppe.
  expect(alle.filter(name => NAMEN.includes(name))).toEqual(NAMEN)
  for (const b of FILETREE_BEFEHLE) {
    expect(b.gruppe).toBe('Dateien')
    expect(b.description.length).toBeGreaterThan(10)
    expect(b.beispiel.startsWith(`/${b.name}`)).toBe(true)
    // Der lange Name ist eine Datei in commands/: $.command.register nimmt keinen Namen mit Doppelpunkt.
    expect(w.angemeldet.find(s => s.name === b.name)).toBeUndefined()
    // Die Kurzform meldet der Leitstand an, sofort wirksam wie ein Knopf.
    expect(kurzform(b.name)).toBe(kurz(b.name))
    expect(w.angemeldet.find(s => s.name === kurz(b.name))).toMatchObject({ description: `${b.description} (Leitstand)`, immediate: true })
  }
  expect(FILETREE_BEFEHLE.find(b => b.name === 'leitstand:dateien')?.argumentHint).toBe('[Pfad]')
  // /filetree bleibt; die alten Namen mit Bindestrich und die mit filetree: davor sind nicht angemeldet.
  expect(w.angemeldet.filter(s => s.name === 'filetree')).toEqual([expect.objectContaining({ argumentHint: '[Pfad]', immediate: true })])
  expect(w.angemeldet.filter(s => /^filetree[-:]/.test(s.name))).toEqual([])
})

test('ein alter Name wie /filetree-zeigen sagt nur, wie der Befehl jetzt heißt', { timeoutMs: 20_000 }, async ($, on) => {
  const w = await started($, on)
  const before = w.opens.length
  const shown = await texts($)
  expect(FILETREE_ALTE).toEqual({
    'filetree-hilfe': 'leitstand:hilfe',
    'filetree-zeigen': 'leitstand:dateien',
    'filetree-versteckte-an': 'leitstand:dateien-versteckte-an',
    'filetree-versteckte-aus': 'leitstand:dateien-versteckte-aus',
    'filetree-groessen-an': 'leitstand:dateien-groessen-an',
    'filetree-groessen-aus': 'leitstand:dateien-groessen-aus',
    'filetree-neu-laden': 'leitstand:dateien-neu-laden',
    'filetree-einklappen': 'leitstand:dateien-einklappen',
  })
  for (const [alt, neu] of Object.entries(FILETREE_ALTE)) {
    const jetzt = neu === 'leitstand:hilfe' ? 'Der Befehl heißt jetzt /leitstand:hilfe.' : `Der Befehl heißt jetzt /${neu}, kurz /${kurz(neu)}.`
    for (const arg of ['', 'src', 'hilfe']) expect(await run($, alt, arg)).toBe(jetzt)
  }
  await w.clock.settle()
  expect(w.opens.length).toBe(before)
  expect(await texts($)).toBe(shown)
})

test('jeder Befehl erklärt sich mit hilfe und ?, lang und kurz, und ändert nichts', { timeoutMs: 20_000 }, async ($, on) => {
  const w = await started($, on)
  const before = w.opens.length
  const shown = await texts($)
  for (const name of NAMEN) {
    for (const befehl of [name, kurz(name)]) {
      for (const arg of ['hilfe', '?', 'Hilfe']) {
        const text = await run($, befehl, arg)
        expect(text.startsWith(`/${name}: `)).toBe(true)
        for (const teil of ['\nWas: ', '\nKnopf: ', '\nGilt: ', '\nArgumente: ', '\nBeispiel: /leitstand:']) expect(text).toContain(teil)
        expect(text.endsWith(`\nKurzform: /${kurz(name)}`)).toBe(true)
      }
    }
  }
  // /filetree hilfe erklärt /leitstand:dateien, statt einen Ordner namens hilfe zu öffnen.
  expect((await run($, 'filetree', 'hilfe')).startsWith('/leitstand:dateien: ')).toBe(true)
  await w.clock.settle()
  expect(w.opens.length).toBe(before)
  expect(await texts($)).toBe(shown)
})

test('/leitstand:hilfe zeigt die Befehle von Dateien als eigene Gruppe, je eine Zeile', { timeoutMs: 20_000 }, async ($, on) => {
  await started($, on)
  const lines = (await run($, 'leitstand:hilfe')).split('\n')
  const kopf = lines.indexOf('Dateien')
  expect(kopf).toBeGreaterThan(0)
  expect(lines.slice(kopf + 1, kopf + 1 + NAMEN.length)).toEqual(FILETREE_BEFEHLE.map(b => `/${b.name}${b.argumentHint ? ` ${b.argumentHint}` : ''}: ${b.description}`))
})

test('dateien: wie /filetree, die Antwort zuerst und das Fenster dahinter; das Handy bekommt einen Hinweis', { timeoutMs: 20_000 }, async ($, on) => {
  const w = await started($, on)
  const before = w.opens.length
  expect(await run($, 'leitstand:dateien')).toBe('Dateien in ~/proj (folgt dem Arbeitsordner).')
  await w.clock.settle()
  expect(w.opens.length).toBe(before + 1)
  expect(w.opens.at(-1)).toMatchObject({ id: DATEIEN_FENSTER, title: 'Dateien: proj', focus: true })
  expect(await run($, 'dateien', 'src')).toBe('Dateien in ~/proj/src.')
  await w.clock.settle()
  expect(w.opens.at(-1)).toMatchObject({ id: DATEIEN_FENSTER, title: 'Dateien: src', focus: true })
  expect(await texts($)).toContain('a.ts')
  // Was der Knopf 📂 im Leitstand ausführt: die Kurzform, von einem Mod gestartet.
  expect(await run($, 'dateien', '', 'plugin')).toBe('Dateien in ~/proj (folgt dem Arbeitsordner).')
  await w.clock.settle()
  expect(w.opens.at(-1)).toMatchObject({ id: DATEIEN_FENSTER, focus: true })

  const count = w.opens.length
  for (const befehl of ['leitstand:dateien', 'dateien']) {
    expect(await run($, befehl, '', 'bridge')).toBe(TEXT_HANDY)
    expect(await run($, befehl, '', 'composer', { isFullscreen: false, columns: 200 })).toContain(`/tui fullscreen aus, dann /${befehl}.`)
    expect(await run($, befehl, '', 'composer', { isFullscreen: true, columns: 80 })).toContain(`mindestens 110 Spalten. Mach es breiter, dann /${befehl}.`)
  }
  await w.clock.settle()
  expect(w.opens.length).toBe(count)
})

test('/filetree öffnet das Fenster wie /dateien, erst danach kommt die Antwort', { timeoutMs: 20_000 }, async ($, on) => {
  const w = await started($, on)
  const before = w.opens.length
  expect(await run($, 'filetree', 'src')).toBe('Dateien in ~/proj/src.')
  expect(w.opens.length).toBe(before + 1)
  expect(w.opens.at(-1)).toMatchObject({ id: DATEIEN_FENSTER, focus: true })
})

test('bevor das Fenster je offen war, sagen die Knopf-Befehle das', { timeoutMs: 20_000 }, async ($, on) => {
  world(on, { ...DIRS })
  for (const name of NAMEN.slice(1)) {
    expect(await run($, name)).toBe(TEXT_NICHT_OFFEN)
    expect(await run($, kurz(name))).toBe(TEXT_NICHT_OFFEN)
  }
})

test('versteckte-an und -aus tun, was ◉ und ○ tun', { timeoutMs: 20_000 }, async ($, on) => {
  const w = await started($, on)
  expect(await texts($)).toContain('.env')
  expect(await run($, 'leitstand:dateien-versteckte-aus')).toBe('Versteckte Dateien sind jetzt ausgeblendet (nur in diesem Chat).')
  await w.clock.settle()
  expect(await texts($)).not.toContain('.env')
  expect((await knopf($, 'hidden'))?.props.label).toBe('○')
  // Zweimal aus bleibt aus: der Befehl setzt, der Knopf schaltet um.
  await run($, 'dateien-versteckte-aus')
  expect(await texts($)).not.toContain('.env')
  expect(await run($, 'dateien-versteckte-an')).toBe('Versteckte Dateien sind jetzt zu sehen (nur in diesem Chat).')
  await w.clock.settle()
  expect(await texts($)).toContain('.env')
  expect((await knopf($, 'hidden'))?.props.label).toBe('◉')
})

test('groessen-an und -aus tun, was Σ tut', { timeoutMs: 20_000 }, async ($, on) => {
  const w = await started($, on)
  expect((await knopf($, 'size'))?.props.dimColor).toBe(true)
  expect(await run($, 'leitstand:dateien-groessen-an')).toBe('Das Fenster Dateien zeigt jetzt die Größe statt des Datums (nur in diesem Chat).')
  await w.clock.settle()
  expect((await knopf($, 'size'))?.props.dimColor).toBe(false)
  expect(await run($, 'dateien-groessen-aus')).toBe('Das Fenster Dateien zeigt jetzt das Datum statt der Größe (nur in diesem Chat).')
  await w.clock.settle()
  expect((await knopf($, 'size'))?.props.dimColor).toBe(true)
})

test('einklappen tut, was ⊟ tut, neu-laden, was ↻ tut', { timeoutMs: 20_000 }, async ($, on) => {
  const dirs: Dirs = { ...DIRS }
  const w = await started($, on, dirs)
  const ui = await $.ui.mount(FENSTER)
  await ui.post({ press: `${ROOT}/src` }, { in: 'rows' })
  await w.clock.settle()
  await ui.unmount()
  expect(await texts($)).toContain(`"id":"${ROOT}/src/a.ts"`)
  expect(await run($, 'leitstand:dateien-einklappen')).toBe('Alle Ordner im Fenster Dateien sind eingeklappt.')
  await w.clock.settle()
  expect(await texts($)).not.toContain(`"id":"${ROOT}/src/a.ts"`)

  dirs[ROOT] = [...(dirs[ROOT] ?? []), ['neu.md', 'file']]
  expect(await texts($)).not.toContain('neu.md')
  expect(await run($, 'dateien-neu-laden')).toBe('Dateien werden neu eingelesen.')
  await w.clock.settle()
  expect(await texts($)).toContain('neu.md')
})

test('ein Fehler wird ein schlichter Satz', { timeoutMs: 20_000 }, async ($, on) => {
  let kaputt = false
  const w = world(on, { ...DIRS }, { kaputt: () => kaputt })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await w.clock.settle()
  kaputt = true
  expect(await run($, 'leitstand:dateien')).toBe(BEFEHL_FEHLER)
  expect(await run($, 'dateien')).toBe(BEFEHL_FEHLER)
  expect(await run($, 'filetree')).toBe(BEFEHL_FEHLER)
})

test('die Antwort eines Befehls trägt in der gespeicherten Zeile „(gemeldet vom Mod Leitstand)“ statt des Vorsatzes', { timeoutMs: 20_000 }, async ($, on) => {
  // Die Zeilen der Sitzung liest mock.session; angemeldet wird es, bevor der Test $ zum ersten Mal ruft.
  const sitzung = mock.session(on)
  await started($, on)
  const zeilen = () =>
    sitzung.appended().map(z => {
      const b = z.message.content[0]
      return typeof b?.text === 'string' ? b.text : ''
    })
  const aus = (text: string) => `<local-command-stdout>${text}</local-command-stdout>`
  const heben = (text: string) =>
    $.session.append({
      message: { type: 'system', name: 'local_command', content: [{ type: 'text', text: aus(`leitstand: ${text}`) }] },
      door: 'command',
      origin: { kind: 'engine' },
      uuid: `befehl-${Math.random()}`,
    } as never)
  const text = await run($, 'dateien-einklappen')
  expect(text).toBe('Alle Ordner im Fenster Dateien sind eingeklappt.')
  await heben(text)
  expect(zeilen()).toEqual([aus(`${text} (gemeldet vom Mod Leitstand)`)])
  // Eine Hilfe über mehrere Zeilen bekommt den Zusatz in einer eigenen Zeile, auch die von /filetree.
  const hilfe = await run($, 'filetree', '?')
  await heben(hilfe)
  expect(zeilen()[1]).toBe(aus(`${hilfe}\n(gemeldet vom Mod Leitstand)`))
})
