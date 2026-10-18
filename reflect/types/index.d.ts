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

declare module 'claude-code' {
  interface PluginState {
    reflect: {
      /** Wartende Regeln dieses Projekts und globale, sortiert, wie das Band sie zeigt. */
      wartend: ReflectFund[]
      /** In dieser Sitzung in CLAUDE.md gespeicherte Regeln: der Systemprompt traegt sie, bis CLAUDE.md neu gelesen wird. */
      gespeichert: ReflectGespeichert[]
      /** Die letzten fuenf Reflexionen, die neueste zuletzt. */
      reflexionen: ReflectReflexion[]
      /** Welche Reflexion das Fenster zeigt; null: die neueste. */
      angezeigt: string | null
      /** Die IDs in der Reihenfolge, die /reflect regeln zuletzt nummeriert hat. */
      nummern: string[]
    }
  }
}
