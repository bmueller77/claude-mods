import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode, RenderSurface, SessionMessage } from 'claude-code'

import type { Aufwand, AutoSchalter, BandHoehe, Einschaetzung, Kalibrierung, Modell, Vorschlag, Wahl } from '../types'
import { BAND_VERSION, zeilenVon } from './band'
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
export const BEFEHL_FEHLER =
    'Modellwahl: Das hat nicht geklappt: Beim Ausführen ist ein interner Fehler aufgetreten. Modell und Aufwand bleiben, wie sie sind; versuch es noch einmal.'

/** Wie weit ein Befehl wirkt, der nur einmal etwas tut. */
const EINMAL = 'einmal, sofort; ändert keine Einstellung.'
/** Wie weit eine Wahl wirkt. */
const NUR_CHAT = 'nur in diesem Chat.'
/** Wie weit die Schalter der Automatik wirken. */
const NUR_CHAT_STANDARD = 'nur in diesem Chat. Standard für neue Chats: Option "Automatisch bei neuem Chat", siehe /modellwahl:hilfe unter Einstellen.'

/** Die Hilfe zu einem Befehl: Name und Titel, dann Was, Button, Gilt, Argumente und, bei einem Argument, ein Beispiel. */
function hilfeAus(b: { kopf: string; was: string; button: string; gilt: string; argumente: string; beispiel?: string }): string {
    return [
        b.kopf,
        `Was: ${b.was}`,
        `Button: ${b.button}`,
        `Gilt: ${b.gilt}`,
        `Argumente: ${b.argumente}`,
        ...(b.beispiel ? [`Beispiel: ${b.beispiel}`] : []),
    ].join('\n')
}

/**
 * Die Befehle mit Beschreibung, Hinweis und Hilfe. Angemeldet wird nur /modellwahl;
 * die Langformen /modellwahl:<funktion> liegen als Dateien in commands/ des Mods,
 * Claude Code setzt modellwahl: davor. Einen Namen mit Doppelpunkt nimmt
 * `$.command.register` nicht, den Lauf beantwortet trotzdem dieser Mod.
 */
