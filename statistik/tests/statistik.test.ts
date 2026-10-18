import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderElement, SessionContextBreakdown } from 'claude-code'

import { dauer, fableAus, leseDauer, restUhr, tokenMenge, uhrZeichen, warmRest, wochentagZeit } from '../hooks/register'

const FLAECHEN = ['terminal', 'desktop'] as const
const BAND = { plugin: 'statistik', component: 'AbovePrompt' } as const

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
const MIN = 60_000
/** So lange laeuft der Countdown vor Schwamm und Pfeil. */
const COUNTDOWN = 10_000

function props(x?: { isWorking?: boolean; hasSurvey?: boolean }) {
    return {
        hasSurvey: x?.hasSurvey ?? false,
        isWorking: x?.isWorking ?? false,
        maxRows: 10,
        bodyColumns: 120,
        scroll: { offset: 0, bodyRows: 10, isAtTop: true, isAtBottom: true },
        view: {},
    } as never
}

function aufschluesselung(tokens: number, fenster: number, schwelle?: number): SessionContextBreakdown {
    return {
        categories: [],
        totalTokens: tokens,
        maxTokens: fenster,
        rawMaxTokens: fenster,
        autocompactSource: 'model-default',
        percentage: Math.round((tokens / fenster) * 100),
        gridRows: [],
        model: 'claude-opus-5',
        memoryFiles: [],
        mcpTools: [],
        agents: [],
        autoCompactThreshold: schwelle,
        isAutoCompactEnabled: schwelle != null,
        apiUsage: null,
    }
}

type Limit = { kind: string; percentUsed: number; resetsAt?: string }
type Stand = {
    tokens: number
    fenster: number
    schwelle?: number
    limits?: Limit[]
    modell?: string
    /** Was der Nutzungs-Endpunkt antwortet; ohne Angabe ein Fehler 500. */
    endpunkt?: unknown
    /** Befehle, die die Engine ablehnt, als waeren sie unbekannt. */
    abgelehnt?: string[]
    /** Was Naechste-Schritte von unten mitbringt: neben anderem oder allein. */
    unten?: 'mit-anderen' | 'allein'
    /**
     * Wo die Zeile des Autopiloten von unten kommt: unter allem anderen, mitten
     * drin (in einem Block, den ein anderer Mod um sie gebaut hat) oder allein.
     */
    autopilot?: 'unten' | 'mitte' | 'allein'
    /** Der Verlauf fuer `$.session.messages()`; "fehler" laesst das Lesen scheitern. */
    nachrichten?: unknown[] | 'fehler'
    /** Die Sitzungs-ID; ohne Angabe sitzung-1. */
    sid?: string
}
type Ping = { read: number; write: number }

/**
 * Der Boden unter dem Mod: was die Engine sonst beantworten wuerde.
 *
 * Kontext und Ping-Antwort lesen aus einem veraenderlichen Stand; die Liste
 * der Pings, Logs und Eingaben kommt zurueck, damit ein Test zaehlen kann.
 */
function boden(on: On, stand: Stand) {
    const pings: Ping[] = []
    const naechsterPing: Ping = { read: 40_000, write: 20 }
    const logs: string[] = []
    const eingaben: string[] = []
    const befehle: string[] = []
    on('session.start', (_$, e, _next) => ({ cwd: e.cwd }))
    on('session.id', (_$, _e, _next) => ({ value: stand.sid ?? 'sitzung-1' }))
    on('session.model', (_$, _e, _next) => ({ value: stand.modell ?? 'claude-opus-5' }))
    on('session.messages', (_$, _e, _next) => {
        if (stand.nachrichten === 'fehler') {
            throw new Error('Verlauf nicht lesbar')
        }
        return { value: stand.nachrichten ?? [] } as never
    })
    on('session.usage', (_$, _e, _next) => ({
        value: {
            startedAt: 0,
            context: {
                tokens: stand.tokens,
                window: stand.fenster,
                percent: Math.round((stand.tokens / stand.fenster) * 100),
                breakdown: aufschluesselung(stand.tokens, stand.fenster, stand.schwelle),
            },
            rateLimits: stand.limits ?? [],
        },
    }))
    const abrufe: string[] = []
    on('session.authorize', (_$, _e, _next) => ({ value: { handle: 'griff', kind: 'bearer' as const } }))
    on('http.fetch', (_$, e, _next) => {
        abrufe.push(String(e.url))
        return {
            value:
                stand.endpunkt === undefined
                    ? { status: 500, ok: false, headers: {}, text: '' }
                    : { status: 200, ok: true, headers: {}, text: JSON.stringify(stand.endpunkt) },
        } as never
    })
    on('turn.start', (_$, e, _next) => ({ turnId: e.turnId }))
    on('turn.complete', (_$, e, _next) => ({ text: e.answer, usage: e.usage }))
    on('command.register', (_$, e, _next) => ({ value: { command: e.name } }))
    on('command.run', (_$, e, _next) => {
        if (stand.abgelehnt?.includes(e.command)) {
            throw new Error(`unbekannter Befehl: ${e.command}`)
        }
        befehle.push(e.args ? `${e.command} ${e.args}` : e.command)
        return { text: '' }
    })
    on('ui.log', (_$, e, _next) => {
        logs.push(String(e.text))
        return { value: undefined }
    })
    on('ui.status', (_$, _e, _next) => ({ value: undefined }))
    on('prompt.submit', (_$, e, _next) => {
        eingaben.push(e.text)
        return { text: e.text, origin: e.origin }
    })
    on('model.fork', (_$, _e, _next) => {
        pings.push({ ...naechsterPing })
        return {
            value: {
                isAnswered: true,
                text: 'warm',
                usage: {
                    input_tokens: 10,
                    output_tokens: 2,
                    cache_read_input_tokens: naechsterPing.read,
                    cache_creation_input_tokens: naechsterPing.write,
                },
            },
        } as never
    })
    on('ui.render', { component: 'AbovePrompt' }, ($, e, _next) => {
        const { Box, Text } = $.ui.resolve(e)
        const vorschlag = h(Box, { key: 'naechste-schritte' }, h(Text, {}, 'Vorschlag')) as RenderElement
        const zeile = h(
            Box,
            { key: 'autopilot', flexDirection: 'column', paddingX: 1 },
            h(Box, { flexDirection: 'row', gap: 1 }, h(Text, {}, 'Autopilot:'), h(Text, {}, 'Claude arbeitet ohne Rueckfragen weiter')),
        ) as RenderElement
        if (stand.autopilot === 'allein') {
            return zeile
        }
        if (stand.autopilot) {
            const mitte = h(Box, { flexDirection: 'column' }, zeile, h(Text, {}, 'Leitstand')) as RenderElement
            const kinder = stand.autopilot === 'mitte' ? [h(Text, {}, 'engine'), mitte] : [h(Text, {}, 'engine'), zeile]
            return h(Box, { flexDirection: 'column' }, ...kinder, ...(stand.unten ? [vorschlag] : [])) as RenderElement
        }
        if (stand.unten === 'allein') {
            return vorschlag
        }
        if (stand.unten === 'mit-anderen') {
            return h(Box, { flexDirection: 'column' }, h(Text, {}, 'engine'), vorschlag) as RenderElement
        }
        return h(Text, {}, 'engine') as RenderElement
    })
    return { pings, naechsterPing, logs, eingaben, befehle, abrufe }
}

type T$ = {
    session: { start: (e: never) => Promise<unknown> }
    turn: { start: (e: never) => Promise<unknown>; complete: (e: never) => Promise<unknown> }
    command: { run: (e: never) => Promise<{ text?: unknown }> }
    prompt: { submit: (e: never) => Promise<unknown> }
}

async function start($: T$) {
    await $.session.start({ cwd: '/projekt', surface: 'desktop', isInteractive: true } as never)
}

/** Eine Runde: Start, Ende mit den Token-Zahlen der Antwort. */
async function runde($: T$, u = { input: 2_000, cacheRead: 38_000, cacheWrite: 0 }, modell = 'claude-opus-5') {
    const id = `t${Math.random()}`
    await $.turn.start({ text: 'mach', turnId: id } as never)
    await $.turn.complete({
        answer: 'fertig',
        durationMs: 1000,
        isAborted: false,
        turnId: id,
        reason: 'answer',
        usage: {
            input_tokens: u.input,
            output_tokens: 100,
            cache_read_input_tokens: u.cacheRead,
            cache_creation_input_tokens: u.cacheWrite,
            model: modell,
        },
    } as never)
}

