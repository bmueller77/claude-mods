// Naechste-Schritte: nach jeder Antwort zwei oder drei naheliegende naechste Eingaben.
// Im leeren Eingabefeld holt 1 bis 3 einen Vorschlag als Entwurf (abgeschickt wird nichts
// von selbst); in der App tun das auch die Knoepfe 1 bis 3. Nach next-steps von Hamza Zafar,
// auf Deutsch und ganz unten.
//
// Ganz unten heisst: unter allem, was andere Mods ueber das Eingabefeld zeichnen, mit einem
// Trennstrich davor. Die Reihenfolge der Mods legt die Engine fest. Steht dieser Mod aussen,
// haengt er seinen Block selbst unter alles andere; steht er innen, findet die Statistik den
// Block am Schluessel BLOCK und setzt ihn unter sich.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Vorschlaege } from '../types'

const MODELL = 'haiku'
const MAX_EINTRAEGE = 3
/** So lang soll ein Vorschlag hoechstens sein; deutsche Saetze brauchen etwas mehr als englische. */
const MAX_ZEICHEN = 70
/** Eine laengere Zeile faellt weg, statt gekuerzt zu werden: ein halber Entwurf wuerde halb abgeschickt. */
const MAX_BEHALTEN = 120
/** Unter so vielen Zeichen lohnt eine Antwort keinen Modellaufruf. */
const MIN_ANTWORT = 20

/** Der Schluessel des Blocks; die Statistik sucht ihn, um ihn unter sich zu setzen. */
const BLOCK = 'naechste-schritte'

const VORSPANN = 'Als Nächstes:  '
const LUECKE = ' '.repeat(VORSPANN.length)

/** Wie bei der Statistik: 7 Pixel hoch, die Linie 1 Pixel in der Mitte. */
const TRENNLINIE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="7" viewBox="0 0 4000 7" preserveAspectRatio="none">' +
    '<rect x="0" y="3" width="4000" height="1" fill="#8a8a8a" fill-opacity="0.5"/></svg>'

// Beim Host gehalten, so ueberleben die Vorschlaege ein Neuladen des Moduls.
const vorschlaege = atom({ plugin: 'naechste-schritte', key: 'vorschlaege' } as const, null as Vorschlaege | null)

/** Wie die Engine eine Befehlsantwort beginnt: die Namen der Mods, die den Befehl hooken, mit + verbunden. */
const VORSATZ = /^(<local-command-stdout>)([a-z0-9-]+(?:\+[a-z0-9-]+)*): /
/** Steht statt des Vorsatzes am Ende einer Antwort von Naechste-Schritte. */
export const GEMELDET = '(gemeldet vom Mod Nächste Schritte)'

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

/** Ein Befehl je Vorschlag: /naechste-schritte-1 bis -3. */
function vorschlagBefehl(n: number): Befehl {
    return {
        name: `naechste-schritte-${n}`,
        description: `Den ${n}. Vorschlag für den nächsten Schritt gleich als Nachricht abschicken (Nächste Schritte)`,
        was: `Schickt den ${n}. Vorschlag unter „Als Nächstes“ gleich als deine Nachricht ab. Gibt es ihn nicht, sagt der Befehl das und schickt nichts.`,
        knopf: `${n}️⃣ in der App, im Terminal die Ziffer ${n} im leeren Eingabefeld; die holen den Vorschlag erst als Entwurf, der Befehl schickt ihn sofort ab`,
        gilt: 'für die Vorschläge nach der letzten Antwort in diesem Chat',
        argumente: 'keine',
        beispiel: `/naechste-schritte-${n}`,
    }
}

