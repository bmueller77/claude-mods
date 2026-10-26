import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Bericht, Phase, Schicht } from '../types'

/** Die letzte Zeile, mit der Claude meldet, dass alles erledigt ist, was ohne die Person geht. */
export const FERTIG = 'AUTOPILOT-FERTIG'
/**
 * Dieselbe Marke aus der Zeit, als der Mod Nachtschicht hiess. Sitzungen, die
 * davor begannen, kennen nur sie und schreiben sie weiter; sie zaehlt deshalb mit.
 */
const FERTIG_ALT = 'NACHTSCHICHT-FERTIG'
/** So viele Rueckfragen behaelt die Liste; aeltere fallen raus. */
const FRAGEN_MAX = 20
/** Nach so vielen angeschobenen Runden in Folge ohne Werkzeugaufruf haelt die Schicht an. */
const LEERLAUF_MAX = 2
/** Nach so vielen API-Fehlern in Folge haelt die Schicht an. */
const FEHLER_MAX = 3
/** So lange wartet die Schicht nach einem API-Fehler, bevor sie wieder anschiebt. */
const FEHLER_PAUSE_MS = 60_000
/**
 * So lange nach dem Einschalten, bis Claude weitermacht. Ein Befehl haelt die
 * Runde fest, solange er laeuft; abschicken geht erst, wenn er durch ist.
 */
const START_PAUSE_MS = 1000
/**
 * So lange darf ein eingereichter Anstoss warten, waehrend keine Runde laeuft,
 * bevor er als verloren gilt (etwa aus der Schlange genommen). Gezaehlt wird nur
 * die Ruhe: Waehrend eine Runde laeuft, kann er nicht beginnen, und die Uhr steht.
 */
const AUSSTEHEND_VERFALL_MS = 10 * 60_000

/** Der Grund im Bericht, wenn die Person den Autopiloten mit 🅰️ im Leitstand beendet hat. */
export const GRUND_KNOPF = 'du hast ihn über 🅰️ beendet'

/** Der Grund im Bericht, wenn Claude mit der Marke meldet, dass alles erledigt ist. */
export const GRUND_FERTIG = 'Claude meldet: alles erledigt'

/** Der Grund im Bericht, wenn der Autopilot so oft angeschoben hat, wie maxRunden erlaubt. */
export const GRUND_GRENZE = 'Rundengrenze'

/** Wo ein Agent laut `$.agent.list()` noch arbeitet (AgentStatus); die anderen sind fertig oder warten auf eine Nachricht. */
const AGENT_ARBEITET: ReadonlySet<string> = new Set(['pending', 'running', 'waiting'])

/**
 * Welche Hintergrundarbeit (`background_tasks[].type` am Rundenende) das Anschieben
 * zurueckhaelt: Agenten und Workflows, die sich mit einer Fertigmeldung zurueckmelden.
 * Shells und Monitore nicht: Ein Dev-Server oder ein Monitor laeuft beliebig lange
 * und wuerde den Autopiloten sonst stilllegen.
 */
const HINTERGRUND_HAELT: ReadonlySet<string> = new Set(['subagent', 'workflow'])

/**
 * Herkunft einer Nachricht der Person: im Terminal getippt (composer), in der
 * Desktop-App (sdk) oder per Remote Control vom Handy (bridge). Einreichungen
 * von Mods (plugin) zaehlen nie, auch nicht mit asUser.
 */
const PERSON: ReadonlySet<string> = new Set(['composer', 'sdk', 'bridge'])

/**
 * Wo der Leitstand den Wunsch ablegt, die Schicht zu beenden: die Zeit des
 * Drucks auf 🅰️. Sein /autopilot aus wartet, bis die Sitzung still ist, und das
 * wird sie nicht, solange die Schicht Runde um Runde anschiebt. Darum liest die
 * Schicht den Wunsch selbst; jeder Mod darf fremden Zustand lesen, schreiben nur
 * seinen eigenen.
 */
const LEITSTAND_STOPP = { plugin: 'leitstand', key: 'autopilotStop' } as const

const schicht = atom({ plugin: 'autopilot', key: 'schicht' } as const, null as Schicht | null)
const bericht = atom({ plugin: 'autopilot', key: 'bericht' } as const, null as Bericht | null)
const zeigeFragen = atom({ plugin: 'autopilot', key: 'zeigeFragen' } as const, false)

