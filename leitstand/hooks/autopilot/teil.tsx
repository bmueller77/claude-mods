import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, PluginOptions } from 'claude-code'

import type { AutopilotBericht, AutopilotPhase, AutopilotSchicht, GlanceChecklist } from '../../types'
import { merkeAntwort } from '../antwort'
import { befehlsHilfe, fragtNachHilfe, kurzform } from '../logic'
import { AUTOPILOT_BEFEHLE, AUTOPILOT_GRUNDBEFEHL } from './befehle'

/**
 * Autopilot, bis 2026-10-26 ein eigener Mod: Claude arbeitet ohne Rückfragen weiter, während die Person weg ist. Fragen
 * entscheidet Claude selbst, eine Runde ohne Abschluss wird angeschoben, am Ende steht eine Übergabe.
 *
 * Ein Lauf heißt hier weiter Schicht, wie zur Zeit der Nachtschicht. Alles, was bleiben muss, liegt im Zustand des
 * Leitstands (`autopilotSchicht`, `autopilotBericht`, `autopilotZeigeFragen`); der Knopf 🅰️ liest ihn dort für sein
 * Leuchten. Den Druck auf 🅰️ beantwortet der `ui.press`-Hook hier. Ein Wunsch in `autopilotStop` (die Zeit eines
 * Drucks) beendet die Schicht am Ende der Runde, statt anzuschieben.
 */

type $ = EngineInterface

/** Die letzte Zeile, mit der Claude meldet, dass alles erledigt ist, was ohne die Person geht. */
export const FERTIG = 'AUTOPILOT-FERTIG'
/** So viele Rückfragen behält die Liste; ältere fallen raus. */
const FRAGEN_MAX = 20
/** Nach so vielen angeschobenen Runden in Folge ohne Werkzeugaufruf hält die Schicht an. */
const LEERLAUF_MAX = 2
/** Nach so vielen API-Fehlern in Folge hält die Schicht an. */
const FEHLER_MAX = 3
/** So lange wartet die Schicht nach einem API-Fehler, bevor sie wieder anschiebt. */
const FEHLER_PAUSE_MS = 60_000
/**
 * So lange nach dem Einschalten, bis Claude weitermacht. Ein Befehl hält die Runde fest, solange er läuft; abschicken
 * geht erst, wenn er durch ist.
 */
const START_PAUSE_MS = 1000
/**
 * So lange darf ein eingereichter Anstoß warten, während keine Runde läuft, bevor er als verloren gilt (etwa aus der
 * Schlange genommen). Gezählt wird nur die Ruhe: Während eine Runde läuft, kann er nicht beginnen, und die Uhr steht.
 */
const AUSSTEHEND_VERFALL_MS = 10 * 60_000

/** Der Grund im Bericht, wenn die Person den Autopiloten mit 🅰️ beendet hat. */
export const GRUND_KNOPF = 'du hast ihn über 🅰️ beendet'

/** Der Grund im Bericht, wenn Claude mit der Marke meldet, dass alles erledigt ist. */
export const GRUND_FERTIG = 'Claude meldet: alles erledigt'

/** Der Grund im Bericht, wenn der Autopilot so oft angeschoben hat, wie autopilotMaxRunden erlaubt. */
export const GRUND_GRENZE = 'Rundengrenze'

/** Wo ein Agent laut `$.agent.list()` noch arbeitet (AgentStatus); die anderen sind fertig oder warten auf eine Nachricht. */
const AGENT_ARBEITET: ReadonlySet<string> = new Set(['pending', 'running', 'waiting'])

/**
 * Welche Hintergrundarbeit (`background_tasks[].type` am Rundenende) das Anschieben zurückhält: Agenten und Workflows,
 * die sich mit einer Fertigmeldung zurückmelden. Shells und Monitore nicht: Ein Dev-Server oder ein Monitor läuft
 * beliebig lange und würde den Autopiloten sonst stilllegen.
 */
const HINTERGRUND_HAELT: ReadonlySet<string> = new Set(['subagent', 'workflow'])

/**
 * Herkunft einer Nachricht der Person: im Terminal getippt (composer), in der Desktop-App (sdk) oder per Remote Control
 * vom Handy (bridge). Einreichungen von Mods (plugin) zählen nie, auch nicht mit asUser.
 */
const PERSON: ReadonlySet<string> = new Set(['composer', 'sdk', 'bridge'])