export const BEFEHLE: readonly Befehl[] = [
    {
        name: 'naechste-schritte-hilfe',
        description: 'Alle Befehle von Nächste Schritte mit einer Zeile Erklärung (Nächste Schritte)',
        was: 'Listet alle Befehle von Nächste Schritte mit einer Zeile Erklärung.',
        knopf: 'keiner',
        gilt: 'zeigt nur Text, ändert nichts',
        argumente: 'keine; hilfe oder ? erklärt diesen Befehl',
        beispiel: '/naechste-schritte-hilfe',
    },
    {
        name: 'naechste-schritte-zeigen',
        description: 'Die aktuellen Vorschläge für den nächsten Schritt nummeriert als Text (Nächste Schritte)',
        was: 'Zeigt die Vorschläge nach der letzten Antwort nummeriert als Text, etwa wenn das Band über dem Eingabefeld nicht zu sehen ist.',
        knopf: 'keiner; dieselben Vorschläge stehen unter „Als Nächstes“ über dem Eingabefeld',
        gilt: 'für die Vorschläge nach der letzten Antwort in diesem Chat; ändert nichts',
        argumente: 'keine',
        beispiel: '/naechste-schritte-zeigen',
    },
    vorschlagBefehl(1),
    vorschlagBefehl(2),
    vorschlagBefehl(3),
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
    return [
        'Befehle von Nächste Schritte (jeder versteht hilfe oder ? als Argument):',
        ...BEFEHLE.map(b => `/${b.name}: ${b.description.replace(/ \(Nächste Schritte\)$/, '')}`),
    ].join('\n')
}

/** Die Vorschlaege als nummerierte Liste. */
async function zeigeVorschlaege($: EngineInterface): Promise<string> {
    const v = await read($, vorschlaege)
    if (!v || v.eintraege.length === 0) {
        return 'Gerade gibt es keine Vorschläge für den nächsten Schritt.'
    }
    return ['Als Nächstes:', ...v.eintraege.map((t, i) => `${i + 1}. ${t}`)].join('\n')
}

/** Den Vorschlag `n` (ab 1) als Nachricht der Person abschicken. */
async function schickeVorschlag($: EngineInterface, n: number): Promise<string> {
    const v = await read($, vorschlaege)
    if (!v || v.eintraege.length === 0) {
        return 'Gerade gibt es keine Vorschläge, abgeschickt ist nichts.'
    }
    const wahl = v.eintraege[n - 1]
    if (!wahl) {
        return `Gerade gibt es keinen ${n}. Vorschlag, nur ${v.eintraege.length}; abgeschickt ist nichts.`
    }
    // Im Hintergrund, nach dem Befehl: Er antwortet sofort, die Nachricht geht raus, sobald die Sitzung frei ist.
    $.clock.after(0, () => void $.prompt.submit({ text: wahl, asUser: true }).catch(() => {}))
    return `Vorschlag ${n} ist abgeschickt: ${wahl}`
}

/** Was ein Befehl tut; zurueck kommt die Antwort. */
async function wirke($: EngineInterface, name: string): Promise<string> {
    switch (name) {
        case 'naechste-schritte-hilfe':
            return uebersicht()
        case 'naechste-schritte-zeigen':
            return zeigeVorschlaege($)
        case 'naechste-schritte-1':
            return schickeVorschlag($, 1)
        case 'naechste-schritte-2':
            return schickeVorschlag($, 2)
        case 'naechste-schritte-3':
            return schickeVorschlag($, 3)
        default:
            throw new Error(`kein Befehl ${name}`)
    }
}

