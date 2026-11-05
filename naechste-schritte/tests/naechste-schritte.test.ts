import { describe, expect, mock, test } from 'claude-code/testing'

import { ALTE_BEFEHLE, BEFEHLE, GEMELDET, alsEintrag, angeboteneAntworten, fehlerText, hilfeText, jaNeinAntworten, leseVorschlaege, knopfText, mische, modIdAus, uebersicht } from '../hooks/register'

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
        expect(linie?.props.height).toBe(15)
        expect(String(linie?.props.source)).toContain('y="7"')
        await ui.unmount()
    })

    test('einer je Zeile, wenn das Band schmal ist', async ($, on) => {
        engine(on, () => MODELL)
        await rundeFertig($)
        const ui = await band($, 50)
        expect(await ui.find({ type: 'Text', text: /^ {15}$/ })).toBeDefined()
        await ui.unmount()
    })

    test('in der App stehen die Buttons einer je Zeile so weit auseinander, dass sie sich nicht ueberdecken', async ($, on) => {
        engine(on, () => MODELL)
        await rundeFertig($)
        const ui = await band($, 50, 'desktop')
        const spalte = ((await ui.findAll({ type: 'Box' })) as { props: Record<string, unknown> }[]).find(b => b.props.rowGap !== undefined)
        await ui.unmount()
        // In halben Zeilen (10 Pixel): die App zeichnet einen Knopf 8 Pixel hoeher als seine Zeile.
        expect(spalte?.props.rowGap).toBe(1.2)
        expect(spalte?.props.flexDirection).toBe('column')
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

    test('in der App ist jeder Vorschlag ein Button ohne Hotkey, im Terminal keiner', async ($, on) => {
        engine(on, () => MODELL)
        await rundeFertig($)
        const app = await band($, 160, 'desktop')
        const knoepfe = (await app.findAll({ type: 'Button' })) as { key?: string; text: string; props: Record<string, unknown> }[]
        expect(knoepfe.map(k => k.text)).toEqual(['1  Fuehr die neuen Tests aus', '2  Mach dasselbe fuer die Einstellungen', '3  Oeffne einen Entwurf fuer den PR'])
        expect(knoepfe.map(k => k.key)).toEqual(['naechste-schritte-1', 'naechste-schritte-2', 'naechste-schritte-3'])
        expect(knoepfe.every(k => k.props.hotkey === undefined)).toBe(true)
        expect(await app.find({ type: 'Text', text: /^1 $/ })).toBeUndefined()
        // Ohne Vorspann, ohne Rand, die Nummer blass im Knopf.
        expect(await app.find({ type: 'Text', text: /Als Nächstes/ })).toBeUndefined()
        expect(await app.find({ type: 'Text', text: /^1$/ })).toMatchObject({ props: { dimColor: true } })
        const boxen = (await app.findAll({ type: 'Box' })) as { props: Record<string, unknown> }[]
        expect(boxen.some(b => b.props.paddingX !== undefined)).toBe(false)
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

    test('ein Button holt den Vorschlag ins leere Feld', async ($, on) => {
        expect(await druecke($, on, '')).toEqual([{ text: 'Mach dasselbe fuer die Einstellungen', mode: 'replace' }])
    })

    test('ein Button haengt an, was schon getippt ist', async ($, on) => {
        expect(await druecke($, on, 'fix das ')).toEqual([{ text: 'Mach dasselbe fuer die Einstellungen', mode: 'append' }])
    })

    test('ein Button setzt ein Leerzeichen zwischen Entwurf und Vorschlag', async ($, on) => {
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

    test('in der App auch bei niedrigem Band untereinander', async ($, on) => {
        engine(on, () => MODELL)
        await rundeFertig($)
        const ui = await $.ui.mount({
            plugin: 'naechste-schritte',
            surface: 'desktop',
            ...BAND,
            props: { ...BAND.props, bodyColumns: 50, maxRows: 4 },
        } as any)
        expect((await ui.findAll({ type: 'Button' })).length).toBe(3)
        expect(await ui.find({ type: 'Text', text: /^·$/ })).toBeUndefined()
        expect(await ui.find({ type: 'Text', text: /Als Nächstes/ })).toBeUndefined()
        expect(((await ui.findAll({ type: 'Box' })) as { props: Record<string, unknown> }[]).some(b => b.props.rowGap === 1.2)).toBe(true)
        await ui.unmount()
    })

    /** Die Spalte der Knoepfe: die Box mit rowGap, darin je Zeile die Texte ihrer Buttons. */
    async function spalteDerKnoepfe(ui: any): Promise<string[][]> {
        type Knoten = { type: string; key?: string; text: string; props: Record<string, unknown>; children: unknown[] }
        const spalte = ((await ui.findAll({ type: 'Box' })) as Knoten[]).find(b => b.props.rowGap === 1.2)
        expect(spalte?.props.flexDirection).toBe('column')
        const text = new Map(((await ui.findAll({ type: 'Button' })) as Knoten[]).map(k => [k.key, k.text]))
        const istKnoten = (k: unknown): k is Knoten => typeof k === 'object' && k !== null && 'type' in k
        const knoepfeIn = (k: Knoten): Knoten[] => (k.type === 'Button' ? [k] : (k.children ?? []).filter(istKnoten).flatMap(knoepfeIn))
        return (spalte?.children ?? []).filter(istKnoten).map(z => knoepfeIn(z).map(k => text.get(String(k.props.key)) ?? ''))
    }

    test('in der App traegt jeder Button Nummer und vollen Text, alle in einer Spalte, auch kurze wie Ja und Nein', async ($, on) => {
        engine(on, () => 'Bau die Platz-Regel ein')
        await rundeFertig($, 't1', 'Die Tests laufen alle durch. Soll ich die Platz-Regel einbauen?')
        const ui = await band($, 160, 'desktop')
        const zeilen = await spalteDerKnoepfe(ui)
        expect(zeilen).toEqual([['1  Ja'], ['2  Nein'], ['3  Bau die Platz-Regel ein']])
        expect(await ui.find({ type: 'Text', text: /^·$/ })).toBeUndefined()
        await ui.unmount()
    })

    test('knopfText kuerzt auf spalten - 8 mit drei Punkten und laesst kurze Texte stehen', () => {
        const lang = 'Bau die Platz-Regel in alle fuenf Mods ein und zaehle BAND_VERSION hoch'
        expect(knopfText(lang, 50)).toBe(`${lang.slice(0, 39)}...`)
        expect(knopfText(lang, 50)).toHaveLength(42)
        expect(knopfText('Ja', 50)).toBe('Ja')
        expect(knopfText('a'.repeat(42), 50)).toBe('a'.repeat(42))
        expect(knopfText('a'.repeat(43), 50)).toBe(`${'a'.repeat(39)}...`)
        // Mindestens 12 Zeichen, auch im schmalsten Band.
        expect(knopfText(lang, 10)).toBe(`${lang.slice(0, 9)}...`)
        expect(knopfText(lang, 50)).not.toContain('\u2026')
    })

    test('ein gekuerzter Button holt beim Klick den vollen Text ins Feld', async ($, on) => {
        const lang = 'Bau die Platz-Regel in alle fuenf Mods ein und zaehle BAND_VERSION ueberall hoch'
        const gefuellt: { text: string; mode: string }[] = []
        engine(on, () => lang)
        on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
        on('prompt.fill', (_$: any, e: any) => {
            gefuellt.push({ text: e.text, mode: e.mode })
            return { isFilled: true }
        })
        await rundeFertig($)
        const ui = await band($, 50, 'desktop')
        const knopf = (await ui.find({ type: 'Button', key: 'naechste-schritte-1' })) as { text: string } | undefined
        expect(knopf?.text).toBe(`1  ${knopfText(lang, 50)}`)
        expect(knopf?.text.endsWith('...')).toBe(true)
        await ui.press({ key: 'naechste-schritte-1' })
        await warte()
        await ui.unmount()
        expect(gefuellt).toEqual([{ text: lang, mode: 'replace' }])
    })

    test('im Terminal stehen auch kurze Vorschlaege auf mehreren Zeilen', async ($, on) => {
        engine(on, () => 'Bau die Platz-Regel ein')
        await rundeFertig($, 't1', 'Die Tests laufen alle durch. Soll ich die Platz-Regel einbauen?')
        const ui = await band($, 160)
        expect(await ui.find({ type: 'Text', text: /^Als Nächstes: {2}$/ })).toBeDefined()
        expect((await ui.findAll({ type: 'Text', text: /^ {15}$/ })).length).toBe(2)
        expect(await ui.find({ type: 'Text', text: /^ {2}· {2}$/ })).toBeUndefined()
        expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
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
        expect(leseVorschlaege('Teste es mit `/x`')).toEqual(['Teste es mit /x'])
        expect(leseVorschlaege('"`npm test` laufen lassen."')).toEqual(['npm test laufen lassen'])
        expect(leseVorschlaege('Teste es mit `/x` und dann `y')).toEqual(['Teste es mit /x und dann y'])
        expect(leseVorschlaege('NONE')).toEqual([])
        expect(leseVorschlaege('Keine weiteren Schritte noetig')).toEqual([])
        expect(leseVorschlaege('Nichts mehr zu tun')).toEqual([])
        expect(leseVorschlaege('Ein paar Ideen:\nstarte es\nStarte es')).toEqual(['starte es'])
        expect(leseVorschlaege(`${'Wort '.repeat(30)}\nkurz`)).toEqual(['kurz']) // zu lang: weg, nicht gekuerzt
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
                expect(t.startsWith(`/${b.name} · `)).toBe(true)
                for (const teil of ['\nWas: ', '\nButton: ', '\nGilt: ', '\nArgumente: ']) {
                    expect(t).toContain(teil)
                }
                // Ohne Argument kein Beispiel.
                expect(t).not.toContain('Beispiel: ')
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
        const text = await befehl($, 'naechste-schritte:hilfe')
        const zeilen = text.split('\n')
        for (const name of NEUE) {
            expect(zeilen.filter(z => z.startsWith(`/${name} · `))).toHaveLength(1)
        }
        // Die Pflichtteile aus dem Leitfaden, in dieser Reihenfolge.
        const teile = ['Was der Mod tut', 'So arbeitest du damit', 'Einstellen', 'Kosten', 'Vom Handy (Remote Control)', 'Befehle']
        const stellen = teile.map(t => zeilen.indexOf(t))
        expect(stellen.every(n => n >= 0)).toBe(true)
        expect([...stellen].sort((a, b) => a - b)).toEqual(stellen)
        expect(text).toContain('Einstellen lässt sich nichts')
        expect(text).toContain('`claude plugin disable naechste-schritte@bm-mods`')
        expect(text).toContain('naechste-schritte@bjoern-mods')
        expect(zeilen[zeilen.indexOf('Befehle') + 1]).toBe('Befehlsnamen schreiben Umlaute als ae, oe, ue und ss.')
        expect(zeilen.at(-1)).toBe('Mehr zu jedem Befehl: hilfe dahinter, etwa /naechste-schritte:zeigen hilfe.')
        expect(text).not.toMatch(/[\u2013\u2014\u201E\u201C\u201D\u2026]/)
    })

    test('/naechste-schritte:zeigen nennt die Vorschlaege nummeriert und laesst sie stehen', async ($, on) => {
        engine(on, () => MODELL)
        expect(await befehl($, 'naechste-schritte:zeigen')).toBe('Gerade gibt es keine Vorschläge für den nächsten Schritt. Sie kommen nach der nächsten Antwort von Claude.')
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
        expect(await befehl($, 'naechste-schritte:1')).toBe('Gerade gibt es keine Vorschläge, abgeschickt ist nichts. Sie kommen nach der nächsten Antwort von Claude.')
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
        expect(fehlerText('naechste-schritte:2')).toBe('Das hat nicht geklappt: /naechste-schritte:2 ist an einem Fehler im Mod gescheitert. Versuch es gleich noch einmal.')
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

describe('naechste-schritte: volle ID', () => {
    test('die volle ID kommt aus enabledPlugins; ohne sie bm-mods mit dem Hinweis auf den alten Namen', async ($, on) => {
        expect(modIdAus({ 'naechste-schritte@bjoern-mods': true }, 'naechste-schritte')).toBe('naechste-schritte@bjoern-mods')
        expect(modIdAus({ 'naechste-schritte@bjoern-mods': false, 'naechste-schritte@bm-mods': true }, 'naechste-schritte')).toBe('naechste-schritte@bm-mods')
        expect(modIdAus({ 'naechste-schrittex@bm-mods': true }, 'naechste-schritte')).toBeNull()
        expect(modIdAus(null, 'naechste-schritte')).toBeNull()
        expect(uebersicht(null)).toContain('Ältere Installationen heißen `naechste-schritte@bjoern-mods`')
        expect(uebersicht('naechste-schritte@bm-mods')).not.toContain('Ältere Installationen')

        engine(on, () => MODELL)
        on('settings.read', () => ({ value: { enabledPlugins: { 'naechste-schritte@bjoern-mods': true } } }))
        await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/arbeit' } as any)
        const text = await befehl($, 'naechste-schritte:hilfe')
        expect(text).toContain('`claude plugin disable naechste-schritte@bjoern-mods`')
        expect(text).not.toContain('Ältere Installationen')
    })
})

// --- Angebotene Antworten ---

const BJOERN = 'Mein Vorschlag: zuerst Punkt 1 (Git), dann Punkt 2. Antworte „Git ja“, dann lege ich das Repository an.'
const LEITSTAND = 'Ich warte auf deine Freigabe: Schreib „los“ oder sag, was sich ändern soll.'

describe('naechste-schritte: angebotene Antworten erkennen', () => {
    test('Bjoerns Beispiel und der Satz des Leitstands', () => {
        expect(angeboteneAntworten(BJOERN)).toEqual(['Git ja'])
        expect(angeboteneAntworten(LEITSTAND)).toEqual(['los'])
    })

    test('mehrere Antworten mit oder, Komma und or', () => {
        expect(angeboteneAntworten('Antworte „ja“ oder „nein“.')).toEqual(['ja', 'nein'])
        expect(angeboteneAntworten('Antworte einfach mit „ja“, „nein“ oder „später“.')).toEqual(['ja', 'nein', 'später'])
        expect(angeboteneAntworten('Reply with "yes" or "no".')).toEqual(['yes', 'no'])
        expect(angeboteneAntworten('Sag »weiter« oder «stopp».')).toEqual(['weiter', 'stopp'])
    })

    test('die Phrase vor dem Verb und Gib ... ein', () => {
        expect(angeboteneAntworten('Du kannst mit “ja” antworten, dann geht es weiter.')).toEqual(['ja'])
        expect(angeboteneAntworten('Wenn es passt, kannst du einfach „ok“ oder „passt“ schreiben.')).toEqual(['ok', 'passt'])
        expect(angeboteneAntworten('Gib „weiter“ ein, sobald du so weit bist.')).toEqual(['weiter'])
        expect(angeboteneAntworten('Gib mir kurz Bescheid, ob „Variante A“ passt.')).toEqual([])
    })

    test('Reihenfolge des Auftretens, Doppelte fallen weg', () => {
        expect(angeboteneAntworten('Schreib „Ja“ oder „nein“. Wenn du unsicher bist, sag „ja“ oder „später“.')).toEqual(['Ja', 'nein', 'später'])
    })

    test('nichts aus Codebloecken und nichts in Backticks', () => {
        expect(angeboteneAntworten('Schreib `npm test` in die Konsole.')).toEqual([])
        expect(angeboteneAntworten('So sieht es aus:\n```\nAntworte „ja“\n```\nFertig.')).toEqual([])
        expect(angeboteneAntworten('```ts\nconst s = "x"\n```\nAntworte „ja“.')).toEqual(['ja'])
    })

    test('1 bis 60 Zeichen, kein Zeilenumbruch, nur wenige Woerter nach dem Verb', () => {
        const sechzig = 'a'.repeat(60)
        expect(angeboteneAntworten(`Antworte „${sechzig}“.`)).toEqual([sechzig])
        expect(angeboteneAntworten(`Antworte „${sechzig}b“.`)).toEqual([])
        expect(angeboteneAntworten('Antworte „“.')).toEqual([])
        expect(angeboteneAntworten('Antworte „ja\nnein“.')).toEqual([])
        expect(angeboteneAntworten('Ich sage dir morgen, wie es mit dem Projekt „Alpha“ weitergeht.')).toEqual([])
        expect(angeboteneAntworten('Er sagte "hallo". Das Wort „Haus“ ist kurz.')).toEqual([])
    })

    test('angebotene vorn, geratene dahinter ohne Doppelte, hoechstens drei', () => {
        const a = (text: string) => ({ text, art: 'angeboten' as const })
        expect(mische([a('ja')], ['Ja', 'Fuehr die Tests aus', 'Ausliefern'])).toEqual([
            a('ja'),
            { text: 'Fuehr die Tests aus', art: 'geraten' },
            { text: 'Ausliefern', art: 'geraten' },
        ])
        expect(mische([a('a'), a('b'), a('c')], ['d'])).toEqual([a('a'), a('b'), a('c')])
        expect(alsEintrag('alt')).toEqual({ text: 'alt', art: 'geraten' })
    })
})

describe('naechste-schritte: angebotene Antworten zeigen und druecken', () => {
    const ANGEBOT = 'Ich habe den Plan fertig. Antworte „Git ja“ oder „nein“, dann lege ich das Repository an.'

    test('stehen sofort da, vor Haikus Vorschlaegen; im Terminal fett', async ($, on) => {
        let los: (s: string) => void = () => {}
        const gehalten = new Promise<string>(fertig => (los = fertig))
        engine(on, () => gehalten)
        await rundeFertig($, 't1', ANGEBOT)
        // Haiku antwortet noch nicht: die angebotenen stehen schon da.
        let ui = await band($)
        expect(await ui.find({ type: 'Text', text: /^Git ja$/ })).toMatchObject({ props: { bold: true } })
        expect(await ui.find({ type: 'Text', text: /Fuehr die neuen Tests/ })).toBeUndefined()
        await ui.unmount()
        los('Nein\nFuehr die neuen Tests aus\nOeffne einen Entwurf fuer den PR')
        await warte()
        expect(await befehl($, 'naechste-schritte:zeigen')).toBe('Als Nächstes:\n1. Git ja\n2. nein\n3. Fuehr die neuen Tests aus')
        ui = await band($)
        const geraten = (await ui.find({ type: 'Text', text: /^Fuehr die neuen Tests aus$/ })) as { props: Record<string, unknown> } | undefined
        expect(geraten).toBeDefined()
        expect(geraten?.props.bold).toBeUndefined()
        await ui.unmount()
    })

    test('auch nach einer kurzen Antwort und waehrend Agenten laufen, ohne Haiku', async ($, on) => {
        const eng = engine(on, () => MODELL, [{ id: 'a1', description: 'Tests', type: 'general-purpose', status: 'running' }])
        await rundeFertig($, 't1', 'Schreib „los“.')
        expect(eng.aufrufe()).toBe(0)
        expect(await befehl($, 'naechste-schritte:zeigen')).toBe('Als Nächstes:\n1. los')
    })

    test('bei drei angebotenen kein Haiku', async ($, on) => {
        const eng = engine(on, () => MODELL)
        await rundeFertig($, 't1', 'Antworte bitte mit „a“, „b“ oder „c“, dann mache ich weiter mit der Arbeit.')
        expect(eng.aufrufe()).toBe(0)
        expect(await befehl($, 'naechste-schritte:zeigen')).toBe('Als Nächstes:\n1. a\n2. b\n3. c')
    })

    test('in der App ein hervorgehobener Button, der sofort abschickt; ein geratener fuellt nur das Feld', async ($, on) => {
        const gesendet: { text: string; origin: unknown }[] = []
        const gefuellt: unknown[] = []
        engine(on, () => 'Fuehr die neuen Tests aus', [], gesendet)
        on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
        on('prompt.fill', (_$: any, e: any) => {
            gefuellt.push({ text: e.text, mode: e.mode })
            return { isFilled: true }
        })
        await rundeFertig($, 't1', ANGEBOT)
        const ui = await band($, 160, 'desktop')
        const knoepfe = (await ui.findAll({ type: 'Button' })) as { props: Record<string, unknown> }[]
        expect(knoepfe.map(k => k.props.variant)).toEqual(['primary', 'primary', undefined])
        await ui.press({ key: 'naechste-schritte-1' })
        await warte()
        expect(gesendet.map(e => e.text)).toEqual(['Git ja'])
        expect(gesendet[0]?.origin).toMatchObject({ kind: 'plugin', asUser: true })
        expect(gefuellt).toEqual([])
        await ui.unmount()
    })

    test('in der App fuellt ein geratener Button nur das Feld', async ($, on) => {
        const gesendet: { text: string; origin: unknown }[] = []
        const gefuellt: unknown[] = []
        engine(on, () => 'Fuehr die neuen Tests aus', [], gesendet)
        on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
        on('prompt.fill', (_$: any, e: any) => {
            gefuellt.push({ text: e.text, mode: e.mode })
            return { isFilled: true }
        })
        await rundeFertig($, 't1', ANGEBOT)
        const ui = await band($, 160, 'desktop')
        await ui.press({ key: 'naechste-schritte-3' })
        await warte()
        await ui.unmount()
        expect(gesendet).toEqual([])
        expect(gefuellt).toEqual([{ text: 'Fuehr die neuen Tests aus', mode: 'replace' }])
    })

    test('im Terminal schickt die Ziffer eines angebotenen sofort ab', async ($, on) => {
        const gesendet: { text: string; origin: unknown }[] = []
        const uhr = mock.clock(on, { now: 1_000_000 })
        engine(on, () => 'Fuehr die neuen Tests aus', [], gesendet)
        await rundeFertig($, 't1', ANGEBOT)
        const r = await bearbeite($, taste('', '2') as any)
        expect(r.text).toBe('')
        await uhr.advance(0)
        await warte()
        expect(gesendet.map(e => e.text)).toEqual(['nein'])
        expect(gesendet[0]?.origin).toMatchObject({ kind: 'plugin', asUser: true })
        // Die Ziffer eines geratenen holt weiter nur den Entwurf.
        expect((await bearbeite($, taste('', '3') as any)).text).toBe('Fuehr die neuen Tests aus')
    })

    test('ein alter gespeicherter Wert mit Strings wird gelesen und gilt als geraten', async ($, on) => {
        engine(on, () => MODELL)
        on('state.get', () => ({ value: { value: { turnId: 't1', eintraege: ['Fuehr die Tests aus', 'Ausliefern'] }, version: 1 } }))
        await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/arbeit' } as any)
        expect(await befehl($, 'naechste-schritte:zeigen')).toBe('Als Nächstes:\n1. Fuehr die Tests aus\n2. Ausliefern')
        expect((await bearbeite($, taste('', '2') as any)).text).toBe('Ausliefern')
        const ui = await band($)
        expect(await ui.find({ type: 'Text', text: /^Fuehr die Tests aus$/ })).toBeDefined()
        await ui.unmount()
    })
})

// --- Ja/Nein-Fragen ---

describe('naechste-schritte: Ja/Nein-Fragen', () => {
    test('eine Ja/Nein-Frage am Schluss ergibt Ja und Nein, englisch Yes und No', () => {
        expect(jaNeinAntworten('Die Tests laufen. Soll ich die Platz-Regel einbauen?')).toEqual(['Ja', 'Nein'])
        expect(jaNeinAntworten('Fertig umgebaut.\n\nKurze Frage: Passt das so?')).toEqual(['Ja', 'Nein'])
        expect(jaNeinAntworten('Und, passt das? 🙂')).toEqual(['Ja', 'Nein'])
        expect(jaNeinAntworten('**Soll ich `npm test` laufen lassen?**')).toEqual(['Ja', 'Nein'])
        expect(jaNeinAntworten('Alles klar?')).toEqual(['Ja', 'Nein'])
        expect(jaNeinAntworten('All tests pass. Should I push it?')).toEqual(['Yes', 'No'])
    })

    test('W-Fragen, Alternativen, Fragen mitten im Text und im Code ergeben nichts', () => {
        expect(jaNeinAntworten('Welche Variante willst du?')).toEqual([])
        expect(jaNeinAntworten('Soll ich A oder B bauen?')).toEqual([])
        expect(jaNeinAntworten('Should I push or wait?')).toEqual([])
        expect(jaNeinAntworten('Soll ich die Regel einbauen? Ich warte auf dich.')).toEqual([])
        expect(jaNeinAntworten('Fertig:\n```\nSoll ich weitermachen?\n```')).toEqual([])
        expect(jaNeinAntworten('Ich habe die Datei angelegt.')).toEqual([])
        expect(jaNeinAntworten('Lange Einleitung mit vielen Woertern davor, soll ich?')).toEqual([])
    })

    test('nach einer Ja/Nein-Frage stehen Ja und Nein vorn und schicken ab; Haiku fuellt Platz drei', async ($, on) => {
        const gesendet: { text: string; origin: unknown }[] = []
        const uhr = mock.clock(on, { now: 1_000_000 })
        engine(on, () => 'Bau die Platz-Regel ein\nFuehr die Tests aus', [], gesendet)
        await rundeFertig($, 't1', 'Die Tests laufen alle durch. Soll ich die Platz-Regel einbauen?')
        expect(await befehl($, 'naechste-schritte:zeigen')).toBe('Als Nächstes:\n1. Ja\n2. Nein\n3. Bau die Platz-Regel ein')
        expect((await bearbeite($, taste('', '1') as any)).text).toBe('')
        await uhr.advance(0)
        await warte()
        expect(gesendet.map(e => e.text)).toEqual(['Ja'])
    })

    test('ein ausdrueckliches Angebot geht vor', async ($, on) => {
        engine(on, () => '')
        await rundeFertig($, 't1', 'Antworte „Git ja“, dann lege ich es an. Soll ich danach auch pushen?')
        expect(await befehl($, 'naechste-schritte:zeigen')).toBe('Als Nächstes:\n1. Git ja')
    })
})

describe('naechste-schritte: Platz im Band', () => {
    // Fremde Hoehen unterschieben; alles andere (auch die eigenen Vorschlaege) geht an die Engine.
    function fremd(on: any, hoehen: Record<string, { voll: number; klein: number }>) {
        on('state.get', async (_$: any, e: any, next: any) => {
            const h = e.key === 'bandHoehe' ? hoehen[e.plugin] : undefined
            if (e.key === 'bandHoehe' && e.plugin !== 'naechste-schritte') {
                return { value: { value: h ? { v: 1, ...h } : undefined, version: 1 } }
            }
            return next(e)
        })
    }
    const app = ($: any, props: Record<string, unknown> = {}) =>
        $.ui.mount({
            plugin: 'naechste-schritte',
            surface: 'desktop',
            ...BAND,
            props: { ...BAND.props, bodyColumns: 50, maxRows: 12, scroll: { offset: 0, bodyRows: 13 }, ...props },
        } as any)

    test('in der App: viel von anderen Mods, die Vorschlaege bleiben untereinander', async ($, on) => {
        engine(on, () => MODELL)
        fremd(on, { leitstand: { voll: 9, klein: 6 }, statistik: { voll: 1.75, klein: 1.75 } })
        await rundeFertig($)
        const ui = await app($)
        expect(await ui.find({ type: 'Text', text: /^·$/ })).toBeUndefined()
        expect(((await ui.findAll({ type: 'Box' })) as { props: Record<string, unknown> }[]).some(b => b.props.rowGap === 1.2)).toBe(true)
        await ui.unmount()
    })

    test('in der App: wenig von anderen Mods, einer je Zeile', async ($, on) => {
        engine(on, () => MODELL)
        fremd(on, { leitstand: { voll: 3, klein: 3 }, statistik: { voll: 1.75, klein: 1.75 } })
        await rundeFertig($)
        const ui = await app($)
        expect(await ui.find({ type: 'Text', text: /^·$/ })).toBeUndefined()
        expect((await ui.findAll({ type: 'Button' })).length).toBe(3)
        expect(((await ui.findAll({ type: 'Box' })) as { props: Record<string, unknown> }[]).some(b => b.props.rowGap === 1.2)).toBe(true)
        await ui.unmount()
    })

    test('im Terminal: auch knapp drei Zeilen', async ($, on) => {
        engine(on, () => MODELL)
        fremd(on, { leitstand: { voll: 4, klein: 4 } })
        await rundeFertig($)
        // Eigener Block 4 Zeilen (Strich und drei); Budget 7 ist knapp, eine Zeile gibt es trotzdem nicht.
        const knapp = await $.ui.mount({ plugin: 'naechste-schritte', surface: 'terminal', ...BAND, props: { ...BAND.props, bodyColumns: 50, maxRows: 7 } } as any)
        expect(await knapp.find({ type: 'Text', text: /^ {15}$/ })).toBeDefined()
        expect(await knapp.find({ type: 'Text', text: /^ {2}· {2}$/ })).toBeUndefined()
        await knapp.unmount()
        const weit = await $.ui.mount({ plugin: 'naechste-schritte', surface: 'terminal', ...BAND, props: { ...BAND.props, bodyColumns: 50, maxRows: 8 } } as any)
        expect(await weit.find({ type: 'Text', text: /^ {15}$/ })).toBeDefined()
        await weit.unmount()
    })

    test('veroeffentlicht die eigene Hoehe einen Takt spaeter, einmal je Aenderung, ohne Schleife', async ($, on) => {
        const uhr = mock.clock(on, { now: 1_000_000 })
        const geschrieben: { id: unknown; value: unknown }[] = []
        on('state.set', async (_$: any, e: any, next: any) => {
            if (e.key === 'bandHoehe') {
                geschrieben.push({ id: e.id, value: e.value })
            }
            return next(e)
        })
        engine(on, () => MODELL)
        fremd(on, {})
        await rundeFertig($)
        const ui = await app($)
        expect(geschrieben).toEqual([])
        await uhr.advance(1)
        // Linie 0,75 + drei Zeilen + zwei Luecken zu 0,6; eine kleinere Form gibt es nicht, klein = voll.
        expect(geschrieben).toEqual([{ id: 'desktop', value: { v: 1, voll: 4.95, klein: 4.95 } }])
        await uhr.advance(1)
        await uhr.advance(1000)
        expect(geschrieben.length).toBe(1)
        // Ohne Vorschlaege steht nichts: 0 und 0, wieder genau einmal.
        await $.prompt.submit({ text: 'weiter', origin: { kind: 'composer' } } as any)
        const leer = await app($)
        await uhr.advance(1)
        await uhr.advance(1000)
        expect(geschrieben.at(-1)).toEqual({ id: 'desktop', value: { v: 1, voll: 0, klein: 0 } })
        expect(geschrieben.length).toBe(2)
        await leer.unmount()
        await ui.unmount()
    })
})
