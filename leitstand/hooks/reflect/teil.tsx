/**
 * Selbstkritik und Regeln, bis 2026-10-26 der Mod Reflect: aus Korrekturen lernen, und die eigene Arbeit auf Abruf
 * kritisch prüfen. Alles, was `$` braucht, steht in dieser Datei (der Prüfer lässt `$` nie über einen Import gehen); die
 * reinen Helfer stehen in logik.ts, die Befehle für Übersicht und Kurzformen in befehle.ts.
 *
 * Die Regeln sind eine Anpassung von reflect-mod aus github.com/BayramAnnakov/claude-reflect (Ordner mod/),
 * MIT-Lizenz, Copyright (c) 2025 Bayram Annakov; siehe LICENSE und ACKNOWLEDGEMENTS.md in diesem Ordner.
 * Die Selbstkritik ist neu geschrieben.
 *
 * Nichts hält an oder wartet auf einen Knopf: Auf dem Handy (Remote Control) sind Band, Fenster und Toasts nicht zu
 * sehen. Gefundene Regeln warten, bis jemand entscheidet, im Fenster Regeln oder per /leitstand:regeln und den Befehlen dazu.
 */
import { atom, read, update } from 'claude-code'
import type { CommandRunInput, EngineInterface, On, PluginOptions } from 'claude-code'

import type { ReflectEinstellungen, ReflectFund, ReflectGespeichert, ReflectReflexion, ReflectZiel } from '../../types'
import { merkeAntwort } from '../antwort'
import { befehlsHilfe, fragtNachHilfe, kurzform } from '../logic'
import { REFLECT_BEFEHLE } from './befehle'
import {
  MAX_PROMPT,
  SAME,
  SYSTEM,
  anAus,
  auftragAus,
  checkPrompt,
  cleanRule,
  explizit,
  globaleDatei,
  grund,
  isTrivial,
  looksSecret,
  parseVerdict,
  reflexionsPrompt,
  similarity,
  uhrzeit,
  withRule,
} from './logik'
import type { Verdict } from './logik'

const wartend = atom({ plugin: 'leitstand', key: 'regelnWartend' } as const, [] as ReflectFund[])
const gespeichert = atom({ plugin: 'leitstand', key: 'regelnGespeichert' } as const, [] as ReflectGespeichert[])
const reflexionen = atom({ plugin: 'leitstand', key: 'selbstkritikReflexionen' } as const, [] as ReflectReflexion[])
const angezeigt = atom({ plugin: 'leitstand', key: 'selbstkritikAngezeigt' } as const, null as string | null)
const nummern = atom({ plugin: 'leitstand', key: 'regelnNummern' } as const, [] as string[])

// ---------------------------------------------------------------------------
// Regeln: aus Korrekturen lernen (Logik aus reflect-mod)
// ---------------------------------------------------------------------------

const MIN_CONFIDENCE = 0.7
const MAX_ITEMS = 300
const MAX_QUEUE = 20
/** Das Fenster mit den wartenden Regeln. */
const REGELN_PANE = 'leitstand-regeln'
const REGELN_TITEL = 'Regeln'
/** Oben im Fenster Regeln: was passiert ist, und was die drei Ziele heißen. */
const REGELN_FRAGE = 'Claude hat aus deiner Nachricht eine Regel herausgelesen. Wo soll sie gelten?'
const REGELN_ZIELE =
  'Alle Projekte schreibt sie in deine globale CLAUDE.md, Dieses Projekt in die CLAUDE.md im Projektordner (Textdateien mit Anweisungen, die Claude bei jedem Start liest), Nur dieser Chat in keine Datei. Ändern kannst du sie später in der Datei oder mit einer Bitte an Claude. Geschlossen? /leitstand:regeln öffnet das Fenster wieder.'
/** Die eigenen Nachrichten der Person: im Terminal getippt (composer), in der Desktop-App (sdk) oder per Remote Control (bridge, Android-App). */
const HUMAN = /^(composer|sdk|bridge)$/

/** Die Ziele in der Reihenfolge der Knöpfe. */
const ZIELE: readonly { ziel: ReflectZiel; label: string; key: string }[] = [
  { ziel: 'global', label: 'Alle Projekte', key: 'global' },
  { ziel: 'project', label: 'Dieses Projekt', key: 'projekt' },
  { ziel: 'chat', label: 'Nur dieser Chat', key: 'chat' },
]

// Im Store, den sich der Teil mit dem Leitstand teilt: alles mit dem Präfix reflect., nichts anderes fasst der Teil an.
// Je Chat die Einstellungen und die Regeln, die nur dort gelten.
const EINSTELLUNGEN = 'reflect.einstellungen:'
const CHAT_REGELN = 'reflect.chatRegeln:'
const FUNDE = 'reflect.funde'
const AUFGERAEUMT = 'reflect.aufgeraeumt'
/** Chat-Schlüssel, so lange unberührt, fliegen raus. */
const HALTBAR_MS = 30 * 24 * 60 * 60_000
/** Höchstens so oft wird aufgeräumt. */
const AUFRAEUMEN_MS = 24 * 60 * 60_000
const MAX_CHAT_REGELN = 30

// Dem Modul eigen: ein Neuladen verliert sie; Store und State behalten das Wichtige.
let modell = 'haiku'
let standard: ReflectEinstellungen = { pruefung: true, selbstkritikAuto: false }
let isDraining = false
/** Schreiben in CLAUDE.md und Entscheidungen laufen in dieser Sitzung nacheinander. */
let writing: Promise<unknown> = Promise.resolve()
const queue: string[] = []

/** Die wartenden zuerst nach Häufigkeit, dann die jüngsten: so zeigt das Fenster, so nummeriert /leitstand:regeln. */
function reihenfolge(list: ReflectFund[]) {
  return [...list].sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
}

async function funde($: EngineInterface): Promise<ReflectFund[]> {
  const got = await $.store.get(FUNDE)
  return Array.isArray(got) ? (got as ReflectFund[]) : []
}

/** Hält die neuesten MAX_ITEMS; entschiedene fallen vor wartenden weg. */
async function saveFunde($: EngineInterface, list: ReflectFund[]) {
  let kept = list
  if (kept.length > MAX_ITEMS) {
    const decided = kept.filter(l => l.status !== 'pending').sort((a, b) => a.lastAt - b.lastAt)
    const drop = new Set(decided.slice(0, kept.length - MAX_ITEMS).map(l => l.id))
    kept = kept.filter(l => !drop.has(l.id)).slice(-MAX_ITEMS)
  }
  await $.store.set(FUNDE, kept)
}

/** Die wartenden Regeln, die hier gelten: dieses Projekt und globale. */
async function offeneRegeln($: EngineInterface) {
  const root = await $.session.root()
  return reihenfolge((await funde($)).filter(l => l.status === 'pending' && (l.scope === 'global' || l.project === root)))
}

/** Legt die wartenden Regeln in das Atom, aus dem das Fenster zeichnet; zurück kommen sie auch. */
async function aktualisiereRegeln($: EngineInterface) {
  const mine = await offeneRegeln($)
  await update($, wartend, () => mine)
  return mine
}

