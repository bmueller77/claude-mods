import { expect, test } from 'claude-code/testing'
import type { RenderNode } from 'claude-code'

import { BAND_VERSION, bandBudget, plane, zeilenVon } from '../hooks/band'
import type { BandHoehe } from '../hooks/band'

// hooks/band.ts liegt wortgleich in fuenf Mods; getestet wird die Kopie der Statistik.

const box = (props: Record<string, unknown>, ...children: unknown[]) => ({ type: 'Box', props, children }) as unknown as RenderNode
const text = (s: string, props: Record<string, unknown> = {}) => ({ type: 'Text', props, children: [s] }) as unknown as RenderNode
const knopf = (label: string, props: Record<string, unknown> = {}) =>
    ({ type: 'Button', props: { key: label, label, ...props }, press: { plugin: 'x', handle: 1 } }) as unknown as RenderNode
const svg = (height: number, width?: number) =>
    ({ type: 'Svg', props: { source: '<svg/>', alt: 'Linie', height, ...(width ? { width } : {}) } }) as unknown as RenderNode

const hoehe = (voll: number, klein = voll, v = BAND_VERSION): BandHoehe => ({ v, voll, klein })

test('zeilenVon: kurzer Text eine Zeile, langer bricht um, gekappter bleibt eine', () => {
    for (const f of ['terminal', 'desktop']) {
        expect(zeilenVon(text('Hallo Welt'), f, 80)).toBe(1)
        expect(zeilenVon(text('x'.repeat(100), { wrap: 'truncate-end' }), f, 40)).toBe(1)
        expect(zeilenVon(null, f, 80)).toBe(0)
    }
    // Terminal nach Woertern: 10 Woerter zu 9 Zeichen, mit Leerzeichen 99 Zellen, bei 40 Spalten 3 Zeilen.
    const lang = Array.from({ length: 10 }, () => 'abcdefghi').join(' ')
    expect(zeilenVon(text(lang), 'terminal', 40)).toBe(3)
    // Desktop vorsichtig: 99 Zeichen bei 40 ch, aufgerundet 3.
    expect(zeilenVon(text(lang), 'desktop', 40)).toBe(3)
    // Ein Zeilenumbruch im Text zaehlt mit.
    expect(zeilenVon(text('eins\nzwei'), 'terminal', 80)).toBe(2)
    // Emoji zaehlen zwei Zellen: 30 Emoji sind 60 Zellen, bei 40 Spalten 2 Zeilen.
    expect(zeilenVon(text('📝'.repeat(30)), 'terminal', 40)).toBe(2)
})

test('zeilenVon: ein Button ist eine Zeile, eine Zeile mit Buttons auch', () => {
    for (const f of ['terminal', 'desktop']) {
        expect(zeilenVon(knopf('Übernehmen'), f, 80)).toBe(1)
        expect(zeilenVon(box({ flexDirection: 'row', gap: 1 }, text('Modellwahl schlägt Opus vor', { wrap: 'truncate-end' }), knopf('Übernehmen'), knopf('Nein')), f, 80)).toBe(1)
    }
})

test('zeilenVon: Svg nach ihrer Höhe, 15 px sind am Desktop 0,75 Zeilen', () => {
    expect(zeilenVon(box({}, svg(15)), 'desktop', 80)).toBe(0.75)
    expect(zeilenVon(box({ flexDirection: 'column' }, box({}, svg(15)), box({}, knopf('A'))), 'desktop', 80)).toBe(1.75)
})

test('zeilenVon: rowGap 1.2 am Desktop sind 0,6 Zeilen je Lücke', () => {
    const drei = box({ flexDirection: 'column', rowGap: 1.2 }, knopf('a'), knopf('b'), knopf('c'))
    expect(zeilenVon(drei, 'desktop', 80)).toBe(4.2)
})

test('zeilenVon: marginTop 1 ist im Terminal eine Zeile, in der App eine halbe', () => {
    const b = box({ marginTop: 1 }, text('Hallo'))
    expect(zeilenVon(b, 'terminal', 80)).toBe(2)
    expect(zeilenVon(b, 'desktop', 80)).toBe(1.5)
    // Stufen: im Terminal md eine Zeile, xs keine; am Desktop eine halbe Zeile je Stufe.
    expect(zeilenVon(box({ marginTop: 'md' }, text('x')), 'terminal', 80)).toBe(2)
    expect(zeilenVon(box({ marginTop: 'xs' }, text('x')), 'terminal', 80)).toBe(1)
    expect(zeilenVon(box({ marginTop: 'xs' }, text('x')), 'desktop', 80)).toBe(1.5)
})

