// Das Fenster des Prompt-Upgrades: baut aus dem Zustand den Baum, den die
// Oberflaeche zeichnet. Liest nur und schreibt nichts; jede Aenderung laeuft
// ueber die Aktionen, die register.tsx hereingibt und die erst ein Druck ausloest.
//
// Jede Zeile ist auf die Breite des Fensters zugeschnitten (Text umbrochen,
// Knoepfe in Reihen gepackt, Karten mit fester Breite), damit nichts umbricht.

import type { BoxProps, ButtonProps, ElementConstructor, InputProps, RenderElement, SvgProps, TextProps, UiPressArgument } from 'claude-code'

import type { PromptUpgradeAbdeckung, PromptUpgradeAblauf, PromptUpgradeEintrag, PromptUpgradeFrage, PromptUpgradeAntwort } from '../types'
import { abdeckungZeile, einzeilig, grosseZahl, istAbdeckung, kuerze, packe, platzhalter, spur, umbrechen, woerter, zellen } from './logik'

/** Die Farben der Vorgabe. */
export const FARBE = {
    gold: '#F2C46D',
    haar: '#262B33',
    leise: '#7D8590',
    text: '#E6EDF3',
    gruen: '#3DD68C',
    bernstein: '#E3B341',
    dunkel: '#0D1117',
    grund: '#0E1116',
} as const

export const TITEL = 'PROMPT-UPGRADE'

/** Ab dieser Breite stehen die beiden Karten nebeneinander, darunter untereinander. */
export const NEBENEINANDER_AB = 72

/** Die Bausteine der Oberflaeche, aus `$.ui.resolve(e)`. */
export type Kit = {
    Box: ElementConstructor<BoxProps>
    Text: ElementConstructor<TextProps>
    Button: ElementConstructor<ButtonProps>
    /** Fehlt, wo die Oberflaeche kein Eingabefeld zeichnet (mobile). */
    Input: ElementConstructor<InputProps> | undefined
    /**
     * Nur ausserhalb des Terminals: dort ist Text nicht gleich breit, Linien und
     * grosse Ziffern aus Rahmenzeichen saessen schief; sie kommen als Grafik.
     */
    Svg: ElementConstructor<SvgProps> | undefined
    /** Das Terminal zeichnet Knoepfe als farbige Chips; die App ihre eigenen Knoepfe. */
    istTerminal: boolean
}

/** Was ein Druck ausloest; alles laeuft in register.tsx. */
export type Aktionen = {
    starte: (text: string) => void
    waehle: (frage: number, option: string) => void
    andersOeffnen: (frage: number) => void
    anders: (frage: number, text: string) => void
    ueberspringe: (frage: number) => void
    restUeberspringen: () => void
    ausfuehren: (text?: string) => void
    bearbeiten: () => void
    entwurf: (text: string) => void
    kopieren: (e: UiPressArgument) => void
    abbrechen: () => void
    erneut: () => void
    originalSenden: () => void
    verlaufWaehlen: (index: number) => void
    verlaufAuf: () => void
    verlaufZu: () => void
    schliessen: () => void
}

/** Was gezeichnet wird. */
export type Lage = {
    ablauf: PromptUpgradeAblauf | null
    verlauf: readonly PromptUpgradeEintrag[]
    zeigeVerlauf: boolean
}

// --- Knoepfe ---

type Art = 'haupt' | 'neben' | 'gewaehlt' | 'leise'

type Knopf = { key: string; label: string; art: Art; onPress: (e: UiPressArgument) => void; autoFocus?: boolean }

/** Was die App auf einen Knopf schreibt: Gewaehltes mit Haekchen. */
function appLabel(x: { label: string; art: Art }): string {
    return x.art === 'gewaehlt' ? `✓ ${x.label}` : x.label
}

/**
 * Wie breit ein Knopf ist. Terminal: ein Chip mit je einer Zelle Rand, der
 * leise Knopf nur sein Text. App: `[ label ]`, so breit rechnet das Terminal
 * einen Knopf ohne Chip, und so viel Platz bekommt ein nativer Knopf hier.
 */
