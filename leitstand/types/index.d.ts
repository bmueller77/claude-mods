export type GlanceTaskStatus = 'done' | 'active' | 'upcoming'

/** How big a step is: small, medium or large, counting 1, 2 or 3 toward overall progress. */
export type GlanceTaskSize = 'S' | 'M' | 'L'

export type GlanceTask = {
  id: string
  name: string
  status: GlanceTaskStatus
  percent: number
  hasReported: boolean
  size: GlanceTaskSize
  /** What the step got done, in one plain-English line, as Claude said when it checked it off; null until then. */
  summary: string | null
  /** Tokens the model handled for this step: sent, read from the cache, written to it, and written back. */
  tokens: number
  /** Of those, the tokens read from the prompt cache. */
  cachedTokens: number
  /** When the step became the current one; null while upcoming. */
  startedAt: number | null
  /** When it was checked off; null until then. */
  finishedAt: number | null
  /** Files Claude wrote or edited during the step; absent on steps saved before 0.20. */
  files?: GlanceFile[]
}

/** A file Claude wrote or edited: its path within the project (just its name outside it), and whether the step created it. */
export type GlanceFile = { path: string; isNew: boolean }

/** `background`: Claude answered, but helpers or background tasks still run. */
export type GlancePhase = 'working' | 'needsYou' | 'stuck' | 'stopped' | 'background' | 'done'

/** A helper working under a step: a subagent, or a background task such as a long command. */
export type GlanceHelper = {
  id: string
  /** The step it was started under. */
  stepId: string
  kind: 'helper' | 'background'
  /** What it works on, in plain words. */
  label: string
  /** The helper type (Explore, general-purpose) or the background task's type (shell). */
  type: string
  /** The model it runs on, as people say it ("Haiku 4.5"); null until known. */
  model: string | null
  /** How hard it thinks (low to max); null until known or for a model without effort. */
  effort: string | null
  status: 'running' | 'done' | 'failed'
  /** Tokens this helper's own model requests handled. */
  tokens: number
  /**
   * True when it was started in a turn whose request said "ultracode": its tag shows Ultracode for the effort. Absent
   * otherwise, and on helpers saved before 0.60.
   */
  ultracode?: boolean
}

export type GlanceChecklist = {
  title: string
  phase: GlancePhase
  tasks: GlanceTask[]
  needsYouReason: string | null
  /** What Claude asked, in its own words, when the turn ended on a question; shown in place of the general reason. */
  question?: string | null
  stuckReason: string | null
  startedAt: number
  finishedAt: number | null
  isCollapsed: boolean
  /** True once Claude laid out a real plan (plan_steps, TodoWrite or TaskCreate). */
  hasPlan: boolean
  /** The turn that started this job; a late job name for another job is ignored. */
  jobId: string
  /** When the real plan arrived; the time-left estimate counts from here. */
  planAt: number | null
  /** How many steps the first plan had, to say when the plan grew. */
  plannedCount: number
  /** Subagents and background tasks this job started. */
  helpers: GlanceHelper[]
  /** Tokens of requests outside any step, such as Claude's final answer: counted in the job's total only. */
  extraTokens: number
  /** Of those, the tokens read from the prompt cache. */
  extraCachedTokens: number
  /** How a stopped job was stopped: Esc, or the Pause button. */
  stopKind: 'esc' | 'pause' | null
  /** What Claude is doing right now, in plain words ("Reading files"), and how many times in a row. */
  activity: {
    label: string
    count: number
    /** Claude's own one-line description of the call, when it gave one. */
    detail: string | null
    /** What the call works on, for the Plan in Details: the command, a file's name or a site. */
    target: string | null
  } | null
  /** Approve the plan first: `waiting` until the person presses Start; `approved` for the rest of the job. */
  approval: 'none' | 'waiting' | 'approved'
  /** The session's spend in US dollars when the job started; null where the host keeps no ledger. */
  costAtStart: number | null
  /** How long one unit of step size took in this project's earlier finished jobs, in ms; null until History knows. */
  paceMs: number | null
}

