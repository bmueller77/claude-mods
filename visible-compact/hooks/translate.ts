import { segments } from './chunk'

/** What the model is told: German prose, everything technical as it was. */
export const TRANSLATE_SYSTEM = [
  'Du übersetzt einen Ausschnitt aus einem Chat zwischen einer Person und Claude ins Deutsche.',
  'Gib nur die Übersetzung zurück, zwischen <uebersetzung> und </uebersetzung>, ohne Einleitung und ohne Anmerkungen.',
  'Behalte die Markdown-Formatierung bei: Überschriften, Listen, Fettdruck, Links.',
  'Lass unverändert: Platzhalter wie @@CODE1@@ (jeden genau einmal, an seiner Stelle), Inline-Code in Backticks,',
  'Dateipfade, Befehle, Namen von Werkzeugen, Funktionen und Variablen, Zahlen und Zitate in anderen Sprachen.',
  'Was schon Deutsch ist, übernimmst du wörtlich. Sprich die Person mit du an.',
].join(' ')

/** Words that mostly mark English prose; ones German shares (in, so, was, will, an, man) are left out. */
const ENGLISH = new Set(
  'the and is are to of that this it with for you be on not have has we what which would should can from as at by or if but they there their all do does when then than into about my your our i been were these those'.split(
    ' ',
  ),
)
/** Words that mostly mark German prose. */
const GERMAN = new Set(
  'der die das und ist sind zu den dem des ein eine einen einem einer nicht mit für auf ich du wir sie es im von auch sich dass wie aber oder wenn noch nur mal bitte hast habe hat kann wird schon jetzt dann bei aus nach über mir dir mich dich soll sollte kein keine doch ja nein hier'.split(
    ' ',
  ),
)

/** A chunk's prose: without code blocks, inline code and the markers before tool calls and results. */
export const proseOf = (text: string): string =>
  segments(text)
    .filter(s => s.fence === undefined)
    .map(s => s.text)
    .join('')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/^\[(Werkzeug: [^\]\n]*|Ergebnis[^\]\n]*)\]$/gm, ' ')

/** True when a chunk holds prose worth sending: a few words, more of them English than German. */
export const needsTranslation = (text: string): boolean => {
  const words = proseOf(text).toLowerCase().match(/[a-zäöüß]+/g) ?? []
  if (words.length < 4) return false
  const english = words.filter(w => ENGLISH.has(w)).length
  const german = words.filter(w => GERMAN.has(w)).length

  return english >= 2 && english > german
}

/** Code blocks swapped for placeholders, so the model never sees (or changes) them and no tokens go on them. */
export const maskCode = (text: string): { masked: string; blocks: string[] } => {
  const blocks: string[] = []
  const masked = segments(text)
    .map(s => {
      if (s.fence === undefined) return s.text
      blocks.push(s.text.replace(/\n$/, ''))

      return `@@CODE${blocks.length}@@${s.text.endsWith('\n') ? '\n' : ''}`
    })
    .join('')

  return { masked, blocks }
}

/** Puts the code blocks back; one the model dropped goes at the end, so nothing is lost. */
export const unmask = (text: string, blocks: readonly string[]): string => {
  const used = new Set<number>()
  const out = text.replace(/@@CODE(\d+)@@/g, (whole, n: string) => {
    const at = Number(n) - 1
    const block = blocks[at]
    if (block === undefined || used.has(at)) return whole
    used.add(at)

    return block
  })
  const missing = blocks.filter((_, at) => !used.has(at))

  return missing.length === 0 ? out : [out, ...missing].join('\n\n')
}

/** The model's answer between the tags; without them, the whole answer. Empty is no translation. */
export const readTranslation = (answer: string): string | null => {
  const tagged = /<uebersetzung>\s*([\s\S]*?)\s*(?:<\/uebersetzung>|$)/.exec(answer)
  const text = (tagged ? tagged[1]! : answer).trim()

  return text.length > 0 ? text : null
}