const schicht = atom({ plugin: 'leitstand', key: 'autopilotSchicht' } as const, null as AutopilotSchicht | null)
const bericht = atom({ plugin: 'leitstand', key: 'autopilotBericht' } as const, null as AutopilotBericht | null)
const zeigeFragen = atom({ plugin: 'leitstand', key: 'autopilotZeigeFragen' } as const, false)
/**
 * Der Wunsch, die Schicht zu beenden: die Zeit eines Drucks auf 🅰️, wie ihn der Leitstand bis zum Einbau ablegte. Ein
 * /autopilot-aus, das ein Mod startet, wartet, bis die Sitzung still ist, und das wird sie nicht, solange die Schicht
 * Runde um Runde anschiebt. Darum liest die Schicht den Wunsch selbst, am Ende jeder Runde.
 */
const stopp = atom({ plugin: 'leitstand', key: 'autopilotStop' } as const, null as number | null)
/** Ob der Leitstand an ist und was seine Checkliste hält: Wartet ihr Plan auf Freigabe, schiebt die Schicht nicht an. */
const leitstandAn = atom({ plugin: 'leitstand', key: 'glanceEnabled' } as const, true)
const checkliste = atom({ plugin: 'leitstand', key: 'checklist' } as const, null as GlanceChecklist | null)

const REGELN =
  'Stell keine Rückfragen, weder mit einem Werkzeug noch am Ende deiner Antwort. ' +
  'Wo du eine Entscheidung brauchst, triff sie selbst: Nimm die Option, die du empfehlen würdest, ' +
  'bei Zweifeln die vorsichtigere, die sich leicht rückgängig machen lässt, und halte sie in einem Satz fest. ' +
  'Nichts Unumkehrbares, das die Person nicht vorher ausdrücklich verlangt hat: nichts löschen, ' +
  'veröffentlichen, verschicken oder pushen. Was nur mit der Person geht, lässt du liegen und schreibst es auf. ' +
  'Wenn alles erledigt ist, was ohne die Person geht, schreib eine kurze Übergabe ' +
  '(was fertig ist, was du selbst entschieden hast, was liegen blieb) ' +
  `und als letzte Zeile ${FERTIG}.`

/** Was eine Nachricht der Person während der Schicht mitbekommt, für sie unsichtbar. */
export const KONTEXT = `Der Autopilot ist an: Die Person ist gleich nicht mehr am Platz und kann nicht antworten. ${REGELN}`

/** Womit die Schicht Claude nach einer Runde ohne Abschluss anschiebt. */
export const WEITER = 'Die Person ist nicht am Platz und hat den Autopiloten eingeschaltet. ' + `Mach mit der Aufgabe weiter, ohne auf sie zu warten. ${REGELN}`

/** Was Claude liest, wenn es während der Schicht eine Rückfrage stellen will. */
export const FRAGE_ABGELEHNT =
  'Autopilot: Die Person ist nicht am Platz und kann nicht antworten. ' +
  'Entscheide diese Frage selbst (die Option, die du empfehlen würdest, bei Zweifeln die vorsichtigere), ' +
  'halte die Entscheidung in einem Satz fest und arbeite weiter.'

/**
 * Ob Claude mit dieser Antwort meldet, dass es fertig ist.
 *
 * Nur die letzten Zeilen zählen: Wer die Marke mitten im Text erwähnt, etwa beim Erklären, ist damit noch nicht fertig.
 */
export function istFertig(antwort: string): boolean {
  return antwort
    .trim()
    .split('\n')
    .slice(-3)
    .some(zeile => zeile.toUpperCase().includes(FERTIG))
}

/** "1 Frage", "3 Fragen". */
function fragenText(n: number): string {
  return n === 1 ? '1 Frage' : `${n} Fragen`
}

/** Die Zahlen einer Schicht als Satz, für die Antwort eines Befehls. */
function zahlenSatz(geschoben: number, fragen: number): string {
  return `Er hat Claude ${geschoben}-mal angeschoben${fragen > 0 ? `, und Claude hat ${fragenText(fragen)} selbst entschieden` : ''}.`
}

/** Vom Handy: Den Bericht in der Leiste sieht nur der Rechner. */
const BERICHT_HANDY = ' Den Bericht in der Leiste siehst du am Rechner; die selbst entschiedenen Fragen zeigt hier /leitstand:autopilot-fragen-zeigen.'

/** Die Zahlen einer Schicht in einer Zeile. */
function zahlen(geschoben: number, fragen: number): string {
  const teile = [`${geschoben}x angeschoben`]
  if (fragen > 0) {
    teile.push(`${fragenText(fragen)} selbst entschieden`)
  }
  return teile.join(', ')
}

