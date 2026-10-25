import type { Aufwand, Einschaetzung, Kalibrierung, Modell } from '../types'

// Reine Rechnungen der Modellwahl: Namen, Einschaetzung lesen, Kosten schaetzen.
// Kein `$` hier; register.ts holt die Werte und legt sie ab.

/** Die Modelle mit voller ID: `turn.step` loest keine Aliase auf. */
export const MODELLE: Record<Modell, { id: string; name: string }> = {
    haiku: { id: 'claude-haiku-5-5', name: 'Haiku' },
    sonnet: { id: 'claude-sonnet-5-5', name: 'Sonnet' },
    opus: { id: 'claude-opus-5-5', name: 'Opus' },
    fable: { id: 'claude-fable-5-1', name: 'Fable' },
}

/** Die Stufen des Aufwands mit ihrem deutschen Namen. */
export const AUFWAENDE: Record<Aufwand, string> = {
    low: 'niedrig',
    medium: 'mittel',
    high: 'hoch',
    xhigh: 'sehr hoch',
    max: 'maximal',
}

/** "Opus · hoch". */
export function wahlText(w: { modell: Modell; aufwand: Aufwand }): string {
    return `${MODELLE[w.modell].name} · ${AUFWAENDE[w.aufwand]}`
}

/** Zu welcher Familie eine Modell-ID gehoert; null, wenn zu keiner der vier. */
export function familieVon(id: string | null | undefined): Modell | null {
    const s = String(id ?? '').toLowerCase()
    for (const m of ['haiku', 'sonnet', 'opus', 'fable'] as const) {
        if (s.includes(m)) {
            return m
        }
    }
    return null
}

/** Ob `args` nach Hilfe fragt. */
export function istHilfe(args: string | undefined): boolean {
    return /^(hilfe|\?)$/i.test(String(args ?? '').trim())
}

// --- Einschaetzung ---

/** Was das Einschaetzungsmodell als Anweisung bekommt. */
export const SYSTEM = [
    'Du wählst für eine Aufgabe in Claude Code das Modell und den Aufwand.',
    'Wähle das günstigste Modell, das die Aufgabe beim ersten Mal sicher schafft.',
    'Modelle, vom günstigsten an: haiku, sonnet, opus, fable. Aufwand: low, medium, high, xhigh, max.',
    'Faustregeln:',
    '- kurze Fragen, Übersetzungen: haiku, low',
    '- Routine (kleine Änderungen, Zusammenfassen): sonnet, medium',
    '- normale Entwicklungsarbeit: opus, medium oder high',
    '- schwierige, lange, mehrstufige Arbeit: opus, xhigh',
    '- die härtesten Probleme: fable, high oder xhigh',
    '- max nur bei wirklich harten Problemen.',
    'Antworte nur mit JSON, ohne weiteren Text: {"modell":"…","aufwand":"…","grund":"…"}.',
    'grund auf Deutsch, höchstens sechs Wörter.',
].join('\n')

/** Hoechstens so viele Zeichen gehen an die Einschaetzung, Aufgabe und Verlauf zusammen. */
export const EINGABE_GRENZE = 3000
/** So viel davon darf die Aufgabe allein belegen. */
const AUFGABE_GRENZE = 2000
/** Hoechstens so viele Nachrichten aus dem Verlauf, je hoechstens so viele Zeichen. */
const VERLAUF_ANZAHL = 6
const NACHRICHT_GRENZE = 300

function kuerze(text: string, n: number): string {
    const t = text.replace(/\s+/g, ' ').trim()
    return t.length <= n ? t : `${t.slice(0, n - 1)}…`
}

/**
 * Die Eingabe der Einschaetzung: die Aufgabe, dahinter kurz die letzten
 * Nachrichten, zusammen hoechstens `EINGABE_GRENZE` Zeichen.
 */
