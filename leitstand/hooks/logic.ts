import type { GlanceChatSettings, GlanceChecklist, GlanceHelper, GlanceHistoryView, GlanceOtherChat, GlanceTask, GlanceTaskSize, GlanceUsage } from '../types'
import { SIZE_WEIGHT, teamReport, weekSummary } from './history'
import { inBerlin } from './berlin'
import { maskPrivate } from './privacy'
import { AUTOPILOT_ALTE, AUTOPILOT_BEFEHLE, AUTOPILOT_GRUNDBEFEHL, AUTOPILOT_TUT } from './autopilot/befehle'
import { FILETREE_ALTE, FILETREE_BEFEHLE } from './filetree/befehle'
import { REFLECT_ALTE, REFLECT_BEFEHLE } from './reflect/befehle'
import { SKILLS_BEFEHLE } from './skills/befehle'

export const PLUGIN = 'leitstand'

export const tourNeeds = (mark: string) =>
  `Wenn Claude dich braucht, zeigt die Checkliste Braucht dich ${mark} und sagt, was zu tun ist. Schalte im Einstellungsfenster Töne oder Desktop-Benachrichtigungen ein, dann hörst oder siehst du es auch in einer anderen App.`

export const MAX_NAME = 40

export const QUESTION = 'Beantworte Claudes Frage im Chat'

export const WAITING = 'Antworte Claude im Feld unten'

// The longest plain sentence Claude's own description of a tool call keeps.
export const MAX_DETAIL = 90

export const CODE_FILE =
  /\.(tsx?|jsx?|mjs|cjs|mts|cts|py|rb|go|rs|java|kts?|swift|c|cc|cpp|h|hpp|cs|php|sh|zsh|bash|json|ya?ml|toml|css|scss|sass|less|html?|md|mdx|sql|vue|svelte|lock|env|xml|ini|cfg|conf|txt|csv|log)\W*$/i

export const pad2 = (value: number) => String(value).padStart(2, '0')

/** "10:01:45 UTC" in Berlin time, "12:01:45" in summer; a time without UTC, GMT or Z is left as written. */
export function localTimes(text: string, today = new Date()): string {
  return text.replace(/(?<![\d:])(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s?(?:UTC|GMT|Z)\b/g, (whole, hours, minutes, seconds) => {
    if (Number(hours) > 23 || Number(minutes) > 59) return whole
    const at = inBerlin(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), Number(hours), Number(minutes), Number(seconds ?? 0)))
    return `${pad2(at.hours)}:${pad2(at.minutes)}${seconds === undefined ? '' : `:${pad2(at.seconds)}`}`
  })
}

// Short weekday names, Sunday first as getDay() counts them.
const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

/** When a plan window resets, in Berlin time: "um 18:40", or "am Do um 09:00" when it is more than a day away. */
export function resetTime(resetsAt: string | null, at: number): string | null {
  const when = resetsAt ? new Date(resetsAt) : null
  if (when === null || Number.isNaN(when.getTime())) return null
  const berlin = inBerlin(when.getTime())
  const time = `${pad2(berlin.hours)}:${pad2(berlin.minutes)}`
  if (when.getTime() - at <= 24 * 3_600_000) return `um ${time}`
  return `am ${WEEKDAY_SHORT[berlin.weekday]} um ${time}`
}

// What ends a name cleanName cut short; plans saved before 0.63.6.3 end on the ellipsis character (U+2026) instead.
const CUT_MARK = '...'
const CUT_END = /(?:…|\.\.\.)$/

/** Turns any step or job name, or a step's summary, into short plain English. */
export function cleanName(raw: unknown, max = MAX_NAME): string {
  const words = localTimes(maskPrivate(String(raw ?? '')))
    .replace(/`[^`]*`/g, ' ')
    .replace(/`/g, ' ')
    .split(/\s+/)
    .filter(word => word && !word.includes('•') && !/[/\\]/.test(word) && !CODE_FILE.test(word))
  let name = words.join(' ').replace(/\s+/g, ' ').trim()
  if (!name) {
    return 'Arbeitet daran'
  }
  name = name.charAt(0).toUpperCase() + name.slice(1)
  if (name.length <= max) {
    return name
  }
  // Three plain dots mark the cut, within the limit: no typographic ellipsis.
  const cut = name.slice(0, max - CUT_MARK.length)
  const space = cut.lastIndexOf(' ')

  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–]+$/, '')}${CUT_MARK}`
}

/**
 * The one step whose saved name was cut short (U+2026 or "...") and whose stem opens one of these names, ignoring case;
 * -1 when no step or more than one fits. For a report naming a step in full, or cut at another length.
 */
export function stemStep(tasks: readonly GlanceTask[], names: readonly string[]): number {
  const wanted = names.map(one => one.toLowerCase())
  const fits = tasks.flatMap((one, index) => {
    if (!CUT_END.test(one.name)) return []
    const stem = one.name.replace(CUT_END, '').trim().toLowerCase()
    return stem !== '' && wanted.some(name => name.startsWith(stem)) ? [index] : []
  })
  return fits.length === 1 ? fits[0]! : -1
}

/** Whether cleanName cut this raw name short. */
export const isCutName = (raw: unknown, max = MAX_NAME): boolean => cleanName(raw, max) !== cleanName(raw, Number.POSITIVE_INFINITY)

// Small words that mark a name as German, whose nouns keep their capitals.
const GERMAN_WORDS = new Set([
  'und', 'oder', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer',
  'mit', 'für', 'fuer', 'von', 'vom', 'im', 'auf', 'aus', 'bei', 'nach', 'zu', 'zum', 'zur', 'ist', 'nicht',
])

/** True when a name looks German: umlauts or ß, or one of its small words. */
const looksGerman = (words: string[]) => words.some(word => /[äöüÄÖÜß]/.test(word) || GERMAN_WORDS.has(word.toLowerCase()))

/**
 * A name in Title Case ("Copy Mod With Button Choices") in the sentence case the checklist uses everywhere else. A
 * word with a capital past its first letter (GlanceFlow, PR) keeps its case; a name already in sentence case stays.
 * A German name stays as it is: its nouns are capitalized.
 */
export function sentenceCase(name: string): string {
  const words = name.split(' ')
  if (words.length < 3 || words.some(word => /^\p{Ll}/u.test(word)) || looksGerman(words)) return name
  return words.map((word, index) => (index === 0 || /\p{Lu}/u.test(word.slice(1)) ? word : word.toLowerCase())).join(' ')
}

export function apiErrorSentence(kind: string, details = ''): string {
  if (/too long|context (window|length|limit)|max(imum)? context/i.test(details)) {
    return 'Gib /compact ein und versuch es noch mal'
  }
  // This sentence alone holds the word "limit" (Nutzungslimit): the band looks for it to spot a usage limit.
  if (kind === 'rate_limit' || kind === 'billing_error') {
    return 'Du hast dein Nutzungslimit erreicht, versuch es etwas später noch mal'
  }
  if (kind === 'overloaded') {
    return 'Claudes Server sind ausgelastet, versuch es in einer Minute noch mal'
  }
  if (/authentication|oauth|credential/.test(kind)) {
    return 'Gib /login ein'
  }
  if (/network|connect|ECONN|ENOTFOUND|socket|fetch failed|offline/i.test(details)) {
    return 'Die Internetverbindung ist abgebrochen'
  }

  return 'Claudes Server sind ausgelastet, versuch es in einer Minute noch mal'
}

/** 13 Sek., 7 Min. 7 Sek., 1 Std. 5 Min. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) {
    return `${seconds} Sek.`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes} Min. ${seconds % 60} Sek.`
  }

  return `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`
}

/** A duration where words flow (the desktop): a whole minute drops its seconds, `1 Min.` rather than `1 Min. 0 Sek.`. */
export function durationWords(ms: number): string {
  return formatDuration(ms).replace(/^(\d+ Min\.) 0 Sek\.$/, '$1')
}

/** Terminal cells a character takes: two for CJK and emoji, none for joiners and accents. */
export function cellsOf(char: string): number {
  const code = char.codePointAt(0) ?? 0
  if (code === 0x200d || (code >= 0x300 && code <= 0x36f) || (code >= 0xfe00 && code <= 0xfe0f)) return 0
  const isWide =
    // The question and exclamation marks drawn as emoji (❓ ❔ ❕ ❗, Emoji_Presentation): ❓ opens the pane Knöpfe.
    (code >= 0x2753 && code <= 0x2755) ||
    code === 0x2757 ||
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)

  return isWide ? 2 : 1
}

/** Pads or trims text to exactly `width` terminal cells, so columns line up in any script. */
export function fit(text: string, width: number): string {
  if (width <= 0) {
    return ''
  }
  const chars = Array.from(text)
  const total = chars.reduce((sum, char) => sum + cellsOf(char), 0)
  if (total <= width) {
    return text + ' '.repeat(width - total)
  }
  let kept = ''
  let used = 0
  for (const char of chars) {
    const size = cellsOf(char)
    if (used + size > width - 1) break
    kept += char
    used += size
  }

  return `${kept}…${' '.repeat(width - 1 - used)}`
}

export function task(name: string, status: GlanceTask['status'], id = name, size: GlanceTaskSize = 'M'): GlanceTask {
  return { id, name, status, percent: status === 'done' ? 100 : 0, hasReported: status === 'done', size, summary: null, tokens: 0, cachedTokens: 0, startedAt: null, finishedAt: null }
}

/** Token counts move to the new plan's step of the same name; the rest go to its first step, so the job total holds. */
export function carryTokens(old: GlanceTask[], next: GlanceTask[]): GlanceTask[] {
  const used = new Set<string>()
  const carried = next.map(one => {
    const same = old.find(before => before.name === one.name && !used.has(before.id))
    if (!same) return one
    used.add(same.id)
    return { ...one, tokens: same.tokens, cachedTokens: same.cachedTokens, summary: same.summary, files: same.files }
  })
  const leftover = old.filter(before => !used.has(before.id))
  const [first, ...rest] = carried
  if (!first) return carried

  return [
    {
      ...first,
      tokens: first.tokens + leftover.reduce((sum, one) => sum + one.tokens, 0),
      cachedTokens: first.cachedTokens + leftover.reduce((sum, one) => sum + one.cachedTokens, 0),
    },
    ...rest,
  ]
}

