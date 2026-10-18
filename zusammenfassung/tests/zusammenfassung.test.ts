import { expect, mock, test } from 'claude-code/testing'
import type { On, RenderElement, SessionMessage } from 'claude-code'

import { aenderungenText, diff, kuerze, leseBericht, relPfad, zeilenUmbruch } from '../hooks/register'

const BAND = { plugin: 'zusammenfassung', component: 'AbovePrompt' } as const
const FLAECHEN = ['terminal', 'desktop'] as const

const VERLAUF: SessionMessage[] = [
    { role: 'user', text: 'Bau mir die Leiste.', toolUses: [] },
    { role: 'assistant', text: 'Gebaut, zwei Dateien geaendert.', toolUses: [] },
]

const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const GETAN = 'Leiste in src/leiste.ts gebaut, Test in src/leiste.test.ts ergaenzt.'
const BEACHTE = 'Der Test prueft nur das Terminal, nicht die App.'
const ANTWORT_MODELL = `${GETAN}\n${BEACHTE}`

function props(x?: { isWorking?: boolean; hasSurvey?: boolean }) {
    return {
        hasSurvey: x?.hasSurvey ?? false,
        isWorking: x?.isWorking ?? false,
        maxRows: 14,
        bodyColumns: 100,
        scroll: { offset: 0, bodyRows: 14, isAtTop: true, isAtBottom: true },
        view: {},
    } as never
}

function fensterProps() {
    return {
        title: 'Replay',
        isFocused: true,
        bodyColumns: 60,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 30, isAtTop: true, isAtBottom: true },
        view: {},
    } as never
}

/**
 * Der Boden unter dem Mod: was die Engine sonst beantworten wuerde.
 *
 * `antworten` ist, was das Modell nacheinander sagt; zurueck kommen die
 * gestellten Fragen und die geoeffneten Fenster, damit ein Test zaehlen kann.
 */
function boden(on: On, antworten: string[], chat = { id: 'chat-a' }) {
    on('session.start', (_$, e, _next) => ({ cwd: e.cwd }))
    on('session.id', (_$, _e, _next) => ({ value: chat.id }))
    on('session.cwd', (_$, _e, _next) => ({ value: '/projekt' }))
    on('fs.exists', (_$, _e, _next) => ({ value: false }))
    on('turn.start', (_$, e, _next) => ({ turnId: e.turnId }))
    on('turn.complete', (_$, e, _next) => ({ text: e.answer, usage: e.usage }))
    on('tool.call', (_$, _e, _next) => ({ result: 'ok' }) as never)
    on('command.register', (_$, e, _next) => ({ value: { command: e.name } }))
    on('session.messages', (_$, _e, _next) => ({ value: VERLAUF }))
    const fenster: string[] = []
    on('ui.open', (_$, e, _next) => {
        fenster.push(e.id)
        return { value: { isPlaced: true } } as never
    })
    on('ui.render', { component: 'AbovePrompt' }, ($, e, _next) => {
        const { Text } = $.ui.resolve(e)
        return h(Text, {}, 'engine') as RenderElement
    })
    const fragen: string[] = []
    on('model.complete', (_$, e, _next) => {
        fragen.push(String(e.prompt))
        const text = antworten[Math.min(fragen.length - 1, antworten.length - 1)] ?? 'NONE'
        return { value: { isAnswered: true, text, usage: USAGE } }
    })
    return { fragen, fenster, chat }
}

type T$ = {
    session: { start: (e: never) => Promise<unknown> }
    turn: { start: (e: never) => Promise<unknown>; complete: (e: never) => Promise<unknown> }
    tool: { call: (e: never) => Promise<unknown> }
}

async function start($: T$) {
    await $.session.start({ cwd: '/projekt', surface: 'desktop', isInteractive: true } as never)
}

/** Eine Runde: Start, die Werkzeugaufrufe, Ende mit Dauer. */
async function runde($: T$, id: string, ms: number, aufrufe: Record<string, unknown>[]) {
    await $.turn.start({ text: 'mach', turnId: id } as never)
    for (const a of aufrufe) {
        await $.tool.call(a as never)
    }
    await $.turn.complete({ answer: 'Erledigt, die Leiste steht.', durationMs: ms, isAborted: false, turnId: id, reason: 'answer' } as never)
}

