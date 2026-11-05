import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { FENSTER_SKILLS, KNOPF_SKILLS, SKILLS_BEFEHLE } from '../hooks/skills/befehle'
import { IM_FENSTER, OHNE_SKILLS, WAEHLEN, eingereiht, imEingabefeld, kopfText, skillNamen, textListe } from '../hooks/skills/teil'

// Das Skill-Menü als Teil des Leitstands: Die Test-Engine lädt den ganzen Leitstand. Die Tests schalten seine Ansicht
// aus (AUS), außer beim Knopf in der Leiste.

const AUS = { options: { ansicht: 'aus' } } as const
const PANE = { plugin: 'leitstand', component: 'Pane', requestId: FENSTER_SKILLS } as const
const paneProps = { title: 'Skills', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as never
const bandProps = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 93,
  scroll: { offset: 0, bodyRows: 12, isAtTop: true, isAtBottom: true },
  view: {},
} as never

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
  isPlaced?: boolean
  laeuftNicht?: boolean
}
type Lauf = { opens: { id: string; title?: string; focus?: boolean }[]; closes: string[]; runs: string[]; toasts: string[]; fills: string[] }

/** Der Boden unter dem Leitstand: was die Engine sonst beantworten würde. */
function boden(on: On, w: Welt = {}): Lauf {
  const lauf: Lauf = { opens: [], closes: [], runs: [], toasts: [], fills: [] }
  mock.store(on)
  mock.clock(on, { now: 1_000_000 })
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
  on('session.usage', () => ({ value: { startedAt: 0, context: { breakdown: { skills: { skillFrontmatter: w.skills ?? SKILLS } } } } }) as never)
  on('ui.open', (_$, e) => {
    lauf.opens.push(e as never)
    return { value: { isPlaced: w.isPlaced ?? true } } as never
  })
  on('ui.close', (_$, e) => {
    lauf.closes.push((e as { id: string }).id)
    return { value: undefined } as never
  })
  on('ui.toast', (_$, e) => {
    lauf.toasts.push(String((e as { text?: unknown }).text))
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

async function start($: Test$) {
  await $.session.start({ cwd: '/projekt', surface: 'desktop', isInteractive: true } as never)
}

/** /leitstand:skill-menue, wie getippt, am Rechner oder vom Handy. */
async function menue($: Test$, kind: 'composer' | 'sdk' | 'bridge' = 'sdk', args = '') {
  const r = await $.command.run({ command: SKILLS_BEFEHLE[0]!.name, args, origin: { kind } } as never)
  return String(r.text ?? '')
}

async function texte(ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) {
  return (await ui.findAll({ type: 'Text' })).map(t => t.text)
}

test('skillNamen sortiert, entfernt Doppelte und die eigenen Befehle des Leitstands', () => {
  expect(skillNamen(SKILLS, BEFEHLE)).toEqual(ERWARTET)
  // Ohne Befehlsliste: Ein Skill eines Plugins heißt plugin:skill.
  expect(skillNamen([{ name: 'debuggen', pluginName: 'sorgfalt' }], [])).toEqual(['sorgfalt:debuggen'])
  // Kennt die Befehlsliste nur den nackten Namen, gilt der.
  expect(skillNamen([{ name: 'debuggen', pluginName: 'sorgfalt' }], ['debuggen'])).toEqual(['debuggen'])
  expect(skillNamen([], BEFEHLE)).toEqual([])
})

test('der Befehl öffnet am Rechner das Fenster Skills mit Fokus', AUS, async ($, on) => {
  const lauf = boden(on)
  await start($ as never)
  expect(await menue($ as never)).toBe(IM_FENSTER)
  expect(lauf.opens).toEqual([expect.objectContaining({ id: FENSTER_SKILLS, title: 'Skills', focus: true })])
})

test('der Druck auf skillmenue öffnet das Fenster', async ($, on) => {
  const lauf = boden(on)
  await start($ as never)
  const ui = await $.ui.mount({ plugin: 'leitstand', component: 'AbovePrompt', surface: 'desktop', props: bandProps })
  // Den Knopf zeichnet die Leiste des Leitstands (glance.tsx); den Druck beantwortet der Teil.
  const knopf = (await ui.find({ type: 'Button', key: KNOPF_SKILLS })) as { props: { label?: string } } | undefined
  expect(knopf?.props.label).toBe('\u{1F9E9}')
  await ui.press({ key: KNOPF_SKILLS })
  expect(lauf.opens).toEqual([expect.objectContaining({ id: FENSTER_SKILLS, title: 'Skills', focus: true })])
  // Der Teil antwortet selbst: Das Eingabefeld bleibt leer.
  expect(lauf.fills).toEqual([])
  // Im Terminal genauso.
  const terminal = await $.ui.mount({ plugin: 'leitstand', component: 'AbovePrompt', surface: 'terminal', props: bandProps })
  await terminal.press({ key: KNOPF_SKILLS })
  expect(lauf.opens).toHaveLength(2)
})

test('das Fenster listet die Skills sortiert, ohne leitstand: und ohne Doppelte; zuerst "Skill wählen ..."', AUS, async ($, on) => {
  boden(on)
  await start($ as never)
  await menue($ as never)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface, props: paneProps })
    expect(await texte(ui as never)).toContain(kopfText(4))
    const wahl = (await ui.find({ type: 'Select', key: 'skill' })) as { props: { label?: string; autoFocus?: boolean; options: { value: string; label?: string }[] } } | undefined
    expect(wahl?.props.label).toBe('Skill')
    expect(wahl?.props.autoFocus).toBe(true)
    expect(wahl?.props.options).toEqual([{ value: '', label: WAEHLEN }, ...ERWARTET.map(name => ({ value: name, label: name }))])
    const schliessen = await ui.find({ type: 'Button', key: 'schliessen' })
    expect(schliessen === undefined).toBe(surface === 'desktop')
    await ui.unmount()
  }
  expect(WAEHLEN).toBe('Skill wählen ...')
  expect(kopfText(1)).toBe('1 Skill in dieser Sitzung. Wähle einen, er startet sofort.')
})

