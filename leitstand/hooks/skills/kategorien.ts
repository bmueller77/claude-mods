import type { SkillKategorie } from '../../types'

/**
 * Skill menu: the skills of this session in categories, for the two stages of the picker 🧩. Pure, without `$`: the
 * part (teil.tsx) loads the names and asks Haiku, the band (glance.tsx) draws the stages.
 *
 * The engine refuses a whole tree when a Select holds more than 64 options, and the desktop app does not scroll an
 * unfolded Select of 20. So every stage holds at most `max` (12) entries besides its head: at most 12 categories of at
 * most 12 skills each, 144 in all. What does not fit is left out and said (`weggelassen`).
 */

/** The categories and the skills that did not fit. */
export type SkillMenue = { readonly kategorien: SkillKategorie[]; readonly weggelassen: string[] }

/** One option of the picker. */
export type MenueOption = { readonly value: string; readonly label: string }

/** What a pick in the picker means: a category to open, back to the categories, a skill to start; null for the head. */
export type MenueWahl = { readonly art: 'kategorie'; readonly name: string } | { readonly art: 'zurueck' } | { readonly art: 'skill'; readonly name: string } | null

/** Entries per stage, besides its head (and the way back): the limit for categories and for skills per category. */
export const MAX_EINTRAEGE = 12

/** Skills without a plugin. */
export const EIGENE = 'Eigene'

/** The category that takes small groups and whatever has no other place. */
export const WEITERE = 'Weitere'

/** The value of the way back in stage 2, and its text. */
export const ZURUECK = 'zurueck'
export const ZURUECK_TEXT = '← zurück'

/** How long a category's name from the model may be. */
const NAME_MAX = 40

/** Words a plugin's name drops for the category, while any other word remains. */
const FUELLWOERTER = new Set(['skill', 'skills', 'plugin', 'plugins'])

const sortiere = (namen: Iterable<string>): string[] => [...new Set(namen)].sort((a, b) => a.localeCompare(b, 'de'))

/** A plugin's name as a category: `anthropic-skills` to "Anthropic", `pdf-viewer` to "Pdf Viewer". */
export function lesbar(plugin: string): string {
  const woerter = plugin.split(/[-_\s]+/).filter(wort => wort !== '')
  const bleiben = woerter.filter(wort => !FUELLWOERTER.has(wort.toLowerCase()))
  const gewaehlt = bleiben.length > 0 ? bleiben : woerter
  const name = gewaehlt.map(wort => wort.charAt(0).toUpperCase() + wort.slice(1)).join(' ')
  return name === '' ? EIGENE : name
}

const istWeitere = (name: string): boolean => name.toLowerCase() === WEITERE.toLowerCase()

/** How many entries a group of `n` takes, split at `max`. */
const teileVon = (n: number, max: number): number => (n === 0 ? 0 : Math.ceil(n / max))

/** A group split into parts of at most `max`, as even as they go. */
function teile(namen: readonly string[], max: number): string[][] {
  const anzahl = teileVon(namen.length, max)
  if (anzahl <= 1) return namen.length === 0 ? [] : [[...namen]]
  const basis = Math.floor(namen.length / anzahl)
  const extra = namen.length % anzahl
  const ergebnis: string[][] = []
  let ab = 0
  for (let i = 0; i < anzahl; i++) {
    const groesse = basis + (i < extra ? 1 : 0)
    ergebnis.push(namen.slice(ab, ab + groesse))
    ab += groesse
  }
  return ergebnis
}

/**
 * Lays groups out within the limits: at most `max` categories of at most `max` skills, every skill once, sorted, with
 * Weitere last. Too many skills: the last of the largest group leave first. Too many categories: groups of at most two
 * go to Weitere, then the smallest, one by one. A group over `max` is split ("Engineering 1", "Engineering 2").
 */
