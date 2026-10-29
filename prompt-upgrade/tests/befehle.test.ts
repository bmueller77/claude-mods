/** Je Knopf und Schalter ein Befehl /prompt-upgrade:…: mit Hilfe, mit derselben Wirkung wie der Knopf; die alten Namen nennen den neuen. */
import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On, SessionAppendInput } from 'claude-code'

import {
    BEFEHLE,
    BEFEHL_FEHLER,
    GRUND_ABGEFANGEN,
    HILFE_BETTER,
    PANE,
    TEXT_AN,
    TEXT_AUS,
    TEXT_EINGABE,
    TEXT_HANDY_BEFEHLE,
    TEXT_KEIN_DURCHLAUF,
    TEXT_OFFEN,
} from '../hooks/register'

const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const ORIGINAL = 'Mach die Login-Seite schneller'
const FRAGEN = JSON.stringify({ fragen: [{ frage: 'Für wen ist die Seite?', optionen: ['Kunden', 'Team intern'] }] })
const UPGRADE = 'Mach die Login-Seite für Kunden schneller. Fertig ist es, wenn sie unter einer Sekunde lädt.'
const UMSCHRIFT = `<upgrade>\n${UPGRADE}\n</upgrade>\n<ergaenzt>\n- Ziel: Ladezeit\n</ergaenzt>`

const NAMEN = [
    'prompt-upgrade:hilfe',
    'prompt-upgrade:starten',
    'prompt-upgrade:automatik-an',
    'prompt-upgrade:automatik-aus',
    'prompt-upgrade:verlauf',
    'prompt-upgrade:jetzt-verbessern',
    'prompt-upgrade:ausfuehren',
    'prompt-upgrade:original-senden',
    'prompt-upgrade:kopieren',
    'prompt-upgrade:abbrechen',
]
const DURCHLAUF = ['prompt-upgrade:jetzt-verbessern', 'prompt-upgrade:ausfuehren', 'prompt-upgrade:original-senden', 'prompt-upgrade:kopieren', 'prompt-upgrade:abbrechen']

type Antwort = string | { grund: 'api-error' }

/** Der Boden unter dem Mod, wie in prompt-upgrade.test.ts, dazu die Anmeldungen. */
function boden(on: On, clock: MockClock, x: { antworten?: Antwort[]; kaputt?: () => boolean } = {}) {
    const b = {
        chat: 'chat-a',
        feld: '',
        eingang: [] as { text: string; origin: string }[],
        gefuellt: [] as { text: string; mode: string }[],
        geoeffnet: [] as string[],
        geschlossen: [] as string[],
        modell: [] as string[],
        kopiert: [] as string[],
        angemeldet: [] as { name: string; description: string; argumentHint?: string; immediate?: true }[],
    }
    const antworten = x.antworten ?? [FRAGEN, UMSCHRIFT]
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('session.id', () => {
        if (x.kaputt?.() === true) {
            throw new Error('weg')
        }
        return { value: b.chat } as never
    })
    on('command.register', (_$, e) => {
        b.angemeldet.push(e)
        return { value: { command: e.name } } as never
    })
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('turn.complete', (_$, e) => ({ text: e.answer }) as never)
    on('prompt.submit', (_$, e) => {
        const o = e.origin as { kind: string; name?: string }
        b.eingang.push({ text: e.text, origin: o.name ? `${o.kind}:${o.name}` : o.kind })
        return { text: e.text, origin: e.origin }
    })
    on('prompt.fill', (_$, e) => {
        b.gefuellt.push({ text: e.text, mode: e.mode })
        return { isFilled: true }
    })
    on('prompt.read', () => ({ value: { text: b.feld, cursor: 0 } }) as never)
    on('ui.open', (_$, e) => {
        b.geoeffnet.push(e.id)
        return { value: { isPlaced: true } } as never
    })
    on('ui.close', (_$, e) => {
        b.geschlossen.push(e.id)
        return { value: undefined } as never
    })
    on('ui.panes', () => ({ value: [{ id: PANE, title: 'Prompt-Upgrade', isShown: true, isFocused: false, isPlaced: true }] }) as never)
    on('ui.log', () => ({ value: undefined }) as never)
    on('ui.copy', (_$, e) => {
        b.kopiert.push(e.text)
        return { value: { isCopied: true } } as never
    })
    on('model.complete', (_$, e) => {
        const a = antworten[Math.min(b.modell.length, antworten.length - 1)] ?? FRAGEN
        b.modell.push(e.prompt)
        if (typeof a === 'object') {
            return { value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE } } as never
        }
        return { value: { isAnswered: true, text: a, usage: USAGE } } as never
    })
    void clock
    return b
}

