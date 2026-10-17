// Zusammenfassung: Zweiter Blick und Replay in einem Block ueber dem Eingabefeld.
//
// Nach jeder Arbeitsrunde liest ein kleines Modell das Ende der Runde und schreibt zwei
// Zeilen: was getan wurde, und was man leicht uebersieht (das war der Zweite Blick).
// Daneben zeichnet der Mod jede Dateiaenderung der Runde auf; der Kreispfeil oeffnet
// ein Fenster, das sie Schritt fuer Schritt zeigt (das war Replay Theater von Anthropic,
// Apache-2.0). Der Chevron klappt den Block auf: beide Zeilen ungekuerzt, die Erklaerung
// zum Hinweis und die geaenderten Dateien.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { Bericht, DiffZeile, Schritt } from '../types'

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

/** Schluessel im Speicher: ob die Zusammenfassung aus ist. */
const SPEICHER_AUS = 'zusammenfassung.aus'

/** Die Zeichen auf den Knoepfen: Dreieck zum Auf- und Zuklappen, Kreispfeil fuer das Replay. */
const SYMBOL_AUF = '⏷'
const SYMBOL_ZU = '⏶'
const SYMBOL_REPLAY = '⟲'

/** So viele Zeichen bleibt der gekuerzte Text vom rechten Rand des Bands weg. */
const ABSTAND_RAND = 2
/** Was vor dem Hinweis steht. */
const BEACHTE = 'Beachte: '

/** Wie bei Statistik und Naechste-Schritte: 7 Pixel hoch, die Linie 1 Pixel in der Mitte. */
const TRENNLINIE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="7" viewBox="0 0 4000 7" preserveAspectRatio="none">' +
    '<rect x="0" y="3" width="4000" height="1" fill="#8a8a8a" fill-opacity="0.5"/></svg>'

const bericht = atom({ plugin: 'zusammenfassung', key: 'bericht' } as const, null as Bericht | null)
const schritte = atom({ plugin: 'zusammenfassung', key: 'schritte' } as const, [] as Schritt[])
// Die Aenderungen der laufenden Runde. In `$.state`, nicht im Modul: wird der Mod
// mitten in der Runde neu geladen (ein Update), gehen sie so nicht verloren.
const laufend = atom({ plugin: 'zusammenfassung', key: 'laufend' } as const, [] as Schritt[])
const index = atom({ plugin: 'zusammenfassung', key: 'index' } as const, 0)
const istOffen = atom({ plugin: 'zusammenfassung', key: 'istOffen' } as const, false)
const isAus = atom({ plugin: 'zusammenfassung', key: 'isAus' } as const, false)
const letzter = atom({ plugin: 'zusammenfassung', key: 'letzter' } as const, null as string | null)

const SYSTEM =
    'Du fasst eine Arbeitsrunde eines KI-Assistenten fuer die Person zusammen, fuer die er arbeitet. ' +
    'Du bekommst das Ende der Runde: die letzten Nachrichten, die letzte Antwort des Assistenten und die geaenderten Dateien. ' +
    'Antworte mit genau zwei Zeilen, auf Deutsch, ohne Anrede, ohne Einleitung, ohne Aufzaehlungszeichen und ohne Beschriftung.\n' +
    'Zeile 1: was in der Runde getan wurde und mit welchem Ergebnis, konkret (Datei, Funktion, Test), hoechstens 120 Zeichen.\n' +
    'Zeile 2: eine Sache, die die Person wissen sollte und leicht uebersieht: eine stille Annahme des Assistenten, ' +
    'ein Nebeneffekt, den er nicht erwaehnt, ein Abweichen von dem, was die Person vorher gesagt hat, ' +
    'oder ein Schritt, der nur behauptet und nicht geprueft wurde. Hoechstens 160 Zeichen, nichts, was der Assistent selbst schon gesagt hat. ' +
    'Gibt es nichts dergleichen, steht in Zeile 2 nur das Wort NONE.\n' +
    'Kein Lob, keine Bewertung, keine Gedankenstriche.'

const SYSTEM_MEHR =
    'Du hast der Person eben einen kurzen Hinweis zu einer Arbeitsrunde eines KI-Assistenten gegeben. ' +
    'Erklaere ihn jetzt ausfuehrlicher: worauf er sich im Verlauf stuetzt, was daraus folgen kann, und was die Person tun koennte. ' +
    'Hoechstens 150 Woerter, auf Deutsch, ohne Anrede, ohne Aufzaehlung, ohne Gedankenstriche.'

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
        return [{ werkzeug: 'Write', datei, diff: diff(vorher, x.content), notiz: istNeu ? 'neue Datei' : 'ueberschrieben' }]
    }
    return []
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