/** Öffnet das Fenster Regeln, ohne darauf zu warten und ohne den Fokus zu nehmen. */
function oeffneRegeln($: EngineInterface) {
  void $.ui.open({ id: REGELN_PANE, title: REGELN_TITEL, closeOnEscape: true }).catch(() => undefined)
}

function schliesseRegeln($: EngineInterface) {
  void $.ui.close({ id: REGELN_PANE }).catch(() => undefined)
}

async function fileFor($: EngineInterface, scope: 'global' | 'project', root: string) {
  if (scope === 'global') return globaleDatei(await $.env.get('HOME'), await $.env.get('USERPROFILE'))
  return `${root}/CLAUDE.md`
}

async function readText($: EngineInterface, path: string | undefined) {
  if (path === undefined || !(await $.fs.exists(path))) return ''
  const got = await $.fs.read(path)
  return typeof got === 'string' ? got : ''
}

type ChatRegelnEintrag = { at: number; regeln: string[] }

function istChatRegeln(v: unknown): v is ChatRegelnEintrag {
  return typeof v === 'object' && v !== null && typeof (v as ChatRegelnEintrag).at === 'number' && Array.isArray((v as ChatRegelnEintrag).regeln)
}

/** Die Regeln, die nur in diesem Chat gelten. */
async function chatRegeln($: EngineInterface, sid: string): Promise<string[]> {
  const v = await $.store.get(CHAT_REGELN + sid)
  return istChatRegeln(v) ? v.regeln.filter((r): r is string => typeof r === 'string') : []
}

/**
 * Fügt einen Fund hinzu, zählt eine Wiederholung, oder hält ein "merke:" getrennt von einem verworfenen Zwilling.
 * Wartet danach eine Regel, die vorher nicht wartete, öffnet sich das Fenster Regeln.
 */
async function record($: EngineInterface, v: Verdict, root: string, isExplicit: boolean, sid: string) {
  const now = await $.clock.now()
  const list = await funde($)
  const same = list.find(
    l =>
      (l.scope === 'global' || l.project === root) &&
      (l.status !== 'skipped' || !isExplicit) &&
      similarity(l.rule, v.rule) >= SAME,
  )
  if (same !== undefined) {
    same.count += 1
    same.lastAt = now
    // Nur für einen anderen Chat angenommen: hier wartet sie wieder auf eine Entscheidung.
    if (same.status === 'chat' && !(await chatRegeln($, sid)).some(r => similarity(r, same.rule) >= SAME)) {
      same.status = 'pending'
      await saveFunde($, list)
      await aktualisiereRegeln($)
      oeffneRegeln($)
      return
    }
    await saveFunde($, list)
    return
  }
  const target = await readText($, await fileFor($, v.scope, root))
  const isKnown = target
    .split('\n')
    .some(line => /^\s*[-*] /.test(line) && similarity(line.replace(/^\s*[-*]\s+/, ''), v.rule) >= SAME)
  list.push({
    id: `r${now.toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`,
    rule: v.rule,
    scope: v.scope,
    project: root,
    count: 1,
    firstAt: now,
    lastAt: now,
    status: isKnown ? 'saved' : 'pending',
    confidence: v.confidence,
  })
  await saveFunde($, list)
  if (isKnown) return
  // Erst das Atom, dann das Fenster: so zeichnet es gleich mit der neuen Regel.
  await aktualisiereRegeln($)
  oeffneRegeln($)
}

/** Der Text der letzten Antwort, als Kontext für die Prüfung. */
async function lastReply($: EngineInterface) {
  const rows = await $.session.messages()
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]
    if (row?.role === 'assistant' && row.text.trim() !== '') return row.text
  }
  return ''
}

/** Eine Nachricht von vorn bis hinten. Alles Langsame passiert hier, außerhalb der Nachricht selbst. */
async function checkOne($: EngineInterface, text: string) {
  const sid = await $.session.id()
  const root = await $.session.root()
  const told = explizit(text)
  if (told !== undefined) {
    // "merke:" kostet keinen Modellaufruf und gilt darum auch bei ausgeschalteter Prüfung.
    const rule = cleanRule(told)
    if (rule === undefined) {
      $.ui.toast('Nicht übernommen – eine Zeile, keine Geheimnisse, höchstens 200 Zeichen')
      return
    }
    await record($, { isRule: true, rule, scope: 'global', confidence: 1 }, root, true, sid)
    return
  }
  if (!(await einstellungen($, sid)).pruefung) return
  const r = await $.model.complete({
    model: modell,
    system: SYSTEM,
    prompt: checkPrompt(text, await lastReply($), root),
    maxTokens: 300,
    timeoutMs: 30000,
  })
  if (!r.isAnswered) return
  const v = parseVerdict(r.text)
  if (v === undefined || !v.isRule || v.confidence < MIN_CONFIDENCE) return
  await record($, v, root, false, sid)
}

/** Arbeitet die Warteschlange ab; jede gefundene Regel zeigt sich sofort, ein Fehler hält nichts auf. */
async function drain($: EngineInterface) {
  if (isDraining) return
  isDraining = true
  try {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      try {
        await checkOne($, next)
      } catch {
        // Ein gesperrtes Modell, ein Store- oder Dateifehler: diese Nachricht ist verloren, der Rest läuft.
      }
      await aktualisiereRegeln($).catch(() => undefined)
    }
  } finally {
    isDraining = false
  }
}

async function decide($: EngineInterface, id: string, status: ReflectFund['status'], scope?: 'global' | 'project', project?: string) {
  const list = await funde($)
  const one = list.find(l => l.id === id)
  if (one !== undefined && one.status === 'pending') {
    one.status = status
    if (scope !== undefined) one.scope = scope
    if (project !== undefined) one.project = project
  }
  await saveFunde($, list)
  // Die letzte Entscheidung schließt das Fenster, für Knöpfe und Befehle gleich.
  if ((await aktualisiereRegeln($)).length === 0) schliesseRegeln($)
}

/** Hängt eine Arbeit an die Kette dieser Sitzung: Speichern und Entscheiden laufen nacheinander. */
function nacheinander<T>(arbeit: () => Promise<T>): Promise<T> {
  const job = writing.then(arbeit)
  writing = job.catch(() => undefined)
  return job
}

const ENTSCHIEDEN = 'Diese Regel ist schon entschieden.'

/**
 * Übernimmt die wartende Regel an das Ziel und sagt in einem Satz, was geschah.
 * Eine CLAUDE.md wird kurz vor dem Schreiben noch einmal gelesen.
 */