const STATUS: Record<AutopilotPhase, string> = {
  laeuft: 'Claude arbeitet ohne Rückfragen weiter',
  fertig: 'Claude meldet: alles erledigt',
  angehalten: 'angehalten',
}

/** Was ein Befehl des Autopiloten sagt, wenn er scheitert. */
export function fehlerText(name: string): string {
  return `Das hat nicht geklappt: Im Leitstand ging beim Ausführen von /${name} etwas schief. Versuch es gleich noch einmal; /leitstand:hilfe zeigt alle Befehle.`
}

/** Die vollen Namen der Befehle (leitstand:autopilot-an) und ihre Kurzformen (autopilot-an), je mit ihrem Eintrag. */
const BEFEHL_ZU_EINTRAG: ReadonlyMap<string, (typeof AUTOPILOT_BEFEHLE)[number]> = new Map(
  AUTOPILOT_BEFEHLE.flatMap(eintrag => {
    const kurz = kurzform(eintrag.name)
    return [[eintrag.name, eintrag] as const, ...(kurz === undefined ? [] : [[kurz, eintrag] as const])]
  }),
)

// Was nur dieses Laden des Moduls braucht. Ein Neuladen beginnt hier von vorn, die Schicht selbst liegt in `$.state`
// und bleibt.

/** Höchstens so oft schiebt die Schicht an, bis die Person wieder schreibt (autopilotMaxRunden). */
let maxRunden = 10
/** Die Runde der Hauptschleife, die gerade läuft (von turn.start bis zu ihrem turn.complete); null, wenn keine. */
let laufend: string | null = null
/** Ob ein Anstoß eingereicht ist, dessen Runde noch nicht begonnen hat: Er wartet in der Schlange. */
let ausstehend = false
/** Lässt `ausstehend` verfallen, wenn der Anstoß in der Ruhe nicht beginnt; null, solange die Uhr steht. */
let verfall: { cancel: () => void } | null = null
/** Ob es in dieser Sitzung schon eine Runde gab, an die eine neue Schicht anschließen kann. */
let hatRunde = false
/** Werkzeugaufrufe der laufenden Runde. */
let werkzeuge = 0
/**
 * Wie viele Agenten und Workflows die Engine am Ende der letzten Runde der Hauptschleife als laufend meldete
 * (`classic.Stop`, vor `turn.complete`); Shells und Monitore zählen nicht. null, solange seit dem Beginn der Runde
 * keine Meldung kam.
 */
let hintergrund: number | null = null
/** API-Fehler in Folge. */
let fehler = 0
/** Das Anschieben nach einem API-Fehler, solange es noch wartet. */
let warte: { cancel: () => void } | null = null

function verfallStoppen(): void {
  verfall?.cancel()
  verfall = null
}

/** Startet die Uhr für den wartenden Anstoß neu: Ab jetzt ist Ruhe, er sollte gleich beginnen. */
function verfallStellen($: $): void {
  verfallStoppen()
  verfall = $.clock.after(AUSSTEHEND_VERFALL_MS, () => {
    verfall = null
    ausstehend = false
  })
}

function ausstehendLoeschen(): void {
  ausstehend = false
  verfallStoppen()
}

function zaehlerAuf0(): void {
  fehler = 0
  warte?.cancel()
  warte = null
}

/**
 * Ob die Person diese Schicht mit 🅰️ beenden will: ein Wunsch, jünger als ihr Beginn. Ein älterer galt einer früheren
 * Schicht. Scheitert das Lesen, gibt es keinen Wunsch.
 */
async function sollAus($: $, s: AutopilotSchicht): Promise<boolean> {
  try {
    const wunsch: unknown = await read($, stopp)
    return typeof wunsch === 'number' && wunsch > s.seit
  } catch {
    return false
  }
}

async function anschieben($: $): Promise<void> {
  // Höchstens ein Anstoß unterwegs, und keiner, während schon eine Runde läuft: deren Ende entscheidet.
  if (laufend !== null || ausstehend) {
    return
  }
  ausstehend = true
  verfallStellen($)
  // Die Markierung setzt anschieben selbst, vor dem Einreichen: Den eigenen $.prompt.submit sieht der prompt.submit-Hook
  // des Autopiloten nie (Re-entry-Regel: er wird unter den Frames des aufrufenden Hooks erhoben).
  await update($, schicht, s => (s ? { ...s, geschoben: s.geschoben + 1, runden: (s.runden ?? 0) + 1, angeschoben: true } : s))
  void $.prompt.submit({ text: WEITER }).catch(() => {
    ausstehendLoeschen()
  })
}

