import { describe, expect, mock, test } from 'claude-code/testing'

import { ALTE_BEFEHLE, BEFEHLE, GEMELDET, fehlerText, hilfeText, leseVorschlaege, passtInEineZeile } from '../hooks/register'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 160 } }
const ANTWORT = 'Ich habe Tests fuer das Login-Formular geschrieben, sie laufen lokal durch.'
const MODELL = 'Fuehr die neuen Tests aus\nMach dasselbe fuer die Einstellungen\nOeffne einen Entwurf fuer den PR'

const warte = () => new Promise(fertig => (globalThis as any).setTimeout(fertig, 10))

// Steht fuer die Engine unter dem Mod. `antwort` kann den Modellaufruf festhalten, bis der Test ihn loslaesst.
function engine(on: any, antwort: () => Promise<string> | string, agenten: unknown[] = [], gesendet: unknown[] = []) {
    let aufrufe = 0
    on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
    on('prompt.submit', (_$: any, e: any) => {
        gesendet.push(e)
        return { text: '' }
    })
    on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    on('agent.list', () => ({ value: agenten }))
    on('session.messages', () => ({ value: [{ role: 'user', text: 'schreib Tests fuer das Login-Formular', toolUses: [] }] }))
    on('model.complete', async () => {
        aufrufe++
        return { value: { isAnswered: true, text: await antwort(), usage: { input_tokens: 1, output_tokens: 1 } } }
    })
    // Der Editor: fuegt das Getippte in den Entwurf ein.
    on('prompt.edit', (_$: any, e: any) => {
        const text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
        return { text, cursor: e.start + e.inputText.length }
    })
    on('ui.render', ($: any, e: any) => {
        const { Text } = $.ui.resolve(e)
        return Text({ children: 'Statistik darueber' }) // steht fuer die Baender anderer Mods
    })
    return { aufrufe: () => aufrufe }
}

async function rundeFertig($: any, turnId = 't1', antwort = ANTWORT) {
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/arbeit' })
    await $.turn.start({ text: 'schreib Tests', turnId })
    await $.turn.complete({ reason: 'answer', answer: antwort, durationMs: 1, isAborted: false, turnId })
    await warte()
}

const band = ($: any, spalten = 160, surface: 'terminal' | 'desktop' = 'terminal') =>
    $.ui.mount({ plugin: 'naechste-schritte', surface, ...BAND, props: { ...BAND.props, bodyColumns: spalten } })

/** Alle innersten Texte, aneinandergehaengt. */
async function text(ui: any): Promise<string> {
    return ((await ui.findAll({ type: 'Text' })) as { text: string; children: unknown[] }[])
        .filter(t => t.children.every(k => typeof k === 'string'))
        .map(t => t.text)
        .join('')
}

/** Eine Eingabe ins Feld; der Testtyp fuehrt `prompt.edit` nicht, die Engine schon. */
const bearbeite = ($: any, e: unknown): Promise<{ text: string; cursor: number }> => $.prompt.edit(e)

const taste = (feld: string, eingabe: string) => ({
    origin: { kind: 'composer' },
    text: feld,
    cursor: feld.length,
    start: feld.length,
    end: feld.length,
    inputText: eingabe,
    key: { key: eingabe },
})