async function speichere($: EngineInterface, id: string, ziel: ReflectZiel): Promise<string> {
  return nacheinander(async () => {
    const latest = (await funde($)).find(one => one.id === id)
    if (latest === undefined || latest.status !== 'pending') return ENTSCHIEDEN
    if (ziel === 'chat') {
      const sid = await $.session.id()
      const regeln = await chatRegeln($, sid)
      if (!regeln.some(r => similarity(r, latest.rule) >= SAME)) regeln.push(latest.rule)
      await $.store.set(CHAT_REGELN + sid, { at: await $.clock.now(), regeln: regeln.slice(-MAX_CHAT_REGELN) })
      await decide($, id, 'chat')
      return `Gilt jetzt nur in diesem Chat: „${latest.rule}“`
    }
    const root = await $.session.root()
    const path = await fileFor($, ziel, root)
    if (path === undefined) {
      return 'Nicht gespeichert: Weder HOME noch USERPROFILE ist gesetzt, die globale CLAUDE.md ist nicht zu finden. „Dieses Projekt“ oder „Nur dieser Chat“ gehen.'
    }
    const before = await readText($, path)
    const after = withRule(before, latest.rule)
    if (after === undefined) {
      return `Nicht gespeichert: Die Marker von claude-reflect in ${path} sind kaputt. Bitte von Hand reparieren.`
    }
    if (after !== before) await $.fs.write(path, after)
    await decide($, id, 'saved', ziel, root)
    await update($, gespeichert, rules => [...rules, { rule: latest.rule, scope: ziel, project: root }])
    return after === before ? `Steht schon in ${path}: „${latest.rule}“` : `Gespeichert in ${path}: „${latest.rule}“`
  })
}

async function verwerfe($: EngineInterface, id: string): Promise<string> {
  return nacheinander(async () => {
    const latest = (await funde($)).find(one => one.id === id)
    if (latest === undefined || latest.status !== 'pending') return ENTSCHIEDEN
    await decide($, id, 'skipped')
    return `Verworfen: „${latest.rule}“`
  })
}

const FELD_VOLL = 'Erst das Eingabefeld leeren – „Bearbeiten“ legt die Regel dort hinein'

/**
 * Legt die Regel zum Umformulieren in ein leeres Eingabefeld; abgeschickt kommt sie als "merke:" zurück.
 * Sagt, wie es ausging: entschieden, Feld voll, gefüllt oder nicht genommen.
 */
async function bearbeite($: EngineInterface, id: string): Promise<'entschieden' | 'voll' | 'gefuellt' | 'abgelehnt'> {
  const latest = (await funde($)).find(one => one.id === id)
  if (latest === undefined || latest.status !== 'pending') return 'entschieden'
  const box = await $.prompt.read()
  if (box.text.trim() !== '') {
    $.ui.toast(FELD_VOLL)
    return 'voll'
  }
  const filled = await $.prompt.fill({ text: `merke: ${latest.rule}` })
  if (!filled.isFilled) return 'abgelehnt'
  await nacheinander(() => decide($, id, 'skipped'))
  return 'gefuellt'
}

// ---------------------------------------------------------------------------
// Einstellungen je Chat
// ---------------------------------------------------------------------------

type EinstellungenEintrag = { at: number; values: Partial<ReflectEinstellungen> }

function istEinstellungen(v: unknown): v is EinstellungenEintrag {
  return typeof v === 'object' && v !== null && typeof (v as EinstellungenEintrag).at === 'number' && typeof (v as EinstellungenEintrag).values === 'object' && (v as EinstellungenEintrag).values !== null
}

/** Was in diesem Chat gilt: seine eigenen Werte, sonst der Standard für neue Chats (userConfig). */
async function einstellungen($: EngineInterface, sid: string): Promise<ReflectEinstellungen> {
  const v = await $.store.get(EINSTELLUNGEN + sid)
  const values = istEinstellungen(v) ? v.values : {}
  return {
    pruefung: typeof values.pruefung === 'boolean' ? values.pruefung : standard.pruefung,
    selbstkritikAuto: typeof values.selbstkritikAuto === 'boolean' ? values.selbstkritikAuto : standard.selbstkritikAuto,
  }
}

/** Setzt einen Wert nur für diesen Chat; die anderen Werte des Chats folgen weiter dem Standard. */
async function setzeEinstellung($: EngineInterface, sid: string, feld: keyof ReflectEinstellungen, wert: boolean) {
  const v = await $.store.get(EINSTELLUNGEN + sid)
  const values = istEinstellungen(v) ? { ...v.values } : {}
  values[feld] = wert
  await $.store.set(EINSTELLUNGEN + sid, { at: await $.clock.now(), values })
}

function hatZeit(v: unknown): v is { at: number } {
  return typeof v === 'object' && v !== null && typeof (v as { at: unknown }).at === 'number'
}

/**
 * Markiert die Schlüssel dieses Chats als berührt und räumt fremde weg, die länger als 30 Tage unberührt sind; das
 * Wegräumen höchstens einmal am Tag. Nur Schlüssel mit dem Präfix reflect.: die des Leitstands bleiben, wie sie sind.
 */
async function raeumeAuf($: EngineInterface, sid: string, jetzt: number) {
  for (const praefix of [EINSTELLUNGEN, CHAT_REGELN]) {
    const v = await $.store.get(praefix + sid)
    if (hatZeit(v)) await $.store.set(praefix + sid, { ...v, at: jetzt })
  }
  const zuletzt = await $.store.get(AUFGERAEUMT)
  if (typeof zuletzt === 'number' && jetzt - zuletzt < AUFRAEUMEN_MS) return
  await $.store.set(AUFGERAEUMT, jetzt)
  for (const schluessel of await $.store.keys()) {
    if (!schluessel.startsWith(EINSTELLUNGEN) && !schluessel.startsWith(CHAT_REGELN)) continue
    if (schluessel === EINSTELLUNGEN + sid || schluessel === CHAT_REGELN + sid) continue
    const v = await $.store.get(schluessel)
    if (!hatZeit(v) || jetzt - v.at > HALTBAR_MS) await $.store.delete(schluessel)
  }
}

// ---------------------------------------------------------------------------
// Selbstkritik
// ---------------------------------------------------------------------------

/** Das Fenster; der Leitstand nennt seine eigenen leitstand-history, -plan, -recap und -settings. */
const PANE = 'leitstand-selbstkritik'
const TITEL = 'Selbstkritik'
const MAX_REFLEXIONEN = 5
/** Läuft eine Selbstkritik länger, gilt sie als hängen geblieben, und eine neue darf starten. */
const HAENGT_MS = 10 * 60_000
const MAX_SCHWERPUNKT = 300
const NEULADEN = 'Unterbrochen: Der Leitstand wurde neu geladen, während die Selbstkritik lief. /leitstand:selbstkritik startet sie neu.'
const HAENGT = 'Keine Antwort nach 10 Minuten. /leitstand:selbstkritik startet eine neue.'
/** Werkzeuge, die Dateien ändern: nur nach solchen Runden läuft die automatische Selbstkritik. */
const AENDERER = /^(Edit|Write|MultiEdit|NotebookEdit)$/

/** Die Selbstkritiken, die dieses Modul gerade selbst ausführt. */
const laufende = new Set<string>()
/** Ob die laufende Runde des Hauptchats Dateien geändert hat. */
let geaendert = false
/** Macht die IDs der Selbstkritiken eindeutig, auch bei gleicher Uhrzeit. */
let zaehler = 0

