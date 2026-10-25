import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode, SessionMessage } from 'claude-code'

import type { Aufwand, AutoSchalter, Einschaetzung, Kalibrierung, Vorschlag, Wahl } from '../types'
import {
    AUFWAENDE,
    GEMELDET,
    LEERE_KALIBRIERUNG,
    MODELLE,
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
// /modellwahl. Gewaehlt heisst seit 0.2.0 vorgeschlagen: Am Rechner gilt der
// Vorschlag nach 15 Sekunden von selbst, das Band zeigt ihn mit Übernehmen und
// Nein; vom Handy gilt er erst auf ja oder ok, nichts wartet und nichts haelt an.
// Angewendet wird nur ueber turn.step, Schritt fuer Schritt der Hauptschleife
// (Subagenten bleiben, wie sie sind). Ein eigenes /model oder /effort schickt der
// Mod nicht: Die Desktop-App behaelt ihre Auswahl und stellt die Sitzung darauf
// zurueck, und das sah aus wie eine Umstellung der Person (Live-Test 2026-10-19).
// Stellt die Person selbst um, zieht sich der Mod fuer diesen Chat zurueck.

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
/** So lange wartet ein Vorschlag vom Handy auf ja. */
export const VORSCHLAG_MS = 10 * 60_000
/** Nach so langer Zeit ohne Reaktion gilt ein Vorschlag am Rechner von selbst. */
export const UEBERNAHME_MS = 15_000

/** Woher eine Nachricht kommen muss, damit sie gewaehlt wird: Rechner, App, Handy. */
const ECHTE_HERKUNFT = new Set(['composer', 'sdk', 'bridge'])

/** Eine Nachricht, die einen offenen Vorschlag annimmt: ja, ok, okay. */
export const ZUSTIMMUNG = /^\s*(?:ja|ok|okay)\s*[.!]*\s*$/i

/** Der offene Vorschlag, fuer das Band; die Logik liest `z.offen`, das immer gleich ist. */
const vorschlagAtom = atom({ plugin: 'modellwahl', key: 'vorschlag' } as const, null as Vorschlag | null)
/** Jede Sekunde eins weiter, solange ein Vorschlag laeuft: der Countdown im Band. */
const taktAtom = atom({ plugin: 'modellwahl', key: 'takt' } as const, 0)
/** Der Schluessel der Zeile im Band; der Leitstand holt sie darunter ganz nach oben. */
export const ZEILE = 'modellwahl'

/** Der Standardsatz, wenn ein Befehl scheitert. */
export const BEFEHL_FEHLER = 'Modellwahl: Das hat nicht geklappt. Modell und Aufwand bleiben, wie sie sind.'

/** Die Befehle mit Beschreibung, Hinweis und Hilfe. */
export const BEFEHLE = [
    {
        name: 'modellwahl',
        description: 'Modell und Aufwand für diesen Chat passend zur Aufgabe vorschlagen; ja übernimmt, nein verwirft (Modellwahl)',
        argumentHint: '[Aufgabe | ja | nein]',
        hilfe:
            '/modellwahl schlägt Modell und Aufwand für diesen Chat vor. Mit einer Aufgabe dahinter wird diese eingeschätzt, ohne die letzten Nachrichten. ' +
            'Am Rechner gilt der Vorschlag nach 15 Sekunden von selbst, über der Eingabe stehen Übernehmen und Nein. ' +
            'Vom Handy gilt er erst, wenn du ja, ok oder /modellwahl ja schickst (10 Minuten lang). /modellwahl nein verwirft ihn. ' +
            'Im leeren Chat ohne Aufgabe schlägt er bei deiner nächsten Nachricht vor.',
    },
    {
        name: 'modellwahl-uebernehmen',
        description: 'Den offenen Vorschlag der Modellwahl sofort übernehmen (Modellwahl)',
        argumentHint: '[hilfe]',
        hilfe: '/modellwahl-uebernehmen übernimmt den offenen Vorschlag sofort, wie der Knopf Übernehmen über der Eingabe oder /modellwahl ja.',
    },
    {
        name: 'modellwahl-ablehnen',
        description: 'Den offenen Vorschlag der Modellwahl verwerfen; Modell und Aufwand bleiben (Modellwahl)',
        argumentHint: '[hilfe]',
        hilfe: '/modellwahl-ablehnen verwirft den offenen Vorschlag, wie der Knopf Nein über der Eingabe oder /modellwahl nein. Modell und Aufwand bleiben, wie sie sind.',
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
    'Modellwahl: Schlägt einmal je Aufgabe Modell und Aufwand vor, automatisch bei der ersten Nachricht eines neuen Chats.',
    'Am Rechner gilt der Vorschlag nach 15 Sekunden von selbst (Übernehmen und Nein über der Eingabe); vom Handy erst auf ja oder ok.',
    '/modellwahl [Aufgabe]: jetzt vorschlagen. /modellwahl ja oder /modellwahl-uebernehmen übernimmt, /modellwahl nein oder /modellwahl-ablehnen verwirft.',
    '/modellwahl-zeigen: aktuelle Wahl, offener Vorschlag und Kalibrierung.',
    '/modellwahl-auto-an, /modellwahl-auto-aus: Automatik nur für diesen Chat.',
    'Stellst du Modell oder Aufwand selbst um, zieht sich der Mod in diesem Chat zurück.',
].join('\n')

/** Was der Mod zwischen zwei Ereignissen behaelt. */
type Zustand = {
    /** Die Sitzung, zu der `wahl` und `auto` gehoeren; null heisst neu lesen. */
    sid: string | null
    /** Was `classic.SessionStart` gesagt hat: neuer Chat, fortgesetzter, oder noch nichts. */
    quelle: 'neu' | 'alt' | null
    /** Die erste echte Nachricht steht noch aus und soll waehlen. */
    neu: boolean
    /** /modellwahl im leeren Chat ohne Aufgabe: die naechste Nachricht waehlt. */
    wartet: boolean
    wahl: Wahl | null
    /** Der Aufwand, den die Sitzung von sich aus schickt; `undefined` ohne Aufwand, null noch nicht gesehen. */
    basisAufwand: Aufwand | number | undefined | null
    /** Der offene Vorschlag, wie in `$.state`; nur `setzeVorschlag` schreibt ihn. */
    offen: Vorschlag | null
    /** Der Takt des Countdowns, solange ein Vorschlag am Rechner laeuft. */
    uhr: { cancel: () => void } | null
    /** Was die Hauptschleife von sich aus schickt: zuletzt gesehen oder seit einem Modellwechsel. */
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
    quelle: null,
    neu: false,
    wartet: false,
    wahl: null,
    basisAufwand: null,
    offen: null,
    uhr: null,
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

/** Die Statuszeile: ein offener Vorschlag, sonst die Wahl, solange sie gilt; sonst nichts. */
function zeigeStatus($: EngineInterface): void {
    try {
        $.ui.status(
            z.offen
                ? `Modellwahl: Vorschlag ${wahlText(z.offen.wahl)}`
                : z.wahl && !z.wahl.zurueckgezogen
                  ? `Modellwahl: ${wahlText(z.wahl)}`
                  : undefined,
        )
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
    // Eine gespeicherte Wahl gilt ueber turn.step weiter.
    z.wahl = istWahl(w) ? w : null
    z.basisAufwand = null
    await setzeVorschlag($, null)
    const a =(await $.store.get(SPEICHER_AUTO + id).catch(() => undefined)) as AutoSchalter | undefined
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
    await speichereWahl($)
    await setzeVorschlag($, null)
}

/** Die Person hat selbst umgestellt: nichts mehr ueberschreiben in diesem Chat, auch kein offener Vorschlag. */
async function zieheZurueck($: EngineInterface): Promise<void> {
    await setzeVorschlag($, null)
    if (!z.wahl || z.wahl.zurueckgezogen) {
        return
    }
    z.wahl = { ...z.wahl, zurueckgezogen: true }
    await speichereWahl($)
    zeigeStatus($)
}

/**
 * Den offenen Vorschlag setzen oder loeschen, an einer Stelle fuer Logik, Band und
 * Statuszeile. Ein Vorschlag mit Frist bekommt einen Takt: jede Sekunde zeichnet
 * das Band neu, nach Ablauf gilt der Vorschlag.
 */
async function setzeVorschlag($: EngineInterface, v: Vorschlag | null): Promise<void> {
    z.uhr?.cancel()
    z.uhr = null
    z.offen = v
    await update($, vorschlagAtom, () => v).catch(() => {})
    if (v && v.bis !== null) {
        const takt = $.clock.every(1000, () => void ticke($, v.at).catch(() => {}))
        z.uhr = takt
    }
    zeigeStatus($)
}

/** Ein Schlag des Countdowns: neu zeichnen, nach Ablauf uebernehmen. */
async function ticke($: EngineInterface, at: number): Promise<void> {
    const v = z.offen
    if (!v || v.at !== at || v.bis === null) {
        return
    }
    if ((await $.clock.now()) >= v.bis) {
        const w = await uebernehme($, at)
        if (w) {
            try {
                $.ui.toast(`Modellwahl: ${wahlText(w)} übernommen.`)
            } catch {
                // Die Statuszeile sagt es auch.
            }
        }
        return
    }
    await update($, taktAtom, n => n + 1).catch(() => {})
}

/** Einen Vorschlag machen: am Rechner mit Frist, vom Handy ohne (dort gilt er erst auf ja). */
async function schlageVor($: EngineInterface, w: Einschaetzung, vomHandy: boolean): Promise<void> {
    const jetzt = await $.clock.now()
    await setzeVorschlag($, { wahl: w, at: jetzt, bis: vomHandy ? null : jetzt + UEBERNAHME_MS })
}

/** Ganze Sekunden bis zur Frist, nie unter null. */
export const restSekunden = (bis: number, jetzt: number) => Math.max(0, Math.ceil((bis - jetzt) / 1000))

/** Ob der offene Vorschlag noch gilt: einer vom Handy zehn Minuten lang. */
function giltNoch(v: Vorschlag | null, jetzt: number): v is Vorschlag {
    return v !== null && (v.bis !== null || jetzt - v.at <= VORSCHLAG_MS)
}

/** Den offenen Vorschlag uebernehmen (nur den mit dieser Kennung, wenn eine kommt); die Wahl, oder null. */
async function uebernehme($: EngineInterface, at?: number): Promise<Einschaetzung | null> {
    const v = z.offen
    if (!v || (at !== undefined && v.at !== at) || !giltNoch(v, await $.clock.now())) {
        return null
    }
    await setzeWahl($, v.wahl)
    return v.wahl
}

/** Den offenen Vorschlag verwerfen (nur den mit dieser Kennung, wenn eine kommt); ob einer da war. */
async function lehneAb($: EngineInterface, at?: number): Promise<boolean> {
    const v = z.offen
    if (!v || (at !== undefined && v.at !== at)) {
        return false
    }
    await setzeVorschlag($, null)
    return true
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

/** Der Hinweis an Claude nach dem automatischen Vorschlag. */
export function hinweisVorschlag(w: Einschaetzung, vomHandy: boolean): string {
    return vomHandy
        ? `Der Mod Modellwahl schlägt für diesen Chat ${wahlText(w)} vor; das gilt erst, wenn die Person mit ja oder ok zustimmt. ` +
              `Beginne deine Antwort mit genau einem kurzen Satz: „Modellwahl schlägt ${wahlText(w)} vor, übernehmen mit ja oder ok.“ Danach antworte wie gewohnt.`
        : `Der Mod Modellwahl schlägt für diesen Chat ${wahlText(w)} vor; ohne Einspruch gilt das nach 15 Sekunden. ` +
              `Beginne deine Antwort mit genau einem kurzen Satz: „Modellwahl schlägt ${wahlText(w)} vor.“ Danach antworte wie gewohnt.`
}

/** Der Hinweis an Claude, wenn ein ja oder ok den Vorschlag angenommen hat. */
export function hinweisUebernommen(w: Einschaetzung): string {
    return (
        `Mit dieser Nachricht hat die Person den Vorschlag des Mods Modellwahl angenommen: ab jetzt ${wahlText(w)}. ` +
        `Beginne deine Antwort mit genau einem kurzen Satz: „Modellwahl: ${wahlText(w)} übernommen.“ ` +
        'Galt das ja oder ok auch einer Frage von dir, antworte danach darauf wie gewohnt.'
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

// --- Befehle ---

/** Was die Sitzung gerade nutzt: die Wahl, sonst was die Hauptschleife zuletzt schickte. */
async function aktuell($: EngineInterface): Promise<{ modell: string | null; aufwand: Aufwand | number | undefined | null }> {
    if (z.wahl && !z.wahl.zurueckgezogen) {
        return { modell: MODELLE[z.wahl.modell].id, aufwand: z.wahl.aufwand }
    }
    const modell = z.letztesModell ?? (await $.session.model().catch(() => null))
    return { modell, aufwand: z.letzterAufwand }
}

/** Der Text des Vorschlags: was er waere, was das Neueinlesen kostet, wann und wie er gilt. */
async function vorschlagText($: EngineInterface, w: Einschaetzung, modellAendert: boolean, vomHandy: boolean): Promise<string> {
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
    teile.push(
        vomHandy
            ? 'Übernehmen mit ja, ok oder /modellwahl ja (10 Minuten lang).'
            : 'Gilt in 15 s, wenn du nichts tust; verwerfen mit Nein über der Eingabe oder /modellwahl nein.',
    )
    return teile.join(' ')
}

/** Die Wahl mit Grund, als Satzteil. */
const mitGrund = (w: Einschaetzung) => `${wahlText(w)}${w.grund ? ` – ${w.grund}` : ''}`

/** /modellwahl [Aufgabe | ja | nein], auch hinter /modellwahl-uebernehmen und /modellwahl-ablehnen. */
async function befehlWahl($: EngineInterface, args: string, vomHandy: boolean): Promise<string> {
    await sitzung($)
    const a = args.trim()
    if (/^(?:ja|ok|okay)$/i.test(a)) {
        const vorher = (await aktuell($)).modell
        const w = await uebernehme($)
        if (!w) {
            await setzeVorschlag($, null)
            return 'Modellwahl: Kein offener Vorschlag. /modellwahl schlägt neu vor.'
        }
        return `Modellwahl: ${mitGrund(w)}.${familieVon(vorher) !== w.modell ? ' Kontext wird einmal neu gelesen.' : ''}`
    }
    if (/^nein$/i.test(a)) {
        return (await lehneAb($))
            ? 'Modellwahl: Vorschlag verworfen. Modell und Aufwand bleiben, wie sie sind.'
            : 'Modellwahl: Kein offener Vorschlag.'
    }
    const v = await verlauf($)
    const hatRunden = v.some(m => m.role === 'assistant')
    if (!hatRunden && !a) {
        z.wartet = true
        return 'Modellwahl: Ich schlage bei deiner nächsten Nachricht vor.'
    }
    const r = await schaetze($, a, hatRunden ? v : [])
    if (!r.ok) {
        return ohneEinschaetzung(r.grund)
    }
    z.neu = false
    z.wartet = false
    const jetztig = await aktuell($)
    const modellAendert = familieVon(jetztig.modell) !== r.wahl.modell
    const aufwandAendert = jetztig.aufwand !== r.wahl.aufwand
    if (!modellAendert && !aufwandAendert) {
        await setzeVorschlag($, null)
        return `Modellwahl: bleibt bei ${wahlText(r.wahl)}.`
    }
    await schlageVor($, r.wahl, vomHandy)
    return vorschlagText($, r.wahl, modellAendert, vomHandy)
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
    const v = z.offen
    if (giltNoch(v, jetzt)) {
        zeilen.push(
            v.bis !== null
                ? `Offener Vorschlag: ${wahlText(v.wahl)}, gilt in ${restSekunden(v.bis, jetzt)} s.`
                : `Offener Vorschlag: ${wahlText(v.wahl)}, wartet auf ja, noch ${dauerText(VORSCHLAG_MS - (jetzt - v.at))}.`,
        )
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

async function wirke($: EngineInterface, name: Befehl, args: string, vomHandy: boolean): Promise<string> {
    switch (name) {
        case 'modellwahl':
            return befehlWahl($, args, vomHandy)
        case 'modellwahl-uebernehmen':
            return befehlWahl($, 'ja', vomHandy)
        case 'modellwahl-ablehnen':
            return befehlWahl($, 'nein', vomHandy)
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

    // Ein ja oder ok nimmt einen offenen Vorschlag an. Die erste echte Nachricht eines neuen
    // Chats schlaegt vor, hoechstens fuenf Sekunden lang; sie geht sofort weiter, nichts wartet.
    on('prompt.submit', async ($, e, next) => {
        const kind = (e.origin as { kind?: string } | undefined)?.kind ?? ''
        if (e.command || e.isMeta || e.turnId || !ECHTE_HERKUNFT.has(kind)) {
            return next(e)
        }
        await sitzung($)
        if (z.offen && ZUSTIMMUNG.test(e.text)) {
            const w = await uebernehme($)
            if (w) {
                // Die Nachricht geht trotzdem an Claude: sie kann auch einer Frage gegolten haben.
                return next({ ...e, context: [...(e.context ?? []), hinweisUebernommen(w)] })
            }
        }
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
        const vomHandy = kind === 'bridge'
        await schlageVor($, r.wahl, vomHandy)
        return next({ ...e, context: [...(e.context ?? []), hinweisVorschlag(r.wahl, vomHandy)] })
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
            // Ein abgelaufener Vorschlag gilt spaetestens hier, auch wenn sein Takt verloren ging.
            const v = z.offen
            if (v && v.bis !== null && (await $.clock.now()) >= v.bis) {
                await uebernehme($, v.at)
            }
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

    // Kalibrieren.
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
        return r
    })

    // Modell von Hand gewechselt: in der App (sdk), im Auswahlfenster (picker) oder per /model.
    on('classic.PostModelSwitch', async ($, e, next) => {
        const r = await next(e)
        // Ab jetzt schickt die Sitzung dieses Modell von sich aus; /modellwahl vergleicht damit.
        if (e.to_model) {
            z.letztesModell = e.to_model
        }
        // Die App schickt ihre Auswahl auch ohne Wechsel noch einmal: dasselbe Modell ist keine Entscheidung.
        if (e.from_model === e.to_model) {
            return r
        }
        // 'auto' (Rueckfall) und 'resume' (Wiederherstellen) sind keine Entscheidung der Person.
        // Ihre eigene verwirft auch einen offenen Vorschlag.
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

    // Über der Eingabe, solange ein Vorschlag wartet: was er wäre, wann er gilt, Übernehmen und Nein.
    // Das Band zeichnen nur Terminal und Desktop-App; auf dem Handy wartet nichts darauf.
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
        const darunter = await next(e)
        if (e.props.hasSurvey || e.surface === 'mobile') {
            return darunter
        }
        const v = await read($, vorschlagAtom)
        // Einer aus einem frueheren Laden hat keinen Takt mehr: er gilt als verworfen.
        if (!v || z.offen?.at !== v.at) {
            return darunter
        }
        void (await read($, taktAtom))
        const jetzt = await $.clock.now()
        const { Box, Text, Button } = $.ui.resolve(e)
        const wann = v.bis !== null ? `gilt in ${restSekunden(v.bis, jetzt)} s` : 'wartet auf dein ja'
        const knopf = (key: string, label: string, istHaupt: boolean, onPress: () => void) =>
            e.surface === 'terminal'
                ? h(Button, { key, plain: true, label: `[${label}]`, onPress })
                : h(Button, { key, label, variant: istHaupt ? 'primary' : 'secondary', onPress })
        // Unter dem Schluessel "modellwahl" holt der Leitstand die Zeile ganz nach oben, mit ihren Knoepfen.
        const zeile = h(
            Box,
            { key: ZEILE, flexDirection: 'row', alignItems: 'center', gap: 1 },
            h(Text, { wrap: 'truncate-end' }, `Modellwahl schlägt ${wahlText(v.wahl)} vor · ${wann}`),
            knopf('modellwahl-ja', 'Übernehmen', true, () => void uebernehme($, v.at).catch(() => {})),
            knopf('modellwahl-nein', 'Nein', false, () => void lehneAb($, v.at).catch(() => {})),
        )
        return h(Box, { flexDirection: 'column' }, zeile, darunter) as RenderNode as never
    })

    for (const b of BEFEHLE) {
        on('command.run', { command: b.name }, async ($, e) => {
            if (istHilfe(e.args)) {
                return { text: b.hilfe }
            }
            try {
                const vomHandy = (e.origin as { kind?: string } | undefined)?.kind === 'bridge'
                return { text: await wirke($, b.name, String(e.args ?? ''), vomHandy) }
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
    z.wartet = false
    z.basisAufwand = null
    await setzeVorschlag($, null)
}