const EDIT = { tool: 'Edit', file_path: '/projekt/src/leiste.ts', old_string: 'a\nb\nc', new_string: 'a\nB\nc' }
const MULTI = {
    tool: 'MultiEdit',
    file_path: '/projekt/src/leiste.test.ts',
    edits: [
        { old_string: 'x', new_string: 'x\ny' },
        { old_string: 'z', new_string: '' },
    ],
}

async function leiste(ui: { findAll: (q: { type: string }) => Promise<{ text: string; children: unknown[] }[]> }) {
    return (await ui.findAll({ type: 'Text' }))
        .filter(t => t.children.every(k => typeof k === 'string'))
        .map(t => t.text)
        .join(' | ')
}

test('Zeilen des Modells, Diff, Pfade und Zaehlung', () => {
    expect(leseBericht(ANTWORT_MODELL)).toEqual({ getan: GETAN, beachte: BEACHTE })
    expect(leseBericht(`Zeile 1: ${GETAN}\nZeile 2: NONE`)).toEqual({ getan: GETAN, beachte: null })
    expect(leseBericht('```\n1. Getan: Etwas gebaut.\n2. Beachte: "Etwas uebersehen."\n```')).toEqual({
        getan: 'Etwas gebaut.',
        beachte: 'Etwas uebersehen.',
    })
    expect(leseBericht('NONE')).toEqual({ getan: null, beachte: null })
    expect(leseBericht('Gebaut \u2014 und getestet.')).toEqual({ getan: 'Gebaut, und getestet.', beachte: null })

    expect(diff('a\nb\nc', 'a\nB\nc')).toEqual([
        { op: ' ', t: 'a' },
        { op: '-', t: 'b' },
        { op: '+', t: 'B' },
        { op: ' ', t: 'c' },
    ])
    expect(relPfad('C:\\Users\\b\\projekt', 'C:\\Users\\b\\projekt\\src\\a.ts')).toBe('src/a.ts')
    expect(relPfad('/projekt', '/anderswo/a.ts')).toBe('/anderswo/a.ts')
    expect(
        aenderungenText([
            { werkzeug: 'Edit', datei: 'a', diff: [], notiz: '' },
            { werkzeug: 'Edit', datei: 'a', diff: [], notiz: '' },
            { werkzeug: 'Edit', datei: 'b', diff: [], notiz: '' },
        ]),
    ).toBe('3 Änderungen in 2 Dateien')

    expect(kuerze('kurz genug', 20)).toBe('kurz genug')
    expect(kuerze('Ein Satz, der deutlich zu lang ist fuer die Zeile', 20)).toBe('Ein Satz, der...')
    expect(zeilenUmbruch('eins zwei drei vier fuenf sechs', 10, 2)).toEqual(['eins zwei', 'drei...'])
    expect(zeilenUmbruch('eins zwei', 10, 2)).toEqual(['eins zwei'])
    expect(zeilenUmbruch('eins zwei drei', 10, 1)).toEqual(['eins...'])
})

test('nach einer Arbeitsrunde: Kopf mit Chevron und Kreispfeil, zwei Zeilen, Trennstrich darueber', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const { fragen } = boden(on, [ANTWORT_MODELL])

    await start($ as never)
    await runde($ as never, 't1', 5_000, [EDIT, MULTI])
    await clock.advance(0)
    expect(fragen).toHaveLength(1)
    // Das Modell bekommt Verlauf, letzte Antwort und die geaenderten Dateien.
    expect(fragen[0]).toContain('[Person] Bau mir die Leiste.')
    expect(fragen[0]).toContain('<letzte_antwort>')
    expect(fragen[0]).toContain('src/leiste.ts +1 -1')

    for (const surface of FLAECHEN) {
        const ui = await $.ui.mount({ ...BAND, surface, props: props() })
        const text = await leiste(ui as never)
        expect(text).toContain('Zusammenfassung')
        expect(text).toContain(GETAN)
        expect(text).toContain('Beachte: ')
        expect(text).toContain(BEACHTE)
        // Die Zeichen stehen im Label: die App zeichnet keinen Inhalt in Knoepfen.
        const auf = await ui.find({ type: 'Button', key: 'zf-auf' })
        expect(auf?.props.label).toBe('⏷')
        expect(auf?.children ?? []).toHaveLength(0)
        expect((await ui.find({ type: 'Button', key: 'zf-replay' }))?.props.label).toBe('⟲')
        // Die Mods darunter bleiben, unter der Zusammenfassung.
        expect(text.indexOf('Zusammenfassung')).toBeLessThan(text.indexOf('engine'))
        if (surface === 'terminal') {
            expect(text.indexOf('───')).toBeLessThan(text.indexOf('Zusammenfassung'))
        } else {
            expect((await ui.findAll({ type: 'Svg' })).some(s => s.props.alt === 'Trennlinie')).toBe(true)
        }
    }
})