/** 950 → 950, 12_400 → 12,4k, 3_200_000 → 3,2M: a decimal comma. */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count)
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 100_000 ? 1 : 0).replace(/\.0$/, '').replace('.', ',')}k`

  return `${(count / 1_000_000).toFixed(1).replace('.', ',')}M`
}

/** New tokens first (what really counts), then the cheap ones read back from the cache. */
export function tokenNote(tokens: number, cachedTokens: number): string {
  if (tokens <= 0) return ''
  if (cachedTokens <= 0) return `${formatTokens(tokens)} Tokens`

  return `${formatTokens(tokens - cachedTokens)} neu · ${formatTokens(cachedTokens)} aus Cache`
}

export function sizeOf(raw: unknown): GlanceTaskSize {
  const size = String(raw ?? '').trim().toUpperCase()

  return size === 'S' || size === 'L' ? size : 'M'
}

/** Overall progress: finished work out of the plan, S/M/L counting 1/2/3, the current step in part. */
export function overallProgress(
  tasks: GlanceTask[],
  activePercent?: number,
): { percent: number; doneCount: number; work: number } {
  const total = tasks.reduce((sum, one) => sum + SIZE_WEIGHT[one.size], 0)
  const work = tasks.reduce((sum, one) => {
    const weight = SIZE_WEIGHT[one.size]
    if (one.status === 'done') return sum + weight
    if (one.status === 'active' && activePercent !== undefined) return sum + (weight * activePercent) / 100
    if (one.status === 'active' && one.hasReported) return sum + (weight * one.percent) / 100
    return sum
  }, 0)

  return {
    percent: total ? Math.round((100 * work) / total) : 0,
    doneCount: tasks.filter(one => one.status === 'done').length,
    work: total ? work / total : 0,
  }
}

/** Each step's start and end time, stamped as its status changes. */
export function stampTimes(tasks: GlanceTask[], at: number): GlanceTask[] {
  return tasks.map(one => {
    if (one.status === 'upcoming') return one.startedAt === null && one.finishedAt === null ? one : { ...one, startedAt: null, finishedAt: null }
    if (one.status === 'active') return one.startedAt === null || one.finishedAt !== null ? { ...one, startedAt: one.startedAt ?? at, finishedAt: null } : one
    return one.finishedAt === null ? { ...one, startedAt: one.startedAt ?? at, finishedAt: at } : one
  })
}

// A step of size M is expected to take 3 minutes until this job's or this project's pace is known.
export const DEFAULT_UNIT_MS = 90_000

// The project's pace from History counts as much as this many units of this job's own finished steps.
export const PACE_WEIGHT = 2

/**
 * How far along the current step looks: time spent against the time this job's finished steps took per
 * unit of size. It fills gradually, stays below 100 until the step is checked off, and never falls below
 * what Claude reported.
 *
 * Time left is null once the step runs past what it should take: the percentage then sits near the top
 * whatever happens, so time spent against it would keep saying "under a minute". A lower percentage that
 * Claude reported still gives an estimate.
 */
export function stepEstimate(list: GlanceChecklist, one: GlanceTask, at: number) {
  const done = list.tasks.filter(
    step => step.status === 'done' && step.startedAt !== null && step.finishedAt !== null && step.finishedAt > step.startedAt,
  )
  const units = done.reduce((sum, step) => sum + SIZE_WEIGHT[step.size], 0)
  const spent = done.reduce((sum, step) => sum + (step.finishedAt! - step.startedAt!), 0)
  const prior = list.paceMs === null ? 0 : PACE_WEIGHT
  const unitMs = units + prior > 0 ? (spent + (list.paceMs ?? 0) * prior) / (units + prior) : DEFAULT_UNIT_MS
  const expected = Math.max(10_000, unitMs * SIZE_WEIGHT[one.size])
  const elapsedMs = one.startedAt === null ? 0 : Math.max(0, at - one.startedAt)
  const estimate = Math.min(95, Math.round((100 * elapsedMs) / expected))
  const reported = one.hasReported && one.percent > 0 && one.percent < LONG_STEP_REPORT ? one.percent : null
  // Past its expected time, time spent says nothing more: what Claude reported is the better guess.
  const percent = elapsedMs > expected && reported !== null ? reported : Math.min(99, Math.max(one.hasReported ? one.percent : 0, estimate))
  const leftMs =
    elapsedMs <= expected
      ? percent > 0
        ? (elapsedMs * (100 - percent)) / percent
        : expected
      : reported === null
        ? null
        : (elapsedMs * (100 - reported)) / reported

  return { percent, elapsedMs, expectedMs: expected, leftMs }
}

// Past its expected time, a step's own report below this still says how far along it is.
export const LONG_STEP_REPORT = 90

/** A step's time left: short for the terminal's columns (`noch unter 1 Min.`), in words where text flows (`noch unter einer Minute`). */
export function leftLabel(ms: number | null, isWords = false): string {
  if (ms === null) return 'dauert länger'
  if (isWords) return ms < 60_000 ? 'noch unter einer Minute' : `noch etwa ${formatLeft(ms)}`
  return ms < 60_000 ? 'noch unter 1 Min.' : `noch etwa ${formatLeft(ms)}`
}

/**
 * Time left at this job's own pace since the plan once two steps are done. Before that, the steps left at
 * this project's usual pace from History; nothing when History doesn't know it yet.
 */
export function timeLeft(list: GlanceChecklist, at: number, activePercent?: number): number | null {
  const { doneCount, work } = overallProgress(list.tasks, activePercent)
  if (list.planAt === null || work >= 1) return null
  // A step running long makes any total a guess: say nothing rather than something too short.
  const active = list.tasks.find(one => one.status === 'active')
  if (active && stepEstimate(list, active, at).leftMs === null) return null
  if (doneCount >= 2 && work > 0) return Math.round(((at - list.planAt) / work) * (1 - work))
  if (list.paceMs === null) return null

  return Math.round(
    list.tasks
      .filter(one => one.status !== 'done')
      .reduce((sum, one) => sum + (stepEstimate(list, one, at).leftMs ?? 0), 0),
  )
}

/**
 * Steps still open after Claude answered. The last step alone still open counts as done:
 * Claude finished but forgot to report 100.
 */
export function hasUnfinishedWork(tasks: GlanceTask[]): boolean {
  const open = tasks.filter(one => one.status !== 'done')

  return open.length > 1 || (open.length === 1 && open[0] !== tasks[tasks.length - 1])
}

/** Header details in order of importance; the least important drop first so the title stays readable. */
export function headerDetails(parts: string[], room: number): string {
  const kept = parts.filter(Boolean)
  while (kept.length > 1 && kept.map(one => ` · ${one}`).join('').length > room) {
    kept.pop()
  }

  return kept.map(one => ` · ${one}`).join('')
}

/**
 * The pieces of a line that fit in `room` characters, joined by " · ": whole pieces, in order, leaving out any that
 * don't fit, so no word is ever cut in half. When none fits, the first keeps the whole words it has room for.
 */
export function wholePieces(pieces: string[], room: number): string {
  const all = pieces.filter(Boolean)
  const kept: string[] = []
  let used = 0
  for (const piece of all) {
    const size = widthOf(piece) + (kept.length > 0 ? 3 : 0)
    if (used + size <= room) {
      kept.push(piece)
      used += size
    }
  }
  if (kept.length > 0 || all.length === 0) return kept.join(' · ')
  let cut = ''
  for (const word of (all[0] ?? '').split(' ')) {
    const next = cut === '' ? word : `${cut} ${word}`
    if (widthOf(`${next}…`) > room) break
    cut = next
  }
  return cut === '' ? '' : `${cut.replace(/[\s·,;:]+$/, '')}…`
}

/** A model id as people say it: claude-haiku-4-5-20251001 → Haiku 4.5. */
export function prettyModel(model: string | null | undefined): string | null {
  if (!model) return null
  const match = /(opus|sonnet|haiku|fable)(?:[-_ ](\d+)(?:[-.](\d{1,2})(?!\d))?)?/i.exec(model)
  if (!match) return model
  const name = match[1]!.charAt(0).toUpperCase() + match[1]!.slice(1).toLowerCase()

  return [name, [match[2], match[3]].filter(Boolean).join('.')].filter(Boolean).join(' ')
}

/** The step new helpers belong to: the current one, or the last one once all are done. */
export function currentStepId(list: GlanceChecklist): string {
  return (list.tasks.find(one => one.status === 'active') ?? list.tasks[list.tasks.length - 1])?.id ?? ''
}

/** A file's path within the project; outside it, just its name. */
export function projectPath(path: string, project: string): string {
  const root = project.replace(/[\\/]+$/, '')
  if (root !== '' && (path.startsWith(`${root}/`) || path.startsWith(`${root}\\`))) return path.slice(root.length + 1)

  return path.split(/[\\/]/).pop() ?? path
}

export type BackgroundTask = { id: string; type: string; status: string; description: string }

/** Background tasks as the latest list has them: new ones join, ones no longer listed have finished. */
export function reconcileBackground(list: GlanceChecklist, tasks: readonly BackgroundTask[]): GlanceHelper[] {
  const listed = new Map(tasks.map(one => [`bg:${one.id}`, one]))
  const kept = list.helpers.map(helper => {
    if (helper.kind !== 'background' || helper.status !== 'running') return helper
    const still = listed.get(helper.id)
    return still ? helper : { ...helper, status: 'done' as const }
  })
  const known = new Set(kept.map(one => one.id))
  const added = tasks
    .filter(one => !known.has(`bg:${one.id}`))
    .map(
      (one): GlanceHelper => ({
        id: `bg:${one.id}`,
        stepId: currentStepId(list),
        kind: 'background',
        label: cleanName(one.description, MAX_DETAIL),
        type: one.type,
        model: null,
        effort: null,
        status: 'running',
        tokens: 0,
      }),
    )

  return [...kept, ...added]
}

/** What a tool call is doing, in plain words; null for planning tools and helpers, which show elsewhere. */
export function activityOf(tool: string, input: { command?: unknown }): string | null {
  if (tool === 'Read' || tool === 'NotebookRead') return 'Liest Dateien'
  if (tool === 'Grep' || tool === 'Glob' || tool === 'LS') return 'Durchsucht das Projekt'
  if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') return 'Bearbeitet Dateien'
  if (tool === 'Write') return 'Schreibt Dateien'
  if (tool === 'WebFetch') return 'Liest eine Webseite'
  if (tool === 'WebSearch') return 'Sucht im Web'
  if (tool === 'Skill') return 'Folgt einem Skill'
  if (tool.startsWith('mcp__') && !tool.startsWith(`mcp__${PLUGIN}__`)) return 'Nutzt eine verbundene App'
  if (tool === 'Bash' || tool === 'PowerShell') {
    const command = String(input.command ?? '')
    if (/\b(test|tests|jest|vitest|pytest|mocha|playwright|rspec)\b/i.test(command)) return 'Führt die Tests aus'
    if (/\b(npm|pnpm|yarn|bun|pip3?|brew|cargo|gem)\s+(install|add|i)\b/i.test(command)) return 'Installiert Pakete'
    if (/\bgit\s+\w+/.test(command)) return 'Arbeitet mit Git'
    if (/\b(build|tsc|compile)\b/i.test(command)) return 'Baut das Projekt'
    return 'Führt einen Befehl aus'
  }
  return null
}

/** A job's cost in plain dollars, with a decimal comma: "0,42 $", or "<0,01 $" for less than a cent. */
export function formatCost(usd: number): string {
  return usd < 0.01 ? '<0,01 $' : `${usd.toFixed(2).replace('.', ',')} $`
}

/** What the job has cost so far, from the session's spend; null where the host keeps no ledger. */
export function jobCost(list: GlanceChecklist, usage: GlanceUsage): number | null {
  return usage.costUsd === null || list.costAtStart === null ? null : Math.max(0, usage.costUsd - list.costAtStart)
}

export function isBusy(list: GlanceChecklist): boolean {
  return list.helpers.some(one => one.status === 'running')
}

/** A helper Claude started still runs; a background shell does not count, since it need never end. */
export function hasRunningWorker(list: GlanceChecklist): boolean {
  return list.helpers.some(one => one.kind === 'helper' && one.status === 'running')
}

/** A short "carry on" the person typed, in English, German or Greek: it continues the job instead of starting a new one. */
export function isContinueWords(text: string): boolean {
  const words = text.trim().toLowerCase().replace(/[.!…,;:]+$/g, '').replace(/\s+/g, ' ')
  return (
    /^(please )?(continue|go on|keep going|resume|carry on|proceed|go ahead)( please)?$/.test(words) ||
    /^(?:(?:ja|ok|okay),? )?(?:bitte,? )?(weiter|mach weiter|mach bitte weiter|weitermachen|weiter machen|fortfahren|fahr fort|fahre fort|fortsetzen|setz fort|setze fort|weiter geht['’]?s)(?:,? bitte)?$/.test(words) ||
    /^(σε παρακαλώ |παρακαλώ )?(συνέχισε|συνεχισε|συνέχεια|συνεχεια|προχώρα|προχωρα)( σε παρακαλώ| παρακαλώ| παρακαλω)?$/.test(words)
  )
}

/**
 * A "go ahead" the person typed: a short message of go-ahead words alone, in English, German or Greek, or a German
 * go-ahead ("leg los", "fang an", "mach es so") that opens a sentence or clause of a longer message. It approves the plan.
 */
export function isStartWords(text: string): boolean {
  const words = text.trim().toLowerCase().replace(/[.!…,;:]+$/g, '').replace(/\s+/g, ' ')
  return (
    /^(start|go|go ahead|ok|okay|yes|looks good|approved?|ξεκίνα|ξεκινα|ναι|οκ|εντάξει|ενταξει)( please)?$/.test(words) ||
    /^(?:(?:ja|ok|okay|gut|super),? )?(?:bitte,? )?(start|starte|starten|los|leg los|los geht['’]?s|fang an|ja|ok|okay|passt|passt so|sieht gut aus|freigegeben|freigeben|einverstanden|mach das|mach mal)(?:,? bitte)?$/.test(words) ||
    saysStart(text)
  )
}

/**
 * "Starte sofort" at the head of a message or as its last sentence: the plan Claude makes for it needs no approval,
 * whatever follows or precedes ("Starte sofort: Schreib die Übergabe, bevor der Server neu startet", or a cron job that
 * ends with "... Antworte danach nur mit einer Zeile. Starte sofort"). Typed by the person or put there by a cron job.
 */
export function startsAtOnce(text: string): boolean {
  return (
    /^\s*starte\s+(?:bitte\s+)?sofort(?![\p{L}\p{N}])/iu.test(text) ||
    /(?:^|[.!?\n])\s*(?:bitte\s+)?starte\s+(?:bitte\s+)?sofort[.!]*\s*$/iu.test(text)
  )
}

// Filler words that may open a clause before a go-ahead: "also: leg los", "ja, dann fang bitte an".
const LEAD_IN = String.raw`(?:(?:also|dann|jetzt|nun|gut|super|prima|okay|ok|ja|und|einfach|bitte)\s*,?\s+)*`
// A German go-ahead at the start of a sentence or clause; a letter or digit after it makes it another word.
const START_PHRASE = new RegExp(
  String.raw`(?:^|[,:;–—]\s*)` +
    LEAD_IN +
    String.raw`(?:leg (?:bitte |jetzt |doch |einfach |gleich )?los|legen sie (?:bitte |jetzt |gleich )?los|los geht['’]?s|fang (?:bitte |jetzt |doch |einfach |gleich )?an|mach (?:das|es) so|ja,? los)(?![\p{L}\p{N}])`,
  'u',
)
// A sentence that is a go-ahead word and nothing else: "Start.", "Go!", "Also: los."
const START_ALONE = new RegExp(String.raw`^` + LEAD_IN + String.raw`(?:start|starte|starten|go|go ahead|los)$`, 'u')
// Anywhere in the message, these hold the plan back: "nein", "warte", "stopp".
const HOLD_WORDS = /(?<![\p{L}])(?:nein|nö|warte|wartet|abwarten|stopp|stop)(?![\p{L}])/u
// In the same sentence, a negation, a "but" or a condition keeps a go-ahead from counting: "mach das so nicht",
// "wenn die Tests grün sind, leg los".
const HEDGE_WORDS =
  /(?<![\p{L}])(?:nicht|nichts|kein|keine|keinen|nie|niemals|aber|wenn|falls|sobald|bevor|nachdem|not|don['’]t|if|once|before|when)(?![\p{L}])/u
// Words in double quotes are quoted, not said: Schreib „leg los“ in die Anleitung.
const QUOTED_WORDS = /„[^“”"]*[“”"]|“[^”"]*[”"]|"[^"]*"|»[^«]*«|«[^»]*»/g

/**
 * A German go-ahead inside a longer message. Careful on purpose: it counts only where it opens a sentence or clause,
 * not in a sentence that ends with "?", has a negation, a "but" or a condition, and never in a message that says
 * no, wait or stop anywhere. Quoted words do not count.
 */
function saysStart(text: string): boolean {
  const said = text.toLowerCase().replace(QUOTED_WORDS, ' ')
  if (HOLD_WORDS.test(said)) return false
  return (said.match(/[^.!?…\n]+[.!?…\n]*/g) ?? []).some(chunk => {
    const sentence = chunk.replace(/[.!?…\n]+$/, '').replace(/\s+/g, ' ').trim()
    const isQuestion = /\?[.!?…\s]*$/.test(chunk)
    if (sentence === '' || isQuestion || HEDGE_WORDS.test(sentence)) return false
    return START_PHRASE.test(sentence) || START_ALONE.test(sentence.replace(/[,;:]+$/, ''))
  })
}

/**
 * A longer message whose last sentence is a "carry on" alone: "Entschuldige, der Rechner war aus. Mach bitte weiter".
 * Sentences split as saysStart splits them; quoted words do not count, and a question is no carry on.
 */
export function endsWithContinue(text: string): boolean {
  const said = text.replace(QUOTED_WORDS, ' ')
  const sentences = (said.match(/[^.!?…\n]+[.!?…\n]*/g) ?? []).filter(chunk => chunk.replace(/[.!?…\s]+/g, '') !== '')
  const last = sentences.at(-1)
  if (last === undefined || /\?[.!?…\s]*$/.test(last)) return false
  return isContinueWords(last.replace(/[.!?…\n]+$/, ''))
}

// Words that may open a clause before a work instruction: "dann setze bitte b) um", "ok, füg den Test hinzu".
const DO_LEAD_IN = String.raw`(?:(?:also|dann|jetzt|nun|gut|super|prima|okay|ok|ja|und|einfach|bitte|übrigens|außerdem|danach|anschließend)\s*,?\s+)*`
// A clause starts at the start of a sentence or after , : ; or a dash.
const AT_CLAUSE = String.raw`(?:^|[,:;–—]\s*)` + DO_LEAD_IN
// "setze ich um", "mach ich": the person says what they do themselves, they ask nothing of Claude.
const NOT_SPEAKER = String.raw`(?! (?:ich|wir)(?![\p{L}\p{N}]))`
// Anything up to a separable particle within the clause: "setze bitte b) um".
const UP_TO = String.raw`(?: [^,;:–—]*?)? `
const WORD_END = String.raw`(?![\p{L}\p{N}])`
// Infinitives that carry out what was talked about ("bitte umsetzen"), and those that do some other work.
const CARRY_OUT_INFINITIVE = String.raw`(?:umsetzen|übernehmen)`
const WORK_INFINITIVE = String.raw`(?:einbauen|umbauen|aufbauen|machen|ändern|hinzufügen|einfügen|rausnehmen|herausnehmen|wegnehmen|entfernen|löschen|reinschreiben|hineinschreiben|umschreiben|umbenennen|nennen|anpassen|korrigieren|ergänzen|erstellen|einspielen|abschalten|ausschalten|einschalten|anschalten|beheben|reparieren|implementieren|aktualisieren|installieren|testen|aufräumen|verschieben|umstellen|einrichten|einbinden|nachmessen|prüfen|nachsehen|ausprobieren|ausführen)`
// "lass uns das einbauen", at the start of a clause; "bitte (so) umsetzen", with the infinitive ending the clause.
const letUs = (infinitive: string) => String.raw`lass(?:t)? uns${UP_TO}${infinitive}${WORD_END}`
const please = (infinitive: string) =>
  String.raw`(?<![\p{L}\p{N}])bitte,?(?: [^\s,;:–—]+){0,4}? ${infinitive}(?=\s*(?:[,;:–—]|$))`
// Instructions to carry out what was talked about. They count even where the sentence names the plan or a
// suggestion: "setz den Plan um", "übernimm den Vorschlag".
const CARRY_OUT = new RegExp(
  String.raw`${AT_CLAUSE}(?:setz(?:e)?${NOT_SPEAKER}${UP_TO}um${WORD_END}|übernimm${NOT_SPEAKER}${WORD_END}|${letUs(CARRY_OUT_INFINITIVE)})` +
    `|${please(CARRY_OUT_INFINITIVE)}`,
  'u',
)
// Instructions to do some work: build, change, add, take out, delete, write in, rename, adjust, fix, switch off,
// measure, check, look up, try out, run, show.
// "schreib" counts only with a particle ("schreib das rein"): bare it is often about Claude's answer, "schreib mir".
const DO_WORK = new RegExp(
  String.raw`${AT_CLAUSE}(?:` +
    [
      String.raw`bau(?:e)?${NOT_SPEAKER}${UP_TO}(?:ein|um|auf)${WORD_END}`,
      String.raw`mach(?:e)?${NOT_SPEAKER}(?= [\p{L}\p{N}])`,
      String.raw`(?:änder(?:e)?|ändre)${NOT_SPEAKER}${WORD_END}`,
      String.raw`füg(?:e)?${NOT_SPEAKER}${UP_TO}(?:hinzu|ein)${WORD_END}`,
      // "nimm die Zeile raus", and a pick: "nimm b".
      String.raw`nimm${NOT_SPEAKER}(?= [\p{L}\p{N}])`,
      String.raw`(?:beheb|reparier|implementier|aktualisier|installier)(?:e)?${NOT_SPEAKER}${WORD_END}`,
      String.raw`teste${NOT_SPEAKER}${WORD_END}`,
      String.raw`räum(?:e)?${NOT_SPEAKER}${UP_TO}auf${WORD_END}`,
      // "verschieb den Knopf nach rechts", not "verschieb das auf morgen".
      String.raw`verschieb(?:e)?${NOT_SPEAKER}(?![^,;:–—]*(?:später|morgen|nachher)${WORD_END})${WORD_END}`,
      String.raw`(?:stell|richt|bind)(?:e)?${NOT_SPEAKER}${UP_TO}(?:um|ein)${WORD_END}`,
      String.raw`(?:entfern|lösch|korrigier|ergänz|erstell)(?:e)?${NOT_SPEAKER}${WORD_END}`,
      String.raw`schreib(?:e)?${NOT_SPEAKER}${UP_TO}(?:rein|hinein|um|neu|dazu)${WORD_END}`,
      String.raw`benenn(?:e)?${NOT_SPEAKER}${UP_TO}um${WORD_END}`,
      String.raw`nenn(?:e)?${NOT_SPEAKER}(?! (?:mir|uns)${WORD_END})(?= [\p{L}\p{N}])`,
      String.raw`pass(?:e)?${NOT_SPEAKER}${UP_TO}an${WORD_END}`,
      String.raw`spiel(?:e)?${NOT_SPEAKER}${UP_TO}ein${WORD_END}`,
      String.raw`schalt(?:e)?${NOT_SPEAKER}${UP_TO}(?:ab|aus|ein|an)${WORD_END}`,
      String.raw`(?:miss|miß|mess(?:e)?)${NOT_SPEAKER}${UP_TO}(?:nach|aus)${WORD_END}`,
      String.raw`(?:prüf|check)(?:e)?${NOT_SPEAKER}${WORD_END}`,
      String.raw`schau(?:e)?${NOT_SPEAKER}${UP_TO}(?:nach|an)${WORD_END}`,
      String.raw`sieh${NOT_SPEAKER}${UP_TO}nach${WORD_END}`,
      String.raw`(?:probier|führ)(?:e)?${NOT_SPEAKER}${UP_TO}aus${WORD_END}`,
      // "zeig das Ergebnis"; "zeig mir" asks for an explanation (EXPLAIN).
      String.raw`zeig(?:e)?${NOT_SPEAKER}(?! (?:mir|uns)${WORD_END})(?= [\p{L}\p{N}])`,
      letUs(WORK_INFINITIVE),
    ].join('|') +
    String.raw`)|${please(WORK_INFINITIVE)}|(?<![\p{L}\p{N}])kann (?:also |ruhig |dann )?weg${WORD_END}`,
  'u',
)
// Work on the plan itself, or a request for words rather than work: "ändere Schritt zwei", "mach mal einen neuen
// Plan", "nenn die Vorteile". There a work instruction gives no go-ahead.
const PLAN_TALK =
  /(?<![\p{L}\p{N}-])(?:plan|pläne|plans|planes|schritt\p{L}*|vorschlag|vorschläge|vorschlägen|pause|übersicht|überblick|zusammenfassung|erklärung|beispiel\p{L}*|gründe|vorteile|nachteile|optionen|alternativen|möglichkeiten)(?![\p{L}\p{N}-])/u
// A request for an explanation, not for work: "erkläre mir", "zeig mir", "sag mir", "liste … auf", "nenn mir".
const EXPLAIN =
  /(?<![\p{L}\p{N}])(?:erklär\p{L}*|(?:zeig|zeige|sag|sage|nenn|nenne) (?:mir|uns)|list(?:e)? (?:[^,;:–—]* )?auf)(?![\p{L}\p{N}])/u
// In the same sentence, a negation or a condition keeps an instruction or a yes from counting.
const DO_HEDGE = /(?<![\p{L}])(?:nicht|nichts|kein|keine|keinen|keinem|keiner|keines|nie|niemals|wenn|falls|sobald|bevor|nachdem)(?![\p{L}])/u
const BUT = /(?<![\p{L}])aber(?![\p{L}])/u
// A go-ahead word that opens the message, then "und", a comma, a full stop or "!" with more: "Los und schau ... an".
const GO_AHEAD_THEN =
  /^\s*(?:bitte,?\s+)?(?:leg los|los|ja|okay|ok|passt|starte|start|mach das|einverstanden|freigegeben)(?:,?\s+bitte)?(?:\s*[,.!]|\s+und(?![\p{L}\p{N}]))/u
// After such a go-ahead, a reservation keeps it from counting: "Los, aber ändere vorher Schritt 2".
const GO_AHEAD_RESERVE = /(?<![\p{L}])(?:aber|doch|erst|vorher|warte\p{L}*|stopp?|nicht|ändere?|ändre|statt)(?![\p{L}])/u

/** A clause that tells Claude to do work, not about the plan itself. */
function tellsWork(clause: string): boolean {
  return CARRY_OUT.test(clause) || (DO_WORK.test(clause) && !PLAN_TALK.test(clause))
}

/**
 * A clear request to carry out work, worded any way, in German: an imperative of work that opens a sentence or clause
 * ("dann setze bitte b) um", "nenne es lieber Push", "das kann weg", "lass uns das so machen"), or a sentence that
 * starts with "Ja". Careful on purpose: not in a question, not in a sentence with a negation or a condition, not in a
 * request for an explanation, and never in a message that says no, wait or stop, or that changes the plan itself. With
 * "aber" in a sentence only what follows it counts, and only as an instruction: "Gut, aber …" alone is no go-ahead.
 * Quoted words do not count. It approves a plan that waits for Start, or one made in reply to Claude's question
 * (offersChoice); a new request's own plan still waits.
 */
export function saysDo(text: string): boolean {
  const said = text.toLowerCase().replace(QUOTED_WORDS, ' ')
  if (HOLD_WORDS.test(said)) return false
  const sentences = (said.match(/[^.!?…\n]+[.!?…\n]*/g) ?? []).map(chunk => ({
    sentence: chunk.replace(/[.!?…\n]+$/, '').replace(/\s+/g, ' ').trim(),
    isQuestion: /\?[.!?…\s]*$/.test(chunk),
  }))
  // A change to the plan anywhere in the message holds it back: "Ja. Ändere Schritt zwei."
  if (sentences.some(({ sentence }) => DO_WORK.test(sentence) && PLAN_TALK.test(sentence))) return false
  // "Los und schau dir auch ... an", "Okay, arbeite bitte alle Punkte ab": a go-ahead word first, then more to do.
  const head = GO_AHEAD_THEN.exec(said)
  if (head !== null) {
    const rest = said.slice(head[0].length)
    // A condition or a negation after it holds it back as in any sentence: "Ja, wenn du meinst."
    if (rest.trim() !== '' && !rest.includes('?') && !GO_AHEAD_RESERVE.test(rest) && !DO_HEDGE.test(rest)) return true
  }
  return sentences.some(({ sentence, isQuestion }) => {
    if (sentence === '' || isQuestion || DO_HEDGE.test(sentence) || EXPLAIN.test(sentence)) return false
    const parts = sentence.split(BUT)
    if (parts.length > 1) return tellsWork(parts[parts.length - 1]!.replace(/^[\s,;:–—]+/, ''))
    return /^ja(?![\p{L}\p{N}])/u.test(sentence) || tellsWork(sentence)
  })
}

// A status line Claude may put after its question: "Stand: Schritt 4 von 7.", "**Zwischenstand** 3 von 5 erledigt".
const STATUS_LINE = /^(?:zwischenstand|stand|status)(?::|\s)/i
const MAX_STATUS_LINE = 160
// At most this many status lines are passed over at the end of an answer.
const MAX_STATUS_LINES = 2

/**
 * Claude's answer without the status lines at its end (up to two, each a short line that opens with Stand, Status or
 * Zwischenstand, blank lines between them too), so that a question before them still ends the answer. A status line
 * that asks something itself stays. Nothing left without them, or none there: the answer as it is.
 */
export function withoutStatusLines(answer: string): string {
  const lines = answer.split(/\r?\n/)
  let end = lines.length
  let passed = 0
  while (end > 0) {
    const line = lines[end - 1]!.trim()
    if (line === '') {
      end--
      continue
    }
    const plain = line.replace(/[*_>]+/g, '').trim().replace(/^(?:[-•+]|\d+[.)])\s+/, '')
    const isStatus = passed < MAX_STATUS_LINES && line.length <= MAX_STATUS_LINE && STATUS_LINE.test(plain) && !/\?\s*$/.test(plain)
    if (!isStatus) break
    passed++
    end--
  }
  if (passed === 0) return answer
  const rest = lines.slice(0, end).join('\n').trimEnd()
  return rest === '' ? answer : rest
}

// Claude's closing words that ask the person to pick or to go on, without a question mark: "Sag mir, welche du
// willst.", "Nimm a oder b, dann lege ich los.", "Schreib los.", "Antworte "ja" oder "nein"."
const CHOICE_INVITE = new RegExp(
  String.raw`(?:^|[,;:–—]\s*)(?:(?:sag|sage|schreib|schreibe|gib) (?:mir|uns)|schreib(?:e)? los|welche[nrsm]?|wähl(?:e)?|such(?:e)? dir|entscheide? dich)(?![\p{L}\p{N}])` +
    String.raw`|(?<![\p{L}\p{N}])antworte(?:t)?(?: mit)? ["„“»']` +
    String.raw`|(?:^|[,;:–—]\s*)dann (?:leg(?:e)? ich(?: [^\s,;:]+){0,3} los|fang(?:e)? ich(?: [^\s,;:]+){0,3} an|starte ich|setz(?:e)? ich(?: [^\s,;:]+){0,3} um|mach(?:e)? ich(?: [^\s,;:]+){0,3} weiter)(?![\p{L}\p{N}])`,
  'u',
)

/**
 * Claude's answer ends by asking the person something or by offering a choice: a question (asksQuestion), or closing
 * words such as "Sag mir, welche du willst." or "…, dann lege ich los." A request that follows it answers it, so the
 * plan Claude then makes in that turn needs no Start. "Sag mir Bescheid, wenn …" is a farewell, not a choice.
 */
export function offersChoice(answer: string): boolean {
  if (asksQuestion(answer)) return true
  const text = withoutStatusLines(answer).trimEnd()
  if (text.endsWith('```')) return false
  const lastLine = text.split('\n').map(line => line.trim()).filter(Boolean).pop() ?? ''
  const plain = lastLine.replace(/[*_`>#]+/g, '').replace(/^(?:[-•]|\d+[.)])\s+/, '').toLowerCase()
  const last = ((plain.match(/[^.!…]+[.!…]*/g) ?? []).pop() ?? '').replace(/[.!…\s]+$/, '').trim()
  if (last === '') return false
  if (/(?<![\p{L}])bescheid(?![\p{L}])/u.test(last) && /(?<![\p{L}])(?:wenn|falls|sobald)(?![\p{L}])/u.test(last)) return false
  return CHOICE_INVITE.test(last)
}

/**
 * Claude's last message ends by asking the person something. Greek writes its question mark as ";", so a ";" counts
 * in Greek text and nowhere else; a code block never does. German closing quotes (“ and «) are passed over like ” and ».
 */
export function asksQuestion(answer: string): boolean {
  const end = withoutStatusLines(answer).trimEnd().replace(/[*_"'”“«»)\s]+$/g, '')
  return /[?？؟]$/.test(end) || (end.endsWith(';') && /\p{Script=Greek}/u.test(end))
}

/**
 * The full head SHA Ship it last asked the person to approve, or null: "Antworte genau: Merge freigeben <SHA>", or the
 * English "Reply exactly: Approve merge <SHA>".
 */
export function askedMergeSha(answer: string): string | null {
  return (
    [...answer.matchAll(/(?:Reply exactly|Antworte (?:genau|exakt|wörtlich)(?: mit)?):\s*`?(?:Approve merge|Merge freigeben) ([0-9a-f]{40})`?/g)].pop()?.[1] ??
    null
  )
}

/**
 * A word as Bash passes it on, and whether Bash builds it at run time: from $…, `…`, a glob, {a,b}, ~ or =. `runs`
 * holds the code of an unquoted $(…) or `…` in it, which Bash runs first.
 */
export type ShellWord = { text: string; isRunTime: boolean; runs?: string[]; isOperator?: true }
/** The words of one command, or of one line of a heredoc's body. */
export type ShellPiece = { words: ShellWord[]; isBody: boolean }

// $'…' escapes every shell spells alike; \u, \U and \c differ between Bash 3.2, newer Bash and zsh.
const ANSI_C: Record<string, string> = { a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' }
// A heredoc's start, <<EOF, <<-EOF, <<'EOF' or <<"EOF"; a delimiter spelled any other way leaves its lines as commands.
const HEREDOC = /^<<(-?)[ \t]*(['"]?)([^\s'"<>;|&()]+)\2(?=[\s;|&<>()]|$)/

/**
 * Reads a Bash command into pieces of words the way Bash spells them before it runs anything: \ and a newline go,
 * \c is c, '…', "…" (with \" \\ \$ \` and \ newline) and $'…' join their neighbours into one word, # starts a
 * comment, a heredoc's lines are its body, ; | & and newlines end a piece, and ( ) < > stand as words of their own.
 * shortcut: a bounded lexer, not a parser; it never runs or expands anything. A word built at run time keeps its text
 * as written and is marked, and $(…) is read to its matching ) past quotes and heredocs only.
 */
export function shellPieces(command: string): ShellPiece[] {
  const pieces: ShellPiece[] = []
  const heredocs: { delimiter: string; isTabbed: boolean }[] = []
  let words: ShellWord[] = []
  let word: ShellWord | null = null
  // The word's unquoted characters, where globs and brace lists count.
  let bare = ''
  const add = (text: string, isQuoted = false): ShellWord => {
    // ~ and zsh's = expand only at the start of a word, unquoted.
    word ??= { text: '', isRunTime: !isQuoted && /^[~=]/.test(text) }
    word.text += text
    if (!isQuoted) bare += text
    return word
  }
  const runTime = (text: string, runs?: string) => {
    const one = add(text, true)
    one.isRunTime = true
    if (runs !== undefined) (one.runs ??= []).push(runs)
  }
  const endWord = () => {
    if (word !== null) {
      if (/[*?]|\[[^\]]+\]|\{.*(?:,|\.\.).*\}/.test(bare)) word.isRunTime = true
      words.push(word)
    }
    word = null
    bare = ''
  }
  const endPiece = () => {
    endWord()
    pieces.push({ words, isBody: false })
    words = []
  }
  // The index of the next unescaped quote, or the end.
  const end = (from: number, quote: string): number => {
    for (let at = from; at < command.length; at++) {
      if (command[at] === '\\' && quote !== "'") at++
      else if (command[at] === quote) return at
    }
    return command.length
  }
  // A heredoc's body lines from `from`, and the index of the newline that ends its delimiter line.
  const body = (from: number, delimiter: string, isTabbed: boolean) => {
    const lines: string[] = []
    for (let at = from; at < command.length; ) {
      const stop = command.indexOf('\n', at) < 0 ? command.length : command.indexOf('\n', at)
      const line = command.slice(at, stop)
      if ((isTabbed ? line.replace(/^\t+/, '') : line) === delimiter) return { lines, next: stop }
      lines.push(line)
      at = stop + 1
    }
    return { lines, next: command.length }
  }
  // The index of the ) of $( or the } of ${, past quotes and heredocs.
  const closing = (from: number, open: string, close: string): number => {
    let depth = 0
    for (let at = from; at < command.length; at++) {
      const char = command[at]
      const heredoc = char === '<' ? HEREDOC.exec(command.slice(at)) : null
      if (char === '\\') at++
      else if (char === "'" || char === '"' || char === '`') at = end(at + 1, char)
      else if (heredoc?.[3] !== undefined && command.indexOf('\n', at) >= 0) at = body(command.indexOf('\n', at) + 1, heredoc[3], heredoc[1] === '-').next
      else if (char === open) depth++
      else if (char === close && --depth === 0) return at
    }
    return command.length
  }
  // $'…', decoded; returns the index of its closing quote.
  const ansiC = (from: number): number => {
    let text = ''
    let isShellSpecific = false
    let at = from
    for (; at < command.length && command[at] !== "'"; at++) {
      if (command[at] !== '\\') {
        text += command[at]
        continue
      }
      const code = command[++at] ?? ''
      const hex = code === 'x' ? /^[0-9A-Fa-f]{1,2}/.exec(command.slice(at + 1)) : null
      const octal = /^[0-7]{1,3}/.exec(command.slice(at))
      if (Object.hasOwn(ANSI_C, code)) text += ANSI_C[code]
      else if (hex) {
        text += String.fromCharCode(parseInt(hex[0], 16))
        at += hex[0].length
      } else if (octal) {
        text += String.fromCharCode(parseInt(octal[0], 8))
        at += octal[0].length - 1
      } else {
        isShellSpecific ||= code !== '' && 'uUc'.includes(code)
        text += `\\${code}`
      }
    }
    add(text, true).isRunTime ||= isShellSpecific
    return at
  }
  // $… or `…`: a word built at run time, kept as written; returns the index of its last character.
  const dollar = (at: number, isQuoted: boolean): number => {
    const next = command[at + 1] ?? ''
    if (command[at] === '`') {
      const stop = end(at + 1, '`')
      runTime(command.slice(at, stop + 1), isQuoted ? undefined : command.slice(at + 1, stop))
      return stop
    }
    if (next === "'" && !isQuoted) return ansiC(at + 2)
    // $"…" is translated at run time; the "…" itself is read next.
    if (next === '"' && !isQuoted) {
      runTime('')
      return at
    }
    if (next === '(' || next === '{') {
      const stop = closing(at + 1, next, next === '(' ? ')' : '}')
      // shortcut: the code of "$(…)" in double quotes, like a commit message from a heredoc, is not read.
      const isCode = next === '(' && command[at + 2] !== '(' && !isQuoted
      runTime(command.slice(at, stop + 1), isCode ? command.slice(at + 2, stop) : undefined)
      return stop
    }
    const name = /^(?:[A-Za-z_]\w*|[0-9@*#?$!-])/.exec(command.slice(at + 1))
    if (name === null) {
      add('$', isQuoted)
      return at
    }
    runTime(`$${name[0]}`)
    return at + name[0].length
  }
  // "…", unescaped; returns the index of its closing quote.
  const doubleQuoted = (from: number): number => {
    add('', true)
    for (let at = from; at < command.length; at++) {
      const char = command.charAt(at)
      const next = command[at + 1]
      if (char === '"') return at
      if (char === '\\' && next !== undefined && '"\\$`\n'.includes(next)) {
        at++
        if (next !== '\n') add(next, true)
      } else if (char === '$' || char === '`') at = dollar(at, true)
      else add(char, true)
    }
    return command.length
  }

  for (let at = 0; at < command.length; at++) {
    const char = command.charAt(at)
    const next = command[at + 1]
    if (char === '\\') {
      at++
      if (next !== '\n') add(next ?? '\\', true)
    } else if (char === "'") {
      const stop = end(at + 1, "'")
      add(command.slice(at + 1, stop), true)
      at = stop
    } else if (char === '"') at = doubleQuoted(at + 1)
    else if (char === '$' || char === '`') at = dollar(at, false)
    else if (char === '#' && word === null) {
      // A comment runs to the end of its line.
      const stop = command.indexOf('\n', at)
      at = (stop < 0 ? command.length : stop) - 1
    } else if (char === ' ' || char === '\t') endWord()
    else if (';|&\n'.includes(char)) {
      endPiece()
      if ((char === '|' || char === '&') && next === char) at++
      // After the line that starts them, heredocs' bodies, in order.
      for (const { delimiter, isTabbed } of char === '\n' ? heredocs.splice(0) : []) {
        const { lines, next: stop } = body(at + 1, delimiter, isTabbed)
        for (const line of lines) pieces.push(...shellPieces(line).map(piece => ({ ...piece, isBody: true })))
        at = stop
      }
    } else if ('()<>'.includes(char)) {
      endWord()
      const heredoc = char === '<' ? HEREDOC.exec(command.slice(at)) : null
      const operator = command.startsWith('<<<', at) ? '<<<' : heredoc ? `<<${heredoc[1]}` : command.startsWith('>>', at) ? '>>' : char
      if (heredoc?.[3] !== undefined && operator !== '<<<') heredocs.push({ delimiter: heredoc[3], isTabbed: heredoc[1] === '-' })
      // Marked, so a quoted ">" (a word like any other) is never read as a redirection.
      words.push({ text: operator, isRunTime: false, isOperator: true })
      at += operator.length - 1
    } else add(char)
  }
  endPiece()
  return pieces
}

/** Splits a shell command at ;, |, ||, &, && and newlines that stand outside single and double quotes. */
function commandPieces(command: string): string[] {
  const pieces: string[] = []
  let piece = ''
  let quote: string | null = null
  for (let at = 0; at < command.length; at++) {
    const char = command.charAt(at)
    if (quote === null && ';|&\n'.includes(char)) {
      pieces.push(piece)
      piece = ''
      if ((char === '|' || char === '&') && command[at + 1] === char) at++
      continue
    }
    if (char === '\\' && quote !== "'") {
      piece += char + (command[++at] ?? '')
      continue
    }
    if (quote === null && (char === '"' || char === "'")) quote = char
    else if (char === quote) quote = null
    piece += char
  }
  return [...pieces, piece]
}

// The pieces of a command that run gh: pieces at the top level, and pieces of the quoted command string of
// bash -c, sh -c or zsh -c. Text inside other quotes, like a commit message, is never a piece of its own.
// shortcut: reads the command as text; the word checks below see quoted and escaped spellings, and a heredoc line
// that starts with gh pr merge counts as a merge (refused, never allowed by mistake).
const WRAPPED = /^\s*(?:ba|z)?sh\s+-c\s+(["'])([\s\S]*)\1\s*$/
const ghPieces = (command: string): string[] =>
  commandPieces(command).flatMap(piece => {
    const wrapped = WRAPPED.exec(piece)
    return wrapped?.[2] !== undefined ? ghPieces(wrapped[2]) : [piece]
  })
const PR_MERGE = /^\s*gh\s+pr\s+merge\b/
// gh api, curl and wget routes that merge or schedule a merge: REST pull and branch merges, GraphQL merge, auto-merge and merge queue.
const MERGE_ROUTE =
  /pulls\/[^/\s]+\/merge\b|repos\/[^/\s]+\/[^/\s]+\/merges\b|mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest|mergeBranch/

// A merge run through a wrapper instead of on its own: (…), { …; }, !, env, command, sudo, exec, time, xargs, VAR=x,
// a path to gh, or eval and sh -c after any of those. Fails closed: gh pr merge outside quotes anywhere in the piece
// counts, and so does the quoted text that eval or sh -c runs. Text inside other quotes, like a commit message, does not.
const QUOTED = /"(?:\\[\s\S]|[^"\\])*"|'[^']*'/g
const RUNS_QUOTED = /(?:^|[^\w-])(?:(?:ba|z)?sh\s+-\w*c|eval)\b/
const GH_MERGE = /(?:^|[^\w-])gh\s+pr\s+merge\b/
const GH_API = /(?:^|[^\w-])gh\s+api\b/
// The text of a piece that runs: what stands outside quotes, or all of it when eval or sh -c runs its quoted text.
const runText = (piece: string) => {
  const outside = piece.replace(QUOTED, '""')
  return RUNS_QUOTED.test(outside) ? piece : outside
}
const wrappedMerge = (piece: string) => GH_MERGE.test(runText(piece))
// gh api run in any piece, bare or wrapped; text that only mentions it, like echo "gh api", does not run it.
const runsGhApi = (command: string) => ghPieces(command).some(piece => GH_API.test(runText(piece)))

// curl or wget where a command starts: at the start of a piece, after $( or `, after if, then, else, elif, do, while,
// until or the wrappers above, all outside quotes; the quoted text that eval or sh -c runs is read the same way. Text
// that only mentions them, like echo curl or grep wget, does not run them.
// shortcut: reads the command as text; curl or wget reached through a variable, an alias, a script, an interpreter, "$(…)"
// in double quotes or another wrapper is not detected, and a heredoc line that starts with curl or wget counts as running it.
const HTTP_CLIENT =
  /(?:^|\$\(|`)(?:\s|[({!]|\w+=\S*\s|(?:env|command|sudo|exec|eval|time|xargs|if|then|else|elif|do|while|until)(?:\s+-\S+(?:\s+[^-\s]\S*)?)*\s)*(?:\S*\/)?\\?(?:curl|wget)(?![\w.-])/
const runsHttpClient = (command: string): boolean =>
  commandPieces(command.replace(/\\\r?\n/g, ' ')).some(piece => {
    const outside = piece.replace(QUOTED, '""')
    if (HTTP_CLIENT.test(outside)) return true
    return RUNS_QUOTED.test(outside) && [...piece.matchAll(QUOTED)].some(([quoted]) => runsHttpClient(quoted.slice(1, -1)))
  })

/** Whether a shell command runs `gh pr merge`, as the Ship it guard reads it; text that only mentions it does not. */
export const runsPrMerge = (command: string) =>
  ghPieces(command).some(piece => PR_MERGE.test(piece)) || wordFindings(command, command).some(found => 'merge' in found)

// MCP actions that merge a pull request, turn on auto-merge or add it to a merge queue, lowercased without _ and -.
// shortcut: an exact closed list, so a merge tool by another name passes; add names seen in a supported server.
const MCP_MERGE_ACTIONS = new Set(['mergepullrequest', 'enableautomerge', 'enablepullrequestautomerge', 'enqueuepullrequest'])

/** Whether a tool is an MCP action that merges a pull request or schedules its merge; the server's name is never read. */
export function isMcpMergeAction(tool: string): boolean {
  const at = tool.lastIndexOf('__')
  // The action follows the last __; a name with no __ after mcp__ has no action, only a server.
  return tool.startsWith('mcp__') && at > 3 && MCP_MERGE_ACTIONS.has(tool.slice(at + 2).toLowerCase().replace(/[_-]/g, ''))
}

const APPROVED_ONLY =
  'Ausliefern mergt nur den Head-Commit, den die Person freigegeben hat. Beende deine Antwort mit dem Link zum Pull ' +
  'Request, den Checks und der vollen Head-SHA, dann der Zeile "Antworte genau: Merge freigeben <volle SHA>", und warte ' +
  'auf genau diese Antwort. Führe danach gh pr merge --squash --delete-branch --match-head-commit <diese volle SHA> aus.'

// The Ship it guard's refusals, shared by the text checks and the word checks.
const NEVER_ADMIN =
  'Ausliefern mergt nie mit --admin oder --auto. Lass den Pull Request offen und sag der Person, warum der Merge nicht geht.'
const DIRECT_ONLY =
  'Ausliefern mergt nur mit gh pr merge, direkt ausgeführt, nie über (…), !, env, command, sudo, exec, eval, ' +
  'einen Pfad oder einen anderen Wrapper. Führe gh pr merge --squash --delete-branch --match-head-commit <freigegebene SHA> allein aus.'
const ON_ITS_OWN =
  'Führe das freigegebene gh pr merge allein aus, ohne etwas davor oder danach, damit sein Exit-Code zeigt, ob der Merge geklappt hat.'
const NO_HTTP = 'Ausliefern mergt nur mit gh pr merge --match-head-commit, nie über curl oder wget. Lass den Pull Request offen.'
const NO_API = 'Ausliefern mergt nur mit gh pr merge --match-head-commit, nie über gh api. Lass den Pull Request offen.'
const RUN_TIME =
  'Während Ausliefern läuft, werden ein Befehl und die ersten Wörter von gh nie erst zur Laufzeit gebildet ' +
  '($…, `…`, ein Glob, {a,b}, ~ oder =). Schreib sie aus.'
const PR_FLAG_FIRST =
  'Während Ausliefern läuft, steht bei gh pr der Unterbefehl direkt nach pr, nie nach einem Flag, das einen Merge ' +
  'verstecken könnte. Setz -R oder --repo vor pr und andere Flags hinter den Unterbefehl.'
const GH_ALIAS =
  'Während Ausliefern läuft, führt gh nur seine eigenen Befehle aus, nie einen Alias oder eine Erweiterung, die einen ' +
  'Merge verstecken könnten. Schreib den gh-Befehl aus.'
const MERGE_WORDS =
  'Ausliefern mergt nur mit gh pr merge, seinen eigenen Flags und höchstens einem Pull Request. ' +
  'Führe gh pr merge --squash --delete-branch --match-head-commit <freigegebene SHA> allein aus.'

// gh's own top-level commands, their built-in aliases and its help topics (gh 2.100, `gh help`). Any other first word
// is an alias or extension, which could run a merge the guard cannot read; so is gh extension exec.
// shortcut: a fixed list; a gh command added later is refused during Ship it until it is listed here.
const GH_COMMANDS = new Set(
  (
    'agent-task agent-tasks agent agents alias api attestation at auth browse cache codespace cs completion config copilot ' +
    'discussion extension extensions ext gist gpg-key help issue label licenses org pr preview project release repo ruleset ' +
    'rs run search secret skill skills ssh-key status variable version workflow ' +
    'accessibility actions environment exit-codes formatting mintty reference telemetry'
  ).split(' '),
)
const GH_EXTENSION = new Set(['extension', 'extensions', 'ext'])
// gh pr merge's own flags (gh 2.100), with the inherited --repo and --help, and whether each takes a value.
const MERGE_FLAGS = new Map(
  Object.entries({
    admin: false, auto: false, 'author-email': true, body: true, 'body-file': true, 'delete-branch': false, 'disable-auto': false,
    help: false, 'match-head-commit': true, merge: false, rebase: false, repo: true, squash: false, subject: true,
  }),
)
const MERGE_SHORT = new Map(Object.entries({ A: 'author-email', b: 'body', F: 'body-file', d: 'delete-branch', m: 'merge', r: 'rebase', R: 'repo', s: 'squash', t: 'subject' }))

// Words before a command: ( { ! and keywords (P), VAR=x (A), wrappers that run the words after them (W), their
// options (O) and anything else (X). A command stands first, after P and A, or anywhere after a wrapper.
const PREFIXES = new Set(['(', '{', '!', 'if', 'then', 'else', 'elif', 'do', 'while', 'until'])
const WRAPPERS = new Set(['env', 'command', 'builtin', 'sudo', 'doas', 'exec', 'time', 'xargs', 'nohup', 'nice', 'timeout', 'watch'])
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])
const AT_COMMAND = /^(?:[PA]|W[WOX]*)*$/
const baseName = (text: string) => text.slice(text.lastIndexOf('/') + 1)
const wordClass = ({ text, isRunTime }: ShellWord) =>
  /^[A-Za-z_]\w*=/.test(text) ? 'A' : isRunTime ? 'X' : PREFIXES.has(text) ? 'P' : WRAPPERS.has(baseName(text)) ? 'W' : text.startsWith('-') ? 'O' : 'X'

// The first two words gh reads as its command, past -R / --repo and other flags before the first; null when one is
// built at run time. After pr the next word is kept as written, a flag too: its value count is never guessed.
function ghCommand(args: ShellWord[]): string[] | null {
  const found: string[] = []
  let isPastFlags = false
  for (let at = 0; at < args.length && found.length < 2; at++) {
    const word = args[at]
    if (word === undefined) break
    const { text, isRunTime } = word
    if (isRunTime) return null
    if (isPastFlags || !text.startsWith('-') || text === '-' || found[0] === 'pr') found.push(text)
    else if (text === '--') isPastFlags = true
    else if (text === '-R' || text === '--repo') at++
  }
  return found
}

type WordFinding = { refusal: string } | { merge: ShellWord[]; isAlone: boolean }

/**
 * What a command runs, read as the words Bash passes on: gh merges, gh api and curl or wget merge routes, gh aliases
 * and extensions, and command words built at run time, in the command itself and in the code bash -c or eval runs.
 * A gh merge is direct only as the first word of the command, or of a plain bash -c "…"; anywhere else it is wrapped.
 * Merge routes are looked for in the whole command as written, the way the text checks look for them.
 */
function wordFindings(code: string, command: string, isWrapped = false, isAlone = true, found: WordFinding[] = []): WordFinding[] {
  // Blank space around the command runs nothing; a \ and newline at its end is a continued line, kept.
  const pieces = shellPieces(code.replace(/^\s+|(?<!\\)\s+$/g, ''))
  const alone = isAlone && pieces.length === 1
  for (const { words, isBody } of pieces) {
    const classes = words.map(wordClass).join('')
    // A heredoc's line may start with anything; only the commands it names count.
    if (words[classes.search(/[^PA]/)]?.isRunTime && !isBody) found.push({ refusal: RUN_TIME })
    words.forEach((word, at) => {
      for (const code of word.runs ?? []) wordFindings(code, command, true, false, found)
      const name = baseName(word.text)
      const rest = words.slice(at + 1)
      const isCommand = AT_COMMAND.test(classes.slice(0, at))
      if (word.isRunTime) return
      if (name === 'gh') {
        const gh = ghCommand(rest)
        if (gh === null) {
          if (isCommand) found.push({ refusal: RUN_TIME })
        } else if (gh[0] === 'pr' && gh[1] === 'merge') {
          // Fails closed: gh pr merge anywhere else in a piece, even after echo, is read as a wrapped merge.
          found.push(!isWrapped && !isBody && at === 0 && word.text === 'gh' ? { merge: rest, isAlone: alone } : { refusal: DIRECT_ONLY })
        } else if (gh[0] === 'pr' && gh[1]?.startsWith('-')) {
          // Fails closed like a merge: a flag's value could stand where gh reads its subcommand.
          found.push({ refusal: PR_FLAG_FIRST })
        } else if (gh[0] === 'api' && MERGE_ROUTE.test(command)) found.push({ refusal: NO_API })
        else if (isCommand && gh[0] !== undefined && (!GH_COMMANDS.has(gh[0]) || (GH_EXTENSION.has(gh[0]) && gh[1] === 'exec'))) {
          found.push({ refusal: GH_ALIAS })
        }
      } else if (!isCommand) {
        return
      } else if (WRAPPERS.has(name)) {
        // The command a wrapper runs: its first word that is not an option or VAR=x.
        if (rest.find(one => !/[OA]/.test(wordClass(one)))?.isRunTime && !isBody) found.push({ refusal: RUN_TIME })
      } else if (SHELLS.has(name)) {
        const script = rest[1]
        const isPlain = !isWrapped && !isBody && at === 0 && word.text === name && words.length === 3 && rest[0]?.text === '-c' && script !== undefined
        const flag = rest.findIndex(one => /^-\w*c/.test(one.text))
        if (isPlain) wordFindings(script.text, command, false, alone, found)
        else if (flag >= 0) for (const one of rest.slice(flag + 1)) wordFindings(one.text, command, true, false, found)
      } else if (name === 'eval') {
        wordFindings(rest.map(one => one.text).join(' '), command, true, false, found)
      } else if ((name === 'curl' || name === 'wget') && MERGE_ROUTE.test(command)) {
        found.push({ refusal: NO_HTTP })
      }
    })
  }
  return found
}

/**
 * Why a direct gh pr merge may not run, read the way gh's flag parser reads its words, or null when it is the
 * approved merge: no word built at run time, no --admin or --auto in any word, only gh pr merge's own flags and at most
 * one pull request, every --match-head-commit (gh keeps the last) the approved head commit, and nothing else run.
 */
function mergeRefusal(args: ShellWord[], approvedSha: string | null, isAlone: boolean): string | null {
  if (args.some(word => word.isRunTime)) return RUN_TIME
  if (args.some(word => /^--(admin|auto)(=|$)/.test(word.text))) return NEVER_ADMIN
  const positionals: string[] = []
  const shas: string[] = []
  for (let at = 0; at < args.length; at++) {
    const text = args[at]?.text
    if (text === undefined) break
    if (text === '--') {
      positionals.push(...args.slice(at + 1).map(word => word.text))
      break
    }
    if (!text.startsWith('-') || text === '-') {
      positionals.push(text)
      continue
    }
    let flag: string | undefined
    let value: string | undefined
    if (text.startsWith('--')) {
      const equals = text.indexOf('=')
      flag = text.slice(2, equals < 0 ? undefined : equals)
      value = equals < 0 ? undefined : text.slice(equals + 1)
      if (!MERGE_FLAGS.has(flag)) return MERGE_WORDS
    } else {
      // Short flags run together (-sd); one that takes a value takes the rest of the word (past a =) or the next word.
      for (let one = 1; one < text.length && flag === undefined; one++) {
        const name = MERGE_SHORT.get(text.charAt(one))
        const after = text.slice(one + 1)
        if (name === undefined) return MERGE_WORDS
        if (MERGE_FLAGS.get(name)) {
          flag = name
          value = after.length > 1 && after[0] === '=' ? after.slice(1) : after || undefined
        } else if (after[0] === '=') break
      }
    }
    if (flag !== undefined && MERGE_FLAGS.get(flag) && value === undefined) value = args[++at]?.text
    if (flag === 'match-head-commit') shas.push(value ?? '')
  }
  if (positionals[0] !== 'pr' || positionals[1] !== 'merge' || positionals.length > 3) return MERGE_WORDS
  if (approvedSha === null || shas.length === 0 || shas.some(sha => sha !== approvedSha)) return APPROVED_ONLY
  return isAlone ? null : ON_ITS_OWN
}

/**
 * Why a shell command may not run during Ship it, or null when it may. Every `gh pr merge` it runs, wrapped in
 * `bash -c` or not, names only the approved head commit with --match-head-commit and never --admin or --auto, and is
 * the whole command, so a failed merge is never read as a success; merging through `gh api`, curl or wget is never allowed.
 * The command is read twice: as text, and as the words Bash rebuilds from it (see shellPieces), so a quoted or escaped
 * word, a continued line, -R before pr merge, a gh alias or extension, or gh words built at run time hide no merge.
 */
export function unsafeMerge(command: string, approvedSha: string | null): string | null {
  // The route may sit anywhere in the written command: a heredoc body, a continued line or a literal variable.
  if (MERGE_ROUTE.test(command) && runsHttpClient(command)) {
    return NO_HTTP
  }
  // Likewise for gh api, so a body it reads from stdin, like gh api graphql --input - <<EOF, is seen.
  // shortcut: reads the command as text; a body in a file (--input body.json) or made at run time is not seen, and any
  // gh api run beside a merge route in the text, like a heredoc that only writes one, is refused (never allowed by mistake).
  if (MERGE_ROUTE.test(command) && runsGhApi(command)) {
    return NO_API
  }
  for (const part of ghPieces(command)) {
    if (!PR_MERGE.test(part)) {
      if (wrappedMerge(part)) return DIRECT_ONLY
      continue
    }
    if (/(?<![\w-])--(admin|auto)\b/.test(part)) return NEVER_ADMIN
    const shas = [...part.matchAll(/(?<![\w-])--match-head-commit[=\s]+["']?([0-9a-f]{40})\b/g)].map(found => found[1])
    if (approvedSha === null || shas.length === 0 || shas.some(sha => sha !== approvedSha)) return APPROVED_ONLY
    // The tool's exit code is the merge's own only when nothing else runs: `; true`, `|| true` or `| cat` hide a failure.
    if (ghPieces(command.trim()).length > 1) return ON_ITS_OWN
  }
  // The same command read as the words Bash passes on.
  for (const found of wordFindings(command, command)) {
    const refusal = 'refusal' in found ? found.refusal : mergeRefusal(found.merge, approvedSha, found.isAlone)
    if (refusal !== null) return refusal
  }
  return null
}

// PowerShell's only merge: the whole command, one line, words apart by spaces, and a PR argument with no PowerShell
// metacharacter (# starts a comment); none of --admin, --auto, chaining, a wrapper or a backtick fits it.
const PS_SANCTIONED = /^gh[ \t]+pr[ \t]+merge(?:[ \t]+[\w./:][\w./:-]*)?[ \t]+--squash[ \t]+--delete-branch[ \t]+--match-head-commit[ \t]+([0-9a-f]{40})$/
// Fail-closed PowerShell rule, no parser: read with backticks gone and case ignored, merge text (or a merge route) beside
// gh, the GitHub API or GraphQL, or an HTTP cmdlet or client is refused.
// Accepted false positive: during Ship it, merge in harmless argument text, like gh pr create --title "…merge…", is
// refused too, with no gh pr create exception. Bash keeps its own reading.
// shortcut: reads the command as text; a command built at run time (string joins, variables, -EncodedCommand, a script
// file) is not seen, and branch protection stays the backstop.
const PS_MERGE = new RegExp(`merge|${MERGE_ROUTE.source}`, 'i')
const PS_RUNNER = /(?<![\w-])(?:gh|invoke-restmethod|irm|invoke-webrequest|iwr|curl|wget)(?:\.exe)?(?![\w-])|api\.github\.com|graphql/i

/** Whether a PowerShell command is the sanctioned Ship it merge, as the guard reads it. */
export const runsPowerShellMerge = (command: string) => PS_SANCTIONED.test(command.trim())

/**
 * Why a PowerShell command may not run during Ship it, or null when it may: the only merge is the sanctioned
 * gh pr merge at the approved head commit, and any other command with a merge route is refused.
 */
export function unsafePowerShellMerge(command: string, approvedSha: string | null): string | null {
  const sanctioned = PS_SANCTIONED.exec(command.trim())
  if (sanctioned) return approvedSha !== null && sanctioned[1] === approvedSha ? null : APPROVED_ONLY
  const text = command.replace(/`/g, '')
  if (PS_MERGE.test(text) && PS_RUNNER.test(text)) {
    return (
      'Bei Ausliefern darf PowerShell nur mit gh pr merge --squash --delete-branch --match-head-commit <freigegebene SHA> ' +
      'als ganzem Befehl mergen. Alles andere, das neben gh, der GitHub-API oder einem HTTP-Client einen Merge nennt, ' +
      'wird abgelehnt, auch in einem Titel. Lass den Pull Request offen.'
    )
  }
  return null
}

// --- A plan that only reads (nurLesen): shell commands that write ---

// Where output may go without making a file: the null devices, the terminal and the standard streams.
const NO_FILE = /^(?:\/dev\/(?:null|stdout|stderr|tty|fd\/\d+)|nul|\$null)$/i
// Commands that write whatever their arguments, lowercased and without .exe: Unix tools, and PowerShell's cmdlets with
// their aliases (cmd's del, copy, move, md, rd and ren among them).
const ALWAYS_WRITES = new Set(
  (
    'rm rmdir mv cp mkdir touch chmod chown chgrp ln truncate unlink shred ' +
    'set-content sc add-content ac out-file new-item ni md remove-item ri del erase rd move-item mi move copy-item cpi copy ' +
    'rename-item rni ren clear-content clc tee-object export-csv export-clixml expand-archive compress-archive start-bitstransfer'
  ).split(' '),
)
const GIT_WRITES = new Set(
  'add commit push pull merge rebase reset checkout switch restore clean cherry-pick revert am apply init clone rm mv gc prune format-patch bisect update-ref update-index'.split(' '),
)
const PACKAGE_WRITES = new Set('install i add remove rm uninstall un update up upgrade ci publish link unlink prune dedupe init create version'.split(' '))
const PIP_WRITES = new Set(['install', 'uninstall', 'download', 'wheel'])
// Options before a package manager's subcommand that take the next word as their value.
const PACKAGE_VALUE_FLAGS = new Set(['--prefix', '-C', '--dir', '--cwd', '--filter', '-F', '-w', '--workspace'])

/** The first word that is no option, past the values of `valued` options; undefined when there is none. */
function subcommandOf(args: readonly string[], valued: ReadonlySet<string>): { sub: string | undefined; rest: readonly string[] } {
  for (let at = 0; at < args.length; at++) {
    const word = args[at] ?? ''
    if (!word.startsWith('-')) return { sub: word, rest: args.slice(at + 1) }
    if (valued.has(word)) at++
  }
  return { sub: undefined, rest: [] }
}

/** Whether git, run with these words, changes a repository, its working tree or its settings. */
function gitWrites(args: readonly string[]): boolean {
  const { sub, rest } = subcommandOf(args, new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']))
  if (sub === undefined) return false
  if (GIT_WRITES.has(sub) || rest.some(one => one.startsWith('--output'))) return true
  const positionals = rest.filter(one => !one.startsWith('-'))
  switch (sub) {
    // A bare git stash stashes; list and show only read.
    case 'stash':
      return !['list', 'show'].includes(rest[0] ?? '')
    // A bare git tag, or one with -l, lists; anything else may make or delete one.
    case 'tag':
      return rest.length > 0 && !rest.some(one => one === '-l' || one === '--list')
    // Deleting, moving or copying a branch, or making one (a name and no option).
    case 'branch':
      return (
        rest.some(one => /^-[a-zA-Z]*[dDmMcC]/.test(one) || /^--(?:delete|move|copy|force|set-upstream|unset-upstream|edit-description)/.test(one)) ||
        (rest.length > 0 && positionals.length === rest.length)
      )
    case 'worktree':
      return ['add', 'remove', 'move', 'prune', 'repair', 'lock', 'unlock'].includes(rest[0] ?? '')
    case 'remote':
      return ['add', 'remove', 'rm', 'rename', 'set-url', 'set-head', 'set-branches', 'prune', 'update'].includes(rest[0] ?? '')
    case 'notes':
      return ['add', 'append', 'copy', 'edit', 'merge', 'remove', 'prune'].includes(rest[0] ?? '')
    case 'submodule':
      return !['status', 'summary'].includes(rest[0] ?? 'status')
    // A name and a value set a setting; so do the options that edit.
    case 'config':
      return (
        rest.some(one => /^--(?:add|unset|unset-all|replace-all|rename-section|remove-section|edit)$|^-e$/.test(one)) ||
        (positionals.length >= 2 && !rest.some(one => one.startsWith('--get')))
      )
    default:
      return false
  }
}

/** Whether claude, run with these words, installs, removes or changes a mod or a catalogue; tests and checks only read. */
function claudeWrites(args: readonly string[]): boolean {
  const words = args.filter(one => !one.startsWith('-'))
  if (words[0] !== 'plugin' && words[0] !== 'plugins') return false
  if (words[1] === 'marketplace') return ['add', 'remove', 'rm', 'update'].includes(words[2] ?? '')
  return ['install', 'i', 'uninstall', 'remove', 'update', 'enable', 'disable', 'configure'].includes(words[1] ?? '')
}

/**
 * Whether an option that names where a download goes (the short one, glued to its value or apart, or the long one)
 * points anywhere but a null device or the standard output.
 */
function downloadsTo(args: readonly string[], short: string, long: string): boolean {
  for (let at = 0; at < args.length; at++) {
    const word = args[at] ?? ''
    const glued = new RegExp(`^-[a-zA-Z]*${short}(.*)$`).exec(word)
    const longForm = word === long ? '' : word.startsWith(`${long}=`) ? word.slice(long.length + 1) : null
    const value = longForm !== null ? (longForm === '' ? args[at + 1] : longForm) : glued ? (glued[1] === '' ? args[at + 1] : glued[1]) : null
    if (value === null) continue
    if (value === undefined || !(value === '-' || NO_FILE.test(value))) return true
  }
  return false
}

/**
 * Whether a command, its name and the words after it as the shell passes them on, writes files or changes a
 * repository, an install or a setting. Wrappers (env, sudo, xargs, timeout, …) count every word after them as the
 * command they may run, and a shell's -c, eval, cmd /c and powershell -Command are read as commands of their own.
 * shortcut: a fixed list; a script, an interpreter's inline code (python -c, node -e) or a tool not listed passes.
 */
function commandWrites(name: string, args: readonly string[]): boolean {
  const lower = (name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1) || name).toLowerCase().replace(/\.exe$/, '')
  if (ALWAYS_WRITES.has(lower)) return true
  if (WRAPPERS.has(lower)) return args.some((one, at) => commandWrites(one, args.slice(at + 1)))
  if (SHELLS.has(lower)) {
    const flag = args.findIndex(one => /^-\w*c$/.test(one))
    const script = flag < 0 ? undefined : args[flag + 1]
    return script !== undefined && writesFiles(script, 'bash')
  }
  if (lower === 'powershell' || lower === 'pwsh') {
    // An encoded command can't be read: it counts as writing.
    if (args.some(one => /^-(?:e|ec|enc|encodedcommand)$/i.test(one))) return true
    const flag = args.findIndex(one => /^-(?:c|command)$/i.test(one))
    return flag >= 0 && writesFiles(args.slice(flag + 1).join(' '), 'powershell')
  }
  if (lower === 'cmd') {
    // cmd's del, copy, move and > read as PowerShell's aliases and redirection do.
    const flag = args.findIndex(one => /^\/+[ck]$/i.test(one))
    return flag >= 0 && writesFiles(args.slice(flag + 1).join(' '), 'powershell')
  }
  if (lower === 'eval') return writesFiles(args.join(' '), 'bash')
  switch (lower) {
    case 'tee':
      return args.some(one => !one.startsWith('-') && !NO_FILE.test(one))
    case 'dd':
      return args.some(one => one.startsWith('of='))
    case 'sed':
      return args.some(one => /^-[nErsuz]*[iI]/.test(one) || one.startsWith('--in-place'))
    case 'perl':
      return args.some(one => /^-[aclnpstuwWTU0-9]*i/.test(one))
    case 'git':
      return gitWrites(args)
    case 'npm':
    case 'pnpm':
    case 'yarn': {
      const { sub } = subcommandOf(args, PACKAGE_VALUE_FLAGS)
      // A bare yarn installs.
      return sub === undefined ? lower === 'yarn' : PACKAGE_WRITES.has(sub)
    }
    case 'pip':
    case 'pip3':
      return PIP_WRITES.has(subcommandOf(args, new Set()).sub ?? '')
    case 'python':
    case 'python3':
    case 'py': {
      const pip = args.findIndex((one, at) => one === '-m' && args[at + 1] === 'pip')
      return pip >= 0 && PIP_WRITES.has(subcommandOf(args.slice(pip + 2), new Set()).sub ?? '')
    }
    case 'claude':
      return claudeWrites(args)
    case 'curl':
      return (
        downloadsTo(args, 'o', '--output') ||
        args.some(one => /^-[a-zA-Z]*[ODc]/.test(one) || /^--(?:output-dir|remote-name|dump-header|cookie-jar)/.test(one) || /^-outfile$/i.test(one))
      )
    case 'wget':
      return !args.includes('--spider') && (downloadsTo(args, 'O', '--output-document') || !args.some(one => /^-[a-zA-Z]*O|^--output-document/.test(one)))
    case 'invoke-webrequest':
    case 'iwr':
    case 'invoke-restmethod':
    case 'irm':
      return args.some(one => /^-outfile$/i.test(one))
    case 'find': {
      if (args.some(one => /^-(?:delete|fprint0?|fprintf|fls)$/.test(one))) return true
      // What -exec and its kin run, up to its ; or +.
      return args.some((one, at) => {
        if (!/^-(?:exec|execdir|ok|okdir)$/.test(one)) return false
        const end = args.findIndex((word, after) => after > at && (word === ';' || word === '+'))
        const run = args.slice(at + 1, end < 0 ? undefined : end)
        return run[0] !== undefined && commandWrites(run[0], run.slice(1))
      })
    }
    default:
      return false
  }
}

/** The code of every $(…) and `…` in a word as written: what Bash runs before the word, in double quotes too. */
function substitutionsIn(text: string): string[] {
  const found: string[] = []
  for (let at = text.indexOf('$('); at >= 0; at = text.indexOf('$(', at + 2)) {
    let depth = 0
    for (let end = at + 1; end < text.length; end++) {
      if (text[end] === '(') depth++
      else if (text[end] === ')' && --depth === 0) {
        found.push(text.slice(at + 2, end))
        break
      }
    }
  }
  for (const quoted of text.matchAll(/`([^`]*)`/g)) found.push(quoted[1] ?? '')
  return found
}

/** Bash: every piece, every subshell or process substitution and every $(…) is a command of its own. */
function bashWrites(command: string): boolean {
  // Duplicating or closing a stream (2>&1, >&2, <&0, >&-) names no file; &> and &>> write to one, as > does.
  const code = command.replace(/\d*[<>]&(?:\d+-?|-)(?![\w./])/g, ' ').replace(/&>/g, ' >')
  for (const { words, isBody } of shellPieces(code)) {
    // A heredoc's lines are text that a command reads.
    if (isBody) continue
    if (words.some(word => word.isRunTime && substitutionsIn(word.text).some(bashWrites))) return true
    const commands: ShellWord[][] = [[]]
    for (let at = 0; at < words.length; at++) {
      const word = words[at]!
      if (word.isOperator && (word.text === '>' || word.text === '>>')) {
        const target = words[at + 1]
        if (target === undefined || target.isOperator === true || !NO_FILE.test(target.text)) return true
        at++
      } else if (word.isOperator && word.text.startsWith('<')) {
        // What it reads from is no command; a process substitution, <(…), is, and is read next.
        if (words[at + 1]?.isOperator !== true) at++
      } else if (word.isOperator) {
        // ( or ): a subshell or a process substitution runs a command of its own.
        commands.push([])
      } else commands[commands.length - 1]!.push(word)
    }
    for (const one of commands) {
      // The command: its first word past ( { !, keywords and VAR=x.
      const at = one.findIndex(word => !/[PA]/.test(wordClass(word)))
      const head = one[at]
      if (head === undefined) continue
      const args = one.slice(at + 1).map(word => word.text)
      // A command built at run time ($EXE, say) is unknown; its words still may not install or remove a mod.
      if (head.isRunTime ? claudeWrites(args) : commandWrites(head.text, args)) return true
    }
  }
  return false
}

type PowerShellToken = { text: string; isQuoted: boolean; isRedirect?: true; isMerge?: boolean }

/**
 * Reads PowerShell into pieces of words: ; | && || newlines and ( ) { } end a piece (a script block or a
 * subexpression holds commands of its own), '…' is literal, "…" keeps its $(…) as code read on its own, ` escapes,
 * # starts a comment, and > >> 2> *> are redirections (2>&1 merges a stream). `codes` collects the $(…) in "…".
 * shortcut: a bounded lexer, not a parser; here-strings and <# #> comments are read as plain text.
 */
function powerShellPieces(command: string, codes: string[]): PowerShellToken[][] {
  const pieces: PowerShellToken[][] = []
  let tokens: PowerShellToken[] = []
  let token: PowerShellToken | null = null
  const endToken = () => {
    if (token !== null) tokens.push(token)
    token = null
  }
  const endPiece = () => {
    endToken()
    if (tokens.length > 0) pieces.push(tokens)
    tokens = []
  }
  const add = (text: string, isQuoted = false) => {
    token ??= { text: '', isQuoted }
    token.text += text
    token.isQuoted ||= isQuoted
  }
  for (let at = 0; at < command.length; at++) {
    const char = command.charAt(at)
    const next = command[at + 1] ?? ''
    if (char === '`') {
      at++
      if (next !== '\n' && next !== '\r') add(next)
    } else if (char === "'") {
      let text = ''
      for (at++; at < command.length; at++) {
        if (command[at] === "'" && command[at + 1] === "'") text += command[++at]
        else if (command[at] === "'") break
        else text += command[at]
      }
      add(text, true)
    } else if (char === '"') {
      let text = ''
      for (at++; at < command.length && command[at] !== '"'; at++) {
        if (command[at] === '`') text += command[++at] ?? ''
        else if (command.startsWith('$(', at)) {
          let depth = 0
          const from = at
          for (; at < command.length; at++) {
            if (command[at] === '(') depth++
            else if (command[at] === ')' && --depth === 0) break
          }
          codes.push(command.slice(from + 2, at))
          text += command.slice(from, at + 1)
        } else text += command[at]
      }
      add(text, true)
    } else if (char === '#' && token === null) {
      const stop = command.indexOf('\n', at)
      at = (stop < 0 ? command.length : stop) - 1
    } else if (char === ' ' || char === '\t') endToken()
    else if ('\r\n;|(){}'.includes(char) || (char === '&' && next === '&')) {
      endPiece()
      if (char === next && (char === '|' || char === '&')) at++
    } else if (char === '&') {
      // The call operator stands as a word of its own, glued to what it calls or not.
      endToken()
      tokens.push({ text: '&', isQuoted: false })
    } else if (char === '>') {
      // A stream number or * glued in front belongs to the redirection.
      const stream = token !== null && /^[1-6*]$/.test((token as PowerShellToken).text) ? (token as PowerShellToken).text : ''
      if (stream !== '') token = null
      endToken()
      const isAppend = next === '>'
      if (isAppend) at++
      const merge = /^&[1-6]/.exec(command.slice(at + 1))
      if (merge) at += merge[0].length
      tokens.push({ text: `${stream}${isAppend ? '>>' : '>'}`, isQuoted: false, isRedirect: true, isMerge: merge !== null })
    } else add(char)
  }
  endPiece()
  return pieces
}

/** PowerShell: .NET file calls, redirections into a file and the commands each piece runs. */
function powerShellWrites(command: string): boolean {
  if (/\[(?:system\.)?io\.(?:file|directory)\]::(?:write|append|create|delete|move|copy|replace|encrypt|decrypt|set|open(?!read|text))/i.test(command)) {
    return true
  }
  const codes: string[] = []
  for (const tokens of powerShellPieces(command, codes)) {
    const words: PowerShellToken[] = []
    for (let at = 0; at < tokens.length; at++) {
      const token = tokens[at]!
      if (token.isRedirect !== true) {
        words.push(token)
        continue
      }
      if (token.isMerge === true) continue
      const target = tokens[at + 1]
      if (target === undefined || target.isRedirect === true || !NO_FILE.test(target.text)) return true
      at++
    }
    // & and . call what follows them; a quoted word anywhere else is a value, not a command.
    const call = words[0]?.text === '&' || words[0]?.text === '.' ? 1 : 0
    const head = words[call]
    if (head === undefined || (head.isQuoted && call === 0)) continue
    if (commandWrites(head.text, words.slice(call + 1).map(word => word.text))) return true
  }
  return codes.some(powerShellWrites)
}

/**
 * Whether a Bash or PowerShell command writes files or changes a repository, an install or a setting, as a plan that
 * only reads (nurLesen) may not: a redirection into a file, tee, rm, mv, cp, mkdir, touch, sed -i, git add or commit,
 * npm install, claude plugin install, curl -o, wget, Set-Content, Remove-Item, Invoke-WebRequest -OutFile and their
 * kin. Every command in a chain, a pipe, a subshell or a $(…) counts; quoted text is no command (grep "rm -rf" reads),
 * and output to a null device or a stream (2>/dev/null, 2>&1, >$null) writes nothing.
 * shortcut: a heuristic that refuses rather than lets a file be written, read without running anything; a script, an
 * interpreter's inline code or a command built at run time is not looked into.
 */
export function writesFiles(command: string, shell: 'bash' | 'powershell'): boolean {
  return shell === 'bash' ? bashWrites(command) : powerShellWrites(command)
}

export const MAX_QUESTION = 160

/** The question Claude ended on, as one plain line: its last sentence, or the whole last paragraph when that sentence is a few words. */
export function questionOf(answer: string): string | null {
  if (!asksQuestion(answer)) return null
  const paragraph = (withoutStatusLines(answer).trim().split(/\n\s*\n/).pop() ?? '').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim()
  const last = paragraph.split(/(?<=[.!?;？؟])\s+/).pop() ?? ''
  const line = maskPrivate(last.length >= 12 ? last : paragraph)

  return line === '' ? null : line.length > MAX_QUESTION ? `${line.slice(0, MAX_QUESTION - 1)}…` : line
}

/** True when the text has no letters outside the Latin alphabet (umlauts and ß count as Latin), so it can stand as a title. */
export function isLatinText(text: string): boolean {
  return !/(?!\p{Script=Latin})\p{L}/u.test(text)
}

/** Common German words that rarely stand in English text, and the other way round, to tell the two apart. */
const TYPICAL_GERMAN = new Set(
  'der die das und ist nicht ich du ein eine einen mit auf für zu den dem des es sich auch wie wird sind oder aber noch nur bei im dass kann wenn hat schon jetzt habe sie wir ihr nach über aus von vom zum zur doch hier dann diese dieser dieses sein werden wurde mir dir mich dich ja nein gibt mehr'.split(
    ' ',
  ),
)
const TYPICAL_ENGLISH = new Set(
  'the and is not you a with on for to of it this that are or but be can if has have i we your my at from by they there which what would should could been were do does don\'t it\'s here then these those will just only also than'.split(
    ' ',
  ),
)

/** True when the text reads as German: more typical German words (and words with umlauts or ß) than English ones. */
export function isGermanText(text: string): boolean {
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? []
  let german = 0
  let english = 0
  for (const word of words) {
    if (TYPICAL_GERMAN.has(word) || /[äöüß]/.test(word)) german++
    else if (TYPICAL_ENGLISH.has(word)) english++
  }
  return german > english
}

/** What a tool call works on, for the Plan in Details: the command, a file's name or a site. */
export function activityTarget(input: { command?: unknown; file_path?: unknown; notebook_path?: unknown; url?: unknown }): string | null {
  if (typeof input.command === 'string' && input.command.trim()) {
    return maskPrivate(input.command.trim().split('\n')[0]!).slice(0, 160)
  }
  const file = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : null
  if (file) return file.split(/[\\/]/).pop() ?? null
  if (typeof input.url === 'string') {
    const host = /^[a-z]+:\/\/([^/]+)/i.exec(input.url)
    return host ? host[1]! : null
  }
  return null
}

export const widthOf = (text: string) => Array.from(text).reduce((sum, char) => sum + cellsOf(char), 0)

export const childrenOf = (children: unknown) =>
  (Array.isArray(children) ? children : [children]).filter(kid => kid !== null && kid !== undefined && kid !== false)

/** A drawing of nothing but buttons: a Button, or Boxes that hold only buttons. */
export function isButtonsOnly(tree: unknown): boolean {
  if (tree === null || typeof tree !== 'object') return false
  const { type, children } = tree as { type?: unknown; children?: unknown }
  if (type === 'Button') return true
  if (type !== 'Box') return false
  const kids = childrenOf(children)
  return kids.length > 0 && kids.every(isButtonsOnly)
}

/** The buttons in a drawing of nothing but buttons, in order, to line up in a row of their own. */
export const buttonsIn = (tree: unknown): unknown[] =>
  (tree as { type?: unknown }).type === 'Button' ? [tree] : childrenOf((tree as { children?: unknown }).children).flatMap(buttonsIn)

/**
 * What other mods draw beneath, split: their lone buttons (Replay, say), which join Leitstand's actions, and the
 * rest, which stays under the band. A drawing of nothing but buttons comes up whole; inside a stack (a column) only a
 * button standing on its own does, so a mod's own group of buttons (the next-steps suggestions) stays with its words.
 */
/**
 * How many cells the terminal draws a Button or a Text in: a plain Button its label alone, any other `[ label ]`; a
 * Text its words.
 */
export function cellsOfDrawn(element: unknown): number {
  if (element === null || typeof element !== 'object') return 0
  const { type, props, children } = element as { type?: unknown; props?: { label?: unknown; plain?: unknown }; children?: unknown }
  if (type === 'Button') return widthOf(String(props?.label ?? '')) + (props?.plain === true ? 0 : 4)
  return childrenOf(children).reduce<number>((sum, kid) => sum + (typeof kid === 'string' || typeof kid === 'number' ? widthOf(String(kid)) : cellsOfDrawn(kid)), 0)
}

/**
 * The terminal's row of buttons as lines: the groups on the left, `groups` their widths in cells, a bar with a cell on
 * either side (3 cells) between two on a line; `right` the width of the actions, 0 when there are none. All on one
 * line when they fit with 2 cells between; else the actions on a line of their own after the groups, and the groups
 * wrapped at a bar, so no bar starts or ends a line. Each line of groups lists their places in `groups`.
 */
export function buttonLines(groups: readonly number[], right: number, columns: number): { left: number[][]; isRightBeside: boolean } {
  const left: number[][] = []
  let used = 0
  groups.forEach((cells, at) => {
    const line = left[left.length - 1]
    if (line !== undefined && used + 3 + cells <= columns) {
      line.push(at)
      used += 3 + cells
    } else {
      left.push([at])
      used = cells
    }
  })
  return { left, isRightBeside: right === 0 || (left.length <= 1 && used + (left.length === 0 ? 0 : 2) + right <= columns) }
}

// How the desktop app draws the band's row of buttons, in its cells (ch: the width of a 0 in the band's font, about
// 8 px). Read in the app's script (4.4212, 2026-10-31): a cell is measureText("0"), and a button pads its label by
// pad.md, half a rem (8 px, 1 ch), either side. Estimated: a letter about 0.8 ch, as the band's rows count them, and
// an emoji, a family joined with U+200D too, at most 2.5 ch. band.ts counts every character a cell, an emoji 2 and
// each person of a family on its own, and a button 3 more: for Leitstand's row a third too wide, at 80 columns three
// lines of buttons where the app draws one.
const APP_PAD = 1
const APP_LETTER = 0.8
const APP_EMOJI = 2.5

/** The width of a text in the desktop app's cells: letters 0.8, an emoji (with its joined parts) 2.5, CJK 2. */
export function appCells(text: string): number {
  let cells = 0
  let isJoined = false
  for (const char of text) {
    if (char === '‍') {
      isJoined = true
      continue
    }
    // Variation selectors and skin tones change the emoji before them, not its width.
    if (/[︀-️\u{1f3fb}-\u{1f3ff}]/u.test(char)) continue
    const isEmoji = /\p{Extended_Pictographic}/u.test(char)
    if (!(isEmoji && isJoined)) cells += isEmoji ? APP_EMOJI : cellsOf(char) === 2 ? 2 : APP_LETTER
    isJoined = false
  }
  return Math.round(cells * 100) / 100
}

/**
 * The width of a Select in the desktop app's cells, as it draws one in the band ("Minimal ⌄"): padded as a button, its
 * label and the selected option's text, then the arrow. Estimated: the arrow with the gap before it 1.5 ch.
 */
const APP_SELECT_ARROW = 1.5
function appSelectWidth(props: Record<string, unknown> | undefined): number {
  const options = Array.isArray(props?.options) ? (props.options as { value?: unknown; label?: unknown }[]) : []
  const chosen = options.find(one => one?.value === props?.value) ?? options[0]
  const shown = chosen === undefined ? '' : String(chosen.label ?? chosen.value ?? '')
  const label = typeof props?.label === 'string' && props.label !== '' ? appCells(props.label) + APP_LETTER : 0
  return Math.round((2 * APP_PAD + label + appCells(shown) + APP_SELECT_ARROW) * 100) / 100
}

/** The width of a part of the button row in the desktop app's cells: a Button, a Select, a Text, or a row of them; nothing for what is hidden or placed absolutely. */
function appWidthOf(element: unknown): number {
  if (typeof element === 'string' || typeof element === 'number') return appCells(String(element))
  if (element === null || typeof element !== 'object') return 0
  const { type, props, children } = element as { type?: unknown; props?: Record<string, unknown>; children?: unknown }
  // A hidden or absolutely placed Box (a popover, a tooltip) takes no room in the row.
  if (props?.display === 'none' || props?.position === 'absolute') return 0
  if (type === 'Button') return 2 * APP_PAD + appCells(String(props?.label ?? ''))
  if (type === 'Select') return appSelectWidth(props)
  const kids = childrenOf(Array.isArray(children) ? children.flat(Infinity) : children)
  const gap = Number(props?.columnGap ?? props?.gap ?? 0) || 0
  return kids.reduce<number>((sum, kid) => sum + appWidthOf(kid), 0) + (type === 'Box' ? gap * Math.max(0, kids.length - 1) : 0)
}

/**
 * How many band rows (20 px) the desktop app gives Leitstand's row of buttons: `row` is the row as drawn, a wrapping
 * row of boxes (the places on the left, the actions on the right) that each wrap their own buttons. Laid out as the
 * app's flex rows do, greedily, with the widths of appWidthOf: a line of buttons one row, the row's marginTop and
 * rowGap half a row each unit, as band.ts counts them.
 */
export function appButtonRows(row: unknown, columns: number): number {
  if (row === null || typeof row !== 'object') return 0
  const { props, children } = row as { props?: Record<string, unknown>; children?: unknown }
  const half = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value * 0.5 : 0)
  // Greedy lines of `widths` in `room` cells with `gap` between: how many.
  const linesOf = (widths: number[], gap: number, room: number) => {
    let lines = widths.length > 0 ? 1 : 0
    let used = 0
    for (const width of widths) {
      if (used > 0 && used + gap + width > room) {
        lines++
        used = width
      } else used = used === 0 ? width : used + gap + width
    }
    return lines
  }
  const groups = childrenOf(Array.isArray(children) ? children.flat(Infinity) : children).map(group => {
    const own = (group ?? {}) as { props?: Record<string, unknown>; children?: unknown }
    const items = childrenOf(Array.isArray(own.children) ? own.children.flat(Infinity) : own.children)
    const gap = Number(own.props?.columnGap ?? own.props?.gap ?? 0) || 0
    const widths = items.map(appWidthOf)
    const lines = linesOf(widths, gap, columns)
    return { width: Math.min(columns, appWidthOf(group)), height: lines + Math.max(0, lines - 1) * half(own.props?.rowGap ?? own.props?.gap) }
  })
  const rowGap = half(props?.rowGap ?? props?.gap)
  const gap = Number(props?.columnGap ?? props?.gap ?? 0) || 0
  // The groups side by side while they fit, each line of them as high as its highest.
  const heights: number[] = []
  let used = 0
  for (const group of groups) {
    if (heights.length > 0 && used + gap + group.width <= columns) {
      heights[heights.length - 1] = Math.max(heights[heights.length - 1] ?? 0, group.height)
      used += gap + group.width
    } else {
      heights.push(group.height)
      used = group.width
    }
  }
  const inner = heights.reduce((sum, one) => sum + one, 0) + Math.max(0, heights.length - 1) * rowGap
  return Math.round((half(props?.marginTop ?? props?.marginY ?? props?.margin) + inner) * 1000) / 1000
}

export function liftButtons(tree: unknown, isWhole = true): { buttons: unknown[]; rest: unknown } {
  if (tree === null || typeof tree !== 'object') return { buttons: [], rest: tree }
  const { type, props, children } = tree as { type?: unknown; props?: { flexDirection?: unknown }; children?: unknown }
  if (type === 'Button' || (isWhole && isButtonsOnly(tree))) return { buttons: buttonsIn(tree), rest: null }
  if (type !== 'Box' || props?.flexDirection !== 'column') return { buttons: [], rest: tree }
  const parts = childrenOf(children).map(kid => liftButtons(kid, false))
  const buttons = parts.flatMap(part => part.buttons)
  if (buttons.length === 0) return { buttons: [], rest: tree }
  const kept = parts.map(part => part.rest).filter(one => one !== null && one !== undefined)
  return { buttons, rest: kept.length === 0 ? null : { ...(tree as object), children: kept } }
}

/**
 * Takes the drawing under `key` out of what other mods draw beneath, wherever it sits in their boxes (another mod may
 * have built around it): the rest without it, null when nothing is left, and the drawing itself, whole, null when it
 * is not there. The engine lets a mod move a part of another's drawing that `next(e)` handed it. Only boxes are
 * searched; a text holds no box.
 */
export function takeOut(tree: unknown, key: string): { rest: unknown; taken: unknown } {
  if (tree === null || typeof tree !== 'object') return { rest: tree, taken: null }
  const { type, props, children } = tree as { type?: unknown; props?: { key?: unknown }; children?: unknown }
  if (props?.key === key) return { rest: null, taken: tree }
  if (type !== 'Box') return { rest: tree, taken: null }
  let taken: unknown = null
  const kept: unknown[] = []
  for (const kid of childrenOf(children)) {
    if (taken !== null) {
      kept.push(kid)
      continue
    }
    const part = takeOut(kid, key)
    taken = part.taken
    if (part.rest !== null && part.rest !== undefined) kept.push(part.rest)
  }
  if (taken === null) return { rest: tree, taken: null }
  return { rest: kept.length === 0 ? null : { ...(tree as object), children: kept }, taken }
}

/** The person's own words: notes an app adds around a prompt (<system-reminder>…) are not the request. */
export function ownWords(text: string): string {
  return text.replace(/<([A-Za-z][\w-]*)\b[^>]*>[\s\S]*?<\/\1>/g, ' ').trim()
}

/** 5 Min., 1 Std. 5 Min. */
export function formatLeft(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000))

  return minutes < 60 ? `${minutes} Min.` : `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`
}

/** Keeps exactly one active step while any step is unfinished. */
export function settle(tasks: GlanceTask[]): GlanceTask[] {
  const lastActive = tasks.map(one => one.status).lastIndexOf('active')
  const fixed = tasks.map((one, index) =>
    one.status === 'active' && index !== lastActive ? { ...one, status: 'upcoming' as const } : one,
  )
  if (lastActive !== -1) {
    return fixed
  }
  const next = fixed.findIndex(one => one.status === 'upcoming')

  return fixed.map((one, index) => (index === next ? { ...one, status: 'active' as const } : one))
}

/** The step a progress report means: the one it names, or without a name (a small model may leave it out) the one under way. */
export function progressName(tasks: GlanceTask[], rawName: string): string {
  if (String(rawName ?? '').trim() === '') {
    const current = tasks.find(one => one.status === 'active') ?? tasks.find(one => one.status !== 'done')
    if (current) return current.name
  }
  const name = cleanName(rawName)
  if (tasks.some(one => one.name.toLowerCase() === name.toLowerCase())) return name
  // A step saved cut short also takes a report that names it in full or cut elsewhere, when it alone fits.
  const index = stemStep(tasks, [name, cleanName(rawName, Number.POSITIVE_INFINITY)])

  return index === -1 ? name : tasks[index]!.name
}

/**
 * Applies a progress report: earlier steps check off, 100 moves to the next. `keepsEarlier`: helpers work on several
 * steps side by side, so a report for a later step changes that step alone; the earlier ones stay open, and the
 * earliest open step stays the active one.
 */
export function applyProgress(tasks: GlanceTask[], rawName: string, rawPercent: number, keepsEarlier = false): GlanceTask[] {
  const name = progressName(tasks, rawName)
  const percent = Math.min(100, Math.max(0, Math.round(Number(rawPercent) || 0)))
  let list = [...tasks]
  let index = list.findIndex(one => one.name.toLowerCase() === name.toLowerCase())
  if (index === -1) {
    const active = list.findIndex(one => one.status === 'active')
    index = active === -1 ? list.length : active
    list.splice(index, 0, task(name, 'upcoming', `${name}#${list.length}`))
  }
  if (keepsEarlier) {
    list = list.map((one, at) =>
      at === index ? { ...one, status: percent >= 100 ? 'done' : 'upcoming', percent, hasReported: true } : one,
    )
    const earliest = list.findIndex(one => one.status !== 'done')
    return list.map((one, at) =>
      one.status === 'done' ? one : { ...one, status: at === earliest ? ('active' as const) : ('upcoming' as const) },
    )
  }
  list = list.map((one, at) => {
    if (at < index) {
      return { ...one, status: 'done', percent: 100, hasReported: true }
    }
    if (at === index) {
      return { ...one, status: percent >= 100 ? 'done' : 'active', percent, hasReported: true }
    }
    return one.status === 'active' ? { ...one, status: 'upcoming' } : one
  })

  return settle(list)
}

export function todosToTasks(
  todos: ReadonlyArray<{ content: string; status: string }>,
  previous: GlanceTask[],
): GlanceTask[] {
  const names = todos.map(todo => cleanName(todo.content))
  // A step saved cut short takes the name a todo now gives it, when it alone fits: it keeps its tokens, not twice.
  const known = [...previous]
  todos.forEach((todo, index) => {
    const name = names[index]!
    if (known.some(one => one.name === name)) return
    const at = stemStep(known, [name, cleanName(todo.content, Number.POSITIVE_INFINITY)])
    if (at !== -1) known[at] = { ...known[at]!, name }
  })
  return carryTokens(known, settle(
    todos.map((todo, index) => {
      const name = names[index]!
      const before = known.find(one => one.name === name)
      const status = todo.status === 'completed' ? 'done' : todo.status === 'in_progress' ? 'active' : 'upcoming'
      const kept = before && before.status === status ? before : task(name, status, `todo#${index}`)

      return { ...kept, name, status }
    }),
  ))
}

/** What the notice says under its title: why Claude waits or is stuck, or the job's name. */
export const noticeBody = (list: GlanceChecklist) =>
  (list.phase === 'needsYou' ? needsText(list) : list.phase === 'stuck' ? list.stuckReason : null) ?? list.title

/** A job that ended: All done, or finished with a question for the person (Needs you, with a finish time). */
export const isFinished = (list: GlanceChecklist) => list.phase === 'done' || (list.phase === 'needsYou' && list.finishedAt !== null)

const HANDOFF_STEP_WORDS: Record<GlanceTask['status'], string> = { done: 'erledigt', active: 'läuft', upcoming: 'offen' }

/**
 * What the Leitstand knows of this chat, for the handoff note's prompt: the plan's steps with their state and what each
 * got done, and the files Claude wrote or edited. Empty when it knows neither.
 */
export function handoffFacts(list: GlanceChecklist | null): string {
  if (list === null) return ''
  const steps = list.hasPlan
    ? list.tasks.map(one => `- ${HANDOFF_STEP_WORDS[one.status]}: ${one.name}${one.summary ? `. ${one.summary}` : ''}`)
    : []
  const files = list.tasks.flatMap(one => one.files ?? [])
  const paths = [...new Map(files.map(one => [one.path, one])).values()].map(one => `- ${one.path}${one.isNew ? ' (neu)' : ''}`)
  if (steps.length === 0 && paths.length === 0) return ''
  return [
    'Stand laut Leitstand:',
    ...(steps.length === 0 ? [] : [`Schritte des Plans "${list.title}":`, ...steps]),
    ...(paths.length === 0 ? [] : ['In diesem Chat geschriebene oder geänderte Dateien:', ...paths]),
  ].join('\n')
}

/** From this many identical calls in a row on, the main loop counts as going round in circles. */
export const LOOP_CALLS = 5

// The keys tool.call carries beside a tool's own input: not part of what the call asks for.
const CALL_ENVELOPE: ReadonlySet<string> = new Set(['tool', 'tool_use_id', 'consent'])

/** A value with every object's keys sorted, so the same input reads the same however its keys were ordered. */
const sortedKeys = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sortedKeys)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedKeys((value as Record<string, unknown>)[key])]))
      : value