async function befehl($: T$, name: string, args = '') {
    const r = await $.command.run({ command: name, args } as never)
    return String(r.text ?? '')
}

/** Alle innersten Texte der Leiste, aneinandergehaengt. */
async function leiste(ui: { findAll: (q: { type: string }) => Promise<{ text: string; children: unknown[] }[]> }) {
    return (await ui.findAll({ type: 'Text' }))
        .filter(t => t.children.every(k => typeof k === 'string'))
        .map(t => t.text)
        .join('')
}

/** Die Grafiken der Statistik mit Tooltip, ohne die Trennlinie. */
async function grafiken(ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) {
    return (await ui.findAll({ type: 'Svg' })).filter(b => b.props.alt !== 'Trennlinie')
}

test('Dauern und Zeichen', () => {
    expect(dauer(252 * MIN)).toBe('4 h 12 min')
    expect(dauer(18 * MIN)).toBe('18 min')
    expect(dauer(120 * MIN)).toBe('2 h')
    // Warmhalten: h:mm in Schritten von fuenf Minuten, aufgerundet.
    expect(warmRest(6 * 60 * MIN)).toBe('6:00')
    expect(warmRest(6 * 60 * MIN - 30_000)).toBe('6:00')
    expect(warmRest(252 * MIN)).toBe('4:15')
    expect(warmRest(250 * MIN)).toBe('4:10')
    expect(warmRest(18 * MIN)).toBe('0:20')
    expect(warmRest(1_000)).toBe('0:05')
    expect(leseDauer('90m')).toBe(90 * MIN)
    expect(leseDauer('1h30m')).toBe(90 * MIN)
    expect(leseDauer('2h')).toBe(120 * MIN)
    expect(leseDauer('bald')).toBeNull()
    expect(uhrZeichen(null)).toBe('○')
    expect(uhrZeichen(0)).toBe('○')
    expect(uhrZeichen(0.2)).toBe('◔')
    expect(uhrZeichen(0.5)).toBe('◑')
    expect(uhrZeichen(0.7)).toBe('◕')
    expect(uhrZeichen(1)).toBe('●')
    // Tokens der Chatlaenge.
    expect(tokenMenge(950)).toBe('950')
    expect(tokenMenge(312_000)).toBe('312k')
    expect(tokenMenge(2_400_000)).toBe('2,4 Mio.')
})

test('vor der ersten Antwort: leere Uhr, der Schalter als Schneeflocke, aus', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { tokens: 10_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    const text = await leiste(ui as never)
    expect(text).toContain('○')
    expect(text).toContain('Cache leer')
    expect(text).not.toContain('–')
    expect(text).not.toContain('🔥')
    expect(text).not.toContain('❄')
    const schalter = await ui.find({ type: 'Button', key: 'warmhalten' })
    expect(schalter?.props.label).toBe('❄️')
    expect(schalter?.props.variant).toBe('secondary')
    expect((await ui.find({ type: 'Button', key: 'compact' }))?.props.variant).toBe('secondary')
})

test('nach einer Antwort: volle Uhr, Kontext-Kuchen, Flamme, alles in einer Zeile', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)

    const terminal = await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)
    expect(terminal).toContain('●')
    // Ohne Beleg ist die Stunde nur angenommen.
    expect(terminal).toContain('60 min?')
    // 20 % des Fensters belegt: ein knappes Viertel im Kuchen, gruen, weil unter der halben Schwelle.
    expect(terminal).toContain('◔ 20 %')
    expect(terminal).not.toContain('☀️')
    const terminalUi = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    expect((await terminalUi.find({ type: 'Button', key: 'warmhalten' }))?.props.label).toBe('🔥')
    const kuchen = (await terminalUi.findAll({ type: 'Text' })).find(t => t.text === '◔')
    expect(kuchen?.props.color).toBe('success')

    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    const bilder = (await grafiken(desktop as never)).map(b => String(b.props.alt))
    expect(bilder).toHaveLength(2)
    // Erst der Kontext, dann der Cache; die Chatlaenge ist Text, die Flamme ein Knopf, ihr Tooltip steht an der Uhr.
    expect(bilder[0]).toContain('20 % des Fensters')
    expect(bilder[1]).toContain('noch 60 von 60 Minuten warm')
    expect(bilder[1]).toContain('Treffer der letzten Antwort: 95 %')
    expect(bilder[1]).toContain('Cache warm.')
    expect(bilder[1]).toContain('Warmhalten aus.')
    expect((await desktop.find({ type: 'Button', key: 'warmhalten' }))?.props.label).toBe('🔥')
    for (const b of await grafiken(desktop as never)) {
        expect(b.props.isInteractive).toBe(true)
        expect(String(b.props.source)).toContain('<title>')
    }
    // Cache und Kontext sind Ringe wie bei GlanceFlow: Spur und Bogen, kein Tortenstueck.
    const [ring, uhr] = (await grafiken(desktop as never)).map(b => String(b.props.source))
    expect(uhr).toContain('stroke-dasharray')
    expect(ring).toContain('stroke-dasharray')
    expect(ring).toContain('stroke-opacity=".4"')
    expect(ring).not.toContain('<path')
    // 20 % belegt: der Bogen ist ein Fuenftel des Umfangs.
    const umfang = 2 * Math.PI * 5.1
    expect(ring).toContain(`stroke-dasharray="${(umfang * 0.2).toFixed(2)} ${umfang.toFixed(2)}"`)
})

test('kalt: die Schneeflocke als Schalter, keine Meldung und keine Aufforderung zum Wiederholen', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { tokens: 80_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)
    await clock.advance(61 * MIN)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    expect((await ui.find({ type: 'Button', key: 'warmhalten' }))?.props.label).toBe('❄️')
    expect(await leiste(ui as never)).toContain('0 min?')

    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    expect((await desktop.find({ type: 'Button', key: 'warmhalten' }))?.props.label).toBe('❄️')
    const uhr = String((await grafiken(desktop as never))[1]?.props.alt)
    expect(uhr).toContain('Cache kalt')
    expect(uhr).toContain('80k Tokens')

    // Die Nachricht geht beim ersten Mal durch, ohne Log und ohne Rueckfrage.
    await $.prompt.submit({ text: 'weiter', origin: { kind: 'composer' }, wait: false } as never)
    expect(b.eingaben).toEqual(['weiter'])
    expect(b.logs).toEqual([])
})

test('der Schalter haelt warm und schaltet wieder aus', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)

    for (const surface of FLAECHEN) {
        const ui = await $.ui.mount({ ...BAND, surface, props: props() })
        await ui.press({ key: 'warmhalten' })
        const an = await ui.find({ type: 'Button', key: 'warmhalten' })
        expect(an?.props.label).toBe('🔥 3:00')
        expect(an?.props.variant).toBe('primary')
        await ui.press({ key: 'warmhalten-aus' })
        const aus = await ui.find({ type: 'Button', key: 'warmhalten' })
        expect(aus?.props.label).toBe('🔥')
        expect(aus?.props.variant).toBe('secondary')
    }
})

/** Der Schalter und, wenn es ihn gibt, das Kreuz daneben. */
async function schalterStand(ui: { find: (q: { type: string; key: string }) => Promise<{ props: Record<string, unknown> } | undefined | null> }) {
    const schalter = await ui.find({ type: 'Button', key: 'warmhalten' })
    const kreuz = await ui.find({ type: 'Button', key: 'warmhalten-aus' })
    return { label: schalter?.props.label, variant: schalter?.props.variant, kreuz: kreuz != null }
}

test('jeder Klick legt drei Stunden drauf, bis 12:00, dann immer, dann aus', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)

    for (const surface of FLAECHEN) {
        const ui = await $.ui.mount({ ...BAND, surface, props: props() })
        expect(await schalterStand(ui as never)).toEqual({ label: '🔥', variant: 'secondary', kreuz: false })
        for (const label of ['🔥 3:00', '🔥 6:00', '🔥 9:00', '🔥 12:00', '🔥 immer']) {
            await ui.press({ key: 'warmhalten' })
            expect(await schalterStand(ui as never)).toEqual({ label, variant: 'primary', kreuz: true })
        }
        expect(await befehl($ as never, 'warmhalten', 'status')).toBe('Warmhalten an, ohne Ende in diesem Chat.')
        await ui.press({ key: 'warmhalten' })
        expect(await schalterStand(ui as never)).toEqual({ label: '🔥', variant: 'secondary', kreuz: false })
        expect(await befehl($ as never, 'warmhalten', 'status')).toBe('Warmhalten ist aus.')
    }
})