export function knopfBreite(istTerminal: boolean, x: { label: string; art: Art }): number {
    if (istTerminal) {
        return zellen(x.label) + (x.art === 'leise' ? 0 : 2)
    }
    return zellen(appLabel(x)) + 4
}

function passeKnopf(istTerminal: boolean, x: Knopf, breite: number): Knopf {
    const ueber = knopfBreite(istTerminal, x) - breite
    return ueber > 0 ? { ...x, label: kuerze(x.label, Math.max(1, zellen(x.label) - ueber)) } : x
}

function knopf(k: Kit, x: Knopf): RenderElement {
    const { Button, Text } = k
    const fokus = x.autoFocus ? { autoFocus: true as const } : {}
    if (k.istTerminal) {
        if (x.art === 'leise') {
            return (
                <Button key={x.key} label={x.label} plain onPress={x.onPress} {...fokus}>
                    <Text color={FARBE.leise}>{x.label}</Text>
                </Button>
            )
        }
        const grund = x.art === 'haupt' ? FARBE.gold : x.art === 'gewaehlt' ? FARBE.gruen : FARBE.haar
        const schrift = x.art === 'neben' ? FARBE.text : FARBE.dunkel
        return (
            <Button key={x.key} label={x.label} plain onPress={x.onPress} {...fokus}>
                <Text backgroundColor={grund} color={schrift} bold={x.art !== 'neben'}>
                    {` ${x.label} `}
                </Text>
            </Button>
        )
    }
    if (x.art === 'leise') {
        return <Button key={x.key} label={x.label} plain dimColor onPress={x.onPress} {...fokus} />
    }
    return <Button key={x.key} label={appLabel(x)} variant={x.art === 'haupt' ? 'primary' : 'secondary'} onPress={x.onPress} {...fokus} />
}

/** Knoepfe in Reihen, jede Reihe hoechstens `breite` Zellen. */
function knopfReihen(k: Kit, knoepfe: readonly Knopf[], breite: number): RenderElement {
    const { Box } = k
    const passend = knoepfe.map(x => passeKnopf(k.istTerminal, x, breite))
    const reihen = packe(
        passend.map(x => knopfBreite(k.istTerminal, x)),
        breite,
    )
    return (
        <Box flexDirection="column">
            {reihen.map(r => (
                <Box flexDirection="row" gap={1}>
                    {r.map(i => knopf(k, passend[i]!))}
                </Box>
            ))}
        </Box>
    )
}

// --- Zeilen ---

/** Eine Zeile umbrochenen Texts; leere Zeilen als ein Leerzeichen, damit sie Platz nehmen. */
function zeilen(k: Kit, text: string, breite: number, props: TextProps): RenderElement[] {
    const { Text } = k
    return umbrechen(text, breite).map(z => <Text {...props}>{z === '' ? ' ' : z}</Text>)
}

/** Kleine Ueberschrift in gedaempften Grossbuchstaben, dahinter eine Haarlinie bis zum Rand. */
function abschnitt(k: Kit, titel: string, breite: number, farbe: string = FARBE.leise): RenderElement {
    const { Box, Svg, Text } = k
    const t = kuerze(titel.toUpperCase(), breite)
    const rest = breite - zellen(t) - 1
    if (Svg) {
        return (
            <Box flexDirection="column">
                <Text color={farbe} bold wrap="truncate-end">
                    {t}
                </Text>
                <Svg source={linieSvg(0)} alt="Trennlinie" height={5} />
            </Box>
        )
    }
    return (
        <Text wrap="truncate-end">
            <Text color={farbe} bold>
                {t}
            </Text>
            {rest > 0 ? (
                <Text color={FARBE.haar}>
                    {` ${'─'.repeat(rest)}`}
                </Text>
            ) : null}
        </Text>
    )
}

/** Eine Zeile, deren Platzhalter in eckigen Klammern bernsteinfarben stehen. */
function zeileMitPlatzhaltern(k: Kit, z: string): RenderElement {
    const { Text } = k
    if (z === '') {
        return <Text> </Text>
    }
    const teile = z.split(/(\[[^\]\n]*\])/).filter(t => t !== '')
    return (
        <Text>
            {teile.map(t => (
                <Text color={/^\[[^\]\n]*\]$/.test(t) ? FARBE.bernstein : FARBE.text}>{t}</Text>
            ))}
        </Text>
    )
}