async function start($: Engine) {
    await $.session.start({ cwd: '/projekt', surface: 'terminal', isInteractive: true } as never)
}

async function run($: Engine, command: string, args = '', kind = 'composer'): Promise<string> {
    const r = await $.command.run({ command, args, origin: { kind }, presentation: { isFullscreen: true, columns: 160 } } as never)
    return String(r.text ?? '')
}

/** Bis zur Pruefung: starten, die Rueckfrage ueberspringen, umschreiben lassen. */
async function bisZurPruefung($: Engine, clock: MockClock) {
    expect(await run($, 'prompt-upgrade:starten', ORIGINAL)).toBe(TEXT_OFFEN)
    await clock.settle()
    expect(await run($, 'prompt-upgrade:jetzt-verbessern')).toBe('Die übrigen Rückfragen sind übersprungen; der Prompt wird jetzt verbessert.')
    await clock.settle()
}

test('genau die freigegebenen Befehle, mit Beschreibung; angemeldet ist nur /better', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)
    expect(BEFEHLE.map(k => k.name)).toEqual(NAMEN)
    for (const k of BEFEHLE) {
        expect(k.description.length).toBeGreaterThan(10)
        // Die Langform ist eine Datei in commands/: Einen Namen mit Doppelpunkt nimmt $.command.register nicht.
        expect(b.angemeldet.find(s => s.name === k.name)).toBeUndefined()
    }
    expect(BEFEHLE.find(k => k.name === 'prompt-upgrade:starten')?.argumentHint).toBe('[Prompt]')
    // Die Kurzform bleibt, die alten Namen mit Bindestrich sind nicht mehr angemeldet.
    expect(b.angemeldet.map(s => s.name)).toEqual(['better'])
})

test('ein alter Name wie /prompt-upgrade-starten sagt nur, wie der Befehl jetzt heißt', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)
    for (const name of NAMEN) {
        const alt = name.replace('prompt-upgrade:', 'prompt-upgrade-')
        for (const arg of ['', ORIGINAL, 'hilfe']) {
            expect(await run($, alt, arg)).toBe(`Der Befehl heißt jetzt /${name}.`)
        }
    }
    await clock.settle()
    expect(b.geoeffnet).toEqual([])
    expect(b.modell).toEqual([])
    expect(b.eingang).toEqual([])
    expect(b.gefuellt).toEqual([])
    expect(b.kopiert).toEqual([])
})

test('jeder Befehl erklärt sich mit hilfe und mit ?, ohne etwas zu tun', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)
    for (const name of NAMEN) {
        for (const arg of ['hilfe', '?', 'Hilfe']) {
            const text = await run($, name, arg)
            const k = BEFEHLE.find(x => x.name === name)
            expect(text.split('\n')[0]).toBe(`/${name}${k?.argumentHint ? ` ${k.argumentHint}` : ''} · ${k?.titel}`)
            for (const teil of ['Was:', 'Button:', 'Gilt:', 'Argumente:']) {
                expect(text).toContain(`\n${teil} `)
            }
            // Ein Beispiel nur, wo es ein Argument gibt.
            expect(text.includes('\nBeispiel: ')).toBe(k?.argumentHint !== undefined)
        }
    }
    await clock.settle()
    expect(b.geoeffnet).toEqual([])
    expect(b.modell).toEqual([])
    expect(b.eingang).toEqual([])
})

