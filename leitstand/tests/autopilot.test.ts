import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'

import { AUTOPILOT_ALTE, AUTOPILOT_BEFEHLE, AUTOPILOT_GRUNDBEFEHL } from '../hooks/autopilot/befehle'
import { FERTIG, FRAGE_ABGELEHNT, GRUND_FERTIG, GRUND_GRENZE, GRUND_KNOPF, KONTEXT, WEITER, fehlerText, istFertig } from '../hooks/autopilot/teil'
import { ALTE_BEFEHLE, LEITSTAND_BEFEHLE, befehlsHilfe, kurzform } from '../hooks/logic'

// Der Autopilot als Teil des Leitstands: Die Test-Engine lädt den ganzen Leitstand. Die meisten Tests schalten seine
// Ansicht aus (AUS): Dann lässt er jedes Werkzeug durch, und die Tests sehen den Autopiloten allein. Die Tests am Ende
// laufen mit eingeschaltetem Leitstand.

const BAND = { plugin: 'leitstand', component: 'AbovePrompt' } as const
const AUS = { ansicht: 'aus' } as const
const OHNE_LEITSTAND = { options: AUS }
const grenze = (n: number) => ({ options: { ...AUS, autopilotMaxRunden: n } })
const PLAN = 'mcp__leitstand__plan_steps'
const GEMELDET = '(gemeldet vom Mod Leitstand)'

function props(x?: { hasSurvey?: boolean }) {
  return {
    hasSurvey: x?.hasSurvey ?? false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 93,
    scroll: { offset: 0, bodyRows: 12, isAtTop: true, isAtBottom: true },
    view: {},
  } as never
}

type Eingang = { text: string; context: readonly string[]; origin: string }

/** Der Prompt, der zuletzt unten ankam: Mit ihm beginnt die nächste Runde, wie in der Engine. */
let zuletzt = ''

/**
 * Der Boden unter dem Leitstand: was die Engine sonst beantworten würde.
 *
 * Zurück kommt die Liste der Prompts, die unten ankamen, mit ihrem Kontext und woher sie kamen, damit ein Test das
 * Anschieben sieht. Mit `spalte` zeichnet darunter mehr als ein Teil, wie wenn weitere Mods im Band stehen.
 */
function boden(on: On, x?: { spalte?: boolean; agenten?: () => readonly { id: string; status: string }[]; toasts?: string[] }) {
  const eingang: Eingang[] = []
  zuletzt = ''
  mock.store(on)
  on('classic.Stop', () => ({}) as never)
  on('classic.Notification', () => ({}) as never)
  on('agent.list', () => ({ value: x?.agenten?.() ?? [] }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.toast', (_$, e) => {
    x?.toasts?.push(String((e as { text?: unknown }).text))
    return { value: undefined } as never
  })
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Bau das', usage: {} } as never }))
  on('prompt.submit', (_$, e) => {
    const o = e.origin as { kind: string; name?: string }
    eingang.push({ text: e.text, context: e.context ?? [], origin: o.name ? `${o.kind}:${o.name}` : o.kind })
    zuletzt = e.text
    return { text: e.text, context: e.context, origin: e.origin }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (x?.spalte) {
      return h(Box, { flexDirection: 'column' }, h(Text, {}, 'engine'), h(Text, {}, 'unten')) as RenderElement
    }
    return h(Text, {}, 'engine') as RenderElement
  })
  return eingang
}

type Test$ = {
  session: { start: (e: never) => Promise<unknown>; append: (e: never) => Promise<unknown> }
  turn: { start: (e: never) => Promise<unknown>; complete: (e: never) => Promise<unknown> }
  tool: { call: (e: never) => Promise<unknown> }
  command: { run: (e: never) => Promise<{ text?: unknown }> }
  prompt: { submit: (e: never) => Promise<unknown> }
  classic: { Stop: (e: never) => Promise<unknown> }
}

async function start($: Test$) {
  await $.session.start({ cwd: '/projekt', surface: 'desktop', isInteractive: true } as never)
}

/** /autopilot, wie getippt. */
async function befehl($: Test$, args = '') {
  const r = await $.command.run({ command: 'autopilot', args } as never)
  return String(r.text ?? '')
}

/** Ein Befehl, wie getippt, am Rechner oder vom Handy (Remote Control). */
async function befehl$($: Test$, name: string, args = '', kind: 'composer' | 'bridge' = 'composer') {
  const r = await $.command.run({ command: name, args, origin: { kind } } as never)
  return String(r.text ?? '')
}

/** Die Person schreibt selbst. */
async function person($: Test$, text: string) {
  await $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false } as never)
}

/** Was die Engine am Ende einer Runde als laufende Hintergrundarbeit meldet (`background_tasks`). */
type Aufgabe = { id: string; type: string; status: string; description: string }
const ARBEITER: Aufgabe = { id: 'a1', type: 'subagent', status: 'running', description: 'Einstellungen untersuchen' }
const ARBEITER2: Aufgabe = { id: 'a2', type: 'subagent', status: 'running', description: 'Typen prüfen' }
const SHELL: Aufgabe = { id: 'b1', type: 'shell', status: 'running', description: 'Dev-Server' }
const MONITOR: Aufgabe = { id: 'm1', type: 'monitor', status: 'running', description: 'Log beobachten' }
const WORKFLOW: Aufgabe = { id: 'w1', type: 'workflow', status: 'running', description: 'Prüfen und berichten' }

/**
 * Eine Runde der Hauptschleife: Start, Werkzeugaufrufe, Ende. Wie in der Engine kommt vor dem Ende einer
 * beantworteten Runde `classic.Stop` mit der Hintergrundarbeit, die noch läuft; nach einem Fehler oder einer
 * Unterbrechung nicht. `stop: false` lässt es aus.
 */
async function runde(
  $: Test$,
  id: string,
  antwort: string,
  x?: { werkzeuge?: number; reason?: string; hintergrund?: readonly Aufgabe[]; stop?: boolean; text?: string },
) {
  await $.turn.start({ text: x?.text ?? zuletzt, turnId: id } as never)
  for (let i = 0; i < (x?.werkzeuge ?? 1); i += 1) {
    await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  }
  const reason = x?.reason ?? 'answer'
  if (reason === 'answer' && x?.stop !== false) {
    await $.classic.Stop({ stop_hook_active: false, background_tasks: x?.hintergrund ?? [] } as never)
  }
  await $.turn.complete({ answer: antwort, durationMs: 1000, isAborted: reason === 'aborted', turnId: id, reason } as never)
}

/** Die Anstöße des Autopiloten: eingereicht vom Leitstand, mit dem Text WEITER. */
const angeschoben = (eingang: Eingang[]) => eingang.filter(p => p.origin === 'plugin:leitstand' && p.text === WEITER)

/**
 * Der Knopf 🅰️, so weit der Autopilot ihn sieht: Ein Druck legt seine Zeit als Wunsch, die Schicht zu beenden, in
 * `autopilotStop`. Hier schiebt ein Hook unter dem Leitstand den Wunsch beim Lesen unter; die zurückgegebene Funktion
 * drückt. Das /autopilot-aus, das der Knopf danach anstößt, wartet, bis die Sitzung still ist; wo es darauf ankommt,
 * schickt ein Test es selbst hinterher.
 */
function knopf(on: On) {
  let wunsch: unknown = undefined
  on('state.get', async (_$, e, next) => {
    const r = await next(e)
    if (wunsch === undefined || (e as { key?: string }).key !== 'autopilotStop') {
      return r
    }
    // Das Lesen kommt als { value: { value, version } } zurück: Der innere Wert ist der, den der Autopilot liest.
    return { value: { ...(r as { value: { version: number } }).value, value: wunsch } } as never
  })
  return (wann: unknown) => {
    wunsch = wann
  }
}

async function leiste(ui: { findAll: (q: { type: string }) => Promise<{ text: string; children: unknown[] }[]> }) {
  return (await ui.findAll({ type: 'Text' }))
    .filter(t => t.children.every(k => typeof k === 'string'))
    .map(t => t.text)
    .join(' | ')
}