/**
 * Eine Haarlinie ueber die ganze Breite, als Grafik fuer die App; vorn auf dem
 * Anteil `gold` (0 bis 1) die Goldlinie. Wie die Trennlinie der Zusammenfassung:
 * 4000 breit und ohne festes Seitenverhaeltnis, so zieht sie sich auf jede Breite.
 */
export function linieSvg(gold: number): string {
    const g = Math.round(Math.max(0, Math.min(1, gold)) * 4000)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="5" viewBox="0 0 4000 5" preserveAspectRatio="none">' +
        `<rect x="0" y="2" width="4000" height="1" fill="${FARBE.haar}"/>` +
        (g > 0 ? `<rect x="0" y="1" width="${g}" height="3" fill="${FARBE.gold}"/>` : '') +
        '</svg>'
    )
}

function xml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Die drei Zahlenkacheln als Grafik fuer die App: grosse Ziffern in gerundeten Kacheln. */
export function kachelnSvg(werte: readonly { zahl: number; titel: string; farbe: string }[]): string {
    const b = 140
    const hoehe = 66
    const abstand = 8
    const breite = werte.length * b + Math.max(0, werte.length - 1) * abstand
    const teile = werte.map((w, i) => {
        const x = i * (b + abstand)
        return (
            `<rect x="${x + 0.5}" y="0.5" width="${b - 1}" height="${hoehe - 1}" rx="10" fill="none" stroke="${FARBE.haar}"/>` +
            `<text x="${x + b / 2}" y="36" text-anchor="middle" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="30" font-weight="800" fill="${w.farbe}">${Math.max(0, Math.floor(w.zahl))}</text>` +
            `<text x="${x + b / 2}" y="56" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" letter-spacing="1" fill="${FARBE.leise}">${xml(w.titel)}</text>`
        )
    })
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${breite}" height="${hoehe}" viewBox="0 0 ${breite} ${hoehe}">${teile.join('')}</svg>`
}

/** Titel fett in Grossbuchstaben, darunter eine kurze Goldlinie, die als Haarlinie zum Rand weiterlaeuft. */
function kopf(k: Kit, breite: number): RenderElement {
    const { Box, Svg, Text } = k
    const titel = kuerze(TITEL, breite)
    const gold = zellen(titel)
    if (Svg) {
        return (
            <Box flexDirection="column">
                <Text color={FARBE.text} bold wrap="truncate-end">
                    {titel}
                </Text>
                <Svg source={linieSvg(gold / breite)} alt="Titellinie" height={5} />
            </Box>
        )
    }
    return (
        <Box flexDirection="column">
            <Text color={FARBE.text} bold>
                {titel}
            </Text>
            <Text wrap="truncate-end">
                <Text color={FARBE.gold}>{'━'.repeat(gold)}</Text>
                {breite > gold ? <Text color={FARBE.haar}>{'─'.repeat(breite - gold)}</Text> : null}
            </Text>
        </Box>
    )
}

function spurIndex(a: PromptUpgradeAblauf): number {
    switch (a.schritt) {
        case 'eingabe':
        case 'lesen':
            return 0
        case 'fragen':
            return 1
        case 'umschreiben':
            return 2
        case 'pruefen':
            return 3
        case 'fehler':
            return a.fehler?.phase === 'umschreiben' ? 2 : 0
    }
}

/** Die vier Schritte: fertige gruen mit Haekchen, der aktuelle gold, der Rest gedaempft. */
function spurZeile(k: Kit, a: PromptUpgradeAblauf, breite: number): RenderElement {
    const { Text } = k
    const farbe = { fertig: FARBE.gruen, aktuell: FARBE.gold, offen: FARBE.leise, linie: FARBE.haar } as const
    return (
        <Text wrap="truncate-end">
            {spur(spurIndex(a), breite).map(t => (
                <Text color={farbe[t.art]} bold={t.art === 'aktuell'}>
                    {t.text}
                </Text>
            ))}
        </Text>
    )
}

