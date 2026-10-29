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

/** Wie bei der Statistik: 15 Pixel hoch, die Linie 1 Pixel in der Mitte; so verdeckt ein Knopf daneben sie nicht. */
const TRENNLINIE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="15" viewBox="0 0 4000 15" preserveAspectRatio="none">' +
    '<rect x="0" y="7" width="4000" height="1" fill="#8a8a8a" fill-opacity="0.5"/></svg>'

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

/** Die Fassung fuer "Gilt" aus dem Leitfaden; alle Befehle dieses Mods wirken einmal. */
const GILT_EINMAL = 'einmal, sofort; ändert keine Einstellung.'

/** Ein Befehl je Vorschlag: /naechste-schritte:1 bis :3. */
function vorschlagBefehl(n: number): Befehl {
    return {
        name: `naechste-schritte:${n}`,
        titel: `Vorschlag ${n} abschicken`,
        description: `Den ${n}. Vorschlag für den nächsten Schritt sofort als deine Nachricht abschicken`,
        was: `Schickt den ${n}. Vorschlag sofort als deine Nachricht an Claude ab. Gibt es ihn nicht, sagt der Befehl, wie viele Vorschläge es gibt, und schickt nichts.`,
        knopf:
            `${n}️⃣ in der Leiste über dem Eingabefeld (Desktop-App) holt den Vorschlag erst ins Eingabefeld; steht er dort unverändert, schickt ein zweiter Klick ihn ab. ` +
            `Im Terminal holt die Ziffer ${n} im leeren Eingabefeld ihn als Entwurf.`,
        gilt: GILT_EINMAL,
        argumente: 'keine.',
    }
}

/**
 * Die eigenen Befehle, in der Reihenfolge der Uebersicht. Jeder ist eine Datei in commands/ des Mods
 * (commands/hilfe.md wird /naechste-schritte:hilfe); ein Name mit Doppelpunkt laesst sich nicht anmelden.
 * Den Lauf beantwortet trotzdem dieser Mod, die Datei kommt nie beim Modell an.
 */
export const BEFEHLE: readonly Befehl[] = [
    {
        name: 'naechste-schritte:hilfe',
        titel: 'Hilfe',
        description: 'Was Nächste Schritte tut, wie du damit arbeitest, alle Befehle',
        was: 'Zeigt, was Nächste Schritte tut, wie du mit den Vorschlägen arbeitest, und listet alle Befehle.',
        knopf: 'keiner.',
        gilt: GILT_EINMAL,
        argumente: 'keine.',
    },
    {
        name: 'naechste-schritte:zeigen',
        titel: 'Vorschläge zeigen',
        description: 'Die aktuellen Vorschläge als nummerierte Liste zeigen',
        was:
            'Zeigt die Vorschläge nach der letzten Antwort als nummerierte Liste, etwa vom Handy, wo es keine Leiste gibt. ' +
            'In der Leiste über dem Eingabefeld stehen dieselben Vorschläge: in der Desktop-App hinter den Buttons 1️⃣ bis 3️⃣, im Terminal hinter "Als Nächstes:".',
        knopf: 'keiner.',
        gilt: GILT_EINMAL,
        argumente: 'keine.',
    },
    vorschlagBefehl(1),
    vorschlagBefehl(2),
    vorschlagBefehl(3),
]

/**
 * Die alten Namen bis naechste-schritte 0.3: /naechste-schritte-zeigen statt /naechste-schritte:zeigen.
 * Sie stehen nicht mehr im Menue; wer einen tippt (eine alte Datei in ~/.claude/commands), erfaehrt den neuen.
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
const MOD_ID_STANDARD = 'naechste-schritte@bm-mods'

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

/** Die volle ID dieses Mods, wie `claude plugin disable` sie braucht; null, wenn sie sich nicht lesen laesst. */
async function ladeModId($: EngineInterface): Promise<string | null> {
    try {
        return modIdAus(await $.settings.read({ key: 'enabledPlugins' }), 'naechste-schritte')
    } catch {
        return null
    }
}

/**
 * Alles, was /naechste-schritte:hilfe sagt. `id` ist die volle ID des Mods; ohne sie steht dort
 * naechste-schritte@bm-mods mit dem Hinweis auf den alten Katalognamen.
 */
