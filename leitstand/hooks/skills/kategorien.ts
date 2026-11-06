import type { SkillKategorie } from '../../types'

/**
 * Skill menu: the skills of this session in categories, each with a short description, for the pane Skills. Pure,
 * without `$`: the part (teil.tsx) loads the names, asks Haiku and draws the pane.
 *
 * Taken over from the probe mod skill-probe, where it proved itself live: Haiku sorts by purpose into categories of two
 * or three words, without a catch-all; a second, small call places the skills the first left out into the categories
 * it made; only what is left after that goes into exactly one group "Weitere". No limit splits a category. The short
 * descriptions come in calls of their own, at most 20 skills each. Until Haiku has sorted, the pane waits; when Haiku
 * failed and nothing sorted earlier is kept, the skills stand by plugin (nachPlugin).
 */

/** At most so many categories from Haiku; "Weitere" may be one more. */
export const MAX_KATEGORIEN = 12
/** At most so many skills a category; the rest counts as left out. */
export const MAX_SKILLS = 15
/** The one group for what not even the second call could place, and for the skills without a plugin in nachPlugin. */
export const WEITERE = 'Weitere'
/** The version of Haiku's prompts: it heads the hash, so categories sorted by an older prompt no longer count. */
export const PROMPT_VERSION = 5
/** How much of a description the prompts carry per skill. */
export const BESCHREIBUNG_MAX = 100
/** At most so many skills in one call for short descriptions. */
export const KURZ_PAECKCHEN = 20

/** The short descriptions, by the skill's full name. */
export type Kurz = Readonly<Record<string, string>>

/** Names of catch-all categories Haiku is not to give; their skills count as left out. */
const SAMMEL = new Set(['weitere', 'sonstiges', 'sonstige', 'allgemein', 'allgemeines', 'diverses', 'verschiedenes', 'andere', 'anderes'])
export const istSammel = (name: string): boolean => SAMMEL.has(name.trim().toLowerCase())

export const sortiere = (namen: Iterable<string>): string[] => [...new Set(namen)].sort((a, b) => a.localeCompare(b, 'de'))

/** Categories with their skills, in the order they came. */
export type Gruppen = Map<string, string[]>

/** What an answer of Haiku gave: the groups, the short descriptions, and what found no place. */
export type Gelesen = { readonly gruppen: Gruppen; readonly kurz: Record<string, string>; readonly rest: string[] }

/** Why an answer could not be read. */
export type Lesefehler = { readonly fehler: string }

/** The object that starts at `ab`, up to its closing brace (strings respected); null when it does not end. */
function objektAb(text: string, ab: number): string | null {
  let tiefe = 0
  let imString = false
  for (let i = ab; i < text.length; i++) {
    const c = text[i]
    if (imString) {
      if (c === '\\') i++
      else if (c === '"') imString = false
    } else if (c === '"') imString = true
    else if (c === '{') tiefe++
    else if (c === '}' && --tiefe === 0) return text.slice(ab, i + 1)
  }
  return null
}

/**
 * The JSON in a model's answer, or why none could be read. Tries in turn: a ```json block (also without closing
 * fences), the first whole object from the first `{`, and from the first `{` to the last `}`. A cut-off answer says so.
 */
export function jsonAus(text: string): { readonly wert: unknown } | Lesefehler {
  const block = /```(?:json)?\s*([\s\S]*?)(?:```|$)/i.exec(text)?.[1]
  const start = text.indexOf('{')
  if (start < 0) return { fehler: 'kein JSON gefunden (keine "{" in der Antwort)' }
  const kandidaten = [block, objektAb(text, start), text.slice(start, text.lastIndexOf('}') + 1)].filter(
    (k): k is string => k !== undefined && k !== null && k.trim().startsWith('{'),
  )
  let ersterFehler = ''
  for (const kandidat of kandidaten) {
    try {
      return { wert: JSON.parse(kandidat.trim()) }
    } catch (fehler) {
      if (ersterFehler === '') ersterFehler = fehler instanceof Error ? fehler.message : String(fehler)
    }
  }
  if (objektAb(text, start) === null) return { fehler: `JSON endet nicht (keine schließende Klammer, vermutlich abgeschnitten)${ersterFehler === '' ? '' : `; JSON.parse: ${ersterFehler}`}` }
  return { fehler: `JSON.parse: ${ersterFehler}` }
}

