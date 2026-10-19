/**
 * Was die Modellwahl in `$.store` ablegt.
 *
 * Die Wahl liegt je Sitzungs-ID, damit ein fortgesetzter Chat sie behaelt; die
 * Kalibrierung gilt fuer alle Chats.
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