export const register: Register = on => {
    // Die Runde, fuer die ein Vorschlag noch gelten darf. Ein Abschicken oder eine neue Runde ruecken sie weiter.
    let aktuell = ''
    let abgeschickt = 0
    // Eine Umfrage nimmt blanke Ziffern selbst entgegen: dann bleiben sie ihr.
    let hatUmfrage = false

    on('session.start', async ($, e, next) => {
        const r = await next(e)
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
        return r
    })

    // Die Engine setzt die Namen der Mods vor jede Befehlsantwort. Dieser Mod streicht in der
    // gespeicherten Zeile seinen und sagt stattdessen am Ende, dass die Antwort von ihm kommt.
    on('session.append', { door: 'command', message: { type: 'system', name: 'local_command' } }, async ($, e, next) => {
        const content = e.message.content.map(b => (b.type === 'text' && typeof b.text === 'string' ? { ...b, text: ohneVorsatz(b.text, 'naechste-schritte', GEMELDET) } : b))
        return next({ ...e, message: { ...e.message, content } })
    }).catch(($, e, next) => next(e))

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

    on('prompt.submit', async ($, e, next) => {
        // Die eigenen Befehle lassen die Vorschlaege stehen: /naechste-schritte-zeigen soll sie nicht wegraeumen.
        if (e.command?.name.startsWith('naechste-schritte')) {
            return next(e)
        }
        aktuell = `abgeschickt-${++abgeschickt}`
        await update($, vorschlaege, () => null)
        return next(e)
    })

    on('turn.start', async ($, e, next) => {
        aktuell = e.turnId
        await update($, vorschlaege, () => null)
        return next(e)
    })

    on('turn.complete', async ($, e, next) => {
        const r = await next(e)
        if (e.agentId) {
            return r // die Runde eines Subagenten, nicht die der Person
        }
        aktuell = e.turnId // auch fuer eine Runde ohne turn.start und nach einem Neuladen
        if (e.reason !== 'answer' || e.answer.trim().length < MIN_ANTWORT) {
            return r
        }
        // Im Hintergrund, damit die Runde sofort endet.
        void schlageVor($, e.turnId, e.answer, () => aktuell).catch(() => {})
        return r
    })

    // Eine Ziffer im leeren Eingabefeld waehlt einen Vorschlag, statt als Text zu landen.
    // Ein Einfuegen traegt keine Taste: eine eingefuegte "1" bleibt eine 1.
    on('prompt.edit', async ($, e, next) => {
        if (hatUmfrage || !e.key || e.key.ctrl || e.key.meta || e.text !== '' || e.start !== 0 || e.end !== 0 || !/^[1-9]$/.test(e.inputText)) {
            return next(e)
        }
        const v = await read($, vorschlaege)
        if (!v) {
            return next(e)
        }
        const wahl = v.eintraege[Number(e.inputText) - 1]
        if (!wahl) {
            return next(e)
        }
        return next({ ...e, inputText: wahl }) // ein Entwurf: bearbeiten oder mit Enter abschicken
    })

    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
        const rest = await next(e) // was andere Mods und Claude Code hier zeichnen, bleibt
        hatUmfrage = e.props.hasSurvey
        const v = await read($, vorschlaege)
        if (e.props.hasSurvey || e.props.isWorking || !v || v.eintraege.length === 0) {
            return rest
        }

        const elemente = $.ui.resolve(e)
        const { Box, Text, Button } = elemente
        // Bilder zeichnet nur die App; das Terminal fuehrt Svg zwar, zeichnet es aber nicht.
        const Svg = e.surface === 'desktop' && 'Svg' in elemente ? elemente.Svg : null
        const einzeilig =
            // Einer je Zeile braucht je eine Zeile; ein niedriges Band bekommt die eine, am Ende gekuerzt.
            passtInEineZeile(v.eintraege, e.props.bodyColumns) || e.props.maxRows < v.eintraege.length + 3

        // Wie die getippte Ziffer: der Vorschlag als Entwurf. Der Knopf behaelt nach dem Klick aber
        // den Fokus und Enter drueckt ihn erneut; steht der Vorschlag schon im Feld, schickt der
        // zweite Druck ihn deshalb ab.
        const hole = async (i: number) => {
            const wahl = (await read($, vorschlaege))?.eintraege[i]
            if (!wahl) {
                return
            }
            const { text } = await $.prompt.read()
            if (text.trim() === wahl) {
                await $.prompt.fill({ text: '', mode: 'replace' })
                await $.prompt.submit({ text: wahl, asUser: true })
            } else if (text.trim() === '') {
                await $.prompt.fill({ text: wahl, mode: 'replace' })
            } else {
                // Getipptes bleibt: dahinter, mit Leerzeichen dazwischen.
                await $.prompt.fill({ text: /\s$/.test(text) ? wahl : ` ${wahl}`, mode: 'append' })
            }
        }

        let zeilen
        if (e.surface === 'desktop') {
            // In der App Knoepfe statt Ziffern. Gekuerzt wird dort nur ein einzelner Text in fester Breite,
            // buendig nur ohne Leerzeichen: die Schrift ist proportional.
            const breite = Math.max(20, e.props.bodyColumns) // ohne Rand: buendig mit der Statistik darueber
            // Ziffern-Emoji: so breit wie die anderen Emoji-Knoepfe, alle drei gleich.
            const knopf = (i: number) => (
                <Box flexShrink={0}>
                    <Button
                        key={`naechste-schritte-${i + 1}`}
                        label={`${i + 1}️⃣`}
                        onPress={() => void hole(i).catch(() => undefined)}
                    />
                </Box>
            )
            zeilen = einzeilig ? (
                <Box flexDirection="row" gap={1} alignItems="center" width={breite}>
                    {v.eintraege.flatMap((t, i) => [
                        ...(i > 0 ? [<Text dimColor>·</Text>] : []),
                        knopf(i),
                        <Box flexShrink={1} minWidth={0}>
                            <Text wrap="truncate-end">{t}</Text>
                        </Box>,
                    ])}
                </Box>
            ) : (
                <Box flexDirection="column" width={breite}>
                    {v.eintraege.map((t, i) => (
                        <Box flexDirection="row" gap={1} alignItems="center">
                            {knopf(i)}
                            <Box flexGrow={1} flexShrink={1} minWidth={0}>
                                <Text wrap="truncate-end">{t}</Text>
                            </Box>
                        </Box>
                    ))}
                </Box>
            )
        } else {
            const trenner = <Text dimColor>{'  ·  '}</Text>
            const eintrag = (text: string, i: number) => [
                <Text color="cyan" bold>{`${i + 1} `}</Text>,
                <Text>{text}</Text>,
            ]
            zeilen = einzeilig ? (
                <Text wrap="truncate-end">
                    <Text dimColor>{VORSPANN}</Text>
                    {v.eintraege.flatMap((t, i) => [...(i > 0 ? [trenner] : []), ...eintrag(t, i)])}
                </Text>
            ) : (
                <Box flexDirection="column">
                    {v.eintraege.map((t, i) => (
                        <Text wrap="truncate-end">
                            <Text dimColor>{i === 0 ? VORSPANN : LUECKE}</Text>
                            {eintrag(t, i)}
                        </Text>
                    ))}
                </Box>
            )
        }

        // Ein Trennstrich ueber den Vorschlaegen: in der App 1 Pixel mit je 3 Pixeln Luft,
        // im Terminal eine blasse Zeile aus Strichen.
        const trennlinie = Svg ? (
            <Box key="naechste-schritte-trennlinie">
                <Svg source={TRENNLINIE_SVG} alt="Trennlinie" height={7} />
            </Box>
        ) : (
            <Text key="naechste-schritte-trennlinie" dimColor wrap="truncate-end">
                {'─'.repeat(Math.max(0, e.props.bodyColumns))}
            </Text>
        )
        // In der App ohne Rand: die Knoepfe stehen buendig mit Statistik und Zusammenfassung.
        const block = (
            <Box key={BLOCK} flexDirection="column">
                {trennlinie}
                {e.surface === 'desktop' ? <Box>{zeilen}</Box> : <Box paddingX={1}>{zeilen}</Box>}
            </Box>
        )
        if (!rest) {
            return block
        }
        // Unter alles andere.
        return (
            <Box flexDirection="column">
                {rest}
                {block}
            </Box>
        )
    })
}

