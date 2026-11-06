import { expect, test } from 'claude-code/testing'

import {
  BESCHREIBUNG_MAX,
  KURZ_PAECKCHEN,
  MAX_KATEGORIEN,
  MAX_SKILLS,
  PROMPT_VERSION,
  WEITERE,
  ersterSatz,
  fertig,
  haikuPrompt,
  istSammel,
  jsonAus,
  kategorienHash,
  kategorienText,
  kurzAusBeschreibungen,
  kurzPrompt,
  ladeGespeichert,
  lesbar,
  leseHauptantwort,
  leseKurzAntwort,
  leseNachtrag,
  menueHash,
  nachPlugin,
  nachtragPrompt,
  paeckchen,
  skillLabel,
  skillsText,
} from '../hooks/skills/kategorien'
import type { Gelesen, Lesefehler } from '../hooks/skills/kategorien'

// Die Kategorien des Fensters Skills, ohne Engine: Haikus Antworten lesen (aus dem Probe-Mod skill-probe übernommen),
// der Rückfall nach Plugin, der Speicher, Kurzbeschreibungen und der Text des Befehls.

const reihe = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(3, '0')}`)
const NAMEN = ['engineering:debug', 'engineering:review', 'pdf', 'design:critique', 'docx', 'grill-me']
const gelesen = (r: Gelesen | Lesefehler): Gelesen => {
  if ('fehler' in r) throw new Error(r.fehler)
  return r
}
const alsObjekt = (gruppen: ReadonlyMap<string, readonly string[]>) => Object.fromEntries(gruppen)

test('lesbar macht aus dem Plugin einen Namen', () => {
  expect(lesbar('anthropic-skills')).toBe('Anthropic')
  expect(lesbar('engineering')).toBe('Engineering')
  expect(lesbar('pdf-viewer')).toBe('Pdf Viewer')
  expect(lesbar('skills')).toBe('Skills')
  expect(lesbar('')).toBe(WEITERE)
})

test('nachPlugin gruppiert nach dem Teil vor dem Doppelpunkt, sortiert, Namen ohne Plugin in Weitere am Ende; keine Grenzen, keine Teilung', () => {
  const namen = ['sorgfalt:debuggen', 'anthropic-skills:grill-me', 'engineering:review', 'engineering:debug', 'solo', 'sorgfalt:belegen']
  expect(nachPlugin(namen)).toEqual([
    { name: 'Anthropic', skills: ['anthropic-skills:grill-me'] },
    { name: 'Engineering', skills: ['engineering:debug', 'engineering:review'] },
    { name: 'Sorgfalt', skills: ['sorgfalt:belegen', 'sorgfalt:debuggen'] },
    { name: WEITERE, skills: ['solo'] },
  ])
  expect(nachPlugin([])).toEqual([])
  // 30 Skills eines Plugins bleiben eine Kategorie; 150 Skills auf 40 Plugins kommen alle vor, jeder einmal.
  expect(nachPlugin(reihe('engineering:s', 30))).toEqual([{ name: 'Engineering', skills: reihe('engineering:s', 30) }])
  const viele = Array.from({ length: 150 }, (_, i) => `plugin-${i % 40}:skill-${i}`)
  const kategorien = nachPlugin(viele)
  expect(kategorien).toHaveLength(40)
  expect(kategorien.flatMap(k => k.skills).sort()).toEqual([...viele].sort())
})

test('jsonAus liest einen ```json-Block mit Text drumherum, einen Block ohne schließende Zäune und rohes JSON im Text', () => {
  const objekt = { kategorien: { A: ['x'] } }
  expect(jsonAus(`Hier ist die Sortierung:\n\n\`\`\`json\n${JSON.stringify(objekt)}\n\`\`\`\n\nViel Erfolg {damit}!`)).toEqual({ wert: objekt })
  expect(jsonAus(`\`\`\`json\n${JSON.stringify(objekt)}\n`)).toEqual({ wert: objekt })
  expect(jsonAus(`Gern: ${JSON.stringify(objekt)} Und noch {etwas}.`)).toEqual({ wert: objekt })
})

test('jsonAus sagt, warum nichts zu lesen war: kein JSON, abgeschnitten, kaputt', () => {
  expect(jsonAus('Das kann ich nicht.')).toEqual({ fehler: 'kein JSON gefunden (keine "{" in der Antwort)' })
  const abgeschnitten = jsonAus(JSON.stringify({ kategorien: { 'Fehler finden': ['a', 'b'] } }).slice(0, 25))
  expect('fehler' in abgeschnitten && abgeschnitten.fehler).toMatch(/^JSON endet nicht \(keine schließende Klammer, vermutlich abgeschnitten\)/)
  const kaputt = jsonAus('{ kaputt }')
  expect('fehler' in kaputt && kaputt.fehler).toMatch(/^JSON\.parse: /)
})

