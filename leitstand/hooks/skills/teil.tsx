import { atom, update } from 'claude-code'
import type { EngineInterface, On, PluginOptions } from 'claude-code'

import type { SkillKategorie } from '../../types'
import { merkeAntwort } from '../antwort'
import { befehlsHilfe, fragtNachHilfe, kurzform } from '../logic'
import { SKILLS_BEFEHLE } from './befehle'
import { ausModellAntwort, haikuPrompt, kategorienHash, kategorienText, nachPlugin, pruefeGespeichert } from './kategorien'

/**
 * Skill menu: the skills of this session in categories, kept in the Leitstand's state (`skillListe`, `skillMenue`).
 * The band draws them as the two-stage picker 🧩 (glance.tsx); the command answers with them as text. No pane.
 *
 * The skills come from the context breakdown (`$.session.usage({ breakdown: 'summary' })`, its `skills` listing, which
 * names each skill and its plugin), matched against `$.command.list()` for the name the person types and the line it
 * shows. The list is loaded at the session's start and at the end of each turn of the main loop, outside any drawing
 * and with a time limit: the band never waits for it. The categories are first the plugins (nachPlugin); Haiku then
 * sorts them by purpose in the background, once per set of skills, kept in `$.store` under its hash.
 */

type $ = EngineInterface

/** One skill as the context breakdown lists it. */
export type SkillEintrag = { readonly name: string; readonly pluginName?: string }

/** The Leitstand's own commands and skills stay out of the menu. */
const EIGENES = 'leitstand'

/** The names to type for this session's skills, sorted; null until loaded. */
const LISTE = { plugin: 'leitstand', key: 'skillListe' } as const
const skillListeAtom = atom(LISTE, null as readonly string[] | null)

/** The categories the band draws; null until known. The band (glance.tsx) reads the same key. */
const MENUE_ZUSTAND = { plugin: 'leitstand', key: 'skillMenue' } as const
const skillMenueAtom = atom(MENUE_ZUSTAND, null as readonly SkillKategorie[] | null)

/** Haiku's categories across sessions: `{ hash, kategorien }`, the hash of the names they were made for. */
export const STORE_KATEGORIEN = 'skillKategorien'

/** How long a load of the list may take before the old list stays. */
export const LADEFRIST_MS = 10_000

/** How long Haiku may take to sort the skills. */
export const HAIKU_FRIST_MS = 60_000

const MENUE = SKILLS_BEFEHLE[0]!

/** The command names this part answers: the long form and, when the Leitstand gives it one, the short form. */
const BEFEHL_NAMEN: readonly string[] = SKILLS_BEFEHLE.flatMap(eintrag => {
  const kurz = kurzform(eintrag.name)
  return kurz === undefined ? [eintrag.name] : [eintrag.name, kurz]
})

export const OHNE_SKILLS = 'In dieser Sitzung sind keine Skills installiert.'
/** What the command adds on the computer, where the band shows the picker. */
export const AM_RECHNER = 'Am Rechner klappt 🧩 im Band dieselbe Liste auf.'

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

/** The skills as text, for the command: the categories as headings, each skill as `/name`. */
export function textListe(namen: readonly string[], kategorien: readonly SkillKategorie[] = nachPlugin(namen).kategorien): string {
  if (namen.length === 0) return OHNE_SKILLS
  return kategorienText(namen, kategorien)
}

/** Whether two lists name the same skills in the same order. */
const gleich = (a: readonly string[] | null, b: readonly string[]): boolean =>
  a !== null && a.length === b.length && a.every((name, at) => name === b[at])

/** Whether two category lists are the same. */
const gleicheKategorien = (a: readonly SkillKategorie[] | null, b: readonly SkillKategorie[]): boolean => a !== null && JSON.stringify(a) === JSON.stringify(b)

// What only this load of the module needs.

/** The hashes Haiku was asked for in this load: a failed one is not asked again. */
const versucht = new Set<string>()
/** Haiku's categories of this load, by hash, so a load running beside it does not write the plugins over them. */
const vomModell = new Map<string, SkillKategorie[]>()
/** The hash of the list loaded last: Haiku's answer for an older one goes to the store only. */
let aktuellerHash: string | null = null

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

/** The list as the state holds it; null when it holds none. */
async function gespeicherteListe($: $): Promise<readonly string[] | null> {
  const { value } = await $.state.get(LISTE)
  return value ?? null
}

/** The categories as the state holds them; null when it holds none. */
async function gespeicherteKategorien($: $): Promise<readonly SkillKategorie[] | null> {
  const { value } = await $.state.get(MENUE_ZUSTAND)
  return value ?? null
}

/** Writes the categories to the state when they changed. */
async function schreibeMenue($: $, kategorien: readonly SkillKategorie[]): Promise<void> {
  if (!gleicheKategorien(await gespeicherteKategorien($), kategorien)) await update($, skillMenueAtom, () => kategorien)
}