/** Eine gerahmte Karte mit Ueberschrift und umbrochenem Text, genau `breite` Zellen breit. */
function karte(
    k: Kit,
    titel: string,
    text: string,
    breite: number,
    x: { rahmen: string; titelFarbe?: string; platzhalter?: boolean },
): RenderElement {
    const { Box, Text } = k
    const innen = Math.max(1, breite - 4)
    const liste = umbrechen(text, innen)
    return (
        <Box flexDirection="column" borderStyle="round" borderColor={x.rahmen} paddingX={1} width={breite}>
            {abschnitt(k, titel, innen, x.titelFarbe)}
            {liste.map(z => (x.platzhalter ? zeileMitPlatzhaltern(k, z) : <Text color={FARBE.text}>{z === '' ? ' ' : z}</Text>))}
        </Box>
    )
}

// --- Zahlen ---

type Wert = { zahl: number; titel: string; farbe: string }

function kachel(k: Kit, w: Wert, breite: number): RenderElement {
    const { Box, Text } = k
    const [a, b, c] = grosseZahl(w.zahl)
    return (
        <Box flexDirection="column" borderStyle="round" borderColor={FARBE.haar} paddingX={1} width={breite} alignItems="center">
            <Text color={w.farbe}>
                {a}
            </Text>
            <Text color={w.farbe}>
                {b}
            </Text>
            <Text color={w.farbe}>
                {c}
            </Text>
            <Text color={FARBE.leise}>
                {w.titel}
            </Text>
        </Box>
    )
}

/**
 * Eine Zeile Zahlen: Woerter vorher, nachher, wie viel ergaenzt wurde. Grosse
 * Ziffern in gerundeten Kacheln, wenn sie in eine Reihe passen, sonst eine Zeile.
 */
function zahlen(k: Kit, vorher: number, nachher: number, ergaenzt: number, breite: number): RenderElement {
    const { Box, Svg, Text } = k
    if (Svg) {
        const werte = [
            { zahl: vorher, titel: 'WÖRTER VORHER', farbe: FARBE.text },
            { zahl: nachher, titel: 'WÖRTER NACHHER', farbe: FARBE.gold },
            { zahl: ergaenzt, titel: 'ERGÄNZT', farbe: FARBE.gruen },
        ]
        return <Svg source={kachelnSvg(werte)} alt={`Wörter vorher ${vorher}, nachher ${nachher}, ${ergaenzt} ergänzt`} />
    }
    const beschriftungen = [
        ['WÖRTER VORHER', 'WÖRTER NACHHER', 'ERGÄNZT'],
        ['VORHER', 'NACHHER', 'ERGÄNZT'],
    ] as const
    for (const titel of beschriftungen) {
        const werte: Wert[] = [
            { zahl: vorher, titel: titel[0], farbe: FARBE.text },
            { zahl: nachher, titel: titel[1], farbe: FARBE.gold },
            { zahl: ergaenzt, titel: titel[2], farbe: FARBE.gruen },
        ]
        const breiten = werte.map(w => Math.max(zellen(grosseZahl(w.zahl)[0]), zellen(w.titel)) + 4)
        if (breiten.reduce((n, w) => n + w, 0) + breiten.length - 1 <= breite) {
            return (
                <Box flexDirection="row" gap={1}>
                    {werte.map((w, i) => kachel(k, w, breiten[i]!))}
                </Box>
            )
        }
    }
    const teile: [string, string][] = [
        ['Wörter ', FARBE.leise],
        [String(vorher), FARBE.text],
        [' → ', FARBE.leise],
        [String(nachher), FARBE.gold],
        [' · ', FARBE.leise],
        [String(ergaenzt), FARBE.gruen],
        [' ergänzt', FARBE.leise],
    ]
    if (teile.reduce((n, [t]) => n + zellen(t), 0) > breite) {
        return <Text color={FARBE.text}>{kuerze(`${vorher} → ${nachher} · ${ergaenzt}`, breite)}</Text>
    }
    return (
        <Text>
            {teile.map(([t, f]) => (
                <Text color={f}>{t}</Text>
            ))}
        </Text>
    )
}