/**
 * Ob noch Hintergrundarbeit dieser Sitzung läuft. Ihre Fertigmeldung startet ohnehin eine neue Runde. Ohne Meldung der
 * Engine seit Rundenbeginn (nach einem API-Fehler, nach einem Neuladen) fragt sie die Liste der Agenten.
 */
async function hintergrundLaeuft($: $): Promise<boolean> {
  if (hintergrund !== null) {
    return hintergrund > 0
  }
  try {
    const agenten = await $.agent.list()
    return agenten.some(a => AGENT_ARBEITET.has(a.status))
  } catch {
    return false
  }
}

/**
 * Ob ein Plan des Leitstands auf Freigabe wartet. Bei laufendem Autopiloten startet ihn der Leitstand nach 30 s selbst;
 * ein Anstoß davor liefe nur in seine Sperre (jedes Werkzeug abgelehnt) und hielte die Schicht als Leerlauf an.
 */
async function planWartet($: $): Promise<boolean> {
  try {
    return (await read($, leitstandAn)) && (await read($, checkliste))?.approval === 'waiting'
  } catch {
    return false
  }
}

/**
 * Vor jedem Anstoß: Läuft Hintergrundarbeit oder wartet ein Plan auf Freigabe, wartet die Schicht ('warten'), ohne zu
 * zählen. Hat sie so oft angeschoben, wie autopilotMaxRunden erlaubt, endet sie mit dem Grund Rundengrenze ('ende').
 * Sonst darf sie anschieben ('los').
 */
async function vorDemAnstoss($: $, s: AutopilotSchicht): Promise<'warten' | 'ende' | 'los'> {
  if ((await hintergrundLaeuft($)) || (await planWartet($))) {
    return 'warten'
  }
  if ((s.runden ?? 0) >= maxRunden) {
    await beenden($, GRUND_GRENZE)
    return 'ende'
  }
  return 'los'
}

async function anhalten($: $, phase: AutopilotPhase, grund: string): Promise<void> {
  warte?.cancel()
  warte = null
  await update($, schicht, s => (s ? { ...s, phase, grund } : s))
}

/** Nach einer Pause: anschieben, falls die Schicht noch läuft und Claude gerade nichts tut. */
async function anschiebenWennNoetig($: $): Promise<void> {
  warte = null
  const s = await read($, schicht)
  if (s?.phase === 'laeuft' && laufend === null && !ausstehend) {
    // Kam in der Pause ein Druck auf 🅰️, endet die Schicht, statt anzuschieben.
    if (await sollAus($, s)) {
      await beenden($, GRUND_KNOPF)
      return
    }
    if ((await vorDemAnstoss($, s)) !== 'los') {
      return
    }
    await anschieben($)
  }
}

/** Schiebt nach `ms` an; ein neues Warten oder das Ende der Schicht hebt es auf. */
function spaeterAnschieben($: $, ms: number): void {
  warte?.cancel()
  warte = $.clock.after(ms, () => void anschiebenWennNoetig($).catch(() => {}))
}

/** Beim Einschalten: Gab es schon eine Runde und läuft gerade keine, wartet Claude vermutlich auf eine Antwort. Dann geht es gleich weiter; true. */
function gleichWeiter($: $): boolean {
  if (hatRunde && laufend === null) {
    spaeterAnschieben($, START_PAUSE_MS)
    return true
  }
  return false
}

/** Startet eine Schicht; true, wenn Claude gleich weitermacht. */
async function beginnen($: $): Promise<boolean> {
  zaehlerAuf0()
  ausstehendLoeschen()
  const seit = await $.clock.now()
  await update($, bericht, () => null)
  await update($, zeigeFragen, () => false)
  await update($, schicht, () => ({ seit, phase: 'laeuft' as const, grund: null, geschoben: 0, runden: 0, angeschoben: false, leerlauf: 0, fragen: [] }))
  return gleichWeiter($)
}

/** Lässt eine angehaltene oder fertige Schicht weiterlaufen; true, wenn Claude gleich weitermacht. */
async function fortsetzen($: $): Promise<boolean> {
  zaehlerAuf0()
  ausstehendLoeschen()
  await update($, schicht, s => (s ? { ...s, phase: 'laeuft' as const, grund: null, runden: 0, angeschoben: false, leerlauf: 0 } : s))
  return gleichWeiter($)
}

/** Beendet die Schicht und legt den Bericht hin; null, wenn keine lief. */
async function beenden($: $, grund: string): Promise<AutopilotBericht | null> {
  zaehlerAuf0()
  const s = await read($, schicht)
  if (!s) {
    return null
  }
  const minuten = Math.max(0, Math.round(((await $.clock.now()) - s.seit) / 60_000))
  const b: AutopilotBericht = { minuten, geschoben: s.geschoben, fragen: s.fragen, grund }
  await update($, schicht, () => null)
  await update($, zeigeFragen, () => false)
  await update($, bericht, () => b)
  return b
}