/** Ein Mod, der den Zustand des Autopiloten im Leitstand liest, wie es jeder Mod darf. */
const LESER = {
  name: 'leser',
  register(on: On) {
    on('command.run', { command: 'schicht-lesen' }, async $ => {
      const { value } = (await $.state.get({ plugin: 'leitstand', key: 'autopilotSchicht' } as never)) as { value?: unknown }
      return { text: JSON.stringify(value ?? null) }
    })
  },
}

async function schichtLesen($: Test$) {
  const r = await $.command.run({ command: 'schicht-lesen', args: '' } as never)
  return JSON.parse(String(r.text)) as { runden?: number; angeschoben?: boolean; leerlauf?: number } | null
}

test('istFertig sieht die Marke nur in den letzten Zeilen', () => {
  expect(istFertig(`Alles erledigt.\n\n${FERTIG}`)).toBe(true)
  expect(istFertig(`Übergabe\n${FERTIG.toLowerCase()}\n`)).toBe(true)
  expect(istFertig(`Wenn ich fertig bin, schreibe ich ${FERTIG}.\nZeile\nZeile\nZeile`)).toBe(false)
  expect(istFertig('Soll ich weitermachen?')).toBe(false)
})

test('die alte Marke der Nachtschicht zählt nicht mehr', () => {
  expect(FERTIG).toBe('AUTOPILOT-FERTIG')
  expect(istFertig('Alles erledigt.\n\nNACHTSCHICHT-FERTIG')).toBe(false)
})

test('die Texte an Claude nennen den Autopiloten und nur die neue Marke', () => {
  expect(KONTEXT).toStartWith('Der Autopilot ist an:')
  expect(KONTEXT).toContain(FERTIG)
  expect(WEITER).toContain('den Autopiloten eingeschaltet')
  expect(FRAGE_ABGELEHNT).toStartWith('Autopilot:')
  for (const text of [KONTEXT, WEITER, FRAGE_ABGELEHNT]) {
    expect(text).not.toMatch(/nachtschicht/i)
  }
})

test('die Texte an Claude und im Chat stehen in sauberem Deutsch, mit Umlauten', () => {
  for (const text of [KONTEXT, WEITER]) {
    expect(text).toContain('Stell keine Rückfragen')
    expect(text).toContain('die du empfehlen würdest')
    expect(text).toContain('rückgängig machen lässt')
    expect(text).toContain('ausdrücklich verlangt')
    expect(text).toContain('nichts löschen, veröffentlichen')
    expect(text).toContain('kurze Übergabe')
  }
  expect(FRAGE_ABGELEHNT).toContain('empfehlen würdest')
  const alle = [KONTEXT, WEITER, FRAGE_ABGELEHNT, GRUND_FERTIG, GRUND_KNOPF, GRUND_GRENZE, ...AUTOPILOT_BEFEHLE.flatMap(b => [b.description, b.tut, b.knopf])]
  for (const text of alle) {
    expect(text).not.toMatch(/Rueck|rueck|wuerd|laess|ausdrueck|loesch|veroeff|Ueberg|laeuft|waehrend|raeum/)
  }
})

test('die Antworten von /autopilot stehen in sauberem Deutsch', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  boden(on)
  await start($ as never)
  expect(await befehl($ as never)).toBe(
    'Der Autopilot ist an: Claude arbeitet ohne Rückfragen weiter und schreibt am Ende eine Übergabe. ' +
      'Freigabe-Dialoge halten ihn trotzdem an. /autopilot schaltet ihn wieder aus.',
  )
  expect(await befehl($ as never, 'an')).toBe('Der Autopilot läuft schon. /autopilot aus beendet ihn.')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await leiste(ui as never)).toContain('Claude arbeitet ohne Rückfragen weiter')
})

test('ohne Schicht passiert nichts', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await person($ as never, 'Bau das.')
  await runde($ as never, 't1', 'Soll ich weitermachen?')
  expect(angeschoben(eingang)).toHaveLength(0)
  expect(eingang[0]?.context).toEqual([])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
  const text = await leiste(ui as never)
  expect(text).toContain('engine')
  expect(text).not.toContain('Autopilot:')
})

test('eingeschaltet vor dem Auftrag: Kontext am Auftrag, nach einer offenen Runde wird angeschoben', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)

  expect(await befehl($ as never)).toContain('Der Autopilot ist an')
  // Noch keine Runde: nichts anzuschieben.
  expect(angeschoben(eingang)).toHaveLength(0)

  await person($ as never, 'Bau das.')
  expect(eingang[0]?.context).toContain(KONTEXT)

  await runde($ as never, 't1', 'Ich habe angefangen. Soll ich mit Teil B weitermachen?')
  const schub = angeschoben(eingang)
  expect(schub).toHaveLength(1)
  expect(schub[0]?.text).toBe(WEITER)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: props() })
    const text = await leiste(ui as never)
    expect(text).toContain('Autopilot:')
    expect(text).toContain('1x angeschoben')
    expect(text.indexOf('Autopilot')).toBeLessThan(text.indexOf('engine'))
    expect(await ui.find({ type: 'Button', key: 'ap-beenden' })).toBeDefined()
  }
})

test('eingeschaltet nach einer Runde: Claude macht gleich weiter', OHNE_LEITSTAND, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await person($ as never, 'Bau das.')
  await runde($ as never, 't1', 'Welche Variante willst du?')

  expect(await befehl($ as never)).toContain('gleich weiter')
  // Erst wenn der Befehl durch ist.
  expect(angeschoben(eingang)).toHaveLength(0)
  await clock.advance(1000)
  expect(angeschoben(eingang)).toHaveLength(1)
})

test('wer gleich nach dem Einschalten wieder ausschaltet, schiebt nichts an', OHNE_LEITSTAND, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await runde($ as never, 't1', 'Welche Variante willst du?')
  await befehl($ as never)
  await befehl($ as never, 'aus')
  await clock.advance(5000)
  expect(angeschoben(eingang)).toHaveLength(0)
})

test('eine Rückfrage beantwortet die Schicht selbst und merkt sie sich', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  boden(on)
  await start($ as never)

  const frage = {
    tool: 'AskUserQuestion',
    questions: [{ question: 'Welche Datenbank?', header: 'DB', multiSelect: false, options: [] }],
  }
  // Ohne Schicht geht die Frage durch.
  const ohne = (await $.tool.call(frage as never)) as { result?: unknown; deny?: string }
  expect(ohne.deny).toBeUndefined()
  expect(ohne.result).toBe('ok')

  await befehl($ as never, 'an')
  const mit = (await $.tool.call(frage as never)) as { result?: unknown; deny?: string }
  expect(mit.deny).toBe(FRAGE_ABGELEHNT)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await leiste(ui as never)).toContain('1 Frage selbst entschieden')
  await ui.press({ key: 'ap-fragen' })
  expect(await leiste(ui as never)).toContain('Welche Datenbank?')
})

test('mit der Marke endet der Autopilot: Bericht mit Weg, eine neue Nachricht schaltet ihn nicht wieder ein', { plugins: [LESER], options: AUS }, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  await runde($ as never, 't1', `Fertig. Übergabe: alles gebaut.\n${FERTIG}`)
  expect(angeschoben(eingang)).toHaveLength(0)
  // Keine Schicht mehr: Auch der Knopf 🅰️, der sie liest, ist aus.
  expect(await schichtLesen($ as never)).toBeNull()

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: props() })
    expect(await leiste(ui as never)).toContain(`vorbei, ${GRUND_FERTIG}, nach 0 min: 0x angeschoben`)
    expect(await ui.find({ type: 'Button', key: 'ap-weg' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'ap-beenden' })).toBeUndefined()
  }

  await person($ as never, 'Jetzt noch das hier.')
  await runde($ as never, 't2', 'Halb fertig.')
  expect(angeschoben(eingang)).toHaveLength(0)
  expect(await schichtLesen($ as never)).toBeNull()
  expect(await befehl($ as never, 'aus')).toBe('Der Autopilot war nicht an.')
})