/**
 * Eine Zeile mit den Kernteilen des Upgrades: enthaltene gruen mit Haekchen,
 * fehlende gedaempft mit Strich. Ohne Abdeckung keine Zeile.
 */
function abdeckungsZeile(k: Kit, ab: PromptUpgradeAbdeckung | null, breite: number): RenderElement | null {
    const { Text } = k
    if (ab === null) {
        return null
    }
    const farbe = { ja: FARBE.gruen, nein: FARBE.leise, luecke: FARBE.leise, leise: FARBE.leise } as const
    return (
        <Text wrap="truncate-end">
            {abdeckungZeile(ab, breite).map(t => (
                <Text color={farbe[t.art]}>{t.text}</Text>
            ))}
        </Text>
    )
}

// --- Die Schritte ---

function eingabe(k: Kit, breite: number, a: Aktionen): RenderElement {
    const { Box, Input, Text } = k
    return (
        <Box flexDirection="column" gap={1}>
            {abschnitt(k, 'Dein Prompt', breite)}
            <Box flexDirection="column">{zeilen(k, 'Schreib deinen Prompt hier hinein; Enter startet die Rückfragen.', breite, { color: FARBE.leise })}</Box>
            {Input ? (
                <Input key="eingabe" label="Prompt" placeholder="Was soll Claude tun?" submitLabel="verbessern" autoFocus onSubmit={v => a.starte(v)} />
            ) : (
                <Text color={FARBE.bernstein}>{kuerze('Hier gibt es kein Eingabefeld; nimm /better <Prompt>.', breite)}</Text>
            )}
            {knopfReihen(k, [{ key: 'abbrechen', label: 'Abbrechen', art: 'leise', onPress: () => a.abbrechen() }], breite)}
        </Box>
    )
}

function wartet(k: Kit, x: PromptUpgradeAblauf, status: string, breite: number, a: Aktionen): RenderElement {
    const { Box } = k
    return (
        <Box flexDirection="column" gap={1}>
            {karte(k, 'Dein Prompt', x.original, breite, { rahmen: FARBE.haar })}
            <Box flexDirection="column">{zeilen(k, status, breite, { color: FARBE.leise })}</Box>
            {knopfReihen(k, [{ key: 'abbrechen', label: 'Abbrechen', art: 'leise', onPress: () => a.abbrechen() }], breite)}
        </Box>
    )
}

function frageBlock(
    k: Kit,
    i: number,
    f: PromptUpgradeFrage,
    antwort: PromptUpgradeAntwort | null,
    andersOffen: boolean,
    breite: number,
    a: Aktionen,
): RenderElement {
    const { Box, Input, Text } = k
    const einzug = 4
    const innen = Math.max(1, breite - einzug)
    const liste = umbrechen(f.frage, innen)
    const marke =
        antwort === null
            ? { t: ` ${Math.min(i + 1, 9)} `, g: FARBE.gold, s: FARBE.dunkel }
            : antwort.art === 'uebersprungen'
              ? { t: ' – ', g: FARBE.haar, s: FARBE.leise }
              : { t: ' ✓ ', g: FARBE.gruen, s: FARBE.dunkel }
    const knoepfe: Knopf[] = [
        ...f.optionen.map((o, j) => ({
            key: `f${i}-o${j}`,
            label: o,
            art: (antwort?.art === 'wahl' && antwort.text === o ? 'gewaehlt' : 'neben') as Art,
            onPress: () => a.waehle(i, o),
        })),
        {
            key: `f${i}-anders`,
            label: 'Andere (eintippen)',
            art: antwort?.art === 'anders' || andersOffen ? 'gewaehlt' : 'neben',
            onPress: () => a.andersOeffnen(i),
        },
        { key: `f${i}-skip`, label: 'Überspringen', art: 'leise', onPress: () => a.ueberspringe(i) },
    ]
    return (
        <Box flexDirection="column">
            <Text>
                <Text backgroundColor={marke.g} color={marke.s} bold>
                    {marke.t}
                </Text>
                <Text color={FARBE.text} bold>
                    {` ${liste[0] ?? ''}`}
                </Text>
            </Text>
            {liste.slice(1).map(z => (
                <Text color={FARBE.text} bold>
                    {`${' '.repeat(einzug)}${z}`}
                </Text>
            ))}
            <Box flexDirection="column" paddingLeft={einzug}>
                {knopfReihen(k, knoepfe, innen)}
                {andersOffen && Input ? (
                    <Input
                        key={`f${i}-text`}
                        label="Antwort"
                        placeholder="eintippen, Enter übernimmt"
                        submitLabel="übernehmen"
                        autoFocus
                        onSubmit={v => a.anders(i, v)}
                    />
                ) : null}
                {antwort?.art === 'anders' ? (
                    <Text>
                        <Text color={FARBE.gruen}>{'→ '}</Text>
                        <Text color={FARBE.text}>{kuerze(einzeilig(antwort.text), Math.max(1, innen - 2))}</Text>
                    </Text>
                ) : null}
                {antwort?.art === 'uebersprungen' ? <Text color={FARBE.leise}>übersprungen</Text> : null}
            </Box>
        </Box>
    )
}

