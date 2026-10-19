import type { EngineInterface, Register, SessionMessage } from 'claude-code'

import type { Aufwand, AutoSchalter, Einschaetzung, Kalibrierung, Wahl } from '../types'
import {
    AUFWAENDE,
    GEMELDET,
    LEERE_KALIBRIERUNG,
    MODELLE,
    NACHFRAGEN,
    SYSTEM,
    baueAnfrage,
    dauerText,
    familieVon,
    istHilfe,
    kalibriere,
    kostenInOpus,
    leseEinschaetzung,
    ohneVorsatz,
    prozentText,
    schaetzeWechsel,
    tokenText,
    wahlText,
} from './logik'

// Modellwahl: einmal je Aufgabe Modell und Aufwand fuer den Chat waehlen.
//
// Gewaehlt wird bei der ersten echten Nachricht eines neuen Chats oder mit
// /modellwahl. Angewendet wird ueber turn.step, Schritt fuer Schritt der
// Hauptschleife (Subagenten bleiben, wie sie sind); in der Desktop-App stellt
// der Mod die Sitzung zusaetzlich einmal mit /model und /effort um. Stellt die
// Person selbst um, zieht sich der Mod fuer diesen Chat zurueck.

/** Schluessel im Speicher. */
const SPEICHER_WAHL = 'wahl:'
const SPEICHER_AUTO = 'auto:'
const SPEICHER_KALIBRIERUNG = 'kalibrierung'
const SPEICHER_AUFGERAEUMT = 'aufgeraeumt'

/** Eintraege fremder Chats, die so alt sind, werden weggeraeumt; hoechstens einmal am Tag. */
const AUFBEWAHREN_MS = 30 * 24 * 60 * 60_000
const AUFRAEUMEN_ABSTAND_MS = 24 * 60 * 60_000

/** So lange wartet die erste Nachricht hoechstens auf die Einschaetzung. */
export const EINSCHAETZUNG_MS = 5000
/** So lange gilt ein Vorschlag von /modellwahl. */
export const VORSCHLAG_MS = 10 * 60_000

/** Woher eine Nachricht kommen muss, damit sie gewaehlt wird: Rechner, App, Handy. */
const ECHTE_HERKUNFT = new Set(['composer', 'sdk', 'bridge'])

/** Der Standardsatz, wenn ein Befehl scheitert. */
export const BEFEHL_FEHLER = 'Modellwahl: Das hat nicht geklappt. Modell und Aufwand bleiben, wie sie sind.'

/** Die Befehle mit Beschreibung, Hinweis und Hilfe. */
export const BEFEHLE = [
    {
        name: 'modellwahl',
        description: 'Modell und Aufwand für diesen Chat passend zur Aufgabe wählen; ja führt einen offenen Vorschlag aus (Modellwahl)',
        argumentHint: '[Aufgabe | ja]',
        hilfe:
            '/modellwahl wählt Modell und Aufwand für diesen Chat. Mit einer Aufgabe dahinter wird diese eingeschätzt, ohne die letzten Nachrichten. ' +
            'Mitten im Chat fragt der Mod vor Opus oder Fable erst nach; /modellwahl ja führt den Vorschlag aus (gilt 10 Minuten). ' +
            'Im leeren Chat ohne Aufgabe wählt er bei deiner nächsten Nachricht.',
    },
    {
        name: 'modellwahl-zeigen',
        description: 'Aktuelle Modellwahl mit Grund, ob sie zurückgezogen ist, und den Stand der Kalibrierung zeigen (Modellwahl)',
        argumentHint: '[hilfe]',
        hilfe: '/modellwahl-zeigen nennt die Wahl dieses Chats, ihren Grund, ob sie zurückgezogen ist, die Automatik und den Stand der Kalibrierung.',
    },
    {
        name: 'modellwahl-hilfe',
        description: 'Kurz erklären, was die Modellwahl tut und welche Befehle es gibt (Modellwahl)',
        argumentHint: '[hilfe]',
        hilfe: '/modellwahl-hilfe erklärt die Modellwahl und ihre Befehle.',
    },
    {
        name: 'modellwahl-auto-an',
        description: 'Automatische Modellwahl bei der ersten Nachricht eines neuen Chats einschalten, nur für diesen Chat (Modellwahl)',
        argumentHint: '[hilfe]',
        hilfe: '/modellwahl-auto-an schaltet die automatische Wahl bei der ersten Nachricht eines neuen Chats ein, nur für diesen Chat (auch nach /clear).',
    },
    {
        name: 'modellwahl-auto-aus',
        description: 'Automatische Modellwahl bei der ersten Nachricht eines neuen Chats ausschalten, nur für diesen Chat (Modellwahl)',
        argumentHint: '[hilfe]',
        hilfe: '/modellwahl-auto-aus schaltet die automatische Wahl bei der ersten Nachricht eines neuen Chats aus, nur für diesen Chat (auch nach /clear).',
    },
] as const

