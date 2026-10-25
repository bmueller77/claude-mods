import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BEFEHLE, EINSCHAETZUNG_MS, HILFE, HINWEIS_OHNE, UEBERNAHME_MS } from '../hooks/register'
import { GEMELDET } from '../hooks/logik'

const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const MIN = 60_000

type Antwort = string | 'zeit' | 'fehler'
type Stand = {
    sid: string
    antworten: Antwort[]
    nachrichten: { role: 'user' | 'assistant'; text: string; toolUses: never[] }[]
    kontext: number | undefined
    limits: { kind: string; percentUsed: number; resetsAt?: string }[]
    turns: number
}

/** Der Boden unter dem Mod: was die Engine sonst beantworten wuerde, mit Protokoll. */
function boden(on: On, x: Partial<Stand> = {}) {
    const stand: Stand = {
        sid: 'sitzung-1',
        antworten: [],
        nachrichten: [],
        kontext: undefined,
        limits: [],
        turns: 0,
        ...x,
    }
    const b = {
        stand,
        anfragen: [] as { model: string; effort?: string; timeoutMs?: number; prompt: string }[],
        schritte: [] as { model: string; effort: unknown; agentId?: string }[],
        eingang: [] as { text: string; context: readonly string[] }[],
        befehle: [] as string[],
        status: [] as (string | undefined)[],
        toasts: [] as string[],
        angemeldet: [] as { name: string; description: string; argumentHint?: string; immediate?: true }[],
    }
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('session.end', (_$, e) => ({ sessionId: e.sessionId }) as never)
    on('session.id', () => {
        if (stand.sid === 'kaputt') {
            throw new Error('weg')
        }
        return { value: stand.sid } as never
    })
    on('session.turns', () => ({ value: stand.turns }) as never)
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }) as never)
    on('session.messages', () => ({ value: stand.nachrichten }) as never)
    on('session.usage', () => ({
        value: { startedAt: 0, context: { tokens: stand.kontext, window: 200_000 }, rateLimits: stand.limits },
    }) as never)
    on('classic.SessionStart', () => ({}) as never)
    on('classic.PostModelSwitch', () => ({}) as never)
    on('command.register', (_$, e) => {
        b.angemeldet.push(e)
        return { value: { command: e.name } } as never
    })
    on('command.run', (_$, e) => {
        b.befehle.push(`${e.command} ${e.args}`.trim())
        return { text: '' }
    })
    on('ui.status', (_$, e) => {
        b.status.push(e.text as string | undefined)
        return { value: undefined } as never
    })
    on('ui.toast', (_$, e) => {
        b.toasts.push(String(e.text))
        return { value: undefined } as never
    })
    on('ui.log', () => ({ value: undefined }) as never)
    on('model.complete', (_$, e) => {
        b.anfragen.push({ model: e.model, effort: e.effort as string | undefined, timeoutMs: e.timeoutMs, prompt: e.prompt })
        const a = stand.antworten.shift() ?? 'zeit'
        if (a === 'zeit') {
            return { value: { isAnswered: false, reason: 'aborted', usage: USAGE } } as never
        }
        if (a === 'fehler') {
            return { value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE } } as never
        }
        return { value: { isAnswered: true, text: a, usage: USAGE } } as never
    })
    on('prompt.submit', (_$, e) => {
        b.eingang.push({ text: e.text, context: e.context ?? [] })
        return { text: e.text, context: e.context, origin: e.origin }
    })
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('turn.step', async function* (_$, e) {
        b.schritte.push({ model: e.model, effort: e.effort, ...(e.agentId ? { agentId: e.agentId } : {}) })
        return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }) as never)
    return b
}

function wahlJson(modell: string, aufwand: string, grund = 'Umbau über mehrere Dateien'): string {
    return JSON.stringify({ modell, aufwand, grund })
}

async function start($: Engine, quelle: 'startup' | 'resume' | 'clear' | null = 'startup', interaktiv = false) {
    if (quelle) {
        await $.classic.SessionStart({ source: quelle } as never)
    }
    await $.session.start({ cwd: '/projekt', surface: null, isInteractive: interaktiv } as never)
}

