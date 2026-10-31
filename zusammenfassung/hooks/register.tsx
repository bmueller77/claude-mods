// Zusammenfassung: Zweiter Blick und Replay in einem Block ueber dem Eingabefeld.
//
// Nach jeder Arbeitsrunde liest ein kleines Modell das Ende der Runde und schreibt zwei
// Zeilen: was getan wurde, und was man leicht uebersieht (das war der Zweite Blick).
// Daneben zeichnet der Mod jede Dateiaenderung der Runde auf; der Kreispfeil oeffnet
// ein Fenster, das sie Schritt fuer Schritt zeigt (das war Replay Theater von Anthropic,
// Apache-2.0). Der Chevron klappt den Block auf: beide Zeilen ungekuerzt, die Erklaerung
// zum Hinweis und die geaenderten Dateien.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code'

import type { BandHoehe, Bericht, DiffZeile, Schritt } from '../types'
import { BAND_VERSION, bandBudget, plane, zeilenVon } from './band'

/** So viele Nachrichten vom Ende der Runde bekommt das Modell zu sehen. */
const NACHRICHTEN = 10
/** Zeichen je Nachricht; mehr braucht die Zusammenfassung nicht. */
const ZEICHEN_JE_NACHRICHT = 1200
/** Laenger darf eine Zeile nicht sein, auch aufgeklappt nicht. */
const ZEILE_MAX = 400

/** Das Replay zeigt je Schritt so viele Zeilen Diff; gespeichert werden hoechstens DIFF_MAX. */
const DIFF_ZEIGEN = 12
const DIFF_MAX = 200
/** Ueber so vielen Zeilen spart sich der Diff die Suche nach gemeinsamen Zeilen. */
const LCS_MAX = 400
/** Hoechstens so viele Schritte je Runde. */
const SCHRITTE_MAX = 60

const BEARBEITER = new Set(['Edit', 'Write', 'MultiEdit'])

/** Das Fenster mit dem Replay. */
const FENSTER = 'zusammenfassung-replay'

/**
 * Schluessel im Speicher: ob die Zusammenfassung in einem Chat aus ist, je Chat
 * `{ at, aus }` unter `zusammenfassung.aus:<Sitzungs-ID>`. Der alte Schluessel ohne
 * ID galt fuer alle Chats; er wird nicht mehr gelesen.
 */
const SPEICHER_AUS = 'zusammenfassung.aus:'
/** Wann zuletzt alte Chat-Schluessel weggeraeumt wurden. */
const SPEICHER_AUFGERAEUMT = 'zusammenfassung.aufgeraeumt'
/** Chat-Schluessel, die so lange nicht beruehrt wurden, fliegen raus. */
const CHAT_HALTBAR_MS = 30 * 24 * 60 * 60_000
/** Hoechstens so oft wird aufgeraeumt. */
const AUFRAEUMEN_ABSTAND_MS = 24 * 60 * 60_000

type ChatAus = { at: number; aus: boolean }

function istChatAus(v: unknown): v is ChatAus {
    return typeof v === 'object' && v !== null && typeof (v as ChatAus).at === 'number' && typeof (v as ChatAus).aus === 'boolean'
}

/**
 * Ob die Zusammenfassung in diesem Chat aus ist: der Wert des Chats, sonst der
 * Standard aus den Einstellungen. Ein gefundener Wert wird als beruehrt markiert.
 */
async function ladeAus($: EngineInterface, sid: string, standardAus: boolean, jetzt: number): Promise<boolean> {
    const v = await $.store.get(SPEICHER_AUS + sid)
    if (!istChatAus(v)) {
        return standardAus
    }
    await $.store.set(SPEICHER_AUS + sid, { at: jetzt, aus: v.aus })
    return v.aus
}

/** Fremde Chat-Schluessel, laenger als 30 Tage unberuehrt, wegraeumen; hoechstens einmal am Tag. */
async function raeumeChatsAuf($: EngineInterface, sid: string, jetzt: number): Promise<void> {
    const zuletzt = await $.store.get(SPEICHER_AUFGERAEUMT)
    if (typeof zuletzt === 'number' && jetzt - zuletzt < AUFRAEUMEN_ABSTAND_MS) {
        return
    }
    await $.store.set(SPEICHER_AUFGERAEUMT, jetzt)
    for (const schluessel of await $.store.keys()) {
        if (!schluessel.startsWith(SPEICHER_AUS) || schluessel === SPEICHER_AUS + sid) {
            continue
        }
        const v = await $.store.get(schluessel)
        if (!istChatAus(v) || jetzt - v.at > CHAT_HALTBAR_MS) {
            await $.store.delete(schluessel)
        }
    }
}

/** Die Zeichen auf den Knoepfen: Dreieck zum Auf- und Zuklappen, Kreispfeil fuer das Replay. */
const SYMBOL_AUF = '⏷'
const SYMBOL_ZU = '⏶'
const SYMBOL_REPLAY = '⟲'

/** So viele Zeichen bleibt der gekuerzte Text vom rechten Rand des Bands weg. */
const ABSTAND_RAND = 2
/** Was vor dem Hinweis steht. */
const BEACHTE = 'Beachte: '

/** Wie bei Statistik und Naechste-Schritte: 15 Pixel hoch, die Linie 1 Pixel in der Mitte; so verdeckt ein Knopf daneben sie nicht. */
const TRENNLINIE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="15" viewBox="0 0 4000 15" preserveAspectRatio="none">' +
    '<rect x="0" y="7" width="4000" height="1" fill="#8a8a8a" fill-opacity="0.5"/></svg>'

const bericht = atom({ plugin: 'zusammenfassung', key: 'bericht' } as const, null as Bericht | null)
const schritte = atom({ plugin: 'zusammenfassung', key: 'schritte' } as const, [] as Schritt[])
// Die Aenderungen der laufenden Runde. In `$.state`, nicht im Modul: wird der Mod
// mitten in der Runde neu geladen (ein Update), gehen sie so nicht verloren.
const laufend = atom({ plugin: 'zusammenfassung', key: 'laufend' } as const, [] as Schritt[])
const index = atom({ plugin: 'zusammenfassung', key: 'index' } as const, 0)
const istOffen = atom({ plugin: 'zusammenfassung', key: 'istOffen' } as const, false)
const isAus = atom({ plugin: 'zusammenfassung', key: 'isAus' } as const, false)
const letzter = atom({ plugin: 'zusammenfassung', key: 'letzter' } as const, null as string | null)

/** Je Flaeche: die zuletzt veroeffentlichte und die geplante Hoehe im Band. */
type BandMerker = {
    veroeffentlicht: Map<RenderSurface, { voll: number; klein: number }>
    geplant: Map<RenderSurface, { voll: number; klein: number }>
}

const gleicheHoehe = (a: { voll: number; klein: number } | undefined, b: { voll: number; klein: number }) =>
    a !== undefined && a.voll === b.voll && a.klein === b.klein

/**
 * Veroeffentlicht die Hoehe des eigenen Blocks im Band, je Flaeche, fuer die Mods, die ihren Platz
 * danach planen (hooks/band.ts). Beim Zeichnen darf kein Hook schreiben: geschrieben wird einen
 * Takt spaeter und nur, wenn sich die Hoehe aendert; sonst zeichnet jede Schreibung neu und plant
 * die naechste.
 */
function meldeBandHoehe($: EngineInterface, band: BandMerker, flaeche: RenderSurface, h: { voll: number; klein: number }): void {
    const geplant = band.geplant.get(flaeche)
    if (gleicheHoehe(geplant ?? band.veroeffentlicht.get(flaeche), h)) {
        return
    }
    band.geplant.set(flaeche, h)
    if (geplant) {
        return
    }
    $.clock.after(0, () => {
        const g = band.geplant.get(flaeche)
        band.geplant.delete(flaeche)
        if (!g || gleicheHoehe(band.veroeffentlicht.get(flaeche), g)) {
            return
        }
        band.veroeffentlicht.set(flaeche, g)
        const hoehe: BandHoehe = { v: BAND_VERSION, voll: g.voll, klein: g.klein }
        void $.state.set({ plugin: 'zusammenfassung', key: 'bandHoehe', id: flaeche }, hoehe).catch(() => {
            band.veroeffentlicht.delete(flaeche)
        })
    })
}