function kopfzeile(r: ReflectReflexion) {
  return [
    `Selbstkritik von ${uhrzeit(r.at)}`,
    ...(r.anlass === 'auto' ? ['automatisch'] : []),
    ...(r.schwerpunkt === '' ? [] : [`Schwerpunkt: ${r.schwerpunkt}`]),
  ].join(' · ')
}

/**
 * Markiert laufende Selbstkritiken als fehlgeschlagen, die dieses Modul nicht
 * (mehr) ausführt (ein Neuladen) oder die zu lange hängen.
 */
async function raeumeVerwaiste($: EngineInterface) {
  const jetzt = await $.clock.now()
  const liste = await read($, reflexionen)
  const verwaist = (r: ReflectReflexion) => r.status === 'laeuft' && (!laufende.has(r.id) || jetzt - r.at > HAENGT_MS)
  if (!liste.some(verwaist)) return
  await update($, reflexionen, l =>
    l.map(r => {
      if (!verwaist(r)) return r
      laufende.delete(r.id)
      return { ...r, status: 'fehlgeschlagen' as const, hinweis: jetzt - r.at > HAENGT_MS ? HAENGT : NEULADEN }
    }),
  )
}

/**
 * Führt eine Selbstkritik aus und trägt ihr Ergebnis ein. Nur eine noch laufende wird überschrieben:
 * Was ein Neuladen oder das Zeitlimit inzwischen als fehlgeschlagen markiert hat, bleibt so.
 */
async function fuehreAus($: EngineInterface, id: string, schwerpunkt: string) {
  let ergebnis: Pick<ReflectReflexion, 'status' | 'text' | 'hinweis'>
  try {
    const r = await $.model.fork({ prompt: reflexionsPrompt(schwerpunkt) })
    if (r.isAnswered && r.text.trim() !== '') ergebnis = { status: 'fertig', text: r.text.trim() }
    else if (r.isAnswered) ergebnis = { status: 'fehlgeschlagen', text: '', hinweis: grund({ reason: 'empty-reply' }) }
    else ergebnis = { status: 'fehlgeschlagen', text: '', hinweis: grund(r as { reason: string; status?: number }) }
  } catch (err) {
    ergebnis = { status: 'fehlgeschlagen', text: '', hinweis: `Die Anfrage wurde nicht gesendet: ${err instanceof Error ? err.message : String(err)}` }
  } finally {
    laufende.delete(id)
  }
  await update($, reflexionen, l => l.map(r => (r.id === id && r.status === 'laeuft' ? { ...r, ...ergebnis } : r)))
}

/** Startet eine Selbstkritik im Hintergrund; undefined, wenn schon eine läuft. */
async function starteReflexion($: EngineInterface, schwerpunkt: string, anlass: ReflectReflexion['anlass']): Promise<string | undefined> {
  await raeumeVerwaiste($)
  if ((await read($, reflexionen)).some(r => r.status === 'laeuft')) return undefined
  const jetzt = await $.clock.now()
  zaehler += 1
  const id = `x${jetzt.toString(36)}-${zaehler}-${Math.floor(Math.random() * 46656).toString(36)}`
  const eintrag: ReflectReflexion = { id, at: jetzt, schwerpunkt, anlass, status: 'laeuft', text: '' }
  laufende.add(id)
  await update($, reflexionen, l => [...l, eintrag].slice(-MAX_REFLEXIONEN))
  await update($, angezeigt, () => null)
  $.clock.after(0, () => void fuehreAus($, id, schwerpunkt).catch(() => laufende.delete(id)))
  return id
}

/** Öffnet das Fenster, ohne darauf zu warten und ohne den Fokus zu nehmen. */
function oeffneFenster($: EngineInterface) {
  void $.ui.open({ id: PANE, title: TITEL, closeOnEscape: true }).catch(() => undefined)
}

/**
 * Legt die Abschnitte "Könnte falsch sein" und "Als Nächstes prüfen" ins Eingabefeld; abgeschickt wird nie.
 * Zurück kommt der Satz, den auch der Toast zeigt (undefined, wenn die Selbstkritik nicht fertig ist).
 */
async function uebergib($: EngineInterface, id: string): Promise<string | undefined> {
  const r = (await read($, reflexionen)).find(x => x.id === id)
  if (r === undefined || r.status !== 'fertig') return undefined
  const text = auftragAus(r.text)
  const box = await $.prompt.read()
  const leer = box.text.trim() === ''
  const filled = await $.prompt.fill({ text: leer ? text : `\n\n${text}`, mode: leer ? 'replace' : 'append' })
  const satz = filled.isFilled ? 'Der Auftrag steht im Eingabefeld. Prüfen, dann abschicken.' : 'Das Eingabefeld hat den Text nicht genommen.'
  $.ui.toast(satz)
  return satz
}

async function kopiere($: EngineInterface, id: string, surface: Parameters<EngineInterface['ui']['copy']>[0]['surface']): Promise<string | undefined> {
  const r = (await read($, reflexionen)).find(x => x.id === id)
  if (r === undefined || r.status !== 'fertig') return undefined
  const kopiert = await $.ui.copy({ text: `${kopfzeile(r)}\n\n${r.text}`, surface })
  const satz = kopiert.isCopied ? 'Selbstkritik kopiert.' : 'Kopieren ging hier nicht.'
  $.ui.toast(satz)
  return satz
}

/** Blättert im Fenster: -1 ältere, +1 neuere; liest dabei den aktuellen Stand, nicht den beim Zeichnen. */
async function blaettere($: EngineInterface, richtung: -1 | 1) {
  const liste = await read($, reflexionen)
  if (liste.length === 0) return
  const gewaehlt = await read($, angezeigt)
  // Wie beim Zeichnen: ohne Wahl, oder wenn die gewählte schon herausgefallen ist, die neueste.
  const gefunden = gewaehlt === null ? -1 : liste.findIndex(r => r.id === gewaehlt)
  const jetzt = gefunden < 0 ? liste.length - 1 : gefunden
  const ziel = Math.min(liste.length - 1, Math.max(0, jetzt + richtung))
  await update($, angezeigt, () => (ziel === liste.length - 1 ? null : (liste[ziel]?.id ?? null)))
}

// ---------------------------------------------------------------------------
// Die Befehle: /leitstand:… (und ihre Kurzformen) und der Grundbefehl /reflect
// ---------------------------------------------------------------------------

/** Wie die Antworten auf andere Befehle verweisen: unter /reflect auf dessen Unterbefehle, sonst auf die neuen Namen. */
type Verweise = { starten: string; zeigen: string; regeln: string; speichern: string; verwerfen: string; pruefung: string; auto: string }