test('die Zahl der Aenderungen steht im Kopf zwischen den Knoepfen', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, [`${GETAN}
NONE`])

    await start($ as never)
    await runde($ as never, 't1', 5_000, [EDIT, MULTI])
    await clock.advance(0)
    for (const surface of FLAECHEN) {
        const ui = await $.ui.mount({ ...BAND, surface, props: props() })
        const text = await leiste(ui as never)
        expect(text).toContain(GETAN)
        expect(text).not.toContain('Beachte')
        // Im Kopf: Zusammenfassung, Chevron, Anzahl, Kreispfeil; erst dann der Text.
        const kopf = (await ui.find({ type: 'Box', key: 'zf-kopf' })) as unknown as { children: { type: string; props?: Record<string, unknown> }[] }
        const folge = kopf.children.map(k => (k.type === 'Button' ? String(k.props?.key) : k.type))
        expect(folge).toEqual(['Text', 'zf-auf', 'Text', 'zf-replay'])
        expect(text.indexOf('3 Änderungen in 2 Dateien')).toBeLessThan(text.indexOf(GETAN))
    }
})

test('der Text ist zu hoechstens zwei Zeilen gekuerzt, die letzte endet mit ...', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const lang = 'Die Leiste wurde umgebaut und dabei wurden viele Dateien angefasst, Tests ergaenzt, Texte verschoben und am Ende alles neu installiert und geprueft, ohne dass dabei etwas verloren ging.'
    boden(on, [`${lang}
NONE`, `${GETAN}
${lang}`])

    await start($ as never)
    await runde($ as never, 't1', 5_000, [EDIT])
    await clock.advance(0)
    const schmal = { ...(props() as object), bodyColumns: 60 } as never
    // Im Terminal kuerzt der Mod selbst, die Zellen sind dort genau.
    let ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: schmal })
    // Ohne Einrueckung, mit Abstand zum Rand: 60 Spalten, 2 Abstand, also 58.
    const erwartet = zeilenUmbruch(lang, 58, 2)
    expect(erwartet).toHaveLength(2)
    expect(erwartet[1]!.endsWith('...')).toBe(true)
    const texte = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texte).toContain(erwartet[0]!)
    expect(texte).toContain(erwartet[1]!)
    for (const z of erwartet) {
        expect(z.length).toBeLessThanOrEqual(58)
    }
    // Aufgeklappt steht alles da.
    await ui.press({ key: 'zf-auf' })
    expect(await leiste(ui as never)).toContain(lang)

    // Mit Hinweis: Getanes eine Zeile, der Hinweis in der zweiten, gekuerzt mit ...
    await runde($ as never, 't2', 5_000, [EDIT])
    await clock.advance(0)
    ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: schmal })
    // Das Getane passt nicht in 58 Zeichen: auch diese eine Zeile endet mit ...
    const texte2 = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texte2).toContain(kuerze(GETAN, 58))
    expect(kuerze(GETAN, 58).endsWith('...')).toBe(true)
    const text = await leiste(ui as never)
    expect(text).toContain('Beachte: ')
    expect(text).not.toContain(lang)
    expect(text).toContain('...')
})

/** Die erste Textzeile, deren Text die Bedingung erfuellt. */
async function zeile(ui: { findAll: (q: { type: string }) => Promise<{ text: string; props: Record<string, unknown> }[]> }, passt: (text: string) => boolean) {
    return (await ui.findAll({ type: 'Text' })).find(t => passt(t.text))
}

