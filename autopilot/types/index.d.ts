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
 */

/** Wie es um die Schicht steht. */
export type Phase =
    /** Claude arbeitet, die Schicht schiebt nach jeder Runde ohne Abschluss an. */
    | 'laeuft'
    /** Claude hat gemeldet, dass alles erledigt ist, was ohne die Person geht. */
    | 'fertig'
    /** Die Schicht schiebt nicht mehr an: Limit, Leerlauf, Fehler oder Ablehnung. */
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