export function baueAnfrage(aufgabe: string, verlauf: readonly { role: string; text: string }[]): string {
    const kopf = aufgabe.trim() ? `Aufgabe:\n${kuerze(aufgabe, AUFGABE_GRENZE)}` : 'Aufgabe: siehe die letzten Nachrichten.'
    let rest = EINGABE_GRENZE - kopf.length - 30
    const zeilen: string[] = []
    for (const m of [...verlauf].reverse()) {
        if (zeilen.length >= VERLAUF_ANZAHL || rest <= 40) {
            break
        }
        const text = kuerze(m.text ?? '', Math.min(NACHRICHT_GRENZE, rest - 10))
        if (!text) {
            continue
        }
        const zeile = `${m.role === 'assistant' ? 'Claude' : 'Person'}: ${text}`
        zeilen.unshift(zeile)
        rest -= zeile.length + 1
    }
    return zeilen.length > 0 ? `${kopf}\n\nLetzte Nachrichten:\n${zeilen.join('\n')}` : kopf
}

/** Liest die Antwort der Einschaetzung; null, wenn sie kein brauchbares JSON ist. */
export function leseEinschaetzung(text: string): Einschaetzung | null {
    const m = /\{[\s\S]*\}/.exec(text)
    if (!m) {
        return null
    }
    let roh: unknown
    try {
        roh = JSON.parse(m[0])
    } catch {
        return null
    }
    if (!roh || typeof roh !== 'object') {
        return null
    }
    const o = roh as Record<string, unknown>
    const modell = familieVon(typeof o.modell === 'string' ? o.modell : '')
    const stufe = String(o.aufwand ?? '')
        .trim()
        .toLowerCase()
    if (!modell || !(stufe in AUFWAENDE)) {
        return null
    }
    const grund = typeof o.grund === 'string' ? o.grund.replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '') : ''
    return { modell, aufwand: stufe as Aufwand, grund: grund.split(' ').filter(Boolean).slice(0, 6).join(' ') }
}

// --- Kosten ---

/**
 * Dollar je Million Tokens: [Eingabe, Cache lesen, Cache schreiben (1 h), Ausgabe].
 *
 * Listenpreise wie im Mod Statistik. Laengere Namen zuerst: eine Modell-ID
 * trifft die erste Zeile, die sie enthaelt.
 */
const PREISE: Array<[string, number, number, number, number]> = [
    ['fable-5-1', 10, 0.25, 20, 50],
    ['fable', 10, 1, 20, 50],
    ['opus', 5, 0.5, 10, 25],
    ['sonnet-5', 2, 0.2, 4, 10],
    ['sonnet', 3, 0.3, 6, 15],
    ['haiku', 1, 0.1, 2, 5],
]

/** Der Preis eines Opus-Eingabe-Tokens: die Einheit der Kalibrierung. */
const OPUS_EINGABE = 5

/** Die Preise eines Modells; ein unbekanntes rechnet wie Opus. */
export function preisVon(id: string | null | undefined): { eingabe: number; lesen: number; schreiben: number; ausgabe: number } {
    const s = String(id ?? '').toLowerCase()
    const z = PREISE.find(p => s.includes(p[0])) ?? PREISE[2]!
    return { eingabe: z[1], lesen: z[2], schreiben: z[3], ausgabe: z[4] }
}

/** Token-Zahlen einer Runde, wie `turn.complete` sie liefert. */
export type Verbrauch = {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
}

/**
 * Was eine Runde kostet, in Opus-Eingabe-Tokens: Eingabe 1, Cache lesen 0,1,
 * Cache schreiben 2 (die Engine trennt 5 min und 1 h nicht; angenommen wird
 * 1 h), Ausgabe 5, alles mal dem Preis des Modells gegen Opus.
 */
export function kostenInOpus(u: Verbrauch, modell: string | null | undefined): number {
    const p = preisVon(modell)
    const dollar =
        (u.input_tokens || 0) * p.eingabe +
        (u.cache_read_input_tokens || 0) * p.lesen +
        (u.cache_creation_input_tokens || 0) * p.schreiben +
        (u.output_tokens || 0) * p.ausgabe
    return dollar / OPUS_EINGABE
}

/** Gewicht der neuesten Messung im gleitenden Mittel. */
const GLAETTUNG = 0.3

export const LEERE_KALIBRIERUNG: Kalibrierung = { quote: null, proben: 0, basisProzent: null, basisReset: null, summe: 0, at: 0 }

