/**
 * Was die Modellwahl in `$.store` ablegt, und ihr Zustand in `$.state`.
 *
 * Die Wahl liegt je Sitzungs-ID, damit ein fortgesetzter Chat sie behaelt; die
 * Kalibrierung gilt fuer alle Chats. Der offene Vorschlag liegt in `$.state`,
 * damit das Band neu zeichnet, sobald er sich aendert.
 */

/** Die Modelle, zwischen denen gewaehlt wird, vom guenstigsten an. */
export type Modell = 'haiku' | 'sonnet' | 'opus' | 'fable'

/** Die Stufen des Aufwands, wie die Engine sie schreibt. */
export type Aufwand = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Was die Einschaetzung liefert: Modell, Aufwand und ein kurzer Grund. */
export type Einschaetzung = {
    modell: Modell
    aufwand: Aufwand
    /** Deutsch, hoechstens sechs Woerter; leer, wenn keiner kam. */
    grund: string
}

/** Unter `wahl:<Sitzungs-ID>`: die Wahl eines Chats. */
export type Wahl = Einschaetzung & {
    /** Wann gewaehlt wurde, in Millisekunden wie `$.clock.now()`. */
    at: number
    /** True, sobald die Person Modell oder Aufwand selbst umgestellt hat: dann stellt der Mod nichts mehr um. */
    zurueckgezogen: boolean
}

/** Ein Vorschlag, der noch wartet: am Rechner gilt er nach 15 s von selbst, vom Handy erst auf ja. */
export type Vorschlag = {
    wahl: Einschaetzung
    /** Wann vorgeschlagen wurde; zugleich die Kennung des Vorschlags. */
    at: number
    /** Wann er von selbst gilt; null, wenn er auf ja wartet (vom Handy). */
    bis: number | null
}

/**
 * Hoehe der eigenen Zeile im Band ueber dem Eingabefeld, je Flaeche: dieselbe Form wie `BandHoehe`
 * in hooks/band.ts. 1 mit wartendem Vorschlag, sonst 0; `klein` ist gleich `voll`.
 */
export type BandHoehe = { v: number; voll: number; klein: number }

declare module 'claude-code' {
    interface PluginState {
        modellwahl: {
            /** Der offene Vorschlag; null, wenn keiner wartet. Nach einem Neuladen gilt er als verworfen. */
            vorschlag: Vorschlag | null
            /** Zaehlt jede Sekunde hoch, solange ein Vorschlag laeuft, damit der Countdown weiterlaeuft. */
            takt: number
            /** Die Hoehe der eigenen Zeile im Band, je Flaeche (`id` = `e.surface`); andere Mods planen damit ihren Platz. */
            bandHoehe: StateFamily<BandHoehe>
        }
    }
}

/** Unter `auto:<Sitzungs-ID>`: die automatische Wahl, fuer diesen Chat an- oder abgeschaltet. */
export type AutoSchalter = {
    at: number
    isOn: boolean
}

/**
 * Unter `kalibrierung`: wie viel Prozent des 5-Stunden-Limits ein Token kostet.
 *
 * Gezaehlt in Opus-Eingabe-Tokens: was eine Runde kostet, in Dollar zum
 * Listenpreis, geteilt durch den Preis eines Opus-Eingabe-Tokens.
 */
export type Kalibrierung = {
    /** Gleitender Mittelwert: Prozent des Limits je Opus-Eingabe-Token; null ohne Messung. */
    quote: number | null
    /** Wie viele Messungen eingeflossen sind. */
    proben: number
    /** Der Stand des Limits bei der letzten Messung, in Prozent; null vor der ersten. */
    basisProzent: number | null
    /** Wann das Fenster dieser Messung zurueckgesetzt wird (ISO); ein anderer Wert heisst neues Fenster. */
    basisReset: string | null
    /** Opus-Eingabe-Tokens seit der letzten Messung. */
    summe: number
    /** Wann zuletzt gemessen wurde. */
    at: number
}
