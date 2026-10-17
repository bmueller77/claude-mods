/** Which columns the pane shows. */
export type ViewMode = 'after' | 'both' | 'before'

export type Side = 'before' | 'after'

/** How the German translation of the shown chunks is coming along. */
export type TranslationProgress = {
  /** Chunks sent to the model and not back yet. */
  open: number
  /** Goes up with every chunk that comes back, so the pane draws it. */
  version: number
  /** Chunks the model gave nothing for since the translation was last turned on. */
  failed: number
}

/** One piece of a message, at most CHUNK_CHARS long, cut at a paragraph break where possible. */
export type Chunk = {
  /** Index of the message in its side's transcript. */
  m: number
  role: 'user' | 'assistant'
  /** This chunk's position within the message, and how many the message has. */
  i: number
  n: number
  text: string
}

export type ModelUsageSummary = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

/** What the index keeps for each compaction; the chunks themselves live in files beside it. */
export type CompactMeta = {
  id: string
  at: number
  durationMs: number
  trigger: 'manual' | 'auto' | 'plugin'
  /** Absent for the main conversation. */
  agentId?: string
  agentLabel?: string
  instructions?: string
  tokensBefore?: number
  tokensAfter?: number
  usage?: ModelUsageSummary
  messages: Record<Side, number>
  chunks: Record<Side, number>
}

declare module 'claude-code' {
  interface PluginState {
    'visible-compact': {
      index: CompactMeta[]
      /** The compaction shown; null follows the newest. */
      selected: string | null
      view: ViewMode
      pages: Record<Side, number>
      /** Whether English chunks are shown in German. */
      translate: boolean
      translation: TranslationProgress
    }
  }
}