async function sende($: Engine, text: string, kind = 'sdk', extra: Record<string, unknown> = {}) {
    await $.prompt.submit({ text, origin: { kind }, wait: false, ...extra } as never)
}

/** Ein Schritt der Hauptschleife (oder eines Subagenten), bis zum Ende gelesen. */
async function schritt($: Engine, model = 'claude-sonnet-5-5', effort: string = 'medium', agentId?: string) {
    const s = $.turn.step({ turnId: 't1', index: 0, model, effort, messageCount: 3, ...(agentId ? { agentId } : {}) } as never)
    for await (const _ of s) {
        // Die Teile sind hier egal.
    }
    return s.result
}

async function rundeEnde($: Engine, usage?: Record<string, unknown>, agentId?: string) {
    await $.turn.complete({
        answer: 'fertig',
        durationMs: 1000,
        isAborted: false,
        turnId: 't1',
        reason: 'answer',
        ...(usage ? { usage } : {}),
        ...(agentId ? { agentId } : {}),
    } as never)
}

async function befehl($: Engine, name: string, args = '', kind = 'sdk'): Promise<string> {
    const r = await $.command.run({ command: name, args, origin: { kind }, presentation: { isFullscreen: false, columns: 100 } } as never)
    return String(r.text ?? '')
}

const BAND = {
    plugin: 'modellwahl',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 80, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

/** Das Band: Texte und Knoepfe, darunter eine Zeile, die fuer die anderen Mods steht. */
async function band($: Engine, on: On, surface: 'desktop' | 'terminal' | 'mobile' = 'desktop') {
    const ui = await $.ui.mount({ ...BAND, surface } as never)
    const texte = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    const knoepfe = (await ui.findAll({ type: 'Button' })).map(k => k.text)
    return { ui, texte, knoepfe }
}

/** Was die anderen Mods unter der Modellwahl zeichnen. */
function darunter(on: On) {
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: ['DARUNTER'] }) as never)
}

const MITTEN_IM_CHAT = [
    { role: 'user' as const, text: 'Lies die Datei vor.', toolUses: [] as never[] },
    { role: 'assistant' as const, text: 'Hier ist sie.', toolUses: [] as never[] },
]

test('alle Befehle angemeldet, sofort, mit deutscher Beschreibung und Hinweis', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on)
    await start($)
    expect(b.angemeldet.map(a => a.name)).toEqual([
        'modellwahl',
        'modellwahl-uebernehmen',
        'modellwahl-ablehnen',
        'modellwahl-zeigen',
        'modellwahl-hilfe',
        'modellwahl-auto-an',
        'modellwahl-auto-aus',
    ])
    for (const a of b.angemeldet) {
        expect(a.immediate).toBe(true)
        expect(a.description).toContain('(Modellwahl)')
        expect(a.argumentHint ?? '').not.toBe('')
    }
})

test('neuer Chat: die erste Nachricht schlägt vor und läuft sofort; nach 15 s gilt der Vorschlag mit voller ID und Aufwand', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('opus', 'high')] })
    await start($)
    await sende($, 'Bau den Login-Dialog um, über mehrere Dateien.')

    expect(b.anfragen).toHaveLength(1)
    expect(b.anfragen[0]?.model).toBe('haiku')
    expect(b.anfragen[0]?.effort).toBe('low')
    expect(b.anfragen[0]?.timeoutMs).toBe(EINSCHAETZUNG_MS)
    expect(b.anfragen[0]?.prompt).toContain('Login-Dialog')
    // Der Hinweis an Claude: genau ein kurzer Satz vorweg.
    expect(b.eingang[0]?.context.join('\n')).toContain('„Modellwahl schlägt Opus · hoch vor.“')
    expect(b.status.at(-1)).toBe('Modellwahl: Vorschlag Opus · hoch')
    // Die Nachricht wartet nicht: der erste Schritt geht mit dem Modell aus dem Menü.
    await schritt($)
    expect(b.schritte[0]).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' })

    await clock.advance(UEBERNAHME_MS)
    expect(b.status.at(-1)).toBe('Modellwahl: Opus · hoch')
    expect(b.toasts.at(-1)).toBe('Modellwahl: Opus · hoch übernommen.')
    await schritt($)
    await schritt($, 'claude-sonnet-5-5', 'medium', 'agent-7')
    expect(b.schritte[1]).toEqual({ model: 'claude-opus-5-5', effort: 'high' })
    // Der Subagent bleibt, wie er ist.
    expect(b.schritte[2]).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium', agentId: 'agent-7' })

    // Die zweite Nachricht waehlt nicht noch einmal.
    await sende($, 'Und jetzt die Tests.')
    expect(b.anfragen).toHaveLength(1)
})