const REGELN =
    'Stell keine Rückfragen, weder mit einem Werkzeug noch am Ende deiner Antwort. ' +
    'Wo du eine Entscheidung brauchst, triff sie selbst: Nimm die Option, die du empfehlen würdest, ' +
    'bei Zweifeln die vorsichtigere, die sich leicht rückgängig machen lässt, und halte sie in einem Satz fest. ' +
    'Nichts Unumkehrbares, das die Person nicht vorher ausdrücklich verlangt hat: nichts löschen, ' +
    'veröffentlichen, verschicken oder pushen. Was nur mit der Person geht, lässt du liegen und schreibst es auf. ' +
    'Wenn alles erledigt ist, was ohne die Person geht, schreib eine kurze Übergabe ' +
    '(was fertig ist, was du selbst entschieden hast, was liegen blieb) ' +
    `und als letzte Zeile ${FERTIG}.`

/** Was eine Nachricht der Person waehrend der Schicht mitbekommt, fuer sie unsichtbar. */
export const KONTEXT = `Der Autopilot ist an: Die Person ist gleich nicht mehr am Platz und kann nicht antworten. ${REGELN}`

/** Womit die Schicht Claude nach einer Runde ohne Abschluss anschiebt. */
export const WEITER =
    'Die Person ist nicht am Platz und hat den Autopiloten eingeschaltet. ' +
    `Mach mit der Aufgabe weiter, ohne auf sie zu warten. ${REGELN}`

/** Was Claude liest, wenn es waehrend der Schicht eine Rueckfrage stellen will. */
export const FRAGE_ABGELEHNT =
    'Autopilot: Die Person ist nicht am Platz und kann nicht antworten. ' +
    'Entscheide diese Frage selbst (die Option, die du empfehlen würdest, bei Zweifeln die vorsichtigere), ' +
    'halte die Entscheidung in einem Satz fest und arbeite weiter.'

/**
 * Ob Claude mit dieser Antwort meldet, dass es fertig ist.
 *
 * Nur die letzten Zeilen zaehlen: wer die Marke mitten im Text erwaehnt,
 * etwa beim Erklaeren, ist damit noch nicht fertig. Die alte Marke gilt auch.
 */
export function istFertig(antwort: string): boolean {
    return antwort
        .trim()
        .split('\n')
        .slice(-3)
        .some(zeile => [FERTIG, FERTIG_ALT].some(marke => zeile.toUpperCase().includes(marke)))
}

/** "1 Frage", "3 Fragen". */
function fragenText(n: number): string {
    return n === 1 ? '1 Frage' : `${n} Fragen`
}

/** Die Zahlen einer Schicht in einer Zeile. */
function zahlen(geschoben: number, fragen: number): string {
    const teile = [`${geschoben}x angeschoben`]
    if (fragen > 0) {
        teile.push(`${fragenText(fragen)} selbst entschieden`)
    }
    return teile.join(', ')
}

const STATUS: Record<Phase, string> = {
    laeuft: 'Claude arbeitet ohne Rückfragen weiter',
    fertig: 'Claude meldet: alles erledigt',
    angehalten: 'angehalten',
}

// Was nur dieses Laden des Moduls braucht. Ein Neuladen beginnt hier von vorn,
// die Schicht selbst liegt in `$.state` und bleibt.

/** Hoechstens so oft schiebt die Schicht an, bis die Person wieder schreibt (userConfig). */
let maxRunden = 10
/** Die Runde der Hauptschleife, die gerade laeuft (von turn.start bis zu ihrem turn.complete); null, wenn keine. */
let laufend: string | null = null
/** Ob ein Anstoss eingereicht ist, dessen Runde noch nicht begonnen hat: Er wartet in der Schlange. */
let ausstehend = false
/** Laesst `ausstehend` verfallen, wenn der Anstoss in der Ruhe nicht beginnt; null, solange die Uhr steht. */
let verfall: { cancel: () => void } | null = null
/** Ob es in dieser Sitzung schon eine Runde gab, an die eine neue Schicht anschliessen kann. */
let hatRunde = false
/** Werkzeugaufrufe der laufenden Runde. */
let werkzeuge = 0
/**
 * Wie viele Agenten und Workflows die Engine am Ende der letzten Runde der
 * Hauptschleife als laufend meldete (`classic.Stop`, vor `turn.complete`); Shells
 * und Monitore zaehlen nicht. null, solange seit dem Beginn der Runde keine Meldung kam.
 */
