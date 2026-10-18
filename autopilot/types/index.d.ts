/**
 * Was der Autopilot zwischen zwei Zeichnungen behaelt.
 *
 * Alles in `$.state`, also je Sitzung und ueber ein Neuladen des Moduls
 * hinweg. Eine neue Sitzung beginnt ohne Schicht: der Autopilot gilt nie
 * aus Versehen weiter.
 *
 * Ein Lauf heisst hier weiter Schicht, wie zu der Zeit, als der Mod
 * Nachtschicht hiess: Der Leitstand liest `schicht`, `bericht` und
 * `zeigeFragen` unter diesen Namen.
 *
 * Umgekehrt liest der Autopilot `leitstand.autopilotStop`: wann die Person
 * den Autopilot-Knopf im Leitstand gedrueckt hat, um die laufende Schicht zu
 * beenden.
 */

/** Wie es um die Schicht steht. */
export type Phase =
    /** Claude arbeitet, die Schicht schiebt nach jeder Runde ohne Abschluss an. */
    | 'laeuft'
    /** Claude hat gemeldet, dass alles erledigt ist, was ohne die Person geht. */
    | 'fertig'
    /** Die Schicht schiebt nicht mehr an: Leerlauf, Fehler oder Ablehnung. */
    | 'angehalten'

/** Eine laufende Schicht. */
export type Schicht = {
    /** Wann sie begann, in Millisekunden seit der Epoche. */
    seit: number
    phase: Phase
    /** Warum sie fertig ist oder angehalten hat; null, solange sie laeuft. */
    grund: string | null
    /** Wie oft sie Claude insgesamt angeschoben hat. */
    geschoben: number
    /**
     * Angeschobene Runden seit der letzten Nachricht der Person; bei maxRunden endet
     * die Schicht. Fehlt bei Schichten, die eine Version vor 0.5.0 begann: dann 0.
     */
    runden?: number
    /**
     * Ob die laufende oder naechste Runde von der Schicht angeschoben wurde. Steht im
     * Zustand, nicht im Modul, damit ein Neuladen die Leerlauf-Bremse nicht aushebelt.
     */
    angeschoben?: boolean
    /** Angeschobene Runden in Folge ohne Werkzeugaufruf; bei 2 haelt die Schicht an. */
    leerlauf?: number
    /** Die Rueckfragen, die Claude stellen wollte und selbst entscheiden musste. */
    fragen: string[]
}

/** Was von einer beendeten Schicht bleibt, bis man es wegklickt. */
export type Bericht = {
    /** Wie lange sie lief, in Minuten. */
    minuten: number
    geschoben: number
    fragen: string[]
    /** Warum sie endete. */
    grund: string
}

declare module 'claude-code' {
    interface PluginState {
        autopilot: {
            /** Die laufende Schicht, oder null. */
            schicht: Schicht | null
            /** Der Bericht der letzten Schicht, oder null. */
            bericht: Bericht | null
            /** Ob die Liste der selbst entschiedenen Fragen aufgeklappt ist. */
            zeigeFragen: boolean
        }
    }
}
