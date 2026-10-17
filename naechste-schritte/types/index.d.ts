/**
 * Was Naechste-Schritte zwischen zwei Zeichnungen behaelt.
 *
 * In `$.state`, also je Sitzung und ueber ein Neuladen des Moduls hinweg.
 */

/** Die Vorschlaege nach einer Antwort. */
export type Vorschlaege = {
    /** Die Runde, nach der sie entstanden sind. */
    turnId: string
    /** Zwei oder drei Eingaben, je ein ganzer Satz, nie abgeschnitten. */
    eintraege: string[]
}

declare module 'claude-code' {
    interface PluginState {
        'naechste-schritte': {
            /** Die Vorschlaege, solange sie gelten; null, sobald etwas abgeschickt wurde oder eine Runde laeuft. */
            vorschlaege: Vorschlaege | null
        }
    }
}