test('nach der Marke keine Anstöße mehr und kein Kontext an der nächsten Nachricht', OHNE_LEITSTAND, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  expect(eingang.at(-1)?.context).toContain(KONTEXT)
  await runde($ as never, 't1', 'Teil A steht.')
  expect(angeschoben(eingang)).toHaveLength(1)
  await runde($ as never, 't2', `Alles erledigt.\n\n${FERTIG}`, { text: WEITER })
  expect(angeschoben(eingang)).toHaveLength(1)
  await clock.advance(30 * 60_000)
  expect(angeschoben(eingang)).toHaveLength(1)

  await person($ as never, 'Was hast du gemacht?')
  expect(eingang.at(-1)?.context).toEqual([])
  await runde($ as never, 't3', 'Das hier.')
  await clock.advance(30 * 60_000)
  await person($ as never, 'Und sonst?')
  expect(eingang.at(-1)?.context).toEqual([])
  await runde($ as never, 't4', 'Nichts.', { reason: 'error' })
  await clock.advance(5 * 60_000)
  expect(angeschoben(eingang)).toHaveLength(1)
})

test('an der Rundengrenze endet der Autopilot mit Grund Rundengrenze, die nächste Nachricht startet ihn nicht neu', grenze(2), async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  await runde($ as never, 't1', 'Weiter?')
  await runde($ as never, 't2', 'Weiter?')
  await runde($ as never, 't3', 'Weiter?')
  expect(angeschoben(eingang)).toHaveLength(2)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: props() })
    expect(await leiste(ui as never)).toContain(`vorbei, ${GRUND_GRENZE}, nach 0 min: 2x angeschoben`)
    expect(await ui.find({ type: 'Button', key: 'ap-weg' })).toBeDefined()
  }

  // Vorbei ist vorbei: Die nächste Nachricht geht ohne Kontext raus, nach ihrer Runde schiebt nichts an.
  await person($ as never, 'Was bedeuten die Zahlen?')
  expect(eingang.at(-1)?.context).toEqual([])
  await runde($ as never, 't4', 'Die Zahlen sind ...')
  expect(angeschoben(eingang)).toHaveLength(2)
})

test('nur eine Nachricht der Person setzt den Rundenzähler zurück, auch mitten in einer Runde', grenze(2), async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  await runde($ as never, 't1', 'Teil A steht.')
  // Eine Fertigmeldung aus dem Hintergrund und eine andere Sitzung zählen nicht als Nachricht der Person.
  await $.prompt.submit({ text: '<task-notification>fertig</task-notification>', origin: { kind: 'task-notification' }, wait: false } as never)
  await $.prompt.submit({ text: 'Bericht', origin: { kind: 'peer' }, wait: false } as never)
  // Der Anstoß nach t1 stand zuerst in der Schlange: t2 ist seine Runde.
  await runde($ as never, 't2', 'Teil B steht.', { text: WEITER })
  expect(angeschoben(eingang)).toHaveLength(2)

  // Die Person schreibt mitten in der Runde t3: Der Zähler beginnt von vorn.
  await $.turn.start({ text: WEITER, turnId: 't3' } as never)
  await $.prompt.submit({ text: 'Und noch der Knopf.', origin: { kind: 'composer' }, wait: false, turnId: 't3' } as never)
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as never)
  await $.turn.complete({ answer: 'Teil C steht.', durationMs: 1000, isAborted: false, turnId: 't3', reason: 'answer' } as never)
  await runde($ as never, 't4', 'Teil D steht.')
  expect(angeschoben(eingang)).toHaveLength(4)

  await runde($ as never, 't5', 'Teil E steht.')
  expect(angeschoben(eingang)).toHaveLength(4)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await leiste(ui as never)).toContain(`vorbei, ${GRUND_GRENZE}`)
})

test('der Rundenzähler steht im Zustand der Schicht, so dass ein Neuladen ihn nicht verliert', { plugins: [LESER], options: { ...AUS, autopilotMaxRunden: 3 } }, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  boden(on)
  await start($ as never)
  await befehl($ as never)
  expect((await schichtLesen($ as never))?.runden).toBe(0)
  await person($ as never, 'Bau das.')
  await runde($ as never, 't1', 'Teil A steht.')
  await runde($ as never, 't2', 'Teil B steht.')
  expect((await schichtLesen($ as never))?.runden).toBe(2)
  await person($ as never, 'Weiter so.')
  expect((await schichtLesen($ as never))?.runden).toBe(0)
})

test('zwei angeschobene Runden ohne Werkzeug: die Schicht hält an', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  await runde($ as never, 't1', 'Soll ich?')
  await runde($ as never, 't2', 'Ich brauche dich.', { werkzeuge: 0 })
  await runde($ as never, 't3', 'Ich brauche dich wirklich.', { werkzeuge: 0 })
  expect(angeschoben(eingang)).toHaveLength(2)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
  expect(await leiste(ui as never)).toContain('kommt ohne dich nicht weiter')
})

test('die Leerlauf-Bremse hängt nicht am eigenen prompt.submit-Hook und steht im Zustand der Schicht', { plugins: [LESER], options: AUS }, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  await runde($ as never, 't1', 'Soll ich?')
  // anschieben selbst markiert die nächste Runde, nicht erst der prompt.submit-Hook.
  const nachT1 = await schichtLesen($ as never)
  expect(nachT1?.angeschoben).toBe(true)
  expect(nachT1?.leerlauf).toBe(0)
  await runde($ as never, 't2', 'Ich warte.', { werkzeuge: 0 })
  expect((await schichtLesen($ as never))?.leerlauf).toBe(1)
  await runde($ as never, 't3', 'Ich warte weiter.', { werkzeuge: 0 })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
  expect(await leiste(ui as never)).toContain('kommt ohne dich nicht weiter')
  // Eine Nachricht der Person setzt die Bremse zurück.
  await befehl($ as never, 'an')
  await person($ as never, 'Weiter so.')
  const neu = await schichtLesen($ as never)
  expect(neu?.leerlauf).toBe(0)
  expect(neu?.angeschoben).toBe(false)
})

test('solange Hintergrundarbeit läuft, schiebt der Autopilot nicht an; erst nach einer Runde ohne', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  // Claude hat zwei Arbeiter gestartet und wartet.
  await runde($ as never, 't1', 'Zwei Arbeiter laufen, ich warte.', { hintergrund: [ARBEITER, ARBEITER2] })
  expect(angeschoben(eingang)).toHaveLength(0)
  // Die erste Fertigmeldung startet eine Runde; der zweite läuft noch.
  await runde($ as never, 't2', 'Einer ist fertig, ich warte auf den zweiten.', { werkzeuge: 0, hintergrund: [ARBEITER2] })
  expect(angeschoben(eingang)).toHaveLength(0)
  // Die letzte Fertigmeldung: Nichts läuft mehr, die Runde endet ohne Abschluss.
  await runde($ as never, 't3', 'Beide fertig, Teil B steht noch aus.')
  expect(angeschoben(eingang)).toHaveLength(1)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await leiste(ui as never)).toContain('1x angeschoben')
})

test('nur Agenten und Workflows halten das Anschieben zurück, Hintergrund-Shells und Monitore nicht', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  // Nur ein Dev-Server läuft im Hintergrund: Er meldet sich nie fertig, also wird angeschoben.
  await runde($ as never, 't1', 'Der Server läuft, Teil B steht aus.', { hintergrund: [SHELL] })
  expect(angeschoben(eingang)).toHaveLength(1)
  await runde($ as never, 't2', 'Ich beobachte das Log.', { hintergrund: [SHELL, MONITOR] })
  expect(angeschoben(eingang)).toHaveLength(2)
  // Ein Agent läuft (neben der Shell): kein Anstoß.
  await runde($ as never, 't3', 'Der Arbeiter läuft, ich warte.', { hintergrund: [SHELL, ARBEITER] })
  expect(angeschoben(eingang)).toHaveLength(2)
  // Ein Workflow läuft: ebenso kein Anstoß.
  await runde($ as never, 't4', 'Der Workflow läuft, ich warte.', { hintergrund: [WORKFLOW] })
  expect(angeschoben(eingang)).toHaveLength(2)
})

