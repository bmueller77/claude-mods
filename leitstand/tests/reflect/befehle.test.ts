/**
 * Die Befehle von Selbstkritik und Regeln: /leitstand:… und ihre Kurzformen, je mit Hilfe und derselben Wirkung wie
 * der Knopf; die alten Namen nennen den neuen; jede Antwort trägt in ihrer Zeile „(gemeldet vom Mod Leitstand)“.
 */
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { LEITSTAND_BEFEHLE, befehlsHilfe, kurzform } from '../../hooks/logic'
import { REFLECT_ALTE, REFLECT_BEFEHLE } from '../../hooks/reflect/befehle'
import { auftragAus } from '../../hooks/reflect/logik'
import { BEFEHL_FEHLER } from '../../hooks/reflect/teil'
import { PANE, REFLEXION, abschnittText, befehl, run, say, start, welt, zeilen } from './welt'
import type { Welt } from './welt'

const SELBSTKRITIK = [
  'leitstand:selbstkritik',
  'leitstand:selbstkritik-zeigen',
  'leitstand:selbstkritik-beheben',
  'leitstand:selbstkritik-kopieren',
  'leitstand:selbstkritik-auto-an',
  'leitstand:selbstkritik-auto-aus',
]
const REGELN = [
  'leitstand:regeln',
  'leitstand:regel-global',
  'leitstand:regel-projekt',
  'leitstand:regel-chat',
  'leitstand:regel-bearbeiten',
  'leitstand:regel-verwerfen',
  'leitstand:regelpruefung-an',
  'leitstand:regelpruefung-aus',
]
const NAMEN = [...SELBSTKRITIK, ...REGELN]
const MIT_NR = ['leitstand:regel-global', 'leitstand:regel-projekt', 'leitstand:regel-chat', 'leitstand:regel-bearbeiten', 'leitstand:regel-verwerfen']

const REGEL = 'Immer pnpm statt npm nutzen'
const LAEUFT = 'Selbstkritik läuft … Das Ergebnis erscheint im Fenster „Selbstkritik“; /leitstand:selbstkritik-zeigen gibt es als Text aus.'

/** Eine wartende Regel, per "merke:" ohne Modellaufruf. */
async function mitRegel($: Engine, w: Welt) {
  await say($, w, `merke: ${REGEL}`)
  expect(await zeilen($)).toEqual([`💡 „${REGEL}“`])
}

test('genau diese Befehle, in zwei Gruppen hinter den Helfern; der Leitstand meldet die Kurzformen an, der Teil /reflect', async ($, on) => {
  const w = welt(on)
  await start($)
  expect(REFLECT_BEFEHLE.map(b => b.name)).toEqual(NAMEN)
  expect(REFLECT_BEFEHLE.map(b => b.gruppe)).toEqual([...SELBSTKRITIK.map(() => 'Selbstkritik'), ...REGELN.map(() => 'Regeln')])
  const erster = LEITSTAND_BEFEHLE.findIndex(b => b.name === 'leitstand:selbstkritik')
  expect(LEITSTAND_BEFEHLE[erster - 1]?.gruppe).toBe('Helfer')
  expect(LEITSTAND_BEFEHLE.slice(erster, erster + NAMEN.length).map(b => b.name)).toEqual(NAMEN)
  for (const b of REFLECT_BEFEHLE) {
    expect(b.description.length).toBeGreaterThan(10)
    expect(b.beispiel.startsWith(`/${b.name}`)).toBe(true)
    // Die Langform ist eine Datei in commands/: Einen Namen mit Doppelpunkt nimmt $.command.register nicht.
    expect(w.angemeldet.find(s => s.name === b.name)).toBeUndefined()
    const kurz = kurzform(b.name)
    expect(kurz).toBe(b.name.slice('leitstand:'.length))
    const spec = w.angemeldet.find(s => s.name === kurz)
    expect(spec?.description).toBe(`${b.description} (Leitstand)`)
    expect(spec?.argumentHint).toBe(b.argumentHint)
    expect(spec?.immediate).toBe(true)
  }
  for (const name of MIT_NR) expect(REFLECT_BEFEHLE.find(b => b.name === name)?.argumentHint).toBe('<Nr>')
  expect(REFLECT_BEFEHLE.find(b => b.name === 'leitstand:selbstkritik')?.argumentHint).toBe('[Schwerpunkt]')
  expect(REFLECT_BEFEHLE.find(b => b.name === 'leitstand:selbstkritik')?.knopf).toBe('🪞 im Leitstand')
  // Der Grundbefehl bleibt; die alten Namen mit Bindestrich und mit reflect: sind nicht angemeldet.
  expect(w.angemeldet.find(s => s.name === 'reflect')?.immediate).toBe(true)
  expect(w.angemeldet.filter(s => s.name.startsWith('reflect'))).toHaveLength(1)
})

