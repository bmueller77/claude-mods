import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { KNOPF_SKILLS, SKILLS_BEFEHLE } from '../hooks/skills/befehle'
import { WEITERE, kategorienHash, menueHash, menueMasse, nachPlugin } from '../hooks/skills/kategorien'
import {
  AM_RECHNER,
  HAIKU_FRIST_MS,
  HAIKU_MAX_TOKENS,
  LADEFRIST_MS,
  OHNE_SKILLS,
  STORE_KATEGORIEN,
  skillNamen,
  textListe,
} from '../hooks/skills/teil'
import { SELECT_MAX, gepruefterBaum, selectFehler } from './selects'

// Das Skill-Menü als Teil des Leitstands: Die Test-Engine lädt den ganzen Leitstand. Die Tests des Befehls schalten
// seine Ansicht aus (AUS); die Tests des Hover-Menüs zeichnen das Band. Jeder gezeichnete Baum geht durch
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
const HOVER = 'userMessageBackgroundHover'

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
/** Die Beschreibung eines Befehls in der Befehlsliste: zwei Sätze. */
const beschreibung = (name: string) => `Beschreibung von ${name}. Mehr dazu steht im Skill.`
/** Der erste Satz davon: die Kurzbeschreibung, solange Haiku keine gibt. */
const ersterSatzVon = (name: string) => `Beschreibung von ${name}.`
/** Die Kategorien nach Plugin für ERWARTET: ohne Gruppe Eigene, die Namen ohne Plugin in Weitere. */
const NACH_PLUGIN = [
  { name: 'Sorgfalt', skills: ['sorgfalt:belegen', 'sorgfalt:debuggen'] },
  { name: WEITERE, skills: ['Ärger', 'grill-me'] },
]
const RUECKFALL_KURZ = Object.fromEntries(ERWARTET.map(name => [name, ersterSatzVon(name)]))

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
  /** Wie oft $.model.complete gefragt wurde, für welchen Zweck auch immer. */
  modell: number
  /** Die Bitten an Haiku um Kategorien, mit Modell, Frist und Länge. */
  haiku: { model: string; timeoutMs?: number; maxTokens?: number; prompt: string }[]
  /** Was der Leitstand in den Store schrieb. */
  gespeichert: { key: string; value: unknown }[]
  clock: { settle: () => Promise<void>; advance: (ms: number) => Promise<void> }
}

