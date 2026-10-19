import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, PluginOptions, RenderChildren, RenderElement, RenderSurface, Timer } from 'claude-code'

import type {
  GlanceFile,
  GlanceChecklist,
  GlanceHelper,
  GlanceHistoryEntry,
  GlanceHistoryView,
  GlancePhase,
  GlanceTask,
  GlanceUsage,
} from '../types'
import {
  HISTORY_PREFIX,
  WEEK_DAYS,
  clockTime,
  dayEntries,
  dayFromArgument,
  dayKey,
  entryFiles,
  entryFromChecklist,
  expiredHistoryKeys,
  filesNote,
  historyDay,
  historyKey,
  longDay,
  mergedEntries,
  projectName,
  shiftDay,
  weekSummary,
  paceFromHistory,
  plainDuration,
  sharedDayKeys,
  upsertEntry,
} from './history'
import { REMOVED, extractSecrets, findSecrets, gitignoreWithEnv, mapStrings, maskDeep, maskPrivate, mergeEnv, removeSecrets, replaceSecrets } from './privacy'
import type { Secret } from './privacy'
import {
  CHECKPOINT_PREFIX,
  FACTORY_SETTINGS,
  LEITSTAND_BEFEHLE,
  LEITSTAND_BEFEHL_NAMEN,
  MAX_DETAIL,
  MAX_NAME,
  PLUGIN,
  SETTINGS_PREFIX,
  chatSettings,
  defaultSettings,
  ownValues,
  staleSettingsKeys,
  QUESTION,
  RESUME_PREFIX,
  WAITING,
  activityOf,
  activityTarget,
  apiErrorSentence,
  applyProgress,
  progressName,
  befehlsHilfe,
  befehlsUeberblick,
  askedMergeSha,
  asksQuestion,
  carryTokens,
  cleanName,
  currentStepId,
  durationWords,
  formatCost,
  formatDuration,
  formatLeft,
  formatTokens,
  fragtNachHilfe,
  hasUnfinishedWork,
  headerDetails,
  isBusy,
  isContinueWords,
  isFinished,
  isGermanText,
  isLatinText,
  isMcpMergeAction,
  isStartWords,
  offersChoice,
  saysDo,
  jobCost,
  leftLabel,
  liftButtons,
  localTimes,
  needsText,
  noticeBody,
  otherChats,
  otherChatsWords,
  overallProgress,
  ownWords,
  prettyModel,
  projectPath,
  questionOf,
  reconcileBackground,
  reportOf,
  resetTime,
  sentenceCase,
  sizeOf,
  stampTimes,
  staleResumeKeys,
  stepEstimate,
  timeLeft,
  todosToTasks,
  tokenNote,
  tourNeeds,
  takeOut,
  wholePieces,
  widthOf,
  fit,
  settle,
  task,
  toggled,
  runsPowerShellMerge,
  runsPrMerge,
  unsafeMerge,
  unsafePowerShellMerge,
} from './logic'

import type { ChatSettings, SavedChecklist } from './logic'
import { kitOf } from './kit'
import { DYNAMIC_ALSO, DYNAMIC_SECTION, TIERS, isTierAgent, tierAgent, tierDescription, workerPrompt } from './dynamisch'
import type { WorkMode } from './dynamisch'
import { GLYPH } from './look'
import type { IconName } from './look'

export { activityOf, asksQuestion, carryTokens, cleanName, fit, formatCost, formatTokens, headerDetails, isButtonsOnly, isContinueWords, isGermanText, isLatinText, isStartWords, liftButtons, localTimes, ownWords, prettyModel, questionOf, resetTime, sentenceCase, takeOut, tokenNote, wholePieces } from './logic'
const PLAN_TOOL = `mcp__${PLUGIN}__plan_steps`
const PROGRESS_TOOL = `mcp__${PLUGIN}__report_progress`
const ALWAYS_ALLOWED = new Set([
  'ToolSearch',
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'AskUserQuestion',
  // The desktop app's own task list and next-step box: they draw, they do no work.
  'mcp__ccd_turn__update_plan',
  'mcp__ccd_turn__wrap_up',
  PLAN_TOOL,
  PROGRESS_TOOL,
])
// Up to 0.50 the settings sat under global keys (glanceEnabled, glanceDetail and so on), shared by every chat. Each chat
// now keeps its own (SETTINGS_PREFIX); the old keys stay in the store, unread.
const TOUR_KEY = 'glanceTour'
// When other chats' settings and checkpoints were last tidied away; it runs at most once a day.
const SETTINGS_TIDY_KEY = 'settingsTidiedAt'
const DAY_MS = 24 * 60 * 60_000
/** The approval row in the settings while in Gruppenarbeit, where every plan waits for approval. */
const APPROVE_ALWAYS = 'An (in der Gruppenarbeit immer)'
/** The welcome, three short cards the first time: what the checklist is, what Needs you means, where the rest lives. */
const TOUR_FIRST = 'Hier erscheint eine Checkliste, wenn du Claude um etwas mit mehreren Schritten bittest: jeder Schritt, wie weit er ist und wie lange es noch etwa dauert.'
const TOUR_LAST = 'Unten unter Einstellungen findest du alle Optionen. Der Verlauf zeigt deine früheren Aufträge und Deine Woche. Um diese Begrüßung noch mal zu sehen, schreib /leitstand tour.'
const TOUR = [TOUR_FIRST, tourNeeds('in Gelb'), TOUR_LAST]
/** Elsewhere than the terminal the words keep the text colour and the yellow is the bell beside them. */
const TOUR_LAST_VECTOR =
  'Oben rechts hinter dem Zahnrad findest du alle Optionen. Der Verlauf unten zeigt deine früheren Aufträge und Deine Woche. Um diese Begrüßung noch mal zu sehen, schreib /leitstand tour.'
const TOUR_VECTOR = [TOUR_FIRST, tourNeeds('neben einer gelben Glocke'), TOUR_LAST_VECTOR]
/** The settings button beside the view elsewhere than the terminal: a gear, drawn as an emoji (U+FE0F), as wide as the other sign buttons. */
const GEAR = '\u2699\uFE0F'
/** Grill mich elsewhere than the terminal: steam rising, as an emoji. */
const GRILL = '\u2668\uFE0F'
/** The skill buttons beside Grill mich elsewhere than the terminal, as emoji. */
const HUMANIZE = '\u{1F9CD}'
const ADHD = '\u{1F9E0}'
const NIGHTSHIFT = '\u{1F170}\uFE0F'
/** The opener for Filetree's side pane, after ADHD mode: a tree. */
const FILETREE = '\u{1F333}'
/** The clean-code skill, right behind Grill mich: a broom. */
const CLEAN_CODE = '\u{1F9F9}'
/** The reflect mod's command, right behind the broom: a mirror. */
const REFLECT = '\u{1FA9E}'
/** Masking on screen, on and off, and moving the chat's secrets into the .env: a lock, an open lock, a shield. */
const MASK_ON = '\u{1F512}'
const MASK_OFF = '\u{1F513}'
const VAULT = '\u{1F6E1}\uFE0F'
/** Remote Control, as a wireless sign: highlighted while connected. */
const REMOTE = '\u{1F6DC}'
/** The two work modes, as the person reads them. */
const WORK_MODE_WORDS: Record<WorkMode, string> = { auto: 'Auto-Modus', dynamisch: 'Gruppenarbeit' }
/** The work mode on its button: one person while Claude decides alone, two for the team. */
const WORK_MODE_SIGNS: Record<WorkMode, string> = { auto: '\u{1F464}', dynamisch: '\u{1F465}' }
const HANDOFF_KEY = 'lastHandoff'
// Below this width the mode button drops the name; below METER_MIN_COLUMNS the bars go, so step names keep their room.
const NARROW = 60
const METER_MIN_COLUMNS = 50
// Longer plans fold finished and later steps into one line each; the Plan panel has them all.
const COMPACT_AFTER = 5
const MAX_SUMMARY = 100
const METER = 10
const LABEL_WIDTH = 10
const TICK_MS = 250
// Calm mode redraws only to keep times current.
const CALM_TICK_MS = 5000
// With Autopilot on, nobody is there to press Start: a waiting plan starts by itself this long after it began to
// wait with Autopilot on.
const NIGHT_SHIFT_START_MS = 30_000
// A job shorter than this finishes without a sound.
const LONG_JOB_MS = 60_000
const COLLAPSE_MS = 5000
const RESEND_WINDOW_MS = 2 * 60 * 1000
// Beside a message from the phone (Remote Control) whose secrets the guard took out: Claude says so first, since the
// phone shows no toast and no prompt box.
const SECRET_REMOVED_NOTE =
  `Hinweis des Leitstands: Diese Nachricht kam per Remote Control. Der Passwortschutz hat darin, was wie ein Passwort oder Schlüssel aussah, durch „${REMOVED}“ ersetzt. ` +
  'Beginne deine Antwort mit genau diesem einen Satz: „Der Passwortschutz hat ein Passwort aus deiner Nachricht entfernt; ich habe es nicht gesehen.“'
const LIMIT_WARN = 80
const LIMIT_ALERT = 95
// Up to 0.24 every chat's checklist sat under this one key; now each has its own (RESUME_PREFIX).
const OLD_RESUME_KEY = 'glanceResume'
// The recent chats whose checklists are kept, so a resumed chat picks up where it was.
const RESUME_KEEP = 20
const LIMIT_LABEL: Record<string, string> = { five_hour: '5 Std.', seven_day: 'Woche', spend_limit: 'Ausgaben' }
// What a helper's effort and a job's outcome read as on screen; a count of one takes the singular.
const EFFORT_WORDS: Record<string, string> = { low: 'niedrig', medium: 'mittel', high: 'hoch', xhigh: 'sehr hoch', max: 'maximal' }
const effortWords = (effort: string) => `Aufwand ${EFFORT_WORDS[effort] ?? effort}`
const OUTCOME_WORDS: Record<GlanceHistoryEntry['outcome'], [string, string]> = {
  done: ['fertig', 'fertig'],
  stopped: ['gestoppt', 'gestoppt'],
  stuck: ['hängt fest', 'hängen fest'],
  waiting: ['wartet', 'warten'],
  background: ['im Hintergrund', 'im Hintergrund'],
  working: ['in Arbeit', 'in Arbeit'],
}
/** A day key as a German date: 2026-10-06 reads 06.10.2026. */
const germanDay = (day: string) => day.split('-').reverse().join('.')

const DENIED = 'Du hast einen Schritt abgelehnt, deshalb hat Claude pausiert'
const FAILING = 'Ein Schritt scheitert immer wieder, Claude versucht es anders'
const STALLED = 'Seit 3 Minuten nichts Neues. Drück Esc, um Claude zu stoppen, oder gib ihm noch etwas Zeit'
// No sign of life from Claude (a piece of its reply, a tool starting or ending) for this long while it works.
const STALL_MS = 3 * 60_000
const PERMISSION = 'Beantworte Claudes Anfrage im Chat'
// What a mark beside a state's own bold word says: the word follows, so a screen reader hears it once, not twice.
const STATUS = 'Status'
// What a mark beside a notice says: a usage limit, a full chat, a tidy-up, a panel with nothing in it yet. The words
// beside it say which; a panel's own name is its title's, read just before.
const NOTICE = 'Hinweis'
const APPROVE = 'Lies den Plan, dann drück Start oder sag Claude, was sich ändern soll'

const enabledAtom = atom({ plugin: 'leitstand', key: 'glanceEnabled' } as const, true)
const detailAtom = atom({ plugin: 'leitstand', key: 'detailLevel' } as const, 'simple')
const checklistAtom = atom({ plugin: 'leitstand', key: 'checklist' } as const, null)
const tickAtom = atom({ plugin: 'leitstand', key: 'tick' } as const, 0)
const NO_USAGE: GlanceUsage = { limits: [], limitPercent: null, limitLabel: null, limitResetsAt: null, contextPercent: null, costUsd: null }
const usageAtom = atom({ plugin: 'leitstand', key: 'usage' } as const, NO_USAGE)
const soundAtom = atom({ plugin: 'leitstand', key: 'soundMode' } as const, 'off')
const calmAtom = atom({ plugin: 'leitstand', key: 'isCalm' } as const, false)
const guardAtom = atom({ plugin: 'leitstand', key: 'isGuarded' } as const, true)
const maskAtom = atom({ plugin: 'leitstand', key: 'masksPrivate' } as const, true)
const approveAtom = atom({ plugin: 'leitstand', key: 'approvePlan' } as const, false)
const workModeAtom = atom({ plugin: 'leitstand', key: 'workMode' } as const, 'auto' as WorkMode)
const shipOnGithubAtom = atom({ plugin: 'leitstand', key: 'shipsOnGithub' } as const, false)
const hasGithubAtom = atom({ plugin: 'leitstand', key: 'hasGithub' } as const, false)
const armedAtom = atom({ plugin: 'leitstand', key: 'armedButton' } as const, null)
const noticeAtom = atom({ plugin: 'leitstand', key: 'isNoticing' } as const, false)
const tourAtom = atom({ plugin: 'leitstand', key: 'tourStep' } as const, null)
const checkpointAtom = atom({ plugin: 'leitstand', key: 'checkpointAt' } as const, null)
const recapAtom = atom({ plugin: 'leitstand', key: 'isRecapShown' } as const, false)
const othersAtom = atom({ plugin: 'leitstand', key: 'otherChats' } as const, [])
const showsOthersAtom = atom({ plugin: 'leitstand', key: 'showsOthers' } as const, true)
// shortcut: each read of the store parses its whole file, one per other chat; fine for 20 chats every 20 s, a single
// shared key would read once but brings back the race of two chats saving at once.
const OTHERS_EVERY_MS = 20_000
const historyAtom = atom({ plugin: 'leitstand', key: 'historyView' } as const, null)
const HISTORY_PANE = 'leitstand-history'
const PLAN_PANE = 'leitstand-plan'
const RECAP_PANE = 'leitstand-recap'
const SETTINGS_PANE = 'leitstand-settings'
const handoffAtom = atom({ plugin: 'leitstand', key: 'handoffState' } as const, 'idle')
// The main chat is being compacted: a message sent now waits in the queue until it is through.
const compactingAtom = atom({ plugin: 'leitstand', key: 'isCompacting' } as const, false)
// The plan Start was pressed for (waitingPlanOf's words) while its message is on its way; null otherwise. The band then
// reads Startet gleich… and a press sends nothing more; kept in state, so it outlasts a reload.
const startingAtom = atom({ plugin: 'leitstand', key: 'startingPlan' } as const, null)
// Remote Control's state per source: the app's own switch (ccd_session_mgmt) and /remote-control's description;
// `missing` while the session lacks that source.
type RemoteSide = 'on' | 'off' | 'missing'
type RemoteSides = { app: RemoteSide; command: RemoteSide }
const remoteAtom = atom({ plugin: 'leitstand', key: 'remoteControl' } as const, { app: 'missing', command: 'missing' } as RemoteSides)
// Whether the i-have-adhd skill's mode is on: it stays on until the person says "stop adhd mode" or "normal mode".
const adhdAtom = atom({ plugin: 'leitstand', key: 'adhdMode' } as const, false)
// When 🅰️ was last pressed to end a running Autopilot, for Autopilot to read as a round ends (see toggleNightShift).
const autopilotStopAtom = atom({ plugin: 'leitstand', key: 'autopilotStop' } as const, null)
// This chat's own settings, as the person changed them in it; see keepForChat.
const ownSettingsAtom = atom({ plugin: 'leitstand', key: 'ownSettings' } as const, { sid: null, carry: false, values: {} } as {
  sid: string | null
  carry: boolean
  values: Partial<ChatSettings>
})
const HANDOFF_CONFIRM_MS = 8000
// What the Continue button sends, as the person's own words; turn.start knows it and keeps the job going.
const CONTINUE_TEXT = 'Mach bitte da weiter, wo du aufgehört hast.'
// What the Start button sends when the person approves the plan.
const START_TEXT = 'Der Plan sieht gut aus. Leg bitte los.'
/** The band's state while the main chat is compacted. */
const COMPACTING = 'Räumt auf…'
const HANDOFF_PROMPT = `Schreib eine Übergabenotiz, damit ein ganz neuer Chat diese Arbeit ohne dieses Gespräch fortsetzen kann.
Nenne kurz: das Ziel; was schon erledigt ist; was noch offen ist, der Reihe nach; getroffene Entscheidungen und warum; die
Dateien, Befehle oder Links, auf die es ankommt; und den allernächsten Schritt. Auf Deutsch, unter 300 Wörtern, ohne Einleitung.
Beginne genau mit: "Fortsetzung aus einem früheren Chat. So ist der Stand:"`

// What Ship it sends, as the person's own words: the close-out a finished job needs on GitHub, so the chat archives.
const SHIP_PROMPT = `Die Arbeit ist fertig. Liefere sie auf GitHub aus, der Reihe nach, und hör beim ersten Schritt auf, der scheitert:
1. Führ \`git status\` und \`gh auth status\` aus. Ist das kein GitHub-Repo oder ist gh nicht angemeldet, hör auf und sag mir, was ich tun soll.
   Hat der Branch gegenüber seinem Basis-Branch keine Änderungen, committet oder nicht, und keinen offenen Pull Request, sag, dass es
   nichts auszuliefern gibt, und hör auf.
2. Räum kurz alles auf, was dieser Branch gegenüber seinem Basis-Branch ändert, committet oder nicht. Nutze einen installierten
   Review-Skill (ponytail-review oder simplify), falls es einen gibt; sonst such selbst nach totem Code, unnötigen Kommentaren,
   bloßen Durchreich-Wrappern und Formulierungen, die nach KI klingen. Behebe nur klare Fälle und führ dann die Tests des Projekts aus, falls es welche hat.
3. Committe mit einem Titel nach Conventional Commits, type(scope): subject. Bist du auf dem Basis-Branch, leg zuerst einen neuen Branch an.
   Pushe den Branch, nie den Basis-Branch.
4. Öffne mit gh pr create einen Pull Request, der bereit zur Prüfung ist (kein Entwurf), oder nutze den offenen des Branches.
   Inhalt: ## Warum, ## Was sich geändert hat, ## Prüfung, in unter einer Minute lesbar.
5. Warte mit gh pr checks --watch. Schlägt ein Check fehl oder hat der Merge Konflikte, merge nicht: Zeig, was fehlgeschlagen ist, und hör auf.
6. Bestandene Checks oder gar keine Checks sind keine Erlaubnis zum Mergen. Lies den Head-Commit mit gh pr view --json headRefOid,
   dann beende deine Antwort: Zeig den Link zum Pull Request, die Checks und die volle Head-SHA, danach genau diese zwei Zeilen,
   die erste wörtlich so, nur mit der vollen SHA statt <volle SHA>:
   Antworte genau: Merge freigeben <volle SHA>
   Alles andere lässt den Pull Request offen.
7. Erst wenn ich genau "Merge freigeben <diese SHA>" antworte, lies den Head-Commit noch einmal. Hat er sich geändert, frag noch einmal.
   Stimmt er überein, führ gh pr merge --squash --delete-branch --match-head-commit <volle SHA> als eigenen Befehl aus, ohne
   etwas davor oder danach zu verketten. Jede andere Antwort: Lass den Pull Request offen.
   Merge nie mit --admin oder --auto und umgeh den Branch-Schutz auch sonst nicht; ist der Merge blockiert, sag warum und hör auf.
8. Schließ mit dem Link zum Pull Request und einer Zeile zum Ergebnis.`

const CHECKPOINT_PROMPT = `Dieser Chat wird gleich verdichtet, um Platz zu schaffen. Schreib einen Sicherungspunkt, damit die Arbeit weitergeht,
ohne dass etwas Wichtiges verloren geht. Nenne kurz: das Ziel; was schon erledigt ist; was noch offen ist, der Reihe nach;
getroffene Entscheidungen und warum; was die Person verlangt oder ausgeschlossen hat; die Dateien, Befehle oder Links, auf die
es ankommt; offene Fragen; und den allernächsten Schritt. Auf Deutsch, unter 300 Wörtern, ohne Einleitung. Beginne genau mit: "Sicherungspunkt:"`

const PROMPT_SECTION = `# Leitstand (Fortschritts-Checkliste)
Die Person verfolgt deine Arbeit auf einer Checkliste über dem Eingabefeld, in einfachem Deutsch.
- Eine Frage, die du sofort und ohne Tools beantworten kannst, braucht keinen Plan: Antworte einfach.
- Bevor du irgendein anderes Tool nutzt, ruf plan_steps (Tool ${PLAN_TOOL}) mit 2 bis 8 Schritten in Reihenfolge auf. Ist es deferred, lade es zuerst mit ToolSearch. Hat diese Sitzung TodoWrite oder TaskCreate, darfst du stattdessen diese To-do-Liste als Plan nutzen.
- Gib jedem Schritt in der sizes-Liste von plan_steps eine Größe, in derselben Reihenfolge: S (ein paar Minuten), M oder L (die größten Arbeitsstücke).
- Ist eine Rückfrage-Runde abgeschlossen (etwa die Fragen von grill-me), ruf plan_steps mit dem vereinbarten Plan auf, bevor du fragst, ob du loslegen sollst. Die Person gibt dann mit Start frei oder indem sie es sagt, etwa "leg los". Das gilt im Auto-Mode und in der Gruppenarbeit.
- Ruf dann report_progress (Tool ${PROGRESS_TOOL}) auf, sobald es echten Fortschritt gibt, und mit percent 100, sobald ein Schritt fertig ist. Gib bei percent 100 eine summary mit: einen kurzen Satz in einfachem Deutsch darüber, was der Schritt erledigt hat, etwa "Hat eine Preistabelle mit drei Tarifen gebaut".
- Schreib jeden Schrittnamen auf Deutsch, so dass ihn auch Nicht-Techniker verstehen, unter 40 Zeichen und mit einem Verb am Anfang, etwa "Baue die Preistabelle".
- Schreib nie Dateipfade, Dateinamen, Befehle, Code oder Tool-Namen in einen Schrittnamen.`

const SPINNER = ['◐', '◓', '◑', '◒']
const HELPERS_PER_STEP = 3

