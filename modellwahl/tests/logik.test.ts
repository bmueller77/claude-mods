import { expect, test } from 'claude-code/testing'

import {
    LEERE_KALIBRIERUNG,
    baueAnfrage,
    familieVon,
    kalibriere,
    kostenInOpus,
    leseEinschaetzung,
    prozentText,
    schaetzeWechsel,
    tokenText,
    wahlText,
} from '../hooks/logik'

/** Gleich bis auf Rundung. */
function nah(a: number | null | undefined, b: number, eps: number): void {
    expect(Math.abs((a ?? NaN) - b) < eps).toBe(true)
}

test('Einschätzung lesen: JSON auch mit Text drumherum, sonst null', () => {
    expect(leseEinschaetzung('```json\n{"modell":"Opus","aufwand":"HIGH","grund":"Umbau über mehrere Dateien."}\n```')).toEqual({
        modell: 'opus',
        aufwand: 'high',
        grund: 'Umbau über mehrere Dateien',
    })
    expect(leseEinschaetzung('{"modell":"claude-fable-5-1","aufwand":"xhigh","grund":"eins zwei drei vier fünf sechs sieben acht"}')?.grund).toBe(
        'eins zwei drei vier fünf sechs',
    )
    expect(leseEinschaetzung('{"modell":"opus","aufwand":"medium","grund":"Neuer Mod mit Tests und Doku, aufwendig"}')?.grund).toBe(
        'Neuer Mod mit Tests und Doku',
    )
    expect(leseEinschaetzung('{"modell":"gpt","aufwand":"low"}')).toBeNull()
    expect(leseEinschaetzung('{"modell":"haiku","aufwand":"ultra"}')).toBeNull()
    expect(leseEinschaetzung('Opus, hoch')).toBeNull()
    expect(leseEinschaetzung('{kaputt')).toBeNull()
})

test('Namen und Familien', () => {
    expect(wahlText({ modell: 'opus', aufwand: 'xhigh' })).toBe('Opus · Extra hoch')
    expect(wahlText({ modell: 'haiku', aufwand: 'low' })).toBe('Haiku · Niedrig')
    expect(familieVon('claude-sonnet-5-5')).toBe('sonnet')
    expect(familieVon('opus[1m]')).toBe('opus')
    expect(familieVon(null)).toBeNull()
})

test('Anfrage: höchstens 3000 Zeichen, die Aufgabe vorn, die letzten Nachrichten dahinter', () => {
    const lang = 'x'.repeat(5000)
    const verlauf = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `Nachricht ${i} ${'y'.repeat(500)}` }))
    const a = baueAnfrage(lang, verlauf)
    expect(a.length).toBeLessThanOrEqual(3000)
    expect(a.startsWith('Aufgabe:\n')).toBe(true)
    expect(a).toContain('Nachricht 19')
    expect(a).not.toContain('Nachricht 0 ')
    expect(baueAnfrage('', [{ role: 'user', text: 'Hallo' }])).toBe('Aufgabe: siehe die letzten Nachrichten.\n\nLetzte Nachrichten:\nPerson: Hallo')
})

test('Kosten in Opus-Eingabe-Tokens', () => {
    const u = { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 10_000, cache_creation_input_tokens: 1000 }
    // Opus: 1000 + 5000 + 1000 + 2000.
    expect(kostenInOpus(u, 'claude-opus-5-5')).toBe(9000)
    // Haiku kostet ein Fuenftel.
    expect(kostenInOpus(u, 'claude-haiku-5-5')).toBe(1800)
})

test('Kalibrierung: plausible Prozent-Schätzung, ohne Daten der Rückfall', () => {
    let k = kalibriere(LEERE_KALIBRIERUNG, 0, { percentUsed: 20, resetsAt: 'r1' }, 1)
    expect(k.basisProzent).toBe(20)
    expect(k.quote).toBeNull()
    // Kein Anstieg: die Summe waechst weiter.
    k = kalibriere(k, 300_000, { percentUsed: 20, resetsAt: 'r1' }, 2)
    expect(k.summe).toBe(300_000)
    k = kalibriere(k, 200_000, { percentUsed: 21, resetsAt: 'r1' }, 3)
    expect(k.proben).toBe(1)
    nah(k.quote, 2e-6, 1e-12)
    // Zweite Probe geht gleitend ein.
    k = kalibriere(k, 1_000_000, { percentUsed: 22, resetsAt: 'r1' }, 4)
    nah(k.quote, 2e-6 * 0.7 + 1e-6 * 0.3, 1e-12)
    // Neues Fenster: nur neue Basis.
    const neu = kalibriere(k, 50_000, { percentUsed: 1, resetsAt: 'r2' }, 5)
    expect(neu.basisProzent).toBe(1)
    expect(neu.quote).toBe(k.quote)
    expect(neu.summe).toBe(0)

    // 150k Kontext nach Opus: 300k Opus-Tokens, bei 1,7e-6 % je Token gut ein halbes Prozent.
    const s = schaetzeWechsel(k, 150_000, 'claude-opus-5-5')
    nah(s.prozent, 0.51, 1e-2)
    expect(prozentText(s.prozent ?? 0)).toBe('0,5 %')
    // Ohne Daten: keine Prozent, der Vergleich mit normalen Runden.
    const ohne = schaetzeWechsel(LEERE_KALIBRIERUNG, 150_000, 'claude-opus-5-5')
    expect(ohne.prozent).toBeNull()
    expect(ohne.runden).toBe(20)
    expect(schaetzeWechsel(null, 1, 'claude-fable-5-1').runden).toBe(80)
})

test('Zahlen deutsch', () => {
    expect(prozentText(0.04)).toBe('unter 0,1 %')
    expect(prozentText(2.46)).toBe('2,5 %')
    expect(prozentText(12.4)).toBe('12 %')
    expect(tokenText(950)).toBe('950')
    expect(tokenText(120_400)).toBe('120k')
    expect(tokenText(1_240_000)).toBe('1,2 Mio.')
})