const istObjekt = (wert: unknown): wert is Record<string, unknown> => wert !== null && typeof wert === 'object' && !Array.isArray(wert)
const glatt = (text: string): string => text.replace(/\s+/g, ' ').trim()
const skillName = (text: string): string => text.trim().replace(/^\//, '')

/** Short descriptions from `{ skill: "Satz." }`: known skills only, a text each, whitespace made single. */
function leseKurz(wert: unknown, bekannt: ReadonlySet<string>): Record<string, string> {
  const kurz: Record<string, string> = {}
  if (!istObjekt(wert)) return kurz
  for (const [schluessel, text] of Object.entries(wert)) {
    const name = skillName(schluessel)
    if (!bekannt.has(name) || typeof text !== 'string' || Object.hasOwn(kurz, name)) continue
    const satz = glatt(text)
    if (satz !== '') kurz[name] = satz
  }
  return kurz
}

/** Finds a category already there, whatever its case. */
function findeGruppe(gruppen: ReadonlyMap<string, unknown>, name: string): string | undefined {
  const klein = glatt(name).toLowerCase()
  for (const vorhanden of gruppen.keys()) if (vorhanden.toLowerCase() === klein) return vorhanden
  return undefined
}

/**
 * Haiku's main answer `{ "kategorien": { "<Kategorie>": ["skill", ...] } }`: unknown names leave, a skill named twice
 * counts where it came first. Catch-all categories, categories past MAX_KATEGORIEN and skills past MAX_SKILLS a
 * category go to the rest, as do the skills it left out. Names are never cut. A Lesefehler says why it failed.
 */
export function leseHauptantwort(text: string, namen: readonly string[]): Gelesen | Lesefehler {
  const json = jsonAus(text)
  if ('fehler' in json) return json
  const wert = json.wert
  if (!istObjekt(wert)) return { fehler: 'JSON gelesen, aber kein Objekt' }
  if (!istObjekt(wert.kategorien)) return { fehler: `JSON gelesen, aber ohne Objekt "kategorien" (Schlüssel: ${Object.keys(wert).slice(0, 5).join(', ') || 'keine'})` }
  const bekannt = new Set(namen)
  const vergeben = new Set<string>()
  const gruppen: Gruppen = new Map()
  const rest: string[] = []
  for (const [schluessel, skills] of Object.entries(wert.kategorien)) {
    const name = glatt(schluessel)
    if (name === '' || !Array.isArray(skills)) continue
    const gefunden = skills.flatMap(skill => {
      if (typeof skill !== 'string') return []
      const s = skillName(skill)
      if (!bekannt.has(s) || vergeben.has(s)) return []
      vergeben.add(s)
      return [s]
    })
    if (gefunden.length === 0) continue
    const vorhanden = findeGruppe(gruppen, name)
    if (istSammel(name) || (vorhanden === undefined && gruppen.size >= MAX_KATEGORIEN)) {
      rest.push(...gefunden)
      continue
    }
    const ziel = vorhanden ?? name
    const liste = gruppen.get(ziel) ?? []
    for (const s of gefunden) (liste.length < MAX_SKILLS ? liste : rest).push(s)
    gruppen.set(ziel, liste)
  }
  if (vergeben.size === 0) {
    const genannt = Object.values(wert.kategorien).flatMap(skills => (Array.isArray(skills) ? skills.filter((x): x is string => typeof x === 'string') : []))
    return {
      fehler: `JSON gelesen, aber 0 bekannte Skills (${Object.keys(wert.kategorien).length} Kategorien; genannt: ${genannt.slice(0, 3).join(', ') || 'keine'}; erwartet: ${namen.slice(0, 3).join(', ')})`,
    }
  }
  for (const name of namen) if (!vergeben.has(name)) rest.push(name)
  return { gruppen, kurz: leseKurz(wert.kurz, bekannt), rest: sortiere(rest) }
}

/**
 * The answer of the second call `{ "zuordnung": { "skill": "Kategorie" } }`: each skill of `fehlend` goes into the
 * category it names, when that is one already there with fewer than MAX_SKILLS; the others stay in the rest. Null
 * when the answer holds no such object.
 */
export function leseNachtrag(text: string, fehlend: readonly string[], gruppenEin: ReadonlyMap<string, readonly string[]>): Gelesen | null {
  const json = jsonAus(text)
  const wert = 'wert' in json ? json.wert : undefined
  if (!istObjekt(wert) || !istObjekt(wert.zuordnung)) return null
  const gruppen: Gruppen = new Map([...gruppenEin].map(([name, skills]) => [name, [...skills]]))
  const offen = new Set(fehlend)
  for (const [schluessel, kategorie] of Object.entries(wert.zuordnung)) {
    const s = skillName(schluessel)
    if (!offen.has(s) || typeof kategorie !== 'string') continue
    const ziel = findeGruppe(gruppen, kategorie)
    const liste = ziel === undefined ? undefined : gruppen.get(ziel)
    if (liste === undefined || liste.length >= MAX_SKILLS) continue
    liste.push(s)
    offen.delete(s)
  }
  return { gruppen, kurz: leseKurz(wert.kurz, new Set(fehlend)), rest: sortiere(offen) }
}

/** The finished categories: skills sorted, categories in Haiku's order, the rest as exactly one group "Weitere", last. */
export function fertig(gruppen: ReadonlyMap<string, readonly string[]>, rest: readonly string[]): SkillKategorie[] {
  const kategorien = [...gruppen].filter(([, skills]) => skills.length > 0).map(([name, skills]) => ({ name, skills: sortiere(skills) }))
  return rest.length === 0 ? kategorien : [...kategorien, { name: WEITERE, skills: sortiere(rest) }]
}

/** A short, stable hash of the names, sorted (djb2, no cryptography): the count, then the hash in base 36. */
export function kategorienHash(namen: readonly string[]): string {
  const sortiert = sortiere(namen)
  let hash = 5381
  for (const zeichen of sortiert.join('\n')) hash = (Math.imul(hash, 33) + zeichen.codePointAt(0)!) >>> 0
  return `${sortiert.length}-${hash.toString(36)}`
}

/** The hash the store keeps the sorting under: the prompt's version, then kategorienHash. */
export const menueHash = (namen: readonly string[]): string => `p${PROMPT_VERSION}-${kategorienHash(namen)}`

/** What the store gives for the names of now (ladeGespeichert). */
export type AusDemSpeicher = {
  /** The same skills, nothing open: done without Haiku. */
  readonly gleich: boolean
  readonly gruppen: Gruppen
  /** Haiku's short descriptions of the known skills. */
  readonly kurz: Record<string, string>
  /** The same skills: those that were in "Weitere"; they stay there, without a new call. */
  readonly weitere: string[]
  /** Skills without a category: new ones, and when the skills changed, also those in "Weitere" so far. */
  readonly neu: string[]
}

/**
 * What the store holds, read against the names of now. Null when it holds nothing of this prompt's version. Else the
 * known categories without the skills that left (empty ones drop out), and the short descriptions of the known skills.
 * With the same skills "Weitere" stays as it was; when they changed, its skills get the second call with the new ones.
 */
export function ladeGespeichert(wert: unknown, namen: readonly string[]): AusDemSpeicher | null {
  if (!istObjekt(wert) || typeof wert.hash !== 'string' || !wert.hash.startsWith(`p${PROMPT_VERSION}-`) || !Array.isArray(wert.kategorien)) return null
  const bekannt = new Set(namen)
  const vergeben = new Set<string>()
  const gruppen: Gruppen = new Map()
  for (const kategorie of wert.kategorien as unknown[]) {
    if (!istObjekt(kategorie) || typeof kategorie.name !== 'string' || !Array.isArray(kategorie.skills)) return null
    if (kategorie.name === WEITERE) continue
    const skills = (kategorie.skills as unknown[]).filter((s): s is string => typeof s === 'string' && bekannt.has(s) && !vergeben.has(s)).slice(0, MAX_SKILLS)
    for (const s of skills) vergeben.add(s)
    if (skills.length > 0 && findeGruppe(gruppen, kategorie.name) === undefined) gruppen.set(kategorie.name, skills)
  }
  if (gruppen.size === 0) return null
  const offen = sortiere(namen.filter(n => !vergeben.has(n)))
  const kurz = leseKurz(wert.kurz, bekannt)
  if (wert.hash === menueHash(namen)) return { gleich: true, gruppen, kurz, weitere: offen, neu: [] }
  return { gleich: false, gruppen, kurz, weitere: [], neu: offen }
}

/** Short words a full stop follows without ending the sentence (z. B., e.g., bzw.). */
const ABKUERZUNGEN = new Set(['bzw', 'ca', 'eg', 'etc', 'evtl', 'ggf', 'ie', 'inkl', 'nr', 'usw', 'vgl', 'vs'])

/**
 * The first whole sentence of a description, never cut within it: up to the first `.`, `!` or `?` before a space or
 * the end, past abbreviations (a single letter, z. B., e.g.). The whole text when no sentence ends.
 */
export function ersterSatz(text: string): string {
  const g = glatt(text)
  for (const treffer of g.matchAll(/[.!?](?= |$)/g)) {
    const bis = treffer.index ?? 0
    const wort = (/[\p{L}.]+$/u.exec(g.slice(0, bis))?.[0] ?? '').replace(/\./g, '').toLowerCase()
    if (treffer[0] === '.' && (wort.length === 1 || ABKUERZUNGEN.has(wort))) continue
    return g.slice(0, bis + 1)
  }
  return g
}

/** The short descriptions until Haiku gives its own: the first sentence of each skill's description, where it has one. */
export function kurzAusBeschreibungen(namen: readonly string[], beschreibungen: ReadonlyMap<string, string>): Record<string, string> {
  const kurz: Record<string, string> = {}
  for (const name of namen) {
    const satz = ersterSatz(beschreibungen.get(name) ?? '')
    if (satz !== '') kurz[name] = satz
  }
  return kurz
}

/** A line a skill, `- name: start of the description`, sorted. */
function skillZeilen(namen: readonly string[], beschreibungen: ReadonlyMap<string, string>): string[] {
  return sortiere(namen).map(name => {
    const beschreibung = glatt(beschreibungen.get(name) ?? '').slice(0, BESCHREIBUNG_MAX).trim()
    return beschreibung === '' ? `- ${name}` : `- ${name}: ${beschreibung}`
  })
}

const NAMEN_SATZ = 'Schreib die Namen der Skills genau so, wie sie in der Liste stehen, ohne Schrägstrich davor.'

/** The prompt for Haiku's main sorting: categories only, no short descriptions. */
export function haikuPrompt(namen: readonly string[], beschreibungen: ReadonlyMap<string, string> = new Map()): string {
  return [
    'Ordne die folgenden Skills von Claude Code in 4 bis 12 Kategorien nach ihrem Zweck.',
    'Ordne nach dem Anwendungsfall, nicht nach Herkunft oder Plugin; eigene Skills gehören wie alle anderen in die passende Kategorie.',
    'Jede Kategorie bekommt einen sprechenden deutschen Namen aus zwei bis drei Wörtern, der sagt, wofür man die Skills nutzt, höchstens 24 Zeichen, etwa "Code prüfen", "Texte überarbeiten", "Browser steuern" oder "Dokumente erstellen".',
    'Keine Sammelkategorie wie "Weitere", "Sonstiges", "Allgemein" oder "Diverses": Jeder Skill kommt in die Kategorie, zu der er am besten passt.',
    'Jeder Skill kommt genau einmal vor, höchstens 15 Skills je Kategorie.',
    NAMEN_SATZ,
    'Antworte nur mit JSON in dieser Form, ohne weiteren Text:',
    '{"kategorien": {"Kategorie": ["skill-a", "skill-b"], "Andere Kategorie": ["skill-c"]}}',
    '',
    'Skills:',
    ...skillZeilen(namen, beschreibungen),
  ].join('\n')
}

/** The prompt for the second call: only the skills left out, only the categories already there. */
export function nachtragPrompt(fehlend: readonly string[], kategorien: readonly string[], beschreibungen: ReadonlyMap<string, string> = new Map()): string {
  return [
    'Ordne jeden dieser Skills von Claude Code genau einer der vorhandenen Kategorien zu, nach dem Anwendungsfall.',
    'Nimm nur Kategorien aus der Liste, genau so geschrieben; erfinde keine neue und keine Sammelkategorie.',
    NAMEN_SATZ,
    'Antworte nur mit JSON in dieser Form, ohne weiteren Text:',
    '{"zuordnung": {"skill-a": "Kategorie", "skill-b": "Andere Kategorie"}}',
    '',
    'Kategorien:',
    ...kategorien.map(k => `- ${k}`),
    '',
    'Skills:',
    ...skillZeilen(fehlend, beschreibungen),
  ].join('\n')
}

/** The list in parcels of at most `groesse`. */
export function paeckchen<T>(liste: readonly T[], groesse: number): T[][] {
  const stuecke: T[][] = []
  for (let i = 0; i < liste.length; i += groesse) stuecke.push(liste.slice(i, i + groesse))
  return stuecke
}

/** The prompt for a parcel of short descriptions. */
export function kurzPrompt(skills: readonly string[], beschreibungen: ReadonlyMap<string, string> = new Map()): string {
  return [
    'Schreib zu jedem dieser Skills von Claude Code eine deutsche Kurzbeschreibung in einem Satz, höchstens 90 Zeichen: was man damit tut.',
    NAMEN_SATZ,
    'Antworte nur mit JSON in dieser Form, ohne weiteren Text:',
    '{"kurz": {"skill-a": "Satz.", "skill-b": "Satz."}}',
    '',
    'Skills:',
    ...skillZeilen(skills, beschreibungen),
  ].join('\n')
}

/** The answer to a parcel: skills of the parcel only. Null when no object "kurz" can be read. */
export function leseKurzAntwort(text: string, skills: readonly string[]): Record<string, string> | null {
  const json = jsonAus(text)
  const wert = 'wert' in json ? json.wert : undefined
  if (!istObjekt(wert) || !istObjekt(wert.kurz)) return null
  return leseKurz(wert.kurz, new Set(skills))
}

/** Words a plugin's name drops for the category, while any other word remains. */
const FUELLWOERTER = new Set(['skill', 'skills', 'plugin', 'plugins'])

/** A plugin's name as a category: `anthropic-skills` to "Anthropic", `pdf-viewer` to "Pdf Viewer". */
export function lesbar(plugin: string): string {
  const woerter = plugin.split(/[-_\s]+/).filter(wort => wort !== '')
  const bleiben = woerter.filter(wort => !FUELLWOERTER.has(wort.toLowerCase()))
  const gewaehlt = bleiben.length > 0 ? bleiben : woerter
  const name = gewaehlt.map(wort => wort.charAt(0).toUpperCase() + wort.slice(1)).join(' ')
  return name === '' ? WEITERE : name
}

/**
 * The skills by plugin, for when Haiku failed and nothing sorted earlier is kept: the part before the colon in
 * readable words, sorted by name; the names without one in "Weitere", last. No limits, no splitting.
 */
export function nachPlugin(namen: readonly string[]): SkillKategorie[] {
  const gruppen = new Map<string, string[]>()
  const rest: string[] = []
  for (const name of sortiere(namen)) {
    const doppelpunkt = name.indexOf(':')
    const gruppe = doppelpunkt > 0 ? lesbar(name.slice(0, doppelpunkt)) : WEITERE
    if (gruppe.toLowerCase() === WEITERE.toLowerCase()) rest.push(name)
    else gruppen.set(gruppe, [...(gruppen.get(gruppe) ?? []), name])
  }
  const kategorien = [...gruppen].sort(([a], [b]) => a.localeCompare(b, 'de')).map(([name, skills]) => ({ name, skills }))
  return rest.length === 0 ? kategorien : [...kategorien, { name: WEITERE, skills: rest }]
}

/** A skill's label in the pane: without the part before the colon, else whole; never cut. */
export const skillLabel = (name: string): string => (name.indexOf(':') > 0 ? name.slice(name.indexOf(':') + 1) : name)

/** "1 Skill", "3 Skills". */
export const skillsText = (n: number): string => (n === 1 ? '1 Skill' : `${n} Skills`)

/** A skill as a line of the text: `/name: Kurzbeschreibung`, or `/name` without one. */
const zeile = (skill: string, kurz: Kurz): string => (Object.hasOwn(kurz, skill) && kurz[skill] !== '' ? `/${skill}: ${kurz[skill]}` : `/${skill}`)

/**
 * The skills as text, for the command: a heading per category, each skill as `/name: Kurzbeschreibung` below it; the
 * skills no category holds yet (new ones while Haiku places them) under "Noch ohne Kategorie".
 */
export function kategorienText(namen: readonly string[], kategorien: readonly SkillKategorie[], kurz: Kurz = {}): string {
  const eingeordnet = new Set(kategorien.flatMap(kategorie => kategorie.skills))
  const fehlen = sortiere(namen).filter(name => !eingeordnet.has(name))
  const bloecke = [
    ...kategorien.map(kategorie => [kategorie.name, ...kategorie.skills.map(skill => zeile(skill, kurz))].join('\n')),
    ...(fehlen.length === 0 ? [] : [['Noch ohne Kategorie', ...fehlen.map(skill => zeile(skill, kurz))].join('\n')]),
  ]
  return [`${skillsText(new Set(namen).size)} in dieser Sitzung:`, ...bloecke].join('\n\n')
}
