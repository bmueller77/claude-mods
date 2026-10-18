/** Teil 2: Selbstkritik auf Abruf, mit gemockter Gabelung des Chats. */
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { abschnitt, auftragAus, grund } from '../hooks/register'
import { FLAECHEN, REFLEXION, USAGE, befehl, fenster, start, welt } from './welt'
import type { Welt } from './welt'

const LAEUFT = 'Reflexion läuft … Das Ergebnis erscheint im Fenster „Reflexion“; /reflect zeigen gibt es als Text aus.'
const MIN = 60_000

async function knoepfe(ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) {
  return (await ui.findAll({ type: 'Button' })).map(b => String(b.props.label))
}

async function kopf(ui: { findAll: (q: { type: string; text: RegExp }) => Promise<{ text: string }[]> }) {
  return (await ui.findAll({ type: 'Text', text: /^Reflexion von / }))[0]?.text ?? ''
}

test('Abschnitte lesen, Auftrag bauen, Gruende benennen', () => {
  expect(abschnitt(REFLEXION, 'Könnte falsch sein oder fehlen')).toBe('- hooks/register.tsx, speichere(): zwei Sitzungen können gleichzeitig dieselbe CLAUDE.md schreiben.')
  expect(abschnitt('## Als naechstes pruefen:\n1. x\n### Detail\nmehr\n## Ende', 'Als Nächstes prüfen')).toBe('1. x\n### Detail\nmehr')
  expect(abschnitt('## Auftrag\n\n## Erledigt\n- a', 'Auftrag')).toBeUndefined()
  const auftrag = auftragAus(REFLEXION)
  expect(auftrag).toContain('## Könnte falsch sein oder fehlen\n- hooks/register.tsx, speichere()')
  expect(auftrag).toContain('## Als Nächstes prüfen\n1. claude plugin test laufen lassen.')
  expect(auftrag).not.toContain('## Erledigt')
  expect(auftrag).not.toContain('## Riskante Annahmen')
  expect(auftragAus('Nur Fließtext ohne Abschnitte.')).toContain('Nur Fließtext ohne Abschnitte.')
  expect(grund({ reason: 'nothing-to-fork' })).toBe('Noch nichts zu prüfen: Der Chat hat noch keine Antwort.')
  expect(grund({ reason: 'api-error', status: 529 })).toBe('Die Anfrage ist fehlgeschlagen (HTTP 529).')
})

test('/reflect antwortet sofort, die Gabelung fuellt das Fenster, "Claude soll das beheben" fuellt nur das Feld', async ($, on) => {
  const w = welt(on)
  await start($)
  expect(await befehl($, 'die Tests')).toBe(LAEUFT)
  expect(w.opened).toEqual(['reflect'])
  for (const surface of FLAECHEN) {
    const ui = await fenster($, surface)
    expect(await ui.find({ type: 'Text', text: /Reflexion läuft/ })).toBeDefined()
    expect(await knoepfe(ui)).toEqual(['Schließen'])
    await ui.unmount()
  }
  await w.clock.settle()
  expect(w.forks).toHaveLength(1)
  for (const teil of ['Schwerpunkt der Prüfung: die Tests', 'Benutze keine Werkzeuge', '## Auftrag', '## Erledigt', '## Könnte falsch sein oder fehlen', '## Riskante Annahmen', '## Als Nächstes prüfen', '"Nichts gefunden"'])
    expect(w.forks[0]).toContain(teil)

  for (const surface of FLAECHEN) {
    const ui = await fenster($, surface)
    expect((await ui.find({ type: 'Markdown' }))?.text).toBe(REFLEXION)
    expect(await kopf(ui)).toContain('Schwerpunkt: die Tests · 1/1')
    expect(await knoepfe(ui)).toEqual(['Claude soll das beheben', 'Kopieren', 'Schließen'])
    expect((await ui.find({ type: 'Button', key: 'beheben' }))?.props.variant).toBe('primary')
    await ui.press({ key: 'beheben' })
    const f = w.filled.at(-1)
    expect(f?.mode).toBe('replace')
    expect(f?.text).toBe(auftragAus(REFLEXION))
    await ui.press({ key: 'kopieren' })
    expect(w.copied.at(-1)).toContain(REFLEXION)
    await ui.unmount()
  }
  expect(w.filled).toHaveLength(2)
  // Abgeschickt wird nie etwas.
  expect(w.submitted).toEqual([])

  const text = await befehl($, 'zeigen')
  expect(text).toMatch(/^Reflexion von \d\d:\d\d · Schwerpunkt: die Tests\n\n/)
  expect(text).toContain(REFLEXION)
  expect(w.opened).toEqual(['reflect', 'reflect'])

  const ui = await fenster($, 'terminal')
  await ui.press({ key: 'schliessen' })
  expect(w.closed).toEqual(['reflect'])
})