type Befehl = (typeof BEFEHLE)[number]['name']

/** Was /modellwahl-hilfe antwortet. */
export const HILFE = [
    'Modellwahl: Wählt einmal je Aufgabe Modell und Aufwand, automatisch bei der ersten Nachricht eines neuen Chats.',
    '/modellwahl [Aufgabe]: jetzt wählen. Mitten im Chat fragt der Mod vor Opus oder Fable erst nach; /modellwahl ja führt aus.',
    '/modellwahl-zeigen: aktuelle Wahl und Kalibrierung.',
    '/modellwahl-auto-an, /modellwahl-auto-aus: Automatik nur für diesen Chat.',
    'Stellst du Modell oder Aufwand selbst um, zieht sich der Mod in diesem Chat zurück.',
].join('\n')

/** Was der Mod zwischen zwei Ereignissen behaelt. */
type Zustand = {
    /** Die Sitzung, zu der `wahl` und `auto` gehoeren; null heisst neu lesen. */
    sid: string | null
    /** Ob ein Mensch am Terminal sitzt: dann nie /model oder /effort, die schreiben dort die Einstellungen. */
    interaktiv: boolean
    /** Was `classic.SessionStart` gesagt hat: neuer Chat, fortgesetzter, oder noch nichts. */
    quelle: 'neu' | 'alt' | null
    /** Die erste echte Nachricht steht noch aus und soll waehlen. */
    neu: boolean
    /** /modellwahl im leeren Chat ohne Aufgabe: die naechste Nachricht waehlt. */
    wartet: boolean
    wahl: Wahl | null
    /** Der Aufwand, den die Sitzung von sich aus schickt; `undefined` ohne Aufwand, null noch nicht gesehen. */
    basisAufwand: Aufwand | number | undefined | null
    /** Der Zeitpunkt der Wahl, fuer die /model und /effort schon liefen. */
    angewendet: number | null
    /** Laeuft gerade unser eigenes /model: dessen Modellwechsel ist keiner der Person. */
    eigenerWechsel: boolean
    vorschlag: { wahl: Einschaetzung; at: number } | null
    /** Was die Hauptschleife zuletzt von sich aus geschickt haette. */
    letztesModell: string | null
    letzterAufwand: Aufwand | number | undefined | null
    /** Die Automatik dieses Chats; null heisst Standard aus den Einstellungen. */
    auto: boolean | null
    /** Nach /clear: die Automatik, die in den neuen Chat mitgeht. */
    autoUebertrag: boolean | null
    /** Einstellungen. */
    standardAuto: boolean
    modell: string
}

const z: Zustand = {
    sid: null,
    interaktiv: false,
    quelle: null,
    neu: false,
    wartet: false,
    wahl: null,
    basisAufwand: null,
    angewendet: null,
    eigenerWechsel: false,
    vorschlag: null,
    letztesModell: null,
    letzterAufwand: null,
    auto: null,
    autoUebertrag: null,
    standardAuto: true,
    modell: 'haiku',
}

