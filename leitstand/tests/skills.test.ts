import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { KNOPF_SKILLS, SKILLS_BEFEHLE } from '../hooks/skills/befehle'
import { kategorienHash, menueHash, nachPlugin } from '../hooks/skills/kategorien'
import {
  FENSTER,
  HAIKU_EFFORT,
  HAIKU_FRIST_MS,
  HAIKU_MAX_TOKENS,
  IM_FENSTER,
  KURZ_MAX_TOKENS,
  LADEFRIST_MS,
  OHNE_SKILLS,
  STORE_KATEGORIEN,
  TITEL,
  VORLAEUFIG,
  WARTEN,
  kopfzeile,
  skillNamen,
  textListe,
} from '../hooks/skills/teil'
import { SELECT_MAX, gepruefterBaum, selectFehler } from './selects'

// Das Skill-Menü als Teil des Leitstands: Die Test-Engine lädt den ganzen Leitstand. 🧩 im Band öffnet das Fenster
// Skills; darin je Kategorie eine Überschrift und je Skill ein Button mit Kurzbeschreibung. Haiku sortiert im
// Hintergrund (Logik aus dem Probe-Mod skill-probe). Jeder gezeichnete Baum geht durch gepruefterBaum: kein Select mit
// 0 oder mehr als 64 Optionen, kein Wert doppelt.

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
const paneProps = { title: TITEL, isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as never
const PANE = { plugin: 'leitstand', component: 'Pane', requestId: FENSTER, props: paneProps } as const
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
/** Die Beschreibung eines Befehls in der Befehlsliste: zwei Sätze. */
const beschreibung = (name: string) => `Beschreibung von ${name}. Mehr dazu steht im Skill.`
/** Der erste Satz davon: die Kurzbeschreibung, solange Haiku keine gibt. */
const ersterSatzVon = (name: string) => `Beschreibung von ${name}.`
const RUECKFALL_KURZ = Object.fromEntries(ERWARTET.map(name => [name, ersterSatzVon(name)]))

/** Haikus Hauptantwort: Ärger steht in einer Sammelkategorie, kommt also in die Nachfrage. */
const HAUPT = JSON.stringify({ kategorien: { 'Fehler finden': ['sorgfalt:debuggen', 'sorgfalt:belegen'], 'Fragen stellen': ['grill-me'], Sonstiges: ['Ärger'] } })
/** Die Nachfrage ordnet Ärger ein. */
const NACHTRAG = JSON.stringify({ zuordnung: { 'Ärger': 'Fragen stellen' } })
const VON_HAIKU = [
  { name: 'Fehler finden', skills: ['sorgfalt:belegen', 'sorgfalt:debuggen'] },
  { name: 'Fragen stellen', skills: ['Ärger', 'grill-me'] },
]
const kurzVon = (name: string) => `Kurz zu ${name}.`
const HAIKU_KURZ = Object.fromEntries(ERWARTET.map(name => [name, kurzVon(name)]))
/** Ein Päckchen Kurzbeschreibungen: zu jedem Skill "Kurz zu <name>.". */
const alleKurz = (skills: readonly string[]): string => JSON.stringify({ kurz: Object.fromEntries(skills.map(s => [s, kurzVon(s)])) })

/** Erfundene Skills: `n` Stück, auf `plugins` Plugins verteilt (0: alle ohne Plugin). */
const erfunden = (n: number, plugins: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `skill-${String(i).padStart(3, '0')}`, ...(plugins > 0 ? { pluginName: `plugin-${i % plugins}` } : {}), source: 'plugin', tokens: 1 }))

/** Was Haiku antwortet: ein Text, keine Antwort (Zeitablauf), oder der Aufruf wirft. Ohne Angabe: leere Antwort. */
type Antwort = string | 'aborted' | 'wirft'
type Art = 'haupt' | 'nachtrag' | 'kurz'

type Welt = {
  skills?: readonly object[]
  /** Die Kontext-Aufschlüsselung antwortet nie. */
  haengt?: boolean
  /** Die Kontext-Aufschlüsselung scheitert. */
  scheitert?: boolean
  laeuftNicht?: boolean
  haupt?: Antwort
  nachtrag?: Antwort
  /** Antwort auf das i-te Päckchen Kurzbeschreibungen (ab 0, über alle Aufrufe gezählt); ohne: alle bekommen eine. */
  kurz?: (skills: string[], i: number) => Antwort
  /** Hält jede Antwort von Haiku an, bis der Test es freigibt. */
  tor?: Promise<void>
  /** Was im Store des Leitstands schon steht. */
  store?: Record<string, unknown>
  /** Ob eine Oberfläche das Fenster zeigt (die Antwort von $.ui.open); ohne Angabe ja. */
  platziert?: boolean
  /** $.ui.open antwortet nie. */
  oeffnenHaengt?: boolean
}
type Aufruf = { art: Art; model: string; effort?: unknown; timeoutMs?: number; maxTokens?: number; prompt: string }
type Lauf = {
  runs: string[]
  toasts: string[]
  fills: string[]
  opens: { id: string; title?: string; focus?: boolean }[]
  closes: string[]
  logs: string[]
  /** Wie oft $.session.usage gefragt wurde. */
  usage: number
  /** Jeder Aufruf von $.model.complete. */
  haiku: Aufruf[]
  /** Was der Leitstand in den Store schrieb. */
  gespeichert: { key: string; value: unknown }[]
  clock: { settle: () => Promise<void>; advance: (ms: number) => Promise<void> }
}

/** Die Skills aus dem Abschnitt "Skills:" eines Prompts. */
const skillsAus = (prompt: string): string[] =>
  prompt
    .slice(prompt.indexOf('Skills:\n') + 8)
    .split('\n')
    .filter(z => z.startsWith('- '))
    .map(z => z.slice(2).split(': ')[0] as string)