/** Ein Knoten im gerenderten Baum, so weit die Tests ihn ansehen. */
type Knoten = { type: string; text: string; props: Record<string, unknown>; children: unknown[] }

/** Der Text eines verschachtelten Knotens: dort steht kein `text`, nur die Kinder. */
const inhalt = (k: Knoten) => k.children.filter(c => typeof c === 'string').join('')

const LANG =
    'Die Leiste wurde umgebaut und dabei wurden viele Dateien angefasst, Tests ergaenzt, Texte verschoben und am Ende alles neu installiert und geprueft, ohne dass dabei etwas verloren ging. ' +
    'Danach wurden die Hinweise neu geordnet, die Texte gekuerzt und die Tests fuer Terminal und App getrennt, damit beide Flaechen ihr eigenes Verhalten pruefen koennen.'

/** Das Getane in der App: genau ein Text mit dem ganzen Text, ohne Kinder-Texte, an der Kante gekuerzt. */
async function getanInApp(ui: { findAll: (q: { type: string }) => Promise<Knoten[]> }, getan: string) {
    const teile = (await ui.findAll({ type: 'Text' })).filter(t => t.text !== '' && getan.startsWith(t.text.replace(/(…|\.\.\.)$/, '')))
    expect(teile).toHaveLength(1)
    const t = teile[0]!
    expect(t.text).toBe(getan)
    expect(t.props.wrap).toBe('truncate-end')
    expect(t.children.every(k => typeof k === 'string')).toBe(true)
}

test('in der App ohne Hinweis: das Getane als ein Text mit truncate-end, der Block so breit wie das Band', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    expect(LANG.length).toBeGreaterThan(300)
    boden(on, [`${LANG}
NONE`])

    await start($ as never)
    await runde($ as never, 't1', 5_000, [EDIT])
    await clock.advance(0)
    const schmal = { ...(props() as object), bodyColumns: 60 } as never

    // Auf keiner Flaeche ein Innenabstand: der Text beginnt am linken Rand wie die Mods darunter.
    for (const surface of FLAECHEN) {
        const u = await $.ui.mount({ ...BAND, surface, props: schmal })
        const block = await u.find({ type: 'Box', key: 'zusammenfassung' })
        expect(block).toBeDefined()
        // Die Props stehen mit im JSON, sonst saehe der Test nichts.
        expect(JSON.stringify(block)).toContain('flexDirection')
        expect(JSON.stringify(block)).not.toContain('paddingX')
        // Die Breite des Bands bekommt der Block nur in der App.
        expect(block!.props.width).toBe(surface === 'desktop' ? 60 : undefined)
    }

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: schmal })
    await getanInApp(ui as never, LANG)
    const text = await leiste(ui as never)
    expect(text).not.toContain('…')
    expect(text).not.toContain('...')
})

test('in der App mit Hinweis: Beachte fest links, der Hinweis als ein Text, der schrumpfen darf', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, [`${GETAN}
${LANG}`, `${LANG}
${BEACHTE}`])

    await start($ as never)
    const schmal = { ...(props() as object), bodyColumns: 60 } as never

    /** Die Hinweis-Zeile: links "Beachte:" mit flexShrink 0, rechts der ganze Hinweis mit truncate-end. */
    const hinweisZeile = async (ui: { find: (q: { type: string; key: string }) => Promise<unknown> }, hinweis: string) => {
        const zeile = (await ui.find({ type: 'Box', key: 'zf-z2' })) as Knoten | undefined
        expect(zeile).toBeDefined()
        expect(zeile!.props.flexDirection).toBe('row')
        expect(zeile!.props.width).toBe(60)
        const [links, rechts] = zeile!.children as Knoten[]
        expect(zeile!.children).toHaveLength(2)
        expect(links!.type).toBe('Box')
        expect(links!.props.flexShrink).toBe(0)
        const beachte = links!.children as Knoten[]
        expect(beachte).toHaveLength(1)
        expect(beachte[0]!.type).toBe('Text')
        expect(inhalt(beachte[0]!)).toBe('Beachte:')
        expect(rechts!.type).toBe('Box')
        expect(rechts!.props.minWidth).toBe(0)
        expect(rechts!.props.flexGrow).toBe(1)
        expect(rechts!.props.flexShrink).toBe(1)
        const texte = rechts!.children as Knoten[]
        expect(texte).toHaveLength(1)
        expect(texte[0]!.type).toBe('Text')
        expect(inhalt(texte[0]!)).toBe(hinweis)
        expect(texte[0]!.props.wrap).toBe('truncate-end')
        expect(texte[0]!.children.every(k => typeof k === 'string')).toBe(true)
    }

    // Kurzes Getanes, langer Hinweis.
    await runde($ as never, 't1', 5_000, [EDIT])
    await clock.advance(0)
    let ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: schmal })
    await getanInApp(ui as never, GETAN)
    await hinweisZeile(ui as never, LANG)
    expect(await leiste(ui as never)).not.toContain('…')

    // Langes Getanes, kurzer Hinweis.
    await runde($ as never, 't2', 5_000, [EDIT])
    await clock.advance(0)
    ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: schmal })
    await getanInApp(ui as never, LANG)
    await hinweisZeile(ui as never, BEACHTE)
    expect(await leiste(ui as never)).not.toContain('…')
})