// --- Speicher ---

function istWahl(v: unknown): v is Wahl {
    if (!v || typeof v !== 'object') {
        return false
    }
    const o = v as Record<string, unknown>
    return (
        typeof o.modell === 'string' &&
        o.modell in MODELLE &&
        typeof o.aufwand === 'string' &&
        o.aufwand in AUFWAENDE &&
        typeof o.at === 'number' &&
        typeof o.zurueckgezogen === 'boolean'
    )
}

function istKalibrierung(v: unknown): v is Kalibrierung {
    if (!v || typeof v !== 'object') {
        return false
    }
    const o = v as Record<string, unknown>
    return typeof o.proben === 'number' && typeof o.summe === 'number' && (o.quote === null || typeof o.quote === 'number')
}

async function ladeKalibrierung($: EngineInterface): Promise<Kalibrierung> {
    const v = await $.store.get(SPEICHER_KALIBRIERUNG).catch(() => undefined)
    return istKalibrierung(v) ? { ...LEERE_KALIBRIERUNG, ...v } : { ...LEERE_KALIBRIERUNG }
}

async function speichereWahl($: EngineInterface): Promise<void> {
    if (z.sid && z.wahl) {
        await $.store.set(SPEICHER_WAHL + z.sid, z.wahl).catch(() => {})
    }
}

/** Die Statuszeile: die Wahl, solange sie gilt; sonst nichts. */
function zeigeStatus($: EngineInterface): void {
    try {
        $.ui.status(z.wahl && !z.wahl.zurueckgezogen ? `Modellwahl: ${wahlText(z.wahl)}` : undefined)
    } catch {
        // Ohne Statuszeile geht es auch.
    }
}

/**
 * Die Sitzung lesen; hat sie gewechselt (/clear, Neustart), Wahl und Automatik
 * dieses Chats aus dem Speicher holen.
 */
async function sitzung($: EngineInterface): Promise<void> {
    const id = await $.session.id()
    if (id === z.sid) {
        return
    }
    z.sid = id
    const w = await $.store.get(SPEICHER_WAHL + id).catch(() => undefined)
    z.wahl = istWahl(w) ? w : null
    // Eine gespeicherte Wahl gilt ueber turn.step weiter; /model und /effort laufen dafuer nicht noch einmal.
    z.angewendet = z.wahl ? z.wahl.at : null
    z.basisAufwand = null
    z.vorschlag = null
    const a = (await $.store.get(SPEICHER_AUTO + id).catch(() => undefined)) as AutoSchalter | undefined
    if (a && typeof a.isOn === 'boolean') {
        z.auto = a.isOn
    } else if (z.autoUebertrag !== null) {
        z.auto = z.autoUebertrag
        await $.store.set(SPEICHER_AUTO + id, { at: await $.clock.now(), isOn: z.auto } satisfies AutoSchalter).catch(() => {})
    } else {
        z.auto = null
    }
    z.autoUebertrag = null
    zeigeStatus($)
}

/** Eintraege fremder Chats nach 30 Tagen wegraeumen, hoechstens einmal am Tag. */
async function raeumeAuf($: EngineInterface): Promise<void> {
    const jetzt = await $.clock.now()
    const zuletzt = Number((await $.store.get(SPEICHER_AUFGERAEUMT)) ?? 0)
    if (jetzt - zuletzt < AUFRAEUMEN_ABSTAND_MS) {
        return
    }
    await $.store.set(SPEICHER_AUFGERAEUMT, jetzt)
    for (const k of await $.store.keys()) {
        if (!k.startsWith(SPEICHER_WAHL) && !k.startsWith(SPEICHER_AUTO)) {
            continue
        }
        if (z.sid && (k === SPEICHER_WAHL + z.sid || k === SPEICHER_AUTO + z.sid)) {
            continue
        }
        const v = (await $.store.get(k)) as { at?: unknown } | undefined
        const at = typeof v?.at === 'number' ? v.at : 0
        if (jetzt - at > AUFBEWAHREN_MS) {
            await $.store.delete(k)
        }
    }
}