/** Alle Vorschlaege in einer Zeile, oder einer je Zeile, wenn sie nicht passen. */
export function passtInEineZeile(eintraege: string[], spalten: number): boolean {
    const breite = VORSPANN.length + eintraege.reduce((n, t) => n + 2 + t.length, 0) + 5 * (eintraege.length - 1)
    return breite <= spalten - 2 // der Rand des Bands
}

async function schlageVor($: EngineInterface, turnId: string, antwort: string, jetzt: () => string): Promise<void> {
    // Laufen noch Agenten im Hintergrund, geht es danach ohnehin weiter: dann nichts vorschlagen.
    const agenten = await $.agent.list().catch(() => [])
    if (agenten.some(a => a.status === 'running')) {
        return
    }

    const alle = (await $.session.messages().catch(() => [])).filter(m => m.text.trim() !== '')
    if (alle.at(-1)?.role === 'assistant') {
        alle.pop() // die letzte Antwort kommt unten einzeln dazu
    }
    const verlauf = alle.slice(-6)
    const r = await $.model.complete({
        model: MODELL,
        maxTokens: 250,
        timeoutMs: 20_000,
        system:
            'You predict what a person will type next to their coding assistant, after reading a transcript of their session. ' +
            `Give 2 or 3 short, concrete follow-up prompts in German, each an instruction in the imperative addressed with "du", under ${MAX_ZEICHEN} characters, ` +
            'specific to what just happened (name the file, test or feature). Plain words, no dashes as punctuation, no numbering, no quotes. ' +
            'One per line and nothing else. If nothing sensible follows, reply with the single word NONE.\n' +
            'Example reply:\nFühr die Login-Tests noch mal aus\nBau dieselbe Prüfung in signup.ts ein\nÖffne einen Entwurf für den PR',
        prompt: [
            `<transcript>\n${verlauf.map(m => `[${m.role === 'user' ? 'person' : 'assistant'}] ${m.text.slice(0, 800)}`).join('\n')}\n</transcript>`,
            `<latest_reply>\n${antwort.slice(0, 2000)}\n</latest_reply>`,
            'Write the follow-up prompts the person is likely to send next, in German: the lines only, not a reply to the transcript.',
        ].join('\n\n'),
    })
    if (!r.isAnswered) {
        return
    }
    const eintraege = leseVorschlaege(r.text)
    // In der Schreibung geprueft: ein Abschicken oder eine neue Runde, die inzwischen kam, gewinnt immer.
    await update($, vorschlaege, vorher => (jetzt() !== turnId ? vorher : eintraege.length > 0 ? { turnId, eintraege } : null))
}