/** Die Hoehen der anderen Mods im Band auf dieser Flaeche; was fehlt oder sich nicht lesen laesst, ist null. */
async function fremdeHoehen($: EngineInterface, flaeche: RenderSurface) {
    const lies = async (f: () => Promise<{ value: BandHoehe | undefined }>) => {
        try {
            return (await f()).value ?? null
        } catch {
            return null
        }
    }
    return {
        leitstand: await lies(() => $.state.get({ plugin: 'leitstand', key: 'bandHoehe', id: flaeche })),
        statistik: await lies(() => $.state.get({ plugin: 'statistik', key: 'bandHoehe', id: flaeche })),
        naechsteSchritte: await lies(() => $.state.get({ plugin: 'naechste-schritte', key: 'bandHoehe', id: flaeche })),
        modellwahl: await lies(() => $.state.get({ plugin: 'modellwahl', key: 'bandHoehe', id: flaeche })),
    }
}

export const SYSTEM =
    'Du fasst eine Runde eines KI-Assistenten für die Person zusammen, für die er arbeitet. ' +
    'Du bekommst das Ende der Runde: die letzten Nachrichten, die letzte Antwort des Assistenten und die geänderten Dateien. ' +
    'Antworte mit genau zwei Zeilen, auf Deutsch, ohne Anrede, ohne Einleitung, ohne Aufzählungszeichen und ohne Beschriftung. ' +
    'Schreib echte Umlaute (ä, ö, ü, ß), nie ae, oe, ue oder ss an ihrer Stelle.\n' +
    'Zeile 1: was in der Runde getan wurde und mit welchem Ergebnis, konkret (Datei, Funktion, Test), höchstens 120 Zeichen.\n' +
    'Zeile 2: eine Sache, die die Person wissen sollte und leicht übersieht: eine stille Annahme des Assistenten, ' +
    'ein Nebeneffekt, den er nicht erwähnt, ein Abweichen von dem, was die Person vorher gesagt hat, ' +
    'oder ein Schritt, der nur behauptet und nicht geprüft wurde. Höchstens 160 Zeichen, nichts, was der Assistent selbst schon gesagt hat. ' +
    'Gibt es nichts dergleichen, steht in Zeile 2 nur das Wort NONE.\n' +
    'Eine Zeile [Befehl] ist ein Slash-Befehl an die App oder einen Mod, kein Auftrag an den Assistenten; ' +
    'nenne ihn nie als offen, vergessen oder nicht bearbeitet.\n' +
    'Kein Lob, keine Bewertung, keine Gedankenstriche.\n' +
    'Beispiel:\nLeiste in src/leiste.ts gebaut, Test in src/leiste.test.ts ergänzt, er läuft grün.\n' +
    'Der Test prüft nur das Terminal; ob die Leiste in der App gleich aussieht, ist ungeprüft.'

export const SYSTEM_MEHR =
    'Du hast der Person eben einen kurzen Hinweis zu einer Runde eines KI-Assistenten gegeben. ' +
    'Erkläre ihn jetzt ausführlicher: worauf er sich im Verlauf stützt, was daraus folgen kann, und was die Person tun könnte. ' +
    'Höchstens 150 Wörter, auf Deutsch, ohne Anrede, ohne Aufzählung, ohne Gedankenstriche. ' +
    'Schreib echte Umlaute (ä, ö, ü, ß), nie ae, oe, ue oder ss an ihrer Stelle.'

// --- Diff fuer das Replay ---

function zeilenAus(text: unknown): string[] {
    if (typeof text !== 'string' || text === '') {
        return []
    }
    const zeilen = text.split('\n')
    if (zeilen.length > 1 && zeilen[zeilen.length - 1] === '') {
        zeilen.pop()
    }
    return zeilen
}

/**
 * Ein Zeilen-Diff. Kleine Texte bekommen einen echten Diff, damit Unveraendertes
 * als Kontext stehen bleibt; grosse werden ganz weg und ganz hinzu.
 */
export function diff(alt: unknown, neu: unknown): DiffZeile[] {
    const a = zeilenAus(alt)
    const b = zeilenAus(neu)
    if (a.length > LCS_MAX || b.length > LCS_MAX) {
        return [...a.map(t => ({ op: '-' as const, t })), ...b.map(t => ({ op: '+' as const, t }))].slice(0, DIFF_MAX)
    }
    const n = a.length
    const m = b.length
    const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
        }
    }
    const aus: DiffZeile[] = []
    let i = 0
    let j = 0
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            aus.push({ op: ' ', t: a[i]! })
            i++
            j++
        } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
            aus.push({ op: '-', t: a[i++]! })
        } else {
            aus.push({ op: '+', t: b[j++]! })
        }
    }
    while (i < n) {
        aus.push({ op: '-', t: a[i++]! })
    }
    while (j < m) {
        aus.push({ op: '+', t: b[j++]! })
    }
    return kontext(aus).slice(0, DIFF_MAX)
}

/** Eine Zeile Kontext um jede Aenderung, damit ein Write nicht die ganze Datei zeigt. */
function kontext(zeilen: DiffZeile[]): DiffZeile[] {
    if (!zeilen.some(z => z.op !== ' ')) {
        return zeilen.slice(0, DIFF_ZEIGEN)
    }
    const geaendert = (k: number) => zeilen[k] !== undefined && zeilen[k]!.op !== ' '
    const aus: DiffZeile[] = []
    let ausgelassen = false
    zeilen.forEach((z, k) => {
        if (geaendert(k) || geaendert(k - 1) || geaendert(k + 1)) {
            if (ausgelassen && aus.length > 0) {
                aus.push({ op: '~', t: '⋯' })
            }
            aus.push(z)
            ausgelassen = false
        } else {
            ausgelassen = true
        }
    })
    return aus
}

export function zaehle(d: readonly DiffZeile[]): { plus: number; minus: number } {
    let plus = 0
    let minus = 0
    for (const z of d) {
        if (z.op === '+') {
            plus++
        } else if (z.op === '-') {
            minus++
        }
    }
    return { plus, minus }
}

/** Ein Pfad relativ zum Arbeitsordner, wenn er darin liegt; Windows-Pfade eingeschlossen. */
export function relPfad(cwd: string, pfad: unknown): string {
    if (typeof pfad !== 'string' || pfad === '') {
        return '(unbekannte Datei)'
    }
    const vorwaerts = (s: string) => s.replace(/\\/g, '/')
    const c = vorwaerts(cwd).replace(/\/$/, '')
    const p = vorwaerts(pfad)
    return c !== '' && p.toLowerCase().startsWith(`${c.toLowerCase()}/`) ? p.slice(c.length + 1) : p
}

/** Aus einem Werkzeugaufruf die Schritte fuers Replay. */
async function schritteAus($: EngineInterface, werkzeug: string, x: Record<string, unknown>): Promise<Schritt[]> {
    let cwd = ''
    try {
        cwd = await $.session.cwd()
    } catch {
        // dann eben der volle Pfad
    }
    const datei = relPfad(cwd, x.file_path)
    if (werkzeug === 'Edit') {
        return [{ werkzeug: 'Edit', datei, diff: diff(x.old_string, x.new_string), notiz: x.replace_all ? 'alle ersetzt' : '' }]
    }
    if (werkzeug === 'MultiEdit' && Array.isArray(x.edits)) {
        const teile = x.edits as { old_string?: unknown; new_string?: unknown }[]
        return teile.map((t, k) => ({
            werkzeug: 'MultiEdit' as const,
            datei,
            diff: diff(t.old_string, t.new_string),
            notiz: `Teil ${k + 1} von ${teile.length}`,
        }))
    }
    if (werkzeug === 'Write') {
        let vorher = ''
        let istNeu = true
        try {
            if (typeof x.file_path === 'string' && (await $.fs.exists(x.file_path))) {
                vorher = await $.fs.read(x.file_path)
                istNeu = false
            }
        } catch {
            // nicht lesbar: als neue Datei zeigen
        }
        return [{ werkzeug: 'Write', datei, diff: diff(vorher, x.content), notiz: istNeu ? 'neue Datei' : 'überschrieben' }]
    }
    return []
}

/**
 * Was ein Schritt getan hat, in Worten statt mit dem Namen des Werkzeugs: "Stelle geändert",
 * "Stelle geändert, Teil 1 von 2", "Datei neu angelegt".
 */
