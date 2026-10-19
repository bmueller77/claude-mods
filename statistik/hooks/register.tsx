import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderNode, RenderSurface, SessionMessage } from 'claude-code'

import type { CacheSample, Chatlaenge, ContextSample, Countdown, Fenster, Lage, Nutzung } from '../types'

// Statistik: cache-meter und cache-tax in einer Zeile.
//
// Von cache-meter: Restzeit des Caches (jetzt als Ring), Trefferquote,
// Kontext (jetzt auch als Ring), Compact und die Zusammenfassung danach im Verlauf.
// Von cache-tax: das Warmhalten mit Pings und die Kostenschaetzung.
// Weggelassen mit Absicht: die Sperre, die eine Nachricht an einen kalten
// Cache verwirft und zum Wiederholen auffordert, das automatische Warmhalten
// nach einem kalten Neuschrieb und jede Meldung dazu. Ein kalter Cache ist
// nur die rote Schneeflocke in der Leiste.

/**
 * Rueckfall fuer die Auto-Compact-Schwelle, als Anteil des Fensters.
 *
 * Nur gebraucht, wenn die Sitzung ihre eigene Schwelle nicht hergibt.
 */
const SCHWELLE_RUECKFALL = 0.83

/** Ab hier gilt ein Treffer als Beleg fuer die laengere Cache-Laufzeit. */
const TREFFER_BELEG = 50

/** Unter so vielen Tokens Kontext sagt ein Neuschrieb nichts ueber den Cache. */
const KONTEXT_BELEG = 20_000

/** So lange haelt /warmhalten ohne Angabe warm. */
const FENSTER_MS = 6 * 60 * 60 * 1000

/** Jeder Klick auf den Schalter legt so viel drauf; der erste schaltet damit ein. */
const SCHRITT_MS = 3 * 60 * 60 * 1000

/** Hoechstens so lange haelt der Schalter mit Frist warm; danach kommt "immer". */
const GRENZE_MS = 12 * 60 * 60 * 1000

/** Steht die Restzeit naeher als das an der Grenze, schaltet der naechste Klick auf "immer". */
const GRENZE_TOLERANZ_MS = 5 * 60 * 1000

/** Kuerzester Abstand zwischen zwei Pings. */
const MIN_PING_MS = 60 * 1000

/** Was ein Ping fragt: so wenig wie moeglich, die Antwort ist egal. */
const PING_PROMPT = 'Reply with the single word: warm'

/**
 * Woher Claude Code selbst die Nutzung pro Modell holt.
 *
 * `$.session.usage()` nennt nur das Sitzungs- und das Wochenlimit. Das eigene
 * Fenster fuer Fable steht allein in der Antwort dieses Endpunkts, unter
 * `limits[]` als Eintrag mit `scope.model.display_name`. Der Mod ruft ihn mit
 * dem Handle aus `$.session.authorize()`; die Anmeldung selbst bleibt beim Host.
 */
const NUTZUNG_URL = 'https://api.anthropic.com/api/oauth/usage'

/** So oft fragt der Mod hoechstens nach dem Fable-Limit. */
const FABLE_ABSTAND_MS = 5 * 60_000

/** Schluessel im Speicher. */
const SPEICHER_LAUFZEIT = 'statistik.ttlMinutes'
const SPEICHER_QUELLE = 'statistik.ttlSource'
/** Alte Einstellung, mit der jede Sitzung warm begann; wird beim Sitzungsstart geloescht. */
const SPEICHER_IMMER = 'statistik.warmImmer'
const SPEICHER_WARM_BIS = 'statistik.warmBis'
/** Wann zuletzt abgelaufene Fristen fremder Chats weggeraeumt wurden. */
const SPEICHER_AUFGERAEUMT = 'statistik.aufgeraeumt'
/** Hoechstens so oft werden fremde Chats aufgeraeumt. */
const AUFRAEUMEN_ABSTAND_MS = 24 * 60 * 60_000

/** Steht statt einer Frist unter dem Schluessel der Sitzung: warm ohne Ende in diesem Chat. */
const WARM_IMMER = 'immer'

/** Der Block von Naechste-Schritte: er steht immer ganz unten, unter der Statistik. */
const BLOCK_UNTEN = 'naechste-schritte'
/** Die Zeile des Autopiloten: sie steht immer ganz oben, ueber allem anderen im Band. */
const BLOCK_OBEN = 'autopilot'

/** So viele Eintraege liefert `$.session.messages()` hoechstens; eine volle Liste kann gekappt sein. */
const NACHRICHTEN_GRENZE = 4096

/**
 * Dollar je Million Tokens: [Cache lesen, Cache schreiben (1h), Ausgabe].
 *
 * Listenpreise von September 2026, aus cache-tax uebernommen. Laengere
 * Familiennamen zuerst: eine Modell-ID trifft die erste Zeile, die sie enthaelt.
 */
const PREISE: Array<[string, number, number, number]> = [
    ['fable-5-1', 0.25, 20, 50],
    ['fable-5', 1, 20, 50],
    ['opus-5', 0.5, 10, 25],
    ['opus-4', 0.5, 10, 25],
    ['sonnet-5', 0.2, 4, 10],
    ['sonnet', 0.3, 6, 15],
    ['haiku', 0.1, 2, 5],
]

/**
 * Die Zeichen auf den Knoepfen: Flamme oder Schneeflocke, ob der Cache warm ist,
 * zugleich der Warmhalten-Schalter; ein Schwamm fuers Aufraeumen mit Sicherungspunkt,
 * ein Pfeil nach unten fuers schlichte Verdichten, Sanduhr, solange eins davon wartet.
 * Jeder Knopf traegt ein Emoji, kein einfaches Textzeichen: Knoepfe mit Emoji macht
 * die App gleich breit, Knoepfe mit Textzeichen schmaler.
 */
const SYMBOL_WARM = '🔥'
const SYMBOL_KALT = '❄️'
const SYMBOL_WISCHEN = '🧽'
const SYMBOL_COMPACT = '🔻'
const SYMBOL_EINGEREIHT = '⏳'
/** Die Chatlaenge: eine Sprechblase, als Text. */
const SYMBOL_CHAT = '💬'
/** Details zum Kontext: ein Diagramm; der Knopf zeigt /context. */
const SYMBOL_DETAILS = '📊'
/** Warmhalten sofort aus: ein Kreuz neben dem Schalter, als Emoji (✖️). */
const SYMBOL_AUS = '\u2716\uFE0F'

/**
 * So lange zaehlt ein Druck auf Schwamm oder Pfeil herunter, bevor etwas passiert.
 * Bis dahin laesst er sich abbrechen; ein versehentlicher Druck bleibt so folgenlos.
 */
const COUNTDOWN_MS = 10_000

/** Die verbleibenden Sekunden als Emoji, damit der Knopf so breit bleibt wie die anderen: 🔟, 9️⃣ bis 1️⃣. */
export function countdownZeichen(sekunden: number): string {
    return sekunden >= 10 ? '\u{1F51F}' : `${Math.max(1, sekunden)}\uFE0F\u20E3`
}

/**
 * Die Trennlinie ueber der Statistik: 7 Pixel hoch, die Linie 1 Pixel in der
 * Mitte. Breiter als jede Leiste; ohne eigene Breite im Element nimmt die App
 * sie nur bis zum Rand der Leiste, und `preserveAspectRatio="none"` haelt
 * die Hoehe dabei fest.
 */
const TRENNLINIE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="7" viewBox="0 0 4000 7" preserveAspectRatio="none">' +
    '<rect x="0" y="3" width="4000" height="1" fill="#8a8a8a" fill-opacity="0.5"/></svg>'

/** Farben der kleinen Bilder, lesbar in hellem wie dunklem Thema. */
const GRUEN = '#3a9a5b'
const GELB = '#d4a017'
const ROT = '#d64545'
const GRAU = '#8a8a8a'

const cache = atom({ plugin: 'statistik', key: 'cache' } as const, null as CacheSample | null)
const context = atom({ plugin: 'statistik', key: 'context' } as const, null as ContextSample | null)
const lage = atom({ plugin: 'statistik', key: 'lage' } as const, {
    letzteAnfrage: 0,
    istKompaktiert: false,
    warmBis: 0,
    naechsterPing: 0,
    warmGrund: null,
    warmImmer: false,
    ctx: 0,
    kaltUsd: null,
    warmUsd: null,
} as Lage)
const nutzung = atom({ plugin: 'statistik', key: 'nutzung' } as const, {
    sl: null,
    wl: null,
    fl: null,
    istFable: false,
} as Nutzung)
const tick = atom({ plugin: 'statistik', key: 'tick' } as const, 0)
const eingereiht = atom({ plugin: 'statistik', key: 'eingereiht' } as const, null as 'compact' | 'wischen' | null)
const chatlaenge = atom({ plugin: 'statistik', key: 'chatlaenge' } as const, null as Chatlaenge | null)
const countdown = atom({ plugin: 'statistik', key: 'countdown' } as const, null as Countdown | null)

// --- Was nur dieses Laden des Moduls braucht ---
// Ein Neuladen beginnt hier von vorn. Was die Leiste zeigt, steht zusaetzlich
// in `lage`; das Warmhalten liegt mit seiner Frist (oder "immer") im Speicher und wird beim
// Sitzungsstart wieder aufgenommen.

type Ping = { at: number; read: number; write: number; usd: number | null }
type Neuschrieb = { at: number; tokens: number; usd: number | null }

const z = {
    /** Ob die Flaeche eine Leiste zeichnet; sonst steht das Warmhalten in der Statuszeile. */
    hatLeiste: true,
    sid: '',
    /** Was in der Einstellung steht: "auto", "5m" oder "1h". */
    gewaehlt: 'auto',
    laufzeitMs: 60 * 60 * 1000,
    letzteAnfrage: 0,
    /** Die letzte Anfrage, als die laufende Runde begann: fuer die Pause davor. */
    vorRunde: 0,
    rundeBeginn: 0,
    modell: null as string | null,
    ctx: 0,
    /**
     * Fuer die Anzeige: verdichtet, und seitdem keine Anfrage. Die Uhr zeigt dann
     * "Cache leer"; die erste Anfrage danach schreibt den Cache neu und nimmt es zurueck.
     */
    kompaktiert: false,
    /**
     * Fuer die Messung: Die laufende oder naechste Runde folgt auf eine Verdichtung.
     * Bleibt bis `turn.complete`, auch wenn die Anzeige schon wieder eine Uhr hat.
     */
    nachVerdichtung: false,
    /** Wann `turn.step` die Lage zuletzt geschrieben hat: hoechstens alle 30 Sekunden. */
    lageAmSchritt: 0,
    warmBis: 0,
    warmGrund: null as string | null,
    /** Warm ohne Ende, nur in diesem Chat; `warmBis` ist dann 0. */
    immer: false,
    naechsterPing: 0,
    warte: null as { cancel: () => void } | null,
    pings: 0,
    letzterPing: null as Ping | null,
    neuschriebe: [] as Neuschrieb[],
    /** Wann zuletzt nach dem Fable-Limit gefragt wurde, und was dabei schiefging. */
    fableAm: 0,
    fableFehler: null as string | null,
}

/** Ob der eigene Hook die letzte Verdichtung schon in den Verlauf geschrieben hat. */
let hookHatProtokolliert = false

/**
 * Was die Leiste je Flaeche zuletzt gezeichnet hat: ob Claude gerade arbeitet.
 *
 * Das weiss nur der Render-Hook (`e.props.isWorking`). Der Countdown handelt erst
 * zehn Sekunden nach dem Druck und nimmt dann den Stand von hier.
 */
const zuletztBeschaeftigt = new Map<RenderSurface, boolean>()

/**
 * Der Countdown dieses Ladens: sein Takt und die Flaeche, auf der gedrueckt wurde.
 *
 * Ein Neuladen beginnt ohne; die Engine bricht den alten Takt dabei selbst ab.
 * Steht dann noch ein Countdown in `$.state`, gilt er als abgebrochen.
 */
let lauf: { takt: { cancel: () => void }; flaeche: RenderSurface } | null = null

/** Auf welcher Flaeche die Leiste zuletzt gezeichnet wurde; ein getippter Befehl handelt mit ihrem Stand. */
let zuletztFlaeche: RenderSurface | null = null

// --- Kleine Helfer ---

/** Tokens kurz: 1234 als "1,2k", 123456 als "123k". */
function kurz(n: number): string {
    if (n < 1000) {
        return String(n)
    }
    if (n < 10000) {
        return `${(n / 1000).toFixed(1).replace('.', ',')}k`
    }
    return `${Math.round(n / 1000)}k`
}

