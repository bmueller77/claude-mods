/**
 * Was die Zusammenfassung zwischen zwei Zeichnungen behaelt.
 *
 * Alles in `$.state`, also je Sitzung und ueber ein Neuladen des Moduls hinweg.
 * Ob die Zusammenfassung aus ist, liegt zusaetzlich in `$.store`, damit es den
 * Sitzungswechsel ueberlebt.
 */

/** Eine Zeile eines Diffs: hinzu, weg, unveraendert oder eine Auslassung. */
export type DiffZeile = { op: '+' | '-' | ' ' | '~'; t: string }

/** Eine Dateiaenderung der letzten Runde, ein Schritt im Replay. */
export type Schritt = {
    werkzeug: 'Edit' | 'Write' | 'MultiEdit'
    /** Der Pfad, relativ zum Arbeitsordner, wenn er darin liegt. */
    datei: string
    diff: DiffZeile[]
    /** "neue Datei", "ueberschrieben", "alle ersetzt", "Teil 2 von 3" oder leer. */
    notiz: string
}

/** Die Zusammenfassung einer Runde. */
export type Bericht = {
    /** Die Runde, zu der sie gehoert; eine neue Runde raeumt sie weg. */
    turnId: string
    /** Ob das Modell noch schreibt. */
    schreibt: boolean
    /** Was die Runde getan hat, eine Zeile; null, wenn nichts kam. */
    getan: string | null
    /** Was man leicht uebersieht, eine Zeile; null, wenn nichts auffiel. */
    beachte: string | null
    /** Die laengere Erklaerung zu `beachte`, sobald aufgeklappt. */
    erklaerung: string | null
    /** Ob die Erklaerung gerade geholt wird. */
    holtErklaerung: boolean
}

declare module 'claude-code' {
    interface PluginState {
        zusammenfassung: {
            /** Die Zusammenfassung der letzten Runde, oder null. */
            bericht: Bericht | null
            /** Die Dateiaenderungen der letzten Runde, die das Replay zeigt. */
            schritte: Schritt[]
            /** Die Dateiaenderungen der laufenden Runde; zum Ende werden sie `schritte`. */
            laufend: Schritt[]
            /** Der Schritt, den das Replay gerade zeigt. */
            index: number
            /** Ob die Zusammenfassung aufgeklappt ist. */
            istOffen: boolean
            /** Ob die Zusammenfassung aus ist (das Replay bleibt). */
            isAus: boolean
            /** Der zuletzt gezeigte Hinweis, damit derselbe nicht zweimal kommt. */
            letzter: string | null
        }
    }
}