test('"Claude soll das beheben" haengt an einen Entwurf an, statt ihn zu ersetzen', async ($, on) => {
  const w = welt(on, { box: 'mein Entwurf' })
  await start($)
  await befehl($)
  await w.clock.settle()
  const ui = await fenster($, 'desktop')
  await ui.press({ key: 'beheben' })
  expect(w.filled).toEqual([{ text: `\n\n${auftragAus(REFLEXION)}`, mode: 'append' }])
})

test('ohne Reflexion: Fenster und /reflect zeigen sagen, wie man eine startet', async ($, on) => {
  const w = welt(on)
  await start($)
  for (const surface of FLAECHEN) {
    const ui = await fenster($, surface)
    expect(await ui.find({ type: 'Text', text: 'Noch keine Reflexion. /reflect startet eine.' })).toBeDefined()
    expect(await knoepfe(ui)).toEqual(['Schließen'])
    await ui.unmount()
  }
  expect(await befehl($, 'zeigen')).toBe('Noch keine Reflexion. /reflect startet eine.')
  expect(w.opened).toEqual(['reflect'])
})

test('Ältere und Neuere blaettern; hoechstens fuenf bleiben', async ($, on) => {
  let n = 0
  const w = welt(on, {
    fork: () => {
      n += 1
      return { isAnswered: true, text: `## Auftrag\nLauf ${n}`, usage: USAGE }
    },
  })
  await start($)
  for (let i = 0; i < 6; i += 1) {
    expect(await befehl($)).toBe(LAEUFT)
    await w.clock.settle()
  }
  for (const surface of FLAECHEN) {
    const ui = await fenster($, surface)
    expect((await ui.find({ type: 'Markdown' }))?.text).toBe('## Auftrag\nLauf 6')
    expect(await kopf(ui)).toMatch(/ · 5\/5$/)
    expect(await knoepfe(ui)).toEqual(['Claude soll das beheben', 'Kopieren', '← Ältere', 'Schließen'])
    await ui.press({ key: 'aeltere' })
    expect((await ui.find({ type: 'Markdown' }))?.text).toBe('## Auftrag\nLauf 5')
    expect(await kopf(ui)).toMatch(/ · 4\/5$/)
    expect(await knoepfe(ui)).toEqual(['Claude soll das beheben', 'Kopieren', '← Ältere', 'Neuere →', 'Schließen'])
    for (let i = 0; i < 6; i += 1) await ui.press({ key: 'aeltere' }).catch(() => undefined)
    expect((await ui.find({ type: 'Markdown' }))?.text).toBe('## Auftrag\nLauf 2')
    expect(await knoepfe(ui)).toEqual(['Claude soll das beheben', 'Kopieren', 'Neuere →', 'Schließen'])
    await ui.press({ key: 'neuere' })
    expect((await ui.find({ type: 'Markdown' }))?.text).toBe('## Auftrag\nLauf 3')
    // /reflect zeigen springt wieder auf die neueste.
    expect(await befehl($, 'zeigen')).toContain('Lauf 6')
    expect((await ui.find({ type: 'Markdown' }))?.text).toBe('## Auftrag\nLauf 6')
    await ui.unmount()
  }
})

test('ein Neuladen mitten in einer Reflexion markiert sie als fehlgeschlagen; das spaete Ergebnis zaehlt nicht, eine neue laeuft', async ($, on) => {
  let langsam = true
  const w: Welt = welt(on, {
    fork: async () => {
      if (langsam) {
        langsam = false
        await w.clock.sleep(MIN)
      }
      return { isAnswered: true, text: REFLEXION, usage: USAGE }
    },
  })
  await start($)
  expect(await befehl($)).toBe(LAEUFT)
  await w.clock.settle()
  expect(w.forks).toHaveLength(1)
  expect(await befehl($)).toBe('Es läuft schon eine Reflexion. /reflect zeigen gibt sie aus, sobald sie fertig ist.')
  expect(w.forks).toHaveLength(1)
  expect(await befehl($, 'zeigen')).toMatch(/^Die Reflexion läuft noch \(seit \d\d:\d\d\)/)

  // Was ein Neuladen ausloest: session.start feuert noch einmal.
  await start($)
  for (const surface of FLAECHEN) {
    const ui = await fenster($, surface)
    expect(await ui.find({ type: 'Text', text: 'Fehlgeschlagen: Unterbrochen: Der Mod wurde neu geladen, während die Reflexion lief. /reflect startet sie neu.' })).toBeDefined()
    expect(await knoepfe(ui)).toEqual(['Schließen'])
    await ui.unmount()
  }
  expect(await befehl($, 'zeigen')).toContain('fehlgeschlagen. Unterbrochen: Der Mod wurde neu geladen')

  await w.clock.advance(MIN)
  expect(await befehl($, 'zeigen')).toContain('fehlgeschlagen. Unterbrochen')

  expect(await befehl($)).toBe(LAEUFT)
  await w.clock.settle()
  expect(await befehl($, 'zeigen')).toContain(REFLEXION)
})