test('eine von einem Plugin als Person eingereichte Nachricht setzt den Rundenzähler nicht zurück', grenze(2), async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  await runde($ as never, 't1', 'Teil A steht.')
  expect(angeschoben(eingang)).toHaveLength(1)
  // Der Start-Knopf eines Mods: asUser, die Herkunft bleibt das Plugin.
  await $.prompt.submit({
    text: 'Der Plan sieht gut aus. Leg bitte los.',
    origin: { kind: 'plugin', name: 'anderer-mod', asUser: true },
    wait: false,
  } as never)
  // Der Anstoß nach t1 stand zuerst in der Schlange: t2 ist seine Runde.
  await runde($ as never, 't2', 'Teil B steht.', { text: WEITER })
  expect(angeschoben(eingang)).toHaveLength(2)
  await runde($ as never, 't3', 'Teil C steht.')
  expect(angeschoben(eingang)).toHaveLength(2)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await leiste(ui as never)).toContain(`vorbei, ${GRUND_GRENZE}`)
})

test('eine in der Desktop-App getippte Nachricht (sdk) zählt als Nachricht der Person und setzt den Rundenzähler zurück', grenze(2), async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await $.prompt.submit({ text: 'Bau das.', origin: { kind: 'sdk' }, wait: false } as never)
  expect(eingang[0]?.context).toContain(KONTEXT)
  await runde($ as never, 't1', 'Teil A steht.')
  expect(angeschoben(eingang)).toHaveLength(1)
  await $.prompt.submit({ text: 'Und noch der Knopf.', origin: { kind: 'sdk' }, wait: false } as never)
  await runde($ as never, 't2', 'Teil B steht.', { text: WEITER })
  expect(angeschoben(eingang)).toHaveLength(2)
  // Ohne Zurücksetzen wäre hier mit Grenze 2 Schluss.
  await runde($ as never, 't3', 'Teil C steht.')
  expect(angeschoben(eingang)).toHaveLength(3)
})

test('eine Nachricht vom Handy (bridge) bekommt den Kontext wie eine am Rechner', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await $.prompt.submit({ text: 'Bau das.', origin: { kind: 'bridge' }, wait: false } as never)
  expect(eingang[0]?.context).toContain(KONTEXT)
})

test('wartende Runden zählen nicht gegen die Rundengrenze', grenze(1), async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  for (const id of ['t1', 't2', 't3']) {
    await runde($ as never, id, 'Ich warte auf den Arbeiter.', { werkzeuge: 0, hintergrund: [ARBEITER] })
  }
  await runde($ as never, 't4', 'Der Arbeiter ist fertig, Teil B steht aus.')
  expect(angeschoben(eingang)).toHaveLength(1)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await leiste(ui as never)).toContain('Claude arbeitet ohne Rückfragen weiter')
})

test('eingeschaltet, während ein Arbeiter läuft: kein Anstoß, bis eine Runde ohne Hintergrundarbeit endet', OHNE_LEITSTAND, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await person($ as never, 'Bau das.')
  await runde($ as never, 't1', 'Der Arbeiter läuft, ich warte.', { hintergrund: [ARBEITER] })
  await befehl($ as never)
  await clock.advance(5000)
  expect(angeschoben(eingang)).toHaveLength(0)
  await runde($ as never, 't2', 'Der Arbeiter ist fertig, Teil B steht aus.')
  expect(angeschoben(eingang)).toHaveLength(1)
})

test('ohne Meldung der Engine am Rundenende fragt der Autopilot die Liste der Agenten', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  let agenten: { id: string; status: string }[] = [{ id: 'a1', status: 'running' }]
  const eingang = boden(on, { agenten: () => agenten })
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  await runde($ as never, 't1', 'Ich warte.', { stop: false })
  expect(angeschoben(eingang)).toHaveLength(0)
  agenten = [{ id: 'a1', status: 'completed' }]
  await runde($ as never, 't2', 'Fertig mit A, B steht aus.', { stop: false })
  expect(angeschoben(eingang)).toHaveLength(1)
})

test('nach einem API-Fehler schiebt die Schicht nach einer Minute an', OHNE_LEITSTAND, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  await runde($ as never, 't1', '', { reason: 'error' })
  expect(angeschoben(eingang)).toHaveLength(0)
  await clock.advance(60_000)
  expect(angeschoben(eingang)).toHaveLength(1)
})

test('wer unterbricht, beendet die Schicht; der Bericht bleibt bis Weg', OHNE_LEITSTAND, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  await clock.advance(30 * 60_000)
  await runde($ as never, 't1', '', { reason: 'aborted' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: props() })
    const text = await leiste(ui as never)
    expect(text).toContain('du hast unterbrochen')
    expect(text).toContain('30 min')
    expect(await ui.find({ type: 'Button', key: 'ap-weg' })).toBeDefined()
  }
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  await ui.press({ key: 'ap-weg' })
  expect(await leiste(ui as never)).not.toContain('Autopilot:')
})

test('/autopilot aus beendet ihn, Beenden in der Leiste auch', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  boden(on)
  await start($ as never)
  await befehl($ as never)
  expect(await befehl($ as never, 'aus')).toContain('Der Autopilot ist aus')
  expect(await befehl($ as never, 'aus')).toContain('war nicht an')

  await befehl($ as never, 'an')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  await ui.press({ key: 'ap-beenden' })
  expect(await leiste(ui as never)).toContain('du hast ihn beendet')
})

test('bei einer Umfrage weicht die Leiste', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  boden(on)
  await start($ as never)
  await befehl($ as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props({ hasSurvey: true }) })
  expect(await leiste(ui as never)).toBe('engine')
})

test('die Zeile trägt den Schlüssel autopilot und steht vor allem, was darunter kommt', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  boden(on, { spalte: true })
  await start($ as never)
  await befehl($ as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: props() })
    const text = await leiste(ui as never)
    expect(text.indexOf('Autopilot:')).toBe(0)
    expect(text.indexOf('Autopilot:')).toBeLessThan(text.indexOf('engine'))
    expect(text.indexOf('engine')).toBeLessThan(text.indexOf('unten'))
    // Der Leitstand findet die Zeile an ihrem Schlüssel; der Knopf steht darin, so dass er mitkommt.
    const zeile = (await ui.findAll({ type: 'Box' })).find(b => b.props.key === 'autopilot')
    expect(zeile).toBeDefined()
    expect(JSON.stringify(zeile)).toContain('ap-beenden')
  }
})

type Knoten = { type?: string; key?: string; text?: string; props?: Record<string, unknown>; children?: unknown[] }

const istKnoten = (k: unknown): k is Knoten => typeof k === 'object' && k !== null && 'type' in k
const schluessel = (k: Knoten) => k.key ?? (k.props?.key as string | undefined)

/** Die Knöpfe einer Knopf-Box: ihre direkten Kinder, wenn alle Knöpfe sind. */
function knoepfeIn(k: Knoten) {
  if (k.type !== 'Box' || k.props?.flexDirection !== 'row') {
    return null
  }
  const kinder = (k.children ?? []).filter(istKnoten)
  return kinder.length > 0 && kinder.every(c => c.type === 'Button') ? kinder.map(schluessel) : null
}

/** Die Zeilen-Box, in der "Autopilot:" und die Knopf-Box mit dem Knopf `knopf` direkte Kinder sind, und deren Knöpfe. */
async function zeileMit(ui: { findAll: (q: { type: string }) => Promise<Knoten[]> }, knopfName: string) {
  for (const b of await ui.findAll({ type: 'Box' })) {
    if (b.props?.flexDirection !== 'row') {
      continue
    }
    const kinder = (b.children ?? []).filter(istKnoten)
    const label = kinder.some(k => k.type === 'Text' && (k.text ?? (k.children ?? []).join('')) === 'Autopilot:')
    const knoepfe = kinder.map(knoepfeIn).find(l => l?.includes(knopfName))
    if (label && knoepfe) {
      return { zeile: b, knoepfe }
    }
  }
  return undefined
}