async function fragenUmschalten($: $): Promise<void> {
  await update($, zeigeFragen, v => !v)
}

async function berichtWeg($: $): Promise<void> {
  await update($, bericht, () => null)
}

/** Schaltet den Autopiloten an (`soll`) oder aus; zurück kommt die Antwort des Befehls. */
async function schalte($: $, soll: boolean, handy = false): Promise<string> {
  const s = await read($, schicht)
  if (!soll) {
    // Kommt das Aus vom Knopf 🅰️, sagt der Bericht das.
    const b = await beenden($, s && (await sollAus($, s)) ? GRUND_KNOPF : 'du hast ihn beendet')
    if (b) {
      return `Der Autopilot ist aus. ${zahlenSatz(b.geschoben, b.fragen.length)}${handy ? BERICHT_HANDY : ''}`
    }
    // Den Druck auf 🅰️ hat die Schicht meist schon am Ende der Runde erledigt; das /autopilot-aus des Knopfs kommt erst
    // danach, wenn die Sitzung still ist.
    const vorher = await read($, bericht)
    return vorher?.grund === GRUND_KNOPF ? `Der Autopilot ist aus. ${zahlenSatz(vorher.geschoben, vorher.fragen.length)}` : 'Der Autopilot war nicht an.'
  }
  if (s?.phase === 'laeuft') {
    return 'Der Autopilot läuft schon. /autopilot aus beendet ihn.'
  }
  if (s) {
    // Angehalten oder fertig: dieselbe Schicht geht weiter, die Zähler von vorn.
    const gleich = await fortsetzen($)
    return `Der Autopilot läuft wieder.${gleich ? ' Claude macht jetzt gleich weiter.' : ''}`
  }
  const gleich = await beginnen($)
  return (
    'Der Autopilot ist an: Claude arbeitet ohne Rückfragen weiter und schreibt am Ende eine Übergabe. ' +
    (gleich ? 'Claude macht jetzt gleich weiter. ' : '') +
    'Fragt Claude Code um Erlaubnis für ein Werkzeug, wartet er trotzdem auf dich. Aus geht er mit 🅰️ oder /leitstand:autopilot-aus.'
  )
}

/** Die selbst entschiedenen Fragen als Text, wie sie der Knopf Fragen aufklappt. */
async function fragenAlsText($: $): Promise<string> {
  const s = await read($, schicht)
  const b = s ? null : await read($, bericht)
  if (!s && !b) {
    return 'Der Autopilot war in diesem Chat nicht an, es gibt keine selbst entschiedenen Fragen.'
  }
  const fragen = s ? s.fragen : (b?.fragen ?? [])
  if (fragen.length === 0) {
    return 'Claude hat bisher keine Frage selbst entschieden.'
  }
  const kopf = fragen.length === 1 ? 'Diese Frage hat Claude selbst entschieden:' : `Diese ${fragen.length} Fragen hat Claude selbst entschieden:`
  return [kopf, ...fragen.map(f => `- ${f}`)].join('\n')
}

/** Der Knopf Schließen (bis 0.57.1 "Weg"): den Bericht einer beendeten Schicht wegräumen. */
async function berichtWegText($: $): Promise<string> {
  if (await read($, schicht)) {
    return 'Der Autopilot läuft noch; einen Bericht gibt es erst, wenn er endet.'
  }
  if (!(await read($, bericht))) {
    return 'Es gibt keinen Bericht des Autopiloten, den man wegräumen könnte.'
  }
  await berichtWeg($)
  return 'Der Bericht des Autopiloten ist weg.'
}

/** Was ein Befehl tut, nach seinem vollen Namen; zurück kommt die Antwort. */
async function wirke($: $, name: string, handy: boolean): Promise<string> {
  switch (name) {
    case 'leitstand:autopilot-an':
      return schalte($, true)
    case 'leitstand:autopilot-aus':
      return schalte($, false, handy)
    case 'leitstand:autopilot-fragen-zeigen':
      return fragenAlsText($)
    case 'leitstand:autopilot-bericht-weg':
      return berichtWegText($)
    default:
      throw new Error(`kein Befehl ${name}`)
  }
}

/** Die Antwort eines Befehls, gemerkt: Ihre gespeicherte Zeile bekommt „(gemeldet vom Mod Leitstand)“. */
function antwort(text: string): { text: string } {
  merkeAntwort(text)
  return { text }
}