/** A tool call's signature: the tool's name and its input as stable JSON, without the envelope's keys. */
export function callSignature(call: Record<string, unknown>): string {
  const input = Object.fromEntries(Object.entries(call).filter(([key]) => !CALL_ENVELOPE.has(key)))
  return `${String(call.tool)} ${JSON.stringify(sortedKeys(input))}`
}

const TIMES_WORDS: Record<number, string> = { 5: 'fünfmal', 10: 'zehnmal', 15: 'fünfzehnmal', 20: 'zwanzigmal' }

/** What Claude reads beside the result of the same call made `count` times in a row. */
export function loopNote(count: number): string {
  return (
    `Hinweis vom Leitstand, nur zur Info: Diesen Aufruf hast du jetzt ${TIMES_WORDS[count] ?? `${count}-mal`} hintereinander mit derselben Eingabe gemacht. ` +
    'Prüf, ob du in einer Schleife steckst, und versuch einen anderen Weg oder frag die Person. Wartest du absichtlich auf etwas, mach einfach weiter.'
  )
}

/** Why the person is needed: what Claude asked, when it ended on a question, else the general reason. */
export const needsText = (list: GlanceChecklist) =>
  (list.question && (list.needsYouReason === WAITING || list.needsYouReason === QUESTION) ? list.question : list.needsYouReason) ?? null