// --- Waehlen ---

/** Die Wahl setzen: gilt ab dem naechsten Schritt der Hauptschleife. */
async function setzeWahl($: EngineInterface, w: Einschaetzung): Promise<void> {
    z.wahl = { modell: w.modell, aufwand: w.aufwand, grund: w.grund, at: await $.clock.now(), zurueckgezogen: false }
    z.basisAufwand = null
    z.angewendet = null
    z.vorschlag = null
    await speichereWahl($)
    zeigeStatus($)
}

/** Die Person hat selbst umgestellt: nichts mehr ueberschreiben in diesem Chat. */
async function zieheZurueck($: EngineInterface): Promise<void> {
    if (!z.wahl || z.wahl.zurueckgezogen) {
        return
    }
    z.wahl = { ...z.wahl, zurueckgezogen: true }
    z.vorschlag = null
    await speichereWahl($)
    zeigeStatus($)
}

type Ergebnis = { ok: true; wahl: Einschaetzung } | { ok: false; grund: 'zeit' | 'fehler' | 'unlesbar' }

/** Die Aufgabe einschaetzen lassen: hoechstens fuenf Sekunden, nie eine Ausnahme. */
async function schaetze($: EngineInterface, aufgabe: string, verlauf: readonly SessionMessage[]): Promise<Ergebnis> {
    try {
        const r = await $.model.complete({
            model: z.modell,
            system: SYSTEM,
            prompt: baueAnfrage(aufgabe, verlauf),
            maxTokens: 120,
            effort: 'low',
            timeoutMs: EINSCHAETZUNG_MS,
        })
        if (!r.isAnswered) {
            return { ok: false, grund: r.reason === 'aborted' ? 'zeit' : 'fehler' }
        }
        const w = leseEinschaetzung(r.text)
        return w ? { ok: true, wahl: w } : { ok: false, grund: 'unlesbar' }
    } catch {
        return { ok: false, grund: 'fehler' }
    }
}

/** Ein Satz, warum es keine Einschaetzung gab. */
function ohneEinschaetzung(grund: 'zeit' | 'fehler' | 'unlesbar'): string {
    const warum = grund === 'zeit' ? 'keine Antwort in 5 s' : grund === 'unlesbar' ? 'Antwort unlesbar' : 'Anfrage gescheitert'
    return `Modellwahl: keine Einschätzung (${warum}), Modell und Aufwand bleiben.`
}

/** Der Hinweis an Claude nach der automatischen Wahl. */
export function hinweis(w: Einschaetzung): string {
    return (
        `Der Mod Modellwahl hat für diesen Chat ${wahlText(w)} gewählt. ` +
        `Beginne deine Antwort mit genau einem kurzen Satz: „Modellwahl: ${wahlText(w)}.“ Danach antworte wie gewohnt.`
    )
}

/** Der Hinweis an Claude, wenn die Einschaetzung ausblieb. */
export const HINWEIS_OHNE =
    'Der Mod Modellwahl konnte die Aufgabe nicht einschätzen; Modell und Aufwand bleiben. ' +
    'Beginne deine Antwort mit genau einem kurzen Satz: „Modellwahl: keine Einschätzung, alles bleibt.“ Danach antworte wie gewohnt.'

/** Der Verlauf dieses Chats; leer, wenn er sich nicht lesen laesst. */
async function verlauf($: EngineInterface): Promise<SessionMessage[]> {
    try {
        const v = await $.session.messages()
        return Array.isArray(v) ? (v as SessionMessage[]) : []
    } catch {
        return []
    }
}