/** Tokens der Chatlaenge: 950 als "950", 312000 als "312k", 2400000 als "2,4 Mio.". */
export function tokenMenge(n: number): string {
    if (n >= 999_500) {
        const mio = n / 1e6
        return `${mio >= 9.95 ? String(Math.round(mio)) : mio.toFixed(1).replace('.', ',')} Mio.`
    }
    return kurz(n)
}

/**
 * Die Laenge des ganzen Chats aus dem Verlauf.
 *
 * Als Nachricht zaehlt, was die Person oder Claude mit eigenem Text geschrieben
 * hat; ein reines Werkzeug-Ergebnis nicht. Die Tokens sind geschaetzt aus allem
 * Text, Zeichen durch vier: Text, Werkzeug-Eingaben und -Ergebnisse. Ein Ergebnis
 * steht im Verlauf zweimal, am Aufruf und in der Antwort darauf; gezaehlt wird es
 * einmal.
 */
export function zaehleChat(liste: readonly SessionMessage[]): Chatlaenge {
    let nachrichten = 0
    let zeichen = 0
    const gezaehlt = new Set<string>()
    for (const m of liste) {
        const text = m.text ?? ''
        if (text.trim() !== '') {
            nachrichten += 1
        }
        zeichen += text.length
        for (const aufruf of m.toolUses ?? []) {
            zeichen += JSON.stringify(aufruf.input ?? {}).length
            if (aufruf.text) {
                zeichen += aufruf.text.length
                gezaehlt.add(aufruf.tool_use_id)
            }
        }
        for (const ergebnis of m.toolResults ?? []) {
            if (!gezaehlt.has(ergebnis.tool_use_id)) {
                zeichen += (ergebnis.text ?? '').length
            }
        }
    }
    return { nachrichten, tokens: Math.round(zeichen / 4), istGekappt: liste.length >= NACHRICHTEN_GRENZE }
}

/** Prozent mit hoechstens einer Nachkommastelle, mit Komma geschrieben. */
function prozent(x: number): string {
    return String(Math.round(x * 10) / 10).replace('.', ',')
}

/** Dollar mit Komma: "0,68 $"; "?" ohne Preis. */
function dollar(usd: number | null): string {
    if (usd == null) {
        return '?'
    }
    return `${(usd >= 100 ? usd.toFixed(0) : usd.toFixed(2)).replace('.', ',')} $`
}

/** Eine Dauer lang: "4 h 12 min", "18 min", "2 T 3 h". */
export function dauer(ms: number): string {
    const minuten = Math.max(0, Math.round(ms / 60_000))
    const h = Math.floor(minuten / 60)
    const m = minuten % 60
    if (h >= 48) {
        return `${Math.floor(h / 24)} T ${h % 24} h`
    }
    if (h > 0) {
        return m > 0 ? `${h} h ${m} min` : `${h} h`
    }
    return `${m} min`
}

/**
 * Die Restzeit fuer den Schalter: h:mm in Schritten von fuenf Minuten.
 *
 * Aufgerundet, damit ein laufendes Warmhalten nie "0:00" zeigt.
 */
export function warmRest(ms: number): string {
    const minuten = Math.max(0, Math.ceil(ms / (5 * 60_000)) * 5)
    return `${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, '0')}`
}

/** "90m", "2h", "1h30m" in Millisekunden; null, wenn es keine Dauer ist. */
export function leseDauer(text: string): number | null {
    const m = /^(?:(\d+)h)?(?:(\d+)m(?:in)?)?$/.exec(text.trim().toLowerCase())
    if (!m || (m[1] === undefined && m[2] === undefined)) {
        return null
    }
    const ms = (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60_000
    return ms > 0 ? ms : null
}

/**
 * Lange Zusammenfassung in Stuecke teilen, die ganz ins Bild passen.
 *
 * Das Terminal zeichnet von einer Log-Zeile die ersten 2000 Zeichen.
 */
function absaetze(text: string, grenze = 1800): string[] {
    const raus: string[] = []
    for (const teil of text.split(/\n\s*\n/)) {
        let rest = teil.trim()
        if (!rest) {
            continue
        }
        while (rest.length > grenze) {
            const fenster = rest.slice(0, grenze)
            const schnitt = fenster.lastIndexOf('\n')
            const bei = schnitt > grenze / 2 ? schnitt : grenze
            raus.push(rest.slice(0, bei).trimEnd())
            rest = rest.slice(bei).trimStart()
        }
        raus.push(rest)
    }
    return raus
}

/** Text fuer ein XML-Dokument entschaerfen. */
function xml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function preisVon(modell: string | null): [number, number, number] | null {
    const m = (modell ?? '').toLowerCase().replace(/[\s.]+/g, '-')
    for (const [familie, lesen, schreiben, ausgabe] of PREISE) {
        if (m.includes(familie)) {
            return [lesen, schreiben, ausgabe]
        }
    }
    return null
}

/** Was ein Ping kostet: Cache lesen, Cache schreiben, ungecachte Eingabe, Ausgabe. */
function pingUsd(
    u: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number },
    preis: [number, number, number],
): number {
    return (
        (u.cache_read_input_tokens * preis[0] +
            u.cache_creation_input_tokens * preis[1] +
            (u.input_tokens * preis[1]) / 2 +
            u.output_tokens * preis[2]) /
        1e6
    )
}

function istKalt(jetzt: number): boolean {
    return z.letzteAnfrage > 0 && !z.kompaktiert && jetzt - z.letzteAnfrage >= z.laufzeitMs
}

/** Ein Ping kurz vor Ablauf: bei einer Stunde nach 50 Minuten, bei fuenf Minuten nach vier. */
function pingAbstand(): number {
    return Math.max(MIN_PING_MS, z.laufzeitMs - Math.min(10 * 60_000, z.laufzeitMs * 0.2))
}

/** Unter diesem Schluessel liegt das Warmhalten dieser Sitzung: die Frist oder "immer". */
function warmSchluessel(): string {
    return `${SPEICHER_WARM_BIS}:${z.sid}`
}

/** Ob gerade warm gehalten wird: mit Frist oder ohne Ende. */
function haeltWarm(jetzt: number): boolean {
    return z.immer || z.warmBis > jetzt
}

// --- Die kleinen Bilder fuer die Desktop-App ---
// Tooltips gibt es nur ueber ein interaktives SVG: dessen <title> zeigt die
// App beim Darueberfahren. Jedes Bild traegt also seine Erklaerung selbst, und
// die Leiste braucht keine eigenen Info-Zeichen mehr.

function svg(titel: string, inhalt: string): string {
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">' +
        `<g><title>${xml(titel)}</title><rect width="14" height="14" fill="transparent"/>${inhalt}</g></svg>`
    )
}

/** Farbe der Cache-Uhr: gruen, im letzten Viertel gelb, in den letzten zehn Prozent rot. */
function uhrFarbe(anteil: number | null): string {
    return anteil == null ? GRAU : anteil <= 0.1 ? ROT : anteil <= 0.25 ? GELB : GRUEN
}

/** Die Cache-Uhr als Ring: der Bogen ist die verbleibende Laufzeit, im Uhrzeigersinn ab zwoelf. */
export function uhrSvg(anteil: number | null, titel: string): string {
    return ringSvg(anteil, uhrFarbe(anteil), titel)
}

/** Farbe eines Limits nach genutztem Anteil: gruen, ab 75 Prozent gelb, ab 90 rot. */
function limitHex(prozent: number): string {
    return prozent >= 90 ? ROT : prozent >= 75 ? GELB : GRUEN
}

/** Dasselbe als Farbe des Themas, fuer Text. */
function limitFarbe(prozent: number): 'error' | 'warning' | 'success' {
    return prozent >= 90 ? 'error' : prozent >= 75 ? 'warning' : 'success'
}

/** Ein Ring fuer ein Limit: der Bogen ist das Genutzte. */
function limitSvg(prozent: number, titel: string): string {
    return ringSvg(Math.min(1, Math.max(0, prozent / 100)), limitHex(prozent), titel)
}

/** Restzeit als hh:mm, Stunden zweistellig und notfalls ueber 24. */
export function restUhr(ms: number): string {
    const minuten = Math.max(0, Math.ceil(ms / 60_000))
    return `${String(Math.floor(minuten / 60)).padStart(2, '0')}:${String(minuten % 60).padStart(2, '0')}`
}

const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const WOCHENTAG_LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

const TAG_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Liest Zeiten in Berliner Zeit, auch auf Servern und in der Cloud, die auf UTC laufen. */
const BERLIN = (() => {
    try {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: 'Europe/Berlin',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        })
    } catch {
        return null
    }
})()

/** Wochentag (0 = Sonntag), Stunde und Minute in Berlin; ohne Zeitzonendaten die des Rechners. */
function berlin(ms: number): { tag: number; stunde: number; minute: number } {
    const d = new Date(ms)
    if (BERLIN !== null) {
        const teile: Record<string, string> = {}
        for (const teil of BERLIN.formatToParts(d)) teile[teil.type] = teil.value
        const tag = TAG_EN.indexOf(teile.weekday ?? '')
        const stunde = Number(teile.hour)
        const minute = Number(teile.minute)
        if (tag >= 0 && Number.isFinite(stunde) && Number.isFinite(minute)) return { tag, stunde: stunde % 24, minute }
    }
    return { tag: d.getDay(), stunde: d.getHours(), minute: d.getMinutes() }
}