test('ein alter Name wie /reflect-zeigen sagt nur, wie der Befehl jetzt heißt', async ($, on) => {
  const w = welt(on)
  await start($)
  await mitRegel($, w)
  expect(Object.keys(REFLECT_ALTE)).toHaveLength(15)
  for (const [alt, neu] of Object.entries(REFLECT_ALTE)) {
    expect(LEITSTAND_BEFEHLE.some(b => b.name === neu)).toBe(true)
    const kurz = kurzform(neu)
    for (const arg of ['', '1', 'hilfe']) expect(await run($, alt, arg)).toBe(`Der Befehl heißt jetzt /${neu}${kurz === undefined ? '' : `, kurz /${kurz}`}.`)
  }
  expect(await run($, 'reflect-starten')).toBe('Der Befehl heißt jetzt /leitstand:selbstkritik, kurz /selbstkritik.')
  expect(await run($, 'reflect-hilfe')).toBe('Der Befehl heißt jetzt /leitstand:hilfe.')
  expect(w.opened).toEqual([])
  expect(w.forks).toEqual([])
  expect(w.filled).toEqual([])
  expect(w.copied).toEqual([])
  expect(Object.keys(w.files)).toEqual([])
  expect(await zeilen($)).toEqual([`💡 „${REGEL}“`])
})

test('jeder Befehl erklärt sich mit hilfe und mit ?, lang und kurz, ohne etwas zu tun', async ($, on) => {
  const w = welt(on)
  await start($)
  await mitRegel($, w)
  for (const b of REFLECT_BEFEHLE) {
    for (const name of [b.name, kurzform(b.name) ?? '']) {
      for (const arg of ['hilfe', '?', 'HILFE', ' Hilfe ']) {
        const text = await run($, name, arg)
        expect(text).toBe(befehlsHilfe(b))
        for (const teil of ['Was:', 'Knopf:', 'Gilt:', 'Argumente:', 'Beispiel: /leitstand:', `Kurzform: /${kurzform(b.name)}`]) expect(text).toContain(teil)
      }
    }
  }
  expect(w.opened).toEqual([])
  expect(w.forks).toEqual([])
  expect(w.filled).toEqual([])
  expect(await zeilen($)).toEqual([`💡 „${REGEL}“`])
})

test('/leitstand:hilfe listet die Gruppen Selbstkritik und Regeln mit ihren Befehlen', async ($, on) => {
  welt(on)
  await start($)
  const zeilenDerHilfe = (await run($, 'leitstand:hilfe')).split('\n')
  for (const gruppe of ['Selbstkritik', 'Regeln']) expect(zeilenDerHilfe).toContain(gruppe)
  for (const b of REFLECT_BEFEHLE) expect(zeilenDerHilfe).toContain(`/${b.name}${b.argumentHint ? ` ${b.argumentHint}` : ''}: ${b.description}`)
})