/**
 * In der Desktop-App die Sitzung selbst umstellen, einmal je Wahl: so zeigt
 * auch /model das Modell. Fehler und Verwerfen bleiben still, turn.step stellt
 * ohnehin jede Anfrage um.
 */
async function stelleSitzungUm($: EngineInterface, w: Wahl): Promise<void> {
    let modellOk = false
    let aufwandOk = false
    z.eigenerWechsel = true
    try {
        if (familieVon(z.letztesModell) !== w.modell) {
            await $.command.run({ command: 'model', args: w.modell })
            modellOk = true
        }
    } catch {
        // Verworfen oder abgelehnt: turn.step bleibt.
    } finally {
        z.eigenerWechsel = false
    }
    try {
        if (z.letzterAufwand !== w.aufwand) {
            await $.command.run({ command: 'effort', args: w.aufwand })
            aufwandOk = true
        }
    } catch {
        // Wie oben.
    }
    if (z.wahl?.at !== w.at) {
        return
    }
    if (aufwandOk) {
        z.basisAufwand = w.aufwand
    } else if (modellOk) {
        // Das neue Modell kann einen anderen Standard-Aufwand haben: neu ansehen.
        z.basisAufwand = null
    }
}

// --- Befehle ---

/** Was die Sitzung gerade nutzt: die Wahl, sonst was die Hauptschleife zuletzt schickte. */
async function aktuell($: EngineInterface): Promise<{ modell: string | null; aufwand: Aufwand | number | undefined | null }> {
    if (z.wahl && !z.wahl.zurueckgezogen) {
        return { modell: MODELLE[z.wahl.modell].id, aufwand: z.wahl.aufwand }
    }
    const modell = z.letztesModell ?? (await $.session.model().catch(() => null))
    return { modell, aufwand: z.letzterAufwand }
}

/** Der Rueckfrage-Text: Vorschlag, was das Neueinlesen kostet, wie ausfuehren. */
async function vorschlagText($: EngineInterface, w: Einschaetzung, modellAendert: boolean): Promise<string> {
    const teile = [`Modellwahl-Vorschlag: ${wahlText(w)}${w.grund ? ` – ${w.grund}` : ''}.`]
    if (modellAendert) {
        let tokens: number | null = null
        let limit: { percentUsed: number } | null = null
        try {
            const u = await $.session.usage()
            tokens = u.context.tokens ?? null
            limit = u.rateLimits.find(r => r.kind === 'five_hour') ?? null
        } catch {
            // Dann ohne Zahlen.
        }
        const est = schaetzeWechsel(await ladeKalibrierung($), tokens ?? 0, MODELLE[w.modell].id)
        const stand = limit ? ` (jetzt ${String(Math.round(limit.percentUsed * 10) / 10).replace('.', ',')} % verbraucht)` : ''
        const menge = tokens != null && tokens > 0 ? `${tokenText(tokens)} Tokens Kontext` : 'den Kontext'
        teile.push(
            est.prozent != null && tokens != null
                ? `Der Wechsel liest ${menge} neu, etwa ${prozentText(est.prozent)} deines 5-Stunden-Limits${stand}.`
                : `Der Wechsel liest ${menge} neu, etwa so viel wie ${est.runden} normale Runden${stand}.`,
        )
    } else {
        teile.push('Das Modell bleibt, der Kontext wird nicht neu gelesen.')
    }
    teile.push('Ausführen: /modellwahl ja')
    return teile.join(' ')
}