/** One plan window and how much of it is used. */
export type GlanceLimit = {
  /** In plain words: "5-hour", "weekly", "spending". */
  label: string
  /** 0 to 100. */
  percent: number
}

/** The plan limits and chat length, shown under the checklist. */
export type GlanceUsage = {
  /** Every plan window the last response reported; empty off a subscription. */
  limits: GlanceLimit[]
  /** The fullest plan window, 0 to 100; null off a subscription. */
  limitPercent: number | null
  /** Which window that is, in plain words ("5-hour", "weekly"). */
  limitLabel: string | null
  /** When that window resets, as an ISO 8601 timestamp; null when not reported. */
  limitResetsAt: string | null
  /** How full this chat's context window is, 0 to 100. */
  contextPercent: number | null
  /** What the session has cost so far in US dollars; null where the host keeps no ledger. */
  costUsd: number | null
}

/** Another chat on this computer, as this one mentions it: its job's name, and whether it needs the person or works on. */
export type GlanceOtherChat = {
  title: string
  /** True when it waits on the person or is stuck; false while it works. */
  needsYou: boolean
}

/**
 * One chat's settings: kept under the chat's own key (`settings:<session id>`), so a change in one chat never reaches
 * another. A new chat starts from the defaults set in the config menu.
 */
export type GlanceChatSettings = {
  /** Leitstand on or off. */
  enabled: boolean
  detail: 'simple' | 'detailed' | 'minimal'
  workMode: 'auto' | 'dynamisch'
  sound: 'off' | 'chime' | 'voice'
  /** Desktop notices. */
  notice: boolean
  /** Whether the band names the other chats. */
  others: boolean
  calm: boolean
  /** The password guard. */
  guard: boolean
  /** Masking on screen. */
  mask: boolean
  /** Approve the plan first. */
  approve: boolean
  /** Finish on GitHub. */
  ship: boolean
}

/** How a job ended, as the history shows it. */
export type GlanceOutcome = 'done' | 'stopped' | 'stuck' | 'waiting' | 'background' | 'working'

/** One job in the day's history: kept in the store for 30 days, on this computer only. */
export type GlanceHistoryEntry = {
  jobId: string
  /** The folder the session ran in. */
  project: string
  startedAt: number
  finishedAt: number | null
  title: string
  outcome: GlanceOutcome
  stepsDone: number
  stepsTotal: number
  newTokens: number
  cachedTokens: number
  /** Names of the steps it finished, for the team report. */
  doneSteps: string[]
  /** What each finished step got done, in the order of `doneSteps`; '' where Claude gave no summary. */
  doneNotes?: string[]
  /** Names of the steps still open. */
  openSteps: string[]
  /** Files the job created, and files it changed that were there before, as paths within the project. */
  filesAdded?: string[]
  filesChanged?: string[]
  /** A quick answer with no plan: listed in the panel, left out of the team report. */
  isQuickAnswer: boolean
  /** What the job cost in US dollars; absent where the host keeps no ledger. */
  costUsd?: number | null
  /** Size units of the steps it checked off (S 1, M 2, L 3), and the time they took in ms: the project's pace. */
  doneUnits?: number
  doneMs?: number
}

/** What the history pane shows: one day of one project. */
export type GlanceHistoryView = {
  /** YYYY-MM-DD, local time. */
  day: string
  project: string
  entries: GlanceHistoryEntry[]
  /** Days with saved history, newest first, for the day picker. */
  days: string[]
  /** True while the plain-English team report shows in place of the list. */
  isReportShown: boolean
  /** The team report for the day or the 7 days up to it, or `mine`: your own week across every project. */
  reportSpan: 'day' | 'week' | 'mine'
  /** This project's entries for the 7 days up to `day`, for the weekly report. */
  weekEntries: GlanceHistoryEntry[]
  /** Every project's entries for the 7 days up to `day`, for your own weekly summary. */
  myWeekEntries: GlanceHistoryEntry[]
}