export function schrittArt(s: Schritt): string {
    if (s.werkzeug === 'Write') {
        return s.notiz === 'neue Datei' ? 'Datei neu angelegt' : 'Datei ganz neu geschrieben'
    }
    if (s.werkzeug === 'Edit' && s.notiz === 'alle ersetzt') {
        return 'Stelle geändert, an jeder Fundstelle'
    }
    return s.notiz ? `Stelle geändert, ${s.notiz}` : 'Stelle geändert'
}

/** Die geaenderten Dateien mit ihren Zeilen, in der Reihenfolge der ersten Aenderung. */
export function dateienAus(s: readonly Schritt[]): { datei: string; plus: number; minus: number }[] {
    const aus: { datei: string; plus: number; minus: number }[] = []
    for (const schritt of s) {
        const { plus, minus } = zaehle(schritt.diff)
        const da = aus.find(d => d.datei === schritt.datei)
        if (da) {
            da.plus += plus
            da.minus += minus
        } else {
            aus.push({ datei: schritt.datei, plus, minus })
        }
    }
    return aus
}

/** "13 Änderungen in 3 Dateien". */
export function aenderungenText(s: readonly Schritt[]): string {
    const n = s.length
    const m = dateienAus(s).length
    return `${n} ${n === 1 ? 'Änderung' : 'Änderungen'} in ${m} ${m === 1 ? 'Datei' : 'Dateien'}`
}

// --- Kuerzen fuer die zwei Zeilen ---

/** Kuerzt einen Text auf `breite` Zeichen, moeglichst am Wortende, mit "..." am Schluss. */
export function kuerze(text: string, breite: number): string {
    if (text.length <= breite) {
        return text
    }
    const schnitt = text.slice(0, Math.max(1, breite - 3))
    const leer = schnitt.lastIndexOf(' ')
    return `${(leer > 0 ? schnitt.slice(0, leer) : schnitt).replace(/[\s,;:.]+$/, '')}...`
}

/**
 * Bricht einen Text in hoechstens `anzahl` Zeilen von `breite` Zeichen. Passt er nicht, endet
 * die letzte Zeile mit "...".
 */
export function zeilenUmbruch(text: string, breite: number, anzahl: number): string[] {
    const woerter = text.trim().split(/\s+/).filter(w => w !== '')
    const zeilen: string[] = []
    let zeile = ''
    for (let i = 0; i < woerter.length; i++) {
        const wort = woerter[i]!
        const laenger = zeile === '' ? wort : `${zeile} ${wort}`
        if (laenger.length <= breite || zeile === '') {
            zeile = laenger
            continue
        }
        if (zeilen.length === anzahl - 1) {
            // Die letzte erlaubte Zeile: der Rest kommt dazu und wird gekuerzt.
            return [...zeilen, kuerze(`${zeile} ${woerter.slice(i).join(' ')}`, breite)]
        }
        zeilen.push(kuerze(zeile, breite))
        zeile = wort
    }
    if (zeile !== '') {
        zeilen.push(kuerze(zeile, breite))
    }
    return zeilen
}

// --- Die Zusammenfassung ---

/** Ein getippter Befehl: `/name` am Anfang, dahinter Leerraum oder nichts (so bleibt `/etc/hosts` Text). */
const BEFEHL_GETIPPT = /^\s*\/([A-Za-z0-9][\w:.-]*)(?=\s|$)/
/** Ein Befehl, wie die Engine ihn speichert: `<command-name>/name</command-name>`, die Argumente in `<command-args>`. */
const BEFEHL_GESPEICHERT = /<command-name>\s*\/([^<\s]+)\s*<\/command-name>/

/**
 * Der Name eines Slash-Befehls, wenn eine Nachricht der Person einer ist, sonst null.
 *
 * Ein Befehl ist kein Auftrag an den Assistenten: Ein Mod oder die App beantwortet ihn selbst
 * (`/modellwahl <Aufgabe>` schlaegt nur ein Modell vor). Ob ein Befehl seinen Text als Prompt
 * an den Assistenten weitergibt, sieht man der Nachricht nicht an; tut er es (Markdown-Befehl,
 * Skill), steht der ausgefuehrte Text als eigene Nachricht im Verlauf.
 */
export function befehlsName(text: string): string | null {
    return BEFEHL_GESPEICHERT.exec(text)?.[1] ?? BEFEHL_GETIPPT.exec(text)?.[1] ?? null
}

/** Eine Nachricht, wie das Modell sie sieht; ein Befehl der Person ohne seine Argumente. */
function verlaufsZeile(m: { role: string; text: string }): string {
    if (m.role === 'user') {
        const name = befehlsName(m.text)
        if (name !== null) {
            return `[Befehl] /${name} (an die App oder einen Mod, kein Auftrag an den Assistenten)`
        }
    }
    return `[${m.role === 'user' ? 'Person' : 'Assistent'}] ${m.text.slice(0, ZEICHEN_JE_NACHRICHT)}`
}

/** Die Nachrichten der Runde als Text, wie das Modell sie bekommt. */
function verlauf(nachrichten: readonly { role: string; text: string }[], antwort: string, s: readonly Schritt[]): string {
    const zeilen = nachrichten
        .filter(m => m.text.trim() !== '')
        .slice(-NACHRICHTEN)
        .map(verlaufsZeile)
    const dateien = dateienAus(s).map(d => `${d.datei} +${d.plus} -${d.minus}`)
    return (
        `<verlauf>\n${zeilen.join('\n')}\n</verlauf>\n\n<letzte_antwort>\n${antwort.slice(0, 3000)}\n</letzte_antwort>` +
        `\n\n<geaenderte_dateien>\n${dateien.length > 0 ? dateien.join('\n') : '(keine)'}\n</geaenderte_dateien>`
    )
}

/** Eine Zeile des Modells bereinigt, oder null, wenn nichts dran ist. */
function zeile(text: string | undefined): string | null {
    if (text === undefined) {
        return null
    }
    const t = text
        .replace(/\*\*/g, '')
        .replace(/^\s*(?:[-*•]|\d+[.):])\s*/, '')
        .replace(/^(zeile\s*\d\s*|getan|gemacht|beachte|hinweis|achtung|note)\s*:\s*/i, '')
        .replace(/^["'„“]+|["'“”]+$/g, '')
        .replace(/\s*[—–]\s*/g, ', ')
        .trim()
    if (t === '' || /^none\b/i.test(t) || /^(nichts|keine)\b.{0,40}$/i.test(t)) {
        return null
    }
    return t.length > ZEILE_MAX ? `${t.slice(0, ZEILE_MAX - 3).trimEnd()}...` : t
}

/** Die Antwort des Modells: Zeile 1 was getan wurde, Zeile 2 was man leicht uebersieht. */
export function leseBericht(text: string): { getan: string | null; beachte: string | null } {
    const rumpf = text.replace(/```[a-z]*\n?/gi, '').trim()
    if (/^none\b/i.test(rumpf)) {
        return { getan: null, beachte: null }
    }
    const zeilen = rumpf.split('\n').filter(z => z.trim() !== '')
    return { getan: zeile(zeilen[0]), beachte: zeile(zeilen[1]) }
}

/** Zwei Hinweise, die dasselbe sagen, bis auf Satzzeichen und Gross-Klein. */
function gleich(a: string | null, b: string): boolean {
    if (a === null) {
        return false
    }
    const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim()
    return n(a) === n(b)
}

/**
 * Das Modell fragen und die Zusammenfassung ablegen.
 *
 * Laeuft im Hintergrund, die Runde endet sofort. Abgelegt wird nur, solange
 * der Bericht noch zu dieser Runde gehoert; hat eine neuere Arbeitsrunde ihn
 * schon ersetzt, faellt die Antwort weg.
 */
async function fasseZusammen(
    $: EngineInterface,
    modell: string,
    turnId: string,
    antwort: string,
    s: readonly Schritt[],
): Promise<void> {
    const fertig = async (getan: string | null, beachte: string | null) =>
        update($, bericht, alt => (alt && alt.turnId === turnId ? { ...alt, schreibt: false, getan, beachte } : alt))
    try {
        const alle = await $.session.messages()
        const r = await $.model.complete({
            model: modell,
            maxTokens: 300,
            timeoutMs: 25_000,
            system: SYSTEM,
            prompt: verlauf(Array.isArray(alle) ? alle : [], antwort, s),
        })
        if ((await read($, bericht))?.turnId !== turnId) {
            return
        }
        const { getan, beachte } = r.isAnswered ? leseBericht(r.text) : { getan: null, beachte: null }
        // Derselbe Hinweis zweimal hintereinander hilft niemandem.
        const neu = beachte !== null && !gleich(await read($, letzter), beachte) ? beachte : null
        if (neu !== null) {
            await update($, letzter, () => neu)
        }
        await fertig(getan, neu)
    } catch {
        await fertig(null, null)
    }
}

/** Die laengere Erklaerung zum Hinweis holen. */
async function erklaere($: EngineInterface, modell: string, b: Bericht): Promise<void> {
    if (!b.beachte || b.erklaerung || b.holtErklaerung) {
        return
    }
    await update($, bericht, alt => (alt && alt.turnId === b.turnId ? { ...alt, holtErklaerung: true } : alt))
    let text: string | null = null
    try {
        const alle = await $.session.messages()
        const r = await $.model.complete({
            model: modell,
            maxTokens: 400,
            timeoutMs: 25_000,
            system: SYSTEM_MEHR,
            prompt: `${verlauf(Array.isArray(alle) ? alle : [], '', await read($, schritte))}\n\n<hinweis>\n${b.beachte}\n</hinweis>`,
        })
        text = r.isAnswered ? zeile(r.text.replace(/```[a-z]*\n?/gi, '').replace(/\n+/g, ' ')) : null
    } catch {
        text = null
    }
    await update($, bericht, alt =>
        alt && alt.turnId === b.turnId
            ? { ...alt, holtErklaerung: false, erklaerung: text ?? 'Das Modell hat keine Erklärung geliefert.' }
            : alt,
    )
}

