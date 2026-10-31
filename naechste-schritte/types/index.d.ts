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

/**
 * Was ein Mod unter `bandHoehe` je Flaeche veroeffentlicht, wortgleich mit `BandHoehe` in hooks/band.ts:
 * Zeilen seines Teils im Band, Terminal ganze Zeilen, Desktop Zeilen zu 20 px mit Bruchteilen.
 * Naechste-Schritte: `voll` mehrzeilig, `klein` einzeilig, je mit Trennstrich; 0 und 0, wenn nichts steht.
 */
export type BandHoehe = { v: number; voll: number; klein: number }

declare module 'claude-code' {
    interface PluginState {
        'naechste-schritte': {
            /** Die Vorschlaege, solange sie gelten; null, sobald etwas abgeschickt wurde oder eine Runde laeuft. */
            vorschlaege: Vorschlaege | null
            /** Die Hoehe des eigenen Blocks im Band, je Flaeche (`id` = `e.surface`); andere Mods planen damit ihren Platz. */
            bandHoehe: StateFamily<BandHoehe>
        }
        // Fremde Hoehen, nur gelesen (keine dependencies): jeder Mod veroeffentlicht seine unter bandHoehe.
        leitstand: { bandHoehe: StateFamily<BandHoehe> }
        statistik: { bandHoehe: StateFamily<BandHoehe> }
        zusammenfassung: { bandHoehe: StateFamily<BandHoehe> }
        modellwahl: { bandHoehe: StateFamily<BandHoehe> }
    }
}