test('leseHauptantwort: unbekannte Namen fallen weg, doppelte zählen beim ersten Mal, Sammelkategorien und Fehlende gehen in den Rest, Namen ungekürzt', () => {
  const lang = 'Konfiguration und Erweiterung aller Werkzeuge'
  const antwort = JSON.stringify({
    kategorien: {
      'Fehler finden': ['engineering:debug', '/engineering:review', 'gibt-es-nicht'],
      'fehler finden': ['pdf'],
      [lang]: ['docx', 'pdf'],
      Sonstiges: ['design:critique'],
      Leer: ['unbekannt'],
    },
  })
  const r = gelesen(leseHauptantwort(antwort, NAMEN))
  expect(alsObjekt(r.gruppen)).toEqual({ 'Fehler finden': ['engineering:debug', 'engineering:review', 'pdf'], [lang]: ['docx'] })
  expect(r.rest).toEqual(['design:critique', 'grill-me'])
  expect(r.kurz).toEqual({})
  for (const name of ['Weitere', 'sonstiges', 'Allgemein', 'Diverses']) expect(istSammel(name)).toBe(true)
  expect(istSammel('Code prüfen')).toBe(false)
})

test('leseHauptantwort: höchstens 15 Skills je Kategorie und 12 Kategorien, der Überhang geht in den Rest, ohne Teilung', () => {
  const viele = reihe('test:skill-', 17)
  const r = gelesen(leseHauptantwort(JSON.stringify({ kategorien: { 'Code prüfen': viele } }), viele))
  expect(r.gruppen.get('Code prüfen')).toHaveLength(MAX_SKILLS)
  expect(r.rest).toEqual(viele.slice(MAX_SKILLS))
  const namen = reihe('s', 14)
  const zuViele = Object.fromEntries(namen.map((name, i) => [`Kategorie ${String.fromCharCode(65 + i)}`, [name]]))
  const r2 = gelesen(leseHauptantwort(JSON.stringify({ kategorien: zuViele }), namen))
  expect(r2.gruppen.size).toBe(MAX_KATEGORIEN)
  expect(r2.rest).toEqual(namen.slice(MAX_KATEGORIEN))
})

test('leseHauptantwort sagt, woran es scheiterte: kein Objekt kategorien, 0 bekannte Skills', () => {
  expect(leseHauptantwort('{"liste": ["pdf"]}', NAMEN)).toEqual({ fehler: 'JSON gelesen, aber ohne Objekt "kategorien" (Schlüssel: liste)' })
  expect(leseHauptantwort(JSON.stringify({ A: ['pdf'] }), NAMEN)).toEqual({ fehler: 'JSON gelesen, aber ohne Objekt "kategorien" (Schlüssel: A)' })
  expect(leseHauptantwort(JSON.stringify({ kategorien: { 'Code prüfen': ['/debuggen', 'belegen', 'ux'] } }), NAMEN)).toEqual({
    fehler: 'JSON gelesen, aber 0 bekannte Skills (1 Kategorien; genannt: /debuggen, belegen, ux; erwartet: engineering:debug, engineering:review, pdf)',
  })
  const kaputt = leseHauptantwort('Hier sind die Kategorien: keine', NAMEN)
  expect('fehler' in kaputt && kaputt.fehler).toBe('kein JSON gefunden (keine "{" in der Antwort)')
})

test('leseNachtrag ordnet nur in vorhandene Kategorien ein (Groß- und Kleinschreibung egal), höchstens 15 je Kategorie; null ohne zuordnung', () => {
  const gruppen = new Map([
    ['Fehler finden', ['engineering:debug']],
    ['Texte gestalten', reihe('t', MAX_SKILLS)],
  ])
  const antwort = JSON.stringify({ zuordnung: { pdf: 'fehler finden', docx: 'Gibt es nicht', 'grill-me': 'Texte gestalten', fremd: 'Fehler finden' } })
  const r = leseNachtrag(antwort, ['pdf', 'docx', 'grill-me'], gruppen)
  expect(r).not.toBeNull()
  expect(r!.gruppen.get('Fehler finden')).toEqual(['engineering:debug', 'pdf'])
  expect(r!.gruppen.get('Texte gestalten')).toHaveLength(MAX_SKILLS)
  expect(r!.rest).toEqual(['docx', 'grill-me'])
  // Die Gruppen davor bleiben unverändert.
  expect(gruppen.get('Fehler finden')).toEqual(['engineering:debug'])
  expect(leseNachtrag('{"kategorien": {}}', ['pdf'], gruppen)).toBeNull()
  expect(leseNachtrag('kein JSON', ['pdf'], gruppen)).toBeNull()
})