/** Der Boden unter dem Leitstand: was die Engine sonst beantworten würde. `w` darf sich im Test ändern. */
function boden(on: On, w: Welt = {}): Lauf {
  const clock = mock.clock(on, { now: 1_000_000 })
  const lauf: Lauf = { runs: [], toasts: [], fills: [], opens: [], logs: [], usage: 0, modell: 0, haiku: [], gespeichert: [], clock }
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
  on('command.list', () => ({ value: [...BEFEHLE.map(name => ({ name, description: beschreibung(name), source: 'plugin' }))] }) as never)
  on('session.usage', () => {
    lauf.usage++
    if (w.haengt) return new Promise(() => {}) as never
    if (w.scheitert) throw new Error('keine Aufschlüsselung')
    return { value: { startedAt: 0, context: { breakdown: { skills: { skillFrontmatter: w.skills ?? SKILLS } } } } } as never
  })
  on('model.complete', (_$, e) => {
    lauf.modell++
    if (e.prompt.includes('Skills von Claude Code')) lauf.haiku.push({ model: e.model, timeoutMs: e.timeoutMs, maxTokens: e.maxTokens, prompt: e.prompt })
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

type Kategorien = { name: string; skills: string[] }[]
type Zustand = { skillListe: string[] | null; skillMenue: Kategorien | null; skillKurz: Record<string, string> | null }

/** Liest den Zustand des Leitstands aus einem anderen Plugin: /skill-zustand antwortet mit allem des Skill-Menüs. */
const LESER = {
  name: 'skill-leser',
  register(on: On) {
    on('command.run', { command: 'skill-zustand' }, async $ => {
      const wert = (gelesen: unknown) => (gelesen as { value?: unknown }).value ?? null
      const skillListe = wert(await $.state.get({ plugin: 'leitstand', key: 'skillListe' } as never))
      const skillMenue = wert(await $.state.get({ plugin: 'leitstand', key: 'skillMenue' } as never))
      const skillKurz = wert(await $.state.get({ plugin: 'leitstand', key: 'skillKurz' } as never))
      return { text: JSON.stringify({ skillListe, skillMenue, skillKurz }) }
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

/** Ein gezeichneter Knoten, wie das Test-Kit ihn liefert; `hover` steht am Knoten. */
type Knoten = { type?: string; key?: string; props?: Record<string, unknown>; hover?: Record<string, unknown>; children?: unknown[] }
type Gezeichnet = {
  find: (q: { type?: string; key?: string }) => Promise<unknown>
  drawn: () => Promise<unknown>
  press: (q: { key: string }) => Promise<unknown>
  unmount: () => Promise<unknown>
}

const kinder = (knoten: unknown): Knoten[] => ((knoten as Knoten | undefined)?.children ?? []).filter((kind): kind is Knoten => typeof kind === 'object' && kind !== null)
const hoverVon = (knoten: Knoten | undefined) => knoten?.hover ?? (knoten?.props?.hover as Record<string, unknown> | undefined)
/** Aller Text unter einem Knoten. */
const textIn = (knoten: unknown): string => {
  if (typeof knoten === 'string' || typeof knoten === 'number') return String(knoten)
  if (knoten === null || typeof knoten !== 'object') return ''
  return ((knoten as Knoten).children ?? []).map(textIn).join('')
}
/** Alle Keys eines Baums, in der Reihenfolge des Zeichnens. */
const keysIn = (knoten: unknown): string[] => {
  if (Array.isArray(knoten)) return knoten.flatMap(keysIn)
  if (knoten === null || typeof knoten !== 'object') return []
  const { props, children } = knoten as Knoten
  const key = props?.key
  return [...(typeof key === 'string' ? [key] : []), ...keysIn(children ?? [])]
}

/** Das Hover-Menü im Band der App, wie es gezeichnet ist: der Baum geprüft, die Teile ausgelesen. */
async function hoverMenue(ui: Gezeichnet) {
  const baum = await gepruefterBaum(ui, 'Band')
  const menueBox = (await ui.find({ key: KNOPF_SKILLS })) as Knoten | undefined
  const [knopf, karte] = kinder(menueBox)
  const [reihe] = kinder(karte)
  const [links, rechts] = kinder(reihe)
  const kategorien = kinder(links)
  const spalten = kinder(rechts)
  return { baum, menueBox, knopf, karte, reihe, links, rechts, kategorien, spalten }
}

/** Die Kategorien, wie das Menü sie zeigt: je Kategorie ihr Label und je Skill Label und Tooltip. */
async function gezeigt(ui: Gezeichnet) {
  const { kategorien, spalten } = await hoverMenue(ui)
  return kategorien.map((kategorie, i) => ({
    label: String(kinder(kategorie)[0]?.props?.label),
    skills: kinder(spalten[i]).map(skillBox => {
      const [knopf, tipp] = kinder(skillBox)
      return { label: String(knopf?.props?.label), tipp: tipp === undefined ? null : textIn(tipp) }
    }),
  }))
}

/** Was das Menü für diese Kategorien und Kurzbeschreibungen zeigen soll. */
const erwartet = (kategorien: Kategorien, kurz: Record<string, string>) =>
  kategorien.map(kategorie => ({
    label: `${kategorie.name} ›`,
    skills: kategorie.skills.map(skill => ({ label: skill.includes(':') ? skill.slice(skill.indexOf(':') + 1) : skill, tipp: kurz[skill] ?? null })),
  }))

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

test('am Rechner steht hinter 🧹 das Hover-Menü 🧩: verstecktes Popover, Kategorien als Hover-Gruppen, Spalten, Skills mit Tooltip; kein Select, kein Fenster', async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  for (const surface of ['desktop', 'vscode'] as const) {
    const ui = (await $.ui.mount({ ...BAND, surface })) as unknown as Gezeichnet
    const { baum, menueBox, knopf, karte, reihe, links, rechts, kategorien, spalten } = await hoverMenue(ui)
    expect(menueBox?.type).toBe('Box')
    expect(knopf?.type).toBe('Button')
    expect(knopf?.props?.label).toBe(PUZZLE)
    expect(knopf?.props?.variant).toBe('secondary')
    // Das Popover: absolut, versteckt, beim Darüberfahren sichtbar; ohne eigenen Rahmen.
    expect(karte?.props?.position).toBe('absolute')
    expect(karte?.props?.display).toBe('none')
    expect(hoverVon(karte)).toEqual({ display: 'flex' })
    expect(karte?.props?.borderStyle).toBeUndefined()
    expect(reihe?.props?.flexDirection).toBe('row')
    expect(reihe?.props?.columnGap).toBe(0)
    expect(links?.props?.flexDirection).toBe('column')
    expect(links?.props?.rowGap).toBe(0)
    // Links die Kategorien: je eine Hover-Gruppe mit Hintergrund, sonst leuchtet sie nie.
    expect(kategorien.map(kategorie => kinder(kategorie)[0]?.props?.label)).toEqual(['Sorgfalt ›', 'Weitere ›'])
    kategorien.forEach((kategorie, i) => {
      expect(hoverVon(kategorie)).toEqual({ scope: `${KNOPF_SKILLS}-g-${i}`, backgroundColor: HOVER })
      expect(kategorie.props?.paddingY).toBe(0.6)
      expect(kategorie.props?.paddingRight).toBe(1)
    })
    // Rechts je Kategorie eine versteckte Spalte derselben Gruppe, so breit und hoch wie die größte.
    const masse = menueMasse(NACH_PLUGIN)
    expect(rechts?.props?.flexDirection).toBe('row')
    expect(rechts?.props?.width).toBe(masse.breite)
    expect(rechts?.props?.minHeight).toBe(masse.hoehe)
    expect(spalten).toHaveLength(2)
    spalten.forEach((spalte, i) => {
      expect(spalte.props?.display).toBe('none')
      expect(hoverVon(spalte)).toEqual({ scope: `${KNOPF_SKILLS}-g-${i}`, display: 'flex' })
      expect(spalte.props?.flexDirection).toBe('column')
      expect(spalte.props?.rowGap).toBe(1.2)
      expect(spalte.props?.flexGrow).toBe(1)
      expect(spalte.props?.paddingLeft).toBe(1)
      kinder(spalte).forEach((skillBox, j) => {
        expect(skillBox.props?.key).toBe(`${KNOPF_SKILLS}-s-${i}-${j}`)
        const [skillKnopf, tipp] = kinder(skillBox)
        expect(skillKnopf?.type).toBe('Button')
        expect(tipp?.props?.position).toBe('absolute')
        expect(tipp?.props?.display).toBe('none')
        expect(hoverVon(tipp)).toEqual({ display: 'flex' })
        expect(kinder(tipp)[0]?.type).toBe('Text')
        expect(kinder(tipp)[0]?.props?.wrap).toBe('wrap')
      })
    })
    // Labels ohne den Teil vor dem Doppelpunkt, nie gekürzt; der Tooltip ist der erste Satz der Beschreibung.
    expect(await gezeigt(ui)).toEqual(erwartet(NACH_PLUGIN, RUECKFALL_KURZ))
    // Jeder Key im Band nur einmal, kein Select im Menü und keins in der Button-Zeile.
    const keys = keysIn(baum)
    expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([])
    expect(JSON.stringify(menueBox)).not.toContain('"type":"Select"')
    expect(await ui.find({ type: 'Select', key: KNOPF_SKILLS })).toBeUndefined()
    const actions = JSON.stringify((await (ui as unknown as { findAll: (q: { type: string }) => Promise<Knoten[]> }).findAll({ type: 'Box' })).find(one => one.props?.key === 'actions') ?? null)
    expect(actions).not.toContain('"type":"Select"')
    expect(actions.indexOf('"key":"cleancode"')).toBeGreaterThan(-1)
    expect(actions.indexOf(`"key":"${KNOPF_SKILLS}"`)).toBeGreaterThan(actions.indexOf('"key":"cleancode"'))
    await ui.unmount()
  }
  expect(lauf.opens).toEqual([])
})

test('ein Klick auf einen Skill startet ihn mit vollem Namen; 🧩 und die Kategorien starten nichts', async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  const ui = (await $.ui.mount({ ...BAND, surface: 'desktop' })) as unknown as Gezeichnet
  await gepruefterBaum(ui, 'Band')
  await ui.press({ key: `${KNOPF_SKILLS}-knopf` })
  await ui.press({ key: `${KNOPF_SKILLS}-k-0` })
  await lauf.clock.settle()
  expect(lauf.runs).toEqual([])
  expect(lauf.fills).toEqual([])
  await ui.press({ key: `${KNOPF_SKILLS}-b-0-1` })
  await lauf.clock.settle()
  expect(lauf.runs).toEqual(['sorgfalt:debuggen'])
  await ui.press({ key: `${KNOPF_SKILLS}-b-1-1` })
  await lauf.clock.settle()
  expect(lauf.runs).toEqual(['sorgfalt:debuggen', 'grill-me'])
  expect(lauf.fills).toEqual([])
  expect(lauf.opens).toEqual([])
  // Das Menü bleibt danach, wie es war.
  expect(await gezeigt(ui)).toEqual(erwartet(NACH_PLUGIN, RUECKFALL_KURZ))
})

test('scheitert der Start, steht der Skill im Eingabefeld', async ($, on) => {
  const lauf = boden(on, { laeuftNicht: true })
  await start($ as never, lauf)
  const ui = (await $.ui.mount({ ...BAND, surface: 'desktop' })) as unknown as Gezeichnet
  await ui.press({ key: `${KNOPF_SKILLS}-b-1-1` })
  await lauf.clock.settle()
  expect(lauf.fills).toEqual(['/grill-me'])
  expect(lauf.toasts).toContain('grill-me steht im Eingabefeld: Drück Enter, um zu starten.')
})

for (const plugins of [0, 1, 7, 40]) {
  test(`150 erfundene Skills auf ${plugins} Plugins: das Band zeichnet, höchstens 12 Kategorien zu je höchstens 12 Skills, Keys eindeutig`, async ($, on) => {
    const lauf = boden(on, { skills: erfunden(150, plugins) })
    await start($ as never, lauf)
    for (const surface of ['desktop', 'vscode', 'terminal'] as const) {
      const ui = (await $.ui.mount({ ...BAND, surface })) as unknown as Gezeichnet
      const baum = await gepruefterBaum(ui, `Band ${surface}, ${plugins} Plugins`)
      const keys = keysIn(baum)
      expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([])
      if (surface !== 'terminal') {
        const { kategorien, spalten } = await hoverMenue(ui)
        expect(kategorien.length).toBeGreaterThan(0)
        expect(kategorien.length).toBeLessThanOrEqual(12)
        expect(spalten).toHaveLength(kategorien.length)
        for (const spalte of spalten) {
          expect(kinder(spalte).length).toBeGreaterThan(0)
          expect(kinder(spalte).length).toBeLessThanOrEqual(12)
          for (const skillBox of kinder(spalte)) expect(String(kinder(skillBox)[0]?.props?.label)).toMatch(/^skill-\d{3}$/)
        }
      } else {
        expect(((await ui.find({ type: 'Button', key: KNOPF_SKILLS })) as Knoten | undefined)?.props?.label).toBe(PUZZLE)
      }
      await ui.unmount()
    }
  })
}

test('beim Zeichnen werden weder $.session.usage noch $.model.complete noch $.ui.open aufgerufen', async ($, on) => {
  const lauf = boden(on, { haiku: 'kein JSON' })
  await start($ as never, lauf)
  expect(lauf.usage).toBe(1)
  expect(lauf.haiku).toHaveLength(1)
  const modell = lauf.modell
  for (const surface of ['desktop', 'vscode', 'terminal'] as const) {
    const ui = (await $.ui.mount({ ...BAND, surface })) as unknown as Gezeichnet
    await gepruefterBaum(ui, surface)
    await gepruefterBaum(ui, surface)
    await ui.unmount()
  }
  expect(lauf.usage).toBe(1)
  expect(lauf.modell).toBe(modell)
  expect(lauf.opens).toEqual([])
})

const VON_HAIKU = [
  { name: 'Planen', skills: ['grill-me'] },
  { name: 'Prüfen', skills: ['sorgfalt:belegen', 'sorgfalt:debuggen'] },
  { name: WEITERE, skills: ['Ärger'] },
]
const HAIKU_KURZ = { 'grill-me': 'Fragt dich zu einem Plan aus.', 'sorgfalt:belegen': 'Belegt eine Aussage, bevor du sie meldest.' }

test('Haiku ordnet die Skills und schreibt Kurzbeschreibungen: Modell haiku, 8192 Tokens, Frist 60 s, Ergebnis in Store und Band', LIEST, async ($, on) => {
  const antwort = `\`\`\`json\n${JSON.stringify({ kategorien: { 'Prüfen': ['sorgfalt:belegen', 'sorgfalt:debuggen'], Planen: ['grill-me'] }, kurz: HAIKU_KURZ })}\n\`\`\``
  const lauf = boden(on, { haiku: antwort })
  await start($ as never, lauf)
  expect(lauf.haiku).toHaveLength(1)
  expect(lauf.haiku[0]!.model).toBe('haiku')
  expect(lauf.haiku[0]!.timeoutMs).toBe(HAIKU_FRIST_MS)
  expect(HAIKU_FRIST_MS).toBe(60_000)
  expect(lauf.haiku[0]!.maxTokens).toBe(HAIKU_MAX_TOKENS)
  expect(HAIKU_MAX_TOKENS).toBe(8192)
  // Die Beschreibungen aus der Befehlsliste gehen mit.
  expect(lauf.haiku[0]!.prompt).toContain(`- sorgfalt:debuggen: ${beschreibung('sorgfalt:debuggen')}`)
  expect(lauf.haiku[0]!.prompt).toContain('"kurz"')
  // Was Haiku nicht beschreibt, behält seinen ersten Satz.
  const kurz = { ...RUECKFALL_KURZ, ...HAIKU_KURZ }
  expect(await zustand($ as never)).toEqual({ skillListe: ERWARTET, skillMenue: VON_HAIKU, skillKurz: kurz })
  expect(lauf.gespeichert.filter(one => one.key === STORE_KATEGORIEN)).toEqual([
    { key: STORE_KATEGORIEN, value: { hash: menueHash(ERWARTET), kategorien: VON_HAIKU, kurz: HAIKU_KURZ } },
  ])
  const ui = (await $.ui.mount({ ...BAND, surface: 'desktop' })) as unknown as Gezeichnet
  expect(await gezeigt(ui)).toEqual(erwartet(VON_HAIKU, kurz))
  // Die nächste Runde fragt Haiku nicht noch einmal; Kategorien und Kurzbeschreibungen bleiben.
  await $.turn.complete({ reason: 'answer', answer: 'Fertig.', turnId: 't1' } as never)
  await lauf.clock.settle()
  await lauf.clock.settle()
  expect(lauf.haiku).toHaveLength(1)
  expect((await zustand($ as never)).skillMenue).toEqual(VON_HAIKU)
  expect((await zustand($ as never)).skillKurz).toEqual(kurz)
})

test('ein Haiku-Ergebnis aus dem Store wird ohne neuen Aufruf genutzt, mit seinen Kurzbeschreibungen', LIEST, async ($, on) => {
  const gespeichert = [
    { name: 'Alles', skills: ['Ärger', 'grill-me', 'sorgfalt:belegen'] },
    { name: 'Rest', skills: ['sorgfalt:debuggen'] },
  ]
  const lauf = boden(on, { haiku: '{}', store: { [STORE_KATEGORIEN]: { hash: menueHash(ERWARTET), kategorien: gespeichert, kurz: HAIKU_KURZ } } })
  await start($ as never, lauf)
  expect(lauf.haiku).toEqual([])
  expect((await zustand($ as never)).skillMenue).toEqual(gespeichert)
  expect((await zustand($ as never)).skillKurz).toEqual({ ...RUECKFALL_KURZ, ...HAIKU_KURZ })
  const ui = (await $.ui.mount({ ...BAND, surface: 'desktop' })) as unknown as Gezeichnet
  expect(await gezeigt(ui)).toEqual(erwartet(gespeichert, { ...RUECKFALL_KURZ, ...HAIKU_KURZ }))
})

test('ein Ergebnis nach dem alten Prompt zählt nicht: Haiku wird neu gefragt, danach gilt der Speicher', LIEST, async ($, on) => {
  const alt = { hash: kategorienHash(ERWARTET), kategorien: [{ name: 'Alles', skills: [...ERWARTET] }] }
  const antwort = JSON.stringify({ kategorien: { 'Prüfen': ['sorgfalt:belegen', 'sorgfalt:debuggen'], Planen: ['grill-me'] }, kurz: HAIKU_KURZ })
  const lauf = boden(on, { haiku: antwort, store: { [STORE_KATEGORIEN]: alt } })
  await start($ as never, lauf)
  expect(lauf.haiku).toHaveLength(1)
  expect((await zustand($ as never)).skillMenue).toEqual(VON_HAIKU)
  expect(lauf.gespeichert.filter(one => one.key === STORE_KATEGORIEN).map(one => (one.value as { hash: string }).hash)).toEqual([menueHash(ERWARTET)])
})

test('ein Store-Eintrag für andere Skills zählt nicht: erst nach Plugin, dann Haiku', LIEST, async ($, on) => {
  const lauf = boden(on, { store: { [STORE_KATEGORIEN]: { hash: menueHash(['anders']), kategorien: [{ name: 'X', skills: ['anders'] }] } } })
  await start($ as never, lauf)
  expect(lauf.haiku).toHaveLength(1)
  expect((await zustand($ as never)).skillMenue).toEqual(NACH_PLUGIN)
})

test('scheitert Haiku, bleibt der Rückfall (ohne Eigene, erster Satz als Tooltip), und es wird für diese Skills nicht noch einmal gefragt', LIEST, async ($, on) => {
  const w: Welt = { haiku: 'Tut mir leid, das kann ich nicht.' }
  const lauf = boden(on, w)
  await start($ as never, lauf)
  expect(lauf.haiku).toHaveLength(1)
  expect(await zustand($ as never)).toEqual({ skillListe: ERWARTET, skillMenue: NACH_PLUGIN, skillKurz: RUECKFALL_KURZ })
  expect(lauf.gespeichert.filter(one => one.key === STORE_KATEGORIEN)).toEqual([])
  expect(lauf.logs.some(line => line.startsWith('debug: leitstand: skill categories'))).toBe(true)
  const ui = (await $.ui.mount({ ...BAND, surface: 'desktop' })) as unknown as Gezeichnet
  const menue = await gezeigt(ui)
  expect(menue.map(kategorie => kategorie.label)).not.toContain('Eigene ›')
  expect(menue).toEqual(erwartet(NACH_PLUGIN, RUECKFALL_KURZ))
  // Auch keine Antwort zählt als Fehlschlag; die nächsten Runden fragen nicht noch einmal.
  w.haiku = undefined
  for (const turnId of ['t1', 't2']) {
    await $.turn.complete({ reason: 'answer', answer: 'Fertig.', turnId } as never)
    await lauf.clock.settle()
    await lauf.clock.settle()
  }
  expect(lauf.haiku).toHaveLength(1)
  expect((await zustand($ as never)).skillMenue).toEqual(NACH_PLUGIN)
})

test('ohne Beschreibung hat ein Skill keinen Tooltip', async ($, on) => {
  const lauf = boden(on, { skills: [{ name: 'stumm', source: 'userSettings', tokens: 1 }] })
  await start($ as never, lauf)
  const ui = (await $.ui.mount({ ...BAND, surface: 'desktop' })) as unknown as Gezeichnet
  expect(await gezeigt(ui)).toEqual([{ label: 'Weitere ›', skills: [{ label: 'stumm', tipp: null }] }])
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
  const ui = (await $.ui.mount({ ...BAND, surface: 'desktop' })) as unknown as Gezeichnet
  expect(await gezeigt(ui)).toEqual([{ label: 'Weitere ›', skills: [{ label: 'neu', tipp: null }] }])
})

test('antwortet die Aufschlüsselung nie, bleibt die alte Liste, das Band zeichnet 🧩 als Button, nach 10 s eine Zeile im Debug-Log', LIEST, async ($, on) => {
  const w: Welt = { haengt: true }
  const lauf = boden(on, w)
  await start($ as never, lauf)
  expect(await liste($ as never)).toBeNull()
  const ui = (await $.ui.mount({ ...BAND, surface: 'desktop' })) as unknown as Gezeichnet
  await gepruefterBaum(ui, 'Band')
  // Ohne Liste ist 🧩 ein Button, der /skill-menue ins Eingabefeld legt.
  const knopf = (await ui.find({ type: 'Button', key: KNOPF_SKILLS })) as Knoten | undefined
  expect(knopf?.props?.label).toBe(PUZZLE)
  expect(await ui.find({ key: `${KNOPF_SKILLS}-knopf` })).toBeUndefined()
  await ui.press({ key: KNOPF_SKILLS })
  await lauf.clock.settle()
  expect(lauf.fills).toEqual(['/skill-menue'])
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
  const terminal = (await $.ui.mount({ ...BAND, surface: 'terminal' })) as unknown as Gezeichnet
  await gepruefterBaum(terminal, 'Band terminal')
  const knopf = (await terminal.find({ type: 'Button', key: KNOPF_SKILLS })) as Knoten | undefined
  expect(knopf?.props?.label).toBe(PUZZLE)
  expect(await terminal.find({ type: 'Select', key: KNOPF_SKILLS })).toBeUndefined()
  expect(await terminal.find({ key: `${KNOPF_SKILLS}-knopf` })).toBeUndefined()
  await terminal.press({ key: KNOPF_SKILLS })
  await lauf.clock.settle()
  expect(lauf.fills).toEqual(['/skill-menue'])
  expect(lauf.opens).toEqual([])
})

test('kein Weg öffnet ein Fenster: weder ein Druck noch ein Klick im Menü noch der Befehl rufen $.ui.open', async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  const terminal = (await $.ui.mount({ ...BAND, surface: 'terminal' })) as unknown as Gezeichnet
  await terminal.press({ key: KNOPF_SKILLS })
  const desktop = (await $.ui.mount({ ...BAND, surface: 'desktop' })) as unknown as Gezeichnet
  await desktop.press({ key: `${KNOPF_SKILLS}-knopf` })
  await desktop.press({ key: `${KNOPF_SKILLS}-b-0-0` })
  for (const kind of ['sdk', 'composer', 'bridge'] as const) await menue($ as never, kind)
  await $.command.run({ command: 'skill-menue', args: '', origin: { kind: 'sdk' } } as never)
  await lauf.clock.settle()
  expect(lauf.opens).toEqual([])
})

test('der Befehl antwortet mit den Kategorien als Überschrift und je Skill /name: Kurzbeschreibung, am Rechner mit dem Hinweis auf 🧩', AUS, async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  const text = textListe(ERWARTET, NACH_PLUGIN, RUECKFALL_KURZ)
  expect(text).toBe(
    [
      '4 Skills in dieser Sitzung:',
      `Sorgfalt\n/sorgfalt:belegen: ${ersterSatzVon('sorgfalt:belegen')}\n/sorgfalt:debuggen: ${ersterSatzVon('sorgfalt:debuggen')}`,
      `Weitere\n/Ärger: ${ersterSatzVon('Ärger')}\n/grill-me: ${ersterSatzVon('grill-me')}`,
    ].join('\n\n'),
  )
  expect(await menue($ as never, 'sdk')).toBe(`${text}\n\n${AM_RECHNER}`)
  expect(await menue($ as never, 'composer')).toBe(`${text}\n\n${AM_RECHNER}`)
  expect(await menue($ as never, 'bridge')).toBe(text)
  // Die Kurzform antwortet genauso.
  expect(String((await $.command.run({ command: 'skill-menue', args: '', origin: { kind: 'bridge' } } as never)).text)).toBe(text)
  expect(AM_RECHNER).toBe('Am Rechner zeigt 🧩 dieselbe Liste, wenn du mit der Maus darüberfährst.')
  // Die Liste kam aus dem Zustand: geladen wurde nur einmal, beim Start.
  expect(lauf.usage).toBe(1)
  expect(lauf.opens).toEqual([])
})

test('ist das Menü zu breit, wird nichts gekürzt: eine Zeile im Debug-Log und im Befehl "Passt nicht in das Menü"', AUS, async ($, on) => {
  const lang = 'ein-sehr-langer-skill-name-der-nicht-passt'
  const lauf = boden(on, { skills: [{ name: lang, pluginName: 'x', source: 'plugin', tokens: 1 }] })
  await start($ as never, lauf)
  expect(lauf.logs.filter(line => line.includes('skill menu: about'))).toEqual([expect.stringMatching(new RegExp(`^debug: leitstand: skill menu: about \\d+ px wide, the popover holds about 340 px; too wide: x:${lang}$`))])
  const text = await menue($ as never, 'bridge')
  expect(text).toContain(`Passt nicht in das Menü\nDas Menü wäre etwa `)
  expect(text.split('\n').at(-1)).toBe(`/x:${lang}`)
})

test('ist die Liste noch leer, lädt der Befehl sie einmal selbst', LIEST_AUS, async ($, on) => {
  const w: Welt = { haengt: true }
  const lauf = boden(on, w)
  await start($ as never, lauf)
  w.haengt = false
  expect(await menue($ as never, 'bridge')).toBe(textListe(ERWARTET, NACH_PLUGIN, RUECKFALL_KURZ))
  expect(await liste($ as never)).toEqual(ERWARTET)
})

test('ohne Skills antwortet der Befehl nur mit dem Satz, 🧩 ist ein Button, Haiku wird nicht gefragt', async ($, on) => {
  const lauf = boden(on, { skills: [], haiku: '{}' })
  await start($ as never, lauf)
  expect(await menue($ as never, 'bridge')).toBe(OHNE_SKILLS)
  expect(await menue($ as never, 'sdk')).toBe(OHNE_SKILLS)
  expect(OHNE_SKILLS).toBe('In dieser Sitzung sind keine Skills installiert.')
  const ui = (await $.ui.mount({ ...BAND, surface: 'desktop' })) as unknown as Gezeichnet
  await gepruefterBaum(ui, 'Band')
  expect(((await ui.find({ type: 'Button', key: KNOPF_SKILLS })) as Knoten | undefined)?.props?.label).toBe(PUZZLE)
  expect(lauf.haiku).toEqual([])
  // nachPlugin bleibt ohne Skills leer.
  expect(nachPlugin([]).kategorien).toEqual([])
})

test('hilfe erklärt den Befehl und lädt nichts', AUS, async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  const vorher = lauf.usage
  const hilfe = await menue($ as never, 'sdk', 'hilfe')
  expect(hilfe).toContain('/leitstand:skill-menue')
  expect(lauf.usage).toBe(vorher)
})
