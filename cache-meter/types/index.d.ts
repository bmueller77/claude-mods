export type Reading = {
  /** Zeitpunkt der letzten Anfrage des Hauptstrangs, ms ($.clock.now()) */
  at: number
  /** Cache-Lebensdauer in ms (1 h im Abo, 5 min bei API-Key) */
  ttlMs: number
  /** Anteil der Eingabe, der aus dem Cache kam, 0..100; null ohne Messung */
  hit: number | null
}

export type Context = { tokens: number; window: number; percent: number }

declare module 'claude-code' {
  interface PluginState {
    'cache-meter': {
      reading: Reading | null
      context: Context | null
      now: number
      isHidden: boolean
      isCompacting: boolean
    }
  }
}