test('die Auswahl von "Skill wählen ..." tut nichts', AUS, async ($, on) => {
  const lauf = boden(on)
  await start($ as never)
  await menue($ as never)
  await $.ui.mount({ ...PANE, surface: 'desktop', props: paneProps })
  await $.ui.select({ plugin: 'leitstand', key: 'skill', value: '' })
  expect(lauf.closes).toEqual([])
  expect(lauf.runs.filter(name => !name.startsWith('leitstand:'))).toEqual([])
})

test('die Auswahl eines Skills schließt das Fenster und startet ihn', AUS, async ($, on) => {
  const lauf = boden(on)
  await start($ as never)
  await menue($ as never)
  await $.ui.mount({ ...PANE, surface: 'desktop', props: paneProps })
  await $.ui.select({ plugin: 'leitstand', key: 'skill', value: 'sorgfalt:debuggen' })
  expect(lauf.closes).toEqual([FENSTER_SKILLS])
  expect(lauf.runs.at(-1)).toBe('sorgfalt:debuggen')
  expect(lauf.toasts).toEqual([])
})

test('mitten in einer Runde sagt ein Toast, dass der Skill wartet', AUS, async ($, on) => {
  const lauf = boden(on)
  await start($ as never)
  await menue($ as never)
  await $.turn.start({ text: 'Bau das.', turnId: 't1' } as never)
  await $.ui.mount({ ...PANE, surface: 'desktop', props: paneProps })
  await $.ui.select({ plugin: 'leitstand', key: 'skill', value: 'grill-me' })
  expect(lauf.toasts).toContain(eingereiht('grill-me'))
  expect(eingereiht('grill-me')).toBe('Befehl "/grill-me" in die Warteschlange eingereiht...')
})

test('scheitert der Start, steht der Skill im Eingabefeld', AUS, async ($, on) => {
  const lauf = boden(on, { laeuftNicht: true })
  await start($ as never)
  await menue($ as never)
  await $.ui.mount({ ...PANE, surface: 'desktop', props: paneProps })
  await $.ui.select({ plugin: 'leitstand', key: 'skill', value: 'grill-me' })
  expect(lauf.fills).toEqual(['/grill-me'])
  expect(lauf.toasts).toContain(imEingabefeld('grill-me'))
  expect(imEingabefeld('grill-me')).toBe('grill-me steht im Eingabefeld: Drück Enter, um zu starten.')
})

test('vom Handy kommt die Liste als Text, ohne Fenster', AUS, async ($, on) => {
  const lauf = boden(on)
  await start($ as never)
  const text = await menue($ as never, 'bridge')
  expect(text).toBe(['4 Skills in dieser Sitzung:', ...ERWARTET.map(name => `/${name}`)].join('\n'))
  expect(text).toBe(textListe(ERWARTET))
  expect(lauf.opens).toEqual([])
})

test('ohne Fläche für das Fenster kommt die Liste als Text', AUS, async ($, on) => {
  boden(on, { isPlaced: false })
  await start($ as never)
  expect(await menue($ as never)).toBe(textListe(ERWARTET))
})

test('ohne Skills steht im Fenster und in der Antwort nur der Satz', AUS, async ($, on) => {
  boden(on, { skills: [] })
  await start($ as never)
  expect(await menue($ as never, 'bridge')).toBe(OHNE_SKILLS)
  await menue($ as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: paneProps })
  expect(await texte(ui as never)).toEqual([OHNE_SKILLS])
  expect(await ui.find({ type: 'Select', key: 'skill' })).toBeUndefined()
  expect(OHNE_SKILLS).toBe('In dieser Sitzung sind keine Skills installiert.')
})

test('hilfe erklärt den Befehl und öffnet nichts', AUS, async ($, on) => {
  const lauf = boden(on)
  await start($ as never)
  expect(await menue($ as never, 'sdk', 'hilfe')).toContain('/leitstand:skill-menue')
  expect(lauf.opens).toEqual([])
})
