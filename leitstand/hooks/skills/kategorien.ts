import type { SkillKategorie } from '../../types'

/**
 * Skill menu: the skills of this session in categories, each with a short description, for the hover menu 🧩. Pure,
 * without `$`: the part (teil.tsx) loads the names and asks Haiku, the band (glance.tsx) draws the menu.
 *
 * The menu is a popover of the desktop app over 🧩: the categories on the left, the skills of the one under the
 * pointer on the right, a short description as a tooltip over each. At most `max` (12) categories of at most `max`
 * skills each, 144 in all. What does not fit is left out and said (`weggelassen`). The app makes the popover at most
 * 360 px wide; what would be wider is never cut, only said (passtNicht).
 */

/** The categories and the skills that did not fit. */
export type SkillMenue = { readonly kategorien: SkillKategorie[]; readonly weggelassen: string[] }

/** The short descriptions, by the skill's full name. */
export type Kurz = Readonly<Record<string, string>>

/** Haiku's answer: the categories, and a short description for the skills it gave one. */
export type ModellMenue = SkillMenue & { readonly kurz: Record<string, string> }

/** What the store holds for a hash, checked: the categories and Haiku's short descriptions. */
export type Gespeichert = { readonly kategorien: SkillKategorie[]; readonly kurz: Record<string, string> }

/** Entries per column: the limit for categories and for skills per category. */
export const MAX_EINTRAEGE = 12

/** The category that takes small groups, the skills without a plugin and whatever has no other place. */
export const WEITERE = 'Weitere'

/** The version of Haiku's prompt: it heads the hash, so categories sorted by an older prompt no longer count. */
export const PROMPT_VERSION = 3

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
  return name === '' ? WEITERE : name
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
  // Every name once: the menu's hover groups go by the place, the text by the name.
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
 * The skills by plugin: the part before the colon, in readable words; names without one in "Weitere". Within `max`
 * categories of at most `max` skills (ordne).
 */