const REFLECT: Verweise = {
  starten: '/reflect',
  zeigen: '/reflect zeigen',
  regeln: '/reflect regeln',
  speichern: 'Speichern: /reflect speichern <Nr> [global|projekt|chat] (ohne Ziel: der Vorschlag). Verwerfen: /reflect verwerfen <Nr>.',
  verwerfen: '/reflect verwerfen <Nr>',
  pruefung: '/reflect pruefung an|aus',
  auto: '/reflect auto an|aus',
}

const NEU: Verweise = {
  starten: '/leitstand:selbstkritik',
  zeigen: '/leitstand:selbstkritik-zeigen',
  regeln: '/leitstand:regeln',
  speichern:
    'Speichern: /leitstand:regel-global, /leitstand:regel-projekt oder /leitstand:regel-chat mit der Nummer. Umformulieren: /leitstand:regel-bearbeiten <Nr>. Verwerfen: /leitstand:regel-verwerfen <Nr>.',
  verwerfen: '/leitstand:regel-verwerfen <Nr>',
  pruefung: '/leitstand:regelpruefung-an oder -aus',
  auto: '/leitstand:selbstkritik-auto-an oder -aus',
}

export const BEFEHL_FEHLER = 'Das hat nicht geklappt: Im Leitstand ging beim Ausführen etwas schief. Versuch es gleich noch einmal; /leitstand:hilfe zeigt alle Befehle.'
const REFLECT_FEHLER = BEFEHL_FEHLER

/** Ob der Befehl vom Handy kam (Remote Control), wo kein Fenster zu sehen ist. */
const vomHandy = (e: Pick<CommandRunInput, 'origin'>) => e.origin?.kind === 'bridge'

function zielAus(wort: string): ReflectZiel | undefined {
  const w = wort.toLowerCase()
  if (w === 'global' || w === 'alle' || w === 'g') return 'global'
  if (w === 'projekt' || w === 'project' || w === 'p') return 'project'
  if (w === 'chat' || w === 'c') return 'chat'
  return undefined
}

function zielName(z: ReflectZiel) {
  return ZIELE.find(one => one.ziel === z)?.label ?? z
}

/** Die Regel zu einer Nummer aus der letzten Liste (sonst der jetzigen Reihenfolge), oder ein Satz, warum nicht. */
async function regelNr($: EngineInterface, wort: string | undefined, v: Verweise): Promise<{ fund: ReflectFund } | { fehler: string }> {
  const nr = Number(wort)
  if (wort === undefined || !Number.isInteger(nr) || nr < 1) {
    return { fehler: `Welche Regel? ${v.regeln} zeigt die Nummern.` }
  }
  const gelistet = await read($, nummern)
  const id = gelistet.length > 0 ? gelistet[nr - 1] : (await offeneRegeln($))[nr - 1]?.id
  if (id === undefined) return { fehler: `Es gibt keine Regel ${nr}. ${v.regeln} zeigt die aktuelle Liste.` }
  const fund = (await funde($)).find(l => l.id === id)
  if (fund === undefined || fund.status !== 'pending') {
    return { fehler: `Regel ${nr} ist schon entschieden. ${v.regeln} zeigt die aktuelle Liste.` }
  }
  return { fund }
}

/** Was /reflect hilfe sagt: was /reflect versteht, dieselben Befehle mit eigenen Namen, und wie es in diesem Chat steht. */
async function hilfe($: EngineInterface) {
  const jetzt = await einstellungen($, await $.session.id())
  const zeile = (b: (typeof REFLECT_BEFEHLE)[number]) => `/${kurzform(b.name) ?? b.name}${b.argumentHint ? ` ${b.argumentHint}` : ''} · ${b.description}`
  return [
    '/reflect · Selbstkritik und Regeln des Leitstands',
    'Was: /reflect allein startet eine Selbstkritik: Claude prüft seine bisherige Arbeit im Hintergrund, ein Modellaufruf, der den ganzen Chat liest. Dahinter geht ein Schwerpunkt oder zeigen, regeln, speichern <Nr> [global|projekt|chat], verwerfen <Nr>, pruefung an|aus und auto an|aus.',
    'Dieselben Befehle mit eigenen Namen, jeder auch mit leitstand: davor und mit hilfe dahinter:',
    ...REFLECT_BEFEHLE.map(zeile),
    'merke: <Regel> · am Anfang einer Nachricht: schlägt diese Regel vor, ohne Modellaufruf',
    '',
    `In diesem Chat: Korrekturen prüfen ist ${jetzt.pruefung ? 'an' : 'aus'}, Selbstkritik nach Dateiänderungen ist ${jetzt.selbstkritikAuto ? 'an' : 'aus'}.`,
    'Gilt: nur in diesem Chat. Standard für neue Chats: Optionen "Regeln: Korrekturen prüfen" und "Selbstkritik nach Dateiänderungen", siehe /leitstand:hilfe unter Einstellen.',
  ].join('\n')
}

/** Startet eine Selbstkritik; vom Handy ohne Fenster, dort holt der Befehl zum Zeigen sie als Text. */
async function befehlStart($: EngineInterface, schwerpunkt: string, v: Verweise, handy: boolean) {
  const sauber = schwerpunkt.replace(/\s+/g, ' ').trim().slice(0, MAX_SCHWERPUNKT)
  const id = await starteReflexion($, sauber, 'befehl')
  if (!handy) oeffneFenster($)
  if (id === undefined) return `Es läuft schon eine Selbstkritik. ${v.zeigen} gibt sie aus, sobald sie fertig ist.`
  return handy
    ? `Selbstkritik läuft. Das Fenster geht nur am Rechner; ${v.zeigen} gibt das Ergebnis hier als Text aus, sobald sie fertig ist.`
    : `Selbstkritik läuft … Das Ergebnis erscheint im Fenster „Selbstkritik“; ${v.zeigen} gibt es als Text aus.`
}

async function befehlZeigen($: EngineInterface, v: Verweise, mitFenster: boolean) {
  await raeumeVerwaiste($)
  await update($, angezeigt, () => null)
  if (mitFenster) oeffneFenster($)
  const r = (await read($, reflexionen)).at(-1)
  if (r === undefined) return `Noch keine Selbstkritik. ${v.starten} startet eine.`
  if (r.status === 'laeuft') return `Die Selbstkritik läuft noch (seit ${uhrzeit(r.at)}). Gleich noch einmal ${v.zeigen}.`
  if (r.status === 'fehlgeschlagen') return `${kopfzeile(r)}: fehlgeschlagen. ${r.hinweis ?? ''}`.trim()
  return `${kopfzeile(r)}\n\n${r.text}`
}

/** Die wartenden Regeln als Text; am Rechner öffnet sich dazu das Fenster Regeln, vom Handy nicht. */
async function befehlRegeln($: EngineInterface, v: Verweise, e: Pick<CommandRunInput, 'origin'>) {
  const offen = await offeneRegeln($)
  await update($, nummern, () => offen.map(l => l.id))
  const chat = await chatRegeln($, await $.session.id())
  const zeilen: string[] = []
  if (offen.length === 0) zeilen.push('Keine wartenden Regeln.')
  else {
    zeilen.push(`Wartende Regeln (${offen.length}):`)
    offen.forEach((l, i) => {
      zeilen.push(`${i + 1}. „${l.rule}“${l.count > 1 ? ` ×${l.count}` : ''} · Vorschlag: ${zielName(l.scope)}`)
    })
    zeilen.push(v.speichern)
  }
  if (chat.length > 0) zeilen.push('', 'Nur in diesem Chat gilt:', ...chat.map(r => `- ${r}`))
  if (!vomHandy(e)) oeffneRegeln($)
  return zeilen.join('\n')
}

