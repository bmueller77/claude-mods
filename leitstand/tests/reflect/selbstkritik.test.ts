/** Selbstkritik auf Abruf, mit gemockter Gabelung des Chats. */
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { REFLECT_BEFEHLE } from '../../hooks/reflect/befehle'
import { abschnitt, auftragAus, grund } from '../../hooks/reflect/logik'
import { FLAECHEN, PANE, REFLEXION, USAGE, befehl, fenster, start, welt } from './welt'
import type { Welt } from './welt'

const LAEUFT = 'Selbstkritik läuft … Das Ergebnis erscheint im Fenster „Selbstkritik“; /reflect zeigen gibt es als Text aus.'
const MIN = 60_000

async function knoepfe(ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) {
  return (await ui.findAll({ type: 'Button' })).map(b => String(b.props.label))
}

async function kopf(ui: { findAll: (q: { type: string; text: RegExp }) => Promise<{ text: string }[]> }) {
  return (await ui.findAll({ type: 'Text', text: /^Selbstkritik von / }))[0]?.text ?? ''
}

test('Abschnitte lesen, Auftrag bauen, Gründe benennen', () => {
  expect(abschnitt(REFLEXION, 'Könnte falsch sein oder fehlen')).toBe('- hooks/reflect/teil.tsx, speichere(): zwei Sitzungen können gleichzeitig dieselbe CLAUDE.md schreiben.')
  expect(abschnitt('## Als naechstes pruefen:\n1. x\n### Detail\nmehr\n## Ende', 'Als Nächstes prüfen')).toBe('1. x\n### Detail\nmehr')
  expect(abschnitt('## Auftrag\n\n## Erledigt\n- a', 'Auftrag')).toBeUndefined()
  const auftrag = auftragAus(REFLEXION)
  expect(auftrag).toContain('Geh die Punkte aus der Selbstkritik durch')
  expect(auftrag).toContain('## Könnte falsch sein oder fehlen\n- hooks/reflect/teil.tsx, speichere()')
  expect(auftrag).toContain('## Als Nächstes prüfen\n1. claude plugin test laufen lassen.')
  expect(auftrag).not.toContain('## Erledigt')
  expect(auftrag).not.toContain('## Riskante Annahmen')
  expect(auftragAus('Nur Fließtext ohne Abschnitte.')).toContain('Nur Fließtext ohne Abschnitte.')
  expect(grund({ reason: 'nothing-to-fork' })).toBe('Noch nichts zu prüfen: Der Chat hat noch keine Antwort.')
  expect(grund({ reason: 'api-error', status: 529 })).toBe('Die Anfrage ist fehlgeschlagen (HTTP 529).')
})

test('/reflect antwortet sofort, die Gabelung füllt das Fenster „Selbstkritik“, "Claude soll das beheben" füllt nur das Feld', async ($, on) => {
  const w = welt(on)
  await start($)
  expect(await befehl($, 'die Tests')).toBe(LAEUFT)
  expect(w.opened).toEqual([PANE])
  for (const surface of FLAECHEN) {
    const ui = await fenster($, surface)
    expect(await ui.find({ type: 'Text', text: /Selbstkritik läuft/ })).toBeDefined()
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
    expect(w.toasts.at(-1)).toBe('Selbstkritik kopiert.')
    await ui.unmount()
  }
  expect(w.filled).toHaveLength(2)
  // Abgeschickt wird nie etwas.
  expect(w.submitted).toEqual([])

  const text = await befehl($, 'zeigen')
  expect(text).toMatch(/^Selbstkritik von \d\d:\d\d · Schwerpunkt: die Tests\n\n/)
  expect(text).toContain(REFLEXION)
  expect(w.opened).toEqual([PANE, PANE])

  const ui = await fenster($, 'terminal')
  await ui.press({ key: 'schliessen' })
  expect(w.closed).toEqual([PANE])
})

test('"Claude soll das beheben" hängt an einen Entwurf an, statt ihn zu ersetzen', async ($, on) => {
  const w = welt(on, { box: 'mein Entwurf' })
  await start($)
  await befehl($)
  await w.clock.settle()
  const ui = await fenster($, 'desktop')
  await ui.press({ key: 'beheben' })
  expect(w.filled).toEqual([{ text: `\n\n${auftragAus(REFLEXION)}`, mode: 'append' }])
})

test('ohne Selbstkritik: Fenster und /reflect zeigen sagen, wie man eine startet', async ($, on) => {
  const w = welt(on)
  await start($)
  for (const surface of FLAECHEN) {
    const ui = await fenster($, surface)
    expect(await ui.find({ type: 'Text', text: 'Noch keine Selbstkritik. /leitstand:selbstkritik startet eine.' })).toBeDefined()
    expect(await knoepfe(ui)).toEqual(['Schließen'])
    await ui.unmount()
  }
  expect(await befehl($, 'zeigen')).toBe('Noch keine Selbstkritik. /reflect startet eine.')
  expect(w.opened).toEqual([PANE])
})