test('aus krummer Restzeit legt der Klick drei Stunden drauf und füllt höchstens auf 12:00', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })

    await ui.press({ key: 'warmhalten' })
    await clock.advance(25 * MIN)
    expect((await schalterStand(ui as never)).label).toBe('🔥 2:35')
    await ui.press({ key: 'warmhalten' })
    expect((await schalterStand(ui as never)).label).toBe('🔥 5:35')
    await ui.press({ key: 'warmhalten' })
    await ui.press({ key: 'warmhalten' })
    expect((await schalterStand(ui as never)).label).toBe('🔥 11:35')
    // 11:35 plus drei Stunden waere mehr als die Grenze: aufgefuellt auf 12:00.
    await ui.press({ key: 'warmhalten' })
    expect((await schalterStand(ui as never)).label).toBe('🔥 12:00')
    await ui.press({ key: 'warmhalten' })
    expect((await schalterStand(ui as never)).label).toBe('🔥 immer')

    // 10:15 aus /warmhalten: der Klick fuellt auf 12:00, ohne Umweg ueber immer.
    expect(await befehl($ as never, 'warmhalten', '10h15m')).toContain('Warmhalten an für 10 h 15 min')
    expect((await schalterStand(ui as never)).label).toBe('🔥 10:15')
    await ui.press({ key: 'warmhalten' })
    expect((await schalterStand(ui as never)).label).toBe('🔥 12:00')
    // Knapp unter der Grenze gilt sie als erreicht: der naechste Klick ist immer.
    await clock.advance(3 * MIN)
    expect((await schalterStand(ui as never)).label).toBe('🔥 12:00')
    await ui.press({ key: 'warmhalten' })
    expect((await schalterStand(ui as never)).label).toBe('🔥 immer')
})

test('das Kreuz steht nur neben dem Schalter, solange Warmhalten läuft, und schaltet sofort aus', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)

    for (const surface of FLAECHEN) {
        const ui = await $.ui.mount({ ...BAND, surface, props: props() })
        expect((await ui.findAll({ type: 'Button' })).map(k => k.props.key)).toEqual(['wischen', 'compact', 'details', 'warmhalten'])

        await ui.press({ key: 'warmhalten' })
        expect((await ui.findAll({ type: 'Button' })).map(k => k.props.key)).toEqual([
            'wischen',
            'compact',
            'details',
            'warmhalten',
            'warmhalten-aus',
        ])
        const kreuz = await ui.find({ type: 'Button', key: 'warmhalten-aus' })
        expect(kreuz?.props.label).toBe('✖️')
        expect(kreuz?.props.variant).toBe('secondary')
        await ui.press({ key: 'warmhalten-aus' })
        expect(await schalterStand(ui as never)).toEqual({ label: '🔥', variant: 'secondary', kreuz: false })
        expect(await befehl($ as never, 'warmhalten', 'status')).toBe('Warmhalten ist aus.')

        // Auch ohne Ende schaltet das Kreuz aus.
        expect(await befehl($ as never, 'warmhalten', 'immer')).toContain('ohne Ende in diesem Chat')
        expect(await schalterStand(ui as never)).toEqual({ label: '🔥 immer', variant: 'primary', kreuz: true })
        await ui.press({ key: 'warmhalten-aus' })
        expect(await schalterStand(ui as never)).toEqual({ label: '🔥', variant: 'secondary', kreuz: false })
    }
})

test('die alte Einstellung für jede Sitzung startet nichts und wird gelöscht; fremde Chats bleiben fremd', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    // Die alte Einstellung, und ein anderer Chat, der ohne Ende warm haelt. Ein
    // eigener Speicher statt mock.store, damit der Test sieht, was geloescht wird.
    const speicher = new Map<string, unknown>([
        ['statistik.warmImmer', true],
        ['statistik.warmBis:sitzung-2', 'immer'],
    ])
    const geloescht: string[] = []
    on('store.get', (_$, e, _next) => ({ value: speicher.get(e.key) }))
    on('store.set', (_$, e, _next) => {
        speicher.set(e.key, e.value)
        return { value: undefined }
    })
    on('store.delete', (_$, e, _next) => {
        geloescht.push(e.key)
        speicher.delete(e.key)
        return { value: undefined }
    })
    on('store.keys', (_$, _e, _next) => ({ value: [...speicher.keys()] }))
    const b = boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)

    expect(geloescht).toEqual(['statistik.warmImmer'])
    expect(speicher.get('statistik.warmBis:sitzung-2')).toBe('immer')
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    expect(await schalterStand(ui as never)).toEqual({ label: '🔥', variant: 'secondary', kreuz: false })
    expect(String((await grafiken(ui as never))[1]?.props.alt)).toContain('Warmhalten aus.')
    expect(await befehl($ as never, 'warmhalten', 'status')).toBe('Warmhalten ist aus.')
    await clock.advance(60 * MIN)
    expect(b.pings).toHaveLength(0)

    // Ein zweiter Start loescht nichts mehr: die alte Einstellung ist weg.
    await start($ as never)
    expect(geloescht).toEqual(['statistik.warmImmer'])
})

test('immer übersteht einen neuen Sitzungsstart im selben Chat und pingt über zwölf Stunden hinaus', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)
    expect(await befehl($ as never, 'warmhalten', 'immer')).toBe('Warmhalten an, ohne Ende in diesem Chat. /warmhalten aus schaltet es ab.')

    // Wie nach einem Neuladen: dieselbe Sitzung beginnt noch einmal.
    await start($ as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    expect(await schalterStand(ui as never)).toEqual({ label: '🔥 immer', variant: 'primary', kreuz: true })
    expect(String((await grafiken(ui as never))[1]?.props.alt)).toContain('Warmhalten an, ohne Ende in diesem Chat, nächster Ping in 50 min.')
    expect(await befehl($ as never, 'statistik')).toContain('Warmhalten    an, ohne Ende in diesem Chat')

    for (let i = 0; i < 16; i++) {
        await clock.advance(50 * MIN)
    }
    expect(b.pings).toHaveLength(16)
    expect(await schalterStand(ui as never)).toEqual({ label: '🔥 immer', variant: 'primary', kreuz: true })
})

test('immer aus dem Speicher dieser Sitzung gilt nach einem Neuladen des Moduls weiter', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    // Das Modul beginnt frisch; was bleibt, ist der Speicher unter der Sitzungs-ID.
    mock.store(on, { 'statistik.warmBis:sitzung-1': 'immer' })
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    expect(await schalterStand(ui as never)).toEqual({ label: '🔥 immer', variant: 'primary', kreuz: true })
})

test('Warmhalten pingt kurz vor dem Ablauf, und die Uhr ist danach wieder voll', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    await ui.press({ key: 'warmhalten' })

    await clock.advance(49 * MIN)
    expect(b.pings).toHaveLength(0)
    await clock.advance(1 * MIN)
    expect(b.pings).toHaveLength(1)
    expect(await leiste(ui as never)).toContain('60 min?')

    // Der naechste Ping kommt wieder 50 Minuten spaeter.
    await clock.advance(50 * MIN)
    expect(b.pings).toHaveLength(2)
    expect(await befehl($ as never, 'statistik')).toContain('Pings         2 in dieser Sitzung')
})

test('findet ein Ping den Cache kalt vor, hoert das Warmhalten mit Grund auf', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)
    await befehl($ as never, 'warmhalten')
    b.naechsterPing.read = 0
    b.naechsterPing.write = 40_000

    await clock.advance(50 * MIN)
    expect(b.pings).toHaveLength(1)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    expect((await ui.find({ type: 'Button', key: 'warmhalten' }))?.props.label).toBe('🔥')
    expect(String((await grafiken(ui as never))[1]?.props.alt)).toContain('Warmhalten hat aufgehört: der Ping fand den Cache schon kalt vor')
    expect(b.logs).toEqual([])
})