// Selbstkritik und Regeln, bis 2026-10-26 der Mod Reflect.

/** Wohin eine Regel geht: globale CLAUDE.md, die des Projekts, oder nur dieser Chat. */
export type ReflectZiel = 'global' | 'project' | 'chat'

/**
 * Eine Regel, die die Pruefung gefunden hat (aus reflect-mod uebernommen):
 * der Text, der vorgeschlagene Ort und was daraus wurde.
 */
export type ReflectFund = {
  id: string
  /** Die Regel, eine Zeile im Imperativ, auf Deutsch. */
  rule: string
  /** Der Ort, den das Modell vorschlaegt; "merke:" schlaegt global vor. */
  scope: 'global' | 'project'
  /** Das Projekt (Sitzungswurzel), in dem sie gesagt wurde. */
  project: string
  /** Wie oft sie gesagt wurde (Wiederholungen zaehlen auf derselben Zeile). */
  count: number
  firstAt: number
  lastAt: number
  /** pending wartet; saved steht in einer CLAUDE.md; skipped verworfen; chat gilt nur in einem Chat. */
  status: 'pending' | 'saved' | 'skipped' | 'chat'
  confidence: number
}

/** Eine in dieser Sitzung in eine CLAUDE.md gespeicherte Regel, mit ihrem Geltungsbereich. */
export type ReflectGespeichert = { rule: string; scope: 'global' | 'project'; project: string }

/** Eine Selbstkritik: wann, wozu, wie weit, und ihr Text. */
export type ReflectReflexion = {
  id: string
  at: number
  /** Was die Person als Schwerpunkt mitgab; leer ohne. */
  schwerpunkt: string
  /** befehl: /reflect; auto: nach einer Runde mit Dateiaenderungen. */
  anlass: 'befehl' | 'auto'
  status: 'laeuft' | 'fertig' | 'fehlgeschlagen'
  /** Die Antwort des Modells (Markdown), sobald fertig. */
  text: string
  /** Warum sie fehlschlug. */
  hinweis?: string
}

/** Die Einstellungen eines Chats; ein Chat ohne eigene Werte nimmt den Standard aus dem Menue. */
export type ReflectEinstellungen = { pruefung: boolean; selbstkritikAuto: boolean }

// Autopilot, bis 2026-10-26 ein eigener Mod. Ein Lauf heißt hier weiter Schicht, wie zur Zeit der Nachtschicht.

/** Wie es um die Schicht steht. */
export type AutopilotPhase =
    /** Claude arbeitet, die Schicht schiebt nach jeder Runde ohne Abschluss an. */
    | 'laeuft'
    /**
     * Claude hat gemeldet, dass alles erledigt ist, was ohne die Person geht. Nur noch
     * in Schichten aus Versionen vor 0.6.0: Seitdem beendet die Marke die Schicht.
     */
    | 'fertig'
    /** Die Schicht schiebt nicht mehr an: Leerlauf, Fehler oder Ablehnung. */
    | 'angehalten'

/** Eine laufende Schicht. */
export type AutopilotSchicht = {
    /** Wann sie begann, in Millisekunden seit der Epoche. */
    seit: number
    phase: AutopilotPhase
    /** Warum sie fertig ist oder angehalten hat; null, solange sie laeuft. */
    grund: string | null
    /** Wie oft sie Claude insgesamt angeschoben hat. */
    geschoben: number
    /**
     * Angeschobene Runden seit der letzten Nachricht der Person; bei maxRunden endet
     * die Schicht. Fehlt bei Schichten, die eine Version vor 0.5.0 begann: dann 0.
     */
    runden?: number
    /**
     * Ob die laufende oder naechste Runde von der Schicht angeschoben wurde. Steht im
     * Zustand, nicht im Modul, damit ein Neuladen die Leerlauf-Bremse nicht aushebelt.
     */
    angeschoben?: boolean
    /** Angeschobene Runden in Folge ohne Werkzeugaufruf; bei 2 haelt die Schicht an. */
    leerlauf?: number
    /** Die Rueckfragen, die Claude stellen wollte und selbst entscheiden musste. */
    fragen: string[]
}