test('selbstkritik und selbstkritik-zeigen: Text sofort, Fenster dahinter; vom Handy nur Text', async ($, on) => {
  const w = welt(on)
  await start($)
  expect(await run($, 'leitstand:selbstkritik-zeigen')).toBe('Noch keine Selbstkritik. /leitstand:selbstkritik startet eine.')
  expect(await run($, 'leitstand:selbstkritik', 'die Tests')).toBe(LAEUFT)
  expect(w.opened).toEqual([PANE, PANE])
  await w.clock.settle()
  expect(w.forks[0]).toContain('Schwerpunkt der Prüfung: die Tests')
  const text = await run($, 'selbstkritik-zeigen')
  expect(text).toMatch(/^Selbstkritik von \d\d:\d\d · Schwerpunkt: die Tests\n\n/)
  expect(text).toContain(REFLEXION)
  expect(w.opened).toHaveLength(3)

  // Vom Handy: kein Fenster, das Ergebnis als Text; die Kurzform genauso.
  expect(await run($, 'selbstkritik', '', 'bridge')).toBe('Selbstkritik läuft … Das Fenster geht nur am Rechner; /leitstand:selbstkritik-zeigen gibt das Ergebnis hier als Text aus.')
  expect(await run($, 'leitstand:selbstkritik', '', 'bridge')).toBe('Es läuft schon eine Selbstkritik. /leitstand:selbstkritik-zeigen gibt sie aus, sobald sie fertig ist.')
  await w.clock.settle()
  expect(await run($, 'leitstand:selbstkritik-zeigen', '', 'bridge')).toContain(REFLEXION)
  expect(w.opened).toHaveLength(3)
  expect(w.forks).toHaveLength(2)
})

test('der Knopf 🪞: $.command.run({ command: "selbstkritik" }) aus dem Leitstand startet die Selbstkritik und öffnet das Fenster', async ($, on) => {
  const w = welt(on)
  await start($)
  const r = await $.command.run({ command: 'selbstkritik', args: '', origin: { kind: 'plugin', name: 'leitstand' } } as never)
  expect(r.text).toBe(LAEUFT)
  expect(w.opened).toEqual([PANE])
  await w.clock.settle()
  expect(w.forks).toHaveLength(1)
  expect(await run($, 'selbstkritik-zeigen')).toContain(REFLEXION)
})

test('regeln, regel-global: wie „Alle Projekte“ im Band', async ($, on) => {
  const w = welt(on)
  await start($)
  await mitRegel($, w)
  const liste = await run($, 'leitstand:regeln')
  expect(liste).toContain(`1. „${REGEL}“ · Vorschlag: Alle Projekte`)
  expect(liste).toContain('Speichern: /leitstand:regel-global, /leitstand:regel-projekt oder /leitstand:regel-chat mit der Nummer.')
  expect(await run($, 'leitstand:regel-global', '1')).toBe(`Gespeichert in /home/u/.claude/CLAUDE.md: „${REGEL}“`)
  expect(w.files['/home/u/.claude/CLAUDE.md']).toContain(`- ${REGEL}`)
  expect(await zeilen($)).toEqual([])
  expect(await run($, 'regeln')).toBe('Keine wartenden Regeln.')
})

test('regel-projekt: wie „Dieses Projekt“ im Band', async ($, on) => {
  const w = welt(on)
  await start($)
  await mitRegel($, w)
  expect(await run($, 'regel-projekt', '1')).toContain('Gespeichert in /repo/CLAUDE.md')
  expect(w.files['/repo/CLAUDE.md']).toContain(`- ${REGEL}`)
})

test('regel-chat: wie „Nur dieser Chat“ im Band, nur in diesem Chat', async ($, on) => {
  let sid = 'chat-a'
  const w = welt(on, { sid: () => sid })
  await start($)
  await mitRegel($, w)
  expect(await run($, 'leitstand:regel-chat', '1')).toBe(`Gilt jetzt nur in diesem Chat: „${REGEL}“`)
  expect(await abschnittText($, 'leitstand:regeln-chat')).toContain(REGEL)
  expect(Object.keys(w.files)).toEqual([])
  sid = 'chat-b'
  expect(await abschnittText($, 'leitstand:regeln-chat')).toBeUndefined()
})

