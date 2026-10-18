import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'

import { FERTIG, FRAGE_ABGELEHNT, GRUND_FERTIG, GRUND_GRENZE, GRUND_KNOPF, KONTEXT, WEITER, istFertig } from '../hooks/register'

const BAND = { plugin: 'autopilot', component: 'AbovePrompt' } as const

/** Befehlsantworten, wie die Engine sie speichert; zurueck kommen die Zeilen, wie der Mod sie umschrieb. */
async function gespeichert($: Engine, on: On, ...texte: string[]): Promise<string[]> {
    const sitzung = mock.session(on)
    for (const [n, text] of texte.entries()) {
        await $.session.append({
            message: { type: 'system', name: 'local_command', content: [{ type: 'text', text }] },
            door: 'command',
            origin: { kind: 'engine' },
            uuid: `befehl-${n}`,
        } as never)
    }
    return sitzung.appended().map(z => {
        const b = z.message.content[0]
        return typeof b?.text === 'string' ? b.text : ''
    })
}

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

/** Der Prompt, der zuletzt unten ankam: Mit ihm beginnt die naechste Runde, wie in der Engine. */
let zuletzt = ''

/**
 * Der Boden unter dem Mod: was die Engine sonst beantworten wuerde.
 *
 * Zurueck kommt die Liste der Prompts, die unten ankamen, mit ihrem Kontext
 * und woher sie kamen, damit ein Test das Anschieben sieht. Mit `spalte`
 * zeichnet darunter mehr als ein Teil, wie wenn weitere Mods im Band stehen.
 */
function boden(on: On, x?: { spalte?: boolean; agenten?: () => readonly { id: string; status: string }[] }) {
    const eingang: Eingang[] = []
    zuletzt = ''
    on('classic.Stop', (_$, _e, _next) => ({}) as never)
    on('agent.list', (_$, _e, _next) => ({ value: x?.agenten?.() ?? [] }) as never)
    on('session.start', (_$, e, _next) => ({ cwd: e.cwd }))
    on('turn.start', (_$, e, _next) => ({ turnId: e.turnId }))
    on('turn.complete', (_$, e, _next) => ({ text: e.answer }))
    on('tool.call', (_$, _e, _next) => ({ result: 'ok' }))
    on('command.register', (_$, e, _next) => ({ value: { command: e.name } }))
    on('prompt.submit', (_$, e, _next) => {
        const o = e.origin as { kind: string; name?: string }
        eingang.push({ text: e.text, context: e.context ?? [], origin: o.name ? `${o.kind}:${o.name}` : o.kind })
        zuletzt = e.text
        return { text: e.text, context: e.context, origin: e.origin }
    })
    on('ui.render', { component: 'AbovePrompt' }, ($, e, _next) => {
        const { Box, Text } = $.ui.resolve(e)
        if (x?.spalte) {
            return h(Box, { flexDirection: 'column' }, h(Text, {}, 'engine'), h(Text, {}, 'unten')) as RenderElement
        }
        return h(Text, {}, 'engine') as RenderElement
    })
    return eingang
}

type Test$ = {
    session: { start: (e: never) => Promise<unknown> }
    turn: { start: (e: never) => Promise<unknown>; complete: (e: never) => Promise<unknown> }
    tool: { call: (e: never) => Promise<unknown> }
    command: { run: (e: never) => Promise<{ text?: unknown }> }
    prompt: { submit: (e: never) => Promise<unknown> }
    classic: { Stop: (e: never) => Promise<unknown> }
}

async function start($: Test$) {
    await $.session.start({ cwd: '/projekt', surface: 'desktop', isInteractive: true } as never)
}

async function befehl($: Test$, args = '') {
    const r = await $.command.run({ command: 'autopilot', args } as never)
    return String(r.text ?? '')
}

/** Die Person schreibt selbst. */
async function person($: Test$, text: string) {
    await $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false } as never)
}

