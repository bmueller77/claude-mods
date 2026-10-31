// Platz im Band über dem Eingabefeld: Jeder Mod, der dort zeichnet, misst seinen eigenen Teil
// und legt die Höhe in `$.state` ab (Schlüssel `bandHoehe`, je Fläche). Wer mehr zeigen kann,
// als Platz ist (Zusammenfassung, Nächste Schritte, Leitstand), liest die Höhen der anderen
// und rechnet mit `plane` aus, welche Teile klein werden, damit das Band nicht scrollt.
//
// Diese Datei liegt wortgleich in leitstand, statistik, zusammenfassung, naechste-schritte und
// modellwahl (kein Mod importiert aus einem anderen). Wer sie ändert, ändert alle fünf Kopien
// und zählt BAND_VERSION hoch. Kein `$` hier: nur Rechnungen.

import type { RenderNode } from 'claude-code'

/** Zählt jede Änderung an Messung oder Plan hoch. Ein fremder Wert mit anderer Version gilt als groß. */
export const BAND_VERSION = 1

/**
 * Was ein Mod unter `bandHoehe` je Fläche veröffentlicht: wie viele Zeilen sein Teil des Bands
 * braucht. Im Terminal ganze Zellenzeilen, in der Desktop-App Zeilen zu 20 px mit Bruchteilen.
 *
 * `voll` ist die Höhe, wie er gerade zeichnen will, `klein` die Höhe, wenn er sich klein macht
 * (Zusammenfassung nur die Kopfzeile, Nächste Schritte einzeilig, Leitstand gefaltet wie in der
 * Ansicht Normal, also erledigte und weitere Schritte zusammengefasst). Wer sich nicht klein
 * machen kann, setzt beide gleich. Zeichnet ein Mod nichts, veröffentlicht er 0 und 0.
 */
export type BandHoehe = { v: number; voll: number; klein: number }

/**
 * Was `plane` entscheidet. Jeder Mod rechnet denselben Plan und wendet nur seinen Teil an.
 *
 * - `zusammenfassungKlein`: Die Zusammenfassung zeigt nur ihre Kopfzeile.
 * - `naechsteKlein`: Nächste Schritte zeigt die Vorschläge in einer Zeile.
 * - `leitstandFalten`: Der Leitstand faltet wie in der Ansicht Normal (erledigte und weitere Schritte).
 * - `budget`: die Zeilen, die das Band ohne Scrollen zeigt.
 * - `summe`: die Höhe aller Teile nach dieser Entscheidung.
 * - `rest`: Platz für den ganzen Leitstand, `budget` weniger alle anderen Teile (kann negativ sein).
 * - `passt`: false, wenn auch alles klein nicht ins Budget passt; dann scrollt das Band.
 */
export type BandPlan = {
    zusammenfassungKlein: boolean
    naechsteKlein: boolean
    leitstandFalten: boolean
    budget: number
    summe: number
    rest: number
    passt: boolean
}

/** Die Höhen, die `plane` braucht; was fehlt, zählt 0. Die Schlüssel heißen nach den Mods. */
export type BandHoehen = {
    leitstand?: BandHoehe | null
    statistik?: BandHoehe | null
    zusammenfassung?: BandHoehe | null
    naechsteSchritte?: BandHoehe | null
    modellwahl?: BandHoehe | null
}

/** Der Teil von `e.props` des Bands, den `bandBudget` liest. */
export type BandProps = { maxRows: number; scroll?: { bodyRows?: number } }

/**
 * Wie viele Zeilen das Band zeigt, ohne zu scrollen.
 *
 * Desktop-App: `scroll.bodyRows`, die Höhe, die die App dem Band gibt (meist 13); fehlt sie oder
 * ist sie kleiner als 2, `maxRows` (in der App fest 12). Terminal: `maxRows`, im Vollbild der Rest
 * des unteren Felds, sonst die Höhe des Terminals; ein Baum mit höchstens so vielen Zeilen steht ganz.
 */
export function bandBudget(surface: string, props: BandProps): number {
    const body = props.scroll?.bodyRows
    if (surface === 'desktop' && typeof body === 'number' && body >= 2) {
        return body
    }
    return props.maxRows
}

