// Prompt-Upgrade: macht aus einem groben Prompt einen guten, bevor er rausgeht.
//
// /better <Prompt> (oder bei eingeschalteter Automatik ein am Rechner getippter
// Prompt) oeffnet ein Seitenfenster: ein schnelles Modell stellt bis zu drei
// Rueckfragen, schreibt den Prompt um und zeigt Original und Upgrade
// nebeneinander. Gesendet wird erst mit Ausfuehren, und zwar vom Mod selbst,
// als Plugin-Prompt: der kommt nie wieder ins Fenster, weil die Automatik nur
// Getipptes (`composer`) abfaengt. Nachrichten vom Handy (`bridge`) gehen immer
// unveraendert durch, denn dort ist das Fenster nicht zu sehen.
//
// Gezeichnet wird nur aus `$.state`; geschrieben wird nur aus Befehlen, Druecken
// und Ereignissen. Wird das Modul mitten in einem Modellaufruf neu geladen,
// nimmt `session.start` den Schritt wieder auf.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptOrigin, Register, UiOpenResult, UiPressArgument } from 'claude-code'

import type { PromptUpgradeAblauf, PromptUpgradeAntwort, PromptUpgradeEintrag } from '../types'
import { zeichne } from './ansicht'
import type { Aktionen, Kit } from './ansicht'
import {
    SYSTEM_FRAGEN,
    SYSTEM_UMSCHREIBEN,
    einzeilig,
    entscheide,
    istAbdeckung,
    kuerze,
    leseFragen,
    leseUmschrift,
    promptFragen,
    promptUmschreiben,
    woerter,
} from './logik'

export const PANE = 'prompt-upgrade'
export const BEFEHL = 'better'

/** Die letzten so vielen Upgrades bleiben im Verlauf. */
export const VERLAUF_MAX = 20

/** Schluessel im Speicher: die Automatik je Chat, `{ at, isOn }` unter `automatik:<Sitzungs-ID>`. */
export const SPEICHER_AUTOMATIK = 'automatik:'
/** Wann zuletzt alte Chat-Schluessel weggeraeumt wurden. */
const SPEICHER_AUFGERAEUMT = 'automatik.aufgeraeumt'
/** Der Verlauf, neueste zuerst, fuer alle Chats. */
export const SPEICHER_VERLAUF = 'verlauf'
/** Chat-Schluessel, die so lange nicht beruehrt wurden, fliegen raus. */
const CHAT_HALTBAR_MS = 30 * 24 * 60 * 60_000
/** Hoechstens so oft wird aufgeraeumt und ein Chat-Schluessel als beruehrt markiert. */
const TAG_MS = 24 * 60 * 60_000

/** So lange nach dem Absenden kommt ein Prompt zurueck ins Eingabefeld (wie im Leitstand). */
const ZURUECK_NACH_MS = 50

/** Was beim Abfangen als Grund erscheint: kurz, die Person sieht ja das Fenster. */
export const GRUND_ABGEFANGEN = 'Liegt zum Verbessern im Seitenfenster.'
export const TEXT_AN = 'Automatik in diesem Chat an. Am Rechner getippte Prompts gehen erst ins Seitenfenster; mit > am Anfang gehen sie direkt raus.'
export const TEXT_AUS = 'Automatik in diesem Chat aus.'
export const TEXT_OFFEN = 'Dein Prompt liegt im Seitenfenster.'
export const TEXT_EINGABE = 'Seitenfenster offen, tipp deinen Prompt dort ein.'
export const TEXT_HANDY = 'Prompt-Upgrade braucht das Seitenfenster am Rechner. Vom Handy aus gehen /better an, /better aus und /better verlauf. Gesendet wurde nichts.'
export const TEXT_FEHLER = 'Das hat nicht geklappt. Gesendet wurde nichts; versuch es noch einmal.'
export const TEXT_ZU_SCHMAL = 'Das Seitenfenster passt hier gerade nicht hin; dein Prompt steht wieder im Eingabefeld.'

const ablauf = atom({ plugin: 'prompt-upgrade', key: 'ablauf' } as const, null as PromptUpgradeAblauf | null)
const verlauf = atom({ plugin: 'prompt-upgrade', key: 'verlauf' } as const, [] as PromptUpgradeEintrag[])
const zeigeVerlauf = atom({ plugin: 'prompt-upgrade', key: 'zeigeVerlauf' } as const, false)