test('Desktop-App: kein /model und kein /effort; die Auswahl der App zieht die Wahl nicht zurück', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('haiku', 'low', 'einfache Faktenfrage')] })
    await start($, 'startup', false)
    await sende($, 'Wie viele Tage hat der Februar 2028?')
    await clock.advance(UEBERNAHME_MS)
    // Die App läuft auf Opus · Extra hoch; die Anfrage geht trotzdem mit Haiku · niedrig.
    await schritt($, 'claude-opus-5-5', 'xhigh')
    await rundeEnde($, { ...USAGE, model: 'claude-haiku-5-5' })
    await clock.settle()
    expect(b.befehle).toEqual([])
    // Die App schickt ihre Auswahl noch einmal, ohne Wechsel: keine Entscheidung der Person.
    await $.classic.PostModelSwitch({ from_model: 'claude-opus-5-5', to_model: 'claude-opus-5-5', requested_model: 'opus', source: 'sdk' } as never)
    expect(await befehl($, 'modellwahl-zeigen')).toContain('Zurückgezogen: nein.')
    await schritt($, 'claude-opus-5-5', 'xhigh')
    expect(b.schritte.at(-1)).toEqual({ model: 'claude-haiku-5-5', effort: 'low' })
    expect(b.status.at(-1)).toBe('Modellwahl: Haiku · niedrig')
})

test('Terminal: nur turn.step, kein /model; der Vorschlag gilt nach 15 s wie in der App', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('sonnet', 'medium')] })
    await start($, 'startup', true)
    await sende($, 'Fass das zusammen.', 'composer')
    await schritt($, 'claude-opus-5-5', 'xhigh')
    await clock.advance(UEBERNAHME_MS)
    await schritt($, 'claude-opus-5-5', 'xhigh')
    await rundeEnde($)
    await clock.settle()
    expect(b.befehle).toEqual([])
    expect(b.schritte[0]).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })
    expect(b.schritte[1]).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' })
})
test('fortgesetzter Chat: keine automatische Wahl; eine gespeicherte gilt weiter', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, { 'wahl:sitzung-1': { modell: 'fable', aufwand: 'xhigh', grund: 'harter Fehler', at: 900_000, zurueckgezogen: false } })
    const b = boden(on, { antworten: [wahlJson('haiku', 'low')], turns: 4 })
    await start($, 'resume')
    await sende($, 'Weiter.')
    expect(b.anfragen).toHaveLength(0)
    expect(b.status.at(-1)).toBe('Modellwahl: Fable · sehr hoch')
    await schritt($)
    expect(b.schritte[0]).toEqual({ model: 'claude-fable-5-1', effort: 'xhigh' })
})

test('ohne SessionStart: Rückfall auf die Zahl der Runden', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('haiku', 'low')], turns: 0 })
    await start($, null)
    await sende($, 'Was heißt Haus auf Englisch?')
    expect(b.anfragen).toHaveLength(1)
    expect(b.status.at(-1)).toBe('Modellwahl: Vorschlag Haiku · niedrig')
})

test('Befehle, Meta-Prompts und Anstöße von Plugins wählen nicht', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('haiku', 'low')] })
    await start($)
    await sende($, 'Weiter so.', 'plugin', { origin: { kind: 'plugin', name: 'autopilot' } })
    await sende($, 'versteckt', 'sdk', { isMeta: true })
    expect(b.anfragen).toHaveLength(0)
    await sende($, 'Echte Frage.', 'bridge')
    expect(b.anfragen).toHaveLength(1)
})