test('/prompt-upgrade:hilfe listet alle Befehle mit einer Zeile', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, clock)
    await start($)
    const text = await run($, 'prompt-upgrade:hilfe')
    for (const k of BEFEHLE) {
        expect(text).toContain(`/${k.name}${k.argumentHint ? ` ${k.argumentHint}` : ''} · ${k.description}`)
    }
    // Was jemand ohne Vorwissen braucht: Abschnitte, der Weg zum Standard für neue Chats, Kosten, Handy.
    const zeilen = text.split('\n')
    const ueberschriften = ['Was der Mod tut', 'So arbeitest du damit', 'Einstellen', 'Kosten', 'Vom Handy (Remote Control)', 'Befehle']
    const stellen = ueberschriften.map(u => zeilen.indexOf(u))
    expect(stellen.every(i => i > 0)).toBe(true)
    expect([...stellen].sort((x, y) => x - y)).toEqual(stellen)
    expect(zeilen[stellen.at(-1)! + 1]).toBe('Befehlsnamen schreiben Umlaute als ae, oe, ue und ss.')
    expect(zeilen.at(-1)).toBe('Mehr zu jedem Befehl: hilfe dahinter, etwa /prompt-upgrade:starten hilfe.')
    for (const teil of ['Nur in diesem Chat:', 'Standard für neue Chats:', 'Ganz abschalten: `claude plugin disable prompt-upgrade@bm-mods`', 'Im Chat nicht umstellbar.', '--values-stdin', 'Das gilt für Chats, die danach beginnen.']) {
        expect(text).toContain(teil)
    }
    expect(text).toContain('`claude plugin configure prompt-upgrade@bm-mods`')
    expect(text).toContain('`prompt-upgrade@bjoern-mods`')
    expect(text).toContain('/better ohne Argument öffnet es mit einem leeren Feld zum Eintippen.')
    // Gerade Zeichen in neuen Texten: kein Gedankenstrich, keine Auslassungspunkte.
    expect(/[\u2013\u2014\u2026\u201e\u201c]/.test(text)).toBe(false)
})

test('/better hilfe und /better ? zeigen die Hilfe der Kurzform und tun sonst nichts', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)
    for (const arg of ['hilfe', '?', 'Hilfe', ' hilfe ']) {
        expect(await run($, 'better', arg)).toBe(HILFE_BETTER)
    }
    expect(HILFE_BETTER.split('\n')[0]).toBe('/better [Prompt | an | aus | verlauf] · Kurzform von Prompt-Upgrade')
    for (const teil of ['Was:', 'Button:', 'Gilt:', 'Argumente:', 'Beispiel:']) {
        expect(HILFE_BETTER).toContain(`\n${teil} `)
    }
    await clock.settle()
    expect(b.geoeffnet).toEqual([])
    expect(b.modell).toEqual([])
    expect(b.eingang).toEqual([])
    expect(b.gefuellt).toEqual([])
})

test('ohne offenen Durchlauf sagen die Durchlauf-Befehle das in einem Satz', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)
    for (const name of DURCHLAUF) {
        expect(await run($, name)).toBe(TEXT_KEIN_DURCHLAUF)
    }
    expect(b.eingang).toEqual([])
    expect(b.gefuellt).toEqual([])
})

