// The day's history of jobs, for a retro: pure functions, no engine calls.

import type { GlanceChecklist, GlanceFile, GlanceHistoryEntry, GlanceOutcome, GlanceTaskSize } from '../types'

export const HISTORY_PREFIX = 'history:'
export const HISTORY_DAYS = 30
/** How much each step size counts toward progress and pace. */
export const SIZE_WEIGHT: Record<GlanceTaskSize, number> = { S: 1, M: 2, L: 3 }
// The project's pace is trusted once its finished jobs hold this many size units: about three medium steps.
const MIN_PACE_UNITS = 6
const DAY_MS = 24 * 60 * 60 * 1000

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** A moment's local day, YYYY-MM-DD: the store key's suffix. */
export function dayKey(at: number): string {
  const date = new Date(at)

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** A moment's local time of day, HH:MM. */
export function clockTime(at: number): string {
  const date = new Date(at)

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The day a /leitstand history argument names: today or heute, yesterday or gestern, or YYYY-MM-DD. Null when it names none. */
export function dayFromArgument(argument: string, now: number): string | null {
  const word = argument.trim().toLowerCase()
  if (word === '' || word === 'today' || word === 'heute') return dayKey(now)
  if (word === 'yesterday' || word === 'gestern') return dayKey(now - DAY_MS)

  return /^\d{4}-\d{2}-\d{2}$/.test(word) ? word : null
}

const OUTCOME: Record<GlanceChecklist['phase'], GlanceOutcome> = {
  working: 'working',
  needsYou: 'waiting',
  stuck: 'stuck',
  stopped: 'stopped',
  background: 'background',
  done: 'done',
}

/** "Neu: contact.html · Geändert: styles.css und app.js": file names only, with the folder where two share a name. */
export function filesNote(files: readonly GlanceFile[], most = 4): string {
  const base = (path: string) => path.split(/[\\/]/).pop() ?? path
  const counts = new Map<string, number>()
  for (const one of files) counts.set(base(one.path), (counts.get(base(one.path)) ?? 0) + 1)
  const label = (path: string) => ((counts.get(base(path)) ?? 0) > 1 ? path.split(/[\\/]/).slice(-2).join('/') : base(path))
  const group = (heading: string, names: string[]) => {
    if (names.length === 0) return null
    const shown = names.slice(0, most)
    const more = names.length - shown.length
    const last = more > 0 ? `${more} weitere` : shown.pop()
    return `${heading}: ${shown.length > 0 ? `${shown.join(', ')} und ${last}` : last}`
  }
  const text = [
    group('Neu', files.filter(one => one.isNew).map(one => label(one.path))),
    group('Geändert', files.filter(one => !one.isNew).map(one => label(one.path))),
  ]
    .filter(Boolean)
    .join(' · ')

  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** A History entry's files, as a step's are kept. */
export function entryFiles(entry: GlanceHistoryEntry): GlanceFile[] {
  return [...(entry.filesAdded ?? []).map(path => ({ path, isNew: true })), ...(entry.filesChanged ?? []).map(path => ({ path, isNew: false }))]
}

/** One job as the history keeps it; `costUsd` is what it cost, where the host keeps a ledger. */
export function entryFromChecklist(list: GlanceChecklist, project: string, costUsd: number | null = null): GlanceHistoryEntry {
  const files = list.tasks.flatMap(one => one.files ?? [])
  const added = [...new Set(files.filter(one => one.isNew).map(one => one.path))]
  const tokens = list.tasks.reduce((sum, one) => sum + one.tokens, list.extraTokens)
  const cached = list.tasks.reduce((sum, one) => sum + one.cachedTokens, list.extraCachedTokens)
  const timed = list.hasPlan
    ? list.tasks.filter(one => one.status === 'done' && one.startedAt !== null && one.finishedAt !== null && one.finishedAt > one.startedAt)
    : []

  return {
    jobId: list.jobId,
    project,
    startedAt: list.startedAt,
    finishedAt: list.finishedAt,
    title: list.title,
    // A job that finished with a question for the person is still a finished job.
    outcome: list.phase === 'needsYou' && list.finishedAt !== null ? 'done' : OUTCOME[list.phase],
    stepsDone: list.tasks.filter(one => one.status === 'done').length,
    stepsTotal: list.tasks.length,
    newTokens: tokens - cached,
    cachedTokens: cached,
    doneSteps: list.hasPlan ? list.tasks.filter(one => one.status === 'done').map(one => one.name) : [],
    doneNotes: list.hasPlan ? list.tasks.filter(one => one.status === 'done').map(one => one.summary ?? '') : [],
    openSteps: list.hasPlan ? list.tasks.filter(one => one.status !== 'done').map(one => one.name) : [],
    filesAdded: added,
    filesChanged: [...new Set(files.filter(one => !one.isNew && !added.includes(one.path)).map(one => one.path))],
    isQuickAnswer: !list.hasPlan,
    costUsd,
    doneUnits: timed.reduce((sum, one) => sum + SIZE_WEIGHT[one.size], 0),
    doneMs: timed.reduce((sum, one) => sum + (one.finishedAt! - one.startedAt!), 0),
  }
}

/** How long one unit of step size takes in this project, from its finished jobs; null until there is enough to go on. */
export function paceFromHistory(entries: readonly GlanceHistoryEntry[], project: string): number | null {
  let units = 0
  let ms = 0
  for (const one of entries) {
    if (one.project === project && one.outcome === 'done' && (one.doneUnits ?? 0) > 0 && (one.doneMs ?? 0) > 0) {
      units += one.doneUnits!
      ms += one.doneMs!
    }
  }

  return units >= MIN_PACE_UNITS ? Math.round(ms / units) : null
}

/** A stored day's entries; a missing or wrong value reads as none. */
export function dayEntries(stored: unknown): GlanceHistoryEntry[] {
  return Array.isArray(stored) ? (stored as GlanceHistoryEntry[]) : []
}

/** The store key of one chat's jobs on a day: each chat rewrites only its own, so two chats never lose each other's. */
export function historyKey(day: string, sessionId: string): string {
  return `${HISTORY_PREFIX}${day}:${sessionId}`
}

/** The day a history key is for. */
export function historyDay(key: string): string {
  return key.slice(HISTORY_PREFIX.length, HISTORY_PREFIX.length + 'YYYY-MM-DD'.length)
}

/** Keys from before 0.25, when every chat's jobs of a day shared one key. */
export function sharedDayKeys(keys: readonly string[]): string[] {
  return keys.filter(key => key.startsWith(HISTORY_PREFIX) && key.length === HISTORY_PREFIX.length + 'YYYY-MM-DD'.length)
}

/** The jobs of several stored lists, each once (the later list's copy wins), oldest first. */
export function mergedEntries(stored: readonly unknown[]): GlanceHistoryEntry[] {
  const byJob = new Map<string, GlanceHistoryEntry>()
  for (const one of stored.flatMap(dayEntries)) byJob.set(one.jobId, one)

  return [...byJob.values()].sort((a, b) => a.startedAt - b.startedAt)
}

/** The day's entries with this one added, or replacing its earlier self. */
export function upsertEntry(entries: unknown, entry: GlanceHistoryEntry): GlanceHistoryEntry[] {
  return [...dayEntries(entries).filter(one => one.jobId !== entry.jobId), entry].sort((a, b) => a.startedAt - b.startedAt)
}

/** Store keys of days older than the history keeps. */
export function expiredHistoryKeys(keys: readonly string[], now: number): string[] {
  const oldest = dayKey(now - HISTORY_DAYS * DAY_MS)

  return keys.filter(key => key.startsWith(HISTORY_PREFIX) && key.slice(HISTORY_PREFIX.length) < oldest)
}

/** The folder name people know a project by. */
export function projectName(project: string): string {
  return project.split(/[\\/]/).filter(Boolean).pop() ?? project
}

/** The day before or after a YYYY-MM-DD day. */
export function shiftDay(day: string, by: number): string {
  const [year, month, date] = day.split('-').map(Number)

  return dayKey(new Date(year!, month! - 1, date! + by, 12).getTime())
}

/** The days the weekly report covers: the day picked and the 6 before it. */
export const WEEK_DAYS = 7

function dateLabel(day: string, options: Intl.DateTimeFormatOptions): string {
  const [year, month, date] = day.split('-').map(Number)
  try {
    return new Date(year!, month! - 1, date!, 12).toLocaleDateString('de-DE', options)
  } catch {
    return day
  }
}

/** YYYY-MM-DD as "30. Sept. 2026"; left as it is where the runtime has no date names. */
export const shortDay = (day: string) => dateLabel(day, { day: 'numeric', month: 'short', year: 'numeric' })

/** "Dienstag, 6. Oktober 2026". */
export const longDay = (day: string) => dateLabel(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** Time as a manager would say it: "unter einer Minute", "12 Min.", "1 Std. 5 Min.". */
export function plainDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'unter einer Minute'
  if (minutes < 60) return `${minutes} Min.`

  return `${Math.floor(minutes / 60)} Std.${minutes % 60 ? ` ${minutes % 60} Min.` : ''}`
}

/**
 * A short daily update for the team, a manager or a CEO: what got done, what is still open, and the time
 * spent. Plain words only: no tokens, models or file names, and quick questions are left out.
 */
export function teamReport(
  view: { day: string; project: string; entries: GlanceHistoryEntry[] },
  span: 'day' | 'week' = 'day',
): string {
  const jobs = view.entries.filter(one => !one.isQuickAnswer)
  const took = (one: GlanceHistoryEntry) =>
    one.finishedAt === null ? '' : ` (${plainDuration(one.finishedAt - one.startedAt)})`
  const heading =
    span === 'week'
      ? `Wochenbericht · ${projectName(view.project)} · ${shortDay(shiftDay(view.day, -(WEEK_DAYS - 1)))} bis ${shortDay(view.day)}`
      : `Tagesbericht · ${projectName(view.project)} · ${longDay(view.day)}`
  const lines = [heading, '']

  if (jobs.length === 0) {
    return [...lines, `${span === 'week' ? 'Diese Woche' : 'An diesem Tag'} wurde keine geplante Arbeit erfasst.`].join('\n')
  }

  const done = jobs.filter(one => one.outcome === 'done')
  const open = jobs.filter(one => one.outcome !== 'done' && one.outcome !== 'stuck')
  const blocked = jobs.filter(one => one.outcome === 'stuck')

  if (done.length > 0) {
    lines.push('Fertig')
    for (const one of done) {
      lines.push(`• ${one.title}${took(one)}`)
      const notes = one.doneNotes ?? []
      if (notes.some(Boolean)) {
        // What each step got done, in Claude's words where it gave them.
        one.doneSteps.forEach((name, at) => lines.push(`  ✓ ${notes[at] || name}`))
      } else if (one.doneSteps.length > 1) {
        lines.push(`  ${one.doneSteps.join(' · ')}`)
      }
    }
    lines.push('')
  }
  if (open.length > 0) {
    // "Open", not "in progress": a stopped job is here too, and nobody may be on it right now.
    lines.push('Noch offen')
    for (const one of open) {
      // The step name keeps its case: German nouns are capitalized.
      const next = one.openSteps[0] ? `; als Nächstes: ${one.openSteps[0]}` : ''
      lines.push(`• ${one.title}: ${one.doneSteps.length} von ${one.stepsTotal} Schritten fertig${next}`)
    }
    lines.push('')
  }
  if (blocked.length > 0) {
    lines.push('Braucht Aufmerksamkeit')
    for (const one of blocked) lines.push(`• ${one.title}: hängt fest und braucht eine Entscheidung`)
    lines.push('')
  }

  const time = jobs.reduce((sum, one) => sum + (one.finishedAt === null ? 0 : one.finishedAt - one.startedAt), 0)
  lines.push(
    `${done.length} von ${jobs.length} ${jobs.length === 1 ? 'Aufgabe' : 'Aufgaben'} abgeschlossen · ${plainDuration(time)} Arbeitszeit`,
  )

  return lines.join('\n')
}

const weekday = (day: string) => dateLabel(day, { weekday: 'long' })

/**
 * A personal summary of the 7 days up to `day`, across every project: how many steps Claude checked off,
 * in how many tasks, the time, the busiest day and the biggest tasks. Plain words, made to share.
 */
export function weekSummary(entries: readonly GlanceHistoryEntry[], day: string): string {
  const jobs = entries.filter(one => !one.isQuickAnswer)
  const heading = `Deine Woche mit Claude · ${shortDay(shiftDay(day, -(WEEK_DAYS - 1)))} bis ${shortDay(day)}`
  if (jobs.length === 0) {
    return `${heading}\n\nDiese Woche wurde keine geplante Arbeit erfasst. Gib Claude eine Aufgabe mit ein paar Schritten, dann erscheint sie hier.`
  }

  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
  const steps = jobs.reduce((sum, one) => sum + one.doneSteps.length, 0)
  const finished = jobs.filter(one => one.outcome === 'done').length
  const time = jobs.reduce((sum, one) => sum + (one.finishedAt === null ? 0 : one.finishedAt - one.startedAt), 0)
  const projects = new Set(jobs.map(one => one.project))
  const perDay = new Map<string, number>()
  for (const one of jobs) perDay.set(dayKey(one.startedAt), (perDay.get(dayKey(one.startedAt)) ?? 0) + 1)
  const [busiest, busiestCount] = [...perDay].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!
  const biggest = [...jobs].filter(one => one.doneSteps.length > 0).sort((a, b) => b.doneSteps.length - a.doneSteps.length).slice(0, 3)

  const lines = [
    heading,
    '',
    `Claude hat ${plural(steps, 'Schritt', 'Schritte')} in ${plural(jobs.length, 'Aufgabe', 'Aufgaben')} abgehakt und ${finished} davon abgeschlossen.`,
    // "15 Min." already ends on its own period.
    `Arbeitszeit: ${plainDuration(time)}${projects.size > 1 ? `, verteilt auf ${projects.size} Projekte` : ''}`.replace(/(?<!\.)$/, '.'),
  ]
  if (perDay.size > 1) lines.push(`Aktivster Tag: ${weekday(busiest)}, mit ${plural(busiestCount, 'Aufgabe', 'Aufgaben')}.`)
  if (biggest.length > 0) {
    lines.push('', 'Größte Aufgaben')
    for (const one of biggest) lines.push(`• ${one.title} (${plural(one.doneSteps.length, 'Schritt', 'Schritte')})`)
  }

  return lines.join('\n')
}