test('eine kurze Runde ohne Werkzeug kostet nichts und zeigt nichts', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const { fragen } = boden(on, [ANTWORT_MODELL])

    await start($ as never)
    await runde($ as never, 't1', 5_000, [])
    await clock.advance(0)
    expect(fragen).toHaveLength(0)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    expect(await leiste(ui as never)).toBe('engine')
})

test('der Chevron klappt auf: Erklaerung und Dateien, der Knopf zeigt nach oben', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const { fragen } = boden(on, [ANTWORT_MODELL, 'Ausfuehrlich: Im Test fehlt die Flaeche der App.'])

    await start($ as never)
    await runde($ as never, 't1', 5_000, [EDIT, MULTI])
    await clock.advance(0)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    // Zu: keine Dateiliste mit Zeilenzahlen.
    expect(await leiste(ui as never)).not.toContain('−1')

    await ui.press({ key: 'zf-auf' })
    expect(fragen).toHaveLength(2)
    expect(fragen[1]).toContain(`<hinweis>\n${BEACHTE}`)
    const text = await leiste(ui as never)
    expect(text).toContain('Ausfuehrlich: Im Test fehlt die Flaeche der App.')
    expect(text).toContain('src/leiste.ts  | +1 |   | −1')
    expect(text).toContain('src/leiste.test.ts  | +1 |   | −1')
    expect((await ui.find({ type: 'Button', key: 'zf-auf' }))?.props.label).toBe('⏶')

    // Wieder zu, und ein zweites Aufklappen fragt nicht noch einmal.
    await ui.press({ key: 'zf-auf' })
    expect(await leiste(ui as never)).not.toContain('Ausfuehrlich')
    await ui.press({ key: 'zf-auf' })
    expect(fragen).toHaveLength(2)
})

test('der Kreispfeil oeffnet das Replay, das Schritt fuer Schritt durch die Aenderungen geht', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const { fenster } = boden(on, [ANTWORT_MODELL])

    await start($ as never)
    await runde($ as never, 't1', 5_000, [EDIT, MULTI])
    await clock.advance(0)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    await ui.press({ key: 'zf-replay' })
    expect(fenster).toEqual(['zusammenfassung-replay'])

    for (const surface of FLAECHEN) {
        const seite = await $.ui.mount({
            plugin: 'zusammenfassung',
            surface,
            component: 'Pane',
            requestId: 'zusammenfassung-replay',
            props: fensterProps(),
        })
        let text = await leiste(seite as never)
        expect(text).toContain('Schritt 1 von 3')
        expect(text).toContain('src/leiste.ts')
        expect(text).toContain('- b')
        expect(text).toContain('+ B')
        // Schliessen zeichnet die App selbst; nur das Terminal braucht den Knopf.
        expect((await seite.find({ type: 'Button', key: 'zf-schliessen' })) !== undefined).toBe(surface === 'terminal')

        await seite.press({ key: 'zf-weiter' })
        text = await leiste(seite as never)
        expect(text).toContain('Schritt 2 von 3')
        expect(text).toContain('MultiEdit · Teil 1 von 2')
        await seite.press({ key: 'zf-zurueck' })
        expect(await leiste(seite as never)).toContain('Schritt 1 von 3')
        await seite.unmount()
    }
})