function fragen(k: Kit, x: PromptUpgradeAblauf, breite: number, a: Aktionen): RenderElement {
    const { Box, Text } = k
    const beantwortet = x.antworten.filter(v => v !== null).length
    const zaehler = `${beantwortet} von ${x.fragen.length} beantwortet`
    return (
        <Box flexDirection="column" gap={1}>
            {abschnitt(k, 'Fragen', breite)}
            <Text>
                <Text color={beantwortet > 0 ? FARBE.gruen : FARBE.leise}>{kuerze(zaehler, breite)}</Text>
            </Text>
            {knopfReihen(
                k,
                [
                    { key: 'rest', label: 'Rest überspringen, jetzt verbessern', art: 'haupt', onPress: () => a.restUeberspringen() },
                    { key: 'abbrechen', label: 'Abbrechen', art: 'leise', onPress: () => a.abbrechen() },
                ],
                breite,
            )}
            {x.fragen.map((f, i) => frageBlock(k, i, f, x.antworten[i] ?? null, x.andersOffen === i, breite, a))}
        </Box>
    )
}

function pruefen(k: Kit, x: PromptUpgradeAblauf, breite: number, a: Aktionen): RenderElement {
    const { Box, Input, Text } = k
    const text = x.entwurf
    const offen = platzhalter(text)
    const bearbeitet = text !== x.upgrade
    const knoepfe: Knopf[] = [
        { key: 'ausfuehren', label: 'Ausführen', art: 'haupt', onPress: () => a.ausfuehren(), autoFocus: !x.bearbeiten },
        { key: 'bearbeiten', label: 'Bearbeiten', art: x.bearbeiten ? 'gewaehlt' : 'neben', onPress: () => a.bearbeiten() },
        {
            key: 'kopieren',
            label: x.kopiert === 'ok' ? 'Kopiert' : x.kopiert === 'fehler' ? 'Nicht kopiert' : 'Kopieren',
            art: x.kopiert === 'ok' ? 'gewaehlt' : 'neben',
            onPress: e => a.kopieren(e),
        },
        { key: 'abbrechen', label: 'Abbrechen', art: 'leise', onPress: () => a.abbrechen() },
    ]
    const nebeneinander = breite >= NEBENEINANDER_AB
    const kartenBreite = nebeneinander ? Math.floor((breite - 2) / 2) : breite
    const links = karte(k, 'Dein Prompt', x.original, kartenBreite, { rahmen: FARBE.haar })
    const rechts = karte(k, bearbeitet ? 'Upgrade (bearbeitet)' : 'Upgrade', text, kartenBreite, {
        rahmen: FARBE.gold,
        titelFarbe: FARBE.gold,
        platzhalter: true,
    })
    // Ein Durchlauf von vor 0.2.0 (nach einem Neuladen noch im Zustand) hat das Feld nicht.
    const abdeckung = abdeckungsZeile(k, istAbdeckung(x.abdeckung) ? x.abdeckung : null, breite)
    const kennzahlen = zahlen(k, woerter(x.original), woerter(text), x.ergaenzt.length, breite)
    return (
        <Box flexDirection="column" gap={1}>
            {abdeckung ? (
                <Box flexDirection="column">
                    {kennzahlen}
                    {abdeckung}
                </Box>
            ) : (
                kennzahlen
            )}
            {knopfReihen(k, knoepfe, breite)}
            {x.bearbeiten ? (
                Input ? (
                    <Input
                        key="entwurf"
                        label="Upgrade"
                        value={text}
                        submitLabel="ausführen"
                        autoFocus
                        onInput={v => a.entwurf(v)}
                        onSubmit={v => a.ausfuehren(v)}
                    />
                ) : (
                    <Text color={FARBE.bernstein}>{kuerze('Bearbeiten geht hier nicht; Kopieren und im Eingabefeld ändern.', breite)}</Text>
                )
            ) : null}
            {offen.length > 0 ? (
                <Box flexDirection="column">
                    {zeilen(
                        k,
                        `${offen.length === 1 ? 'Ein Platzhalter ist' : `${offen.length} Platzhalter sind`} noch offen: ${offen.join(', ')}. Mit Bearbeiten ausfüllen.`,
                        breite,
                        { color: FARBE.bernstein },
                    )}
                </Box>
            ) : null}
            {x.ergaenzt.length > 0 ? (
                <Box flexDirection="column">
                    {abschnitt(k, 'Was ich ergänzt habe', breite)}
                    {x.ergaenzt.map(p => {
                        const liste = umbrechen(p, Math.max(1, breite - 2))
                        return (
                            <Box flexDirection="column">
                                <Text>
                                    <Text color={FARBE.gruen}>{'+ '}</Text>
                                    <Text color={FARBE.text}>{liste[0] ?? ''}</Text>
                                </Text>
                                {liste.slice(1).map(z => (
                                    <Text color={FARBE.text}>{`  ${z}`}</Text>
                                ))}
                            </Box>
                        )
                    })}
                </Box>
            ) : null}
            {nebeneinander ? (
                <Box flexDirection="row" gap={2}>
                    {links}
                    {rechts}
                </Box>
            ) : (
                <Box flexDirection="column" gap={1}>
                    {links}
                    {rechts}
                </Box>
            )}
        </Box>
    )
}