/** Den Durchlauf aendern: liest, wendet `f` an, schreibt; wie `update`, nur mit festem Typ. */
function aendere($: EngineInterface, f: (a: PromptUpgradeAblauf | null) => PromptUpgradeAblauf | null): Promise<PromptUpgradeAblauf | null> {
    return update($, ablauf, f)
}

/** Eine Kennung, ohne Uhr und ohne Krypto. */
function neueId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Diese Modul-Umgebung. Nach einem Neuladen ist sie eine andere: ein
 * Modellaufruf, den eine andere Umgebung gestartet hat, laeuft nicht mehr.
 */
const UMGEBUNG = neueId()

/** Die laufenden Modellaufrufe dieser Umgebung, damit Abbrechen sie stoppt. */
const auftraege = new Map<string, AbortController>()

/** Ob gerade eine Runde der Hauptschleife laeuft, aus `turn.start` und `turn.complete`. */
let arbeitet = false

/** Die Einstellungen, wie `register` sie bekam. */
const einstellungen = { modell: 'haiku', automatik: false }

function stoppeAuftraege(): void {
    for (const c of auftraege.values()) {
        c.abort()
    }
    auftraege.clear()
}

function neuerAblauf(id: string, schritt: PromptUpgradeAblauf['schritt'], original: string): PromptUpgradeAblauf {
    return {
        id,
        schritt,
        original,
        fragen: [],
        antworten: [],
        keineFragen: false,
        andersOffen: null,
        upgrade: '',
        ergaenzt: [],
        abdeckung: null,
        bearbeiten: false,
        entwurf: '',
        kopiert: null,
        fehler: null,
        lauf: null,
        umgebung: UMGEBUNG,
        ausVerlauf: false,
    }
}

