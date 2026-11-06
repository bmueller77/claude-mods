import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, PluginOptions } from 'claude-code'

import type { SkillKategorie } from '../../types'
import { merkeAntwort } from '../antwort'
import { befehlsHilfe, fragtNachHilfe, kurzform } from '../logic'
import { KNOPF_SKILLS, SKILLS_BEFEHLE } from './befehle'
import {
  KURZ_PAECKCHEN,
  WEITERE,
  fertig,
  haikuPrompt,
  kategorienText,
  kurzAusBeschreibungen,
  kurzPrompt,
  ladeGespeichert,
  leseHauptantwort,
  leseKurzAntwort,
  leseNachtrag,
  menueHash,
  nachPlugin,
  nachtragPrompt,
  paeckchen,
  skillLabel,
  skillsText,
} from './kategorien'
import type { Gruppen, Kurz } from './kategorien'

/**
 * Skill menu: the pane Skills with the skills of this session in categories, each skill a button with its short
 * description behind it; a click starts the skill. A press of 🧩 in the band opens it (the Leitstand draws the
 * button, this part answers the press); the command opens it too, or answers with the list as text where no pane shows.
 *
 * The skills come from the context breakdown (`$.session.usage({ breakdown: 'summary' })`, its `skills` listing, which
 * names each skill and its plugin), matched against `$.command.list()` for the name the person types and the line it
 * shows. The list is loaded at the session's start and at the end of each turn of the main loop, outside any drawing
 * and with a time limit: the pane only reads the state (`skillListe`, `skillMenue`, `skillKurz`, `skillVorlaeufig`).
 * Haiku sorts the skills by purpose (kategorien.ts), in the background, once per set of skills, kept in `$.store` under
 * its hash; until then the pane says it waits. With new skills the earlier sorting of the same prompt shows at once and
 * Haiku places only the new ones. Should Haiku fail with nothing sorted earlier, the pane shows the skills by plugin.
 */

type $ = EngineInterface

/** One skill as the context breakdown lists it. */
export type SkillEintrag = { readonly name: string; readonly pluginName?: string }

/** The Leitstand's own commands and skills stay out of the menu. */
const EIGENES = 'leitstand'

/** The pane Skills: its id and title. */
export const FENSTER = 'leitstand-skills'
export const TITEL = 'Skills'

/** The names to type for this session's skills, sorted; null until loaded. */
const LISTE = { plugin: 'leitstand', key: 'skillListe' } as const
const skillListeAtom = atom(LISTE, null as readonly string[] | null)

/** The categories the pane shows; null while Haiku sorts and nothing sorted earlier is known. */
const MENUE_ZUSTAND = { plugin: 'leitstand', key: 'skillMenue' } as const
const skillMenueAtom = atom(MENUE_ZUSTAND, null as readonly SkillKategorie[] | null)

/** The short descriptions the pane shows: Haiku's, else the first sentence of the description; null until known. */
const KURZ_ZUSTAND = { plugin: 'leitstand', key: 'skillKurz' } as const
const skillKurzAtom = atom(KURZ_ZUSTAND, null as Kurz | null)

/** Whether the categories are the plugins, for now, because Haiku failed and nothing sorted earlier is kept. */
const VORLAEUFIG_ZUSTAND = { plugin: 'leitstand', key: 'skillVorlaeufig' } as const
const skillVorlaeufigAtom = atom(VORLAEUFIG_ZUSTAND, false as boolean)

/** Haiku's sorting across sessions: `{ hash, kategorien, kurz }`, the hash of the prompt and the names it was made for. */
export const STORE_KATEGORIEN = 'skillKategorien'

/** How long a load of the list may take before the old list stays. */
export const LADEFRIST_MS = 10_000