export const BEFEHLE = [
    {
        name: 'modellwahl',
        description: 'Schlägt Modell und Aufwand für diesen Chat passend zur Aufgabe vor; ja übernimmt, nein verwirft, hilfe erklärt',
        argumentHint: '[Aufgabe | ja | nein]',
        hilfe: hilfeAus({
            kopf: '/modellwahl [Aufgabe | ja | nein] · Vorschlag holen',
            was:
                'Lässt das Modell der Einschätzung (eingebaut Haiku) mit einem kleinen Aufruf einschätzen, welches Modell und welcher Aufwand zur Aufgabe passen, und schlägt beides für diesen Chat vor. ' +
                'Mit einer Aufgabe dahinter wird diese eingeschätzt, die letzten Nachrichten des Chats lesen mit; ohne Aufgabe zählen nur die letzten Nachrichten. Im leeren Chat schlägt Modellwahl bei deiner nächsten Nachricht vor. ' +
                'Am Rechner gilt der Vorschlag 15 Sekunden nach dieser Antwort von selbst, wenn du nicht Nein drückst, auch wenn das neue Modell den Chat teuer neu liest; vom Handy erst, wenn du ja, ok oder /modellwahl ja schickst (10 Minuten lang). ja nimmt einen offenen Vorschlag an, nein verwirft ihn; ein angenommener Vorschlag gilt ab der nächsten Anfrage an Claude. Ohne Argument kostet das einen kleinen Aufruf von Haiku wie mit Aufgabe.',
            button: 'Übernehmen und Nein in der Leiste über dem Eingabefeld, solange ein Vorschlag offen ist (im Terminal [Übernehmen] und [Nein]).',
            gilt: NUR_CHAT,
            argumente: '[Aufgabe] (freiwillig) · die Aufgabe, die eingeschätzt werden soll. Oder ja (auch ok, okay) oder nein.',
            beispiel: '/modellwahl Bau das Login auf OAuth um',
        }),
    },
    {
        name: 'modellwahl:uebernehmen',
        description: 'Nimmt den offenen Vorschlag der Modellwahl an, wie /modellwahl ja',
        argumentHint: '[hilfe]',
        hilfe: hilfeAus({
            kopf: '/modellwahl:uebernehmen · Vorschlag übernehmen',
            was:
                'Nimmt den offenen Vorschlag an, wie /modellwahl ja; er gilt ab der nächsten Anfrage an Claude, auch mitten in einer laufenden Antwort. Wechselt dabei das Modell, liest das neue Modell den Chat einmal neu, das kostet Tokens. Ist kein Vorschlag offen, sagt der Befehl das.',
            button: 'Übernehmen in der Leiste über dem Eingabefeld (im Terminal [Übernehmen]).',
            gilt: NUR_CHAT,
            argumente: 'keine.',
        }),
    },
    {
        name: 'modellwahl:ablehnen',
        description: 'Verwirft den offenen Vorschlag der Modellwahl; Modell und Aufwand bleiben',
        argumentHint: '[hilfe]',
        hilfe: hilfeAus({
            kopf: '/modellwahl:ablehnen · Vorschlag verwerfen',
            was: 'Verwirft den offenen Vorschlag, wie /modellwahl nein. Modell und Aufwand bleiben, wie sie sind. Ist kein Vorschlag offen, sagt der Befehl das.',
            button: 'Nein in der Leiste über dem Eingabefeld (im Terminal [Nein]).',
            gilt: EINMAL,
            argumente: 'keine.',
        }),
    },
    {
        name: 'modellwahl:zeigen',
        description: 'Zeigt, welches Modell und welcher Aufwand in diesem Chat gelten und warum',
        argumentHint: '[hilfe]',
        hilfe: hilfeAus({
            kopf: '/modellwahl:zeigen · Stand zeigen',
            was:
                'Zeigt, was in diesem Chat gilt: Modell und Aufwand mit Grund, ob Modellwahl sich zurückgezogen hat (weil du selbst umgestellt hast), einen offenen Vorschlag, ob die Automatik an ist, und die Kalibrierung, also wie viele Tokens etwa 1 % deines Sitzungslimits (5 Stunden) sind.',
            button: 'keiner.',
            gilt: EINMAL,
            argumente: 'keine.',
        }),
    },
    {
        name: 'modellwahl:hilfe',
        description: 'Erklärt Modellwahl: wie du damit arbeitest, es einstellst und welche Befehle es gibt',
        argumentHint: '[hilfe]',
        hilfe: hilfeAus({
            kopf: '/modellwahl:hilfe · Hilfe',
            was: 'Zeigt, was Modellwahl tut, wie du damit arbeitest und es einstellst, was es kostet, was vom Handy geht und alle Befehle.',
            button: 'keiner.',
            gilt: EINMAL,
            argumente: 'keine.',
        }),
    },
    {
        name: 'modellwahl:auto-an',
        description: 'Vorschlag beim Neubeginn dieses Chats an: erste Nachricht, auch nach /clear (nur dieser Chat)',
        argumentHint: '[hilfe]',
        hilfe: hilfeAus({
            kopf: '/modellwahl:auto-an · Automatik an',
            was:
                'Schaltet für diesen Chat ein, dass Modellwahl beim Neubeginn von selbst vorschlägt: bei der ersten Nachricht, solange der Chat noch leer ist, und bei der ersten Nachricht nach jedem /clear in diesem Fenster. Mitten im Chat schlägt Modellwahl nur auf /modellwahl vor. Ein neuer Chat, der nicht mit /clear beginnt, folgt dem Standard.',
            button: 'keiner.',
            gilt: NUR_CHAT_STANDARD,
            argumente: 'keine.',
        }),
    },
    {
        name: 'modellwahl:auto-aus',
        description: 'Vorschlag beim Neubeginn dieses Chats aus: erste Nachricht, auch nach /clear (nur dieser Chat)',
        argumentHint: '[hilfe]',
        hilfe: hilfeAus({
            kopf: '/modellwahl:auto-aus · Automatik aus',
            was:
                'Schaltet für diesen Chat aus, dass Modellwahl beim Neubeginn von selbst vorschlägt, auch nach /clear in diesem Fenster. /modellwahl schlägt weiter vor, wenn du es aufrufst. Ein neuer Chat, der nicht mit /clear beginnt, folgt dem Standard.',
            button: 'keiner.',
            gilt: NUR_CHAT_STANDARD,
            argumente: 'keine.',
        }),
    },
] as const

type Befehl = (typeof BEFEHLE)[number]['name']