/**
 * Eine Runde in die Kalibrierung aufnehmen.
 *
 * `kosten` kommt zur Summe seit der letzten Messung. Mit `limit` (dem
 * 5-Stunden-Fenster nach der Runde): ist der Stand gestiegen, ergibt der
 * Anstieg geteilt durch die Summe eine Probe, die gleitend in die Quote
 * eingeht; ein neues Fenster oder ein gefallener Stand setzt nur die Basis.
 * Das Limit zaehlt fuer das ganze Konto, andere Chats eingeschlossen: die
 * Quote ist eine grobe Schaetzung.
 */
export function kalibriere(
    k: Kalibrierung,
    kosten: number,
    limit: { percentUsed: number; resetsAt?: string } | null,
    jetzt: number,
): Kalibrierung {
    const summe = k.summe + Math.max(0, kosten)
    if (!limit || !Number.isFinite(limit.percentUsed)) {
        return { ...k, summe }
    }
    const p = limit.percentUsed
    const reset = limit.resetsAt ?? null
    const neuesFenster = k.basisReset !== null && reset !== null && reset !== k.basisReset
    if (k.basisProzent === null || neuesFenster || p < k.basisProzent) {
        return { ...k, basisProzent: p, basisReset: reset, summe: 0, at: jetzt }
    }
    if (p > k.basisProzent && summe > 0) {
        const probe = (p - k.basisProzent) / summe
        const quote = k.quote === null ? probe : k.quote * (1 - GLAETTUNG) + probe * GLAETTUNG
        return { quote, proben: k.proben + 1, basisProzent: p, basisReset: reset, summe: 0, at: jetzt }
    }
    return { ...k, summe, basisReset: reset ?? k.basisReset }
}

/**
 * Was ein Wechsel zu `ziel` kostet: der Kontext wird einmal neu in den Cache
 * geschrieben (1 h), zum Preis des Zielmodells.
 *
 * `prozent` des 5-Stunden-Limits, wenn die Kalibrierung eine Quote hat, sonst
 * null; `runden` sagt, wie viele normale Runden (Kontext aus dem Cache lesen)
 * so viel kosten.
 */
export function schaetzeWechsel(k: Kalibrierung | null, kontext: number, ziel: string): { prozent: number | null; runden: number } {
    const p = preisVon(ziel)
    const opus = (kontext * p.schreiben) / OPUS_EINGABE
    const prozent = k && k.quote !== null && k.proben > 0 ? opus * k.quote : null
    return { prozent, runden: Math.round(p.schreiben / p.lesen) }
}

/** Ein Anteil in Prozent, deutsch: "2,5 %", "unter 0,1 %". */
export function prozentText(x: number): string {
    if (x < 0.1) {
        return 'unter 0,1 %'
    }
    const r = x >= 10 ? Math.round(x) : Math.round(x * 10) / 10
    return `${String(r).replace('.', ',')} %`
}

/** Eine Token-Zahl kurz: "950", "120k", "1,2 Mio.". */
export function tokenText(n: number): string {
    if (n < 1000) {
        return String(Math.round(n))
    }
    if (n < 1_000_000) {
        return `${Math.round(n / 1000)}k`
    }
    return `${String(Math.round(n / 100_000) / 10).replace('.', ',')} Mio.`
}

/** Eine Dauer kurz, in Minuten und Stunden: "12 min", "3 h", "1 h 5 min". */
export function dauerText(ms: number): string {
    const min = Math.max(0, Math.round(ms / 60_000))
    if (min < 60) {
        return `${min} min`
    }
    const std = Math.floor(min / 60)
    const rest = min % 60
    return rest === 0 ? `${std} h` : `${std} h ${rest} min`
}

// --- Vorsatz ---

/** Wie die Engine eine Befehlsantwort beginnt: die Namen der Mods, die den Befehl hooken, mit + verbunden. */
const VORSATZ = /^(<local-command-stdout>)([a-z0-9-]+(?:\+[a-z0-9-]+)*): /
/** Steht statt des Vorsatzes am Ende einer Antwort der Modellwahl. */
export const GEMELDET = '(gemeldet vom Mod Modellwahl)'

/**
 * Die gespeicherte Zeile einer Befehlsantwort ohne `name` im Vorsatz; andere Namen bleiben stehen.
 *
 * Mit `gemeldet` steht am Ende, von wem die Antwort kommt: nach einer Zeile mit
 * Leerzeichen, nach mehreren in einer eigenen letzten Zeile. Wie im Mod Statistik.
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
