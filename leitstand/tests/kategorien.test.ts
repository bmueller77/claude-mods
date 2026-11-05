import { expect, test } from 'claude-code/testing'

import {
  BESCHREIBUNG_MAX,
  EIGENE,
  MAX_EINTRAEGE,
  WEITERE,
  ZURUECK,
  ZURUECK_TEXT,
  ausModellAntwort,
  haikuPrompt,
  kategorienHash,
  kategorienText,
  lesbar,
  leseWahl,
  menueStufe,
  nachPlugin,
  pruefeGespeichert,
} from '../hooks/skills/kategorien'
import type { SkillMenue } from '../hooks/skills/kategorien'

// Die Kategorien des Skill-Menüs, ohne Engine: nach Plugin, aus Haikus Antwort, die Stufen des Aufklappmenüs.

const PUZZLE = '\u{1F9E9}'

/** Jeder Skill genau einmal (oder weggelassen), höchstens 12 Kategorien zu je höchstens 12, Namen eindeutig. */
function pruefeGrenzen(menue: SkillMenue, namen: readonly string[]) {
  const alle = [...menue.kategorien.flatMap(kategorie => kategorie.skills), ...menue.weggelassen]
  expect(alle.length).toBe(new Set(alle).size)
  expect([...alle].sort()).toEqual([...new Set(namen)].sort())
  expect(menue.kategorien.length).toBeLessThanOrEqual(MAX_EINTRAEGE)
  for (const kategorie of menue.kategorien) {
    expect(kategorie.skills.length).toBeGreaterThan(0)
    expect(kategorie.skills.length).toBeLessThanOrEqual(MAX_EINTRAEGE)
    expect([...kategorie.skills]).toEqual([...kategorie.skills].sort((a, b) => a.localeCompare(b, 'de')))
  }
  const namenDerKategorien = menue.kategorien.map(kategorie => kategorie.name.toLowerCase())
  expect(namenDerKategorien.length).toBe(new Set(namenDerKategorien).size)
}