/** Der einzige angemeldete Befehl; das Menue nennt dahinter den Mod. */
export const GRUNDBEFEHL = BEFEHLE[0]

/**
 * Die alten Namen bis modellwahl 0.2: /modellwahl-zeigen statt /modellwahl:zeigen.
 * Sie stehen nicht mehr im Menue; wer einen tippt (eine alte Datei in
 * ~/.claude/commands), erfaehrt den neuen. Jeder mit dem vollen neuen Namen.
 */
export const ALTE_BEFEHLE: ReadonlyMap<string, string> = new Map(
    BEFEHLE.filter(b => b.name.includes(':')).map(b => [b.name.replace(':', '-'), b.name] as const),
)

/** Was ein alter Name antwortet: wie der Befehl jetzt heisst. */
export function neuerName(name: string): string {
    return `Der Befehl heißt jetzt /${name}.`
}

/** Was /modellwahl:hilfe antwortet. */
export const HILFE = [
    'Modellwahl · Hilfe',
    '',
    'Was der Mod tut',
    'Modellwahl ist ein Mod, also eine Erweiterung für Claude Code. Er schlägt dir einmal je Aufgabe ein Modell und einen Aufwand für diesen Chat vor. Haiku, Sonnet, Opus und Fable sind Modelle von Claude, von klein und günstig bis groß. Der Aufwand sagt, wie gründlich Claude nachdenkt, von Niedrig über Mittel, Hoch und Extra hoch bis Maximal.',
    'Am Rechner gilt ein Vorschlag 15 Sekunden, nachdem er erscheint, von selbst, wenn du nicht Nein drückst; das gilt auch für einen Wechsel des Modells, der den Chat teuer neu liest. Eine Nachricht, die nur aus ja, ok oder okay besteht, nimmt einen offenen Vorschlag an, auch wenn du damit eigentlich eine Frage von Claude beantwortest; die Nachricht geht trotzdem an Claude.',
    '',
    'So arbeitest du damit',
    '1. Schreib in einem neuen Chat einfach deine erste Nachricht. Sie geht sofort mit dem Modell los, das gerade eingestellt ist. Modellwahl schätzt sie dabei ein, und Claude beginnt die Antwort mit dem Vorschlag, etwa "Modellwahl schlägt Opus · Hoch vor".',
    '2. In der Leiste über dem Eingabefeld steht dann der Vorschlag mit einem Countdown. Im Terminal und in der Desktop-App zeigt auch die Statuszeile von Claude Code den Vorschlag und danach die geltende Wahl. Übernehmen nimmt den Vorschlag an, Nein verwirft ihn; tust du nichts, nimmt Modellwahl ihn nach den 15 Sekunden an. Ein angenommener Vorschlag gilt ab der nächsten Anfrage an Claude, auch mitten in einer laufenden Antwort. Helfer, die Claude für Teilaufgaben startet, behalten ihr eigenes Modell.',
    '3. Kommt mitten im Chat eine neue Aufgabe, tipp /modellwahl und die Aufgabe dahinter, etwa /modellwahl Bau das Login auf OAuth um. /modellwahl ohne Argument schätzt die letzten Nachrichten des Chats ein; im leeren Chat wartet es auf deine nächste Nachricht. Jede Einschätzung kostet einen kleinen Aufruf von Haiku.',
    '4. /modellwahl:zeigen sagt, was gerade gilt und warum.',
    '5. Stellst du Modell oder Aufwand selbst um, zieht sich Modellwahl in diesem Chat zurück: Es stellt nichts mehr um, bis du /modellwahl wieder aufrufst und einen Vorschlag annimmst oder einen neuen Chat beginnst.',
    '',
    'Einstellen',
    'Nur in diesem Chat: /modellwahl:auto-an und /modellwahl:auto-aus legen fest, ob Modellwahl beim Neubeginn von selbst vorschlägt. Ein /clear beginnt einen neuen Chat im selben Fenster; dort bleibt diese Einstellung. Ein neuer Chat, der nicht mit /clear beginnt, folgt dem Standard.',
    'Standard für neue Chats:',
    '- Automatisch bei neuem Chat · an oder aus (im Terminal true oder false); eingebaut: an.',
    '- Modell der Einschätzung · haiku, sonnet, opus oder fable; eingebaut: haiku. Im Chat nicht umstellbar. Die Einschätzung darf höchstens 5 Sekunden dauern, ein großes Modell schafft das oft nicht.',
    'Sag Claude zum Beispiel: Stell bei Modellwahl den Standard für neue Chats: Automatisch bei neuem Chat auf aus. Claude macht das mit `claude plugin configure modellwahl@bm-mods`. Im Terminal geht es auch selbst: `claude plugin configure modellwahl@bm-mods` zeigt die Optionen. Setzen geht mit `--values-stdin`, etwa `echo \'{"autoBeiNeuemChat": false}\' | claude plugin configure modellwahl@bm-mods --values-stdin`. Das gilt für Chats, die danach beginnen. Ältere Installationen heißen `modellwahl@bjoern-mods`; `claude plugin list` zeigt den Namen. "not set" heißt dort: Es gilt der eingebaute Standard.',
    'Ganz abschalten: `claude plugin disable modellwahl@bm-mods` (wieder an mit `enable`), oder sag Claude, er soll den Mod abschalten. Das wirkt nach einem Neustart von Claude Code.',
    '',
    'Kosten',
    'Jede Einschätzung ist ein kleiner Aufruf von Haiku (oder dem eingestellten Modell). Das kostet Tokens (die Einheit, in der Claude liest und schreibt; sie zählen gegen dein Nutzungslimit), aber nur wenige. Teurer ist ein Wechsel des Modells: Das neue Modell liest den bisherigen Chat einmal ganz neu. Der Vorschlag nennt deshalb, wie viele Tokens das sind und wie vielen Runden das etwa entspricht; eine Runde ist eine Antwort von Claude auf deine Nachricht, mit allem, was er dabei tut. Nach ein paar Runden hat Modellwahl gemessen, wie viel Prozent deines Sitzungslimits (5 Stunden) Tokens kosten (die Kalibrierung), und nennt dann den Anteil. Ändert sich nur der Aufwand, wird nichts neu gelesen.',
    '',
    'Vom Handy (Remote Control)',
    'Dort gibt es keine Leiste und keine Buttons, und ein Vorschlag gilt nie von selbst. Schick ja, ok oder /modellwahl ja, um ihn anzunehmen, oder /modellwahl nein, um ihn zu verwerfen. Nach 10 Minuten verfällt ein Vorschlag vom Handy; ein ja geht dann nur noch an Claude.',
    '',
    'Befehle',
    'Befehlsnamen schreiben Umlaute als ae, oe, ue und ss.',
    ...BEFEHLE.map(b => `/${b.name}${b.argumentHint === '[hilfe]' ? '' : ` ${b.argumentHint}`} · ${b.description}`),
    'Mehr zu jedem Befehl: hilfe dahinter, etwa /modellwahl:zeigen hilfe.',
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
    /** Der Rat zur letzten Nachricht: nur in der Statuszeile, gilt nie von selbst (Björn, 2026-10-31). */
    tipp: Einschaetzung | null
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
    tipp: null,
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

/**
 * Die Statuszeile: was antwortet, solange eine Wahl gilt, dahinter der offene Vorschlag oder
 * der Rat zur letzten Nachricht, wenn er davon abweicht. Die Auswahl der App folgt der Wahl nicht.
 */
export function statusText(
    wahl: { modell: Modell; aufwand: Aufwand; zurueckgezogen: boolean } | null,
    vorschlag: { modell: Modell; aufwand: Aufwand } | null,
): string | undefined {
    const gilt = wahl && !wahl.zurueckgezogen ? wahl : null
    const teile: string[] = []
    if (gilt) {
        teile.push(`Antwortet: ${wahlText(gilt)}`)
    }
    if (vorschlag && !(gilt && gilt.modell === vorschlag.modell && gilt.aufwand === vorschlag.aufwand)) {
        teile.push(`${gilt ? 'Vorschlag' : 'Modellvorschlag'}: ${wahlText(vorschlag)}`)
    }
    return teile.length > 0 ? teile.join(' · ') : undefined
}

function zeigeStatus($: EngineInterface): void {
    try {
        $.ui.status(statusText(z.wahl, z.offen ? z.offen.wahl : z.tipp))
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
    z.tipp = null
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
    const warum =
        grund === 'zeit'
            ? 'Die Einschätzung kam nicht in 5 Sekunden'
            : grund === 'unlesbar'
              ? 'Die Antwort der Einschätzung war nicht lesbar'
              : 'Die Anfrage zur Einschätzung ist gescheitert'
    return `Modellwahl: Das hat nicht geklappt: ${warum}. Modell und Aufwand bleiben; /modellwahl versucht es noch einmal.`
}

/** Der Hinweis an Claude nach dem automatischen Vorschlag. */
export function hinweisVorschlag(w: Einschaetzung, vomHandy: boolean): string {
    return vomHandy
        ? `Der Mod Modellwahl schlägt für diesen Chat ${wahlText(w)} vor; das gilt erst, wenn die Person mit ja oder ok zustimmt. ` +
              `Beginne deine Antwort mit genau einem kurzen Satz: "Modellwahl schlägt ${wahlText(w)} vor; übernehmen mit ja oder ok." Danach antworte wie gewohnt.`
        : `Der Mod Modellwahl schlägt für diesen Chat ${wahlText(w)} vor; ohne Einspruch gilt das nach 15 Sekunden. ` +
              `Beginne deine Antwort mit genau einem kurzen Satz: "Modellwahl schlägt ${wahlText(w)} vor; gilt in 15 Sekunden, wenn du nicht Nein drückst." Danach antworte wie gewohnt.`
}

/** Der Hinweis an Claude, wenn ein ja oder ok den Vorschlag angenommen hat. */
export function hinweisUebernommen(w: Einschaetzung): string {
    return (
        `Mit dieser Nachricht hat die Person den Vorschlag des Mods Modellwahl angenommen: ab jetzt ${wahlText(w)}. ` +
        `Beginne deine Antwort mit genau einem kurzen Satz: "Modellwahl: ${wahlText(w)} übernommen." ` +
        'Galt das ja oder ok auch einer Frage von dir, antworte danach darauf wie gewohnt.'
    )
}

/** Der Hinweis an Claude, wenn die Einschaetzung ausblieb. */
export const HINWEIS_OHNE =
    'Der Mod Modellwahl konnte die Aufgabe nicht einschätzen; Modell und Aufwand bleiben. ' +
    'Beginne deine Antwort mit genau einem kurzen Satz: "Modellwahl: keine Einschätzung, Modell und Aufwand bleiben." Danach antworte wie gewohnt.'

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

/** Die Wahl mit Grund, als Satzteil: "Opus · Hoch (Umbau über mehrere Dateien)". */
const mitGrund = (w: Einschaetzung) => `${wahlText(w)}${w.grund ? ` (${w.grund})` : ''}`

/** Der Text des Vorschlags: was er waere, was das Neueinlesen kostet, wann und wie er gilt. */
async function vorschlagText($: EngineInterface, w: Einschaetzung, modellAendert: boolean, vomHandy: boolean): Promise<string> {
    const teile = [`Modellwahl-Vorschlag: ${mitGrund(w)}.`]
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
        const verbraucht = limit ? String(Math.round(limit.percentUsed * 10) / 10).replace('.', ',') : null
        const menge = tokens != null && tokens > 0 ? `${tokenText(tokens)} Tokens Kontext` : 'den Kontext'
        teile.push(
            est.prozent != null && tokens != null
                ? `Der Wechsel liest ${menge} neu, etwa ${prozentText(est.prozent)} deines Sitzungslimits (5 Stunden)${verbraucht ? `; verbraucht sind jetzt ${verbraucht} %` : ''}.`
                : `Der Wechsel liest ${menge} neu, etwa so viel wie ${est.runden} normale Runden${verbraucht ? `; verbraucht sind jetzt ${verbraucht} % deines Sitzungslimits (5 Stunden)` : ''}.`,
        )
    } else {
        teile.push('Das Modell bleibt, deshalb wird nichts neu gelesen.')
    }
    teile.push(
        vomHandy
            ? 'Übernehmen mit ja, ok oder /modellwahl ja (10 Minuten lang), verwerfen mit /modellwahl nein.'
            : 'Gilt in 15 s, wenn du nichts tust; Nein in der Leiste über dem Eingabefeld oder /modellwahl nein verwirft ihn.',
    )
    return teile.join(' ')
}


/** /modellwahl [Aufgabe | ja | nein], auch hinter /modellwahl:uebernehmen und /modellwahl:ablehnen. */
async function befehlWahl($: EngineInterface, args: string, vomHandy: boolean): Promise<string> {
    await sitzung($)
    const a = args.trim()
    if (/^(?:ja|ok|okay)$/i.test(a)) {
        const vorher = (await aktuell($)).modell
        const w = await uebernehme($)
        if (!w) {
            await setzeVorschlag($, null)
            return 'Modellwahl: Gerade ist kein Vorschlag offen. /modellwahl holt einen neuen.'
        }
        return `Modellwahl: ${mitGrund(w)} gilt jetzt.${familieVon(vorher) !== w.modell ? ' Das neue Modell liest den Chat einmal neu.' : ''}`
    }
    if (/^nein$/i.test(a)) {
        return (await lehneAb($))
            ? 'Modellwahl: Vorschlag verworfen. Modell und Aufwand bleiben, wie sie sind.'
            : 'Modellwahl: Gerade ist kein Vorschlag offen.'
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
        return `Modellwahl: ${wahlText(r.wahl)} passt schon, es bleibt dabei.`
    }
    await schlageVor($, r.wahl, vomHandy)
    return vorschlagText($, r.wahl, modellAendert, vomHandy)
}

/** /modellwahl:zeigen. */
async function befehlZeigen($: EngineInterface): Promise<string> {
    await sitzung($)
    const jetzt = await $.clock.now()
    const zeilen: string[] = []
    const w = z.wahl
    if (w) {
        zeilen.push(`Modellwahl: ${mitGrund(w)}, gewählt vor ${dauerText(jetzt - w.at)}.`)
        zeilen.push(
            w.zurueckgezogen
                ? 'Zurückgezogen: ja. Du hast Modell oder Aufwand selbst umgestellt, Modellwahl stellt in diesem Chat nichts mehr um.'
                : 'Zurückgezogen: nein, Modellwahl stellt Modell und Aufwand ein.',
        )
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
            ? `Automatik beim Neubeginn: ${z.standardAuto ? 'an' : 'aus'} (Standard für neue Chats).`
            : `Automatik beim Neubeginn: ${z.auto ? 'an' : 'aus'} (nur dieser Chat).`,
    )
    const k = await ladeKalibrierung($)
    zeilen.push(
        k.quote !== null && k.quote > 0
            ? `Kalibrierung: ${k.proben} ${k.proben === 1 ? 'Messung' : 'Messungen'}, 1 % des Sitzungslimits (5 Stunden) ≈ ${tokenText(1 / k.quote)} Opus-Tokens.`
            : 'Kalibrierung: noch keine Messung; bis dahin nennt ein Vorschlag die Kosten in Runden.',
    )
    return zeilen.join('\n')
}

/** /modellwahl:auto-an und :auto-aus. */
async function befehlAuto($: EngineInterface, an: boolean): Promise<string> {
    await sitzung($)
    z.auto = an
    if (z.sid) {
        await $.store.set(SPEICHER_AUTO + z.sid, { at: await $.clock.now(), isOn: an } satisfies AutoSchalter)
    }
    // Ob die naechste Nachricht noch die erste dieses Chats ist und damit selbst einen Vorschlag bekaeme.
    const ersteSteht = z.neu && !z.wahl
    const wirkung = an
        ? ersteSteht
            ? 'Deine nächste Nachricht bekommt einen Vorschlag für Modell und Aufwand, ebenso die erste nach jedem /clear in diesem Fenster.'
            : 'Die erste Nachricht nach jedem /clear in diesem Fenster bekommt einen Vorschlag für Modell und Aufwand.'
        : ersteSteht
          ? 'Deine nächste Nachricht bekommt keinen Vorschlag, die erste nach /clear in diesem Fenster auch nicht.'
          : 'Die erste Nachricht nach /clear in diesem Fenster bekommt keinen Vorschlag.'
    return `Modellwahl: Automatik für diesen Chat ${an ? 'an' : 'aus'}. ${wirkung} Ein neuer Chat, der nicht mit /clear beginnt, folgt weiter dem Standard, siehe /modellwahl:hilfe unter Einstellen.`
}

async function wirke($: EngineInterface, name: Befehl, args: string, vomHandy: boolean): Promise<string> {
    switch (name) {
        case 'modellwahl':
            return befehlWahl($, args, vomHandy)
        case 'modellwahl:uebernehmen':
            return befehlWahl($, 'ja', vomHandy)
        case 'modellwahl:ablehnen':
            return befehlWahl($, 'nein', vomHandy)
        case 'modellwahl:zeigen':
            return befehlZeigen($)
        case 'modellwahl:hilfe':
            return HILFE
        case 'modellwahl:auto-an':
            return befehlAuto($, true)
        case 'modellwahl:auto-aus':
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
        // Nur der Grundbefehl; die Langformen /modellwahl:… kommen aus commands/ des Mods.
        await $.command
            .register({
                name: GRUNDBEFEHL.name,
                description: `Modellwahl: ${GRUNDBEFEHL.description}`,
                argumentHint: GRUNDBEFEHL.argumentHint,
                immediate: true,
            })
            .catch(() => {})
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
            if (!auto) {
                return next(e)
            }
            // Nur ein Rat in der Statuszeile, nebenher: Die Nachricht wartet nicht darauf.
            // Mit den letzten Nachrichten: Ein kurzes "ja" setzt die laufende Arbeit fort.
            const sid = z.sid
            void verlauf($).then(v => schaetze($, e.text, v)).then(r => {
                if (r.ok && z.sid === sid) {
                    z.tipp = r.wahl
                    zeigeStatus($)
                }
            })
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

    // Was dieses Laden zuletzt als Hoehe im Band veroeffentlicht oder geplant hat (meldeBandHoehe).
    const band: BandMerker = { veroeffentlicht: new Map(), geplant: new Map() }

    // Über der Eingabe, solange ein Vorschlag wartet: was er wäre, wann er gilt, Übernehmen und Nein.
    // Das Band zeichnen nur Terminal und Desktop-App; auf dem Handy wartet nichts darauf.
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
        const darunter = await next(e)
        if (e.props.hasSurvey || e.surface === 'mobile') {
            if (e.surface !== 'mobile') {
                meldeBandHoehe($, band, e.surface, 0)
            }
            return darunter
        }
        const v = await read($, vorschlagAtom)
        // Einer aus einem frueheren Laden hat keinen Takt mehr: er gilt als verworfen.
        if (!v || z.offen?.at !== v.at) {
            meldeBandHoehe($, band, e.surface, 0)
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
        meldeBandHoehe($, band, e.surface, zeilenVon(zeile as RenderNode, e.surface, e.props.bodyColumns))
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

    // Ein alter Name wie /modellwahl-zeigen sagt nur, wie der Befehl jetzt heisst, und tut sonst nichts.
    on('command.run', { command: [...ALTE_BEFEHLE.keys()] }, async ($, e) => {
        const jetzt = ALTE_BEFEHLE.get(e.command)
        return { text: jetzt === undefined ? BEFEHL_FEHLER : neuerName(jetzt) }
    }).catch(() => ({ text: BEFEHL_FEHLER }))
}

/** Je Flaeche: die zuletzt veroeffentlichte und die geplante Hoehe im Band. */
type BandMerker = { veroeffentlicht: Map<RenderSurface, number>; geplant: Map<RenderSurface, number> }

/**
 * Veroeffentlicht die Hoehe der eigenen Zeile im Band, je Flaeche, fuer die Mods, die ihren Platz
 * danach planen (hooks/band.ts): 1 mit wartendem Vorschlag, sonst 0. Beim Zeichnen darf kein Hook
 * schreiben: geschrieben wird einen Takt spaeter und nur bei einer Aenderung, sonst zeichnet jede
 * Schreibung neu und plant die naechste.
 */
function meldeBandHoehe($: EngineInterface, band: BandMerker, flaeche: RenderSurface, zeilen: number): void {
    const geplant = band.geplant.get(flaeche)
    if ((geplant ?? band.veroeffentlicht.get(flaeche)) === zeilen) {
        return
    }
    band.geplant.set(flaeche, zeilen)
    if (geplant !== undefined) {
        return
    }
    $.clock.after(0, () => {
        const g = band.geplant.get(flaeche)
        band.geplant.delete(flaeche)
        if (g === undefined || band.veroeffentlicht.get(flaeche) === g) {
            return
        }
        band.veroeffentlicht.set(flaeche, g)
        const hoehe: BandHoehe = { v: BAND_VERSION, voll: g, klein: g }
        void $.state.set({ plugin: 'modellwahl', key: 'bandHoehe', id: flaeche }, hoehe).catch(() => {
            band.veroeffentlicht.delete(flaeche)
        })
    })
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
    z.tipp = null
    await setzeVorschlag($, null)
}
