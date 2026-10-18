/**
 * Was das Prompt-Upgrade zwischen zwei Zeichnungen behaelt.
 *
 * Alles in `$.state`, also je Sitzung und ueber ein Neuladen des Moduls hinweg.
 * Der Verlauf der letzten 20 Upgrades und die Automatik je Chat liegen
 * zusaetzlich in `$.store`, damit sie den Sitzungswechsel ueberleben.
 */

/**
 * Wo das Fenster steht. `eingabe`: /better ohne Text, ein Feld zum Eintippen.
 * `lesen` und `umschreiben`: das Modell arbeitet. `fragen`: die Rueckfragen.
 * `pruefen`: Original und Upgrade nebeneinander. `fehler`: ein Modellaufruf
 * ist schiefgegangen, der Prompt ist sicher.
 */
export type PromptUpgradeSchritt = 'eingabe' | 'lesen' | 'fragen' | 'umschreiben' | 'pruefen' | 'fehler'

/** Eine Rueckfrage mit zwei bis vier kurzen Antworten. */
export type PromptUpgradeFrage = { frage: string; optionen: string[] }

/** Was zu einer Frage gesagt wurde: eine der Antworten, eigener Text, oder uebersprungen. */
export type PromptUpgradeAntwort = { art: 'wahl'; text: string } | { art: 'anders'; text: string } | { art: 'uebersprungen' }

/** Welcher Modellaufruf scheiterte und warum, in einem Satz. */
export type PromptUpgradeFehler = { phase: 'lesen' | 'umschreiben'; grund: string }

/** Ein Durchlauf vom groben Prompt bis zum Ausfuehren. */
export type PromptUpgradeAblauf = {
    /** Kennung des Durchlaufs; ein neuer Durchlauf verwirft alte Antworten des Modells. */
    id: string
    schritt: PromptUpgradeSchritt
    /** Der Prompt, wie er getippt wurde. */
    original: string
    fragen: PromptUpgradeFrage[]
    /** Je Frage die Antwort, null solange offen. */
    antworten: (PromptUpgradeAntwort | null)[]
    /** Ob das Modell keine Frage fuer noetig hielt. */
    keineFragen: boolean
    /** Die Frage, deren Feld fuer eine eigene Antwort offen ist. */
    andersOffen: number | null
    /** Das Upgrade, wie das Modell es schrieb. */
    upgrade: string
    /** Was das Modell ergaenzt hat, kurze Punkte. */
    ergaenzt: string[]
    /** Ob das Feld zum Bearbeiten offen ist. */
    bearbeiten: boolean
    /** Der Text, der beim Ausfuehren gesendet wird: das Upgrade oder seine bearbeitete Fassung. */
    entwurf: string
    /** Wie das letzte Kopieren ausging. */
    kopiert: 'ok' | 'fehler' | null
    fehler: PromptUpgradeFehler | null
    /** Kennung des Modellaufrufs, der gerade laeuft; null, wenn keiner laeuft. */
    lauf: string | null
    /** Kennung der Modul-Umgebung, die den Aufruf gestartet hat; nach einem Neuladen ist sie eine andere. */
    umgebung: string
    /** Ob die Pruefung aus dem Verlauf wieder geoeffnet wurde. */
    ausVerlauf: boolean
}

/** Ein Upgrade im Verlauf. */
export type PromptUpgradeEintrag = { at: number; original: string; upgrade: string; ergaenzt: string[] }

declare module 'claude-code' {
    interface PluginState {
        'prompt-upgrade': {
            /** Der laufende Durchlauf, oder null. */
            ablauf: PromptUpgradeAblauf | null
            /** Die letzten 20 Upgrades, neueste zuerst; Abbild des Speichers. */
            verlauf: PromptUpgradeEintrag[]
            /** Ob das Fenster den Verlauf zeigt. */
            zeigeVerlauf: boolean
        }
    }
}