// The tools that write files, and the field each names the file in.
const FILE_TOOLS: Record<string, 'file_path' | 'notebook_path'> = { Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' }

type $ = EngineInterface

// Module state: a reload starts these over (session.start restarts the ticker).
let ticker: Timer | undefined
let collapse: Timer | undefined
let saveTimer: Timer | undefined
// The save under way, so the chat's end waits for it rather than have it land after.
let saving: Promise<void> = Promise.resolve()
let othersTimer: Timer | undefined
// Set when the chat ends: anything still saved after that (a late job name, say) keeps it marked closed.
let hasEnded = false
let isRefreshing = false
let failuresInARow = 0
// A message held back for a password: memory only, never stored, and only to let the same one through on a resend.
let heldMessage: { text: string; at: number } | null = null
// The text of the last answer to /leitstand, until its stored row has passed session.append.
let lastOwnAnswer: string | null = null
// The secrets the shield just moved into the .env, until its tidy-up is over: a compaction of the main chat in that time
// has their values replaced in what it leaves. Memory only; it lapses at `until` should the run never end.
let pendingVault: { secrets: readonly Secret[]; until: number } | null = null
const VAULT_LAPSE_MS = 10 * 60_000
let limitLevel = 0
// The press that armed the button now waiting: a timer left from an earlier press must not disarm a later one.
let armedPress = 0
// Ship it in this chat: the head commit Claude last asked to merge, and the one the person then said yes to.
let isShipping = false
let askedSha: string | null = null
let approvedSha: string | null = null
// Ship it's own prompt is still to start its turn; a merge Ship it allowed failed, so the next try needs a fresh yes;
// the running turn answers a merge request with anything but the exact approval, so Ship it ends with it.
let isShipTurnNext = false
let hasFailedMerge = false
let isDeclining = false

/** Ship it is over in this chat: its merge guard no longer applies. */
const endShipping = () => {
  isShipping = false
  askedSha = null
  approvedSha = null
  isShipTurnNext = false
  hasFailedMerge = false
  isDeclining = false
}

/** After a merge Ship it allowed: a merge that worked ends Ship it; a failed one keeps it guarded. */
const noteMerge = (ran: { deny?: string; isError?: boolean }) => {
  if (ran.deny === undefined && !ran.isError) endShipping()
  else hasFailedMerge = true
}
// The main loop's running turn, for the Pause button; and whether a pause asked for its end.
let runningTurn: string | undefined
let isPausing = false
// The person started the running turn with a go-ahead ("Ja, leg los"): a plan Claude makes in it does not wait.
// It approves one plan, the waiting one or the first one made, and is then used up.
let isApprovingTurn = false
// Claude's last answer in the main chat asked the person something or offered a choice: a request in reply approves
// the plan Claude then makes.
let hasAskedLast = false
// A main turn.complete since this module loaded set hasAskedLast; until then it is read back from the transcript.
let knowsLastAnswer = false
// Claude asked the person something in this main turn in the app's box under the answer (wrap_up's `ask`).
let hasAskedInBox = false
// Mirrors the calm setting for the ticker, which runs outside any hook.
let isCalmMode = false
/** The computer this runs on, asked when the session starts; null until known, and Claude Code plays the sounds itself. */
let platform: 'mac' | 'windows' | 'linux' | null = null
let tickerEvery = 0
// Signs of life: set as Claude's reply streams or a tool starts or ends, stamped by the ticker, which runs while Claude works.
let hasSign = false
let lastSignAt = 0
let isStalled = false
// Autopilot's own Start: the waiting plan it counts down for and since when, the timer that starts it, and the plan
// already started (by it or by Start), so a plan laid out again starts once. A reload counts down afresh.
let nightStart: { plan: string; since: number } | null = null
let nightTimer: Timer | undefined
let nightStartedPlan: string | null = null
// The settings a new chat starts with, from the config menu (register sets them); and the settings work under way,
// so the next waits for it.
let defaults: ChatSettings = FACTORY_SETTINGS
let settingsWrite: Promise<void> = Promise.resolve()

const now = ($: $) => $.clock.now()

const syncTicker = ($: $, list: GlanceChecklist | null) => {
  const isAnimated = list !== null && (list.phase === 'working' || list.phase === 'needsYou' || list.phase === 'background')
  // Calm mode: nothing moves, so the clock only ticks to keep the times current. Nor does anything move while a plan
  // waits for Start, a helper at work or not; a band drawn afresh four times a second there could lose a click on Start
  // to the new drawing, and the person had to press twice.
  const isWaitingForStart = list !== null && list.approval === 'waiting'
  const every = isCalmMode || isWaitingForStart ? CALM_TICK_MS : TICK_MS
  if (ticker !== undefined && (!isAnimated || tickerEvery !== every)) {
    ticker.cancel()
    ticker = undefined
  }
  if (isAnimated && ticker === undefined) {
    tickerEvery = every
    ticker = $.clock.every(every, () => {
      void update($, tickAtom, tick => (tick ?? 0) + 1)
      void checkStall($)
      void checkNightStart($)
    })
  }
}

/** Claude showed a sign of life; a job that looked stalled is working again. */
const noteSign = ($: $) => {
  hasSign = true
  if (isStalled) {
    isStalled = false
    void setWorking($)
  }
}

/**
 * After a reload: whether Claude's last main answer in the transcript asked the person something, in its text or in
 * wrap_up's box. `said` is the person's new message, skipped when the transcript already holds it. False on any error.
 */
const askedInTranscript = async ($: $, said: string): Promise<boolean> => {
  try {
    const messages = [...(await $.session.messages())]
    // The person's own messages; a user message that only carries tool results is none.
    const isPerson = (one: (typeof messages)[number]) => one.role === 'user' && !(one.toolResults?.length)
    const last = messages.at(-1)
    if (last !== undefined && isPerson(last) && last.text.trim() === said.trim()) messages.pop()
    const answer = messages.findLast(one => one.role === 'assistant' && one.text.trim() !== '')
    let isAsked = offersChoice(answer?.text ?? '')
    const since = messages.findLastIndex(isPerson)
    for (const one of messages.slice(since + 1)) {
      if (one.role !== 'assistant') continue
      for (const use of one.toolUses) {
        const ask = use.input?.ask
        if (use.tool.endsWith('wrap_up') && typeof ask === 'string' && ask.trim() !== '') isAsked = true
      }
    }
    return isAsked
  } catch {
    return false
  }
}

/** On each tick: a running turn with no sign of life for 3 minutes may be stuck. */
const checkStall = async ($: $) => {
  const at = await now($)
  if (hasSign || runningTurn === undefined) {
    hasSign = false
    lastSignAt = at
    return
  }
  if (isStalled || at - lastSignAt < STALL_MS || !(await read($, enabledAtom))) return
  if ((await read($, checklistAtom))?.phase !== 'working') return
  isStalled = true
  await setStuck($, STALLED)
}

const ALERTS: Partial<Record<GlancePhase, { asset: string; words: string }>> = {
  needsYou: { asset: 'sounds/needs-you.wav', words: 'Claude braucht dich' },
  stuck: { asset: 'sounds/stuck.wav', words: 'Claude hängt fest' },
  done: { asset: 'sounds/done.wav', words: 'Fertig' },
}

const findPlatform = async ($: $) => {
  if ((await $.env.get('OS')) === 'Windows_NT') return 'windows' as const
  const { stdout } = await $.process.run(['uname', '-s']).catch(() => ({ stdout: '' }))
  const name = stdout.trim()

  return name === 'Darwin' ? ('mac' as const) : name ? ('linux' as const) : null
}

/** Runs the first of these commands that this computer has; rejects when it has none. */
const runFirst = async ($: $, commands: readonly (readonly string[])[]) => {
  for (const argv of commands) {
    try {
      const { exitCode } = await $.process.run(argv)
      if (exitCode === 0) return
    } catch {
      // Not installed here: try the next one.
    }
  }
  throw new Error('No sound player on this computer')
}

/** Plays one of Leitstand's sounds: Claude Code's own player on a Mac, the computer's own player on Windows and Linux. */
const playSound = async ($: $, asset: string) => {
  if (platform === 'windows') {
    const file = `${$.plugin.root}\\${asset.replaceAll('/', '\\')}`.replaceAll("'", "''")
    return runFirst($, [['powershell', '-NoProfile', '-Command', `(New-Object Media.SoundPlayer '${file}').PlaySync()`]])
  }
  if (platform !== 'linux') return $.audio.play({ asset })
  const file = `${$.plugin.root}/${asset}`
  return runFirst($, [['paplay', file], ['pw-play', file], ['aplay', '-q', file]])
}

/** Says a few words: the platform's own voice, or on Windows and Linux the speech tools they come with. */
const sayWords = async ($: $, words: string) => {
  try {
    await $.audio.speak(words)
  } catch (error) {
    if (platform !== 'windows' && platform !== 'linux') throw error
    const quoted = words.replaceAll("'", "''")
    await runFirst(
      $,
      platform === 'windows'
        ? [['powershell', '-NoProfile', '-Command', `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${quoted}')`]]
        : [['spd-say', '-w', words], ['espeak-ng', words], ['espeak', words]],
    )
  }
}

/** Windows' own toast, shown as Windows PowerShell's; the text comes in through the environment, never as script. */
const WINDOWS_TOAST = [
  '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
  '$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)',
  "$text = $xml.GetElementsByTagName('text')",
  '$text.Item(0).AppendChild($xml.CreateTextNode($env:LEITSTAND_TITLE)) | Out-Null',
  '$text.Item(1).AppendChild($xml.CreateTextNode($env:LEITSTAND_BODY)) | Out-Null',
  "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($xml))",
].join('; ')

/** A desktop notice through the computer's own notifications: Windows, macOS or Linux. The text goes in as arguments or variables, never as script. */
const showNotice = async ($: $, title: string, body: string) => {
  if (platform === 'windows') {
    await $.process
      .run(['powershell', '-NoProfile', '-Command', WINDOWS_TOAST], { env: { LEITSTAND_TITLE: title, LEITSTAND_BODY: body } })
      .catch(() => undefined)
    return
  }
  const script = ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run']
  try {
    await $.process.run(['osascript', ...script, title, body])
  } catch {
    // No osascript: not a Mac. notify-send is Linux's; elsewhere the band still shows it.
    await $.process.run(['notify-send', '--app-name=Claude Code', title, body]).catch(() => undefined)
  }
}

/** A desktop notice when Claude needs you, gets stuck or finishes a long job, as for the sounds. */
const noticeFor = async ($: $, list: GlanceChecklist) => {
  const alert = ALERTS[list.phase]
  if (!alert || !(await read($, noticeAtom)) || !(await read($, enabledAtom))) return
  if (list.phase === 'done' && (isBusy(list) || (list.finishedAt ?? (await now($))) - list.startedAt < LONG_JOB_MS)) return
  await showNotice($, alert.words, noticeBody(list))
}

/** A short sound (and, in voice mode, a few words) when Claude needs you, gets stuck or finishes a long job. */
const alertFor = async ($: $, list: GlanceChecklist) => {
  const alert = ALERTS[list.phase]
  const mode = await read($, soundAtom)
  if (!alert || mode === 'off' || !(await read($, enabledAtom))) return
  // A quick answer needs no sound, and a job whose helpers still run is not finished yet.
  if (list.phase === 'done' && (isBusy(list) || (list.finishedAt ?? (await now($))) - list.startedAt < LONG_JOB_MS)) return
  try {
    await playSound($, alert.asset)
    if (mode === 'voice') await sayWords($, alert.words)
  } catch {
    // No player or voice on this computer: the band still shows it.
  }
}

/** Keeps this chat's checklist, a second after it changes, for when the chat is resumed. */
const saveSoon = ($: $) => {
  if (saveTimer !== undefined) return
  saveTimer = $.clock.after(1000, () => {
    saveTimer = undefined
    saving = saveChecklist($).catch(() => undefined)
  })
}

/** Saves this chat's checklist under its own key; `isOpen` false once the chat has ended, so the others stop naming it. */
const saveChecklist = async ($: $, isOpen = !hasEnded, id?: string) => {
  const key = `${RESUME_PREFIX}${id ?? (await $.session.id())}`
  const list = await read($, checklistAtom)
  if (list === null) await $.store.delete(key)
  else await $.store.set(key, { at: await now($), list, isOpen } satisfies SavedChecklist)
}

/** Reads what the other chats saved and keeps those worth a word; writes only on a change, so the band redraws then. */
const refreshOthers = async ($: $) => {
  // One read at a time: a slow one that finished after a newer one would bring back what has changed since.
  if (isRefreshing) return
  isRefreshing = true
  try {
    // Off says nothing, and turning back on starts from a fresh read rather than an old list.
    if (!(await read($, enabledAtom)) || !(await read($, showsOthersAtom))) {
      await update($, othersAtom, () => [])
      return
    }
    const mine = `${RESUME_PREFIX}${await $.session.id()}`
    const saved: (SavedChecklist | undefined)[] = []
    for (const key of await $.store.keys()) {
      if (key.startsWith(RESUME_PREFIX) && key !== mine) saved.push((await $.store.get(key)) as SavedChecklist | undefined)
    }
    const others = otherChats(saved, await now($))
    if (JSON.stringify(await read($, othersAtom)) !== JSON.stringify(others)) await update($, othersAtom, () => others)
  } catch {
    // A store that can't be read says nothing, rather than keep naming chats that may have moved on.
    await update($, othersAtom, () => [])
  } finally {
    isRefreshing = false
  }
}

/**
 * Moves the one shared key of older versions to a key per chat, then keeps only the most recent chats, never this one.
 * Moved checklists aren't marked open: those chats are named again only once they save, so a closed one never is.
 */
const tidySavedChecklists = async ($: $) => {
  const mine = `${RESUME_PREFIX}${await $.session.id()}`
  const old = await $.store.get(OLD_RESUME_KEY)
  if (old !== undefined) {
    for (const [id, saved] of Object.entries((old ?? {}) as Record<string, SavedChecklist>)) {
      // shortcut: the store has no write-if-unchanged, so a chat that saves between this check and the set loses that
      // save until its next one; checking right before the set keeps that window as small as it can be.
      if ((await $.store.get(`${RESUME_PREFIX}${id}`)) === undefined) await $.store.set(`${RESUME_PREFIX}${id}`, saved)
    }
    await $.store.delete(OLD_RESUME_KEY)
  }
  const saved: [string, number][] = []
  for (const key of (await $.store.keys()).filter(one => one.startsWith(RESUME_PREFIX) && one !== mine)) {
    saved.push([key, ((await $.store.get(key)) as SavedChecklist | undefined)?.at ?? 0])
  }
  const stale = new Set(staleResumeKeys(saved, RESUME_KEEP - 1))
  for (const [key, at] of saved) {
    // A chat that saved since it was read is in use again: it stays.
    if (stale.has(key) && (at === 0 || ((await $.store.get(key)) as SavedChecklist | undefined)?.at === at)) await $.store.delete(key)
  }
}

/** The reasons the English GlanceFlow saved, and the German ones they now read as. */
const LEGACY_REASONS: Record<string, string> = {
  'Reply to Claude in the box below': WAITING,
  'Read the plan, then press Start or tell Claude what to change': APPROVE,
}

/** A resumed chat gets its checklist back; work that was under way shows as paused, with Continue. */
const restoreChecklist = async ($: $) => {
  const id = await $.session.id().catch(() => null)
  const saved = id === null ? undefined : ((await $.store.get(`${RESUME_PREFIX}${id}`)) as SavedChecklist | undefined)
  if (saved === undefined || isFinished(saved.list)) return
  // A checklist the English GlanceFlow saved still names its reason in English: read it as the German one.
  const legacy = saved.list.needsYouReason ?? null
  const list = legacy !== null && LEGACY_REASONS[legacy] ? { ...saved.list, needsYouReason: LEGACY_REASONS[legacy] } : saved.list
  // Still true after a restart: a plan waiting for Start, or Claude waiting for a reply. Anything else was cut off.
  const holds = list.phase === 'stopped' || (list.phase === 'needsYou' && (list.needsYouReason === APPROVE || list.needsYouReason === WAITING))
  const restored: GlanceChecklist = {
    ...list,
    activity: null,
    isCollapsed: false,
    helpers: list.helpers.filter(one => one.status !== 'running'),
    ...(holds ? {} : { phase: 'stopped' as const, stopKind: 'pause' as const, needsYouReason: null, stuckReason: null, finishedAt: saved.at }),
  }
  await update($, checklistAtom, () => restored)
  syncTicker($, restored)
  // Saved again as open, so the other chats see it as it is now.
  saveSoon($)
}

const change = async ($: $, fn: (list: GlanceChecklist) => GlanceChecklist | null) => {
  const at = await now($)
  const before: { phase: GlancePhase | null } = { phase: null }
  const next = await update($, checklistAtom, list => {
    before.phase = list?.phase ?? null
    const changed = list ? fn(list) : list
    return changed ? { ...changed, tasks: stampTimes(changed.tasks, at) } : changed
  })
  syncTicker($, next)
  saveSoon($)
  if (next !== null && next.phase !== before.phase) {
    void alertFor($, next)
    void noticeFor($, next)
  }

  return next
}

/** Every chat's jobs on these days (all kept days when none are named), each once, oldest first. */
const readHistory = async ($: $, days?: readonly string[]): Promise<GlanceHistoryEntry[]> => {
  const stored: unknown[] = []
  for (const key of await $.store.keys()) {
    if (key.startsWith(HISTORY_PREFIX) && (days === undefined || days.includes(historyDay(key)))) stored.push(await $.store.get(key))
  }

  return mergedEntries(stored)
}

/** This project's pace from the History of the last 30 days; null when it isn't known yet. */
const learnPace = async ($: $): Promise<number | null> => {
  try {
    return paceFromHistory(await readHistory($), await $.session.cwd())
  } catch {
    return null
  }
}

const startJob = async ($: $, text: string, jobId: string) => {
  const previous = await read($, checklistAtom)
  const list: GlanceChecklist = {
    // Until Haiku names it in English, a request in another language shows a neutral title.
    title: isLatinText(text.split('\n')[0] ?? '') ? cleanName(text.split('\n')[0]) : 'Arbeitet an deiner Anfrage',
    phase: 'working',
    tasks: stampTimes([task('Verstehe deine Anfrage', 'active'), task('Plane die Schritte', 'upcoming')], await now($)),
    needsYouReason: null,
    stuckReason: null,
    startedAt: await now($),
    finishedAt: null,
    isCollapsed: false,
    hasPlan: false,
    jobId,
    planAt: null,
    plannedCount: 0,
    extraTokens: 0,
    extraCachedTokens: 0,
    stopKind: null,
    activity: null,
    approval: 'none',
    costAtStart: (await read($, usageAtom)).costUsd,
    paceMs: await learnPace($),
    // Work still running from the last job stays in view.
    helpers: (previous?.helpers ?? []).filter(one => one.status === 'running'),
  }
  failuresInARow = 0
  collapse?.cancel()
  await update($, checklistAtom, () => list)
  syncTicker($, list)
  saveSoon($)
  // Name the job in the background; a newer job wins.
  $.clock.after(0, () => void nameJob($, text, jobId))
}

const nameJob = async ($: $, text: string, jobId: string) => {
  try {
    const answer = await $.model.complete({
      model: 'haiku',
      effort: 'low',
      timeoutMs: 15000,
      prompt:
        'Benenne diese Anfrage mit 2 bis 6 einfachen deutschen Wörtern, die mit einem Verb beginnen, ' +
        'etwa "Baue meine Landingpage", in normaler deutscher Rechtschreibung: Substantive und Namen groß, sonst klein. ' +
        'Immer auf Deutsch, auch wenn die Anfrage in einer anderen Sprache ist. ' +
        'Keine Dateinamen, kein Code, keine Anführungszeichen, keine Satzzeichen. ' +
        `Antworte nur mit dem Namen.\n\nAnfrage:\n${text.slice(0, 2000)}`,
    })
    if (!answer.isAnswered) {
      return
    }
    const title = sentenceCase(cleanName((answer.text.split('\n')[0] ?? '').replace(/["'.]/g, '')))
    await change($, list => (list.jobId === jobId ? { ...list, title } : list))
  } catch {
    // The placeholder title stays.
  }
}

// A plan waiting for Start stays on Needs you while Claude finishes laying it out.
const setWorking = ($: $) =>
  change($, list =>
    list.approval !== 'waiting' && (list.phase === 'needsYou' || list.phase === 'stuck')
      ? { ...list, phase: 'working', needsYouReason: null, question: null, stuckReason: null }
      : list,
  )

const setNeedsYou = ($: $, reason: string) =>
  change($, list =>
    list.phase === 'done' || list.phase === 'stopped' ? list : { ...list, phase: 'needsYou', needsYouReason: reason, question: null },
  )

/** Claude wrote or edited a file: the current step keeps it, created or changed, once. */
const noteFile = async ($: $, path: string, isNew: boolean) => {
  const file: GlanceFile = { path: projectPath(path, await $.session.cwd().catch(() => '')), isNew }
  await change($, list => {
    const stepId = currentStepId(list)
    return {
      ...list,
      tasks: list.tasks.map(one =>
        one.id !== stepId || (one.files ?? []).some(known => known.path === file.path) ? one : { ...one, files: [...(one.files ?? []), file] },
      ),
    }
  })
}

const setStuck = ($: $, reason: string) =>
  change($, list => ({ ...list, phase: 'stuck', stuckReason: reason, needsYouReason: null }))

/** Stops Claude's running turn; Continue picks it up again. True when it paused. */
const pauseJob = async ($: $) => {
  if (runningTurn === undefined) {
    $.ui.toast('Gerade läuft nichts.')
    return false
  }
  isPausing = true
  try {
    await $.turn.abort({ turnId: runningTurn })
    $.ui.toast('Pausiert. Drück Weiter, um dort weiterzumachen, wo Claude aufgehört hat.')
    return true
  } catch {
    isPausing = false
    $.ui.toast("Pausieren geht gerade nicht. Drück stattdessen Esc, um zu stoppen.")
    return false
  }
}

/** True while the main chat is compacted: a press (from a stale band) sends nothing then and says so. */
const isCompactingNow = async ($: $) => {
  if (!(await read($, compactingAtom))) return false
  $.ui.toast('Der Chat wird gerade aufgeräumt. Drück gleich noch mal.')
  return true
}

/** Sends words as the person's own message; true when sent, otherwise (failed or dropped) onFail says what to do instead. */
const sendAsUser = async ($: $, text: string, onFail: () => unknown) => {
  try {
    const result = await $.prompt.submit({ text, asUser: true })
    if (result.drop === undefined) return true
    await onFail()
    return false
  } catch {
    await onFail()
    return false
  }
}

/** Sends "continue" for the person: the same job goes on, nothing to type. */
const continueJob = async ($: $) => {
  if (await isCompactingNow($)) return false
  return sendAsUser($, CONTINUE_TEXT, () => $.ui.toast("Weitermachen geht gerade nicht. Schreib: weiter"))
}

/** Loads one day of this project's history into the pane, and opens the pane when asked. */
const showHistory = async ($: $, day: string, isOpening: boolean) => {
  const project = await $.session.cwd()
  // Entries saved before the report fields existed get empty ones.
  const filled = (one: GlanceHistoryEntry) => ({ ...one, doneSteps: one.doneSteps ?? [], openSteps: one.openSteps ?? [], isQuickAnswer: one.isQuickAnswer ?? false })
  const entries = (await readHistory($, [day]))
    .filter(one => one.project === project)
    .map(filled)
  const today = dayKey(await now($))
  const saved = (await $.store.keys()).filter(key => key.startsWith(HISTORY_PREFIX)).map(historyDay)
  const days = [...new Set([today, day, ...saved])].sort().reverse()
  const myWeek = await readHistory($, Array.from({ length: WEEK_DAYS }, (_, back) => shiftDay(day, -back)))
  await update($, historyAtom, (view): GlanceHistoryView => ({
    day,
    project,
    entries,
    days,
    isReportShown: false,
    reportSpan: view?.reportSpan === 'week' ? 'week' : 'day',
    weekEntries: myWeek.filter(one => one.project === project).map(filled),
    myWeekEntries: myWeek.map(filled),
  }))

  return isOpening ? $.ui.open({ id: HISTORY_PANE, title: `Verlauf · ${projectName(project)}`, closeOnEscape: true }) : null
}

/** Opens the whole plan in a side panel: every step, what each got done, its time and helpers. */
const showPlan = ($: $) => $.ui.open({ id: PLAN_PANE, title: 'Plan', closeOnEscape: true })

/** Where we left off: the checkpoint Claude saved before the chat was tidied up, in a side panel. */
const showRecap = async ($: $) => {
  await update($, recapAtom, () => false)
  return $.ui.open({ id: RECAP_PANE, title: 'Letzter Stand', closeOnEscape: true })
}

/** Shows the team report for the day or the week, or your own week across projects, and copies it. */
const showReportSpan = async ($: $, span: GlanceHistoryView['reportSpan'], surface?: RenderSurface) => {
  await update($, historyAtom, view => (view ? { ...view, reportSpan: span } : view))
  const view = await read($, historyAtom)
  if (view !== null) await showReport($, true, reportOf(view), surface)
}

const showReport = async ($: $, isShown: boolean, text: string, surface?: RenderSurface) => {
  await update($, historyAtom, view => (view ? { ...view, isReportShown: isShown } : view))
  if (!isShown) return
  const copied = await $.ui.copy({ text, surface })
  const isMine = (await read($, historyAtom))?.reportSpan === 'mine'
  $.ui.toast(
    !copied.isCopied
      ? 'Der Bericht steht in der Seitenleiste: Markier ihn dort, um ihn zu kopieren.'
      : isMine
        ? 'Deine Woche ist kopiert: Füg sie ein, wo du willst.'
        : 'Teambericht kopiert: Füg ihn in Slack, Teams oder eine E-Mail ein.',
  )
}

/** First press arms a button that ends or sends something; a second press within 8 seconds runs it. One waits at a time. */
const pressTwice = async ($: $, key: 'handoff' | 'ship' | 'vault', run: () => Promise<unknown>) => {
  if ((await read($, armedAtom)) === key) {
    await update($, armedAtom, () => null)
    await run()
    return
  }
  const press = ++armedPress
  await update($, armedAtom, () => key)
  $.clock.after(HANDOFF_CONFIRM_MS, () => {
    if (press === armedPress) void update($, armedAtom, () => null)
  })
}

/** Fresh chat asks for a second press; while the handoff note is being written, presses wait. */
const pressHandoff = async ($: $) => {
  if ((await read($, handoffAtom)) === 'working') return
  await pressTwice($, 'handoff', () => startFreshChat($))
}

/** Writes a handoff note over this chat, clears it, and sends the note as the fresh chat's first message. */
const startFreshChat = async ($: $) => {
  await update($, handoffAtom, () => 'working')
  try {
    $.ui.toast('Schreibe die Übergabenotiz für den neuen Chat…')
    const reply = await $.model.fork({ prompt: HANDOFF_PROMPT })
    if (!reply.isAnswered || !reply.text.trim()) {
      $.ui.toast(`Die Übergabenotiz ließ sich nicht schreiben${reply.isAnswered ? '' : ` (${reply.reason})`}. Es wurde nichts geleert.`)
      return
    }
    const note = reply.text.trim()
    // Kept in case anything below fails: /leitstand handoff note puts it back in the prompt box.
    await $.store.set(HANDOFF_KEY, { at: await now($), note })
    try {
      await $.command.run({ command: 'clear', args: '' })
    } catch {
      $.ui.toast("Der Chat ließ sich nicht leeren. Schreib /leitstand handoff note, um die Übergabenotiz zu holen.")
      return
    }
    const isSent = await sendAsUser($, note, async () => {
      await $.prompt.fill({ text: note })
      $.ui.toast('Chat geleert. Die Übergabenotiz steht im Eingabefeld: Drück Enter, um sie zu senden.')
    })
    if (isSent) $.ui.toast('Neuer Chat mit Übergabenotiz gestartet.')
  } finally {
    await update($, handoffAtom, () => 'idle')
  }
}

/** Saves the job to the day's history (this computer only) and refreshes an open history pane. */
const recordJob = async ($: $) => {
  try {
    const list = await read($, checklistAtom)
    if (list === null) return
    const project = await $.session.cwd()
    const day = dayKey(list.startedAt)
    // This chat's own key only: the store locks one set at a time, so a shared key could lose another chat's job.
    const key = historyKey(day, await $.session.id())
    await $.store.set(key, upsertEntry(await $.store.get(key), entryFromChecklist(list, project, jobCost(list, await read($, usageAtom)))))
    const view = await read($, historyAtom)
    if (view !== null && view.day === day && view.project === project) {
      const entries = await readHistory($, [day])
      await update($, historyAtom, () => ({ ...view, entries: entries.filter(one => one.project === project) }))
    }
  } catch {
    // The history is a convenience: a failed save never gets in the way of the work.
  }
}

/** Once Claude has answered: done, or still working in the background while helpers run. */
const settleFinished = async ($: $, at: number, isNewAnswer: boolean) => {
  let changed = isNewAnswer
  const list = await change($, current => {
    if (current.phase !== 'done' && current.phase !== 'background') return current
    const phase = isBusy(current) ? ('background' as const) : ('done' as const)
    if (phase === current.phase && !isNewAnswer) return current
    changed = true
    return { ...current, phase, finishedAt: phase === 'done' ? at : null, isCollapsed: false }
  })
  if (!changed || list === null) return
  await recordJob($)
  collapse?.cancel()
  if (list.phase === 'done') {
    const jobId = list.jobId
    collapse = $.clock.after(COLLAPSE_MS, () => {
      void change($, current =>
        current.jobId === jobId && current.phase === 'done' ? { ...current, isCollapsed: true } : current,
      )
    })
  }
}

const addHelper = ($: $, helper: Omit<GlanceHelper, 'stepId'>) =>
  change($, current => ({
    ...current,
    helpers: [...current.helpers.filter(one => one.id !== helper.id), { ...helper, stepId: currentStepId(current) }],
  }))

const noteHelperStep = async ($: $, agentId: string, model: string, effort: unknown) => {
  const list = await read($, checklistAtom)
  const helper = list?.helpers.find(one => one.id === agentId)
  const named = prettyModel(model)
  const level = effort === undefined || effort === null ? null : String(effort)
  if (!helper || (helper.model === named && helper.effort === level)) return
  await change($, current => ({
    ...current,
    helpers: current.helpers.map(one => (one.id === agentId ? { ...one, model: named, effort: level } : one)),
  }))
}

type StepUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

/** One model request's tokens: to the step it worked for, and to the helper that made it. */
const addTokens = ($: $, agentId: string | undefined, usage: StepUsage) => {
  const total =
    usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  if (total <= 0) return Promise.resolve(null)

  const cached = usage.cache_read_input_tokens

  return change($, current => {
    const helper = agentId === undefined ? undefined : current.helpers.find(one => one.id === agentId)
    const stepId =
      helper && current.tasks.some(one => one.id === helper.stepId)
        ? helper.stepId
        : current.tasks.find(one => one.status === 'active')?.id
    // No step is running (Claude writing its final answer): the job's total only.
    if (stepId === undefined && !helper) {
      return {
        ...current,
        extraTokens: current.extraTokens + total,
        extraCachedTokens: current.extraCachedTokens + cached,
      }
    }
    return {
      ...current,
      tasks: current.tasks.map(one =>
        one.id === stepId
          ? { ...one, tokens: one.tokens + total, cachedTokens: one.cachedTokens + usage.cache_read_input_tokens }
          : one,
      ),
      helpers: helper
        ? current.helpers.map(one => (one.id === helper.id ? { ...one, tokens: one.tokens + total } : one))
        : current.helpers,
    }
  })
}

const finishHelper = async ($: $, agentId: string, status: 'done' | 'failed') => {
  const list = await change($, current => ({
    ...current,
    helpers: current.helpers.map(one => (one.id === agentId && one.status === 'running' ? { ...one, status } : one)),
  }))
  if (list?.phase === 'background') await settleFinished($, await now($), false)
}

/**
 * Tidies the chat up without forgetting: Claude first writes a checkpoint of the work, the compaction is told to keep
 * it, and it stays in Claude's instructions for the rest of this chat. Uses /compact itself when the engine refuses.
 *
 * With `secrets` (moved into the .env just before), the checkpoint and the compaction are told to name them only by
 * their placeholders, and the saved checkpoint has any value left in it replaced as well. The rule names the
 * placeholders, never the values: /compact, the fallback, shows its instructions in the chat.
 */
const tidyUp = async ($: $, extra?: { secrets: readonly Secret[] }): Promise<'compacted' | 'command' | 'failed'> => {
  const secrets = extra?.secrets ?? []
  const rule = secrets.length === 0 ? null : secretRule(secrets)
  // The .env button has said what happens next; its toast stays in view.
  if (rule === null) $.ui.toast('Speichere einen Sicherungspunkt und räume dann den Chat auf…')
  let note: string | null = null
  try {
    const reply = await $.model.fork({ prompt: rule === null ? CHECKPOINT_PROMPT : `${CHECKPOINT_PROMPT}\n\n${rule}` })
    if (reply.isAnswered && reply.text.trim()) note = replaceSecrets(reply.text.trim(), secrets)
  } catch {
    // Tidying up still helps without a checkpoint.
  }
  if (note !== null) {
    const at = await now($)
    await $.store.set(checkpointKey(await $.session.id()), { at, note })
    await update($, checkpointAtom, () => at)
  } else {
    $.ui.toast("Sicherungspunkt ließ sich nicht speichern, räume trotzdem auf.")
  }
  const kept = note === null ? '' : `Behalte alles aus diesem Sicherungspunkt; die Arbeit braucht ihn, um weiterzugehen.\n\n${note}`
  const instructions = rule === null ? kept : [rule, kept].filter(Boolean).join('\n\n')
  try {
    const done = await $.session.compact(instructions === '' ? undefined : { instructions })
    if (done.skip !== undefined) $.ui.toast(`Der Chat wurde nicht aufgeräumt: ${done.skip}`)
    else if (note !== null) await update($, recapAtom, () => true)
    return done.skip === undefined ? 'compacted' : 'failed'
  } catch (refused) {
    $.ui.log(`leitstand: compaction refused: ${refused instanceof Error ? refused.message : String(refused)}`, { to: 'debug' })
  }
  try {
    await $.command.run({ command: 'compact', args: instructions })
    return 'command'
  } catch (failed) {
    const reason = failed instanceof Error ? failed.message : String(failed)
    $.ui.toast(`Der Chat ließ sich nicht aufräumen (${reason.slice(0, 80)}). Schreib /compact, um es noch mal zu versuchen.`)
    return 'failed'
  }
}

type CompactedMessage = Extract<Awaited<ReturnType<$['session']['compact']>>, { messages: readonly unknown[] }>['messages'][number]

/**
 * A message of a compaction's result with each secret's value as its placeholder. A changed message loses the
 * engine's handle, which would keep it as the engine has it, so the engine builds it from these words.
 */
const withoutSecrets = (message: CompactedMessage, secrets: readonly Secret[]): CompactedMessage => {
  const swap = (text: string) => replaceSecrets(text, secrets)
  const swapped: CompactedMessage = {
    ...message,
    text: swap(message.text),
    toolUses: message.toolUses.map(use => ({
      ...use,
      input: mapStrings(use.input, swap) as Record<string, unknown>,
      ...(use.text === undefined ? {} : { text: swap(use.text) }),
      ...(use.result === undefined ? {} : { result: mapStrings(use.result, swap) }),
    })),
    ...(message.toolResults === undefined
      ? {}
      : {
          toolResults: message.toolResults.map(result => ({
            ...result,
            text: swap(result.text),
            ...(result.result === undefined ? {} : { result: mapStrings(result.result, swap) }),
          })),
        }),
  }
  if (JSON.stringify(swapped) === JSON.stringify(message)) return message
  const { handle: _handle, ...built } = swapped
  return built
}

/** The checkpoint saved before this chat was last tidied up, under its own key; null when there is none. */
const checkpointOf = async ($: $): Promise<string | null> => {
  const saved = (await $.store.get(checkpointKey(await $.session.id()))) as { note?: unknown } | undefined
  return typeof saved?.note === 'string' && saved.note !== '' ? saved.note : null
}

/** What the checkpoint and the compaction are told about secrets moved into the .env: placeholders only, no values. */
const secretRule = (secrets: readonly Secret[]) => {
  const placeholders = secrets.map(one => `\`\${${one.name}}\``).join(', ')
  return (
    `Regel zu Geheimnissen: Passwörter und Schlüssel aus diesem Chat stehen jetzt in der .env im Projektordner, als ${placeholders}. ` +
    'Gib ihre Werte niemals wieder, auch nicht teilweise; schreib stattdessen immer den Platzhalter. Wer einen Wert braucht, liest ihn aus der .env im Projektordner.'
  )
}

/** Every string in a tool's input, however deep. */
const stringsOf = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(stringsOf)
      : value !== null && typeof value === 'object'
        ? Object.values(value).flatMap(stringsOf)
        : []

type ChatMessage = {
  text: string
  toolUses: ReadonlyArray<{ input: unknown; text?: string }>
  toolResults?: ReadonlyArray<{ text: string }>
}

/** Each piece of text the chat holds: what the person and Claude wrote, tool inputs and what the tools gave back. */
const chatPieces = (messages: readonly ChatMessage[]) =>
  messages
    .flatMap(one => [
      one.text,
      ...one.toolUses.flatMap(use => [...stringsOf(use.input), use.text ?? '']),
      ...(one.toolResults ?? []).map(result => result.text),
    ])
    .filter(piece => piece !== '')

/** A file in the project folder, joined with the folder's own separator. */
const inFolder = (folder: string, name: string) => `${folder.replace(/[\\/]+$/, '')}${folder.includes('\\') ? '\\' : '/'}${name}`

/**
 * The shield: moves the chat's passwords and keys into the .env in the project folder (keeping what is there, and
 * making sure git ignores it), then tidies the chat up so that Claude knows only their placeholders from then on.
 */
const vaultSecrets = async ($: $) => {
  const folder = await $.session.cwd().catch(() => '')
  // The app starts a chat without a project in a folder under scratch-workspaces.
  if (folder === '' || folder.replace(/\\/g, '/').includes('scratch-workspaces')) {
    $.ui.toast('Dieser Chat hat keinen Projektordner, darum gibt es keinen Ort für eine .env.')
    return
  }
  const messages = await $.session.messages().catch(() => [])
  const found = extractSecrets(chatPieces(messages))
  if (found.length === 0) {
    $.ui.toast('Im Chat stehen keine Passwörter oder Schlüssel.')
    return
  }
  let secrets: Secret[]
  try {
    const envPath = inFolder(folder, '.env')
    const existing = (await $.fs.exists(envPath)) ? await $.fs.read(envPath) : ''
    const merged = mergeEnv(existing, found, germanDay(dayKey(await now($))))
    // Git ignores the .env before it holds anything new.
    if (await $.fs.exists(inFolder(folder, '.git'))) {
      const ignorePath = inFolder(folder, '.gitignore')
      const ignore = gitignoreWithEnv((await $.fs.exists(ignorePath)) ? await $.fs.read(ignorePath) : null)
      if (ignore !== null) await $.fs.write(ignorePath, ignore)
    }
    if (merged.text !== existing) await $.fs.write(envPath, merged.text)
    secrets = merged.secrets
  } catch (failed) {
    const reason = failed instanceof Error ? failed.message : String(failed)
    $.ui.toast(`Die .env ließ sich nicht schreiben (${reason.slice(0, 80)}). Der Chat bleibt, wie er ist.`)
    return
  }
  const names = secrets.map(one => one.name).join(', ')
  $.ui.toast(
    `${secrets.length} ${secrets.length === 1 ? 'Geheimnis' : 'Geheimnisse'} in die .env übernommen (${names}). ` +
      'Der Chat wird jetzt verdichtet; danach kennt Claude nur noch Platzhalter.',
  )
  pendingVault = { secrets, until: (await now($)) + VAULT_LAPSE_MS }
  let route: 'compacted' | 'command' | 'failed' = 'failed'
  try {
    route = await tidyUp($, { secrets })
  } finally {
    // /compact may run after it was started: then the secrets wait for that compaction, until they lapse.
    if (route !== 'command') pendingVault = null
  }
}

const holdSecretMessage = async ($: $, text: string, kinds: string[]) => {
  heldMessage = { text, at: await now($) }
  // Put it back in the box so nothing is lost.
  $.clock.after(50, () => void $.prompt.fill({ text }).catch(() => undefined))
  $.ui.toast(
    `Diese Nachricht enthält offenbar ${kinds.join(' und ')}, deshalb wurde sie nicht gesendet. ` +
      'Drück noch mal Enter, um sie trotzdem zu senden, oder nimm es vorher heraus.',
  )
}

const measureUsage = async ($: $, usage: GlanceUsage) => {
  await update($, usageAtom, () => usage)
  const level = usage.limitPercent === null ? 0 : usage.limitPercent >= LIMIT_ALERT ? 2 : usage.limitPercent >= LIMIT_WARN ? 1 : 0
  if (level > limitLevel && usage.limitPercent !== null) {
    const reset = resetTime(usage.limitResetsAt, await now($))
    const words = `Du hast ${Math.round(usage.limitPercent)}% deines Limits${usage.limitLabel ? ` (${usage.limitLabel})` : ''} verbraucht`.replace('  ', ' ')
    const message = reset === null ? words : `${words}. Es wird ${reset} zurückgesetzt.`
    $.ui.toast(message)
    if ((await read($, noticeAtom)) && (await read($, enabledAtom))) {
      await showNotice($, 'Plan-Limit', message)
    }
  }
  limitLevel = level
}

/** Runs settings work one after another, so two quick presses never save out of order. */
const queued = <T,>(work: () => Promise<T>): Promise<T> => {
  const run = settingsWrite.then(work)
  settingsWrite = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

const settingsKey = (sid: string) => `${SETTINGS_PREFIX}${sid}`
const checkpointKey = (sid: string) => `${CHECKPOINT_PREFIX}${sid}`
// Where the one checkpoint lay before each chat kept its own: { sessionId, at, note }.
const LEGACY_CHECKPOINT_KEY = 'lastCheckpoint'

/** Saves a chat's own values under its key, with when; with none left, the key goes. A store that fails leaves them in state. */
const writeOwn = async ($: $, sid: string | null, values: Partial<ChatSettings>) => {
  if (sid === null) return
  try {
    if (Object.keys(values).length === 0) await $.store.delete(settingsKey(sid))
    else await $.store.set(settingsKey(sid), { at: await now($), values })
  } catch {
    // This chat's state still holds them: a reload reads them back from there.
  }
}

/** Puts a chat's settings into effect: every setting's state, the calm ticker and, where it changed, the other chats line. */
const applySettings = async ($: $, settings: ChatSettings) => {
  const wasNaming = (await read($, enabledAtom)) && (await read($, showsOthersAtom))
  await update($, enabledAtom, () => settings.enabled)
  await update($, detailAtom, () => settings.detail)
  await update($, workModeAtom, () => settings.workMode)
  await update($, soundAtom, () => settings.sound)
  await update($, noticeAtom, () => settings.notice)
  await update($, showsOthersAtom, () => settings.others)
  isCalmMode = settings.calm
  await update($, calmAtom, () => settings.calm)
  await update($, guardAtom, () => settings.guard)
  await update($, maskAtom, () => settings.mask)
  await update($, approveAtom, () => settings.approve)
  await update($, shipOnGithubAtom, () => settings.ship)
  syncTicker($, await read($, checklistAtom))
  if (wasNaming !== (settings.enabled && settings.others)) void refreshOthers($).catch(() => undefined)
}

/**
 * When this chat last saved a checkpoint, for Letzter Stand; null when it has none. One saved before checkpoints were
 * kept per chat, under the old global key and for this chat, becomes this chat's own, once; the old key stays.
 */
const loadCheckpoint = async ($: $, sid: string | null) => {
  let saved = sid === null ? undefined : ((await $.store.get(checkpointKey(sid)).catch(() => undefined)) as { at?: unknown; note?: unknown } | undefined)
  if (sid !== null && saved === undefined) {
    const old = (await $.store.get(LEGACY_CHECKPOINT_KEY).catch(() => undefined)) as { sessionId?: unknown; at?: unknown; note?: unknown } | undefined
    if (old?.sessionId === sid && typeof old.at === 'number' && typeof old.note === 'string') {
      saved = { at: old.at, note: old.note }
      await $.store.set(checkpointKey(sid), saved).catch(() => undefined)
    }
  }
  await update($, checkpointAtom, () => (typeof saved?.at === 'number' ? saved.at : null))
}

/** Loads a chat's settings: what its key holds, else what this chat's state holds, else none; then puts them into effect. */
const loadChatSettings = async ($: $, sid: string | null) => {
  const own = await read($, ownSettingsAtom)
  const stored = sid === null ? undefined : await $.store.get(settingsKey(sid)).catch(() => undefined)
  const values = stored !== undefined ? ownValues(stored) : own.sid === sid ? ownValues({ values: own.values }) : {}
  await update($, ownSettingsAtom, () => ({ sid, carry: false, values }))
  await applySettings($, chatSettings(defaults, values))
  // In use again: its key is kept for another 30 days.
  if (Object.keys(values).length > 0) await writeOwn($, sid, values)
}

/**
 * Follows the chat id: after /clear (`carry`) the chat keeps its settings, now under its new id; after a resume in
 * the same process the resumed chat's own are loaded. `isStart` loads them even when the id is the same (a reload).
 * True when it put settings into effect.
 */
const follow = async ($: $, isStart: boolean): Promise<boolean> => {
  const sid = await $.session.id().catch(() => null)
  const own = await read($, ownSettingsAtom)
  if (sid === own.sid && !isStart) return false
  await loadCheckpoint($, sid)
  if (own.carry && sid !== null && sid !== own.sid) {
    const values = ownValues({ values: own.values })
    await update($, ownSettingsAtom, () => ({ sid, carry: false, values }))
    await writeOwn($, sid, values)
    await applySettings($, chatSettings(defaults, values))
    return true
  }
  await loadChatSettings($, sid)
  return true
}

const followSession = ($: $, isStart = false) => queued(() => follow($, isStart))

/** Keeps a change for this chat alone: in its state, and under its own key. Other chats, open or new, never see it. */
const keepForChat = ($: $, patch: Partial<ChatSettings>) =>
  queued(async () => {
    // The chat id changed since (a resume): this change belongs to the chat now open.
    const isLoaded = await follow($, false)
    const sid = await $.session.id().catch(() => null)
    const next = await update($, ownSettingsAtom, own => ({ sid, carry: false, values: { ...(own?.values ?? {}), ...patch } }))
    if (isLoaded) await applySettings($, chatSettings(defaults, next.values))
    await writeOwn($, sid, next.values)
  })

/**
 * Tidies away other chats' settings and checkpoints not used for 30 days, at most once a day; never this chat's own.
 * With nothing of other chats to look at, it neither reads nor writes.
 */
const tidySettings = async ($: $) => {
  const sid = await $.session.id().catch(() => null)
  const mine = sid === null ? [] : [settingsKey(sid), checkpointKey(sid)]
  const keys = (await $.store.keys()).filter(key => (key.startsWith(SETTINGS_PREFIX) || key.startsWith(CHECKPOINT_PREFIX)) && !mine.includes(key))
  if (keys.length === 0) return
  const at = await now($)
  const last = await $.store.get(SETTINGS_TIDY_KEY)
  if (typeof last === 'number' && at - last < DAY_MS) return
  await $.store.set(SETTINGS_TIDY_KEY, at)
  const saved: [string, unknown][] = []
  for (const key of keys) saved.push([key, await $.store.get(key)])
  for (const key of staleSettingsKeys(saved, at, sid)) {
    // A chat that used it since it was read keeps it.
    if (staleSettingsKeys([[key, await $.store.get(key)]], at, sid).length > 0) await $.store.delete(key)
  }
}

const setEnabled = async ($: $, isEnabled: boolean) => {
  await update($, enabledAtom, () => isEnabled)
  await keepForChat($, { enabled: isEnabled })
  $.ui.toast(isEnabled ? 'Der Leitstand ist an: Tool-Details sind ausgeblendet' : 'Der Leitstand ist aus: Alles wird angezeigt')
}

/** Sounds: off, a chime, or a chime and a few words. A chime plays at once so the person hears what they picked. */
const setSound = async ($: $, mode: 'off' | 'chime' | 'voice') => {
  await update($, soundAtom, () => mode)
  await keepForChat($, { sound: mode })
  if (mode !== 'off') void playSound($, 'sounds/needs-you.wav').catch(() => undefined)
}

/** Calm mode: nothing moves, statuses in bold; the band redraws only to keep times current. */
const setCalm = async ($: $, isOn: boolean) => {
  isCalmMode = isOn
  await update($, calmAtom, () => isOn)
  await keepForChat($, { calm: isOn })
  syncTicker($, await read($, checklistAtom))
}

/** Moves the welcome on a card, or ends it for good. */
const stepTour = async ($: $, step: number | null) => {
  await update($, tourAtom, () => (step === null || step >= TOUR.length ? null : step))
  if (step === null || step >= TOUR.length) await $.store.set(TOUR_KEY, true)
}

/** Desktop notices: on shows one when Claude needs you, gets stuck or finishes a long job. A sample shows at once. */
const setNotice = async ($: $, isOn: boolean) => {
  await update($, noticeAtom, () => isOn)
  await keepForChat($, { notice: isOn })
  if (isOn) void showNotice($, 'Claude braucht dich', 'So sagt dir der Leitstand Bescheid.')
}

/** The line naming the other chats that need the person: off before sharing the screen, say. */
const setOthers = async ($: $, isOn: boolean) => {
  await update($, showsOthersAtom, () => isOn)
  await keepForChat($, { others: isOn })
  if (isOn) await refreshOthers($).catch(() => undefined)
}

/** The password guard: on holds back a message that looks like it has a password or key in it. */
const setGuard = async ($: $, isOn: boolean) => {
  await update($, guardAtom, () => isOn)
  await keepForChat($, { guard: isOn })
}

/** Masking on screen: on, passwords, keys and personal details read as dots in messages, command and tool output. */
const setMasking = async ($: $, isOn: boolean) => {
  await update($, maskAtom, () => isOn)
  await keepForChat($, { mask: isOn })
}

const MASKING_WORDS = {
  on: 'Verdecken an: Passwörter, Schlüssel und persönliche Daten erscheinen als Punkte.',
  off: 'Verdecken aus: alles ist wieder sichtbar.',
}

/** The lock button: one press turns masking on or off. */
const toggleMasking = async ($: $) => {
  const isOn = !(await read($, maskAtom))
  await setMasking($, isOn)
  $.ui.toast(isOn ? MASKING_WORDS.on : MASKING_WORDS.off)
}

/** Whether the screen masks right now: masking on, while Leitstand is on. */
const isMasking = async ($: $) => (await read($, enabledAtom)) && (await read($, maskAtom))

/** Finish on GitHub: a finished job in a GitHub project offers Ship it. */
const setShipOnGithub = async ($: $, isOn: boolean) => {
  await update($, shipOnGithubAtom, () => isOn)
  await keepForChat($, { ship: isOn })
}

/** Sends the close-out as the person's own message: cleanup, commit, pull request, merge once the person approves. */
const shipIt = ($: $) => {
  endShipping()
  isShipping = true
  isShipTurnNext = true
  return sendAsUser($, SHIP_PROMPT, async () => {
    await $.prompt.fill({ text: SHIP_PROMPT })
    $.ui.toast('Die Schritte für Push stehen im Eingabefeld: Drück Enter, um sie zu senden.')
  })
}

/** Approve the plan first: Claude lays out its plan, then waits for Start or a change. */
const setApprove = async ($: $, isOn: boolean) => {
  await update($, approveAtom, () => isOn)
  await keepForChat($, { approve: isOn })
}

/** Arbeitsweise: Auto (Claude entscheidet selbst über Helfer) oder Dynamisch (Claude leitet, Arbeiter in Stufen setzen um). */
const setWorkMode = async ($: $, mode: WorkMode) => {
  await update($, workModeAtom, () => mode)
  await keepForChat($, { workMode: mode })
}

/** Ob gerade die Arbeitsweise Dynamisch gilt: nur mit dem Leitstand an. */
const isDynamic = async ($: $): Promise<boolean> => (await read($, enabledAtom)) && (await read($, workModeAtom)) === 'dynamisch'

/** Legt die Arbeiter der Arbeitsweise Dynamisch an; in Auto bietet agent.offer sie nicht an. */
const registerTiers = async ($: $) => {
  for (const tier of TIERS) {
    await $.agent
      .register({
        name: tier.name,
        description: tierDescription(tier),
        prompt: workerPrompt(tier),
        model: tier.model,
        ...(tier.effort === undefined ? {} : { effort: tier.effort }),
      })
      .catch(() => undefined)
  }
}

/**
 * The first of these commands this session lists, as it names it (`found`), and the name asked for that matched
 * (`wanted`), or null. For each name in turn: the exact name; then another plugin's copy, a command ending in ':' and
 * its last part; the bare last part only after that, since the app may know a prefixed skill only by its full name.
 */
const lookUpCommand = async ($: $, names: string[]): Promise<{ found: string; wanted: string } | null> => {
  const commands = await $.command.list().catch(() => [])
  for (const name of names) {
    const bare = name.split(':').pop() ?? name
    const found =
      commands.find(one => one.name === name) ??
      commands.find(one => one.name.endsWith(`:${bare}`)) ??
      commands.find(one => one.name === bare)
    if (found) return { found: found.name, wanted: name }
  }
  return null
}

/**
 * The name to put in the prompt when a command cannot be run from here: what the session lists, unless that is a
 * bare name for a prefixed one asked for, which the app knows as the full name. Nothing listed: the first name when it
 * has a prefix (the app often knows such a skill though the list leaves it out), else null.
 */
const typedCommand = (hit: { found: string; wanted: string } | null, names: string[]): string | null => {
  if (hit === null) return names[0]?.includes(':') ? names[0] : null
  return !hit.found.includes(':') && hit.wanted.includes(':') ? hit.wanted : hit.found
}

// The skill grill-me, by its full name.
const GRILL_NAMES = ['anthropic-skills:grill-me']

/**
 * Starts the first of these commands this session knows. Should the run fail, or the session list none of them but
 * the first have a prefix, the command waits in the prompt for Enter; otherwise a toast says it is not there.
 * Says which: ran, filled into the prompt, or missing.
 */
const runCommand = async ($: $, label: string, names: string[], args?: string): Promise<'ran' | 'filled' | 'missing'> => {
  const hit = await lookUpCommand($, names)
  const typed = typedCommand(hit, names)
  const waitInPrompt = async () => {
    if (typed === null) return 'missing' as const
    await $.prompt.fill({ text: args === undefined ? `/${typed}` : `/${typed} ${args}` })
    $.ui.toast(`${typed} steht im Eingabefeld: Drück Enter, um zu starten.`)
    return 'filled' as const
  }
  if (hit === null) {
    if (typed !== null) return waitInPrompt()
    $.ui.toast(`${label} ist in dieser Sitzung nicht verfügbar.`)
    return 'missing'
  }
  try {
    await $.command.run(args === undefined ? { command: hit.found } : { command: hit.found, args })
    return 'ran'
  } catch {
    return waitInPrompt()
  }
}

/**
 * Autopilot: its mod's command, the old Nachtschicht's where only that is there; `an` while it is off, `aus` while it
 * is on. Started, not waited for: a command a plugin runs waits until the session is idle, and a running Autopilot
 * pushes on round after round, so a press that waited ran past its budget and Autopilot stayed on. A press that ends
 * it first leaves a wish in Leitstand's own state, the time of the press; Autopilot reads it as the round ends and
 * ends instead of pushing on. Until then 🅰️ stays lit, as it shows Autopilot's own state. The command still goes: an
 * idle session runs it at once, and an Autopilot that reads no wish ends by it. Named, not a bare toggle: it may come
 * through only after Autopilot ended by the wish, and a bare /autopilot would then start it again.
 */
const toggleNightShift = async ($: $) => {
  const isOn = await isNightShiftOn($)
  if (isOn) {
    const pressed = await now($)
    await update($, autopilotStopAtom, () => pressed)
    $.ui.toast('Der Autopilot geht nach dieser Runde aus.')
  }
  void runCommand($, 'Autopilot', ['autopilot', 'nachtschicht'], isOn ? 'aus' : 'an').catch(() => undefined)
}

/** Filetree: the filetree plugin's command, which opens its side pane. Only Filetree closes it, so this opens, never toggles. */
const openFiletree = ($: $) => runCommand($, 'Filetree', ['filetree'])

/** Clean code: the clean-code skill (functions, names, nesting, error handling), run as if typed. */
const runCleanCode = ($: $) => runCommand($, 'clean-code', ['clean-code'])

/** Reflect: the reflect mod's command, run as if typed. */
const runReflect = ($: $) => runCommand($, 'Reflect', ['reflect'])

// Autopilot keeps its run in its own state, under the key from its days as the Nachtschicht (names here still say
// night shift): the run while there is one, null once it is ended. Any plugin reads any value, so Leitstand reads it
// straight from there and writes nothing of its own. Not a `dependencies` entry in plugin.json: Leitstand would then
// not load where Autopilot is not installed. There the value was never written and reads as off.
const NIGHT_SHIFT_STATE = { plugin: 'autopilot', key: 'schicht' } as const
// The same value as the mod kept it while it was called Nachtschicht.
const OLD_NIGHT_SHIFT_STATE = { plugin: 'nachtschicht', key: 'schicht' } as const
// The key Autopilot draws its line under, in the band above the prompt; it keeps it fixed for the mods that move it.
const AUTOPILOT_LINE = 'autopilot'

/**
 * Whether Autopilot is on, as it holds it: while there is a run, be it running, finished or halted, since /autopilot
 * then ends it. Read while drawing, the band draws again whenever Autopilot writes it, however it was switched (this
 * button, /autopilot typed, its own Beenden, Esc). Off on any error. Where Autopilot has written nothing yet in this
 * session, the Nachtschicht's value counts, so an instance in the middle of switching over still shows right.
 */
const isNightShiftOn = async ($: $): Promise<boolean> => {
  try {
    // The values are the mods' own, declared in their contracts and not in Leitstand's, so they are typed here.
    const { value: own } = (await $.state.get(NIGHT_SHIFT_STATE as never)) as { value?: unknown }
    // Null is Autopilot's own word that no run is on, so the old value counts only while Autopilot's is unwritten.
    if (own !== undefined) return own !== null
    const { value: old } = (await $.state.get(OLD_NIGHT_SHIFT_STATE as never)) as { value?: unknown }
    return old !== undefined && old !== null
  } catch {
    return false
  }
}

/** What turns ADHD mode off, as the person's own words. */
const ADHD_STOP = 'stop adhd mode'
// The skill's call, typed or in the transcript (`<command-name>/i-have-adhd:i-have-adhd</command-name>`); not a path.
const ADHD_CALL = /(?:^|[\s>])\/i-have-adhd(?::i-have-adhd)?(?=$|[\s<])/
const ADHD_OFF = /stop adhd mode|normal mode/

/** Whether a slash command is the i-have-adhd skill, by either name. */
const isAdhdCommand = (name: string) => name === 'i-have-adhd' || name.endsWith(':i-have-adhd')
/** Whether a message turns ADHD mode on (true), off (false), or neither (null). */
const adhdSays = (text: string): boolean | null => {
  const said = text.trim().toLowerCase()
  if (ADHD_CALL.test(said)) return true
  return ADHD_OFF.test(said) ? false : null
}

/**
 * After a reload: whether ADHD mode is on, by the person's last message that calls the skill or turns it off. The
 * skill's own text, which names the words that stop it, is not the person's. False on any error.
 */
const adhdInTranscript = async ($: $): Promise<boolean> => {
  try {
    const messages = await $.session.messages()
    for (const one of [...messages].reverse()) {
      if (one.role !== 'user' || one.toolResults?.length || one.text.startsWith('Base directory for this skill')) continue
      if (one.text.startsWith('This session is being continued')) continue // a summary retells, it does not say
      const says = adhdSays(one.text)
      if (says !== null) return says
    }
    return false
  } catch {
    return false
  }
}

/**
 * ADHD mode toggle: off, it starts the i-have-adhd plugin's skill (answers lead with the next action, in numbered
 * steps, without tangents); on, it says "stop adhd mode". Left waiting in the prompt, the mode is not on yet.
 */
const toggleAdhd = async ($: $) => {
  if (await read($, adhdAtom)) {
    await $.prompt.submit({ text: ADHD_STOP, asUser: true })
    await update($, adhdAtom, () => false)
    return
  }
  if ((await runCommand($, 'i-have-adhd', ['i-have-adhd:i-have-adhd', 'i-have-adhd'])) === 'ran') await update($, adhdAtom, () => true)
}

/** The desktop app's MCP server that holds the session's own Remote Control switch. */
const REMOTE_SERVER = 'ccd_session_mgmt'

/** Both sources as stored; a value saved before 0.40 (a bare string) counts as neither being there. */
const remoteSides = (stored: unknown): RemoteSides => {
  if (typeof stored !== 'object' || stored === null) return { app: 'missing', command: 'missing' }
  const side = (value: unknown): RemoteSide => (value === 'on' || value === 'off' ? value : 'missing')
  const record = stored as Record<string, unknown>
  return { app: side(record.app), command: side(record.command) }
}

/** What the button shows: on while either source is on, off while either is there, missing while neither is. */
const remoteShown = (stored: unknown): RemoteSide => {
  const sides = remoteSides(stored)
  if (sides.app === 'on' || sides.command === 'on') return 'on'
  return sides.app === 'off' || sides.command === 'off' ? 'off' : 'missing'
}

/** The text of an MCP result's text blocks, joined. */
const mcpText = (result: { content?: readonly { type: string; text?: string }[] }) =>
  (result.content ?? [])
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text ?? '')
    .join('\n')
    .trim()

/**
 * Remote Control's state in an answer of the app's server: JSON with remoteControlState (or state), in the structured
 * result or a text block; with `allowsWord`, a bare on/off/connecting/unavailable in the text too. on and connecting
 * count as on, unavailable as missing; null when nothing readable is there.
 */
const remoteFromResult = (result: { content?: readonly { type: string; text?: string }[]; structuredContent?: unknown }, allowsWord: boolean): RemoteSide | null => {
  const word = (value: unknown): RemoteSide | null => {
    if (typeof value !== 'string') return null
    const state = value.trim().toLowerCase()
    return state === 'on' || state === 'connecting' ? 'on' : state === 'off' ? 'off' : state === 'unavailable' ? 'missing' : null
  }
  const fromObject = (value: unknown): RemoteSide | null => {
    if (typeof value !== 'object' || value === null) return null
    const record = value as Record<string, unknown>
    return word(record.remoteControlState) ?? word(record.state)
  }
  const structured = fromObject(result.structuredContent)
  if (structured !== null) return structured
  const text = mcpText(result)
  try {
    const parsed = fromObject(JSON.parse(text))
    if (parsed !== null) return parsed
  } catch {
    // Not JSON: maybe a bare word below.
  }
  if (!allowsWord) return null
  return word(/\b(on|off|connecting|unavailable)\b/i.exec(text)?.[1])
}

/**
 * Remote Control's state from both sources: the app's switch through ccd_session_mgmt's get_session (missing when the
 * server is absent, as in the terminal, or its answer fails or is unreadable), and the session's commands, where
 * /remote-control's description starts with Disconnect while connected (a failed list keeps the last state).
 * Writes only on a change.
 */
const readRemote = async ($: $) => {
  const last = remoteSides(await read($, remoteAtom))
  let app: RemoteSide = 'missing'
  try {
    const result = await $.mcp.call(REMOTE_SERVER, 'get_session', { session_id: 'self' })
    app = result.isError ? 'missing' : (remoteFromResult(result, false) ?? 'missing')
  } catch {
    // No such server in this session: the app's switch is missing.
  }
  let command = last.command
  try {
    const found = (await $.command.list()).find(one => one.name === 'remote-control')
    command = found === undefined ? 'missing' : /^disconnect/i.test((found.description ?? '').trim()) ? 'on' : 'off'
  } catch {
    // The band keeps what it shows for the command.
  }
  if (app !== last.app || command !== last.command) await update($, remoteAtom, () => ({ app, command }))
}

/** The app's Remote Control switch, turned on or off; a refusal or failure says why in a toast. */
const switchAppRemote = async ($: $, enabled: boolean) => {
  try {
    const result = await $.mcp.call(REMOTE_SERVER, 'set_remote_control', { session_id: 'self', enabled })
    if (result.isError) {
      $.ui.toast(`Remote Control ließ sich nicht umschalten: ${mcpText(result) || 'Die App hat es abgelehnt.'}`)
      return
    }
    const state = remoteFromResult(result, true)
    if (state !== null) await update($, remoteAtom, stored => ({ ...remoteSides(stored), app: state }))
  } catch (error) {
    $.ui.toast(`Remote Control ließ sich nicht umschalten: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Remote Control: while on, every source that is on is turned off (the app's switch, /remote-control); while off, it
 * is turned on through the app's switch when the session has one, else through the command. The state is read now and
 * twice more while it settles.
 */
const toggleRemote = async ($: $) => {
  const sides = remoteSides(await read($, remoteAtom))
  if (remoteShown(sides) === 'on') {
    if (sides.app === 'on') await switchAppRemote($, false)
    if (sides.command === 'on') await runCommand($, 'Remote Control', ['remote-control'])
  } else if (sides.app !== 'missing') {
    await switchAppRemote($, true)
  } else {
    await runCommand($, 'Remote Control', ['remote-control'])
  }
  await readRemote($)
  $.clock.after(2000, () => void readRemote($))
  $.clock.after(6000, () => void readRemote($))
}

/**
 * Humanize: Claude reworks its last answer in the chat, with vermenschlichen when the answer is German, else with
 * humanizer.
 */
const humanizeLast = async ($: $) => {
  const messages = await $.session.messages().catch(() => [])
  const last = [...messages].reverse().find(one => one.role === 'assistant' && one.text.trim() !== '')
  if (last === undefined) {
    $.ui.toast('Noch keine Antwort zum Überarbeiten.')
    return
  }
  if (isGermanText(last.text)) {
    await runCommand($, 'vermenschlichen', ['anthropic-skills:vermenschlichen', 'humanizer-de'], 'Überarbeite deine letzte Antwort hier im Chat.')
  } else {
    await runCommand($, 'humanizer', ['humanizer'], 'Rewrite your last answer in this chat.')
  }
}

/**
 * Grill mich: startet den Skill grill-me. Steht ein Plan, löchert er die Person zu diesem Plan; sonst steht der
 * Befehl im Eingabefeld, und die Person schreibt ihr Thema dazu.
 */
const grillMe = async ($: $) => {
  const hit = await lookUpCommand($, GRILL_NAMES)
  // Typed into the prompt, the full name: the app may know grill-me by it alone.
  const typed = typedCommand(hit, GRILL_NAMES)
  if (typed === null) {
    $.ui.toast('Der Skill grill-me ist in dieser Sitzung nicht verfügbar.')
    return
  }
  const list = await read($, checklistAtom)
  if (list !== null && list.hasPlan && list.tasks.length > 0) {
    const args = `zum aktuellen Plan "${list.title}": ${list.tasks.map(one => one.name).join('; ')}`
    try {
      if (hit === null) throw new Error('not listed')
      await $.command.run({ command: hit.found, args })
    } catch {
      await $.prompt.fill({ text: `/${typed} ${args}` })
      $.ui.toast('grill-me steht im Eingabefeld: Drück Enter, um zu starten.')
    }
    return
  }
  await $.prompt.fill({ text: `/${typed} ` })
  $.ui.toast('grill-me steht im Eingabefeld: Schreib dein Thema dazu und drück Enter.')
}

/**
 * With Approve the plan first on, or in Gruppenarbeit, a new plan waits for Start or a change; true when it now waits.
 * A plan made in a turn the person started with a go-ahead is approved by it and does not wait.
 */
const holdForApproval = async ($: $): Promise<boolean> => {
  if (!((await read($, approveAtom)) || (await isDynamic($))) || (await read($, checklistAtom))?.approval === 'approved') {
    return false
  }
  if (isApprovingTurn) {
    // One go-ahead, one plan: a different plan later in the turn waits.
    isApprovingTurn = false
    await change($, list => ({ ...list, approval: 'approved' }))
    return false
  }
  await change($, list => ({ ...list, approval: 'waiting', phase: 'needsYou', needsYouReason: APPROVE }))
  // With Autopilot on, its count to Start begins now; the same plan laid out again keeps its count.
  await armNightStart($)

  return true
}

/**
 * The approval of steps Claude lays out with plan_steps. An approved plan stays approved when they are its step names
 * in the same order (Claude often repeats it), counting steps a progress report added or not; other steps are a new
 * plan, which needs an approval of its own. A waiting plan, changed, still waits.
 */
const planApproval = (list: GlanceChecklist | null, steps: string[]): GlanceChecklist['approval'] => {
  if (list?.approval !== 'approved') return list?.approval ?? 'none'
  const isSame = (tasks: GlanceTask[]) => tasks.length === steps.length && tasks.every((one, at) => one.name === steps[at])

  return isSame(list.tasks.filter(one => one.id.startsWith('plan#'))) || isSame(list.tasks) ? 'approved' : 'none'
}

/** A helper's kind as the person reads it: Leitstand's workers by their tier ("sorgfältig"), any other as named. */
const helperType = (type: string): string => (isTierAgent(type) ? (TIERS.find(tier => tierAgent(tier) === type)?.label ?? type) : type)

/**
 * A plan waiting for Start, as Autopilot's Start tells plans apart: its job and its steps, the planned ones when
 * there are any, as planApproval counts them. Null when no plan waits.
 */
const waitingPlanOf = (list: GlanceChecklist | null): string | null => {
  if (list?.approval !== 'waiting') return null
  const planned = list.tasks.filter(one => one.id.startsWith('plan#'))
  return [list.jobId, ...(planned.length > 0 ? planned : list.tasks).map(one => one.name)].join('\n')
}

const stopNightStart = () => {
  nightTimer?.cancel()
  nightTimer = undefined
  nightStart = null
}

/**
 * The person approves the plan: the same job starts, and Autopilot has nothing left to start for it. A plan already on
 * its way sends nothing more. Not sent (failed or dropped): Start and Autopilot are free for it again.
 */
const startPlan = async ($: $) => {
  if (await isCompactingNow($)) return false
  const plan = waitingPlanOf(await read($, checklistAtom))
  if (plan === null) return sendAsUser($, START_TEXT, () => $.ui.toast("Starten geht gerade nicht. Schreib: los"))
  // Marked in one step, so two presses at once agree on which one sends.
  let isMine = false
  await update($, startingAtom, starting => {
    if (starting === plan) return starting
    isMine = true
    return plan
  })
  if (!isMine) return true
  nightStartedPlan = plan
  stopNightStart()
  let isSent = false
  try {
    isSent = await sendAsUser($, START_TEXT, () => $.ui.toast("Starten geht gerade nicht. Schreib: los"))
  } finally {
    if (!isSent && nightStartedPlan === plan) nightStartedPlan = null
    await update($, startingAtom, starting => (starting === plan ? null : starting))
  }
  return isSent
}

/**
 * Autopilot's count to Start: it runs while Leitstand is on, a plan waits for Start and Autopilot is on,
 * from the moment all three hold. A new plan starts it over; anything else ends it. Returns the plan counted for.
 */
const armNightStart = async ($: $): Promise<string | null> => {
  const plan = waitingPlanOf((await read($, enabledAtom)) ? await read($, checklistAtom) : null)
  if (plan === null) {
    // Started once holds for one wait: a plan that waits again later is counted again.
    nightStartedPlan = null
    stopNightStart()
    return null
  }
  const isOn = await isNightShiftOn($)
  const at = await now($)
  // Nothing is awaited from here on, so two checks at once agree.
  if (!isOn || plan === nightStartedPlan) {
    stopNightStart()
    return null
  }
  if (nightStart?.plan !== plan) {
    nightTimer?.cancel()
    nightStart = { plan, since: at }
    nightTimer = $.clock.after(NIGHT_SHIFT_START_MS, () => void checkNightStart($))
  }
  return plan
}

/**
 * On each tick and when the count is up: with Autopilot on, a plan that has waited NIGHT_SHIFT_START_MS for
 * Start starts as if the person pressed it, once. Not while the chat is compacted; the first tick after it does.
 */
const checkNightStart = async ($: $) => {
  const plan = await armNightStart($)
  const since = plan !== null && nightStart?.plan === plan ? nightStart.since : null
  if (since === null || (await now($)) - since < NIGHT_SHIFT_START_MS || (await read($, compactingAtom))) return
  // Checked again with nothing awaited before the start: a plan changed, approved or switched off meanwhile, or one a
  // check at the same moment started, does not start (again).
  if (nightStart?.plan !== plan || plan === nightStartedPlan) return
  nightStartedPlan = plan
  stopNightStart()
  // Not sent: the next check counts down afresh.
  if (!(await startPlan($))) nightStartedPlan = null
}

/** Seconds until Autopilot starts this waiting plan, in the steps the band redraws in; null when it won't. */
const nightStartSeconds = (list: GlanceChecklist, at: number): number | null => {
  const plan = waitingPlanOf(list)
  if (plan === null || plan === nightStartedPlan) return null
  // Not counted yet: the next check starts the count, at full length.
  const left = nightStart?.plan === plan ? nightStart.since + NIGHT_SHIFT_START_MS - at : NIGHT_SHIFT_START_MS
  return left > 0 ? Math.ceil(left / CALM_TICK_MS) * (CALM_TICK_MS / 1000) : null
}

/** What Claude reads about a waiting plan while Autopilot is on: it starts without the person. Empty otherwise. */
const nightStartNote = async ($: $) =>
  (await isNightShiftOn($)) ? ` Der Autopilot startet den Plan in ${NIGHT_SHIFT_START_MS / 1000} Sekunden von selbst.` : ''

/** Picks Simple, Details, Minimal or Off directly, as the settings panel does. */
const setView = async ($: $, view: 'simple' | 'detailed' | 'minimal' | 'off') => {
  await update($, enabledAtom, () => view !== 'off')
  if (view !== 'off') await update($, detailAtom, () => view)
  await keepForChat($, { enabled: view !== 'off', ...(view !== 'off' ? { detail: view } : {}) })
}

/** Plays what the person picked, so they know what they will hear. */
const alertSample = async ($: $, mode: 'off' | 'chime' | 'voice') => {
  if (mode === 'off') return
  await playSound($, 'sounds/needs-you.wav').catch(() => undefined)
  if (mode === 'voice') await sayWords($, 'Claude braucht dich').catch(() => undefined)
}

/** Back to the defaults from the config menu, in this chat alone: its own values and its key go. */
const resetSettings = async ($: $) => {
  await queued(async () => {
    await follow($, false)
    const sid = await $.session.id().catch(() => null)
    await update($, ownSettingsAtom, () => ({ sid, carry: false, values: {} }))
    await writeOwn($, sid, {})
    await applySettings($, defaults)
  })
  $.ui.toast('Auf den Standard zurückgesetzt, nur in diesem Chat.')
}

const showSettings = ($: $) => $.ui.open({ id: SETTINGS_PANE, title: 'Leitstand-Einstellungen', closeOnEscape: true })

/** The one button: Simple → Details → Minimal → Simple; from Off back to Simple. Off is in Settings and /leitstand off. */
const cycleMode = async ($: $, isEnabled: boolean, detail: 'simple' | 'detailed' | 'minimal') => {
  const next = !isEnabled ? 'simple' : detail === 'simple' ? 'detailed' : detail === 'detailed' ? 'minimal' : 'simple'
  await setView($, next)
  $.ui.toast(
    next === 'detailed'
      ? 'Leitstand Details: Modelle, Zeit, Tokens und Cache'
      : next === 'minimal'
        ? 'Leitstand minimal: eine Zeile mit Stand, Fortschritt, Restzeit und Tokens'
        : 'Leitstand einfach: nur die Schritte und der Fortschritt',
  )
}

const setDetail = async ($: $, isDetailed: boolean) => {
  await update($, detailAtom, () => (isDetailed ? 'detailed' : 'simple'))
  await keepForChat($, { detail: isDetailed ? 'detailed' : 'simple' })
  $.ui.toast(
    isDetailed ? 'Details an: Modelle, Tokens und Cache' : 'Details aus: nur die Schritte und der Fortschritt',
  )
}

// Leitstand grew out of GlanceFlow, which was called Glance until 0.9: once, bring over Glance's history from its own
// store file. Settings are kept per chat since 0.51 and are not brought over.
const ADOPTED_KEY = 'adoptedGlance'
const adoptGlanceStore = async ($: $) => {
  if (await $.store.get(ADOPTED_KEY)) {
    return
  }
  await $.store.set(ADOPTED_KEY, true)
  try {
    // Windows sets USERPROFILE, not HOME.
    const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
    const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home === undefined ? undefined : `${home}/.claude`)
    if (config === undefined) {
      return
    }
    const dir = `${config}/plugins/store`
    for (const file of await $.fs.list(dir)) {
      if (!/^glance_.*\.json$/.test(file.name)) {
        continue
      }
      const old = JSON.parse(await $.fs.read(`${dir}/${file.name}`)) as Record<string, unknown>
      for (const [key, value] of Object.entries(old)) {
        if (key.startsWith(HISTORY_PREFIX) && Array.isArray(value)) {
          const own = historyKey(historyDay(key), 'glance')
          let entries = await $.store.get(own)
          // Only Glance's own jobs: another mod may be called glance too.
          for (const entry of value as GlanceHistoryEntry[]) {
            if (typeof entry?.jobId === 'string' && Array.isArray(entry.doneSteps)) {
              entries = upsertEntry(entries, entry)
            }
          }
          await $.store.set(own, entries ?? [])
        }
      }
    }
  } catch {
    // Nothing to bring over.
  }
}

// Up to 0.24 every chat's jobs of a day shared one key (sharedDayKeys); once, each moves into this chat's own key for its day.
const splitSharedDays = async ($: $) => {
  try {
    const id = await $.session.id()
    for (const key of sharedDayKeys(await $.store.keys())) {
      const own = historyKey(historyDay(key), id)
      await $.store.set(own, mergedEntries([await $.store.get(key), await $.store.get(own)]))
      await $.store.delete(key)
    }
  } catch {
    // Left as it is, the old day still reads; the next chat moves it.
  }
}

/** Wie die Engine eine Befehlsantwort beginnt: die Namen der Mods, die den Befehl hooken, mit + verbunden. */
const VORSATZ = /^(<local-command-stdout>)([a-z0-9-]+(?:\+[a-z0-9-]+)*): /
/** Steht statt des Vorsatzes am Ende einer Antwort des Leitstands. */
export const GEMELDET = '(gemeldet vom Mod Leitstand)'

/**
 * Die gespeicherte Zeile einer Befehlsantwort ohne `name` im Vorsatz; andere Namen bleiben stehen.
 *
 * Mit `gemeldet` steht am Ende, von wem die Antwort kommt: nach einer Zeile mit
 * Leerzeichen, nach mehreren in einer eigenen letzten Zeile.
 */
export function ohneVorsatz(text: string, name: string, gemeldet: string | null): string {
  const m = VORSATZ.exec(text)
  const namen = m?.[2]?.split('+') ?? []
  if (!m || !namen.includes(name)) {
    return text
  }
  const rest = namen.filter(n => n !== name)
  const kopf = (m[1] ?? '') + (rest.length > 0 ? `${rest.join('+')}: ` : '')
  const rumpf = text.slice(m[0].length)
  if (gemeldet === null) {
    return kopf + rumpf
  }
  const ende = rumpf.lastIndexOf('</local-command-stdout>')
  const innen = ende < 0 ? rumpf : rumpf.slice(0, ende)
  const kern = innen.trimEnd()
  const schluss = innen.slice(kern.length) + (ende < 0 ? '' : rumpf.slice(ende))
  return kopf + kern + (kern.includes('\n') ? '\n' : ' ') + gemeldet + schluss
}

/** What a stored command row says, without the plugin names before it and the frame around it. */
function answerOf(text: string): string {
  return text.replace(VORSATZ, '').replace(/<\/local-command-stdout>\s*$/, '').trim()
}

// Die eigenen Befehle /leitstand-…: je einer für jeden Knopf und Schalter, mit denselben Funktionen dahinter. Jeder
// antwortet sofort mit Text; ein Fenster geht danach im Hintergrund auf. Vom Handy (Remote Control), wo Fenster nicht
// zu sehen sind, sagt die Antwort das oder bringt den Inhalt selbst mit.

const NUR_HIER = '(nur in diesem Chat)'
const BEFEHL_FEHLER = 'Das hat gerade nicht geklappt. Versuch es gleich noch einmal oder nimm den Knopf im Leitstand.'
const COMPACTING_WORDS = 'Der Chat wird gerade aufgeräumt. Versuch es gleich noch einmal.'
// The skill behind 🧠, by either name.
const ADHD_NAMES = ['i-have-adhd:i-have-adhd', 'i-have-adhd']
const ANSICHT_WORTE = { simple: 'Einfach', detailed: 'Ausführlich', minimal: 'Minimal' } as const

const anAus = (isOn: boolean) => (isOn ? 'an' : 'aus')
const istJa = (args: string) => args.trim().toLowerCase() === 'ja'
/** The answer of a switch: its new state, for this chat alone. */
const zustand = (satz: string, isOn: boolean) => `${satz} jetzt ${anAus(isOn)} ${NUR_HIER}.`

/**
 * Sets off what a command starts (a message, another command, a compaction) once its answer is given, outside the
 * command: a message sent from inside it would wait for the session to be idle.
 */
const danach = ($: $, run: () => Promise<unknown>) => {
  $.clock.after(0, () => {
    void run().catch(() => undefined)
  })
}

/** Opens a pane once the command has its answer, without holding it up. */
const imHintergrund = (open: () => Promise<unknown>) => {
  void Promise.resolve()
    .then(open)
    .catch(() => undefined)
}

/** Opens the history pane on the day it holds. */
const oeffneVerlauf = async ($: $) => {
  const view = await read($, historyAtom)
  if (view === null) return null
  return $.ui.open({ id: HISTORY_PANE, title: `Verlauf · ${projectName(view.project)}`, closeOnEscape: true })
}

/** The plan as plain text, for the phone: every step with its mark, and what each finished one got done. */
const planAlsText = (list: GlanceChecklist): string => {
  const mark = (one: GlanceTask) => (one.status === 'done' ? '✓' : one.status === 'active' ? '▶' : '○')
  const done = list.tasks.filter(one => one.status === 'done').length
  return [
    list.title,
    `${done} von ${list.tasks.length} Schritten fertig.`,
    '',
    ...list.tasks.flatMap(one => [`${mark(one)} ${one.name}`, ...(one.status === 'done' && one.summary ? [`   ${one.summary}`] : [])]),
  ].join('\n')
}

/** One day's history as plain text, for the phone. */
const verlaufAlsText = (day: string, entries: readonly GlanceHistoryEntry[]): string => {
  const line = (one: GlanceHistoryEntry) =>
    `• ${clockTime(one.startedAt)} ${one.title} (${OUTCOME_WORDS[one.outcome][0]}${one.stepsTotal > 0 ? `, ${one.stepsDone} von ${one.stepsTotal} Schritten` : ''})`
  return [`Verlauf für ${germanDay(day)}: ${entries.length} ${entries.length === 1 ? 'Aufgabe' : 'Aufgaben'}.`, ...entries.map(line)].join('\n')
}

/** Where a skill or another mod's command stands in this session: listed (`hit`), and the name to type (`typed`). */
const skillLage = async ($: $, names: string[]) => {
  const hit = await lookUpCommand($, names)
  return { hit, typed: typedCommand(hit, names) }
}

/**
 * What a skill's command answers, and whether to start it as its button does. Not there: the answer says so. Known
 * only by a prefixed name it waits in the prompt, which the phone does not show: there the answer names it instead.
 */
const skillAntwort = (label: string, lage: Awaited<ReturnType<typeof skillLage>>, isPhone: boolean, gestartet: string): { text: string; run: boolean } => {
  if (lage.typed === null) return { text: `${label} ist in dieser Sitzung nicht verfügbar.`, run: false }
  if (lage.hit === null) {
    return isPhone
      ? { text: `${label} lässt sich von hier nicht starten. Schreib /${lage.typed}.`, run: false }
      : { text: `/${lage.typed} steht im Eingabefeld: Drück Enter, um zu starten.`, run: true }
  }
  return { text: gestartet, run: true }
}

/** The day's or the week's team report, or your own week: shown and copied as the button does, and the answer itself. */
const bericht = async ($: $, span: GlanceHistoryView['reportSpan']) => {
  await showHistory($, dayKey(await now($)), false)
  await showReportSpan($, span)
  const view = await read($, historyAtom)
  if (view === null) return 'Noch kein Verlauf.'
  imHintergrund(() => oeffneVerlauf($))
  return reportOf(view)
}

/** In Gruppenarbeit every plan waits for approval: there, as on the button, nothing changes. */
const planFreigeben = async ($: $, isOn: boolean) => {
  if ((await read($, workModeAtom)) === 'dynamisch') {
    return 'In der Gruppenarbeit wartet jeder Plan auf deine Freigabe: Plan zuerst freigeben ist dort immer an.'
  }
  await setApprove($, isOn)
  return zustand('Plan zuerst freigeben ist', isOn)
}

/** Remote Control on or off. Through the app's switch it changes at once; /remote-control runs once this command is done. */
const fernsteuerung = async ($: $, isOn: boolean) => {
  await readRemote($)
  const sides = remoteSides(await read($, remoteAtom))
  const shown = remoteShown(sides)
  if (shown === 'missing') return 'Remote Control ist hier nicht verfügbar.'
  if ((shown === 'on') === isOn) return `Remote Control ist schon ${anAus(isOn)}.`
  const viaApp = isOn ? sides.app !== 'missing' : sides.command !== 'on'
  if (!viaApp) {
    danach($, () => toggleRemote($))
    return `Remote Control geht ${anAus(isOn)} ${NUR_HIER}.`
  }
  await toggleRemote($)
  const after = remoteShown(await read($, remoteAtom))
  return after === (isOn ? 'on' : 'off') ? zustand('Remote Control ist', isOn) : 'Remote Control ließ sich nicht umschalten.'
}

/** grill-me: on a topic, else on the current plan; with neither, the phone asks for a topic, the desktop fills the prompt. */
const ausfragen = async ($: $, args: string, isPhone: boolean) => {
  const lage = await skillLage($, GRILL_NAMES)
  if (args !== '') {
    const answer = skillAntwort('Der Skill grill-me', lage, isPhone, `grill-me fragt dich zu „${args}“ aus.`)
    if (answer.run) danach($, () => runCommand($, 'grill-me', GRILL_NAMES, args))
    return answer.text
  }
  const list = await read($, checklistAtom)
  if (list !== null && list.hasPlan && list.tasks.length > 0) {
    const answer = skillAntwort('Der Skill grill-me', lage, isPhone, 'grill-me fragt dich zum aktuellen Plan aus.')
    if (answer.run) danach($, () => grillMe($))
    return answer.text
  }
  if (lage.typed === null) return 'Der Skill grill-me ist in dieser Sitzung nicht verfügbar.'
  if (isPhone) return 'Nenn ein Thema, etwa: /leitstand-ausfragen Umzug der Datenbank'
  danach($, () => grillMe($))
  return 'grill-me steht im Eingabefeld: Schreib dein Thema dazu und drück Enter.'
}

/** Humanize: the last answer, with vermenschlichen when it is German, else with humanizer. */
const vermenschlichen = async ($: $, isPhone: boolean) => {
  const messages = await $.session.messages().catch(() => [])
  const last = [...messages].reverse().find(one => one.role === 'assistant' && one.text.trim() !== '')
  if (last === undefined) return 'Noch keine Antwort zum Überarbeiten.'
  const isGerman = isGermanText(last.text)
  const names = isGerman ? ['anthropic-skills:vermenschlichen', 'humanizer-de'] : ['humanizer']
  const answer = skillAntwort(isGerman ? 'vermenschlichen' : 'humanizer', await skillLage($, names), isPhone, 'Claude überarbeitet seine letzte Antwort.')
  if (answer.run) danach($, () => humanizeLast($))
  return answer.text
}

/** The shield, after ja: only where a .env has a place and the chat holds a secret; the move itself goes on after. */
const geheimnisseSichern = async ($: $, args: string) => {
  if (!istJa(args)) {
    return 'Würde Passwörter und Schlüssel aus diesem Chat in die .env im Projektordner verschieben und den Chat danach aufräumen; Claude kennt dann nur noch Platzhalter.\nZum Ausführen: /leitstand-geheimnisse-sichern ja'
  }
  const folder = await $.session.cwd().catch(() => '')
  if (folder === '' || folder.replace(/\\/g, '/').includes('scratch-workspaces')) return 'Dieser Chat hat keinen Projektordner, darum gibt es keinen Ort für eine .env.'
  const found = extractSecrets(chatPieces(await $.session.messages().catch(() => [])))
  if (found.length === 0) return 'Im Chat stehen keine Passwörter oder Schlüssel.'
  danach($, () => vaultSecrets($))
  return 'Verschiebe die Passwörter und Schlüssel dieses Chats in die .env und räume den Chat danach auf.'
}

/** One day's history: a line on the desktop, where the pane opens beside it; every job on the phone. */
const verlaufZeigen = async ($: $, args: string, isPhone: boolean) => {
  const day = dayFromArgument(args, await now($))
  if (day === null) return 'Versuch /leitstand-verlauf-zeigen, /leitstand-verlauf-zeigen gestern oder /leitstand-verlauf-zeigen 2026-10-06.'
  await showHistory($, day, false)
  const entries = (await read($, historyAtom))?.entries ?? []
  imHintergrund(() => oeffneVerlauf($))
  if (isPhone) return verlaufAlsText(day, entries)
  return `Verlauf für ${germanDay(day)}: ${entries.length} ${entries.length === 1 ? 'Aufgabe' : 'Aufgaben'}. Er ist in der Seitenleiste.`
}

/** Letzter Stand: the pane, and on the phone the checkpoint itself, masked as the pane masks it. */
const letzterStand = async ($: $, isPhone: boolean) => {
  const note = await checkpointOf($).catch(() => null)
  if (note === null) return 'In diesem Chat gibt es noch keinen Sicherungspunkt. Beim Aufräumen wird einer gespeichert.'
  imHintergrund(() => showRecap($))
  if (!isPhone) return 'Der letzte Stand ist in der Seitenleiste.'
  const at = await read($, checkpointAtom)
  const bare = note.replace(/^(Checkpoint|Sicherungspunkt):\s*/, '')
  const text = localTimes((await read($, maskAtom)) ? maskPrivate(bare) : bare)
  return `Letzter Stand${at === null ? '' : `, gespeichert um ${clockTime(at)}`}:\n\n${text}`
}

/** What one of the own commands does, as its button does it; its answer. */
const befehlAusfuehren = async ($: $, name: string, args: string, isPhone: boolean): Promise<string> => {
  switch (name) {
    case 'leitstand-hilfe':
      return befehlsUeberblick()
    case 'leitstand-an':
    case 'leitstand-aus': {
      const isOn = name === 'leitstand-an'
      await setEnabled($, isOn)
      return zustand('Der Leitstand ist', isOn)
    }
    case 'leitstand-tour':
      await update($, enabledAtom, () => true)
      await update($, tourAtom, () => 0)
      return 'Die Begrüßung steht über dem Eingabefeld: Drück Weiter, um sie durchzugehen.'

    case 'leitstand-ansicht-einfach':
    case 'leitstand-ansicht-ausfuehrlich':
    case 'leitstand-ansicht-minimal': {
      const view = name === 'leitstand-ansicht-einfach' ? 'simple' : name === 'leitstand-ansicht-ausfuehrlich' ? 'detailed' : 'minimal'
      await setView($, view)
      return `Die Ansicht ist jetzt ${ANSICHT_WORTE[view]} ${NUR_HIER}.`
    }
    case 'leitstand-arbeitsmodus-auto':
    case 'leitstand-arbeitsmodus-gruppenarbeit': {
      const mode: WorkMode = name === 'leitstand-arbeitsmodus-auto' ? 'auto' : 'dynamisch'
      await setWorkMode($, mode)
      return `Die Arbeitsweise ist jetzt ${WORK_MODE_WORDS[mode]} ${NUR_HIER}.`
    }

    case 'leitstand-plan-starten': {
      const plan = waitingPlanOf(await read($, checklistAtom))
      if (plan === null) return 'Gerade wartet kein Plan auf Start.'
      if (await read($, compactingAtom)) return COMPACTING_WORDS
      if ((await read($, startingAtom)) === plan) return 'Der Plan startet schon.'
      danach($, () => startPlan($))
      return 'Der Plan startet.'
    }
    case 'leitstand-pause':
      if (runningTurn === undefined) return 'Gerade läuft nichts, das sich anhalten ließe.'
      return (await pauseJob($))
        ? 'Pausiert. Mit /leitstand-weiter macht Claude dort weiter, wo es aufgehört hat.'
        : 'Anhalten geht gerade nicht. Drück stattdessen Esc, um zu stoppen.'
    case 'leitstand-weiter':
      if (await read($, compactingAtom)) return COMPACTING_WORDS
      danach($, () => continueJob($))
      return 'Claude macht weiter.'
    case 'leitstand-plan-zeigen': {
      const list = await read($, checklistAtom)
      if (list === null || !list.hasPlan) return 'Noch kein Plan. Bitte Claude um etwas, dann erscheint hier sein Plan.'
      imHintergrund(() => showPlan($))
      return isPhone ? planAlsText(list) : 'Der Plan ist in der Seitenleiste.'
    }
    case 'leitstand-letzter-stand-zeigen':
      return letzterStand($, isPhone)
    case 'leitstand-neuer-chat':
      if (!istJa(args)) {
        return 'Würde eine Übergabenotiz schreiben, diesen Chat leeren und die Notiz als erste Nachricht in den neuen Chat schicken.\nZum Ausführen: /leitstand-neuer-chat ja'
      }
      if ((await read($, handoffAtom)) === 'working') return 'Die Übergabenotiz wird schon geschrieben.'
      danach($, () => startFreshChat($))
      return `Starte einen neuen Chat mit Übergabenotiz…${isPhone ? ' Kommt danach nichts, schreib /leitstand handoff note.' : ''}`
    case 'leitstand-abschliessen':
      if (!(await read($, hasGithubAtom))) return 'Dieses Projekt liegt nicht auf GitHub, darum gibt es hier keinen Push.'
      if (!istJa(args)) {
        return 'Würde die Änderungen aufräumen, committen, einen Pull Request öffnen und nach deiner Freigabe mergen.\nZum Ausführen: /leitstand-abschliessen ja'
      }
      danach($, () => shipIt($))
      return 'Liefere auf GitHub aus…'

    case 'leitstand-verlauf-zeigen':
      return verlaufZeigen($, args, isPhone)
    case 'leitstand-tagesbericht':
      return bericht($, 'day')
    case 'leitstand-wochenbericht':
      return bericht($, 'week')
    case 'leitstand-meine-woche':
      return bericht($, 'mine')

    case 'leitstand-ausfragen':
      return ausfragen($, args, isPhone)
    case 'leitstand-sauberer-code': {
      const answer = skillAntwort('clean-code', await skillLage($, ['clean-code']), isPhone, 'clean-code startet.')
      if (answer.run) danach($, () => runCleanCode($))
      return answer.text
    }
    case 'leitstand-reflexion': {
      const answer = skillAntwort('Reflect', await skillLage($, ['reflect']), isPhone, 'Reflect startet.')
      if (answer.run) danach($, () => runReflect($))
      return answer.text
    }
    case 'leitstand-vermenschlichen':
      return vermenschlichen($, isPhone)
    case 'leitstand-dateibaum': {
      const opened = isPhone ? 'Filetree öffnet sich am Computer; auf dem Handy sind Fenster nicht zu sehen.' : 'Filetree öffnet sich in der Seitenleiste.'
      const answer = skillAntwort('Filetree', await skillLage($, ['filetree']), isPhone, opened)
      if (answer.run) danach($, () => openFiletree($))
      return answer.text
    }
    case 'leitstand-adhs-an': {
      if (await read($, adhdAtom)) return 'Der ADHS-Modus ist schon an.'
      const answer = skillAntwort('Der ADHS-Modus', await skillLage($, ADHD_NAMES), isPhone, `Der ADHS-Modus geht an ${NUR_HIER}: Claude antwortet mit dem nächsten Schritt zuerst.`)
      if (answer.run) danach($, () => toggleAdhd($))
      return answer.text
    }
    case 'leitstand-adhs-aus':
      if (!(await read($, adhdAtom))) return 'Der ADHS-Modus ist schon aus.'
      danach($, () => toggleAdhd($))
      return `Der ADHS-Modus geht aus ${NUR_HIER}.`
    case 'leitstand-fernsteuerung-an':
    case 'leitstand-fernsteuerung-aus':
      return fernsteuerung($, name === 'leitstand-fernsteuerung-an')

    case 'leitstand-verdecken-an':
    case 'leitstand-verdecken-aus': {
      const isOn = name === 'leitstand-verdecken-an'
      await setMasking($, isOn)
      return zustand('Verdecken ist', isOn)
    }
    case 'leitstand-passwortschutz-an':
    case 'leitstand-passwortschutz-aus': {
      const isOn = name === 'leitstand-passwortschutz-an'
      await setGuard($, isOn)
      return zustand('Der Passwortschutz ist', isOn)
    }
    case 'leitstand-geheimnisse-sichern':
      return geheimnisseSichern($, args)

    case 'leitstand-einstellungen-zeigen':
      imHintergrund(() => showSettings($))
      return isPhone
        ? 'Die Einstellungen öffnen sich am Computer; auf dem Handy sind Fenster nicht zu sehen. Umstellen geht hier mit den Befehlen, siehe /leitstand-hilfe.'
        : 'Die Einstellungen sind in der Seitenleiste.'
    case 'leitstand-ton-aus':
    case 'leitstand-ton-signalton':
    case 'leitstand-ton-stimme': {
      const mode = name === 'leitstand-ton-aus' ? 'off' : name === 'leitstand-ton-signalton' ? 'chime' : 'voice'
      await setSound($, mode)
      return mode === 'off' ? `Töne sind jetzt aus ${NUR_HIER}.` : `Töne sind jetzt an, ${mode === 'voice' ? 'Signalton und Stimme' : 'Signalton'} ${NUR_HIER}.`
    }
    case 'leitstand-ton-anhoeren': {
      const sound = await read($, soundAtom)
      if (sound === 'off') return 'Die Töne sind aus. Schalt sie erst ein: /leitstand-ton-signalton oder /leitstand-ton-stimme.'
      void alertSample($, sound).catch(() => undefined)
      return `Spiele ${sound === 'voice' ? 'Signalton und Stimme' : 'den Signalton'} ab${isPhone ? ', zu hören am Computer' : ''}.`
    }
    case 'leitstand-benachrichtigungen-an':
    case 'leitstand-benachrichtigungen-aus': {
      const isOn = name === 'leitstand-benachrichtigungen-an'
      await setNotice($, isOn)
      return zustand('Desktop-Benachrichtigungen sind', isOn)
    }
    case 'leitstand-andere-chats-an':
    case 'leitstand-andere-chats-aus': {
      const isOn = name === 'leitstand-andere-chats-an'
      await setOthers($, isOn)
      return zustand('Die Anzeige anderer Chats ist', isOn)
    }
    case 'leitstand-ruhemodus-an':
    case 'leitstand-ruhemodus-aus': {
      const isOn = name === 'leitstand-ruhemodus-an'
      await setCalm($, isOn)
      return zustand('Der Ruhemodus ist', isOn)
    }
    case 'leitstand-plan-freigeben-an':
    case 'leitstand-plan-freigeben-aus':
      return planFreigeben($, name === 'leitstand-plan-freigeben-an')
    case 'leitstand-github-abschluss-an':
    case 'leitstand-github-abschluss-aus': {
      const isOn = name === 'leitstand-github-abschluss-an'
      await setShipOnGithub($, isOn)
      return zustand('Auf GitHub abschließen ist', isOn)
    }
    case 'leitstand-jetzt-aufraeumen':
      // Not awaited: the compaction it may start runs once this command is done.
      danach($, () => tidyUp($))
      return 'Speichere einen Sicherungspunkt und räume dann den Chat auf.'
    case 'leitstand-zuruecksetzen':
      await resetSettings($)
      return `Alle Leitstand-Einstellungen stehen wieder auf dem Standard ${NUR_HIER}.`
    default:
      return BEFEHL_FEHLER
  }
}

/** Runs one of the own commands: its help with hilfe or ?, else what it does; any failure as a plain sentence. */
const leitstandBefehl = async ($: $, name: string, args: string, isPhone: boolean): Promise<string> => {
  const one = LEITSTAND_BEFEHLE.find(befehl => befehl.name === name)
  if (one === undefined) return BEFEHL_FEHLER
  if (fragtNachHilfe(args)) return befehlsHilfe(one)
  try {
    return await befehlAusfuehren($, name, args.trim(), isPhone)
  } catch {
    return BEFEHL_FEHLER
  }
}

export function registerGlance(on: On, options: PluginOptions = {}): void {
  // What a new chat starts with; a change in the config menu reloads the module with the new values.
  defaults = defaultSettings(options)
  // A chat that ends says so, so the other chats stop mentioning it; its checklist stays for when it is resumed.
  on('session.end', async ($, e, next) => {
    saveTimer?.cancel()
    saveTimer = undefined
    try {
      await saving
      await saveChecklist($, false, e.sessionId)
    } catch {
      // The end goes on: the other chats stop mentioning this one once it falls silent.
    }
    // After /clear or a resume the process goes on as another chat, with no session.start: that one is open, and
    // keeps reading the others.
    // A cleared chat starts without ADHD mode.
    if (e.reason === 'clear') await update($, adhdAtom, () => false).catch(() => undefined)
    // A cleared chat keeps its settings: the next turn keeps them under the new chat id.
    if (e.reason === 'clear') await update($, ownSettingsAtom, own => ({ sid: own?.sid ?? null, values: own?.values ?? {}, carry: true })).catch(() => undefined)
    if (e.reason !== 'clear' && e.reason !== 'resume') {
      hasEnded = true
      othersTimer?.cancel()
      othersTimer = undefined
    }
    return next(e)
  })
  on('session.start', async ($, e, next) => {
    // State outlives a reload: a compaction cut off mid-way must not hold back Start.
    await update($, compactingAtom, () => false)
    // ADHD mode as the transcript left it; a new chat has none.
    const isAdhd = await adhdInTranscript($)
    await update($, adhdAtom, () => isAdhd)
    void findPlatform($)
      .then(found => {
        platform = found
      })
      .catch(() => undefined)
    await adoptGlanceStore($)
    // The welcome shows once, to someone new: anyone with settings or history already knows their way.
    const keys = await $.store.keys()
    if (!keys.includes(TOUR_KEY)) {
      if (keys.every(key => key === ADOPTED_KEY)) await update($, tourAtom, () => 0)
      else await $.store.set(TOUR_KEY, true)
    }
    // Housekeeping first: other chats' settings and checkpoints unused for 30 days go, never this chat's own.
    await tidySettings($).catch(() => undefined)
    // This chat's own settings, or the defaults from the config menu for a new chat; and its own Letzter Stand.
    await followSession($, true).catch(() => undefined)
    const origin = await $.process.run(['git', 'remote', 'get-url', 'origin']).catch(() => ({ exitCode: 1, stdout: '' }))
    await update($, hasGithubAtom, () => origin.exitCode === 0 && /github\.com[:/]/.test(origin.stdout))
    hasEnded = false
    endShipping()
    // Tidying is housekeeping: a store that fails at it must not keep the chat from starting. It never prunes this
    // chat's own checklist, so the restore below still finds it.
    await tidySavedChecklists($).catch(() => undefined)
    othersTimer?.cancel()
    // The same timer reads Remote Control's state, while Leitstand is on.
    othersTimer = $.clock.every(OTHERS_EVERY_MS, () => {
      void refreshOthers($).catch(() => undefined)
      void read($, enabledAtom)
        .then(isOn => (isOn ? readRemote($) : undefined))
        .catch(() => undefined)
    })
    void refreshOthers($).catch(() => undefined)
    void readRemote($)
    // A resumed chat: its checklist comes back. A reload keeps the one it has.
    if ((await read($, checklistAtom)) === null) {
      await restoreChecklist($)
    }
    await splitSharedDays($)
    // The history keeps 30 days.
    for (const key of expiredHistoryKeys(await $.store.keys(), await now($))) {
      await $.store.delete(key)
    }
    await $.tool.register({
      name: 'plan_steps',
      description:
        'Leg alle Schritte des Auftrags vorab fest: 2 bis 8 kurze Namen in einfachem Deutsch, in Reihenfolge. ' +
        'Ruf das auf, bevor du ein anderes Tool nutzt; eine schnelle Antwort ohne Tools braucht keinen Plan. ' +
        'Der erste Schritt beginnt sofort.',
      inputSchema: {
        type: 'object',
        properties: {
          steps: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 },
          sizes: {
            type: 'array',
            items: { type: 'string', enum: ['S', 'M', 'L'] },
            description: 'Eine Größe pro Schritt, in Reihenfolge: S klein, M mittel, L groß.',
          },
        },
        required: ['steps'],
      },
    })
    await $.tool.register({
      name: 'report_progress',
      description:
        'Melde den Fortschritt des aktuellen Schritts unter seinem Namen in einfachem Deutsch. Schick percent 100, sobald ein Schritt ' +
        'fertig ist; dann beginnt der nächste. Ein Name, der nicht im Plan steht, wird ein neuer Schritt.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          percent: { type: 'number', minimum: 0, maximum: 100 },
          summary: {
            type: 'string',
            description:
              'Bei percent 100: ein kurzer Satz in einfachem Deutsch darüber, was der Schritt erledigt hat, für die Person und ihr Team. Keine Dateinamen und kein Code.',
          },
        },
        required: ['task', 'percent'],
      },
    })
    await $.command.register({
      name: 'leitstand',
      description:
        'Den Leitstand steuern: /leitstand on|off, details on|off, sound on|voice|off, notify on|off, others on|off, calm on|off, guard on|off, privacy on|off, approve on|off, arbeitsweise auto|dynamisch, ship on|off, week, tour, pause, continue, plan, checkpoint, settings, tidy [at N|off], history [gestern|JJJJ-MM-TT], handoff',
    })
    // One command of its own for each button and switch; /leitstand stays as the short form. Immediate, like a press:
    // /leitstand-pause has to reach a running turn, and a switch needs no turn at all.
    for (const one of LEITSTAND_BEFEHLE) {
      await $.command
        .register({ name: one.name, description: one.description, immediate: true, ...(one.argumentHint === undefined ? {} : { argumentHint: one.argumentHint }) })
        .catch(() => undefined)
    }
    // A reload drops the module's timers; pick the animation back up.
    syncTicker($, await read($, checklistAtom))

    const started = await next(e)
    // Die Arbeiter der Arbeitsweise Dynamisch, sobald die Sitzung steht.
    await registerTiers($)

    return started
  })

  on('command.run', { command: ['leitstand'] }, async ($, e) => {
    const answer = await (async () => {
      const arg = e.args.trim().toLowerCase()
      if (arg.startsWith('arbeitsweise') || arg.startsWith('modus')) {
        const choice = arg.replace(/^(arbeitsweise|modus)/, '').trim()
        const current = await read($, workModeAtom)
        const mode: WorkMode =
          choice === 'dynamisch' || choice === 'gruppenarbeit'
            ? 'dynamisch'
            : choice === 'auto' || choice === 'auto-mode' || choice === 'auto-modus'
              ? 'auto'
              : current === 'auto'
                ? 'dynamisch'
                : 'auto'
        await setWorkMode($, mode)
        return {
          text:
            mode === 'dynamisch'
              ? 'Gruppenarbeit: Claude plant und prüft, Arbeiter in sechs Stufen von Haiku bis Fable setzen um. Jeder Plan wartet auf deine Freigabe.'
              : 'Auto-Modus: Claude entscheidet selbst, ob und welche Helfer es einsetzt.',
        }
      }
      if (arg.startsWith('sound')) {
        const choice = arg.slice('sound'.length).trim()
        const current = await read($, soundAtom)
        const mode = choice === 'voice' ? 'voice' : choice === 'off' ? 'off' : choice === 'on' || current === 'off' ? 'chime' : 'off'
        await setSound($, mode)
        return {
          text:
            mode === 'off'
              ? 'Töne sind aus.'
              : mode === 'voice'
                ? 'Töne und Stimme sind an: Du hörst, wenn Claude dich braucht, festhängt oder einen langen Auftrag beendet.'
                : 'Töne sind an: ein Signalton, wenn Claude dich braucht, festhängt oder einen langen Auftrag beendet.',
        }
      }
      if (arg.startsWith('calm')) {
        const choice = arg.slice('calm'.length).trim()
        await setCalm($, toggled(choice, await read($, calmAtom)))
        return { text: isCalmMode ? 'Ruhemodus ist an: Nichts bewegt sich, der Status steht fett.' : 'Ruhemodus ist aus.' }
      }
      if (arg.startsWith('guard')) {
        const choice = arg.slice('guard'.length).trim()
        const isOn = toggled(choice, await read($, guardAtom))
        await setGuard($, isOn)
        return {
          text: isOn
            ? 'Der Passwortschutz ist an: Eine Nachricht, die nach Passwort oder Schlüssel aussieht, wird zurückgehalten.'
            : 'Der Passwortschutz ist aus: Jede Nachricht wird so gesendet, wie du sie schreibst.',
        }
      }
      if (arg.startsWith('privacy')) {
        const isOn = toggled(arg.slice('privacy'.length).trim(), await read($, maskAtom))
        await setMasking($, isOn)
        return { text: isOn ? MASKING_WORDS.on : MASKING_WORDS.off }
      }
      if (arg === 'tour') {
        await update($, enabledAtom, () => true)
        await update($, tourAtom, () => 0)
        return { text: 'Die Begrüßung steht über dem Eingabefeld: Drück Weiter, um sie durchzugehen.' }
      }
      if (arg.startsWith('notify')) {
        const choice = arg.slice('notify'.length).trim()
        const isOn = toggled(choice, await read($, noticeAtom))
        await setNotice($, isOn)
        return {
          text: isOn
            ? 'Desktop-Benachrichtigungen sind an: Dein Computer sagt dir Bescheid, wenn Claude dich braucht, festhängt oder einen langen Auftrag beendet.'
            : 'Desktop-Benachrichtigungen sind aus.',
        }
      }
      if (arg.startsWith('others')) {
        const isOn = toggled(arg.slice('others'.length).trim(), await read($, showsOthersAtom))
        await setOthers($, isOn)
        return { text: isOn ? 'Die Leiste nennt einen anderen Chat auf diesem Computer, der dich braucht.' : 'Die Leiste erwähnt keine anderen Chats mehr.' }
      }
      if (arg.startsWith('approve')) {
        const choice = arg.slice('approve'.length).trim()
        const isOn = toggled(choice, await read($, approveAtom))
        await setApprove($, isOn)
        return {
          text: isOn
            ? 'Claude zeigt jetzt erst seinen Plan und wartet: Drück Start oder sag Claude, was sich ändern soll.'
            : 'Claude legt direkt los, sobald der Plan steht.',
        }
      }
      if (arg.startsWith('ship')) {
        const choice = arg.slice('ship'.length).trim()
        if (choice === '') {
          void shipIt($)
          return { text: 'Liefere auf GitHub aus…' }
        }
        const isOn = toggled(choice, await read($, shipOnGithubAtom))
        await setShipOnGithub($, isOn)
        return {
          text: isOn
            ? 'Ein fertiger Auftrag bietet jetzt den Knopf Push an: Commit, Pull Request und Merge, sobald du freigibst.'
            : 'Auf GitHub abschließen ist aus. Fertige Aufträge bleiben auf ihrem Branch.',
        }
      }
      if (arg === 'week') {
        const opened = await showHistory($, dayKey(await now($)), true)
        const view = await read($, historyAtom)
        if (view === null) return { text: 'Noch kein Verlauf.' }
        await showReportSpan($, 'mine')
        const summary = weekSummary(view.myWeekEntries, view.day).split('\n')

        return { text: opened?.isPlaced ? summary[2] ?? summary[0]! : summary.join('\n') }
      }
      if (arg.startsWith('history')) {
        const day = dayFromArgument(arg.slice('history'.length), await now($))
        if (day === null) {
          return { text: 'Versuch /leitstand history, /leitstand history gestern oder /leitstand history 2026-10-06.' }
        }
        const opened = await showHistory($, day, true)
        const entries = (await read($, historyAtom))?.entries ?? []
        const count = `${entries.length} ${entries.length === 1 ? 'Aufgabe' : 'Aufgaben'}`

        return {
          text: opened?.isPlaced
            ? `Verlauf für ${germanDay(day)}: ${count}.`
            : `Verlauf für ${germanDay(day)}: ${count}. Mach das Fenster breiter, um die Seitenleiste zu sehen.`,
        }
      }
      if (arg === 'pause') {
        await pauseJob($)
        return { text: 'Pausiert.' }
      }
      if (arg.startsWith('tidy')) {
        const choice = arg.slice('tidy'.length).trim().replace(/^at\s+/, '').replace('%', '')
        if (choice === '') {
          void tidyUp($)
          return { text: 'Speichere einen Sicherungspunkt und räume dann den Chat auf.' }
        }
        return {
          text: 'Wie voll der Chat ist, zeigt jetzt der Statistik-Mod, und sein Schwamm räumt auf. /leitstand tidy räumt sofort auf, mit Sicherungspunkt.',
        }
      }
      if (arg === 'settings') {
        await showSettings($)
        return { text: 'Die Einstellungen sind in der Seitenleiste.' }
      }
      if (arg === 'checkpoint') {
        if ((await checkpointOf($).catch(() => null)) === null) return { text: 'In diesem Chat gibt es noch keinen Sicherungspunkt. Beim Aufräumen wird einer gespeichert.' }
        await showRecap($)
        return { text: 'Der letzte Stand ist in der Seitenleiste.' }
      }
      if (arg === 'plan') {
        await showPlan($)
        return { text: 'Der Plan ist in der Seitenleiste.' }
      }
      if (arg === 'continue') {
        void continueJob($)
        return { text: 'Mache weiter…' }
      }
      if (arg === 'handoff note') {
        const saved = (await $.store.get(HANDOFF_KEY)) as { note?: string } | undefined
        if (!saved?.note) return { text: 'Noch keine Übergabenotiz gespeichert.' }
        // The phone (Remote Control) shows no prompt box: there the note is the command's answer.
        if (e.origin.kind === 'bridge') return { text: saved.note }
        await $.prompt.fill({ text: saved.note })
        return { text: 'Die letzte Übergabenotiz steht im Eingabefeld.' }
      }
      if (arg === 'handoff') {
        void startFreshChat($)
        // On the phone neither the toasts nor the prompt box show where the note went should sending it fail.
        return {
          text: `Starte einen neuen Chat mit Übergabenotiz…${e.origin.kind === 'bridge' ? ' Kommt danach nichts, schreib /leitstand handoff note.' : ''}`,
        }
      }
      if (arg.startsWith('details')) {
        const choice = arg.slice('details'.length).trim()
        const isDetailed = toggled(choice, (await read($, detailAtom)) === 'detailed')
        await setDetail($, isDetailed)

        return { text: isDetailed ? 'Leitstand-Details sind an.' : 'Leitstand-Details sind aus.' }
      }
      const isEnabled = toggled(arg, await read($, enabledAtom))
      await setEnabled($, isEnabled)

      return { text: isEnabled ? 'Der Leitstand ist an.' : 'Der Leitstand ist aus.' }
    })()
    // Only this answer gets "(gemeldet vom Mod Leitstand)" in its stored row (session.append below).
    lastOwnAnswer = answer.text
    return answer
  })

  // The own commands /leitstand-…: their answer, like /leitstand's, gets "(gemeldet vom Mod Leitstand)" in its stored row.
  on('command.run', { command: [...LEITSTAND_BEFEHL_NAMEN] }, async ($, e) => {
    const text = await leitstandBefehl($, e.command, e.args ?? '', e.origin?.kind === 'bridge')
    lastOwnAnswer = text
    return { text }
  }).catch(() => {
    lastOwnAnswer = BEFEHL_FEHLER
    return { text: BEFEHL_FEHLER }
  })

  // The engine puts the names of the plugins hooking a command before its answer. The Leitstand takes its own out of the
  // stored row and, below its own answer, says where it came from. Its hook on every command (passwords from the phone)
  // makes it a party to the commands of other mods too: there it only takes its name out.
  on('session.append', { door: 'command', message: { type: 'system', name: 'local_command' } }, async ($, e, next) => {
    const own = lastOwnAnswer
    const content = e.message.content.map(b => {
      if (b.type !== 'text' || typeof b.text !== 'string') return b
      const isOwn = own !== null && answerOf(b.text) === own.trim()
      if (isOwn) lastOwnAnswer = null
      return { ...b, text: ohneVorsatz(b.text, PLUGIN, isOwn ? GEMELDET : null) }
    })
    return next({ ...e, message: { ...e.message, content } })
  }).catch(($, e, next) => next(e))

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await read($, enabledAtom))) {
      return composed
    }

    const checkpoint = await checkpointOf($).catch(() => null)
    const isDynamicMode = (await read($, workModeAtom)) === 'dynamisch'

    return {
      sections: [
        ...composed.sections,
        { id: `${PLUGIN}:checklist`, text: PROMPT_SECTION, scope: 'session' as const },
        ...(isDynamicMode ? [{ id: `${PLUGIN}:dynamisch`, text: DYNAMIC_SECTION, scope: 'session' as const }] : []),
        // Saved before the chat was tidied up: what the work needs to carry on.
        ...(checkpoint === null
          ? []
          : [{ id: `${PLUGIN}:checkpoint`, text: `# Sicherungspunkt, gespeichert, bevor dieser Chat aufgeräumt wurde\n${checkpoint}`, scope: 'session' as const }]),
      ],
    }
  })

  // Passwords and keys pasted into a message stay on this computer unless sent twice. From the phone (Remote Control),
  // where no toast and no prompt box shows a held message, the message goes on without them and Claude says so.
  // ADHD mode follows what is sent, the button's own words included: the skill's call turns it on, "stop adhd mode" or
  // "normal mode" off. A message held back changes nothing.
  on('prompt.submit', async ($, e, next) => {
    const says = e.command ? (isAdhdCommand(e.command.name) ? true : null) : e.isMeta ? null : adhdSays(e.text)
    const send = async (sent: typeof e = e) => {
      const result = await next(sent)
      if (says !== null && !('drop' in result)) await update($, adhdAtom, () => says)
      return result
    }
    if (e.origin.kind === 'plugin' || !(await read($, guardAtom))) {
      return send()
    }
    const kinds = findSecrets(e.text)
    if (kinds.length === 0) {
      return send()
    }
    // A slash command keeps its text whatever a hook rewrites: one from the phone goes on here, and its arguments lose
    // the secret at command.run, before the command runs.
    if (e.origin.kind === 'bridge') {
      if (e.command) return send()
      return send({ ...e, text: removeSecrets(e.text), context: [...(e.context ?? []), SECRET_REMOVED_NOTE] })
    }
    const held = heldMessage
    if (held !== null && held.text === e.text && (await now($)) - held.at < RESEND_WINDOW_MS) {
      heldMessage = null
      return send()
    }
    await holdSecretMessage($, e.text, kinds)

    return { drop: 'Die Nachricht sah aus, als enthielte sie ein Passwort oder einen Schlüssel, deshalb hat der Leitstand sie zurückgehalten.' }
  })

  // A slash command from the phone (Remote Control) runs without the password in its arguments, and Claude says so.
  on('command.run', async ($, e, next) => {
    if (e.origin?.kind !== 'bridge' || findSecrets(e.args).length === 0 || !(await read($, guardAtom))) {
      return next(e)
    }
    const result = await next({ ...e, args: removeSecrets(e.args) })
    return { ...result, context: [...(result.context ?? []), SECRET_REMOVED_NOTE] }
  }).catch(($, e, next) => {
    // Should the hook fail, a command from the phone still runs without the password.
    if (e.origin?.kind !== 'bridge') return next(e)
    let args: string
    try {
      args = removeSecrets(e.args)
    } catch {
      return next(e)
    }
    return next({ ...e, args })
  })

  // While the shield tidies up, what the main chat's compaction leaves has the moved secrets as placeholders only: the
  // summary and the messages it keeps, their tool inputs and results included.
  on('session.compact', async ($, e, next) => {
    // The main chat's compaction (not the one worked out ahead in the background) holds back what is sent: the band
    // says so and offers no Start or Continue meanwhile.
    const isBlocking = e.agentId === undefined && e.trigger !== 'precompute'
    if (isBlocking) await update($, compactingAtom, () => true)
    const result = await (async () => {
      try {
        return await next(e)
      } finally {
        if (isBlocking) {
          await update($, compactingAtom, () => false)
          // A Start on its way may have been lost with the queue: Start is free again.
          await update($, startingAtom, () => null)
        }
      }
    })()
    if (pendingVault !== null && (await now($)) > pendingVault.until) pendingVault = null
    if (pendingVault === null || e.agentId !== undefined || result.skip !== undefined) return result
    const secrets = pendingVault.secrets

    return { ...result, messages: result.messages.map(one => withoutSecrets(one, secrets)) }
  })

  on('session.measure', async ($, e, next) => {
    const top = [...e.rateLimits].sort((a, b) => b.percentUsed - a.percentUsed)[0]
    await measureUsage($, {
      limits: e.rateLimits.map(one => ({ label: LIMIT_LABEL[one.kind] ?? one.kind, percent: one.percentUsed })),
      limitPercent: top ? top.percentUsed : null,
      limitLabel: top ? (LIMIT_LABEL[top.kind] ?? top.kind) : null,
      limitResetsAt: top?.resetsAt ?? null,
      contextPercent: e.context.percent ?? null,
      costUsd: e.cost?.usd ?? null,
    })

    return next(e)
  })

  // Personal details and secrets stay off the screen; what Claude reads is unchanged.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const masked = (await isMasking($)) ? maskPrivate(e.props.text) : e.props.text

    return masked === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text: masked } })
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const masked = (await isMasking($)) ? maskPrivate(e.props.text) : e.props.text

    return masked === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text: masked } })
  })

  // A slash command's output row too, as drawn; the stored row keeps what the model reads.
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const masked = (await isMasking($)) ? maskPrivate(e.props.text) : e.props.text

    return masked === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text: masked } })
  })

  // The footer keeps progress in view even when the checklist is shrunk. Its words are plain text, so only the
  // terminal, whose glyphs are the band's own, gets a mark in front.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const list = (await read($, enabledAtom)) ? await read($, checklistAtom) : null
    const mark = (glyph: string) => (e.surface === 'terminal' ? `${glyph} ` : '')
    if (list !== null && list.phase === 'background') {
      const running = list.helpers.filter(one => one.status === 'running').length
      return next({ ...e, props: { ...e.props, modes: [`${mark('◷')}${running} im Hintergrund`, ...e.props.modes] } })
    }
    if (list === null || !list.hasPlan || list.phase === 'done' || list.phase === 'stopped') {
      return next(e)
    }
    const at = await now($)
    const active = list.tasks.find(one => one.status === 'active')
    const activePercent = active ? stepEstimate(list, active, at).percent : undefined
    const left = timeLeft(list, at, activePercent)
    const label = `${mark('◎')}${overallProgress(list.tasks, activePercent).percent}%${left === null ? '' : ` · noch etwa ${formatLeft(left)}`}`

    return next({ ...e, props: { ...e.props, modes: [label, ...e.props.modes] } })
  })

  // Subagents: what they work on and which model, under the step that started them.
  // Arbeitsweise: die Arbeiter nur in Dynamisch. Dort bietet der Leitstand außer ihnen nur Explore und die kleinen
  // Helfer der Engine an, damit jede Aufgabe eine Stufe bekommt.
  on('agent.offer', async ($, e, next) => {
    const offered = await next(e)
    const dynamic = await isDynamic($)
    if (isTierAgent(e.agent)) return dynamic ? offered : { isOffered: false }
    if (dynamic && !DYNAMIC_ALSO.has(e.agent)) return { isOffered: false }
    return offered
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.agentId !== undefined && e.parentAgentId === undefined) {
      await addHelper($, {
        id: started.agentId,
        kind: 'helper',
        label: cleanName(e.description, MAX_DETAIL),
        type: e.subagentType,
        model: prettyModel(started.model),
        effort: null,
        status: 'running',
        tokens: 0,
      })
    }

    return started
  })

  // Each model request of a subagent says its model and effort.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      await noteHelperStep($, e.agentId, e.model, e.effort)
    }
    const stream = next(e)
    for await (const chunk of stream) {
      noteSign($)
      yield chunk
    }
    const result = await stream.result
    if (result.usage) {
      await addTokens($, e.agentId, result.usage)
    }

    return result
  })

  // At the end of each turn the engine lists what still runs in the background.
  on('classic.Stop', async ($, e, next) => {
    const tasks = (e.background_tasks ?? []).filter(one => one.type !== 'subagent')
    await change($, current => {
      const listed = { ...current, helpers: reconcileBackground(current, tasks) }
      // Background work Claude waits for: it is still working, nothing for the person to do.
      return listed.phase === 'needsYou' && listed.needsYouReason === WAITING && isBusy(listed)
        ? { ...listed, phase: 'working', needsYouReason: null }
        : listed
    })
    await settleFinished($, await now($), false)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // No main turn runs during a compaction: one that starts means it is over.
    if (e.agentId === undefined && (await read($, compactingAtom))) await update($, compactingAtom, () => false)
    if (e.agentId === undefined) void readRemote($)
    // After /clear or a resume in this process the chat id changed: its settings follow.
    if (!e.agentId) void followSession($).catch(() => {})
    runningTurn = e.turnId
    noteSign($)
    const text = ownWords(e.text)
    // Ship it, on a turn the person started (not a continuation or a slash command). Only the exact reply
    // "Approve merge <SHA>" to a pending request approves that head commit. Any other reply declines it: the pull
    // request stays open, the guard holds for that whole turn, and Ship it ends with it. A later turn of the person's
    // own, with nothing pending and no failed merge to retry, means they moved on, and Ship it ends.
    approvedSha = null
    if (isShipping && text && !text.startsWith('/')) {
      const pending = askedSha
      askedSha = null
      if (pending !== null) {
        isDeclining = text !== `Merge freigeben ${pending}` && text !== `Approve merge ${pending}`
        if (!isDeclining) approvedSha = pending
      } else if (isShipTurnNext) {
        isShipTurnNext = false
      } else if (!hasFailedMerge && text !== CONTINUE_TEXT && !isContinueWords(text)) {
        endShipping()
      }
    }
    // The person moved on: the tidy-up note has done its job.
    if (text && (await read($, recapAtom))) {
      await update($, recapAtom, () => false)
    }
    const current = await read($, checklistAtom)
    // A go-ahead in the message that starts the person's turn also approves a plan Claude makes in this turn. A
    // helper's turn starts with its brief, which is no go-ahead of the person's: it leaves the main chat's alone.
    // A clear request to carry out work, worded any way ("setz b) um"), approves too: a plan that waits for Start, or
    // one Claude makes in reply to its own question or choice. A new request out of the blue does not, so its plan waits.
    const isMainTurn = e.agentId === undefined
    if (isMainTurn) {
      // A question in the box counts for the turn it was asked in only.
      hasAskedInBox = false
      if (!knowsLastAnswer) {
        knowsLastAnswer = true
        hasAskedLast = await askedInTranscript($, e.text)
      }
      const isAnswering = current?.approval === 'waiting' || hasAskedLast
      isApprovingTurn = !text.startsWith('/') && (text === START_TEXT || isStartWords(text) || (isAnswering && saysDo(text)))
    }
    if (current !== null && current.approval === 'waiting' && isMainTurn && isApprovingTurn) {
      // Start, or "go ahead" typed: the plan is approved and the same job goes on. The go-ahead is used up on it.
      isApprovingTurn = false
      await change($, list => ({ ...list, approval: 'approved', phase: 'working', needsYouReason: null, isCollapsed: false }))
      // The plan runs: Start is gone, and nothing is on its way any more.
      await update($, startingAtom, () => null)
    } else if (current !== null && (text === CONTINUE_TEXT || (isContinueWords(text) && !isFinished(current)))) {
      // The Continue button, or "continue" typed: the same job picks up again.
      await change($, list => ({
        ...list,
        phase: 'working',
        stopKind: null,
        stuckReason: null,
        needsYouReason: null,
        finishedAt: null,
        isCollapsed: false,
      }))
    } else if (text && !text.startsWith('/')) {
      const list = current
      if (list === null || isFinished(list) || list.phase === 'stopped' || list.phase === 'background') {
        await startJob($, text, e.turnId)
      } else {
        await setWorking($)
      }
    } else if (!text && current !== null) {
      // Claude woke up on its own (a helper or background task finished): it is working again.
      await setWorking($)
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // The MCP tool table makes `e` a union too wide to narrow here; read the envelope plainly.
    const call = e as unknown as {
      tool: string
      tool_use_id: string
      todos?: ReadonlyArray<{ content: string; status: string }>
      subject?: string
      taskId?: string
      status?: string
    }
    const tool = String(call.tool)
    const isMain = e.agentId === undefined
    noteSign($)
    const fileField = FILE_TOOLS[tool]
    const filePath = fileField ? String((e as unknown as Record<string, unknown>)[fileField] ?? '') : ''
    // Only Write can create a file; asked before it runs.
    const isNewFile = filePath !== '' && tool === 'Write' && !(await $.fs.exists(filePath).catch(() => true))

    if (tool === PLAN_TOOL) {
      const input = e as unknown as { steps?: unknown; sizes?: unknown }
      const steps = (Array.isArray(input.steps) ? input.steps : []).map(one => cleanName(one)).slice(0, 8)
      const sizes = Array.isArray(input.sizes) ? input.sizes : []
      if (steps.length === 0) {
        return { deny: 'plan_steps braucht 2 bis 8 Schrittnamen.' }
      }
      const tasks = settle(steps.map((name, index) => task(name, 'upcoming', `plan#${index}`, sizeOf(sizes[index]))))
      const started = await now($)
      const known = await read($, checklistAtom)
      const paceMs = known === null ? await learnPace($) : known.paceMs
      await update($, checklistAtom, (list): GlanceChecklist => ({
        paceMs: list?.paceMs ?? paceMs,
        planAt: list?.hasPlan ? (list.planAt ?? started) : started,
        plannedCount: list?.hasPlan ? list.plannedCount : steps.length,
        extraTokens: list?.extraTokens ?? 0,
        extraCachedTokens: list?.extraCachedTokens ?? 0,
        stopKind: null,
        activity: null,
        approval: planApproval(list, steps),
        costAtStart: list?.costAtStart ?? null,
        title: list?.title ?? 'Arbeitet daran',
        startedAt: list?.startedAt ?? started,
        jobId: list?.jobId ?? call.tool_use_id,
        finishedAt: null,
        isCollapsed: false,
        needsYouReason: null,
        stuckReason: null,
        phase: 'working',
        hasPlan: true,
        tasks: stampTimes(carryTokens(list?.tasks ?? [], tasks), started),
        helpers: list?.helpers ?? [],
      }))
      syncTicker($, await read($, checklistAtom))
      saveSoon($)
      if (await holdForApproval($)) {
        return {
          result:
            `${steps.length} Schritte geplant. Die Person gibt Pläne frei, bevor die Arbeit beginnt: Hör jetzt auf und warte auf ihre Antwort. ` +
            'Nutze noch keine anderen Tools. Wünscht sie Änderungen, leg den neuen Plan mit plan_steps an. ' +
            // On the phone (Remote Control) the band with the plan and Start does not show: the answer carries both.
            `Nenne in deiner Antwort die Schritte nummeriert (${steps.map((one, at) => `${at + 1}. ${one}`).join('; ')}) und schließ mit dem Satz: ` +
            'Ich warte auf deine Freigabe: Schreib „los“ oder sag, was sich ändern soll.' +
            (await nightStartNote($)),
        }
      }

      return { result: `${steps.length} Schritte geplant. Der erste hat begonnen.` }
    }

    if (tool === PROGRESS_TOOL) {
      const input = e as unknown as { task?: unknown; percent?: unknown; summary?: unknown }
      const percent = Math.min(100, Math.max(0, Math.round(Number(input.percent) || 0)))
      const rawName = String(input.task ?? '')
      const summary = percent === 100 && String(input.summary ?? '').trim() ? cleanName(input.summary, MAX_SUMMARY) : null
      await change($, list => {
        // Without a step name the report is about the step under way, not a new "Arbeitet daran".
        const name = progressName(list.tasks, rawName)

        return {
          ...list,
          tasks: applyProgress(list.tasks, rawName, percent).map(one =>
            summary !== null && one.name.toLowerCase() === name.toLowerCase() ? { ...one, summary } : one,
          ),
          activity: percent === 100 ? null : list.activity,
        }
      })

      return { result: `Fortschritt notiert: ${percent}%.` }
    }

    // Ship it merges only the head commit the person approved, never past branch protection; helpers too.
    let isMerging = false
    if (isMcpMergeAction(tool) && isShipping && (await read($, enabledAtom))) {
      return {
        deny:
          'Ausliefern mergt nur mit gh pr merge --squash --delete-branch --match-head-commit <freigegebene SHA> als eigenem ' +
          'Befehl, nie über ein MCP-Tool. Lass den Pull Request offen.',
      }
    }
    if ((tool === 'Bash' || tool === 'PowerShell') && isShipping && (await read($, enabledAtom))) {
      const command = String((e as unknown as { command?: unknown }).command ?? '')
      // PowerShell quotes, escapes and spells commands unlike Bash, so it has its own stricter rule.
      const isPowerShell = tool === 'PowerShell'
      const denied = isPowerShell ? unsafePowerShellMerge(command, approvedSha) : unsafeMerge(command, approvedSha)
      if (denied !== null) return { deny: denied }
      isMerging = isPowerShell ? runsPowerShellMerge(command) : runsPrMerge(command)
    }

    if (!isMain) {
      // One approval, one merge attempt: used up as the merge runs, so even a failed one needs a fresh approval.
      if (isMerging) approvedSha = null
      const ran = await next(e)
      if (isMerging) noteMerge(ran)
      if (filePath !== '' && ran.deny === undefined && !ran.isError) {
        await noteFile($, filePath, isNewFile)
      }

      return ran
    }

    const isEnabled = await read($, enabledAtom)
    const list = await read($, checklistAtom)
    if (isEnabled && !ALWAYS_ALLOWED.has(tool) && !list?.hasPlan) {
      return {
        deny: `Ruf zuerst ${PLAN_TOOL} auf, um den Plan in einfachem Deutsch festzulegen (lade es mit ToolSearch, falls es deferred ist), und versuch es dann noch mal.`,
      }
    }

    if (isEnabled && list?.approval === 'waiting' && !ALWAYS_ALLOWED.has(tool)) {
      return {
        deny:
          'Die Person hat den Plan noch nicht freigegeben. Hör auf und warte auf ihre Antwort. ' +
          'Sag in deiner Antwort, dass der Plan wartet und „los“ ihn freigibt.' +
          (await nightStartNote($)),
      }
    }

    if (isEnabled && (await read($, workModeAtom)) === 'dynamisch') {
      if (tool === 'Agent' || tool === 'Task') {
        const type = String((e as unknown as { subagent_type?: unknown }).subagent_type ?? 'general-purpose')
        if (!isTierAgent(type) && !DYNAMIC_ALSO.has(type)) {
          return {
            deny: `Gruppenarbeit: Gib jede Aufgabe einem Arbeiter mit Stufe (${TIERS.map(tierAgent).join(', ')}) oder nimm Explore für breite Suchen.`,
          }
        }
      }
      if (fileField !== undefined && list?.helpers.some(one => one.kind === 'helper' && one.status === 'running')) {
        return {
          deny: 'Gruppenarbeit: Solange Arbeiter laufen, änderst du keine Dateien selbst. Bereite den nächsten Auftrag oder deine Prüfung vor und warte auf ihre Ergebnisse.',
        }
      }
    }

    if (tool === 'AskUserQuestion') {
      await setNeedsYou($, QUESTION)
    } else if (list?.phase === 'needsYou') {
      await setWorking($)
    }
    // What Claude is doing right now, in plain words, under the current step.
    const doing = activityOf(tool, e as unknown as { command?: unknown })
    if (doing !== null && list !== null) {
      const input = e as unknown as { description?: unknown; command?: unknown; file_path?: unknown; notebook_path?: unknown; url?: unknown }
      // Claude's own one-line description of the call, when it gave one: a fuller sentence than the label.
      const detail = typeof input.description === 'string' && input.description.trim() ? cleanName(input.description, MAX_DETAIL) : null
      const target = activityTarget(input)
      await change($, current => ({
        ...current,
        activity: {
          label: doing,
          count: current.activity?.label === doing ? current.activity.count + 1 : 1,
          detail,
          target,
        },
      }))
    }

    // Past every check above, so a refusal here never uses up the approval.
    if (isMerging) approvedSha = null
    const ran = await next(e)
    if (isMerging) noteMerge(ran)
    noteSign($)
    // wrap_up's `ask` shows in a box under the answer: Claude asked the person, as with a question in the answer.
    if (ran.deny === undefined && !ran.isError && tool.endsWith('wrap_up')) {
      const ask = (e as unknown as { ask?: unknown }).ask
      if (typeof ask === 'string' && ask.trim() !== '') hasAskedInBox = true
    }

    if (ran.deny !== undefined) {
      return ran
    }
    // The person said no at the permission dialog.
    if (ran.isError && /doesn't want to proceed|user (has )?(rejected|denied|declined)/i.test(String(ran.text ?? ''))) {
      failuresInARow = 0
      await setStuck($, DENIED)

      return ran
    }
    if (ran.isError) {
      failuresInARow += 1
      if (failuresInARow >= 3) {
        await setStuck($, FAILING)
      }

      return ran
    }

    failuresInARow = 0
    await setWorking($)
    if (filePath !== '') {
      await noteFile($, filePath, isNewFile)
    }

    if (tool === 'TodoWrite' && call.todos) {
      const todos = call.todos
      const planned = await now($)
      await change($, current => ({
        ...current,
        hasPlan: true,
        planAt: current.planAt ?? planned,
        plannedCount: current.hasPlan ? current.plannedCount : todos.length,
        tasks: todosToTasks(todos, current.tasks),
      }))
      await holdForApproval($)
    } else if (tool === 'TaskCreate') {
      const created = (ran.result as { task?: { id?: string } } | undefined)?.task
      const id = `task#${created?.id ?? call.tool_use_id}`
      const planned = await now($)
      await change($, current => {
        const newTask = task(cleanName(call.subject), 'upcoming', id)
        const tasks = current.hasPlan
          ? settle([...current.tasks, newTask])
          : carryTokens(current.tasks, settle([newTask]))
        // Tasks created before any is finished are the first plan, not growth.
        const isFirstPlan = !tasks.some(one => one.status === 'done')

        return {
          ...current,
          hasPlan: true,
          planAt: current.planAt ?? planned,
          plannedCount: isFirstPlan ? tasks.length : current.plannedCount,
          tasks,
        }
      })
      await holdForApproval($)
    } else if (tool === 'TaskUpdate') {
      const id = `task#${call.taskId}`
      const status = call.status
      await change($, current => ({
        ...current,
        tasks: settle(
          current.tasks.flatMap(one => {
            if (one.id !== id) {
              return [one]
            }
            if (status === 'deleted') {
              return []
            }
            const name = call.subject ? cleanName(call.subject) : one.name
            if (status === 'completed') {
              return [{ ...one, name, status: 'done' as const, percent: 100, hasReported: true }]
            }
            if (status === 'in_progress') {
              return [{ ...one, name, status: 'active' as const }]
            }
            return [{ ...one, name, status: status === 'pending' ? ('upcoming' as const) : one.status }]
          }),
        ),
      }))
    }

    return ran
  })

  on('classic.Notification', async ($, e, next) => {
    const kind = String(e.notification_type ?? '')
    if (/permission/i.test(kind)) {
      await setNeedsYou($, PERMISSION)
    } else if (/elicitation|question/i.test(kind)) {
      await setNeedsYou($, QUESTION)
    }

    return next(e)
  })

  on('classic.StopFailure', async ($, e, next) => {
    await setStuck($, apiErrorSentence(String(e.error), e.error_details ?? ''))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      await finishHelper($, e.agentId, e.reason === 'answer' ? 'done' : 'failed')
      return next(e)
    }
    void readRemote($)
    const finished = await now($)
    if (isStalled) {
      isStalled = false
      await setWorking($)
    }
    const list = await read($, checklistAtom)
    runningTurn = undefined
    isApprovingTurn = false
    hasAskedLast = e.reason === 'answer' && (hasAskedInBox || offersChoice(e.answer ?? ''))
    knowsLastAnswer = true
    hasAskedInBox = false
    const wasPaused = isPausing
    isPausing = false
    // Ship it's merge request: the exact head commit asked about stays pending until the person replies, and an
    // approval lasts only for the turn it started. A declining turn ends Ship it, even if Claude asks again in it;
    // Esc ends it too, Pause does not.
    const asked = isShipping && e.reason === 'answer' ? askedMergeSha(e.answer ?? '') : null
    if (asked !== null) askedSha = asked
    approvedSha = null
    if (isDeclining || (e.reason === 'aborted' && !wasPaused)) endShipping()
    isDeclining = false

    if (list !== null) {
      await change($, current => (current.activity === null ? current : { ...current, activity: null }))
      if (wasPaused) {
        await change($, current => ({
          ...current,
          phase: 'stopped',
          stopKind: 'pause',
          needsYouReason: null,
          finishedAt: finished,
        }))
      } else if (e.reason === 'error') {
        // StopFailure may already have named the cause; keep its sentence.
        if (list.phase !== 'stuck') {
          await setStuck($, apiErrorSentence('unknown'))
        }
      } else if (e.reason === 'refusal') {
        await setStuck($, 'Claude konnte bei dieser Anfrage nicht helfen')
      } else if (list.phase === 'stuck' && list.stuckReason === DENIED) {
        // Keep the explanation of why Claude paused.
      } else if (e.reason === 'aborted') {
        await change($, current => ({ ...current, phase: 'stopped', stopKind: 'esc', needsYouReason: null, finishedAt: finished }))
      } else if (list.hasPlan && hasUnfinishedWork(list.tasks)) {
        // A helper still running means Claude waits for it, not for the person.
        const asked = questionOf(e.answer ?? '')
        await change($, current =>
          isBusy(current)
            ? current
            : { ...current, phase: 'needsYou', needsYouReason: current.approval === 'waiting' ? APPROVE : WAITING, question: asked },
        )
      } else {
        await change($, current => ({
          ...current,
          // A quick answer needed no plan: one plain step instead of the placeholders.
          tasks: current.hasPlan ? current.tasks : carryTokens(current.tasks, [task('Beantworte deine Frage', 'done')]),
        }))
        // A finished job whose last message asks something, or asks to approve a merge, still waits for the person.
        const asked = askedSha !== null ? `Antworte genau: Merge freigeben ${askedSha}` : questionOf(e.answer ?? '')
        const isAsking = askedSha !== null || asksQuestion(e.answer ?? '')
        await change($, current => ({
          ...current,
          phase: isAsking ? 'needsYou' : 'done',
          needsYouReason: isAsking ? QUESTION : null,
          question: asked,
          stuckReason: null,
          finishedAt: finished,
          tasks: current.tasks.map(one => ({ ...one, status: 'done' as const, percent: 100, hasReported: true })),
        }))
        // Helpers or background tasks still running keep the job open.
        await settleFinished($, finished, true)
      }
      await recordJob($)
    }

    return next(e)
  })

  // Simple hides the tool rows; Details keeps them, for people who want the code next to the checklist. The phone
  // (Remote Control) keeps them too: it has no band to stand in for them.
  // Where they show, masking covers the strings in a call's input and result; their shape stays as the tool's.
  on('ui.render', { component: ['ToolUse', 'ToolResult', 'ToolGroup'] }, async ($, e, next) => {
    if (e.surface === 'mobile' || !(await read($, enabledAtom)) || (await read($, detailAtom)) === 'detailed') {
      if (e.component === 'ToolGroup' || !(await isMasking($))) return next(e)
      if (e.component === 'ToolUse') {
        const input = maskDeep(e.props.input)
        const output = maskDeep(e.props.output)
        return input === e.props.input && output === e.props.output ? next(e) : next({ ...e, props: { ...e.props, input, output } })
      }
      const output = maskDeep(e.props.output)
      return output === e.props.output ? next(e) : next({ ...e, props: { ...e.props, output } })
    }
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) =>
    (await read($, enabledAtom)) && (await read($, detailAtom)) !== 'detailed'
      ? next({ ...e, props: { ...e.props, hint: '' } })
      : next(e),
  )

  // The day's history of this project, for a retro.
  // Every choice in one place. Each group shows what is picked on its right, and a line on what that choice does.
  on('ui.render', { component: 'Pane', requestId: SETTINGS_PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const kit = kitOf(table, e.surface)
    const vector = kit.isVector
    const isEnabled = await read($, enabledAtom)
    const view = !isEnabled ? 'off' : await read($, detailAtom)
    const sound = await read($, soundAtom)
    const isCalm = await read($, calmAtom)
    const isNoticing = await read($, noticeAtom)
    const showsOthers = await read($, showsOthersAtom)
    const isGuarded = await read($, guardAtom)
    const masks = await read($, maskAtom)
    const approves = await read($, approveAtom)
    const workMode = await read($, workModeAtom)
    const ships = await read($, shipOnGithubAtom)
    const checkpointAt = await read($, checkpointAtom)
    const columns = Math.max(30, e.props.bodyColumns)
    const rule = '─'.repeat(Math.min(columns, 64))

    // A choice: elsewhere than the terminal the app's own menu, which says what is picked and lists the rest, so no
    // filled button can read as "press me". The terminal draws buttons and marks the picked one ●.
    const Select = vector && 'Select' in table ? table.Select : undefined
    const choice = <T extends string | number>(key: string, options: [T, string][], picked: T, onPick: (value: T) => Promise<void>) =>
      Select ? (
        <Box key={`${key}-choices`} flexDirection="row">
          <Select
            key={`${key}-menu`}
            value={String(picked)}
            options={options.map(([value, label]) => ({ value: String(value), label }))}
            onSelect={value => {
              const found = options.find(([option]) => String(option) === value)
              if (found) void onPick(found[0])
            }}
          />
        </Box>
      ) : (
      <Box key={`${key}-choices`} flexDirection="row" alignItems="center" gap={1} flexWrap="wrap">
        {options.map(([value, label]) => (
          <Button
            key={`${key}-${value}`}
            label={vector ? label : value === picked ? `● ${label}` : `○ ${label}`}
            variant={value === picked ? 'primary' : 'secondary'}
            onPress={() => onPick(value)}
          />
        ))}
      </Box>
    )
    // A group: its icon and title, the choice, a line on what the choice does. On the terminal the title row also
    // says what is picked, on its right. A group whose choice names itself (title null) has no title row.
    const group = (key: string, icon: IconName, title: string | null, picked: string, control: RenderChildren, help: string, extra?: RenderChildren) =>
      vector ? (
        // A settings row as the Mac draws one: the name on the left, its menu on the right, what it does below.
        // Its mark says Setting: the name follows in bold, so a screen reader hears it once.
        <Box key={key} flexDirection="row" gap={1} marginTop={2} width={columns}>
          {kit.icon(icon, 'quiet', 'Einstellung')}
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} gap={Select ? 0 : 1}>
            <Box flexDirection={Select ? 'row' : 'column'} alignItems={Select ? 'center' : undefined} justifyContent="space-between" columnGap={2} rowGap={1}>
              {title !== null && <Text bold>{title}</Text>}
              {control}
            </Box>
            <Box marginTop={Select ? 1 : 0}>
              <Text dimColor wrap="wrap">
                {help}
              </Text>
            </Box>
            {extra}
          </Box>
        </Box>
      ) : (
        <Box key={key} flexDirection="column" marginTop={1}>
          {title !== null && (
            <Box flexDirection="row" justifyContent="space-between" width={Math.min(columns, 64)}>
              <Text bold>{title}</Text>
              <Text color="cyan">{picked}</Text>
            </Box>
          )}
          {control}
          <Text dimColor wrap="wrap">
            {help}
          </Text>
          {extra}
        </Box>
      )

    const viewHelp = {
      simple: 'Die Schritte und der Fortschritt in einfachen Worten, ohne Tool-Details. Für alle.',
      detailed: 'Dazu Zeit, Modelle und Tokens pro Schritt, mit dem Code im Blick. Für Entwickler.',
      minimal: 'Nur eine Zeile über dem Eingabefeld: was gerade passiert, wie viele Schritte fertig sind, die geschätzte Restzeit und die bisher genutzten Tokens.',
      off: 'Claude Code wie gewohnt: keine Checkliste, alle Tool-Zeilen sichtbar. Der Passwortschutz behält seine eigene Einstellung.',
    }[view]
    const soundHelp = {
      off: 'Keine Töne. Schalte sie ein, wenn du wegschauen willst, während Claude arbeitet.',
      chime: 'Ein kurzer Signalton, wenn Claude dich braucht, festhängt oder einen Auftrag beendet, der länger als eine Minute gedauert hat.',
      voice: 'Der Signalton und ein paar Worte wie "Claude braucht dich".',
    }[sound]
    const tidyHelp =
      'Claude speichert vor dem Aufräumen einen Sicherungspunkt der Arbeit (Ziel, was erledigt und was offen ist, Entscheidungen, nächster Schritt), damit beim Verdichten nichts Wichtiges verloren geht. Wie voll der Chat ist, zeigt der Statistik-Mod; sein Schwamm räumt genauso auf.'

    return (
      <Box flexDirection="column" width={columns}>
        {vector ? (
          // The app titles the panel; the body starts with how changes behave.
          <Text dimColor wrap="wrap">
            Änderungen gelten sofort, nur in diesem Chat. Den Standard für neue Chats stellst du im Einstellungsmenü ein.
          </Text>
        ) : (
          <Box flexDirection="column">
            <Text bold>⚙ Leitstand-Einstellungen</Text>
            <Text dimColor wrap="wrap">
              Änderungen gelten sofort, nur in diesem Chat. Den Standard für neue Chats stellst du im Einstellungsmenü ein.
            </Text>
            <Text dimColor>{rule}</Text>
          </Box>
        )}
        {group(
          'view',
          'eye',
          'Ansicht',
          view === 'simple' ? 'Einfach' : view === 'detailed' ? (vector ? 'Ausführlich' : 'Details') : view === 'minimal' ? 'Minimal' : 'Aus',
          choice(
            'view',
            vector
              ? [['detailed', 'Ausführlich'], ['simple', 'Einfach'], ['minimal', 'Minimal'], ['off', 'Aus']]
              : [['simple', 'Einfach'], ['detailed', 'Details'], ['minimal', 'Minimal'], ['off', 'Aus']],
            view,
            value => setView($, value),
          ),
          viewHelp,
        )}
        {group(
          'mode',
          'spark',
          // No title: Auto-Mode or Gruppenarbeit says it.
          null,
          WORK_MODE_WORDS[workMode],
          choice('mode', [['auto', WORK_MODE_WORDS.auto], ['dynamisch', WORK_MODE_WORDS.dynamisch]], workMode, value => setWorkMode($, value)),
          workMode === 'dynamisch'
            ? 'Claude plant, entscheidet das Design und prüft jedes Ergebnis. Arbeiter in sechs Stufen setzen um, von Haiku bis Fable, jeweils so günstig wie möglich. Jeder Plan wartet auf deine Freigabe, und Claude ändert keine Dateien, solange Arbeiter laufen. Lohnt sich bei großen Aufgaben.'
            : 'Claude entscheidet selbst, ob und welche Helfer es einsetzt. Schnell und flexibel, gut für kleine und mittlere Aufgaben.',
        )}
        {group(
          'sound',
          'sound',
          'Töne',
          sound === 'off' ? 'Aus' : sound === 'chime' ? 'Signalton' : 'Signalton und Stimme',
          choice('sound', [['off', 'Aus'], ['chime', 'Signalton'], ['voice', 'Signalton und Stimme']], sound, value => setSound($, value)),
          soundHelp,
          sound === 'off' ? undefined : (
            <Box key="sound-test" marginTop={vector ? 1 : 0}>
              <Button key="sound-test" label={vector ? 'Anhören' : '▶ Anhören'} onPress={() => alertSample($, sound)} />
            </Box>
          ),
        )}
        {group(
          'notice',
          'bell',
          'Desktop-Benachrichtigungen',
          isNoticing ? 'An' : 'Aus',
          choice('notice', [['off', 'Aus'], ['on', 'An']], isNoticing ? 'on' : 'off', value => setNotice($, value === 'on')),
          isNoticing
            ? 'Eine Benachrichtigung auf deinem Computer, wenn Claude dich braucht, festhängt oder einen Auftrag beendet, der länger als eine Minute gedauert hat.'
            : 'Schalte sie ein, um auf deinem Computer benachrichtigt zu werden, auch wenn du in einer anderen App arbeitest.',
        )}
        {group(
          'others',
          'eye',
          'Andere Chats',
          showsOthers ? 'An' : 'Aus',
          choice('others', [['off', 'Aus'], ['on', 'An']], showsOthers ? 'on' : 'off', value => setOthers($, value === 'on')),
          showsOthers
            ? 'Die Leiste nennt einen anderen Chat auf diesem Computer, der dich braucht, aus jedem Projekt. Schalte das aus, bevor du deinen Bildschirm teilst.'
            : 'Schalte das ein, um zu sehen, wenn ein anderer Chat auf diesem Computer dich braucht.',
        )}
        {group(
          'calm',
          'moon',
          'Ruhemodus',
          isCalm ? 'An' : 'Aus',
          choice('calm', [['off', 'Aus'], ['on', 'An']], isCalm ? 'on' : 'off', value => setCalm($, value === 'on')),
          isCalm ? 'Nichts auf dem Bildschirm bewegt sich, und der Status steht fett.' : 'Balken und Kreisel bewegen sich, während Claude arbeitet. Schalte ihn ein für einen ruhigen Bildschirm.',
        )}
        {group(
          'approve',
          'approve',
          'Plan zuerst freigeben',
          workMode === 'dynamisch' ? APPROVE_ALWAYS : approves ? 'An' : 'Aus',
          // In Gruppenarbeit every plan waits for approval: a press there changes and keeps nothing.
          choice(
            'approve',
            [['off', 'Aus'], ['on', workMode === 'dynamisch' ? APPROVE_ALWAYS : 'An']],
            approves || workMode === 'dynamisch' ? 'on' : 'off',
            async value => {
              if ((await read($, workModeAtom)) !== 'dynamisch') await setApprove($, value === 'on')
            },
          ),
          workMode === 'dynamisch'
            ? `In der Gruppenarbeit wartet jeder Plan auf deine Freigabe. Drück ${vector ? 'Start' : '▶ Start'} oder sag Claude, was sich ändern soll.`
            : approves
            ? `Claude zeigt seinen Plan und wartet. Drück ${vector ? 'Start' : '▶ Start'} oder sag Claude, was sich ändern soll.`
            : 'Claude legt direkt los, sobald der Plan steht.',
        )}
        {group(
          'ship',
          'ship',
          'Auf GitHub abschließen',
          ships ? 'An' : 'Aus',
          choice('ship', [['off', 'Aus'], ['on', 'An']], ships ? 'on' : 'off', value => setShipOnGithub($, value === 'on')),
          ships
            ? 'Ein fertiger Auftrag bietet den Knopf Push an: Claude räumt die Änderungen auf, öffnet einen Pull Request und mergt, sobald du freigibst.'
            : 'Fertige Aufträge bleiben auf ihrem Branch. Schalte das ein, um in GitHub-Projekten den Knopf Push zu bekommen.',
        )}
        {group(
          'guard',
          'lock',
          'Passwortschutz',
          isGuarded ? 'An' : 'Aus',
          choice('guard', [['off', 'Aus'], ['on', 'An']], isGuarded ? 'on' : 'off', value => setGuard($, value === 'on')),
          isGuarded
            ? 'Eine Nachricht, die nach Passwort oder Schlüssel aussieht, wird zurückgehalten. Drück noch mal Enter, um sie trotzdem zu senden.'
            : masks
              ? 'Jede Nachricht wird so gesendet, wie du sie schreibst. Schlüssel und E-Mail-Adressen bleiben auf dem Bildschirm trotzdem verdeckt.'
              : 'Jede Nachricht wird so gesendet, wie du sie schreibst.',
        )}
        {group(
          'privacy',
          'lock',
          'Verdecken',
          masks ? 'An' : 'Aus',
          choice('privacy', [['off', 'Aus'], ['on', 'An']], masks ? 'on' : 'off', value => setMasking($, value === 'on')),
          masks
            ? 'Passwörter, Schlüssel, Kartennummern, E-Mail-Adressen und Telefonnummern erscheinen auf dem Bildschirm als Punkte, auch in Befehls- und Werkzeugausgaben. Claude liest alles unverändert.'
            : 'Alles erscheint so, wie es im Chat steht. Schalte das ein, bevor du deinen Bildschirm teilst.',
        )}
        {group(
          'tidy',
          'tidy',
          'Chat aufräumen',
          '',
          <Box key="tidy-choices" flexDirection="row" gap={1}>
            <Button key="tidy-now" label="Jetzt aufräumen" onPress={() => tidyUp($)} />
            {checkpointAt !== null && <Button key="recap" label="Letzter Stand" onPress={() => showRecap($)} />}
          </Box>,
          tidyHelp,
          checkpointAt !== null && (
            <Box key="tidy-saved" marginTop={vector ? 1 : 0}>
              <Text dimColor wrap="wrap">
                {`Letzter Sicherungspunkt um ${clockTime(checkpointAt)} gespeichert.`}
              </Text>
            </Box>
          ),
        )}
        {!vector && <Text dimColor>{rule}</Text>}
        <Box key="actions" flexDirection="row" gap={1} marginTop={vector ? 2 : 0} justifyContent={vector ? 'flex-end' : undefined} width={vector ? columns : undefined}>
          {/* Changes apply as they are made, and the app draws the panel's close control: no Done needed there. */}
          {!vector && <Button key="close" label="Fertig" variant="primary" role="dismiss" onPress={() => $.ui.close({ id: SETTINGS_PANE })} />}
          <Button key="reset" label="Auf Standard zurücksetzen" onPress={() => resetSettings($)} />
        </Box>
      </Box>
    )
  })

  // The checkpoint Claude saved before the chat was tidied up, in its own words.
  on('ui.render', { component: 'Pane', requestId: RECAP_PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button, Markdown } = table
    const kit = kitOf(table, e.surface)
    const vector = kit.isVector
    const note = await checkpointOf($).catch(() => null)
    const at = await read($, checkpointAtom)
    const columns = Math.max(30, e.props.bodyColumns)
    // The app draws a panel's own close control; the terminal's panel needs the button.
    const close = vector ? null : <Button key="close" label="Schließen" role="dismiss" onPress={() => $.ui.close({ id: RECAP_PANE })} />
    // A line with the checkpoint's mark on vector surfaces; plain dim text on the terminal.
    const lead = (words: string) =>
      vector ? (
        <Box key="lead" flexDirection="row" gap={1} width={columns}>
          {kit.icon('bookmark', 'quiet', NOTICE)}
          <Box flexShrink={1}>
            <Text dimColor wrap="wrap">
              {words}
            </Text>
          </Box>
        </Box>
      ) : (
        <Text key="lead" dimColor wrap="wrap">
          {words}
        </Text>
      )
    if (note === null) {
      return (
        <Box flexDirection="column" width={columns}>
          {lead('In diesem Chat gibt es noch keinen Sicherungspunkt. Wenn Claude den Chat aufräumt, wird vorher einer gespeichert und hier angezeigt.')}
          {close && (
            <Box key="actions" flexDirection="row">
              {close}
            </Box>
          )}
        </Box>
      )
    }
    // Claude's own words, as it keeps them; personal details masked and times in the person's own time.
    const bare = note.replace(/^(Checkpoint|Sicherungspunkt):\s*/, '')
    const text = localTimes((await read($, maskAtom)) ? maskPrivate(bare) : bare)

    return (
      <Box flexDirection="column" width={columns}>
        {lead(`Gespeichert${at === null ? '' : ` um ${clockTime(at)}`}, bevor der Chat aufgeräumt wurde. Claude liest ihn für den Rest dieses Chats weiter mit.`)}
        <Box key="note" flexDirection="column" marginTop={1}>
          {vector ? (
            // Claude writes the checkpoint in markdown: headings and lists read as they would in a reply.
            <Markdown key="note-text" text={text.slice(0, 10_000)} />
          ) : (
            text.split('\n').map((line, index) => (
              <Text key={`line-${index}`} wrap="wrap">
                {line || ' '}
              </Text>
            ))
          )}
        </Box>
        {close && (
          <Box key="actions" flexDirection="row" marginTop={1}>
            {close}
          </Box>
        )}
      </Box>
    )
  })

  // The whole plan beside the chat, with what the band above the prompt has no room for: when the job started and
  // should end, every step's summary and time (or expected time), all helpers, and in Details the tokens and cost.
  on('ui.render', { component: 'Pane', requestId: PLAN_PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const kit = kitOf(table, e.surface)
    const vector = kit.isVector
    const list = await read($, checklistAtom)
    const tick = await read($, tickAtom)
    const isDetailed = (await read($, detailAtom)) === 'detailed'
    const isCalm = await read($, calmAtom)
    const columns = Math.max(40, e.props.bodyColumns)
    const actions = (
      <Box key="actions" flexDirection="row" gap={1} marginTop={vector ? 2 : 1}>
        {/* The app draws a panel's own close control; the terminal's panel needs the button. */}
        {!vector && <Button key="close" label="Schließen" role="dismiss" onPress={() => $.ui.close({ id: PLAN_PANE })} />}
        <Button key="history" label="Verlauf" onPress={async () => showHistory($, dayKey(await now($)), true)} />
      </Box>
    )
    if (list === null || !list.hasPlan) {
      const words = 'Noch kein Plan. Bitte Claude um etwas, dann erscheint hier sein Plan.'
      return (
        <Box flexDirection="column">
          {vector ? (
            <Box flexDirection="row" gap={1}>
              {kit.icon('plan', 'quiet', NOTICE)}
              <Text dimColor wrap="wrap">
                {words}
              </Text>
            </Box>
          ) : (
            <Text dimColor>{words}</Text>
          )}
          {actions}
        </Box>
      )
    }

    const at = list.finishedAt ?? (await now($))
    const active = list.tasks.find(one => one.status === 'active')
    // The same percentage as the band in this view: Details fills the current step from its time estimate.
    const activePercent = active ? stepEstimate(list, active, at).percent : undefined
    const { percent, doneCount } = overallProgress(list.tasks, activePercent)
    const left = list.phase === 'done' ? null : timeLeft(list, at, activePercent)
    const when =
      list.phase === 'done'
        ? `Begonnen ${clockTime(list.startedAt)} · fertig ${clockTime(at)} · dauerte ${(vector ? durationWords : formatDuration)(at - list.startedAt)}`
        : [
            `Begonnen ${clockTime(list.startedAt)}`,
            // Where the band above already counts the time and what is left, the panel says when it should end.
            vector ? '' : `bisher ${formatDuration(at - list.startedAt)}`,
            left === null ? '' : vector ? `fertig gegen ${clockTime(at + left)}` : `noch etwa ${formatLeft(left)}, fertig gegen ${clockTime(at + left)}`,
          ]
            .filter(Boolean)
            .join(' · ')
    const grew = list.plannedCount > 0 && list.tasks.length > list.plannedCount ? ` · Plan gewachsen ${list.plannedCount} → ${list.tasks.length}` : ''
    const status =
      list.phase === 'needsYou'
        ? { color: 'yellow', tone: 'warn' as const, icon: 'bell' as const, lead: 'Braucht dich', text: needsText(list) ?? WAITING }
        : list.phase === 'stuck'
          ? { color: 'yellow', tone: 'alert' as const, icon: 'bang' as const, lead: 'Hängt fest', text: list.stuckReason ?? 'Claude kommt gerade nicht weiter' }
          : list.phase === 'stopped'
            ? list.stopKind === 'pause'
              ? { color: undefined, tone: 'quiet' as const, icon: 'pause' as const, lead: 'Pausiert', text: 'Drück Weiter, um fortzufahren' }
              : { color: undefined, tone: 'quiet' as const, icon: 'stop' as const, lead: 'Gestoppt', text: 'Du hast Esc gedrückt' }
            : list.phase === 'background'
              ? { color: 'cyan', tone: 'active' as const, icon: 'clock' as const, lead: 'Claude hat geantwortet', text: 'Helfer laufen noch im Hintergrund' }
              : null

    // One row per step: mark, name, then its time. On the terminal the time column lines up by cells; elsewhere the
    // name takes the room and the time keeps to the right edge.
    const nameWidth = Math.max(12, Math.min(MAX_NAME, columns - 24))
    type Mark = { glyph: RenderChildren; icon: RenderChildren }
    // A name or time too long for its column goes on lines of its own, in full, instead of being cut.
    const row = (key: string, mark: Mark, name: string, look: { bold?: boolean; dim?: boolean }, time: string, timeIsDim = true) =>
      vector ? (
        <Box key={key} flexDirection="row" gap={1} width={columns}>
          {mark.icon}
          <Box flexGrow={1} flexShrink={1}>
            <Text bold={look.bold} dimColor={look.dim} wrap="wrap">
              {name}
            </Text>
          </Box>
          {time !== '' && (
            <Box flexShrink={0}>
              <Text dimColor={timeIsDim}>{time}</Text>
            </Box>
          )}
        </Box>
      ) : widthOf(name) <= nameWidth && widthOf(time) < columns - 3 - nameWidth ? (
        <Box key={key} flexDirection="row">
          {mark.glyph}
          <Text bold={look.bold} dimColor={look.dim}>
            {fit(name, nameWidth)}
          </Text>
          <Text dimColor={timeIsDim}>{` ${time}`}</Text>
        </Box>
      ) : (
        <Box key={key} flexDirection="column">
          <Box flexDirection="row">
            {mark.glyph}
            <Box flexShrink={1}>
              <Text bold={look.bold} dimColor={look.dim} wrap="wrap">
                {name}
              </Text>
            </Box>
          </Box>
          {time !== '' && (
            <Text dimColor={timeIsDim} wrap="wrap">
              {`  ${time}`}
            </Text>
          )}
        </Box>
      )
    // A line under a step, in line with its name. A command keeps to one line, cut at the edge.
    const note = (key: string, text: string, icon?: RenderChildren, isOneLine = false) =>
      vector ? (
        <Box key={key} flexDirection="row" gap={1} width={columns}>
          {kit.blank()}
          {icon}
          <Box flexShrink={1} minWidth={0}>
            <Text dimColor wrap={isOneLine ? 'truncate-end' : 'wrap'}>
              {text}
            </Text>
          </Box>
        </Box>
      ) : (
        <Text key={key} dimColor wrap="wrap">
          {`    ${text}`}
        </Text>
      )
    const helperRows = (one: GlanceTask) =>
      list.helpers
        .filter(helper => helper.stepId === one.id)
        .map(helper => {
          const mark = helper.status === 'running' ? '◐' : helper.status === 'failed' ? '✗' : '✓'
          const kind = helper.kind === 'background' ? 'im Hintergrund' : helper.type === 'general-purpose' ? 'Helfer' : helperType(helper.type)
          const details = [kind, helper.model, isDetailed && helper.effort ? effortWords(helper.effort) : null, isDetailed && helper.tokens > 0 ? `${formatTokens(helper.tokens)} Tokens` : null]
            .filter(Boolean)
            .join(' · ')
          const words = `${helper.label}${details ? ` · ${details}` : ''}`
          return vector
            ? note(
                `helper-${helper.id}`,
                words,
                helper.status === 'running'
                  ? kit.ring(null, isCalm ? 0 : tick, 'Läuft', 13)
                  : helper.status === 'failed'
                    ? kit.badge('close', 'alert', 'Fehlgeschlagen', 13)
                    : kit.badge('check', 'ok', 'Fertig', 13),
              )
            : note(`helper-${helper.id}`, `↳ ${mark} ${words}`)
        })
    const tokensOf = (one: GlanceTask) => (isDetailed ? tokenNote(one.tokens, one.cachedTokens) : '')
    const filesOf = (key: string, one: GlanceTask, suffix = '') =>
      one.files?.length ? [note(`${key}-files`, `${filesNote(one.files)}${suffix}`, vector ? kit.icon('file', 'quiet', 'Dateien', 13) : undefined)] : []

    const done: RenderChildren[] = []
    const now_: RenderChildren[] = []
    const next_: RenderChildren[] = []
    list.tasks.forEach((one, index) => {
      const key = `step-${index}`
      if (one.status === 'done') {
        const ms = one.startedAt !== null && one.finishedAt !== null ? one.finishedAt - one.startedAt : null
        // Under the Done heading a time says how long it took; the terminal, with no heading in the column, says so.
        const took = ms === null ? (vector ? '' : 'fertig') : vector ? (ms < 1000 ? '' : durationWords(ms)) : `dauerte ${formatDuration(ms)}`
        done.push(
          row(key, { glyph: <Text color="green">✓ </Text>, icon: kit.icon('done', 'ok', 'Fertig') }, one.name, {}, [took, tokensOf(one)].filter(Boolean).join(' · ')),
          ...(one.summary ? [note(`${key}-summary`, one.summary)] : []),
          ...filesOf(key, one),
          ...helperRows(one),
        )
      } else if (one.status === 'active') {
        const estimate = stepEstimate(list, one, at)
        const time = [isDetailed && !vector ? `${estimate.percent}%` : '', (vector ? durationWords : formatDuration)(estimate.elapsedMs), leftLabel(estimate.leftMs, vector)]
          .filter(Boolean)
          .join(' · ')
        const waits = status !== null && status.tone !== 'active'
        now_.push(
          row(
            key,
            {
              glyph: <Text color="cyan">▶ </Text>,
              icon: waits ? kit.badge(status.icon, status.tone, status.lead) : kit.badge('play', 'active', 'Jetzt'),
            },
            one.name,
            { bold: true },
            time,
            false,
          ),
          // The Plan says more than the band: Claude's own words for what it is doing, and in Details what it runs.
          ...(list.phase === 'working' && list.activity !== null
            ? [
                note(
                  `${key}-activity`,
                  `${vector ? '' : 'Jetzt: '}${list.activity.detail ?? list.activity.label}${list.activity.count > 1 ? ` (${list.activity.label}, ${list.activity.count}-mal hintereinander)` : ''}`,
                ),
                ...(isDetailed && list.activity.target && !(vector && one.files?.some(file => file.path.split('/').pop() === list.activity!.target))
                  ? [note(`${key}-target`, vector ? list.activity.target : `↳ ${list.activity.target}`, vector ? kit.icon('sub', 'quiet', 'Führt aus', 13) : undefined, true)]
                  : []),
              ]
            : []),
          ...(tokensOf(one) ? [note(`${key}-tokens`, `bisher ${tokensOf(one)}`)] : []),
          ...filesOf(key, one, ' (bisher)'),
          ...helperRows(one),
        )
      } else {
        const { expectedMs: expected } = stepEstimate(list, one, at)
        next_.push(
          row(key, { glyph: <Text dimColor>○ </Text>, icon: kit.open('Offen') }, one.name, { dim: true }, expected < 60_000 ? 'unter einer Minute' : `etwa ${formatLeft(expected)}`),
          ...helperRows(one),
        )
      }
    })
    const section = (key: string, label: string, rows: RenderChildren[]) =>
      rows.length === 0 ? null : (
        <Box key={key} flexDirection="column" marginTop={1}>
          {/* Elsewhere than the terminal the section heads the rows under it at full strength, as a heading should. */}
          <Text bold dimColor={!vector}>
            {label}
          </Text>
          {rows}
        </Box>
      )

    const footer: string[] = []
    const running = list.helpers.filter(one => one.status === 'running').length
    // Elsewhere than the terminal each helper's own row says it; the count would repeat them.
    if (list.helpers.length > 0 && !vector) {
      const finished = list.helpers.length - running
      footer.push(`Helfer: ${[running > 0 ? `${running} aktiv` : '', finished > 0 ? `${finished} fertig` : ''].filter(Boolean).join(', ')}`)
    }
    if (left !== null && list.paceMs !== null && doneCount < 2) {
      footer.push('Die Restzeit beruht darauf, wie lange Schritte in diesem Projekt bisher gedauert haben.')
    }
    if (isDetailed) {
      const usage = await read($, usageAtom)
      const tokens = list.tasks.reduce((sum, one) => sum + one.tokens, list.extraTokens)
      const cached = list.tasks.reduce((sum, one) => sum + one.cachedTokens, list.extraCachedTokens)
      const spent = jobCost(list, usage)
      const job = [tokenNote(tokens, cached), spent === null ? '' : formatCost(spent)].filter(Boolean).join(' · ')
      if (job) footer.push(`Dieser Auftrag: ${job}`)
      // No usage line: the mod Statistik shows limits and how full the chat is further down.
    }

    const isDone = list.phase === 'done'
    // Elsewhere than the terminal the bar shows the percentage, which weighs steps by size: the words just count them.
    const summary = `${vector ? '' : `${percent}% · `}${doneCount} von ${list.tasks.length} Schritten fertig${grew}`
    const cells = Math.round(percent / 5)
    return (
      <Box flexDirection="column" width={columns}>
        <Text bold wrap="wrap">
          {list.title}
        </Text>
        <Text dimColor wrap="wrap">
          {when}
        </Text>
        {vector ? (
          <Box key="progress" flexDirection="row" alignItems="center" gap={1} marginTop={1}>
            <Box flexShrink={0}>{kit.meter(isDone ? 'ok' : 'active', percent, 0, `${percent}% fertig`, 160)}</Box>
            <Text>{summary}</Text>
          </Box>
        ) : (
          <Box key="progress" flexDirection="row">
            <Text color={isDone ? 'green' : 'cyan'}>{'█'.repeat(cells) + '░'.repeat(20 - cells)}</Text>
            <Text>{` ${summary}`}</Text>
          </Box>
        )}
        {status &&
          (vector ? (
            <Box key="status" flexDirection="row" gap={1} marginTop={1}>
              {status.tone === 'active' ? kit.icon(status.icon, status.tone, STATUS) : kit.badge(status.icon, status.tone, STATUS)}
              <Box flexShrink={1}>
                <Text wrap="wrap">
                  <Text bold>
                    {status.lead}
                  </Text>
                  <Text>{` · ${status.text}`}</Text>
                </Text>
              </Box>
            </Box>
          ) : (
            <Text key="status" color={status.color} bold wrap="wrap">
              {status.lead === 'Claude hat geantwortet' ? `${status.lead}; ${status.text}` : `${status.lead}: ${status.text}`}
            </Text>
          ))}
        {section('done', 'Fertig', done)}
        {section('now', 'Jetzt', now_)}
        {section('next', 'Als Nächstes', next_)}
        {footer.length > 0 && (
          <Box key="footer" flexDirection="column" marginTop={1}>
            {footer.map((line, index) => (
              <Text key={`footer-${index}`} dimColor wrap="wrap">
                {line}
              </Text>
            ))}
          </Box>
        )}
        {actions}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: HISTORY_PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const kit = kitOf(table, e.surface)
    const vector = kit.isVector
    const view = await read($, historyAtom)
    const columns = Math.max(30, e.props.bodyColumns)
    const today = dayKey(await now($))
    // The app draws a panel's own close control; the terminal's panel needs the button.
    const close = vector ? null : <Button key="close" label="Schließen" role="dismiss" onPress={() => $.ui.close({ id: HISTORY_PANE })} />
    if (view === null) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Schreib /leitstand history, um die Aufgaben von heute zu sehen.</Text>
          {close}
        </Box>
      )
    }

    // Day picker: earlier, a drop-down of saved days, later, and today.
    const dayLabel = (day: string) => (vector ? (day === today ? `Heute · ${longDay(day)}` : longDay(day)) : day === today ? `Heute, ${germanDay(day)}` : germanDay(day))
    const picker = (
      <Box key="picker" flexDirection="column" marginBottom={1}>
        {/* The app titles the panel "History · <folder>"; the terminal's panel shows the day here too. */}
        {!vector && (
          <Text key="heading" bold wrap="truncate-end">
            {`${projectName(view.project)} · ${longDay(view.day)}`}
          </Text>
        )}
        <Box key="controls" flexDirection="row" gap={1} alignItems={vector ? 'center' : undefined}>
          <Button key="earlier" label={vector ? 'Vorheriger Tag' : '◀ Früher'} onPress={() => showHistory($, shiftDay(view.day, -1), false)} />
          {'Select' in table && table.Select ? (
            <table.Select
              key="day"
              // The terminal's Select draws "label: value" itself, so the label carries no colon. The desktop's value
              // already starts with the day ("Today · …"): a label there would stutter.
              label={vector ? undefined : 'Tag'}
              value={view.day}
              options={view.days.map(day => ({ value: day, label: dayLabel(day) }))}
              onSelect={day => void showHistory($, day, false)}
            />
          ) : (
            <Text bold>{dayLabel(view.day)}</Text>
          )}
          {view.day < today && (
            <Button key="later" label={vector ? 'Nächster Tag' : 'Später ▶'} onPress={() => showHistory($, shiftDay(view.day, 1), false)} />
          )}
          {view.day !== today && <Button key="today" label="Heute" onPress={() => showHistory($, today, false)} />}
        </Box>
      </Box>
    )

    const report = reportOf(view)
    if (view.isReportShown) {
      const copy = <Button key="copy" variant="primary" label="Bericht kopieren" onPress={() => showReport($, true, report, e.surface)} />
      return (
        <Box flexDirection="column" width={columns}>
          {picker}
          {vector && (
            <Text key="caption" dimColor>
              Das fügst du ein
            </Text>
          )}
          <Box
            key="report"
            flexDirection="column"
            borderStyle={vector ? 'round' : undefined}
            borderDimColor={vector || undefined}
            paddingX={vector ? 1 : undefined}
            paddingY={vector ? 1 : undefined}
            marginTop={vector ? 1 : undefined}
          >
            {report.split('\n').map((line, index, lines) => (
              // On vector surfaces a section's label (a line a list starts under) reads bold too.
              <Text key={`report-${index}`} bold={index === 0 || (vector && line !== '' && !/^[\s•]/.test(line) && /^•/.test(lines[index + 1] ?? ''))} wrap="wrap">
                {line || ' '}
              </Text>
            ))}
          </Box>
          <Box key="report-actions" flexDirection="row" gap={1} marginTop={1}>
            {vector && <Button key="back" label="Zurück zur Liste" onPress={() => showReport($, false, report, e.surface)} />}
            {!vector && copy}
            {view.reportSpan === 'mine' ? null : view.reportSpan === 'week' ? (
              <Button key="span" label={vector ? 'Tagesbericht' : 'Dieser Tag'} onPress={() => showReportSpan($, 'day', e.surface)} />
            ) : (
              <Button key="span" label={vector ? 'Wochenbericht' : 'Diese Woche'} onPress={() => showReportSpan($, 'week', e.surface)} />
            )}
            {!vector && <Button key="back" label="Zurück zur Liste" onPress={() => showReport($, false, report, e.surface)} />}
            {/* Elsewhere than the terminal the main button comes last, as a dialog's does. */}
            {vector && copy}
            {close}
          </Box>
        </Box>
      )
    }

    if (view.entries.length === 0) {
      const words = 'Für dieses Projekt sind an diesem Tag noch keine Aufgaben gespeichert.'
      return (
        <Box flexDirection="column" width={columns}>
          {picker}
          {vector ? (
            <Box flexDirection="row" gap={1}>
              {kit.icon('plan', 'quiet', NOTICE)}
              <Text dimColor wrap="wrap">
                {words}
              </Text>
            </Box>
          ) : (
            <Text dimColor>{words}</Text>
          )}
          <Box key="actions" flexDirection="row" gap={1} marginTop={1}>
            <Button key="mine" label={vector ? 'Alle Projekte dieser Woche' : 'Deine Woche'} onPress={() => showReportSpan($, 'mine', e.surface)} />
            {close}
          </Box>
        </Box>
      )
    }

    const marks: Record<GlanceHistoryEntry['outcome'], [string, string | undefined]> = {
      done: ['✓', 'green'],
      stopped: ['■', undefined],
      stuck: ['⚠', 'yellow'],
      waiting: ['‖', 'yellow'],
      background: ['◷', 'cyan'],
      working: ['▶', 'cyan'],
    }
    const outcomeMark = (outcome: GlanceHistoryEntry['outcome']) =>
      outcome === 'done'
        ? kit.icon('done', 'ok', 'Fertig')
        : outcome === 'stopped'
          ? kit.badge('stop', 'quiet', 'Gestoppt')
          : outcome === 'stuck'
            ? kit.badge('bang', 'alert', 'Hängt fest')
            : outcome === 'waiting'
              ? kit.badge('bell', 'warn', 'Wartet')
              : outcome === 'background'
                ? kit.icon('clock', 'active', 'Im Hintergrund')
                : kit.ring(null, 0, 'Arbeitet')
    const titleWidth = Math.max(12, Math.min(MAX_NAME, columns - 9 - 44))
    const rows = view.entries.map(one => {
      const [mark, color] = marks[one.outcome]
      // Elsewhere than the terminal times read as the report says them ("13 min"), so one job reads one way.
      const took = one.finishedAt === null ? 'nicht fertig' : (vector ? plainDuration : formatDuration)(one.finishedAt - one.startedAt)
      const details = [
        `${one.stepsDone}/${one.stepsTotal}`,
        took,
        tokenNote(one.newTokens + one.cachedTokens, one.cachedTokens),
        typeof one.costUsd === 'number' ? formatCost(one.costUsd) : '',
      ]
        .filter(Boolean)
        .join(' · ')
      const files = filesNote(entryFiles(one))
      if (vector) {
        return (
          <Box key={`job-${one.jobId}`} flexDirection="column" marginBottom={1}>
            <Box key="row" flexDirection="row" gap={1} width={columns}>
              {outcomeMark(one.outcome)}
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text bold={one.outcome !== 'stopped'} dimColor={one.outcome === 'stopped'} wrap="truncate-end">
                  {one.title}
                </Text>
              </Box>
              <Box flexShrink={0}>
                <Text dimColor>{clockTime(one.startedAt)}</Text>
              </Box>
            </Box>
            <Box key="details" flexDirection="row" gap={1} width={columns}>
              {kit.blank()}
              <Box flexShrink={1}>
                <Text dimColor wrap="wrap">
                  {`${one.stepsDone} von ${one.stepsTotal} Schritten · ${[took, tokenNote(one.newTokens + one.cachedTokens, one.cachedTokens), typeof one.costUsd === 'number' ? formatCost(one.costUsd) : ''].filter(Boolean).join(' · ')}`}
                </Text>
              </Box>
            </Box>
            {files !== '' && (
              <Box key="files" flexDirection="row" gap={1} width={columns}>
                {kit.blank()}
                {kit.icon('file', 'quiet', 'Dateien', 13)}
                <Box flexShrink={1}>
                  <Text dimColor wrap="wrap">
                    {files}
                  </Text>
                </Box>
              </Box>
            )}
          </Box>
        )
      }
      return (
        <Box key={`job-${one.jobId}`} flexDirection="column">
          <Box key="row" flexDirection="row">
            <Text dimColor>{`${clockTime(one.startedAt)}  `}</Text>
            <Text color={color} dimColor={one.outcome === 'stopped'}>{`${mark} `}</Text>
            <Text bold={one.outcome !== 'stopped'}>{fit(one.title, titleWidth)}</Text>
            <Text dimColor wrap="truncate-end">
              {` ${fit(details, Math.max(0, columns - 9 - titleWidth - 1)).trimEnd()}`}
            </Text>
          </Box>
          {files !== '' && (
            <Text key="files" dimColor wrap="wrap">
              {`         ${files}`}
            </Text>
          )}
        </Box>
      )
    })

    const finished = view.entries.filter(one => one.finishedAt !== null)
    const time = finished.reduce((sum, one) => sum + (one.finishedAt! - one.startedAt), 0)
    const newTokens = view.entries.reduce((sum, one) => sum + one.newTokens, 0)
    const cached = view.entries.reduce((sum, one) => sum + one.cachedTokens, 0)
    const priced = view.entries.filter(one => typeof one.costUsd === 'number')
    const spent = priced.reduce((sum, one) => sum + (one.costUsd ?? 0), 0)
    const counts = (Object.keys(marks) as GlanceHistoryEntry['outcome'][])
      .map(outcome => [outcome, view.entries.filter(one => one.outcome === outcome).length] as const)
      .filter(([, count]) => count > 0)
      .map(([outcome, count]) => `${count} ${OUTCOME_WORDS[outcome][count === 1 ? 0 : 1]}`)
    const total = [
      `${view.entries.length} ${view.entries.length === 1 ? 'Aufgabe' : 'Aufgaben'}`,
      counts.join(', '),
      (vector ? plainDuration : formatDuration)(time),
      tokenNote(newTokens + cached, cached),
      priced.length > 0 ? formatCost(spent) : '',
    ]
      .filter(Boolean)
      .join(' · ')

    return (
      <Box flexDirection="column" width={columns}>
        {picker}
        {rows}
        <Box key="total" marginTop={vector ? 0 : 1}>
          {vector ? (
            <Text dimColor wrap="wrap">{`Gesamt: ${total}`}</Text>
          ) : (
            <Text bold wrap="truncate-end">{`Gesamt: ${total}`}</Text>
          )}
        </Box>
        <Box key="actions" flexDirection="row" gap={1} marginTop={1}>
          <Button
            key="report"
            variant={vector ? 'secondary' : 'primary'}
            label={vector ? (view.reportSpan === 'week' ? 'Wochenbericht' : 'Tagesbericht') : 'Teambericht'}
            onPress={() => showReportSpan($, view.reportSpan === 'week' ? 'week' : 'day', e.surface)}
          />
          {/* Your week covers every project, so on the desktop its name says so beside this project's reports. */}
          <Button key="mine" label={vector ? 'Alle Projekte dieser Woche' : 'Deine Woche'} onPress={() => showReportSpan($, 'mine', e.surface)} />
          {close}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }
    // Other mods draw in this band too (an approval card, prompt buttons): keep theirs, under ours.
    const beneath = await next(e).catch(() => null)
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    // The desktop app, VS Code and the phone set text in a proportional font and draw vectors: there the band is
    // flex rows with SVG marks and one slim bar. The terminal lines its columns up by cells, with glyphs.
    const kit = kitOf(table, e.surface)
    const vector = kit.isVector
    const isEnabled = await read($, enabledAtom)
    const list = isEnabled ? await read($, checklistAtom) : null
    const detail = await read($, detailAtom)
    // Minimal: one line, with what is happening, how far, the time left and the tokens; the view menu on its right,
    // and under it the row of places and actions, as in the other views.
    const isMinimal = isEnabled && detail === 'minimal'
    // Autopilot's line stands at the very top, over the band, wherever it comes in what is beneath (another mod may have
    // built around it). Taken out whole before any buttons are lifted, so its Beenden stays beside its words.
    const { rest: underneath, taken: autopilotLine } = takeOut(beneath, AUTOPILOT_LINE)
    // Another mod's buttons (Replay, say) sit with Leitstand's own actions at the bottom right, in every state of the
    // band; anything else it draws stays under it.
    const lifted = vector && isEnabled ? liftButtons(underneath) : { buttons: [], rest: underneath }
    const kept = lifted.rest as RenderElement | null
    // Over the band a thin line, as the other mods in it draw one over theirs.
    const rule = kit.rule(e.props.bodyColumns)
    // What is beneath may be the engine's own node, which can't sit under a Box with a width: wrap, don't nest.
    const withBeneath = (tree: RenderElement): RenderElement => (
      <Box flexDirection="column">
        {autopilotLine as RenderElement | null}
        {rule}
        {tree}
        {kept}
      </Box>
    )
    const tick = list ? await read($, tickAtom) : 0
    const usage = isEnabled ? await read($, usageAtom) : NO_USAGE
    const isDetailed = isEnabled && (await read($, detailAtom)) === 'detailed'
    const workMode = await read($, workModeAtom)
    const isCalm = isEnabled && (await read($, calmAtom))
    const handoff = isEnabled ? await read($, handoffAtom) : 'idle'
    // While the chat is compacted, a message would wait in the queue: no Start or Continue, and the state says so.
    const isCompacting = isEnabled && (await read($, compactingAtom))
    const armed = isEnabled ? await read($, armedAtom) : null
    const masks = await read($, maskAtom)
    const remote = remoteShown(await read($, remoteAtom))
    const adhd = await read($, adhdAtom)
    // Read only where its button shows, so Autopilot's writes redraw nothing else.
    const nightShift = vector && isEnabled && (await isNightShiftOn($))
    const canShip = isEnabled && (await read($, shipOnGithubAtom)) && (await read($, hasGithubAtom))
    const columns = Math.max(20, e.props.bodyColumns)
    const current = await now($)

    // A line of the band on vector surfaces: a mark, then what it says, then anything kept to the right.
    // A box that holds a cut line needs minWidth 0: in the desktop app's flex rows, it would otherwise push past the edge.
    const line = (key: string, mark: RenderChildren, body: RenderChildren, right?: RenderChildren) => (
      <Box key={key} flexDirection="row" alignItems="center" gap={1} width={columns}>
        {mark}
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          {body}
        </Box>
        {right !== undefined && <Box flexShrink={0}>{right}</Box>}
      </Box>
    )

    // Plan usage, always in view; it turns yellow, then red, as a window fills.
    const warnings: RenderChildren[] = []
    // The other chats on this computer: one that needs the person, in amber, else how many are at work, quietly.
    const others = isEnabled && (await read($, showsOthersAtom)) ? await read($, othersAtom) : []
    const otherWords = otherChatsWords(others)
    // Who needs the person comes first and is never left out for the shorter count after it: cut to whole words instead.
    const otherLine = (room: number) => wholePieces(widthOf(otherWords[0] ?? '') <= room ? otherWords : otherWords.slice(0, 1), room)
    if (otherWords.length > 0) {
      const needsYou = others.some(one => one.needsYou)
      warnings.push(
        vector
          ? line(
              'others',
              kit.icon(needsYou ? 'bell' : 'eye', needsYou ? 'warn' : 'quiet', NOTICE),
              <Text wrap="truncate-end" dimColor={!needsYou}>
                {otherLine(Math.floor(columns / 0.8) - 3)}
              </Text>,
            )
          : (
              <Box key="others" width={columns}>
                <Text wrap="truncate-end" color={needsYou ? 'yellow' : undefined} dimColor={!needsYou}>
                  {needsYou ? `${GLYPH.bell} ${otherLine(columns - 2)}` : otherLine(columns)}
                </Text>
              </Box>
            ),
      )
    }
    // Last row: open the history, or hand this chat off to a fresh one (a second press confirms).
    const list0 = isEnabled ? await read($, checklistAtom) : null
    const canPause =
      runningTurn !== undefined &&
      list0 !== null &&
      (list0.phase === 'working' || list0.phase === 'needsYou') &&
      list0.needsYouReason !== WAITING &&
      list0.approval !== 'waiting'
    // Claude asked something: elsewhere than the terminal Continue would read as a yes, so only an answer moves on.
    const canContinue =
      list0 !== null &&
      (list0.phase === 'stopped' ||
        list0.phase === 'stuck' ||
        (list0.phase === 'needsYou' && list0.needsYouReason === WAITING && !(vector && list0.question)))
    // An action: on the terminal its glyph leads the label. Elsewhere it is the app's own button, so it reads as one
    // at a glance; the one that matters now (Continue, Start) is the primary one.
    const action = (key: string, icon: IconName, label: string, onPress: () => unknown, short?: string, isMain = false) =>
      vector ? (
        <Button key={key} variant={isMain ? 'primary' : 'secondary'} label={label} onPress={onPress} />
      ) : (
        <Button key={key} plain label={short ?? `${GLYPH[icon]} ${label}`} onPress={onPress} />
      )
    const handoffLabel =
      armed === 'handoff' ? 'Noch mal drücken für neuen Chat' : handoff === 'working' ? 'Schreibe Übergabenotiz…' : 'Neuer Chat'
    // What steers the job (Pause, Start, Continue); elsewhere than the terminal it sits beside the job's status.
    // Elsewhere than the terminal a stuck job is tried again, and a usage limit won't lift for a press, so that
    // button stays quiet.
    const isStuck = list0?.phase === 'stuck'
    const pauseLabel = 'Pause'
    const isLimitStuck = isStuck && /limit/i.test(list0?.stuckReason ?? '')
    // Beside "try again later" a usage limit's button checks whether it has lifted.
    const continueLabel = vector && isStuck ? (isLimitStuck ? 'Erneut prüfen' : 'Erneut versuchen') : 'Weiter'
    // With Autopilot on, a waiting plan starts by itself: beside Start, dim, how long until then. The terminal reads
    // Autopilot only while a plan waits, so its writes redraw nothing else there.
    const nightStartIn =
      !isCompacting && list0?.approval === 'waiting' && (vector ? nightShift : await isNightShiftOn($)) ? nightStartSeconds(list0, current) : null
    const nightStartHint = nightStartIn !== null && (
      <Text key="night-start" dimColor wrap="truncate-end">
        {`startet in ${nightStartIn} s`}
      </Text>
    )
    // Start pressed and its message on its way: the button says so, and a press on it does nothing. The press itself
    // does not wait for the message, which waits for its turn.
    const waitingPlan = waitingPlanOf(list0)
    const isStarting = waitingPlan !== null && (await read($, startingAtom)) === waitingPlan
    const startItem = isStarting
      ? action('start', 'play', 'Startet gleich…', () => undefined)
      : action('start', 'play', 'Start', () => void startPlan($).catch(() => undefined), undefined, true)
    const controls = isEnabled
      ? [
          canPause && action('pause', 'pause', pauseLabel, () => pauseJob($)),
          // Elsewhere than the terminal Start, the main button, stays last; the hint goes before it.
          vector && nightStartHint,
          !isCompacting && list0?.approval === 'waiting' && startItem,
          !vector && nightStartHint,
          !isCompacting && canContinue && action('continue', 'play', continueLabel, () => continueJob($), undefined, !(vector && isLimitStuck)),
        ].filter(Boolean)
      : []
    // A fresh chat ends this one. Elsewhere than the terminal it stands apart from the places to go, and only once the
    // job has stopped or finished, or while a first press waits. How full the chat is, and the button to tidy it up,
    // are the Statistik mod's.
    const handoffItem =
      list0 !== null &&
      (!vector || list0.phase === 'done' || list0.phase === 'stopped' || handoff === 'working' || armed === 'handoff') &&
      action('handoff', 'fresh', handoffLabel, () => pressHandoff($), handoffLabel === 'Neuer Chat' && columns < 40 ? '↻ Neu' : undefined)
    // Finish on GitHub: once the job is done, one press closes it out; a merged pull request archives the chat.
    const shipItem =
      canShip &&
      (list0?.phase === 'done' || armed === 'ship') &&
      action('ship', 'ship', armed === 'ship' ? 'Noch mal drücken für Push' : 'Push', () => pressTwice($, 'ship', () => shipIt($)), undefined, armed !== 'ship')
    // Where to go from here: the plan, the history, the settings. Elsewhere than the terminal the settings are a gear
    // beside the view, at the top right. On the terminal Autopilot's hint takes its room from their long labels:
    // a waiting plan's row with both needs 88 columns.
    const isShortRow = columns < (nightStartIn !== null && !vector ? 88 : 63)
    const places = isEnabled
      ? [
          list0?.hasPlan && action('plan', 'plan', 'Plan', () => showPlan($)),
          // ≣, not ☰: Unicode 16 made ☰ two cells wide, and the row shifted in newer terminals.
          action('history', 'history', 'Verlauf', () => showHistory($, dayKey(current), true)),
          !vector && action('settings', 'sliders', 'Einstellungen', () => showSettings($), isShortRow ? '⚙' : undefined),
          !vector && action('grill', 'spark', 'Grill mich', () => grillMe($), isShortRow ? `${GLYPH.spark} Grill` : undefined),
          !vector && handoffItem,
          !vector && shipItem,
        ].filter(Boolean)
      : []
    const actionItems = isEnabled ? [...controls, ...places] : null
    const usageParts = usage.limits.map(one => `${one.label} ${Math.round(one.percent)}%`)
    const top = usage.limitPercent ?? 0
    const isHigh = top >= LIMIT_WARN
    const reset = isHigh ? resetTime(usage.limitResetsAt, await now($)) : null
    if (vector) {
      // One row, in every view, only near a limit: the mod Statistik shows limits and context further down. The icon
      // carries the colour, as the app's own notices do.
      if (usageParts.length > 0 && isHigh) {
        const words = [`Du hast ${Math.round(top)}% deines ${usage.limitLabel ? `Limits (${usage.limitLabel})` : 'Plan-Limits'} verbraucht`, reset === null ? '' : `wird ${reset} zurückgesetzt`]
        warnings.push(
          line(
            'limit',
            kit.icon('alert', top >= LIMIT_ALERT ? 'alert' : 'warn', NOTICE),
            // Whole pieces, as in the header: about 0.8 of a cell a character, less the mark.
            <Text wrap="truncate-end">{wholePieces(words, Math.floor(columns / 0.8) - 3)}</Text>,
          ),
        )
      }
    } else if (usageParts.length > 0 && isHigh) {
      // Every view speaks up only near a limit: the mod Statistik shows limits and context further down.
      const color = top >= LIMIT_ALERT ? 'red' : 'yellow'
      const words = `Du hast ${Math.round(top)}% deines ${usage.limitLabel ? `Limits (${usage.limitLabel})` : 'Plan-Limits'} verbraucht${reset === null ? '' : ` · wird ${reset} zurückgesetzt`} · ${usageParts.join(' · ')}`
      warnings.push(
        <Box key="limit" width={columns}>
          <Text wrap="truncate-end" color={color}>
            {`⚠ ${words}`}
          </Text>
        </Box>,
      )
    }

    const isRecapShown = isEnabled && (await read($, recapAtom))
    const recapButton = <Button key="recap" label="Letzter Stand" onPress={() => showRecap($)} />
    const recapOk = <Button key="recap-ok" plain={vector ? undefined : true} label="OK" onPress={() => update($, recapAtom, () => false)} />
    if (isRecapShown) {
      const buttons = (
        <Box flexDirection="row" gap={1}>
          {recapButton}
          {recapOk}
        </Box>
      )
      warnings.push(
        vector ? (
          // Its buttons sit with the other actions at the bottom right.
          line(
            'recap',
            kit.badge('check', 'ok', NOTICE),
            <Text wrap="truncate-end">Chat aufgeräumt. Claude hat einen Sicherungspunkt der Arbeit behalten.</Text>,
          )
        ) : (
          <Box key="recap" flexDirection="row" justifyContent="space-between" width={columns}>
            <Box flexShrink={1}>
              <Text wrap="truncate-end" color="green">
                ✓ Chat aufgeräumt. Claude hat einen Sicherungspunkt der Arbeit behalten.
              </Text>
            </Box>
            {buttons}
          </Box>
        ),
      )
    }

    // The view: on the terminal one button steps through Simple → Details → Off. Elsewhere a menu shows the view and
    // the others, so no press turns Leitstand off by surprise; a surface without one (the phone) keeps the button.
    const view = !isEnabled ? 'off' : isMinimal ? 'minimal' : isDetailed ? 'detailed' : 'simple'
    const viewWords = { detailed: 'Ausführlich', simple: 'Einfach', minimal: 'Minimal', off: 'Aus' }
    const button =
      vector && 'Select' in table && table.Select ? (
        <table.Select
          key="view"
          value={view}
          options={[
            { value: 'detailed', label: viewWords.detailed },
            { value: 'simple', label: viewWords.simple },
            { value: 'minimal', label: viewWords.minimal },
            // Off is in Settings and /leitstand off; while it is on, the menu says so.
            ...(view === 'off' ? [{ value: 'off', label: viewWords.off }] : []),
          ]}
          onSelect={value => void setView($, value as typeof view)}
        />
      ) : (
      <Button
        key="toggle"
        label={
          vector
            ? viewWords[view]
            : `${isEnabled ? '●' : '○'} ${columns < NARROW ? '' : 'Leitstand: '}${view === 'detailed' ? 'Details' : viewWords[view]}`
        }
        variant={isEnabled && !vector ? 'primary' : 'secondary'}
        onPress={() => cycleMode($, isEnabled, detail)}
      />
      )
    // The work mode, while the Leitstand is on (off, no work mode applies), leads the places at the bottom left
    // elsewhere than the terminal: one button with the mode's sign, lit in both modes (it shows which, it is never
    // "off"); a press flips the two. The terminal keeps it in Settings and /leitstand arbeitsweise.
    const workModeItem = !isEnabled || !vector ? null : (
      <Button
        key="workmode"
        variant="primary"
        label={WORK_MODE_SIGNS[workMode]}
        onPress={() => void setWorkMode($, workMode === 'dynamisch' ? 'auto' : 'dynamisch')}
      />
    )
    // Autopilot right after it, as the A sign: lit while it runs, a press flips it.
    const nightShiftItem = !isEnabled || !vector ? null : <Button key="nightshift" variant={nightShift ? 'primary' : 'secondary'} label={NIGHTSHIFT} onPress={() => toggleNightShift($)} />
    // Grill mich behind it, as the steam sign.
    const grillItem = !isEnabled || !vector ? null : <Button key="grill" variant="secondary" label={GRILL} onPress={() => grillMe($)} />
    // The broom right behind it: the clean-code skill. The press does not wait for the command, which runs once the
    // session is idle; waiting would run the press past its budget while Claude works.
    const cleanItem =
      !isEnabled || !vector ? null : (
        <Button key="cleancode" variant="secondary" label={CLEAN_CODE} onPress={() => void runCleanCode($).catch(() => undefined)} />
      )
    // The mirror right behind the broom: the reflect mod's command, likewise not waited for.
    const reflectItem =
      !isEnabled || !vector ? null : (
        <Button key="reflect" variant="secondary" label={REFLECT} onPress={() => void runReflect($).catch(() => undefined)} />
      )
    // Then the skill buttons: humanize the last answer and ADHD mode beside Grill mich; past a bar the opener for
    // Filetree's side pane, alone; past the next bar Remote Control (only while the session has it),
    // masking on screen and the shield that moves the chat's secrets into the .env.
    const skillItems =
      !isEnabled || !vector
        ? null
        : {
            beside: [
              <Button key="humanize" variant="secondary" label={HUMANIZE} onPress={() => humanizeLast($)} />,
              <Button key="adhd" variant={adhd ? 'primary' : 'secondary'} label={ADHD} onPress={() => toggleAdhd($)} />,
            ],
            // An opener, not a switch: Filetree keeps its pane to itself, so the button never shows it as on.
            files: [<Button key="filetree" variant="secondary" label={FILETREE} onPress={() => openFiletree($)} />],
            past: [
              remote === 'missing' ? null : (
                <Button key="remote" variant={remote === 'on' ? 'primary' : 'secondary'} label={REMOTE} onPress={() => toggleRemote($)} />
              ),
              <Button key="privacy" variant={masks ? 'primary' : 'secondary'} label={masks ? MASK_ON : MASK_OFF} onPress={() => toggleMasking($)} />,
              <Button
                key="vault"
                variant="secondary"
                label={armed === 'vault' ? `${VAULT} Noch mal drücken` : VAULT}
                onPress={() => pressTwice($, 'vault', () => vaultSecrets($))}
              />,
            ],
          }
    // Elsewhere than the terminal a dim bar parts the groups at the bottom left: after ADHD mode, after Filetree, and
    // before the plan and the history. One stands only between two groups that show a button, so never at an end or
    // two side by side.
    const leftGroups = [
      { bar: '', items: [workModeItem, nightShiftItem, grillItem, cleanItem, reflectItem, ...(skillItems?.beside ?? [])] },
      { bar: 'sep-files', items: skillItems?.files ?? [] },
      { bar: 'sep-skills', items: skillItems?.past ?? [] },
      { bar: 'sep-places', items: places },
    ]
      .map(group => ({ ...group, items: group.items.filter(Boolean) }))
      .filter(group => group.items.length > 0)
    const leftItems = leftGroups.flatMap((group, at) =>
      at === 0 ? group.items : [<Text key={group.bar} dimColor>|</Text>, ...group.items],
    )
    // The row under the checklist. Elsewhere than the terminal: where to go on the left; on the right everything that
    // acts, together: another mod's buttons, Tidy up now, Fresh chat, then Pause, Start or Continue, the main one last,
    // as a dialog's buttons sit. In a narrow band the actions wrap onto a line of their own and still keep to the right.
    const actions =
      actionItems === null ? null : vector ? (
        <Box key="actions" flexDirection="row" alignItems="center" justifyContent="space-between" columnGap={2} rowGap={1} flexWrap="wrap" width={columns} marginTop={1}>
          <Box flexDirection="row" alignItems="center" columnGap={1} rowGap={1} flexWrap="wrap" flexShrink={1} minWidth={0}>
            {leftItems}
          </Box>
          <Box flexDirection="row" alignItems="center" justifyContent="flex-end" columnGap={1} rowGap={1} flexWrap="wrap" flexGrow={1} flexShrink={1} minWidth={0}>
            {isRecapShown && recapButton}
            {isRecapShown && recapOk}
            {lifted.buttons as RenderElement[]}
            {handoffItem}
            {shipItem}
            {controls}
          </Box>
        </Box>
      ) : (
        <Box key="actions" flexDirection="row" gap={columns < 44 ? 1 : 2}>
          {actionItems}
        </Box>
      )
    // Elsewhere than the terminal the settings sit right of the view, as a gear, in every state of the band.
    const gear = vector ? <Button key="settings" variant="secondary" label={GEAR} onPress={() => showSettings($)} /> : null
    // The header's right end holds the view, on every surface: elsewhere than the terminal a menu as wide as its
    // longest choice, "Ausführlich", and its arrow and padding, then the gear; counted a cell a character, so the
    // header never runs under them.
    const headerRight = gear ? [button, gear] : button
    const rightCells = vector ? 'Ausführlich'.length + 4 + 5 : columns < NARROW ? 15 : 27
    // In characters. Elsewhere than the terminal the app's font sets about 0.8 of a cell a character, so the header
    // counts that many more before it cuts its words.
    const headerWidth = Math.max(0, vector ? Math.floor((columns - rightCells - 2) / 0.8) : columns - rightCells)
    const row = (header: RenderChildren) => (
      <Box key="header" flexDirection="row" justifyContent="space-between" alignItems={vector ? 'center' : undefined} columnGap={vector ? 2 : undefined} width={columns}>
        <Box flexShrink={1} flexGrow={1} minWidth={0}>
          {header}
        </Box>
        {headerRight !== null && (
          <Box key="header-right" flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
            {headerRight}
          </Box>
        )}
      </Box>
    )
    // The bold words of a header are never cut: the longest of the ways to say it that fits, else the shortest.
    const leadOf = (ways: string[]) => ways.find(one => widthOf(one) <= headerWidth - 3) ?? ways[ways.length - 1] ?? ''
    // The header on vector surfaces: a mark, what is happening in bold, then the rest dim. Given as pieces, the rest
    // keeps whole pieces that fit and leaves the others out, as the Working header does.
    const headline = (mark: RenderChildren, lead: string | string[], rest: string | string[], look: { isRestPlain?: boolean } = {}) => {
      const shownLead = leadOf(Array.isArray(lead) ? lead : [lead])
      const room = Math.max(0, headerWidth - 3 - widthOf(shownLead))
      const shown = Array.isArray(rest) ? wholePieces(rest, room - 3) : fit(rest, room).trimEnd()
      return (
        <Box flexDirection="row" alignItems="center" gap={1}>
          {mark}
          <Text wrap="truncate-end">
            <Text bold>{shownLead}</Text>
            <Text dimColor={!look.isRestPlain}>{Array.isArray(rest) ? (shown === '' ? '' : ` · ${shown}`) : shown}</Text>
          </Text>
        </Box>
      )
    }

    const tourStep = isEnabled && !isMinimal && list === null ? await read($, tourAtom) : null
    if (tourStep !== null) {
      const isLast = tourStep === TOUR.length - 1
      if (vector) {
        // The checklist's frame: the view at the top right; under the words the places to go on the left, and on the
        // right the tour's own buttons, Next last.
        return withBeneath(
          <Box flexDirection="column" width={columns}>
            {row(
              <Box flexDirection="row" alignItems="center" gap={1}>
                {kit.icon('spark', 'active', STATUS)}
                <Text bold wrap="truncate-end">
                  {leadOf(['Willkommen im Leitstand', 'Willkommen'])}
                </Text>
              </Box>,
            )}
            {line('tour-text', kit.blank(), <Text wrap="wrap">{TOUR_VECTOR[tourStep]}</Text>)}
            {warnings}
            <Box key="tour" flexDirection="row" alignItems="center" justifyContent="space-between" columnGap={2} rowGap={1} flexWrap="wrap" width={columns} marginTop={1}>
              <Box flexDirection="row" alignItems="center" columnGap={1}>
                {action('history', 'history', 'Verlauf', () => showHistory($, dayKey(current), true))}
              </Box>
              <Box flexDirection="row" alignItems="center" justifyContent="flex-end" columnGap={1} flexGrow={1}>
                {lifted.buttons as RenderElement[]}
                <Box alignItems="center" marginLeft={1} marginRight={1}>
                  {kit.dots(TOUR.length, tourStep)}
                </Box>
                {!isLast && <Button key="tour-skip" label="Überspringen" onPress={() => stepTour($, null)} />}
                <Button key="tour-next" variant="primary" label={isLast ? 'Verstanden' : 'Weiter'} onPress={() => stepTour($, tourStep + 1)} />
              </Box>
            </Box>
          </Box>,
        )
      }
      return withBeneath(
        <Box flexDirection="column" width={columns}>
          <Text bold wrap="truncate-end">{`Willkommen im Leitstand · ${tourStep + 1} von ${TOUR.length}`}</Text>
          <Text wrap="wrap">{TOUR[tourStep]}</Text>
          <Box key="tour" flexDirection="row" gap={2} marginBottom={1}>
            <Button key="tour-next" plain label={isLast ? '✓ Verstanden' : 'Weiter ▶'} onPress={() => stepTour($, tourStep + 1)} />
            {!isLast && <Button key="tour-skip" plain label="Überspringen" onPress={() => stepTour($, null)} />}
          </Box>
          {warnings}
          {actions}
        </Box>,
      )
    }

    if (isMinimal) {
      // One line: the state in bold, the steps done in brackets, then the time left (or taken) and the tokens so far;
      // on its right the view menu. Under it the row of places and actions, Start and Continue among them.
      const clockAt = list?.finishedAt ?? current
      const active = list?.tasks.find(one => one.status === 'active')
      const activePercent = list && active ? stepEstimate(list, active, clockAt).percent : undefined
      const left = list?.hasPlan && list.phase !== 'done' ? timeLeft(list, clockAt, activePercent) : null
      const took = list ? (vector ? durationWords : formatDuration)(clockAt - list.startedAt) : ''
      const used = list ? list.tasks.reduce((sum, one) => sum + one.tokens, list.extraTokens) : 0
      const isPause = list?.stopKind === 'pause'
      const lead = isCompacting
        ? COMPACTING
        : list === null
          ? 'Bereit'
          : list.phase === 'needsYou'
            ? list.approval === 'waiting'
              ? 'Wartet auf Start'
              : 'Braucht dich'
            : list.phase === 'stuck'
              ? 'Hängt fest'
              : list.phase === 'stopped'
                ? isPause
                  ? 'Pausiert'
                  : 'Gestoppt'
                : list.phase === 'background'
                  ? 'Im Hintergrund'
                  : list.phase === 'done'
                    ? 'Fertig'
                    : 'Arbeitet'
      const steps = list?.hasPlan ? ` (${list.tasks.filter(one => one.status === 'done').length}/${list.tasks.length})` : ''
      const rest = [
        list === null ? '' : list.phase === 'done' ? `dauerte ${took}` : left === null ? `bisher ${took}` : `noch etwa ${formatLeft(left)}`,
        used > 0 ? `${formatTokens(used)} Tokens` : '',
      ].filter(Boolean)
      const mark = isCompacting
        ? kit.ring(null, isCalm ? 0 : tick, STATUS)
        : list === null
          ? kit.icon('plan', 'quiet', 'Noch kein Plan')
          : list.phase === 'needsYou'
            ? kit.badge('bell', 'warn', STATUS)
            : list.phase === 'stuck'
              ? kit.badge('bang', 'alert', STATUS)
              : list.phase === 'stopped'
                ? kit.badge(isPause ? 'pause' : 'stop', 'quiet', STATUS)
                : list.phase === 'done'
                  ? kit.badge('check', 'ok', STATUS)
                  : list.phase === 'background'
                    ? kit.icon('clock', 'active', STATUS)
                    : list.hasPlan
                      ? kit.ring(overallProgress(list.tasks, activePercent).percent, 0, STATUS)
                      : kit.ring(null, isCalm ? 0 : tick, STATUS)

      return withBeneath(
        <Box flexDirection="column" width={columns}>
          <Box key="header" flexDirection="row" justifyContent="space-between" alignItems={vector ? 'center' : undefined} columnGap={vector ? 2 : 1} width={columns}>
            <Box flexDirection="row" alignItems="center" gap={1} flexGrow={1} flexShrink={1} minWidth={0}>
              {mark}
              <Text wrap="truncate-end">
                <Text bold>{lead}</Text>
                <Text>{steps}</Text>
                <Text dimColor>{rest.length > 0 ? ` · ${rest.join(' · ')}` : ''}</Text>
              </Text>
            </Box>
            <Box key="header-right" flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
              {button}
              {gear}
            </Box>
          </Box>
          {actions}
        </Box>,
      )
    }

    if (list === null) {
      const hint = vector ? 'Bitte Claude um etwas, dann erscheint hier sein Plan' : 'Bitte Claude um etwas: Hier erscheint sein Plan'
      // Nothing to show yet. Elsewhere than the terminal it keeps the checklist's frame: the hint and the view on top;
      // below, the places to go on the left and, when the chat is full, Tidy up now on the right.
      return withBeneath(
        <Box flexDirection="column" width={columns}>
          {row(
            isCompacting ? (
              vector ? (
                headline(kit.ring(null, 0, STATUS), COMPACTING, [])
              ) : (
                <Text bold wrap="truncate-end">
                  {fit(COMPACTING, headerWidth).trimEnd()}
                </Text>
              )
            ) : !isEnabled ? (
              vector ? (
                <Text dimColor wrap="truncate-end">
                  Der Leitstand ist aus: Claude Code zeigt alles wie gewohnt
                </Text>
              ) : (
                <Text> </Text>
              )
            ) : vector ? (
              <Box flexDirection="row" alignItems="center" gap={1}>
                {kit.icon('plan', 'quiet', 'Noch kein Plan')}
                <Text dimColor wrap="truncate-end">
                  {wholePieces([hint], headerWidth - 3)}
                </Text>
              </Box>
            ) : (
              <Text dimColor wrap="truncate-end">
                {fit(hint, headerWidth).trimEnd()}
              </Text>
            ),
          )}
          {warnings}
          {actions}
        </Box>,
      )
    }

    const elapsed = (vector ? durationWords : formatDuration)((list.finishedAt ?? current) - list.startedAt)
    // A paused or stopped job's clock stands still at the moment it stopped.
    const stepClock = list.finishedAt ?? current
    const jobTokens = list.tasks.reduce((sum, one) => sum + one.tokens, list.extraTokens)
    const jobCached = list.tasks.reduce((sum, one) => sum + one.cachedTokens, list.extraCachedTokens)
    const spent = jobCost(list, usage)
    const jobTokenNote = isDetailed
      ? [tokenNote(jobTokens, jobCached), spent === null ? '' : formatCost(spent)].filter(Boolean).join(' · ')
      : ''
    const activeStep = list.tasks.find(one => one.status === 'active')
    // Why Claude stopped, when it isn't working: on vector surfaces it sits beside the current step, so the header keeps
    // to the state and the job's name; with no current step it stays in the header.
    const limitResets = list.phase === 'stuck' && /limit/i.test(list.stuckReason ?? '') ? resetTime(usage.limitResetsAt, current) : null
    const reason =
      list.phase === 'stuck'
        ? // Elsewhere than the terminal a usage limit reads as a short fact, with when it lifts where the app has told us.
          vector && /limit/i.test(list.stuckReason ?? '')
          ? `Nutzungslimit erreicht · ${limitResets === null ? 'versuch es später noch mal' : `wird ${limitResets} zurückgesetzt`}`
          : (list.stuckReason ?? FAILING)
        : list.phase === 'stopped'
          ? list.stopKind === 'pause'
            ? 'Drück Weiter, um fortzufahren'
            : 'Du hast Esc gedrückt'
          : ''
    const isReasonOnStep = vector && activeStep !== undefined
    // Both views fill the current step from its time estimate, so the percentage moves before a step is checked off.
    const activeEstimate = activeStep ? stepEstimate(list, activeStep, stepClock).percent : undefined
    const overall = overallProgress(list.tasks, activeEstimate).percent
    let header: RenderChildren
    if (isCompacting) {
      header = vector ? (
        headline(kit.ring(null, isCalm ? 0 : tick, STATUS), COMPACTING, [list.title])
      ) : (
        <Text wrap="truncate-end" bold>
          {fit(`${COMPACTING} · ${list.title}`, headerWidth).trimEnd()}
        </Text>
      )
    } else if (list.phase === 'needsYou') {
      const reason = needsText(list) ?? PERMISSION
      header = vector ? (
        // The amber is in the icon; the words keep the app's text colour, which reads on a light window too.
        headline(kit.badge('bell', 'warn', STATUS), 'Braucht dich', [reason], { isRestPlain: true })
      ) : (
        <Text wrap="truncate-end">
          <Text bold inverse color="yellow">
            {' Braucht dich '}
          </Text>
          <Text> {fit(reason, headerWidth - 15).trimEnd()}</Text>
        </Text>
      )
    } else if (list.phase === 'stuck') {
      header = vector ? (
        headline(kit.badge('bang', 'alert', STATUS), 'Hängt fest', isReasonOnStep ? [list.title] : [reason, list.title])
      ) : (
        <Text wrap="truncate-end" color="yellow" bold={isCalm}>
          {fit(`⚠ Hängt fest: ${list.stuckReason ?? FAILING}`, headerWidth).trimEnd()}
        </Text>
      )
    } else if (list.phase === 'stopped') {
      const isPause = list.stopKind === 'pause'
      header = vector ? (
        headline(
          kit.badge(isPause ? 'pause' : 'stop', 'quiet', STATUS),
          isPause ? 'Pausiert' : 'Gestoppt',
          isReasonOnStep ? [list.title] : [reason, list.title],
        )
      ) : (
        <Text wrap="truncate-end" dimColor={!isCalm} bold={isCalm}>
          {fit(
            isPause ? `‖ Pausiert · Drück Weiter, um fortzufahren · ${list.title}` : `■ Gestoppt · Du hast Esc gedrückt · ${list.title}`,
            headerWidth,
          ).trimEnd()}
        </Text>
      )
    } else if (list.phase === 'background') {
      const running = list.helpers.filter(one => one.status === 'running').length
      header = vector ? (
        headline(
          kit.icon('clock', 'active', STATUS),
          ['Arbeitet noch im Hintergrund', 'Im Hintergrund', 'Hintergrund'],
          [`noch ${running}`, list.title, elapsed],
        )
      ) : (
        <Text wrap="truncate-end" color="cyan" bold={isCalm}>
          {fit(`◷ Arbeitet noch im Hintergrund · noch ${running} · ${list.title} · ${elapsed}`, headerWidth).trimEnd()}
        </Text>
      )
    } else if (list.phase === 'done') {
      header = vector ? (
        headline(kit.badge('check', 'ok', STATUS), 'Fertig', [list.title, `dauerte ${elapsed}`, jobTokenNote])
      ) : (
        <Text wrap="truncate-end" color="green" bold={isCalm}>
          {fit(`✓ Fertig · ${list.title} · dauerte ${elapsed}${jobTokenNote ? ` · ${jobTokenNote}` : ''}`, headerWidth).trimEnd()}
        </Text>
      )
    } else {
      // Time left follows the percentage shown, so the two never disagree.
      const left = list.hasPlan ? timeLeft(list, current, activeEstimate) : null
      const hasGrown = list.hasPlan && list.plannedCount > 0 && list.tasks.length > list.plannedCount
      // Time left replaces time spent once there is an estimate. Elsewhere than the terminal the ring shows the
      // percentage, so the words count steps, as the Plan does.
      const stepsDone = list.tasks.filter(one => one.status === 'done').length
      const lead = list.approval === 'waiting' ? 'Plan steht' : 'Arbeitet'
      const pieces = [
        list.hasPlan ? (vector ? `${stepsDone} von ${list.tasks.length} fertig` : `${overall}%`) : '',
        // Elsewhere than the terminal a bare "8s" could read as time left: it says so.
        left === null ? (vector ? `bisher ${elapsed}` : elapsed) : `noch etwa ${formatLeft(left)}`,
        hasGrown ? `Plan gewachsen ${list.plannedCount} → ${list.tasks.length}` : '',
        jobTokenNote,
      ]
      // Elsewhere than the terminal, where the job's name leaves no room for how far it is, the name gives way: the
      // steps are right below it, and the Plan has it.
      const firstPiece = pieces.find(Boolean) ?? ''
      const roomWithTitle = headerWidth - 6 - widthOf(lead) - widthOf(list.title)
      const keepsTitle = !vector || firstPiece === '' || widthOf(` · ${firstPiece}`) <= roomWithTitle
      const detailRoom = !vector ? headerWidth - Math.min(list.title.length, 20) : keepsTitle ? roomWithTitle : headerWidth - 3 - widthOf(lead)
      // Whole pieces drop off the end when there is no room, never half a word.
      const shownDetails = headerDetails(pieces, detailRoom)
      // Elsewhere than the terminal not even the first piece is cut.
      const details = vector && widthOf(shownDetails) > detailRoom ? '' : shownDetails
      header = vector ? (
        // Every state's header reads the same way: its mark, the state in bold, then the job and how far it is.
        headline(
          list.hasPlan ? kit.ring(overall, 0, `${overall}% fertig`) : kit.ring(null, isCalm ? 0 : tick, STATUS),
          lead,
          keepsTitle ? ` · ${list.title}${details}` : details,
        )
      ) : (
        <Text wrap="truncate-end">
          <Text bold>{fit(list.title, Math.max(8, headerWidth - details.length)).trimEnd()}</Text>
          <Text dimColor>{details}</Text>
        </Text>
      )
    }

    if (list.phase === 'done' && list.isCollapsed) {
      return withBeneath(
        <Box flexDirection="column" width={columns}>
          {row(header)}
          {warnings}
          {actions}
        </Box>,
      )
    }

    // Name column: whatever the row leaves after mark, meter and label, so rows never wrap.
    const hasMeter = columns >= METER_MIN_COLUMNS
    const bar = (cells: string) => (hasMeter ? ` ${cells} ` : ' ')
    const nameWidth = Math.max(4, Math.min(MAX_NAME, columns - 2 - 2 - (hasMeter ? METER + 2 : 1) - LABEL_WIDTH - 1))
    const room = Math.max(1, e.props.maxRows - 1 - warnings.length - (actions ? 1 : 0))
    const firstUpcoming = list.tasks.findIndex(one => one.status === 'upcoming')
    // What is left of the row after mark, name, meter and label: the step's tokens, when they fit.
    const usageRoom = columns - 2 - nameWidth - (hasMeter ? METER + 2 : 1) - LABEL_WIDTH - 1
    const noteOf = (one: GlanceTask) => {
      let timeNote = ''
      if (one.status === 'done' && one.startedAt !== null && one.finishedAt !== null) {
        timeNote = `dauerte ${(vector ? durationWords : formatDuration)(one.finishedAt - one.startedAt)}`
      } else if (one.status === 'active') {
        const estimate = stepEstimate(list, one, stepClock)
        // Elsewhere than the terminal the band gives the step's time left alone; the Plan keeps the time spent too.
        timeNote = vector ? leftLabel(estimate.leftMs, true) : `${formatDuration(estimate.elapsedMs)} · ${leftLabel(estimate.leftMs)}`
      }
      return isDetailed ? [timeNote, tokenNote(one.tokens, one.cachedTokens)].filter(Boolean).join(' · ') : ''
    }
    const usageCell = (one: GlanceTask) => {
      const note = noteOf(one)
      return note && usageRoom >= 12 ? <Text dimColor>{` ${fit(note, usageRoom - 1).trimEnd()}`}</Text> : null
    }
    // A step on vector surfaces: its mark and name, then, dim, what it is doing or got done; in Details its time and
    // tokens keep to a column on the right. A step whose mark says it all gets no word of its own.
    // Its time follows it inline, as a finished step's does. When the row runs short the tail gives way first (it
    // shrinks a hundred times faster than the name), and the time is never cut.
    // What follows the name reads as the header does: parts joined by " · " with no wider gap before the dot (the
    // spaces are no-break ones, which the app keeps at the start of a part), the bar standing in for the first.
    const join = (words: string) => `\u00a0·\u00a0${words}`
    // Elsewhere than the terminal a row's words are measured here, at about 0.8 of a cell a character, so the app never
    // cuts one: past the mark (and `cells` more kept beside the name), a name too long for the row keeps whole words, and
    // the tail keeps whole pieces in the room left after the name and the `gap` before the tail.
    const roomFor = (cells: number) => Math.max(0, Math.floor((columns - 3 - cells) / 0.8) - 1)
    const fitted = (name: string, tail: string, room: number, gap = 3) => {
      const shownName = widthOf(name) <= room ? name : wholePieces([name], room)
      return { name: shownName, tail: tail === '' ? '' : wholePieces(tail.split(' · '), room - widthOf(shownName) - gap) }
    }
    const step = (key: string, mark: RenderChildren, name: RenderChildren, tail: string, extra?: RenderChildren, note = '') => (
      <Box key={key} flexDirection="row" alignItems="center" width={columns}>
        {mark}
        <Box flexShrink={1} minWidth={0} marginLeft={1}>
          {name}
        </Box>
        {extra && <Box marginLeft={1}>{extra}</Box>}
        {tail !== '' && (
          <Box key="tail" flexShrink={100} minWidth={0} marginLeft={extra ? 1 : 0}>
            <Text dimColor wrap="truncate-end">
              {extra ? tail : join(tail)}
            </Text>
          </Box>
        )}
        {note !== '' && (
          <Box key="note" flexShrink={0} marginLeft={tail === '' && extra ? 1 : 0}>
            <Text dimColor>{tail === '' && extra ? note : join(note)}</Text>
          </Box>
        )}
      </Box>
    )
    // A line under a step, in line with the step names: what it got done, what Claude is doing, what is out of view.
    const under = (key: string, text: string) =>
      vector ? (
        line(
          key,
          kit.blank(),
          <Text dimColor wrap="truncate-end">
            {wholePieces(text.split(' · '), roomFor(0))}
          </Text>,
        )
      ) : (
        <Box key={key} flexDirection="row">
          <Text dimColor wrap="truncate-end">
            {fit(`    ${text}`, Math.max(0, columns - 1)).trimEnd()}
          </Text>
        </Box>
      )
    const lastStepId = list.tasks[list.tasks.length - 1]?.id
    const stepIds = new Set(list.tasks.map(one => one.id))
    const helpersOf = (stepId: string) =>
      list.helpers
        .filter(one => one.stepId === stepId || (stepId === lastStepId && !stepIds.has(one.stepId)))
        // Running first, then the latest finished.
        .sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running'))
        .slice(0, HELPERS_PER_STEP)

    // What the step that just finished got done, until Claude's next activity takes the line.
    // Steps checked off together finish at the same moment: the latest in the plan wins.
    const justDone = list.tasks
      .filter(one => one.status === 'done' && one.finishedAt !== null)
      .reverse()
      .sort((a, b) => b.finishedAt! - a.finishedAt!)[0]
    const showsSummary = (list.phase === 'working' || list.phase === 'done') && list.activity === null && Boolean(justDone?.summary)

    // A long plan folds its finished steps, and the steps after the next one, into a line each.
    const isCompact = list.tasks.length > COMPACT_AFTER
    const doneSteps = list.tasks.filter(one => one.status === 'done')
    const foldsDone = isCompact && doneSteps.length >= 2
    const laterSteps = list.tasks.filter((one, index) => one.status === 'upcoming' && index !== firstUpcoming)
    const foldsLater = isCompact && laterSteps.length >= 2
    // Where the current step stands: the word says when Claude isn't working on it.
    const standing =
      list.phase === 'needsYou'
        ? { mark: '‖ ', label: 'Wartet', icon: 'bell' as const, tone: 'warn' as const }
        : list.phase === 'stuck'
          ? { mark: '⚠ ', label: 'Hängt fest', icon: 'bang' as const, tone: 'alert' as const }
          : list.phase === 'stopped'
            ? list.stopKind === 'pause'
              ? { mark: '‖ ', label: 'Pausiert', icon: 'pause' as const, tone: 'quiet' as const }
              : { mark: '■ ', label: 'Gestoppt', icon: 'stop' as const, tone: 'quiet' as const }
            : null

    // Every line: each step, then the helpers working under it.
    // `steps`: how many plan steps a line stands for (a folded line stands for several).
    const lines: { key: string; isActive: boolean; element: RenderChildren; steps?: number }[] = []
    list.tasks.forEach((one, index) => {
      const key = `task-${index}`
      if (one.status === 'done' && foldsDone) {
        if (one !== doneSteps[0]) return
        const words = `${doneSteps.length} Schritte fertig`
        lines.push({
          key,
          steps: doneSteps.length,
          isActive: false,
          element: vector ? (
            // A summary of steps, not a step: its own quiet mark, so the tick and the ring stay for real steps.
            step(
              key,
              kit.icon('more', 'quiet', 'Zusammengefasst'),
              <Text dimColor wrap="truncate-end">
                {fitted(words, '', roomFor(0)).name}
              </Text>,
              '',
            )
          ) : (
            <Box key={key} flexDirection="row">
              <Text color="green">✓ </Text>
              <Text dimColor>{fit(words, nameWidth)}</Text>
              <Text color="green">{bar('█'.repeat(METER))}</Text>
              <Text dimColor>{fit('Fertig', LABEL_WIDTH)}</Text>
            </Box>
          ),
        })
        // A summary under a folded group would hang under the wrong line: the terminal keeps it, elsewhere it goes.
        if (showsSummary && justDone && !vector) {
          lines.push({ key: 'summary', isActive: false, element: under('summary', justDone.summary!) })
        }
        return
      }
      if (one.status === 'upcoming' && foldsLater && index !== firstUpcoming) {
        if (one !== laterSteps[0]) return
        // Elsewhere than the terminal the row says where the rest are.
        const words = vector ? `${laterSteps.length} weitere Schritte im Plan` : `${laterSteps.length} weitere Schritte`
        lines.push({
          key,
          steps: laterSteps.length,
          isActive: false,
          element: vector ? (
            step(
              key,
              kit.icon('more', 'quiet', 'Zusammengefasst'),
              <Text dimColor wrap="truncate-end">
                {fitted(words, '', roomFor(0)).name}
              </Text>,
              '',
            )
          ) : (
            <Box key={key} flexDirection="row">
              <Text dimColor>○ </Text>
              <Text dimColor>{fit(words, nameWidth)}</Text>
              <Text dimColor>{bar('░'.repeat(METER))}</Text>
              <Text dimColor>Später</Text>
            </Box>
          ),
        })
        return
      }
      if (one.status === 'done') {
        // Its time follows it, dim: kept to the far right it read as the time left.
        const done = fitted(one.name, [showsSummary && one === justDone ? one.summary! : '', noteOf(one)].filter(Boolean).join(' · '), roomFor(0))
        lines.push({
          key,
          isActive: false,
          element: vector ? (
            step(
              key,
              kit.icon('done', 'ok', 'Fertig'),
              <Text dimColor wrap="truncate-end">
                {done.name}
              </Text>,
              done.tail,
            )
          ) : (
            <Box key={key} flexDirection="row">
              <Text color="green">✓ </Text>
              <Text dimColor>{fit(one.name, nameWidth)}</Text>
              <Text color="green">{bar('█'.repeat(METER))}</Text>
              <Text dimColor>{fit('Fertig', LABEL_WIDTH)}</Text>
              {usageCell(one)}
            </Box>
          ),
        })
        if (showsSummary && one === justDone && !vector) {
          lines.push({ key: 'summary', isActive: false, element: under('summary', one.summary!) })
        }
      } else if (one.status === 'active') {
        // The details view fills the bar gradually from the time estimate; the simple view sweeps until Claude reports.
        const shownPercent = isDetailed ? stepEstimate(list, one, stepClock).percent : one.percent
        // Elsewhere than the terminal a bar shows only while Claude works on the step: a frozen one says nothing.
        const hasPercent = (isDetailed || one.hasReported) && !(vector && standing !== null)
        const label = standing?.label ?? (hasPercent ? `${shownPercent}%` : 'Arbeitet')
        // Only a step Claude is working on moves; one that waits on you or has stopped stands still.
        const isStill = isCalm || standing !== null
        let element: RenderChildren
        if (vector && list.approval === 'waiting') {
          // Nothing has started while the plan waits for Start: the first step is one more to come, and the amber of
          // the header is the only call on you.
          element = step(key, kit.open('Als Nächstes'), <Text wrap="truncate-end">{fitted(one.name, '', roomFor(0)).name}</Text>, '')
        } else if (vector) {
          // The bar shows how far the step is, so no number stands beside it; a step that waits on you or has stopped
          // goes grey, the header saying why. With no progress reported yet there is no bar, only what Claude is
          // doing, in its own words when they fit.
          const activity = list.phase === 'working' ? list.activity : null
          const doing =
            activity === null
              ? ''
              : activity.detail !== null && widthOf(activity.detail) <= 48
                ? activity.detail
                : `${activity.label}${activity.count > 1 ? ` (${activity.count})` : ''}`
          // Before Claude reports how far it is, a short bar travels along the track: the row reads as every working
          // row does, and no word repeats the header. A calm screen keeps still, so it shows no bar then.
          const isSweeping = standing === null && !hasPercent && !isCalm
          const tail = isReasonOnStep && reason !== '' ? reason.charAt(0).toUpperCase() + reason.slice(1) : doing
          const note = noteOf(one)
          // A few letters of what Claude is doing say nothing: it shows only where a dozen or more fit. Why the step
          // stopped always shows; the header no longer says it.
          const tailRoom = columns - 3 - widthOf(one.name) - (hasPercent || isSweeping ? 10 : 0) - (note !== '' ? widthOf(note) + 3 : 0)
          // The bar takes 8 cells and a cell either side; the time beside it is never cut.
          const hasBar = hasPercent || isSweeping
          const shown = fitted(
            one.name,
            tailRoom >= 14 || (isReasonOnStep && reason !== '') ? tail : '',
            roomFor(hasBar ? 10 : 0) - (note !== '' ? widthOf(note) + 3 : 0),
            hasBar ? 0 : 3,
          )
          // The bar says how far the step is, so the mark beside the name says Now, as the Plan's does, not that again.
          element = step(
            key,
            kit.badge(standing?.icon ?? 'play', standing?.tone ?? 'active', standing?.label ?? 'Jetzt'),
            <Text bold wrap="truncate-end">
              {shown.name}
            </Text>,
            shown.tail,
            hasPercent || isSweeping ? (
              <Box key="state" flexDirection="row" alignItems="center" flexShrink={0}>
                {hasPercent
                  ? kit.meter('active', shownPercent, 0, label, 72)
                  : kit.meter('active', null, ((tick % 12) + 0.5) / 12, label, 72)}
              </Box>
            ) : undefined,
            note,
          )
        } else {
          const filled = Math.round(shownPercent / 10)
          const sweepAt = tick % (METER + 3)
          const meter = hasPercent
            ? '█'.repeat(filled) + '░'.repeat(METER - filled)
            : isStill
              ? '░'.repeat(METER)
              : Array.from({ length: METER }, (_, cell) => (cell >= sweepAt - 2 && cell <= sweepAt ? '█' : '░')).join('')
          element = (
            <Box key={key} flexDirection="row">
              <Text color={standing?.label === 'Hängt fest' ? 'yellow' : 'cyan'}>{standing?.mark ?? '▶ '}</Text>
              <Text bold>{fit(one.name, nameWidth)}</Text>
              <Text color="cyan">{bar(meter)}</Text>
              <Text>{fit(label, LABEL_WIDTH)}</Text>
              {usageCell(one)}
            </Box>
          )
        }
        lines.push({ key, isActive: true, element })
        // What Claude is doing right now, in plain words: a line of its own on the terminal; elsewhere it follows the bar.
        if (list.phase === 'working' && list.activity !== null && !vector) {
          const { label: doing, count, detail } = list.activity
          const plain = `${doing}${count > 1 ? ` (${count})` : ''}`
          // Claude's own sentence when it fits the line whole; otherwise the short plain label, never a cut sentence.
          const sentence = detail !== null && widthOf(`    Jetzt: ${detail}`) <= columns - 1 ? `Jetzt: ${detail}` : plain
          lines.push({ key: 'activity', isActive: false, element: under('activity', sentence) })
        }
      } else {
        const label = index === firstUpcoming ? 'Als Nächstes' : 'Später'
        lines.push({
          key,
          isActive: false,
          element: vector ? (
            step(key, kit.open(label), <Text wrap="truncate-end">{fitted(one.name, '', roomFor(0)).name}</Text>, '')
          ) : (
            <Box key={key} flexDirection="row">
              <Text dimColor>○ </Text>
              <Text dimColor>{fit(one.name, nameWidth)}</Text>
              <Text dimColor>{bar('░'.repeat(METER))}</Text>
              <Text dimColor>{label}</Text>
            </Box>
          ),
        })
      }
      for (const helper of helpersOf(one.id).filter(helper => !(foldsDone && one.status === 'done') || helper.status === 'running')) {
        const helperKey = `helper-${helper.id}`
        // Say "in the background" once: not when the task's own name already does.
        const kindLabel =
          helper.kind === 'background'
            ? /background|hintergrund/i.test(helper.label)
              ? null
              : 'im Hintergrund'
            : helper.type === 'general-purpose'
              ? 'Helfer'
              : helperType(helper.type)
        const details = (
          isDetailed
            ? [
                kindLabel,
                helper.model,
                helper.effort ? effortWords(helper.effort) : null,
                helper.tokens > 0 ? `${formatTokens(helper.tokens)} Tokens` : null,
              ]
            : [kindLabel]
        )
          .filter(Boolean)
          .join(' · ')
        const isRunning = helper.status === 'running'
        if (vector) {
          // Its own small mark and a gap take two cells more.
          const shown = fitted(helper.label, details, roomFor(2))
          lines.push({
            key: helperKey,
            isActive: isRunning,
            element: line(
              helperKey,
              kit.blank(),
              <Box flexDirection="row" alignItems="center" gap={1}>
                {isRunning
                  ? kit.ring(null, isCalm ? 0 : tick, 'Läuft', 13)
                  : helper.status === 'failed'
                    ? kit.badge('close', 'alert', 'Fehlgeschlagen', 13)
                    : kit.badge('check', 'ok', 'Fertig', 13)}
                <Text wrap="truncate-end">
                  <Text dimColor={!isRunning}>{shown.name}</Text>
                  {shown.tail !== '' && <Text dimColor>{` · ${shown.tail}`}</Text>}
                </Text>
              </Box>,
            ),
          })
          continue
        }
        const icon = isRunning ? (isCalm ? '◐' : SPINNER[tick % SPINNER.length]!) : helper.status === 'failed' ? '✗' : '✓'
        // The whole row is the description's: "in the background" and the details go first when it is short of room.
        const room = Math.max(4, columns - 7)
        const hasRoom = details !== '' && widthOf(helper.label) + 1 + widthOf(details) <= room
        lines.push({
          key: helperKey,
          isActive: isRunning,
          element: (
            <Box key={helperKey} flexDirection="row">
              <Text dimColor>{'  ↳ '}</Text>
              <Text color={isRunning ? 'cyan' : helper.status === 'failed' ? 'red' : 'green'}>{`${icon} `}</Text>
              <Text dimColor={!isRunning} wrap="truncate-end">
                {hasRoom ? helper.label : fit(helper.label, room).trimEnd()}
              </Text>
              {hasRoom && <Text dimColor wrap="truncate-end">{` ${details}`}</Text>}
            </Box>
          ),
        })
      }
    })

    // Window the lines so the current step (and what runs under it) stays in view,
    // and say how many steps are out of view.
    const focus = Math.max(0, lines.findIndex(one => one.isActive))
    // One line of context above the current step when there is room for it.
    const windowAt = (size: number) => Math.min(Math.max(0, focus - (size > 2 ? 1 : 0)), Math.max(0, lines.length - size))
    const stepsIn = (from: number, to: number) =>
      lines.slice(from, to).reduce((sum, one) => sum + (one.key.startsWith('task-') ? (one.steps ?? 1) : 0), 0)
    const isCut = stepsIn(0, windowAt(room)) + stepsIn(windowAt(room) + room, lines.length) > 0
    // The "more steps" line needs a row of its own; with a single row the current step wins.
    const shown = isCut && room > 1 ? room - 1 : room
    const first = windowAt(shown)
    const above = stepsIn(0, first)
    const below = stepsIn(first + shown, lines.length)
    const rows = lines.slice(first, first + shown).map(one => one.element)
    if (above + below > 0 && shown < room) {
      const more = [above > 0 ? `${above} davor` : '', below > 0 ? `${below} ${below === 1 ? 'weiterer Schritt' : 'weitere Schritte'}` : '']
        .filter(Boolean)
        .join(' · ')
      rows.push(
        vector ? (
          under('more', more)
        ) : (
          <Text key="more" dimColor wrap="truncate-end">
            {`  … ${more}`}
          </Text>
        ),
      )
    }

    return withBeneath(
      <Box flexDirection="column" width={columns}>
        {row(header)}
        {rows}
        {warnings}
        {actions}
      </Box>,
    )
  })
}