/**
 * Die Zeilen des Modells, gereinigt: ohne Codezaeune, Spiegelstriche, Nummern und
 * Gedankenstriche; hoechstens drei. Ein Vorspann, ein "nichts zu tun" oder eine Zeile,
 * die zu lang fuer einen ganzen Entwurf ist, faellt weg.
 */
export function leseVorschlaege(text: string): string[] {
    const rumpf = text.replace(/```[a-z]*\n?/gi, '').trim()
    let zeilen = rumpf.split('\n')
    if (rumpf.startsWith('[') || rumpf.startsWith('{')) {
        try {
            const o = JSON.parse(rumpf) as unknown
            const liste = Array.isArray(o) ? o : Object.values(o as Record<string, unknown>).find(Array.isArray)
            zeilen = Array.isArray(liste) ? liste.filter((x): x is string => typeof x === 'string') : []
        } catch {
            // doch kein JSON: als Zeilen lesen
        }
    }
    const aus: string[] = []
    for (const zeile of zeilen) {
        const sauber = zeile
            .replace(/\*\*/g, '')
            .replace(/^\s*(?:[-*•]|\d+[.):])\s*/, '')
            .replace(/^["'`„“]+|["'`“”,]+$/g, '')
            .replace(/\s*[—–]\s*/g, ', ')
            .replace(/\.$/, '')
            .trim()
        if (sauber === '' || sauber.endsWith(':') || sauber.length > MAX_BEHALTEN) {
            continue
        }
        if (/^(none|no |nothing|here are|here's|sure|keine?\b|nichts|hier sind|gern|klar)/i.test(sauber) || /^[[\]{}]$/.test(sauber)) {
            continue
        }
        if (!aus.some(a => a.toLowerCase() === sauber.toLowerCase())) {
            aus.push(sauber)
        }
        if (aus.length === MAX_EINTRAEGE) {
            break
        }
    }
    return aus
}