const artVon = (prompt: string): Art =>
  prompt.includes('Schreib zu jedem dieser Skills') ? 'kurz' : prompt.includes('vorhandenen Kategorien') ? 'nachtrag' : 'haupt'

/** Der Boden unter dem Leitstand: was die Engine sonst beantworten würde. `w` darf sich im Test ändern. */
function boden(on: On, w: Welt = {}): Lauf {
  const clock = mock.clock(on, { now: 1_000_000 })
  const lauf: Lauf = { runs: [], toasts: [], fills: [], opens: [], closes: [], logs: [], usage: 0, haiku: [], gespeichert: [], clock }
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
  let paeckchenNr = 0
  on('model.complete', async (_$, e) => {
    const art = artVon(e.prompt)
    lauf.haiku.push({ art, model: e.model, effort: (e as { effort?: unknown }).effort, timeoutMs: e.timeoutMs, maxTokens: e.maxTokens, prompt: e.prompt })
    const nr = art === 'kurz' ? paeckchenNr++ : 0
    if (w.tor !== undefined) await w.tor
    const antwort = art === 'kurz' ? (w.kurz ?? alleKurz)(skillsAus(e.prompt), nr) : art === 'nachtrag' ? (w.nachtrag ?? NACHTRAG) : w.haupt
    if (antwort === 'wirft') throw new Error('kaputt im Test')
    const usage = { input_tokens: 1000, output_tokens: 500 }
    if (antwort === undefined) return { value: { isAnswered: false, reason: 'empty-reply', usage } } as never
    if (antwort === 'aborted') return { value: { isAnswered: false, reason: 'aborted', usage } } as never
    return { value: { isAnswered: true, text: antwort, usage } } as never
  })
  on('ui.open', (_$, e) => {
    const { id, title, focus } = e as { id: string; title?: string; focus?: boolean }
    lauf.opens.push({ id, title, focus })
    if (w.oeffnenHaengt) return new Promise(() => {}) as never
    return { value: { isPlaced: w.platziert ?? true } } as never
  })
  on('ui.close', (_$, e) => {
    lauf.closes.push(String((e as { id?: unknown }).id))
    return { value: undefined } as never
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
type Zustand = { skillListe: string[] | null; skillMenue: Kategorien | null; skillKurz: Record<string, string> | null; skillVorlaeufig: boolean | null }

/** Liest den Zustand des Leitstands aus einem anderen Plugin: /skill-zustand antwortet mit allem des Skill-Menüs. */
const LESER = {
  name: 'skill-leser',
  register(on: On) {
    on('command.run', { command: 'skill-zustand' }, async $ => {
      const wert = (gelesen: unknown) => (gelesen as { value?: unknown }).value ?? null
      const skillListe = wert(await $.state.get({ plugin: 'leitstand', key: 'skillListe' } as never))
      const skillMenue = wert(await $.state.get({ plugin: 'leitstand', key: 'skillMenue' } as never))
      const skillKurz = wert(await $.state.get({ plugin: 'leitstand', key: 'skillKurz' } as never))
      // Nie geschrieben heißt: der Anfangswert des Atoms, false.
      const skillVorlaeufig = wert(await $.state.get({ plugin: 'leitstand', key: 'skillVorlaeufig' } as never)) ?? false
      return { text: JSON.stringify({ skillListe, skillMenue, skillKurz, skillVorlaeufig }) }
    })
  },
}
const LIEST = { plugins: [LESER] }
const LIEST_AUS = { ...AUS, plugins: [LESER] }

async function zustand($: Test$): Promise<Zustand> {
  return JSON.parse(String((await $.command.run({ command: 'skill-zustand', args: '' } as never)).text))
}

/** Startet die Sitzung und lässt das Laden der Liste und Haikus Arbeit laufen, die der Teil danach anstößt. */
async function start($: Test$, lauf: Lauf) {
  await $.session.start({ cwd: '/projekt', surface: 'desktop', isInteractive: true } as never)
  await lauf.clock.settle()
  await lauf.clock.settle()
}

/** Beendet eine Runde der Hauptschleife und lässt das Laden danach laufen. */
async function runde($: Test$, lauf: Lauf, turnId: string) {
  await $.turn.complete({ reason: 'answer', answer: 'Fertig.', turnId } as never)
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
type Knoten = { type?: string; props?: Record<string, unknown>; hover?: Record<string, unknown>; children?: unknown[] }
type Gezeichnet = {
  find: (q: { type?: string; key?: string }) => Promise<unknown>
  drawn: () => Promise<unknown>
  press: (q: { key: string }) => Promise<unknown>
  unmount: () => Promise<unknown>
}
type Mount = { ui: { mount: (q: unknown) => Promise<unknown> } }

const kinder = (knoten: unknown): Knoten[] => ((knoten as Knoten | undefined)?.children ?? []).filter((kind): kind is Knoten => typeof kind === 'object' && kind !== null)
/** Aller Text unter einem Knoten. */
const textIn = (knoten: unknown): string => {
  if (typeof knoten === 'string' || typeof knoten === 'number') return String(knoten)
  if (knoten === null || typeof knoten !== 'object') return ''
  return ((knoten as Knoten).children ?? []).map(textIn).join('')
}
/** Alle Knoten eines Baums, in der Reihenfolge des Zeichnens. */
const alleKnoten = (knoten: unknown): Knoten[] => {
  if (Array.isArray(knoten)) return knoten.flatMap(alleKnoten)
  if (knoten === null || typeof knoten !== 'object') return []
  return [knoten as Knoten, ...alleKnoten((knoten as Knoten).children ?? [])]
}
/** Alle Keys eines Baums, in der Reihenfolge des Zeichnens. */
const keysIn = (baum: unknown): string[] => alleKnoten(baum).flatMap(k => (typeof k.props?.key === 'string' ? [k.props.key] : []))

async function mountPane($: Test$, surface: 'desktop' | 'terminal' | 'vscode' = 'desktop'): Promise<Gezeichnet> {
  return (await ($ as unknown as Mount).ui.mount({ ...PANE, surface })) as Gezeichnet
}
async function mountBand($: Test$, surface: 'desktop' | 'terminal' | 'vscode' = 'desktop'): Promise<Gezeichnet> {
  return (await ($ as unknown as Mount).ui.mount({ ...BAND, surface })) as Gezeichnet
}

/** Was das Fenster zeigt: die erste Zeile, je Kategorie Überschrift und je Skill Label und Beschreibung. */
async function fenster(ui: Gezeichnet) {
  const baum = (await gepruefterBaum(ui, 'Fenster')) as Knoten
  const [kopf] = kinder(baum)
  const kategorien = kinder(baum).filter(k => /^skills-k-\d+$/.test(String(k.props?.key)))
  return {
    baum,
    kopf: textIn(kopf),
    kategorien: kategorien.map(k => {
      const [ueberschrift, ...zeilen] = kinder(k)
      return {
        name: textIn(ueberschrift),
        skills: zeilen.map(z => {
          const [knopf, text] = kinder(z)
          return { label: String(knopf?.props?.label), text: text === undefined ? null : textIn(text) }
        }),
      }
    }),
  }
}

/** Was das Fenster für diese Kategorien und Kurzbeschreibungen zeigen soll. */
const erwartet = (kategorien: Kategorien, kurz: Record<string, string>) =>
  kategorien.map(kategorie => ({
    name: kategorie.name,
    skills: kategorie.skills.map(skill => ({ label: skill.includes(':') ? skill.slice(skill.indexOf(':') + 1) : skill, text: kurz[skill] ?? null })),
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

test('im Band ist 🧩 hinter 🧹 ein einfacher Button, in der App und im Terminal: kein Popover, keine Hover-Gruppe, kein Select', async ($, on) => {
  const lauf = boden(on, { haupt: HAUPT })
  await start($ as never, lauf)
  for (const surface of ['desktop', 'vscode', 'terminal'] as const) {
    const ui = await mountBand($ as never, surface)
    const baum = await gepruefterBaum(ui, `Band ${surface}`)
    const knopf = (await ui.find({ key: KNOPF_SKILLS })) as Knoten | undefined
    expect(knopf?.type).toBe('Button')
    expect(knopf?.props?.label).toBe(PUZZLE)
    if (surface === 'terminal') expect(knopf?.props?.plain).toBe(true)
    else expect(knopf?.props?.variant).toBe('secondary')
    expect(kinder(knopf).filter(k => k.type === 'Box')).toEqual([])
    const keys = keysIn(baum)
    expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([])
    expect(keys.filter(key => key.startsWith(`${KNOPF_SKILLS}-`))).toEqual([])
    expect(JSON.stringify(baum)).not.toContain(`${KNOPF_SKILLS}-g-`)
    expect(JSON.stringify(baum)).not.toContain('"type":"Select","props":{"key":"skillmenue"')
    // 🧩 steht hinter 🧹.
    expect(keys.indexOf(KNOPF_SKILLS)).toBeGreaterThan(keys.indexOf('cleancode'))
    await ui.unmount()
  }
  expect(lauf.opens).toEqual([])
})

test('ein Druck auf 🧩 öffnet das Fenster Skills mit Fokus, in der App und im Terminal, ohne zu warten; nichts ins Eingabefeld', async ($, on) => {
  const lauf = boden(on, { haupt: HAUPT, oeffnenHaengt: true })
  await start($ as never, lauf)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await mountBand($ as never, surface)
    // $.ui.open antwortet nie: Der Druck wartet nicht darauf.
    await ui.press({ key: KNOPF_SKILLS })
    await ui.unmount()
  }
  expect(lauf.opens).toEqual([
    { id: FENSTER, title: TITEL, focus: true },
    { id: FENSTER, title: TITEL, focus: true },
  ])
  expect(lauf.fills).toEqual([])
  expect(lauf.runs).toEqual([])
})

test('das Fenster: erste Zeile, je Kategorie eine Überschrift, je Skill ein Button (ohne Präfix, ungekürzt) mit Kurzbeschreibung; Keys eindeutig, kein Select, kein Popover', async ($, on) => {
  const lauf = boden(on, { haupt: HAUPT })
  await start($ as never, lauf)
  for (const surface of ['desktop', 'vscode', 'terminal'] as const) {
    const ui = await mountPane($ as never, surface)
    const { baum, kopf, kategorien } = await fenster(ui)
    expect(kopf).toBe(kopfzeile(4))
    expect(kopfzeile(4)).toBe('4 Skills nach Anwendungsfall. Ein Klick startet den Skill.')
    expect(kategorien).toEqual(erwartet(VON_HAIKU, HAIKU_KURZ))
    // Aufbau: Überschrift fett, je Zeile ein Button und ein gedimmter Text daneben, 1,2 halbe Zeilen zwischen den Zeilen.
    const kategorieBoxen = kinder(baum).filter(k => /^skills-k-\d+$/.test(String(k.props?.key)))
    kategorieBoxen.forEach((box, i) => {
      expect(box.props?.key).toBe(`skills-k-${i}`)
      expect(box.props?.flexDirection).toBe('column')
      expect(box.props?.rowGap).toBe(1.2)
      expect(Number(box.props?.marginTop ?? 0) > 0).toBe(i > 0)
      const [ueberschrift, ...zeilen] = kinder(box)
      expect(ueberschrift?.type).toBe('Text')
      expect(ueberschrift?.props?.bold).toBe(true)
      zeilen.forEach((zeile, j) => {
        expect(zeile.props?.key).toBe(`skills-z-${i}-${j}`)
        expect(zeile.props?.flexDirection).toBe('row')
        expect(zeile.props?.columnGap).toBe(2)
        const [knopf, text] = kinder(zeile)
        expect(knopf?.type).toBe('Button')
        expect(knopf?.props?.key).toBe(`skills-b-${i}-${j}`)
        expect(text?.type).toBe('Text')
        expect(text?.props?.dimColor).toBe(true)
        expect(text?.props?.wrap).toBe('wrap')
      })
    })
    const keys = keysIn(baum)
    expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([])
    const knoten = alleKnoten(baum)
    expect(knoten.filter(k => k.type === 'Select')).toEqual([])
    expect(knoten.filter(k => k.props?.position === 'absolute' || k.hover !== undefined || k.props?.hover !== undefined)).toEqual([])
    // Schließen nur im Terminal, als letzter Button.
    const schliessen = (await ui.find({ key: 'skills-schliessen' })) as Knoten | undefined
    if (surface === 'terminal') {
      expect(schliessen?.props?.label).toBe('Schließen')
      expect(schliessen?.props?.role).toBe('dismiss')
      expect(keys.at(-1)).toBe('skills-schliessen')
      await ui.press({ key: 'skills-schliessen' })
      expect(lauf.closes).toEqual([FENSTER])
    } else {
      expect(schliessen).toBeUndefined()
    }
    await ui.unmount()
  }
})

test('ein langer Name bleibt ganz: das Label nimmt nur den Teil vor dem Doppelpunkt weg', async ($, on) => {
  const lang = 'cowork-plugin-customizer-mit-einem-sehr-langen-namen-der-nie-gekuerzt-wird'
  const lauf = boden(on, {
    skills: [{ name: lang, pluginName: 'cowork-plugin-management', source: 'plugin', tokens: 1 }],
    haupt: JSON.stringify({ kategorien: { 'Plugins einrichten': [`cowork-plugin-management:${lang}`] } }),
  })
  await start($ as never, lauf)
  const { kategorien } = await fenster(await mountPane($ as never))
  expect(kategorien).toEqual([{ name: 'Plugins einrichten', skills: [{ label: lang, text: kurzVon(`cowork-plugin-management:${lang}`) }] }])
})

test('ein Klick startet den Skill mit vollem Namen, das Fenster bleibt offen; mitten in einer Runde sagt ein Toast, dass er wartet', async ($, on) => {
  const lauf = boden(on, { haupt: HAUPT })
  await start($ as never, lauf)
  const ui = await mountPane($ as never)
  await ui.press({ key: 'skills-b-0-1' })
  expect(lauf.runs).toEqual(['sorgfalt:debuggen'])
  expect(lauf.toasts.filter(t => t.includes('Warteschlange'))).toEqual([])
  // Mitten in einer Runde der Hauptschleife: Toast, der Befehl geht trotzdem an die Engine.
  await ($ as unknown as Test$).turn.start({ text: 'Bau das.', turnId: 't1' } as never)
  await ui.press({ key: 'skills-b-1-0' })
  expect(lauf.runs).toEqual(['sorgfalt:debuggen', 'Ärger'])
  expect(lauf.toasts).toContain('Befehl "/Ärger" in die Warteschlange eingereiht...')
  // Eine Runde eines Helfers zählt nicht als Ende.
  await ($ as unknown as Test$).turn.complete({ reason: 'answer', answer: 'Fertig.', turnId: 't2', agentId: 'helfer' } as never)
  await ui.press({ key: 'skills-b-1-1' })
  expect(lauf.toasts).toContain('Befehl "/grill-me" in die Warteschlange eingereiht...')
  await runde($ as never, lauf, 't1')
  const vorher = lauf.toasts.length
  await ui.press({ key: 'skills-b-0-0' })
  expect(lauf.runs.at(-1)).toBe('sorgfalt:belegen')
  expect(lauf.toasts.length).toBe(vorher)
  // Kein Schließen, kein neues Öffnen, nichts ins Eingabefeld; das Fenster zeigt dasselbe.
  expect(lauf.closes).toEqual([])
  expect(lauf.opens).toEqual([])
  expect(lauf.fills).toEqual([])
  expect((await fenster(ui)).kategorien).toEqual(erwartet(VON_HAIKU, HAIKU_KURZ))
})

test('scheitert der Start, steht der Skill im Eingabefeld', async ($, on) => {
  const lauf = boden(on, { haupt: HAUPT, laeuftNicht: true })
  await start($ as never, lauf)
  const ui = await mountPane($ as never)
  await ui.press({ key: 'skills-b-1-1' })
  expect(lauf.fills).toEqual(['/grill-me'])
  expect(lauf.toasts).toContain('grill-me steht im Eingabefeld: Drück Enter, um zu starten.')
  expect(lauf.closes).toEqual([])
})

test('solange Haiku sortiert, zeigt das Fenster nur den Wartehinweis, keine Gruppen nach Plugin', LIEST, async ($, on) => {
  let freigeben = (): void => undefined
  const tor = new Promise<void>(r => (freigeben = r))
  const lauf = boden(on, { haupt: HAUPT, tor })
  await start($ as never, lauf)
  expect((await zustand($ as never)).skillMenue).toBeNull()
  const ui = await mountPane($ as never)
  const warten = await fenster(ui)
  expect(warten.kopf).toBe(WARTEN)
  expect(WARTEN).toBe('Haiku sortiert die Skills ...')
  expect(warten.kategorien).toEqual([])
  expect(keysIn(warten.baum).filter(key => key.startsWith('skills-b-'))).toEqual([])
  // Der Befehl vom Handy gibt solange die Liste nach Plugin aus.
  expect(await menue($ as never, 'bridge')).toBe(textListe(ERWARTET, nachPlugin(ERWARTET), RUECKFALL_KURZ))
  freigeben()
  await lauf.clock.settle()
  await lauf.clock.settle()
  expect((await fenster(ui)).kategorien).toEqual(erwartet(VON_HAIKU, HAIKU_KURZ))
})

test('scheitert Haiku ohne frühere Sortierung: vorläufig nach Plugin mit Hinweis, Grund im Debug-Log, kein neuer Versuch in diesem Lauf', LIEST, async ($, on) => {
  const w: Welt = { haupt: 'Tut mir leid, das kann ich nicht.' }
  const lauf = boden(on, w)
  await start($ as never, lauf)
  expect(lauf.haiku.map(a => a.art)).toEqual(['haupt'])
  expect(await zustand($ as never)).toEqual({ skillListe: ERWARTET, skillMenue: nachPlugin(ERWARTET), skillKurz: RUECKFALL_KURZ, skillVorlaeufig: true })
  expect(lauf.gespeichert.filter(one => one.key === STORE_KATEGORIEN)).toEqual([])
  expect(lauf.logs).toContain('debug: leitstand: skill categories: Haiku failed: Antwort nicht lesbar: kein JSON gefunden (keine "{" in der Antwort); by plugin for now')
  const ui = await mountPane($ as never)
  const gezeigt = await fenster(ui)
  expect(gezeigt.kopf).toBe(VORLAEUFIG)
  expect(VORLAEUFIG).toBe('Haiku konnte nicht sortieren, vorläufig nach Plugin geordnet.')
  expect(gezeigt.kategorien).toEqual(erwartet([{ name: 'Sorgfalt', skills: ['sorgfalt:belegen', 'sorgfalt:debuggen'] }, { name: 'Weitere', skills: ['Ärger', 'grill-me'] }], RUECKFALL_KURZ))
  // Auch keine Antwort oder ein Zeitablauf zählt als Fehlschlag; die nächsten Runden fragen nicht noch einmal.
  w.haupt = 'aborted'
  for (const turnId of ['t1', 't2']) await runde($ as never, lauf, turnId)
  expect(lauf.haiku).toHaveLength(1)
  expect((await zustand($ as never)).skillVorlaeufig).toBe(true)
})

for (const [art, grund] of [
  ['aborted', 'Zeitablauf (60 s) oder abgebrochen'],
  // Ein Test-Hook, der wirft, wird übersprungen: unten antwortet dann niemand.
  ['wirft', 'Fehler von $.model.complete: no implementation for model.complete'],
] as const) {
  test(`scheitert Haiku (${art}), steht der Grund im Debug-Log`, async ($, on) => {
    const lauf = boden(on, { haupt: art })
    await start($ as never, lauf)
    expect(lauf.logs).toContain(`debug: leitstand: skill categories: Haiku failed: ${grund}; by plugin for now`)
    expect((await fenster(await mountPane($ as never))).kopf).toBe(VORLAEUFIG)
  })
}

test('abgeschnittenes JSON wird erkannt und im Debug-Log so genannt', async ($, on) => {
  const lauf = boden(on, { haupt: HAUPT.slice(0, 60) })
  await start($ as never, lauf)
  expect(lauf.logs.some(l => l.startsWith('debug: leitstand: skill categories: Haiku failed: Antwort nicht lesbar: JSON endet nicht (keine schließende Klammer, vermutlich abgeschnitten)'))).toBe(true)
})

test('ein ```json-Block mit Text davor und danach wird gelesen', LIEST, async ($, on) => {
  const lauf = boden(on, { haupt: `Hier ist die Sortierung:\n\n\`\`\`json\n${HAUPT}\n\`\`\`\n\nViel Erfolg {damit}!` })
  await start($ as never, lauf)
  expect((await zustand($ as never)).skillMenue).toEqual(VON_HAIKU)
})

test('erster Lauf: Kategorien ohne kurz (haiku, low, 8192, 60 s), Nachfrage für ausgelassene, dann Kurzbeschreibungen (2048); alles in Store und Fenster; die nächste Runde fragt nicht', LIEST, async ($, on) => {
  const lauf = boden(on, { haupt: HAUPT })
  await start($ as never, lauf)
  expect(lauf.haiku.map(a => a.art)).toEqual(['haupt', 'nachtrag', 'kurz'])
  for (const aufruf of lauf.haiku) {
    expect(aufruf.model).toBe('haiku')
    expect(aufruf.effort).toBe('low')
    expect(aufruf.timeoutMs).toBe(HAIKU_FRIST_MS)
  }
  expect(HAIKU_EFFORT).toBe('low')
  expect(HAIKU_FRIST_MS).toBe(60_000)
  const [haupt, nach, kurz] = lauf.haiku as [Aufruf, Aufruf, Aufruf]
  expect(haupt.maxTokens).toBe(HAIKU_MAX_TOKENS)
  expect(HAIKU_MAX_TOKENS).toBe(8192)
  expect(nach.maxTokens).toBe(HAIKU_MAX_TOKENS)
  expect(kurz.maxTokens).toBe(KURZ_MAX_TOKENS)
  expect(KURZ_MAX_TOKENS).toBe(2048)
  // Der Hauptaufruf fragt nur nach Kategorien; die Beschreibungen aus der Befehlsliste gehen mit.
  expect(haupt.prompt).toContain(`- sorgfalt:debuggen: ${beschreibung('sorgfalt:debuggen')}`)
  expect(haupt.prompt).not.toContain('"kurz"')
  expect(haupt.prompt).not.toContain('Kurzbeschreibung')
  // Die Nachfrage nennt nur die vorhandenen Kategorien und nur den ausgelassenen Skill.
  expect(nach.prompt).toContain('Kategorien:\n- Fehler finden\n- Fragen stellen\n')
  expect(skillsAus(nach.prompt)).toEqual(['Ärger'])
  expect(skillsAus(kurz.prompt)).toEqual(ERWARTET)
  expect(await zustand($ as never)).toEqual({ skillListe: ERWARTET, skillMenue: VON_HAIKU, skillKurz: HAIKU_KURZ, skillVorlaeufig: false })
  expect(lauf.gespeichert.filter(one => one.key === STORE_KATEGORIEN).at(-1)).toEqual({
    key: STORE_KATEGORIEN,
    value: { hash: menueHash(ERWARTET), kategorien: VON_HAIKU, kurz: HAIKU_KURZ },
  })
  for (const turnId of ['t1', 't2']) await runde($ as never, lauf, turnId)
  expect(lauf.haiku).toHaveLength(3)
  expect((await zustand($ as never)).skillMenue).toEqual(VON_HAIKU)
})

test('scheitert die Nachfrage, kommen die Ausgelassenen in genau eine Gruppe Weitere, am Ende', LIEST, async ($, on) => {
  const lauf = boden(on, {
    haupt: JSON.stringify({ kategorien: { 'Fehler finden': ['sorgfalt:debuggen', 'sorgfalt:belegen'], Weitere: ['grill-me'] } }),
    nachtrag: 'aborted',
  })
  await start($ as never, lauf)
  expect(lauf.haiku.map(a => a.art)).toEqual(['haupt', 'nachtrag', 'kurz'])
  expect((await zustand($ as never)).skillMenue).toEqual([
    { name: 'Fehler finden', skills: ['sorgfalt:belegen', 'sorgfalt:debuggen'] },
    { name: 'Weitere', skills: ['Ärger', 'grill-me'] },
  ])
  expect((await zustand($ as never)).skillVorlaeufig).toBe(false)
  expect(lauf.logs).toContain('debug: leitstand: skill categories: 2 in "Weitere" (second call failed: Zeitablauf (60 s) oder abgebrochen)')
})

test('ohne Ausgelassene keine Nachfrage und keine Gruppe Weitere', LIEST, async ($, on) => {
  const lauf = boden(on, { haupt: JSON.stringify({ kategorien: { 'Fehler finden': ['sorgfalt:debuggen', 'sorgfalt:belegen'], 'Fragen stellen': ['grill-me', 'Ärger'] } }) })
  await start($ as never, lauf)
  expect(lauf.haiku.map(a => a.art)).toEqual(['haupt', 'kurz'])
  expect((await zustand($ as never)).skillMenue).toEqual(VON_HAIKU)
})

test('Kurzbeschreibungen in Päckchen zu höchstens 20, nacheinander; ein gescheitertes hält die anderen nicht auf, dort bleibt der erste Satz', LIEST, async ($, on) => {
  const skills = erfunden(45, 0)
  const namen = skills.map(s => s.name)
  const haupt = JSON.stringify({ kategorien: { 'Code prüfen': namen.slice(0, 15), 'Texte überarbeiten': namen.slice(15, 30), 'Browser steuern': namen.slice(30) } })
  const lauf = boden(on, { skills, haupt, kurz: (s, i) => (i === 1 ? 'aborted' : alleKurz(s)) })
  await start($ as never, lauf)
  const paeckchen = lauf.haiku.filter(a => a.art === 'kurz')
  expect(paeckchen.map(a => skillsAus(a.prompt).length)).toEqual([20, 20, 5])
  expect(lauf.logs).toContain('debug: leitstand: skill short descriptions, parcel 2 of 3, failed: Zeitablauf (60 s) oder abgebrochen')
  const kurz = (await zustand($ as never)).skillKurz ?? {}
  expect(Object.keys(kurz).filter(name => kurz[name] === kurzVon(name))).toHaveLength(25)
  // Ohne Beschreibung in der Befehlsliste gibt es keinen ersten Satz: Die 20 des gescheiterten Päckchens bleiben ohne.
  expect(Object.keys(kurz)).toHaveLength(25)
  // Gespeichert sind Haikus 25; die nächste Runde fragt in diesem Lauf nicht noch einmal.
  expect(Object.keys((lauf.gespeichert.at(-1)?.value as { kurz: object }).kurz)).toHaveLength(25)
  await runde($ as never, lauf, 't1')
  expect(lauf.haiku.filter(a => a.art === 'kurz')).toHaveLength(3)
})

test('der Speicher verhindert neue Aufrufe: gleicher Bestand mit allen Kurzbeschreibungen fragt Haiku gar nicht, Weitere bleibt', LIEST, async ($, on) => {
  const gespeichert = [
    { name: 'Fehler finden', skills: ['sorgfalt:belegen', 'sorgfalt:debuggen'] },
    { name: 'Weitere', skills: ['Ärger', 'grill-me'] },
  ]
  const lauf = boden(on, { haupt: HAUPT, store: { [STORE_KATEGORIEN]: { hash: menueHash(ERWARTET), kategorien: gespeichert, kurz: HAIKU_KURZ } } })
  await start($ as never, lauf)
  expect(lauf.haiku).toEqual([])
  expect(await zustand($ as never)).toEqual({ skillListe: ERWARTET, skillMenue: gespeichert, skillKurz: HAIKU_KURZ, skillVorlaeufig: false })
  expect((await fenster(await mountPane($ as never))).kategorien).toEqual(erwartet(gespeichert, HAIKU_KURZ))
})

test('gleicher Bestand im Speicher, aber Kurzbeschreibungen fehlen: nur die fehlenden werden nachgeholt', LIEST, async ($, on) => {
  const lauf = boden(on, { store: { [STORE_KATEGORIEN]: { hash: menueHash(ERWARTET), kategorien: VON_HAIKU, kurz: { 'grill-me': kurzVon('grill-me'), 'Ärger': kurzVon('Ärger') } } } })
  await start($ as never, lauf)
  expect(lauf.haiku.map(a => a.art)).toEqual(['kurz'])
  expect(skillsAus(lauf.haiku[0]!.prompt)).toEqual(['sorgfalt:belegen', 'sorgfalt:debuggen'])
  expect((await zustand($ as never)).skillKurz).toEqual(HAIKU_KURZ)
})

test('neue Skills: die bekannten sofort aus dem Speicher, nur die neuen per Nachfrage, entfallene gestrichen, Kurzbeschreibungen nur für die neuen', LIEST, async ($, on) => {
  let freigeben = (): void => undefined
  const tor = new Promise<void>(r => (freigeben = r))
  const frueher = ['sorgfalt:belegen', 'sorgfalt:debuggen', 'grill-me', 'entfallen:skill']
  const speicher = {
    [STORE_KATEGORIEN]: {
      hash: menueHash(frueher),
      kategorien: [
        { name: 'Fehler finden', skills: ['entfallen:skill', 'sorgfalt:belegen', 'sorgfalt:debuggen'] },
        { name: 'Fragen stellen', skills: ['grill-me'] },
      ],
      kurz: { 'sorgfalt:belegen': kurzVon('sorgfalt:belegen'), 'sorgfalt:debuggen': kurzVon('sorgfalt:debuggen'), 'grill-me': kurzVon('grill-me'), 'entfallen:skill': 'Weg.' },
    },
  }
  const lauf = boden(on, { haupt: HAUPT, store: speicher, tor })
  await start($ as never, lauf)
  // Sofort: die bekannten, ohne den entfallenen, noch ohne Ärger.
  expect((await zustand($ as never)).skillMenue).toEqual([
    { name: 'Fehler finden', skills: ['sorgfalt:belegen', 'sorgfalt:debuggen'] },
    { name: 'Fragen stellen', skills: ['grill-me'] },
  ])
  expect(lauf.haiku.map(a => a.art)).toEqual(['nachtrag'])
  expect(skillsAus(lauf.haiku[0]!.prompt)).toEqual(['Ärger'])
  freigeben()
  await lauf.clock.settle()
  await lauf.clock.settle()
  expect(lauf.haiku.map(a => a.art)).toEqual(['nachtrag', 'kurz'])
  expect(skillsAus(lauf.haiku[1]!.prompt)).toEqual(['Ärger'])
  expect(await zustand($ as never)).toEqual({ skillListe: ERWARTET, skillMenue: VON_HAIKU, skillKurz: HAIKU_KURZ, skillVorlaeufig: false })
  expect(lauf.gespeichert.at(-1)).toEqual({ key: STORE_KATEGORIEN, value: { hash: menueHash(ERWARTET), kategorien: VON_HAIKU, kurz: HAIKU_KURZ } })
})

test('eine Sortierung nach einem älteren Prompt zählt nicht: Haiku sortiert neu', LIEST, async ($, on) => {
  const alt = { hash: `p3-${kategorienHash(ERWARTET)}`, kategorien: [{ name: 'Alles', skills: [...ERWARTET] }], kurz: {} }
  const lauf = boden(on, { haupt: HAUPT, store: { [STORE_KATEGORIEN]: alt } })
  await start($ as never, lauf)
  expect(lauf.haiku[0]?.art).toBe('haupt')
  expect((await zustand($ as never)).skillMenue).toEqual(VON_HAIKU)
})

test('ohne Skills: das Fenster sagt es, der Befehl antwortet nur mit dem Satz, Haiku wird nicht gefragt', async ($, on) => {
  const lauf = boden(on, { skills: [], haupt: HAUPT })
  await start($ as never, lauf)
  expect((await fenster(await mountPane($ as never))).kopf).toBe(OHNE_SKILLS)
  expect(await menue($ as never, 'bridge')).toBe(OHNE_SKILLS)
  expect(await menue($ as never, 'sdk')).toBe(OHNE_SKILLS)
  expect(OHNE_SKILLS).toBe('In dieser Sitzung sind keine Skills installiert.')
  expect(lauf.haiku).toEqual([])
  expect(lauf.opens).toEqual([])
})

for (const plugins of [0, 7, 40]) {
  test(`150 erfundene Skills auf ${plugins} Plugins, nach Plugin: Fenster und Band zeichnen, alle Skills im Fenster, Keys eindeutig`, async ($, on) => {
    const lauf = boden(on, { skills: erfunden(150, plugins) })
    await start($ as never, lauf)
    for (const surface of ['desktop', 'vscode', 'terminal'] as const) {
      const pane = await mountPane($ as never, surface)
      const { baum, kategorien } = await fenster(pane)
      const keys = keysIn(baum)
      expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([])
      expect(kategorien.flatMap(k => k.skills.map(s => s.label)).sort()).toEqual(erfunden(150, 0).map(s => s.name))
      await pane.unmount()
      const band = await mountBand($ as never, surface)
      await gepruefterBaum(band, `Band ${surface}, ${plugins} Plugins`)
      await band.unmount()
    }
  })
}

test('beim Zeichnen werden weder $.session.usage noch $.model.complete noch $.ui.open aufgerufen', async ($, on) => {
  const lauf = boden(on, { haupt: HAUPT })
  await start($ as never, lauf)
  expect(lauf.usage).toBe(1)
  const aufrufe = lauf.haiku.length
  for (const surface of ['desktop', 'vscode', 'terminal'] as const) {
    for (const mount of [mountBand, mountPane]) {
      const ui = await mount($ as never, surface)
      await gepruefterBaum(ui, surface)
      await gepruefterBaum(ui, surface)
      await ui.unmount()
    }
  }
  expect(lauf.usage).toBe(1)
  expect(lauf.haiku.length).toBe(aufrufe)
  expect(lauf.opens).toEqual([])
})

test('die Liste lädt beim Start und am Ende jeder Runde der Hauptschleife, nicht nach Runden der Helfer', LIEST, async ($, on) => {
  const w: Welt = { haupt: HAUPT }
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
  await runde($ as never, lauf, 't1')
  expect(await liste($ as never)).toEqual(['neu'])
  expect(lauf.usage).toBe(2)
})

test('antwortet die Aufschlüsselung nie, bleibt die alte Liste, nach 10 s eine Zeile im Debug-Log', LIEST, async ($, on) => {
  const w: Welt = { haengt: true, haupt: HAUPT }
  const lauf = boden(on, w)
  await start($ as never, lauf)
  expect(await liste($ as never)).toBeNull()
  // Das Fenster wartet; ein Druck auf 🧩 öffnet es trotzdem.
  expect((await fenster(await mountPane($ as never))).kopf).toBe(WARTEN)
  const band = await mountBand($ as never)
  await band.press({ key: KNOPF_SKILLS })
  expect(lauf.opens).toEqual([{ id: FENSTER, title: TITEL, focus: true }])
  expect(lauf.logs.filter(line => line.includes('skill list'))).toEqual([])
  await lauf.clock.advance(LADEFRIST_MS)
  expect(lauf.logs.filter(line => line.includes('skill list'))).toEqual([expect.stringMatching(/^debug: leitstand: skill list \(session\.start\) took longer than 10 s/)])
  expect(await liste($ as never)).toBeNull()
  // Eine Liste, die schon da ist, bleibt, wenn das nächste Laden hängt oder scheitert.
  w.haengt = false
  await runde($ as never, lauf, 't1')
  expect(await liste($ as never)).toEqual(ERWARTET)
  w.haengt = true
  await $.turn.complete({ reason: 'answer', answer: 'Fertig.', turnId: 't2' } as never)
  await lauf.clock.settle()
  await lauf.clock.advance(LADEFRIST_MS)
  expect(await liste($ as never)).toEqual(ERWARTET)
  w.haengt = false
  w.scheitert = true
  await runde($ as never, lauf, 't3')
  expect(await liste($ as never)).toEqual(ERWARTET)
  expect(lauf.logs.filter(line => line.includes('skill list')).at(-1)).toMatch(/^debug: leitstand: skill list \(turn\.complete\) failed: .*the old list stays$/)
})

test('der Befehl am Rechner öffnet das Fenster mit Fokus und sagt es; vom Handy und ohne Fläche kommt die Liste als Text', AUS, async ($, on) => {
  const w: Welt = { haupt: HAUPT }
  const lauf = boden(on, w)
  await start($ as never, lauf)
  expect(await menue($ as never, 'sdk')).toBe(IM_FENSTER)
  expect(IM_FENSTER).toBe('Die Skills stehen im Fenster "Skills".')
  expect(await menue($ as never, 'composer')).toBe(IM_FENSTER)
  expect(String((await $.command.run({ command: 'skill-menue', args: '', origin: { kind: 'sdk' } } as never)).text)).toBe(IM_FENSTER)
  expect(lauf.opens).toEqual(Array.from({ length: 3 }, () => ({ id: FENSTER, title: TITEL, focus: true })))
  const text = textListe(ERWARTET, VON_HAIKU, HAIKU_KURZ)
  expect(text).toBe(
    [
      '4 Skills in dieser Sitzung:',
      `Fehler finden\n/sorgfalt:belegen: ${kurzVon('sorgfalt:belegen')}\n/sorgfalt:debuggen: ${kurzVon('sorgfalt:debuggen')}`,
      `Fragen stellen\n/Ärger: ${kurzVon('Ärger')}\n/grill-me: ${kurzVon('grill-me')}`,
    ].join('\n\n'),
  )
  // Vom Handy: Text, kein Fenster.
  expect(await menue($ as never, 'bridge')).toBe(text)
  expect(String((await $.command.run({ command: 'skill-menue', args: '', origin: { kind: 'bridge' } } as never)).text)).toBe(text)
  expect(lauf.opens).toHaveLength(3)
  // Keine Fläche zeigt das Fenster (etwa eine Cloud-Sitzung): Text.
  w.platziert = false
  expect(await menue($ as never, 'composer')).toBe(text)
  // Die Liste kam aus dem Zustand: geladen wurde nur einmal, beim Start.
  expect(lauf.usage).toBe(1)
})

test('ist die Liste noch leer, lädt der Befehl sie einmal selbst', LIEST_AUS, async ($, on) => {
  const w: Welt = { haengt: true }
  const lauf = boden(on, w)
  await start($ as never, lauf)
  w.haengt = false
  expect(await menue($ as never, 'bridge')).toBe(textListe(ERWARTET, nachPlugin(ERWARTET), RUECKFALL_KURZ))
  expect(await liste($ as never)).toEqual(ERWARTET)
})

test('hilfe erklärt den Befehl, lädt nichts und öffnet kein Fenster', AUS, async ($, on) => {
  const lauf = boden(on)
  await start($ as never, lauf)
  const vorher = lauf.usage
  const hilfe = await menue($ as never, 'sdk', 'hilfe')
  expect(hilfe).toContain('/leitstand:skill-menue')
  expect(hilfe).toContain('Fenster Skills')
  expect(lauf.usage).toBe(vorher)
  expect(lauf.opens).toEqual([])
})
