/**
 * Was die Statistik zwischen zwei Zeichnungen behaelt.
 *
 * Alles hier liegt in `$.state`, gehoert also der Sitzung und ueberlebt das
 * Neuladen des Moduls. Die Leiste liest nur diese Werte; gerechnet wird in den
 * Hooks.
 */

/** Die letzte Antwort: wie viel aus dem Cache kam und wie lange er haelt. */
export type CacheSample = {
    /**
     * Anteil der Eingabe-Tokens aus dem Cache, 0 bis 100.
     *
     * Null, wenn die Antwort keine Token-Zahlen trug: ein Abbruch, ein
     * API-Fehler, oder eine Runde, die gar keine Anfrage gestellt hat.
     */
    hitPercent: number | null
    /** Eingabe-Tokens der Antwort insgesamt und davon aus dem Cache gelesen. */
    inputTokens: number | null
    cacheReadTokens: number | null
    /** Laufzeit des Caches in Minuten, 5 oder 60. */
    ttlMinutes: number
    /**
     * Woher die Laufzeit kommt, von der besten Quelle zur schwaechsten:
     *
     * - "gemeldet": die Sitzung hat sie beim Modellwechsel selbst genannt.
     * - "gemessen": ein Cache-Treffer nach ueber fuenf Minuten Pause belegt sie.
     * - "konfiguriert": aus der Einstellung des Mods.
     * - "geraten": noch kein Beleg. Die Leiste haengt ein Fragezeichen an.
     */
    ttlSource: 'gemeldet' | 'gemessen' | 'konfiguriert' | 'geraten'
}

/** Der Kontext, gemessen gegen dasselbe Fenster, gegen das auch verdichtet wird. */
export type ContextSample = {
    /** Belegte Tokens. */
    tokens: number
    /** Das Fenster, gegen das gemessen wird. */
    window: number
    /** Token-Zahl, bei der automatisch verdichtet wird. */
    threshold: number
    /** Ob die Schwelle aus der Sitzung kommt oder der Rueckfall auf 83 Prozent ist. */
    isThresholdKnown: boolean
}

/** Wie es um Cache und Warmhalten steht, so wie die Leiste es braucht. */
export type Lage = {
    /** Zeitpunkt der letzten Anfrage der Hauptschleife oder eines Pings, in ms; 0 vor der ersten. */
    letzteAnfrage: number
    /** Nach einem Compact bis zur naechsten Runde: der Cache ist neu, sein Stand unbekannt. */
    istKompaktiert: boolean
    /** Bis wann warm gehalten wird, in ms; 0 heisst aus oder ohne Ende (siehe `warmImmer`). */
    warmBis: number
    /** Wann der naechste Ping faellig ist, in ms; 0, wenn keiner ansteht. */
    naechsterPing: number
    /** Warum das Warmhalten zuletzt von selbst aufgehoert hat, oder null. */
    warmGrund: string | null
    /** Ob in diesem Chat ohne Ende warm gehalten wird, bis der Chat endet. */
    warmImmer: boolean
    /** Belegter Kontext in Tokens, wie ihn ein kalter Neuschrieb bezahlen wuerde. */
    ctx: number
    /** Geschaetzte Kosten eines kalten und eines warmen Einlesens in Dollar, null ohne bekannten Preis. */
    kaltUsd: number | null
    warmUsd: number | null
}

/** Ein Nutzungsfenster des Abos: wie viel genutzt ist und wann es zurueckgesetzt wird. */
export type Fenster = {
    /** Genutzt, 0 bis 100. */
    prozent: number
    /** Zeitpunkt der Ruecksetzung in ms, oder null, wenn er nicht bekannt ist. */
    bis: number | null
}

/** Die Nutzungslimits fuer die zweite Zeile. */
export type Nutzung = {
    /** Sitzungslimit, das Fenster ueber fuenf Stunden. */
    sl: Fenster | null
    /** Woechentliches Limit ueber alle Modelle. */
    wl: Fenster | null
    /** Das eigene Wochenfenster fuer Fable; nur gelesen, solange Fable laeuft. */
    fl: Fenster | null
    /** Ob gerade Fable laeuft: nur dann steht FL in der Zeile. */
    istFable: boolean
}

/** Eine Kategorie des Kontextfensters, wie /context sie fuehrt. */
export type KontextScheibe = {
    /** Deutscher Name, sonst der der Engine. */
    name: string
    tokens: number
    /** Farbe im Balken und in der Legende. */
    farbe: string
    /** Belegt, frei oder der Puffer vor dem automatischen Compact. */
    art: 'belegt' | 'frei' | 'puffer'
    /** Die Nachrichten, die mit jeder Runde wachsen, in der Akzentfarbe. */
    istNachrichten: boolean
}

/** Das Kontextfenster im Detail, fuer das Fenster an der Seite. */
export type KontextDetails = {
    scheiben: KontextScheibe[]
    /** Belegte Tokens. */
    belegt: number
    /** Das Fenster, gegen das gemessen wird. */
    fenster: number
    /** Wo automatisch verdichtet wird, wenn das an ist. */
    compactBei?: number
}

/** Die Laenge des ganzen Chats seit Beginn, nach jeder Runde neu gezaehlt. */
export type Chatlaenge = {
    /** Nachrichten der Person und von Claude mit eigenem Text; reine Werkzeug-Ergebnisse zaehlen nicht. */
    nachrichten: number
    /** Geschaetzt aus allem Text des Chats: Text, Werkzeug-Eingaben und -Ergebnisse, Zeichen durch vier. */
    tokens: number
    /** Ob der Verlauf die Grenze von 4096 Eintraegen erreicht hat; dann sind es mindestens so viele. */
    istGekappt: boolean
}

declare module 'claude-code' {
    interface PluginState {
        statistik: {
            cache: CacheSample | null
            context: ContextSample | null
            lage: Lage
            nutzung: Nutzung
            /** Das Kontextfenster je Kategorie, nach jeder Runde neu. */
            details: KontextDetails | null
            /** Ob das Fenster mit den Kontext-Details offen ist. */
            zeigeDetails: boolean
            /** Zaehlt jede Minute hoch, damit die Tortenuhr weiterlaeuft. */
            tick: number
            /** Welcher Knopf /compact eingereiht hat, das noch wartet: Dreieck oder Schwamm; null, wenn nichts wartet. */
            eingereiht: 'compact' | 'wischen' | null
            /** Die Chatlaenge, nach jeder Runde, jedem Compact und beim Sitzungsstart neu; null, wenn der Verlauf nicht lesbar war. */
            chatlaenge: Chatlaenge | null
        }
    }
}