function ordne(gruppenEin: ReadonlyMap<string, readonly string[]>, restEin: readonly string[], max: number): SkillMenue {
  const grenze = Math.max(1, Math.floor(max))
  const vergeben = new Set<string>()
  const nimm = (namen: readonly string[]) => sortiere(namen).filter(name => !vergeben.has(name) && (vergeben.add(name), true))
  const gruppen = new Map<string, string[]>()
  for (const [name, namen] of gruppenEin) {
    const eigene = nimm(namen)
    if (eigene.length > 0) gruppen.set(name, eigene)
  }
  let rest = nimm(restEin)

  // Too many skills for the menu: the last ones of the largest group leave.
  const weggelassen: string[] = []
  let gesamt = rest.length + [...gruppen.values()].reduce((summe, namen) => summe + namen.length, 0)
  while (gesamt > grenze * grenze) {
    let groesste: string[] = rest
    for (const namen of gruppen.values()) if (namen.length > groesste.length) groesste = namen
    weggelassen.push(groesste.pop()!)
    gesamt--
  }
  for (const [name, namen] of [...gruppen]) if (namen.length === 0) gruppen.delete(name)

  const zaehle = () => [...gruppen.values()].reduce((summe, namen) => summe + teileVon(namen.length, grenze), 0) + teileVon(rest.length, grenze)
  if (zaehle() > grenze) {
    for (const [name, namen] of [...gruppen]) {
      if (namen.length > 2) continue
      rest = rest.concat(namen)
      gruppen.delete(name)
    }
  }
  while (zaehle() > grenze && gruppen.size > 0) {
    const [kleinste] = [...gruppen].sort(([a, x], [b, y]) => x.length - y.length || a.localeCompare(b, 'de'))
    rest = rest.concat(kleinste![1])
    gruppen.delete(kleinste![0])
  }

  const benannt = (name: string, namen: readonly string[]): SkillKategorie[] => {
    const stuecke = teile(sortiere(namen), grenze)
    return stuecke.map((skills, i) => ({ name: stuecke.length === 1 ? name : `${name} ${i + 1}`, skills }))
  }
  const vorn = [...gruppen]
    .flatMap(([name, namen]) => benannt(name, namen))
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
  const kategorien = [...vorn, ...benannt(WEITERE, rest)]
  // Every name once: a value twice in a Select would cost the whole band.
  const genutzt = new Set<string>()
  for (const kategorie of kategorien) {
    let name = kategorie.name
    for (let n = 2; genutzt.has(name.toLowerCase()); n++) name = `${kategorie.name} (${n})`
    genutzt.add(name.toLowerCase())
    kategorie.name = name
  }
  return { kategorien: kategorien.slice(0, grenze), weggelassen: sortiere(weggelassen) }
}

/**
 * The skills by plugin: the part before the colon, in readable words; names without one in "Eigene". Within `max`
 * categories of at most `max` skills (ordne).
 */
export function nachPlugin(namen: readonly string[], max = MAX_EINTRAEGE): SkillMenue {
  const gruppen = new Map<string, string[]>()
  const rest: string[] = []
  for (const name of sortiere(namen)) {
    const doppelpunkt = name.indexOf(':')
    const gruppe = doppelpunkt > 0 ? lesbar(name.slice(0, doppelpunkt)) : EIGENE
    if (istWeitere(gruppe)) rest.push(name)
    else gruppen.set(gruppe, [...(gruppen.get(gruppe) ?? []), name])
  }
  return ordne(gruppen, rest, max)
}

/** The JSON in a model's answer: a ```json block, else from the first { to the last }. */
function jsonAus(text: string): unknown {
  const block = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const kandidat = block?.[1] ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  try {
    return JSON.parse(kandidat.trim())
  } catch {
    return undefined
  }
}

/**
 * Haiku's categories, `{ "<Kategorie>": ["skill", ...] }`, also in a ```json block: unknown names leave, a skill named
 * twice counts where it came first, the missing go to Weitere, and the limits hold as for nachPlugin. Null when the
 * answer holds no such object or places no known skill.
 */