test('eine Reflexion ohne Antwort nach zehn Minuten haelt /reflect nicht auf', async ($, on) => {
  let langsam = true
  const w: Welt = welt(on, {
    fork: async () => {
      if (langsam) {
        langsam = false
        await w.clock.sleep(20 * MIN)
      }
      return { isAnswered: true, text: REFLEXION, usage: USAGE }
    },
  })
  await start($)
  await befehl($)
  await w.clock.advance(11 * MIN)
  expect(await befehl($)).toBe(LAEUFT)
  await w.clock.settle()
  await w.clock.advance(10 * MIN)
  expect(await befehl($, 'zeigen')).toContain(REFLEXION)
  const ui = await fenster($, 'terminal')
  await ui.press({ key: 'aeltere' })
  expect(await ui.find({ type: 'Text', text: 'Fehlgeschlagen: Keine Antwort nach 10 Minuten. /reflect startet eine neue.' })).toBeDefined()
})

test('nichts zu gabeln und API-Fehler werden zu fehlgeschlagenen Reflexionen mit Grund', async ($, on) => {
  const antworten = [
    { isAnswered: false, reason: 'nothing-to-fork', usage: USAGE },
    { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE },
  ]
  const w = welt(on, { fork: () => antworten.shift() })
  await start($)
  await befehl($)
  await w.clock.settle()
  expect(await befehl($, 'zeigen')).toContain('fehlgeschlagen. Noch nichts zu prüfen: Der Chat hat noch keine Antwort.')
  await befehl($)
  await w.clock.settle()
  expect(await befehl($, 'zeigen')).toContain('fehlgeschlagen. Die Anfrage ist fehlgeschlagen (HTTP 529).')
})

const EDIT = { tool: 'Edit', file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' }
const READ = { tool: 'Read', file_path: '/repo/a.ts' }

async function runde($: Engine, w: Welt, id: string, aufrufe: object[]) {
  await $.turn.start({ text: 'mach', turnId: id } as never)
  for (const a of aufrufe) await $.tool.call(a as never)
  await $.turn.complete({ answer: 'Fertig.', durationMs: 1000, isAborted: false, turnId: id, reason: 'answer' } as never)
  await w.clock.settle()
}

test('automatische Selbstkritik: nur wenn im Chat an, nur nach Runden mit Dateiaenderungen', async ($, on) => {
  let sid = 'chat-a'
  const w = welt(on, { sid: () => sid })
  await start($)
  await runde($, w, 't1', [EDIT])
  expect(w.forks).toEqual([])
  expect(await befehl($, 'auto')).toContain('ist in diesem Chat aus')
  expect(await befehl($, 'auto an')).toContain('Automatische Selbstkritik ist in diesem Chat an')
  await runde($, w, 't2', [READ])
  expect(w.forks).toEqual([])
  await runde($, w, 't3', [READ, EDIT])
  expect(w.forks).toHaveLength(1)
  expect(w.opened).toEqual(['reflect'])
  for (const surface of FLAECHEN) {
    const ui = await fenster($, surface)
    expect(await kopf(ui)).toContain(' · automatisch')
    await ui.unmount()
  }
  sid = 'chat-b'
  await runde($, w, 't4', [EDIT])
  expect(w.forks).toHaveLength(1)
})

test('der Standard fuer die automatische Selbstkritik kommt aus den Optionen; /reflect auto aus gilt nur im Chat', { options: { selbstkritikAuto: true } }, async ($, on) => {
  let sid = 'chat-a'
  const w = welt(on, { sid: () => sid })
  await start($)
  await runde($, w, 't1', [EDIT])
  expect(w.forks).toHaveLength(1)
  expect(await befehl($, 'auto aus')).toContain('ist in diesem Chat aus')
  await runde($, w, 't2', [EDIT])
  expect(w.forks).toHaveLength(1)
  sid = 'chat-b'
  await runde($, w, 't3', [EDIT])
  expect(w.forks).toHaveLength(2)
})

test('/reflect hilfe nennt die Befehle; ein Fehler wird zu einem schlichten Satz', async ($, on) => {
  let kaputt = false
  welt(on, {
    sid: () => {
      if (kaputt) throw new Error('weg')
      return 'chat-a'
    },
  })
  await start($)
  const text = await befehl($, 'hilfe')
  for (const teil of ['/reflect [Schwerpunkt]', '/reflect zeigen', '/reflect regeln', '/reflect speichern <Nr> [global|projekt|chat]', '/reflect verwerfen <Nr>', '/reflect pruefung an|aus', '(jetzt an)', '/reflect auto an|aus', '(jetzt aus)', 'merke: <Regel>'])
    expect(text).toContain(teil)
  kaputt = true
  expect(await befehl($, 'pruefung aus')).toBe('Das hat nicht geklappt. Bitte noch einmal versuchen; /reflect hilfe zeigt die Befehle.')
})
