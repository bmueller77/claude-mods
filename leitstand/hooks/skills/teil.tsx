import type { EngineInterface, On, PluginOptions } from 'claude-code'

import { merkeAntwort } from '../antwort'
import { befehlsHilfe, fragtNachHilfe, kurzform } from '../logic'
import { FENSTER_SKILLS, KNOPF_SKILLS, SKILLS_BEFEHLE, TITEL_SKILLS } from './befehle'

/**
 * Skill menu: a pane listing every skill this session knows; picking one closes the pane and runs the skill as if typed.
 *
 * The skills come from the context breakdown (`$.session.usage({ breakdown: 'summary' })`, its `skills` listing, which
 * names each skill and its plugin), matched against `$.command.list()` for the name the person types. The command list
 * alone does not tell skills from other commands: it only knows builtin, plugin, user and mcp.
 */

type $ = EngineInterface

/** One skill as the context breakdown lists it. */
export type SkillEintrag = { readonly name: string; readonly pluginName?: string }

/** The Leitstand's own commands and skills stay out of the menu. */
const EIGENES = 'leitstand'

const MENUE = SKILLS_BEFEHLE[0]!

/** The command names this part answers: the long form and, when the Leitstand gives it one, the short form. */
const BEFEHL_NAMEN: readonly string[] = SKILLS_BEFEHLE.flatMap(eintrag => {
  const kurz = kurzform(eintrag.name)
  return kurz === undefined ? [eintrag.name] : [eintrag.name, kurz]
})

export const OHNE_SKILLS = 'In dieser Sitzung sind keine Skills installiert.'
export const IM_FENSTER = `Die Skills stehen im Fenster "${TITEL_SKILLS}".`
export const WAEHLEN = 'Skill wählen ...'

/** "1 Skill", "3 Skills". */
const skillsText = (n: number): string => (n === 1 ? '1 Skill' : `${n} Skills`)

/** The dim line above the picker. */
export const kopfText = (n: number): string => `${skillsText(n)} in dieser Sitzung. Wähle einen, er startet sofort.`

/** The toast when the run fails and the name waits in the prompt. */
export const imEingabefeld = (name: string): string => `${name} steht im Eingabefeld: Drück Enter, um zu starten.`

/** The toast for a run the engine only queues, as the Leitstand words it. */
export const eingereiht = (name: string): string => `Befehl "/${name}" in die Warteschlange eingereiht...`

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

/** The skills as text, for the phone and where no surface shows the pane. */
export function textListe(namen: readonly string[]): string {
  if (namen.length === 0) return OHNE_SKILLS
  return [`${skillsText(namen.length)} in dieser Sitzung:`, ...namen.map(name => `/${name}`)].join('\n')
}

// What only this load of the module needs.

/** The list the pane shows, loaded when it opens; null until then (a pane restored after a reload loads it itself). */
let liste: readonly string[] | null = null
/** Whether a turn of the main loop runs: a run started now waits in the queue, and a toast says so. */
let hauptRundeLaeuft = false

/** Loads the skills of this session; whatever fails counts as none. */
async function ladeSkills($: $): Promise<string[]> {
  const [usage, befehle] = await Promise.all([$.session.usage({ breakdown: 'summary' }).catch(() => null), $.command.list().catch(() => [])])
  const skills = usage?.context.breakdown?.skills?.skillFrontmatter ?? []
  return skillNamen(skills, befehle.map(befehl => befehl.name))
}

/** Loads the skills and opens the pane; true when a surface shows it. */
async function oeffne($: $): Promise<{ isPlaced: boolean; namen: readonly string[] }> {
  const namen = await ladeSkills($)
  liste = namen
  const offen = await $.ui.open({ id: FENSTER_SKILLS, title: TITEL_SKILLS, focus: true }).catch(() => null)
  return { isPlaced: offen?.isPlaced === true, namen }
}

/** Closes the pane and runs the skill as typed; if that fails, the name waits in the prompt. */
async function starte($: $, name: string): Promise<void> {
  await $.ui.close({ id: FENSTER_SKILLS }).catch(() => {})
  try {
    if (hauptRundeLaeuft) $.ui.toast(eingereiht(name))
    await $.command.run({ command: name })
  } catch {
    await $.prompt.fill({ text: `/${name}` }).catch(() => {})
    $.ui.toast(imEingabefeld(name))
  }
}

/** The answer of a command, remembered: its stored row gets "(gemeldet vom Mod Leitstand)". */
function antwort(text: string): { text: string } {
  merkeAntwort(text)
  return { text }
}

/** Registers the skill menu: its command, the band button's press, the pane. */
export function registerSkills(on: On, _options: PluginOptions): void {
  // Every hook carries a matcher: the Leitstand hooks the same events without one.

  on('turn.start', { turnId: /./ }, async ($, e, next) => {
    if (e.agentId === undefined) hauptRundeLaeuft = true
    return next(e)
  })

  on('turn.complete', { reason: ['answer', 'aborted', 'refusal', 'error'] }, async ($, e, next) => {
    if (e.agentId === undefined) hauptRundeLaeuft = false
    return next(e)
  })

  // /leitstand:skill-menue and its short form: on the computer the pane, from the phone (or with no surface showing the
  // pane) the list as text.
  on('command.run', { command: [...BEFEHL_NAMEN] }, async ($, e) => {
    if (fragtNachHilfe(e.args ?? '')) return antwort(befehlsHilfe(MENUE))
    try {
      if (e.origin?.kind === 'bridge') return antwort(textListe(await ladeSkills($)))
      const { isPlaced, namen } = await oeffne($)
      return antwort(isPlaced ? IM_FENSTER : textListe(namen))
    } catch {
      return antwort(fehlerText(MENUE.name))
    }
  }).catch(() => antwort(fehlerText(MENUE.name)))

  // The button 🧩 (key `skillmenue`) is drawn by the Leitstand; its press lands here, where `$` reaches the pane. The
  // press does not go on to the button itself.
  on('ui.press', { plugin: 'leitstand', element: KNOPF_SKILLS }, async ($, e) => {
    await oeffne($)
    return { element: e.element }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: FENSTER_SKILLS }, async ($, e) => {
    const elemente = $.ui.resolve(e)
    const { Box, Button, Text } = elemente
    // The app draws its own close on the pane; the terminal needs the button.
    const schliessen =
      e.surface === 'terminal' ? (
        <Box key="aktionen" marginTop={1}>
          <Button key="schliessen" label="Schließen" role="dismiss" onPress={() => void $.ui.close({ id: FENSTER_SKILLS }).catch(() => {})} />
        </Box>
      ) : null
    const namen = liste ?? (await ladeSkills($).catch(() => []))
    liste = namen
    if (namen.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor wrap="wrap">
            {OHNE_SKILLS}
          </Text>
          {schliessen}
        </Box>
      )
    }
    // A surface without a picker (the phone) shows the list as text.
    const Select = 'Select' in elemente ? elemente.Select : undefined
    if (Select === undefined) {
      return (
        <Box flexDirection="column">
          <Text wrap="wrap">{textListe(namen)}</Text>
          {schliessen}
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Text key="kopf" dimColor wrap="wrap">
          {kopfText(namen.length)}
        </Text>
        <Box key="wahl" marginTop={1}>
          <Select
            key="skill"
            label="Skill"
            autoFocus
            options={[{ value: '', label: WAEHLEN }, ...namen.map(name => ({ value: name, label: name }))]}
            onSelect={(wert: string) => {
              if (wert !== '') void starte($, wert).catch(() => {})
            }}
          />
        </Box>
        {schliessen}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