let hintergrund: number | null = null
/** API-Fehler in Folge. */
let fehler = 0
/** Das Anschieben nach einem API-Fehler, solange es noch wartet. */
let warte: { cancel: () => void } | null = null

function verfallStoppen(): void {
    verfall?.cancel()
    verfall = null
}

/** Startet die Uhr fuer den wartenden Anstoss neu: Ab jetzt ist Ruhe, er sollte gleich beginnen. */
function verfallStellen($: EngineInterface): void {
    verfallStoppen()
    verfall = $.clock.after(AUSSTEHEND_VERFALL_MS, () => {
        verfall = null
        ausstehend = false
    })
}

function ausstehendLoeschen(): void {
    ausstehend = false
    verfallStoppen()
}

function zaehlerAuf0(): void {
    fehler = 0
    warte?.cancel()
    warte = null
}

/**
 * Ob der Leitstand diese Schicht beenden will: ein Wunsch, juenger als ihr
 * Beginn. Ein aelterer galt einer frueheren Schicht. Ohne Leitstand, oder wenn
 * das Lesen scheitert, gibt es keinen Wunsch.
 */
async function sollAus($: EngineInterface, s: Schicht): Promise<boolean> {
    try {
        // Der Wert steht im Vertrag des Leitstands, nicht in diesem: darum hier getypt.
        const { value } = (await $.state.get(LEITSTAND_STOPP as never)) as { value?: unknown }
        return typeof value === 'number' && value > s.seit
    } catch {
        return false
    }
}

async function anschieben($: EngineInterface): Promise<void> {
    // Hoechstens ein Anstoss unterwegs, und keiner, waehrend schon eine Runde laeuft: deren Ende entscheidet.
    if (laufend !== null || ausstehend) {
        return
    }
    ausstehend = true
    verfallStellen($)
    // Die Markierung setzt anschieben selbst, vor dem Einreichen: Den eigenen
    // $.prompt.submit sieht der prompt.submit-Hook dieses Mods nie (Re-entry-Regel,
    // reference.md: er wird unter den Frames des aufrufenden Hooks erhoben). Darum
    // griff die Leerlauf-Bremse bis 0.4.0 nie.
    await update($, schicht, s =>
        s ? { ...s, geschoben: s.geschoben + 1, runden: (s.runden ?? 0) + 1, angeschoben: true } : s,
    )
    void $.prompt.submit({ text: WEITER }).catch(() => {
        ausstehendLoeschen()
    })
}

/**
 * Ob noch Hintergrundarbeit dieser Sitzung laeuft. Ihre Fertigmeldung startet
 * ohnehin eine neue Runde. Ohne Meldung der Engine seit Rundenbeginn (nach einem
 * API-Fehler, nach einem Neuladen) fragt sie die Liste der Agenten.
 */
async function hintergrundLaeuft($: EngineInterface): Promise<boolean> {
    if (hintergrund !== null) {
        return hintergrund > 0
    }
    try {
        const agenten = await $.agent.list()
        return agenten.some(a => AGENT_ARBEITET.has(a.status))
    } catch {
        return false
    }
}

/**
 * Vor jedem Anstoss: Laeuft Hintergrundarbeit, wartet die Schicht ('warten'),
 * ohne zu zaehlen. Hat sie so oft angeschoben, wie maxRunden erlaubt, endet sie
 * mit dem Grund Rundengrenze ('ende'). Sonst darf sie anschieben ('los').
 */
async function vorDemAnstoss($: EngineInterface, s: Schicht): Promise<'warten' | 'ende' | 'los'> {
    if (await hintergrundLaeuft($)) {
        return 'warten'
    }
    if ((s.runden ?? 0) >= maxRunden) {
        await beenden($, GRUND_GRENZE)
        return 'ende'
    }
    return 'los'
}

async function anhalten($: EngineInterface, phase: Phase, grund: string): Promise<void> {
    warte?.cancel()
    warte = null
    await update($, schicht, s => (s ? { ...s, phase, grund } : s))
}

/** Nach einer Pause: anschieben, falls die Schicht noch laeuft und Claude gerade nichts tut. */
async function anschiebenWennNoetig($: EngineInterface): Promise<void> {
    warte = null
    const s = await read($, schicht)
    if (s?.phase === 'laeuft' && laufend === null && !ausstehend) {
        // Kam in der Pause 🅰️ im Leitstand, endet die Schicht, statt anzuschieben.
        if (await sollAus($, s)) {
            await beenden($, GRUND_KNOPF)
            return
        }
        if ((await vorDemAnstoss($, s)) !== 'los') {
            return
        }
        await anschieben($)
    }
}