test('starten wie /better <Prompt>: Text sofort, Fenster dahinter; ohne Prompt das Feld; "an" ist ein Prompt; vom Handy nichts', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)
    expect(await run($, 'prompt-upgrade:starten', ORIGINAL)).toBe(TEXT_OFFEN)
    await clock.settle()
    expect(b.geoeffnet).toEqual([PANE])
    expect(b.modell[0]).toContain(`<prompt>\n${ORIGINAL}\n</prompt>`)
    expect(await run($, 'prompt-upgrade:starten')).toBe(TEXT_EINGABE)
    expect(await run($, 'prompt-upgrade:starten', 'an')).toBe(TEXT_OFFEN)
    await clock.settle()
    expect(b.modell.at(-1)).toContain('\nan\n')
    // Die Automatik blieb dabei aus.
    expect((await $.prompt.submit({ text: 'Bau den Export neu', wait: false, origin: { kind: 'composer' } } as never)).drop).toBeUndefined()

    const vorher = b.geoeffnet.length
    expect(await run($, 'prompt-upgrade:starten', ORIGINAL, 'bridge')).toBe(TEXT_HANDY_BEFEHLE)
    await clock.settle()
    expect(b.geoeffnet).toHaveLength(vorher)
})

test('automatik-an und -aus: wie /better an|aus, nur in diesem Chat', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)
    const tippe = async (text: string) => ((await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } } as never)) as { drop?: string }).drop
    expect(await run($, 'prompt-upgrade:automatik-an')).toBe(TEXT_AN)
    expect(await tippe(ORIGINAL)).toBe(GRUND_ABGEFANGEN)
    await clock.settle()
    b.chat = 'chat-b'
    expect(await tippe('Bau den Export neu')).toBeUndefined()
    b.chat = 'chat-a'
    // Vom Handy geht der Schalter auch.
    expect(await run($, 'prompt-upgrade:automatik-aus', '', 'bridge')).toBe(TEXT_AUS)
    expect(await tippe('Bau den Export neu')).toBeUndefined()
})

test('Automatik: in der Desktop-App Getipptes (sdk) wird abgefangen, Handy und Mods gehen durch', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, clock)
    await start($)
    const sende = async (origin: Record<string, unknown>) =>
        ((await $.prompt.submit({ text: ORIGINAL, wait: false, origin } as never)) as { drop?: string }).drop
    expect(await run($, 'prompt-upgrade:automatik-an')).toBe(TEXT_AN)
    expect(await sende({ kind: 'bridge' })).toBeUndefined()
    expect(await sende({ kind: 'plugin', name: 'leitstand', asUser: true })).toBeUndefined()
    expect(await sende({ kind: 'sdk' })).toBe(GRUND_ABGEFANGEN)
    await clock.settle()
})

test('verlauf: wie „Verlauf“, Text sofort; vom Handy ohne Fenster', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)
    expect(await run($, 'prompt-upgrade:verlauf', '', 'bridge')).toBe('Noch keine Upgrades.')
    expect(b.geoeffnet).toEqual([])
    expect(await run($, 'prompt-upgrade:verlauf')).toBe('Noch keine Upgrades.')
    await clock.settle()
    expect(b.geoeffnet).toEqual([PANE])
})

test('jetzt-verbessern, kopieren und ausfuehren wirken wie ihre Knöpfe', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)
    expect(await run($, 'prompt-upgrade:starten', ORIGINAL)).toBe(TEXT_OFFEN)
    // Waehrend die Rueckfragen noch geholt werden: nichts zum Ausfuehren.
    expect(await run($, 'prompt-upgrade:ausfuehren')).toBe('Noch nichts zum Ausführen: Das Upgrade ist noch nicht fertig.')
    await clock.settle()
    expect(await run($, 'prompt-upgrade:original-senden')).toContain('Original senden gibt es nur, wenn das Upgrade gescheitert ist')
    expect(await run($, 'prompt-upgrade:jetzt-verbessern')).toBe('Die übrigen Rückfragen sind übersprungen; der Prompt wird jetzt verbessert.')
    await clock.settle()
    expect(b.modell).toHaveLength(2)
    // Umgeschrieben, die Rueckfrage ohne Antwort.
    expect(b.modell[1]).toContain(`<original>\n${ORIGINAL}\n</original>\n\n<antworten>\n(keine)`)
    expect(await run($, 'prompt-upgrade:jetzt-verbessern')).toBe('Gerade stehen keine Rückfragen offen.')

    expect(await run($, 'prompt-upgrade:kopieren')).toBe('Das Upgrade ist kopiert.')
    expect(b.kopiert).toEqual([UPGRADE])
    const handy = await run($, 'prompt-upgrade:kopieren', '', 'bridge')
    expect(handy).toBe(`Kopieren geht nur am Rechner. Hier ist das Upgrade zum Kopieren:\n\n${UPGRADE}`)
    expect(b.kopiert).toHaveLength(1)

    expect(await run($, 'prompt-upgrade:ausfuehren')).toBe('Der verbesserte Prompt geht raus; das Fenster schließt sich.')
    await clock.settle()
    expect(b.eingang).toEqual([{ text: UPGRADE, origin: 'plugin:prompt-upgrade' }])
    expect(b.geschlossen.at(-1)).toBe(PANE)
    expect(await run($, 'prompt-upgrade:ausfuehren')).toBe(TEXT_KEIN_DURCHLAUF)
    expect(await run($, 'prompt-upgrade:verlauf')).toContain(ORIGINAL)
})