/**
 * Meldet Autopilot (früher ein eigener Mod) an; options mit den Namen, die der Mod Autopilot hatte (maxRunden).
 * Beantwortet seine Befehle (lang und kurz) und /autopilot in eigenen command.run-Hooks; die Kurzformen meldet der
 * Leitstand an, /autopilot dieser Teil.
 */
export function registerAutopilot(on: On, options: PluginOptions): void {
  maxRunden = Math.max(1, Math.floor(Number(options.maxRunden ?? 10)))

  // Jeder Hook hier trägt einen Matcher: Ohne Matcher hat der Leitstand dieselben Ereignisse schon angemeldet, und ein
  // Mod darf ein Ereignis nur einmal ohne Matcher anmelden. Die Matcher lassen alles durch, was der Autopilot braucht.

  // Die Desktop-App holt ihre Befehlsliste, bevor dieser Hook läuft, und hält /autopilot als erste Nachricht sonst für
  // unbekannt. Dafür liegt dieselbe Befehlsdatei in ~/.claude/commands; den Lauf beantwortet trotzdem dieser Teil.
  // `immediate`: Einschalten geht auch, während Claude arbeitet.
  on('session.start', { isInteractive: [true, false] }, async ($, e, next) => {
    await $.command
      .register({
        name: AUTOPILOT_GRUNDBEFEHL.name,
        description: `${AUTOPILOT_GRUNDBEFEHL.description} (Leitstand)`,
        argumentHint: AUTOPILOT_GRUNDBEFEHL.argumentHint,
        immediate: true,
      })
      .catch(() => {})
    return next(e)
  })

  on('command.run', { command: AUTOPILOT_GRUNDBEFEHL.name }, async ($, e) => {
    if (fragtNachHilfe(e.args ?? '')) {
      return antwort(befehlsHilfe(AUTOPILOT_GRUNDBEFEHL))
    }
    try {
      const arg = (e.args ?? '').trim().toLowerCase()
      const s = await read($, schicht)
      const soll = arg === 'an' || arg === 'ein' ? true : arg === 'aus' ? false : s === null
      return antwort(await schalte($, soll, e.origin?.kind === 'bridge'))
    } catch {
      return antwort(fehlerText(AUTOPILOT_GRUNDBEFEHL.name))
    }
  }).catch(() => antwort(fehlerText(AUTOPILOT_GRUNDBEFEHL.name)))

  // Die Befehle /leitstand:autopilot-… und ihre Kurzformen /autopilot-…: Jeder versteht hilfe und ?, und ein Fehler
  // wird ein schlichter Satz. Vom Handy (Remote Control) wirken sie genauso; jede Antwort ist schon Text.
  on('command.run', { command: [...BEFEHL_ZU_EINTRAG.keys()] }, async ($, e) => {
    const eintrag = BEFEHL_ZU_EINTRAG.get(e.command)
    if (eintrag === undefined) {
      return antwort(fehlerText(e.command))
    }
    if (fragtNachHilfe(e.args ?? '')) {
      return antwort(befehlsHilfe(eintrag))
    }
    try {
      return antwort(await wirke($, eintrag.name, e.origin?.kind === 'bridge'))
    } catch {
      return antwort(fehlerText(eintrag.name))
    }
  }).catch(($, e) => antwort(fehlerText(BEFEHL_ZU_EINTRAG.get(e.command)?.name ?? e.command)))

  // Nur Nachrichten der Person zählen (PERSON).
  on('prompt.submit', { origin: { kind: /^(composer|sdk|bridge)$/ } }, async ($, e, next) => {
    const s = await read($, schicht)
    if (!s || e.command || !PERSON.has(e.origin.kind)) {
      return next(e)
    }
    // Die Person hat selbst geschrieben: ein neuer Auftrag, die Zähler beginnen von vorn.
    zaehlerAuf0()
    // Eine fertige Schicht endet jetzt, statt wieder anzulaufen.
    if (s.phase === 'fertig') {
      await beenden($, GRUND_FERTIG)
      return next(e)
    }
    // Sie hat vorher 🅰️ gedrückt: Die Schicht ist vorbei, die Nachricht geht ohne den Kontext des Autopiloten raus.
    if (await sollAus($, s)) {
      await beenden($, GRUND_KNOPF)
      return next(e)
    }
    // Nur hier, bei einer Nachricht der Person, beginnt der Rundenzähler von vorn.
    await update($, schicht, x => (x ? { ...x, phase: 'laeuft' as const, grund: null, runden: 0, angeschoben: false, leerlauf: 0 } : x))
    return next({ ...e, context: [...(e.context ?? []), KONTEXT] })
  })

  // Jede Runde: Eine Runde hat immer eine Kennung.
  on('turn.start', { turnId: /./ }, async ($, e, next) => {
    if (!e.agentId) {
      laufend = e.turnId
      werkzeuge = 0
      hintergrund = null
      // Solange eine Runde läuft, kann der Anstoß nicht beginnen: Die Uhr steht.
      verfallStoppen()
      // Der eigene Anstoß hat seine Runde bekommen.
      if (e.text.includes(WEITER)) {
        ausstehend = false
      }
    }
    return next(e)
  })

  // Am Ende jeder Runde der Hauptschleife meldet die Engine, was noch im Hintergrund läuft, vor turn.complete.
  // Subagenten melden sich mit SubagentStop, nicht hier. Nur laufende Agenten und Workflows halten das Anschieben zurück.
  on('classic.Stop', { hook_event_name: 'Stop' }, async ($, e, next) => {
    hintergrund = (e.background_tasks ?? []).filter(t => HINTERGRUND_HAELT.has(t.type)).length
    return next(e)
  }).catch(($, e, next) => next(e))

  // Gezählt wird, was beim Autopiloten ankommt: Was der Leitstand darüber selbst beantwortet (plan_steps,
  // report_progress) oder ablehnt, zählt nicht als Arbeit. Der Matcher nimmt jedes Werkzeug.
  on('tool.call', { tool: /./ }, async ($, e, next) => {
    if (!e.agentId) {
      werkzeuge += 1
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Eine Rückfrage des Modells beantwortet die Schicht selbst. Fragt ein anderer Mod, bleibt es seine Sache.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const s = await read($, schicht)
    if (!s || next.origin.plugin !== 'engine') {
      return next(e)
    }
    const neu = (e.questions ?? []).map(q => q.question).filter(q => q.trim() !== '')
    await update($, schicht, x => (x ? { ...x, fragen: [...x.fragen, ...neu].slice(-FRAGEN_MAX) } : x))
    return { deny: FRAGE_ABGELEHNT }
  })

  on('turn.complete', { reason: ['answer', 'aborted', 'refusal', 'error'] }, async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) {
      return r
    }
    // Hat die Engine schon die nächste Runde gestartet, läuft die weiter.
    if (laufend === e.turnId) {
      laufend = null
    }
    // Wartet noch ein Anstoß, ist ab jetzt Ruhe: Er sollte gleich beginnen.
    if (ausstehend && laufend === null) {
      verfallStellen($)
    }
    hatRunde = true

    const s = await read($, schicht)
    if (!s) {
      return r
    }
    // Ob diese Runde angeschoben war; die Markierung gilt nur für sie.
    const warAngeschoben = s.angeschoben === true
    if (warAngeschoben) {
      await update($, schicht, x => (x ? { ...x, angeschoben: false } : x))
    }
    if (e.reason === 'aborted') {
      // Wer unterbricht, ist da.
      await beenden($, 'du hast unterbrochen')
      return r
    }
    // 🅰️: Die Person will die Schicht beenden. Das geht vor, auch vor dem nächsten Anschieben.
    if (await sollAus($, s)) {
      await beenden($, GRUND_KNOPF)
      return r
    }
    if (s.phase !== 'laeuft') {
      return r
    }
    if (e.reason === 'refusal') {
      await anhalten($, 'angehalten', 'Claude hat abgelehnt')
      return r
    }
    if (e.reason === 'error') {
      fehler += 1
      if (fehler >= FEHLER_MAX) {
        await anhalten($, 'angehalten', `${FEHLER_MAX} API-Fehler in Folge`)
        return r
      }
      spaeterAnschieben($, FEHLER_PAUSE_MS)
      return r
    }
    fehler = 0
    // Die Marke beendet den Autopiloten: Der Bericht bleibt bis Schließen, eine spätere Nachricht der Person schaltet ihn
    // nicht wieder ein.
    if (istFertig(e.answer)) {
      await beenden($, GRUND_FERTIG)
      return r
    }
    // Eine andere Runde läuft schon, oder ein Anstoß wartet noch: Deren Ende entscheidet.
    if (laufend !== null || ausstehend) {
      return r
    }
    // Hintergrundarbeit meldet sich selbst mit einer neuen Runde; an der Rundengrenze ist Schluss.
    if ((await vorDemAnstoss($, s)) !== 'los') {
      return r
    }
    const leerlauf = warAngeschoben && werkzeuge === 0 ? (s.leerlauf ?? 0) + 1 : 0
    await update($, schicht, x => (x ? { ...x, leerlauf } : x))
    if (leerlauf >= LEERLAUF_MAX) {
      await anhalten($, 'angehalten', 'Claude kommt ohne dich nicht weiter')
      return r
    }
    await anschieben($)
    return r
  })

  // Der Knopf 🅰️ (Schlüssel `nightshift`) zeichnet der Leitstand; den Druck beantwortet dieser Hook, weil nur hier `$`
  // an die Schicht kommt. Ein $.command.run des Leitstands erreicht die Befehls-Hooks des Leitstands nicht, auch diese
  // hier nicht (Re-entry-Regel). Läuft eine Schicht, ob sie arbeitet, angehalten oder fertig ist, endet sie sofort: Eine
  // laufende Runde macht Claude noch fertig, angeschoben wird nicht mehr. Sonst beginnt eine. Der Druck geht nicht an den
  // Knopf selbst weiter; scheitert der Hook, tut er, was der Knopf tut.
  on('ui.press', { plugin: 'leitstand', element: 'nightshift' }, async ($, e) => {
    if (await read($, schicht)) {
      await beenden($, GRUND_KNOPF)
      $.ui.toast(laufend === null ? 'Der Autopilot ist aus.' : 'Der Autopilot ist aus: Claude macht nur noch diese Runde fertig.')
    } else {
      const gleich = await beginnen($)
      $.ui.toast(gleich ? 'Der Autopilot ist an: Claude macht gleich weiter.' : 'Der Autopilot ist an.')
    }
    return { element: e.element }
  }).catch(($, e, next) => next(e))

  // Bei einer Umfrage weicht die Zeile: Der Matcher lässt den Hook dann aus.
  on('ui.render', { component: 'AbovePrompt', props: { hasSurvey: false } }, async ($, e, next) => {
    const s = await read($, schicht)
    const b = s ? null : await read($, bericht)
    if (!s && !b) {
      return next(e)
    }
    // Was darunter kommt (andere Mods, die Engine); scheitert es, steht die Zeile allein.
    const rest = await next(e).catch(() => null)
    const offen = await read($, zeigeFragen)
    const fragen = s ? s.fragen : (b?.fragen ?? [])
    const { Box, Button, Text } = $.ui.resolve(e)

    const zeile = s ? (
      <Text wrap="wrap">
        {s.phase === 'angehalten' ? `angehalten: ${s.grund ?? ''}` : STATUS[s.phase]}
        {s.geschoben > 0 || s.fragen.length > 0 ? ` (${zahlen(s.geschoben, s.fragen.length)})` : ''}
      </Text>
    ) : (
      <Text wrap="wrap">
        vorbei, {b?.grund}, nach {b?.minuten} min: {zahlen(b?.geschoben ?? 0, fragen.length)}
      </Text>
    )

    // Der Schlüssel `autopilot` ist fest: Der Leitstand holt die Zeile daran aus dem, was unter ihm gezeichnet wird, und
    // stellt sie ganz nach oben. Eine Zeile: links der Status, der den freien Platz nimmt und umbricht, statt die Knöpfe
    // hinauszuschieben; rechts die Knöpfe.
    const eigene = (
      <Box key="autopilot" flexDirection="column" paddingX={1}>
        <Box flexDirection="row" gap={1}>
          <Text color="suggestion" bold>
            Autopilot:
          </Text>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            {zeile}
          </Box>
          <Box flexDirection="row" gap={2} flexShrink={0}>
            {fragen.length > 0 ? <Button key="ap-fragen" label={offen ? 'Fragen zu' : `Fragen (${fragen.length})`} onPress={() => void fragenUmschalten($)} /> : null}
            {s ? (
              <Button key="ap-beenden" label="Beenden" onPress={() => void beenden($, 'du hast ihn beendet')} />
            ) : (
              <Button key="ap-weg" label="Schließen" role="dismiss" onPress={() => void berichtWeg($)} />
            )}
          </Box>
        </Box>
        {offen && fragen.length > 0 ? (
          <Box flexDirection="column">
            <Text dimColor>Diese Fragen hat Claude selbst entschieden:</Text>
            {fragen.map((f, i) => (
              <Text key={`ap-frage-${i}`} dimColor wrap="wrap">
                - {f}
              </Text>
            ))}
          </Box>
        ) : null}
      </Box>
    )
    // Die eigene Zeile vor allem, was darunter kommt.
    return rest ? (
      <Box flexDirection="column">
        {eigene}
        {rest}
      </Box>
    ) : (
      eigene
    )
  })
}