/** Auf- oder zuklappen; aufgeklappt mit Hinweis wird die Erklaerung geholt. */
async function klappe($: EngineInterface, modell: string): Promise<void> {
    const offen = await update($, istOffen, v => !v)
    const b = await read($, bericht)
    if (offen && b) {
        await erklaere($, modell, b)
    }
}

// --- Das Replay-Fenster ---

/** Das Replay oeffnen; ohne Aenderungen nur, wenn `auchLeer` (der Knopf), nicht fuer /replay. */
async function oeffneReplay($: EngineInterface, auchLeer = false): Promise<boolean> {
    if (!auchLeer && (await read($, schritte)).length === 0) {
        return false
    }
    await update($, index, () => 0)
    await $.ui.open({ id: FENSTER, title: 'Replay', focus: true, closeOnEscape: true, rows: DIFF_ZEIGEN + 10, columns: 64 })
    return true
}

async function gehe($: EngineInterface, zu: number): Promise<void> {
    const n = (await read($, schritte)).length
    await update($, index, () => Math.max(0, Math.min(zu, n - 1)))
}

/** Wie die Engine eine Befehlsantwort beginnt: die Namen der Mods, die den Befehl hooken, mit + verbunden. */
const VORSATZ = /^(<local-command-stdout>)([a-z0-9-]+(?:\+[a-z0-9-]+)*): /
/** Steht statt des Vorsatzes am Ende einer Antwort der Zusammenfassung. */
export const GEMELDET = '(gemeldet vom Mod Zusammenfassung)'

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

/** Schaltet die Zusammenfassung in diesem Chat an oder aus und merkt es sich je Chat, wie /zusammenfassung. */
async function setzeAus($: EngineInterface, aus: boolean): Promise<void> {
    await update($, isAus, () => aus)
    await $.store.set(SPEICHER_AUS + (await $.session.id()), { at: await $.clock.now(), aus })
    if (aus) {
        await update($, bericht, () => null)
    }
}

/** Ob gerade etwas ueber dem Eingabefeld steht, das sich auf- und zuklappen laesst. */
async function hatBlock($: EngineInterface): Promise<boolean> {
    const b = await read($, bericht)
    const hatBericht = b !== null && (b.schreibt || b.getan !== null || b.beachte !== null)
    return hatBericht || (await read($, schritte)).length > 0
}

/** Wie der Chevron, aber in eine Richtung: auf (mit Erklaerung, wie beim Aufklappen) oder zu. */
async function klappeNach($: EngineInterface, modell: string, offen: boolean): Promise<string> {
    if (!(await hatBlock($))) {
        return 'Gerade steht keine Zusammenfassung in der Leiste über dem Eingabefeld. Sie kommt nach der nächsten Runde, in der Claude arbeitet.'
    }
    await update($, istOffen, () => offen)
    if (!offen) {
        return 'Die Zusammenfassung ist zugeklappt.'
    }
    const b = await read($, bericht)
    if (b?.beachte && !b.erklaerung) {
        // Die Erklaerung holt ein Modell; der Befehl wartet nicht darauf.
        $.clock.after(0, () => void erklaere($, modell, b).catch(() => {}))
        return 'Die Zusammenfassung ist aufgeklappt; die Erklärung zum Hinweis kommt gleich.'
    }
    return 'Die Zusammenfassung ist aufgeklappt.'
}

/** Die Schritte des Replays als Text, fuer das Handy, wo kein Fenster aufgeht. */
export function replayAlsText(s: readonly Schritt[]): string {
    const zeilen = [`Replay: ${aenderungenText(s)}.`]
    s.forEach((schritt, k) => {
        const { plus, minus } = zaehle(schritt.diff)
        zeilen.push(`${k + 1}. ${schritt.datei} (${schrittArt(schritt)}) +${plus} −${minus}`)
    })
    return zeilen.join('\n')
}

/** Wie der Kreispfeil und /replay; vom Handy als Text, sonst erst die Antwort, dann das Fenster. */
async function replayBefehl($: EngineInterface, vomHandy: boolean): Promise<string> {
    const s = await read($, schritte)
    if (s.length === 0) {
        return 'Replay: keine Dateiänderungen in der letzten Runde.'
    }
    if (vomHandy) {
        return `${replayAlsText(s)}\nDas Fenster mit den geänderten Zeilen gibt es nur am Rechner.`
    }
    $.clock.after(0, () => void oeffneReplay($).catch(() => {}))
    return `Replay: ${aenderungenText(s)}. Das Fenster geht gleich auf.`
}

// --- Befehle mit Hilfe ---

/** Ein Befehl des Mods mit allem, was seine Hilfe sagt. */
export type Befehl = {
    name: string
    /** Der Titel hinter dem Namen in der ersten Zeile der Hilfe. */
    titel: string
    /** Die eine Zeile in der Befehlsliste. */
    description: string
    argumentHint?: string
    /** Was er tut. */
    was: string
    /** Welchem Knopf er entspricht. */
    knopf: string
    /** Wie weit er wirkt. */
    gilt: string
    argumente: string
    /** Nur bei einem Befehl mit Argument. */
    beispiel?: string
}

/** Die Fassungen fuer "Gilt" aus dem Leitfaden. */
const GILT_STANDARD = 'nur in diesem Chat. Standard für neue Chats: Option "Zusammenfassung", siehe /zusammenfassung:hilfe unter Einstellen.'
const GILT_CHAT = 'nur in diesem Chat.'
const GILT_EINMAL = 'einmal, sofort; ändert keine Einstellung.'

/** Wo die Knoepfe stehen. */
const IN_DER_LEISTE = 'neben "Zusammenfassung" in der Leiste über dem Eingabefeld (im Terminal und in der Desktop-App gleich)'

/**
 * Die Einzelbefehle, in der Reihenfolge der Uebersicht. Jeder ist eine Datei in commands/ des Mods
 * (commands/hilfe.md wird /zusammenfassung:hilfe); ein Name mit Doppelpunkt laesst sich nicht anmelden.
 * Den Lauf beantwortet trotzdem dieser Mod, die Datei kommt nie beim Modell an.
 */