function fehlerText(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

/** Ein Satz, warum das Modell keinen Text lieferte. */
function grundAus(r: { reason: string; status?: number | null; error?: string }): string {
    if (r.reason === 'api-error') {
        const status = typeof r.status === 'number' ? ` (Status ${r.status}${r.error ? `, ${r.error}` : ''})` : ''
        return `Der Dienst hat mit einem Fehler geantwortet${status}.`
    }
    if (r.reason === 'aborted') {
        return 'Die Anfrage hat zu lange gedauert und wurde abgebrochen.'
    }
    if (r.reason === 'empty-reply') {
        return 'Das Modell hat nichts geantwortet.'
    }
    return 'Das Modell hat nicht geantwortet.'
}

// --- Verlauf ---

function istEintrag(v: unknown): v is PromptUpgradeEintrag {
    if (typeof v !== 'object' || v === null) {
        return false
    }
    const x = v as PromptUpgradeEintrag
    return typeof x.at === 'number' && typeof x.original === 'string' && typeof x.upgrade === 'string' && Array.isArray(x.ergaenzt)
}

/** Ein Eintrag aus dem Speicher, gesaeubert: eine kaputte oder fehlende Abdeckung faellt weg, der Eintrag bleibt. */
function saeubereEintrag(x: PromptUpgradeEintrag): PromptUpgradeEintrag {
    const { abdeckung, ...rest } = x
    const sauber = { ...rest, ergaenzt: x.ergaenzt.filter(p => typeof p === 'string') }
    return istAbdeckung(abdeckung) ? { ...sauber, abdeckung } : sauber
}

async function ladeVerlauf($: EngineInterface): Promise<PromptUpgradeEintrag[]> {
    const v = await $.store.get(SPEICHER_VERLAUF)
    return Array.isArray(v) ? v.filter(istEintrag).map(saeubereEintrag).slice(0, VERLAUF_MAX) : []
}

async function merkeVerlauf($: EngineInterface, eintrag: PromptUpgradeEintrag): Promise<void> {
    const alt = await ladeVerlauf($)
    const neu = [eintrag, ...alt.filter(x => !(x.original === eintrag.original && x.upgrade === eintrag.upgrade))].slice(0, VERLAUF_MAX)
    await $.store.set(SPEICHER_VERLAUF, neu)
    await update($, verlauf, () => neu)
}

/** Der Verlauf als Text, fuer die Antwort auf /better verlauf. */
export function verlaufText(liste: readonly PromptUpgradeEintrag[]): string {
    if (liste.length === 0) {
        return 'Noch keine Upgrades.'
    }
    const zeilen = liste.map((v, i) => `${i + 1}. ${kuerze(einzeilig(v.original), 70)} → ${woerter(v.upgrade)} Wörter`)
    return `Prompt-Upgrade, die letzten ${liste.length} (neueste zuerst):\n${zeilen.join('\n')}`
}

// --- Automatik je Chat ---

type ChatWert = { at: number; isOn: boolean }

function istChatWert(v: unknown): v is ChatWert {
    return typeof v === 'object' && v !== null && typeof (v as ChatWert).at === 'number' && typeof (v as ChatWert).isOn === 'boolean'
}

/** Ob die Automatik in diesem Chat an ist: der Wert des Chats, sonst der Standard. */
async function automatikAn($: EngineInterface): Promise<boolean> {
    const schluessel = SPEICHER_AUTOMATIK + (await $.session.id())
    const v = await $.store.get(schluessel)
    if (!istChatWert(v)) {
        return einstellungen.automatik
    }
    const jetzt = await $.clock.now()
    if (jetzt - v.at > TAG_MS) {
        await $.store.set(schluessel, { at: jetzt, isOn: v.isOn })
    }
    return v.isOn
}

async function setzeAutomatik($: EngineInterface, isOn: boolean): Promise<void> {
    await $.store.set(SPEICHER_AUTOMATIK + (await $.session.id()), { at: await $.clock.now(), isOn })
}

/** Fremde Chat-Schluessel, laenger als 30 Tage unberuehrt, wegraeumen; hoechstens einmal am Tag. */
async function raeumeAuf($: EngineInterface): Promise<void> {
    const jetzt = await $.clock.now()
    const zuletzt = await $.store.get(SPEICHER_AUFGERAEUMT)
    if (typeof zuletzt === 'number' && jetzt - zuletzt < TAG_MS) {
        return
    }
    await $.store.set(SPEICHER_AUFGERAEUMT, jetzt)
    const eigener = SPEICHER_AUTOMATIK + (await $.session.id())
    for (const schluessel of await $.store.keys()) {
        if (!schluessel.startsWith(SPEICHER_AUTOMATIK) || schluessel === eigener) {
            continue
        }
        const v = await $.store.get(schluessel)
        if (!istChatWert(v) || jetzt - v.at > CHAT_HALTBAR_MS) {
            await $.store.delete(schluessel)
        }
    }
}

// --- Eingabefeld und Fenster ---

/** Den Text zurueck ins Eingabefeld; steht dort schon etwas, kommt er dahinter. */
async function zurueckInsFeld($: EngineInterface, text: string, meldung: string | null): Promise<void> {
    let gefuellt = false
    try {
        const feld = await $.prompt.read()
        const r = await $.prompt.fill(feld.text.trim() === '' ? { text, mode: 'replace' } : { text: `\n\n${text}`, mode: 'append' })
        gefuellt = r.isFilled
    } catch {
        gefuellt = false
    }
    if (!gefuellt) {
        $.ui.log(`Prompt-Upgrade: Das Eingabefeld nahm den Text nicht an. Hier ist er: ${text}`)
    } else if (meldung !== null) {
        $.ui.log(meldung)
    }
}

/** Fenster zu, Durchlauf weg, laufende Aufrufe gestoppt. */
async function beende($: EngineInterface): Promise<void> {
    stoppeAuftraege()
    await aendere($, () => null)
    await update($, zeigeVerlauf, () => false)
    try {
        await $.ui.close({ id: PANE })
    } catch {
        // schon zu
    }
}

/**
 * Das Fenster oeffnen. Passt es nicht hin (zu schmal, oder die Oberflaeche hat
 * keine Seitenfenster), kommt der Prompt zurueck ins Eingabefeld, mit einer Zeile dazu.
 */
async function oeffneFenster($: EngineInterface, original: string | null): Promise<void> {
    let r: UiOpenResult
    try {
        r = await $.ui.open({ id: PANE, title: 'Prompt-Upgrade', focus: true, rows: 30, columns: 92 })
    } catch (err) {
        r = { isPlaced: false, reason: fehlerText(err) }
    }
    if (r.isPlaced) {
        return
    }
    await beende($)
    if (original !== null && original.trim() !== '') {
        // Erst wenn das Eingabefeld nach dem Absenden geleert ist, sonst geht der Text mit unter.
        try {
            await $.clock.sleep(ZURUECK_NACH_MS)
        } catch {
            // dann eben gleich
        }
        await zurueckInsFeld($, original, TEXT_ZU_SCHMAL)
    } else {
        $.ui.log('Prompt-Upgrade: Das Seitenfenster passt hier gerade nicht hin.')
    }
}

// --- Die Modellaufrufe ---

/** Ob `x` noch der Durchlauf `id` mit dem Aufruf `lauf` ist. */
function gehoert(x: PromptUpgradeAblauf | null, id: string, lauf: string): x is PromptUpgradeAblauf {
    return x !== null && x.id === id && x.lauf === lauf
}

/** Einen Schritt mit Aufruf belegen: neue Lauf-Kennung, diese Umgebung. */
async function belege($: EngineInterface, id: string, schritt: 'lesen' | 'umschreiben'): Promise<PromptUpgradeAblauf | null> {
    const lauf = neueId()
    const x = await aendere($, a => (a && a.id === id && a.schritt === schritt ? { ...a, lauf, umgebung: UMGEBUNG, fehler: null } : a))
    return gehoert(x, id, lauf) ? x : null
}

async function scheitert($: EngineInterface, id: string, lauf: string, phase: 'lesen' | 'umschreiben', grund: string): Promise<void> {
    await aendere($, a => (gehoert(a, id, lauf) ? { ...a, schritt: 'fehler', fehler: { phase, grund }, lauf: null } : a))
}

/** Schritt 1: das Modell nach Rueckfragen fragen. Keine Frage noetig: gleich umschreiben. */
async function holeFragen($: EngineInterface, id: string): Promise<void> {
    const x = await belege($, id, 'lesen')
    if (!x || x.lauf === null) {
        return
    }
    const lauf = x.lauf
    const stopp = new AbortController()
    auftraege.set(lauf, stopp)
    try {
        const r = await $.model.complete(
            { model: einstellungen.modell, system: SYSTEM_FRAGEN, prompt: promptFragen(x.original), maxTokens: 900, timeoutMs: 45_000 },
            { signal: stopp.signal },
        )
        if (stopp.signal.aborted) {
            return
        }
        if (!r.isAnswered) {
            await scheitert($, id, lauf, 'lesen', grundAus(r))
            return
        }
        const fragen = leseFragen(r.text)
        if (fragen.length === 0) {
            const weiter = await aendere($, a =>
                gehoert(a, id, lauf) ? { ...a, schritt: 'umschreiben', fragen: [], antworten: [], keineFragen: true, lauf: null } : a,
            )
            if (weiter?.id === id && weiter.schritt === 'umschreiben' && weiter.lauf === null) {
                await schreibeUm($, id)
            }
            return
        }
        await aendere($, a =>
            gehoert(a, id, lauf) ? { ...a, schritt: 'fragen', fragen, antworten: fragen.map(() => null), lauf: null } : a,
        )
    } catch (err) {
        if (!stopp.signal.aborted) {
            await scheitert($, id, lauf, 'lesen', `Die Anfrage ist fehlgeschlagen: ${kuerze(fehlerText(err), 120)}`)
        }
    } finally {
        auftraege.delete(lauf)
    }
}

/** Schritt 3: das Modell schreibt den Prompt um, mit den Antworten. */
async function schreibeUm($: EngineInterface, id: string): Promise<void> {
    const x = await belege($, id, 'umschreiben')
    if (!x || x.lauf === null) {
        return
    }
    const lauf = x.lauf
    const stopp = new AbortController()
    auftraege.set(lauf, stopp)
    try {
        const r = await $.model.complete(
            {
                model: einstellungen.modell,
                system: SYSTEM_UMSCHREIBEN,
                prompt: promptUmschreiben(x.original, x.fragen, x.antworten),
                maxTokens: 2000,
                timeoutMs: 60_000,
            },
            { signal: stopp.signal },
        )
        if (stopp.signal.aborted) {
            return
        }
        if (!r.isAnswered) {
            await scheitert($, id, lauf, 'umschreiben', grundAus(r))
            return
        }
        const u = leseUmschrift(r.text)
        if (u === null) {
            await scheitert($, id, lauf, 'umschreiben', 'Das Modell hat keinen brauchbaren Text geliefert.')
            return
        }
        await aendere($, a =>
            gehoert(a, id, lauf)
                ? {
                      ...a,
                      schritt: 'pruefen',
                      upgrade: u.upgrade,
                      entwurf: u.upgrade,
                      ergaenzt: u.ergaenzt,
                      abdeckung: u.abdeckung,
                      lauf: null,
                      bearbeiten: false,
                      kopiert: null,
                  }
                : a,
        )
    } catch (err) {
        if (!stopp.signal.aborted) {
            await scheitert($, id, lauf, 'umschreiben', `Die Anfrage ist fehlgeschlagen: ${kuerze(fehlerText(err), 120)}`)
        }
    } finally {
        auftraege.delete(lauf)
    }
}

/** Einen neuen Durchlauf mit `original` beginnen; ein offener weicht ihm. */
async function starte($: EngineInterface, original: string): Promise<void> {
    stoppeAuftraege()
    const id = neueId()
    await update($, zeigeVerlauf, () => false)
    await aendere($, () => neuerAblauf(id, 'lesen', original))
    void holeFragen($, id).catch(err => $.ui.log(`Prompt-Upgrade: ${fehlerText(err)}`, { to: 'debug' }))
}

/**
 * Nach einem Neuladen: ein Schritt, dessen Modellaufruf eine andere Umgebung
 * gestartet hat, wird neu angestossen. Ist das Fenster nicht mehr offen, kommt
 * der Prompt zurueck ins Eingabefeld.
 */
async function nimmWiederAuf($: EngineInterface): Promise<void> {
    const x = await read($, ablauf)
    if (x === null || x.umgebung === UMGEBUNG) {
        return
    }
    let offen = true
    try {
        offen = (await $.ui.panes()).some(p => p.id === PANE)
    } catch {
        offen = true
    }
    if (!offen) {
        await beende($)
        if (x.original.trim() !== '' && x.schritt !== 'eingabe') {
            await zurueckInsFeld($, x.original, 'Das Fenster war zu; dein Prompt steht wieder im Eingabefeld.')
        }
        return
    }
    if (x.schritt === 'lesen') {
        await holeFragen($, x.id)
    } else if (x.schritt === 'umschreiben') {
        await schreibeUm($, x.id)
    }
}

// --- Was die Knoepfe tun ---

/** Eine Antwort eintragen; ist danach jede Frage beantwortet oder uebersprungen, wird umgeschrieben. */
async function beantworte($: EngineInterface, i: number | 'rest', antwort: PromptUpgradeAntwort): Promise<void> {
    const wechsel: { id: string | null } = { id: null }
    await aendere($, a => {
        wechsel.id = null
        if (!a || a.schritt !== 'fragen') {
            return a
        }
        const antworten = a.antworten.slice()
        if (i === 'rest') {
            for (let n = 0; n < a.fragen.length; n += 1) {
                antworten[n] = antworten[n] ?? antwort
            }
        } else if (i >= 0 && i < a.fragen.length) {
            antworten[i] = antwort
        } else {
            return a
        }
        const fertig = a.fragen.every((_, n) => (antworten[n] ?? null) !== null)
        if (fertig) {
            wechsel.id = a.id
        }
        return { ...a, antworten, andersOffen: i === 'rest' || a.andersOffen === i ? null : a.andersOffen, schritt: fertig ? 'umschreiben' : 'fragen' }
    })
    if (wechsel.id !== null) {
        await schreibeUm($, wechsel.id)
    }
}

/** Den Durchlauf an sich nehmen und dabei leeren, damit ein zweiter Druck nichts mehr findet. */
async function nimm($: EngineInterface, passt: (a: PromptUpgradeAblauf) => boolean): Promise<PromptUpgradeAblauf | null> {
    const halt: { a: PromptUpgradeAblauf | null } = { a: null }
    await aendere($, a => {
        halt.a = a && passt(a) ? a : null
        return halt.a ? null : a
    })
    return halt.a
}

/** Senden, als haette die Person es getippt; wird es abgelehnt, steht es wieder im Eingabefeld. */
async function sende($: EngineInterface, text: string): Promise<void> {
    try {
        const r = await $.prompt.submit({ text, asUser: true })
        if (r.drop !== undefined) {
            await zurueckInsFeld($, text, 'Gesendet wurde nichts; der Text steht im Eingabefeld.')
        }
    } catch {
        await zurueckInsFeld($, text, 'Gesendet wurde nichts; der Text steht im Eingabefeld.')
    }
}

async function fuehreAus($: EngineInterface, text?: string): Promise<void> {
    const a = await nimm($, x => x.schritt === 'pruefen')
    if (!a) {
        return
    }
    const endgueltig = (text ?? a.entwurf).trim()
    if (endgueltig === '') {
        await aendere($, () => a)
        return
    }
    const eintrag: PromptUpgradeEintrag = { at: await $.clock.now(), original: a.original, upgrade: endgueltig, ergaenzt: a.ergaenzt }
    await merkeVerlauf($, istAbdeckung(a.abdeckung) ? { ...eintrag, abdeckung: a.abdeckung } : eintrag)
    await beende($)
    await sende($, endgueltig)
}

async function sendeOriginal($: EngineInterface): Promise<void> {
    const a = await nimm($, x => x.schritt === 'fehler')
    if (!a) {
        return
    }
    await beende($)
    await sende($, a.original)
}

/** Ob beim Abbrechen etwas zurueck ins Eingabefeld gehoert: nicht beim leeren Feld, nicht bei einem Eintrag aus dem Verlauf. */
function zuruecklegen(a: PromptUpgradeAblauf): boolean {
    return a.original.trim() !== '' && a.schritt !== 'eingabe' && !a.ausVerlauf
}

/** Abbrechen: Fenster zu, der Original-Prompt zurueck ins Eingabefeld. */
async function brichAb($: EngineInterface): Promise<void> {
    const a = await nimm($, () => true)
    await beende($)
    if (a && zuruecklegen(a)) {
        await zurueckInsFeld($, a.original, null)
    }
}

async function erneut($: EngineInterface): Promise<void> {
    const wohin: { phase: 'lesen' | 'umschreiben' | null } = { phase: null }
    const x = await aendere($, a => {
        const phase = a?.schritt === 'fehler' ? (a.fehler?.phase ?? 'lesen') : null
        wohin.phase = phase
        return a && phase ? { ...a, schritt: phase, fehler: null, lauf: null } : a
    })
    const p = wohin.phase
    if (!x || p === null) {
        return
    }
    if (p === 'lesen') {
        await holeFragen($, x.id)
    } else {
        await schreibeUm($, x.id)
    }
}

async function kopiere($: EngineInterface, e: UiPressArgument): Promise<void> {
    const a = await read($, ablauf)
    if (!a || a.schritt !== 'pruefen') {
        return
    }
    let ok = false
    try {
        ok = (await $.ui.copy({ text: a.entwurf, surface: e.surface })).isCopied
    } catch {
        ok = false
    }
    await aendere($, x => (x && x.id === a.id ? { ...x, kopiert: ok ? 'ok' : 'fehler' } : x))
}

async function starteAusEingabe($: EngineInterface, text: string): Promise<void> {
    const t = text.trim()
    if (t === '') {
        return
    }
    const x = await nimm($, a => a.schritt === 'eingabe')
    if (!x) {
        return
    }
    await starte($, t)
}

async function oeffneAusVerlauf($: EngineInterface, i: number): Promise<void> {
    const v = (await read($, verlauf))[i]
    if (!v) {
        return
    }
    stoppeAuftraege()
    const neu: PromptUpgradeAblauf = {
        ...neuerAblauf(neueId(), 'pruefen', v.original),
        upgrade: v.upgrade,
        entwurf: v.upgrade,
        ergaenzt: v.ergaenzt,
        abdeckung: v.abdeckung ?? null,
        ausVerlauf: true,
    }
    await aendere($, () => neu)
    await update($, zeigeVerlauf, () => false)
}

function aktionen($: EngineInterface): Aktionen {
    const los = (p: Promise<unknown>) => {
        void p.catch(err => $.ui.log(`Prompt-Upgrade: ${fehlerText(err)}`, { to: 'debug' }))
    }
    return {
        starte: text => los(starteAusEingabe($, text)),
        waehle: (i, text) => los(beantworte($, i, { art: 'wahl', text })),
        andersOeffnen: i =>
            los(aendere($, a => (a && a.schritt === 'fragen' ? { ...a, andersOffen: a.andersOffen === i ? null : i } : a))),
        anders: (i, text) => {
            const t = text.trim()
            if (t !== '') {
                los(beantworte($, i, { art: 'anders', text: t }))
            }
        },
        ueberspringe: i => los(beantworte($, i, { art: 'uebersprungen' })),
        restUeberspringen: () => los(beantworte($, 'rest', { art: 'uebersprungen' })),
        ausfuehren: text => los(fuehreAus($, text)),
        bearbeiten: () => los(aendere($, a => (a && a.schritt === 'pruefen' ? { ...a, bearbeiten: !a.bearbeiten } : a))),
        entwurf: text => los(aendere($, a => (a && a.schritt === 'pruefen' ? { ...a, entwurf: text, kopiert: null } : a))),
        kopieren: e => los(kopiere($, e)),
        abbrechen: () => los(brichAb($)),
        erneut: () => los(erneut($)),
        originalSenden: () => los(sendeOriginal($)),
        verlaufWaehlen: i => los(oeffneAusVerlauf($, i)),
        verlaufAuf: () => los(update($, zeigeVerlauf, () => true)),
        verlaufZu: () => los(update($, zeigeVerlauf, () => false)),
        schliessen: () => los(beende($)),
    }
}

/** Ob ein Befehl am Rechner getippt wurde, wo das Seitenfenster zu sehen ist. */
function amRechner(origin: PromptOrigin | undefined): boolean {
    const art = origin?.kind
    return art === undefined || art === 'composer' || art === 'sdk' || art === 'unclassified' || art === 'auto-continuation'
}

/** Was nach /better steht: ein Schalter, der Verlauf oder ein Prompt. */
export type Befehl = { art: 'an' } | { art: 'aus' } | { art: 'verlauf' } | { art: 'leer' } | { art: 'prompt'; text: string }

export function leseBefehl(args: string): Befehl {
    const t = args.trim()
    const w = t.toLowerCase()
    if (w === 'on' || w === 'an') {
        return { art: 'an' }
    }
    if (w === 'off' || w === 'aus') {
        return { art: 'aus' }
    }
    if (w === 'history' || w === 'verlauf') {
        return { art: 'verlauf' }
    }
    return t === '' ? { art: 'leer' } : { art: 'prompt', text: t }
}

const VORSATZ_NAME = 'prompt-upgrade'
const VORSATZ_LABEL = 'Prompt Upgrade'
/**
 * Die Engine setzt vor die Antwort eines Befehls die Namen der Mods, die ihn hooken
 * ("name1+name2: Text"). In der gespeicherten Zeile streicht dieser Mod seinen eigenen
 * Namen und haengt stattdessen "(gemeldet vom Mod LABEL)" an: einzeilig mit Leerzeichen,
 * mehrzeilig in einer eigenen letzten Zeile. Andere Namen bleiben stehen.
 */
const VORSATZ_KOPF = /^(<local-command-stdout>)([a-z0-9-]+(?:\+[a-z0-9-]+)*): /
const VORSATZ_ENDE = '</local-command-stdout>'
export function ohneVorsatz(text: string): string {
    const m = VORSATZ_KOPF.exec(text)
    if (!m) return text
    const namen = (m[2] ?? '').split('+')
    if (!namen.includes(VORSATZ_NAME)) return text
    const rest = namen.filter(n => n !== VORSATZ_NAME)
    let rumpf = text.slice(m[0].length)
    const ende = rumpf.endsWith(VORSATZ_ENDE) ? VORSATZ_ENDE : ''
    rumpf = rumpf.slice(0, rumpf.length - ende.length).replace(/\s+$/, '')
    const zusatz = `(gemeldet vom Mod ${VORSATZ_LABEL})`
    const trenner = rumpf === '' ? '' : rumpf.includes('\n') ? '\n' : ' '
    return (m[1] ?? '') + (rest.length ? `${rest.join('+')}: ` : '') + rumpf + trenner + zusatz + ende
}

export const register: Register = (on, options) => {
    on('session.append', { door: 'command', message: { type: 'system', name: 'local_command' } }, async ($, e, next) => {
        const content = e.message.content.map(b => (b.type === 'text' && typeof b.text === 'string' ? { ...b, text: ohneVorsatz(b.text) } : b))
        return next({ ...e, message: { ...e.message, content } })
    }).catch(($, e, next) => next(e))

    einstellungen.modell = typeof options.modell === 'string' && options.modell.trim() !== '' ? options.modell.trim() : 'haiku'
    einstellungen.automatik = options.automatik === true

    on('session.start', async ($, e, next) => {
        try {
            await $.command.register({
                name: 'better',
                description: 'Prompt verbessern, bevor er rausgeht: /better <Prompt>, /better an|aus, /better verlauf',
                argumentHint: '[Prompt | an | aus | verlauf]',
                immediate: true,
            })
        } catch (err) {
            $.ui.log(`Prompt-Upgrade: /better ließ sich nicht anmelden: ${fehlerText(err)}`, { to: 'debug' })
        }
        try {
            const liste = await ladeVerlauf($)
            await update($, verlauf, () => liste)
        } catch {
            // dann eben leer, bis zum ersten Upgrade
        }
        void raeumeAuf($).catch(() => undefined)
        void nimmWiederAuf($).catch(err => $.ui.log(`Prompt-Upgrade: ${fehlerText(err)}`, { to: 'debug' }))
        return next(e)
    })

    on('turn.start', ($, e, next) => {
        if (e.agentId === undefined) {
            arbeitet = true
        }
        return next(e)
    })

    on('turn.complete', ($, e, next) => {
        if (e.agentId === undefined) {
            arbeitet = false
        }
        return next(e)
    })

    on('command.run', { command: 'better' }, async ($, e) => {
        const b = leseBefehl(e.args)
        if (b.art === 'an' || b.art === 'aus') {
            await setzeAutomatik($, b.art === 'an')
            return { text: b.art === 'an' ? TEXT_AN : TEXT_AUS }
        }
        const amPlatz = amRechner(e.origin)
        if (b.art === 'verlauf') {
            const liste = await ladeVerlauf($)
            await update($, verlauf, () => liste)
            if (amPlatz) {
                await update($, zeigeVerlauf, () => true)
                void oeffneFenster($, null).catch(() => undefined)
            }
            return { text: verlaufText(liste) }
        }
        if (!amPlatz) {
            return { text: TEXT_HANDY }
        }
        if (b.art === 'leer') {
            stoppeAuftraege()
            await update($, zeigeVerlauf, () => false)
            await aendere($, () => neuerAblauf(neueId(), 'eingabe', ''))
            void oeffneFenster($, null).catch(() => undefined)
            return { text: TEXT_EINGABE }
        }
        try {
            await starte($, b.text)
        } catch (err) {
            await zurueckInsFeld($, b.text, null)
            throw err
        }
        void oeffneFenster($, b.text).catch(() => undefined)
        return { text: TEXT_OFFEN }
    }).catch(() => ({ text: TEXT_FEHLER }))

    on('prompt.submit', async ($, e, next) => {
        // Billige Pruefungen zuerst: Handy, Plugins, Befehle gehen ohne Speicherzugriff durch.
        if (e.origin?.kind !== 'composer' || e.command !== undefined || e.isMeta === true) {
            return next(e)
        }
        const d = entscheide(e, { automatik: await automatikAn($), arbeitet })
        if (d.art === 'durch') {
            return next(e)
        }
        if (d.art === 'ohneZeichen') {
            return next({ ...e, text: d.text })
        }
        const original = e.text.replace(/\s+$/, '')
        await starte($, original)
        void oeffneFenster($, original).catch(() => undefined)
        return { drop: GRUND_ABGEFANGEN }
    }).catch(($, e, next) => next(e))

    on('ui.close', { id: PANE }, async ($, e, next) => {
        // Die Person schliesst das Fenster selbst: wie Abbrechen, nichts geht verloren.
        if (e.origin.kind === 'person') {
            const a = await nimm($, () => true)
            stoppeAuftraege()
            await update($, zeigeVerlauf, () => false)
            if (a && zuruecklegen(a)) {
                await zurueckInsFeld($, a.original, null)
            }
        }
        return next(e)
    }).catch(($, e, next) => next(e))

    on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
        const tisch = $.ui.resolve(e)
        const mitEingabe = e.surface === 'terminal' || e.surface === 'desktop' || e.surface === 'vscode'
        const k: Kit = {
            Box: tisch.Box,
            Text: tisch.Text,
            Button: tisch.Button,
            Input: mitEingabe && 'Input' in tisch ? tisch.Input : undefined,
            Svg: e.surface !== 'terminal' && 'Svg' in tisch ? tisch.Svg : undefined,
            istTerminal: e.surface === 'terminal',
        }
        const lage = {
            ablauf: await read($, ablauf),
            verlauf: await read($, verlauf),
            zeigeVerlauf: await read($, zeigeVerlauf),
        }
        const breite = e.props.bodyColumns > 0 ? e.props.bodyColumns : (e.viewport?.columns ?? 60)
        return zeichne(k, lage, breite, aktionen($))
    })
}