/** Was die Engine am Ende einer Runde als laufende Hintergrundarbeit meldet (`background_tasks`). */
type Aufgabe = { id: string; type: string; status: string; description: string }
const ARBEITER: Aufgabe = { id: 'a1', type: 'subagent', status: 'running', description: 'Einstellungen untersuchen' }
const ARBEITER2: Aufgabe = { id: 'a2', type: 'subagent', status: 'running', description: 'Typen pruefen' }
const SHELL: Aufgabe = { id: 'b1', type: 'shell', status: 'running', description: 'Dev-Server' }
const MONITOR: Aufgabe = { id: 'm1', type: 'monitor', status: 'running', description: 'Log beobachten' }
const WORKFLOW: Aufgabe = { id: 'w1', type: 'workflow', status: 'running', description: 'Pruefen und berichten' }

/**
 * Eine Runde der Hauptschleife: Start, Werkzeugaufrufe, Ende. Wie in der Engine
 * kommt vor dem Ende einer beantworteten Runde `classic.Stop` mit der Hintergrundarbeit,
 * die noch laeuft; nach einem Fehler oder einer Unterbrechung nicht. `stop: false` laesst es aus.
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

const angeschoben = (eingang: Eingang[]) => eingang.filter(p => p.origin === 'plugin:autopilot')

/**
 * Der Leitstand, so weit der Autopilot ihn sieht: Ein Druck auf 🅰️ legt seine
 * Zeit als Wunsch, die Schicht zu beenden, in den eigenen Zustand. Hier loest
 * ihn ein Befehl aus, die Zeit als Argument. Das /autopilot aus, das der
 * Leitstand danach anstoesst, wartet, bis die Sitzung still ist; wo es darauf
 * ankommt, schickt ein Test es selbst hinterher.
 */
const LEITSTAND = {
    name: 'leitstand',
    register(on: On) {
        on('command.run', { command: 'leitstand-druck' }, async ($, e) => {
            await $.state.set({ plugin: 'leitstand', key: 'autopilotStop' } as never, Number(e.args) as never)
            return { text: '' }
        })
        // Ein Wert, der keine Zeit ist: so, wie er kommt, als Text.
        on('command.run', { command: 'leitstand-text' }, async ($, e) => {
            await $.state.set({ plugin: 'leitstand', key: 'autopilotStop' } as never, e.args as never)
            return { text: '' }
        })
    },
}
const MIT_LEITSTAND = { plugins: [LEITSTAND] }

/** Ein Druck auf 🅰️ im Leitstand, zur Zeit `wann`. */
async function druck($: Test$, wann: number) {
    await $.command.run({ command: 'leitstand-druck', args: String(wann) } as never)
}

async function leiste(ui: { findAll: (q: { type: string }) => Promise<{ text: string; children: unknown[] }[]> }) {
    return (await ui.findAll({ type: 'Text' }))
        .filter(t => t.children.every(k => typeof k === 'string'))
        .map(t => t.text)
        .join(' | ')
}

/**
 * Ein Mod, der den Zustand des Autopiloten liest, wie es jeder Mod darf: Was dort
 * steht, ueberlebt ein Neuladen des Moduls; Variablen des Moduls nicht.
 */
const LESER = {
    name: 'leser',
    register(on: On) {
        on('command.run', { command: 'schicht-lesen' }, async $ => {
            const { value } = (await $.state.get({ plugin: 'autopilot', key: 'schicht' } as never)) as { value?: unknown }
            return { text: JSON.stringify(value ?? null) }
        })
    },
}

test('istFertig sieht die Marke nur in den letzten Zeilen', () => {
    expect(istFertig(`Alles erledigt.\n\n${FERTIG}`)).toBe(true)
    expect(istFertig(`Uebergabe\n${FERTIG.toLowerCase()}\n`)).toBe(true)
    expect(istFertig(`Wenn ich fertig bin, schreibe ich ${FERTIG}.\nZeile\nZeile\nZeile`)).toBe(false)
    expect(istFertig('Soll ich weitermachen?')).toBe(false)
})