test('regel-bearbeiten: wie „Bearbeiten“ im Band', async ($, on) => {
  const w = welt(on)
  await start($)
  await mitRegel($, w)
  expect(await run($, 'leitstand:regel-bearbeiten', '1')).toBe(`Die Regel steht als „merke: ${REGEL}“ im Eingabefeld. Umformulieren und abschicken; die alte ist verworfen.`)
  expect(w.filled.map(f => f.text)).toEqual([`merke: ${REGEL}`])
  expect(await zeilen($)).toEqual([])
})

test('regel-bearbeiten mit Text im Eingabefeld ändert nichts', async ($, on) => {
  const w = welt(on, { box: 'mein Entwurf' })
  await start($)
  await mitRegel($, w)
  expect(await run($, 'regel-bearbeiten', '1')).toBe('Erst das Eingabefeld leeren – „Bearbeiten“ legt die Regel dort hinein.')
  expect(w.filled).toEqual([])
  expect(await zeilen($)).toEqual([`💡 „${REGEL}“`])
})

test('regel-verwerfen: wie „Verwerfen“ im Band; ohne oder mit falscher Nummer ein Satz', async ($, on) => {
  const w = welt(on)
  await start($)
  await mitRegel($, w)
  expect(await run($, 'leitstand:regel-verwerfen')).toBe('Welche Regel? /leitstand:regeln zeigt die Nummern.')
  expect(await run($, 'leitstand:regel-global', '7')).toBe('Es gibt keine Regel 7. /leitstand:regeln zeigt die aktuelle Liste.')
  expect(await run($, 'regel-verwerfen', '1')).toBe(`Verworfen: „${REGEL}“`)
  expect(await run($, 'regel-verwerfen', '1')).toBe('Es gibt keine Regel 1. /leitstand:regeln zeigt die aktuelle Liste.')
  expect(await zeilen($)).toEqual([])
  expect(Object.keys(w.files)).toEqual([])
})

test('selbstkritik-beheben und -kopieren: wie die Knöpfe im Fenster, mit der neuesten fertigen Selbstkritik', async ($, on) => {
  const w = welt(on)
  await start($)
  expect(await run($, 'leitstand:selbstkritik-beheben')).toBe('Noch keine fertige Selbstkritik. /leitstand:selbstkritik startet eine.')
  expect(await run($, 'leitstand:selbstkritik-kopieren')).toBe('Noch keine fertige Selbstkritik. /leitstand:selbstkritik startet eine.')
  await run($, 'leitstand:selbstkritik')
  await w.clock.settle()
  expect(await run($, 'selbstkritik-beheben')).toBe('Der Auftrag steht im Eingabefeld. Prüfen, dann abschicken.')
  expect(w.filled).toEqual([{ text: auftragAus(REFLEXION), mode: 'replace' }])
  expect(w.submitted).toEqual([])
  expect(await run($, 'selbstkritik-kopieren')).toBe('Selbstkritik kopiert.')
  expect(w.copied.at(-1)).toContain(REFLEXION)
  // Vom Handy: der Text zum Kopieren statt der Zwischenablage am Rechner.
  const handy = await run($, 'leitstand:selbstkritik-kopieren', '', 'bridge')
  expect(handy).toContain('Kopieren geht nur am Rechner.')
  expect(handy).toContain(REFLEXION)
  expect(w.copied).toHaveLength(1)
})

test('regelpruefung-an und -aus: nur in diesem Chat', async ($, on) => {
  let sid = 'chat-a'
  const w = welt(on, { sid: () => sid })
  await start($)
  expect(await run($, 'leitstand:regelpruefung-aus')).toContain('Korrekturen prüfen ist in diesem Chat aus')
  await say($, w, 'nein, nimm pnpm')
  expect(w.asked).toEqual([])
  sid = 'chat-b'
  await say($, w, 'nein, nimm pnpm')
  expect(w.asked).toHaveLength(1)
  sid = 'chat-a'
  expect(await run($, 'regelpruefung-an')).toContain('Korrekturen prüfen ist in diesem Chat an')
  await say($, w, 'nein, nimm yarn')
  expect(w.asked).toHaveLength(2)
})

