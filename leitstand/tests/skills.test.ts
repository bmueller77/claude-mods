import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { KNOPF_SKILLS, SKILLS_BEFEHLE } from '../hooks/skills/befehle'
import { AM_RECHNER, LADEFRIST_MS, OHNE_SKILLS, skillNamen, textListe } from '../hooks/skills/teil'

// Das Skill-Menü als Teil des Leitstands: Die Test-Engine lädt den ganzen Leitstand. Die Tests des Befehls schalten
// seine Ansicht aus (AUS); die Tests des Aufklappmenüs zeichnen das Band.

const AUS = { options: { ansicht: 'aus' } } as const
const bandProps = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 93,
  scroll: { offset: 0, bodyRows: 12, isAtTop: true, isAtBottom: true },
  view: {},
} as never
const BAND = { plugin: 'leitstand', component: 'AbovePrompt', props: bandProps } as const
const PUZZLE = '\u{1F9E9}'

/** Was die Sitzung kennt: die Skills laut Kontext und die Befehle der Befehlsliste. */
const SKILLS = [
  { name: 'debuggen', pluginName: 'sorgfalt', source: 'plugin', tokens: 10 },
  { name: 'grill-me', source: 'userSettings', tokens: 10 },
  { name: 'belegen', pluginName: 'sorgfalt', source: 'plugin', tokens: 10 },
  { name: 'debuggen', pluginName: 'sorgfalt', source: 'plugin', tokens: 10 },
  { name: 'innen', pluginName: 'leitstand', source: 'plugin', tokens: 10 },
  { name: 'leitstand:sauberer-code', source: 'plugin', tokens: 10 },
  { name: 'Ärger', source: 'userSettings', tokens: 10 },
]
const BEFEHLE = ['sorgfalt:debuggen', 'sorgfalt:belegen', 'grill-me', 'Ärger', 'leitstand:skill-menue', 'compact']
const ERWARTET = ['Ärger', 'grill-me', 'sorgfalt:belegen', 'sorgfalt:debuggen']

type Welt = {
  skills?: readonly object[]
  /** Die Kontext-Aufschlüsselung antwortet nie. */
  haengt?: boolean
  /** Die Kontext-Aufschlüsselung scheitert. */
  scheitert?: boolean
  laeuftNicht?: boolean
}
type Lauf = {
  runs: string[]
  toasts: string[]
  fills: string[]
  opens: string[]
  logs: string[]
  /** Wie oft $.session.usage gefragt wurde. */
  usage: number
  clock: { settle: () => Promise<void>; advance: (ms: number) => Promise<void> }
}