export const reportOf = (view: GlanceHistoryView) =>
  view.reportSpan === 'mine'
    ? weekSummary(view.myWeekEntries, view.day)
    : view.reportSpan === 'week'
      ? teamReport({ ...view, entries: view.weekEntries }, 'week')
      : teamReport(view)

/** The value that `/leitstand <setting> on` or `off` asks for. With neither word, the opposite of the current value. */
export const toggled = (choice: string, current: boolean) => (choice === 'on' ? true : choice === 'off' ? false : !current)

/** A chat's checklist as kept for when the chat is resumed, and for the other chats to see; `isOpen` until it ends. */
export type SavedChecklist = { at: number; list: GlanceChecklist; isOpen?: boolean }

// Each chat's checklist sits under a key of its own: two chats saving at once never drop each other's.
export const RESUME_PREFIX = 'resume:'

/** The keys of saved checklists, `[key, at]`, beyond the `keep` most recent. */
export function staleResumeKeys(saved: readonly (readonly [string, number])[], keep: number): string[] {
  return [...saved].sort((a, b) => b[1] - a[1]).slice(keep).map(([key]) => key)
}

// A chat at work saves its checklist with every step and tool it runs; one silent this long has most likely closed.
export const OTHER_WORKING_MS = 10 * 60_000
// shortcut: a chat that closed without ending (a crash, a closed terminal tab) shows as waiting this long; a live
// heartbeat would know sooner. By then its own sound or notice has long told the person.
export const OTHER_WAITING_MS = 2 * 60 * 60_000