test('selbstkritik-auto-an und -aus: nur in diesem Chat', async ($, on) => {
  let sid = 'chat-a'
  const w = welt(on, { sid: () => sid })
  await start($)
  const runde = async (id: string) => {
    await $.turn.start({ text: 'mach', turnId: id } as never)
    // Ohne Plan lehnt der Leitstand jedes Edit ab; dann ist auch nichts geändert.
    await $.tool.call({ tool: 'mcp__leitstand__plan_steps', steps: ['Datei ändern', 'Ergebnis prüfen'] } as never)
    await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' } as never)
    await $.turn.complete({ answer: 'Fertig.', durationMs: 1000, isAborted: false, turnId: id, reason: 'answer' } as never)
    await w.clock.settle()
  }
  expect(await run($, 'leitstand:selbstkritik-auto-an')).toContain('Automatische Selbstkritik ist in diesem Chat an')
  await runde('t1')
  expect(w.forks).toHaveLength(1)
  sid = 'chat-b'
  await runde('t2')
  expect(w.forks).toHaveLength(1)
  sid = 'chat-a'
  expect(await run($, 'selbstkritik-auto-aus')).toBe('Automatische Selbstkritik ist in diesem Chat aus. /leitstand:selbstkritik startet eine von Hand.')
  await runde('t3')
  expect(w.forks).toHaveLength(1)
})

test('ein Fehler wird zu einem schlichten Satz', async ($, on) => {
  let kaputt = false
  welt(on, {
    sid: () => {
      if (kaputt) throw new Error('weg')
      return 'chat-a'
    },
  })
  await start($)
  kaputt = true
  for (const name of ['leitstand:regelpruefung-an', 'regelpruefung-aus', 'leitstand:selbstkritik-auto-an', 'selbstkritik-auto-aus', 'leitstand:regeln'])
    expect(await run($, name, '1')).toBe(BEFEHL_FEHLER)
})

/** Hebt die Zeile, die die Engine für eine Befehlsantwort speichert, mit dem Vorsatz der App davor. */
async function append($: Engine, text: string) {
  await $.session.append({
    message: { type: 'system', name: 'local_command', content: [{ type: 'text', text: `<local-command-stdout>leitstand: ${text}</local-command-stdout>` }] },
    door: 'command',
    origin: { kind: 'engine' },
    uuid: `befehl-${text.length}-${Math.random()}`,
  } as never)
}

test('die Antworten der neuen Befehle und von /reflect tragen in ihrer Zeile „(gemeldet vom Mod Leitstand)“ statt des Vorsatzes', async ($, on) => {
  const w = welt(on)
  const sitzung = mock.session(on)
  await start($)
  await mitRegel($, w)
  const zeilenDerSitzung = () =>
    sitzung.appended().map(z => {
      const b = z.message.content[0]
      return typeof b?.text === 'string' ? b.text : ''
    })

  const kurz = await run($, 'regel-verwerfen', '1')
  expect(kurz).toBe(`Verworfen: „${REGEL}“`)
  await append($, kurz)
  expect(zeilenDerSitzung().at(-1)).toBe(`<local-command-stdout>${kurz} (gemeldet vom Mod Leitstand)</local-command-stdout>`)

  // Mehrzeilig (die Hilfe): der Zusatz in einer eigenen Zeile.
  const hilfe = await run($, 'leitstand:selbstkritik', 'hilfe')
  await append($, hilfe)
  expect(zeilenDerSitzung().at(-1)).toBe(`<local-command-stdout>${hilfe}\n(gemeldet vom Mod Leitstand)</local-command-stdout>`)

  const reflect = await befehl($, 'regeln')
  expect(reflect).toBe('Keine wartenden Regeln.')
  await append($, reflect)
  expect(zeilenDerSitzung().at(-1)).toBe(`<local-command-stdout>${reflect} (gemeldet vom Mod Leitstand)</local-command-stdout>`)
})