export const BEFEHLE: readonly Befehl[] = [
    {
        name: 'zusammenfassung:hilfe',
        titel: 'Hilfe',
        description: 'Was die Zusammenfassung tut, wie du sie einstellst, alle Befehle',
        was: 'Zeigt, was die Zusammenfassung tut, wie du mit ihr arbeitest und sie einstellst, und listet alle Befehle.',
        knopf: 'keiner.',
        gilt: GILT_EINMAL,
        argumente: 'keine.',
    },
    {
        name: 'zusammenfassung:an',
        titel: 'Einschalten',
        description: 'Die Zusammenfassung nach jeder Runde in diesem Chat einschalten',
        was: 'Schaltet die Zusammenfassung nach jeder Runde ein. Ist sie schon an, bleibt sie an.',
        knopf: 'keiner.',
        gilt: GILT_STANDARD,
        argumente: 'keine.',
    },
    {
        name: 'zusammenfassung:aus',
        titel: 'Ausschalten',
        description: 'Die Zusammenfassung in diesem Chat ausschalten; das Replay bleibt',
        was: 'Schaltet die Zusammenfassung nach jeder Runde aus; dann ruft der Mod dafür kein Modell mehr auf. Das Replay bleibt: ⟲ und /replay gehen weiter.',
        knopf: 'keiner.',
        gilt: GILT_STANDARD,
        argumente: 'keine.',
    },
    {
        name: 'zusammenfassung:aufklappen',
        titel: 'Aufklappen',
        description: 'Die Zusammenfassung aufklappen: ganze Zeilen, Erklärung zum Hinweis, geänderte Dateien',
        was:
            'Klappt die Zusammenfassung in der Leiste auf: beide Zeilen ganz, eine längere Erklärung zum Hinweis "Beachte:" und die geänderten Dateien. ' +
            'Für die Erklärung ruft der Mod einmal das Modell auf, nur wenn es einen Hinweis gibt. Die nächste Runde klappt wieder zu.',
        knopf: `${SYMBOL_AUF} ${IN_DER_LEISTE}.`,
        gilt: GILT_CHAT,
        argumente: 'keine.',
    },
    {
        name: 'zusammenfassung:zuklappen',
        titel: 'Zuklappen',
        description: 'Die aufgeklappte Zusammenfassung wieder zuklappen',
        was: 'Klappt die Zusammenfassung in der Leiste wieder auf zwei Zeilen zu.',
        knopf: `${SYMBOL_ZU} ${IN_DER_LEISTE}.`,
        gilt: GILT_CHAT,
        argumente: 'keine.',
    },
    {
        name: 'zusammenfassung:replay',
        titel: 'Replay',
        description: 'Jede Dateiänderung der letzten Runde Schritt für Schritt zeigen',
        was:
            'Öffnet das Replay der letzten Runde im Seitenfenster: jede Änderung an einer Datei als eigener Schritt, mit den geänderten Zeilen. ' +
            'Vom Handy kommt stattdessen eine Liste der Schritte als Text.',
        knopf: `${SYMBOL_REPLAY} ${IN_DER_LEISTE}.`,
        gilt: GILT_EINMAL,
        argumente: 'keine.',
    },
]

/** Die Befehle aus der Zeit vor den Einzelbefehlen; sie bleiben als Kurzform und sind angemeldet. */
export const KURZFORMEN: readonly Befehl[] = [
    {
        name: 'zusammenfassung',
        titel: 'Ein- und ausschalten',
        description: 'Die Zusammenfassung nach jeder Runde in diesem Chat aus- oder einschalten (Zusammenfassung)',
        was: 'Ohne Argument: schaltet die Zusammenfassung nach jeder Runde aus, wenn sie an ist, sonst ein. Das Replay bleibt in beiden Fällen.',
        knopf: 'keiner.',
        gilt: GILT_STANDARD,
        argumente: 'keine.',
    },
    {
        name: 'replay',
        titel: 'Replay',
        description: 'Jede Dateiänderung der letzten Runde Schritt für Schritt zeigen (Zusammenfassung)',
        was:
            'Ohne Argument: öffnet das Replay der letzten Runde im Seitenfenster, wie /zusammenfassung:replay, mit derselben Antwort. Ohne Änderungen sagt der Befehl das und öffnet nichts. ' +
            'Vom Handy kommt stattdessen eine Liste der Schritte als Text.',
        knopf: `${SYMBOL_REPLAY} ${IN_DER_LEISTE}.`,
        gilt: GILT_EINMAL,
        argumente: 'keine.',
    },
]

/**
 * Die alten Namen bis zusammenfassung 0.6: /zusammenfassung-aus statt /zusammenfassung:aus. Sie stehen
 * nicht mehr im Menue; wer einen tippt (eine alte Datei in ~/.claude/commands), erfaehrt den neuen.
 */
export const ALTE_BEFEHLE: ReadonlyMap<string, string> = new Map(BEFEHLE.map(b => [b.name.replace(':', '-'), b.name] as const))

/** Was ein alter Name antwortet: wie der Befehl jetzt heisst. */
export function neuerName(name: string): string {
    return `Der Befehl heißt jetzt /${name}.`
}

/** Ob das Argument nach der Hilfe fragt: hilfe oder ?. */
export function istHilfe(args: string): boolean {
    const a = args.trim().toLowerCase()
    return a === 'hilfe' || a === '?'
}

/** Die Hilfe eines Befehls: Name und Titel, was er tut, welcher Knopf, wie weit er wirkt, Argumente. */
export function hilfeText(b: Befehl): string {
    return [
        `/${b.name} · ${b.titel}`,
        `Was: ${b.was}`,
        `Button: ${b.knopf}`,
        `Gilt: ${b.gilt}`,
        `Argumente: ${b.argumente}`,
        ...(b.beispiel ? [`Beispiel: ${b.beispiel}`] : []),
    ].join('\n')
}

/** Was ein Befehl sagt, wenn er scheitert. */
export function fehlerText(name: string): string {
    return `Das hat nicht geklappt: /${name} ist an einem Fehler im Mod gescheitert. Versuch es gleich noch einmal.`
}

/** So heisst der Mod in Claude Code, wenn sich der Katalog nicht lesen laesst. */
const MOD_ID_STANDARD = 'zusammenfassung@bm-mods'

/**
 * Die volle ID eines Mods (`<name>@<katalog>`) aus `enabledPlugins` der Settings: die eingeschaltete,
 * sonst die erste. Null, wenn keine dabei ist (etwa bei `--plugin-dir`).
 */
export function modIdAus(eingeschaltet: unknown, name: string): string | null {
    if (typeof eingeschaltet !== 'object' || eingeschaltet === null) {
        return null
    }
    const werte = eingeschaltet as Record<string, unknown>
    const ids = Object.keys(werte).filter(k => k.startsWith(`${name}@`) && k !== `${name}@inline`)
    return ids.find(k => werte[k] === true) ?? ids[0] ?? null
}

/** Die volle ID dieses Mods, wie `claude plugin configure` sie braucht; null, wenn sie sich nicht lesen laesst. */
async function ladeModId($: EngineInterface): Promise<string | null> {
    try {
        return modIdAus(await $.settings.read({ key: 'enabledPlugins' }), 'zusammenfassung')
    } catch {
        return null
    }
}

/**
 * Alles, was /zusammenfassung:hilfe sagt. `id` ist die volle ID des Mods; ohne sie steht dort
 * zusammenfassung@bm-mods mit dem Hinweis auf den alten Katalognamen.
 */