/**
 * Asks Haiku to sort the skills by purpose, within its time limit. A valid answer goes to the store and, while the list
 * is still the same, to the state; anything else leaves the plugins' categories, with a line in the debug log.
 */
async function frageHaiku($: $, namen: readonly string[], beschreibungen: ReadonlyMap<string, string>, hash: string): Promise<void> {
  try {
    const antwort = await $.model.complete({ model: 'haiku', prompt: haikuPrompt(namen, beschreibungen), maxTokens: 4096, timeoutMs: HAIKU_FRIST_MS })
    if (!antwort.isAnswered) {
      $.ui.log(`leitstand: skill categories: Haiku gave no answer (${antwort.reason}); the plugins stay`, { to: 'debug' })
      return
    }
    const menue = ausModellAntwort(antwort.text, namen)
    if (menue === null) {
      $.ui.log('leitstand: skill categories: Haiku\'s answer held no valid categories; the plugins stay', { to: 'debug' })
      return
    }
    vomModell.set(hash, menue.kategorien)
    await $.store.set(STORE_KATEGORIEN, { hash, kategorien: menue.kategorien }).catch(() => undefined)
    if (aktuellerHash === hash) await schreibeMenue($, menue.kategorien)
  } catch (fehler) {
    $.ui.log(`leitstand: skill categories failed: ${fehler instanceof Error ? fehler.message : String(fehler)}; the plugins stay`, { to: 'debug' })
  }
}

/**
 * The categories for these names: Haiku's, from this load or the store, when they were made for the same names; else
 * the plugins at once, and Haiku asked in the background, once per set of names and load. Never waits for Haiku.
 */
async function ordneKategorien($: $, namen: readonly string[], beschreibungen: ReadonlyMap<string, string>): Promise<void> {
  const hash = kategorienHash(namen)
  aktuellerHash = hash
  if (namen.length === 0) return schreibeMenue($, [])
  const hier = vomModell.get(hash)
  if (hier !== undefined) return schreibeMenue($, hier)
  const gespeichert = pruefeGespeichert(await $.store.get(STORE_KATEGORIEN).catch(() => undefined), hash, namen)
  if (gespeichert !== null) {
    vomModell.set(hash, gespeichert)
    return schreibeMenue($, gespeichert)
  }
  const nachPlugins = nachPlugin(namen)
  if (nachPlugins.weggelassen.length > 0) {
    $.ui.log(`leitstand: skill menu: ${nachPlugins.weggelassen.length} skills do not fit (at most 144)`, { to: 'debug' })
  }
  // Haiku may have answered while the store was read.
  await schreibeMenue($, vomModell.get(hash) ?? nachPlugins.kategorien)
  if (versucht.has(hash)) return
  versucht.add(hash)
  void frageHaiku($, namen, beschreibungen, hash).catch(() => undefined)
}

/**
 * Loads the list and writes it and its categories to the state when they changed. When the time runs out or the load
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
    if (!gleich(await gespeicherteListe($), namen)) await update($, skillListeAtom, () => namen)
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

/** The answer of a command, remembered: its stored row gets "(gemeldet vom Mod Leitstand)". */
function antwort(text: string): { text: string } {
  merkeAntwort(text)
  return { text }
}

/** Registers the skill menu: loading its list and categories, and its command. */
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

  on('turn.complete', { reason: ['answer', 'aborted', 'refusal', 'error'] }, async ($, e, next) => {
    const result = await next(e)
    try {
      if (e.agentId === undefined) spaeterLaden($, 'turn.complete')
    } catch {
      // The list loads at the end of the next turn.
    }
    return result
  })

  // /leitstand:skill-menue and its short form: the categories as text, everywhere; on the computer with a word on the
  // picker. Never a pane.
  on('command.run', { command: [...BEFEHL_NAMEN] }, async ($, e) => {
    if (fragtNachHilfe(e.args ?? '')) return antwort(befehlsHilfe(MENUE))
    try {
      const gespeichert = await gespeicherteListe($).catch(() => null)
      // Nothing held yet: load once here, the command may wait (within the same time limit).
      const namen = gespeichert !== null && gespeichert.length > 0 ? gespeichert : await aktualisiere($, 'command')
      if (namen === null) return antwort(fehlerText(MENUE.name))
      const kategorien = (await gespeicherteKategorien($).catch(() => null)) ?? nachPlugin(namen).kategorien
      const kind = e.origin?.kind
      const amRechner = (kind === 'sdk' || kind === 'composer') && namen.length > 0
      const liste = textListe(namen, kategorien)
      return antwort(amRechner ? `${liste}\n\n${AM_RECHNER}` : liste)
    } catch {
      return antwort(fehlerText(MENUE.name))
    }
  }).catch(() => antwort(fehlerText(MENUE.name)))
}