/** /reflect speichern <Nr> [Ziel]: ohne Ziel der Vorschlag. */
async function befehlSpeichern($: EngineInterface, rest: string[]) {
  const gefunden = await regelNr($, rest[0], REFLECT)
  if ('fehler' in gefunden) return `${gefunden.fehler} Dann /reflect speichern <Nr> [global|projekt|chat].`
  const zielWort = rest[1]
  const ziel = zielWort === undefined ? gefunden.fund.scope : zielAus(zielWort)
  if (ziel === undefined) return `Ziel „${zielWort ?? ''}“ kenne ich nicht: global, projekt oder chat.`
  return speichere($, gefunden.fund.id, ziel)
}

async function befehlVerwerfen($: EngineInterface, rest: string[]) {
  const gefunden = await regelNr($, rest[0], REFLECT)
  if ('fehler' in gefunden) return `${gefunden.fehler} Dann /reflect verwerfen <Nr>.`
  return verwerfe($, gefunden.fund.id)
}

async function befehlPruefung($: EngineInterface, wort: string | undefined, v: Verweise) {
  const sid = await $.session.id()
  const wert = anAus(wort)
  if (wert === undefined) {
    const jetzt = (await einstellungen($, sid)).pruefung
    return `Korrekturen prüfen ist in diesem Chat ${jetzt ? 'an' : 'aus'}. Umschalten: ${v.pruefung} (gilt nur für diesen Chat).`
  }
  await setzeEinstellung($, sid, 'pruefung', wert)
  if (!wert) queue.length = 0
  return wert
    ? `Korrekturen prüfen ist in diesem Chat an: Kurze Nachrichten gehen an ${modell}, ein kleiner Aufruf je Nachricht. Andere Chats behalten ihre Einstellung.`
    : 'Korrekturen prüfen ist in diesem Chat aus; merke: <Regel> geht weiter. Andere Chats behalten ihre Einstellung; den Standard für neue Chats zeigt /leitstand:hilfe unter Einstellen.'
}

async function befehlAuto($: EngineInterface, wort: string | undefined, v: Verweise) {
  const sid = await $.session.id()
  const wert = anAus(wort)
  if (wert === undefined) {
    const jetzt = (await einstellungen($, sid)).selbstkritikAuto
    return `Automatische Selbstkritik ist in diesem Chat ${jetzt ? 'an' : 'aus'}. Umschalten: ${v.auto} (gilt nur für diesen Chat).`
  }
  await setzeEinstellung($, sid, 'selbstkritikAuto', wert)
  return wert
    ? 'Automatische Selbstkritik ist in diesem Chat an: Nach jeder Runde mit Dateiänderungen läuft eine Selbstkritik im Hintergrund. Andere Chats behalten ihre Einstellung.'
    : `Automatische Selbstkritik ist in diesem Chat aus. ${v.starten} startet eine von Hand.`
}

/** Verteilt /reflect auf seine Unterbefehle; alles Übrige ist der Schwerpunkt einer Selbstkritik. */
async function reflectBefehl($: EngineInterface, args: string, e: CommandRunInput): Promise<string> {
  const woerter = args.trim().split(/\s+/).filter(Boolean)
  const [erstes = '', ...rest] = woerter
  switch (erstes.toLowerCase()) {
    case '':
      return befehlStart($, '', REFLECT, false)
    case 'zeigen':
      return befehlZeigen($, REFLECT, true)
    case 'regeln':
      return befehlRegeln($, REFLECT, e)
    case 'speichern':
      return befehlSpeichern($, rest)
    case 'verwerfen':
      return befehlVerwerfen($, rest)
    case 'pruefung':
    case 'prüfung':
      return befehlPruefung($, rest[0], REFLECT)
    case 'auto':
      return befehlAuto($, rest[0], REFLECT)
    case 'hilfe':
    case 'help':
    case '?':
      return hilfe($)
    default:
      return befehlStart($, args, REFLECT, false)
  }
}

/** Speichern, Bearbeiten, Verwerfen per Nummer: die Regel zur Nummer, oder ein Satz, warum nicht. */
async function befehlRegelNr($: EngineInterface, args: string, was: ReflectZiel | 'bearbeiten' | 'verwerfen', handy = false) {
  const nr = args.split(/\s+/)[0] ?? ''
  const gefunden = await regelNr($, nr === '' ? undefined : nr, NEU)
  if ('fehler' in gefunden) return gefunden.fehler
  if (was === 'verwerfen') return verwerfe($, gefunden.fund.id)
  if (was !== 'bearbeiten') return speichere($, gefunden.fund.id, was)
  // Vom Handy ist das Eingabefeld nicht zu sehen: Die Regel bleibt, wie sie ist, und die Antwort sagt den Weg.
  if (handy) return `Schick die Regel umformuliert neu, als merke: ${gefunden.fund.rule} Die alte verwirfst du mit /leitstand:regel-verwerfen ${nr}.`
  const wie = await bearbeite($, gefunden.fund.id)
  if (wie === 'voll') return `${FELD_VOLL}.`
  if (wie === 'abgelehnt') return 'Das Eingabefeld hat den Text nicht genommen.'
  if (wie === 'entschieden') return ENTSCHIEDEN
  return `Die Regel steht als „merke: ${gefunden.fund.rule}“ im Eingabefeld. Umformulieren und abschicken; die alte ist verworfen.`
}

/** Die neueste fertige Selbstkritik. */
async function neuesteFertige($: EngineInterface) {
  return (await read($, reflexionen)).filter(r => r.status === 'fertig').at(-1)
}

const KEINE_FERTIGE = 'Noch keine fertige Selbstkritik. /leitstand:selbstkritik startet eine.'

async function befehlBeheben($: EngineInterface) {
  const r = await neuesteFertige($)
  if (r === undefined) return KEINE_FERTIGE
  return (await uebergib($, r.id)) ?? KEINE_FERTIGE
}

async function befehlKopieren($: EngineInterface, e: CommandRunInput) {
  const r = await neuesteFertige($)
  if (r === undefined) return KEINE_FERTIGE
  if (vomHandy(e)) return `Kopieren geht nur am Rechner. Hier ist die Selbstkritik zum Kopieren:\n\n${kopfzeile(r)}\n\n${r.text}`
  return (await kopiere($, r.id, undefined)) ?? KEINE_FERTIGE
}