/** Die direkten Kinder der Box `autopilot`. */
async function teile(ui: { findAll: (q: { type: string }) => Promise<Knoten[]> }) {
  const box = (await ui.findAll({ type: 'Box' })).find(b => b.props?.key === 'autopilot' || b.key === 'autopilot')
  return (box?.children ?? []).filter(istKnoten)
}

test('Status und Knöpfe stehen in einer Zeile, die Fragen aufgeklappt darunter', OHNE_LEITSTAND, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  boden(on)
  await start($ as never)
  await befehl($ as never)

  // Läuft, ohne Fragen: genau eine Zeile mit Beenden.
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: props() })
    expect((await zeileMit(ui as never, 'ap-beenden'))?.knoepfe).toEqual(['ap-beenden'])
    expect(await teile(ui as never)).toHaveLength(1)
  }

  // Mit einer Frage: Fragen und Beenden in derselben Zeile, aufgeklappt die Liste darunter.
  const frage = {
    tool: 'AskUserQuestion',
    questions: [{ question: 'Welche Datenbank?', header: 'DB', multiSelect: false, options: [] }],
  }
  await $.tool.call(frage as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: props() })
    expect((await zeileMit(ui as never, 'ap-beenden'))?.knoepfe).toEqual(['ap-fragen', 'ap-beenden'])
    expect(await teile(ui as never)).toHaveLength(1)
  }
  {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    await ui.press({ key: 'ap-fragen' })
  }
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: props() })
    const treffer = await zeileMit(ui as never, 'ap-fragen')
    expect(treffer?.knoepfe).toEqual(['ap-fragen', 'ap-beenden'])
    expect(JSON.stringify(treffer?.zeile)).not.toContain('Welche Datenbank?')
    const stuecke = await teile(ui as never)
    expect(stuecke).toHaveLength(2)
    expect(stuecke[0]?.children).toEqual(treffer?.zeile.children)
    expect(JSON.stringify(stuecke[1])).toContain('Welche Datenbank?')
  }
  {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    await ui.press({ key: 'ap-fragen' })
  }

  // Vorbei: Weg steht in derselben Zeile.
  await clock.advance(60_000)
  await befehl($ as never, 'aus')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: props() })
    // Die Frage aus der Schicht steht im Bericht weiter, daher auch hier Fragen vorn.
    expect((await zeileMit(ui as never, 'ap-weg'))?.knoepfe).toEqual(['ap-fragen', 'ap-weg'])
    expect(await teile(ui as never)).toHaveLength(1)
  }
})

test('vorbei ohne Fragen: nur Weg in der Knopf-Box, eine Zeile', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  boden(on)
  await start($ as never)
  await befehl($ as never)
  await befehl($ as never, 'aus')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: props() })
    expect((await zeileMit(ui as never, 'ap-weg'))?.knoepfe).toEqual(['ap-weg'])
    expect(await teile(ui as never)).toHaveLength(1)
  }
})

// --- Der Knopf 🅰️: Wunsch in autopilotStop, das Aus kommt später ---

test('ein Druck auf 🅰️ beendet die Schicht am Ende der Runde, statt anzuschieben', OHNE_LEITSTAND, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const druck = knopf(on)
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  await runde($ as never, 't1', 'Teil A steht.')
  expect(angeschoben(eingang)).toHaveLength(1)

  // In der angeschobenen Runde drückt die Person 🅰️; ihr /autopilot-aus hängt in der Schlange.
  await clock.advance(60_000)
  druck(1_060_000)
  await runde($ as never, 't2', 'Teil B steht.')
  expect(angeschoben(eingang)).toHaveLength(1)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: props() })
    expect(await leiste(ui as never)).toContain(`vorbei, ${GRUND_KNOPF}, nach 1 min: 1x angeschoben`)
    expect(await ui.find({ type: 'Button', key: 'ap-weg' })).toBeDefined()
  }

  // Eine neue Nachricht bekommt keinen Kontext mehr, und nach ihrer Runde schiebt nichts an.
  await person($ as never, 'Noch eine Frage.')
  expect(eingang.at(-1)?.context).toEqual([])
  await runde($ as never, 't3', 'Antwort.')
  expect(angeschoben(eingang)).toHaveLength(1)

  // Das Aus des Knopfs kommt an, sobald die Sitzung still ist, und meldet die beendete Schicht.
  expect(await befehl$($ as never, 'autopilot-aus')).toBe('Der Autopilot ist aus: 1x angeschoben.')

  // Eine neue Schicht beginnt nach dem Druck: Der alte Wunsch gilt ihr nicht.
  expect(await befehl$($ as never, 'autopilot-an')).toContain('Der Autopilot ist an')
  await person($ as never, 'Weiter mit Teil C.')
  expect(eingang.at(-1)?.context).toContain(KONTEXT)
  await runde($ as never, 't4', 'Teil C halb.')
  expect(angeschoben(eingang)).toHaveLength(2)
})

test('kommt das Aus des Knopfs, während die Sitzung still ist, beendet es die Schicht mit dem Grund 🅰️', OHNE_LEITSTAND, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const druck = knopf(on)
  boden(on)
  await start($ as never)
  await befehl$($ as never, 'autopilot-an')
  await clock.advance(1000)
  druck(1_001_000)
  expect(await befehl$($ as never, 'autopilot-aus')).toBe('Der Autopilot ist aus: 0x angeschoben.')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await leiste(ui as never)).toContain(`vorbei, ${GRUND_KNOPF}`)
})

test('schreibt die Person nach dem Druck auf 🅰️, geht ihre Nachricht ohne Kontext raus, und die Schicht ist vorbei', OHNE_LEITSTAND, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const druck = knopf(on)
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await clock.advance(1000)
  druck(1_001_000)
  await person($ as never, 'Bau das.')
  expect(eingang[0]?.context).toEqual([])
  await runde($ as never, 't1', 'Halb fertig.')
  expect(angeschoben(eingang)).toHaveLength(0)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await leiste(ui as never)).toContain(GRUND_KNOPF)
})

test('kam 🅰️ in der Pause nach einem API-Fehler, endet die Schicht, statt anzuschieben', OHNE_LEITSTAND, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const druck = knopf(on)
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  await runde($ as never, 't1', '', { reason: 'error' })
  await clock.advance(30_000)
  druck(1_030_000)
  await clock.advance(30_000)
  expect(angeschoben(eingang)).toHaveLength(0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
  expect(await leiste(ui as never)).toContain(GRUND_KNOPF)
})

test('ein Wunsch, der nicht nach dem Beginn der Schicht liegt, zählt nicht', OHNE_LEITSTAND, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const druck = knopf(on)
  const eingang = boden(on)
  await start($ as never)
  // Gedrückt, als noch keine Schicht lief, etwa um eine frühere zu beenden.
  druck(1_000_000)
  await clock.advance(1000)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  expect(eingang[0]?.context).toContain(KONTEXT)
  await runde($ as never, 't1', 'Weiter?')
  // Im selben Augenblick wie der Beginn ist nicht jünger.
  druck(1_001_000)
  await runde($ as never, 't2', 'Weiter?')
  expect(angeschoben(eingang)).toHaveLength(2)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await leiste(ui as never)).toContain('2x angeschoben')
  expect(await ui.find({ type: 'Button', key: 'ap-beenden' })).toBeDefined()
})

test('ohne Druck auf 🅰️ schiebt der Autopilot weiter an', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  expect(eingang[0]?.context).toContain(KONTEXT)
  await runde($ as never, 't1', 'Weiter?')
  await runde($ as never, 't2', 'Weiter?')
  expect(angeschoben(eingang)).toHaveLength(2)
  expect(await befehl($ as never, 'aus')).toBe('Der Autopilot ist aus: 2x angeschoben.')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await leiste(ui as never)).toContain('du hast ihn beendet')
})

test('ist der Wunsch keine Zeit, gibt es keinen Wunsch', OHNE_LEITSTAND, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const druck = knopf(on)
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  await clock.advance(1000)
  // Keine Zahl, als Text aber später als der Beginn der Schicht.
  druck('9999999999999')
  await runde($ as never, 't1', 'Weiter?')
  expect(angeschoben(eingang)).toHaveLength(1)
  expect(await befehl($ as never, 'aus')).toBe('Der Autopilot ist aus: 1x angeschoben.')
})