test('/replay ohne Aenderungen sagt es, mit Aenderungen oeffnet es das Fenster', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const { fenster } = boden(on, [ANTWORT_MODELL])

    await start($ as never)
    const leer = await $.command.run({ command: 'replay', args: '' } as never)
    expect(String(leer.text)).toContain('keine Dateiänderungen')
    expect(fenster).toEqual([])

    await runde($ as never, 't1', 5_000, [EDIT])
    await clock.advance(0)
    const voll = await $.command.run({ command: 'replay', args: '' } as never)
    expect(String(voll.text)).toContain('1 Änderung in 1 Datei')
    expect(fenster).toEqual(['zusammenfassung-replay'])
})

test('eine reine Antwort laesst die Zusammenfassung stehen, erst neue Arbeit ersetzt sie', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const { fragen } = boden(on, [ANTWORT_MODELL, `Zweite Runde: nur gelesen.\nNONE`])

    await start($ as never)
    await runde($ as never, 't1', 5_000, [EDIT])
    await clock.advance(0)
    const arbeitet = await $.ui.mount({ ...BAND, surface: 'desktop', props: props({ isWorking: true }) })
    expect(await leiste(arbeitet as never)).toBe('engine')
    const umfrage = await $.ui.mount({ ...BAND, surface: 'desktop', props: props({ hasSurvey: true }) })
    expect(await leiste(umfrage as never)).toBe('engine')

    // Eine kurze Antwort ohne Werkzeug: kein Modellaufruf, Zusammenfassung und Replay bleiben.
    await runde($ as never, 't2', 5_000, [])
    await clock.advance(0)
    expect(fragen).toHaveLength(1)
    const danach = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    const text = await leiste(danach as never)
    expect(text).toContain(GETAN)
    expect(text).toContain(BEACHTE)
    expect(await danach.find({ type: 'Button', key: 'zf-replay' })).toBeDefined()

    // Eine neue Arbeitsrunde ersetzt sie, auch das Replay.
    await runde($ as never, 't3', 5_000, [{ tool: 'Bash', command: 'ls' }])
    await clock.advance(0)
    const neu = await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)
    expect(neu).toContain('Zweite Runde: nur gelesen.')
    expect(neu).not.toContain(GETAN)
    expect(neu).toContain('keine Dateiänderungen')
})

test('/zusammenfassung schaltet aus, das Replay bleibt', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const { fragen } = boden(on, [ANTWORT_MODELL])

    await start($ as never)
    const aus = await $.command.run({ command: 'zusammenfassung', args: '' } as never)
    expect(String(aus.text)).toContain('aus')
    await runde($ as never, 't1', 5_000, [EDIT])
    await clock.advance(0)
    expect(fragen).toHaveLength(0)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
    const text = await leiste(ui as never)
    expect(text).toContain('1 Änderung in 1 Datei')
    expect(await ui.find({ type: 'Button', key: 'zf-replay' })).toBeDefined()

    const an = await $.command.run({ command: 'zusammenfassung', args: '' } as never)
    expect(String(an.text)).toContain('an')
    await runde($ as never, 't2', 5_000, [EDIT])
    await clock.advance(0)
    expect(fragen).toHaveLength(1)
})

test('derselbe Hinweis kommt nicht zweimal hintereinander', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, [ANTWORT_MODELL, `${GETAN}\n${BEACHTE.toUpperCase()}`])

    await start($ as never)
    await runde($ as never, 't1', 5_000, [EDIT])
    await clock.advance(0)
    await runde($ as never, 't2', 5_000, [EDIT])
    await clock.advance(0)
    const text = await leiste((await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })) as never)
    expect(text).toContain(GETAN)
    expect(text).not.toContain('Beachte')
})