test('zeilenVon: flexWrap bricht eine zu breite Zeile in zwei, display none und Knoten der Engine zählen nicht', () => {
    const zeile = (breite: number) =>
        box({ flexDirection: 'row', flexWrap: 'wrap', columnGap: 2, width: breite }, text('a'.repeat(30)), text('b'.repeat(30)))
    expect(zeilenVon(zeile(80), 'terminal', 80)).toBe(1)
    expect(zeilenVon(zeile(50), 'terminal', 80)).toBe(2)
    expect(zeilenVon(zeile(50), 'desktop', 80)).toBe(2)
    expect(zeilenVon(box({ flexDirection: 'column' }, text('a'), box({ display: 'none' }, text('b')), { type: 'engine', ref: 0 }), 'terminal', 80)).toBe(1)
})

test('bandBudget: Desktop nimmt bodyRows, das Terminal maxRows', () => {
    expect(bandBudget('desktop', { maxRows: 12, scroll: { bodyRows: 13 } })).toBe(13)
    expect(bandBudget('desktop', { maxRows: 12, scroll: { bodyRows: 1 } })).toBe(12)
    expect(bandBudget('desktop', { maxRows: 12 })).toBe(12)
    expect(bandBudget('terminal', { maxRows: 9, scroll: { bodyRows: 8 } })).toBe(9)
})

test('plane: passt alles, bleibt alles voll', () => {
    const p = plane(13, 'desktop', { leitstand: hoehe(5, 3), statistik: hoehe(1.75), zusammenfassung: hoehe(3, 1), naechsteSchritte: hoehe(2, 1) })
    expect(p).toEqual({ zusammenfassungKlein: false, naechsteKlein: false, leitstandFalten: false, budget: 13, summe: 11.75, rest: 6.25, passt: true })
})

test('plane: Stufe 1, 2 und 3 nacheinander, die erste, die passt, gilt', () => {
    const h = { leitstand: hoehe(6, 3), statistik: hoehe(2), zusammenfassung: hoehe(3, 1), naechsteSchritte: hoehe(3, 1) }
    // Voll 14, Stufe 1: 12, Stufe 2: 10, Stufe 3: 7.
    const s1 = plane(12, 'terminal', h)
    expect([s1.zusammenfassungKlein, s1.naechsteKlein, s1.leitstandFalten, s1.summe, s1.rest, s1.passt]).toEqual([true, false, false, 12, 6, true])
    const s2 = plane(11, 'terminal', h)
    expect([s2.zusammenfassungKlein, s2.naechsteKlein, s2.leitstandFalten, s2.summe, s2.rest, s2.passt]).toEqual([true, true, false, 10, 7, true])
    const s3 = plane(8, 'terminal', h)
    expect([s3.zusammenfassungKlein, s3.naechsteKlein, s3.leitstandFalten, s3.summe, s3.rest, s3.passt]).toEqual([true, true, true, 7, 4, true])
})

test('plane: passt auch Stufe 3 nicht, bleibt sie mit passt = false', () => {
    const p = plane(4, 'terminal', { leitstand: hoehe(6, 3), statistik: hoehe(2), zusammenfassung: hoehe(3, 1), naechsteSchritte: hoehe(3, 1), modellwahl: hoehe(1) })
    expect(p).toEqual({ zusammenfassungKlein: true, naechsteKlein: true, leitstandFalten: true, budget: 4, summe: 8, rest: -1, passt: false })
})

test('plane: Desktop rundet die Summe auf ganze Zeilen, mit kleiner Toleranz', () => {
    expect(plane(13, 'desktop', { statistik: hoehe(1.75), leitstand: hoehe(11.2) }).passt).toBe(true)
    expect(plane(13, 'desktop', { statistik: hoehe(1.75), leitstand: hoehe(11.4) }).passt).toBe(false)
    expect(plane(13, 'terminal', { statistik: hoehe(2), leitstand: hoehe(11) }).passt).toBe(true)
})

test('plane: ein Eintrag mit anderer Version zählt für beide Werte voll; fehlende zählen 0', () => {
    const p = plane(5, 'terminal', { zusammenfassung: hoehe(4, 1, BAND_VERSION + 1), statistik: hoehe(2) })
    expect(p.zusammenfassungKlein).toBe(true)
    expect(p.summe).toBe(6)
    expect(p.passt).toBe(false)
    expect(plane(5, 'terminal', {}).summe).toBe(0)
})