// --- Die Schlange: höchstens ein Anstoß unterwegs ---

/** Eine Runde der Hauptschleife mit dem Text, mit dem sie beginnt; ohne ihr Ende. */
async function rundeBeginnt($: Test$, id: string, text: string) {
  await $.turn.start({ text, turnId: id } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as never)
}

async function rundeEndet($: Test$, id: string, antwort: string) {
  await $.turn.complete({ answer: antwort, durationMs: 1000, isAborted: false, turnId: id, reason: 'answer' } as never)
}

// Transkript 7e3914ee, 2026-10-18 19:20-19:21 UTC: Am Ende von Runde A stellt sich die Nachricht der Person in die
// Schlange, 8 ms vor dem Anstoß W1. Ihre Runde B endet mit einem Plan, der Autopilot schob W2 an, obwohl W1 noch
// wartete. W1 endete mit der Marke, danach lief W2 trotzdem.
test('wartet ein Anstoß noch in der Schlange, kommt kein zweiter dazu; nach der Marke läuft keiner mehr', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Gib mir das Zip.')
  await runde($ as never, 'tA', 'Plan: 1. Zip prüfen 2. schicken. Ich warte auf deine Freigabe.')
  expect(angeschoben(eingang)).toHaveLength(1) // W1, steht in der Schlange hinter der Nachricht der Person
  await person($ as never, 'und den Prompt')
  await rundeBeginnt($ as never, 'tB', 'und den Prompt')
  await rundeEndet($ as never, 'tB', 'Plan: 1. Prompt 2. Zip 3. schicken. Ich warte auf deine Freigabe.')
  expect(angeschoben(eingang)).toHaveLength(1) // W1 wartet noch: kein W2
  await rundeBeginnt($ as never, 'tC', WEITER)
  await rundeEndet($ as never, 'tC', `Zip und Prompt sind bei dir.\n\n${FERTIG}`)
  expect(angeschoben(eingang)).toHaveLength(1)
})

// Dieselbe Lage, nur startet die Engine W1 schon, bevor das turn.complete von B durch ist.
test('startet schon die nächste Runde, bevor das Ende der vorigen verarbeitet ist, schiebt dieses Ende nicht an', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Gib mir das Zip.')
  await runde($ as never, 'tA', 'Plan. Ich warte auf deine Freigabe.')
  expect(angeschoben(eingang)).toHaveLength(1)
  await person($ as never, 'und den Prompt')
  await rundeBeginnt($ as never, 'tB', 'und den Prompt')
  await $.turn.start({ text: WEITER, turnId: 'tC' } as never)
  await rundeEndet($ as never, 'tB', 'Plan. Ich warte auf deine Freigabe.')
  expect(angeschoben(eingang)).toHaveLength(1)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as never)
  await rundeEndet($ as never, 'tC', `Fertig.\n\n${FERTIG}`)
  expect(angeschoben(eingang)).toHaveLength(1)
})

// Ein Anstoß, der nie beginnt (etwa aus der Schlange genommen), darf den Autopiloten nicht für immer sperren.
test('ein Anstoß, der in 10 Minuten Ruhe nicht beginnt, verfällt; danach wird wieder angeschoben', OHNE_LEITSTAND, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau das.')
  await runde($ as never, 'tA', 'Teil A steht.')
  expect(angeschoben(eingang)).toHaveLength(1)
  // W1 geht verloren. Vor Ablauf der Frist sperrt er noch.
  await clock.advance(9 * 60_000)
  await person($ as never, 'Und Teil B?')
  await runde($ as never, 'tB', 'Teil B halb.')
  expect(angeschoben(eingang)).toHaveLength(1)
  // 10 Minuten Ruhe nach dem Ende von tB: verfallen.
  await clock.advance(10 * 60_000)
  await person($ as never, 'Weiter.')
  await runde($ as never, 'tC', 'Teil B fast.')
  expect(angeschoben(eingang)).toHaveLength(2)
})

// Die Frist zählt nur die Ruhe: Läuft vor dem Anstoß eine lange Runde der Person, wartet er zu Recht.
test('eine lange Runde vor dem wartenden Anstoß lässt ihn nicht verfallen', OHNE_LEITSTAND, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Gib mir das Zip.')
  await runde($ as never, 'tA', 'Plan. Ich warte auf deine Freigabe.')
  expect(angeschoben(eingang)).toHaveLength(1)
  await person($ as never, 'und den Prompt')
  await rundeBeginnt($ as never, 'tB', 'und den Prompt')
  await clock.advance(15 * 60_000)
  await rundeEndet($ as never, 'tB', 'Plan. Ich warte auf deine Freigabe.')
  expect(angeschoben(eingang)).toHaveLength(1)
  await rundeBeginnt($ as never, 'tC', WEITER)
  await rundeEndet($ as never, 'tC', `Fertig.\n\n${FERTIG}`)
  expect(angeschoben(eingang)).toHaveLength(1)
})

// --- Die Befehle ---

const NAMEN = ['leitstand:autopilot-an', 'leitstand:autopilot-aus', 'leitstand:autopilot-fragen-zeigen', 'leitstand:autopilot-bericht-weg']
const KURZ = ['autopilot-an', 'autopilot-aus', 'autopilot-fragen-zeigen', 'autopilot-bericht-weg']

test('die Tabelle der Befehle ist vollständig und steht in der Übersicht des Leitstands, Gruppe Autopilot', () => {
  expect(AUTOPILOT_BEFEHLE.map(b => b.name)).toEqual(NAMEN)
  expect(AUTOPILOT_BEFEHLE.map(b => kurzform(b.name))).toEqual(KURZ)
  for (const b of AUTOPILOT_BEFEHLE) {
    expect(LEITSTAND_BEFEHLE).toContain(b)
    expect(b.gruppe).toBe('Autopilot')
    expect(b.beispiel.startsWith(`/${b.name}`)).toBe(true)
    expect(b.description.length).toBeGreaterThan(20)
    // Den Mod nennt das Menü selbst.
    expect(b.description).not.toContain('(Leitstand)')
  }
})

type Angemeldet = { name: string; description: string; argumentHint?: string; immediate?: boolean }

/** Startet die Sitzung und gibt zurück, welche Befehle der Leitstand dabei angemeldet hat. */
async function angemeldet($: Test$, on: On): Promise<Angemeldet[]> {
  const liste: Angemeldet[] = []
  mock.store(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('tool.register', () => ({ value: undefined }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('command.register', (_$, e) => {
    liste.push(e as never)
    return { value: { command: e.name } }
  })
  await start($)
  return liste
}

test('angemeldet: /autopilot vom Autopiloten, die Kurzformen vom Leitstand, alle sofort; keine Langform, kein alter Name', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const liste = await angemeldet($ as never, on)
  const grund = liste.filter(a => a.name === 'autopilot')
  expect(grund).toHaveLength(1)
  expect(grund[0]?.argumentHint).toBe('[an|aus]')
  expect(grund[0]?.immediate).toBe(true)
  expect(grund[0]?.description).toBe(`${AUTOPILOT_GRUNDBEFEHL.description} (Leitstand)`)
  for (const b of AUTOPILOT_BEFEHLE) {
    // Ein Name mit Doppelpunkt lässt sich nicht anmelden; die Datei in commands/ bringt ihn ins Menü.
    expect(liste.find(a => a.name === b.name)).toBeUndefined()
    const kurz = liste.find(a => a.name === kurzform(b.name))
    expect(kurz?.description).toBe(`${b.description} (Leitstand)`)
    expect(kurz?.immediate).toBe(true)
  }
  expect(liste.find(a => a.name === 'autopilot-hilfe' || a.name.startsWith('autopilot:'))).toBeUndefined()
})

for (const b of AUTOPILOT_BEFEHLE) {
  test(`/${b.name} und seine Kurzform erklären sich mit hilfe wie mit ?`, OHNE_LEITSTAND, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    boden(on)
    await start($ as never)
    for (const name of [b.name, kurzform(b.name) ?? '']) {
      for (const arg of ['hilfe', '?', ' Hilfe ']) {
        const t = await befehl$($ as never, name, arg)
        expect(t).toBe(befehlsHilfe(b))
        for (const teil of [`/${b.name}: `, '\nWas: ', '\nKnopf: ', '\nGilt: ', '\nArgumente: ', '\nBeispiel: /leitstand:', `\nKurzform: /${kurzform(b.name)}`]) {
          expect(t).toContain(teil)
        }
      }
    }
    // Hilfe ändert nichts: kein Autopilot, keine Zeile.
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    expect(await leiste(ui as never)).not.toContain('Autopilot:')
  })
}

test('/autopilot hilfe erklärt den Grundbefehl und schaltet nichts', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  boden(on)
  await start($ as never)
  for (const arg of ['hilfe', '?']) {
    const t = await befehl($ as never, arg)
    expect(t).toBe(befehlsHilfe(AUTOPILOT_GRUNDBEFEHL))
    expect(t).toStartWith('/autopilot: ')
    expect(t).toContain('Argumente: an oder aus. Ohne Argument schaltet er um.')
  }
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await leiste(ui as never)).not.toContain('Autopilot:')
})