/** Was von einer beendeten Schicht bleibt, bis man es wegklickt. */
export type AutopilotBericht = {
    /** Wie lange sie lief, in Minuten. */
    minuten: number
    geschoben: number
    fragen: string[]
    /** Warum sie endete. */
    grund: string
}

// Dateien, bis 2026-10-26 der Mod Filetree.

export type FiletreeNode = {
  id: string
  parent: string
  name: string
  kind: 'dir' | 'file' | 'link'
  hidden: boolean
  mtime: number
  size: number
  loaded: boolean
}

export type FiletreeBranch = {
  head: string
  upstream: string
  ahead: number
  behind: number
}

export type FiletreeActivity = {
  id: number
  kind: string
  label: string
  state: 'running' | 'done' | 'failed'
  detail: string
  at: number
  tone: string
  nerd: string
  plain: string
}

export type FiletreeTree = {
  root: string
  nodes: FiletreeNode[]
  expanded: string[]
  cursor: string
  selected: string
  query: string
  showHidden: boolean
  showSize: boolean
  dirSizes: Record<string, number>
  git: Record<string, string>
  diff: Record<string, [number, number]>
  ignored: string[]
  untrackedDirs: string[]
  top: string
  prefix: string
  branch: FiletreeBranch | null
  counts: Record<string, [number, number, number]>
  flash: string[]
  flashDim: string[]
  flashOn: boolean
  flashTones: Record<string, string>
  scroll: number | null
  preview: string
  previewTop: number
}

export type FiletreeTheme = {
  fg: string
  accent: string
  muted: string
  urgent: string
  selection: string
  bg: string
}

