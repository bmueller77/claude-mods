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

/** Der Grund im Bericht, wenn die Person den Autopiloten mit 🅰️ im Leitstand beendet hat. */
export const GRUND_KNOPF = 'du hast ihn über 🅰️ beendet'

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
    'Stell keine Rueckfragen, weder mit einem Werkzeug noch am Ende deiner Antwort. ' +
    'Wo du eine Entscheidung brauchst, triff sie selbst: nimm die Option, die du empfehlen wuerdest, ' +
    'bei Zweifeln die vorsichtigere, die sich leicht rueckgaengig machen laesst, und halte sie in einem Satz fest. ' +
    'Nichts Unumkehrbares, das die Person nicht vorher ausdruecklich verlangt hat: nichts loeschen, ' +
    'veroeffentlichen, verschicken oder pushen. Was nur mit der Person geht, laesst du liegen und schreibst es auf. ' +
    'Wenn alles erledigt ist, was ohne die Person geht, schreib eine kurze Uebergabe ' +
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
    'Entscheide diese Frage selbst (die Option, die du empfehlen wuerdest, bei Zweifeln die vorsichtigere), ' +
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
    laeuft: 'Claude arbeitet ohne Rueckfragen weiter',
    fertig: 'Claude meldet fertig. Ein neuer Auftrag laeuft wieder ohne Rueckfragen.',
    angehalten: 'angehalten',
}

// Was nur dieses Laden des Moduls braucht. Ein Neuladen beginnt hier von vorn,
// die Schicht selbst liegt in `$.state` und bleibt.

/** Hoechstens so oft schiebt die Schicht an, bis die Person wieder schreibt (userConfig). */
let maxRunden = 10
/** Ob gerade eine Runde der Hauptschleife laeuft. */
let laeuft = false
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
    // Die Markierung setzt anschieben selbst, vor dem Einreichen: Den eigenen
    // $.prompt.submit sieht der prompt.submit-Hook dieses Mods nie (Re-entry-Regel,
    // reference.md: er wird unter den Frames des aufrufenden Hooks erhoben). Darum
    // griff die Leerlauf-Bremse bis 0.4.0 nie.
    await update($, schicht, s =>
        s ? { ...s, geschoben: s.geschoben + 1, runden: (s.runden ?? 0) + 1, angeschoben: true } : s,
    )
    void $.prompt.submit({ text: WEITER }).catch(() => {})
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
    if (s?.phase === 'laeuft' && !laeuft) {
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
    if (hatRunde && !laeuft) {
        spaeterAnschieben($, START_PAUSE_MS)
        return true
    }
    return false
}

/** Startet eine Schicht; true, wenn Claude gleich weitermacht. */
async function beginnen($: EngineInterface): Promise<boolean> {
    zaehlerAuf0()
    const seit = await $.clock.now()
    await update($, bericht, () => null)
    await update($, zeigeFragen, () => false)
    await update($, schicht, () => ({ seit, phase: 'laeuft' as const, grund: null, geschoben: 0, runden: 0, angeschoben: false, leerlauf: 0, fragen: [] }))
    return gleichWeiter($)
}

/** Laesst eine angehaltene oder fertige Schicht weiterlaufen; true, wenn Claude gleich weitermacht. */
async function fortsetzen($: EngineInterface): Promise<boolean> {
    zaehlerAuf0()
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

export const register: Register = (on, options) => {
    maxRunden = Math.max(1, Math.floor(Number(options.maxRunden ?? 10)))

    // Die Desktop-App holt ihre Befehlsliste, bevor dieser Hook laeuft, und haelt
    // /autopilot als erste Nachricht sonst fuer unbekannt. Dafuer liegt dieselbe
    // Befehlsdatei in ~/.claude/commands; den Lauf beantwortet trotzdem dieser Mod.
    // `immediate`: Einschalten geht auch, waehrend Claude arbeitet.
    on('session.start', async ($, e, next) => {
        await $.command
            .register({
                name: 'autopilot',
                description: 'Autopilot ein- oder ausschalten: Claude arbeitet ohne Rueckfragen weiter, waehrend du weg bist',
                argumentHint: '[an|aus]',
                immediate: true,
            })
            .catch(() => {})
        return next(e)
    })

    on('command.run', { command: 'autopilot' }, async ($, e) => {
        const arg = e.args.trim().toLowerCase()
        const s = await read($, schicht)
        const soll = arg === 'an' || arg === 'ein' ? true : arg === 'aus' ? false : s === null

        if (!soll) {
            // Kommt das aus vom Knopf 🅰️ im Leitstand, sagt der Bericht das.
            const b = await beenden($, s && (await sollAus($, s)) ? GRUND_KNOPF : 'du hast ihn beendet')
            if (b) {
                return { text: `Der Autopilot ist aus: ${zahlen(b.geschoben, b.fragen.length)}.` }
            }
            // Den Druck auf 🅰️ hat die Schicht meist schon am Ende der Runde erledigt;
            // das /autopilot aus des Leitstands kommt erst danach, wenn die Sitzung still ist.
            const vorher = await read($, bericht)
            return {
                text:
                    vorher?.grund === GRUND_KNOPF
                        ? `Der Autopilot ist aus: ${zahlen(vorher.geschoben, vorher.fragen.length)}.`
                        : 'Der Autopilot war nicht an.',
            }
        }
        if (s?.phase === 'laeuft') {
            return { text: 'Der Autopilot laeuft schon. /autopilot aus beendet ihn.' }
        }
        if (s) {
            // Angehalten oder fertig: dieselbe Schicht geht weiter, die Zaehler von vorn.
            const gleich = await fortsetzen($)
            return { text: `Der Autopilot laeuft wieder.${gleich ? ' Claude macht jetzt gleich weiter.' : ''}` }
        }
        const gleich = await beginnen($)
        return {
            text:
                'Der Autopilot ist an: Claude arbeitet ohne Rueckfragen weiter und schreibt am Ende eine Uebergabe. ' +
                (gleich ? 'Es macht jetzt gleich weiter. ' : '') +
                'Freigabe-Dialoge halten ihn trotzdem an. /autopilot schaltet ihn wieder aus.',
        }
    })

    on('prompt.submit', async ($, e, next) => {
        const s = await read($, schicht)
        if (!s || e.command || (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge')) {
            return next(e)
        }
        // Die Person hat selbst geschrieben: ein neuer Auftrag, die Zaehler beginnen von vorn.
        zaehlerAuf0()
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
            laeuft = true
            werkzeuge = 0
            hintergrund = null
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
        laeuft = false
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
        if (istFertig(e.answer)) {
            await anhalten($, 'fertig', 'Claude meldet fertig')
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