describe('naechste-schritte', () => {
    test('zeigt die Vorschlaege nach einer Runde, auf Deutsch, unter allem anderen und einem Trennstrich', async ($, on) => {
        engine(on, () => MODELL)
        await rundeFertig($)
        const ui = await band($)
        expect(await ui.find({ type: 'Text', text: /^Als Nächstes: {2}$/ })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: /^Fuehr die neuen Tests aus$/ })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: /^Oeffne einen Entwurf fuer den PR$/ })).toBeDefined()
        const alles = await text(ui)
        expect(alles).not.toContain('ausblenden')
        // Erst was darueber kommt, dann der Strich, dann die Vorschlaege.
        expect(alles.indexOf('Statistik darueber')).toBeLessThan(alles.indexOf('───'))
        expect(alles.indexOf('───')).toBeLessThan(alles.indexOf('Als Nächstes'))
        // Der Block traegt den Schluessel, an dem ihn die Statistik findet.
        expect(await ui.find({ type: 'Box', key: 'naechste-schritte' })).toBeDefined()
        await ui.unmount()
    })

    test('in der App ist der Trennstrich eine duenne Linie', async ($, on) => {
        engine(on, () => MODELL)
        await rundeFertig($)
        const ui = await band($, 160, 'desktop')
        const linie = ((await ui.findAll({ type: 'Svg' })) as { props: Record<string, unknown> }[]).find(s => s.props.alt === 'Trennlinie')
        expect(linie?.props.height).toBe(7)
        expect(String(linie?.props.source)).toContain('y="3"')
        await ui.unmount()
    })

    test('einer je Zeile, wenn das Band schmal ist', async ($, on) => {
        engine(on, () => MODELL)
        await rundeFertig($)
        const ui = await band($, 50)
        expect(await ui.find({ type: 'Text', text: /^ {15}$/ })).toBeDefined()
        await ui.unmount()
    })

    test('ein Ergebnis, das nach einer neuen Runde kommt, zaehlt nicht', async ($, on) => {
        let los: (s: string) => void = () => {}
        const gehalten = new Promise<string>(fertig => (los = fertig))
        engine(on, () => gehalten)
        await rundeFertig($, 't1')
        await $.turn.start({ text: 'etwas anderes', turnId: 't2' } as any)
        los(MODELL)
        await warte()
        const ui = await band($)
        expect(await ui.find({ type: 'Text', text: /Fuehr die neuen Tests/ })).toBeUndefined()
        await ui.unmount()
    })

    test('eine Ziffer im leeren Eingabefeld holt den Vorschlag als Entwurf', async ($, on) => {
        engine(on, () => MODELL)
        await rundeFertig($)
        const r = await bearbeite($, taste('', '2') as any)
        expect(r.text).toBe('Mach dasselbe fuer die Einstellungen')
        expect(r.cursor).toBe('Mach dasselbe fuer die Einstellungen'.length)
    })

    test('eine Ziffer hinter Text bleibt eine Ziffer', async ($, on) => {
        engine(on, () => MODELL)
        await rundeFertig($)
        const r = await bearbeite($, taste('fix Fehler ', '1') as any)
        expect(r.text).toBe('fix Fehler 1')
    })

    test('eine eingefuegte Ziffer bleibt Text', async ($, on) => {
        engine(on, () => MODELL)
        await rundeFertig($)
        const { key: _key, ...einfuegen } = taste('', '1')
        expect((await bearbeite($, einfuegen as any)).text).toBe('1')
    })

    test('ein Ergebnis, das nach dem Abschicken kommt, zaehlt nicht', async ($, on) => {
        let los: (s: string) => void = () => {}
        const gehalten = new Promise<string>(fertig => (los = fertig))
        engine(on, () => gehalten)
        await rundeFertig($, 't1')
        await $.prompt.submit({ text: 'weiter', wait: false, origin: { kind: 'user' } } as any)
        los(MODELL)
        await warte()
        const ui = await band($)
        expect(await ui.find({ type: 'Text', text: /Fuehr die neuen Tests/ })).toBeUndefined()
        await ui.unmount()
    })

    test('Runden von Subagenten zaehlen nicht', async ($, on) => {
        const eng = engine(on, () => MODELL)
        await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/arbeit' } as any)
        await $.turn.complete({ reason: 'answer', answer: ANTWORT, durationMs: 1, isAborted: false, turnId: 'x', agentId: 'a1' } as any)
        await warte()
        expect(eng.aufrufe()).toBe(0)
    })

    test('eine Ziffer ohne Vorschlag dazu bleibt eine Ziffer', async ($, on) => {
        engine(on, () => MODELL)
        await rundeFertig($)
        expect((await bearbeite($, taste('', '7') as any)).text).toBe('7')
    })

    test('0 im leeren Eingabefeld bleibt eine 0, die Vorschlaege bleiben', async ($, on) => {
        engine(on, () => MODELL)
        await rundeFertig($)
        expect((await bearbeite($, taste('', '0') as any)).text).toBe('0')
        const ui = await band($)
        expect(await ui.find({ type: 'Text', text: /^Fuehr die neuen Tests aus$/ })).toBeDefined()
        await ui.unmount()
    })

    test('in der App Knoepfe 1 bis 3 ohne Hotkey, im Terminal keine', async ($, on) => {
        engine(on, () => MODELL)
        await rundeFertig($)
        const app = await band($, 160, 'desktop')
        const knoepfe = (await app.findAll({ type: 'Button' })) as { key?: string; props: Record<string, unknown> }[]
        expect(knoepfe.map(k => k.props.label)).toEqual(['1️⃣', '2️⃣', '3️⃣'])
        expect(knoepfe.map(k => k.key)).toEqual(['naechste-schritte-1', 'naechste-schritte-2', 'naechste-schritte-3'])
        expect(knoepfe.every(k => k.props.hotkey === undefined)).toBe(true)
        expect(await app.find({ type: 'Text', text: /^1 $/ })).toBeUndefined()
        expect(await app.find({ type: 'Text', text: /^Fuehr die neuen Tests aus$/ })).toBeDefined()
        // Ohne Vorspann, ohne Rand, Knoepfe ohne Kinder.
        expect(await app.find({ type: 'Text', text: /Als Nächstes/ })).toBeUndefined()
        const boxen = (await app.findAll({ type: 'Box' })) as { props: Record<string, unknown> }[]
        expect(boxen.some(b => b.props.paddingX !== undefined)).toBe(false)
        expect((knoepfe as unknown as { children: unknown[] }[]).every(k => k.children.length === 0)).toBe(true)
        await app.unmount()
        const terminal = await band($)
        expect(await terminal.findAll({ type: 'Button' })).toHaveLength(0)
        expect(await terminal.find({ type: 'Text', text: /^1 $/ })).toBeDefined()
        expect(await terminal.find({ type: 'Text', text: /Als Nächstes/ })).toBeDefined()
        await terminal.unmount()
    })

    /** Ein Druck auf Knopf 2 in der App, bei diesem Entwurf; was im Feld landen soll und was abgeschickt wird. */
    async function druecke($: any, on: any, entwurf: string, gesendet: { text: string; origin: unknown }[] = []) {
        engine(on, () => MODELL, [], gesendet)
        const gefuellt: { text: string; mode: string }[] = []
        on('prompt.read', () => ({ value: { text: entwurf, cursor: entwurf.length } }))
        on('prompt.fill', (_$: any, e: any) => {
            gefuellt.push({ text: e.text, mode: e.mode })
            return { isFilled: true }
        })
        await rundeFertig($)
        const ui = await band($, 160, 'desktop')
        await ui.press({ key: 'naechste-schritte-2' })
        await warte()
        await ui.unmount()
        return gefuellt
    }

    test('ein Knopf holt den Vorschlag ins leere Feld', async ($, on) => {
        expect(await druecke($, on, '')).toEqual([{ text: 'Mach dasselbe fuer die Einstellungen', mode: 'replace' }])
    })

    test('ein Knopf haengt an, was schon getippt ist', async ($, on) => {
        expect(await druecke($, on, 'fix das ')).toEqual([{ text: 'Mach dasselbe fuer die Einstellungen', mode: 'append' }])
    })

    test('ein Knopf setzt ein Leerzeichen zwischen Entwurf und Vorschlag', async ($, on) => {
        expect(await druecke($, on, 'fix das')).toEqual([{ text: ' Mach dasselbe fuer die Einstellungen', mode: 'append' }])
    })

    test('ein zweiter Druck schickt den Vorschlag ab', async ($, on) => {
        const gesendet: { text: string; origin: unknown }[] = []
        const vorschlag = 'Mach dasselbe fuer die Einstellungen'
        expect(await druecke($, on, vorschlag, gesendet)).toEqual([{ text: '', mode: 'replace' }])
        expect(gesendet.map(e => e.text)).toEqual([vorschlag])
        expect(gesendet[0]?.origin).toMatchObject({ kind: 'plugin', asUser: true })
    })

    test('ein Druck neben anderem Text schickt nichts ab', async ($, on) => {
        const gesendet: { text: string; origin: unknown }[] = []
        expect(await druecke($, on, 'fix das', gesendet)).toEqual([{ text: ' Mach dasselbe fuer die Einstellungen', mode: 'append' }])
        expect(gesendet).toEqual([])
    })

    test('in der App einzeilig, wenn das Band niedrig ist, auch mit Knoepfen', async ($, on) => {
        engine(on, () => MODELL)
        await rundeFertig($)
        const ui = await $.ui.mount({
            plugin: 'naechste-schritte',
            surface: 'desktop',
            ...BAND,
            props: { ...BAND.props, bodyColumns: 50, maxRows: 4 },
        } as any)
        expect((await ui.findAll({ type: 'Button' })).map((k: { props: Record<string, unknown> }) => k.props.label)).toEqual(['1️⃣', '2️⃣', '3️⃣'])
        expect(await ui.find({ type: 'Text', text: /^·$/ })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: /Als Nächstes/ })).toBeUndefined()
        await ui.unmount()
    })

    test('ein abgeschickter Prompt raeumt die Vorschlaege weg', async ($, on) => {
        engine(on, () => MODELL)
        await rundeFertig($)
        await $.prompt.submit({ text: 'weiter', wait: false, origin: { kind: 'user' } } as any)
        const ui = await band($)
        expect(await ui.find({ type: 'Text', text: /Fuehr die neuen Tests/ })).toBeUndefined()
        await ui.unmount()
    })

    test('nach einer kurzen Antwort kein Modellaufruf und nichts zu sehen', async ($, on) => {
        const eng = engine(on, () => MODELL)
        await rundeFertig($, 't1', 'Erledigt.')
        expect(eng.aufrufe()).toBe(0)
        const ui = await band($)
        expect(await ui.find({ type: 'Text', text: /Als Nächstes/ })).toBeUndefined()
        expect(await ui.find({ type: 'Text', text: /Statistik darueber/ })).toBeDefined()
        await ui.unmount()
    })

    test('nichts zu sehen, wenn das Modell nichts vorschlaegt', async ($, on) => {
        engine(on, () => '')
        await rundeFertig($)
        const ui = await band($)
        expect(await ui.find({ type: 'Text', text: /Als Nächstes/ })).toBeUndefined()
        await ui.unmount()
    })

    test('wartet, solange Agenten im Hintergrund laufen', async ($, on) => {
        const eng = engine(on, () => MODELL, [{ id: 'a1', description: 'Tests', type: 'general-purpose', status: 'running' }])
        await rundeFertig($)
        expect(eng.aufrufe()).toBe(0)
    })

    test('reinigt die Zeilen des Modells', () => {
        expect(leseVorschlaege('1. Fuehr die Tests aus.\n- Oeffne einen PR — als Entwurf\n\n* "Ausliefern"\nvier')).toEqual([
            'Fuehr die Tests aus',
            'Oeffne einen PR, als Entwurf',
            'Ausliefern',
        ])
        expect(leseVorschlaege('["a", "b"]')).toEqual(['a', 'b'])
        expect(leseVorschlaege('```json\n["Fuehr die Tests aus", "Ausliefern"]\n```')).toEqual(['Fuehr die Tests aus', 'Ausliefern'])
        expect(leseVorschlaege('{"prompts": ["Starte es"]}')).toEqual(['Starte es'])
        expect(leseVorschlaege('Hier sind drei Vorschlaege\n**Behebe die 3 roten Tests**\nSchau dir die 3 roten Tests an')).toEqual([
            'Behebe die 3 roten Tests',
            'Schau dir die 3 roten Tests an',
        ])
        expect(leseVorschlaege('NONE')).toEqual([])
        expect(leseVorschlaege('Keine weiteren Schritte noetig')).toEqual([])
        expect(leseVorschlaege('Nichts mehr zu tun')).toEqual([])
        expect(leseVorschlaege('Ein paar Ideen:\nstarte es\nStarte es')).toEqual(['starte es'])
        expect(leseVorschlaege(`${'Wort '.repeat(30)}\nkurz`)).toEqual(['kurz']) // zu lang: weg, nicht gekuerzt
        expect(passtInEineZeile(['a', 'b'], 60)).toBe(true)
        expect(passtInEineZeile(['a'.repeat(40), 'b'.repeat(40)], 80)).toBe(false)
    })
})