/** Die Nachrichten der Runde als Text, wie das Modell sie bekommt. */
function verlauf(nachrichten: readonly { role: string; text: string }[], antwort: string, s: readonly Schritt[]): string {
    const zeilen = nachrichten
        .filter(m => m.text.trim() !== '')
        .slice(-NACHRICHTEN)
        .map(m => `[${m.role === 'user' ? 'Person' : 'Assistent'}] ${m.text.slice(0, ZEICHEN_JE_NACHRICHT)}`)
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

export const register: Register = (on, options) => {
    const modell = String(options.modell || 'haiku')
    const mindestMs = Math.max(0, Number(options.mindestSekunden ?? 60)) * 1000

    /** Werkzeugaufrufe in der laufenden Runde. */
    let werkzeuge = 0

    on('session.start', async ($, e, next) => {
        const r = await next(e)
        // Die Desktop-App holt ihre Befehlsliste, bevor dieser Hook laeuft. Damit die
        // Befehle nicht als unbekannt gelten, liegen gleichnamige Befehlsdateien in
        // ~/.claude/commands; den Lauf beantwortet trotzdem dieser Mod.
        await $.command
            .register({
                name: 'zusammenfassung',
                description: 'Die Zusammenfassung nach jeder Arbeitsrunde aus- oder einschalten; das Replay bleibt (Zusammenfassung)',
                immediate: true,
            })
            .catch(() => {})
        await $.command
            .register({
                name: 'replay',
                description: 'Die Dateiaenderungen der letzten Runde Schritt fuer Schritt zeigen (Zusammenfassung)',
                immediate: true,
            })
            .catch(() => {})
        const aus = (await $.store.get(SPEICHER_AUS)) === true
        await update($, isAus, () => aus)
        return r
    })

    on('command.run', { command: 'zusammenfassung' }, async $ => {
        const aus = await update($, isAus, v => !v)
        await $.store.set(SPEICHER_AUS, aus)
        if (aus) {
            await update($, bericht, () => null)
        }
        return {
            text: aus
                ? 'Die Zusammenfassung ist aus, das Replay bleibt. Derselbe Befehl schaltet sie wieder ein.'
                : 'Die Zusammenfassung ist an.',
        }
    })

    on('command.run', { command: 'replay' }, async $ => {
        const s = await read($, schritte)
        if (!(await oeffneReplay($))) {
            return { text: 'Replay: keine Dateiänderungen in der letzten Runde.' }
        }
        return { text: `Replay: ${aenderungenText(s)}` }
    })

    // Eine neue Runde beginnt die Aufzeichnung von vorn. Die Zusammenfassung der
    // letzten Arbeitsrunde bleibt stehen, bis eine neue Arbeitsrunde sie ersetzt.
    on('turn.start', async ($, e, next) => {
        if (!e.agentId) {
            werkzeuge = 0
            await update($, laufend, () => [])
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

    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
        const rest = await next(e)
        if (e.props.hasSurvey || e.props.isWorking) {
            return rest
        }
        const b = await read($, bericht)
        const s = await read($, schritte)
        const hatBericht = b !== null && (b.schreibt || b.getan !== null || b.beachte !== null)
        if (!hatBericht && s.length === 0) {
            return rest
        }
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

        // Ueber der Zusammenfassung ein Trennstrich: in der App 1 Pixel mit je 3 Pixeln Luft,
        // im Terminal eine blasse Zeile aus Strichen.
        const trennlinie = Svg ? (
            <Box key="zf-trennlinie">
                <Svg source={TRENNLINIE_SVG} alt="Trennlinie" height={7} />
            </Box>
        ) : (
            <Text key="zf-trennlinie" dimColor wrap="truncate-end">
                {'─'.repeat(Math.max(0, e.props.bodyColumns))}
            </Text>
        )
        const block = (
            <Box key="zusammenfassung" flexDirection="column" width={appBreite}>
                {trennlinie}
                {/* Die Breite auch hier: ob die App sie vom Block uebernimmt, ist nicht sicher. */}
                <Box flexDirection="column" width={appBreite}>
                    {kopf}
                    {zeilen}
                    {erklaerung}
                    {dateien.length > 0 ? (
                        <Box key="zf-dateien" flexDirection="column" marginTop={1}>
                            {dateien}
                        </Box>
                    ) : null}
                </Box>
            </Box>
        )
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
                    <Text dimColor>{`${schritt.werkzeug}${schritt.notiz ? ` · ${schritt.notiz}` : ''}`}</Text>
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