/** Wie `plane` prüft, ob eine Summe ins Budget passt. Desktop rundet auf ganze Zeilen, mit kleiner Toleranz. */
function passtIns(summe: number, budget: number, surface: string): boolean {
    return surface === 'desktop' ? Math.ceil(summe - 0.05) <= budget : summe <= budget
}

/** Ein fremder Eintrag als Zahlenpaar: fehlt er, 0; andere Version, für beide Werte `voll`. */
function werte(h: BandHoehe | null | undefined): { voll: number; klein: number } {
    if (!h || typeof h !== 'object') {
        return { voll: 0, klein: 0 }
    }
    const zahl = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0)
    const voll = zahl(h.voll)
    return { voll, klein: h.v === BAND_VERSION ? zahl(h.klein) : voll }
}

/**
 * Entscheidet, wer sich klein macht, damit das Band in `budget` Zeilen passt.
 *
 * Stufe 0 alles voll, Stufe 1 die Zusammenfassung klein, Stufe 2 dazu Nächste Schritte klein,
 * Stufe 3 dazu der Leitstand gefaltet. Die erste Stufe, die passt, gilt. Passt auch Stufe 3
 * nicht, bleibt es bei Stufe 3 mit `passt = false`, und das Band scrollt.
 */
export function plane(budget: number, surface: string, h: BandHoehen): BandPlan {
    const ls = werte(h.leitstand)
    const st = werte(h.statistik)
    const zf = werte(h.zusammenfassung)
    const ns = werte(h.naechsteSchritte)
    const mw = werte(h.modellwahl)
    const stufen: [boolean, boolean, boolean][] = [
        [false, false, false],
        [true, false, false],
        [true, true, false],
        [true, true, true],
    ]
    let plan: BandPlan | null = null
    for (const [zfKlein, nsKlein, lsFalten] of stufen) {
        const ohneLeitstand = st.voll + mw.voll + (zfKlein ? zf.klein : zf.voll) + (nsKlein ? ns.klein : ns.voll)
        const summe = runde(ohneLeitstand + (lsFalten ? ls.klein : ls.voll))
        plan = {
            zusammenfassungKlein: zfKlein,
            naechsteKlein: nsKlein,
            leitstandFalten: lsFalten,
            budget,
            summe,
            rest: runde(budget - ohneLeitstand),
            passt: passtIns(summe, budget, surface),
        }
        if (plan.passt) {
            return plan
        }
    }
    return plan as BandPlan
}

// --- Messen ---

/** Ein Knoten, wie `zeilenVon` ihn liest: nur die Felder, die für die Höhe zählen. */
type Knoten = { type?: string; props?: Record<string, unknown>; children?: unknown }

/** Wie gemessen wird: Terminal in Zellen, Desktop in Zeilen zu 20 px. */
type Art = { desktop: boolean }

/** Auf drei Stellen, damit 1 + 0,6 nicht 1,6000000000000001 ergibt. */
function runde(x: number): number {
    return Math.round(x * 1000) / 1000
}