// --- Die Einzelbefehle ---

const NEUE = ['naechste-schritte:hilfe', 'naechste-schritte:zeigen', 'naechste-schritte:1', 'naechste-schritte:2', 'naechste-schritte:3']

const befehl = async ($: any, name: string, args = '') => String((await $.command.run({ command: name, args })).text ?? '')

/** Befehlsantworten, wie die Engine sie speichert; zurueck kommen die Zeilen, wie der Mod sie umschrieb. */
async function gespeichert($: any, on: any, ...texte: string[]): Promise<string[]> {
    const sitzung = mock.session(on)
    for (const [n, t] of texte.entries()) {
        await $.session.append({
            message: { type: 'system', name: 'local_command', content: [{ type: 'text', text: t }] },
            door: 'command',
            origin: { kind: 'engine' },
            uuid: `befehl-${n}`,
        })
    }
    return sitzung.appended().map((z: any) => {
        const b = z.message.content[0]
        return typeof b?.text === 'string' ? b.text : ''
    })
}

describe('naechste-schritte: Befehle', () => {
    test('die Tabelle der Einzelbefehle ist vollstaendig', () => {
        expect(BEFEHLE.map(b => b.name)).toEqual(NEUE)
    })

    for (const b of BEFEHLE) {
        test(`/${b.name}: nicht angemeldet (eine Datei in commands/), mit deutscher Beschreibung, und hilfe wie ? erklaert ihn`, async ($, on) => {
            const angemeldet: { name: string }[] = []
            engine(on, () => MODELL)
            on('command.register', (_$: any, e: any) => {
                angemeldet.push(e)
                return { value: { command: e.name } }
            })
            await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/arbeit' } as any)
            // Ein Name mit Doppelpunkt laesst sich nicht anmelden; Claude Code setzt naechste-schritte: vor die Datei.
            expect(b.name.startsWith('naechste-schritte:')).toBe(true)
            expect(angemeldet.find(a => a.name === b.name)).toBeUndefined()
            expect(b.description).toMatch(/[äöüÄÖÜß]/)
            expect(b.description).not.toContain('(Nächste Schritte)')
            for (const arg of ['hilfe', '?', ' Hilfe ']) {
                const t = await befehl($, b.name, arg)
                expect(t).toBe(hilfeText(b))
                for (const teil of [`/${b.name}: `, 'Knopf: ', 'Gilt: ', 'Argumente: ', 'Beispiel: /']) {
                    expect(t).toContain(teil)
                }
            }
        })
    }

    test('angemeldet wird nichts, auch kein alter Name', async ($, on) => {
        const angemeldet: { name: string }[] = []
        engine(on, () => MODELL)
        on('command.register', (_$: any, e: any) => {
            angemeldet.push(e)
            return { value: { command: e.name } }
        })
        await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/arbeit' } as any)
        expect(angemeldet).toEqual([])
    })

    test('ein alter Name sagt den neuen und tut sonst nichts', async ($, on) => {
        const gesendet: { text: string }[] = []
        const uhr = mock.clock(on, { now: 1_000_000 })
        engine(on, () => MODELL, [], gesendet)
        await rundeFertig($)
        expect([...ALTE_BEFEHLE.keys()]).toEqual(NEUE.map(n => n.replace(':', '-')))
        expect(await befehl($, 'naechste-schritte-zeigen')).toBe('Der Befehl heißt jetzt /naechste-schritte:zeigen.')
        expect(await befehl($, 'naechste-schritte-hilfe', 'hilfe')).toBe('Der Befehl heißt jetzt /naechste-schritte:hilfe.')
        expect(await befehl($, 'naechste-schritte-1')).toBe('Der Befehl heißt jetzt /naechste-schritte:1.')
        await uhr.advance(0)
        await warte()
        expect(gesendet).toEqual([])
    })

    test('/naechste-schritte:hilfe listet alle Befehle des Mods mit einer Zeile', async ($, on) => {
        engine(on, () => MODELL)
        const zeilen = (await befehl($, 'naechste-schritte:hilfe')).split('\n')
        for (const name of NEUE) {
            expect(zeilen.filter(z => z.startsWith(`/${name}: `))).toHaveLength(1)
        }
        expect(zeilen).toHaveLength(NEUE.length + 1)
    })

    test('/naechste-schritte:zeigen nennt die Vorschlaege nummeriert und laesst sie stehen', async ($, on) => {
        engine(on, () => MODELL)
        expect(await befehl($, 'naechste-schritte:zeigen')).toBe('Gerade gibt es keine Vorschläge für den nächsten Schritt.')
        await rundeFertig($)
        expect(await befehl($, 'naechste-schritte:zeigen')).toBe(
            'Als Nächstes:\n1. Fuehr die neuen Tests aus\n2. Mach dasselbe fuer die Einstellungen\n3. Oeffne einen Entwurf fuer den PR',
        )
        // Die Zeile des Befehls geht durch prompt.submit; die Vorschlaege bleiben trotzdem.
        await $.prompt.submit({
            text: '/naechste-schritte:zeigen',
            command: { name: 'naechste-schritte:zeigen', args: '' },
            wait: false,
            origin: { kind: 'composer' },
        } as any)
        const ui = await band($)
        expect(await ui.find({ type: 'Text', text: /^Fuehr die neuen Tests aus$/ })).toBeDefined()
        await ui.unmount()
    })

    for (const n of [1, 2, 3]) {
        test(`/naechste-schritte:${n} schickt Vorschlag ${n} als Nachricht der Person ab`, async ($, on) => {
            const gesendet: { text: string; origin: unknown }[] = []
            const uhr = mock.clock(on, { now: 1_000_000 })
            engine(on, () => MODELL, [], gesendet)
            await rundeFertig($)
            const vorschlag = MODELL.split('\n')[n - 1]!
            expect(await befehl($, `naechste-schritte:${n}`)).toBe(`Vorschlag ${n} ist abgeschickt: ${vorschlag}`)
            // Abgeschickt wird erst nach der Antwort des Befehls.
            expect(gesendet).toEqual([])
            await uhr.advance(0)
            await warte()
            expect(gesendet.map(e => e.text)).toEqual([vorschlag])
            expect(gesendet[0]?.origin).toMatchObject({ kind: 'plugin', asUser: true })
        })
    }

    test('ohne Vorschlag schicken die Befehle nichts ab und sagen das', async ($, on) => {
        const gesendet: { text: string; origin: unknown }[] = []
        engine(on, () => 'Fuehr die neuen Tests aus\nMach dasselbe fuer die Einstellungen', [], gesendet)
        expect(await befehl($, 'naechste-schritte:1')).toBe('Gerade gibt es keine Vorschläge, abgeschickt ist nichts.')
        await rundeFertig($)
        expect(await befehl($, 'naechste-schritte:3')).toBe('Gerade gibt es keinen 3. Vorschlag, nur 2; abgeschickt ist nichts.')
        await warte()
        expect(gesendet).toEqual([])
    })

    test('scheitert ein Befehl, kommt ein schlichter deutscher Satz', async ($, on) => {
        engine(on, () => MODELL)
        // Ein kaputter Wert im Zustand: die Liste fehlt.
        on('state.get', () => ({ value: { value: { turnId: 't1', eintraege: null }, version: 1 } }))
        await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/arbeit' } as any)
        expect(await befehl($, 'naechste-schritte:2')).toBe(fehlerText('naechste-schritte:2'))
        expect(fehlerText('naechste-schritte:2')).toBe('/naechste-schritte:2 hat nicht geklappt. Versuch es gleich noch einmal.')
    })

    test('die gespeicherte Befehlsantwort nennt den Mod am Ende statt davor', async ($, on) => {
        expect(
            await gespeichert(
                $,
                on,
                '<local-command-stdout>naechste-schritte: Vorschlag 1 ist abgeschickt: Mach weiter</local-command-stdout>',
                '<local-command-stdout>statistik+naechste-schritte: Als Nächstes:\n1. A\n</local-command-stdout>',
                '<local-command-stdout>statistik: Erledigt.</local-command-stdout>',
            ),
        ).toEqual([
            `<local-command-stdout>Vorschlag 1 ist abgeschickt: Mach weiter ${GEMELDET}</local-command-stdout>`,
            `<local-command-stdout>statistik: Als Nächstes:\n1. A\n${GEMELDET}\n</local-command-stdout>`,
            '<local-command-stdout>statistik: Erledigt.</local-command-stdout>',
        ])
    })
})
