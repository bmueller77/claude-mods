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
import type { CommandRunInput, EngineInterface, PromptOrigin, Register, UiOpenResult, UiPressArgument } from 'claude-code'

import type { PromptUpgradeAblauf, PromptUpgradeAntwort, PromptUpgradeEintrag } from '../types'
import { zeichne } from './ansicht'
import { alteNamen, befehlsZeilen, heisstJetzt, hilfeText, istHilfe } from './knopfbefehle'
import type { Knopfbefehl } from './knopfbefehle'
import type { Aktionen, Kit } from './ansicht'
import {
    AM_RECHNER_GETIPPT,
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
export const GRUND_ABGEFANGEN = 'Die Automatik von Prompt-Upgrade hat die Nachricht angehalten; sie liegt zum Verbessern im Seitenfenster. Mit > am Anfang wird sie direkt gesendet.'
export const TEXT_AN =
    'Automatik in diesem Chat an: Was du am Rechner tippst, geht erst ins Seitenfenster zum Verbessern. Mit > am Anfang wird es direkt gesendet, kurze Antworten wie ja oder ok auch.'
export const TEXT_AUS = 'Automatik in diesem Chat aus: Was du tippst, wird direkt gesendet.'
export const TEXT_OFFEN = 'Dein Prompt liegt im Seitenfenster.'
export const TEXT_EINGABE = 'Das Seitenfenster ist offen; tipp deinen Prompt dort ein.'
export const TEXT_HANDY = 'Ein Upgrade braucht das Seitenfenster am Rechner; gesendet wurde nichts. Vom Handy gehen /better an, /better aus und /better verlauf.'
export const TEXT_FEHLER =
    'Das hat nicht geklappt: Prompt-Upgrade ist auf einen internen Fehler gestoßen. Gesendet wurde nichts. Versuch es noch einmal; /prompt-upgrade:hilfe zeigt alle Befehle.'
export const TEXT_ZU_SCHMAL =
    'Das Seitenfenster passt hier gerade nicht hin, etwa weil das Fenster zu schmal ist. Dein Prompt steht wieder im Eingabefeld; du kannst ihn so senden.'

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

/** Der eine Satz, wenn das Modell nichts lieferte, auch auf der Fehlerkarte ohne Grund. */
export const KEINE_ANTWORT = 'Das Modell hat nicht geantwortet.'

function fehlerText(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

/** Ein Satz, warum das Modell keinen Text lieferte. */
function grundAus(r: { reason: string; status?: number | null; error?: string }): string {
    if (r.reason === 'api-error') {
        const ueberlastet = r.status === 529 || /overloaded/i.test(r.error ?? '')
        const status = typeof r.status === 'number' ? ` (Fehler ${r.status})` : ''
        return ueberlastet ? `Der Dienst ist gerade überlastet${status}.` : `Der Dienst hat mit einem Fehler geantwortet${status}.`
    }
    if (r.reason === 'aborted') {
        return 'Die Anfrage hat zu lange gedauert und wurde abgebrochen.'
    }
    return KEINE_ANTWORT
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
        $.ui.log(`Prompt-Upgrade: Das Eingabefeld nahm den Text nicht an. Kopier ihn von hier: ${text}`)
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
        $.ui.log('Prompt-Upgrade: Das Seitenfenster passt hier gerade nicht hin, etwa weil das Fenster zu schmal ist.')
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

/** Wenn Claude Code das Senden ablehnt. */
const NICHT_GESENDET = 'Das hat nicht geklappt: Claude Code hat die Nachricht nicht angenommen. Sie steht wieder im Eingabefeld; schick sie von dort ab.'

/** Senden, als haette die Person es getippt; wird es abgelehnt, steht es wieder im Eingabefeld. */
async function sende($: EngineInterface, text: string): Promise<void> {
    try {
        const r = await $.prompt.submit({ text, asUser: true })
        if (r.drop !== undefined) {
            await zurueckInsFeld($, text, NICHT_GESENDET)
        }
    } catch {
        await zurueckInsFeld($, text, NICHT_GESENDET)
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

/** Kopiert den Entwurf; `surface` wie der Druck es sagt, beim Befehl die erste Oberflaeche. Zurueck: ob es ging. */
async function kopiere($: EngineInterface, surface: UiPressArgument['surface'] | undefined): Promise<boolean> {
    const a = await read($, ablauf)
    if (!a || a.schritt !== 'pruefen') {
        return false
    }
    let ok = false
    try {
        ok = (await $.ui.copy({ text: a.entwurf, surface })).isCopied
    } catch {
        ok = false
    }
    await aendere($, x => (x && x.id === a.id ? { ...x, kopiert: ok ? 'ok' : 'fehler' } : x))
    return ok
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
        kopieren: e => los(kopiere($, e.surface)),
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

// --- Was /better und die Befehle gemeinsam tun ---

/** Der Verlauf als Text; am Rechner oeffnet sich dahinter das Fenster mit der Liste. */
async function zeigeDenVerlauf($: EngineInterface, amPlatz: boolean): Promise<string> {
    const liste = await ladeVerlauf($)
    await update($, verlauf, () => liste)
    if (amPlatz) {
        await update($, zeigeVerlauf, () => true)
        void oeffneFenster($, null).catch(() => undefined)
    }
    return verlaufText(liste)
}

/** Ein neuer Durchlauf mit `text`, oder bei leerem Text das Feld zum Eintippen; das Fenster oeffnet sich dahinter. */
async function starteMitFenster($: EngineInterface, text: string): Promise<string> {
    if (text === '') {
        stoppeAuftraege()
        await update($, zeigeVerlauf, () => false)
        await aendere($, () => neuerAblauf(neueId(), 'eingabe', ''))
        void oeffneFenster($, null).catch(() => undefined)
        return TEXT_EINGABE
    }
    try {
        await starte($, text)
    } catch (err) {
        await zurueckInsFeld($, text, null)
        throw err
    }
    void oeffneFenster($, text).catch(() => undefined)
    return TEXT_OFFEN
}

// --- Je Knopf und Schalter ein Befehl; /better bleibt als Kurzform ---

export const BEFEHL_FEHLER =
    'Das hat nicht geklappt: Prompt-Upgrade ist auf einen internen Fehler gestoßen. Gesendet wurde nichts. Versuch es noch einmal; /prompt-upgrade:hilfe zeigt alle Befehle.'
export const TEXT_KEIN_DURCHLAUF = 'Gerade ist kein Upgrade offen; /better [Prompt] startet eins.'
export const TEXT_HANDY_BEFEHLE =
    'Ein Upgrade braucht das Seitenfenster am Rechner; gesendet wurde nichts. Vom Handy gehen /prompt-upgrade:automatik-an, /prompt-upgrade:automatik-aus und /prompt-upgrade:verlauf.'

/** Wie weit ein Befehl wirkt, der nur einmal etwas tut. */
const EINMAL = 'einmal, sofort; ändert keine Einstellung.'
/** Wie weit die Schalter der Automatik wirken. */
const NUR_CHAT = 'nur in diesem Chat. Standard für neue Chats: Option "Automatik", siehe /prompt-upgrade:hilfe unter Einstellen.'
/** Was die Automatik durchlässt, für Hilfe und Antworten gleich. */
const AUSNAHMEN =
    'Direkt gesendet werden weiter: Text mit > am Anfang (das > fällt weg); kurze Antworten bis 40 Zeichen wie ja, ok oder mach weiter; ein einzelnes Wort bis 15 Zeichen; eine Auswahl wie 1 oder 2 und 3; Befehle mit / oder !; Nachrichten mit Anhang oder @-Datei; alles, was du schickst, während Claude noch arbeitet; alles vom Handy.'

/** Die Befehle in der Reihenfolge der Hilfe; die Wirkung steht in `befehlAus`. */
export const BEFEHLE: readonly Knopfbefehl[] = [
    {
        name: 'prompt-upgrade:hilfe',
        titel: 'Hilfe',
        description: 'Erklärt Prompt-Upgrade: wie du damit arbeitest, es einstellst und welche Befehle es gibt',
        tut: 'Zeigt, was Prompt-Upgrade tut, wie du damit arbeitest und es einstellst, was es kostet, was vom Handy geht und alle Befehle.',
        knopf: 'keiner.',
        geltung: EINMAL,
        argumente: 'keine.',
    },
    {
        name: 'prompt-upgrade:starten',
        titel: 'Upgrade starten',
        description: 'Öffnet deinen Prompt im Seitenfenster zum Verbessern; gesendet wird erst mit Ausführen',
        argumentHint: '[Prompt]',
        tut: 'Öffnet das Seitenfenster mit deinem Prompt, wie /better [Prompt]. Dort stellt das eingestellte Modell bis zu drei Rückfragen und schreibt den Prompt dann um, mit je einem Modellaufruf. Gesendet wird erst, wenn du Ausführen drückst. Geht nur am Rechner.',
        knopf: 'keiner.',
        geltung: EINMAL,
        argumente: '[Prompt] (freiwillig) · alles nach dem Befehl ist der Prompt; ohne Prompt öffnet sich ein Feld zum Eintippen.',
        beispiel: '/prompt-upgrade:starten Mach die Login-Seite schneller',
    },
    {
        name: 'prompt-upgrade:automatik-an',
        titel: 'Automatik an',
        description: 'Hält jede Nachricht, die du am Rechner tippst, zum Verbessern an (nur dieser Chat)',
        tut: `Schaltet die Automatik ein, wie /better an: Jede Nachricht, die du am Rechner tippst, hält Prompt-Upgrade vor dem Senden an und öffnet sie im Seitenfenster zum Verbessern. ${AUSNAHMEN}`,
        knopf: 'keiner.',
        geltung: NUR_CHAT,
        argumente: 'keine.',
    },
    {
        name: 'prompt-upgrade:automatik-aus',
        titel: 'Automatik aus',
        description: 'Was du tippst, wird wieder direkt gesendet (nur dieser Chat)',
        tut: 'Schaltet die Automatik aus, wie /better aus: Was du tippst, wird wieder direkt gesendet. /better [Prompt] geht weiter.',
        knopf: 'keiner.',
        geltung: NUR_CHAT,
        argumente: 'keine.',
    },
    {
        name: 'prompt-upgrade:verlauf',
        titel: 'Verlauf',
        description: 'Zeigt deine letzten 20 Upgrades aus allen Chats, am Rechner auch im Seitenfenster',
        tut: 'Listet deine letzten 20 Upgrades aus allen Chats als Text, neueste zuerst, wie /better verlauf; der Verlauf liegt im Speicher des Mods, nur auf diesem Rechner. Am Rechner öffnet sich dazu das Seitenfenster mit der Liste; ein Klick dort öffnet ein Upgrade wieder zum Prüfen.',
        knopf: '„Verlauf“ im Seitenfenster.',
        geltung: EINMAL,
        argumente: 'keine.',
    },
    {
        name: 'prompt-upgrade:jetzt-verbessern',
        titel: 'Rest überspringen',
        description: 'Überspringt die offenen Rückfragen und schreibt den Prompt jetzt um',
        tut: 'Überspringt die Rückfragen, die im offenen Upgrade noch unbeantwortet sind, und lässt den Prompt jetzt umschreiben (ein Modellaufruf). Ist kein Upgrade offen, sagt der Befehl das.',
        knopf: '„Rest überspringen, jetzt verbessern“ im Seitenfenster.',
        geltung: EINMAL,
        argumente: 'keine.',
    },
    {
        name: 'prompt-upgrade:ausfuehren',
        titel: 'Ausführen',
        description: 'Sendet das Upgrade an Claude und schließt das Seitenfenster',
        tut: 'Sendet das Upgrade an Claude, so wie es im Seitenfenster steht (auch bearbeitet), und schließt das Fenster. Offene Platzhalter in eckigen Klammern gehen so mit, wie sie stehen. Ist kein Upgrade offen, sagt der Befehl das.',
        knopf: '„Ausführen“ im Seitenfenster.',
        geltung: EINMAL,
        argumente: 'keine.',
    },
    {
        name: 'prompt-upgrade:original-senden',
        titel: 'Original senden',
        description: 'Sendet nach einem Fehler deinen Prompt unverändert an Claude',
        tut: 'Sendet deinen ursprünglichen Prompt unverändert an Claude, wenn das Upgrade gescheitert ist, und schließt das Seitenfenster.',
        knopf: '„Original senden“ auf der Fehlerkarte im Seitenfenster.',
        geltung: EINMAL,
        argumente: 'keine.',
    },
    {
        name: 'prompt-upgrade:kopieren',
        titel: 'Kopieren',
        description: 'Legt das Upgrade in die Zwischenablage, ohne es zu senden',
        tut: 'Legt das Upgrade in die Zwischenablage, ohne es zu senden; das Seitenfenster bleibt offen. Vom Handy kommt es als Text zum Kopieren.',
        knopf: '„Kopieren“ im Seitenfenster.',
        geltung: EINMAL,
        argumente: 'keine.',
    },
    {
        name: 'prompt-upgrade:abbrechen',
        titel: 'Abbrechen',
        description: 'Bricht das Upgrade ab und legt deinen Prompt zurück ins Eingabefeld',
        tut: 'Bricht das offene Upgrade ab: Das Seitenfenster geht zu, laufende Modellaufrufe stoppen, dein Prompt steht wieder im Eingabefeld. Gesendet wird nichts.',
        knopf: '„Abbrechen“ im Seitenfenster.',
        geltung: EINMAL,
        argumente: 'keine.',
    },
]

/** Die Hilfe der Kurzform /better, im selben Aufbau wie die der Befehle. */
export const HILFE_BETTER = [
    '/better [Prompt | an | aus | verlauf] · Kurzform von Prompt-Upgrade',
    'Was: Mit einem Prompt dahinter öffnet es das Seitenfenster zum Verbessern, wie /prompt-upgrade:starten; das kostet bis zu zwei kleine Modellaufrufe. Ohne Argument öffnet es das Seitenfenster mit einem leeren Feld zum Eintippen. an und aus schalten die Automatik, verlauf zeigt deine letzten Upgrades; das gilt nur, wenn das Wort allein dahinter steht, /better an die Kunden schreiben ist ein Prompt.',
    'Button: keiner.',
    `Gilt: mit Prompt oder verlauf einmal, sofort; ändert keine Einstellung. Mit an oder aus ${NUR_CHAT}`,
    'Argumente: [Prompt] (freiwillig) · der Prompt, der verbessert werden soll. Oder an, aus, verlauf (auch on, off, history).',
    'Beispiel: /better Mach die Login-Seite schneller',
].join('\n')

/** Was /prompt-upgrade:hilfe antwortet. */
export const HILFE = [
    'Prompt-Upgrade · Hilfe',
    '',
    'Was der Mod tut',
    'Prompt-Upgrade ist ein Mod, also eine Erweiterung für Claude Code. Er macht aus einer groben Nachricht an Claude (einem Prompt) eine klare, bevor du sie sendest. Dazu stellt er dir im Seitenfenster bis zu drei Rückfragen, schreibt den Prompt um und zeigt Original und Upgrade nebeneinander. Gesendet wird erst, wenn du Ausführen drückst.',
    '',
    'So arbeitest du damit',
    '1. Tipp /better und deinen Prompt dahinter, etwa /better Mach die Login-Seite schneller. Das Seitenfenster öffnet sich mit deinem Prompt. /better ohne Argument öffnet es mit einem leeren Feld zum Eintippen.',
    '2. Beantworte die Rückfragen mit einem Button, tipp mit "Andere (eintippen)" eine eigene Antwort ein oder überspring sie.',
    '3. Prüf das Upgrade. Die Zeile der Kernteile zeigt mit ✓, was drinsteht: Auftrag (was Claude tun soll), Warum (wofür und für wen), Grenzen (was nicht passieren darf, mit Grund) und Fertig wenn (woran man sieht, dass es fertig ist). Eckige Klammern wie [Zielgruppe] sind offene Platzhalter: Füll sie mit Bearbeiten aus, sonst gehen sie so mit.',
    '4. Ausführen sendet das Upgrade an Claude und legt es in den Verlauf (die letzten 20, gespeichert nur auf diesem Rechner). Kopieren legt es in die Zwischenablage, Abbrechen legt dein Original zurück ins Eingabefeld.',
    `5. Willst du jede Nachricht verbessern, schalte die Automatik ein: /better an. Dann hält Prompt-Upgrade jede Nachricht, die du am Rechner tippst, vor dem Senden an und öffnet sie im Seitenfenster. ${AUSNAHMEN}`,
    '6. an, aus und verlauf gelten nur, wenn sie allein hinter /better stehen. /better an die Kunden schreiben ist ein Prompt.',
    '',
    'Einstellen',
    'Nur in diesem Chat: /better an und /better aus schalten die Automatik.',
    'Standard für neue Chats:',
    '- Automatik · an oder aus (im Terminal true oder false); eingebaut: aus.',
    '- Modell für Rückfragen und Upgrade · haiku, sonnet, opus oder fable; eingebaut: haiku. Im Chat nicht umstellbar.',
    'Haiku, Sonnet, Opus und Fable sind Modelle von Claude, von klein und günstig bis groß.',
    'Sag Claude zum Beispiel: Stell bei Prompt-Upgrade den Standard für neue Chats: Automatik auf an. Claude macht das mit `claude plugin configure prompt-upgrade@bm-mods`. Im Terminal geht es auch selbst: `claude plugin configure prompt-upgrade@bm-mods` zeigt die Optionen. Setzen geht mit `--values-stdin`, etwa `echo \'{"automatik": true}\' | claude plugin configure prompt-upgrade@bm-mods --values-stdin`. Das gilt für Chats, die danach beginnen. Ältere Installationen heißen `prompt-upgrade@bjoern-mods`; `claude plugin list` zeigt den Namen. "not set" heißt dort: Es gilt der eingebaute Standard.',
    'Ganz abschalten: `claude plugin disable prompt-upgrade@bm-mods` (wieder an mit `enable`), oder sag Claude, er soll den Mod abschalten. Das wirkt nach einem Neustart von Claude Code.',
    '',
    'Kosten',
    'Jedes Upgrade ruft das eingestellte Modell bis zu zweimal auf, einmal für die Rückfragen und einmal fürs Umschreiben; Erneut versuchen ruft es noch einmal auf. Das kostet Tokens (die Einheit, in der Claude liest und schreibt; sie zählen gegen dein Nutzungslimit), mit Haiku wenige. Mit eingeschalteter Automatik startet jede Nachricht, die sie anhält, ein Upgrade und kostet genauso viel. Was direkt gesendet wird, kostet nichts.',
    '',
    'Vom Handy (Remote Control)',
    'Ein Upgrade starten geht nur am Rechner, denn dort tippst und bearbeitest du den Prompt im Seitenfenster. Was du vom Handy schickst, hält die Automatik nie an. Vom Handy gehen /better an, /better aus und /better verlauf (als Text). Ein Upgrade, das am Rechner offen ist, führst du vom Handy mit /prompt-upgrade:jetzt-verbessern, /prompt-upgrade:ausfuehren, /prompt-upgrade:kopieren (kommt als Text), /prompt-upgrade:original-senden oder /prompt-upgrade:abbrechen weiter.',
    '',
    'Befehle',
    'Befehlsnamen schreiben Umlaute als ae, oe, ue und ss.',
    '/better [Prompt | an | aus | verlauf] · Kurzform: ohne Argument das leere Feld, mit Prompt ein Upgrade, an und aus die Automatik, verlauf der Verlauf',
    ...befehlsZeilen(BEFEHLE),
    'Mehr zu jedem Befehl: hilfe dahinter, etwa /prompt-upgrade:starten hilfe.',
].join('\n')

async function befehlJetztVerbessern($: EngineInterface): Promise<string> {
    const a = await read($, ablauf)
    if (!a) {
        return TEXT_KEIN_DURCHLAUF
    }
    if (a.schritt !== 'fragen') {
        return 'Gerade stehen keine Rückfragen offen.'
    }
    void beantworte($, 'rest', { art: 'uebersprungen' }).catch(err => $.ui.log(`Prompt-Upgrade: ${fehlerText(err)}`, { to: 'debug' }))
    return 'Die übrigen Rückfragen sind übersprungen; der Prompt wird jetzt verbessert.'
}

async function befehlAusfuehren($: EngineInterface): Promise<string> {
    const a = await read($, ablauf)
    if (!a) {
        return TEXT_KEIN_DURCHLAUF
    }
    if (a.schritt !== 'pruefen') {
        return 'Noch nichts zum Ausführen: Das Upgrade ist noch nicht fertig.'
    }
    if (a.entwurf.trim() === '') {
        return 'Der Entwurf ist leer; gesendet wurde nichts.'
    }
    void fuehreAus($).catch(err => $.ui.log(`Prompt-Upgrade: ${fehlerText(err)}`, { to: 'debug' }))
    return 'Der verbesserte Prompt geht raus; das Fenster schließt sich.'
}

async function befehlOriginalSenden($: EngineInterface): Promise<string> {
    const a = await read($, ablauf)
    if (!a) {
        return TEXT_KEIN_DURCHLAUF
    }
    if (a.schritt !== 'fehler') {
        return 'Original senden gibt es nur, wenn das Upgrade gescheitert ist; /prompt-upgrade:abbrechen legt den Prompt zurück ins Eingabefeld.'
    }
    void sendeOriginal($).catch(err => $.ui.log(`Prompt-Upgrade: ${fehlerText(err)}`, { to: 'debug' }))
    return 'Der Original-Prompt geht unverändert raus; das Fenster schließt sich.'
}

async function befehlKopieren($: EngineInterface, amPlatz: boolean): Promise<string> {
    const a = await read($, ablauf)
    if (!a) {
        return TEXT_KEIN_DURCHLAUF
    }
    if (a.schritt !== 'pruefen') {
        return 'Noch nichts zum Kopieren: Das Upgrade ist noch nicht fertig.'
    }
    if (!amPlatz) {
        return `Kopieren geht nur am Rechner. Hier ist das Upgrade zum Kopieren:\n\n${a.entwurf}`
    }
    return (await kopiere($, undefined)) ? 'Das Upgrade ist kopiert.' : 'Kopieren ging hier nicht.'
}

async function befehlAbbrechen($: EngineInterface): Promise<string> {
    const a = await read($, ablauf)
    if (!a) {
        return TEXT_KEIN_DURCHLAUF
    }
    const zurueck = zuruecklegen(a)
    await brichAb($)
    return zurueck ? 'Abgebrochen: Das Fenster ist zu, dein Prompt steht wieder im Eingabefeld. Gesendet wurde nichts.' : 'Abgebrochen: Das Fenster ist zu. Gesendet wurde nichts.'
}

/** Die Wirkung der Befehle, je wie ihr Knopf; zurueck kommt die Antwort. */
async function befehlAus($: EngineInterface, name: string, args: string, e: CommandRunInput): Promise<string> {
    const amPlatz = amRechner(e.origin)
    switch (name) {
        case 'prompt-upgrade:hilfe':
            return HILFE
        case 'prompt-upgrade:starten':
            return amPlatz ? starteMitFenster($, args) : TEXT_HANDY_BEFEHLE
        case 'prompt-upgrade:automatik-an':
            await setzeAutomatik($, true)
            return TEXT_AN
        case 'prompt-upgrade:automatik-aus':
            await setzeAutomatik($, false)
            return TEXT_AUS
        case 'prompt-upgrade:verlauf':
            return zeigeDenVerlauf($, amPlatz)
        case 'prompt-upgrade:jetzt-verbessern':
            return befehlJetztVerbessern($)
        case 'prompt-upgrade:ausfuehren':
            return befehlAusfuehren($)
        case 'prompt-upgrade:original-senden':
            return befehlOriginalSenden($)
        case 'prompt-upgrade:kopieren':
            return befehlKopieren($, amPlatz)
        case 'prompt-upgrade:abbrechen':
            return befehlAbbrechen($)
        default:
            return BEFEHL_FEHLER
    }
}

const VORSATZ_NAME = 'prompt-upgrade'
const VORSATZ_LABEL = 'Prompt-Upgrade'
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
                description: 'Prompt-Upgrade: verbessert deinen Prompt mit Rückfragen, bevor du ihn sendest; an, aus, verlauf, hilfe',
                argumentHint: '[Prompt | an | aus | verlauf]',
                immediate: true,
            })
        } catch (err) {
            $.ui.log(`Prompt-Upgrade: /better ließ sich nicht anmelden: ${fehlerText(err)}`, { to: 'debug' })
        }
        // Die Befehle je Knopf und Schalter (/prompt-upgrade:starten) sind Dateien in commands/ und brauchen keine Anmeldung.
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
        if (istHilfe(e.args ?? '')) {
            return { text: HILFE_BETTER }
        }
        const b = leseBefehl(e.args)
        if (b.art === 'an' || b.art === 'aus') {
            await setzeAutomatik($, b.art === 'an')
            return { text: b.art === 'an' ? TEXT_AN : TEXT_AUS }
        }
        const amPlatz = amRechner(e.origin)
        if (b.art === 'verlauf') {
            return { text: await zeigeDenVerlauf($, amPlatz) }
        }
        if (!amPlatz) {
            return { text: TEXT_HANDY }
        }
        return { text: await starteMitFenster($, b.art === 'leer' ? '' : b.text) }
    }).catch(() => ({ text: TEXT_FEHLER }))

    for (const k of BEFEHLE) {
        on('command.run', { command: k.name }, async ($, e) => {
            try {
                if (istHilfe(e.args ?? '')) {
                    return { text: hilfeText(k) }
                }
                return { text: await befehlAus($, k.name, (e.args ?? '').trim(), e) }
            } catch {
                return { text: BEFEHL_FEHLER }
            }
        }).catch(() => ({ text: BEFEHL_FEHLER }))
    }

    // Die alten Namen bis prompt-upgrade 0.3 (/prompt-upgrade-starten): nicht mehr angemeldet, aber eine alte Datei in
    // ~/.claude/commands ruft sie noch auf. Sie sagen nur, wie der Befehl jetzt heißt.
    const alte = alteNamen(BEFEHLE)
    on('command.run', { command: [...alte.keys()] }, async ($, e) => ({ text: heisstJetzt(alte.get(e.command) ?? e.command) })).catch(() => ({
        text: BEFEHL_FEHLER,
    }))

    on('prompt.submit', async ($, e, next) => {
        // Billige Pruefungen zuerst: Handy, Plugins, Befehle gehen ohne Speicherzugriff durch.
        if (!AM_RECHNER_GETIPPT.has(e.origin?.kind ?? '') || e.command !== undefined || e.isMeta === true) {
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
