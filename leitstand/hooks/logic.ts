import type { GlanceChatSettings, GlanceChecklist, GlanceHelper, GlanceHistoryView, GlanceOtherChat, GlanceTask, GlanceTaskSize, GlanceUsage } from '../types'
import { SIZE_WEIGHT, teamReport, weekSummary } from './history'
import { inBerlin } from './berlin'
import { maskPrivate } from './privacy'

export const PLUGIN = 'leitstand'

export const tourNeeds = (mark: string) =>
  `Wenn Claude dich braucht, zeigt die Checkliste Braucht dich ${mark} und sagt, was zu tun ist. Schalte in den Einstellungen Töne oder Desktop-Benachrichtigungen ein, dann hörst oder siehst du es auch in einer anderen App.`

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
  const cut = name.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')

  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–]+$/, '')}…`
}

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
 * "Starte sofort" at the head of a message: the plan Claude makes for it needs no approval, whatever follows ("Starte
 * sofort: Schreib die Übergabe, bevor der Server neu startet"). Typed by the person or put there by a cron job.
 */
export function startsAtOnce(text: string): boolean {
  return /^\s*starte\s+(?:bitte\s+)?sofort(?![\p{L}\p{N}])/iu.test(text)
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
  return sentences.some(({ sentence, isQuestion }) => {
    if (sentence === '' || isQuestion || DO_HEDGE.test(sentence) || EXPLAIN.test(sentence)) return false
    const parts = sentence.split(BUT)
    if (parts.length > 1) return tellsWork(parts[parts.length - 1]!.replace(/^[\s,;:–—]+/, ''))
    return /^ja(?![\p{L}\p{N}])/u.test(sentence) || tellsWork(sentence)
  })
}

// Claude's closing words that ask the person to pick or to go on, without a question mark: "Sag mir, welche du
// willst.", "Nimm a oder b, dann lege ich los.", "Schreib los."
const CHOICE_INVITE = new RegExp(
  String.raw`(?:^|[,;:–—]\s*)(?:(?:sag|sage|schreib|schreibe|gib) (?:mir|uns)|schreib(?:e)? los|welche[nrsm]?|wähl(?:e)?|such(?:e)? dir|entscheide? dich)(?![\p{L}\p{N}])` +
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
  const text = answer.trimEnd()
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
  const end = answer.trimEnd().replace(/[*_"'”“«»)\s]+$/g, '')
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
export type ShellWord = { text: string; isRunTime: boolean; runs?: string[] }
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
      words.push({ text: operator, isRunTime: false })
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

export const MAX_QUESTION = 160

/** The question Claude ended on, as one plain line: its last sentence, or the whole last paragraph when that sentence is a few words. */
export function questionOf(answer: string): string | null {
  if (!asksQuestion(answer)) return null
  const paragraph = (answer.trim().split(/\n\s*\n/).pop() ?? '').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim()
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

/** Applies a progress report: earlier steps check off, 100 moves to the next. */
/** The step a progress report means: the one it names, or without a name (a small model may leave it out) the one under way. */
export function progressName(tasks: GlanceTask[], rawName: string): string {
  if (String(rawName ?? '').trim() === '') {
    const current = tasks.find(one => one.status === 'active') ?? tasks.find(one => one.status !== 'done')
    if (current) return current.name
  }

  return cleanName(rawName)
}

export function applyProgress(tasks: GlanceTask[], rawName: string, rawPercent: number): GlanceTask[] {
  const name = progressName(tasks, rawName)
  const percent = Math.min(100, Math.max(0, Math.round(Number(rawPercent) || 0)))
  let list = [...tasks]
  let index = list.findIndex(one => one.name.toLowerCase() === name.toLowerCase())
  if (index === -1) {
    const active = list.findIndex(one => one.status === 'active')
    index = active === -1 ? list.length : active
    list.splice(index, 0, task(name, 'upcoming', `${name}#${list.length}`))
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
  return carryTokens(previous, settle(
    todos.map((todo, index) => {
      const name = cleanName(todo.content)
      const before = previous.find(one => one.name === name)
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
 * Wie weit ein Leitstand-Befehl wirkt: eine Einstellung nur in diesem Chat (der Standard für neue Chats steht im
 * Einstellungsmenü), ein Zustand nur dieses Chats ohne Eintrag im Menü, oder einmal, ohne etwas umzustellen.
 */
export type BefehlGilt = 'einstellung' | 'chat' | 'einmal'

/** Ein eigener Slash-Befehl des Leitstands: was die Befehlsliste zeigt und was seine Hilfe sagt. */
export type LeitstandBefehl = {
  name: string
  /** Die eine Zeile, die die Befehlsliste der App zeigt. */
  description: string
  argumentHint?: string
  gruppe: string
  /** Was der Befehl tut, in einem oder zwei Sätzen. */
  tut: string
  /** Welchem Knopf oder Schalter er entspricht. */
  knopf: string
  gilt: BefehlGilt
  /** Die Argumente außer hilfe; leer, wenn er keine nimmt. */
  argumente: string
  beispiel: string
}

const befehl = (
  gruppe: string,
  name: string,
  description: string,
  tut: string,
  knopf: string,
  gilt: BefehlGilt,
  mehr: { argumentHint?: string; argumente?: string; beispiel?: string } = {},
): LeitstandBefehl => ({
  name,
  description,
  ...(mehr.argumentHint === undefined ? {} : { argumentHint: mehr.argumentHint }),
  gruppe,
  tut,
  knopf,
  gilt,
  argumente: mehr.argumente ?? '',
  beispiel: mehr.beispiel ?? `/${name}`,
})

const JA = { argumentHint: '[ja]', argumente: 'ja führt aus. Ohne ja sagt der Befehl nur, was passieren würde.' }
const ja = (name: string) => ({ ...JA, beispiel: `/${name} ja` })

/** Alle eigenen Befehle des Leitstands, in der Reihenfolge der Übersicht. /leitstand bleibt daneben als Kurzform. */
export const LEITSTAND_BEFEHLE: readonly LeitstandBefehl[] = [
  befehl('Allgemein', 'leitstand:hilfe', 'Alle Leitstand-Befehle im Überblick', 'Listet alle Leitstand-Befehle auf, nach Gruppen, je mit einer Zeile.', 'Keiner; die Knöpfe stehen im Leitstand über dem Eingabefeld.', 'einmal'),
  befehl('Allgemein', 'leitstand:an', 'Leitstand einschalten', 'Schaltet den Leitstand über dem Eingabefeld ein.', 'Einstellungen › Ansicht (Einfach, Ausführlich oder Minimal)', 'einstellung'),
  befehl('Allgemein', 'leitstand:aus', 'Leitstand ausschalten', 'Schaltet den Leitstand aus; alle Werkzeug-Details sind dann wieder zu sehen.', 'Einstellungen › Ansicht › Aus', 'einstellung'),
  befehl('Allgemein', 'leitstand:tour', 'Die Begrüßung noch mal zeigen', 'Zeigt die Begrüßung über dem Eingabefeld noch einmal; mit Weiter gehst du sie durch.', 'Keiner; die Begrüßung erscheint beim ersten Start von selbst.', 'einmal'),

  befehl('Ansicht', 'leitstand:ansicht-einfach', 'Ansicht Einfach: Schritte und Fortschritt', 'Der Leitstand zeigt die Schritte und den Fortschritt.', 'Ansichts-Menü im Leitstand oder Einstellungen › Ansicht › Einfach', 'einstellung'),
  befehl('Ansicht', 'leitstand:ansicht-ausfuehrlich', 'Ansicht Ausführlich: dazu Modelle, Zeit und Tokens', 'Der Leitstand zeigt dazu Modelle, Zeit, Tokens und Cache.', 'Ansichts-Menü im Leitstand oder Einstellungen › Ansicht › Ausführlich', 'einstellung'),
  befehl('Ansicht', 'leitstand:ansicht-minimal', 'Ansicht Minimal: eine Zeile', 'Der Leitstand zeigt eine Zeile mit Stand, Fortschritt, Restzeit und Tokens.', 'Ansichts-Menü im Leitstand oder Einstellungen › Ansicht › Minimal', 'einstellung'),

  befehl('Arbeitsweise', 'leitstand:arbeitsmodus-auto', 'Auto-Modus: Claude entscheidet selbst über Helfer', 'Claude entscheidet selbst, ob und welche Helfer es einsetzt.', 'Modus-Menü in der Knopfzeile oder Einstellungen › Arbeitsweise › Auto-Modus', 'einstellung'),
  befehl('Arbeitsweise', 'leitstand:arbeitsmodus-gruppenarbeit', 'Gruppenarbeit: Claude leitet, Arbeiter setzen um', 'Claude plant und prüft, Arbeiter in sechs Stufen setzen um. Jeder Plan wartet auf deine Freigabe.', 'Modus-Menü in der Knopfzeile oder Einstellungen › Arbeitsweise › Gruppenarbeit', 'einstellung'),

  befehl('Auftrag', 'leitstand:plan-starten', 'Den wartenden Plan starten', 'Startet den Plan, der auf deine Freigabe wartet. Wartet keiner, sagt der Befehl das.', 'Start', 'einmal'),
  befehl('Auftrag', 'leitstand:pause', 'Claude anhalten', 'Hält Claude mitten im Auftrag an; mit /leitstand:weiter geht es dort weiter.', 'Pause', 'einmal'),
  befehl('Auftrag', 'leitstand:weiter', 'Claude weitermachen lassen', 'Claude macht dort weiter, wo es aufgehört hat.', 'Weiter', 'einmal'),
  befehl('Auftrag', 'leitstand:plan-zeigen', 'Den ganzen Plan zeigen', 'Zeigt den Plan mit allen Schritten; auf dem Handy als Text.', 'Plan', 'einmal'),
  befehl('Auftrag', 'leitstand:letzter-stand-zeigen', 'Den letzten Sicherungspunkt zeigen', 'Zeigt den Sicherungspunkt, den Claude vor dem letzten Aufräumen gespeichert hat; auf dem Handy als Text.', 'Letzter Stand (Einstellungen › Chat aufräumen)', 'einmal'),
  befehl('Auftrag', 'leitstand:neuer-chat', 'Neuer Chat mit Übergabenotiz (mit ja)', 'Claude schreibt eine Übergabenotiz, leert diesen Chat und schickt die Notiz als erste Nachricht in den neuen.', 'Neuer Chat (zweimal drücken)', 'einmal', ja('leitstand:neuer-chat')),
  befehl('Auftrag', 'leitstand:abschliessen', 'Auf GitHub abschließen: Commit, Pull Request, Merge (mit ja)', 'Claude räumt die Änderungen auf, committet, öffnet einen Pull Request und mergt nach deiner Freigabe.', 'Push (zweimal drücken)', 'einmal', ja('leitstand:abschliessen')),

  befehl('Verlauf und Berichte', 'leitstand:verlauf-zeigen', 'Den Verlauf eines Tages zeigen', 'Zeigt die Aufträge eines Tages in diesem Projekt; auf dem Handy als Text.', 'Verlauf', 'einmal', {
    argumentHint: '[gestern|JJJJ-MM-TT]',
    argumente: 'Ohne Argument heute; gestern oder ein Datum als JJJJ-MM-TT.',
    beispiel: '/leitstand:verlauf-zeigen gestern',
  }),
  befehl('Verlauf und Berichte', 'leitstand:tagesbericht', 'Teambericht für heute als Text', 'Schreibt den Teambericht für heute in die Antwort und kopiert ihn.', 'Verlauf › Tagesbericht', 'einmal'),
  befehl('Verlauf und Berichte', 'leitstand:wochenbericht', 'Teambericht für diese Woche als Text', 'Schreibt den Teambericht für diese Woche in die Antwort und kopiert ihn.', 'Verlauf › Wochenbericht', 'einmal'),
  befehl('Verlauf und Berichte', 'leitstand:meine-woche', 'Deine Woche über alle Projekte', 'Fasst deine letzten sieben Tage über alle Projekte zusammen und kopiert das.', 'Verlauf › Deine Woche', 'einmal'),

  befehl('Helfer', 'leitstand:ausfragen', 'Grill mich: Claude löchert dich mit Fragen', 'Startet den Skill grill-me: Claude fragt dich so lange aus, bis ein Plan oder eine Idee steht.', '♨️ Grill mich', 'einmal', {
    argumentHint: '[Thema]',
    argumente: 'Ein Thema (frei). Ohne Thema geht es um den aktuellen Plan; gibt es keinen, fragt der Befehl nach einem Thema.',
    beispiel: '/leitstand:ausfragen Umzug der Datenbank',
  }),
  befehl('Helfer', 'leitstand:sauberer-code', 'Code prüfen mit clean-code', 'Startet den Skill clean-code: Funktionen, Namen, Verschachtelung und Fehlerbehandlung.', '🧹', 'einmal'),
  befehl('Helfer', 'leitstand:reflexion', 'Reflect starten', 'Startet den Befehl des Mods Reflect.', '🪞', 'einmal'),
  befehl('Helfer', 'leitstand:vermenschlichen', 'Letzte Antwort natürlicher umschreiben', 'Claude überarbeitet seine letzte Antwort, damit sie nicht nach KI klingt.', '🧍', 'einmal'),
  befehl('Helfer', 'leitstand:dateibaum', 'Filetree öffnen', 'Öffnet die Seitenleiste des Mods Filetree.', '🌳', 'einmal'),
  befehl('Helfer', 'leitstand:kurzantworten-an', 'Kurzantworten einschalten', 'Claude antwortet mit dem nächsten Schritt zuerst, in nummerierten Schritten und ohne Umwege.', '🧠', 'chat'),
  befehl('Helfer', 'leitstand:kurzantworten-aus', 'Kurzantworten ausschalten', 'Claude antwortet wieder wie gewohnt.', '🧠', 'chat'),
  befehl('Helfer', 'leitstand:fernsteuerung-an', 'Remote Control einschalten', 'Schaltet Remote Control ein, damit du den Chat vom Handy aus steuern kannst.', '🛜', 'chat'),
  befehl('Helfer', 'leitstand:fernsteuerung-aus', 'Remote Control ausschalten', 'Schaltet Remote Control aus.', '🛜', 'chat'),

  befehl('Schutz', 'leitstand:verdecken-an', 'Verdecken einschalten', 'Passwörter, Schlüssel und persönliche Daten erscheinen auf dem Bildschirm als Punkte. Claude liest alles unverändert.', '🔒 oder Einstellungen › Verdecken', 'einstellung'),
  befehl('Schutz', 'leitstand:verdecken-aus', 'Verdecken ausschalten', 'Alles erscheint wieder so, wie es im Chat steht.', '🔒 oder Einstellungen › Verdecken', 'einstellung'),
  befehl('Schutz', 'leitstand:passwortschutz-an', 'Passwortschutz einschalten', 'Eine Nachricht, die nach Passwort oder Schlüssel aussieht, wird zurückgehalten, bis du sie noch mal sendest.', 'Einstellungen › Passwortschutz', 'einstellung'),
  befehl('Schutz', 'leitstand:passwortschutz-aus', 'Passwortschutz ausschalten', 'Jede Nachricht wird so gesendet, wie du sie schreibst.', 'Einstellungen › Passwortschutz', 'einstellung'),
  befehl('Schutz', 'leitstand:geheimnisse-sichern', 'Passwörter aus dem Chat in die .env verschieben (mit ja)', 'Verschiebt Passwörter und Schlüssel aus diesem Chat in die .env im Projektordner und räumt den Chat auf; danach kennt Claude nur noch Platzhalter.', '🛡️ (zweimal drücken)', 'einmal', ja('leitstand:geheimnisse-sichern')),

  befehl('Einstellungen', 'leitstand:einstellungen-zeigen', 'Die Leitstand-Einstellungen öffnen', 'Öffnet die Einstellungen des Leitstands in der Seitenleiste.', '⚙ Einstellungen', 'einmal'),
  befehl('Einstellungen', 'leitstand:ton-aus', 'Töne ausschalten', 'Kein Ton, wenn Claude dich braucht, festhängt oder fertig ist.', 'Einstellungen › Töne › Aus', 'einstellung'),
  befehl('Einstellungen', 'leitstand:ton-signalton', 'Töne: Signalton', 'Ein Signalton, wenn Claude dich braucht, festhängt oder einen langen Auftrag beendet.', 'Einstellungen › Töne › Signalton', 'einstellung'),
  befehl('Einstellungen', 'leitstand:ton-stimme', 'Töne: Signalton und Stimme', 'Ein Signalton und ein paar gesprochene Worte, wenn Claude dich braucht, festhängt oder einen langen Auftrag beendet.', 'Einstellungen › Töne › Signalton und Stimme', 'einstellung'),
  befehl('Einstellungen', 'leitstand:ton-anhoeren', 'Den eingestellten Ton anhören', 'Spielt den eingestellten Ton einmal ab.', 'Einstellungen › Töne › Anhören', 'einmal'),
  befehl('Einstellungen', 'leitstand:benachrichtigungen-an', 'Desktop-Benachrichtigungen einschalten', 'Dein Computer sagt dir Bescheid, wenn Claude dich braucht, festhängt oder einen langen Auftrag beendet.', 'Einstellungen › Desktop-Benachrichtigungen', 'einstellung'),
  befehl('Einstellungen', 'leitstand:benachrichtigungen-aus', 'Desktop-Benachrichtigungen ausschalten', 'Keine Benachrichtigungen auf deinem Computer.', 'Einstellungen › Desktop-Benachrichtigungen', 'einstellung'),
  befehl('Einstellungen', 'leitstand:andere-chats-an', 'Andere Chats in der Leiste nennen', 'Die Leiste nennt andere Chats auf diesem Computer, die dich brauchen.', 'Einstellungen › Andere Chats', 'einstellung'),
  befehl('Einstellungen', 'leitstand:andere-chats-aus', 'Andere Chats nicht mehr nennen', 'Die Leiste erwähnt keine anderen Chats, etwa bevor du deinen Bildschirm teilst.', 'Einstellungen › Andere Chats', 'einstellung'),
  befehl('Einstellungen', 'leitstand:ruhemodus-an', 'Ruhemodus einschalten', 'Nichts auf dem Bildschirm bewegt sich, und der Status steht fett.', 'Einstellungen › Ruhemodus', 'einstellung'),
  befehl('Einstellungen', 'leitstand:ruhemodus-aus', 'Ruhemodus ausschalten', 'Balken und Kreisel bewegen sich wieder, während Claude arbeitet.', 'Einstellungen › Ruhemodus', 'einstellung'),
  befehl('Einstellungen', 'leitstand:plan-freigeben-an', 'Plan zuerst freigeben: an', 'Claude zeigt erst seinen Plan und wartet auf Start oder eine Änderung. In der Gruppenarbeit gilt das immer.', 'Einstellungen › Plan zuerst freigeben', 'einstellung'),
  befehl('Einstellungen', 'leitstand:plan-freigeben-aus', 'Plan zuerst freigeben: aus', 'Claude legt direkt los, sobald der Plan steht. In der Gruppenarbeit geht das nicht.', 'Einstellungen › Plan zuerst freigeben', 'einstellung'),
  befehl('Einstellungen', 'leitstand:github-abschluss-an', 'Auf GitHub abschließen: an', 'Ein fertiger Auftrag in einem GitHub-Projekt bietet den Knopf Push an.', 'Einstellungen › Auf GitHub abschließen', 'einstellung'),
  befehl('Einstellungen', 'leitstand:github-abschluss-aus', 'Auf GitHub abschließen: aus', 'Fertige Aufträge bleiben auf ihrem Branch.', 'Einstellungen › Auf GitHub abschließen', 'einstellung'),
  befehl('Einstellungen', 'leitstand:jetzt-aufraeumen', 'Den Chat jetzt aufräumen', 'Speichert einen Sicherungspunkt und räumt dann den Chat auf, damit wieder Platz ist.', 'Einstellungen › Chat aufräumen › Jetzt aufräumen', 'einmal'),
  befehl('Einstellungen', 'leitstand:zuruecksetzen', 'Einstellungen auf den Standard zurücksetzen', 'Setzt alle Leitstand-Einstellungen dieses Chats auf den Standard aus dem Einstellungsmenü zurück.', 'Einstellungen › Auf Standard zurücksetzen', 'chat'),
]

/** Die Namen aller eigenen Befehle. */
export const LEITSTAND_BEFEHL_NAMEN: readonly string[] = LEITSTAND_BEFEHLE.map(one => one.name)

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

/** Der volle Name eines Befehls, auch wenn er als Kurzform kam. */
export const vollerBefehl = (name: string): string => LEITSTAND_KURZFORMEN.get(name) ?? name

/** Umbenannt am 2026-10-26: der ADHS-Modus heißt Kurzantworten. */
const UMBENANNT: Readonly<Record<string, string>> = { 'adhs-an': 'kurzantworten-an', 'adhs-aus': 'kurzantworten-aus' }

/**
 * Die alten Namen bis leitstand 0.55: /leitstand-pause und /adhs-an. Sie stehen nicht mehr im Menü; wer einen tippt
 * (eine alte Datei in ~/.claude/commands), erfährt den neuen. Jeder mit dem vollen neuen Namen.
 */
export const ALTE_BEFEHLE: ReadonlyMap<string, string> = new Map([
  ...LEITSTAND_BEFEHLE.map(one => {
    const rest = one.name.slice('leitstand:'.length)
    const alt = Object.entries(UMBENANNT).find(([, jetzt]) => jetzt === rest)?.[0] ?? rest
    return [`leitstand-${alt}`, one.name] as const
  }),
  ...Object.entries(UMBENANNT).map(([alt, jetzt]) => [alt, `leitstand:${jetzt}`] as const),
])

/** Was ein alter Name antwortet: wie der Befehl jetzt heißt. */
export function neuerName(name: string): string {
  const kurz = kurzform(name)
  return `Der Befehl heißt jetzt /${name}${kurz === undefined ? '' : `, kurz /${kurz}`}.`
}

/** Ob das Argument eines Befehls nach seiner Hilfe fragt. */
export const fragtNachHilfe = (args: string) => /^(hilfe|\?|help)$/i.test(args.trim())

const GILT: Record<BefehlGilt, string> = {
  einstellung: 'nur in diesem Chat. Den Standard für neue Chats stellst du im Einstellungsmenü ein.',
  chat: 'nur in diesem Chat.',
  einmal: 'einmal, sofort; der Befehl stellt nichts um.',
}

/** Die Hilfe eines Befehls: was er tut, sein Knopf, wie weit er wirkt, seine Argumente und ein Beispiel. */
export function befehlsHilfe(one: LeitstandBefehl): string {
  const kurz = kurzform(one.name)
  return [
    `/${one.name}: ${one.description}`,
    `Was: ${one.tut}`,
    `Knopf: ${one.knopf}`,
    `Gilt: ${GILT[one.gilt]}`,
    `Argumente: ${one.argumente === '' ? 'keine' : one.argumente} Mit hilfe (oder ?) zeigt er diese Hilfe.`,
    `Beispiel: ${one.beispiel}`,
    ...(kurz === undefined ? [] : [`Kurzform: /${kurz}`]),
  ].join('\n')
}

/** Alle Befehle nach Gruppen, je eine Zeile. */
export function befehlsUeberblick(): string {
  const lines = ['Leitstand-Befehle (jeder erklärt sich mit dem Argument hilfe, etwa /leitstand:pause hilfe):']
  let gruppe = ''
  for (const one of LEITSTAND_BEFEHLE) {
    if (one.gruppe !== gruppe) {
      gruppe = one.gruppe
      lines.push('', gruppe)
    }
    lines.push(`/${one.name}${one.argumentHint ? ` ${one.argumentHint}` : ''}: ${one.description}`)
  }
  lines.push(
    '',
    'Einstellungen gelten nur in diesem Chat. Fast jeder Befehl geht auch ohne leitstand: davor, etwa /pause oder /verdecken-an; nur an, aus, hilfe und vermenschlichen nicht. /leitstand bleibt als Kurzform.',
  )
  return lines.join('\n')
}