/** How long a call to Haiku may take, and how long its answer may be: categories, and a parcel of short descriptions. */
export const HAIKU_FRIST_MS = 60_000
export const HAIKU_MAX_TOKENS = 8192
export const KURZ_MAX_TOKENS = 2048
/** Haiku thinks long otherwise: live, over 7,000 tokens went into thinking and the answer broke off. */
export const HAIKU_EFFORT = 'low' as const

const MENUE = SKILLS_BEFEHLE[0]!

/** The command names this part answers: the long form and, when the Leitstand gives it one, the short form. */
const BEFEHL_NAMEN: readonly string[] = SKILLS_BEFEHLE.flatMap(eintrag => {
  const kurz = kurzform(eintrag.name)
  return kurz === undefined ? [eintrag.name] : [eintrag.name, kurz]
})

export const OHNE_SKILLS = 'In dieser Sitzung sind keine Skills installiert.'
/** What the command says on the computer, where it opened the pane. */
export const IM_FENSTER = 'Die Skills stehen im Fenster "Skills".'
/** The pane's lines: while Haiku sorts, and when it failed with nothing sorted earlier. */
export const WARTEN = 'Haiku sortiert die Skills ...'
export const VORLAEUFIG = 'Haiku konnte nicht sortieren, vorläufig nach Plugin geordnet.'
/** The pane's first line over Haiku's categories. */
export const kopfzeile = (n: number): string => `${skillsText(n)} nach Anwendungsfall. Ein Klick startet den Skill.`

/** What the command says when it fails. */
export const fehlerText = (name: string): string =>
  `Das hat nicht geklappt: Im Leitstand ging beim Ausführen von /${name} etwas schief. Versuch es gleich noch einmal; /leitstand:hilfe zeigt alle Befehle.`

/**
 * The names to type for the skills, sorted, without duplicates and without the Leitstand's own. A plugin's skill is
 * named the way the command list has it (`plugin:skill` or bare); when the list has neither, `plugin:skill`.
 */