test('istFertig nimmt auch die alte Marke an, die laufende Sitzungen noch kennen', () => {
    expect(FERTIG).toBe('AUTOPILOT-FERTIG')
    expect(istFertig('Alles erledigt.\n\nNACHTSCHICHT-FERTIG')).toBe(true)
    expect(istFertig('Uebergabe\nnachtschicht-fertig\n')).toBe(true)
    expect(istFertig('Frueher hiess die Marke NACHTSCHICHT-FERTIG.\nZeile\nZeile\nZeile')).toBe(false)
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
    // Keine Umschreibungen mit ae, oe, ue mehr.
    for (const text of [KONTEXT, WEITER, FRAGE_ABGELEHNT, GRUND_FERTIG, GRUND_KNOPF, GRUND_GRENZE]) {
        expect(text).not.toMatch(/Rueck|rueck|wuerd|laess|ausdrueck|loesch|veroeff|Ueberg|laeuft|waehrend/)
    }
})

test('die Antworten von /autopilot stehen in sauberem Deutsch', async ($, on) => {
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

test('ohne Schicht passiert nichts', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await person($ as never, 'Bau das.')
    await runde($ as never, 't1', 'Soll ich weitermachen?')
    expect(angeschoben(eingang)).toHaveLength(0)
    expect(eingang[0]?.context).toEqual([])
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    expect(await leiste(ui as never)).toBe('engine')
})

test('eingeschaltet vor dem Auftrag: Kontext am Auftrag, nach einer offenen Runde wird angeschoben', async ($, on) => {
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

test('eingeschaltet nach einer Runde: Claude macht gleich weiter', async ($, on) => {
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

test('wer gleich nach dem Einschalten wieder ausschaltet, schiebt nichts an', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await runde($ as never, 't1', 'Welche Variante willst du?')
    await befehl($ as never)
    await befehl($ as never, 'aus')
    await clock.advance(5000)
    expect(angeschoben(eingang)).toHaveLength(0)
})

test('eine Rueckfrage beantwortet die Schicht selbst und merkt sie sich', async ($, on) => {
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

test('mit der Marke endet der Autopilot: Bericht mit Weg, eine neue Nachricht schaltet ihn nicht wieder ein', { plugins: [LESER] }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await befehl($ as never)
    await person($ as never, 'Bau das.')
    await runde($ as never, 't1', `Fertig. Übergabe: alles gebaut.\n${FERTIG}`)
    expect(angeschoben(eingang)).toHaveLength(0)
    // Keine Schicht mehr: Auch der Knopf im Leitstand, der sie liest, ist aus.
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

test('nach der Marke keine Anstoesse mehr und kein Kontext an der naechsten Nachricht', async ($, on) => {
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

test('mit der alten Marke NACHTSCHICHT-FERTIG ist der Autopilot ebenso fertig', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await befehl($ as never)
    await person($ as never, 'Bau das.')
    await runde($ as never, 't1', 'Fertig. Übergabe: alles gebaut.\nNACHTSCHICHT-FERTIG')
    expect(angeschoben(eingang)).toHaveLength(0)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    expect(await leiste(ui as never)).toContain(`vorbei, ${GRUND_FERTIG}`)
})

test('an der Rundengrenze endet der Autopilot mit Grund Rundengrenze, die naechste Nachricht startet ihn nicht neu', { options: { maxRunden: 2 } }, async ($, on) => {
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

    // Vorbei ist vorbei: Die naechste Nachricht geht ohne Kontext raus, nach ihrer Runde schiebt nichts an.
    await person($ as never, 'Was bedeuten die Zahlen?')
    expect(eingang.at(-1)?.context).toEqual([])
    await runde($ as never, 't4', 'Die Zahlen sind ...')
    expect(angeschoben(eingang)).toHaveLength(2)
})

test('nur eine Nachricht der Person setzt den Rundenzaehler zurueck, auch mitten in einer Runde', { options: { maxRunden: 2 } }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await befehl($ as never)
    await person($ as never, 'Bau das.')
    await runde($ as never, 't1', 'Teil A steht.')
    // Eine Fertigmeldung aus dem Hintergrund und eine andere Sitzung zaehlen nicht als Nachricht der Person.
    await $.prompt.submit({ text: '<task-notification>fertig</task-notification>', origin: { kind: 'task-notification' }, wait: false } as never)
    await $.prompt.submit({ text: 'Bericht', origin: { kind: 'peer' }, wait: false } as never)
    // Der Anstoss nach t1 stand zuerst in der Schlange: t2 ist seine Runde.
    await runde($ as never, 't2', 'Teil B steht.', { text: WEITER })
    expect(angeschoben(eingang)).toHaveLength(2)

    // Die Person schreibt mitten in der Runde t3: Der Zaehler beginnt von vorn.
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

async function schichtLesen($: Test$) {
    const r = await $.command.run({ command: 'schicht-lesen', args: '' } as never)
    return JSON.parse(String(r.text)) as { runden?: number; angeschoben?: boolean; leerlauf?: number } | null
}

async function runden($: Test$) {
    const r = await $.command.run({ command: 'schicht-lesen', args: '' } as never)
    return (JSON.parse(String(r.text)) as { runden?: number } | null)?.runden
}

test('der Rundenzaehler steht im Zustand der Schicht, so dass ein Neuladen ihn nicht verliert', { options: { maxRunden: 3 }, plugins: [LESER] }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    boden(on)
    await start($ as never)
    await befehl($ as never)
    expect(await runden($ as never)).toBe(0)
    await person($ as never, 'Bau das.')
    await runde($ as never, 't1', 'Teil A steht.')
    await runde($ as never, 't2', 'Teil B steht.')
    expect(await runden($ as never)).toBe(2)
    await person($ as never, 'Weiter so.')
    expect(await runden($ as never)).toBe(0)
})

test('zwei angeschobene Runden ohne Werkzeug: die Schicht haelt an', async ($, on) => {
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

test('die Leerlauf-Bremse haengt nicht am eigenen prompt.submit-Hook und steht im Zustand der Schicht', { plugins: [LESER] }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    boden(on)
    await start($ as never)
    await befehl($ as never)
    await person($ as never, 'Bau das.')
    await runde($ as never, 't1', 'Soll ich?')
    // anschieben selbst markiert die naechste Runde, nicht erst der prompt.submit-Hook.
    const nachT1 = await schichtLesen($ as never)
    expect(nachT1?.angeschoben).toBe(true)
    expect(nachT1?.leerlauf).toBe(0)
    await runde($ as never, 't2', 'Ich warte.', { werkzeuge: 0 })
    expect((await schichtLesen($ as never))?.leerlauf).toBe(1)
    await runde($ as never, 't3', 'Ich warte weiter.', { werkzeuge: 0 })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    expect(await leiste(ui as never)).toContain('kommt ohne dich nicht weiter')
    // Eine Nachricht der Person setzt die Bremse zurueck.
    await befehl($ as never, 'an')
    await person($ as never, 'Weiter so.')
    const neu = await schichtLesen($ as never)
    expect(neu?.leerlauf).toBe(0)
    expect(neu?.angeschoben).toBe(false)
})

test('solange Hintergrundarbeit laeuft, schiebt der Autopilot nicht an; erst nach einer Runde ohne', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await befehl($ as never)
    await person($ as never, 'Bau das.')
    // Claude hat zwei Arbeiter gestartet und wartet.
    await runde($ as never, 't1', 'Zwei Arbeiter laufen, ich warte.', { hintergrund: [ARBEITER, ARBEITER2] })
    expect(angeschoben(eingang)).toHaveLength(0)
    // Die erste Fertigmeldung startet eine Runde; der zweite laeuft noch.
    await runde($ as never, 't2', 'Einer ist fertig, ich warte auf den zweiten.', { werkzeuge: 0, hintergrund: [ARBEITER2] })
    expect(angeschoben(eingang)).toHaveLength(0)
    // Die letzte Fertigmeldung: Nichts laeuft mehr, die Runde endet ohne Abschluss.
    await runde($ as never, 't3', 'Beide fertig, Teil B steht noch aus.')
    expect(angeschoben(eingang)).toHaveLength(1)

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    expect(await leiste(ui as never)).toContain('1x angeschoben')
})

test('nur Agenten und Workflows halten das Anschieben zurueck, Hintergrund-Shells und Monitore nicht', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await befehl($ as never)
    await person($ as never, 'Bau das.')
    // Nur ein Dev-Server laeuft im Hintergrund: Er meldet sich nie fertig, also wird angeschoben.
    await runde($ as never, 't1', 'Der Server laeuft, Teil B steht aus.', { hintergrund: [SHELL] })
    expect(angeschoben(eingang)).toHaveLength(1)
    await runde($ as never, 't2', 'Ich beobachte das Log.', { hintergrund: [SHELL, MONITOR] })
    expect(angeschoben(eingang)).toHaveLength(2)
    // Ein Agent laeuft (neben der Shell): kein Anstoss.
    await runde($ as never, 't3', 'Der Arbeiter laeuft, ich warte.', { hintergrund: [SHELL, ARBEITER] })
    expect(angeschoben(eingang)).toHaveLength(2)
    // Ein Workflow laeuft: ebenso kein Anstoss.
    await runde($ as never, 't4', 'Der Workflow laeuft, ich warte.', { hintergrund: [WORKFLOW] })
    expect(angeschoben(eingang)).toHaveLength(2)
})

test('eine von einem Plugin als Person eingereichte Nachricht setzt den Rundenzaehler nicht zurueck', { options: { maxRunden: 2 } }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await befehl($ as never)
    await person($ as never, 'Bau das.')
    await runde($ as never, 't1', 'Teil A steht.')
    expect(angeschoben(eingang)).toHaveLength(1)
    // Der Start-Knopf des Leitstands: asUser, die Herkunft bleibt das Plugin.
    await $.prompt.submit({
        text: 'Der Plan sieht gut aus. Leg bitte los.',
        origin: { kind: 'plugin', name: 'leitstand', asUser: true },
        wait: false,
    } as never)
    // Der Anstoss nach t1 stand zuerst in der Schlange: t2 ist seine Runde.
    await runde($ as never, 't2', 'Teil B steht.', { text: WEITER })
    expect(angeschoben(eingang)).toHaveLength(2)
    await runde($ as never, 't3', 'Teil C steht.')
    expect(angeschoben(eingang)).toHaveLength(2)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    expect(await leiste(ui as never)).toContain(`vorbei, ${GRUND_GRENZE}`)
})

test('wartende Runden zaehlen nicht gegen die Rundengrenze', { options: { maxRunden: 1 } }, async ($, on) => {
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

test('eingeschaltet, waehrend ein Arbeiter laeuft: kein Anstoss, bis eine Runde ohne Hintergrundarbeit endet', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await person($ as never, 'Bau das.')
    await runde($ as never, 't1', 'Der Arbeiter laeuft, ich warte.', { hintergrund: [ARBEITER] })
    await befehl($ as never)
    await clock.advance(5000)
    expect(angeschoben(eingang)).toHaveLength(0)
    await runde($ as never, 't2', 'Der Arbeiter ist fertig, Teil B steht aus.')
    expect(angeschoben(eingang)).toHaveLength(1)
})

test('ohne Meldung der Engine am Rundenende fragt der Autopilot die Liste der Agenten', async ($, on) => {
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

test('nach einem API-Fehler schiebt die Schicht nach einer Minute an', async ($, on) => {
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

test('wer unterbricht, beendet die Schicht; der Bericht bleibt bis Weg', async ($, on) => {
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
    expect(await leiste(ui as never)).toBe('engine')
})

test('/autopilot aus beendet ihn, Beenden in der Leiste auch', async ($, on) => {
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

test('bei einer Umfrage weicht die Leiste', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    boden(on)
    await start($ as never)
    await befehl($ as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props({ hasSurvey: true }) })
    expect(await leiste(ui as never)).toBe('engine')
})

test('die Zeile traegt den Schluessel autopilot und steht vor allem, was darunter kommt', async ($, on) => {
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
        // Leitstand und Statistik finden die Zeile an ihrem Schluessel; der Knopf steht
        // darin, so dass er mitkommt, wenn sie sie versetzen.
        const zeile = (await ui.findAll({ type: 'Box' })).find(b => b.props.key === 'autopilot')
        expect(zeile).toBeDefined()
        expect(JSON.stringify(zeile)).toContain('ap-beenden')
    }
})

type Knoten = { type?: string; key?: string; text?: string; props?: Record<string, unknown>; children?: unknown[] }

const istKnoten = (k: unknown): k is Knoten => typeof k === 'object' && k !== null && 'type' in k
const schluessel = (k: Knoten) => k.key ?? (k.props?.key as string | undefined)

/** Die Knoepfe einer Knopf-Box: ihre direkten Kinder, wenn alle Knoepfe sind. */
function knoepfeIn(k: Knoten) {
    if (k.type !== 'Box' || k.props?.flexDirection !== 'row') {
        return null
    }
    const kinder = (k.children ?? []).filter(istKnoten)
    return kinder.length > 0 && kinder.every(c => c.type === 'Button') ? kinder.map(schluessel) : null
}

/**
 * Die Zeilen-Box, in der "Autopilot:" und die Knopf-Box mit dem Knopf `knopf`
 * direkte Kinder sind, und die Knoepfe dieser Knopf-Box in ihrer Reihenfolge.
 */
async function zeileMit(ui: { findAll: (q: { type: string }) => Promise<Knoten[]> }, knopf: string) {
    for (const b of await ui.findAll({ type: 'Box' })) {
        if (b.props?.flexDirection !== 'row') {
            continue
        }
        const kinder = (b.children ?? []).filter(istKnoten)
        const label = kinder.some(k => k.type === 'Text' && (k.text ?? (k.children ?? []).join('')) === 'Autopilot:')
        const knoepfe = kinder.map(knoepfeIn).find(l => l?.includes(knopf))
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

test('Status und Knoepfe stehen in einer Zeile, die Fragen aufgeklappt darunter', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    boden(on)
    await start($ as never)
    await befehl($ as never)

    // Laeuft, ohne Fragen: genau eine Zeile mit Beenden.
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

test('vorbei ohne Fragen: nur Weg in der Knopf-Box, eine Zeile', async ($, on) => {
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

test('ein Druck auf 🅰️ im Leitstand beendet die Schicht am Ende der Runde, statt anzuschieben', MIT_LEITSTAND, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await befehl($ as never)
    await person($ as never, 'Bau das.')
    await runde($ as never, 't1', 'Teil A steht.')
    expect(angeschoben(eingang)).toHaveLength(1)

    // In der angeschobenen Runde drueckt die Person 🅰️; ihr /autopilot aus haengt in der Schlange.
    await clock.advance(60_000)
    await druck($ as never, 1_060_000)
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

    // Das aus des Leitstands kommt an, sobald die Sitzung still ist, und meldet die beendete Schicht.
    expect(await befehl($ as never, 'aus')).toBe('Der Autopilot ist aus: 1x angeschoben.')

    // Eine neue Schicht beginnt nach dem Druck: Der alte Wunsch gilt ihr nicht.
    await befehl($ as never, 'an')
    await person($ as never, 'Weiter mit Teil C.')
    expect(eingang.at(-1)?.context).toContain(KONTEXT)
    await runde($ as never, 't4', 'Teil C halb.')
    expect(angeschoben(eingang)).toHaveLength(2)
})

test('schreibt die Person nach dem Druck auf 🅰️, geht ihre Nachricht ohne Kontext raus, und die Schicht ist vorbei', MIT_LEITSTAND, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await befehl($ as never)
    await clock.advance(1000)
    await druck($ as never, 1_001_000)
    await person($ as never, 'Bau das.')
    expect(eingang[0]?.context).toEqual([])
    await runde($ as never, 't1', 'Halb fertig.')
    expect(angeschoben(eingang)).toHaveLength(0)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    expect(await leiste(ui as never)).toContain(GRUND_KNOPF)
})

test('kam 🅰️ in der Pause nach einem API-Fehler, endet die Schicht, statt anzuschieben', MIT_LEITSTAND, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await befehl($ as never)
    await person($ as never, 'Bau das.')
    await runde($ as never, 't1', '', { reason: 'error' })
    await clock.advance(30_000)
    await druck($ as never, 1_030_000)
    await clock.advance(30_000)
    expect(angeschoben(eingang)).toHaveLength(0)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    expect(await leiste(ui as never)).toContain(GRUND_KNOPF)
})

test('ein Wunsch aus dem Leitstand, der nicht nach dem Beginn der Schicht liegt, zaehlt nicht', MIT_LEITSTAND, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    // Gedrueckt, als noch keine Schicht lief, etwa um eine fruehere zu beenden.
    await druck($ as never, 1_000_000)
    await clock.advance(1000)
    await befehl($ as never)
    await person($ as never, 'Bau das.')
    expect(eingang[0]?.context).toContain(KONTEXT)
    await runde($ as never, 't1', 'Weiter?')
    // Im selben Augenblick wie der Beginn ist nicht juenger.
    await druck($ as never, 1_001_000)
    await runde($ as never, 't2', 'Weiter?')
    expect(angeschoben(eingang)).toHaveLength(2)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    expect(await leiste(ui as never)).toContain('2x angeschoben')
    expect(await ui.find({ type: 'Button', key: 'ap-beenden' })).toBeDefined()
})

test('ohne Leitstand schiebt der Autopilot weiter an wie bisher', async ($, on) => {
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

test('ist der Wert des Leitstands keine Zeit, gibt es keinen Wunsch', MIT_LEITSTAND, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await befehl($ as never)
    await person($ as never, 'Bau das.')
    await clock.advance(1000)
    // Keine Zahl, als Text aber spaeter als der Beginn der Schicht.
    await $.command.run({ command: 'leitstand-text', args: '9999999999999' } as never)
    await runde($ as never, 't1', 'Weiter?')
    expect(angeschoben(eingang)).toHaveLength(1)
    expect(await befehl($ as never, 'aus')).toBe('Der Autopilot ist aus: 1x angeschoben.')
})

/** Eine Runde der Hauptschleife mit dem Text, mit dem sie beginnt; ohne ihr Ende. */
async function rundeBeginnt($: Test$, id: string, text: string) {
    await $.turn.start({ text, turnId: id } as never)
    await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
    await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as never)
}

async function rundeEndet($: Test$, id: string, antwort: string) {
    await $.turn.complete({ answer: antwort, durationMs: 1000, isAborted: false, turnId: id, reason: 'answer' } as never)
}

// Transkript 7e3914ee, 2026-10-18 19:20-19:21 UTC: Am Ende von Runde A stellt sich die Nachricht der
// Person in die Schlange, 8 ms vor dem Anstoss W1. Ihre Runde B endet mit einem Plan, der Autopilot
// schiebt W2 an, obwohl W1 noch wartet. W1 endet mit der Marke, danach laeuft W2 trotzdem.
test('wartet ein Anstoss noch in der Schlange, kommt kein zweiter dazu; nach der Marke laeuft keiner mehr', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await befehl($ as never)
    await person($ as never, 'Gib mir das Zip.')
    await runde($ as never, 'tA', 'Plan: 1. Zip pruefen 2. schicken. Ich warte auf deine Freigabe.')
    expect(angeschoben(eingang)).toHaveLength(1) // W1, steht in der Schlange hinter der Nachricht der Person
    await person($ as never, 'und den Prompt')
    await rundeBeginnt($ as never, 'tB', 'und den Prompt')
    await rundeEndet($ as never, 'tB', 'Plan: 1. Prompt 2. Zip 3. schicken. Ich warte auf deine Freigabe.')
    expect(angeschoben(eingang)).toHaveLength(1) // W1 wartet noch: kein W2
    await rundeBeginnt($ as never, 'tC', WEITER)
    await rundeEndet($ as never, 'tC', `Zip und Prompt sind bei dir.\n\n${FERTIG}`)
    expect(angeschoben(eingang)).toHaveLength(1)
})

// Dieselbe Lage, nur startet die Engine W1 schon, bevor das turn.complete von B durch ist
// (Transkript: dequeue 19:20:22.896, das Einreihen von W2 erst 19:20:22.953).
test('startet schon die naechste Runde, bevor das Ende der vorigen verarbeitet ist, schiebt dieses Ende nicht an', async ($, on) => {
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

// Ein Anstoss, der nie beginnt (etwa aus der Schlange genommen), darf den Autopiloten nicht
// fuer immer sperren: Nach 10 Minuten Ruhe gilt er als verfallen.
test('ein Anstoss, der in 10 Minuten Ruhe nicht beginnt, verfaellt; danach wird wieder angeschoben', async ($, on) => {
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

// Die Frist zaehlt nur die Ruhe: Laeuft vor dem Anstoss eine lange Runde der Person,
// wartet er zu Recht, und an ihrem Ende kommt kein zweiter dazu.
test('eine lange Runde vor dem wartenden Anstoss laesst ihn nicht verfallen', async ($, on) => {
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

test('die gespeicherte Befehlsantwort nennt den Mod am Ende statt davor', async ($, on) => {
    expect(await gespeichert($, on, '<local-command-stdout>autopilot: Erledigt.</local-command-stdout>')).toEqual(['<local-command-stdout>Erledigt. (gemeldet vom Mod Autopilot)</local-command-stdout>'])
})

test('vor der Antwort bleiben nur die Namen anderer Mods stehen', async ($, on) => {
    expect(await gespeichert($, on, '<local-command-stdout>autopilot+leitstand: Erledigt.</local-command-stdout>', '<local-command-stdout>leitstand+autopilot: Erledigt.</local-command-stdout>')).toEqual([
        '<local-command-stdout>leitstand: Erledigt. (gemeldet vom Mod Autopilot)</local-command-stdout>',
        '<local-command-stdout>leitstand: Erledigt. (gemeldet vom Mod Autopilot)</local-command-stdout>',
    ])
})

test('nach einer mehrzeiligen Antwort steht der Mod in einer eigenen Zeile', async ($, on) => {
    expect(await gespeichert($, on, '<local-command-stdout>autopilot: Eins\nZwei\n</local-command-stdout>')).toEqual(['<local-command-stdout>Eins\nZwei\n(gemeldet vom Mod Autopilot)\n</local-command-stdout>'])
})

test('Zeilen ohne den eigenen Namen bleiben, wie sie sind', async ($, on) => {
    const zeilen = ['<local-command-stdout>leitstand: Erledigt.</local-command-stdout>', '<local-command-stdout>autopilotx: Erledigt.</local-command-stdout>', '<local-command-stdout>Erledigt.</local-command-stdout>', 'Text ohne Rahmen']
    expect(await gespeichert($, on, ...zeilen)).toEqual(zeilen)
})

test('die Antwort von /autopilot selbst bleibt ohne Herkunft', async ($, on) => {
    boden(on)
    const r = await $.command.run({ command: 'autopilot', args: 'aus' } as never)
    expect(r.text).toBe('Der Autopilot war nicht an.')
})