/** Der Boden unter dem Leitstand: was die Engine sonst beantworten würde. `w` darf sich im Test ändern. */
function boden(on: On, w: Welt = {}): Lauf {
  const clock = mock.clock(on, { now: 1_000_000 })
  const lauf: Lauf = { runs: [], toasts: [], fills: [], opens: [], logs: [], usage: 0, clock }
  mock.store(on)
  on('classic.Stop', () => ({}) as never)
  on('classic.Notification', () => ({}) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('command.list', () => ({ value: [...BEFEHLE.map(name => ({ name, description: '', source: 'plugin' }))] }) as never)
  on('session.usage', () => {
    lauf.usage++
    if (w.haengt) return new Promise(() => {}) as never
    if (w.scheitert) throw new Error('keine Aufschlüsselung')
    return { value: { startedAt: 0, context: { breakdown: { skills: { skillFrontmatter: w.skills ?? SKILLS } } } } } as never
  })
  on('ui.open', (_$, e) => {
    lauf.opens.push((e as { id: string }).id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.toast', (_$, e) => {
    lauf.toasts.push(String((e as { text?: unknown }).text))
    return { value: undefined } as never
  })
  on('ui.log', (_$, e) => {
    lauf.logs.push(`${e.to}: ${e.text}`)
    return { value: undefined } as never
  })
  on('prompt.fill', (_$, e) => {
    lauf.fills.push(String((e as { text?: unknown }).text))
    return { isFilled: true } as never
  })
  // Was der Leitstand an Befehlen startet, kommt unten an: der gewählte Skill.
  on('command.run', (_$, e) => {
    lauf.runs.push(e.command)
    if (w.laeuftNicht) throw new Error('unbekannter Befehl')
    return { text: '' }
  })
  return lauf
}

type Test$ = {
  session: { start: (e: never) => Promise<unknown> }
  turn: { start: (e: never) => Promise<unknown>; complete: (e: never) => Promise<unknown> }
  command: { run: (e: never) => Promise<{ text?: unknown }> }
}

/** Liest den Zustand des Leitstands aus einem anderen Plugin: /skill-zustand antwortet mit Liste und Wahlen. */
const LESER = {
  name: 'skill-leser',
  register(on: On) {
    on('command.run', { command: 'skill-zustand' }, async $ => {
      const liste = (await $.state.get({ plugin: 'leitstand', key: 'skillListe' } as never)) as { value?: unknown }
      const wahl = (await $.state.get({ plugin: 'leitstand', key: 'skillWahl' } as never)) as { value?: unknown }
      return { text: JSON.stringify({ skillListe: liste.value ?? null, skillWahl: wahl.value ?? null }) }
    })
  },
}
const LIEST = { plugins: [LESER] }
const LIEST_AUS = { ...AUS, plugins: [LESER] }

async function zustand($: Test$): Promise<{ skillListe: string[] | null; skillWahl: number | null }> {
  return JSON.parse(String((await $.command.run({ command: 'skill-zustand', args: '' } as never)).text))
}

/** Startet die Sitzung und lässt das Laden der Liste laufen, das der Teil danach anstößt. */
async function start($: Test$, lauf: Lauf) {
  await $.session.start({ cwd: '/projekt', surface: 'desktop', isInteractive: true } as never)
  await lauf.clock.settle()
}

async function liste($: Test$) {
  return (await zustand($)).skillListe
}

/** /leitstand:skill-menue, wie getippt, am Rechner oder vom Handy. */
async function menue($: Test$, kind: 'composer' | 'sdk' | 'bridge' = 'sdk', args = '') {
  const r = await $.command.run({ command: SKILLS_BEFEHLE[0]!.name, args, origin: { kind } } as never)
  return String(r.text ?? '')
}

type Wahl = { type: string; props: { key?: string; label?: string; value?: string; options: { value: string; label?: string }[] } }

/** Das Aufklappmenü im Band der App, wie es gezeichnet ist. */
async function wahlIm(ui: { find: (q: { type: string; key: string }) => Promise<unknown> }) {
  return (await ui.find({ type: 'Select', key: KNOPF_SKILLS })) as Wahl | undefined
}

test('skillNamen sortiert, entfernt Doppelte und die eigenen Befehle des Leitstands', () => {
  expect(skillNamen(SKILLS, BEFEHLE)).toEqual(ERWARTET)
  // Ohne Befehlsliste: Ein Skill eines Plugins heißt plugin:skill.
  expect(skillNamen([{ name: 'debuggen', pluginName: 'sorgfalt' }], [])).toEqual(['sorgfalt:debuggen'])
  // Kennt die Befehlsliste nur den nackten Namen, gilt der.
  expect(skillNamen([{ name: 'debuggen', pluginName: 'sorgfalt' }], ['debuggen'])).toEqual(['debuggen'])
  expect(skillNamen([], BEFEHLE)).toEqual([])
})

test('am Rechner steht hinter 🧹 ein Aufklappmenü: zuerst 🧩, dann die Skills sortiert; kein Fenster', async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const wahl = await wahlIm(ui as never)
  expect(wahl?.props.value).toBe('')
  expect(wahl?.props.options).toEqual([{ value: '', label: PUZZLE }, ...ERWARTET.map(name => ({ value: name, label: name }))])
  // Kein Button mehr unter diesem Schlüssel, und es geht kein Fenster auf.
  expect(await ui.find({ type: 'Button', key: KNOPF_SKILLS })).toBeUndefined()
  const actions = JSON.stringify((await ui.findAll({ type: 'Box' })).find(one => one.props.key === 'actions') ?? null)
  expect(actions.indexOf('"key":"cleancode"')).toBeGreaterThan(-1)
  expect(actions.indexOf(`"key":"${KNOPF_SKILLS}"`)).toBeGreaterThan(actions.indexOf('"key":"cleancode"'))
  expect(lauf.opens).toEqual([])
  // In VS Code genauso.
  const vscode = await $.ui.mount({ ...BAND, surface: 'vscode' })
  expect((await wahlIm(vscode as never))?.props.options[0]).toEqual({ value: '', label: PUZZLE })
})

test('eine Wahl startet den Skill wie getippt, danach zeigt das Menü wieder 🧩', LIEST, async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.select({ key: KNOPF_SKILLS, value: 'sorgfalt:debuggen' })
  await lauf.clock.settle()
  expect(lauf.runs.at(-1)).toBe('sorgfalt:debuggen')
  expect(lauf.fills).toEqual([])
  expect(lauf.opens).toEqual([])
  // Die Wahl zählt im Zustand mit; das zeichnet das Band neu, und das Menü steht wieder auf 🧩.
  expect((await zustand($ as never)).skillWahl).toBe(1)
  const wahl = await wahlIm(ui as never)
  expect(wahl?.props.value).toBe('')
  expect(wahl?.props.options[0]).toEqual({ value: '', label: PUZZLE })
  // Die Wahl von 🧩 selbst tut nichts.
  const vorher = lauf.runs.length
  await ui.select({ key: KNOPF_SKILLS, value: '' })
  await lauf.clock.settle()
  expect(lauf.runs).toHaveLength(vorher)
})

