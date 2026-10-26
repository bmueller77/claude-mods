/**
 * Die letzte Antwort eines eigenen Befehls, bis ihre Zeile session.append passiert hat: Nur sie bekommt dort
 * „(gemeldet vom Mod Leitstand)“. Ein eigenes Modul, damit die Teile des Leitstands (Selbstkritik und Regeln, Dateien,
 * Autopilot) ihre Antworten genauso melden wie der Leitstand selbst.
 */
let letzte: string | null = null

/** Merkt sich die Antwort eines eigenen Befehls; null vergisst sie. */
export const merkeAntwort = (text: string | null): void => {
  letzte = text
}

/** Die gemerkte Antwort, oder null. */
export const gemerkteAntwort = (): string | null => letzte