test('der Schwamm steht rechts neben der Chatlänge, das Dreieck 🔻 am Kontext; bei Rot ist der Schwamm hervorgehoben', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const stand: Stand = { tokens: 40_000, fenster: 200_000, schwelle: 166_000 }
    const b = boden(on, stand)
    await start($ as never)
    await runde($ as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    const schwamm = await ui.find({ type: 'Button', key: 'wischen' })
    expect(schwamm?.props.label).toBe('🧽')
    expect(schwamm?.props.variant).toBe('secondary')
    const dreieck = await ui.find({ type: 'Button', key: 'compact' })
    expect(dreieck?.props.label).toBe('🔻')
    expect(dreieck?.props.variant).toBe('secondary')
    const knoepfe = (await ui.findAll({ type: 'Button' })).map(k => k.props.key)
    expect(knoepfe).toEqual(['wischen', 'compact', 'details', 'warmhalten'])
    const zeile = await leiste(ui as never)
    expect(zeile.indexOf('💬')).toBeLessThan(zeile.indexOf('20 %'))
    expect(zeile.indexOf('20 %')).toBeLessThan(zeile.indexOf('min'))
    // Der Tooltip am Kontext nennt den Schwamm.
    expect(String((await grafiken(ui as never))[0]?.props.alt)).toContain('Bei Rot ist der Schwamm hervorgehoben.')

    stand.tokens = 150_000
    await runde($ as never, { input: 2_000, cacheRead: 148_000, cacheWrite: 0 })
    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal', props: props({ isWorking: true }) })
    // 150000 von 166000: ueber 80 Prozent der Schwelle, der Kuchen ist rot und der Schwamm hervorgehoben.
    expect(await leiste(terminal as never)).toContain('◕ 75 %')
    const kuchen = (await terminal.findAll({ type: 'Text' })).find(t => t.text === '◕')
    expect(kuchen?.props.color).toBe('error')
    expect((await terminal.find({ type: 'Button', key: 'wischen' }))?.props.variant).toBe('primary')
    expect((await terminal.find({ type: 'Button', key: 'compact' }))?.props.variant).toBe('secondary')

    // Das Dreieck verdichtet schlicht, nach dem Countdown, und zeigt die Sanduhr, solange es wartet.
    await terminal.press({ key: 'compact' })
    await clock.advance(COUNTDOWN)
    expect(b.befehle).toEqual(['compact'])
    expect((await terminal.find({ type: 'Button', key: 'compact' }))?.props.label).toBe('⏳')
    expect((await terminal.find({ type: 'Button', key: 'wischen' }))?.props.label).toBe('🧽')
    // Der Schwamm bleibt bedienbar, tut aber nichts, solange etwas eingereiht ist.
    await terminal.press({ key: 'wischen' })
    await terminal.press({ key: 'compact' })
    expect(b.befehle).toEqual(['compact'])
})

test('ohne Leitstand und GlanceFlow verdichtet der Schwamm schlicht und zeigt selbst die Sanduhr', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    await ui.press({ key: 'wischen' })
    await clock.advance(COUNTDOWN)
    expect(b.befehle).toEqual(['compact'])
    expect((await ui.find({ type: 'Button', key: 'wischen' }))?.props.label).toBe('⏳')
    expect((await ui.find({ type: 'Button', key: 'compact' }))?.props.label).toBe('🔻')
    // Das Dreieck tut nichts, solange der Schwamm eingereiht hat.
    await ui.press({ key: 'compact' })
    expect(b.befehle).toEqual(['compact'])
})

test('nur mit GlanceFlow räumt der Schwamm mit Sicherungspunkt auf, über /glanceflow tidy; der Pfeil bleibt schlicht', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    on('command.list', () => ({ value: [{ name: 'glanceflow', description: '', source: 'plugin' }] }) as never)
    await start($ as never)
    await runde($ as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    await ui.press({ key: 'wischen' })
    await clock.advance(COUNTDOWN)
    expect(b.befehle).toEqual(['glanceflow tidy'])
    // GlanceFlow raeumt selbst auf; die Statistik reiht nichts ein.
    expect((await ui.find({ type: 'Button', key: 'wischen' }))?.props.label).toBe('🧽')
    expect((await ui.find({ type: 'Button', key: 'compact' }))?.props.label).toBe('🔻')
    await ui.press({ key: 'compact' })
    await clock.advance(COUNTDOWN)
    expect(b.befehle).toEqual(['glanceflow tidy', 'compact'])
    expect((await ui.find({ type: 'Button', key: 'compact' }))?.props.label).toBe('⏳')
})

test('mit Leitstand räumt der Schwamm über /leitstand tidy auf, auch wenn GlanceFlow noch da ist', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    const befehl = (name: string) => ({ name, description: '', source: 'plugin' })
    // GlanceFlow steht vorn in der Liste; der Leitstand geht trotzdem vor.
    let liste = [befehl('glanceflow'), befehl('leitstand')]
    on('command.list', () => ({ value: liste }) as never)
    await start($ as never)
    await runde($ as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    await ui.press({ key: 'wischen' })
    await clock.advance(COUNTDOWN)
    expect(b.befehle).toEqual(['leitstand tidy'])
    // Als Kopie eines Plugins zaehlt er auch.
    liste = [befehl('glanceflow'), befehl('bjoern-mods:leitstand')]
    await ui.press({ key: 'wischen' })
    await clock.advance(COUNTDOWN)
    expect(b.befehle).toEqual(['leitstand tidy', 'bjoern-mods:leitstand tidy'])
    // Der Leitstand raeumt selbst auf; die Statistik reiht nichts ein.
    expect((await ui.find({ type: 'Button', key: 'wischen' }))?.props.label).toBe('🧽')
})

/** Was die Statistik als Toast zeigt. */
function toastZaehler(on: On) {
    const toasts: string[] = []
    on('ui.toast', (_$, e, _next) => {
        toasts.push(String(e.text))
        return { value: undefined } as never
    })
    return toasts
}

test('ein Druck auf 🧽 räumt nicht sofort auf, sondern nach zehn Sekunden, genau einmal', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    const toasts = toastZaehler(on)
    await start($ as never)
    await runde($ as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    await ui.press({ key: 'wischen' })
    expect(b.befehle).toEqual([])
    expect(toasts).toEqual(['Der Chat wird in 10 Sekunden aufgeräumt. Abbrechen stoppt das.'])
    await clock.advance(COUNTDOWN - 1)
    expect(b.befehle).toEqual([])
    await clock.advance(1)
    expect(b.befehle).toEqual(['compact'])
    expect((await ui.find({ type: 'Button', key: 'wischen' }))?.props.label).toBe('⏳')
    expect(await ui.find({ type: 'Button', key: 'countdown-abbrechen' })).toBeFalsy()
    await clock.advance(2 * COUNTDOWN)
    expect(b.befehle).toEqual(['compact'])
})

test('ein Druck auf 🔻 verdichtet nicht sofort, sondern nach zehn Sekunden, genau einmal', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    const toasts = toastZaehler(on)
    await start($ as never)
    await runde($ as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    await ui.press({ key: 'compact' })
    expect(b.befehle).toEqual([])
    expect(toasts).toEqual(['Der Kontext wird in 10 Sekunden verdichtet. Abbrechen stoppt das.'])
    await clock.advance(COUNTDOWN - 1)
    expect(b.befehle).toEqual([])
    await clock.advance(1)
    expect(b.befehle).toEqual(['compact'])
    expect((await ui.find({ type: 'Button', key: 'compact' }))?.props.label).toBe('⏳')
    await clock.advance(2 * COUNTDOWN)
    expect(b.befehle).toEqual(['compact'])
})

test('ein zweiter Druck auf denselben Knopf bricht den Countdown ab', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    const toasts = toastZaehler(on)
    await start($ as never)
    await runde($ as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    for (const knopf of ['wischen', 'compact'] as const) {
        await ui.press({ key: knopf })
        await clock.advance(4_000)
        await ui.press({ key: knopf })
        expect(toasts.at(-1)).toBe('Abgebrochen.')
        await clock.advance(2 * COUNTDOWN)
        expect(b.befehle).toEqual([])
    }
    expect((await ui.find({ type: 'Button', key: 'wischen' }))?.props.label).toBe('🧽')
    expect((await ui.find({ type: 'Button', key: 'compact' }))?.props.label).toBe('🔻')
    expect(await ui.find({ type: 'Button', key: 'countdown-abbrechen' })).toBeFalsy()
})

