import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { KNOPF_SKILLS, SKILLS_BEFEHLE } from '../hooks/skills/befehle'
import { WEITERE, ZURUECK, ZURUECK_TEXT, kategorienHash, nachPlugin } from '../hooks/skills/kategorien'
import { AM_RECHNER, HAIKU_FRIST_MS, LADEFRIST_MS, OHNE_SKILLS, STORE_KATEGORIEN, skillNamen, textListe } from '../hooks/skills/teil'
import { SELECT_MAX, gepruefterBaum, selectFehler } from './selects'

// Das Skill-Menü als Teil des Leitstands: Die Test-Engine lädt den ganzen Leitstand. Die Tests des Befehls schalten
// seine Ansicht aus (AUS); die Tests des Aufklappmenüs zeichnen das Band. Jeder gezeichnete Baum geht durch
// gepruefterBaum: kein Select mit 0 oder mehr als 64 Optionen, kein Wert doppelt.

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
/** Die Kategorien nach Plugin für ERWARTET. */
const NACH_PLUGIN = [
  { name: 'Eigene', skills: ['Ärger', 'grill-me'] },
  { name: 'Sorgfalt', skills: ['sorgfalt:belegen', 'sorgfalt:debuggen'] },
]

/** Erfundene Skills: `n` Stück, auf `plugins` Plugins verteilt (0: alle ohne Plugin). */
const erfunden = (n: number, plugins: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `skill-${String(i).padStart(3, '0')}`, ...(plugins > 0 ? { pluginName: `plugin-${i % plugins}` } : {}), source: 'plugin', tokens: 1 }))

type Welt = {
  skills?: readonly object[]
  /** Die Kontext-Aufschlüsselung antwortet nie. */
  haengt?: boolean
  /** Die Kontext-Aufschlüsselung scheitert. */
  scheitert?: boolean
  laeuftNicht?: boolean
  /** Was Haiku auf die Bitte um Kategorien antwortet; ohne: keine Antwort (empty-reply). */
  haiku?: string
  /** Was im Store des Leitstands schon steht. */
  store?: Record<string, unknown>
}
type Lauf = {
  runs: string[]
  toasts: string[]
  fills: string[]
  opens: string[]
  logs: string[]
  /** Wie oft $.session.usage gefragt wurde. */
  usage: number
  /** Die Bitten an Haiku um Kategorien, mit Modell und Frist. */
  haiku: { model: string; timeoutMs?: number; prompt: string }[]
  /** Was der Leitstand in den Store schrieb. */
  gespeichert: { key: string; value: unknown }[]
  clock: { settle: () => Promise<void>; advance: (ms: number) => Promise<void> }
}