test('/clear: der neue Chat wählt neu', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('opus', 'high'), wahlJson('haiku', 'low')] })
    await start($)
    await sende($, 'Großer Umbau.')
    await $.session.end({ reason: 'clear', sessionId: 'sitzung-1', resume: { id: 'sitzung-1' } } as never)
    b.stand.sid = 'sitzung-2'
    await $.classic.SessionStart({ source: 'clear' } as never)
    expect(b.status.at(-1)).toBeUndefined()
    await schritt($)
    // Ohne Wahl im neuen Chat bleibt die Anfrage, wie sie ist.
    expect(b.schritte[0]).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' })
    await sende($, 'Kurze Frage.')
    expect(b.anfragen).toHaveLength(2)
    expect(b.status.at(-1)).toBe('Modellwahl: Vorschlag Haiku · niedrig')
})

test('Zeitüberschreitung: alles bleibt, kurze Meldung', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: ['zeit'] })
    await start($)
    await sende($, 'Bau den Login um.')
    expect(b.toasts[0]).toContain('keine Antwort in 5 s')
    expect(b.eingang[0]?.context).toEqual([HINWEIS_OHNE])
    await schritt($)
    expect(b.schritte[0]).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' })
})

test('unlesbare Antwort: alles bleibt', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: ['Ich würde Opus nehmen.'] })
    await start($)
    await sende($, 'Bau den Login um.')
    expect(b.toasts[0]).toContain('Antwort unlesbar')
    await schritt($)
    expect(b.schritte[0]).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' })
})

test('/modellwahl mitten im Chat mit Ziel Opus: Vorschlag mit Tokens und Prozent, ja übernimmt sofort', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {
        kalibrierung: { quote: 1e-6, proben: 3, basisProzent: 40, basisReset: null, summe: 0, at: 900_000 },
    })
    const b = boden(on, {
        antworten: [wahlJson('opus', 'high')],
        nachrichten: MITTEN_IM_CHAT,
        kontext: 120_000,
        limits: [{ kind: 'five_hour', percentUsed: 40 }],
        turns: 2,
    })
    await start($, 'resume')
    await schritt($, 'claude-sonnet-5-5', 'medium')
    const text = await befehl($, 'modellwahl', 'Refactoring des Parsers')
    // 120k Tokens Kontext, neu geschrieben zum Opus-Preis (2 je Opus-Eingabe-Token): 240k, mal 1e-6 % = 0,2 %.
    expect(text).toBe(
        'Modellwahl-Vorschlag: Opus · hoch – Umbau über mehrere Dateien. Der Wechsel liest 120k Tokens Kontext neu, ' +
            'etwa 0,2 % deines 5-Stunden-Limits (jetzt 40 % verbraucht). ' +
            'Gilt in 15 s, wenn du nichts tust; verwerfen mit Nein über der Eingabe oder /modellwahl nein.',
    )
    expect(b.anfragen[0]?.prompt).toContain('Refactoring des Parsers')
    expect(b.anfragen[0]?.prompt).toContain('Claude: Hier ist sie.')
    await schritt($, 'claude-sonnet-5-5', 'medium')
    expect(b.schritte.at(-1)).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' })

    expect(await befehl($, 'modellwahl', 'ja')).toBe('Modellwahl: Opus · hoch – Umbau über mehrere Dateien. Kontext wird einmal neu gelesen.')
    await schritt($, 'claude-sonnet-5-5', 'medium')
    expect(b.schritte.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'high' })
    expect(await befehl($, 'modellwahl', 'ja')).toContain('Kein offener Vorschlag')
})

test('mitten im Chat gilt auch Opus oder Fable nach 15 s ohne Reaktion', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('fable', 'xhigh')], nachrichten: MITTEN_IM_CHAT, kontext: 50_000 })
    await start($, 'resume')
    await schritt($, 'claude-sonnet-5-5', 'medium')
    await befehl($, 'modellwahl')
    await clock.advance(UEBERNAHME_MS - 1000)
    expect(await befehl($, 'modellwahl-zeigen')).toContain('Offener Vorschlag: Fable · sehr hoch, gilt in 1 s.')
    await clock.advance(1000)
    await schritt($, 'claude-sonnet-5-5', 'medium')
    expect(b.schritte.at(-1)).toEqual({ model: 'claude-fable-5-1', effort: 'xhigh' })
})