/** /modellwahl [Aufgabe | ja]. */
async function befehlWahl($: EngineInterface, args: string): Promise<string> {
    await sitzung($)
    const a = args.trim()
    const jetzt = await $.clock.now()
    if (/^ja$/i.test(a)) {
        const v = z.vorschlag
        if (!v || jetzt - v.at > VORSCHLAG_MS) {
            z.vorschlag = null
            return 'Modellwahl: Kein offener Vorschlag. /modellwahl schlägt neu vor.'
        }
        const vorher = (await aktuell($)).modell
        await setzeWahl($, v.wahl)
        return `Modellwahl: ${wahlText(v.wahl)}${v.wahl.grund ? ` – ${v.wahl.grund}` : ''}.${familieVon(vorher) !== v.wahl.modell ? ' Kontext wird einmal neu gelesen.' : ''}`
    }
    const v = await verlauf($)
    const hatRunden = v.some(m => m.role === 'assistant')
    if (!hatRunden) {
        if (!a) {
            z.wartet = true
            return 'Modellwahl: Ich wähle bei deiner nächsten Nachricht.'
        }
        const r = await schaetze($, a, [])
        if (!r.ok) {
            return ohneEinschaetzung(r.grund)
        }
        await setzeWahl($, r.wahl)
        z.neu = false
        z.wartet = false
        return `Modellwahl: ${wahlText(r.wahl)}${r.wahl.grund ? ` – ${r.wahl.grund}` : ''}.`
    }
    const r = await schaetze($, a, v)
    if (!r.ok) {
        return ohneEinschaetzung(r.grund)
    }
    const jetztig = await aktuell($)
    const modellAendert = familieVon(jetztig.modell) !== r.wahl.modell
    const aufwandAendert = jetztig.aufwand !== r.wahl.aufwand
    if (!modellAendert && !aufwandAendert) {
        z.vorschlag = null
        return `Modellwahl: bleibt bei ${wahlText(r.wahl)}.`
    }
    if (NACHFRAGEN.includes(r.wahl.modell)) {
        z.vorschlag = { wahl: r.wahl, at: jetzt }
        return vorschlagText($, r.wahl, modellAendert)
    }
    await setzeWahl($, r.wahl)
    return `Modellwahl: ${wahlText(r.wahl)}${r.wahl.grund ? ` – ${r.wahl.grund}` : ''}.${modellAendert ? ' Kontext wird einmal neu gelesen.' : ''}`
}

/** /modellwahl-zeigen. */
async function befehlZeigen($: EngineInterface): Promise<string> {
    await sitzung($)
    const jetzt = await $.clock.now()
    const zeilen: string[] = []
    const w = z.wahl
    if (w) {
        zeilen.push(`Modellwahl: ${wahlText(w)}${w.grund ? ` – ${w.grund}` : ''}, vor ${dauerText(jetzt - w.at)}.`)
        zeilen.push(w.zurueckgezogen ? 'Zurückgezogen: Du hast Modell oder Aufwand selbst umgestellt.' : 'Zurückgezogen: nein.')
    } else {
        zeilen.push('Modellwahl: In diesem Chat ist nichts gewählt.')
    }
    if (z.vorschlag && jetzt - z.vorschlag.at <= VORSCHLAG_MS) {
        zeilen.push(`Offener Vorschlag: ${wahlText(z.vorschlag.wahl)}, noch ${dauerText(VORSCHLAG_MS - (jetzt - z.vorschlag.at))}.`)
    }
    zeilen.push(
        z.auto === null
            ? `Automatisch in neuen Chats: ${z.standardAuto ? 'an' : 'aus'} (Standard).`
            : `Automatisch in neuen Chats: ${z.auto ? 'an' : 'aus'} (nur dieser Chat).`,
    )
    const k = await ladeKalibrierung($)
    zeilen.push(
        k.quote !== null && k.quote > 0
            ? `Kalibrierung: ${k.proben} ${k.proben === 1 ? 'Messung' : 'Messungen'}, 1 % des 5-Stunden-Limits ≈ ${tokenText(1 / k.quote)} Opus-Tokens.`
            : 'Kalibrierung: noch keine Messung.',
    )
    return zeilen.join('\n')
}