/** Der Boden unter dem Leitstand: was die Engine sonst beantworten würde. `w` darf sich im Test ändern. */
function boden(on: On, w: Welt = {}): Lauf {
  const clock = mock.clock(on, { now: 1_000_000 })
  const lauf: Lauf = { runs: [], toasts: [], fills: [], opens: [], logs: [], usage: 0, haiku: [], gespeichert: [], clock }
  // Der Store des Leitstands, hier selbst gehalten: so zählt der Test jedes Schreiben mit.
  const store = new Map<string, unknown>(Object.entries(w.store ?? {}))
  on('store.get', (_$, e) => ({ value: store.get(e.key) }) as never)
  on('store.set', (_$, e) => {
    lauf.gespeichert.push({ key: e.key, value: e.value })
    store.set(e.key, e.value)
    return { value: undefined } as never
  })
  on('store.delete', (_$, e) => {
    store.delete(e.key)
    return { value: undefined } as never
  })
  on('store.keys', () => ({ value: [...store.keys()] }) as never)
  on('classic.Stop', () => ({}) as never)
  on('classic.Notification', () => ({}) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('command.list', () => ({ value: [...BEFEHLE.map(name => ({ name, description: `Beschreibung von ${name}`, source: 'plugin' }))] }) as never)
  on('session.usage', () => {
    lauf.usage++
    if (w.haengt) return new Promise(() => {}) as never
    if (w.scheitert) throw new Error('keine Aufschlüsselung')
    return { value: { startedAt: 0, context: { breakdown: { skills: { skillFrontmatter: w.skills ?? SKILLS } } } } } as never
  })
  on('model.complete', (_$, e) => {
    if (e.prompt.includes('Skills von Claude Code')) lauf.haiku.push({ model: e.model, timeoutMs: e.timeoutMs, prompt: e.prompt })
    if (w.haiku === undefined || !e.prompt.includes('Skills von Claude Code')) return { value: { isAnswered: false, reason: 'empty-reply', usage: {} } } as never
    return { value: { isAnswered: true, text: w.haiku, usage: {} } } as never
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

type Zustand = { skillListe: string[] | null; skillMenue: { name: string; skills: string[] }[] | null; skillOffen: string | null; skillWahl: number | null }

/** Liest den Zustand des Leitstands aus einem anderen Plugin: /skill-zustand antwortet mit allem des Skill-Menüs. */
const LESER = {
  name: 'skill-leser',
  register(on: On) {
    on('command.run', { command: 'skill-zustand' }, async $ => {
      const wert = (gelesen: unknown) => (gelesen as { value?: unknown }).value ?? null
      const skillListe = wert(await $.state.get({ plugin: 'leitstand', key: 'skillListe' } as never))
      const skillMenue = wert(await $.state.get({ plugin: 'leitstand', key: 'skillMenue' } as never))
      const skillOffen = wert(await $.state.get({ plugin: 'leitstand', key: 'skillOffen' } as never))
      const skillWahl = wert(await $.state.get({ plugin: 'leitstand', key: 'skillWahl' } as never))
      return { text: JSON.stringify({ skillListe, skillMenue, skillOffen, skillWahl }) }
    })
  },
}
const LIEST = { plugins: [LESER] }
const LIEST_AUS = { ...AUS, plugins: [LESER] }

async function zustand($: Test$): Promise<Zustand> {
  return JSON.parse(String((await $.command.run({ command: 'skill-zustand', args: '' } as never)).text))
}

/** Startet die Sitzung und lässt das Laden der Liste (und eine Bitte an Haiku) laufen, das der Teil danach anstößt. */
async function start($: Test$, lauf: Lauf) {
  await $.session.start({ cwd: '/projekt', surface: 'desktop', isInteractive: true } as never)
  await lauf.clock.settle()
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
type Gezeichnet = { find: (q: { type: string; key: string }) => Promise<unknown>; drawn: () => Promise<unknown> }

/** Das Aufklappmenü im Band der App, wie es gezeichnet ist; der ganze Baum geprüft. */
async function wahlIm(ui: Gezeichnet) {
  await gepruefterBaum(ui, 'Band')
  return (await ui.find({ type: 'Select', key: KNOPF_SKILLS })) as Wahl | undefined
}

/** Die Optionen der Stufe 1 für diese Kategorien. */
const stufe1 = (kategorien: readonly { name: string; skills: readonly string[] }[]) => [
  { value: '', label: PUZZLE },
  ...kategorien.map(k => ({ value: `k:${k.name}`, label: `${k.name} (${k.skills.length})` })),
]

test('die Prüfhilfe findet Selects mit 0 oder mehr als 64 Optionen und doppelte Werte, auch tief im Baum', () => {
  const select = (options: { value: string }[]) => ({ type: 'Select', props: { key: 'probe', options } })
  const viele = Array.from({ length: SELECT_MAX + 1 }, (_, i) => ({ value: String(i) }))
  expect(selectFehler({ type: 'Box', props: {}, children: [{ type: 'Box', props: {}, children: [select(viele)] }] })).toEqual(['Baum: Select "probe" hat 65 Optionen (erlaubt 1 bis 64)'])
  expect(selectFehler(select([]))).toEqual(['Baum: Select "probe" hat 0 Optionen (erlaubt 1 bis 64)'])
  expect(selectFehler(select([{ value: 'a' }, { value: 'a' }]))).toEqual(['Baum: Select "probe" hat doppelte Werte: a'])
  expect(selectFehler(select(viele.slice(0, SELECT_MAX)))).toEqual([])
})

test('skillNamen sortiert, entfernt Doppelte und die eigenen Befehle des Leitstands', () => {
  expect(skillNamen(SKILLS, BEFEHLE)).toEqual(ERWARTET)
  // Ohne Befehlsliste: Ein Skill eines Plugins heißt plugin:skill.
  expect(skillNamen([{ name: 'debuggen', pluginName: 'sorgfalt' }], [])).toEqual(['sorgfalt:debuggen'])
  // Kennt die Befehlsliste nur den nackten Namen, gilt der.
  expect(skillNamen([{ name: 'debuggen', pluginName: 'sorgfalt' }], ['debuggen'])).toEqual(['debuggen'])
  expect(skillNamen([], BEFEHLE)).toEqual([])
})

test('am Rechner steht hinter 🧹 ein Aufklappmenü: Stufe 1 zeigt 🧩 und die Kategorien mit Anzahl; kein Fenster', async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const wahl = await wahlIm(ui as never)
  expect(wahl?.props.value).toBe('')
  expect(wahl?.props.options).toEqual(stufe1(NACH_PLUGIN))
  expect(await ui.find({ type: 'Button', key: KNOPF_SKILLS })).toBeUndefined()
  const actions = JSON.stringify((await ui.findAll({ type: 'Box' })).find(one => one.props.key === 'actions') ?? null)
  expect(actions.indexOf('"key":"cleancode"')).toBeGreaterThan(-1)
  expect(actions.indexOf(`"key":"${KNOPF_SKILLS}"`)).toBeGreaterThan(actions.indexOf('"key":"cleancode"'))
  expect(lauf.opens).toEqual([])
  // In VS Code genauso.
  const vscode = await $.ui.mount({ ...BAND, surface: 'vscode' })
  expect((await wahlIm(vscode as never))?.props.options).toEqual(stufe1(NACH_PLUGIN))
})

test('Stufenwechsel: Kategorie klappt Stufe 2 auf, zurück führt zu Stufe 1, ein Skill startet; danach steht das Menü auf ""', LIEST, async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // Kategorie gewählt: Stufe 2 mit Kopf, zurück und den Skills; der Wert wieder "".
  await ui.select({ key: KNOPF_SKILLS, value: 'k:Sorgfalt' })
  let wahl = await wahlIm(ui as never)
  expect(wahl?.props.value).toBe('')
  expect(wahl?.props.options).toEqual([
    { value: '', label: `${PUZZLE} Sorgfalt` },
    { value: ZURUECK, label: ZURUECK_TEXT },
    { value: 's:sorgfalt:belegen', label: 'sorgfalt:belegen' },
    { value: 's:sorgfalt:debuggen', label: 'sorgfalt:debuggen' },
  ])
  expect((await zustand($ as never)).skillOffen).toBe('Sorgfalt')
  expect((await zustand($ as never)).skillWahl).toBe(1)
  expect(lauf.runs).toEqual([])
  // Zurück: Stufe 1.
  await ui.select({ key: KNOPF_SKILLS, value: ZURUECK })
  wahl = await wahlIm(ui as never)
  expect(wahl?.props.value).toBe('')
  expect(wahl?.props.options).toEqual(stufe1(NACH_PLUGIN))
  expect((await zustand($ as never)).skillOffen).toBeNull()
  expect((await zustand($ as never)).skillWahl).toBe(2)
  // Kategorie, dann Skill: startet wie getippt, zurück auf Stufe 1, Wert "".
  await ui.select({ key: KNOPF_SKILLS, value: 'k:Eigene' })
  await ui.select({ key: KNOPF_SKILLS, value: 's:grill-me' })
  await lauf.clock.settle()
  expect(lauf.runs.at(-1)).toBe('grill-me')
  expect(lauf.fills).toEqual([])
  expect(lauf.opens).toEqual([])
  wahl = await wahlIm(ui as never)
  expect(wahl?.props.value).toBe('')
  expect(wahl?.props.options).toEqual(stufe1(NACH_PLUGIN))
  expect((await zustand($ as never)).skillWahl).toBe(4)
  // Die Wahl von 🧩 selbst tut nichts.
  const vorher = lauf.runs.length
  await ui.select({ key: KNOPF_SKILLS, value: '' })
  await lauf.clock.settle()
  expect(lauf.runs).toHaveLength(vorher)
  expect((await zustand($ as never)).skillWahl).toBe(4)
})

test('verschwindet die offene Kategorie aus der Liste, gilt Stufe 1', LIEST, async ($, on) => {
  const w: Welt = {}
  const lauf = boden(on, w)
  await start($ as never, lauf)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.select({ key: KNOPF_SKILLS, value: 'k:Sorgfalt' })
  w.skills = [{ name: 'grill-me', source: 'userSettings', tokens: 1 }]
  await $.turn.complete({ reason: 'answer', answer: 'Fertig.', turnId: 't1' } as never)
  await lauf.clock.settle()
  await lauf.clock.settle()
  expect((await zustand($ as never)).skillOffen).toBe('Sorgfalt')
  expect((await wahlIm(ui as never))?.props.options).toEqual(stufe1([{ name: 'Eigene', skills: ['grill-me'] }]))
})

test('scheitert der Start, steht der Skill im Eingabefeld', async ($, on) => {
  const lauf = boden(on, { laeuftNicht: true })
  await start($ as never, lauf)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.select({ key: KNOPF_SKILLS, value: 'k:Eigene' })
  await ui.select({ key: KNOPF_SKILLS, value: 's:grill-me' })
  await lauf.clock.settle()
  expect(lauf.fills).toEqual(['/grill-me'])
  expect(lauf.toasts).toContain('grill-me steht im Eingabefeld: Drück Enter, um zu starten.')
})

for (const plugins of [0, 1, 7, 40]) {
  test(`150 erfundene Skills auf ${plugins} Plugins: das Band zeichnet, Stufe 1 hat höchstens 13 Optionen, jede Stufe 2 höchstens 14`, async ($, on) => {
    const lauf = boden(on, { skills: erfunden(150, plugins) })
    await start($ as never, lauf)
    for (const surface of ['desktop', 'vscode', 'terminal'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      await gepruefterBaum(ui as never, `Band ${surface}, ${plugins} Plugins`)
      if (surface !== 'terminal') {
        const eins = await wahlIm(ui as never)
        expect(eins).toBeDefined()
        expect(eins!.props.options.length).toBeGreaterThan(1)
        expect(eins!.props.options.length).toBeLessThanOrEqual(13)
        for (const option of eins!.props.options.slice(1)) {
          await ui.select({ key: KNOPF_SKILLS, value: option.value })
          const zwei = await wahlIm(ui as never)
          expect(zwei!.props.options.length).toBeGreaterThan(2)
          expect(zwei!.props.options.length).toBeLessThanOrEqual(14)
          expect(zwei!.props.value).toBe('')
          await ui.select({ key: KNOPF_SKILLS, value: ZURUECK })
        }
      }
      await ui.unmount()
    }
  })
}

test('beim Zeichnen werden weder $.session.usage noch $.model.complete aufgerufen', async ($, on) => {
  const lauf = boden(on, { haiku: 'kein JSON' })
  await start($ as never, lauf)
  expect(lauf.usage).toBe(1)
  expect(lauf.haiku).toHaveLength(1)
  for (const surface of ['desktop', 'vscode', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    await gepruefterBaum(ui as never, surface)
    if (surface !== 'terminal') {
      // Stufenwechsel zeichnen das Band neu, laden aber nichts.
      await ui.select({ key: KNOPF_SKILLS, value: 'k:Sorgfalt' })
      await ui.select({ key: KNOPF_SKILLS, value: ZURUECK })
    }
    await ui.unmount()
  }
  expect(lauf.usage).toBe(1)
  expect(lauf.haiku).toHaveLength(1)
})

test('Haiku ordnet die Skills im Hintergrund: Modell haiku, Frist 60 s, Ergebnis in Store und Band', LIEST, async ($, on) => {
  const antwort = '```json\n{"Prüfen": ["sorgfalt:belegen", "sorgfalt:debuggen"], "Planen": ["grill-me"]}\n```'
  const lauf = boden(on, { haiku: antwort })
  await start($ as never, lauf)
  expect(lauf.haiku).toHaveLength(1)
  expect(lauf.haiku[0]!.model).toBe('haiku')
  expect(lauf.haiku[0]!.timeoutMs).toBe(HAIKU_FRIST_MS)
  expect(HAIKU_FRIST_MS).toBe(60_000)
  // Die Beschreibungen aus der Befehlsliste gehen mit.
  expect(lauf.haiku[0]!.prompt).toContain('- sorgfalt:debuggen: Beschreibung von sorgfalt:debuggen')
  const vonHaiku = [
    { name: 'Planen', skills: ['grill-me'] },
    { name: 'Prüfen', skills: ['sorgfalt:belegen', 'sorgfalt:debuggen'] },
    { name: WEITERE, skills: ['Ärger'] },
  ]
  expect((await zustand($ as never)).skillMenue).toEqual(vonHaiku)
  expect(lauf.gespeichert.filter(one => one.key === STORE_KATEGORIEN)).toEqual([{ key: STORE_KATEGORIEN, value: { hash: kategorienHash(ERWARTET), kategorien: vonHaiku } }])
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await wahlIm(ui as never))?.props.options).toEqual(stufe1(vonHaiku))
  // Die nächste Runde fragt Haiku nicht noch einmal; die Kategorien bleiben.
  await $.turn.complete({ reason: 'answer', answer: 'Fertig.', turnId: 't1' } as never)
  await lauf.clock.settle()
  await lauf.clock.settle()
  expect(lauf.haiku).toHaveLength(1)
  expect((await zustand($ as never)).skillMenue).toEqual(vonHaiku)
})

test('ein Haiku-Ergebnis aus dem Store wird ohne neuen Aufruf genutzt', LIEST, async ($, on) => {
  const gespeichert = [
    { name: 'Alles', skills: ['Ärger', 'grill-me', 'sorgfalt:belegen'] },
    { name: 'Rest', skills: ['sorgfalt:debuggen'] },
  ]
  const lauf = boden(on, { haiku: '{}', store: { [STORE_KATEGORIEN]: { hash: kategorienHash(ERWARTET), kategorien: gespeichert } } })
  await start($ as never, lauf)
  expect(lauf.haiku).toEqual([])
  expect((await zustand($ as never)).skillMenue).toEqual(gespeichert)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await wahlIm(ui as never))?.props.options).toEqual(stufe1(gespeichert))
})

test('ein Store-Eintrag für andere Skills zählt nicht: erst nach Plugin, dann Haiku', LIEST, async ($, on) => {
  const lauf = boden(on, { store: { [STORE_KATEGORIEN]: { hash: kategorienHash(['anders']), kategorien: [{ name: 'X', skills: ['anders'] }] } } })
  await start($ as never, lauf)
  expect(lauf.haiku).toHaveLength(1)
  expect((await zustand($ as never)).skillMenue).toEqual(NACH_PLUGIN)
})

test('scheitert Haiku, bleiben die Kategorien nach Plugin, und es wird für diese Skills nicht noch einmal gefragt', LIEST, async ($, on) => {
  // Eigene Skills für diesen Test: ein früherer Versuch derselben Liste in diesem Lauf des Moduls zählt mit.
  const skills = erfunden(9, 3)
  const w: Welt = { skills, haiku: 'Tut mir leid, das kann ich nicht.' }
  const lauf = boden(on, w)
  await start($ as never, lauf)
  const namen = skills.map(skill => `${skill.pluginName}:${skill.name}`).sort((a, b) => a.localeCompare(b, 'de'))
  expect(lauf.haiku).toHaveLength(1)
  expect((await zustand($ as never)).skillMenue).toEqual(nachPlugin(namen).kategorien)
  expect(lauf.gespeichert.filter(one => one.key === STORE_KATEGORIEN)).toEqual([])
  expect(lauf.logs.some(line => line.includes('skill categories'))).toBe(true)
  // Auch keine Antwort zählt als Fehlschlag; die nächsten Runden fragen nicht noch einmal.
  w.haiku = undefined
  for (const turnId of ['t1', 't2']) {
    await $.turn.complete({ reason: 'answer', answer: 'Fertig.', turnId } as never)
    await lauf.clock.settle()
    await lauf.clock.settle()
  }
  expect(lauf.haiku).toHaveLength(1)
  expect((await zustand($ as never)).skillMenue).toEqual(nachPlugin(namen).kategorien)
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
  expect((await wahlIm(ui as never))?.props.options).toEqual(stufe1([{ name: 'Eigene', skills: ['neu'] }]))
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
  expect(lauf.logs.filter(line => line.includes('skill list')).at(-1)).toMatch(/^debug: leitstand: skill list \(turn\.complete\) failed: .*the old list stays$/)
})

test('im Terminal legt 🧩 /skill-menue ins Eingabefeld', async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await gepruefterBaum(terminal as never, 'Band terminal')
  const knopf = (await terminal.find({ type: 'Button', key: KNOPF_SKILLS })) as { props: { label?: string } } | undefined
  expect(knopf?.props.label).toBe(PUZZLE)
  expect(await terminal.find({ type: 'Select', key: KNOPF_SKILLS })).toBeUndefined()
  await terminal.press({ key: KNOPF_SKILLS })
  await lauf.clock.settle()
  expect(lauf.fills).toEqual(['/skill-menue'])
  expect(lauf.opens).toEqual([])
})