test('der Countdown zeigt die Sekunden im Knopf, dahinter Abbrechen, das ihn stoppt; in App und Terminal', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    const toasts = toastZaehler(on)
    await start($ as never)
    await runde($ as never)
    for (const surface of FLAECHEN) {
        const ui = await $.ui.mount({ ...BAND, surface, props: props() })
        await ui.press({ key: 'wischen' })
        expect((await ui.find({ type: 'Button', key: 'wischen' }))?.props.label).toBe('🔟')
        const abbrechen = await ui.find({ type: 'Button', key: 'countdown-abbrechen' })
        expect(abbrechen?.props.label).toBe('Abbrechen')
        expect(abbrechen?.props.variant).toBe('secondary')
        // Abbrechen steht direkt hinter dem gedrueckten Knopf.
        expect((await ui.findAll({ type: 'Button' })).map(k => k.props.key)).toEqual([
            'wischen',
            'countdown-abbrechen',
            'compact',
            'details',
            'warmhalten',
        ])
        await clock.advance(3_000)
        expect((await ui.find({ type: 'Button', key: 'wischen' }))?.props.label).toBe('7\uFE0F\u20E3')
        await ui.press({ key: 'countdown-abbrechen' })
        expect(toasts.at(-1)).toBe('Abgebrochen.')
        expect((await ui.find({ type: 'Button', key: 'wischen' }))?.props.label).toBe('🧽')
        expect(await ui.find({ type: 'Button', key: 'countdown-abbrechen' })).toBeFalsy()
        await clock.advance(2 * COUNTDOWN)
        expect(b.befehle).toEqual([])

        // Beim Pfeil steht Abbrechen hinter dem Pfeil.
        await ui.press({ key: 'compact' })
        expect((await ui.find({ type: 'Button', key: 'compact' }))?.props.label).toBe('🔟')
        expect((await ui.findAll({ type: 'Button' })).map(k => k.props.key)).toEqual([
            'wischen',
            'compact',
            'countdown-abbrechen',
            'details',
            'warmhalten',
        ])
        await ui.press({ key: 'countdown-abbrechen' })
        await clock.advance(2 * COUNTDOWN)
        expect(b.befehle).toEqual([])
    }
})

test('während des Countdowns von 🧽 ist 🔻 wirkungslos und sagt das', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    const toasts = toastZaehler(on)
    await start($ as never)
    await runde($ as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    await ui.press({ key: 'wischen' })
    await clock.advance(2_000)
    await ui.press({ key: 'compact' })
    expect(toasts.at(-1)).toBe('Erst abbrechen oder abwarten.')
    expect((await ui.find({ type: 'Button', key: 'compact' }))?.props.label).toBe('🔻')
    expect((await ui.find({ type: 'Button', key: 'wischen' }))?.props.label).toBe('8\uFE0F\u20E3')
    // Der Countdown des Schwamms laeuft weiter und handelt einmal, der Pfeil gar nicht.
    await clock.advance(COUNTDOWN)
    expect(b.befehle).toEqual(['compact'])
    expect((await ui.find({ type: 'Button', key: 'wischen' }))?.props.label).toBe('⏳')
    expect((await ui.find({ type: 'Button', key: 'compact' }))?.props.label).toBe('🔻')
})

/** Ein Verlauf: drei Nachrichten mit Text und ein reines Werkzeug-Ergebnis, zusammen 1248000 Zeichen. */
function verlauf(): unknown[] {
    // 12 + 16 + 18 (Eingabe als JSON) + 7 Zeichen, der Rest ist das Ergebnis.
    const ergebnis = 'y'.repeat(1_248_000 - 53)
    return [
        { role: 'user', text: 'Hallo Claude', toolUses: [] },
        {
            role: 'assistant',
            text: 'Ich schaue nach.',
            toolUses: [{ tool_use_id: 'a1', tool: 'Read', input: { file_path: '/x' }, text: ergebnis }],
        },
        { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'a1', text: ergebnis, isError: false }] },
        { role: 'assistant', text: 'Fertig.', toolUses: [] },
    ]
}

test('die Chatlänge steht ganz links: Nachrichten mit Text und geschätzte Tokens, nach jeder Runde neu', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const stand: Stand = { tokens: 40_000, fenster: 200_000, schwelle: 166_000, nachrichten: verlauf() }
    boden(on, stand)
    await start($ as never)
    await runde($ as never)

    for (const surface of FLAECHEN) {
        const ui = await $.ui.mount({ ...BAND, surface, props: props() })
        const text = await leiste(ui as never)
        // Das Werkzeug-Ergebnis zaehlt nicht als Nachricht, und sein Text nur einmal.
        expect(text).toContain('💬 3 · 312k')
        expect(text.indexOf('💬')).toBeLessThan(text.indexOf('20 %'))
        const zahlen = (await ui.findAll({ type: 'Text' })).find(t => t.text.includes('312k'))
        expect(zahlen?.props.dimColor).toBe(true)
    }

    // Nach der naechsten Runde neu gezaehlt.
    stand.nachrichten = [...verlauf(), { role: 'user', text: 'Und jetzt?', toolUses: [] }]
    await runde($ as never)
    expect(await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)).toContain('💬 4 · 312k')
})

test('ist der Verlauf an der Grenze von 4096 Einträgen, steht ≥ vor den Zahlen', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const nachrichten = Array.from({ length: 4096 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: 'abcd', toolUses: [] }))
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000, nachrichten })
    await start($ as never)
    await runde($ as never)
    const text = await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)
    expect(text).toContain('💬 ≥4096 · ≥4,1k')
})

test('lässt sich der Verlauf nicht lesen, fehlen nur die Zahlen der Chatlänge', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000, nachrichten: 'fehler' })
    await start($ as never)
    await runde($ as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    const text = await leiste(ui as never)
    expect(text).toContain('💬')
    expect(text).not.toContain('💬 0')
    expect(text).toContain('◔ 20 %')
    expect((await ui.findAll({ type: 'Button' })).map(k => k.props.key)).toEqual(['wischen', 'compact', 'details', 'warmhalten'])
})

test('/warmhalten mit Dauer, status, immer und aus', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)

    expect(await befehl($ as never, 'warmhalten', '90m')).toContain('Warmhalten an für 1 h 30 min')
    expect(await befehl($ as never, 'warmhalten', 'status')).toContain('noch 1 h 30 min')
    expect(await befehl($ as never, 'warmhalten', 'bald')).toContain('nimmt eine Dauer')
    // Immer gilt nur fuer diesen Chat, wie der Schalter.
    const immer = await befehl($ as never, 'warmhalten', 'immer')
    expect(immer).toContain('ohne Ende in diesem Chat')
    expect(immer).not.toContain('Sitzung')
    expect(await befehl($ as never, 'warmhalten', 'status')).toBe('Warmhalten an, ohne Ende in diesem Chat.')
    const k = await befehl($ as never, 'statistik')
    expect(k).toContain('Warmhalten    an, ohne Ende in diesem Chat')
    expect(k).not.toContain('jede Sitzung')
    expect(await befehl($ as never, 'warmhalten', 'aus')).toBe('Warmhalten ist aus.')
    expect(await befehl($ as never, 'warmhalten', 'status')).toBe('Warmhalten ist aus.')
})

test('/statistik zeigt Cache, Kontext, Kosten und Warmhalten', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)

    const k = await befehl($ as never, 'statistik')
    expect(k).toContain('Modell        claude-opus-5')
    expect(k).toContain('Cache         warm, noch 1 h')
    expect(k).toContain('Treffer       95 %')
    expect(k).toContain('Kontext       20 %')
    // 40000 Tokens zum Schreibpreis von Opus 5, 10 $ je Million.
    expect(k).toContain('bis zu 0,40 $')
    expect(k).toContain('Warmhalten    aus')
})

test('ein Treffer nach langer Pause belegt die Stunde, das Fragezeichen faellt weg', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)
    await clock.advance(10 * MIN)
    await runde($ as never, { input: 500, cacheRead: 40_000, cacheWrite: 300 })

    const text = await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)
    expect(text).toContain('60 min')
    expect(text).not.toContain('60 min?')
})

test('ein kalter Neuschrieb nach langer Pause belegt die Stunde nicht', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)
    await clock.advance(10 * MIN)
    // Viele Schritte: die Quote ist hoch, aber der ganze Verlauf wurde neu geschrieben.
    await runde($ as never, { input: 500, cacheRead: 360_000, cacheWrite: 40_000 })

    const text = await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)
    expect(text).toContain('60 min?')
})

/** Eine Verdichtung, wie die Engine sie beantwortet. */
function verdichtung(on: On) {
    on('session.compact', (_$, _e, _next) => ({
        messages: [{ role: 'user', text: 'Zusammenfassung', toolUses: [] }],
        tokensBefore: 40_000,
        tokensAfter: 8_000,
    }) as never)
    on('turn.step', async function* (_$, e) {
        return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use' } as never
    })
}

type Schritt$ = { turn: { step: (e: never) => AsyncIterable<unknown> } }

/** Eine Anfrage der Hauptschleife, ganz durchlaufen. */
async function schritt($: Schritt$, turnId: string, index = 0) {
    for await (const _ of $.turn.step({ turnId, index, model: 'claude-opus-5', effort: 'high', messageCount: 1 } as never)) {
        // leeren
    }
}