test('vom Handy: kein Countdown, der Vorschlag wartet zehn Minuten auf ja', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('fable', 'xhigh')], nachrichten: MITTEN_IM_CHAT, kontext: 50_000 })
    await start($, 'resume')
    const text = await befehl($, 'modellwahl', '', 'bridge')
    // Ohne Kalibrierung: nur die Token-Zahl und der Vergleich mit normalen Runden.
    expect(text).toContain('50k Tokens Kontext')
    expect(text).toContain('etwa so viel wie 80 normale Runden')
    expect(text).not.toContain('5-Stunden-Limits')
    expect(text).toContain('Übernehmen mit ja, ok oder /modellwahl ja (10 Minuten lang).')
    // Nichts gilt von selbst.
    await clock.advance(5 * MIN)
    await schritt($)
    expect(b.schritte[0]).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' })
    expect(await befehl($, 'modellwahl-zeigen', '', 'bridge')).toContain('wartet auf ja')
    await clock.advance(6 * MIN)
    expect(await befehl($, 'modellwahl', 'ja', 'bridge')).toContain('Kein offener Vorschlag')
    await schritt($)
    expect(b.schritte[1]).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' })
})

test('vom Handy: ja, ok oder Okay übernehmen; die Nachricht geht trotzdem an Claude', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('haiku', 'low', 'einfache Frage')] })
    await start($)
    await sende($, 'Wie spät ist es in Tokio?', 'bridge')
    expect(b.eingang[0]?.context.join('\n')).toContain('„Modellwahl schlägt Haiku · niedrig vor, übernehmen mit ja oder ok.“')
    await clock.advance(MIN)
    await schritt($, 'claude-opus-5-5', 'xhigh')
    expect(b.schritte.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })

    await sende($, 'Okay!', 'bridge')
    expect(b.eingang.at(-1)?.text).toBe('Okay!')
    expect(b.eingang.at(-1)?.context.join('\n')).toContain('„Modellwahl: Haiku · niedrig übernommen.“')
    expect(b.status.at(-1)).toBe('Modellwahl: Haiku · niedrig')
    await schritt($, 'claude-opus-5-5', 'xhigh')
    expect(b.schritte.at(-1)).toEqual({ model: 'claude-haiku-5-5', effort: 'low' })
    // Ohne offenen Vorschlag ist ein ja nur ein ja.
    await sende($, 'ja', 'bridge')
    expect(b.eingang.at(-1)?.context).toEqual([])
})

test('/modellwahl nein, /modellwahl-ablehnen und /modellwahl-uebernehmen', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('opus', 'high'), wahlJson('haiku', 'low')], nachrichten: MITTEN_IM_CHAT })
    await start($, 'resume')
    await schritt($, 'claude-sonnet-5-5', 'medium')
    await befehl($, 'modellwahl')
    expect(await befehl($, 'modellwahl-ablehnen')).toBe('Modellwahl: Vorschlag verworfen. Modell und Aufwand bleiben, wie sie sind.')
    expect(await befehl($, 'modellwahl', 'nein')).toBe('Modellwahl: Kein offener Vorschlag.')
    expect(b.status.at(-1)).toBeUndefined()
    await clock.advance(UEBERNAHME_MS)
    await schritt($, 'claude-sonnet-5-5', 'medium')
    expect(b.schritte.at(-1)).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' })

    await befehl($, 'modellwahl')
    expect(await befehl($, 'modellwahl-uebernehmen')).toBe('Modellwahl: Haiku · niedrig – Umbau über mehrere Dateien. Kontext wird einmal neu gelesen.')
    await schritt($, 'claude-sonnet-5-5', 'medium')
    expect(b.schritte.at(-1)).toEqual({ model: 'claude-haiku-5-5', effort: 'low' })
})