/** Schiebt nach `ms` an; ein neues Warten oder das Ende der Schicht hebt es auf. */
function spaeterAnschieben($: EngineInterface, ms: number): void {
    warte?.cancel()
    warte = $.clock.after(ms, () => void anschiebenWennNoetig($).catch(() => {}))
}

/**
 * Beim Einschalten: Gab es schon eine Runde und laeuft gerade keine, wartet
 * Claude vermutlich auf eine Antwort. Dann geht es gleich weiter; true.
 */
function gleichWeiter($: EngineInterface): boolean {
    if (hatRunde && laufend === null) {
        spaeterAnschieben($, START_PAUSE_MS)
        return true
    }
    return false
}

/** Startet eine Schicht; true, wenn Claude gleich weitermacht. */
async function beginnen($: EngineInterface): Promise<boolean> {
    zaehlerAuf0()
    ausstehendLoeschen()
    const seit = await $.clock.now()
    await update($, bericht, () => null)
    await update($, zeigeFragen, () => false)
    await update($, schicht, () => ({ seit, phase: 'laeuft' as const, grund: null, geschoben: 0, runden: 0, angeschoben: false, leerlauf: 0, fragen: [] }))
    return gleichWeiter($)
}

/** Laesst eine angehaltene oder fertige Schicht weiterlaufen; true, wenn Claude gleich weitermacht. */
async function fortsetzen($: EngineInterface): Promise<boolean> {
    zaehlerAuf0()
    ausstehendLoeschen()
    await update($, schicht, s =>
        s ? { ...s, phase: 'laeuft' as const, grund: null, runden: 0, angeschoben: false, leerlauf: 0 } : s,
    )
    return gleichWeiter($)
}

/** Beendet die Schicht und legt den Bericht hin; null, wenn keine lief. */
async function beenden($: EngineInterface, grund: string): Promise<Bericht | null> {
    zaehlerAuf0()
    const s = await read($, schicht)
    if (!s) {
        return null
    }
    const minuten = Math.max(0, Math.round(((await $.clock.now()) - s.seit) / 60_000))
    const b: Bericht = { minuten, geschoben: s.geschoben, fragen: s.fragen, grund }
    await update($, schicht, () => null)
    await update($, zeigeFragen, () => false)
    await update($, bericht, () => b)
    return b
}

async function fragenUmschalten($: EngineInterface): Promise<void> {
    await update($, zeigeFragen, v => !v)
}

async function berichtWeg($: EngineInterface): Promise<void> {
    await update($, bericht, () => null)
}

/** Wie die Engine eine Befehlsantwort beginnt: die Namen der Mods, die den Befehl hooken, mit + verbunden. */
const VORSATZ = /^(<local-command-stdout>)([a-z0-9-]+(?:\+[a-z0-9-]+)*): /
/** Steht statt des Vorsatzes am Ende einer Antwort des Autopiloten. */
export const GEMELDET = '(gemeldet vom Mod Autopilot)'

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

/**
 * Schaltet den Autopiloten an (`soll`) oder aus, wie /autopilot an und /autopilot aus;
 * zurueck kommt die Antwort des Befehls.
 */
async function schalte($: EngineInterface, soll: boolean): Promise<string> {
    const s = await read($, schicht)
    if (!soll) {
        // Kommt das aus vom Knopf 🅰️ im Leitstand, sagt der Bericht das.
        const b = await beenden($, s && (await sollAus($, s)) ? GRUND_KNOPF : 'du hast ihn beendet')
        if (b) {
            return `Der Autopilot ist aus: ${zahlen(b.geschoben, b.fragen.length)}.`
        }
        // Den Druck auf 🅰️ hat die Schicht meist schon am Ende der Runde erledigt;
        // das /autopilot aus des Leitstands kommt erst danach, wenn die Sitzung still ist.
        const vorher = await read($, bericht)
        return vorher?.grund === GRUND_KNOPF
            ? `Der Autopilot ist aus: ${zahlen(vorher.geschoben, vorher.fragen.length)}.`
            : 'Der Autopilot war nicht an.'
    }
    if (s?.phase === 'laeuft') {
        return 'Der Autopilot läuft schon. /autopilot aus beendet ihn.'
    }
    if (s) {
        // Angehalten oder fertig: dieselbe Schicht geht weiter, die Zaehler von vorn.
        const gleich = await fortsetzen($)
        return `Der Autopilot läuft wieder.${gleich ? ' Claude macht jetzt gleich weiter.' : ''}`
    }
    const gleich = await beginnen($)
    return (
        'Der Autopilot ist an: Claude arbeitet ohne Rückfragen weiter und schreibt am Ende eine Übergabe. ' +
        (gleich ? 'Es macht jetzt gleich weiter. ' : '') +
        'Freigabe-Dialoge halten ihn trotzdem an. /autopilot schaltet ihn wieder aus.'
    )
}