/** The other chats worth a word: those that need the person, then those still at work, most recent first. */
export function otherChats(saved: readonly (SavedChecklist | undefined)[], at: number): GlanceOtherChat[] {
  const isNeeding = (one: SavedChecklist) => one.list.phase === 'needsYou' || one.list.phase === 'stuck'
  return saved
    .filter((one): one is SavedChecklist => {
      // Only a chat that said it is open: one that ended, or saved before 0.25, is never named.
      if (!one?.list || one.isOpen !== true || typeof one.at !== 'number') return false
      const isWorking = one.list.phase === 'working' || one.list.phase === 'background'
      return isNeeding(one) ? at - one.at <= OTHER_WAITING_MS : isWorking && at - one.at <= OTHER_WORKING_MS
    })
    .sort((a, b) => Number(isNeeding(b)) - Number(isNeeding(a)) || b.at - a.at)
    .map(one => ({ title: one.list.title, needsYou: isNeeding(one) }))
}

// Each chat's settings sit under a key of their own (`settings:<session id>`, `{ at, values }`), as does the checkpoint
// saved before it was tidied up (`checkpoint:<session id>`, `{ at, note }`): a change in one chat never reaches another.
export const SETTINGS_PREFIX = 'settings:'
export const CHECKPOINT_PREFIX = 'checkpoint:'
// Another chat's settings and checkpoint are tidied away once it has not used them for this many days.
export const SETTINGS_DAYS = 30