/** /modellwahl-auto-an und -aus. */
async function befehlAuto($: EngineInterface, an: boolean): Promise<string> {
    await sitzung($)
    z.auto = an
    if (z.sid) {
        await $.store.set(SPEICHER_AUTO + z.sid, { at: await $.clock.now(), isOn: an } satisfies AutoSchalter)
    }
    return `Modellwahl: Automatik in neuen Chats ${an ? 'an' : 'aus'}, nur für diesen Chat.`
}

async function wirke($: EngineInterface, name: Befehl, args: string): Promise<string> {
    switch (name) {
        case 'modellwahl':
            return befehlWahl($, args)
        case 'modellwahl-zeigen':
            return befehlZeigen($)
        case 'modellwahl-hilfe':
            return HILFE
        case 'modellwahl-auto-an':
            return befehlAuto($, true)
        case 'modellwahl-auto-aus':
            return befehlAuto($, false)
    }
}

// --- Hooks ---

export const register: Register = (on, options) => {
    z.standardAuto = options.autoBeiNeuemChat !== false
    z.modell = typeof options.modell === 'string' && options.modell.trim() ? options.modell.trim() : 'haiku'

    // Neuer oder fortgesetzter Chat: sagt, ob die erste Nachricht waehlt.
    on('classic.SessionStart', async ($, e, next) => {
        const r = await next(e)
        if (e.source === 'startup' || e.source === 'clear') {
            z.quelle = 'neu'
            z.neu = true
            if (e.source === 'clear') {
                await nachClear($)
            }
        } else {
            z.quelle = 'alt'
            z.neu = false
        }
        return r
    }).catch(($, e, next) => next(e))

    on('session.start', async ($, e, next) => {
        const r = await next(e)
        z.interaktiv = e.isInteractive
        await sitzung($).catch(() => {})
        if (z.quelle === null) {
            z.neu = (await $.session.turns().catch(() => 1)) === 0
        }
        for (const b of BEFEHLE) {
            await $.command
                .register({ name: b.name, description: b.description, argumentHint: b.argumentHint, immediate: true })
                .catch(() => {})
        }
        await raeumeAuf($).catch(() => {})
        zeigeStatus($)
        return r
    })

    // /clear: ein neuer Chat beginnt; Modell und Aufwand der Sitzung bleiben, die Wahl nicht.
    on('session.end', async ($, e, next) => {
        if (e.reason === 'clear') {
            z.neu = true
            await nachClear($)
        }
        return next(e)
    }).catch(($, e, next) => next(e))

    // Die erste echte Nachricht eines neuen Chats waehlt, hoechstens fuenf Sekunden lang.
    on('prompt.submit', async ($, e, next) => {
        const kind = (e.origin as { kind?: string } | undefined)?.kind ?? ''
        if (e.command || e.isMeta || e.turnId || !ECHTE_HERKUNFT.has(kind)) {
            return next(e)
        }
        await sitzung($)
        const auto = z.auto ?? z.standardAuto
        const soll = z.wartet || (z.neu && auto && !z.wahl)
        z.neu = false
        z.wartet = false
        if (!soll) {
            return next(e)
        }
        const r = await schaetze($, e.text, [])
        if (!r.ok) {
            try {
                $.ui.toast(ohneEinschaetzung(r.grund))
            } catch {
                // Die Meldung steht auch in der Antwort.
            }
            return next({ ...e, context: [...(e.context ?? []), HINWEIS_OHNE] })
        }
        await setzeWahl($, r.wahl)
        return next({ ...e, context: [...(e.context ?? []), hinweis(r.wahl)] })
    }).catch(($, e, next) => next(e))

    on('turn.start', async ($, e, next) => {
        if (e.agentId === undefined) {
            await sitzung($).catch(() => {})
        }
        return next(e)
    })

    // Jede Anfrage der Hauptschleife geht mit dem gewaehlten Modell und Aufwand.
    on('turn.step', async function* ($, e, next) {
        if (e.agentId !== undefined) {
            return yield* next(e)
        }
        let raus = e
        try {
            z.letztesModell = e.model
            z.letzterAufwand = e.effort
            const w = z.wahl
            if (w && !w.zurueckgezogen) {
                if (z.basisAufwand === null) {
                    z.basisAufwand = e.effort
                } else if (e.effort !== z.basisAufwand) {
                    // Der Aufwand der Sitzung hat sich bewegt, ohne uns: die Person war es.
                    await zieheZurueck($)
                }
                if (z.wahl && !z.wahl.zurueckgezogen) {
                    raus = { ...e, model: MODELLE[w.modell].id, effort: w.aufwand }
                }
            }
        } catch {
            raus = e
        }
        return yield* next(raus)
    })

    // Kalibrieren; in der Desktop-App einmal je Wahl auch die Sitzung umstellen.
    on('turn.complete', async ($, e, next) => {
        const r = await next(e)
        try {
            let limit: { percentUsed: number; resetsAt?: string } | null = null
            if (e.agentId === undefined) {
                limit = (await $.session.usage()).rateLimits.find(x => x.kind === 'five_hour') ?? null
            }
            if (e.usage || limit) {
                const k = kalibriere(
                    await ladeKalibrierung($),
                    e.usage ? kostenInOpus(e.usage, e.usage.model) : 0,
                    limit,
                    await $.clock.now(),
                )
                await $.store.set(SPEICHER_KALIBRIERUNG, k)
            }
        } catch {
            // Ohne Zahlen keine Messung.
        }
        const w = z.wahl
        if (e.agentId === undefined && w && !w.zurueckgezogen && !z.interaktiv && z.angewendet !== w.at) {
            z.angewendet = w.at
            // Nicht warten: die Befehle laufen, sobald die Sitzung still ist.
            void stelleSitzungUm($, w).catch(() => {})
        }
        return r
    })

    // Modell von Hand gewechselt: in der App (sdk), im Auswahlfenster (picker) oder per /model.
    on('classic.PostModelSwitch', async ($, e, next) => {
        const r = await next(e)
        const w = z.wahl
        if (!w || w.zurueckgezogen || z.eigenerWechsel) {
            return r
        }
        // 'auto' (Rueckfall) und 'resume' (Wiederherstellen) sind keine Entscheidung der Person.
        if (e.source === 'sdk' || e.source === 'picker' || e.source === 'command') {
            await zieheZurueck($)
        }
        return r
    }).catch(($, e, next) => next(e))

    // Die Engine setzt die Namen der Mods vor jede Befehlsantwort. Dieser Mod streicht seinen
    // und sagt stattdessen am Ende, dass die Antwort von ihm kommt.
    on('session.append', { door: 'command', message: { type: 'system', name: 'local_command' } }, async ($, e, next) => {
        const content = e.message.content.map(b =>
            b.type === 'text' && typeof b.text === 'string' ? { ...b, text: ohneVorsatz(b.text, 'modellwahl', GEMELDET) } : b,
        )
        return next({ ...e, message: { ...e.message, content } })
    }).catch(($, e, next) => next(e))

    for (const b of BEFEHLE) {
        on('command.run', { command: b.name }, async ($, e) => {
            if (istHilfe(e.args)) {
                return { text: b.hilfe }
            }
            try {
                return { text: await wirke($, b.name, String(e.args ?? '')) }
            } catch {
                return { text: BEFEHL_FEHLER }
            }
        }).catch(() => ({ text: BEFEHL_FEHLER }))
    }
}

/** Nach /clear: neuer Chat, keine Wahl; die Automatik dieses Fensters geht mit. */
async function nachClear($: EngineInterface): Promise<void> {
    if (z.sid !== null) {
        z.autoUebertrag = z.auto
    }
    z.sid = null
    z.wahl = null
    z.vorschlag = null
    z.wartet = false
    z.angewendet = null
    z.basisAufwand = null
    zeigeStatus($)
}