/** Uhrzeit hh:mm in Berliner Zeit. */
function uhrzeit(ms: number): string {
    const { stunde, minute } = berlin(ms)
    return `${String(stunde).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** Wochentag und Uhrzeit in Berliner Zeit: "Do 09:00". */
export function wochentagZeit(ms: number): string {
    return `${WOCHENTAG[berlin(ms).tag]} ${uhrzeit(ms)}`
}

/** Ob ein Zuruecksetzen mehr als 24 Stunden entfernt ist. */
export function weitWeg(bis: number, jetzt: number): boolean {
    return bis - jetzt > 24 * 60 * 60_000
}

/** Ein Limit als Wert: "SL: 15%". */
export function limitWert(kurzname: string, prozent: number): string {
    return `${kurzname}: ${Math.round(prozent)}%`
}

/** Die Zeit eines Limits in Klammern: "(02:59)" oder "(Do 09:00)"; leer, wenn sie nicht bekannt ist. */
export function limitZeit(f: Fenster, jetzt: number, mitTag: boolean): string {
    if (f.bis == null) {
        return ''
    }
    return `(${mitTag ? wochentagZeit(f.bis) : restUhr(f.bis - jetzt)})`
}

/** Ein Limit ganz: "SL: 15% (02:59)". */
function limitText(kurzname: string, f: Fenster, jetzt: number, mitTag: boolean): string {
    const zeit = limitZeit(f, jetzt, mitTag)
    return zeit ? `${limitWert(kurzname, f.prozent)} ${zeit}` : limitWert(kurzname, f.prozent)
}

/** Ein Fenster aus `$.session.usage()` oder `session.measure` lesen. */
function fensterAus(rl: readonly { kind: string; percentUsed: number; resetsAt?: string }[], art: string): Fenster | null {
    const f = rl.find(r => r.kind === art)
    if (!f) {
        return null
    }
    const bis = f.resetsAt ? Date.parse(f.resetsAt) : NaN
    return { prozent: f.percentUsed, bis: Number.isFinite(bis) ? bis : null }
}

/**
 * Das Fable-Fenster aus der Antwort des Nutzungs-Endpunkts lesen.
 *
 * Gesucht wird unter `limits[]` der Eintrag, dessen Modellname Fable enthaelt;
 * `utilization` ist schon in Prozent, `resets_at` Sekunden oder ein ISO-Datum.
 * Alles andere, auch eine fremde Form, ergibt null: dann fehlt FL eben.
 */
export function fableAus(antwort: unknown): Fenster | null {
    const limits = antwort && typeof antwort === 'object' ? (antwort as { limits?: unknown }).limits : undefined
    if (!Array.isArray(limits)) {
        return null
    }
    for (const eintrag of limits) {
        if (!eintrag || typeof eintrag !== 'object') {
            continue
        }
        const e = eintrag as {
            scope?: { model?: { display_name?: unknown } }
            limit?: { utilization?: unknown; resets_at?: unknown }
        }
        const name = e.scope?.model?.display_name
        if (typeof name !== 'string' || !/fable/i.test(name)) {
            continue
        }
        const u = e.limit?.utilization
        if (typeof u !== 'number' || !Number.isFinite(u)) {
            continue
        }
        const r = e.limit?.resets_at
        const bis = typeof r === 'number' ? r * 1000 : typeof r === 'string' ? Date.parse(r) : NaN
        return { prozent: Math.min(100, Math.round(u * 10) / 10), bis: Number.isFinite(bis) ? bis : null }
    }
    return null
}

/** Radius und Umfang des Rings. */
const RING_R = 5.1
const RING_UMFANG = 2 * Math.PI * RING_R

/**
 * Ein Ring wie die Fortschrittsanzeige von GlanceFlow: eine blasse Spur in
 * der eigenen Farbe, darauf der Bogen fuer `anteil`, im Uhrzeigersinn ab
 * zwoelf. Ohne Wert bleibt nur die Spur, in Grau.
 */
function ringSvg(anteil: number | null, farbe: string, titel: string): string {
    const spur = `<circle cx="7" cy="7" r="${RING_R}" fill="none" stroke="${anteil == null ? GRAU : farbe}" stroke-opacity=".4" stroke-width="1.9"/>`
    const laenge = anteil == null ? 0 : Math.min(1, Math.max(0, anteil)) * RING_UMFANG
    const bogen =
        laenge > 0.3
            ? `<circle cx="7" cy="7" r="${RING_R}" fill="none" stroke="${farbe}" stroke-width="1.9" stroke-linecap="round" ` +
              `stroke-dasharray="${laenge.toFixed(2)} ${RING_UMFANG.toFixed(2)}" transform="rotate(-90 7 7)"/>`
            : ''
    return svg(titel, spur + bogen)
}

/**
 * Stufe des Kontexts, gemessen an der Compact-Schwelle: bis zur Haelfte
 * "frei", bis 80 Prozent davon "voll", darueber "eng"; dann ist der Schwamm
 * hervorgehoben.
 */
type Stufe = 'frei' | 'voll' | 'eng' | null

export function kontextStufe(tokens: number, schwelle: number): Stufe {
    if (schwelle <= 0) {
        return null
    }
    const q = tokens / schwelle
    return q <= 0.5 ? 'frei' : q <= 0.8 ? 'voll' : 'eng'
}

const STUFE_HEX: Record<'frei' | 'voll' | 'eng', string> = { frei: GRUEN, voll: GELB, eng: ROT }
const STUFE_FARBE: Record<'frei' | 'voll' | 'eng', 'success' | 'warning' | 'error'> = {
    frei: 'success',
    voll: 'warning',
    eng: 'error',
}

/** Die Cache-Uhr im Terminal, als ein Zeichen. */
export function uhrZeichen(anteil: number | null): string {
    if (anteil == null || anteil <= 0) {
        return '○'
    }
    return anteil < 0.375 ? '◔' : anteil < 0.625 ? '◑' : anteil < 0.875 ? '◕' : '●'
}

// --- Tooltips ---

/** Woher die Cache-Laufzeit stammt, als Satzteil. */
const HERKUNFT: Record<CacheSample['ttlSource'], string> = {
    gemeldet: 'von der Sitzung selbst gemeldet',
    gemessen: 'gemessen: einen Cache-Treffer nach über fünf Minuten Pause gibt es nur bei einer Stunde',
    konfiguriert: 'so in den Einstellungen des Mods festgelegt',
    geraten:
        'nur angenommen, weil es noch keinen Beleg gibt; daher das Fragezeichen. ' +
        'In den Einstellungen des Mods lässt sie sich fest auf 5m oder 1h stellen',
}

/** Tooltip der Cache-Uhr: Restzeit, Laufzeit und die Trefferquote der letzten Antwort. */
function tippCache(c: CacheSample | null, l: Lage, rest: number | null, verstrichen: number, laufzeit: number): string {
    if (l.letzteAnfrage <= 0 || rest == null) {
        return l.istKompaktiert
            ? 'Prompt-Cache\n\nNach dem Compact ist der Cache neu. Die Uhr läuft wieder ab der nächsten Antwort.'
            : 'Prompt-Cache\n\nNoch keine Antwort in dieser Sitzung, also auch noch kein Cache. Die Uhr beginnt mit der ersten Antwort.'
    }
    const vor = Math.round(verstrichen)
    const kopf = rest <= 0 ? 'Prompt-Cache: abgelaufen' : `Prompt-Cache: noch ${Math.ceil(rest)} von ${laufzeit} Minuten warm`
    const treffer =
        !c || c.hitPercent == null
            ? 'Treffer der letzten Antwort: unbekannt, die Runde lieferte keine Token-Zahlen.'
            : `Treffer der letzten Antwort: ${c.hitPercent} %` +
              (c.inputTokens != null && c.cacheReadTokens != null
                  ? `, ${kurz(c.cacheReadTokens)} von ${kurz(c.inputTokens)} Eingabe-Tokens aus dem Cache.`
                  : '.') +
              ' Was aus dem Cache kommt, kostet nur ein Zehntel.'
    return [
        kopf,
        '',
        `Gezählt ab der letzten Anfrage, vor ${vor} ${vor === 1 ? 'Minute' : 'Minuten'}. ` +
            'Solange er warm ist, liest Claude den bisherigen Verlauf günstig aus dem Cache.',
        '',
        treffer,
        '',
        `Laufzeit ${laufzeit} Minuten, ${c ? HERKUNFT[c.ttlSource] : 'noch ohne Beleg'}.`,
        'Die Uhr ist grün, im letzten Viertel gelb und in den letzten zehn Prozent rot.',
    ].join('\n')
}

/** Tooltip des Kontext-Rings: Fuellung und Schwelle. */
function tippKontext(k: ContextSample | null): string {
    if (!k || k.window <= 0) {
        return 'Kontext: unbekannt\n\nDie Sitzung hat noch keine Zahlen zum Kontext geliefert.'
    }
    const f = (k.tokens / k.window) * 100
    const s = (k.threshold / k.window) * 100
    return [
        `Kontext: ${prozent(f)} % des Fensters belegt`,
        `${kurz(k.tokens)} von ${kurz(k.window)} Tokens.`,
        '',
        `Bei ${prozent(s)} % verdichtet Claude automatisch` +
            (k.isThresholdKnown ? '.' : ' (angenommen, weil die Sitzung ihre Schwelle nicht nennt).'),
        `Der Ring ist grün bis ${prozent(s / 2)} %, gelb bis ${prozent(s * 0.8)} %, rot darüber.`,
        '',
        'Bei Rot ist der Schwamm hervorgehoben.',
    ].join('\n')
}

/** Tooltip von Flamme oder Schneeflocke: warm oder kalt, was es kostet, Warmhalten. */
function tippZustand(l: Lage, kalt: boolean, jetzt: number): string {
    const zeilen: string[] = []
    if (kalt) {
        zeilen.push(`Cache kalt, seit ${dauer(jetzt - l.letzteAnfrage)} keine Anfrage mehr.`)
        zeilen.push('')
        zeilen.push(
            `Die nächste Nachricht schreibt bis zu ${kurz(l.ctx)} Tokens neu in den Cache, etwa ${dollar(l.kaltUsd)}` +
                (l.warmUsd == null ? '.' : ` (warm wären es ${dollar(l.warmUsd)}).`),
        )
    } else {
        zeilen.push('Cache warm.')
        zeilen.push('')
        zeilen.push(`Die nächste Nachricht liest ${kurz(l.ctx)} Tokens günstig aus dem Cache, etwa ${dollar(l.warmUsd)}.`)
    }
    zeilen.push('')
    const ping = l.naechsterPing > jetzt ? `, nächster Ping in ${dauer(l.naechsterPing - jetzt)}.` : '.'
    if (l.warmImmer) {
        zeilen.push(`Warmhalten an, ohne Ende in diesem Chat${ping}`)
    } else if (l.warmBis > jetzt) {
        zeilen.push(`Warmhalten an, noch ${dauer(l.warmBis - jetzt)}${ping}`)
    } else if (l.warmGrund) {
        zeilen.push(`Warmhalten hat aufgehört: ${l.warmGrund}.`)
    } else {
        zeilen.push('Warmhalten aus.')
    }
    return zeilen.join('\n')
}

/**
 * Nimmt das Element mit dem Schluessel `schluessel` aus einem gezeichneten Baum.
 *
 * Gibt den Baum ohne es zurueck (null, wenn danach nichts bleibt) und das
 * Element selbst (null, wenn es nicht vorkommt). Die Engine erlaubt das: einen
 * Teil eines anderen Mods, den `next(e)` geliefert hat, darf ein Mod versetzen.
 * Gesucht wird nur in Boxen; ein Text haelt keine Box.
 */
export function nimmHeraus(baum: RenderNode, schluessel: string): { oben: RenderNode | null; unten: RenderElement | null } {
    if (typeof baum === 'string') {
        return { oben: baum, unten: null }
    }
    const knoten = baum as { props?: Record<string, unknown>; children?: RenderNode[] }
    if (knoten.props?.key === schluessel) {
        return { oben: null, unten: baum }
    }
    if (baum.type !== 'Box' || !knoten.children) {
        return { oben: baum, unten: null }
    }
    let unten: RenderElement | null = null
    const kinder: RenderNode[] = []
    for (const kind of knoten.children) {
        if (unten) {
            kinder.push(kind)
            continue
        }
        const r = nimmHeraus(kind, schluessel)
        unten = r.unten
        if (r.oben !== null) {
            kinder.push(r.oben)
        }
    }
    if (!unten) {
        return { oben: baum, unten: null }
    }
    return { oben: kinder.length > 0 ? ({ ...baum, children: kinder } as RenderElement) : null, unten }
}

/**
 * Den Kontext im Detail zeigen: /context, wie wenn die Person es tippt.
 *
 * Die Kontext-Anzeige in der Seitenleiste der App kann ein Mod nicht oeffnen:
 * Kein Werkzeug der App nennt sie, `ccd_view.show_pane` kennt keinen Kontext.
 * /context ist der Weg, den App und Terminal selbst anbieten; der Befehl laeuft,
 * sobald die Sitzung still ist. Lehnt die Engine ihn ab, steht er im
 * Eingabefeld und wartet auf Enter.
 */
async function zeigeKontext($: EngineInterface): Promise<void> {
    try {
        await $.command.run({ command: 'context' })
    } catch {
        await $.prompt.fill({ text: '/context' }).catch(() => {})
        $.ui.toast('Drück Enter, dann zeigt die App den Kontext.')
    }
}

// --- Messen ---

/**
 * Den Kontext messen, gegen dasselbe Fenster, gegen das auch verdichtet wird.
 *
 * "summary" schaetzt im Prozess und stellt keine Anfrage, der Aufruf kostet
 * also nichts.
 */
async function messeKontext($: EngineInterface): Promise<ContextSample | null> {
    try {
        const u = await $.session.usage({ breakdown: 'summary' })
        const b = u.context.breakdown
        if (b) {
            return {
                tokens: b.totalTokens,
                window: b.rawMaxTokens,
                threshold: b.autoCompactThreshold ?? Math.round(b.rawMaxTokens * SCHWELLE_RUECKFALL),
                isThresholdKnown: b.autoCompactThreshold != null,
            }
        }
        if (u.context.tokens == null) {
            return null
        }
        return {
            tokens: u.context.tokens,
            window: u.context.window,
            threshold: Math.round(u.context.window * SCHWELLE_RUECKFALL),
            isThresholdKnown: false,
        }
    } catch {
        return null
    }
}

/** Den Kontext messen und ablegen; die Zahl der Tokens braucht auch die Kostenschaetzung. */
async function kontextNeu($: EngineInterface): Promise<void> {
    const k = await messeKontext($)
    if (k) {
        z.ctx = k.tokens
        await update($, context, () => k)
    }
    try {
        await setzeLimits($, (await $.session.usage()).rateLimits)
    } catch {
        // Ohne gebundenen Verlauf antwortet die Sitzung nicht; die Zeile bleibt, wie sie war.
    }
}

/**
 * Die Chatlaenge neu zaehlen und ablegen; die Leiste liest nur das Ergebnis.
 *
 * Geht das Lesen schief, fehlen die Zahlen, die Zeile bleibt.
 */
async function chatNeu($: EngineInterface): Promise<void> {
    let neu: Chatlaenge | null
    try {
        neu = zaehleChat(await $.session.messages())
    } catch {
        neu = null
    }
    await update($, chatlaenge, () => neu).catch(() => {})
}

/** Sitzungs- und Wochenlimit ablegen; FL bleibt, das kommt von woanders. */
async function setzeLimits(
    $: EngineInterface,
    rl: readonly { kind: string; percentUsed: number; resetsAt?: string }[],
): Promise<void> {
    const sl = fensterAus(rl, 'five_hour')
    const wl = fensterAus(rl, 'seven_day')
    await update($, nutzung, n => ({ ...n, sl, wl }))
}

/** Fragt den Nutzungs-Endpunkt nach dem Fable-Fenster; null, wenn es keins gibt oder etwas fehlt. */
async function holeFable($: EngineInterface): Promise<Fenster | null> {
    const anmeldung = await $.session.authorize()
    if (!anmeldung) {
        z.fableFehler = 'die Sitzung hat keine Anthropic-Anmeldung'
        return null
    }
    const r = await $.http.fetch(NUTZUNG_URL, {
        auth: anmeldung.handle,
        headers: { accept: 'application/json', 'anthropic-beta': 'oauth-2025-04-20' },
    })
    if (!r.ok) {
        z.fableFehler = `der Nutzungs-Endpunkt antwortete mit ${r.status}`
        return null
    }
    const f = fableAus(JSON.parse(r.text))
    z.fableFehler = f ? null : 'die Antwort enthielt kein Fable-Fenster'
    return f
}

/**
 * Das Fable-Limit auffrischen, solange Fable laeuft; sonst FL ausblenden.
 *
 * Hoechstens alle fuenf Minuten eine Anfrage, und nur mit Fable: ohne Fable
 * fragt der Mod gar nicht.
 */
async function fableNeu($: EngineInterface, erzwingen = false): Promise<void> {
    const istFable = /fable/i.test(z.modell ?? '')
    if (!istFable) {
        await update($, nutzung, n => (n.istFable ? { ...n, istFable: false } : n))
        return
    }
    await update($, nutzung, n => (n.istFable ? n : { ...n, istFable: true }))
    const jetzt = await $.clock.now()
    if (!erzwingen && z.fableAm > 0 && jetzt - z.fableAm < FABLE_ABSTAND_MS) {
        return
    }
    z.fableAm = jetzt
    let f: Fenster | null = null
    try {
        f = await holeFable($)
    } catch (fehler) {
        z.fableFehler = `die Anfrage ging schief (${fehler instanceof Error ? fehler.message : String(fehler)})`
    }
    await update($, nutzung, n => ({ ...n, fl: f ?? n.fl }))
}

/** Tooltip eines Limits. */
function tippLimit(name: string, f: Fenster, jetzt: number, mitTag: boolean): string {
    const zeilen = [`${name}: ${prozent(f.prozent)} % genutzt.`]
    if (f.bis != null) {
        zeilen.push(
            '',
            mitTag || weitWeg(f.bis, jetzt)
                ? `Zurückgesetzt am ${WOCHENTAG_LANG[berlin(f.bis).tag]} um ${uhrzeit(f.bis)} Uhr, in ${dauer(f.bis - jetzt)}.`
                : `Zurückgesetzt um ${uhrzeit(f.bis)} Uhr, in ${dauer(f.bis - jetzt)}.`,
        )
    }
    zeilen.push('', 'Der Ring ist grün, ab 75 % gelb und ab 90 % rot.')
    return zeilen.join('\n')
}

/** Die Laufzeit, wie sie beim Start gilt: Gemeldetes und Gemessenes vor der Einstellung. */
async function laufzeitBeimStart($: EngineInterface): Promise<{ minuten: number; quelle: CacheSample['ttlSource'] }> {
    const gemerkt = Number((await $.store.get(SPEICHER_LAUFZEIT)) ?? 0)
    const quelle = String((await $.store.get(SPEICHER_QUELLE)) ?? '')
    if ((gemerkt === 5 || gemerkt === 60) && (quelle === 'gemeldet' || quelle === 'gemessen')) {
        return { minuten: gemerkt, quelle }
    }
    if (z.gewaehlt === '1h' || z.gewaehlt === '5m') {
        return { minuten: z.gewaehlt === '1h' ? 60 : 5, quelle: 'konfiguriert' }
    }
    return { minuten: 60, quelle: 'geraten' }
}

/** Die Lage fuer die Leiste aus dem Stand im Modul schreiben. */
async function zeige($: EngineInterface): Promise<void> {
    const preis = preisVon(z.modell)
    const neu: Lage = {
        letzteAnfrage: z.letzteAnfrage,
        istKompaktiert: z.kompaktiert,
        warmBis: z.warmBis,
        naechsterPing: z.naechsterPing,
        warmGrund: z.warmGrund,
        warmImmer: z.immer,
        ctx: z.ctx,
        kaltUsd: preis ? (z.ctx * preis[1]) / 1e6 : null,
        warmUsd: preis ? (z.ctx * preis[0]) / 1e6 : null,
    }
    await update($, lage, () => neu)
    if (!z.hatLeiste) {
        const jetzt = await $.clock.now()
        $.ui.status(
            z.immer ? 'Warmhalten ohne Ende' : z.warmBis > jetzt ? `Warmhalten noch ${dauer(z.warmBis - jetzt)}` : undefined,
        )
    }
}

// --- Warmhalten ---
// Wie bei cache-tax: Kurz bevor der Cache ablaeuft, stellt ein Ping eine
// winzige Anfrage auf denselben Verlauf. Die liest den Cache und haelt ihn so
// warm. Ein Ping kostet Tokens, aber nur zum Lesepreis.

function abbrechen(): void {
    z.warte?.cancel()
    z.warte = null
    z.naechsterPing = 0
}

/** Warmhalten beenden; `grund` steht im Tooltip, wenn es von selbst aufhoert. */
async function stoppe($: EngineInterface, grund: string | null): Promise<void> {
    z.warmBis = 0
    z.immer = false
    z.warmGrund = grund
    abbrechen()
    await $.store.delete(warmSchluessel())
    await zeige($)
}

/**
 * Den naechsten Ping stellen, oder nur das Ende des Fensters, wenn der Cache kalt ist.
 *
 * Ohne Ende ("immer") gibt es kein Fensterende: Bei kaltem Cache wartet es auf
 * die naechste Antwort, die hier wieder vorbeikommt.
 */
async function schaerfe($: EngineInterface): Promise<void> {
    abbrechen()
    if (!z.immer && !z.warmBis) {
        await zeige($)
        return
    }
    const jetzt = await $.clock.now()
    if (!z.immer && jetzt >= z.warmBis) {
        await stoppe($, null)
        return
    }
    const bisEnde = z.immer ? Number.POSITIVE_INFINITY : z.warmBis - jetzt
    // Ein kalter Cache bekommt keinen Ping: der schriebe den ganzen Verlauf neu.
    if (z.letzteAnfrage && !z.kompaktiert && !istKalt(jetzt)) {
        const bisKalt = z.letzteAnfrage + z.laufzeitMs - jetzt
        const wann = Math.min(bisEnde, bisKalt, Math.max(1000, z.letzteAnfrage + pingAbstand() - jetzt))
        z.naechsterPing = jetzt + wann
        z.warte = $.clock.after(wann, () => void ping($).catch(() => {}))
    } else if (!z.immer) {
        z.warte = $.clock.after(bisEnde, () => void schaerfe($).catch(() => {}))
    }
    await zeige($)
}

async function ping($: EngineInterface): Promise<void> {
    z.warte = null
    z.naechsterPing = 0
    if (!z.immer && !z.warmBis) {
        return
    }
    const jetzt = await $.clock.now()
    if ((!z.immer && jetzt >= z.warmBis) || istKalt(jetzt)) {
        await schaerfe($)
        return
    }
    // Eine Runde dazwischen hat den Cache schon gelesen und neu gestellt.
    if (jetzt - z.letzteAnfrage < pingAbstand() - 1000) {
        await schaerfe($)
        return
    }
    let antwort
    try {
        antwort = await $.model.fork({ prompt: PING_PROMPT })
    } catch (fehler) {
        await stoppe($, `der Ping ging schief (${fehler instanceof Error ? fehler.message : String(fehler)})`)
        return
    }
    if (antwort.isAnswered === false) {
        const grund =
            antwort.reason === 'nothing-to-fork'
                ? 'es gibt noch keinen Verlauf zum Warmhalten'
                : antwort.reason === 'api-error'
                  ? 'die API-Anfrage ging schief'
                  : antwort.reason === 'aborted'
                    ? 'der Ping wurde unterbrochen'
                    : 'der Ping kam ohne Antwort zurück'
        await stoppe($, grund)
        return
    }
    const u = antwort.usage
    const preis = preisVon(z.modell)
    // Ein warmer Ping liest den Verlauf und schreibt nur seine eigene Nachricht.
    const warm = u.cache_read_input_tokens > 0 && u.cache_creation_input_tokens < 0.1 * u.cache_read_input_tokens
    z.letzterPing = {
        at: jetzt,
        read: u.cache_read_input_tokens,
        write: u.cache_creation_input_tokens,
        usd: preis ? pingUsd(u, preis) : null,
    }
    z.pings += 1
    if (!warm) {
        await stoppe(
            $,
            `der Ping fand den Cache schon kalt vor (${kurz(u.cache_read_input_tokens)} gelesen, ${kurz(u.cache_creation_input_tokens)} neu geschrieben)`,
        )
        return
    }
    z.letzteAnfrage = jetzt
    await schaerfe($)
}

async function starteFenster($: EngineInterface, ms: number): Promise<void> {
    const jetzt = await $.clock.now()
    z.warmBis = jetzt + ms
    z.immer = false
    z.warmGrund = null
    await $.store.set(warmSchluessel(), z.warmBis)
    await schaerfe($)
}

/**
 * Warm ohne Ende, bis der Chat endet.
 *
 * Liegt unter dem Schluessel dieser Sitzung, damit es ein Neuladen des Moduls
 * uebersteht und nie in einen anderen Chat gelangt.
 */
async function starteImmer($: EngineInterface): Promise<void> {
    z.warmBis = 0
    z.immer = true
    z.warmGrund = null
    await $.store.set(warmSchluessel(), WARM_IMMER)
    await schaerfe($)
}

/**
 * Der Schalter in der Leiste: aus, 3 h, je Klick 3 h mehr bis hoechstens 12 h,
 * an der Grenze ohne Ende fuer diesen Chat, dann wieder aus.
 */
async function schalteWarmhalten($: EngineInterface): Promise<void> {
    const jetzt = await $.clock.now()
    if (z.immer) {
        await stoppe($, null)
        return
    }
    if (z.warmBis <= jetzt) {
        await starteFenster($, SCHRITT_MS)
        return
    }
    const rest = z.warmBis - jetzt
    if (rest > GRENZE_MS - GRENZE_TOLERANZ_MS) {
        await starteImmer($)
    } else {
        await starteFenster($, Math.min(rest + SCHRITT_MS, GRENZE_MS))
    }
}

/** Die eigene, abgelaufene Frist aus dem Speicher raeumen; fremde Sitzungen bleiben unberuehrt. */
async function raeumeAuf($: EngineInterface, jetzt: number): Promise<void> {
    const bis = await $.store.get(warmSchluessel())
    if (bis !== undefined && bis !== WARM_IMMER && !(typeof bis === 'number' && bis > jetzt)) {
        await $.store.delete(warmSchluessel())
    }
    // Abgelaufene Fristen anderer Chats, hoechstens einmal am Tag. "immer" und
    // laufende Fristen bleiben: der Chat kann fortgesetzt werden.
    const zuletzt = await $.store.get(SPEICHER_AUFGERAEUMT)
    if (typeof zuletzt === 'number' && jetzt - zuletzt < AUFRAEUMEN_ABSTAND_MS) {
        return
    }
    await $.store.set(SPEICHER_AUFGERAEUMT, jetzt)
    for (const schluessel of await $.store.keys()) {
        if (!schluessel.startsWith(`${SPEICHER_WARM_BIS}:`) || schluessel === warmSchluessel()) {
            continue
        }
        const frist = await $.store.get(schluessel)
        if (typeof frist === 'number' && frist <= jetzt) {
            await $.store.delete(schluessel)
        }
    }
}

// --- Compact ---

/**
 * Tokens und Zusammenfassung in den Verlauf schreiben.
 *
 * `$.ui.log` zeichnet dim wie eine Systemmeldung und schickt nichts an das
 * Modell.
 */
async function protokolliere(
    $: EngineInterface,
    r: { messages?: readonly { text: string }[]; tokensBefore?: number; tokensAfter?: number },
): Promise<void> {
    hookHatProtokolliert = true
    const vorher = r.tokensBefore
    const nachher = r.tokensAfter
    $.ui.log(
        vorher != null && nachher != null && vorher > 0
            ? `Compact: ${kurz(vorher)} auf ${kurz(nachher)} Tokens, ${Math.round((1 - nachher / vorher) * 100)} Prozent weniger`
            : 'Compact durchgelaufen, die Token-Zahlen hat die Engine nicht festgehalten',
    )
    const text = r.messages?.[0]?.text?.trim() ?? ''
    for (const stueck of text ? absaetze(text) : []) {
        $.ui.log(stueck)
    }
    await kontextNeu($)
    await zeige($)
}

/**
 * Verdichten anstossen, auf dem Weg, der hier moeglich ist.
 *
 * `$.session.compact()` geht nur im Terminal zwischen zwei Runden; sonst wird
 * `/compact` eingereiht und laeuft, sobald die Sitzung still ist. `wer` merkt
 * sich, welcher Knopf eingereiht hat: der zeigt die Sanduhr.
 */
async function verdichte(
    $: EngineInterface,
    istBeschaeftigt: boolean,
    flaeche: RenderSurface,
    schonEingereiht: boolean,
    wer: 'compact' | 'wischen',
): Promise<void> {
    if (schonEingereiht) {
        return
    }
    if (!istBeschaeftigt && flaeche === 'terminal') {
        try {
            hookHatProtokolliert = false
            const r = await $.session.compact()
            if (r.skip === undefined) {
                if (!hookHatProtokolliert) {
                    await protokolliere($, r)
                }
                return
            }
        } catch {
            // Dann eben eingereiht.
        }
    }
    await update($, eingereiht, () => wer)
    try {
        await $.command.run({ command: 'compact' })
    } catch {
        await update($, eingereiht, () => null)
    }
}

/**
 * Der Wisch-Knopf: Mit dem Leitstand speichert Claude erst einen Sicherungspunkt der
 * Arbeit und verdichtet dann so, dass er bleibt (/leitstand tidy). Fehlt der Leitstand,
 * tut es GlanceFlow, aus dem er hervorging (/glanceflow tidy). Ohne Leitstand und
 * GlanceFlow ein schlichtes /compact.
 */
async function wische($: EngineInterface, istBeschaeftigt: boolean, flaeche: RenderSurface, schonEingereiht: boolean): Promise<void> {
    if (schonEingereiht) {
        return
    }
    let aufraeumer: string | undefined
    try {
        const namen = (await $.command.list()).map(b => b.name)
        // Zuerst der Leitstand, sonst GlanceFlow; je unter eigenem Namen oder als Kopie eines Plugins.
        for (const mod of ['leitstand', 'glanceflow']) {
            aufraeumer = namen.find(name => name === mod || name.endsWith(`:${mod}`))
            if (aufraeumer !== undefined) {
                break
            }
        }
    } catch {
        aufraeumer = undefined
    }
    if (aufraeumer !== undefined) {
        try {
            await $.command.run({ command: aufraeumer, args: 'tidy' })
            return
        } catch {
            // Dann eben schlicht verdichten.
        }
    }
    await verdichte($, istBeschaeftigt, flaeche, schonEingereiht, 'wischen')
}

// --- Countdown vor Schwamm und Pfeil ---
// Ein Druck handelt nicht sofort: Erst laufen zehn Sekunden herunter, die sich
// abbrechen lassen. Danach laeuft die Aktion mit dem Stand von dann.

/** Den Takt anhalten, ohne die Anzeige zu aendern. */
function stoppeLauf(): void {
    lauf?.takt.cancel()
    lauf = null
}

/** Den Countdown abbrechen, wenn einer laeuft. */
async function brichCountdownAb($: EngineInterface): Promise<void> {
    if (!lauf) {
        return
    }
    stoppeLauf()
    await update($, countdown, () => null)
    $.ui.toast('Abgebrochen.')
}

/**
 * Ein Druck auf Schwamm oder Pfeil.
 *
 * Laeuft schon ein Countdown, bricht derselbe Knopf ihn ab; der andere tut nichts
 * und sagt das. Ist schon etwas eingereiht, geht es weiter wie ohne Countdown.
 */
async function drueckeMitCountdown(
    $: EngineInterface,
    was: Countdown['was'],
    istBeschaeftigt: boolean,
    flaeche: RenderSurface,
    schonEingereiht: boolean,
): Promise<void> {
    const laufend = lauf ? await read($, countdown) : null
    if (laufend) {
        if (laufend.was === was) {
            await brichCountdownAb($)
        } else {
            $.ui.toast('Erst abbrechen oder abwarten.')
        }
        return
    }
    if (schonEingereiht) {
        await (was === 'wischen'
            ? wische($, istBeschaeftigt, flaeche, true)
            : verdichte($, istBeschaeftigt, flaeche, true, 'compact'))
        return
    }
    stoppeLauf()
    const jetzt = await $.clock.now()
    await update($, countdown, () => ({ was, bis: jetzt + COUNTDOWN_MS }))
    const takt = $.clock.every(1000, () => void ticke($, takt).catch(() => {}))
    lauf = { takt, flaeche }
    $.ui.toast(
        was === 'wischen'
            ? 'Der Chat wird in 10 Sekunden aufgeräumt. Abbrechen stoppt das.'
            : 'Der Kontext wird in 10 Sekunden verdichtet. Abbrechen stoppt das.',
    )
}

/**
 * Ein Schlag des Countdowns: neu zeichnen, und am Ende die Aktion ausfuehren.
 *
 * Flaeche und Arbeit kommen aus dem letzten Render, ob etwas eingereiht ist,
 * frisch aus `$.state`: der Stand zum Ablauf, nicht der beim Druck.
 */
async function ticke($: EngineInterface, takt: { cancel: () => void }): Promise<void> {
    if (lauf?.takt !== takt) {
        takt.cancel()
        return
    }
    const c = await read($, countdown)
    const jetzt = await $.clock.now()
    // Waehrend des Lesens abgebrochen oder ersetzt: dann nichts mehr tun.
    if (lauf?.takt !== takt) {
        return
    }
    if (!c) {
        stoppeLauf()
        return
    }
    if (jetzt < c.bis) {
        await update($, tick, n => n + 1)
        return
    }
    const flaeche = lauf.flaeche
    stoppeLauf()
    await update($, countdown, () => null)
    const istBeschaeftigt = zuletztBeschaeftigt.get(flaeche) ?? false
    const schonEingereiht = (await read($, eingereiht)) !== null
    if (c.was === 'wischen') {
        await wische($, istBeschaeftigt, flaeche, schonEingereiht)
    } else {
        await verdichte($, istBeschaeftigt, flaeche, schonEingereiht, 'compact')
    }
}

// --- /statistik ---

const QUELLE_KURZ: Record<CacheSample['ttlSource'], string> = {
    gemeldet: 'gemeldet',
    gemessen: 'gemessen',
    konfiguriert: 'eingestellt',
    geraten: 'angenommen',
}

export function karte(jetzt: number, c: CacheSample | null, k: ContextSample | null, n: Nutzung): string {
    const preis = preisVon(z.modell)
    const laufzeit = Math.round(z.laufzeitMs / 60_000)
    const zeilen: string[] = []
    zeilen.push(`Modell        ${z.modell ?? 'noch keins gesehen'}`)
    const zustand = z.kompaktiert
        ? 'nach Compact neu, wartet auf die nächste Runde'
        : !z.letzteAnfrage
          ? 'noch keine Anfrage in dieser Sitzung'
          : istKalt(jetzt)
            ? `kalt, letzte Anfrage vor ${dauer(jetzt - z.letzteAnfrage)}`
            : `warm, noch ${dauer(z.letzteAnfrage + z.laufzeitMs - jetzt)}`
    zeilen.push(`Cache         ${zustand}`)
    zeilen.push(`Laufzeit      ${laufzeit} min${c ? ` (${QUELLE_KURZ[c.ttlSource]})` : ''}`)
    zeilen.push(`Treffer       ${c?.hitPercent == null ? 'unbekannt' : `${c.hitPercent} % bei der letzten Antwort`}`)
    if (k && k.window > 0) {
        zeilen.push(
            `Kontext       ${prozent((k.tokens / k.window) * 100)} % (${kurz(k.tokens)} von ${kurz(k.window)} Tokens), ` +
                `Compact bei ${prozent((k.threshold / k.window) * 100)} %`,
        )
    } else {
        zeilen.push('Kontext       unbekannt')
    }
    zeilen.push(
        `Kalt kostet   bis zu ${dollar(preis ? (z.ctx * preis[1]) / 1e6 : null)} fürs Neuschreiben, ` +
            `warm ${dollar(preis ? (z.ctx * preis[0]) / 1e6 : null)}`,
    )
    const naechster = z.naechsterPing > jetzt ? `, nächster Ping in ${dauer(z.naechsterPing - jetzt)}` : ''
    zeilen.push(
        `Warmhalten    ${
            z.immer
                ? `an, ohne Ende in diesem Chat${naechster}`
                : z.warmBis > jetzt
                  ? `an, noch ${dauer(z.warmBis - jetzt)}${naechster}`
                  : z.warmGrund
                    ? `aus, ${z.warmGrund}`
                    : 'aus'
        }`,
    )
    if (preis && z.ctx > 0) {
        const n = Math.floor(preis[1] / preis[0])
        zeilen.push(
            `Lohnt bis     ${n} Pings kosten so viel wie einmal kalt neu schreiben, ` +
                `bei einem Ping alle ${dauer(pingAbstand())} also etwa ${dauer(n * pingAbstand())} Pause`,
        )
    }
    zeilen.push(
        `Pings         ${z.pings} in dieser Sitzung` +
            (z.letzterPing ? `, der letzte las ${kurz(z.letzterPing.read)} Tokens für ${dollar(z.letzterPing.usd)}` : ''),
    )
    const bezahlt = z.neuschriebe.reduce((a, n) => a + (n.usd ?? 0), 0)
    zeilen.push(`Kalt bezahlt  ${z.neuschriebe.length}x in dieser Sitzung, ${dollar(bezahlt)}`)
    if (n.sl || n.wl || n.fl) {
        const teile: string[] = []
        if (n.sl) {
            teile.push(limitText('SL', n.sl, jetzt, false))
        }
        if (n.istFable && n.fl) {
            teile.push(limitText('FL', n.fl, jetzt, n.fl.bis != null && weitWeg(n.fl.bis, jetzt)))
        }
        if (n.wl) {
            teile.push(limitText('WL', n.wl, jetzt, true))
        }
        zeilen.push(`Limits        ${teile.join(', ')}`)
    }
    if (n.istFable && z.fableFehler) {
        zeilen.push(`Fable-Limit   nicht abrufbar: ${z.fableFehler}`)
    }
    return zeilen.join('\n')
}

/** Wie die Engine eine Befehlsantwort beginnt: die Namen der Mods, die den Befehl hooken, mit + verbunden. */
const VORSATZ = /^(<local-command-stdout>)([a-z0-9-]+(?:\+[a-z0-9-]+)*): /
/** Steht statt des Vorsatzes am Ende einer Antwort der Statistik. */
export const GEMELDET = '(gemeldet vom Mod Statistik)'

/**
 * Die gespeicherte Zeile einer Befehlsantwort ohne `name` im Vorsatz; andere Namen bleiben stehen.
 *
 * Mit `gemeldet` steht am Ende, von wem die Antwort kommt: nach einer Zeile mit
 * Leerzeichen, nach mehreren in einer eigenen letzten Zeile.
 */
export function ohneVorsatz(text: string, name: string, gemeldet: string | null): string {
    const m = VORSATZ.exec(text)
    const namen = m?.[2]?.split('+') ?? []
    if (!m || !namen.includes(name)) {
        return text
    }
    const rest = namen.filter(n => n !== name)
    const kopf = (m[1] ?? '') + (rest.length > 0 ? `${rest.join('+')}: ` : '')
    const rumpf = text.slice(m[0].length)
    if (gemeldet === null) {
        return kopf + rumpf
    }
    const ende = rumpf.lastIndexOf('</local-command-stdout>')
    const innen = ende < 0 ? rumpf : rumpf.slice(0, ende)
    const kern = innen.trimEnd()
    const schluss = innen.slice(kern.length) + (ende < 0 ? '' : rumpf.slice(ende))
    return kopf + kern + (kern.includes('\n') ? '\n' : ' ') + gemeldet + schluss
}

// --- Befehle mit Hilfe ---

/** Warmhalten fuer `ms`, wie /warmhalten mit Dauer; zurueck kommt die Antwort. */
async function warmFenster($: EngineInterface, ms: number): Promise<string> {
    const jetzt = await $.clock.now()
    await starteFenster($, ms)
    return istKalt(jetzt)
        ? `Warmhalten an für ${dauer(ms)}. Der Cache ist gerade kalt; gepingt wird ab der nächsten Antwort.`
        : `Warmhalten an für ${dauer(ms)}. Kurz vor jedem Ablauf hält ein Ping den Cache warm.`
}

/** /statistik-warmhalten-an: ohne Angabe 6 h wie /warmhalten, sonst die Dauer. */
async function warmhaltenAn($: EngineInterface, args: string): Promise<string> {
    const wort = args.trim().toLowerCase()
    const ms = wort === '' ? FENSTER_MS : leseDauer(wort)
    if (ms == null) {
        return '/statistik-warmhalten-an nimmt eine Dauer wie 3h, 90m oder 1h30m; ohne Angabe sind es 6 h.'
    }
    return warmFenster($, ms)
}

/** /statistik-warmhalten-immer: warm ohne Ende in diesem Chat. */
async function warmhaltenImmer($: EngineInterface): Promise<string> {
    const jetzt = await $.clock.now()
    await starteImmer($)
    return istKalt(jetzt)
        ? 'Warmhalten an, ohne Ende in diesem Chat. Der Cache ist gerade kalt; gepingt wird ab der nächsten Antwort.'
        : 'Warmhalten an, ohne Ende in diesem Chat.'
}

/** /statistik-warmhalten-aus: wie das Kreuz neben dem Schalter. */
async function warmhaltenAus($: EngineInterface): Promise<string> {
    await stoppe($, null)
    return 'Warmhalten ist aus.'
}

/**
 * Schwamm oder Pfeil als Befehl, ohne Countdown: Ein getippter Befehl ist kein Versehen.
 *
 * Laeuft gerade ein Countdown von einem Knopf, endet er, damit nichts zweimal geschieht.
 * Flaeche und Arbeit kommen aus der letzten Zeichnung der Leiste, wie beim Ablauf des
 * Countdowns; ohne Leiste wird /compact eingereiht. Die Aktion laeuft nach der Antwort.
 */
async function sofort($: EngineInterface, was: Countdown['was']): Promise<string> {
    if (lauf) {
        stoppeLauf()
        await update($, countdown, () => null)
    }
    if ((await read($, eingereiht)) !== null) {
        return 'Es wartet schon ein Verdichten; es läuft, sobald Claude fertig ist.'
    }
    const flaeche = zuletztFlaeche ?? 'desktop'
    const istBeschaeftigt = zuletztBeschaeftigt.get(flaeche) ?? false
    if (was === 'wischen') {
        $.clock.after(0, () => void wische($, istBeschaeftigt, flaeche, false).catch(() => {}))
        return 'Der Chat wird jetzt aufgeräumt.'
    }
    $.clock.after(0, () => void verdichte($, istBeschaeftigt, flaeche, false, 'compact').catch(() => {}))
    return 'Der Kontext wird jetzt verdichtet.'
}

/** Wie 📊: /context nach der Antwort; vom Handy statt der Anzeige eine Zeile Text. */
async function kontextBefehl($: EngineInterface, vomHandy: boolean): Promise<string> {
    if (vomHandy) {
        const k = await messeKontext($)
        const zeile =
            k && k.window > 0
                ? `Kontext: ${kurz(k.tokens)} von ${kurz(k.window)} Tokens belegt (${Math.round((k.tokens / k.window) * 100)} %), verdichtet wird bei ${kurz(k.threshold)}.`
                : 'Den Kontext konnte ich gerade nicht messen.'
        return `${zeile} Die ausführliche Kontext-Anzeige gibt es nur am Rechner.`
    }
    $.clock.after(0, () => void zeigeKontext($).catch(() => {}))
    return 'Die Kontext-Anzeige (/context) geht gleich auf.'
}

/** Ein Befehl des Mods mit allem, was seine Hilfe sagt. */
export type Befehl = {
    name: string
    /** Die eine Zeile in der Befehlsliste. */
    description: string
    argumentHint?: string
    /** Was er tut. */
    was: string
    /** Welchem Knopf er entspricht. */
    knopf: string
    /** Wo er gilt. */
    gilt: string
    argumente: string
    beispiel: string
}

/** Die Befehle aus der Zeit vor den Einzelbefehlen; sie bleiben als Kurzform. */
const KURZFORMEN: readonly { name: string; description: string }[] = [
    { name: 'statistik', description: 'Cache, Kontext, Kosten und Warmhalten im Überblick (Kurzform)' },
    { name: 'warmhalten', description: 'Warmhalten mit Dauer, immer, aus oder status (Kurzform)' },
]

export const BEFEHLE: readonly Befehl[] = [
    {
        name: 'statistik-hilfe',
        description: 'Alle Befehle der Statistik mit einer Zeile Erklärung (Statistik)',
        was: 'Listet alle Befehle der Statistik mit einer Zeile Erklärung.',
        knopf: 'keiner',
        gilt: 'zeigt nur Text, ändert nichts',
        argumente: 'keine; hilfe oder ? erklärt diesen Befehl',
        beispiel: '/statistik-hilfe',
    },
    {
        name: 'statistik-zeigen',
        description: 'Cache, Kontext, Kosten und Warmhalten dieser Sitzung im Überblick, wie /statistik (Statistik)',
        was: 'Zeigt Modell, Cache, Kontext, Kosten, Nutzungslimits und Warmhalten dieser Sitzung als Text, wie /statistik.',
        knopf: 'keiner; dasselbe wie /statistik',
        gilt: 'für diesen Chat; ändert nichts',
        argumente: 'keine',
        beispiel: '/statistik-zeigen',
    },
    {
        name: 'statistik-kontext-zeigen',
        description: 'Den Kontext im Detail zeigen: /context, die Anzeige der App (Statistik)',
        was: 'Öffnet die Kontext-Anzeige über /context, sobald die Sitzung still ist. Vom Handy kommt stattdessen eine Zeile mit belegtem Kontext und Schwelle.',
        knopf: '📊 in der Statistik-Leiste',
        gilt: 'für diesen Chat; ändert nichts',
        argumente: 'keine',
        beispiel: '/statistik-kontext-zeigen',
    },
    {
        name: 'statistik-warmhalten-an',
        description: 'Prompt-Cache warm halten, ohne Angabe 6 h, sonst so lange wie angegeben (Statistik)',
        argumentHint: '[Dauer, z. B. 3h oder 90m]',
        was: 'Hält den Prompt-Cache warm: Kurz vor jedem Ablauf stellt ein Ping eine winzige Anfrage. Ohne Angabe 6 h wie /warmhalten, sonst die angegebene Dauer.',
        knopf: '🔥 bzw. ❄️ in der Statistik-Leiste; der Knopf legt je Druck 3 h drauf',
        gilt: 'nur in diesem Chat',
        argumente: 'eine Dauer wie 3h, 90m oder 1h30m; ohne Angabe 6 h',
        beispiel: '/statistik-warmhalten-an 3h',
    },
    {
        name: 'statistik-warmhalten-immer',
        description: 'Prompt-Cache ohne Ende warm halten, bis dieser Chat endet (Statistik)',
        was: 'Hält den Prompt-Cache ohne Ende warm, bis der Chat endet.',
        knopf: '🔥 in der Statistik-Leiste, bei 12:00 noch einmal gedrückt',
        gilt: 'nur in diesem Chat, bis er endet',
        argumente: 'keine',
        beispiel: '/statistik-warmhalten-immer',
    },
    {
        name: 'statistik-warmhalten-aus',
        description: 'Warmhalten des Prompt-Caches sofort ausschalten (Statistik)',
        was: 'Schaltet das Warmhalten sofort aus, ob mit Frist oder ohne Ende.',
        knopf: '✖️ neben dem Warmhalten-Schalter',
        gilt: 'nur in diesem Chat',
        argumente: 'keine',
        beispiel: '/statistik-warmhalten-aus',
    },
    {
        name: 'statistik-chat-aufraeumen',
        description: 'Den Chat aufräumen: Sicherungspunkt und Verdichten, sofort ohne Countdown (Statistik)',
        was: 'Räumt den Chat auf: mit dem Leitstand über /leitstand tidy (erst ein Sicherungspunkt der Arbeit, dann verdichten), sonst mit GlanceFlow über /glanceflow tidy, sonst ein schlichtes /compact. Sofort, ohne Countdown; ein laufender Countdown endet dabei.',
        knopf: '🧽 neben der Chatlänge, aber ohne die zehn Sekunden Countdown',
        gilt: 'für diesen Chat',
        argumente: 'keine',
        beispiel: '/statistik-chat-aufraeumen',
    },
    {
        name: 'statistik-verdichten',
        description: 'Den Kontext verdichten (/compact), sofort ohne Countdown (Statistik)',
        was: 'Verdichtet den Kontext mit /compact, zwischen zwei Runden sofort, sonst sobald Claude fertig ist. Ohne Countdown; ein laufender Countdown endet dabei.',
        knopf: '🔻 am Kontext, aber ohne die zehn Sekunden Countdown',
        gilt: 'für diesen Chat',
        argumente: 'keine',
        beispiel: '/statistik-verdichten',
    },
]

/** Ob das Argument nach der Hilfe fragt: hilfe oder ?. */
export function istHilfe(args: string): boolean {
    const a = args.trim().toLowerCase()
    return a === 'hilfe' || a === '?'
}

/** Die Hilfe eines Befehls: was er tut, welcher Knopf, wo er gilt, Argumente, Beispiel. */
export function hilfeText(b: Befehl): string {
    return [`/${b.name}: ${b.was}`, `Knopf: ${b.knopf}`, `Gilt: ${b.gilt}`, `Argumente: ${b.argumente}`, `Beispiel: ${b.beispiel}`].join('\n')
}

/** Was ein Befehl sagt, wenn er scheitert. */
export function fehlerText(name: string): string {
    return `/${name} hat nicht geklappt. Versuch es gleich noch einmal.`
}

/** Alle Befehle des Mods, je eine Zeile. */
export function uebersicht(): string {
    const zeilen = [...BEFEHLE.map(b => ({ name: b.name, description: b.description.replace(/ \(Statistik\)$/, '') })), ...KURZFORMEN]
    return ['Befehle der Statistik (jeder versteht hilfe oder ? als Argument):', ...zeilen.map(z => `/${z.name}: ${z.description}`)].join('\n')
}

/** Was ein Befehl tut; zurueck kommt die Antwort. */
async function wirke($: EngineInterface, name: string, args: string, vomHandy: boolean): Promise<string> {
    switch (name) {
        case 'statistik-hilfe':
            return uebersicht()
        case 'statistik-zeigen':
            return karte(await $.clock.now(), await read($, cache), await read($, context), await read($, nutzung))
        case 'statistik-kontext-zeigen':
            return kontextBefehl($, vomHandy)
        case 'statistik-warmhalten-an':
            return warmhaltenAn($, args)
        case 'statistik-warmhalten-immer':
            return warmhaltenImmer($)
        case 'statistik-warmhalten-aus':
            return warmhaltenAus($)
        case 'statistik-chat-aufraeumen':
            return sofort($, 'wischen')
        case 'statistik-verdichten':
            return sofort($, 'compact')
        default:
            throw new Error(`kein Befehl ${name}`)
    }
}

export const register: Register = (on, options) => {
    z.gewaehlt = String(options.cacheLaufzeit ?? 'auto')

    on('session.start', async ($, e, next) => {
        const r = await next(e)
        z.hatLeiste = e.surface === 'terminal' || e.surface === 'desktop'
        z.sid = await $.session.id()
        const jetzt = await $.clock.now()
        await raeumeAuf($, jetzt)
        // Warmhalten gilt nur fuer den Chat, in dem es eingeschaltet wurde: die
        // Frist oder "immer" unter dem Schluessel dieser Sitzung.
        const bis = await $.store.get(warmSchluessel())
        z.immer = bis === WARM_IMMER
        z.warmBis = !z.immer && typeof bis === 'number' && bis > jetzt ? bis : 0
        // Eine alte Einstellung liess jede Sitzung warm beginnen; sie gilt nicht mehr.
        if ((await $.store.get(SPEICHER_IMMER)) !== undefined) {
            await $.store.delete(SPEICHER_IMMER)
        }
        const { minuten } = await laufzeitBeimStart($)
        z.laufzeitMs = minuten * 60_000

        // Ein Countdown aus der Zeit vor einem Neuladen gilt als abgebrochen: sein
        // Takt ist mit dem alten Modul weg, und ausgefuehrt wird nichts mehr.
        stoppeLauf()
        await update($, countdown, () => null)

        // Ein Neuladen des Mods (/reload-plugins, ein Update) beginnt das Modul von
        // vorn, die Sitzung laeuft aber weiter. Was `lage` in `$.state` noch weiss,
        // gilt also: sonst stuende die Uhr bis zur naechsten Antwort auf "–",
        // obwohl der Cache warm ist. Eine neue Sitzung hat hier nur Nullen.
        const vorher = await read($, lage)
        if (z.letzteAnfrage === 0 && vorher.letzteAnfrage > 0) {
            z.letzteAnfrage = vorher.letzteAnfrage
            z.kompaktiert = vorher.istKompaktiert
            z.nachVerdichtung = vorher.istKompaktiert
            z.ctx = vorher.ctx
        }
        const probe = await read($, cache)
        if (probe && (probe.ttlSource === 'gemeldet' || probe.ttlSource === 'gemessen')) {
            z.laufzeitMs = probe.ttlMinutes * 60_000
        }

        await kontextNeu($)
        await chatNeu($)
        try {
            z.modell = z.modell ?? (await $.session.model())
        } catch {
            // Das Modell kommt dann mit der ersten Antwort.
        }
        void fableNeu($).catch(() => {})

        // Die Desktop-App holt ihre Befehlsliste, bevor dieser Hook laeuft. Damit
        // die Befehle als erste Nachricht nicht als unbekannt gelten, liegen
        // gleichnamige Befehlsdateien in ~/.claude/commands; den Lauf beantwortet
        // trotzdem dieser Mod.
        await $.command
            .register({
                name: 'warmhalten',
                description: 'Prompt-Cache warm halten: ohne Angabe 6 h, eine Dauer wie 90m, immer, aus oder status (Statistik)',
                argumentHint: '[6h | 90m | immer | aus | status]',
                immediate: true,
            })
            .catch(() => {})
        await $.command
            .register({
                name: 'statistik',
                description: 'Cache, Kontext, Kosten und Warmhalten dieser Sitzung im Überblick (Statistik)',
                immediate: true,
            })
            .catch(() => {})
        // Je Knopf ein eigener Befehl, dazu die Hilfe.
        for (const b of BEFEHLE) {
            await $.command
                .register({
                    name: b.name,
                    description: b.description,
                    ...(b.argumentHint ? { argumentHint: b.argumentHint } : {}),
                    immediate: true,
                })
                .catch(() => {})
        }

        // Jede Minute neu zeichnen: die Uhr laeuft mit der Zeit ab, ohne Ereignis.
        $.clock.every(60_000, () => {
            void update($, tick, n => n + 1)
        })

        await schaerfe($)
        return r
    })

    // Fortgesetzte Sitzung oder /clear: den Stand daraus uebernehmen, still.
    on('classic.SessionStart', async ($, e, next) => {
        const r = await next(e)
        const jetzt = await $.clock.now()
        if (e.source === 'clear') {
            await stoppe($, null)
            z.ctx = 0
            z.letzteAnfrage = 0
            z.kompaktiert = false
            z.nachVerdichtung = false
            z.neuschriebe = []
            z.sid = await $.session.id()
            await update($, cache, () => null)
            await kontextNeu($)
            await zeige($)
            return r
        }
        if (e.source === 'resume' || e.source === 'fork') {
            if (typeof e.context_tokens === 'number' && e.context_tokens > 0) {
                z.ctx = e.context_tokens
            }
            if (typeof e.seconds_since_last_response === 'number') {
                z.letzteAnfrage = jetzt - e.seconds_since_last_response * 1000
            }
            if (typeof e.model === 'string') {
                z.modell = e.model
            }
            z.kompaktiert = false
            z.nachVerdichtung = false
        }
        if (!z.modell) {
            z.modell = await $.session.model()
        }
        await schaerfe($)
        return r
    }).catch(($, e, next) => next(e))

    // Die Laufzeit uebernehmen, wenn die Sitzung sie beim Modellwechsel selbst nennt.
    on('classic.PostModelSwitch', async ($, e, next) => {
        const minuten = e.cache_ttl === '5m' ? 5 : 60
        z.laufzeitMs = minuten * 60_000
        await $.store.set(SPEICHER_LAUFZEIT, minuten)
        await $.store.set(SPEICHER_QUELLE, 'gemeldet')
        await update($, cache, c => (c ? { ...c, ttlMinutes: minuten, ttlSource: 'gemeldet' as const } : c))
        await schaerfe($)
        const r = await next(e)
        // Nach dem Wechsel gilt das neue Modell: FL ein- oder ausblenden.
        try {
            z.modell = await $.session.model()
        } catch {
            // Dann mit der naechsten Antwort.
        }
        void fableNeu($, true).catch(() => {})
        return r
    }).catch(($, e, next) => next(e))

    on('turn.start', async ($, e, next) => {
        if (!e.agentId) {
            // Nach /clear laeuft der Chat unter einer neuen ID weiter, ohne neuen
            // Sitzungsstart: die ID hier auffrischen, sonst landet Warmhalten beim alten Chat.
            z.sid = await $.session.id()
            z.vorRunde = z.letzteAnfrage
            z.rundeBeginn = await $.clock.now()
        }
        return next(e)
    })

    // Jede Anfrage der Hauptschleife liest den Cache und stellt seine Uhr neu.
    on('turn.step', async function* ($, e, next) {
        if (!e.agentId) {
            const jetzt = await $.clock.now()
            z.letzteAnfrage = jetzt
            // Die erste Anfrage nach einer Verdichtung schreibt den Cache neu: Ab hier
            // laeuft die Uhr, sofort in der Leiste. Sonst schreibt ein Schritt die Lage
            // hoechstens alle 30 Sekunden, damit lange Runden die Leiste nicht staendig
            // neu zeichnen. Die Messung in turn.complete liest `nachVerdichtung`.
            if (z.kompaktiert) {
                z.kompaktiert = false
                z.lageAmSchritt = jetzt
                await zeige($)
            } else if (jetzt - z.lageAmSchritt >= 30_000) {
                z.lageAmSchritt = jetzt
                await zeige($)
            }
        }
        yield* next(e)
    })

    on('turn.complete', async ($, e, next) => {
        const r = await next(e)
        if (e.agentId) {
            return r
        }
        const jetzt = await $.clock.now()
        if (z.warmBis && jetzt >= z.warmBis) {
            await stoppe($, null)
        }
        // turn.step stempelt die genaue Zeit; hat keine Anfrage gestempelt, gilt das Rundenende.
        if (jetzt - z.letzteAnfrage > e.durationMs) {
            z.letzteAnfrage = jetzt
        }
        const warKompaktiert = z.nachVerdichtung
        z.nachVerdichtung = false
        z.kompaktiert = false

        const u = e.usage
        if (u?.model) {
            z.modell = u.model
        }
        const eingabe = u ? u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens : 0
        const treffer = u && eingabe > 0 ? Math.round((u.cache_read_input_tokens / eingabe) * 100) : null
        const vorher = z.ctx
        const schrieb = u?.cache_creation_input_tokens ?? 0
        const kaltGeschrieben = vorher > KONTEXT_BELEG && schrieb >= 0.5 * vorher

        // Laufzeit: Gemeldetes vor Gemessenem vor Einstellung vor Annahme.
        let { minuten, quelle } = await laufzeitBeimStart($)
        // Ein Treffer nach mehr als fuenf Minuten Pause, ohne den Verlauf neu zu
        // schreiben, geht nur mit einer Stunde Laufzeit. Am Neuschrieb gemessen,
        // nicht an der Trefferquote: in einer Runde mit vielen Schritten lesen
        // die spaeteren den frisch geschriebenen Cache und heben die Quote.
        const pause = z.vorRunde > 0 && z.rundeBeginn > 0 ? (z.rundeBeginn - z.vorRunde) / 60_000 : 0
        if (
            quelle !== 'gemeldet' &&
            !(quelle === 'gemessen' && minuten === 60) &&
            !warKompaktiert &&
            pause > 5.5 &&
            treffer != null &&
            treffer >= TREFFER_BELEG &&
            vorher > KONTEXT_BELEG &&
            !kaltGeschrieben
        ) {
            minuten = 60
            quelle = 'gemessen'
            await $.store.set(SPEICHER_LAUFZEIT, 60)
            await $.store.set(SPEICHER_QUELLE, 'gemessen')
        }
        z.laufzeitMs = minuten * 60_000

        // Kalte Neuschriebe zaehlen, fuer /statistik. Ohne Meldung.
        if (u && kaltGeschrieben && !warKompaktiert) {
            const preis = preisVon(z.modell)
            z.neuschriebe.push({ at: jetzt, tokens: schrieb, usd: preis ? (schrieb * preis[1]) / 1e6 : null })
        }

        const probe: CacheSample = {
            hitPercent: treffer,
            inputTokens: u ? eingabe : null,
            cacheReadTokens: u ? u.cache_read_input_tokens : null,
            ttlMinutes: minuten,
            ttlSource: quelle,
        }
        await update($, cache, () => probe)
        await kontextNeu($)
        await chatNeu($)
        if (!u) {
            // Ohne Token-Zahlen bleibt die letzte Kontextmessung stehen.
        } else if (z.ctx <= 0) {
            z.ctx = eingabe
        }
        await schaerfe($)
        // Im Hintergrund: die Runde wartet nicht auf den Endpunkt.
        void fableNeu($).catch(() => {})
        return r
    })

    // Sitzungs- und Wochenlimit, sobald sich ein Fenster um einen ganzen Punkt bewegt.
    on('session.measure', async ($, e, next) => {
        if (e.changed.includes('rateLimits')) {
            await setzeLimits($, e.rateLimits)
        }
        return next(e)
    }).catch(($, e, next) => next(e))

    on('session.compact', async ($, e, next) => {
        const r = await next(e)
        if (r.skip !== undefined || e.agentId) {
            return r
        }
        z.kompaktiert = true
        z.nachVerdichtung = true
        await update($, eingereiht, () => null)
        await protokolliere($, r)
        await chatNeu($)
        await schaerfe($)
        return r
    }).catch(($, e, next) => next(e))

    // Die Engine setzt die Namen der Mods vor jede Befehlsantwort. Dieser Mod streicht in der
    // gespeicherten Zeile seinen und sagt stattdessen am Ende, dass die Antwort von ihm kommt.
    on('session.append', { door: 'command', message: { type: 'system', name: 'local_command' } }, async ($, e, next) => {
        const content = e.message.content.map(b => (b.type === 'text' && typeof b.text === 'string' ? { ...b, text: ohneVorsatz(b.text, 'statistik', GEMELDET) } : b))
        return next({ ...e, message: { ...e.message, content } })
    }).catch(($, e, next) => next(e))

    on('command.run', { command: 'warmhalten' }, async ($, e) => {
        const wort = String(e.args ?? '')
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean)[0]
        const jetzt = await $.clock.now()
        if (wort === 'aus') {
            await stoppe($, null)
            return { text: 'Warmhalten ist aus.' }
        }
        if (wort === 'status') {
            return {
                text: z.immer
                    ? 'Warmhalten an, ohne Ende in diesem Chat.'
                    : z.warmBis > jetzt
                      ? `Warmhalten an, noch ${dauer(z.warmBis - jetzt)}.`
                      : z.warmGrund
                        ? `Warmhalten aus: ${z.warmGrund}.`
                        : 'Warmhalten ist aus.',
            }
        }
        if (wort === 'immer') {
            await starteImmer($)
            return {
                text: istKalt(jetzt)
                    ? 'Warmhalten an, ohne Ende in diesem Chat. Der Cache ist gerade kalt; gepingt wird ab der nächsten Antwort. /warmhalten aus schaltet es ab.'
                    : 'Warmhalten an, ohne Ende in diesem Chat. /warmhalten aus schaltet es ab.',
            }
        }
        const ms = wort === undefined || wort === 'an' ? FENSTER_MS : leseDauer(wort)
        if (ms == null) {
            return { text: '/warmhalten nimmt eine Dauer wie 90m oder 2h, oder immer, aus oder status.' }
        }
        await starteFenster($, ms)
        return {
            text: istKalt(jetzt)
                ? `Warmhalten an für ${dauer(ms)}. Der Cache ist gerade kalt; gepingt wird ab der nächsten Antwort.`
                : `Warmhalten an für ${dauer(ms)}. Kurz vor jedem Ablauf hält ein Ping den Cache warm.`,
        }
    })

    on('command.run', { command: 'statistik' }, async $ => {
        const jetzt = await $.clock.now()
        return { text: karte(jetzt, await read($, cache), await read($, context), await read($, nutzung)) }
    })

    // Die Einzelbefehle: jeder versteht hilfe und ?, und ein Fehler wird ein schlichter Satz.
    for (const b of BEFEHLE) {
        on('command.run', { command: b.name }, async ($, e) => {
            if (istHilfe(e.args)) {
                return { text: hilfeText(b) }
            }
            try {
                // Vom Handy (Remote Control) geht keine Anzeige auf.
                const vomHandy = (e.origin as { kind?: string } | undefined)?.kind === 'bridge'
                return { text: await wirke($, b.name, e.args, vomHandy) }
            } catch {
                return { text: fehlerText(b.name) }
            }
        }).catch(() => ({ text: fehlerText(b.name) }))
    }

    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
        if (e.props.hasSurvey) {
            return next(e)
        }
        // Erst die Mods darunter zeichnen lassen; die eigene Zeile bleibt dicht am Eingabefeld.
        const rest = await next(e)

        const c = await read($, cache)
        const k = await read($, context)
        const l = await read($, lage)
        const wartet = await read($, eingereiht)
        const chat = await read($, chatlaenge)
        // Ein Countdown ohne eigenen Takt stammt aus einem frueheren Laden: abgebrochen.
        const cdGelesen = await read($, countdown)
        const cd = lauf ? cdGelesen : null
        void (await read($, tick))
        zuletztBeschaeftigt.set(e.surface, e.props.isWorking)
        zuletztFlaeche = e.surface

        const elemente = $.ui.resolve(e)
        const { Box, Button, Text } = elemente
        // Bilder mit Tooltip nur in der Desktop-App. Das Terminal fuehrt Svg zwar
        // in seiner Tabelle, zeichnet es aber nicht; dort stehen Zeichen.
        const Svg = e.surface === 'desktop' && 'Svg' in elemente ? elemente.Svg : null
        const bild = (schluessel: string, quelle: string, titel: string) =>
            Svg ? (
                <Box key={schluessel}>
                    <Svg source={quelle} alt={titel} width={14} height={14} isInteractive />
                </Box>
            ) : null

        const jetzt = await $.clock.now()

        // --- Cache-Uhr ---
        const laufzeit = c?.ttlMinutes ?? 60
        const hatUhr = l.letzteAnfrage > 0 && !l.istKompaktiert
        const verstrichen = hatUhr ? (jetzt - l.letzteAnfrage) / 60_000 : 0
        const restMinuten = hatUhr ? Math.max(0, laufzeit - verstrichen) : null
        const anteil = restMinuten == null ? null : laufzeit > 0 ? restMinuten / laufzeit : 0
        const farbe = anteil == null ? 'subtle' : anteil <= 0.1 ? 'error' : anteil <= 0.25 ? 'warning' : 'success'
        const restText =
            restMinuten == null ? 'Cache leer' : `${Math.ceil(restMinuten)} min${c?.ttlSource === 'geraten' ? '?' : ''}`
        // Warm oder kalt: Ist die Laufzeit um, ist der Cache kalt. Ohne Anfrage ist er leer,
        // und die naechste Nachricht schreibt ihn ganz neu, wie bei kalt.
        const kalt = hatUhr && verstrichen >= laufzeit
        // Der Tooltip der Uhr sagt auch, was warm oder kalt kostet und wie es ums
        // Warmhalten steht: Der Schalter daneben ist ein Knopf, und ein Knopf hat keinen.
        const tippC = hatUhr
            ? `${tippCache(c, l, restMinuten, verstrichen, laufzeit)}\n\n${tippZustand(l, kalt, jetzt)}`
            : tippCache(c, l, restMinuten, verstrichen, laufzeit)
        const uhr = Svg ? bild('st-cache', uhrSvg(anteil, tippC), tippC) : <Text color={farbe}>{uhrZeichen(anteil)}</Text>

        // --- Kontext als Ring: der Bogen ist der belegte Teil des Fensters, gefaerbt nach der Schwelle ---
        const stufe = k ? kontextStufe(k.tokens, k.threshold) : null
        const belegt = k && k.window > 0 ? Math.min(1, k.tokens / k.window) : null
        const kontextFarbe = stufe ? STUFE_FARBE[stufe] : 'subtle'
        const kontextText = belegt == null ? '?' : `${Math.round(belegt * 100)} %`
        const tippK = tippKontext(k)
        const kontextBild = Svg ? (
            bild('st-kontext', ringSvg(belegt, stufe ? STUFE_HEX[stufe] : GRAU, tippK), tippK)
        ) : (
            <Text color={kontextFarbe}>{uhrZeichen(belegt)}</Text>
        )

        // --- Warm oder kalt, zugleich der Warmhalten-Schalter ---
        // Ein Knopf traegt nur Text, kein Bild: Flamme oder Schneeflocke als Zeichen.
        // An oder aus zeigt die Art des Knopfs: gefuellt heisst an, dahinter die Restzeit
        // oder "immer". Jeder Klick legt drei Stunden drauf; rechts daneben schaltet ein
        // Kreuz sofort aus, solange es laeuft.
        const warm = l.warmImmer || l.warmBis > jetzt
        const zeichen = hatUhr && !kalt ? SYMBOL_WARM : SYMBOL_KALT
        const schalter = (
            <Button
                key="warmhalten"
                variant={warm ? 'primary' : 'secondary'}
                label={l.warmImmer ? `${zeichen} immer` : warm ? `${zeichen} ${warmRest(l.warmBis - jetzt)}` : zeichen}
                onPress={() => void schalteWarmhalten($)}
            />
        )
        const ausKnopf = warm ? (
            <Button key="warmhalten-aus" label={SYMBOL_AUS} variant="secondary" onPress={() => void stoppe($, null)} />
        ) : null
        // Details zum Kontext: /context, die Anzeige der App; im Terminal die von Claude Code.
        const detailsKnopf = (
            <Button key="details" label={SYMBOL_DETAILS} variant="secondary" onPress={() => void zeigeKontext($)} />
        )

        // Aufraeumen mit Sicherungspunkt steht rechts neben der Chatlaenge; wird der
        // Kontext eng (rot), ist es hervorgehoben. Das schlichte Verdichten steht am
        // Kontext. Wer eingereiht hat, zeigt die Sanduhr; der andere tut so lange nichts.
        // Ein Druck startet erst einen Countdown: Der Knopf zeigt die Sekunden, dahinter
        // steht "Abbrechen".
        const eng = stufe === 'eng'
        const istEingereiht = wartet !== null
        const sekunden = cd ? Math.ceil(Math.max(0, cd.bis - jetzt) / 1000) : 0
        const wischen = (
            <Button
                key="wischen"
                label={
                    cd?.was === 'wischen'
                        ? countdownZeichen(sekunden)
                        : wartet === 'wischen'
                          ? SYMBOL_EINGEREIHT
                          : SYMBOL_WISCHEN
                }
                variant={eng ? 'primary' : 'secondary'}
                onPress={() => void drueckeMitCountdown($, 'wischen', e.props.isWorking, e.surface, istEingereiht)}
            />
        )
        const compact = (
            <Button
                key="compact"
                label={
                    cd?.was === 'compact'
                        ? countdownZeichen(sekunden)
                        : wartet === 'compact'
                          ? SYMBOL_EINGEREIHT
                          : SYMBOL_COMPACT
                }
                variant="secondary"
                onPress={() => void drueckeMitCountdown($, 'compact', e.props.isWorking, e.surface, istEingereiht)}
            />
        )
        const abbrechenKnopf = cd ? (
            <Button key="countdown-abbrechen" label="Abbrechen" variant="secondary" onPress={() => void brichCountdownAb($)} />
        ) : null
        const abbrechenNach = (was: Countdown['was']) =>
            cd?.was === was
                ? [<Text key="st-abbrechen-luecke"> </Text>, abbrechenKnopf]
                : []

        // --- Chatlaenge: Nachrichten und geschaetzte Tokens seit Beginn ---
        // Ist die Liste an der Grenze, kann sie gekappt sein: dann "mindestens".
        const mind = chat?.istGekappt ? '≥' : ''
        const chatText = chat ? ` ${mind}${chat.nachrichten} · ${mind}${tokenMenge(chat.tokens)} ` : ' '

        // --- Limits: SL, FL (nur mit Fable), WL ---
        const n = await read($, nutzung)
        const limit = (schluessel: string, kurzname: string, langname: string, f: Fenster, mitTag: boolean) => {
            const tipp = tippLimit(langname, f, jetzt, mitTag)
            const zeit = limitZeit(f, jetzt, mitTag)
            return (
                <Box key={schluessel} alignItems="center">
                    {Svg ? (
                        bild(`${schluessel}-bild`, limitSvg(f.prozent, tipp), tipp)
                    ) : (
                        <Text color={limitFarbe(f.prozent)}>{uhrZeichen(f.prozent / 100)}</Text>
                    )}
                    <Text color={limitFarbe(f.prozent)}> {limitWert(kurzname, f.prozent)}</Text>
                    {zeit ? <Text dimColor> {zeit}</Text> : null}
                </Box>
            )
        }
        const fenster = [
            n.sl ? limit('st-sl', 'SL', 'Sitzungslimit (5 Stunden)', n.sl, false) : null,
            // FL wie SL mit Restzeit; liegt das Zuruecksetzen mehr als einen Tag weg, wie WL mit Wochentag.
            n.istFable && n.fl
                ? limit('st-fl', 'FL', 'Fable-Limit', n.fl, n.fl.bis != null && weitWeg(n.fl.bis, jetzt))
                : null,
            n.wl ? limit('st-wl', 'WL', 'Wöchentliches Limit', n.wl, true) : null,
        ].filter(<T,>(x: T | null): x is T => x !== null)

        // Alles in einer Zeile, die Gruppen durch | getrennt: ganz links die Chatlaenge mit
        // dem Wisch-Knopf, dann der Kontext mit Verdichten und Details, dann der Cache, warm
        // oder kalt mit dem Warmhalten-Schalter, dann die Limits.
        const eigene = (
            <Box key="statistik-zeile" alignItems="center">
                <Text>{SYMBOL_CHAT}</Text>
                <Text dimColor>{chatText}</Text>
                {wischen}
                {abbrechenNach('wischen')}
                <Text dimColor> | </Text>
                {kontextBild}
                <Text color={kontextFarbe}> {kontextText} </Text>
                {compact}
                {abbrechenNach('compact')}
                <Text> </Text>
                {detailsKnopf}
                <Text dimColor> | </Text>
                {uhr}
                <Text color={farbe}> {restText}</Text>
                <Text> </Text>
                {schalter}
                {ausKnopf ? <Text key="st-aus-luecke"> </Text> : null}
                {ausKnopf}
                {fenster.length > 0 ? <Text key="st-strich" dimColor> | </Text> : null}
                {fenster.flatMap((f, i) => (i === 0 ? [f] : [<Text key={`st-trenner-${i}`} dimColor> · </Text>, f]))}
            </Box>
        )

        // Die Zeile des Autopiloten gehoert ganz nach oben. Steht jener Mod in der Kette
        // unter der Statistik, kommt sie hier mit `rest` an, irgendwo darin, auch in
        // dem, was ein Mod dazwischen um sie gebaut hat: herausnehmen, als Ganzes, und
        // vor alles andere setzen.
        const { oben: ohneZeile, unten: zeile } = rest ? nimmHeraus(rest, BLOCK_OBEN) : { oben: null, unten: null }
        // Die Vorschlaege von Naechste-Schritte gehoeren ganz nach unten. Steht jener
        // Mod in der Kette unter der Statistik, kommt sein Block hier mit `rest` an:
        // herausnehmen und unter die eigene Zeile setzen.
        const { oben, unten } = ohneZeile ? nimmHeraus(ohneZeile, BLOCK_UNTEN) : { oben: null, unten: null }
        if (!oben && !zeile) {
            return unten ? (
                <Box flexDirection="column">
                    {eigene}
                    {unten}
                </Box>
            ) : (
                eigene
            )
        }
        // Zwischen dem, was andere Mods darueber zeichnen, und der Statistik eine
        // duenne Linie: in der App 1 Pixel mit je 3 Pixeln Luft darueber und
        // darunter, im Terminal eine blasse Zeile aus Strichen.
        const trennlinie = Svg ? (
            <Box key="statistik-trennlinie">
                <Svg source={TRENNLINIE_SVG} alt="Trennlinie" height={7} />
            </Box>
        ) : (
            <Text key="statistik-trennlinie" dimColor wrap="truncate-end">
                {'─'.repeat(Math.max(0, e.props.bodyColumns))}
            </Text>
        )
        return (
            <Box flexDirection="column">
                {zeile}
                {oben ? <Box key="von-unten">{oben}</Box> : null}
                {trennlinie}
                {eigene}
                {unten}
            </Box>
        )
    })
}