/** Die selbst entschiedenen Fragen als Text, wie sie der Knopf Fragen aufklappt. */
async function fragenAlsText($: EngineInterface): Promise<string> {
    const s = await read($, schicht)
    const b = s ? null : await read($, bericht)
    if (!s && !b) {
        return 'Der Autopilot war in diesem Chat nicht an, es gibt keine selbst entschiedenen Fragen.'
    }
    const fragen = s ? s.fragen : (b?.fragen ?? [])
    if (fragen.length === 0) {
        return 'Claude hat bisher keine Frage selbst entschieden.'
    }
    const kopf = fragen.length === 1 ? 'Diese Frage hat Claude selbst entschieden:' : `Diese ${fragen.length} Fragen hat Claude selbst entschieden:`
    return [kopf, ...fragen.map(f => `- ${f}`)].join('\n')
}

/** Der Knopf Weg: den Bericht einer beendeten Schicht wegraeumen. */
async function berichtWegText($: EngineInterface): Promise<string> {
    if (await read($, schicht)) {
        return 'Der Autopilot läuft noch; einen Bericht gibt es erst, wenn er endet.'
    }
    if (!(await read($, bericht))) {
        return 'Es gibt keinen Bericht des Autopiloten, den man wegräumen könnte.'
    }
    await berichtWeg($)
    return 'Der Bericht des Autopiloten ist weg.'
}

// --- Befehle mit Hilfe ---

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
    { name: 'autopilot', description: 'schaltet den Autopiloten ein oder aus (Kurzform, versteht an und aus)' },
]

/**
 * Die Einzelbefehle in der Langform /autopilot:<funktion>. Jeder liegt als Datei
 * in commands/ dieses Mods; Claude Code setzt autopilot: davor. Anmelden laesst
 * sich ein Name mit Doppelpunkt nicht, den Lauf beantwortet trotzdem dieser Mod.
 */
export const BEFEHLE: readonly Befehl[] = [
    {
        name: 'autopilot:hilfe',
        description: 'Alle Befehle des Autopiloten mit einer Zeile Erklärung',
        was: 'Listet alle Befehle des Autopiloten mit einer Zeile Erklärung.',
        knopf: 'keiner',
        gilt: 'zeigt nur Text, ändert nichts',
        argumente: 'keine; hilfe oder ? erklärt diesen Befehl',
        beispiel: '/autopilot:hilfe',
    },
    {
        name: 'autopilot:an',
        description: 'Autopilot einschalten: Claude arbeitet ohne Rückfragen weiter, während du weg bist',
        was: 'Schaltet den Autopiloten ein, wie /autopilot an. Claude stellt keine Rückfragen mehr, schiebt Runden ohne Abschluss an und schreibt am Ende eine Übergabe. Ein angehaltener Autopilot läuft wieder.',
        knopf: 'keiner in der Autopilot-Zeile; dasselbe wie /autopilot an',
        gilt: 'nur in diesem Chat',
        argumente: 'keine',
        beispiel: '/autopilot:an',
    },
    {
        name: 'autopilot:aus',
        description: 'Autopilot ausschalten; danach steht der Bericht über dem Eingabefeld',
        was: 'Beendet den Autopiloten und zeigt seinen Bericht, wie /autopilot aus.',
        knopf: 'Beenden in der Autopilot-Zeile',
        gilt: 'nur in diesem Chat',
        argumente: 'keine',
        beispiel: '/autopilot:aus',
    },
    {
        name: 'autopilot:fragen-zeigen',
        description: 'Die Fragen, die Claude im Autopiloten selbst entschieden hat, als Text',
        was: 'Zeigt die Rückfragen, die Claude während des Autopiloten selbst entschieden hat, als Liste im Chat.',
        knopf: 'Fragen in der Autopilot-Zeile, hier als Text statt aufgeklappt',
        gilt: 'nur in diesem Chat; ändert nichts',
        argumente: 'keine',
        beispiel: '/autopilot:fragen-zeigen',
    },
    {
        name: 'autopilot:bericht-weg',
        description: 'Den Bericht des beendeten Autopiloten über dem Eingabefeld wegräumen',
        was: 'Räumt den Bericht des beendeten Autopiloten über dem Eingabefeld weg.',
        knopf: 'Weg in der Autopilot-Zeile',
        gilt: 'nur in diesem Chat',
        argumente: 'keine',
        beispiel: '/autopilot:bericht-weg',
    },
]