/** Eine Runde mit einer Anfrage dazwischen: Start, Schritt, Ende. */
async function rundeMitSchritt($: T$ & Schritt$, u: { input: number; cacheRead: number; cacheWrite: number }) {
    const id = `t${Math.random()}`
    await $.turn.start({ text: 'mach', turnId: id } as never)
    await schritt($, id)
    await $.turn.complete({
        answer: 'fertig',
        durationMs: 1000,
        isAborted: false,
        turnId: id,
        reason: 'answer',
        usage: {
            input_tokens: u.input,
            output_tokens: 100,
            cache_read_input_tokens: u.cacheRead,
            cache_creation_input_tokens: u.cacheWrite,
            model: 'claude-opus-5',
        },
    } as never)
}

test('nach einer Verdichtung laeuft die Uhr ab der ersten Anfrage der naechsten Runde, nicht erst nach ihrem Ende', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    verdichtung(on)
    await start($ as never)
    await runde($ as never)
    await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'Hallo', toolUses: [] }] } as never)

    const band = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    expect(await leiste(band as never)).toContain('Cache leer')

    // Die naechste Runde beginnt; ihre erste Anfrage schreibt den Cache neu.
    await clock.advance(5 * MIN)
    await $.turn.start({ text: 'weiter', turnId: 't-nach' } as never)
    expect(await leiste(band as never)).toContain('Cache leer')
    await schritt($ as never, 't-nach')
    let text = await leiste(band as never)
    expect(text).not.toContain('Cache leer')
    expect(text).toContain('60 min?')
    expect((await band.find({ type: 'Button', key: 'warmhalten' }))?.props.label).toBe('🔥')

    // Die Uhr laeuft, waehrend die Runde noch arbeitet.
    await clock.advance(10 * MIN)
    text = await leiste(band as never)
    expect(text).not.toContain('Cache leer')
    expect(text).toContain('50 min?')
})

test('eine Runde direkt nach einer Verdichtung belegt keine Stunde und zaehlt keinen kalten Neuschrieb', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    verdichtung(on)
    await start($ as never)
    await runde($ as never)

    // Ein Treffer nach zehn Minuten Pause belegte sonst die Stunde; nach der Verdichtung nicht,
    // auch wenn die Anzeige ab der ersten Anfrage schon wieder eine Uhr hat.
    await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'Hallo', toolUses: [] }] } as never)
    await clock.advance(10 * MIN)
    await rundeMitSchritt($ as never, { input: 500, cacheRead: 40_000, cacheWrite: 300 })
    expect(await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)).toContain('60 min?')

    // Der ganze Verlauf neu geschrieben, direkt nach einer Verdichtung: kein kalter Neuschrieb.
    await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'Hallo', toolUses: [] }] } as never)
    await clock.advance(10 * MIN)
    await rundeMitSchritt($ as never, { input: 500, cacheRead: 0, cacheWrite: 40_000 })
    expect(await befehl($ as never, 'statistik')).toContain('Kalt bezahlt  0x in dieser Sitzung')

    // Die Runde danach misst wieder: derselbe Neuschrieb zaehlt jetzt.
    await clock.advance(10 * MIN)
    await rundeMitSchritt($ as never, { input: 500, cacheRead: 0, cacheWrite: 40_000 })
    expect(await befehl($ as never, 'statistik')).toContain('Kalt bezahlt  1x in dieser Sitzung')
})

test('die Leiste weicht einer Umfrage', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props({ hasSurvey: true }) })
    expect(await leiste(ui as never)).toBe('engine')
})

// --- Nutzungszeile ---

/** Samstag, 17. Oktober 2026, 12:00 Uhr in Berlin. */
const JETZT = Date.UTC(2026, 9, 17, 10, 0, 0)
/** Donnerstag, 22. Oktober 2026, 09:00 Uhr in Berlin. */
const DONNERSTAG_9 = Date.UTC(2026, 9, 22, 7, 0, 0)
/** Montag, 19. Oktober 2026, 07:00 Uhr in Berlin: 43 Stunden nach JETZT. */
const MONTAG_7 = Date.UTC(2026, 9, 19, 5, 0, 0)

const LIMITS: Limit[] = [
    { kind: 'five_hour', percentUsed: 23, resetsAt: new Date(JETZT + (2 * 60 + 41) * MIN).toISOString() },
    { kind: 'seven_day', percentUsed: 71.5, resetsAt: new Date(DONNERSTAG_9).toISOString() },
]

const ENDPUNKT_FABLE = {
    five_hour: { utilization: 23, resets_at: new Date(JETZT + (2 * 60 + 41) * MIN).toISOString() },
    limits: [
        { kind: 'weekly_scoped', scope: { model: { display_name: 'Opus' } }, limit: { utilization: 5, resets_at: MONTAG_7 / 1000 } },
        { kind: 'weekly_scoped', scope: { model: { display_name: 'Fable' } }, limit: { utilization: 48, resets_at: MONTAG_7 / 1000 } },
    ],
}

test('Restzeit, Wochentag und das Lesen des Fable-Fensters', () => {
    expect(restUhr((2 * 60 + 41) * MIN)).toBe('02:41')
    expect(restUhr(43 * 60 * MIN)).toBe('43:00')
    expect(restUhr(-5)).toBe('00:00')
    expect(wochentagZeit(DONNERSTAG_9)).toBe('Do 09:00')
    expect(fableAus(ENDPUNKT_FABLE)).toEqual({ prozent: 48, bis: MONTAG_7 })
    expect(fableAus({ limits: [{ scope: { model: { display_name: 'Fable' } }, limit: { utilization: 12.34, resets_at: '2026-10-19T05:00:00Z' } }] })).toEqual({
        prozent: 12.3,
        bis: MONTAG_7,
    })
    expect(fableAus({ five_hour: {} })).toBeNull()
    expect(fableAus(null)).toBeNull()
    expect(fableAus({ limits: [{ scope: { model: { display_name: 'Fable' } }, limit: {} }] })).toBeNull()
})

test('Nutzungszeile: SL mit Restzeit, WL mit Wochentag; ohne Fable kein FL und keine Anfrage', async ($, on) => {
    mock.clock(on, { now: JETZT })
    mock.store(on, {})
    const b = boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000, limits: LIMITS })
    await start($ as never)
    await runde($ as never)

    const text = await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)
    expect(text).toContain('SL: 23% (02:41)')
    expect(text).toContain('WL: 72% (Do 09:00)')
    expect(text).not.toContain('FL')
    expect(text.indexOf('SL')).toBeLessThan(text.indexOf('WL'))
    // Eine Zeile, die Gruppen durch | getrennt: Chat, Kontext, Cache, dann die Limits.
    expect(text.split(' | ')).toHaveLength(4)
    expect(text.indexOf(' | ')).toBeLessThan(text.indexOf('%'))
    expect(text.indexOf('min')).toBeLessThan(text.lastIndexOf(' | '))
    expect(text.lastIndexOf(' | ')).toBeLessThan(text.indexOf('SL'))
    expect(b.abrufe).toEqual([])

    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    const tipps = (await grafiken(desktop as never)).map(t => String(t.props.alt))
    expect(tipps).toHaveLength(4)
    expect(tipps[1]).toContain('Prompt-Cache')
    expect(tipps[2]).toContain('Sitzungslimit (5 Stunden): 23 % genutzt')
    expect(tipps[2]).toContain('Zurückgesetzt um 14:41 Uhr, in 2 h 41 min')
    expect(tipps[3]).toContain('Wöchentliches Limit: 71,5 % genutzt')
    expect(tipps[3]).toContain('am Donnerstag um 09:00 Uhr')
    const knoepfe = (await desktop.findAll({ type: 'Button' })).map(k => k.props.key)
    expect(knoepfe).toEqual(['wischen', 'compact', 'details', 'warmhalten'])
})

