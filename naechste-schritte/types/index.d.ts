/**
 * Was Naechste-Schritte zwischen zwei Zeichnungen behaelt.
 *
 * In `$.state`, also je Sitzung und ueber ein Neuladen des Moduls hinweg.
 */

/**
 * Woher ein Eintrag kommt: `angeboten` hat Claude in der Antwort ausdruecklich angeboten
 * (etwa Antworte "ja"), ein Druck schickt ihn sofort ab; `geraten` hat Haiku vorgeschlagen,
 * ein Druck holt ihn ins Eingabefeld.
 */
export type Art = 'angeboten' | 'geraten'

/** Ein Vorschlag mit seiner Art. */
export type Eintrag = {
    text: string
    art: Art
}

/** Die Vorschlaege nach einer Antwort. */
export type Vorschlaege = {
    /** Die Runde, nach der sie entstanden sind. */
    turnId: string
    /**
     * Hoechstens drei Eingaben, je ein ganzer Satz, nie abgeschnitten; die angebotenen zuerst.
     * Ein String stammt aus naechste-schritte bis 0.4.3 und gilt als geraten.
     */
    eintraege: (Eintrag | string)[]
}

declare module 'claude-code' {
    interface PluginState {
        'naechste-schritte': {
            /** Die Vorschlaege, solange sie gelten; null, sobald etwas abgeschickt wurde oder eine Runde laeuft. */
            vorschlaege: Vorschlaege | null
        }
    }
}