export function uebersicht(id: string | null = null): string {
    const mod = id ?? MOD_ID_STANDARD
    return [
        'Nächste Schritte · Hilfe',
        '',
        'Was der Mod tut',
        'Nächste Schritte ist ein Mod, also eine Erweiterung für Claude Code. Nach jeder Antwort von Claude schlägt er zwei oder drei Dinge vor, ' +
            'die du als Nächstes schreiben könntest, etwa "Führ die neuen Tests aus". Sie stehen ganz unten in der Leiste über dem Eingabefeld.',
        '',
        'So arbeitest du damit',
        '- In der Desktop-App: Ein Klick auf 1️⃣, 2️⃣ oder 3️⃣ holt den Vorschlag ins leere Eingabefeld; steht dort schon Text, hängt er den Vorschlag dahinter. ' +
            'Steht genau dieser Vorschlag unverändert im Feld, schickt ein zweiter Klick ihn ab. Hast du ihn geändert, schick ihn wie jede Nachricht mit Enter ab.',
        '- Im Terminal: Tipp 1, 2 oder 3 ins leere Eingabefeld, dann steht der Vorschlag dort als Entwurf; Enter schickt ihn ab. ' +
            'Willst du wirklich nur eine Ziffer schicken, füge sie aus der Zwischenablage ein, statt sie zu tippen.',
        '- Überall: /naechste-schritte:1 bis :3 schicken den Vorschlag sofort als deine Nachricht ab, /naechste-schritte:zeigen listet die Vorschläge als Text.',
        '- Die Vorschläge verschwinden, sobald du etwas abschickst, und kommen nach der nächsten Antwort neu. ' +
            'Solange Claude Code selbst eine Frage mit Auswahl in der Leiste zeigt, sind sie ausgeblendet, und Ziffern gehen an diese Frage.',
        '',
        'Einstellen',
        'Einstellen lässt sich nichts, und einen Aus-Schalter im Chat gibt es nicht.',
        `Ganz abschalten: \`claude plugin disable ${mod}\` (wieder an mit \`enable\`), oder sag Claude, er soll den Mod abschalten. Das wirkt nach einem Neustart von Claude Code.`,
        ...(id === null ? ['Ältere Installationen heißen `naechste-schritte@bjoern-mods`; `claude plugin list` zeigt den Namen.'] : []),
        '',
        'Kosten',
        'Nach einer Antwort von Claude ein kleiner Aufruf von Haiku: Er liest die letzten sechs Nachrichten und schreibt die Vorschläge. ' +
            'Haiku ist das kleinste und günstigste Modell von Claude. Der Aufruf kostet Tokens (die Einheit, in der Claude liest und schreibt; sie zählen gegen dein Nutzungslimit). ' +
            'Kein Aufruf läuft nach Antworten unter 20 Zeichen, nach einer abgebrochenen Runde und solange Helfer (Claude startet sie für Teilaufgaben) noch laufen. ' +
            'Der Aufruf läuft auch, wenn du nur vom Handy schreibst.',
        '',
        'Vom Handy (Remote Control)',
        'Dort gibt es keine Leiste und keine Buttons. Schick /naechste-schritte:zeigen, um die Vorschläge zu sehen, und /naechste-schritte:1, :2 oder :3, um einen abzuschicken.',
        '',
        'Befehle',
        'Befehlsnamen schreiben Umlaute als ae, oe, ue und ss.',
        ...BEFEHLE.map(b => `/${b.name} · ${b.description}`),
        'Mehr zu jedem Befehl: hilfe dahinter, etwa /naechste-schritte:zeigen hilfe.',
    ].join('\n')
}

/** Die Vorschlaege als nummerierte Liste. */
async function zeigeVorschlaege($: EngineInterface): Promise<string> {
    const v = await read($, vorschlaege)
    if (!v || v.eintraege.length === 0) {
        return 'Gerade gibt es keine Vorschläge für den nächsten Schritt. Sie kommen nach der nächsten Antwort von Claude.'
    }
    return ['Als Nächstes:', ...v.eintraege.map((t, i) => `${i + 1}. ${t}`)].join('\n')
}

/** Den Vorschlag `n` (ab 1) als Nachricht der Person abschicken. */
async function schickeVorschlag($: EngineInterface, n: number): Promise<string> {
    const v = await read($, vorschlaege)
    if (!v || v.eintraege.length === 0) {
        return 'Gerade gibt es keine Vorschläge, abgeschickt ist nichts. Sie kommen nach der nächsten Antwort von Claude.'
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
        case 'naechste-schritte:hilfe':
            return uebersicht(await ladeModId($))
        case 'naechste-schritte:zeigen':
            return zeigeVorschlaege($)
        case 'naechste-schritte:1':
            return schickeVorschlag($, 1)
        case 'naechste-schritte:2':
            return schickeVorschlag($, 2)
        case 'naechste-schritte:3':
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

    // Angemeldet wird nichts: Die Befehle /naechste-schritte:… sind Dateien in commands/ des Mods.

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

    // Ein alter Name (/naechste-schritte-zeigen, aus einer alten Datei in ~/.claude/commands) sagt nur den neuen.
    const alterName = (e: { command: string }) => ({ text: neuerName(ALTE_BEFEHLE.get(e.command) ?? e.command) })
    on('command.run', { command: [...ALTE_BEFEHLE.keys()] }, async (_$, e) => alterName(e)).catch((_$, e) => alterName(e))

    on('prompt.submit', async ($, e, next) => {
        // Die eigenen Befehle lassen die Vorschlaege stehen: /naechste-schritte:zeigen soll sie nicht wegraeumen.
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
                // Die App zeichnet einen Knopf 8 Pixel hoeher als seine Zeile: 1.2 halbe Zeilen dazwischen lassen
                // 4 Pixel frei, sonst schieben sich die Knoepfe uebereinander.
                <Box flexDirection="column" rowGap={1.2} width={breite}>
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

        // Ein Trennstrich ueber den Vorschlaegen: in der App 1 Pixel mit je 7 Pixeln Luft,
        // im Terminal eine blasse Zeile aus Strichen.
        const trennlinie = Svg ? (
            <Box key="naechste-schritte-trennlinie">
                <Svg source={TRENNLINIE_SVG} alt="Trennlinie" height={15} />
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
            'Write real German umlauts (ä, ö, ü, ß), never ae, oe, ue or ss in their place. ' +
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