export function skillNamen(skills: readonly SkillEintrag[], befehle: readonly string[]): string[] {
  const bekannt = new Set(befehle)
  const namen = skills.flatMap(skill => {
    const name = skill.name.replace(/^\//, '').trim()
    if (name === '' || skill.pluginName === EIGENES) return []
    const mitPlugin = skill.pluginName !== undefined && skill.pluginName !== '' && !name.includes(':') ? `${skill.pluginName}:${name}` : name
    return [bekannt.has(mitPlugin) || !bekannt.has(name) ? mitPlugin : name]
  })
  return [...new Set(namen.filter(name => !name.startsWith(`${EIGENES}:`)))].sort((a, b) => a.localeCompare(b, 'de'))
}

/** The skills as text, for the command: the categories as headings, each skill as `/name: Kurzbeschreibung`. */
export function textListe(namen: readonly string[], kategorien: readonly SkillKategorie[] = nachPlugin(namen), kurz: Kurz = {}): string {
  if (namen.length === 0) return OHNE_SKILLS
  return kategorienText(namen, kategorien, kurz)
}

/** Whether two lists name the same skills in the same order. */
const gleich = (a: readonly string[] | null, b: readonly string[]): boolean =>
  a !== null && a.length === b.length && a.every((name, at) => name === b[at])

/** Whether two values are the same, as JSON. */
const gleichWie = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

// What only this load of the module needs.

/** Haiku's sorting of this load and of the store, by hash: the categories and Haiku's own short descriptions. */
const vomModell = new Map<string, { kategorien: SkillKategorie[]; kurz: Record<string, string> }>()
/** The hashes Haiku was asked for in this load: not asked again, whatever came of it. */
const versucht = new Set<string>()
/** The hashes Haiku is sorting right now. */
const laufend = new Set<string>()
/** The hashes whose sorting failed with nothing sorted earlier: the plugins stand for them. */
const gescheitert = new Set<string>()
/** The hashes whose short descriptions were asked for in this load. */
const kurzVersucht = new Set<string>()
/** Whether parcels of short descriptions are on their way: one run at a time. */
let kurzLaeuft = false
/** The hash of the list loaded last: Haiku's answer for an older one goes to the store only. */
let aktuellerHash: string | null = null
/** The short descriptions from the skills' own descriptions, for the list loaded last. */
let aktuellerRueckfall: Record<string, string> = {}
/** Whether a turn of the main loop runs: a click then says its skill waits in the queue. */
let hauptRundeLaeuft = false

/** The skills of this session and the line each one's command shows. */
type Geladen = { namen: string[]; beschreibungen: Map<string, string> }

/** Loads the skills of this session. Throws when the context breakdown fails; a failing command list counts as empty. */
async function ladeSkills($: $): Promise<Geladen> {
  const [usage, befehle] = await Promise.all([$.session.usage({ breakdown: 'summary' }), $.command.list().catch(() => [])])
  const skills = usage.context.breakdown?.skills?.skillFrontmatter ?? []
  const namen = skillNamen(skills, befehle.map(befehl => befehl.name))
  const beschreibungen = new Map(befehle.filter(befehl => typeof befehl.description === 'string').map(befehl => [befehl.name, befehl.description] as const))
  return { namen, beschreibungen }
}

/** Loads the skills within the time limit: the names, or null when the time ran out. */
async function ladeMitFrist($: $): Promise<Geladen | null> {
  let frist: { cancel: () => void } | undefined
  const abgelaufen = new Promise<null>(resolve => {
    frist = $.clock.after(LADEFRIST_MS, () => resolve(null))
  })
  try {
    return await Promise.race([ladeSkills($), abgelaufen])
  } finally {
    frist?.cancel()
  }
}

/**
 * Shows categories in the pane, while the list is still the one they were made for: writes the categories (null: the
 * pane waits), the short descriptions (Haiku's over the first sentences) and whether they are the plugins for now,
 * each only when it changed.
 */
async function zeige($: $, hash: string, kategorien: readonly SkillKategorie[] | null, haikuKurz: Kurz, vorlaeufig: boolean): Promise<void> {
  if (aktuellerHash !== hash) return
  const kurz = { ...aktuellerRueckfall, ...haikuKurz }
  if (!gleichWie(await read($, skillMenueAtom), kategorien)) await update($, skillMenueAtom, () => kategorien)
  if (!gleichWie(await read($, skillKurzAtom), kurz)) await update($, skillKurzAtom, () => kurz)
  if ((await read($, skillVorlaeufigAtom)) !== vorlaeufig) await update($, skillVorlaeufigAtom, () => vorlaeufig)
}

/** Keeps Haiku's sorting of this hash in the store, with its short descriptions. */
async function speichere($: $, hash: string): Promise<void> {
  const eintrag = vomModell.get(hash)
  if (eintrag === undefined) return
  await $.store.set(STORE_KATEGORIEN, { hash, kategorien: eintrag.kategorien, kurz: eintrag.kurz }).catch(() => undefined)
}

/** A call to Haiku with low effort and its time limit: the text, or why none came. Never throws. */
async function frage($: $, prompt: string, maxTokens: number): Promise<{ text: string } | { grund: string }> {
  try {
    const antwort = await $.model.complete({ model: 'haiku', prompt, maxTokens, effort: HAIKU_EFFORT, timeoutMs: HAIKU_FRIST_MS })
    if (antwort.isAnswered) return { text: antwort.text }
    if (antwort.reason === 'aborted') return { grund: `Zeitablauf (${HAIKU_FRIST_MS / 1000} s) oder abgebrochen` }
    if (antwort.reason === 'api-error') return { grund: `Fehler der API (${antwort.error}, Status ${antwort.status ?? 'keiner'})` }
    if (antwort.reason === 'empty-reply') return { grund: 'leere Antwort' }
    return { grund: `keine Antwort (${String((antwort as { reason?: unknown }).reason)})` }
  } catch (fehler) {
    return { grund: `Fehler von $.model.complete: ${fehler instanceof Error ? fehler.message : String(fehler)}` }
  }
}

/**
 * Places `fehlend` into the groups by the second call. What is left after it stays in the rest, with the reason when
 * the call itself failed. Never throws.
 */
async function nachtragen(
  $: $,
  gruppen: Gruppen,
  fehlend: readonly string[],
  beschreibungen: ReadonlyMap<string, string>,
): Promise<{ gruppen: Gruppen; rest: string[]; grund?: string }> {
  if (fehlend.length === 0) return { gruppen, rest: [] }
  const antwort = await frage($, nachtragPrompt(fehlend, [...gruppen.keys()], beschreibungen), HAIKU_MAX_TOKENS)
  if ('grund' in antwort) return { gruppen, rest: [...fehlend], grund: antwort.grund }
  const gelesen = leseNachtrag(antwort.text, fehlend, gruppen)
  if (gelesen === null) return { gruppen, rest: [...fehlend], grund: 'kein Objekt "zuordnung" in der Antwort' }
  return gelesen
}

/**
 * Asks Haiku for the short descriptions the skills of this hash do not have yet: parcels of at most KURZ_PAECKCHEN,
 * one after the other. Each parcel goes to the store and the pane at once; a failed one stops none of the others and
 * leaves a line in the debug log. Once per hash and load. Never throws.
 */
async function holeKurz($: $, hash: string, beschreibungen: ReadonlyMap<string, string>): Promise<void> {
  if (kurzLaeuft || kurzVersucht.has(hash) || !vomModell.has(hash)) return
  kurzVersucht.add(hash)
  kurzLaeuft = true
  try {
    const anfang = vomModell.get(hash)!
    const fehlend = anfang.kategorien.flatMap(kategorie => kategorie.skills).filter(name => !Object.hasOwn(anfang.kurz, name))
    const stuecke = paeckchen(fehlend, KURZ_PAECKCHEN)
    for (const [i, stueck] of stuecke.entries()) {
      const antwort = await frage($, kurzPrompt(stueck, beschreibungen), KURZ_MAX_TOKENS)
      const kurz = 'text' in antwort ? leseKurzAntwort(antwort.text, stueck) : null
      if (kurz === null || Object.keys(kurz).length === 0) {
        const grund = 'grund' in antwort ? antwort.grund : 'kein Objekt "kurz" in der Antwort'
        $.ui.log(`leitstand: skill short descriptions, parcel ${i + 1} of ${stuecke.length}, failed: ${grund}`, { to: 'debug' })
        continue
      }
      const eintrag = vomModell.get(hash)!
      const neu = { kategorien: eintrag.kategorien, kurz: { ...eintrag.kurz, ...kurz } }
      vomModell.set(hash, neu)
      await speichere($, hash)
      await zeige($, hash, neu.kategorien, neu.kurz, false)
    }
  } catch (fehler) {
    $.ui.log(`leitstand: skill short descriptions failed: ${fehler instanceof Error ? fehler.message : String(fehler)}`, { to: 'debug' })
  } finally {
    kurzLaeuft = false
  }
}

/** Takes Haiku's categories: into this load, the store and the pane, then asks for the short descriptions. */
async function uebernimm(
  $: $,
  hash: string,
  gruppen: Gruppen,
  rest: readonly string[],
  kurz: Record<string, string>,
  beschreibungen: ReadonlyMap<string, string>,
  grund: string | undefined,
): Promise<void> {
  const kategorien = fertig(gruppen, rest)
  vomModell.set(hash, { kategorien, kurz })
  laufend.delete(hash)
  await speichere($, hash)
  if (rest.length > 0) {
    $.ui.log(`leitstand: skill categories: ${rest.length} in "${WEITERE}"${grund === undefined ? '' : ` (second call failed: ${grund})`}`, { to: 'debug' })
  }
  await zeige($, hash, kategorien, kurz, false)
  await holeKurz($, hash, beschreibungen)
}

/** Haiku failed with nothing sorted earlier: the plugins for now, a line in the debug log, no new call in this load. */
async function scheitert($: $, hash: string, namen: readonly string[], grund: string): Promise<void> {
  laufend.delete(hash)
  gescheitert.add(hash)
  $.ui.log(`leitstand: skill categories: Haiku failed: ${grund}; by plugin for now`, { to: 'debug' })
  await zeige($, hash, nachPlugin(namen), {}, true)
}

/** Nothing sorted earlier: the main call (categories only), then the second call for the skills it left out. Never throws. */
async function sortiereNeu($: $, hash: string, namen: readonly string[], beschreibungen: ReadonlyMap<string, string>): Promise<void> {
  try {
    const antwort = await frage($, haikuPrompt(namen, beschreibungen), HAIKU_MAX_TOKENS)
    if ('grund' in antwort) return await scheitert($, hash, namen, antwort.grund)
    const gelesen = leseHauptantwort(antwort.text, namen)
    if ('fehler' in gelesen) return await scheitert($, hash, namen, `Antwort nicht lesbar: ${gelesen.fehler}`)
    const nach = await nachtragen($, gelesen.gruppen, gelesen.rest, beschreibungen)
    await uebernimm($, hash, nach.gruppen, nach.rest, {}, beschreibungen, nach.grund)
  } catch (fehler) {
    await scheitert($, hash, namen, fehler instanceof Error ? fehler.message : String(fehler)).catch(() => undefined)
  }
}

/** An earlier sorting: only the new skills go to Haiku, by the second call. Never throws. */
async function ordneNeueEin($: $, hash: string, gruppen: Gruppen, neu: readonly string[], kurz: Record<string, string>, beschreibungen: ReadonlyMap<string, string>): Promise<void> {
  try {
    const nach = await nachtragen($, gruppen, neu, beschreibungen)
    await uebernimm($, hash, nach.gruppen, nach.rest, kurz, beschreibungen, nach.grund)
  } catch (fehler) {
    laufend.delete(hash)
    $.ui.log(`leitstand: skill categories: placing new skills failed: ${fehler instanceof Error ? fehler.message : String(fehler)}`, { to: 'debug' })
  }
}

/**
 * The categories for these names. Known in this load: shown. Haiku failed for them: the plugins. The store holds the
 * same skills: shown, without Haiku (missing short descriptions are asked for). It holds an earlier sorting of this
 * prompt: the known skills at once, the new ones placed by Haiku in the background. Nothing: the pane waits, and Haiku
 * sorts all of them in the background. Haiku is asked at most once per set of names and load. Never waits for Haiku.
 */
async function ordneKategorien($: $, namen: readonly string[], beschreibungen: ReadonlyMap<string, string>): Promise<void> {
  const hash = menueHash(namen)
  aktuellerHash = hash
  aktuellerRueckfall = kurzAusBeschreibungen(namen, beschreibungen)
  if (namen.length === 0) return zeige($, hash, [], {}, false)
  const hier = vomModell.get(hash)
  if (hier !== undefined) {
    await zeige($, hash, hier.kategorien, hier.kurz, false)
    return holeKurz($, hash, beschreibungen)
  }
  if (gescheitert.has(hash)) return zeige($, hash, nachPlugin(namen), {}, true)
  if (laufend.has(hash)) return
  const gespeichert = ladeGespeichert(await $.store.get(STORE_KATEGORIEN).catch(() => undefined), namen)
  if (gespeichert !== null) {
    const kategorien = fertig(gespeichert.gruppen, gespeichert.weitere)
    await zeige($, hash, kategorien, gespeichert.kurz, false)
    if (gespeichert.neu.length === 0) {
      vomModell.set(hash, { kategorien, kurz: gespeichert.kurz })
      if (!gespeichert.gleich) await speichere($, hash)
      return holeKurz($, hash, beschreibungen)
    }
    if (versucht.has(hash)) return
    versucht.add(hash)
    laufend.add(hash)
    void ordneNeueEin($, hash, gespeichert.gruppen, gespeichert.neu, gespeichert.kurz, beschreibungen).catch(() => undefined)
    return
  }
  if (versucht.has(hash)) return
  versucht.add(hash)
  laufend.add(hash)
  await zeige($, hash, null, {}, false)
  void sortiereNeu($, hash, namen, beschreibungen).catch(() => undefined)
}

/**
 * Loads the list and writes it to the state when it changed, then its categories. When the time runs out or the load
 * fails, the old list stays and a line goes to the debug log. Never throws.
 */
async function aktualisiere($: $, anlass: string): Promise<readonly string[] | null> {
  try {
    const geladen = await ladeMitFrist($)
    if (geladen === null) {
      $.ui.log(`leitstand: skill list (${anlass}) took longer than ${LADEFRIST_MS / 1000} s; the old list stays`, { to: 'debug' })
      return null
    }
    const { namen, beschreibungen } = geladen
    if (!gleich(await read($, skillListeAtom), namen)) await update($, skillListeAtom, () => namen)
    await ordneKategorien($, namen, beschreibungen)
    return namen
  } catch (fehler) {
    $.ui.log(`leitstand: skill list (${anlass}) failed: ${fehler instanceof Error ? fehler.message : String(fehler)}; the old list stays`, { to: 'debug' })
    return null
  }
}

/** Loads the list after this hook, outside it: a timer of 0 runs once the event is through. */
function spaeterLaden($: $, anlass: string): void {
  $.clock.after(0, () => void aktualisiere($, anlass).catch(() => undefined))
}

/** Opens the pane Skills with the keyboard in it, without waiting for it. */
function oeffneFenster($: $): void {
  void $.ui.open({ id: FENSTER, title: TITEL, focus: true }).catch(() => undefined)
}

/** Opens the pane Skills and says whether a surface shows it; false on any error. */
async function fensterGezeigt($: $): Promise<boolean> {
  try {
    return (await $.ui.open({ id: FENSTER, title: TITEL, focus: true })).isPlaced
  } catch {
    return false
  }
}

/**
 * A click on a skill in the pane: it starts as if typed. While a turn of the main loop runs, a toast says it waits in
 * the queue; should the start fail, it waits in the prompt box for Enter. The pane stays open.
 */
async function starteSkill($: $, name: string): Promise<void> {
  try {
    if (hauptRundeLaeuft) $.ui.toast(`Befehl "/${name}" in die Warteschlange eingereiht...`)
    await $.command.run({ command: name })
  } catch {
    await $.prompt.fill({ text: `/${name}` }).catch(() => undefined)
    $.ui.toast(`${name} steht im Eingabefeld: Drück Enter, um zu starten.`)
  }
}

/** The answer of a command, remembered: its stored row gets "(gemeldet vom Mod Leitstand)". */
function antwort(text: string): { text: string } {
  merkeAntwort(text)
  return { text }
}

/** Registers the skill menu: loading its list and categories, the press on 🧩, the pane Skills and its command. */
export function registerSkills(on: On, _options: PluginOptions): void {
  // Every hook carries a matcher: the Leitstand hooks the same events without one.

  on('session.start', { isInteractive: [true, false] }, async ($, e, next) => {
    const result = await next(e)
    try {
      spaeterLaden($, 'session.start')
    } catch {
      // The list loads at the end of the next turn.
    }
    return result
  })

  on('turn.start', { text: /^/ }, ($, e, next) => {
    if (e.agentId === undefined) hauptRundeLaeuft = true
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', { reason: ['answer', 'aborted', 'refusal', 'error'] }, async ($, e, next) => {
    if (e.agentId === undefined) hauptRundeLaeuft = false
    const result = await next(e)
    try {
      if (e.agentId === undefined) spaeterLaden($, 'turn.complete')
    } catch {
      // The list loads at the end of the next turn.
    }
    return result
  })

  // The puzzle piece 🧩 in the band, drawn by the Leitstand: a command the Leitstand ran would not reach this part's
  // hooks, so the press is answered here. It opens the pane without waiting for it; the button's own onPress runs only
  // if this hook failed.
  on('ui.press', { plugin: 'leitstand', element: KNOPF_SKILLS }, async ($, e) => {
    oeffneFenster($)
    return { element: e.element }
  }).catch(($, e, next) => next(e))

  // The pane Skills: only reads the state, loads nothing.
  on('ui.render', { component: 'Pane', requestId: FENSTER }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const liste = await read($, skillListeAtom)
    const kategorien = await read($, skillMenueAtom)
    const kurz = (await read($, skillKurzAtom)) ?? {}
    const vorlaeufig = await read($, skillVorlaeufigAtom)
    const schliessen =
      e.surface === 'terminal' ? <Button key="skills-schliessen" label="Schließen" role="dismiss" onPress={() => $.ui.close({ id: FENSTER })} /> : null
    const leer = liste !== null && liste.length === 0
    if (leer || kategorien === null) {
      return (
        <Box flexDirection="column" rowGap={1}>
          <Text dimColor wrap="wrap">
            {leer ? OHNE_SKILLS : WARTEN}
          </Text>
          {schliessen}
        </Box>
      )
    }
    const anzahl = kategorien.reduce((summe, kategorie) => summe + kategorie.skills.length, 0)
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text dimColor wrap="wrap">
          {anzahl === 0 ? OHNE_SKILLS : vorlaeufig ? VORLAEUFIG : kopfzeile(anzahl)}
        </Text>
        {kategorien.map((kategorie, i) => (
          <Box key={`skills-k-${i}`} flexDirection="column" rowGap={1.2} marginTop={i === 0 ? 0 : 2}>
            <Text bold wrap="wrap">
              {kategorie.name}
            </Text>
            {kategorie.skills.map((skill, j) => (
              <Box key={`skills-z-${i}-${j}`} flexDirection="row" columnGap={2}>
                <Button key={`skills-b-${i}-${j}`} label={skillLabel(skill)} onPress={() => void starteSkill($, skill).catch(() => undefined)} />
                {Object.hasOwn(kurz, skill) && kurz[skill] !== '' ? (
                  <Text dimColor wrap="wrap">
                    {kurz[skill]}
                  </Text>
                ) : null}
              </Box>
            ))}
          </Box>
        ))}
        {schliessen}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // /leitstand:skill-menue and its short form: on the computer the pane, where one shows; from the phone, or where no
  // surface shows the pane, the categories as text.
  on('command.run', { command: [...BEFEHL_NAMEN] }, async ($, e) => {
    if (fragtNachHilfe(e.args ?? '')) return antwort(befehlsHilfe(MENUE))
    try {
      const gespeichert = await read($, skillListeAtom).catch(() => null)
      // Nothing held yet: load once here, the command may wait (within the same time limit).
      const namen = gespeichert !== null && gespeichert.length > 0 ? gespeichert : await aktualisiere($, 'command')
      if (namen === null) return antwort(fehlerText(MENUE.name))
      if (namen.length === 0) return antwort(OHNE_SKILLS)
      if (e.origin?.kind !== 'bridge' && (await fensterGezeigt($))) return antwort(IM_FENSTER)
      const kategorien = (await read($, skillMenueAtom).catch(() => null)) ?? nachPlugin(namen)
      const kurz = (await read($, skillKurzAtom).catch(() => null)) ?? {}
      return antwort(textListe(namen, kategorien, kurz))
    } catch {
      return antwort(fehlerText(MENUE.name))
    }
  }).catch(() => antwort(fehlerText(MENUE.name)))
}