declare module 'claude-code' {
  interface PluginState {
    'leitstand': {
      glanceEnabled: boolean
      /** `simple`: steps, progress and time. `detailed`: also time, tokens, cache and plan usage. */
      detailLevel: 'simple' | 'detailed' | 'minimal'
      checklist: GlanceChecklist | null
      tick: number
      usage: GlanceUsage
      historyView: GlanceHistoryView | null
      /** The Fresh chat button: `working` while the handoff note is written. */
      handoffState: 'idle' | 'working'
      /** The main chat is being compacted: Start and Continue wait until it is through. */
      isCompacting: boolean
      /** The plan Start was pressed for while its message is on its way, as the band names it; null otherwise. */
      startingPlan: string | null
      /** The button that waits for a second press to confirm, if any. */
      armedButton: 'handoff' | 'ship' | 'vault' | null
      /** Alerts: `chime` plays a short sound when Claude needs you, gets stuck or finishes a long job; `voice` also says it. */
      soundMode: 'off' | 'chime' | 'voice'
      /** Desktop notices: the computer's own notification when Claude needs you, gets stuck or finishes a long job. */
      isNoticing: boolean
      /** The welcome card in view, 0 to 2; null once it is done or skipped. */
      tourStep: number | null
      /** After a tidy-up with a checkpoint, until the next message: the band offers Where we left off. */
      isRecapShown: boolean
      /** Calm mode: nothing moves, and statuses read in bold. */
      isCalm: boolean
      /**
       * Password guard: a message typed at the computer that looks like it holds a password or key is held back for two
       * minutes, until Trotzdem senden or sent again; from elsewhere it goes on without it, a helper's report as it is.
       */
      isGuarded: boolean
      /**
       * A message the password guard holds back: when it was held, in ms since the epoch, and what it seems to hold
       * (`ein Passwort`, ...); null when none waits. Never the text, which stays in the module's memory alone.
       */
      heldSecret: { at: number; kinds: string[] } | null
      /** Masking: passwords, keys and personal details read as dots on screen, in messages, command and tool output. */
      masksPrivate: boolean
      /** Approve the plan first: Claude lays out its plan and waits for Start or a change. */
      approvePlan: boolean
      /** Arbeitsweise: `auto` Claude entscheidet selbst ueber Helfer; `dynamisch` Claude leitet, Arbeiter in sechs Stufen setzen um. */
      workMode: 'auto' | 'dynamisch'
      /** Finish on GitHub: a finished job offers Ship it, which commits, opens a pull request and merges once the person approves. */
      shipsOnGithub: boolean
      /** Whether this session's folder pushes to GitHub; Ship it shows only then. */
      hasGithub: boolean
      /** How full the chat gets, in percent, before the band offers to tidy it up; 0 never offers. */
      /** When the last checkpoint was saved before tidying up; null when none was. */
      checkpointAt: number | null
      /** The other chats that need the person or are at work, read every little while from what each one saves. */
      otherChats: GlanceOtherChat[]
      /** Whether the band names the other chats at all: off before sharing the screen, say. */
      showsOthers: boolean
      /**
       * Remote Control per source: `app` is the desktop app's own switch (ccd_session_mgmt), `command` is
       * /remote-control; `on` while connected (or connecting), `off` when not, `missing` when the session lacks it.
       */
      remoteControl: { app: 'on' | 'off' | 'missing'; command: 'on' | 'off' | 'missing' }
      /** Whether Kurzantworten (the Kurzfassen skill, i-have-adhd as fallback) is on, until "Kurzfassen aus" or "normal antworten" (the old "stop adhd mode" and "normal mode" still count). */
      adhdMode: boolean
      /**
       * When the Autopilot button was last pressed to end a running Autopilot, in ms since the epoch; null until then.
       * Autopilot reads it as a round ends and ends a run that began before it, instead of pushing on.
       */
      autopilotStop: number | null
      /**
       * Whether the person's latest request said "ultracode": helpers started until their next request get
       * `ultracode` and show Ultracode for their effort.
       */
      ultracodeTurn: boolean
      /** Selbstkritik und Regeln: wartende Regeln dieses Projekts und globale, sortiert, wie das Band sie zeigt. */
      regelnWartend: ReflectFund[]
      /** In dieser Sitzung in CLAUDE.md gespeicherte Regeln: der Systemprompt trägt sie, bis CLAUDE.md neu gelesen wird. */
      regelnGespeichert: ReflectGespeichert[]
      /** Die IDs in der Reihenfolge, die /regeln zuletzt nummeriert hat. */
      regelnNummern: string[]
      /** Die letzten fünf Selbstkritiken, die neueste zuletzt. */
      selbstkritikReflexionen: ReflectReflexion[]
      /** Welche Selbstkritik das Fenster zeigt; null: die neueste. */
      selbstkritikAngezeigt: string | null
      /** Dateien: der Baum, wie das Fenster ihn zeigt. */
      dateienBaum: FiletreeTree
      /** Dateien: die Farben des Fensters. */
      dateienTheme: FiletreeTheme
      /** Dateien: was Claude zuletzt gelesen, geschrieben oder committet hat. */
      dateienAktivitaet: FiletreeActivity[]
      /** Autopilot: die laufende Schicht, oder null. */
      autopilotSchicht: AutopilotSchicht | null
      /** Autopilot: der Bericht der letzten Schicht, oder null. */
      autopilotBericht: AutopilotBericht | null
      /** Autopilot: ob die Liste der selbst entschiedenen Fragen aufgeklappt ist. */
      autopilotZeigeFragen: boolean
      /**
       * This chat's own settings: the chat they belong to, whether they move to the next chat id (after /clear), and
       * the values the person changed in it; anything left out follows the defaults from the config menu.
       */
      ownSettings: { sid: string | null; carry: boolean; values: Partial<GlanceChatSettings> }
    }
  }
}