/** Die Wirkung der Befehle, je wie ihr Knopf; zurück kommt die Antwort. */
async function befehlAus($: EngineInterface, name: string, args: string, e: CommandRunInput): Promise<string> {
  switch (name) {
    case 'leitstand:selbstkritik':
      return befehlStart($, args, NEU, vomHandy(e))
    case 'leitstand:selbstkritik-zeigen':
      return befehlZeigen($, NEU, !vomHandy(e))
    case 'leitstand:selbstkritik-beheben':
      return befehlBeheben($)
    case 'leitstand:selbstkritik-kopieren':
      return befehlKopieren($, e)
    case 'leitstand:selbstkritik-auto-an':
      return befehlAuto($, 'an', NEU)
    case 'leitstand:selbstkritik-auto-aus':
      return befehlAuto($, 'aus', NEU)
    case 'leitstand:regeln':
      return befehlRegeln($, NEU, e)
    case 'leitstand:regel-global':
      return befehlRegelNr($, args, 'global')
    case 'leitstand:regel-projekt':
      return befehlRegelNr($, args, 'project')
    case 'leitstand:regel-chat':
      return befehlRegelNr($, args, 'chat')
    case 'leitstand:regel-bearbeiten':
      return befehlRegelNr($, args, 'bearbeiten', vomHandy(e))
    case 'leitstand:regel-verwerfen':
      return befehlRegelNr($, args, 'verwerfen')
    case 'leitstand:regelpruefung-an':
      return befehlPruefung($, 'an', NEU)
    case 'leitstand:regelpruefung-aus':
      return befehlPruefung($, 'aus', NEU)
    default:
      return BEFEHL_FEHLER
  }
}

/** Jede Kurzform (/selbstkritik) mit dem vollen Namen ihres Befehls (/leitstand:selbstkritik). */
const KURZFORMEN: ReadonlyMap<string, string> = new Map(
  REFLECT_BEFEHLE.flatMap(b => {
    const kurz = kurzform(b.name)
    return kurz === undefined ? [] : [[kurz, b.name] as const]
  }),
)

/** Die Antwort auf einen eigenen Befehl, lang oder kurz: mit hilfe (oder ?) seine Hilfe, sonst seine Wirkung. */
async function antwort($: EngineInterface, e: CommandRunInput): Promise<string> {
  const name = KURZFORMEN.get(e.command) ?? e.command
  const eintrag = REFLECT_BEFEHLE.find(b => b.name === name)
  if (eintrag === undefined) return BEFEHL_FEHLER
  const args = e.args ?? ''
  if (fragtNachHilfe(args)) return befehlsHilfe(eintrag)
  try {
    return await befehlAus($, name, args.trim(), e)
  } catch {
    return BEFEHL_FEHLER
  }
}

// ---------------------------------------------------------------------------
// Die Hooks
// ---------------------------------------------------------------------------

/*
 * Der Leitstand hängt ohne Matcher an session.start, prompt.compose, turn.start und turn.complete (auch an
 * prompt.submit und tool.call). Ein zweiter Hook desselben Mods ohne Matcher wäre eine Wiederholung, die Engine und
 * Prüfer ablehnen. Darum hat hier jeder Hook einen Matcher: wo er nur bestimmte Fälle braucht, genau diese (Nachrichten
 * der Person, Werkzeuge, die Dateien ändern), sonst einen, der auf jedes e passt.
 */
/** Passt auf jeden Text. */
const JEDER_TEXT = /^/

/**
 * Meldet Selbstkritik und Regeln (früher der Mod Reflect) an; options mit den Namen, die der Mod Reflect hatte
 * (pruefung, selbstkritikAuto, modell). Beantwortet seine Befehle (lang und kurz) in einem eigenen command.run-Hook;
 * angemeldet werden die Kurzformen vom Leitstand, den Grundbefehl /reflect meldet der Teil selbst an.
 */