test('scheitert der Start, steht der Skill im Eingabefeld', async ($, on) => {
  const lauf = boden(on, { laeuftNicht: true })
  await start($ as never, lauf)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.select({ key: KNOPF_SKILLS, value: 'grill-me' })
  await lauf.clock.settle()
  expect(lauf.fills).toEqual(['/grill-me'])
  expect(lauf.toasts).toContain('grill-me steht im Eingabefeld: Drück Enter, um zu starten.')
})

test('beim Zeichnen des Bandes wird die Liste nie geladen', async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  expect(lauf.usage).toBe(1)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.unmount()
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(lauf.usage).toBe(1)
})

test('die Liste lädt beim Start und am Ende jeder Runde der Hauptschleife, nicht nach Runden der Helfer', LIEST, async ($, on) => {
  const w: Welt = {}
  const lauf = boden(on, w)
  await $.session.start({ cwd: '/projekt', surface: 'desktop', isInteractive: true } as never)
  // Geladen wird erst nach dem Ereignis, nicht in ihm.
  expect(await liste($ as never)).toBeNull()
  await lauf.clock.settle()
  expect(await liste($ as never)).toEqual(ERWARTET)
  w.skills = [{ name: 'neu', source: 'userSettings', tokens: 1 }]
  await $.turn.start({ text: 'Bau das.', turnId: 't1' } as never)
  await $.turn.complete({ reason: 'answer', answer: 'Fertig.', turnId: 't1', agentId: 'helfer' } as never)
  await lauf.clock.settle()
  expect(await liste($ as never)).toEqual(ERWARTET)
  await $.turn.complete({ reason: 'answer', answer: 'Fertig.', turnId: 't1' } as never)
  await lauf.clock.settle()
  expect(await liste($ as never)).toEqual(['neu'])
  expect(lauf.usage).toBe(2)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await wahlIm(ui as never))?.props.options).toEqual([{ value: '', label: PUZZLE }, { value: 'neu', label: 'neu' }])
})