export function ausModellAntwort(text: string, namen: readonly string[], max = MAX_EINTRAEGE): SkillMenue | null {
  const wert = jsonAus(text)
  if (wert === null || typeof wert !== 'object' || Array.isArray(wert)) return null
  const bekannt = new Set(namen)
  const vergeben = new Set<string>()
  const gruppen = new Map<string, string[]>()
  const anzeige = new Map<string, string>()
  const rest: string[] = []
  for (const [schluessel, skills] of Object.entries(wert as Record<string, unknown>)) {
    const name = schluessel.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim()
    if (name === '' || !Array.isArray(skills)) continue
    const gefunden = skills.flatMap(skill => {
      if (typeof skill !== 'string') return []
      const skillName = skill.trim().replace(/^\//, '')
      if (!bekannt.has(skillName) || vergeben.has(skillName)) return []
      vergeben.add(skillName)
      return [skillName]
    })
    if (gefunden.length === 0) continue
    if (istWeitere(name)) {
      rest.push(...gefunden)
      continue
    }
    const klein = name.toLowerCase()
    const gruppe = anzeige.get(klein) ?? name
    anzeige.set(klein, gruppe)
    gruppen.set(gruppe, [...(gruppen.get(gruppe) ?? []), ...gefunden])
  }
  if (vergeben.size === 0) return null
  for (const name of namen) if (!vergeben.has(name)) rest.push(name)
  return ordne(gruppen, rest, max)
}

/**
 * Categories stored for this hash, checked before use: a name each, unique; at most `max` categories of at most `max`
 * skills; every skill one of `namen`, and only once. Null otherwise.
 */
export function pruefeGespeichert(wert: unknown, hash: string, namen: readonly string[], max = MAX_EINTRAEGE): SkillKategorie[] | null {
  if (wert === null || typeof wert !== 'object') return null
  const { hash: gespeichert, kategorien } = wert as { hash?: unknown; kategorien?: unknown }
  if (gespeichert !== hash || !Array.isArray(kategorien) || kategorien.length > max) return null
  const bekannt = new Set(namen)
  const skillsGesehen = new Set<string>()
  const namenGesehen = new Set<string>()
  const ergebnis: SkillKategorie[] = []
  for (const kategorie of kategorien as unknown[]) {
    if (kategorie === null || typeof kategorie !== 'object') return null
    const { name, skills } = kategorie as { name?: unknown; skills?: unknown }
    if (typeof name !== 'string' || name.trim() === '' || namenGesehen.has(name.toLowerCase())) return null
    if (!Array.isArray(skills) || skills.length === 0 || skills.length > max) return null
    for (const skill of skills as unknown[]) {
      if (typeof skill !== 'string' || !bekannt.has(skill) || skillsGesehen.has(skill)) return null
      skillsGesehen.add(skill)
    }
    namenGesehen.add(name.toLowerCase())
    ergebnis.push({ name, skills: [...(skills as string[])] })
  }
  return ergebnis
}

/** A short, stable hash of the names, sorted (djb2, no cryptography): the count, then the hash in base 36. */
export function kategorienHash(namen: readonly string[]): string {
  const sortiert = sortiere(namen)
  let hash = 5381
  for (const zeichen of sortiert.join('\n')) hash = (Math.imul(hash, 33) + zeichen.codePointAt(0)!) >>> 0
  return `${sortiert.length}-${hash.toString(36)}`
}

/** How much of a description the prompt carries per skill. */
export const BESCHREIBUNG_MAX = 100

/** The prompt for Haiku: the skills, each with the start of its description where one is known. */
export function haikuPrompt(namen: readonly string[], beschreibungen: ReadonlyMap<string, string> = new Map()): string {
  const zeilen = sortiere(namen).map(name => {
    const beschreibung = (beschreibungen.get(name) ?? '').replace(/\s+/g, ' ').trim().slice(0, BESCHREIBUNG_MAX).trim()
    return beschreibung === '' ? `- ${name}` : `- ${name}: ${beschreibung}`
  })
  return [
    'Ordne die folgenden Skills von Claude Code in 4 bis 12 Kategorien nach ihrem Zweck.',
    'Jede Kategorie bekommt einen kurzen deutschen Namen aus ein bis zwei Wörtern.',
    'Jeder Skill kommt genau einmal vor, höchstens 12 Skills je Kategorie.',
    'Schreib die Namen der Skills genau so, wie sie in der Liste stehen, ohne Schrägstrich davor.',
    'Antworte nur mit JSON in dieser Form, ohne weiteren Text:',
    '{"Kategorie": ["skill-a", "skill-b"], "Andere Kategorie": ["skill-c"]}',
    '',
    'Skills:',
    ...zeilen,
  ].join('\n')
}

/**
 * The picker's options: stage 1 the head and the categories with their counts; with a category open that is still
 * there, stage 2 the head with its name, the way back and its skills. At most `max` entries besides, values unique.
 */
export function menueStufe(
  kategorien: readonly SkillKategorie[] | null,
  offen: string | null,
  kopf: string,
  max = MAX_EINTRAEGE,
): { readonly offen: SkillKategorie | null; readonly options: MenueOption[] } {
  const liste = kategorien ?? []
  const geoeffnet = offen === null ? undefined : liste.find(kategorie => kategorie.name === offen)
  const eindeutig = (options: MenueOption[]): MenueOption[] => {
    const gesehen = new Set<string>()
    return options.filter(option => !gesehen.has(option.value) && (gesehen.add(option.value), true))
  }
  if (geoeffnet === undefined) {
    return {
      offen: null,
      options: eindeutig([{ value: '', label: kopf }, ...liste.slice(0, max).map(k => ({ value: `k:${k.name}`, label: `${k.name} (${k.skills.length})` }))]),
    }
  }
  return {
    offen: geoeffnet,
    options: eindeutig([
      { value: '', label: `${kopf} ${geoeffnet.name}` },
      { value: ZURUECK, label: ZURUECK_TEXT },
      ...geoeffnet.skills.slice(0, max).map(skill => ({ value: `s:${skill}`, label: skill })),
    ]),
  }
}

/** What a picked value means (menueStufe's values). */
export function leseWahl(value: string): MenueWahl {
  if (value === ZURUECK) return { art: 'zurueck' }
  if (value.startsWith('k:') && value.length > 2) return { art: 'kategorie', name: value.slice(2) }
  if (value.startsWith('s:') && value.length > 2) return { art: 'skill', name: value.slice(2) }
  return null
}

/** "1 Skill", "3 Skills". */
export const skillsText = (n: number): string => (n === 1 ? '1 Skill' : `${n} Skills`)

/**
 * The menu as text, for the command: a heading per category, each skill as `/name` below it; what did not fit in the
 * menu under "Nicht im Menü".
 */
export function kategorienText(namen: readonly string[], kategorien: readonly SkillKategorie[]): string {
  const imMenue = new Set(kategorien.flatMap(kategorie => kategorie.skills))
  const fehlen = sortiere(namen).filter(name => !imMenue.has(name))
  const bloecke = [
    ...kategorien.map(kategorie => [kategorie.name, ...kategorie.skills.map(skill => `/${skill}`)].join('\n')),
    ...(fehlen.length === 0 ? [] : [['Nicht im Menü', ...fehlen.map(skill => `/${skill}`)].join('\n')]),
  ]
  return [`${skillsText(new Set(namen).size)} in dieser Sitzung:`, ...bloecke].join('\n\n')
}