export function registerReflect(on: On, options: PluginOptions): void {
  if (typeof options.modell === 'string' && options.modell.trim() !== '') modell = options.modell.trim()
  standard = {
    pruefung: options.pruefung !== false,
    selbstkritikAuto: options.selbstkritikAuto === true,
  }

  // Jeder Start, mit Oberfläche oder ohne.
  on('session.start', { isInteractive: [true, false] }, async ($, e, next) => {
    await $.command
      .register({
        name: 'reflect',
        description: 'Selbstkritik der bisherigen Arbeit; dazu Regeln: zeigen, regeln, speichern, verwerfen, pruefung, auto, hilfe (Leitstand)',
        argumentHint: '[Schwerpunkt | zeigen | regeln | hilfe]',
        immediate: true,
      })
      .catch(() => undefined)
    // Ein Neuladen beginnt das Modul von vorn: Was noch als laufend gilt, kommt nie mehr an.
    try {
      if ((await read($, reflexionen)).some(r => r.status === 'laeuft')) {
        await update($, reflexionen, l =>
          l.map(r => (r.status === 'laeuft' ? { ...r, status: 'fehlgeschlagen' as const, hinweis: NEULADEN } : r)),
        )
      }
      await raeumeAuf($, await $.session.id(), await $.clock.now())
      await aktualisiereRegeln($)
    } catch {
      // Aufräumen darf den Start nie aufhalten.
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Nur die eigenen Nachrichten der Person. Hier nur billige Prüfungen: Die Nachricht geht sofort weiter, die Arbeit
  // läuft auf einem Timer.
  on('prompt.submit', { origin: { kind: HUMAN } }, ($, e, next) => {
    const text = e.text.trim()
    const isCandidate =
      !text.startsWith('/') &&
      !isTrivial(text) &&
      (text.length <= MAX_PROMPT || explizit(text) !== undefined) &&
      !looksSecret(text)
    if (isCandidate && queue.length < MAX_QUEUE) {
      queue.push(text)
      $.clock.after(0, () => void drain($).catch(() => undefined))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', { turnId: JEDER_TEXT }, ($, e, next) => {
    if (e.agentId === undefined) geaendert = false
    return next(e)
  }).catch(($, e, next) => next(e))

  // Nur die Werkzeuge, die Dateien ändern: mitzählen, nie aufhalten, nie ändern.
  on('tool.call', { tool: AENDERER }, ($, e, next) => {
    if (e.agentId === undefined) geaendert = true
    return next(e)
  }).catch(($, e, next) => next(e))

  // Jedes Rundenende, abgebrochen oder nicht.
  on('turn.complete', { isAborted: [true, false] }, async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) return r
    const warGeaendert = geaendert
    geaendert = false
    try {
      // Eine andere Sitzung kann Regeln gefunden oder entschieden haben: zeigen, was der Store jetzt hält.
      await aktualisiereRegeln($)
      await raeumeVerwaiste($)
      if (warGeaendert && !e.isAborted && e.reason === 'answer' && (await einstellungen($, await $.session.id())).selbstkritikAuto) {
        if ((await starteReflexion($, '', 'auto')) !== undefined) oeffneFenster($)
      }
    } catch {
      // Die Runde ist fertig, was hier schiefgeht, bleibt hier.
    }
    return r
  }).catch(($, e, next) => next(e))

  // Ein Fehler hier darf nie die Abschnitte des Leitstands kosten: dann bleibt, was darunter zusammenkam.
  on('prompt.compose', { model: JEDER_TEXT }, async ($, e, next) => {
    const composed = await next(e)
    let saved: ReflectGespeichert[]
    let chat: string[]
    try {
      const gespeicherte = await read($, gespeichert)
      const root = gespeicherte.length === 0 ? '' : await $.session.root()
      saved = gespeicherte.filter(r => r.scope === 'global' || r.project === root)
      chat = await chatRegeln($, await $.session.id())
    } catch {
      return composed
    }
    if (saved.length === 0 && chat.length === 0) return composed
    const sections = [...composed.sections]
    if (saved.length > 0) {
      const text = ['Regeln, die die Person in dieser Sitzung gespeichert hat (sie stehen auch in CLAUDE.md; befolge sie):', ...saved.map(r => `- ${r.rule}`)].join('\n')
      sections.push({ id: 'leitstand:regeln-gespeichert', text, scope: 'session' })
    }
    if (chat.length > 0) {
      const text = ['Regeln, die die Person nur für diesen Chat festgelegt hat (befolge sie in diesem Chat):', ...chat.map(r => `- ${r}`)].join('\n')
      sections.push({ id: 'leitstand:regeln-chat', text, scope: 'session' })
    }
    return { sections }
  }).catch(($, e, next) => next(e))

  // Der Grundbefehl /reflect mit seinen Unterbefehlen wie bisher. Seine Antwort bekommt, wie die der neuen Befehle,
  // „(gemeldet vom Mod Leitstand)“ in ihrer gespeicherten Zeile: Das macht der session.append-Hook des Leitstands.
  on('command.run', { command: 'reflect' }, async ($, e) => {
    let text: string
    try {
      text = await reflectBefehl($, e.args ?? '', e)
    } catch {
      text = REFLECT_FEHLER
    }
    merkeAntwort(text)
    return { text }
  }).catch(() => {
    merkeAntwort(REFLECT_FEHLER)
    return { text: REFLECT_FEHLER }
  })

  // Die Befehle /leitstand:selbstkritik … und ihre Kurzformen (/selbstkritik …). Die alten Namen (/reflect-zeigen)
  // beantwortet der Leitstand selbst mit dem neuen Namen.
  on('command.run', { command: [...REFLECT_BEFEHLE.map(b => b.name), ...KURZFORMEN.keys()] }, async ($, e) => {
    const text = await antwort($, e)
    merkeAntwort(text)
    return { text }
  }).catch(() => {
    merkeAntwort(BEFEHL_FEHLER)
    return { text: BEFEHL_FEHLER }
  })

  // Der Knopf 🪞 des Leitstands. Ein Befehl, den der Leitstand selbst ausführt, erreicht seine eigenen Hooks nicht;
  // deshalb beantwortet der Teil den Druck hier und startet die Selbstkritik sofort, auch mitten in einer Runde.
  on('ui.press', { plugin: 'leitstand', element: 'reflect' }, async ($, e) => {
    const id = await starteReflexion($, '', 'befehl')
    oeffneFenster($)
    if (id === undefined) $.ui.toast('Es läuft schon eine Selbstkritik; das Fenster zeigt sie, sobald sie fertig ist.')
    return { element: e.element }
  }).catch(($, e, next) => next(e))

  // Das Fenster „Regeln“: alle wartenden Regeln, je mit den drei Zielen, Bearbeiten und Verwerfen.
  on('ui.render', { component: 'Pane', requestId: REGELN_PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, wartend)
    const schliessen = <Button key="schliessen" label="Schließen" onPress={() => $.ui.close({ id: REGELN_PANE })} />
    if (list.length === 0) {
      return (
        <Box flexDirection="column" rowGap={1}>
          <Text dimColor>Keine wartenden Regeln.</Text>
          <Box flexDirection="row">{schliessen}</Box>
        </Box>
      )
    }
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text wrap="wrap">{REGELN_FRAGE}</Text>
        <Text dimColor wrap="wrap">
          {REGELN_ZIELE}
        </Text>
        {list.map(l => (
          <Box key={`zeile:${l.id}`} flexDirection="column">
            <Text color="green" wrap="wrap">
              {`💡 „${l.rule}“${l.count > 1 ? ` ×${l.count}` : ''}`}
            </Text>
            <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1.2}>
              {ZIELE.map(z => (
                <Button
                  key={`${z.key}:${l.id}`}
                  label={z.label}
                  {...(z.ziel === l.scope ? { variant: 'primary' as const } : {})}
                  onPress={() => speichere($, l.id, z.ziel).then(satz => $.ui.toast(satz))}
                />
              ))}
              <Button key={`bearbeiten:${l.id}`} label="Bearbeiten" onPress={() => bearbeite($, l.id)} />
              <Button key={`verwerfen:${l.id}`} label="Verwerfen" onPress={() => verwerfe($, l.id)} />
            </Box>
          </Box>
        ))}
        <Box flexDirection="row">{schliessen}</Box>
      </Box>
    )
  })

  // Das Fenster „Selbstkritik“: die neueste (oder die gewählte), mit Beheben, Kopieren und Blättern.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const liste = await read($, reflexionen)
    const gewaehlt = await read($, angezeigt)
    const schliessen = <Button key="schliessen" label="Schließen" onPress={() => $.ui.close({ id: PANE })} />
    if (liste.length === 0) {
      return (
        <Box flexDirection="column" rowGap={1}>
          <Text dimColor>Noch keine Selbstkritik. /leitstand:selbstkritik startet eine.</Text>
          <Box flexDirection="row">{schliessen}</Box>
        </Box>
      )
    }
    const gefunden = gewaehlt === null ? -1 : liste.findIndex(r => r.id === gewaehlt)
    const i = gefunden < 0 ? liste.length - 1 : gefunden
    const r = liste[i] as ReflectReflexion
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text dimColor wrap="wrap">{`${kopfzeile(r)} · ${i + 1}/${liste.length}`}</Text>
        {r.status === 'laeuft' && <Text dimColor wrap="wrap">Selbstkritik läuft … Claude liest den bisherigen Chat noch einmal kritisch.</Text>}
        {r.status === 'fehlgeschlagen' && <Text wrap="wrap">{`Fehlgeschlagen: ${r.hinweis ?? 'ohne Grund'}`}</Text>}
        {r.status === 'fertig' && <Markdown key="selbstkritik" text={r.text} />}
        <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1.2}>
          {r.status === 'fertig' && <Button key="beheben" label="Claude soll das beheben" variant="primary" onPress={() => uebergib($, r.id)} />}
          {r.status === 'fertig' && <Button key="kopieren" label="Kopieren" onPress={press => kopiere($, r.id, press.surface)} />}
          {i > 0 && <Button key="aeltere" label="← Ältere" onPress={() => blaettere($, -1)} />}
          {i < liste.length - 1 && <Button key="neuere" label="Neuere →" onPress={() => blaettere($, 1)} />}
          {schliessen}
        </Box>
      </Box>
    )
  })
}