test('fertig: Skills sortiert, Kategorien in Haikus Reihenfolge, der Rest als genau eine Gruppe Weitere am Ende', () => {
  const gruppen = new Map([
    ['Texte', ['b', 'a']],
    ['Code', ['c']],
    ['Leer', []],
  ])
  expect(fertig(gruppen, ['z', 'y'])).toEqual([
    { name: 'Texte', skills: ['a', 'b'] },
    { name: 'Code', skills: ['c'] },
    { name: WEITERE, skills: ['y', 'z'] },
  ])
  expect(fertig(gruppen, []).map(k => k.name)).toEqual(['Texte', 'Code'])
})

test('kategorienHash ist kurz, stabil und hängt nicht von der Reihenfolge ab; menueHash nennt die Prompt-Version 5', () => {
  expect(kategorienHash(NAMEN)).toBe(kategorienHash([...NAMEN].reverse()))
  expect(kategorienHash(NAMEN)).not.toBe(kategorienHash(NAMEN.slice(1)))
  expect(kategorienHash(NAMEN)).toMatch(/^6-[0-9a-z]{1,7}$/)
  expect(PROMPT_VERSION).toBe(5)
  expect(menueHash(NAMEN)).toBe(`p5-${kategorienHash(NAMEN)}`)
})

test('ladeGespeichert: gleicher Bestand ohne Nachfrage, Weitere bleibt; neuer Bestand: entfallene gestrichen, neue und bisherige Weitere offen', () => {
  const kategorien = [
    { name: 'Dokumente', skills: ['docx', 'pdf'] },
    { name: 'Fehler finden', skills: ['engineering:debug', 'engineering:review'] },
    { name: WEITERE, skills: ['design:critique', 'grill-me'] },
  ]
  const kurz = { pdf: 'PDF lesen.', fremd: 'Weg.', docx: 3 }
  const gleich = ladeGespeichert({ hash: menueHash(NAMEN), kategorien, kurz }, NAMEN)
  expect(gleich).not.toBeNull()
  expect(gleich!.gleich).toBe(true)
  expect(alsObjekt(gleich!.gruppen)).toEqual({ Dokumente: ['docx', 'pdf'], 'Fehler finden': ['engineering:debug', 'engineering:review'] })
  expect(gleich!.weitere).toEqual(['design:critique', 'grill-me'])
  expect(gleich!.neu).toEqual([])
  expect(gleich!.kurz).toEqual({ pdf: 'PDF lesen.' })
  // pdf entfällt, neu kommt dazu.
  const jetzt = [...NAMEN.filter(n => n !== 'pdf'), 'neu']
  const anders = ladeGespeichert({ hash: menueHash(NAMEN), kategorien, kurz }, jetzt)
  expect(anders!.gleich).toBe(false)
  expect(alsObjekt(anders!.gruppen)).toEqual({ Dokumente: ['docx'], 'Fehler finden': ['engineering:debug', 'engineering:review'] })
  expect(anders!.neu).toEqual(['design:critique', 'grill-me', 'neu'])
  expect(anders!.weitere).toEqual([])
})