const reihe = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(3, '0')}`)

test('lesbar macht aus dem Plugin einen Namen', () => {
  expect(lesbar('anthropic-skills')).toBe('Anthropic')
  expect(lesbar('engineering')).toBe('Engineering')
  expect(lesbar('pdf-viewer')).toBe('Pdf Viewer')
  expect(lesbar('skills')).toBe('Skills')
})

test('nachPlugin gruppiert nach dem Teil vor dem Doppelpunkt, Namen ohne kommen in Eigene, sortiert', () => {
  const namen = ['sorgfalt:debuggen', 'anthropic-skills:grill-me', 'engineering:review', 'engineering:debug', 'solo', 'sorgfalt:belegen']
  const menue = nachPlugin(namen)
  expect(menue).toEqual({
    kategorien: [
      { name: 'Anthropic', skills: ['anthropic-skills:grill-me'] },
      { name: EIGENE, skills: ['solo'] },
      { name: 'Engineering', skills: ['engineering:debug', 'engineering:review'] },
      { name: 'Sorgfalt', skills: ['sorgfalt:belegen', 'sorgfalt:debuggen'] },
    ],
    weggelassen: [],
  })
  expect(nachPlugin([])).toEqual({ kategorien: [], weggelassen: [] })
})

test('nachPlugin teilt große Gruppen: Engineering 1, Engineering 2, Engineering 3', () => {
  const namen = reihe('engineering:s', 30)
  const menue = nachPlugin(namen)
  expect(menue.kategorien.map(kategorie => [kategorie.name, kategorie.skills.length])).toEqual([
    ['Engineering 1', 10],
    ['Engineering 2', 10],
    ['Engineering 3', 10],
  ])
  pruefeGrenzen(menue, namen)
})

test('mehr als 12 Gruppen: kleine Gruppen (höchstens 2 Skills) kommen in Weitere, am Ende', () => {
  const kleine = Array.from({ length: 15 }, (_, i) => `p${String(i).padStart(2, '0')}:einzeln`)
  const namen = [...kleine, ...reihe('engineering:s', 5), 'zwei:a', 'zwei:b', ...reihe('design:d', 3)]
  const menue = nachPlugin(namen)
  expect(menue.kategorien.map(kategorie => kategorie.name)).toEqual(['Design', 'Engineering', `${WEITERE} 1`, `${WEITERE} 2`])
  expect(menue.kategorien.slice(2).flatMap(kategorie => kategorie.skills).sort()).toEqual([...kleine, 'zwei:a', 'zwei:b'].sort())
  pruefeGrenzen(menue, namen)
})

test('notfalls kommen auch größere Gruppen in Weitere, bis höchstens 12 bleiben', () => {
  const namen = Array.from({ length: 14 }, (_, i) => reihe(`g${String.fromCharCode(97 + i)}:s`, 3)).flat()
  const menue = nachPlugin(namen)
  expect(menue.kategorien.length).toBeLessThanOrEqual(12)
  expect(menue.kategorien.at(-1)?.name).toBe(WEITERE)
  pruefeGrenzen(menue, namen)
})

test('150 Skills: höchstens 144 im Menü, der Rest wird zurückgemeldet', () => {
  for (const namen of [reihe('engineering:s', 150), Array.from({ length: 150 }, (_, i) => `p${i % 20}:skill-${i}`), reihe('ohne-', 150)]) {
    const menue = nachPlugin(namen)
    expect(menue.kategorien.flatMap(kategorie => kategorie.skills)).toHaveLength(144)
    expect(menue.weggelassen).toHaveLength(6)
    pruefeGrenzen(menue, namen)
  }
})

test('nachPlugin hält die Grenzen für viele Mischungen ein', () => {
  for (let plugins = 1; plugins <= 30; plugins += 3) {
    for (const je of [1, 2, 3, 5, 13]) {
      const namen = Array.from({ length: plugins * je }, (_, i) => (i % 7 === 0 ? `eigen-${i}` : `plugin-${i % plugins}:s${i}`))
      pruefeGrenzen(nachPlugin(namen), namen)
    }
  }
})

const NAMEN = ['engineering:debug', 'engineering:review', 'pdf', 'design:critique', 'docx', 'grill-me']

test('ausModellAntwort liest JSON auch aus einem ```json-Block, verwirft Unbekanntes, Fehlendes kommt in Weitere', () => {
  const text = [
    'Hier die Kategorien:',
    '```json',
    JSON.stringify({ 'Code prüfen': ['engineering:review', '/engineering:debug', 'gibt-es-nicht'], Dokumente: ['pdf', 'docx', 'pdf'], Leer: ['unbekannt'] }),
    '```',
  ].join('\n')
  expect(ausModellAntwort(text, NAMEN)).toEqual({
    kategorien: [
      { name: 'Code prüfen', skills: ['engineering:debug', 'engineering:review'] },
      { name: 'Dokumente', skills: ['docx', 'pdf'] },
      { name: WEITERE, skills: ['design:critique', 'grill-me'] },
    ],
    weggelassen: [],
  })
  // Ohne Block: vom ersten { bis zum letzten }; ein Skill zählt dort, wo er zuerst steht; "Weitere" des Modells geht in Weitere.
  const roh = `Gern: ${JSON.stringify({ Planen: ['grill-me', 'pdf'], Dokumente: ['pdf', 'docx'], weitere: ['design:critique'] })} Fertig.`
  const menue = ausModellAntwort(roh, NAMEN)
  expect(menue?.kategorien).toEqual([
    { name: 'Dokumente', skills: ['docx'] },
    { name: 'Planen', skills: ['grill-me', 'pdf'] },
    { name: WEITERE, skills: ['design:critique', 'engineering:debug', 'engineering:review'] },
  ])
})

test('ausModellAntwort teilt zu große Kategorien und hält dieselben Grenzen', () => {
  const namen = reihe('s', 100)
  const zuViel = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`Kategorie ${String.fromCharCode(65 + i)}`, namen.slice(i * 5, i * 5 + 5)]))
  const menue = ausModellAntwort(JSON.stringify(zuViel), namen)
  expect(menue).not.toBeNull()
  pruefeGrenzen(menue!, namen)
  const gross = ausModellAntwort(JSON.stringify({ Alles: namen.slice(0, 30) }), namen.slice(0, 30))
  expect(gross?.kategorien.map(kategorie => kategorie.name)).toEqual(['Alles 1', 'Alles 2', 'Alles 3'])
})

test('ausModellAntwort ist null bei ungültiger Antwort', () => {
  expect(ausModellAntwort('Das kann ich nicht.', NAMEN)).toBeNull()
  expect(ausModellAntwort('{ kaputt', NAMEN)).toBeNull()
  expect(ausModellAntwort('["pdf"]', NAMEN)).toBeNull()
  expect(ausModellAntwort(JSON.stringify({ A: ['unbekannt'], B: 'pdf' }), NAMEN)).toBeNull()
})