test('antwortet die Aufschlüsselung nie, bleibt die alte Liste, das Band zeichnet trotzdem, nach 10 s eine Zeile im Debug-Log', LIEST, async ($, on) => {
  const w: Welt = { haengt: true }
  const lauf = boden(on, w)
  await start($ as never, lauf)
  expect(await liste($ as never)).toBeNull()
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // Ohne Liste nur 🧩; eine Wahl gibt es nicht.
  expect((await wahlIm(ui as never))?.props.options).toEqual([{ value: '', label: PUZZLE }])
  expect(await ui.find({ type: 'Button', key: 'cleancode' })).toBeDefined()
  expect(lauf.logs.filter(line => line.includes('skill list'))).toEqual([])
  await lauf.clock.advance(LADEFRIST_MS)
  expect(lauf.logs.filter(line => line.includes('skill list'))).toEqual([expect.stringMatching(/^debug: leitstand: skill list \(session\.start\) took longer than 10 s/)])
  expect(await liste($ as never)).toBeNull()
  // Eine Liste, die schon da ist, bleibt, wenn das nächste Laden hängt oder scheitert.
  w.haengt = false
  await $.turn.complete({ reason: 'answer', answer: 'Fertig.', turnId: 't1' } as never)
  await lauf.clock.settle()
  expect(await liste($ as never)).toEqual(ERWARTET)
  w.haengt = true
  await $.turn.complete({ reason: 'answer', answer: 'Fertig.', turnId: 't2' } as never)
  await lauf.clock.settle()
  await lauf.clock.advance(LADEFRIST_MS)
  expect(await liste($ as never)).toEqual(ERWARTET)
  w.haengt = false
  w.scheitert = true
  await $.turn.complete({ reason: 'answer', answer: 'Fertig.', turnId: 't3' } as never)
  await lauf.clock.settle()
  expect(await liste($ as never)).toEqual(ERWARTET)
  expect(lauf.logs.at(-1)).toMatch(/^debug: leitstand: skill list \(turn\.complete\) failed: .*the old list stays$/)
})

test('im Terminal legt 🧩 /skill-menue ins Eingabefeld', async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const knopf = (await terminal.find({ type: 'Button', key: KNOPF_SKILLS })) as { props: { label?: string } } | undefined
  expect(knopf?.props.label).toBe(PUZZLE)
  expect(await terminal.find({ type: 'Select', key: KNOPF_SKILLS })).toBeUndefined()
  await terminal.press({ key: KNOPF_SKILLS })
  await lauf.clock.settle()
  expect(lauf.fills).toEqual(['/skill-menue'])
  expect(lauf.opens).toEqual([])
})

test('der Befehl antwortet am Rechner mit der Liste und dem Hinweis auf 🧩, vom Handy ohne', AUS, async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  const liste = textListe(ERWARTET)
  expect(liste).toBe(['4 Skills in dieser Sitzung:', ...ERWARTET.map(name => `/${name}`)].join('\n'))
  expect(await menue($ as never, 'sdk')).toBe(`${liste}\n\n${AM_RECHNER}`)
  expect(await menue($ as never, 'composer')).toBe(`${liste}\n\n${AM_RECHNER}`)
  expect(await menue($ as never, 'bridge')).toBe(liste)
  expect(AM_RECHNER).toBe('Am Rechner klappt 🧩 im Band dieselbe Liste auf.')
  // Die Liste kam aus dem Zustand: geladen wurde nur einmal, beim Start; ein Fenster gibt es nicht mehr.
  expect(lauf.usage).toBe(1)
  expect(lauf.opens).toEqual([])
})

test('ist die Liste noch leer, lädt der Befehl sie einmal selbst', LIEST_AUS, async ($, on) => {
  const w: Welt = { haengt: true }
  const lauf = boden(on, w)
  await start($ as never, lauf)
  w.haengt = false
  expect(await menue($ as never, 'bridge')).toBe(textListe(ERWARTET))
  expect(await liste($ as never)).toEqual(ERWARTET)
})

test('ohne Skills antwortet der Befehl nur mit dem Satz, das Menü zeigt nur 🧩', async ($, on) => {
  const lauf = boden(on, { skills: [] })
  await start($ as never, lauf)
  expect(await menue($ as never, 'bridge')).toBe(OHNE_SKILLS)
  expect(await menue($ as never, 'sdk')).toBe(OHNE_SKILLS)
  expect(OHNE_SKILLS).toBe('In dieser Sitzung sind keine Skills installiert.')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await wahlIm(ui as never))?.props.options).toEqual([{ value: '', label: PUZZLE }])
})

test('hilfe erklärt den Befehl und lädt nichts', AUS, async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  const vorher = lauf.usage
  const hilfe = await menue($ as never, 'sdk', 'hilfe')
  expect(hilfe).toContain('/leitstand:skill-menue')
  expect(lauf.usage).toBe(vorher)
})