function fehler(k: Kit, x: PromptUpgradeAblauf, breite: number, a: Aktionen): RenderElement {
    const { Box } = k
    const innen = Math.max(1, breite - 4)
    return (
        <Box flexDirection="column" gap={1}>
            <Box flexDirection="column" borderStyle="round" borderColor={FARBE.bernstein} paddingX={1} width={breite}>
                {abschnitt(k, 'Das hat nicht geklappt', innen, FARBE.bernstein)}
                {zeilen(k, 'Dein Prompt ist sicher; gesendet wurde nichts.', innen, { color: FARBE.text })}
                {zeilen(k, x.fehler?.grund ?? 'Das Modell hat nicht geantwortet.', innen, { color: FARBE.leise })}
            </Box>
            {knopfReihen(
                k,
                [
                    { key: 'erneut', label: 'Erneut versuchen', art: 'haupt', onPress: () => a.erneut() },
                    { key: 'original', label: 'Original senden', art: 'neben', onPress: () => a.originalSenden() },
                    { key: 'abbrechen', label: 'Abbrechen', art: 'leise', onPress: () => a.abbrechen() },
                ],
                breite,
            )}
            {karte(k, 'Dein Prompt', x.original, breite, { rahmen: FARBE.haar })}
        </Box>
    )
}