test('kein Weg öffnet ein Fenster: weder ein Druck oder eine Wahl noch der Befehl rufen $.ui.open', async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await terminal.press({ key: KNOPF_SKILLS })
  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await desktop.select({ key: KNOPF_SKILLS, value: 'k:Sorgfalt' })
  await desktop.select({ key: KNOPF_SKILLS, value: ZURUECK })
  for (const kind of ['sdk', 'composer', 'bridge'] as const) await menue($ as never, kind)
  await $.command.run({ command: 'skill-menue', args: '', origin: { kind: 'sdk' } } as never)
  await lauf.clock.settle()
  expect(lauf.opens).toEqual([])
})

test('der Befehl antwortet mit den Kategorien als Überschrift und je Skill /name, am Rechner mit dem Hinweis auf 🧩', AUS, async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  const text = textListe(ERWARTET, NACH_PLUGIN)
  expect(text).toBe(['4 Skills in dieser Sitzung:', 'Eigene\n/Ärger\n/grill-me', 'Sorgfalt\n/sorgfalt:belegen\n/sorgfalt:debuggen'].join('\n\n'))
  expect(await menue($ as never, 'sdk')).toBe(`${text}\n\n${AM_RECHNER}`)
  expect(await menue($ as never, 'composer')).toBe(`${text}\n\n${AM_RECHNER}`)
  expect(await menue($ as never, 'bridge')).toBe(text)
  // Die Kurzform antwortet genauso.
  expect(String((await $.command.run({ command: 'skill-menue', args: '', origin: { kind: 'bridge' } } as never)).text)).toBe(text)
  expect(AM_RECHNER).toBe('Am Rechner klappt 🧩 im Band dieselbe Liste auf.')
  // Die Liste kam aus dem Zustand: geladen wurde nur einmal, beim Start.
  expect(lauf.usage).toBe(1)
  expect(lauf.opens).toEqual([])
})

