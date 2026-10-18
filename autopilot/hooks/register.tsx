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
/** Ob die laufende Runde von der Schicht angeschoben wurde. */
let angeschoben = false
/** Angeschobene Runden seit der letzten Nachricht der Person. */
let runden = 0
/** Angeschobene Runden in Folge ohne Werkzeugaufruf. */
let leerlauf = 0
/** API-Fehler in Folge. */
let fehler = 0
/** Das Anschieben nach einem API-Fehler, solange es noch wartet. */
let warte: { cancel: () => void } | null = null

function zaehlerAuf0(): void {
    runden = 0
    leerlauf = 0
    fehler = 0
    warte?.cancel()
    warte = null
}

async function anschieben($: EngineInterface): Promise<void> {
    runden += 1
    await update($, schicht, s => (s ? { ...s, geschoben: s.geschoben + 1 } : s))
    void $.prompt.submit({ text: WEITER }).catch(() => {})
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
    await update($, schicht, () => ({ seit, phase: 'laeuft' as const, grund: null, geschoben: 0, fragen: [] }))
    return gleichWeiter($)
}

/** Laesst eine angehaltene oder fertige Schicht weiterlaufen; true, wenn Claude gleich weitermacht. */
async function fortsetzen($: EngineInterface): Promise<boolean> {
    zaehlerAuf0()
    await update($, schicht, s => (s ? { ...s, phase: 'laeuft' as const, grund: null } : s))
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
            const b = await beenden($, 'du hast ihn beendet')
            return { text: b ? `Der Autopilot ist aus: ${zahlen(b.geschoben, b.fragen.length)}.` : 'Der Autopilot war nicht an.' }
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
        if (e.origin.kind === 'plugin' && e.origin.name === 'autopilot') {
            angeschoben = true
            return next(e)
        }
        const s = await read($, schicht)
        if (!s || e.command || (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge')) {
            return next(e)
        }
        // Die Person hat selbst geschrieben: ein neuer Auftrag, die Zaehler beginnen von vorn.
        angeschoben = false
        zaehlerAuf0()
        if (s.phase !== 'laeuft') {
            await update($, schicht, x => (x ? { ...x, phase: 'laeuft' as const, grund: null } : x))
        }
        return next({ ...e, context: [...(e.context ?? []), KONTEXT] })
    })

    on('turn.start', async ($, e, next) => {
        if (!e.agentId) {
            laeuft = true
            werkzeuge = 0
        }
        return next(e)
    })

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
        const warAngeschoben = angeschoben
        angeschoben = false

        const s = await read($, schicht)
        if (!s) {
            return r
        }
        if (e.reason === 'aborted') {
            // Wer unterbricht, ist da.
            await beenden($, 'du hast unterbrochen')
            return r
        }
        if (s.phase !== 'laeuft') {
            return r
        }
        if (e.reason === 'refusal') {
            await anhalten($, 'angehalten', 'Claude hat abgelehnt')
            return r
        }
        if (runden >= maxRunden) {
            await anhalten($, 'angehalten', `${maxRunden}x angeschoben, das Limit ist erreicht`)
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
        leerlauf = warAngeschoben && werkzeuge === 0 ? leerlauf + 1 : 0
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

        const eigene = (
            <Box key="autopilot" flexDirection="column" paddingX={1}>
                <Box flexDirection="row" gap={1}>
                    <Text color="suggestion" bold>
                        Autopilot:
                    </Text>
                    {zeile}
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
                <Box flexDirection="row" gap={2}>
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
        )
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
