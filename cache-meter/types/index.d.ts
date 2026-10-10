export type Reading = {
  /** Zeitpunkt der letzten Antwort des Hauptstrangs, ms ($.clock.now()) */
  at: number
  /** Anteil der Input-Tokens aus dem Cache, 0..100; null ohne Input */
  hit: number | null
}

export type Context = {
  /** Kontextfüllung in Prozent des Fensters */
  percent: number
  /** Auto-Compact-Schwelle in Prozent des Fensters (83, wenn nicht lesbar) */
  threshold: number
}

declare module 'claude-code' {
  interface PluginState {
    'cache-meter': {
      reading: Reading | null
      ttlMs: number
      context: Context | null
      now: number
      isCollapsed: boolean
    }
  }
}