test('kategorienHash ist kurz, stabil und hängt nicht von der Reihenfolge ab', () => {
  expect(kategorienHash(NAMEN)).toBe(kategorienHash([...NAMEN].reverse()))
  expect(kategorienHash(NAMEN)).not.toBe(kategorienHash(NAMEN.slice(1)))
  expect(kategorienHash(NAMEN)).toMatch(/^6-[0-9a-z]{1,7}$/)
})

test('pruefeGespeichert nimmt nur Kategorien für denselben Hash mit bekannten Skills', () => {
  const hash = kategorienHash(NAMEN)
  const kategorien = [{ name: 'Dokumente', skills: ['docx', 'pdf'] }]
  expect(pruefeGespeichert({ hash, kategorien }, hash, NAMEN)).toEqual(kategorien)
  expect(pruefeGespeichert({ hash: 'anders', kategorien }, hash, NAMEN)).toBeNull()
  expect(pruefeGespeichert({ hash, kategorien: [{ name: 'X', skills: ['unbekannt'] }] }, hash, NAMEN)).toBeNull()
  expect(pruefeGespeichert({ hash, kategorien: [{ name: 'X', skills: ['pdf'] }, { name: 'x', skills: ['docx'] }] }, hash, NAMEN)).toBeNull()
  expect(pruefeGespeichert(undefined, hash, NAMEN)).toBeNull()
})

test('menueStufe: Stufe 1 mit Kategorien und Anzahl, Stufe 2 mit zurück und den Skills, sonst Stufe 1', () => {
  const kategorien = nachPlugin(NAMEN).kategorien
  expect(menueStufe(kategorien, null, PUZZLE)).toEqual({
    offen: null,
    options: [
      { value: '', label: PUZZLE },
      { value: 'k:Design', label: 'Design (1)' },
      { value: 'k:Eigene', label: 'Eigene (3)' },
      { value: 'k:Engineering', label: 'Engineering (2)' },
    ],
  })
  expect(menueStufe(kategorien, 'Engineering', PUZZLE).options).toEqual([
    { value: '', label: `${PUZZLE} Engineering` },
    { value: ZURUECK, label: ZURUECK_TEXT },
    { value: 's:engineering:debug', label: 'engineering:debug' },
    { value: 's:engineering:review', label: 'engineering:review' },
  ])
  expect(ZURUECK_TEXT).toBe('← zurück')
  // Verschwindet die offene Kategorie, gilt Stufe 1; ohne Liste nur der Kopf.
  expect(menueStufe(kategorien, 'Gibt es nicht', PUZZLE).offen).toBeNull()
  expect(menueStufe(null, 'Engineering', PUZZLE).options).toEqual([{ value: '', label: PUZZLE }])
  expect(menueStufe([], null, PUZZLE).options).toEqual([{ value: '', label: PUZZLE }])
})

test('leseWahl versteht Kategorie, zurück und Skill', () => {
  expect(leseWahl('k:Code prüfen')).toEqual({ art: 'kategorie', name: 'Code prüfen' })
  expect(leseWahl(ZURUECK)).toEqual({ art: 'zurueck' })
  expect(leseWahl('s:engineering:debug')).toEqual({ art: 'skill', name: 'engineering:debug' })
  expect(leseWahl('')).toBeNull()
  expect(leseWahl('k:')).toBeNull()
})

test('haikuPrompt nennt jeden Skill, mit höchstens 100 Zeichen Beschreibung', () => {
  const lang = 'x'.repeat(150)
  const prompt = haikuPrompt(['pdf', 'docx'], new Map([['pdf', `PDF lesen ${lang}`]]))
  expect(prompt).toContain('4 bis 12 Kategorien')
  expect(prompt).toContain('- docx\n')
  expect(prompt).toContain(`- pdf: ${`PDF lesen ${lang}`.slice(0, BESCHREIBUNG_MAX)}`)
  expect(prompt).not.toContain('x'.repeat(100))
})

test('kategorienText: Kategorien als Überschrift, je Skill /name, was nicht passt unter Nicht im Menü', () => {
  const text = kategorienText(['pdf', 'docx', 'grill-me'], [{ name: 'Dokumente', skills: ['docx', 'pdf'] }])
  expect(text).toBe(['3 Skills in dieser Sitzung:', 'Dokumente\n/docx\n/pdf', 'Nicht im Menü\n/grill-me'].join('\n\n'))
})