export function nachPlugin(namen: readonly string[], max = MAX_EINTRAEGE): SkillMenue {
  const gruppen = new Map<string, string[]>()
  const rest: string[] = []
  for (const name of sortiere(namen)) {
    const doppelpunkt = name.indexOf(':')
    const gruppe = doppelpunkt > 0 ? lesbar(name.slice(0, doppelpunkt)) : WEITERE
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

const istObjekt = (wert: unknown): wert is Record<string, unknown> => wert !== null && typeof wert === 'object' && !Array.isArray(wert)

/** Short descriptions from an object `{ skill: "Satz." }`: known skills only, a text each, whitespace made single. */
function leseKurz(wert: unknown, bekannt: ReadonlySet<string>): Record<string, string> {
  const kurz: Record<string, string> = {}
  if (!istObjekt(wert)) return kurz
  for (const [schluessel, text] of Object.entries(wert)) {
    const name = schluessel.trim().replace(/^\//, '')
    if (!bekannt.has(name) || typeof text !== 'string' || Object.hasOwn(kurz, name)) continue
    const glatt = text.replace(/\s+/g, ' ').trim()
    if (glatt !== '') kurz[name] = glatt
  }
  return kurz
}

/**
 * Haiku's answer, `{ "kategorien": { "<Kategorie>": ["skill", ...] }, "kurz": { "skill": "Satz." } }`, also in a
 * ```json block (the older form, the categories alone, still counts): unknown names leave, a skill named twice counts
 * where it came first, the missing go to Weitere, and the limits hold as for nachPlugin. A short description is
 * optional per skill. Null when the answer holds no such object or places no known skill.
 */
export function ausModellAntwort(text: string, namen: readonly string[], max = MAX_EINTRAEGE): ModellMenue | null {
  const wert = jsonAus(text)
  if (!istObjekt(wert)) return null
  const istNeu = istObjekt(wert.kategorien)
  const quelle = istNeu ? (wert.kategorien as Record<string, unknown>) : wert
  const bekannt = new Set(namen)
  const vergeben = new Set<string>()
  const gruppen = new Map<string, string[]>()
  const anzeige = new Map<string, string>()
  const rest: string[] = []
  for (const [schluessel, skills] of Object.entries(quelle)) {
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
  return { ...ordne(gruppen, rest, max), kurz: istNeu ? leseKurz(wert.kurz, bekannt) : {} }
}

/**
 * What the store holds for this hash, checked before use: categories with a name each, unique; at most `max`
 * categories of at most `max` skills; every skill one of `namen`, and only once. Null otherwise. The short
 * descriptions are kept where they name a known skill, the rest dropped.
 */
export function pruefeGespeichert(wert: unknown, hash: string, namen: readonly string[], max = MAX_EINTRAEGE): Gespeichert | null {
  if (wert === null || typeof wert !== 'object') return null
  const { hash: gespeichert, kategorien, kurz } = wert as { hash?: unknown; kategorien?: unknown; kurz?: unknown }
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
  return { kategorien: ergebnis, kurz: leseKurz(kurz, bekannt) }
}

/** A short, stable hash of the names, sorted (djb2, no cryptography): the count, then the hash in base 36. */
export function kategorienHash(namen: readonly string[]): string {
  const sortiert = sortiere(namen)
  let hash = 5381
  for (const zeichen of sortiert.join('\n')) hash = (Math.imul(hash, 33) + zeichen.codePointAt(0)!) >>> 0
  return `${sortiert.length}-${hash.toString(36)}`
}

/** The hash the store keeps the menu under: the prompt's version, then kategorienHash. */
export const menueHash = (namen: readonly string[]): string => `p${PROMPT_VERSION}-${kategorienHash(namen)}`

/** Short words a full stop follows without ending the sentence (z. B., e.g., bzw.). */
const ABKUERZUNGEN = new Set(['bzw', 'ca', 'eg', 'etc', 'evtl', 'ggf', 'ie', 'inkl', 'nr', 'usw', 'vgl', 'vs'])

/**
 * The first whole sentence of a description, never cut within it: up to the first `.`, `!` or `?` before a space or
 * the end, past abbreviations (a single letter, z. B., e.g.). The whole text when no sentence ends.
 */
export function ersterSatz(text: string): string {
  const glatt = text.replace(/\s+/g, ' ').trim()
  for (const treffer of glatt.matchAll(/[.!?](?= |$)/g)) {
    const bis = treffer.index ?? 0
    const wort = (/[\p{L}.]+$/u.exec(glatt.slice(0, bis))?.[0] ?? '').replace(/\./g, '').toLowerCase()
    if (treffer[0] === '.' && (wort.length === 1 || ABKUERZUNGEN.has(wort))) continue
    return glatt.slice(0, bis + 1)
  }
  return glatt
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
    'Ordne nach dem Anwendungsfall, nicht nach Herkunft oder Plugin; eigene Skills gehören wie alle anderen in die passende Kategorie.',
    'Jede Kategorie bekommt einen deutschen Namen aus EINEM Wort (ein zusammengesetztes Wort oder eines mit Bindestrich ist erlaubt), höchstens 14 Zeichen, ohne "&" und ohne "und", etwa "Einstellungen", "Dokumente", "Recherche" oder "Code-Qualität".',
    'Jeder Skill kommt genau einmal vor, höchstens 12 Skills je Kategorie.',
    'Schreib zu jedem Skill eine deutsche Kurzbeschreibung in einem Satz, höchstens 90 Zeichen: was man damit tut.',
    'Schreib die Namen der Skills genau so, wie sie in der Liste stehen, ohne Schrägstrich davor.',
    'Antworte nur mit JSON in dieser Form, ohne weiteren Text:',
    '{"kategorien": {"Kategorie": ["skill-a", "skill-b"], "Andere Kategorie": ["skill-c"]}, "kurz": {"skill-a": "Satz.", "skill-b": "Satz.", "skill-c": "Satz."}}',
    '',
    'Skills:',
    ...zeilen,
  ].join('\n')
}

/** The categories the band draws: at most `max` of at most `max` skills each. */
export const imBand = (kategorien: readonly SkillKategorie[], max = MAX_EINTRAEGE): SkillKategorie[] =>
  kategorien.slice(0, max).map(kategorie => ({ name: kategorie.name, skills: kategorie.skills.slice(0, max) }))

/** A skill's label in the menu: without the part before the colon, else whole; never cut. */
export const skillLabel = (name: string): string => (name.indexOf(':') > 0 ? name.slice(name.indexOf(':') + 1) : name)

/** A category's label in the menu: its name and the arrow towards its skills. */
export const kategorieLabel = (name: string): string => `${name} ›`

/** The popover's room: the app makes it at most 360 px wide, less its own edge about 340 px. */
export const POPOVER_PX = 340
/** Measured in the app: about 6.2 px a letter, 16 px an emoji, 24 px of padding a button. */
const PX_JE_ZEICHEN = 6.2
const PX_JE_EMOJI = 16
const KNOPF_RAND_PX = 24
/** px a ch, for the width of the right column. */
const PX_JE_CH = 8
/** The padding between the columns: paddingRight on the left, paddingLeft on the right, 1 ch each. */
const SPALTEN_RAND_PX = 8

/** The width of a button in the desktop app, in px. */
export function knopfPx(label: string): number {
  let breite = 0
  for (const zeichen of label) breite += /\p{Extended_Pictographic}/u.test(zeichen) ? PX_JE_EMOJI : PX_JE_ZEICHEN
  return breite + KNOPF_RAND_PX
}

/**
 * The menu's measures: the left column and the right in px, the right one's width W in ch and its height H in rows,
 * enough for the largest category (a button a row, 0.6 between two), and the whole popover in px.
 */
export function menueMasse(kategorien: readonly SkillKategorie[]): { linksPx: number; rechtsPx: number; breite: number; hoehe: number; gesamtPx: number } {
  const linksPx = kategorien.reduce((max, k) => Math.max(max, knopfPx(kategorieLabel(k.name))), 0) + SPALTEN_RAND_PX
  const rechtsPx = kategorien.reduce((max, k) => k.skills.reduce((m, s) => Math.max(m, knopfPx(skillLabel(s))), max), 0) + SPALTEN_RAND_PX
  const n = kategorien.reduce((max, k) => Math.max(max, k.skills.length), 0)
  const breite = Math.ceil(rechtsPx / PX_JE_CH)
  return { linksPx, rechtsPx, breite, hoehe: n === 0 ? 0 : Math.ceil(n + (n - 1) * 0.6), gesamtPx: Math.round(linksPx + breite * PX_JE_CH) }
}

/** What makes the menu wider than the popover: the categories too wide for half of it, the skills too wide beside the left column. */
export type ZuBreit = { readonly gesamtPx: number; readonly kategorien: string[]; readonly skills: string[] }

/**
 * Null when the menu fits in POPOVER_PX; else how wide it is and what makes it so. Nothing is cut: the band draws it
 * as it is. When no single entry is too wide by itself, the skills with the widest label are named.
 */
export function passtNicht(kategorien: readonly SkillKategorie[]): ZuBreit | null {
  const { linksPx, gesamtPx } = menueMasse(kategorien)
  if (gesamtPx <= POPOVER_PX) return null
  const breite = kategorien.filter(k => knopfPx(kategorieLabel(k.name)) + SPALTEN_RAND_PX > POPOVER_PX / 2).map(k => k.name)
  const alle = kategorien.flatMap(k => k.skills)
  let skills = alle.filter(s => linksPx + knopfPx(skillLabel(s)) + SPALTEN_RAND_PX > POPOVER_PX)
  if (breite.length === 0 && skills.length === 0) {
    const weiteste = alle.reduce((max, s) => Math.max(max, knopfPx(skillLabel(s))), 0)
    skills = alle.filter(s => knopfPx(skillLabel(s)) === weiteste)
  }
  return { gesamtPx, kategorien: breite, skills: sortiere(skills) }
}

/** "1 Skill", "3 Skills". */
export const skillsText = (n: number): string => (n === 1 ? '1 Skill' : `${n} Skills`)

/** A skill as a line of the text: `/name: Kurzbeschreibung`, or `/name` without one. */
const zeile = (skill: string, kurz: Kurz): string => (Object.hasOwn(kurz, skill) && kurz[skill] !== '' ? `/${skill}: ${kurz[skill]}` : `/${skill}`)

/**
 * The menu as text, for the command: a heading per category, each skill as `/name: Kurzbeschreibung` below it; what
 * did not fit in the menu under "Nicht im Menü"; what makes the menu too wide under "Passt nicht in das Menü".
 */
export function kategorienText(namen: readonly string[], kategorien: readonly SkillKategorie[], kurz: Kurz = {}): string {
  const imMenue = new Set(kategorien.flatMap(kategorie => kategorie.skills))
  const fehlen = sortiere(namen).filter(name => !imMenue.has(name))
  const zuBreit = passtNicht(imBand(kategorien))
  const bloecke = [
    ...kategorien.map(kategorie => [kategorie.name, ...kategorie.skills.map(skill => zeile(skill, kurz))].join('\n')),
    ...(fehlen.length === 0 ? [] : [['Nicht im Menü', ...fehlen.map(skill => zeile(skill, kurz))].join('\n')]),
    ...(zuBreit === null
      ? []
      : [
          [
            'Passt nicht in das Menü',
            `Das Menü wäre etwa ${zuBreit.gesamtPx} px breit, Platz ist für etwa ${POPOVER_PX} px. Zu breit:`,
            ...zuBreit.kategorien.map(name => `Kategorie ${name}`),
            ...zuBreit.skills.map(skill => `/${skill}`),
          ].join('\n'),
        ]),
  ]
  return [`${skillsText(new Set(namen).size)} in dieser Sitzung:`, ...bloecke].join('\n\n')
}