test('mit Fable steht FL zwischen SL und WL, im Stil von SL', async ($, on) => {
    const clock = mock.clock(on, { now: JETZT })
    mock.store(on, {})
    const b = boden(on, {
        tokens: 40_000,
        fenster: 200_000,
        schwelle: 166_000,
        limits: LIMITS,
        modell: 'claude-fable-5-1',
        endpunkt: ENDPUNKT_FABLE,
    })
    await start($ as never)
    await clock.advance(0)

    const text = await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)
    expect(text).toContain('FL: 48% (Mo 07:00)')
    // 43 Stunden weg: wie WL mit Wochentag und Uhrzeit.
    expect(text).toContain('Mo 07:00')
    expect(text).not.toContain('43:00')
    expect(text.indexOf('SL')).toBeLessThan(text.indexOf('FL'))
    expect(text.indexOf('FL')).toBeLessThan(text.indexOf('WL'))
    expect(b.abrufe).toEqual(['https://api.anthropic.com/api/oauth/usage'])

    // Innerhalb von fuenf Minuten fragt der Mod nicht noch einmal.
    await runde($ as never, undefined, 'claude-fable-5-1')
    await clock.advance(0)
    expect(b.abrufe).toHaveLength(1)
    await clock.advance(6 * MIN)
    await runde($ as never, undefined, 'claude-fable-5-1')
    await clock.advance(0)
    expect(b.abrufe).toHaveLength(2)

    // Zurueck auf Opus: FL verschwindet.
    await runde($ as never)
    await clock.advance(0)
    const ohne = await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)
    expect(ohne).not.toContain('FL')
})

test('FL unter 24 Stunden zeigt die Restzeit wie SL', async ($, on) => {
    const clock = mock.clock(on, { now: JETZT })
    mock.store(on, {})
    const bald = (JETZT + (5 * 60 + 30) * MIN) / 1000
    boden(on, {
        tokens: 40_000,
        fenster: 200_000,
        schwelle: 166_000,
        limits: LIMITS,
        modell: 'claude-fable-5-1',
        endpunkt: { limits: [{ scope: { model: { display_name: 'Fable' } }, limit: { utilization: 12, resets_at: bald } }] },
    })
    await start($ as never)
    await clock.advance(0)

    const text = await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)
    expect(text).toContain('FL: 12% (05:30)')
    expect(await befehl($ as never, 'statistik')).toContain('SL: 23% (02:41), FL: 12% (05:30), WL: 72% (Do 09:00)')
})

test('antwortet der Endpunkt nicht, fehlt FL still, und /statistik sagt warum', async ($, on) => {
    const clock = mock.clock(on, { now: JETZT })
    mock.store(on, {})
    const b = boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000, limits: LIMITS, modell: 'claude-fable-5-1' })
    await start($ as never)
    await clock.advance(0)

    const text = await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)
    expect(text).toContain('SL: 23% (02:41)')
    expect(text).not.toContain('FL')
    expect(b.logs).toEqual([])
    expect(await befehl($ as never, 'statistik')).toContain('Fable-Limit   nicht abrufbar: der Nutzungs-Endpunkt antwortete mit 500')
})

test('ohne Limits gibt es keine zweite Zeile', async ($, on) => {
    mock.clock(on, { now: JETZT })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)
    const text = await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)
    expect(text).not.toContain('SL')
    expect(text).not.toContain('WL')
})

test('nach einem Neuladen laeuft die Uhr weiter, statt auf Cache leer zu springen', async ($, on) => {
    const clock = mock.clock(on, { now: JETZT })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    // Was die Sitzung vor dem Neuladen in $.state hinterlassen hat: eine Anfrage
    // vor zehn Minuten. Der Test liefert es beim ersten Lesen; das Modul selbst
    // beginnt frisch, wie nach /reload-plugins.
    let geliefert = false
    on('state.get', (_$, e, next) => {
        const name = e as unknown as { plugin: string; key: string }
        if (!geliefert && name.plugin === 'statistik' && name.key === 'lage') {
            geliefert = true
            // Wie jede Antwort einer Engine-Operation: das Ergebnis unter `value`.
            return {
                value: {
                    value: {
                        letzteAnfrage: JETZT - 10 * MIN,
                        istKompaktiert: false,
                        warmBis: 0,
                        naechsterPing: 0,
                        warmGrund: null,
                        warmImmer: false,
                        ctx: 40_000,
                        kaltUsd: null,
                        warmUsd: null,
                    },
                    version: 1,
                },
            } as never
        }
        return next(e)
    })
    await start($ as never)
    expect(geliefert).toBe(true)
    expect(await befehl($ as never, 'statistik')).toContain('Cache         warm, noch 50 min')
    await clock.advance(0)

    const band = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    const text = await leiste(band as never)
    expect(text).not.toContain('Cache leer')
    expect(text).toContain('50 min')
    expect((await band.find({ type: 'Button', key: 'warmhalten' }))?.props.label).toBe('🔥')
})

/** Zaehlt, was die Statistik als Fenster oeffnen will: Es soll nichts sein. */
function fensterZaehler(on: On) {
    const geoeffnet: string[] = []
    on('ui.open', (_$, e, _next) => {
        geoeffnet.push(e.id)
        return { value: { isPlaced: true } } as never
    })
    return geoeffnet
}

test('📊 zeigt die Kontext-Anzeige der App: /context, kein eigenes Fenster', async ($, on) => {
    mock.clock(on, { now: JETZT })
    mock.store(on, {})
    const b = boden(on, { tokens: 68_000, fenster: 200_000, schwelle: 166_000 })
    const geoeffnet = fensterZaehler(on)
    await start($ as never)
    await runde($ as never)

    for (const surface of FLAECHEN) {
        const ui = await $.ui.mount({ ...BAND, surface, props: props() })
        const knopf = await ui.find({ type: 'Button', key: 'details' })
        expect(knopf?.props.label).toBe('📊')
        expect(knopf?.props.variant).toBe('secondary')

        await ui.press({ key: 'details' })
        // Der Knopf bleibt, wie er war: kein Fenster, das offen sein koennte.
        expect((await ui.find({ type: 'Button', key: 'details' }))?.props.variant).toBe('secondary')
        expect(await leiste(ui as never)).not.toContain('Nachrichten')
    }
    expect(b.befehle).toEqual(['context', 'context'])
    expect(geoeffnet).toEqual([])
})

test('lehnt die Engine /context ab, steht es im Eingabefeld, und ein Toast sagt: Enter druecken', async ($, on) => {
    mock.clock(on, { now: JETZT })
    mock.store(on, {})
    const b = boden(on, { tokens: 68_000, fenster: 200_000, schwelle: 166_000, abgelehnt: ['context'] })
    const geoeffnet = fensterZaehler(on)
    const entwuerfe: string[] = []
    on('prompt.fill', (_$, e, _next) => {
        entwuerfe.push(String(e.text))
        return { isFilled: true } as never
    })
    const toasts: string[] = []
    on('ui.toast', (_$, e, _next) => {
        toasts.push(String(e.text))
        return { value: undefined } as never
    })
    await start($ as never)
    await runde($ as never)

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    await ui.press({ key: 'details' })
    expect(b.befehle).toEqual([])
    expect(entwuerfe).toEqual(['/context'])
    expect(toasts).toEqual(['Drück Enter, dann zeigt die App den Kontext.'])
    expect(geoeffnet).toEqual([])
})

test('zwischen den Mods darueber und der Statistik steht eine Trennlinie', async ($, on) => {
    mock.clock(on, { now: JETZT })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)
    await runde($ as never)

    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    const linie = (await desktop.findAll({ type: 'Svg' })).find(s => s.props.alt === 'Trennlinie')
    expect(linie?.props.height).toBe(7)
    expect(linie?.props.width).toBeUndefined()
    expect(String(linie?.props.source)).toContain('y="3"')
    expect(String(linie?.props.source)).toContain('height="1"')

    const terminal = await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)
    // Erst was darueber kommt, dann die Linie, dann die Statistik.
    expect(terminal.indexOf('engine')).toBeLessThan(terminal.indexOf('───'))
    expect(terminal.indexOf('───')).toBeLessThan(terminal.indexOf('min?'))
})

test('die Vorschlaege von Naechste-Schritte stehen unter der Statistik, auch wenn sie von unten kommen', async ($, on) => {
    mock.clock(on, { now: JETZT })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000, unten: 'mit-anderen' })
    await start($ as never)
    await runde($ as never)

    const text = await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)
    // Erst die anderen Mods, dann der Strich, dann die Statistik, ganz unten die Vorschlaege.
    expect(text.indexOf('engine')).toBeLessThan(text.indexOf('───'))
    expect(text.indexOf('───')).toBeLessThan(text.indexOf('min?'))
    expect(text.indexOf('min?')).toBeLessThan(text.indexOf('Vorschlag'))
    // Versetzt, nicht verdoppelt.
    expect(text.split('Vorschlag')).toHaveLength(2)
})