test('Band in der App: Vorschlag mit Countdown, Übernehmen per Knopf', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('opus', 'high')] })
    darunter(on)
    await start($)
    let sicht = await band($, on)
    expect(sicht.texte.join(' ')).not.toContain('Modellwahl')
    expect(sicht.texte).toContain('DARUNTER')
    await sicht.ui.unmount()

    await sende($, 'Bau den Login um.')
    sicht = await band($, on)
    expect(sicht.texte).toContain('Modellwahl schlägt Opus · hoch vor · gilt in 15 s')
    expect(sicht.knoepfe).toEqual(['Übernehmen', 'Nein'])
    expect(sicht.texte).toContain('DARUNTER')
    await clock.advance(5000)
    const spaeter = (await sicht.ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(spaeter).toContain('Modellwahl schlägt Opus · hoch vor · gilt in 10 s')
    await sicht.ui.press({ key: 'modellwahl-ja' })
    expect(b.status.at(-1)).toBe('Modellwahl: Opus · hoch')
    expect((await sicht.ui.findAll({ type: 'Button' })).length).toBe(0)
    await sicht.ui.unmount()
    await schritt($)
    expect(b.schritte.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'high' })
})

test('Band: Nein verwirft, das Modell aus dem Menü bleibt; im Terminal schlichte Knöpfe', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('opus', 'high')] })
    darunter(on)
    await start($, 'startup', true)
    await sende($, 'Bau den Login um.', 'composer')
    const sicht = await band($, on, 'terminal')
    expect(sicht.knoepfe).toEqual(['[Übernehmen]', '[Nein]'])
    await sicht.ui.press({ key: 'modellwahl-nein' })
    await sicht.ui.unmount()
    expect(b.status.at(-1)).toBeUndefined()
    await clock.advance(UEBERNAHME_MS)
    await schritt($)
    expect(b.schritte.at(-1)).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' })
})

test('auf dem Handy zeigt das Band nichts', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { antworten: [wahlJson('opus', 'high')] })
    darunter(on)
    await start($)
    await sende($, 'Bau den Login um.')
    const sicht = await band($, on, 'mobile')
    expect(sicht.texte.join(' ')).not.toContain('Modellwahl')
    expect(sicht.knoepfe).toEqual([])
    await sicht.ui.unmount()
})

test('/modellwahl mit derselben Wahl: bleibt', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('opus', 'high')], nachrichten: MITTEN_IM_CHAT })
    await start($, 'resume')
    await schritt($, 'claude-opus-5-5', 'high')
    expect(await befehl($, 'modellwahl')).toBe('Modellwahl: bleibt bei Opus · hoch.')
    expect(b.anfragen).toHaveLength(1)
})

test('/modellwahl im leeren Chat: ohne Aufgabe bei der nächsten Nachricht, mit Aufgabe gleich als Vorschlag', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('fable', 'high'), wahlJson('opus', 'medium')] })
    await start($, 'resume')
    expect(await befehl($, 'modellwahl', 'Der härteste Fehler der Welt')).toContain('Modellwahl-Vorschlag: Fable · hoch – Umbau über mehrere Dateien.')
    await clock.advance(UEBERNAHME_MS)
    await schritt($)
    expect(b.schritte[0]).toEqual({ model: 'claude-fable-5-1', effort: 'high' })

    expect(await befehl($, 'modellwahl')).toBe('Modellwahl: Ich schlage bei deiner nächsten Nachricht vor.')
    await sende($, 'Neue Aufgabe.')
    expect(b.anfragen).toHaveLength(2)
    expect(b.status.at(-1)).toBe('Modellwahl: Vorschlag Opus · mittel')
})

test('Modell von Hand gewechselt (App): zurückgezogen, nichts mehr überschrieben', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('opus', 'high')] })
    await start($)
    await sende($, 'Bau um.')
    await clock.advance(UEBERNAHME_MS)
    await schritt($)
    await $.classic.PostModelSwitch({ from_model: 'claude-opus-5-5', to_model: 'claude-haiku-5-5', requested_model: 'haiku', source: 'sdk' } as never)
    await schritt($, 'claude-haiku-5-5', 'medium')
    expect(b.schritte.at(-1)).toEqual({ model: 'claude-haiku-5-5', effort: 'medium' })
    expect(b.status.at(-1)).toBeUndefined()
    expect(await befehl($, 'modellwahl-zeigen')).toContain('Zurückgezogen: Du hast Modell oder Aufwand selbst umgestellt.')
})

