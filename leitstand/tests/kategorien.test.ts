import { expect, test } from 'claude-code/testing'

import {
  BESCHREIBUNG_MAX,
  MAX_EINTRAEGE,
  POPOVER_PX,
  PROMPT_VERSION,
  WEITERE,
  ausModellAntwort,
  ersterSatz,
  haikuPrompt,
  imBand,
  kategorienHash,
  kategorienText,
  knopfPx,
  kurzAusBeschreibungen,
  lesbar,
  menueHash,
  menueMasse,
  nachPlugin,
  passtNicht,
  pruefeGespeichert,
  skillLabel,
} from '../hooks/skills/kategorien'
import type { SkillMenue } from '../hooks/skills/kategorien'

// Die Kategorien des Skill-Menüs, ohne Engine: nach Plugin, aus Haikus Antwort, Kurzbeschreibungen und die Maße des
// Hover-Menüs.

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
  expect(lesbar('')).toBe(WEITERE)
})

test('nachPlugin gruppiert nach dem Teil vor dem Doppelpunkt, Namen ohne kommen in Weitere (keine Gruppe Eigene), sortiert', () => {
  const namen = ['sorgfalt:debuggen', 'anthropic-skills:grill-me', 'engineering:review', 'engineering:debug', 'solo', 'sorgfalt:belegen']
  const menue = nachPlugin(namen)
  expect(menue).toEqual({
    kategorien: [
      { name: 'Anthropic', skills: ['anthropic-skills:grill-me'] },
      { name: 'Engineering', skills: ['engineering:debug', 'engineering:review'] },
      { name: 'Sorgfalt', skills: ['sorgfalt:belegen', 'sorgfalt:debuggen'] },
      { name: WEITERE, skills: ['solo'] },
    ],
    weggelassen: [],
  })
  expect(menue.kategorien.map(kategorie => kategorie.name)).not.toContain('Eigene')
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

test('ausModellAntwort liest die neue Form mit kategorien und kurz, auch aus einem ```json-Block', () => {
  const antwort = {
    kategorien: { Fehlersuche: ['engineering:debug', 'engineering:review'], Dokumente: ['pdf', 'docx'] },
    kurz: {
      'engineering:debug': '  Fehler   Schritt für Schritt finden. ',
      '/pdf': 'PDF-Dateien lesen und erstellen.',
      'gibt-es-nicht': 'Verworfen.',
      docx: 42,
      'grill-me': '',
    },
  }
  const menue = ausModellAntwort(['Bitte:', '```json', JSON.stringify(antwort), '```'].join('\n'), NAMEN)
  expect(menue).toEqual({
    kategorien: [
      { name: 'Dokumente', skills: ['docx', 'pdf'] },
      { name: 'Fehlersuche', skills: ['engineering:debug', 'engineering:review'] },
      { name: WEITERE, skills: ['design:critique', 'grill-me'] },
    ],
    weggelassen: [],
    kurz: { 'engineering:debug': 'Fehler Schritt für Schritt finden.', pdf: 'PDF-Dateien lesen und erstellen.' },
  })
  // kurz ist freiwillig.
  expect(ausModellAntwort(JSON.stringify({ kategorien: { Dokumente: ['pdf'] } }), NAMEN)?.kurz).toEqual({})
})

test('ausModellAntwort liest auch die alte Form, verwirft Unbekanntes, Fehlendes kommt in Weitere', () => {
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
    kurz: {},
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
  const menue = ausModellAntwort(JSON.stringify({ kategorien: zuViel }), namen)
  expect(menue).not.toBeNull()
  pruefeGrenzen(menue!, namen)
  const gross = ausModellAntwort(JSON.stringify({ kategorien: { Alles: namen.slice(0, 30) } }), namen.slice(0, 30))
  expect(gross?.kategorien.map(kategorie => kategorie.name)).toEqual(['Alles 1', 'Alles 2', 'Alles 3'])
})

test('ausModellAntwort ist null bei ungültiger Antwort', () => {
  expect(ausModellAntwort('Das kann ich nicht.', NAMEN)).toBeNull()
  expect(ausModellAntwort('{ kaputt', NAMEN)).toBeNull()
  expect(ausModellAntwort('["pdf"]', NAMEN)).toBeNull()
  expect(ausModellAntwort(JSON.stringify({ A: ['unbekannt'], B: 'pdf' }), NAMEN)).toBeNull()
  expect(ausModellAntwort(JSON.stringify({ kategorien: { A: ['unbekannt'] }, kurz: { pdf: 'Satz.' } }), NAMEN)).toBeNull()
})

test('kategorienHash ist kurz, stabil und hängt nicht von der Reihenfolge ab; menueHash nennt die Prompt-Version', () => {
  expect(kategorienHash(NAMEN)).toBe(kategorienHash([...NAMEN].reverse()))
  expect(kategorienHash(NAMEN)).not.toBe(kategorienHash(NAMEN.slice(1)))
  expect(kategorienHash(NAMEN)).toMatch(/^6-[0-9a-z]{1,7}$/)
  expect(PROMPT_VERSION).toBe(3)
  expect(menueHash(NAMEN)).toBe(`p3-${kategorienHash(NAMEN)}`)
})

test('pruefeGespeichert nimmt nur Kategorien für denselben Hash mit bekannten Skills, dazu die Kurzbeschreibungen bekannter Skills', () => {
  const hash = menueHash(NAMEN)
  const kategorien = [{ name: 'Dokumente', skills: ['docx', 'pdf'] }]
  expect(pruefeGespeichert({ hash, kategorien }, hash, NAMEN)).toEqual({ kategorien, kurz: {} })
  expect(pruefeGespeichert({ hash, kategorien, kurz: { pdf: 'PDF lesen.', fremd: 'Weg.', docx: 3 } }, hash, NAMEN)).toEqual({ kategorien, kurz: { pdf: 'PDF lesen.' } })
  expect(pruefeGespeichert({ hash: 'anders', kategorien }, hash, NAMEN)).toBeNull()
  // Ein Ergebnis nach dem alten Prompt (Hash ohne Version) gilt nicht.
  expect(pruefeGespeichert({ hash: kategorienHash(NAMEN), kategorien }, hash, NAMEN)).toBeNull()
  expect(pruefeGespeichert({ hash, kategorien: [{ name: 'X', skills: ['unbekannt'] }] }, hash, NAMEN)).toBeNull()
  expect(pruefeGespeichert({ hash, kategorien: [{ name: 'X', skills: ['pdf'] }, { name: 'x', skills: ['docx'] }] }, hash, NAMEN)).toBeNull()
  expect(pruefeGespeichert(undefined, hash, NAMEN)).toBeNull()
})

test('ersterSatz nimmt den ersten ganzen Satz, ungekürzt, und übergeht Abkürzungen', () => {
  expect(ersterSatz('Nutzen bei jedem Fehler. Auch bei Build-Fehlern.')).toBe('Nutzen bei jedem Fehler.')
  expect(ersterSatz('  Use this skill whenever the user wants a PDF!  Triggers include pdf.')).toBe('Use this skill whenever the user wants a PDF!')
  expect(ersterSatz('Prüft z. B. Namen und Länge, etwa e.g. Funktionen. Mehr.')).toBe('Prüft z. B. Namen und Länge, etwa e.g. Funktionen.')
  expect(ersterSatz('Version 1.2.3 lesen. Dann mehr.')).toBe('Version 1.2.3 lesen.')
  const lang = `Ein sehr langer Satz ${'mit vielen Wörtern '.repeat(20)}am Ende.`
  expect(ersterSatz(`${lang} Zweiter.`)).toBe(lang.replace(/\s+/g, ' '))
  expect(ersterSatz('Ohne Satzende')).toBe('Ohne Satzende')
  expect(ersterSatz('')).toBe('')
  expect(kurzAusBeschreibungen(['a', 'b', 'c'], new Map([['a', 'Erster. Zweiter.'], ['c', '   ']]))).toEqual({ a: 'Erster.' })
})

test('haikuPrompt nennt jeden Skill, mit höchstens 100 Zeichen Beschreibung, und verlangt Kategorien und Kurzbeschreibungen', () => {
  const lang = 'x'.repeat(150)
  const prompt = haikuPrompt(['pdf', 'docx'], new Map([['pdf', `PDF lesen ${lang}`]]))
  expect(prompt).toContain('Skills von Claude Code')
  expect(prompt).toContain('4 bis 12 Kategorien')
  expect(prompt).toContain('Ordne nach dem Anwendungsfall, nicht nach Herkunft oder Plugin')
  expect(prompt).toContain('aus EINEM Wort')
  expect(prompt).toContain('höchstens 14 Zeichen, ohne "&" und ohne "und"')
  expect(prompt).toContain('deutsche Kurzbeschreibung in einem Satz, höchstens 90 Zeichen')
  expect(prompt).toContain('{"kategorien": {"Kategorie": ["skill-a", "skill-b"]')
  expect(prompt).toContain('"kurz": {"skill-a": "Satz."')
  expect(prompt).toContain('- docx\n')
  expect(prompt).toContain(`- pdf: ${`PDF lesen ${lang}`.slice(0, BESCHREIBUNG_MAX)}`)
  expect(prompt).not.toContain('x'.repeat(100))
})

test('Labels ohne Präfix und ungekürzt; Maße wie im Probe-Mod: 6,2 px je Zeichen, 24 px Rand, W in ch, H in Zeilen', () => {
  expect(skillLabel('cowork-plugin-management:cowork-plugin-customizer')).toBe('cowork-plugin-customizer')
  expect(skillLabel('grill-me')).toBe('grill-me')
  expect(Math.round(knopfPx('abc') * 100) / 100).toBe(42.6)
  const kategorien = [
    { name: 'Fehlersuche', skills: ['sorgfalt:debuggen', 'sorgfalt:belegen', 'loop'] },
    { name: 'Gestaltung', skills: ['cowork-plugin-management:cowork-plugin-customizer'] },
  ]
  const masse = menueMasse(kategorien)
  // "cowork-plugin-customizer": 24 * 6,2 + 24 = 172,8 px, + 8 = 180,8 px, / 8 = 22,6, also 23 ch; H: 3 Skills, ceil(3 + 2 * 0,6) = 5.
  expect(masse.breite).toBe(23)
  expect(masse.hoehe).toBe(5)
  // "Fehlersuche ›": 13 * 6,2 + 24 + 8 = 112,6 px; dazu 23 ch = 184 px.
  expect(masse.gesamtPx).toBe(Math.round(112.6 + 184))
  expect(passtNicht(kategorien)).toBeNull()
  expect(menueMasse([])).toEqual({ linksPx: 8, rechtsPx: 8, breite: 1, hoehe: 0, gesamtPx: 16 })
  // imBand: höchstens 12 zu je höchstens 12.
  const viele = Array.from({ length: 14 }, (_, i) => ({ name: `K${i}`, skills: reihe(`s${i}-`, 14) }))
  expect(imBand(viele).length).toBe(12)
  expect(imBand(viele).every(kategorie => kategorie.skills.length === 12)).toBe(true)
})

test('passtNicht meldet, was das Menü über etwa 340 px breit macht, ohne zu kürzen', () => {
  const lang = 'ein-sehr-langer-skill-name-der-nicht-passt'
  const zuBreit = passtNicht([{ name: 'Konfiguration & Erweiterung', skills: ['kurz', `plugin:${lang}`] }])
  expect(zuBreit).not.toBeNull()
  expect(zuBreit!.gesamtPx).toBeGreaterThan(POPOVER_PX)
  expect(zuBreit!.kategorien).toEqual(['Konfiguration & Erweiterung'])
  expect(zuBreit!.skills).toEqual([`plugin:${lang}`])
})

test('kategorienText: Kategorien als Überschrift, je Skill /name: Kurzbeschreibung, was nicht passt darunter', () => {
  const text = kategorienText(['pdf', 'docx', 'grill-me'], [{ name: 'Dokumente', skills: ['docx', 'pdf'] }], { pdf: 'PDF lesen.', 'grill-me': 'Fragt dich aus.' })
  expect(text).toBe(['3 Skills in dieser Sitzung:', 'Dokumente\n/docx\n/pdf: PDF lesen.', 'Nicht im Menü\n/grill-me: Fragt dich aus.'].join('\n\n'))
  const lang = 'plugin:ein-sehr-langer-skill-name-der-nicht-passt'
  const breit = kategorienText([lang], [{ name: 'Konfiguration & Erweiterung', skills: [lang] }])
  const zuBreit = passtNicht([{ name: 'Konfiguration & Erweiterung', skills: [lang] }])!
  expect(breit.split('\n\n').at(-1)).toBe(
    ['Passt nicht in das Menü', `Das Menü wäre etwa ${zuBreit.gesamtPx} px breit, Platz ist für etwa 340 px. Zu breit:`, 'Kategorie Konfiguration & Erweiterung', `/${lang}`].join('\n'),
  )
})