test('/leitstand:hilfe nennt die Befehle des Autopiloten unter Autopilot, je mit einer Zeile', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  boden(on)
  await start($ as never)
  const zeilen = (await befehl$($ as never, 'leitstand:hilfe')).split('\n')
  const gruppe = zeilen.indexOf('Autopilot')
  expect(gruppe).toBeGreaterThan(zeilen.indexOf('Helfer'))
  for (const [i, b] of AUTOPILOT_BEFEHLE.entries()) {
    expect(zeilen[gruppe + 1 + i]).toBe(`/${b.name}: ${b.description}`)
  }
})

test('/leitstand:autopilot-an und -aus wirken wie /autopilot an und der Knopf Beenden, die Kurzformen ebenso', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  boden(on)
  await start($ as never)
  for (const [an, aus] of [
    ['leitstand:autopilot-an', 'leitstand:autopilot-aus'],
    ['autopilot-an', 'autopilot-aus'],
  ] as const) {
    expect(await befehl$($ as never, an)).toContain('Der Autopilot ist an')
    expect(await befehl$($ as never, an)).toBe('Der Autopilot läuft schon. /autopilot aus beendet ihn.')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    expect(await leiste(ui as never)).toContain('Claude arbeitet ohne Rückfragen weiter')
    expect(await ui.find({ type: 'Button', key: 'ap-beenden' })).toBeDefined()

    expect(await befehl$($ as never, aus)).toBe('Der Autopilot ist aus: 0x angeschoben.')
    const danach = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    expect(await leiste(danach as never)).toContain('vorbei, du hast ihn beendet')
    expect(await danach.find({ type: 'Button', key: 'ap-weg' })).toBeDefined()
    expect(await befehl$($ as never, aus)).toBe('Der Autopilot war nicht an.')
  }
})

test('/autopilot-an schiebt nach einer Runde gleich an, wie /autopilot an', OHNE_LEITSTAND, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await person($ as never, 'Bau das.')
  await runde($ as never, 't1', 'Soll ich weitermachen?')
  expect(await befehl$($ as never, 'autopilot-an')).toContain('Es macht jetzt gleich weiter.')
  await clock.advance(1000)
  expect(angeschoben(eingang)).toHaveLength(1)
})

test('/leitstand:autopilot-fragen-zeigen nennt die selbst entschiedenen Fragen als Text, auch nach dem Ende und vom Handy', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  boden(on)
  await start($ as never)
  expect(await befehl$($ as never, 'leitstand:autopilot-fragen-zeigen')).toContain('nicht an')
  await befehl$($ as never, 'autopilot-an')
  expect(await befehl$($ as never, 'leitstand:autopilot-fragen-zeigen')).toBe('Claude hat bisher keine Frage selbst entschieden.')
  const frage = (q: string) => ({ tool: 'AskUserQuestion', questions: [{ question: q, header: 'X', multiSelect: false, options: [] }] })
  await $.tool.call(frage('Welche Datenbank?') as never)
  expect(await befehl$($ as never, 'autopilot-fragen-zeigen')).toBe('Diese Frage hat Claude selbst entschieden:\n- Welche Datenbank?')
  await $.tool.call(frage('Welcher Port?') as never)
  await befehl$($ as never, 'autopilot-aus')
  const zwei = 'Diese 2 Fragen hat Claude selbst entschieden:\n- Welche Datenbank?\n- Welcher Port?'
  expect(await befehl$($ as never, 'leitstand:autopilot-fragen-zeigen')).toBe(zwei)
  expect(await befehl$($ as never, 'autopilot-fragen-zeigen', '', 'bridge')).toBe(zwei)
  // Nur Text: die Liste in der Leiste bleibt zu.
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
  expect(await leiste(ui as never)).not.toContain('Welche Datenbank?')
})

test('/leitstand:autopilot-bericht-weg räumt den Bericht weg wie der Knopf Weg', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  boden(on)
  await start($ as never)
  expect(await befehl$($ as never, 'leitstand:autopilot-bericht-weg')).toContain('keinen Bericht')
  await befehl$($ as never, 'autopilot-an')
  expect(await befehl$($ as never, 'autopilot-bericht-weg')).toContain('läuft noch')
  await befehl$($ as never, 'autopilot-aus')
  expect(await befehl$($ as never, 'leitstand:autopilot-bericht-weg')).toBe('Der Bericht des Autopiloten ist weg.')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await leiste(ui as never)).not.toContain('Autopilot:')

  // Der Knopf: derselbe Zustand.
  await befehl$($ as never, 'autopilot-an')
  await befehl$($ as never, 'autopilot-aus')
  const knopfUi = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  await knopfUi.press({ key: 'ap-weg' })
  expect(await leiste(knopfUi as never)).not.toContain('Autopilot:')
})

test('alte Namen: /autopilot-hilfe nennt /leitstand:hilfe; /autopilot-an ist heute die Kurzform und schaltet ein', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  boden(on)
  await start($ as never)
  expect(Object.keys(AUTOPILOT_ALTE)).toEqual(['autopilot-hilfe', ...KURZ])
  expect(ALTE_BEFEHLE.get('autopilot-hilfe')).toBe('leitstand:hilfe')
  for (const kurz of KURZ) {
    expect(ALTE_BEFEHLE.has(kurz)).toBe(false)
  }
  expect(await befehl$($ as never, 'autopilot-hilfe')).toBe('Der Befehl heißt jetzt /leitstand:hilfe.')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await leiste(ui as never)).not.toContain('Autopilot:')
  expect(await befehl$($ as never, 'autopilot-an')).toContain('Der Autopilot ist an')
})

test('scheitert ein Befehl, kommt ein schlichter deutscher Satz', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  boden(on)
  let kaputt = false
  // Ein Hook, der wirft, wird übergangen; einer, der ablehnt, lässt das Lesen scheitern.
  on('state.get', (_$, e, next) => (kaputt ? ({ deny: 'kaputt' } as never) : next(e)))
  await start($ as never)
  kaputt = true
  expect(await befehl$($ as never, 'leitstand:autopilot-an')).toBe(fehlerText('leitstand:autopilot-an'))
  expect(await befehl$($ as never, 'autopilot-aus')).toBe(fehlerText('leitstand:autopilot-aus'))
  expect(await befehl($ as never, 'an')).toBe(fehlerText('autopilot'))
  expect(fehlerText('leitstand:autopilot-an')).toBe('/leitstand:autopilot-an hat nicht geklappt. Versuch es gleich noch einmal.')
})

// --- Herkunft in der gespeicherten Zeile ---

/** Eine Befehlsantwort, wie die Engine sie speichert. */
async function zeileSpeichern($: Engine, text: string, n: number) {
  await $.session.append({
    message: { type: 'system', name: 'local_command', content: [{ type: 'text', text }] },
    door: 'command',
    origin: { kind: 'engine' },
    uuid: `befehl-${n}`,
  } as never)
}