test('der Kreispfeil steht auch ohne Aenderungen da, das Fenster sagt dann, dass es nichts gibt', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const { fenster } = boden(on, [`${GETAN}\nNONE`])

    await start($ as never)
    // Lang genug fuer eine Zusammenfassung, aber ohne Dateiaenderung.
    await runde($ as never, 't1', 90_000, [])
    await clock.advance(0)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
    expect(await leiste(ui as never)).toContain(GETAN)
    expect((await ui.find({ type: 'Button', key: 'zf-replay' }))?.props.label).toBe('⟲')

    await ui.press({ key: 'zf-replay' })
    expect(fenster).toEqual(['zusammenfassung-replay'])
    const seite = await $.ui.mount({
        plugin: 'zusammenfassung',
        surface: 'desktop',
        component: 'Pane',
        requestId: 'zusammenfassung-replay',
        props: fensterProps(),
    })
    expect(await leiste(seite as never)).toContain('Keine Dateiänderungen in der letzten Runde.')
})

test('/zusammenfassung in Chat A schaltet Chat B nicht mit; A behaelt seinen Wert beim Fortsetzen', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const { fragen, chat } = boden(on, [ANTWORT_MODELL])

    await start($ as never)
    const aus = await $.command.run({ command: 'zusammenfassung', args: '' } as never)
    expect(String(aus.text)).toContain('aus')

    // Ein anderer Chat beginnt mit dem Standard: an.
    chat.id = 'chat-b'
    await start($ as never)
    await runde($ as never, 't1', 5_000, [EDIT])
    await clock.advance(0)
    expect(fragen).toHaveLength(1)

    // Chat A wird fortgesetzt: dieselbe ID, ein neuer Sitzungsstart. Er bleibt aus.
    chat.id = 'chat-a'
    await start($ as never)
    await runde($ as never, 't2', 5_000, [EDIT])
    await clock.advance(0)
    expect(fragen).toHaveLength(1)

    // Und B bleibt an.
    chat.id = 'chat-b'
    await start($ as never)
    await runde($ as never, 't3', 5_000, [EDIT])
    await clock.advance(0)
    expect(fragen).toHaveLength(2)
})

test('ein neuer Chat bekommt den Standard aus den Einstellungen: an ist aus', { options: { an: false } }, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const { fragen, chat } = boden(on, [ANTWORT_MODELL])

    await start($ as never)
    await runde($ as never, 't1', 5_000, [EDIT])
    await clock.advance(0)
    expect(fragen).toHaveLength(0)

    // Im Chat eingeschaltet, gilt es nur dort.
    const an = await $.command.run({ command: 'zusammenfassung', args: '' } as never)
    expect(String(an.text)).toContain('an')
    await runde($ as never, 't2', 5_000, [EDIT])
    await clock.advance(0)
    expect(fragen).toHaveLength(1)

    chat.id = 'chat-b'
    await start($ as never)
    await runde($ as never, 't3', 5_000, [EDIT])
    await clock.advance(0)
    expect(fragen).toHaveLength(1)
})

test('der alte Schluessel fuer alle Chats wird nicht gelesen und nicht geloescht; alte fremde Chats fliegen nach 30 Tagen raus', async ($, on) => {
    const TAG = 24 * 60 * 60_000
    const clock = mock.clock(on, { now: 100 * TAG })
    const speicher = new Map<string, unknown>([
        ['zusammenfassung.aus', true],
        ['zusammenfassung.aus:chat-alt', { at: 100 * TAG - 31 * TAG, aus: true }],
        ['zusammenfassung.aus:chat-jung', { at: 100 * TAG - 29 * TAG, aus: true }],
    ])
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
    const { fragen } = boden(on, [ANTWORT_MODELL])

    await start($ as never)
    await runde($ as never, 't1', 5_000, [EDIT])
    await clock.advance(0)
    expect(fragen).toHaveLength(1)
    expect(speicher.get('zusammenfassung.aus')).toBe(true)
    expect(speicher.has('zusammenfassung.aus:chat-alt')).toBe(false)
    expect(speicher.has('zusammenfassung.aus:chat-jung')).toBe(true)

    // Am selben Tag raeumt ein zweiter Start nicht noch einmal auf.
    speicher.set('zusammenfassung.aus:chat-alt', { at: 0, aus: true })
    await start($ as never)
    expect(speicher.has('zusammenfassung.aus:chat-alt')).toBe(true)
    await clock.advance(TAG)
    await start($ as never)
    expect(speicher.has('zusammenfassung.aus:chat-alt')).toBe(false)
})