export function uebersicht(id: string | null = null): string {
    const mod = id ?? MOD_ID_STANDARD
    const befehle = [...BEFEHLE, ...KURZFORMEN]
    return [
        'Zusammenfassung · Hilfe',
        '',
        'Was der Mod tut',
        'Zusammenfassung ist ein Mod, also eine Erweiterung für Claude Code. Nach jeder Runde (eine Antwort von Claude auf deine Nachricht, mit allem, was er dabei tut) ' +
            'steht in der Leiste über dem Eingabefeld eine kurze Zusammenfassung: eine Zeile, was Claude getan hat, und eine Zeile "Beachte:" mit dem, was man leicht übersieht. ' +
            'Dazu kommt das Replay: Es zeigt jede Änderung an deinen Dateien in dieser Runde Schritt für Schritt, mit den geänderten Zeilen.',
        '',
        'So arbeitest du damit',
        '- Lies nach einer Runde die zwei Zeilen in der Leiste. Zusammengefasst werden Runden, in denen Claude ein Werkzeug benutzt hat ' +
            '(etwa eine Datei gelesen oder geändert oder einen Befehl ausgeführt), und Runden, die mindestens 60 Sekunden gedauert haben (einstellbar, siehe Einstellen).',
        '- Neben "Zusammenfassung" steht etwa "5 Änderungen in 3 Dateien". Eine Änderung ist eine Stelle, die Claude in einer Datei geändert hat, oder eine Datei, die er ganz neu geschrieben hat.',
        `- ${SYMBOL_AUF} klappt auf: beide Zeilen ganz, eine längere Erklärung zum Hinweis und die geänderten Dateien mit der Zahl neuer (+) und entfernter (−) Zeilen. ` +
            `${SYMBOL_ZU} klappt wieder zu. Als Befehl: /zusammenfassung:aufklappen und /zusammenfassung:zuklappen.`,
        `- Ist über dem Eingabefeld wenig Platz, klappt sich die Zusammenfassung auf ihre Kopfzeile zu; ein Klick auf ${SYMBOL_AUF} öffnet sie bis zur nächsten Runde.`,
        `- ${SYMBOL_REPLAY} öffnet das Replay im Seitenfenster. ◀ Zurück und Weiter ▶ blättern durch die Schritte, die Zahlen oben zeigen, bei welchem du bist. ` +
            'Grün mit + sind neue Zeilen, rot mit - entfernte, blass die unveränderten drumherum; ⋯ steht für ausgelassene Zeilen. ' +
            'Im Terminal gehen auch die Tasten z (zurück), w (weiter) und s (schließen), Escape schließt das Fenster. Als Befehl: /replay.',
        '- /zusammenfassung ohne Argument schaltet die Zusammenfassung in diesem Chat aus, wenn sie an ist, sonst ein. ' +
            `Ist sie aus, steht nach einer Runde mit Dateiänderungen nur noch die Kopfzeile mit der Zahl der Änderungen und ${SYMBOL_REPLAY} in der Leiste; ` +
            'nach einer Runde ohne Dateiänderungen steht dort nichts. Das Replay geht weiter, auch mit /replay.',
        '',
        'Einstellen',
        'Nur in diesem Chat: /zusammenfassung (umschalten), /zusammenfassung:an und /zusammenfassung:aus.',
        'Standard für neue Chats:',
        '- Zusammenfassung: an oder aus (im Terminal true oder false). Eingebaut: an.',
        '- Modell für die Zusammenfassung: haiku, sonnet oder opus. Eingebaut: haiku. Im Chat nicht umstellbar.',
        '- Mindestdauer einer Runde (Sekunden): so lange muss eine Runde ohne Werkzeug dauern, damit sie zusammengefasst wird. Eingebaut: 60. Im Chat nicht umstellbar.',
        'Haiku, Sonnet und Opus sind Modelle von Claude, von klein und günstig bis groß.',
        `Sag Claude zum Beispiel: Stell bei Zusammenfassung den Standard für neue Chats: Zusammenfassung auf aus. Claude macht das mit \`claude plugin configure ${mod}\`. ` +
            `Im Terminal geht es auch selbst: \`claude plugin configure ${mod}\` zeigt die Optionen. ` +
            `Setzen geht mit \`--values-stdin\`, etwa \`echo '{"an": false}' | claude plugin configure ${mod} --values-stdin\`. ` +
            'Das gilt für Chats, die danach beginnen. "not set" heißt dort: Es gilt der eingebaute Standard.',
        `Ganz abschalten: \`claude plugin disable ${mod}\` (wieder an mit \`enable\`), oder sag Claude, er soll den Mod abschalten. Das wirkt nach einem Neustart von Claude Code.`,
        ...(id === null ? ['Ältere Installationen heißen `zusammenfassung@bjoern-mods`; `claude plugin list` zeigt den Namen.'] : []),
        '',
        'Kosten',
        'Jede zusammengefasste Runde kostet einen Aufruf des eingestellten Modells (eingebaut Haiku): Es liest die letzten zehn Nachrichten und schreibt zwei Zeilen. ' +
            'Das sind Tokens (die Einheit, in der Claude liest und schreibt; sie zählen gegen dein Nutzungslimit). ' +
            'Aufklappen kostet einen zweiten, kleinen Aufruf für die Erklärung, nur wenn es einen Hinweis gibt. ' +
            'Der Aufruf läuft auch, wenn du nur vom Handy schreibst und die Zeilen nie siehst. ' +
            'Ist die Zusammenfassung aus, kostet sie nichts; das Replay kostet nie etwas.',
        '',
        'Vom Handy (Remote Control)',
        'Dort gibt es keine Leiste und keine Buttons, also auch die zwei Zeilen nicht: Die gibt es nur am Rechner. ' +
            '/replay und /zusammenfassung:replay schicken dir die Schritte des Replays als Liste. Ein- und ausschalten geht auch vom Handy; ' +
            'wenn du dort nur liest, spart /zusammenfassung:aus die Aufrufe.',
        '',
        'Befehle',
        'Befehlsnamen schreiben Umlaute als ae, oe, ue und ss.',
        ...befehle.map(z => `/${z.name} · ${z.description.replace(/ \(Zusammenfassung\)$/, '')}`),
        'Mehr zu jedem Befehl: hilfe dahinter, etwa /zusammenfassung:replay hilfe.',
    ].join('\n')
}

/** Was ein Befehl tut; zurueck kommt die Antwort. */
async function wirke($: EngineInterface, name: string, modell: string, vomHandy: boolean): Promise<string> {
    switch (name) {
        case 'zusammenfassung:hilfe':
            return uebersicht(await ladeModId($))
        case 'zusammenfassung:an':
            await setzeAus($, false)
            return 'Die Zusammenfassung ist in diesem Chat an.'
        case 'zusammenfassung:aus':
            await setzeAus($, true)
            return `Die Zusammenfassung ist in diesem Chat aus. Das Replay bleibt: ${SYMBOL_REPLAY} oder /replay.`
        case 'zusammenfassung:aufklappen':
            return klappeNach($, modell, true)
        case 'zusammenfassung:zuklappen':
            return klappeNach($, modell, false)
        case 'zusammenfassung:replay':
            return replayBefehl($, vomHandy)
        default:
            throw new Error(`kein Befehl ${name}`)
    }
}