test('die Antworten der Befehle tragen in der gespeicherten Zeile „(gemeldet vom Mod Leitstand)“ statt des Vorsatzes', OHNE_LEITSTAND, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  boden(on)
  const sitzung = mock.session(on)
  await start($ as never)
  const zeilen = () =>
    sitzung.appended().map(z => {
      const b = z.message.content[0]
      return typeof b?.text === 'string' ? b.text : ''
    })

  const an = await befehl$($ as never, 'leitstand:autopilot-an')
  await zeileSpeichern($, `<local-command-stdout>leitstand: ${an}</local-command-stdout>`, 1)
  // Mehrzeilig: die Herkunft in einer eigenen Zeile.
  const frage = { tool: 'AskUserQuestion', questions: [{ question: 'Welche Datenbank?', header: 'X', multiSelect: false, options: [] }] }
  await $.tool.call(frage as never)
  const fragen = await befehl$($ as never, 'autopilot-fragen-zeigen')
  await zeileSpeichern($, `<local-command-stdout>leitstand: ${fragen}</local-command-stdout>`, 2)
  const aus = await befehl($ as never, 'aus')
  await zeileSpeichern($, `<local-command-stdout>leitstand: ${aus}</local-command-stdout>`, 3)
  const hilfe = await befehl$($ as never, 'autopilot-bericht-weg', 'hilfe')
  await zeileSpeichern($, `<local-command-stdout>leitstand: ${hilfe}</local-command-stdout>`, 4)

  expect(zeilen()).toEqual([
    `<local-command-stdout>${an} ${GEMELDET}</local-command-stdout>`,
    `<local-command-stdout>${fragen}\n${GEMELDET}</local-command-stdout>`,
    `<local-command-stdout>${aus} ${GEMELDET}</local-command-stdout>`,
    `<local-command-stdout>${hilfe}\n${GEMELDET}</local-command-stdout>`,
  ])
})

// --- Mit eingeschaltetem Leitstand ---

const LEITSTAND_AN = { options: { ansicht: 'einfach' } }

test('bei laufender Schicht holt der Leitstand die Zeile des Autopiloten ganz nach oben in sein Band', LEITSTAND_AN, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on, { spalte: true })
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau die Preisseite.')
  await $.turn.start({ text: zuletzt, turnId: 't1' } as never)
  await $.tool.call({ tool: PLAN, steps: ['Lies die Notizen', 'Baue die Tabelle'] } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as never)
  await $.turn.complete({ answer: 'Die Notizen sind gelesen.', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  expect(angeschoben(eingang)).toHaveLength(1)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: props() })
    const texte = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    const bei = (wort: string) => texte.findIndex(t => t.includes(wort))
    // Ganz oben, vor der Checkliste des Leitstands und vor allem, was andere Mods darunter zeichnen.
    expect(bei('Autopilot:')).toBe(0)
    expect(bei('1x angeschoben')).toBeLessThan(bei('Lies die Notizen'))
    expect(bei('Lies die Notizen')).toBeLessThan(texte.indexOf('engine'))
    expect(texte.indexOf('engine')).toBeLessThan(texte.indexOf('unten'))
    // Herausgeholt, nicht verdoppelt; der Knopf Beenden bleibt in ihr.
    expect(texte.filter(t => t === 'Autopilot:')).toHaveLength(1)
    const boxen = await ui.findAll({ type: 'Box' })
    const zeile = boxen.filter(b => b.props.key === 'autopilot')
    expect(zeile).toHaveLength(1)
    expect(JSON.stringify(zeile[0])).toContain('ap-beenden')
    await ui.unmount()
  }

  // Beenden wirkt auch, nachdem der Leitstand die Zeile versetzt hat.
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  await ui.press({ key: 'ap-beenden' })
  expect(await leiste(ui as never)).toContain('vorbei, du hast ihn beendet')
})

test('ein Druck auf 🅰️ schaltet den Autopiloten an, der nächste beendet ihn sofort, auch mitten in einer Runde', LEITSTAND_AN, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const toasts: string[] = []
  const runs: string[] = []
  on('command.run', (_$, e, next) => {
    runs.push(e.command)
    return next(e)
  })
  const eingang = boden(on, { toasts })
  await start($ as never)
  const druck = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    await ui.press({ key: 'nightshift' })
    await ui.unmount()
  }
  await person($ as never, 'Bau die Preisseite.')
  await $.turn.start({ text: zuletzt, turnId: 't1' } as never)
  await $.tool.call({ tool: PLAN, steps: ['Lies die Notizen', 'Baue die Tabelle'] } as never)
  // Mitten in der Runde an: Angeschoben wird an ihrem Ende.
  await druck()
  expect(toasts.at(-1)).toBe('Der Autopilot ist an.')
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as never)
  await $.turn.complete({ answer: 'Die Notizen sind gelesen.', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  expect(angeschoben(eingang)).toHaveLength(1)

  // In der angeschobenen Runde aus: sofort, ohne Befehl in der Schlange; an ihrem Ende schiebt nichts an.
  await $.turn.start({ text: WEITER, turnId: 't2' } as never)
  await druck()
  expect(toasts.at(-1)).toBe('Der Autopilot ist aus: Claude macht nur noch diese Runde fertig.')
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as never)
  await $.turn.complete({ answer: 'Die Tabelle steht.', durationMs: 1000, isAborted: false, turnId: 't2', reason: 'answer' } as never)
  expect(angeschoben(eingang)).toHaveLength(1)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await leiste(ui as never)).toContain(`vorbei, ${GRUND_KNOPF}, nach 0 min: 1x angeschoben`)
  await ui.unmount()

  // Wieder an, während Claude wartet: Es geht gleich weiter.
  await druck()
  expect(toasts.at(-1)).toBe('Der Autopilot ist an: Claude macht gleich weiter.')
  await clock.advance(1000)
  expect(angeschoben(eingang)).toHaveLength(2)
  // Kein Befehl lief: Der Druck kam direkt beim Autopiloten an.
  expect(runs).toEqual([])
})

test('wartet ein Plan des Leitstands auf Freigabe, schiebt der Autopilot nicht an; nach dem Start wieder', { options: { ansicht: 'einfach', planFreigeben: true } }, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const eingang = boden(on)
  await start($ as never)
  await befehl($ as never)
  await person($ as never, 'Bau die Preisseite.')
  await $.turn.start({ text: zuletzt, turnId: 't1' } as never)
  const plan = (await $.tool.call({ tool: PLAN, steps: ['Lies die Notizen', 'Baue die Tabelle'] } as never)) as { result?: unknown }
  expect(String(plan.result)).toContain('warte auf ihre Antwort')
  // Ein Werkzeug vor der Freigabe lehnt der Leitstand ab; es zählt nicht als Arbeit.
  expect(((await $.tool.call({ tool: 'Bash', command: 'ls' } as never)) as { deny?: string }).deny).toContain('noch nicht freigegeben')
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as never)
  await $.turn.complete({ answer: 'Ich warte auf deine Freigabe.', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await clock.advance(5000)
  // Kein Anstoß in die Sperre: Den Plan startet der Leitstand (oder die Person mit Start).
  expect(angeschoben(eingang)).toHaveLength(0)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await leiste(ui as never)).toContain('Claude arbeitet ohne Rückfragen weiter')
  await ui.press({ key: 'start' })
  await ui.unmount()
  expect(eingang.at(-1)?.origin).toBe('plugin:leitstand')

  await $.turn.start({ text: eingang.at(-1)?.text ?? '', turnId: 't2' } as never)
  expect(((await $.tool.call({ tool: 'Bash', command: 'ls' } as never)) as { deny?: string }).deny).toBeUndefined()
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as never)
  await $.turn.complete({ answer: 'Die Notizen sind gelesen.', durationMs: 1000, isAborted: false, turnId: 't2', reason: 'answer' } as never)
  expect(angeschoben(eingang)).toHaveLength(1)
})