test('ist die Liste noch leer, lädt der Befehl sie einmal selbst', LIEST_AUS, async ($, on) => {
  const w: Welt = { haengt: true }
  const lauf = boden(on, w)
  await start($ as never, lauf)
  w.haengt = false
  expect(await menue($ as never, 'bridge')).toBe(textListe(ERWARTET, NACH_PLUGIN))
  expect(await liste($ as never)).toEqual(ERWARTET)
})

test('ohne Skills antwortet der Befehl nur mit dem Satz, das Menü zeigt nur 🧩, Haiku wird nicht gefragt', async ($, on) => {
  const lauf = boden(on, { skills: [], haiku: '{}' })
  await start($ as never, lauf)
  expect(await menue($ as never, 'bridge')).toBe(OHNE_SKILLS)
  expect(await menue($ as never, 'sdk')).toBe(OHNE_SKILLS)
  expect(OHNE_SKILLS).toBe('In dieser Sitzung sind keine Skills installiert.')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await wahlIm(ui as never))?.props.options).toEqual([{ value: '', label: PUZZLE }])
  expect(lauf.haiku).toEqual([])
})

test('hilfe erklärt den Befehl und lädt nichts', AUS, async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  const vorher = lauf.usage
  const hilfe = await menue($ as never, 'sdk', 'hilfe')
  expect(hilfe).toContain('/leitstand:skill-menue')
  expect(lauf.usage).toBe(vorher)
})