/** One chat's settings; see GlanceChatSettings. */
export type ChatSettings = GlanceChatSettings

/** The settings a chat starts with when the config menu gives none: the manifest's own defaults. */
export const FACTORY_SETTINGS: ChatSettings = {
  enabled: true,
  detail: 'minimal',
  workMode: 'auto',
  sound: 'off',
  notice: false,
  others: false,
  calm: false,
  guard: true,
  mask: true,
  approve: false,
  ship: false,
}

const isFlag = (value: unknown): value is boolean => typeof value === 'boolean'
const oneOf =
  <T extends string>(...values: T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (values as string[]).includes(value)

// What each setting may hold; a value of another kind counts as unset.
const SETTING_CHECKS: { [K in keyof ChatSettings]: (value: unknown) => value is ChatSettings[K] } = {
  enabled: isFlag,
  detail: oneOf('simple', 'detailed', 'minimal'),
  workMode: oneOf('auto', 'dynamisch'),
  sound: oneOf('off', 'chime', 'voice'),
  notice: isFlag,
  others: isFlag,
  calm: isFlag,
  guard: isFlag,
  mask: isFlag,
  approve: isFlag,
  ship: isFlag,
}
const SETTING_KEYS = Object.keys(SETTING_CHECKS) as (keyof ChatSettings)[]
const isSetting = (key: keyof ChatSettings, value: unknown) => (SETTING_CHECKS[key] as (value: unknown) => boolean)(value)

// The config menu's words for the view, and what they set.
const MENU_VIEWS = new Map<unknown, Pick<ChatSettings, 'enabled' | 'detail'>>([
  ['einfach', { enabled: true, detail: 'simple' }],
  ['detailliert', { enabled: true, detail: 'detailed' }],
  // The name until leitstand 0.60, still stored by whoever chose it then.
  ['ausfuehrlich', { enabled: true, detail: 'detailed' }],
  ['minimal', { enabled: true, detail: 'minimal' }],
  ['aus', { enabled: false, detail: 'simple' }],
])
const MENU_SOUNDS = new Map<unknown, ChatSettings['sound']>([
  ['aus', 'off'],
  ['signalton', 'chime'],
  ['stimme', 'voice'],
])
const MENU_MODES = new Map<unknown, ChatSettings['workMode']>([
  ['auto', 'auto'],
  ['gruppenarbeit', 'dynamisch'],
])

/** The settings a new chat starts with, from the config menu's values; a value missing or of another kind keeps the manifest's default. */
export function defaultSettings(options: Readonly<Record<string, unknown>> = {}): ChatSettings {
  const flag = (name: string, fallback: boolean) => {
    const value = options[name]
    return typeof value === 'boolean' ? value : fallback
  }
  const view = MENU_VIEWS.get(options.ansicht) ?? { enabled: FACTORY_SETTINGS.enabled, detail: FACTORY_SETTINGS.detail }
  return {
    ...view,
    workMode: MENU_MODES.get(options.arbeitsweise) ?? FACTORY_SETTINGS.workMode,
    sound: MENU_SOUNDS.get(options.toene) ?? FACTORY_SETTINGS.sound,
    notice: flag('benachrichtigungen', FACTORY_SETTINGS.notice),
    others: flag('andereChats', FACTORY_SETTINGS.others),
    calm: flag('ruhemodus', FACTORY_SETTINGS.calm),
    guard: flag('passwortschutz', FACTORY_SETTINGS.guard),
    mask: flag('verdecken', FACTORY_SETTINGS.mask),
    approve: flag('planFreigeben', FACTORY_SETTINGS.approve),
    ship: flag('githubAbschluss', FACTORY_SETTINGS.ship),
  }
}

/** The view's name until leitstand 0.60: the engine reads it as the default now, so it is rewritten to detailliert. */
export const OLD_VIEW = 'ausfuehrlich'

/**
 * The view as the settings store it, from settings.read's answers for `pluginConfigs`, one per source in rising
 * precedence (user, flag, policy): the last source that names one wins. The plugin's entry is keyed `leitstand` or
 * `leitstand@<marketplace>`; anything else, or a value of another kind, counts as none.
 */
export function storedView(answers: readonly unknown[]): string | undefined {
  let found: string | undefined
  for (const answer of answers) {
    if (typeof answer !== 'object' || answer === null) continue
    for (const [key, entry] of Object.entries(answer)) {
      if (key !== PLUGIN && !key.startsWith(`${PLUGIN}@`)) continue
      const options: unknown = (entry as { options?: unknown } | null)?.options
      const view: unknown = typeof options === 'object' && options !== null ? (options as { ansicht?: unknown }).ansicht : undefined
      if (typeof view === 'string') found = view
    }
  }
  return found
}

/** A chat's settings: its own values where they are of the right kind, the defaults for the rest. */
export function chatSettings(defaults: ChatSettings, own: unknown): ChatSettings {
  const values = typeof own === 'object' && own !== null ? (own as Record<string, unknown>) : {}
  const picked: Record<string, unknown> = { ...defaults }
  for (const key of SETTING_KEYS) {
    if (isSetting(key, values[key])) picked[key] = values[key]
  }
  return picked as ChatSettings
}

/** The values a chat changed, from what its settings key holds (`{ at, values }`); anything of the wrong kind is left out. */
export function ownValues(stored: unknown): Partial<ChatSettings> {
  const values = typeof stored === 'object' && stored !== null ? (stored as { values?: unknown }).values : undefined
  if (typeof values !== 'object' || values === null) return {}
  const own: Record<string, unknown> = {}
  for (const key of SETTING_KEYS) {
    const value = (values as Record<string, unknown>)[key]
    if (isSetting(key, value)) own[key] = value
  }
  return own as Partial<ChatSettings>
}

/**
 * The settings and checkpoint keys of other chats, `[key, stored]`, not used for more than SETTINGS_DAYS days; never
 * this chat's own (`mine`). A key whose value names no time counts as old.
 */
export function staleSettingsKeys(saved: readonly (readonly [string, unknown])[], now: number, mine: string | null): string[] {
  const own = mine === null ? [] : [`${SETTINGS_PREFIX}${mine}`, `${CHECKPOINT_PREFIX}${mine}`]
  return saved
    .filter(([key, stored]) => {
      if (!(key.startsWith(SETTINGS_PREFIX) || key.startsWith(CHECKPOINT_PREFIX)) || own.includes(key)) return false
      const at = typeof stored === 'object' && stored !== null ? (stored as { at?: unknown }).at : undefined
      return now - (typeof at === 'number' ? at : 0) > SETTINGS_DAYS * 24 * 60 * 60_000
    })
    .map(([key]) => key)
}

/** What the band says of the other chats, in whole pieces: who needs the person first, then how many are at work. */
export function otherChatsWords(others: readonly GlanceOtherChat[]): string[] {
  const waiting = others.filter(one => one.needsYou)
  const working = others.length - waiting.length
  if (waiting.length === 0) return working === 0 ? [] : [working === 1 ? '1 anderer Chat arbeitet' : `${working} andere Chats arbeiten`]
  const first =
    waiting.length === 1
      ? `Ein anderer Chat braucht dich: ${waiting[0]?.title ?? ''}`
      : `${waiting.length} andere Chats brauchen dich: ${waiting.map(one => one.title).join(', ')}`
  return [first, ...(working === 0 ? [] : [working === 1 ? '1 weiterer arbeitet' : `${working} weitere arbeiten`])]
}

/**
 * Wie weit ein Leitstand-Befehl wirkt (Leitfaden 4): eine Einstellung nur in diesem Chat, deren Standard für neue Chats
 * eine Option ist (`option`); ein Zustand nur dieses Chats ohne Option; etwas Dauerhaftes, das in eine Datei oder einen
 * Speicher schreibt (`ort`); oder einmal, sofort, ohne eine Einstellung zu ändern.
 */
export type BefehlGilt = 'einstellung' | 'chat' | 'dauerhaft' | 'einmal'

/** Ein eigener Slash-Befehl des Leitstands: was die Befehlsliste zeigt und was seine Hilfe sagt. */
export type LeitstandBefehl = {
  name: string
  /** Die eine Zeile, die die Befehlsliste der App zeigt. */
  description: string
  argumentHint?: string
  gruppe: string
  /** Was der Befehl tut, in einem oder zwei Sätzen, mit jeder Nebenwirkung. */
  tut: string
  /** Die ganze Zeile zu Button oder Einstellungsfenster: "Button: ...", "Im Einstellungsfenster: ..." oder "Button: keiner." */
  knopf: string
  gilt: BefehlGilt
  /** Bei `einstellung`: der Titel der Option, die den Standard für neue Chats hält. */
  option?: string
  /** Bei `dauerhaft`: wohin der Befehl schreibt. */
  ort?: string
  /** Statt der Fassung aus `gilt` ein eigener Satz, wo die Fassung die Wirkung nicht trifft. */
  giltText?: string
  /** Die Argumente außer hilfe; leer, wenn er keine nimmt. */
  argumente: string
  /** Ein Beispiel; nur bei Befehlen mit Argument gezeigt. */
  beispiel: string
}

/** Was ein Befehl außer seinen Pflichtangaben haben kann. */
export type BefehlMehr = { argumentHint?: string; argumente?: string; beispiel?: string; option?: string; ort?: string; giltText?: string }

/** Ein Befehl aus seinen Angaben; ohne Argumente ist `argumente` leer, das Beispiel der Befehl selbst. */
const befehl = (
  gruppe: string,
  name: string,
  description: string,
  tut: string,
  knopf: string,
  gilt: BefehlGilt,
  mehr: BefehlMehr = {},
): LeitstandBefehl => ({
  name,
  description,
  ...(mehr.argumentHint === undefined ? {} : { argumentHint: mehr.argumentHint }),
  gruppe,
  tut,
  knopf,
  gilt,
  ...(mehr.option === undefined ? {} : { option: mehr.option }),
  ...(mehr.ort === undefined ? {} : { ort: mehr.ort }),
  ...(mehr.giltText === undefined ? {} : { giltText: mehr.giltText }),
  argumente: mehr.argumente ?? '',
  beispiel: mehr.beispiel ?? `/${name}`,
})

/** Wie die Hilfen "zweimal drücken" erklären. */
export const ZWEIMAL = 'Zweimal drücken: Der erste Druck fragt nach, der zweite führt aus. Als Befehl: mit ja dahinter.'

const JA = { argumentHint: '[ja]', argumente: 'ja (freiwillig): führt aus. Ohne ja sagt der Befehl nur, was passieren würde.' }
const ja = (name: string) => ({ ...JA, beispiel: `/${name} ja` })

/** Die Ansicht: Standard für neue Chats ist die Option Ansicht. */
const ANSICHT = { option: 'Ansicht' }
const TOENE = { option: 'Töne' }
const VIEW_KNOPF = 'Button: das Menü oben rechts in der Leiste (im Terminal schaltet ein Druck zur nächsten Ansicht).'
const MODUS_KNOPF =
  'Button: 👨‍💼 oder 👨‍👨‍👧‍👦 unten links (im Terminal 👤 oder 👥); jeder Druck schaltet zwischen Auto-Modus und Gruppenarbeit um. Auch im Einstellungsfenster.'

/** Der Passwortschutz, in der einen Fassung, die alle Texte teilen. */
export const PASSWORTSCHUTZ_TEXT =
  'Sieht eine Nachricht, die du am Rechner schreibst, nach Passwort, Schlüssel, Karten- oder Kontonummer aus, hält der Leitstand sie zwei Minuten zurück: Claude sieht sie nicht, und im Chat steht sie nicht. ' +
  'In der Leiste steht dann 🔒 Zurückgehalten mit Trotzdem senden und Verwerfen (Befehle /leitstand:trotzdem-senden und /leitstand:nachricht-verwerfen); im Terminal schickt sie auch ein zweites Enter ab. ' +
  'Nach zwei Minuten ohne Entscheidung ist sie verworfen. Hält er etwas fälschlich an, schickt Trotzdem senden es ab; ganz aus mit /leitstand:passwortschutz-aus. ' +
  'Vom Handy, und wo keine Leiste zu sehen ist, geht die Nachricht ohne das Passwort weiter, und Claude sagt dir das. Berichte von Helfern gehen unverändert durch. Ist ein Passwort doch an Claude gegangen, ändere es.'

/** Wann ein Plan auf Freigabe wartet, in der einen Fassung, die alle Texte teilen. */
export const PLAN_FREIGABE =
  'In der Gruppenarbeit wartet ein Plan auf deine Freigabe. Ohne Freigabe starten Pläne, die nur lesen, und Pläne zu einer Nachricht, die mit Starte sofort beginnt oder endet; läuft der Autopilot, startet ein wartender Plan nach 30 Sekunden von selbst.'

/** Die sechs Stufen der Arbeiter, so dass die Zahl stimmt. */
export const STUFEN = 'Haiku, Sonnet, Opus mit mittlerem, hohem oder extra hohem Aufwand und Fable'

/** Was Verdecken verdeckt, in der einen Fassung, die alle Texte teilen. */
export const VERDECKEN_TEXT =
  'Passwörter, Schlüssel, IP-Adressen, Hostnamen, Karten- und Kontonummern, E-Mail-Adressen und Telefonnummern erscheinen auf dem Bildschirm als Punkte, in Nachrichten wie in Befehls- und Werkzeugausgaben, solange der Leitstand an ist. Das betrifft nur den Bildschirm: Claude liest alles unverändert.'

/** Der Autopilot, in der einen Fassung für Hilfe und Übersicht (steht bei seinen Befehlen). */
export const AUTOPILOT_TEXT = AUTOPILOT_TUT

/** Die Befehle des Leitstands selbst, in der Reihenfolge der Übersicht. /leitstand bleibt daneben als Kurzform. */
const EIGENE_BEFEHLE: readonly LeitstandBefehl[] = [
  befehl('Allgemein', 'leitstand:hilfe', 'Alle Leitstand-Befehle im Überblick', 'Erklärt den Leitstand: was er tut, die wichtigsten Handgriffe, wie du ihn einstellst, und listet alle Befehle.', 'Button: keiner. ❓ oben rechts in der Leiste erklärt die Buttons.', 'einmal'),
  befehl('Allgemein', 'leitstand:an', 'Leitstand einschalten', 'Schaltet den Leitstand ein: Die Leiste über dem Eingabefeld zeigt wieder Plan, Fortschritt und Buttons.', 'Im Einstellungsfenster: Ansicht › Einfach, Detailliert oder Minimal', 'einstellung', ANSICHT),
  befehl('Allgemein', 'leitstand:aus', 'Leitstand ausschalten', 'Schaltet den Leitstand aus: keine Checkliste, keine Buttons, und Claude Code zeigt wieder alle Werkzeugzeilen. Verdecken wirkt dann nicht; der Passwortschutz bleibt, wie er eingestellt ist.', 'Im Einstellungsfenster: Ansicht › Aus', 'einstellung', ANSICHT),
  befehl('Allgemein', 'leitstand:tour', 'Die Begrüßung noch mal zeigen', 'Zeigt die Begrüßung in der Leiste über dem Eingabefeld: drei kurze Karten, mit Weiter gehst du sie durch. Vom Handy geht das nicht; /leitstand:hilfe erklärt dasselbe als Text.', 'Button: keiner. Beim ersten Start erscheint die Begrüßung von selbst, in der Ansicht Minimal ein Hinweis darauf.', 'einmal'),
  befehl('Allgemein', 'leitstand:buttons-zeigen', 'Die Buttons des Leitstands erklären', 'Öffnet das Fenster Leitstand-Buttons: jeder Button mit Zeichen, Wirkung und dem Befehl dazu. Vom Handy kommt dasselbe als Text.', 'Button: ❓ oben rechts in der Leiste', 'einmal'),

  befehl('Ansicht', 'leitstand:ansicht-einfach', 'Ansicht Einfach: Schritte und Fortschritt', 'Die Leiste zeigt den Plan als Checkliste: jeden Schritt, wie weit er ist und was gerade passiert, ohne Werkzeug-Details.', `${VIEW_KNOPF} Im Einstellungsfenster: Ansicht › Einfach`, 'einstellung', ANSICHT),
  befehl('Ansicht', 'leitstand:ansicht-detailliert', 'Ansicht Detailliert: dazu Zeit und Tokens', 'Wie Einfach, dazu Zeit und Tokens je Schritt (Tokens sind die Einheit, in der Claude liest und schreibt; sie zählen gegen dein Nutzungslimit).', `${VIEW_KNOPF} Im Einstellungsfenster: Ansicht › Detailliert`, 'einstellung', ANSICHT),
  befehl('Ansicht', 'leitstand:ansicht-minimal', 'Ansicht Minimal: eine Zeile mit dem Stand', 'Die Leiste zeigt eine Zeile mit dem Stand (was gerade passiert, wie viele Schritte fertig sind, Restzeit und Tokens), darunter die Buttons.', `${VIEW_KNOPF} Im Einstellungsfenster: Ansicht › Minimal`, 'einstellung', ANSICHT),

  befehl('Arbeitsweise', 'leitstand:arbeitsmodus-auto', 'Auto-Modus: Claude entscheidet selbst über Helfer', 'Claude entscheidet selbst, ob und welche Helfer er für Teilaufgaben startet. Gut für kleine und mittlere Aufgaben. Hat nichts mit dem Auto-Modus der Berechtigungen von Claude Code zu tun.', MODUS_KNOPF, 'einstellung', { option: 'Arbeitsweise' }),
  befehl(
    'Arbeitsweise',
    'leitstand:arbeitsmodus-gruppenarbeit',
    'Gruppenarbeit: Claude leitet, Arbeiter setzen um',
    `Claude plant und prüft, Arbeiter setzen um: Helfer mit fester Stufe, sechs davon (${STUFEN}; Modelle von Claude, von klein und günstig bis groß). ${PLAN_FREIGABE} Starten: Start, /leitstand:plan-starten oder los schreiben. Kostet mehr Tokens und lohnt sich bei großen Aufgaben.`,
    MODUS_KNOPF,
    'einstellung',
    { option: 'Arbeitsweise' },
  ),

  befehl('Auftrag', 'leitstand:plan-starten', 'Den wartenden Plan starten', 'Startet den Plan, der auf deine Freigabe wartet, in der Gruppenarbeit oder bei Plan zuerst freigeben; statt des Befehls geht auch: los schreiben. Wartet keiner, sagt der Befehl das.', 'Button: Start unten rechts; erscheint, sobald ein Plan wartet.', 'einmal'),
  befehl('Auftrag', 'leitstand:pause', 'Claude anhalten', 'Hält Claude mitten im Auftrag an, wie Esc; die Leiste zeigt dann Pausiert, und /leitstand:weiter macht dort weiter. Läuft gerade nichts, sagt der Befehl das.', 'Button: Pause unten rechts; erscheint, solange Claude arbeitet.', 'einmal'),
  befehl('Auftrag', 'leitstand:weiter', 'Claude weitermachen lassen', 'Schickt Claude für dich die Nachricht, weiterzumachen: nach einer Pause, einem Abbruch oder wenn Claude festhängt. Ist nichts angehalten, sagt der Befehl das.', 'Button: Weiter unten rechts; erscheint, wenn Claude angehalten ist oder festhängt.', 'einmal'),
  befehl('Auftrag', 'leitstand:plan-zeigen', 'Den ganzen Plan zeigen', 'Öffnet das Fenster Plan mit allen Schritten, ihren Zeiten und was jeder erledigt hat. Vom Handy kommt der Plan als Text.', 'Button: Plan unten in der Leiste; erscheint, sobald es einen Plan gibt.', 'einmal'),
  befehl(
    'Auftrag',
    'leitstand:neuer-chat',
    'Neuer Chat mit Übergabenotiz (mit ja)',
    'Claude schreibt eine Übergabenotiz über diesen Chat, leert ihn dann mit /clear und schickt die Notiz als erste Nachricht in den neuen Chat. /clear allein leert nur. Das Schreiben der Notiz ist ein Modellaufruf, der den ganzen Chat liest. /leitstand:uebergabe-schreiben schreibt dieselbe Notiz, ohne den Chat zu leeren.',
    `Button: Neuer Chat unten rechts; am Rechner, sobald ein Auftrag fertig oder angehalten ist. ${ZWEIMAL}`,
    'einmal',
    { ...ja('leitstand:neuer-chat'), giltText: 'einmal, sofort; leert diesen Chat und ändert keine Einstellung.' },
  ),
  befehl(
    'Auftrag',
    'leitstand:uebergabe-schreiben',
    'Übergabenotiz schreiben, ohne den Chat zu leeren',
    'Claude schreibt eine Übergabenotiz über diesen Chat: Ziel, Erledigtes, Offenes, was nicht geklappt hat, Entscheidungen, wichtige Dateien und Befehle und den nächsten Schritt; dazu kommen die Schritte des Plans und die geänderten Dateien, die der Leitstand kennt. Die Antwort ist die Notiz selbst, auch vom Handy; du kannst sie in einen anderen Chat oder auf einen Server mitnehmen. Der Chat bleibt, wie er ist. Das Schreiben ist ein Modellaufruf, der den ganzen Chat liest. /leitstand:uebergabe-zeigen holt die Notiz später wieder.',
    'Button: keiner. Neuer Chat unten rechts schreibt dieselbe Notiz und leert den Chat danach.',
    'einmal',
  ),
  befehl(
    'Auftrag',
    'leitstand:uebergabe-zeigen',
    'Die letzte Übergabenotiz zeigen',
    'Holt die zuletzt geschriebene Übergabenotiz (von Neuer Chat oder /leitstand:uebergabe-schreiben): am Rechner ins Eingabefeld, vom Handy als Antwort. Gibt es noch keine, sagt der Befehl das.',
    'Button: keiner.',
    'einmal',
  ),
  befehl(
    'Auftrag',
    'leitstand:abschliessen',
    'Auf GitHub abschließen: Commit, Pull Request, Merge (mit ja)',
    'Claude räumt die Änderungen auf und macht Commit, Pull Request und Merge: Änderungen festhalten, auf GitHub zur Prüfung vorlegen und nach deiner Freigabe in den Hauptzweig übernehmen. Geht nur in einem Projekt auf GitHub.',
    `Button: Push unten rechts; erscheint nach einem fertigen Auftrag, wenn Auf GitHub abschließen an ist. ${ZWEIMAL}`,
    'dauerhaft',
    { ...ja('leitstand:abschliessen'), ort: 'dein Projekt auf GitHub (Commit, Pull Request, Merge)' },
  ),

  befehl('Verlauf und Berichte', 'leitstand:verlauf-zeigen', 'Den Verlauf eines Tages zeigen', 'Öffnet das Fenster Verlauf: deine Aufträge eines Tages in diesem Projekt, mit Tagesbericht, Wochenbericht und Deine Woche. Vom Handy kommt die Liste als Text.', 'Button: Verlauf unten in der Leiste', 'einmal', {
    argumentHint: '[gestern|JJJJ-MM-TT]',
    argumente: 'Tag (freiwillig): ohne Argument heute, sonst gestern oder ein Datum als JJJJ-MM-TT.',
    beispiel: '/leitstand:verlauf-zeigen gestern',
  }),
  befehl('Verlauf und Berichte', 'leitstand:tagesbericht', 'Tagesbericht für heute als Text', 'Schreibt den Tagesbericht in die Antwort: was du und Claude mit seinen Helfern heute in diesem Projekt erledigt habt. Er kommt auch in die Zwischenablage.', 'Button: Tagesbericht im Fenster Verlauf', 'einmal'),
  befehl('Verlauf und Berichte', 'leitstand:wochenbericht', 'Wochenbericht für diese Woche als Text', 'Schreibt den Wochenbericht in die Antwort: was du und Claude mit seinen Helfern diese Woche in diesem Projekt erledigt habt. Er kommt auch in die Zwischenablage.', 'Button: Wochenbericht im Fenster Verlauf', 'einmal'),
  befehl('Verlauf und Berichte', 'leitstand:meine-woche', 'Deine Woche über alle Projekte', 'Fasst deine letzten sieben Tage über alle Projekte zusammen, in der Antwort und in der Zwischenablage.', 'Button: Deine Woche im Fenster Verlauf', 'einmal'),

  befehl('Werkzeuge', 'leitstand:kurzantworten-an', 'Kurzantworten einschalten', 'Kurze Antworten: Claude nennt zuerst den nächsten Schritt und antwortet in nummerierten Schritten, ohne Umwege. Dafür startet der Leitstand den Skill kurzfassen (ein mitgelieferter Ablauf für Claude). Aus geht es mit /leitstand:kurzantworten-aus oder den Worten Kurzfassen aus.', 'Button: 📖 unten links; danach zeigt er 📝.', 'chat'),
  befehl('Werkzeuge', 'leitstand:kurzantworten-aus', 'Kurzantworten ausschalten', 'Claude antwortet wieder wie gewohnt; dafür schickt der Leitstand für dich die Nachricht Kurzfassen aus.', 'Button: 📝 unten links; danach zeigt er 📖.', 'chat'),
  befehl('Werkzeuge', 'leitstand:vermenschlichen', 'Letzte Antwort natürlicher umschreiben', 'Startet den Skill vermenschlichen (bei englischen Antworten humanizer): Claude schreibt seine letzte Antwort neu, damit sie nicht nach KI klingt. Das ist eine Runde wie nach einer eigenen Nachricht.', 'Button: 🧍 unten links', 'einmal'),
  befehl('Werkzeuge', 'leitstand:ausfragen', 'Grill mich: Claude löchert dich mit Fragen', 'Startet den Skill grill-me (ein mitgelieferter Ablauf für Claude): Claude fragt dich so lange aus, bis ein Plan oder eine Idee steht.', 'Button: ♨️ Grill mich unten links (im Terminal 🔥)', 'einmal', {
    argumentHint: '[Thema]',
    argumente: 'Thema (freiwillig). Ohne Thema geht es um den aktuellen Plan; gibt es keinen, fragt der Befehl nach einem Thema.',
    beispiel: '/leitstand:ausfragen Umzug der Datenbank',
  }),
  befehl('Werkzeuge', 'leitstand:sauberer-code', 'Code prüfen lassen mit dem Skill clean-code', 'Startet den Skill clean-code aus dem Mod clean-code (ein mitgelieferter Ablauf für Claude), ohne den Mod den älteren Skill clean-code: Claude prüft den Code auf lange Funktionen, unklare Namen, tiefe Verschachtelung und verschluckte Fehler.', 'Button: 🧹 unten links', 'einmal'),
  befehl('Werkzeuge', 'leitstand:fernsteuerung-an', 'Remote Control einschalten', 'Schaltet Remote Control ein: Du steuerst diesen Chat dann auch vom Handy aus. Geht nur, wo der Chat es kann.', 'Button: 🛜 unten links (im Terminal 📡); leuchtet, solange es verbunden ist, und fehlt, wo der Chat es nicht kann.', 'chat'),
  befehl('Werkzeuge', 'leitstand:fernsteuerung-aus', 'Remote Control ausschalten', 'Schaltet Remote Control aus und trennt damit die Verbindung zum Handy: Von dort erreichst du diesen Chat dann nicht mehr, einschalten geht nur am Rechner.', 'Button: 🛜 unten links (im Terminal 📡), solange es leuchtet', 'chat'),

  befehl('Schutz', 'leitstand:verdecken-an', 'Verdecken einschalten', VERDECKEN_TEXT, 'Button: 🔓 unten links; danach zeigt er 🔒. Im Einstellungsfenster: Verdecken › An', 'einstellung', { option: 'Verdecken' }),
  befehl('Schutz', 'leitstand:verdecken-aus', 'Verdecken ausschalten', 'Alles erscheint wieder so, wie es im Chat steht. Schalte Verdecken ein, bevor du deinen Bildschirm teilst.', 'Button: 🔒 unten links; danach zeigt er 🔓. Im Einstellungsfenster: Verdecken › Aus', 'einstellung', { option: 'Verdecken' }),
  befehl('Schutz', 'leitstand:passwortschutz-an', 'Passwortschutz einschalten', PASSWORTSCHUTZ_TEXT, 'Im Einstellungsfenster: Passwortschutz › An', 'einstellung', { option: 'Passwortschutz' }),
  befehl('Schutz', 'leitstand:passwortschutz-aus', 'Passwortschutz ausschalten', 'Jede Nachricht geht so an Claude, wie du sie schreibst, auch mit einem Passwort darin.', 'Im Einstellungsfenster: Passwortschutz › Aus', 'einstellung', { option: 'Passwortschutz' }),
  befehl('Schutz', 'leitstand:trotzdem-senden', 'Zurückgehaltene Nachricht trotzdem senden', 'Schickt die Nachricht, die der Passwortschutz gerade zurückhält, so an Claude, wie du sie geschrieben hast, mit dem Passwort. Wartet keine, sagt der Befehl das.', 'Button: Trotzdem senden in der Zeile 🔒 Zurückgehalten', 'einmal'),
  befehl('Schutz', 'leitstand:nachricht-verwerfen', 'Zurückgehaltene Nachricht verwerfen', 'Verwirft die Nachricht, die der Passwortschutz gerade zurückhält, ohne sie zu senden. Wartet keine, sagt der Befehl das.', 'Button: Verwerfen in der Zeile 🔒 Zurückgehalten', 'einmal'),
  befehl(
    'Schutz',
    'leitstand:geheimnisse-sichern',
    'Passwörter aus dem Chat in die .env verschieben (mit ja)',
    'Verschiebt Passwörter, Schlüssel, IP-Adressen und Hostnamen aus diesem Chat in die Datei .env (eine Datei im Projektordner, aus der Programme geheime Werte lesen) und verdichtet den Chat danach wie /compact: Claude fasst ihn zusammen und arbeitet mit der Zusammenfassung weiter. Danach kennt Claude nur noch Platzhalter.',
    `Button: 🛡️ unten links (im Terminal 🔐). ${ZWEIMAL}`,
    'dauerhaft',
    { ...ja('leitstand:geheimnisse-sichern'), ort: 'die Datei .env im Projektordner' },
  ),

  befehl('Einstellungen', 'leitstand:einstellungen-zeigen', 'Das Einstellungsfenster öffnen', 'Öffnet das Einstellungsfenster des Leitstands. Vom Handy kommen die Werte dieses Chats als Text, je mit dem Befehl zum Umschalten.', 'Button: ⚙️ oben rechts in der Leiste (im Terminal 🔧)', 'einmal'),
  befehl('Einstellungen', 'leitstand:ton-aus', 'Töne ausschalten', 'Kein Ton mehr, wenn Claude dich braucht, festhängt oder fertig ist.', 'Im Einstellungsfenster: Töne › Aus', 'einstellung', TOENE),
  befehl('Einstellungen', 'leitstand:ton-signalton', 'Töne: Signalton', 'Ein kurzer Signalton am Rechner, wenn Claude dich braucht, festhängt oder einen Auftrag beendet, der länger als eine Minute gedauert hat.', 'Im Einstellungsfenster: Töne › Signalton', 'einstellung', TOENE),
  befehl('Einstellungen', 'leitstand:ton-stimme', 'Töne: Signalton und Stimme', 'Der Signalton und dazu ein paar gesprochene Worte wie Claude braucht dich, wenn Claude dich braucht, festhängt oder einen langen Auftrag beendet.', 'Im Einstellungsfenster: Töne › Signalton und Stimme', 'einstellung', TOENE),
  befehl('Einstellungen', 'leitstand:ton-anhoeren', 'Den eingestellten Ton anhören', 'Spielt den eingestellten Ton einmal ab, zu hören am Rechner.', 'Button: Anhören im Einstellungsfenster, unter Töne', 'einmal'),
  befehl('Einstellungen', 'leitstand:benachrichtigungen-an', 'Desktop-Benachrichtigungen einschalten', 'Dein Computer zeigt eine Benachrichtigung, wenn Claude dich braucht, festhängt oder einen Auftrag beendet, der länger als eine Minute gedauert hat, auch wenn du in einer anderen App bist.', 'Im Einstellungsfenster: Desktop-Benachrichtigungen › An', 'einstellung', { option: 'Desktop-Benachrichtigungen' }),
  befehl('Einstellungen', 'leitstand:benachrichtigungen-aus', 'Desktop-Benachrichtigungen ausschalten', 'Keine Benachrichtigungen mehr auf deinem Computer.', 'Im Einstellungsfenster: Desktop-Benachrichtigungen › Aus', 'einstellung', { option: 'Desktop-Benachrichtigungen' }),
  befehl('Einstellungen', 'leitstand:andere-chats-an', 'Andere Chats in der Leiste nennen', 'Die Leiste nennt andere Chats auf diesem Computer, die dich brauchen oder gerade arbeiten, aus jedem Projekt.', 'Im Einstellungsfenster: Andere Chats › An', 'einstellung', { option: 'Andere Chats' }),
  befehl('Einstellungen', 'leitstand:andere-chats-aus', 'Andere Chats nicht mehr nennen', 'Die Leiste nennt keine anderen Chats mehr. Schalte das aus, bevor du deinen Bildschirm teilst.', 'Im Einstellungsfenster: Andere Chats › Aus', 'einstellung', { option: 'Andere Chats' }),
  befehl('Einstellungen', 'leitstand:ruhemodus-an', 'Ruhemodus einschalten', 'Nichts in der Leiste bewegt sich mehr, keine Balken und kein Kreisel, und der Stand steht fett.', 'Im Einstellungsfenster: Ruhemodus › An', 'einstellung', { option: 'Ruhemodus' }),
  befehl('Einstellungen', 'leitstand:ruhemodus-aus', 'Ruhemodus ausschalten', 'Balken und Kreisel bewegen sich wieder, während Claude arbeitet.', 'Im Einstellungsfenster: Ruhemodus › Aus', 'einstellung', { option: 'Ruhemodus' }),
  befehl('Einstellungen', 'leitstand:plan-freigeben-an', 'Plan zuerst freigeben: an', `Claude legt erst seine Schritte fest und wartet, bis du startest (Start, /leitstand:plan-starten oder los schreiben) oder sagst, was sich ändern soll. Das ist nicht der Plan-Modus von Claude Code. ${PLAN_FREIGABE}`, 'Im Einstellungsfenster: Plan zuerst freigeben › An', 'einstellung', { option: 'Plan zuerst freigeben' }),
  befehl('Einstellungen', 'leitstand:plan-freigeben-aus', 'Plan zuerst freigeben: aus', 'Claude legt los, sobald der Plan steht. In der Gruppenarbeit geht das nicht, dort wartet ein Plan auf deine Freigabe.', 'Im Einstellungsfenster: Plan zuerst freigeben › Aus', 'einstellung', { option: 'Plan zuerst freigeben' }),
  befehl('Einstellungen', 'leitstand:github-abschluss-an', 'Auf GitHub abschließen: an', 'Nach einem fertigen Auftrag in einem Projekt auf GitHub erscheint der Button Push: Änderungen festhalten (Commit), auf GitHub zur Prüfung vorlegen (Pull Request) und nach deiner Freigabe in den Hauptzweig übernehmen (Merge), wie /leitstand:abschliessen.', 'Im Einstellungsfenster: Auf GitHub abschließen › An', 'einstellung', { option: 'Auf GitHub abschließen' }),
  befehl('Einstellungen', 'leitstand:github-abschluss-aus', 'Auf GitHub abschließen: aus', 'Kein Button Push: Fertige Aufträge bleiben auf ihrem Zweig (Branch), bis du selbst etwas tust.', 'Im Einstellungsfenster: Auf GitHub abschließen › Aus', 'einstellung', { option: 'Auf GitHub abschließen' }),
  befehl('Einstellungen', 'leitstand:zuruecksetzen', 'Einstellungen auf den Standard zurücksetzen', 'Setzt in diesem Chat alles aus dem Einstellungsfenster auf den Standard für neue Chats zurück (eingebaut oder, was du dafür eingestellt hast): Ansicht, Arbeitsweise, Töne, Desktop-Benachrichtigungen, Andere Chats, Ruhemodus, Plan zuerst freigeben, Auf GitHub abschließen, Passwortschutz und Verdecken. Korrekturen prüfen, Selbstkritik nach Dateiänderungen und Kurzantworten bleiben, wie sie sind.', 'Button: Auf Standard zurücksetzen im Einstellungsfenster', 'chat'),
]

/** Die Befehle der Teile: das Skill-Menü (vorn, so steht es in der Übersicht noch bei den Werkzeugen), Selbstkritik und Regeln, Dateien und Autopilot (bis 2026-10-26 eigene Mods). */
export const TEIL_BEFEHLE: readonly LeitstandBefehl[] = [...SKILLS_BEFEHLE, ...REFLECT_BEFEHLE, ...FILETREE_BEFEHLE, ...AUTOPILOT_BEFEHLE]

/** Alle Befehle des Leitstands, in der Reihenfolge der Übersicht: die der Teile hinter den Werkzeugen. */
export const LEITSTAND_BEFEHLE: readonly LeitstandBefehl[] = (() => {
  const nachWerkzeugen = EIGENE_BEFEHLE.findLastIndex(one => one.gruppe === 'Werkzeuge') + 1
  return [...EIGENE_BEFEHLE.slice(0, nachWerkzeugen), ...TEIL_BEFEHLE, ...EIGENE_BEFEHLE.slice(nachWerkzeugen)]
})()

/** Die Namen der Befehle, die der Leitstand selbst beantwortet; die der Teile beantworten die Teile. */
export const LEITSTAND_BEFEHL_NAMEN: readonly string[] = EIGENE_BEFEHLE.map(one => one.name)

/**
 * Der Grundbefehl /leitstand: ohne Argument schaltet er den Leitstand ein oder aus. Die alten englischen Argumente
 * (on, off, details und die anderen) versteht er weiter, die Hilfe nennt sie nicht mehr.
 */
export const LEITSTAND_GRUNDBEFEHL: LeitstandBefehl = befehl(
  'Allgemein',
  'leitstand',
  'Leitstand ein- oder ausschalten',
  'Schaltet den Leitstand ein, wenn er aus ist, sonst aus. Alle Befehle des Leitstands zeigt /leitstand:hilfe.',
  'Im Einstellungsfenster: Ansicht',
  'einstellung',
  ANSICHT,
)

/**
 * Befehle ohne Kurzform: an, aus und hilfe sagen allein nicht, welcher Mod gemeint ist, und /vermenschlichen ist schon
 * der Skill, den der Befehl startet.
 */
const OHNE_KURZFORM: ReadonlySet<string> = new Set(['leitstand:an', 'leitstand:aus', 'leitstand:hilfe', 'leitstand:vermenschlichen'])

/** Die Kurzform eines Befehls ohne leitstand: davor (/pause für /leitstand:pause), oder undefined. */
export const kurzform = (name: string): string | undefined =>
  OHNE_KURZFORM.has(name) || !name.startsWith('leitstand:') ? undefined : name.slice('leitstand:'.length)

/** Jede Kurzform mit dem vollen Namen ihres Befehls. */
export const LEITSTAND_KURZFORMEN: ReadonlyMap<string, string> = new Map(
  LEITSTAND_BEFEHLE.flatMap(one => {
    const kurz = kurzform(one.name)
    return kurz === undefined ? [] : [[kurz, one.name] as const]
  }),
)

/** Die Kurzformen der Befehle, die der Leitstand selbst beantwortet. */
export const EIGENE_KURZFORMEN: readonly string[] = [...LEITSTAND_KURZFORMEN].filter(([, name]) => LEITSTAND_BEFEHL_NAMEN.includes(name)).map(([kurz]) => kurz)

/** Der volle Name eines Befehls, auch wenn er als Kurzform kam. */
export const vollerBefehl = (name: string): string => LEITSTAND_KURZFORMEN.get(name) ?? name

/**
 * Umgezogen am 2026-10-26: Reflexion und Dateibaum heißen jetzt Selbstkritik und Dateien (Teile des Leitstands), das
 * Aufräumen mit Sicherungspunkt gehört zur Statistik. Je alter Name (ohne leitstand:) der volle neue.
 */
const UMGEZOGEN: Readonly<Record<string, string>> = {
  reflexion: 'leitstand:selbstkritik',
  dateibaum: 'leitstand:dateien',
  'jetzt-aufraeumen': 'statistik:chat-aufraeumen',
  'letzter-stand-zeigen': 'statistik:letzter-stand-zeigen',
}

/**
 * Umbenannt am 2026-10-26: der ADHS-Modus heißt Kurzantworten; am 2026-10-28: die Ansicht Ausführlich heißt Detailliert;
 * am 2026-10-29: die Knöpfe heißen Buttons.
 */
const UMBENANNT: Readonly<Record<string, string>> = {
  'adhs-an': 'kurzantworten-an',
  'adhs-aus': 'kurzantworten-aus',
  'ansicht-ausfuehrlich': 'ansicht-detailliert',
  'knoepfe-zeigen': 'buttons-zeigen',
}

/** Umbenannte, die es schon als /leitstand:… gab: Auch die Langform aus alter Gewohnheit nennt den neuen Namen. */
const UMBENANNT_LANG: readonly string[] = ['ansicht-ausfuehrlich', 'knoepfe-zeigen']

/**
 * Die alten Namen bis leitstand 0.55: /leitstand-pause und /adhs-an, dazu die der Teile aus ihrer Zeit als eigene
 * Mods. Sie stehen nicht mehr im Menü; wer einen tippt (eine alte Datei in ~/.claude/commands), erfährt den neuen.
 * Jeder mit dem vollen neuen Namen. Ein alter Name, der heute eine Kurzform ist (/autopilot-an), läuft als Befehl.
 */
export const ALTE_BEFEHLE: ReadonlyMap<string, string> = new Map([
  ...[...Object.entries(REFLECT_ALTE), ...Object.entries(FILETREE_ALTE), ...Object.entries(AUTOPILOT_ALTE)].filter(
    ([alt]) => !LEITSTAND_KURZFORMEN.has(alt) && !LEITSTAND_BEFEHLE.some(one => one.name === alt),
  ),
  ...EIGENE_BEFEHLE.map(one => {
    const rest = one.name.slice('leitstand:'.length)
    const alt = Object.entries(UMBENANNT).find(([, jetzt]) => jetzt === rest)?.[0] ?? rest
    return [`leitstand-${alt}`, one.name] as const
  }),
  ...Object.entries(UMBENANNT).map(([alt, jetzt]) => [alt, `leitstand:${jetzt}`] as const),
  ...UMBENANNT_LANG.map(alt => [`leitstand:${alt}`, `leitstand:${UMBENANNT[alt]}`] as const),
  ...Object.entries(UMGEZOGEN).flatMap(([alt, jetzt]) => [[`leitstand:${alt}`, jetzt], [`leitstand-${alt}`, jetzt], [alt, jetzt]] as const),
])

/** Was ein alter Name antwortet: wie der Befehl jetzt heißt. */
export function neuerName(name: string): string {
  const kurz = kurzform(name)
  return `Der Befehl heißt jetzt /${name}${kurz === undefined ? '' : `, kurz /${kurz}`}.`
}

/** Ob das Argument eines Befehls nach seiner Hilfe fragt. */
export const fragtNachHilfe = (args: string) => /^(hilfe|\?|help)$/i.test(args.trim())

/** Wie man den Standard für neue Chats einstellt (Leitfaden 2.3), wörtlich für Hilfe und Einstellungsfenster. */
export const STANDARD_WEG =
  'Sag Claude zum Beispiel: Stell bei Leitstand den Standard für neue Chats: Ansicht auf einfach. Claude macht das mit `claude plugin configure leitstand@bm-mods`. ' +
  'Im Terminal geht es auch selbst: `claude plugin configure leitstand@bm-mods` zeigt die Optionen. Setzen geht mit `--values-stdin`, etwa `echo \'{"ansicht": "einfach", "verdecken": false}\' | claude plugin configure leitstand@bm-mods --values-stdin`. Das gilt für Chats, die danach beginnen. Ältere Installationen heißen `leitstand@bjoern-mods`; `claude plugin list` zeigt den Namen. ' +
  '"not set" heißt dort: Es gilt der eingebaute Standard.'

/** Die Optionen des Leitstands: Titel, Werte auf Deutsch, eingebauter Standard; wie plugin.json sie nennt. */
export const OPTIONEN: readonly string[] = [
  'Ansicht: einfach, detailliert, minimal (eine Zeile mit dem Stand, darunter die Buttons) oder aus. Standard: minimal.',
  'Arbeitsweise: auto (Auto-Modus) oder gruppenarbeit. Standard: auto.',
  'Töne: aus, signalton oder stimme (Signalton und Stimme). Standard: aus.',
  'Desktop-Benachrichtigungen, Andere Chats, Ruhemodus, Plan zuerst freigeben, Auf GitHub abschließen, Selbstkritik nach Dateiänderungen: an oder aus (im Terminal true oder false). Standard: aus.',
  'Passwortschutz, Verdecken, Regeln: Korrekturen prüfen: an oder aus (im Terminal true oder false). Standard: an.',
  'Regeln: Modell für die Prüfung: ein Modellname. Standard: haiku.',
  'Dateien: Claude-Aktivität: reads and writes (Lesen und Schreiben), writes (nur Schreiben), reads (nur Lesen) oder none (nichts). Standard: reads and writes.',
  'Dateien: Symbole: auto, nerd (Symbole einer Nerd Font) oder plain (nur einfache Zeichen). Standard: auto.',
  'Dateien: Claude folgen: on (an) oder off (aus). Standard: on.',
  'Dateien: rechte Spalte: date (Datum) oder size (Größe). Standard: date.',
  'Dateien: öffnen mit: leer (die Standard-App), preview (Vorschau im Fenster) oder ein eigener Befehl. Standard: leer.',
  'Autopilot: Höchstzahl angeschobener Runden: eine Zahl. Standard: 10.',
]

/** Wie weit ein Befehl wirkt, in der Fassung aus Leitfaden 4. */
function giltSatz(one: LeitstandBefehl): string {
  if (one.giltText !== undefined) return one.giltText
  switch (one.gilt) {
    case 'einstellung':
      return `nur in diesem Chat. Standard für neue Chats: Option "${one.option ?? ''}", siehe /leitstand:hilfe unter Einstellen.`
    case 'chat':
      return 'nur in diesem Chat.'
    case 'dauerhaft':
      return `dauerhaft: schreibt in ${one.ort ?? ''}.`
    default:
      return 'einmal, sofort; ändert keine Einstellung.'
  }
}

/** Die Hilfe eines Befehls (Leitfaden 4): was er tut, Button oder Einstellungsfenster, wie weit er wirkt, Argumente. */
export function befehlsHilfe(one: LeitstandBefehl): string {
  const kurz = kurzform(one.name)
  return [
    `/${one.name} · ${one.description}`,
    `Was: ${one.tut}`,
    one.knopf,
    `Gilt: ${giltSatz(one)}`,
    `Argumente: ${one.argumente === '' ? 'keine.' : one.argumente}`,
    ...(one.argumente === '' ? [] : [`Beispiel: ${one.beispiel}`]),
    ...(kurz === undefined ? [] : [`Kurzform: /${kurz}`]),
  ].join('\n')
}

/** Ein Satz unter dem Namen einer Gruppe in der Übersicht, wo die Befehle allein es nicht erklären. */
const GRUPPEN_SATZ: Readonly<Record<string, string>> = {
  Arbeitsweise:
    `Helfer startet Claude für Teilaufgaben; in der Gruppenarbeit heißen sie Arbeiter und haben eine feste Stufe (${STUFEN}). Im Auto-Modus entscheidet Claude selbst über Helfer; in der Gruppenarbeit leitet und prüft Claude, die Arbeiter setzen um. ${PLAN_FREIGABE} Starten: Start, /leitstand:plan-starten oder los schreiben.`,
  Werkzeuge: 'Werkzeuge starten einen Skill, einen mitgelieferten Ablauf für Claude.',
  Selbstkritik: 'Claude prüft seine bisherige Arbeit im Hintergrund wie ein skeptischer Prüfer; das Ergebnis steht im Fenster Selbstkritik.',
  Regeln:
    'Aus einer kurzen Nachricht (bis 500 Zeichen), in der du Claude korrigierst, liest ein kleines Modell eine Regel für später heraus (Korrekturen prüfen). Eine gefundene Regel wartet auf deine Entscheidung: Am Rechner öffnet sich das Fenster Regeln, /leitstand:regeln öffnet es wieder und zeigt sie vom Handy mit Nummern. ' +
    'Gespeichert steht sie in einer CLAUDE.md (eine Textdatei mit Anweisungen, die Claude bei jedem Start liest; die im Projektordner wird oft mit dem Projekt geteilt): in deiner globalen (~/.claude/CLAUDE.md, alle Projekte) oder der im Projektordner; oder sie gilt nur in diesem Chat. Ändern oder löschen: die Datei bearbeiten oder Claude darum bitten.',
  Dateien: 'Das Fenster Dateien zeigt die Dateien des Projekts als Baum, nur am Rechner.',
  Autopilot: AUTOPILOT_TEXT,
  Schutz: `Passwortschutz: ${PASSWORTSCHUTZ_TEXT} Verdecken: ${VERDECKEN_TEXT}`,
}

/** Zeilen, die keine Befehle des Leitstands sind, aber in ihre Gruppe gehören: merke: und der Grundbefehl /autopilot. */
const GRUPPEN_EXTRA: Readonly<Record<string, readonly string[]>> = {
  Regeln: ['merke: <Regel> · am Anfang einer Nachricht: schlägt diese Regel vor, ohne Modellaufruf, auch wenn Korrekturen prüfen aus ist; sie wartet dann im Fenster Regeln auf deine Entscheidung'],
  Autopilot: [`/${AUTOPILOT_GRUNDBEFEHL.name} ${AUTOPILOT_GRUNDBEFEHL.argumentHint ?? ''} · ${AUTOPILOT_GRUNDBEFEHL.description}`],
}

/** Die Hilfe des Leitstands (Leitfaden 2): was er tut, Zuerst wichtig, Einstellen, Kosten, Handy, dann alle Befehle. */
export function befehlsUeberblick(): string {
  const lines = [
    'Leitstand · Hilfe',
    '',
    'Was der Mod tut',
    'Der Leitstand ist ein Mod, also eine Erweiterung für Claude Code. Er zeigt in der Leiste über dem Eingabefeld, woran Claude gerade arbeitet: den Plan als Checkliste, wie weit jeder Schritt ist und wann Claude dich braucht. ' +
      'Darunter stehen Buttons: für Pause und Weiter, für Werkzeuge wie Kurzantworten oder Selbstkritik und zum Schutz von Passwörtern.',
    '',
    'Zuerst wichtig',
    '/leitstand:hilfe · diese Hilfe',
    '/leitstand:buttons-zeigen · erklärt jeden Button (❓ oben rechts in der Leiste)',
    '/leitstand:ansicht-einfach, /leitstand:ansicht-detailliert, /leitstand:ansicht-minimal · wie viel die Leiste zeigt (Menü oben rechts)',
    '/leitstand:pause und /leitstand:weiter · Claude anhalten und weitermachen lassen (Buttons Pause und Weiter)',
    '/leitstand:plan-starten · einen Plan starten, der auf deine Freigabe wartet (Button Start, oder schreib los)',
    '/leitstand:einstellungen-zeigen · das Einstellungsfenster (⚙️ oben rechts, im Terminal 🔧)',
    '/leitstand ohne Zusatz schaltet den Leitstand aus oder ein.',
    '',
    'Neben den Bordmitteln von Claude Code',
    'Pause hält Claude an wie Esc, die Leiste merkt sich aber den Auftrag, und Weiter schickt die Nachricht, weiterzumachen. Neuer Chat leert den Chat mit /clear, schickt aber vorher eine Übergabenotiz in den neuen. ' +
      'Der Auto-Modus des Leitstands (Claude wählt seine Helfer) hat nichts mit dem Auto-Modus der Berechtigungen von Claude Code zu tun. Plan zuerst freigeben ist nicht der Plan-Modus: Claude legt nur seine Schritte fest und wartet dann auf Start.',
    '',
    'Einstellen',
    'Nur in diesem Chat: im Einstellungsfenster oder mit den Befehlen unten, etwa /leitstand:ton-signalton. /leitstand:zuruecksetzen stellt diesen Chat zurück auf den Standard für neue Chats.',
    'Standard für neue Chats, je Option:',
    ...OPTIONEN.map(one => `- ${one}`),
    STANDARD_WEG,
    '',
    'Kosten',
    'Die Leiste selbst braucht wenig: Ihre Anleitung für Claude steht in jeder Runde (eine Antwort von Claude auf deine Nachricht, mit allem, was er dabei tut) mit im Auftrag, und jeder neue Auftrag bekommt seinen Namen von einem kleinen Aufruf an Haiku. ' +
      'Das zählt in Tokens, der Einheit, in der Claude liest und schreibt; sie zählen gegen dein Nutzungslimit. Haiku, Sonnet, Opus und Fable sind Modelle von Claude, von klein und günstig (Haiku) bis groß (Fable). ' +
      'Mehr kosten: Korrekturen prüfen (an: ein kleiner Haiku-Aufruf je kurzer Nachricht), jede Selbstkritik und jeder Neue Chat (je ein Aufruf, der den ganzen Chat liest), der Autopilot (jede angeschobene Runde wie eine eigene Nachricht) und die Gruppenarbeit (die Arbeiter lesen und schreiben selbst).',
    '',
    'Vom Handy (Remote Control)',
    'Dort gibt es keine Leiste, keine Buttons und keine Fenster. Jeder Befehl geht und antwortet als Text, auch Plan, Verlauf, Buttons und Einstellungen. Hinweise wie Claude braucht dich stehen nur in der Leiste am Rechner; vom Handy erfährst du es aus Claudes Antwort oder mit /leitstand:plan-zeigen. ' +
      'Der Passwortschutz nimmt ein Passwort aus deiner Nachricht, statt sie zurückzuhalten. Dateien und die Begrüßung gibt es nur am Rechner.',
    '',
    'Befehle',
    'Befehlsnamen schreiben Umlaute als ae, oe, ue und ss.',
    'Fast jeder Befehl geht auch kurz ohne leitstand: davor, etwa /pause oder /verdecken-an; nur an, aus, hilfe und vermenschlichen nicht.',
  ]
  let gruppe = ''
  const schliesseGruppe = () => {
    for (const extra of GRUPPEN_EXTRA[gruppe] ?? []) lines.push(extra)
  }
  for (const one of LEITSTAND_BEFEHLE) {
    if (one.gruppe !== gruppe) {
      schliesseGruppe()
      gruppe = one.gruppe
      lines.push('', gruppe)
      const satz = GRUPPEN_SATZ[gruppe]
      if (satz !== undefined) lines.push(satz)
    }
    lines.push(`/${one.name}${one.argumentHint ? ` ${one.argumentHint}` : ''} · ${one.description}`)
  }
  schliesseGruppe()
  lines.push('', 'Mehr zu jedem Befehl: hilfe dahinter, etwa /leitstand:pause hilfe.')
  return lines.join('\n')
}

/** Die Einstellungen eines Chats, wie das Einstellungsfenster sie zeigt, für die Textfassung vom Handy. */
export type EinstellungenJetzt = {
  ansicht: 'simple' | 'detailed' | 'minimal' | 'off'
  arbeitsweise: 'auto' | 'dynamisch'
  toene: 'off' | 'chime' | 'voice'
  benachrichtigungen: boolean
  andereChats: boolean
  ruhemodus: boolean
  planFreigeben: boolean
  githubAbschluss: boolean
  passwortschutz: boolean
  verdecken: boolean
  /** Was nicht im Einstellungsfenster steht, aber in diesem Chat gilt. */
  korrekturen: boolean
  selbstkritikAuto: boolean
  kurzantworten: boolean
  autopilot: boolean
  remote: 'on' | 'off' | 'missing'
}

/** Das Einstellungsfenster als Text, für das Handy: je Zeile der Wert dieses Chats und der Befehl zum Umschalten. */
export function einstellungenAlsText(jetzt: EinstellungenJetzt): string {
  const anAus = (isOn: boolean) => (isOn ? 'An' : 'Aus')
  const schalter = (titel: string, isOn: boolean, befehlName: string) =>
    `${titel}: ${anAus(isOn)} · umschalten: /leitstand:${befehlName}-${isOn ? 'aus' : 'an'}`
  const ansichten = { simple: 'Einfach', detailed: 'Detailliert', minimal: 'Minimal', off: 'Aus' } as const
  const ansichtBefehle = { simple: 'ansicht-einfach', detailed: 'ansicht-detailliert', minimal: 'ansicht-minimal', off: 'aus' } as const
  const andere = (Object.keys(ansichten) as (keyof typeof ansichten)[]).filter(one => one !== jetzt.ansicht).map(one => `/leitstand:${ansichtBefehle[one]}`)
  const toene = { off: 'Aus', chime: 'Signalton', voice: 'Signalton und Stimme' } as const
  const toeneBefehle = { off: 'ton-aus', chime: 'ton-signalton', voice: 'ton-stimme' } as const
  const andereToene = (Object.keys(toene) as (keyof typeof toene)[]).filter(one => one !== jetzt.toene).map(one => `/leitstand:${toeneBefehle[one]}`)
  return [
    'Die Einstellungen dieses Chats; jede gilt nur hier:',
    `Ansicht: ${ansichten[jetzt.ansicht]} · umstellen: ${andere.join(', ')}`,
    jetzt.arbeitsweise === 'dynamisch'
      ? 'Arbeitsweise: Gruppenarbeit · umstellen: /leitstand:arbeitsmodus-auto'
      : 'Arbeitsweise: Auto-Modus · umstellen: /leitstand:arbeitsmodus-gruppenarbeit',
    `Töne: ${toene[jetzt.toene]} · umstellen: ${andereToene.join(', ')}`,
    schalter('Desktop-Benachrichtigungen', jetzt.benachrichtigungen, 'benachrichtigungen'),
    schalter('Andere Chats', jetzt.andereChats, 'andere-chats'),
    schalter('Ruhemodus', jetzt.ruhemodus, 'ruhemodus'),
    jetzt.arbeitsweise === 'dynamisch' ? 'Plan zuerst freigeben: An (in der Gruppenarbeit immer)' : schalter('Plan zuerst freigeben', jetzt.planFreigeben, 'plan-freigeben'),
    schalter('Auf GitHub abschließen', jetzt.githubAbschluss, 'github-abschluss'),
    schalter('Passwortschutz', jetzt.passwortschutz, 'passwortschutz'),
    schalter('Verdecken', jetzt.verdecken, 'verdecken'),
    'Nicht im Einstellungsfenster:',
    schalter('Korrekturen prüfen', jetzt.korrekturen, 'regelpruefung'),
    schalter('Selbstkritik nach Dateiänderungen', jetzt.selbstkritikAuto, 'selbstkritik-auto'),
    schalter('Kurzantworten', jetzt.kurzantworten, 'kurzantworten'),
    schalter('Autopilot', jetzt.autopilot, 'autopilot'),
    ...(jetzt.remote === 'missing'
      ? []
      : [jetzt.remote === 'on' ? 'Remote Control: An · ausschalten trennt das Handy: /leitstand:fernsteuerung-aus' : 'Remote Control: Aus · umschalten: /leitstand:fernsteuerung-an']),
    'Alles zurück auf den Standard für neue Chats: /leitstand:zuruecksetzen. Den Standard für neue Chats stellst du anders ein: /leitstand:hilfe unter Einstellen.',
  ].join('\n')
}