export const register: Register = (on, options) => {
    const modell = String(options.modell || 'haiku')
    const mindestMs = Math.max(0, Number(options.mindestSekunden ?? 60)) * 1000
    /** Der Standard fuer neue Chats; /zusammenfassung schaltet nur im Chat um. */
    const standardAus = options.an === false

    /** Werkzeugaufrufe in der laufenden Runde. */
    let werkzeuge = 0

    on('session.start', async ($, e, next) => {
        const r = await next(e)
        // Die Desktop-App holt ihre Befehlsliste, bevor dieser Hook laeuft. Damit die
        // Befehle nicht als unbekannt gelten, liegen gleichnamige Befehlsdateien in
        // ~/.claude/commands; den Lauf beantwortet trotzdem dieser Mod. Angemeldet werden
        // nur die Kurzformen; die Einzelbefehle /zusammenfassung:… sind Dateien in commands/.
        for (const k of KURZFORMEN) {
            await $.command.register({ name: k.name, description: k.description, immediate: true }).catch(() => {})
        }
        const sid = await $.session.id()
        const jetzt = await $.clock.now()
        const aus = await ladeAus($, sid, standardAus, jetzt)
        await update($, isAus, () => aus)
        await raeumeChatsAuf($, sid, jetzt)
        return r
    })

    // Die Engine setzt die Namen der Mods vor jede Befehlsantwort. Dieser Mod streicht in der
    // gespeicherten Zeile seinen und sagt stattdessen am Ende, dass die Antwort von ihm kommt.
    on('session.append', { door: 'command', message: { type: 'system', name: 'local_command' } }, async ($, e, next) => {
        const content = e.message.content.map(b => (b.type === 'text' && typeof b.text === 'string' ? { ...b, text: ohneVorsatz(b.text, 'zusammenfassung', GEMELDET) } : b))
        return next({ ...e, message: { ...e.message, content } })
    }).catch(($, e, next) => next(e))

    // Die Kurzformen: hilfe oder ? zeigt ihre Hilfe und schaltet nichts um.
    const [kurzUmschalten, kurzReplay] = KURZFORMEN as [Befehl, Befehl]
    on('command.run', { command: 'zusammenfassung' }, async ($, e) => {
        if (istHilfe(e.args)) {
            return { text: hilfeText(kurzUmschalten) }
        }
        const aus = !(await read($, isAus))
        await setzeAus($, aus)
        return {
            text: aus
                ? 'Die Zusammenfassung ist in diesem Chat aus, das Replay bleibt. /zusammenfassung schaltet sie wieder ein.'
                : 'Die Zusammenfassung ist in diesem Chat an.',
        }
    })

    on('command.run', { command: 'replay' }, async ($, e) => {
        if (istHilfe(e.args)) {
            return { text: hilfeText(kurzReplay) }
        }
        // Wie /zusammenfassung:replay, mit derselben Antwort; vom Handy (Remote Control) als Liste, ohne Fenster.
        return { text: await replayBefehl($, (e.origin as { kind?: string } | undefined)?.kind === 'bridge') }
    })

    // Die Einzelbefehle: jeder versteht hilfe und ?, und ein Fehler wird ein schlichter Satz.
    for (const b of BEFEHLE) {
        on('command.run', { command: b.name }, async ($, e) => {
            if (istHilfe(e.args)) {
                return { text: hilfeText(b) }
            }
            try {
                // Vom Handy (Remote Control) geht kein Fenster auf.
                const vomHandy = (e.origin as { kind?: string } | undefined)?.kind === 'bridge'
                return { text: await wirke($, b.name, modell, vomHandy) }
            } catch {
                return { text: fehlerText(b.name) }
            }
        }).catch(() => ({ text: fehlerText(b.name) }))
    }

    // Ein alter Name (/zusammenfassung-aus, aus einer alten Datei in ~/.claude/commands) sagt nur den neuen.
    const alterName = (e: { command: string }) => ({ text: neuerName(ALTE_BEFEHLE.get(e.command) ?? e.command) })
    on('command.run', { command: [...ALTE_BEFEHLE.keys()] }, async (_$, e) => alterName(e)).catch((_$, e) => alterName(e))

    // Eine neue Runde beginnt die Aufzeichnung von vorn. Die Zusammenfassung der
    // letzten Arbeitsrunde bleibt stehen, bis eine neue Arbeitsrunde sie ersetzt.
    on('turn.start', async ($, e, next) => {
        if (!e.agentId) {
            werkzeuge = 0
            await update($, laufend, () => [])
            // Aufgeklappt gilt nur bis zur naechsten Runde, wie die Hilfe sagt; danach entscheidet
            // wieder der Platz im Band, ob die Zusammenfassung zwei Zeilen oder nur die Kopfzeile zeigt.
            await update($, istOffen, () => false)
        }
        return next(e)
    })

    // Jede Dateiaenderung aufzeichnen und dann laufen lassen: nie blockieren, nie aendern.
    on('tool.call', async ($, e, next) => {
        werkzeuge += 1
        if (BEARBEITER.has(e.tool)) {
            try {
                const neu = await schritteAus($, e.tool, e as unknown as Record<string, unknown>)
                await update($, laufend, l => (l.length < SCHRITTE_MAX ? [...l, ...neu].slice(0, SCHRITTE_MAX) : l))
            } catch {
                // Aufzeichnen darf die Aenderung nie aufhalten.
            }
        }
        return next(e)
    }).catch(($, e, next) => next(e))

    on('turn.complete', async ($, e, next) => {
        const r = await next(e)
        if (e.agentId) {
            return r
        }
        const s = await read($, laufend)
        await update($, laufend, () => [])
        // Nur Runden, in denen gearbeitet wurde: mit Werkzeugen, oder lang genug.
        // Eine reine Antwort kostet nichts und laesst Zusammenfassung und Replay
        // der letzten Arbeitsrunde stehen.
        if (werkzeuge === 0 && s.length === 0 && e.durationMs < mindestMs) {
            return r
        }
        await update($, schritte, () => s)
        await update($, index, () => 0)
        await update($, istOffen, () => false)
        if (e.reason !== 'answer' || (await read($, isAus))) {
            // Abgebrochen oder aus: die alte Zusammenfassung passte nicht mehr zum Replay.
            await update($, bericht, () => null)
            return r
        }
        await update($, bericht, () => ({
            turnId: e.turnId,
            schreibt: true,
            getan: null,
            beachte: null,
            erklaerung: null,
            holtErklaerung: false,
        }))
        void fasseZusammen($, modell, e.turnId, e.answer, s).catch(() => {})
        return r
    })

    // Was dieses Laden zuletzt als Hoehe im Band veroeffentlicht oder geplant hat (meldeBandHoehe).
    const band: BandMerker = { veroeffentlicht: new Map(), geplant: new Map() }

    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
        const rest = await next(e)
        if (e.props.hasSurvey || e.props.isWorking) {
            meldeBandHoehe($, band, e.surface, { voll: 0, klein: 0 })
            return rest
        }
        const b = await read($, bericht)
        const s = await read($, schritte)
        const hatBericht = b !== null && (b.schreibt || b.getan !== null || b.beachte !== null)
        if (!hatBericht && s.length === 0) {
            meldeBandHoehe($, band, e.surface, { voll: 0, klein: 0 })
            return rest
        }
        // Aufgeklappt hat sie nur die Person, in dieser Runde (turn.start klappt zu).
        const offen = await read($, istOffen)

        const elemente = $.ui.resolve(e)
        const { Box, Button, Text } = elemente
        // Bilder zeichnet nur die App; das Terminal fuehrt Svg zwar, zeichnet es aber nicht.
        const Svg = e.surface === 'desktop' && 'Svg' in elemente ? elemente.Svg : null
        // Zu: im Terminal hoechstens zwei Zeilen, der Mod kuerzt nach Zellen mit etwas Abstand zum
        // Rand, die letzte endet mit "...". In der App kann der Mod die Breite nicht messen: jede
        // Zeile ist ein einzelner Text mit truncate-end, und der Block bekommt die Breite des Bands
        // (wie bei GlanceFlow), damit die App an der echten Kante kuerzt.
        // Auf: alles umbrochen und ungekuerzt.
        const inApp = e.surface === 'desktop'
        const umbruch = offen ? ('wrap' as const) : ('truncate-end' as const)
        // In der App: die Breite des Bands fuer den Block und die Hinweis-Zeile.
        const appBreite = inApp ? Math.max(20, e.props.bodyColumns) : undefined
        // Der Block beginnt ohne Einrueckung am linken Rand; rechts bleibt ABSTAND_RAND frei.
        const breite = Math.max(20, e.props.bodyColumns - ABSTAND_RAND)
        const anzahl = s.length > 0 ? aenderungenText(s) : 'keine Dateiänderungen'
        const beachteBreite = breite - BEACHTE.length

        let zeilen: RenderElement[] = []
        if (b?.schreibt) {
            zeilen = [
                <Text key="zf-z1" dimColor>
                    schreibt die Zusammenfassung …
                </Text>,
            ]
        } else if (b) {
            // Im Terminal darf das Getane ohne Hinweis zwei Zeilen fuellen, mit Hinweis eine.
            // In der App immer eine Zeile, ungekuerzt; die App kuerzt sie an der Kante.
            const getan =
                b.getan === null
                    ? []
                    : offen || inApp
                      ? [b.getan]
                      : zeilenUmbruch(b.getan, breite, b.beachte ? 1 : 2)
            zeilen = getan.map((z, i) => (
                <Text key={`zf-z1-${i}`} wrap={umbruch}>
                    {z}
                </Text>
            ))
            if (b.beachte && inApp && !offen) {
                // Ein zusammengesetzter Text kuerzt in der App nicht, er bricht um. Darum zwei
                // Kaesten nebeneinander: links "Beachte:" fest, rechts der Hinweis als ein Text,
                // der schrumpfen darf und an der Kante gekuerzt wird.
                zeilen.push(
                    <Box key="zf-z2" flexDirection="row" gap={1} width={appBreite}>
                        <Box flexShrink={0}>
                            <Text color="warning" bold>
                                Beachte:
                            </Text>
                        </Box>
                        <Box flexGrow={1} flexShrink={1} minWidth={0}>
                            <Text wrap="truncate-end">{b.beachte}</Text>
                        </Box>
                    </Box>,
                )
            } else if (b.beachte) {
                zeilen.push(
                    <Text key="zf-z2" wrap={umbruch}>
                        <Text color="warning" bold>
                            {BEACHTE}
                        </Text>
                        <Text>{offen ? b.beachte : kuerze(b.beachte, beachteBreite)}</Text>
                    </Text>,
                )
            }
        }

        // Aufgeklappt: die Erklaerung zum Hinweis und die geaenderten Dateien.
        const erklaerung =
            offen && b?.beachte ? (
                b.erklaerung ? (
                    <Text key="zf-erklaerung" dimColor wrap="wrap">
                        {b.erklaerung}
                    </Text>
                ) : b.holtErklaerung ? (
                    <Text key="zf-erklaerung" dimColor>
                        holt die Erklärung …
                    </Text>
                ) : null
            ) : null
        const dateien = offen
            ? dateienAus(s).map((d, i) => (
                  <Text key={`zf-datei-${i}`} wrap="truncate-start">
                      <Text>{`${d.datei} `}</Text>
                      <Text color="success">{`+${d.plus}`}</Text>
                      <Text> </Text>
                      <Text color="error">{`−${d.minus}`}</Text>
                  </Text>
              ))
            : []

        const kopf = (
            <Box key="zf-kopf" flexDirection="row" alignItems="center" gap={1}>
                <Text bold color="claude">
                    Zusammenfassung
                </Text>
                {/* Das Zeichen als Label: die App zeichnet keinen Inhalt in Knoepfen, nur das Label, und das ohne eigene Farbe. */}
                <Button key="zf-auf" label={offen ? SYMBOL_ZU : SYMBOL_AUF} onPress={() => void klappe($, modell).catch(() => {})} />
                {/* Zwischen den Knoepfen, was die Runde an Dateien geaendert hat. */}
                <Text key="zf-anzahl" dimColor>
                    {anzahl}
                </Text>
                {/* Immer da; ohne Aenderungen sagt das Fenster, dass es nichts zu zeigen gibt. */}
                <Button key="zf-replay" label={SYMBOL_REPLAY} onPress={() => void oeffneReplay($, true).catch(() => {})} />
            </Box>
        )

        // Ueber der Zusammenfassung ein Trennstrich: in der App 1 Pixel mit je 7 Pixeln Luft,
        // im Terminal eine blasse Zeile aus Strichen.
        const trennlinie = Svg ? (
            <Box key="zf-trennlinie">
                <Svg source={TRENNLINIE_SVG} alt="Trennlinie" height={15} />
            </Box>
        ) : (
            <Text key="zf-trennlinie" dimColor wrap="truncate-end">
                {'─'.repeat(Math.max(0, e.props.bodyColumns))}
            </Text>
        )
        // Klein: nur Trennlinie und Kopfzeile.
        const kleinerBlock = (
            <Box key="zusammenfassung" flexDirection="column" width={appBreite}>
                {trennlinie}
                <Box flexDirection="column" width={appBreite}>
                    {kopf}
                </Box>
            </Box>
        )
        const vollerBlock = (
            <Box key="zusammenfassung" flexDirection="column" width={appBreite}>
                {trennlinie}
                {/* Die Breite auch hier: ob die App sie vom Block uebernimmt, ist nicht sicher. */}
                <Box flexDirection="column" width={appBreite}>
                    {kopf}
                    {/* Nur in der App: Die Buttons der Kopfzeile ragen 4 px ueber ihre Zeile hinaus
                        und beruehren sonst die erste Textzeile. Senkrechte Zahlen zaehlen dort halbe
                        Zeilen zu 10 px, 0.2 sind also 2 px mehr Luft. Im Terminal gibt es keinen
                        Bruchteil einer Zeile, dort bleibt alles wie es ist. */}
                    {inApp && (zeilen.length > 0 || erklaerung) ? (
                        <Box key="zf-text" flexDirection="column" marginTop={0.2}>
                            {zeilen}
                            {erklaerung}
                        </Box>
                    ) : (
                        [...zeilen, erklaerung]
                    )}
                    {dateien.length > 0 ? (
                        <Box key="zf-dateien" flexDirection="column" marginTop={1}>
                            {dateien}
                        </Box>
                    ) : null}
                </Box>
            </Box>
        )
        // Die Hoehe fuer die anderen Mods: voll wie der Block ohne Platzmangel, klein nur die Kopfzeile.
        // Von Hand aufgeklappt laesst sie sich nicht klein machen, dann ist klein gleich voll.
        const voll = zeilenVon(vollerBlock, e.surface, e.props.bodyColumns)
        const eigene = { voll, klein: offen ? voll : zeilenVon(kleinerBlock, e.surface, e.props.bodyColumns) }
        meldeBandHoehe($, band, e.surface, eigene)
        // Ist im Band wenig Platz (hooks/band.ts), steht nur die Kopfzeile; von Hand aufgeklappt bleibt sie offen.
        const plan = plane(bandBudget(e.surface, e.props), e.surface, {
            ...(await fremdeHoehen($, e.surface)),
            zusammenfassung: { v: BAND_VERSION, ...eigene },
        })
        const block = plan.zusammenfassungKlein && !offen ? kleinerBlock : vollerBlock
        return rest ? (
            <Box flexDirection="column">
                {block}
                {rest}
            </Box>
        ) : (
            block
        )
    })

    // Das Replay: ein Schritt nach dem anderen, mit Diff in Rot und Gruen.
    on('ui.render', { component: 'Pane', requestId: FENSTER }, async ($, e) => {
        const { Box, Button, Text } = $.ui.resolve(e)
        const s = await read($, schritte)
        if (s.length === 0) {
            return <Text dimColor>Keine Dateiänderungen in der letzten Runde.</Text>
        }
        const k = Math.max(0, Math.min(await read($, index), s.length - 1))
        const schritt = s[k]!
        const breite = Math.max(20, e.props.bodyColumns)
        const { plus, minus } = zaehle(schritt.diff)
        const gezeigt = schritt.diff.slice(0, DIFF_ZEIGEN)
        const zeilen = gezeigt.map((z, n) => (
            <Text
                key={`zf-d${n}`}
                color={z.op === '+' ? 'success' : z.op === '-' ? 'error' : undefined}
                dimColor={z.op === ' ' || z.op === '~'}
                wrap="truncate-end"
            >
                {`${z.op === '~' ? ' ' : z.op} ${z.t}`.slice(0, breite)}
            </Text>
        ))
        if (schritt.diff.length > DIFF_ZEIGEN) {
            zeilen.push(
                <Text key="zf-mehr-zeilen" dimColor>
                    {`  … ${schritt.diff.length - DIFF_ZEIGEN} Zeilen mehr`}
                </Text>,
            )
        }
        if (gezeigt.length === 0) {
            zeilen.push(
                <Text key="zf-leer" dimColor>
                    {'  (keine Zeilen geändert)'}
                </Text>,
            )
        }
        // Die App zeichnet fuer ein Fenster ihr eigenes Schliessen, das Terminal braucht den Knopf.
        const imTerminal = e.surface === 'terminal'
        return (
            <Box flexDirection="column">
                <Box flexDirection="row" justifyContent="space-between">
                    <Text bold color="claude">
                        {`${SYMBOL_REPLAY} Replay`}
                    </Text>
                    <Text bold>{`Schritt ${k + 1} von ${s.length}`}</Text>
                </Box>
                <Text wrap="wrap">
                    {s.map((_, n) => (
                        <Text key={`zf-s${n}`} inverse={n === k} color={n === k ? 'claude' : undefined} dimColor={n !== k}>
                            {` ${n + 1} `}
                        </Text>
                    ))}
                </Text>
                <Text bold color="claude" wrap="truncate-start">
                    {schritt.datei}
                </Text>
                <Box flexDirection="row" gap={2}>
                    <Text dimColor>{schrittArt(schritt)}</Text>
                    <Text color="success">{`+${plus}`}</Text>
                    <Text color="error">{`−${minus}`}</Text>
                </Box>
                <Box flexDirection="column" marginTop={1}>
                    {zeilen}
                </Box>
                <Box flexDirection="row" gap={2} marginTop={1}>
                    <Button key="zf-zurueck" label="◀ Zurück" hotkey="z" onPress={() => void gehe($, k - 1)} />
                    <Button key="zf-weiter" label="Weiter ▶" hotkey="w" onPress={() => void gehe($, k + 1)} />
                    {imTerminal ? (
                        <Button key="zf-schliessen" label="Schließen" hotkey="s" role="dismiss" onPress={() => void $.ui.close({ id: FENSTER })} />
                    ) : null}
                </Box>
            </Box>
        )
    })
}
