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

/**
 * Hoehe des eigenen Teils im Band ueber dem Eingabefeld, je Flaeche: dieselbe Form wie
 * `BandHoehe` in hooks/band.ts. Terminal ganze Zeilen, Desktop Zeilen zu 20 px mit Bruchteilen.
 * `voll` ist der Block, wie er gerade steht, `klein` nur Trennlinie und Kopfzeile; 0 und 0, wenn
 * nichts steht. Ist sie aufgeklappt, ist `klein` gleich `voll`.
 */
export type BandHoehe = { v: number; voll: number; klein: number }

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
            /**
             * Ob die Person die Zusammenfassung in dieser Runde aufgeklappt hat (Chevron oder
             * /zusammenfassung:aufklappen). Dann bleibt sie offen, auch wenn im Band wenig Platz ist;
             * die naechste Runde klappt wieder zu.
             */
            istOffen: boolean
            /** Ob die Zusammenfassung aus ist (das Replay bleibt). */
            isAus: boolean
            /** Der zuletzt gezeigte Hinweis, damit derselbe nicht zweimal kommt. */
            letzter: string | null
            /** Die Hoehe des eigenen Teils im Band, je Flaeche (`id` = `e.surface`); andere Mods planen damit ihren Platz. */
            bandHoehe: StateFamily<BandHoehe>
        }
        // Die Hoehen der anderen Mods im Band, nur gelesen (hooks/band.ts). Ihr Vertrag liegt bei ihnen.
        leitstand: {
            bandHoehe: StateFamily<BandHoehe>
        }
        statistik: {
            bandHoehe: StateFamily<BandHoehe>
        }
        'naechste-schritte': {
            bandHoehe: StateFamily<BandHoehe>
        }
        modellwahl: {
            bandHoehe: StateFamily<BandHoehe>
        }
    }
}
