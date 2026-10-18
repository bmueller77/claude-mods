import { expect, mock, test } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'

import { FERTIG, FRAGE_ABGELEHNT, KONTEXT, WEITER, istFertig } from '../hooks/register'

const BAND = { plugin: 'autopilot', component: 'AbovePrompt' } as const

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

/**
 * Der Boden unter dem Mod: was die Engine sonst beantworten wuerde.
 *
 * Zurueck kommt die Liste der Prompts, die unten ankamen, mit ihrem Kontext
 * und woher sie kamen, damit ein Test das Anschieben sieht.
 */
function boden(on: On) {
    const eingang: Eingang[] = []
    on('session.start', (_$, e, _next) => ({ cwd: e.cwd }))
    on('turn.start', (_$, e, _next) => ({ turnId: e.turnId }))
    on('turn.complete', (_$, e, _next) => ({ text: e.answer }))
    on('tool.call', (_$, _e, _next) => ({ result: 'ok' }))
    on('command.register', (_$, e, _next) => ({ value: { command: e.name } }))
    on('prompt.submit', (_$, e, _next) => {
        const o = e.origin as { kind: string; name?: string }
        eingang.push({ text: e.text, context: e.context ?? [], origin: o.name ? `${o.kind}:${o.name}` : o.kind })
        return { text: e.text, context: e.context, origin: e.origin }
    })
    on('ui.render', { component: 'AbovePrompt' }, ($, e, _next) => {
        const { Text } = $.ui.resolve(e)
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

/** Eine Runde der Hauptschleife: Start, Werkzeugaufrufe, Ende. */
async function runde($: Test$, id: string, antwort: string, x?: { werkzeuge?: number; reason?: string }) {
    await $.turn.start({ text: '', turnId: id } as never)
    for (let i = 0; i < (x?.werkzeuge ?? 1); i += 1) {
        await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
    }
    const reason = x?.reason ?? 'answer'
    await $.turn.complete({ answer: antwort, durationMs: 1000, isAborted: reason === 'aborted', turnId: id, reason } as never)
}

const angeschoben = (eingang: Eingang[]) => eingang.filter(p => p.origin === 'plugin:autopilot')

async function leiste(ui: { findAll: (q: { type: string }) => Promise<{ text: string; children: unknown[] }[]> }) {
    return (await ui.findAll({ type: 'Text' }))
        .filter(t => t.children.every(k => typeof k === 'string'))
        .map(t => t.text)
        .join(' | ')
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

test('mit der Marke ist die Schicht fertig und schiebt nicht mehr an, ein neuer Auftrag laeuft wieder', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await befehl($ as never)
    await person($ as never, 'Bau das.')
    await runde($ as never, 't1', `Fertig. Uebergabe: alles gebaut.\n${FERTIG}`)
    expect(angeschoben(eingang)).toHaveLength(0)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    expect(await leiste(ui as never)).toContain('Claude meldet fertig')

    await person($ as never, 'Jetzt noch das hier.')
    await runde($ as never, 't2', 'Halb fertig.')
    expect(angeschoben(eingang)).toHaveLength(1)
})

test('mit der alten Marke NACHTSCHICHT-FERTIG ist der Autopilot ebenso fertig', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await befehl($ as never)
    await person($ as never, 'Bau das.')
    await runde($ as never, 't1', 'Fertig. Uebergabe: alles gebaut.\nNACHTSCHICHT-FERTIG')
    expect(angeschoben(eingang)).toHaveLength(0)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    expect(await leiste(ui as never)).toContain('Claude meldet fertig')
})

test('nach dem Limit haelt die Schicht an, eine Nachricht der Person setzt es zurueck', { options: { maxRunden: 2 } }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const eingang = boden(on)
    await start($ as never)
    await befehl($ as never)
    await person($ as never, 'Bau das.')
    await runde($ as never, 't1', 'Weiter?')
    await runde($ as never, 't2', 'Weiter?')
    await runde($ as never, 't3', 'Weiter?')
    expect(angeschoben(eingang)).toHaveLength(2)

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    expect(await leiste(ui as never)).toContain('Limit ist erreicht')

    await person($ as never, 'Mach weiter.')
    await runde($ as never, 't4', 'Weiter?')
    expect(angeschoben(eingang)).toHaveLength(3)
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