/** Breite eines Texts in Zellen: Emoji und breite Zeichen 2, Verbinder und Variantenwähler 0. */
function zellen(text: string): number {
    let n = 0
    let letzte = 0
    for (const z of text) {
        if (z === '️') {
            // Ein Variantenwähler macht ein schmales Zeichen davor zum Emoji: zwei Zellen.
            if (letzte === 1) {
                n += 1
                letzte = 2
            }
            continue
        }
        if (/[​-‍⁠︀-︎̀-ͯ]/.test(z)) {
            continue
        }
        letzte = /\p{Emoji_Presentation}|[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u.test(z) ? 2 : 1
        n += letzte
    }
    return n
}

/** Eine Zeile Text, im Terminal gierig nach Wörtern umbrochen (lange Wörter hart), wie Ink es tut. */
function umbruchTerminal(zeile: string, breite: number): number {
    const b = Math.max(1, Math.floor(breite))
    let zeilen = 1
    let x = 0
    for (const wort of zeile.split(' ')) {
        const w = zellen(wort)
        const bedarf = x === 0 ? w : x + 1 + w
        if (bedarf <= b) {
            x = bedarf
            continue
        }
        if (x > 0) {
            zeilen += 1
        }
        if (w <= b) {
            x = w
        } else {
            zeilen += Math.ceil(w / b) - 1
            x = w % b === 0 ? b : w % b
        }
    }
    return zeilen
}

/** Zeilen eines Texts bei `breite`. Desktop: Proportionalschrift, bewusst vorsichtig je Zelle 1 ch. */
function textZeilen(text: string, breite: number, art: Art, kappt: boolean): number {
    if (text === '') {
        return 0
    }
    if (kappt) {
        return 1
    }
    let n = 0
    for (const zeile of text.split('\n')) {
        n += art.desktop ? Math.max(1, Math.ceil(zellen(zeile) / Math.max(1, breite))) : umbruchTerminal(zeile, breite)
    }
    return n
}

/** Der ganze Text unter einem Text-Knoten (Zeichenketten und verschachtelte Texte). */
function textVon(kinder: unknown): string {
    if (typeof kinder === 'string') {
        return kinder
    }
    if (typeof kinder === 'number') {
        return String(kinder)
    }
    if (Array.isArray(kinder)) {
        return kinder.map(textVon).join('')
    }
    if (kinder && typeof kinder === 'object') {
        const k = kinder as Knoten
        if (k.type === 'engine') {
            return ''
        }
        if (typeof k.props?.label === 'string' && k.children === undefined) {
            return k.props.label
        }
        return textVon(k.children)
    }
    return ''
}

/** Die Kinder eines Knotens als Liste, ohne Lücken. */
function kinderVon(k: Knoten): unknown[] {
    const c = k.children
    if (c === undefined || c === null || c === false) {
        return []
    }
    return (Array.isArray(c) ? c.flat(Infinity) : [c]).filter(x => x !== null && x !== undefined && x !== false && x !== true)
}

const STUFEN = ['xs', 'sm', 'md', 'lg', 'xl']

/**
 * Ein senkrechter Abstand in Zeilen. Terminal: Zahlen in Zellen, Stufen wie die API sie nennt
 * (xs und sm 0, md und lg 1, xl 2). Desktop: jede Einheit eine halbe Zeile (10 px), Stufen
 * geschätzt mit einer halben Zeile je Stufe (xs 0,5 bis xl 2,5).
 */
function senkrecht(wert: unknown, art: Art): number {
    if (typeof wert === 'number' && Number.isFinite(wert)) {
        return art.desktop ? wert * 0.5 : Math.round(wert)
    }
    if (typeof wert === 'string') {
        const i = STUFEN.indexOf(wert)
        if (i >= 0) {
            return art.desktop ? (i + 1) * 0.5 : [0, 0, 1, 1, 2][i] ?? 0
        }
    }
    return 0
}

/** Ein waagrechter Abstand in Zellen (Desktop ch): Zahlen wie sie sind, Stufen xs und sm 1, md 2, lg 3, xl 4. */
function waagrecht(wert: unknown): number {
    if (typeof wert === 'number' && Number.isFinite(wert)) {
        return wert
    }
    if (typeof wert === 'string') {
        const i = STUFEN.indexOf(wert)
        if (i >= 0) {
            return [1, 1, 2, 3, 4][i] ?? 0
        }
    }
    return 0
}

/** Der erste gesetzte Wert der Reihe, sonst undefined. */
function erster(...werte: unknown[]): unknown {
    return werte.find(w => w !== undefined)
}

/** Abstände eines Knotens: oben und unten in Zeilen, links und rechts in Zellen. */
function raender(p: Record<string, unknown>, art: Art, was: 'margin' | 'padding') {
    return {
        oben: senkrecht(erster(p[`${was}Top`], p[`${was}Y`], p[was]), art),
        unten: senkrecht(erster(p[`${was}Bottom`], p[`${was}Y`], p[was]), art),
        links: waagrecht(erster(p[`${was}Left`], p[`${was}X`], p[was])),
        rechts: waagrecht(erster(p[`${was}Right`], p[`${was}X`], p[was])),
    }
}

/** Ob ein Knoten keinen Platz im Fluss nimmt: display none oder absolut gesetzt. */
function ausserhalb(k: Knoten): boolean {
    return k.props?.display === 'none' || k.props?.position === 'absolute'
}

/** Ob ein Knoten einen Rahmen hat (im Terminal je eine Zeile und Spalte an jeder Seite). */
function rahmen(p: Record<string, unknown>): boolean {
    return typeof p.borderStyle === 'string' || (typeof p.borderStyle === 'object' && p.borderStyle !== null)
}

/** Geschätzte natürliche Breite eines Knotens in Zellen (Desktop ch), für Zeilen mit flexWrap. */
function breiteVon(knoten: unknown, art: Art): number {
    if (typeof knoten === 'string' || typeof knoten === 'number') {
        return Math.max(0, ...String(knoten).split('\n').map(zellen))
    }
    if (!knoten || typeof knoten !== 'object') {
        return 0
    }
    const k = knoten as Knoten
    const p = k.props ?? {}
    if (ausserhalb(k) || k.type === 'engine') {
        return 0
    }
    switch (k.type) {
        case 'Text':
        case 'Link':
            return Math.max(0, ...textVon(k.children ?? p.label ?? p.href ?? '').split('\n').map(zellen))
        case 'Markdown':
        case 'Code': {
            const t = typeof p.text === 'string' ? p.text : typeof p.source === 'string' ? p.source : ''
            return Math.max(0, ...t.split('\n').map(zellen))
        }
        case 'Button': {
            const label = typeof p.label === 'string' ? p.label : textVon(k.children)
            const w = zellen(label)
            if (art.desktop) {
                return w + 3
            }
            return p.plain ? w + (typeof p.hotkey === 'string' ? 3 : 0) : w + 4
        }
        case 'Svg':
            return typeof p.width === 'number' ? p.width / 8 : 2
        case 'Box': {
            if (typeof p.width === 'number') {
                return p.width
            }
            const m = raender(p, art, 'margin')
            const pad = raender(p, art, 'padding')
            const rand = rahmen(p) ? 2 : 0
            const kinder = kinderVon(k).filter(c => !(c && typeof c === 'object' && ausserhalb(c as Knoten)))
            const breiten = kinder.map(c => breiteVon(c, art))
            const innen =
                p.flexDirection === 'column' || p.flexDirection === 'column-reverse'
                    ? Math.max(0, ...breiten)
                    : breiten.reduce((a, b) => a + b, 0) + Math.max(0, kinder.length - 1) * waagrecht(erster(p.columnGap, p.gap))
            return innen + m.links + m.rechts + pad.links + pad.rechts + rand
        }
        default:
            return 10
    }
}

/** Ob ein Kind einer Zeile schrumpfen und umbrechen darf (Texte und Boxen ohne flexShrink 0). */
function schrumpft(knoten: unknown): boolean {
    if (typeof knoten === 'string' || typeof knoten === 'number') {
        return true
    }
    const k = knoten as Knoten
    if (k.props?.flexShrink === 0) {
        return false
    }
    return k.type === 'Text' || k.type === 'Link' || k.type === 'Box' || k.type === 'Markdown'
}

/** Höhe eines Knotens bei `breite` Zellen, Ränder eingerechnet. */
function hoehe(knoten: unknown, breite: number, art: Art): number {
    if (typeof knoten === 'string' || typeof knoten === 'number') {
        return textZeilen(String(knoten), breite, art, false)
    }
    if (!knoten || typeof knoten !== 'object') {
        return 0
    }
    const k = knoten as Knoten
    const p = k.props ?? {}
    if (ausserhalb(k)) {
        return 0
    }
    switch (k.type) {
        case 'engine':
            return 0
        case 'Text':
        case 'Link':
            return textZeilen(
                textVon(k.children ?? p.label ?? p.href ?? ''),
                breite,
                art,
                typeof p.wrap === 'string' && p.wrap.startsWith('truncate'),
            )
        case 'Markdown':
            return textZeilen(typeof p.text === 'string' ? p.text : '', breite, art, false)
        case 'Code':
            return typeof p.source === 'string' ? p.source.split('\n').length : 1
        case 'Button':
            return 1
        case 'Svg': {
            const z = typeof p.height === 'number' ? p.height / 20 : 1
            return art.desktop ? z : Math.max(1, Math.ceil(z))
        }
        case 'Box':
            return boxHoehe(k, breite, art)
        default:
            return 1
    }
}

/** Höhe einer Box: Spalte als Summe mit Lücken, Zeile als größtes Kind, mit flexWrap gierig umbrochen. */
function boxHoehe(k: Knoten, breiteAussen: number, art: Art): number {
    const p = k.props ?? {}
    const m = raender(p, art, 'margin')
    const pad = raender(p, art, 'padding')
    const rand = rahmen(p) ? (art.desktop ? 0 : 1) : 0
    const randBreite = rahmen(p) ? 2 : 0
    let breite = Math.max(0, breiteAussen - m.links - m.rechts)
    if (typeof p.width === 'number') {
        breite = Math.min(breite, p.width)
    }
    breite = Math.max(1, breite - pad.links - pad.rechts - randBreite)
    const kinder = kinderVon(k).filter(c => !(c && typeof c === 'object' && ausserhalb(c as Knoten)))
    const zeilenLuecke = senkrecht(erster(p.rowGap, p.gap), art)
    const spaltenLuecke = waagrecht(erster(p.columnGap, p.gap))
    let innen = 0
    if (kinder.length > 0) {
        if (p.flexDirection === 'column' || p.flexDirection === 'column-reverse') {
            innen = kinder.reduce<number>((s, c) => s + hoehe(c, breite, art), 0) + (kinder.length - 1) * zeilenLuecke
        } else if (p.flexWrap === 'wrap' || p.flexWrap === 'wrap-reverse') {
            // Gierig in Zeilen verteilen; jede Zeile so hoch wie ihr größtes Kind.
            const zeilen: number[] = []
            let x = 0
            let zeile = 0
            for (const c of kinder) {
                const natuerlich = breiteVon(c, art)
                const w = Math.min(breite, natuerlich)
                if (x > 0 && x + spaltenLuecke + w > breite) {
                    zeilen.push(zeile)
                    x = 0
                    zeile = 0
                }
                x = x === 0 ? w : x + spaltenLuecke + w
                // Mit flexShrink 0 ragt ein Kind hinaus, statt umzubrechen: gemessen in voller Breite.
                zeile = Math.max(zeile, hoehe(c, Math.max(1, schrumpft(c) ? w : natuerlich), art))
            }
            zeilen.push(zeile)
            innen = zeilen.reduce((s, z) => s + z, 0) + (zeilen.length - 1) * zeilenLuecke
        } else {
            // Eine Zeile: Feste Kinder behalten ihre Breite, die schrumpfbaren teilen sich den Rest.
            const breiten = kinder.map(c => breiteVon(c, art))
            const gesamt = breiten.reduce((a, b) => a + b, 0) + (kinder.length - 1) * spaltenLuecke
            if (gesamt <= breite) {
                innen = Math.max(0, ...kinder.map((c, i) => hoehe(c, Math.max(1, breiten[i] ?? 1), art)))
            } else {
                const fest = kinder.reduce<number>((s, c, i) => s + (schrumpft(c) ? 0 : breiten[i] ?? 0), 0)
                const weich = kinder.reduce<number>((s, c, i) => s + (schrumpft(c) ? breiten[i] ?? 0 : 0), 0)
                const frei = Math.max(1, breite - fest - (kinder.length - 1) * spaltenLuecke)
                innen = Math.max(
                    0,
                    ...kinder.map((c, i) => {
                        const w = breiten[i] ?? 1
                        const anteil = schrumpft(c) && weich > 0 ? Math.max(1, Math.floor((frei * w) / weich)) : w
                        return hoehe(c, Math.max(1, anteil), art)
                    }),
                )
            }
        }
    }
    return m.oben + m.unten + pad.oben + pad.unten + 2 * rand + innen
}

/**
 * Wie viele Zeilen ein eigener Teilbaum im Band braucht: Terminal ganze Zellenzeilen,
 * Desktop Zeilen zu 20 px mit Bruchteilen (eine Svg mit 15 px ist 0,75, `rowGap={1.2}` 0,6).
 *
 * `spalten` ist die Breite, in der der Baum liegt (`e.props.bodyColumns`). Eine Box ohne
 * `flexDirection` ist eine Zeile wie in Ink. Knoten der Engine (`type: 'engine'`) zählen 0.
 * Verglichen wird am Desktop erst die ganze Summe, aufgerundet (siehe `plane`).
 */
export function zeilenVon(baum: RenderNode | null | undefined, surface: string, spalten: number): number {
    if (baum === null || baum === undefined) {
        return 0
    }
    return runde(hoehe(baum, Math.max(1, spalten), { desktop: surface === 'desktop' }))
}