test('original-senden: wie „Original senden“ auf der Fehlerkarte', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock, { antworten: [{ grund: 'api-error' }] })
    await start($)
    await run($, 'prompt-upgrade:starten', ORIGINAL)
    await clock.settle()
    expect(await run($, 'prompt-upgrade:original-senden')).toBe('Der Original-Prompt geht unverändert raus; das Fenster schließt sich.')
    await clock.settle()
    expect(b.eingang).toEqual([{ text: ORIGINAL, origin: 'plugin:prompt-upgrade' }])
    expect(b.geschlossen.at(-1)).toBe(PANE)
})

test('abbrechen: wie „Abbrechen“, der Prompt kommt zurück ins Eingabefeld', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)
    await bisZurPruefung($, clock)
    expect(await run($, 'prompt-upgrade:abbrechen')).toBe('Abgebrochen: Das Fenster ist zu, dein Prompt steht wieder im Eingabefeld. Gesendet wurde nichts.')
    expect(b.gefuellt).toEqual([{ text: ORIGINAL, mode: 'replace' }])
    expect(b.geschlossen.at(-1)).toBe(PANE)
    expect(b.eingang).toEqual([])
    // Das leere Eingabefeld zum Eintippen: nichts zurueckzulegen.
    expect(await run($, 'prompt-upgrade:starten')).toBe(TEXT_EINGABE)
    expect(await run($, 'prompt-upgrade:abbrechen')).toBe('Abgebrochen: Das Fenster ist zu. Gesendet wurde nichts.')
    expect(b.gefuellt).toHaveLength(1)
})

test('ein Fehler wird zu einem schlichten Satz', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    let kaputt = false
    boden(on, clock, { kaputt: () => kaputt })
    await start($)
    kaputt = true
    expect(await run($, 'prompt-upgrade:automatik-an')).toBe(BEFEHL_FEHLER)
    expect(await run($, 'prompt-upgrade:automatik-aus')).toBe(BEFEHL_FEHLER)
})

test('die Antworten der neuen Befehle bekommen den Zusatz statt des Vorsatzes', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, clock)
    await start($)
    const aus = (text: string) => `<local-command-stdout>${text}</local-command-stdout>`
    const ein: SessionAppendInput = {
        door: 'command',
        origin: { kind: 'composer' },
        uuid: 'befehl-1',
        message: { type: 'system', name: 'local_command', content: [{ type: 'text', text: aus(`prompt-upgrade: ${TEXT_KEIN_DURCHLAUF}`) }] },
    }
    const r = await $.session.append(ein as unknown as Parameters<Engine['session']['append']>[0])
    const k = r.message?.content[0]
    expect(k?.type === 'text' ? k.text : '').toBe(aus(`${TEXT_KEIN_DURCHLAUF} (gemeldet vom Mod Prompt-Upgrade)`))
})