test('von Hand umgestellt, solange der Vorschlag läuft: er ist verworfen', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('opus', 'high')] })
    await start($)
    await sende($, 'Bau um.')
    await $.classic.PostModelSwitch({ from_model: 'claude-sonnet-5-5', to_model: 'claude-haiku-5-5', requested_model: 'haiku', source: 'picker' } as never)
    expect(b.status.at(-1)).toBeUndefined()
    await clock.advance(UEBERNAHME_MS)
    await schritt($, 'claude-haiku-5-5', 'medium')
    expect(b.schritte.at(-1)).toEqual({ model: 'claude-haiku-5-5', effort: 'medium' })
})

test('nach einem Wechsel von Hand vergleicht /modellwahl mit dem neuen Modell der Sitzung', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { antworten: [wahlJson('opus', 'xhigh')], nachrichten: MITTEN_IM_CHAT, kontext: 50_000 })
    await start($, 'resume')
    await schritt($, 'claude-opus-5-5', 'xhigh')
    await $.classic.PostModelSwitch({ from_model: 'claude-opus-5-5', to_model: 'claude-haiku-5-5', requested_model: 'haiku', source: 'picker' } as never)
    // Vorher verglich der Mod mit dem alten Opus und sagte "bleibt bei Opus · sehr hoch".
    const text = await befehl($, 'modellwahl', 'Baue einen neuen Mod mit Tests')
    expect(text).toContain('Modellwahl-Vorschlag: Opus · sehr hoch')
    expect(text).toContain('Gilt in 15 s')
})

test('Rückfall und Wiederherstellen sind kein Wechsel der Person', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('opus', 'high')] })
    await start($)
    await sende($, 'Bau um.')
    await $.classic.PostModelSwitch({ from_model: 'a', to_model: 'b', requested_model: null, source: 'auto' } as never)
    await $.classic.PostModelSwitch({ from_model: 'a', to_model: 'b', requested_model: null, source: 'resume' } as never)
    await clock.advance(UEBERNAHME_MS)
    await schritt($)
    expect(b.schritte.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'high' })
})

test('Aufwand von Hand geändert: zurückgezogen', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('opus', 'high')] })
    await start($, 'startup', true)
    await sende($, 'Bau um.', 'composer')
    await clock.advance(UEBERNAHME_MS)
    await schritt($, 'claude-sonnet-5-5', 'medium')
    await schritt($, 'claude-sonnet-5-5', 'medium')
    expect(b.schritte.at(-1)).toEqual({ model: 'claude-opus-5-5', effort: 'high' })
    // Die Person stellt /effort um: die Sitzung schickt einen anderen Aufwand.
    await schritt($, 'claude-sonnet-5-5', 'max')
    expect(b.schritte.at(-1)).toEqual({ model: 'claude-sonnet-5-5', effort: 'max' })
    expect(b.status.at(-1)).toBeUndefined()
})

test('Automatik je Chat: aus, dann an; der Standard kommt aus den Einstellungen', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('haiku', 'low')] })
    await start($)
    expect(await befehl($, 'modellwahl-auto-aus')).toBe('Modellwahl: Automatik in neuen Chats aus, nur für diesen Chat.')
    await sende($, 'Erste Nachricht.')
    expect(b.anfragen).toHaveLength(0)
    expect(await befehl($, 'modellwahl-zeigen')).toContain('Automatisch in neuen Chats: aus (nur dieser Chat).')
    // Nach /clear gilt der Schalter weiter: dasselbe Fenster.
    await $.session.end({ reason: 'clear', sessionId: 'sitzung-1', resume: { id: 'sitzung-1' } } as never)
    b.stand.sid = 'sitzung-2'
    await $.classic.SessionStart({ source: 'clear' } as never)
    await sende($, 'Nach clear.')
    expect(b.anfragen).toHaveLength(0)
    expect(await befehl($, 'modellwahl-auto-an')).toBe('Modellwahl: Automatik in neuen Chats an, nur für diesen Chat.')
})