test('die Zeile des Autopiloten steht ganz oben, auch wenn sie von unten oder mitten aus dem Band kommt', async ($, on) => {
    mock.clock(on, { now: JETZT })
    mock.store(on, {})
    const stand: Stand = { tokens: 40_000, fenster: 200_000, schwelle: 166_000, unten: 'mit-anderen' }
    boden(on, stand)
    await start($ as never)
    await runde($ as never)

    for (const wo of ['unten', 'mitte'] as const) {
        stand.autopilot = wo
        for (const surface of FLAECHEN) {
            const ui = await $.ui.mount({ ...BAND, surface, props: props() })
            const text = await leiste(ui as never)
            // Erst der Autopilot, dann die anderen Mods, der Strich, die Statistik, ganz unten die Vorschlaege.
            expect(text.indexOf('Autopilot:')).toBe(0)
            expect(text.indexOf('Autopilot:')).toBeLessThan(text.indexOf('engine'))
            if (wo === 'mitte') {
                expect(text.indexOf('engine')).toBeLessThan(text.indexOf('Leitstand'))
            }
            expect(text.indexOf('engine')).toBeLessThan(text.indexOf('min?'))
            expect(text.indexOf('min?')).toBeLessThan(text.indexOf('Vorschlag'))
            // Versetzt, nicht verdoppelt, und als Ganzes: die Worte bleiben in ihrer Zeile.
            expect(text.split('Autopilot:')).toHaveLength(2)
            const boxen = await ui.findAll({ type: 'Box' })
            const zeile = boxen.find(b => b.props.key === 'autopilot')
            expect(JSON.stringify(zeile)).toContain('Claude arbeitet ohne Rueckfragen weiter')
            expect(JSON.stringify(boxen[0]?.children?.[0] ?? null)).toContain('"autopilot"')
        }
    }
})

test('kommt nur die Zeile des Autopiloten von unten, steht sie ueber dem Strich und der Statistik', async ($, on) => {
    mock.clock(on, { now: JETZT })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000, autopilot: 'allein' })
    await start($ as never)
    await runde($ as never)

    const text = await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)
    expect(text.indexOf('Autopilot:')).toBe(0)
    expect(text.indexOf('Autopilot:')).toBeLessThan(text.indexOf('───'))
    expect(text.indexOf('───')).toBeLessThan(text.indexOf('min?'))
})

test('kommen nur die Vorschlaege von unten, steht kein Strich ueber der Statistik', async ($, on) => {
    mock.clock(on, { now: JETZT })
    mock.store(on, {})
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000, unten: 'allein' })
    await start($ as never)
    await runde($ as never)

    for (const surface of FLAECHEN) {
        const ui = await $.ui.mount({ ...BAND, surface, props: props() })
        const text = await leiste(ui as never)
        expect(text).not.toContain('───')
        expect(text.indexOf('min?')).toBeLessThan(text.indexOf('Vorschlag'))
        expect((await ui.findAll({ type: 'Svg' })).some(s => s.props.alt === 'Trennlinie')).toBe(false)
    }
})

test('ein Countdown, der beim Neuladen laeuft, fuehrt nie aus; danach geht ein neuer Druck normal', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    toastZaehler(on)
    await start($ as never)
    await runde($ as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    for (const knopf of ['wischen', 'compact'] as const) {
        await ui.press({ key: knopf })
        await clock.advance(4_000)
        // Was ein Neuladen ausloest: session.start feuert noch einmal.
        await start($ as never)
        await clock.advance(3 * COUNTDOWN)
        expect(b.befehle).toEqual([])
    }
    expect((await ui.find({ type: 'Button', key: 'wischen' }))?.props.label).toBe('🧽')
    expect((await ui.find({ type: 'Button', key: 'compact' }))?.props.label).toBe('🔻')
    expect(await ui.find({ type: 'Button', key: 'countdown-abbrechen' })).toBeFalsy()
    // Danach startet ein neuer Druck wieder normal und fuehrt nach 10 s aus.
    await ui.press({ key: 'compact' })
    await clock.advance(COUNTDOWN)
    expect(b.befehle).toEqual(['compact'])
})

/** Ein Speicher, den der Test zurueckliest. */
function eigenerSpeicher(on: On, speicher: Map<string, unknown>) {
    on('store.get', (_$, e, _next) => ({ value: speicher.get(e.key) }))
    on('store.set', (_$, e, _next) => {
        speicher.set(e.key, e.value)
        return { value: undefined }
    })
    on('store.delete', (_$, e, _next) => {
        speicher.delete(e.key)
        return { value: undefined }
    })
    on('store.keys', (_$, _e, _next) => ({ value: [...speicher.keys()] }))
}

test('nach /clear gilt die neue Sitzungs-ID ab der naechsten Runde, auch ohne neuen Sitzungsstart', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const speicher = new Map<string, unknown>()
    eigenerSpeicher(on, speicher)
    const stand: Stand = { tokens: 40_000, fenster: 200_000, schwelle: 166_000 }
    boden(on, stand)
    await start($ as never)
    await runde($ as never)

    // /clear: neue ID, kein session.end und kein session.start.
    stand.sid = 'sitzung-2'
    await runde($ as never)
    await befehl($ as never, 'warmhalten', '90m')
    expect(speicher.has('statistik.warmBis:sitzung-2')).toBe(true)
    expect(speicher.has('statistik.warmBis:sitzung-1')).toBe(false)
})

test('abgelaufene Fristen fremder Chats werden hoechstens einmal am Tag weggeraeumt; immer und laufende bleiben', async ($, on) => {
    const TAG = 24 * 60 * MIN
    const clock = mock.clock(on, { now: 100 * TAG })
    const speicher = new Map<string, unknown>([
        ['statistik.warmBis:abgelaufen', 100 * TAG - 1],
        ['statistik.warmBis:laeuft', 100 * TAG + 60 * MIN],
        ['statistik.warmBis:ohne-ende', 'immer'],
        ['statistik.zeigeDetails', true],
    ])
    eigenerSpeicher(on, speicher)
    boden(on, { tokens: 40_000, fenster: 200_000, schwelle: 166_000 })
    await start($ as never)

    expect(speicher.has('statistik.warmBis:abgelaufen')).toBe(false)
    expect(speicher.get('statistik.warmBis:laeuft')).toBe(100 * TAG + 60 * MIN)
    expect(speicher.get('statistik.warmBis:ohne-ende')).toBe('immer')
    expect(speicher.get('statistik.zeigeDetails')).toBe(true)

    // Am selben Tag nicht noch einmal, am naechsten schon.
    speicher.set('statistik.warmBis:abgelaufen', 1)
    await start($ as never)
    expect(speicher.has('statistik.warmBis:abgelaufen')).toBe(true)
    await clock.advance(TAG)
    await start($ as never)
    expect(speicher.has('statistik.warmBis:abgelaufen')).toBe(false)
})

test('die gespeicherte Befehlsantwort nennt den Mod am Ende statt davor', async ($, on) => {
    expect(await gespeichert($, on, '<local-command-stdout>statistik: Erledigt.</local-command-stdout>')).toEqual(['<local-command-stdout>Erledigt. (gemeldet vom Mod Statistik)</local-command-stdout>'])
})

test('vor der Antwort bleiben nur die Namen anderer Mods stehen', async ($, on) => {
    expect(await gespeichert($, on, '<local-command-stdout>statistik+leitstand: Erledigt.</local-command-stdout>', '<local-command-stdout>leitstand+statistik: Erledigt.</local-command-stdout>')).toEqual([
        '<local-command-stdout>leitstand: Erledigt. (gemeldet vom Mod Statistik)</local-command-stdout>',
        '<local-command-stdout>leitstand: Erledigt. (gemeldet vom Mod Statistik)</local-command-stdout>',
    ])
})

test('nach einer mehrzeiligen Antwort steht der Mod in einer eigenen Zeile', async ($, on) => {
    expect(await gespeichert($, on, '<local-command-stdout>statistik: Eins\nZwei\n</local-command-stdout>')).toEqual(['<local-command-stdout>Eins\nZwei\n(gemeldet vom Mod Statistik)\n</local-command-stdout>'])
})

test('Zeilen ohne den eigenen Namen bleiben, wie sie sind', async ($, on) => {
    const zeilen = ['<local-command-stdout>leitstand: Erledigt.</local-command-stdout>', '<local-command-stdout>statistikx: Erledigt.</local-command-stdout>', '<local-command-stdout>Erledigt.</local-command-stdout>', 'Text ohne Rahmen']
    expect(await gespeichert($, on, ...zeilen)).toEqual(zeilen)
})
