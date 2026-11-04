/**
 * Regeln: Steht eine Regel schon als Projektregel in einem anderen Projekt, schlägt der Leitstand Alle Projekte vor.
 */
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { ordnerName } from '../../hooks/reflect/logik'
import { FLAECHEN, REGEL_KNOPF, druecke, regelfenster, run, say, start, welt, zeilen } from './welt'

const PNPM = { is_rule: true, rule: 'Nutze pnpm statt npm in diesem Repo', scope: 'project', confidence: 0.92 }
const NOCHMAL = { ...PNPM, rule: 'nutze pnpm statt npm in diesem repo' }
const HINWEIS = /^Steht schon als Regel im Projekt /

/** Die hellen Knöpfe und die blassen Hinweise des Fensters Regeln, auf beiden Oberflächen gleich. */
async function fenster($: Engine) {
  const je: { hell: string[]; hinweise: string[] }[] = []
  for (const surface of FLAECHEN) {
    const ui = await regelfenster($, surface)
    const hell = (await ui.findAll({ type: 'Button' }))
      .filter(b => REGEL_KNOPF.test(b.key ?? '') && b.props.variant === 'primary')
      .map(b => String(b.props.label))
    const hinweise = (await ui.findAll({ type: 'Text', text: HINWEIS })).map(t => t.text)
    for (const t of await ui.findAll({ type: 'Text', text: HINWEIS })) expect(t.props.dimColor).toBe(true)
    je.push({ hell, hinweise })
    await ui.unmount()
  }
  expect(je[1]).toEqual(je[0])
  return je[0] ?? { hell: [], hinweise: [] }
}

test('Ordnername: letzter Pfadteil, mit Windows- und Unix-Trennern', () => {
  expect(ordnerName('D:\\proj\\alpha')).toBe('alpha')
  expect(ordnerName('/work/alpha/')).toBe('alpha')
  expect(ordnerName('C:/x\\beta')).toBe('beta')
})

test('eine in Projekt A gespeicherte Projektregel, in Projekt B wieder gefunden: Vorschlag Alle Projekte mit Hinweis', async ($, on) => {
  let root = 'D:\\proj\\alpha'
  const w = welt(on, { verdicts: { 'nein, nimm pnpm': PNPM, 'ich sagte pnpm': NOCHMAL }, root: () => root })
  await start($)
  await say($, w, 'nein, nimm pnpm')
  await druecke($, 'projekt:')
  const inA = w.files['/proj/alpha/CLAUDE.md']
  expect(inA).toContain('- Nutze pnpm statt npm in diesem Repo')
  root = '/work/beta'
  await say($, w, 'ich sagte pnpm')
  expect(await zeilen($)).toEqual(['💡 „nutze pnpm statt npm in diesem repo“'])
  expect(await fenster($)).toEqual({
    hell: ['Alle Projekte'],
    hinweise: ['Steht schon als Regel im Projekt alpha, deshalb Vorschlag: Alle Projekte.'],
  })
  expect(await run($, 'leitstand:regeln')).toContain(
    '1. „nutze pnpm statt npm in diesem repo“ · Vorschlag: Alle Projekte (steht schon im Projekt alpha)',
  )
  // Nur ein Vorschlag: die CLAUDE.md von Projekt A bleibt unverändert.
  await druecke($, 'global:')
  expect(w.files['/home/u/.claude/CLAUDE.md']).toContain('- nutze pnpm statt npm in diesem repo')
  expect(w.files['/proj/alpha/CLAUDE.md']).toBe(inA)
})

test('eine im selben Projekt gespeicherte Projektregel zählt wie bisher als Wiederholung, ohne Hinweis', async ($, on) => {
  const w = welt(on, { verdicts: { 'nein, nimm pnpm': PNPM, 'ich sagte pnpm': NOCHMAL } })
  await start($)
  await say($, w, 'nein, nimm pnpm')
  await druecke($, 'projekt:')
  await say($, w, 'ich sagte pnpm')
  expect(await zeilen($)).toEqual([])
  expect(await fenster($)).toEqual({ hell: [], hinweise: [] })
  expect(await run($, 'leitstand:regeln')).toBe('Keine wartenden Regeln.')
})

test('eine in Projekt A verworfene Projektregel macht in Projekt B keinen Vorschlag Alle Projekte', async ($, on) => {
  let root = '/work/alpha'
  const w = welt(on, { verdicts: { 'nein, nimm pnpm': PNPM, 'ich sagte pnpm': NOCHMAL }, root: () => root })
  await start($)
  await say($, w, 'nein, nimm pnpm')
  await druecke($, 'verwerfen:')
  root = '/work/beta'
  await say($, w, 'ich sagte pnpm')
  expect(await zeilen($)).toEqual(['💡 „nutze pnpm statt npm in diesem repo“'])
  expect(await fenster($)).toEqual({ hell: ['Dieses Projekt'], hinweise: [] })
  const liste = await run($, 'leitstand:regeln')
  expect(liste).toContain('· Vorschlag: Dieses Projekt')
  expect(liste).not.toContain('steht schon')
})