function verlaufAnsicht(k: Kit, lage: Lage, breite: number, a: Aktionen): RenderElement {
    const { Box, Button, Text } = k
    const knoepfe: Knopf[] = lage.ablauf
        ? [{ key: 'verlauf-zu', label: 'Zurück', art: 'neben', onPress: () => a.verlaufZu() }]
        : [{ key: 'schliessen', label: 'Schließen', art: 'leise', onPress: () => a.schliessen() }]
    return (
        <Box flexDirection="column" gap={1}>
            {abschnitt(k, 'Verlauf', breite)}
            {lage.verlauf.length === 0 ? (
                <Text color={FARBE.leise}>{kuerze('Noch keine Upgrades.', breite)}</Text>
            ) : (
                <Box flexDirection="column">
                    <Text color={FARBE.leise}>{kuerze('Ein Klick öffnet die Prüfung wieder.', breite)}</Text>
                    {lage.verlauf.map((v, i) => {
                        const nr = String(i + 1).padStart(2, ' ')
                        const original = einzeilig(v.original)
                        if (!k.istTerminal) {
                            const label = `${i + 1}. ${kuerze(original, Math.max(1, breite - 4 - zellen(`${i + 1}. `)))}`
                            return <Button key={`v${i}`} label={label} onPress={() => a.verlaufWaehlen(i)} />
                        }
                        const nachsatz = `${woerter(v.upgrade)} Wörter`
                        const mitNachsatz = breite - zellen(nr) - 2 - zellen(nachsatz) >= 8
                        const platz = breite - zellen(nr) - 1 - (mitNachsatz ? zellen(nachsatz) + 1 : 0)
                        const auszug = kuerze(original, Math.max(1, platz))
                        const luecke = Math.max(0, platz - zellen(auszug))
                        return (
                            <Button key={`v${i}`} label={`${i + 1}. ${auszug}`} plain onPress={() => a.verlaufWaehlen(i)}>
                                <Text color={FARBE.gold}>{nr}</Text>
                                <Text color={FARBE.text}>{` ${auszug}${' '.repeat(luecke)}`}</Text>
                                {mitNachsatz ? <Text color={FARBE.leise}>{` ${nachsatz}`}</Text> : ''}
                            </Button>
                        )
                    })}
                </Box>
            )}
            {knopfReihen(k, knoepfe, breite)}
        </Box>
    )
}

function leer(k: Kit, breite: number, a: Aktionen): RenderElement {
    const { Box } = k
    return (
        <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">{zeilen(k, 'Kein Prompt offen. /better <Prompt> startet ein Upgrade.', breite, { color: FARBE.leise })}</Box>
            {knopfReihen(
                k,
                [
                    { key: 'verlauf-auf', label: 'Verlauf', art: 'neben', onPress: () => a.verlaufAuf() },
                    { key: 'schliessen', label: 'Schließen', art: 'leise', onPress: () => a.schliessen() },
                ],
                breite,
            )}
        </Box>
    )
}

/** Der ganze Baum des Fensters, `breite` Zellen breit. */
export function zeichne(k: Kit, lage: Lage, breite: number, a: Aktionen): RenderElement {
    const { Box } = k
    const b = Math.max(20, Math.floor(breite))
    const x = lage.ablauf
    let rumpf: RenderElement
    if (lage.zeigeVerlauf) {
        rumpf = verlaufAnsicht(k, lage, b, a)
    } else if (x === null) {
        rumpf = leer(k, b, a)
    } else if (x.schritt === 'eingabe') {
        rumpf = eingabe(k, b, a)
    } else if (x.schritt === 'lesen') {
        rumpf = wartet(k, x, 'Lese deinen Prompt und suche, was noch fehlt.', b, a)
    } else if (x.schritt === 'fragen') {
        rumpf = fragen(k, x, b, a)
    } else if (x.schritt === 'umschreiben') {
        const genutzt = x.antworten.filter(v => v !== null && v.art !== 'uebersprungen').length
        const status = genutzt > 0 ? 'Schreibe deinen Prompt um und nutze deine Antworten.' : 'Schreibe deinen Prompt um.'
        rumpf = wartet(k, x, status, b, a)
    } else if (x.schritt === 'pruefen') {
        rumpf = pruefen(k, x, b, a)
    } else {
        rumpf = fehler(k, x, b, a)
    }
    const zeigeSpur = !lage.zeigeVerlauf && x !== null
    return (
        <Box flexDirection="column" width={b} gap={1} backgroundColor={FARBE.grund}>
            {kopf(k, b)}
            {zeigeSpur && x ? spurZeile(k, x, b) : null}
            {rumpf}
        </Box>
    )
}