test('Ältere und Neuere blättern; höchstens fünf bleiben', async ($, on) => {
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

test('ein Neuladen mitten in einer Selbstkritik markiert sie als fehlgeschlagen; das späte Ergebnis zählt nicht, eine neue läuft', async ($, on) => {
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
  expect(await befehl($)).toBe('Es läuft schon eine Selbstkritik. /reflect zeigen gibt sie aus, sobald sie fertig ist.')
  expect(w.forks).toHaveLength(1)
  expect(await befehl($, 'zeigen')).toMatch(/^Die Selbstkritik läuft noch \(seit \d\d:\d\d\)/)

  // Was ein Neuladen auslöst: session.start feuert noch einmal.
  await start($)
  for (const surface of FLAECHEN) {
    const ui = await fenster($, surface)
    expect(
      await ui.find({ type: 'Text', text: 'Fehlgeschlagen: Unterbrochen: Der Leitstand wurde neu geladen, während die Selbstkritik lief. /leitstand:selbstkritik startet sie neu.' }),
    ).toBeDefined()
    expect(await knoepfe(ui)).toEqual(['Schließen'])
    await ui.unmount()
  }
  expect(await befehl($, 'zeigen')).toContain('fehlgeschlagen. Unterbrochen: Der Leitstand wurde neu geladen')

  await w.clock.advance(MIN)
  expect(await befehl($, 'zeigen')).toContain('fehlgeschlagen. Unterbrochen')

  expect(await befehl($)).toBe(LAEUFT)
  await w.clock.settle()
  expect(await befehl($, 'zeigen')).toContain(REFLEXION)
})

test('eine Selbstkritik ohne Antwort nach zehn Minuten hält /reflect nicht auf', async ($, on) => {
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
  expect(await ui.find({ type: 'Text', text: 'Fehlgeschlagen: Keine Antwort nach 10 Minuten. /leitstand:selbstkritik startet eine neue.' })).toBeDefined()
})

test('nichts zu gabeln und API-Fehler werden zu fehlgeschlagenen Selbstkritiken mit Grund', async ($, on) => {
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
const PLAN = { tool: 'mcp__leitstand__plan_steps', steps: ['Datei ändern', 'Ergebnis prüfen'] }

/** Eine Runde des Hauptchats. Ohne Plan lehnt der Leitstand jedes Edit ab; dann ist auch nichts geändert. */
async function runde($: Engine, w: Welt, id: string, aufrufe: object[]) {
  await $.turn.start({ text: 'mach', turnId: id } as never)
  await $.tool.call(PLAN as never)
  for (const a of aufrufe) await $.tool.call(a as never)
  await $.turn.complete({ answer: 'Fertig.', durationMs: 1000, isAborted: false, turnId: id, reason: 'answer' } as never)
  await w.clock.settle()
}

test('automatische Selbstkritik: nur wenn im Chat an, nur nach Runden mit Dateiänderungen', async ($, on) => {
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
  expect(w.opened).toEqual([PANE])
  for (const surface of FLAECHEN) {
    const ui = await fenster($, surface)
    expect(await kopf(ui)).toContain(' · automatisch')
    await ui.unmount()
  }
  sid = 'chat-b'
  await runde($, w, 't4', [EDIT])
  expect(w.forks).toHaveLength(1)
})

test('der Standard für die automatische Selbstkritik kommt aus dem Einstellungsmenü; /reflect auto aus gilt nur im Chat', { options: { selbstkritikAuto: true } }, async ($, on) => {
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

test('/reflect hilfe nennt die neuen Namen und wie es im Chat steht; ein Fehler wird zu einem schlichten Satz', async ($, on) => {
  let kaputt = false
  welt(on, {
    sid: () => {
      if (kaputt) throw new Error('weg')
      return 'chat-a'
    },
  })
  await start($)
  const text = await befehl($, 'hilfe')
  for (const b of REFLECT_BEFEHLE) expect(text).toContain(`/${b.name.slice('leitstand:'.length)}${b.argumentHint ? ` ${b.argumentHint}` : ''} · ${b.description}`)
  for (const teil of ['zeigen, regeln, speichern <Nr> [global|projekt|chat], verwerfen <Nr>, pruefung an|aus und auto an|aus', 'Korrekturen prüfen ist an', 'Selbstkritik nach Dateiänderungen ist aus', 'merke: <Regel>', '/leitstand:hilfe unter Einstellen'])
    expect(text).toContain(teil)
  kaputt = true
  expect(await befehl($, 'pruefung aus')).toBe('Das hat nicht geklappt: Im Leitstand ging beim Ausführen etwas schief. Versuch es gleich noch einmal; /leitstand:hilfe zeigt alle Befehle.')
  expect(text).not.toMatch(/Einstellungsmenü|gehören jetzt|früher/)
})