/**
 * Die alten Namen bis autopilot 0.7: /autopilot-an statt /autopilot:an. Sie stehen
 * nicht mehr im Menue; wer einen tippt (eine alte Datei in ~/.claude/commands),
 * erfaehrt den neuen. Jeder mit dem vollen neuen Namen.
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
    const zeilen = [...BEFEHLE, ...KURZFORMEN]
    return ['Befehle des Autopiloten (jeder versteht hilfe oder ? als Argument):', ...zeilen.map(z => `/${z.name}: ${z.description}`)].join('\n')
}

/** Was ein Befehl tut; zurueck kommt die Antwort. */
async function wirke($: EngineInterface, name: string): Promise<string> {
    switch (name) {
        case 'autopilot:hilfe':
            return uebersicht()
        case 'autopilot:an':
            return schalte($, true)
        case 'autopilot:aus':
            return schalte($, false)
        case 'autopilot:fragen-zeigen':
            return fragenAlsText($)
        case 'autopilot:bericht-weg':
            return berichtWegText($)
        default:
            throw new Error(`kein Befehl ${name}`)
    }
}

export const register: Register = (on, options) => {
    maxRunden = Math.max(1, Math.floor(Number(options.maxRunden ?? 10)))

    // Die Desktop-App holt ihre Befehlsliste, bevor dieser Hook laeuft, und haelt
    // /autopilot als erste Nachricht sonst fuer unbekannt. Dafuer liegt dieselbe
    // Befehlsdatei in ~/.claude/commands; den Lauf beantwortet trotzdem dieser Mod.
    // `immediate`: Einschalten geht auch, waehrend Claude arbeitet. Die Einzelbefehle
    // /autopilot:an und so weiter sind Dateien in commands/ des Mods, nicht angemeldet.
    on('session.start', async ($, e, next) => {
        await $.command
            .register({
                name: 'autopilot',
                description: 'Autopilot ein- oder ausschalten: Claude arbeitet ohne Rückfragen weiter, während du weg bist',
                argumentHint: '[an|aus]',
                immediate: true,
            })
            .catch(() => {})
        return next(e)
    })

    // Die Engine setzt die Namen der Mods vor jede Befehlsantwort. Dieser Mod streicht in der
    // gespeicherten Zeile seinen und sagt stattdessen am Ende, dass die Antwort von ihm kommt.
    on('session.append', { door: 'command', message: { type: 'system', name: 'local_command' } }, async ($, e, next) => {
        const content = e.message.content.map(b => (b.type === 'text' && typeof b.text === 'string' ? { ...b, text: ohneVorsatz(b.text, 'autopilot', GEMELDET) } : b))
        return next({ ...e, message: { ...e.message, content } })
    }).catch(($, e, next) => next(e))

    on('command.run', { command: 'autopilot' }, async ($, e) => {
        const arg = e.args.trim().toLowerCase()
        const s = await read($, schicht)
        const soll = arg === 'an' || arg === 'ein' ? true : arg === 'aus' ? false : s === null
        return { text: await schalte($, soll) }
    })

    // Die Einzelbefehle: jeder versteht hilfe und ?, und ein Fehler wird ein schlichter Satz.
    for (const b of BEFEHLE) {
        on('command.run', { command: b.name }, async ($, e) => {
            if (istHilfe(e.args)) {
                return { text: hilfeText(b) }
            }
            try {
                return { text: await wirke($, b.name) }
            } catch {
                return { text: fehlerText(b.name) }
            }
        }).catch(() => ({ text: fehlerText(b.name) }))
    }

    // Ein alter Name wie /autopilot-an sagt nur, wie der Befehl jetzt heisst, und tut sonst nichts.
    on('command.run', { command: [...ALTE_BEFEHLE.keys()] }, async ($, e) => {
        const jetzt = ALTE_BEFEHLE.get(e.command)
        return { text: jetzt === undefined ? fehlerText(e.command) : neuerName(jetzt) }
    }).catch(($, e) => ({ text: fehlerText(e.command) }))

    on('prompt.submit', async ($, e, next) => {
        const s = await read($, schicht)
        if (!s || e.command || !PERSON.has(e.origin.kind)) {
            return next(e)
        }
        // Die Person hat selbst geschrieben: ein neuer Auftrag, die Zaehler beginnen von vorn.
        zaehlerAuf0()
        // Eine Schicht, die vor 0.6.0 mit der Marke fertig wurde, endet jetzt, statt wieder anzulaufen.
        if (s.phase === 'fertig') {
            await beenden($, GRUND_FERTIG)
            return next(e)
        }
        // Sie hat vorher 🅰️ im Leitstand gedrueckt: Die Schicht ist vorbei, die
        // Nachricht geht ohne den Kontext des Autopiloten raus.
        if (await sollAus($, s)) {
            await beenden($, GRUND_KNOPF)
            return next(e)
        }
        // Nur hier, bei einer Nachricht der Person, beginnt der Rundenzaehler von vorn.
        await update($, schicht, x =>
            x ? { ...x, phase: 'laeuft' as const, grund: null, runden: 0, angeschoben: false, leerlauf: 0 } : x,
        )
        return next({ ...e, context: [...(e.context ?? []), KONTEXT] })
    })

    on('turn.start', async ($, e, next) => {
        if (!e.agentId) {
            laufend = e.turnId
            werkzeuge = 0
            hintergrund = null
            // Solange eine Runde laeuft, kann der Anstoss nicht beginnen: Die Uhr steht.
            verfallStoppen()
            // Der eigene Anstoss hat seine Runde bekommen.
            if (e.text.includes(WEITER)) {
                ausstehend = false
            }
        }
        return next(e)
    })

    // Am Ende jeder Runde der Hauptschleife meldet die Engine, was noch im Hintergrund
    // laeuft, vor turn.complete. Subagenten melden sich mit SubagentStop, nicht hier.
    // Nur laufende Agenten und Workflows halten das Anschieben zurueck.
    on('classic.Stop', async ($, e, next) => {
        hintergrund = (e.background_tasks ?? []).filter(t => HINTERGRUND_HAELT.has(t.type)).length
        return next(e)
    }).catch(($, e, next) => next(e))

    on('tool.call', async ($, e, next) => {
        if (!e.agentId) {
            werkzeuge += 1
        }
        return next(e)
    }).catch(($, e, next) => next(e))

    // Eine Rueckfrage des Modells beantwortet die Schicht selbst. Fragt ein anderer Mod, bleibt es seine Sache.
    on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
        const s = await read($, schicht)
        if (!s || next.origin.plugin !== 'engine') {
            return next(e)
        }
        const neu = (e.questions ?? []).map(q => q.question).filter(q => q.trim() !== '')
        await update($, schicht, x => (x ? { ...x, fragen: [...x.fragen, ...neu].slice(-FRAGEN_MAX) } : x))
        return { deny: FRAGE_ABGELEHNT }
    })

    on('turn.complete', async ($, e, next) => {
        const r = await next(e)
        if (e.agentId) {
            return r
        }
        // Hat die Engine schon die naechste Runde gestartet, laeuft die weiter.
        if (laufend === e.turnId) {
            laufend = null
        }
        // Wartet noch ein Anstoss, ist ab jetzt Ruhe: Er sollte gleich beginnen.
        if (ausstehend && laufend === null) {
            verfallStellen($)
        }
        hatRunde = true

        const s = await read($, schicht)
        if (!s) {
            return r
        }
        // Ob diese Runde angeschoben war; die Markierung gilt nur fuer sie.
        const warAngeschoben = s.angeschoben === true
        if (warAngeschoben) {
            await update($, schicht, x => (x ? { ...x, angeschoben: false } : x))
        }
        if (e.reason === 'aborted') {
            // Wer unterbricht, ist da.
            await beenden($, 'du hast unterbrochen')
            return r
        }
        // 🅰️ im Leitstand: Die Person will die Schicht beenden. Das geht vor,
        // auch vor dem naechsten Anschieben.
        if (await sollAus($, s)) {
            await beenden($, GRUND_KNOPF)
            return r
        }
        if (s.phase !== 'laeuft') {
            return r
        }
        if (e.reason === 'refusal') {
            await anhalten($, 'angehalten', 'Claude hat abgelehnt')
            return r
        }
        if (e.reason === 'error') {
            fehler += 1
            if (fehler >= FEHLER_MAX) {
                await anhalten($, 'angehalten', `${FEHLER_MAX} API-Fehler in Folge`)
                return r
            }
            spaeterAnschieben($, FEHLER_PAUSE_MS)
            return r
        }
        fehler = 0
        // Die Marke beendet den Autopiloten: Der Bericht bleibt bis Weg, eine spaetere
        // Nachricht der Person schaltet ihn nicht wieder ein.
        if (istFertig(e.answer)) {
            await beenden($, GRUND_FERTIG)
            return r
        }
        // Eine andere Runde laeuft schon, oder ein Anstoss wartet noch: Deren Ende entscheidet.
        if (laufend !== null || ausstehend) {
            return r
        }
        // Hintergrundarbeit meldet sich selbst mit einer neuen Runde; an der Rundengrenze ist Schluss.
        if ((await vorDemAnstoss($, s)) !== 'los') {
            return r
        }
        const leerlauf = warAngeschoben && werkzeuge === 0 ? (s.leerlauf ?? 0) + 1 : 0
        await update($, schicht, x => (x ? { ...x, leerlauf } : x))
        if (leerlauf >= LEERLAUF_MAX) {
            await anhalten($, 'angehalten', 'Claude kommt ohne dich nicht weiter')
            return r
        }
        await anschieben($)
        return r
    })

    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
        const rest = await next(e)
        if (e.props.hasSurvey) {
            return rest
        }
        const s = await read($, schicht)
        const b = s ? null : await read($, bericht)
        if (!s && !b) {
            return rest
        }
        const offen = await read($, zeigeFragen)
        const fragen = s ? s.fragen : (b?.fragen ?? [])
        const { Box, Button, Text } = $.ui.resolve(e)

        const zeile = s ? (
            <Text wrap="wrap">
                {s.phase === 'angehalten' ? `angehalten: ${s.grund ?? ''}` : STATUS[s.phase]}
                {s.geschoben > 0 || s.fragen.length > 0 ? ` (${zahlen(s.geschoben, s.fragen.length)})` : ''}
            </Text>
        ) : (
            <Text wrap="wrap">
                vorbei, {b?.grund}, nach {b?.minuten} min: {zahlen(b?.geschoben ?? 0, fragen.length)}
            </Text>
        )

        // Der Schluessel `autopilot` ist fest: Leitstand und Statistik holen die Zeile
        // daran ganz nach oben, wenn sie den Teil des Autopiloten in ihren einbauen.
        // Eine Zeile: links der Status, der den freien Platz nimmt und umbricht, statt
        // die Knoepfe hinauszuschieben; rechts die Knoepfe.
        const eigene = (
            <Box key="autopilot" flexDirection="column" paddingX={1}>
                <Box flexDirection="row" gap={1}>
                    <Text color="suggestion" bold>
                        Autopilot:
                    </Text>
                    <Box flexGrow={1} flexShrink={1} minWidth={0}>
                        {zeile}
                    </Box>
                    <Box flexDirection="row" gap={2} flexShrink={0}>
                        {fragen.length > 0 ? (
                            <Button
                                key="ap-fragen"
                                label={offen ? 'Fragen zu' : `Fragen (${fragen.length})`}
                                onPress={() => void fragenUmschalten($)}
                            />
                        ) : null}
                        {s ? (
                            <Button key="ap-beenden" label="Beenden" onPress={() => void beenden($, 'du hast ihn beendet')} />
                        ) : (
                            <Button key="ap-weg" label="Weg" role="dismiss" onPress={() => void berichtWeg($)} />
                        )}
                    </Box>
                </Box>
                {offen && fragen.length > 0 ? (
                    <Box flexDirection="column">
                        <Text dimColor>Diese Fragen hat Claude selbst entschieden:</Text>
                        {fragen.map((f, i) => (
                            <Text key={`ap-frage-${i}`} dimColor wrap="wrap">
                                - {f}
                            </Text>
                        ))}
                    </Box>
                ) : null}
            </Box>
        )
        // Die eigene Zeile vor allem, was darunter kommt: Sie steht ganz oben im Band.
        return rest ? (
            <Box flexDirection="column">
                {eigene}
                {rest}
            </Box>
        ) : (
            eigene
        )
    })
}