test('Standard aus: keine automatische Wahl, bis /modellwahl-auto-an', { options: { autoBeiNeuemChat: false } }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('haiku', 'low')] })
    await start($)
    expect(await befehl($, 'modellwahl-zeigen')).toContain('Automatisch in neuen Chats: aus (Standard).')
    await befehl($, 'modellwahl-auto-an')
    await sende($, 'Erste Nachricht.')
    expect(b.anfragen).toHaveLength(1)
})

test('anderes Einschätzungsmodell aus den Einstellungen', { options: { modell: 'sonnet' } }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { antworten: [wahlJson('haiku', 'low')] })
    await start($)
    await sende($, 'Hallo.')
    expect(b.anfragen[0]?.model).toBe('sonnet')
})

test('jeder Befehl versteht hilfe und ?, ohne etwas zu tun', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on)
    await start($)
    for (const k of BEFEHLE) {
        for (const wort of ['hilfe', '?', ' Hilfe ']) {
            expect(await befehl($, k.name, wort)).toBe(k.hilfe)
        }
    }
    expect(await befehl($, 'modellwahl-hilfe')).toBe(HILFE)
    expect(b.anfragen).toHaveLength(0)
})

test('ein Fehler im Befehl wird ein schlichter Satz', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on, { sid: 'kaputt' })
    await $.session.start({ cwd: '/projekt', surface: null, isInteractive: false } as never)
    expect(await befehl($, 'modellwahl-zeigen')).toBe('Modellwahl: Das hat nicht geklappt. Modell und Aufwand bleiben, wie sie sind.')
})

test('Vorsatz: der eigene Name fällt weg, am Ende steht, von wem es kommt', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    boden(on)
    const sitzung = mock.session(on)
    await start($)
    const texte = [
        '<local-command-stdout>modellwahl: Modellwahl: bleibt bei Opus · hoch.</local-command-stdout>',
        '<local-command-stdout>statistik+modellwahl: Zeile eins\nZeile zwei</local-command-stdout>',
        '<local-command-stdout>andere: fremd</local-command-stdout>',
    ]
    for (const [n, text] of texte.entries()) {
        await $.session.append({
            message: { type: 'system', name: 'local_command', content: [{ type: 'text', text }] },
            door: 'command',
            origin: { kind: 'engine' },
            uuid: `befehl-${n}`,
        } as never)
    }
    const zeilen = sitzung.appended().map(z => String(z.message.content[0]?.text ?? ''))
    expect(zeilen[0]).toBe(`<local-command-stdout>Modellwahl: bleibt bei Opus · hoch. ${GEMELDET}</local-command-stdout>`)
    expect(zeilen[1]).toBe(`<local-command-stdout>statistik: Zeile eins\nZeile zwei\n${GEMELDET}</local-command-stdout>`)
    expect(zeilen[2]).toBe(texte[2])
})

test('Kalibrierung über die Runden: aus Limit-Anstieg und Tokens wird eine Quote', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, { limits: [{ kind: 'five_hour', percentUsed: 10, resetsAt: '2026-10-19T15:00:00Z' }] })
    await start($, 'resume')
    // Erste Runde: setzt nur die Basis.
    await rundeEnde($, { ...USAGE, model: 'claude-opus-5-5' })
    // Ein Subagent kostet mit: 100k Ausgabe-Tokens auf Opus = 500k Opus-Eingabe-Tokens.
    await rundeEnde($, { input_tokens: 0, output_tokens: 100_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }, 'agent-1')
    // Hauptrunde: 1 Mio. Cache-Lesen auf Opus = 100k; zusammen 600k fuer einen Anstieg um 0,6 Punkte.
    b.stand.limits = [{ kind: 'five_hour', percentUsed: 10.6, resetsAt: '2026-10-19T15:00:00Z' }]
    await rundeEnde($, { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' })
    expect(await befehl($, 'modellwahl-zeigen')).toContain('Kalibrierung: 1 Messung, 1 % des 5-Stunden-Limits ≈ 1 Mio. Opus-Tokens.')
})