test('ladeGespeichert nimmt nichts nach einem anderen Prompt und nichts Kaputtes', () => {
  const kategorien = [{ name: 'Dokumente', skills: ['docx', 'pdf'] }]
  expect(ladeGespeichert({ hash: `p3-${kategorienHash(NAMEN)}`, kategorien }, NAMEN)).toBeNull()
  expect(ladeGespeichert({ hash: kategorienHash(NAMEN), kategorien }, NAMEN)).toBeNull()
  expect(ladeGespeichert({ hash: menueHash(NAMEN), kategorien: [{ name: 'X', skills: ['unbekannt'] }] }, NAMEN)).toBeNull()
  expect(ladeGespeichert({ hash: menueHash(NAMEN), kategorien: [{ name: WEITERE, skills: ['pdf'] }] }, NAMEN)).toBeNull()
  expect(ladeGespeichert({ hash: menueHash(NAMEN), kategorien: [{ skills: ['pdf'] }] }, NAMEN)).toBeNull()
  expect(ladeGespeichert(undefined, NAMEN)).toBeNull()
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

test('haikuPrompt fragt nur nach Kategorien: sprechende Namen aus zwei bis drei Wörtern, keine Sammelkategorie, bis 15 je Kategorie, ohne kurz', () => {
  const lang = 'x'.repeat(150)
  const prompt = haikuPrompt(['pdf', 'docx'], new Map([['pdf', `PDF lesen ${lang}`]]))
  expect(prompt).toContain('Ordne die folgenden Skills von Claude Code in 4 bis 12 Kategorien nach ihrem Zweck.')
  expect(prompt).toContain('Ordne nach dem Anwendungsfall, nicht nach Herkunft oder Plugin')
  expect(prompt).toContain('sprechenden deutschen Namen aus zwei bis drei Wörtern')
  expect(prompt).toContain('höchstens 24 Zeichen')
  expect(prompt).toContain('Keine Sammelkategorie wie "Weitere", "Sonstiges", "Allgemein" oder "Diverses"')
  expect(prompt).toContain('höchstens 15 Skills je Kategorie')
  expect(prompt).toContain('{"kategorien": {"Kategorie": ["skill-a", "skill-b"]')
  expect(prompt).not.toContain('Kurzbeschreibung')
  expect(prompt).not.toContain('"kurz"')
  expect(prompt).toContain('Skills:\n- docx\n')
  expect(prompt).toContain(`- pdf: ${`PDF lesen ${lang}`.slice(0, BESCHREIBUNG_MAX)}`)
  expect(prompt).not.toContain('x'.repeat(100))
})

test('nachtragPrompt nennt nur die vorhandenen Kategorien und nur die fehlenden Skills; kurzPrompt verlangt je Skill einen Satz', () => {
  const nach = nachtragPrompt(['loop', 'init'], ['Fehler finden', 'Texte gestalten'], new Map([['loop', 'Wiederholt einen Befehl. Mehr Text.']]))
  expect(nach).toContain('Ordne jeden dieser Skills von Claude Code genau einer der vorhandenen Kategorien zu')
  expect(nach).toContain('erfinde keine neue und keine Sammelkategorie')
  expect(nach).toContain('Kategorien:\n- Fehler finden\n- Texte gestalten\n')
  expect(nach).toContain('Skills:\n- init\n- loop: Wiederholt einen Befehl. Mehr Text.')
  expect(nach).toContain('{"zuordnung": {')
  expect(nach).not.toContain('"kurz"')
  const kurz = kurzPrompt(['b', 'a'])
  expect(kurz).toContain('Schreib zu jedem dieser Skills von Claude Code eine deutsche Kurzbeschreibung in einem Satz, höchstens 90 Zeichen: was man damit tut.')
  expect(kurz).toContain('{"kurz": {')
  expect(kurz).toContain('Skills:\n- a\n- b')
})

test('paeckchen zu höchstens 20; leseKurzAntwort nimmt nur Skills des Päckchens, null ohne Objekt kurz', () => {
  expect(KURZ_PAECKCHEN).toBe(20)
  expect(paeckchen(reihe('s', 45), KURZ_PAECKCHEN).map(p => p.length)).toEqual([20, 20, 5])
  expect(paeckchen([], KURZ_PAECKCHEN)).toEqual([])
  expect(leseKurzAntwort(JSON.stringify({ kurz: { a: '  Ein   Satz. ', '/b': 'Zwei.', fremd: 'Weg.', c: 3, d: '' } }), ['a', 'b', 'c', 'd'])).toEqual({ a: 'Ein Satz.', b: 'Zwei.' })
  expect(leseKurzAntwort(JSON.stringify({ kurz: 'kaputt' }), ['a'])).toBeNull()
  expect(leseKurzAntwort('Leider nicht.', ['a'])).toBeNull()
})

test('Labels ohne Präfix und ungekürzt; der Text des Befehls: Kategorien als Überschrift, je Skill /name: Kurzbeschreibung, Neue unter "Noch ohne Kategorie"', () => {
  expect(skillLabel('cowork-plugin-management:cowork-plugin-customizer')).toBe('cowork-plugin-customizer')
  expect(skillLabel('grill-me')).toBe('grill-me')
  expect(skillsText(1)).toBe('1 Skill')
  expect(skillsText(3)).toBe('3 Skills')
  const text = kategorienText(['pdf', 'docx', 'grill-me'], [{ name: 'Dokumente', skills: ['docx', 'pdf'] }], { pdf: 'PDF lesen.', 'grill-me': 'Fragt dich aus.' })
  expect(text).toBe(['3 Skills in dieser Sitzung:', 'Dokumente\n/docx\n/pdf: PDF lesen.', 'Noch ohne Kategorie\n/grill-me: Fragt dich aus.'].join('\n\n'))
})
