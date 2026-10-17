// Finds and masks secrets and personal details.
// Patterns adapted from Nate Herk's Recording Mode (MIT licence):
// https://github.com/nateherkai/claude-code-mods

const DOTS = '••••••••'

const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{16,}/g,
  /\bsk-(?:proj-|live-|test-|svcacct-)?[A-Za-z0-9_-]{20,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\b(?:hf|r8|pk_live|sk_live|rk_live|whsec|pat|key)_[A-Za-z0-9]{20,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
]

// NAME=value or "name": "value" where the name looks like a credential.
// The keyword ends the name or meets a separator, so "author:" and "tokens:" are not credentials.
// German names too: DB_PASSWORT=…, Kennwort: …, Zugangsdaten: …, API_SCHLUESSEL=….
const ASSIGNMENT =
  /\b([A-Za-z0-9_.-]*(?:API[_-]?KEY|AUTH[_-]?TOKEN|ACCESS[_-]?TOKEN|CLIENT[_-]?SECRET|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|SECRET|TOKEN|PASSWORD|PASSWD|PASSWORT|KENNWORT|ZUGANGSDATEN|SCHLÜSSEL|SCHLUESSEL|AUTH)(?:[_.-][A-Za-z0-9_.-]*)?)(["']?\s*[=:]\s*["']?)([^\s"'`,;}{]{6,})/gi

// "my password is X", "mein Passwort ist X", "das WLAN-Kennwort lautet X", "meine PIN ist 4821", "ο κωδικός μου είναι X".
// A German word may stand at the end of a compound (Datenbankpasswort, Lizenzschlüssel).
const PHRASE =
  /(?<!\p{L})((?:password|passcode|passphrase|pin|\p{L}*passw(?:ort|örter)|\p{L}*kennw(?:ort|örter)|\p{L}*zugangsdaten|\p{L}*schl(?:ü|ue)ssel|κωδικ[όο]ς(?: πρόσβασης)?|συνθηματικ[όο])(?:\s+(?:μου|is|my))?\s*(?:ist|lautet|heißt|heisst|is|είναι|ειναι|=|:)\s*["']?)([^\s"']{4,})/giu

// "IBAN: DE89 3704 0044 0532 0130 00", in any case and with its spaces, so no group of it stays in view.
const IBAN_PHRASE = /(?<!\p{L})(iban(?:\s*(?:ist|lautet|is|=|:))?\s*["']?)([a-z]{2}\d{2}(?: ?[a-z0-9]{4}){2,7}(?: ?[a-z0-9]{1,3})?)(?![\p{L}\d])/giu

/** A plain word after "auth:" or "OAuth:" is a setting; a key has a digit, a symbol or length. */
const isCredential = (name: string, value: string) =>
  /pass|secret|kennw/i.test(name) || /[^\p{L}_-]/u.test(value) || value.length >= 16

/**
 * "PIN: optional", "ο κωδικός: γράψε" and "Schlüssel ist verloren" are prose: a PIN is digits, a bare κωδικός (code), a
 * Schlüssel (key) or Zugangsdaten (login) need more than letters.
 */
const isPhraseSecret = (head: string, value: string) => {
  const word = head.toLowerCase()
  if (/^pin(?!\p{L})/u.test(word)) return /^\d{4,}$/.test(value)
  if (/^κωδικ/u.test(word) && !/πρόσβασης|μου/u.test(word)) return /[^\p{L}]/u.test(value)
  if (/^\p{L}*(?:schlüssel|schluessel|zugangsdaten)/u.test(word)) return /[^\p{L}]/u.test(value)
  return true
}

const matches = (re: RegExp, text: string) => [...text.matchAll(new RegExp(re.source, re.flags))]

const CARD = /(?<![\w-])(?:4\d{3}|5[1-5]\d{2}|2[2-7]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))(?:[ -]?\d{2,4}){3,4}(?![\w-])/g
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
const PHONE = /(?<![\w.])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w.])/g
const PHONE_INTL = /(?<![\w.])\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}(?![\w.])/g

function luhn(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

function isCard(match: string): boolean {
  const digits = match.replace(/\D/g, '')
  return digits.length >= 13 && digits.length <= 19 && luhn(digits)
}

/** What kinds of secret a message holds, as the guard names them (accusative): passwords, keys, card or bank numbers. */
export function findSecrets(text: string): string[] {
  const kinds = new Set<string>()
  if (SECRET_PATTERNS.some(re => new RegExp(re.source, re.flags).test(text))) kinds.add('einen Schlüssel oder ein Token')
  if (matches(ASSIGNMENT, text).some(m => isCredential(m[1]!, m[3]!))) kinds.add('ein Passwort oder einen Schlüssel')
  if (matches(PHRASE, text).some(m => isPhraseSecret(m[1]!, m[2]!))) kinds.add('ein Passwort')
  if ((text.match(CARD) ?? []).some(isCard)) kinds.add('eine Kartennummer')
  if (new RegExp(IBAN.source, IBAN.flags).test(text) || new RegExp(IBAN_PHRASE.source, IBAN_PHRASE.flags).test(text)) {
    kinds.add('eine Kontonummer')
  }

  return [...kinds]
}

/** Masks secrets and personal details for the screen; what Claude reads is unchanged. */
export function maskPrivate(text: string): string {
  let out = text
  for (const re of SECRET_PATTERNS) out = out.replace(re, DOTS)
  out = out.replace(ASSIGNMENT, (match, name: string, sep: string, value: string) =>
    isCredential(name, value) ? name + sep + DOTS : match,
  )
  out = out.replace(PHRASE, (match, head: string, value: string) => (isPhraseSecret(head, value) ? head + DOTS : match))
  out = out.replace(IBAN_PHRASE, (_match, head: string) => `${head}•••`)
  out = out.replace(CARD, match => (isCard(match) ? '•••• •••• •••• ••••' : match))
  out = out.replace(IBAN, '•••')
  out = out.replace(EMAIL, '•••@•••')
  out = out.replace(PHONE, '•••-•••-••••')
  out = out.replace(PHONE_INTL, '+•• •••')

  return out
}

/** Every string in a value, however deep, through `change`; its shape stays, and so does the value when nothing changed. */
export function mapStrings(value: unknown, change: (text: string) => string): unknown {
  if (typeof value === 'string') return change(value)
  if (Array.isArray(value)) {
    const out = value.map(one => mapStrings(one, change))
    return out.every((one, index) => one === value[index]) ? value : out
  }
  if (value !== null && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return value
    let isChanged = false
    const out: Record<string, unknown> = {}
    for (const [key, one] of Object.entries(value)) {
      const changed = mapStrings(one, change)
      if (changed !== one) isChanged = true
      out[key] = changed
    }
    return isChanged ? out : value
  }
  return value
}

/** Masks every string in a tool's input or result for the screen and keeps its shape; the same value when nothing changed. */
export const maskDeep = (value: unknown): unknown => mapStrings(value, maskPrivate)

/** A secret found in the chat, under the name it gets in the .env. */
export type Secret = { name: string; value: string }

// Known key prefixes and the names such keys usually go by in a .env; sk-ant- before sk-.
const KEY_NAMES: [RegExp, string][] = [
  [/^sk-ant-/, 'ANTHROPIC_API_KEY'],
  [/^(?:(?:ghp|gho|ghu|ghs|ghr)_|github_pat_)/, 'GITHUB_TOKEN'],
  [/^AKIA/, 'AWS_ACCESS_KEY_ID'],
  [/^AIza/, 'GOOGLE_API_KEY'],
  [/^xox/, 'SLACK_TOKEN'],
  [/^sk-/, 'OPENAI_API_KEY'],
  [/^eyJ/, 'JWT'],
  [/^Bearer\s/i, 'BEARER_TOKEN'],
  [/^-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'PRIVATE_KEY'],
]

// What a credential-looking name in code is set to rather than a secret: a type, a literal, a reference, a filler.
const NOT_A_SECRET = [
  /^(?:string|number|boolean|bigint|object|any|unknown|undefined|null|none|nil|true|false|str|int|bool)$/i,
  /^<.*>$/,
  /^\{\{.*\}\}$/,
  /^\$\{.*\}$/,
  /^\$[A-Za-z_]/,
  /^%[A-Za-z_]\w*%$/,
  /^(?:process\.env|import\.meta\.env|os\.environ)\b/,
  // A member path (e.props.token) or a call (getToken()).
  /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/,
  /^[A-Za-z_$][\w$.]*\(/,
  /^[x*•._-]+$/i,
]
const isNotSecret = (value: string) => NOT_A_SECRET.some(re => re.test(value))

/** A name as a .env key: upper case, umlauts spelled out, anything else an underscore; '' when nothing is left. */
export function envName(raw: string): string {
  const name = raw
    .toUpperCase()
    .replace(/Ä/g, 'AE')
    .replace(/Ö/g, 'OE')
    .replace(/Ü/g, 'UE')
    .replace(/ẞ/g, 'SS')
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return name === '' ? '' : /^\d/.test(name) ? `GEHEIMNIS_${name}` : name
}

/**
 * The real secrets in a text, each under a .env name: keys and tokens, password assignments and sentences, card
 * numbers and IBANs. Email addresses and phone numbers stay: the screen masks those. A value counts once; a name
 * taken twice gets _2, _3. Several texts (a chat's messages) are read each on its own.
 */
export function extractSecrets(texts: string | readonly string[]): Secret[] {
  const found: Secret[] = []
  for (const text of typeof texts === 'string' ? [texts] : texts) scanSecrets(text, found)

  return found
}

/** Adds the secrets of one text to `found`; a part of the text one kind took is not looked at again. */
function scanSecrets(text: string, found: Secret[]) {
  const spans: [number, number][] = []
  const add = (name: string, value: string, start: number, end: number) => {
    if (spans.some(([from, to]) => start < to && from < end)) return
    spans.push([start, end])
    const clean = value.replace(/\r\n/g, '\n')
    if (found.some(one => one.value === clean)) return
    let unique = name
    for (let count = 2; found.some(one => one.name === unique); count += 1) unique = `${name}_${count}`
    found.push({ name: unique, value: clean })
  }
  for (const m of matches(ASSIGNMENT, text)) {
    const [, name = '', sep = '', value = ''] = m
    if (!isCredential(name, value) || isNotSecret(value)) continue
    const start = m.index + name.length + sep.length
    add(envName(name) || 'GEHEIMNIS', value, start, start + value.length)
  }
  for (const m of matches(PHRASE, text)) {
    const [, head = '', said = ''] = m
    // A sentence's own punctuation is not part of the password: "Das Passwort ist sonne2024." gives sonne2024.
    const value = said.replace(/[.,;:)\]}]+$/, '')
    if (value.length < 4 || !isPhraseSecret(head, value) || isNotSecret(value)) continue
    // The head word, with the start of a compound before it: "WLAN-Kennwort" names WLAN_KENNWORT.
    const word = /^\p{L}+/u.exec(head)?.[0] ?? ''
    const compound = /(?:[\p{L}\d]+-)+$/u.exec(text.slice(0, m.index))?.[0] ?? ''
    const start = m.index + head.length
    add(envName(compound + word) || 'GEHEIMNIS', value, start, start + value.length)
  }
  for (const re of SECRET_PATTERNS) {
    for (const m of matches(re, text)) {
      const match = m[0]
      // A private key cut off before its end line is no key one can use.
      if (/^-----BEGIN/.test(match) && !/-----END [A-Z ]*PRIVATE KEY-----$/.test(match)) continue
      const value = match.replace(/^Bearer\s+/i, '')
      add(KEY_NAMES.find(([prefix]) => prefix.test(match))?.[1] ?? 'GEHEIMNIS', value, m.index, m.index + match.length)
    }
  }
  for (const m of matches(CARD, text)) {
    if (isCard(m[0])) add('KARTENNUMMER', m[0], m.index, m.index + m[0].length)
  }
  for (const m of matches(IBAN_PHRASE, text)) {
    const [, head = '', value = ''] = m
    add('IBAN', value, m.index + head.length, m.index + head.length + value.length)
  }
  for (const m of matches(IBAN, text)) add('IBAN', m[0], m.index, m.index + m[0].length)
}

/** The text with each secret's value, also as written without spaces or with CRLF, as its placeholder `${NAME}`. */
export function replaceSecrets(text: string, secrets: readonly Secret[]): string {
  const pairs = secrets.flatMap(({ name, value }) =>
    [...new Set([value, value.replace(/\n/g, '\r\n'), value.replace(/\s+/g, '')])]
      .filter(form => form.length >= 4)
      .map(form => [form, `\${${name}}`] as const),
  )
  pairs.sort((a, b) => b[0].length - a[0].length)
  let out = text
  for (const [form, placeholder] of pairs) out = out.split(form).join(placeholder)
  return out
}

/** The KEY=VALUE entries of a .env, values unquoted; a quoted value may run over several lines. */
export function parseEnv(text: string): Map<string, string> {
  const entries = new Map<string, string>()
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(lines[index] ?? '')
    if (!m) continue
    const key = m[1] ?? ''
    let raw = m[2] ?? ''
    const quote = raw[0]
    if (quote === '"' || quote === "'" || quote === '`') {
      const closing = quote === '"' ? /^((?:[^"\\]|\\[\s\S])*)"/ : new RegExp(`^([^${quote}]*)${quote}`)
      let body = raw.slice(1)
      let closed = closing.exec(body)
      while (!closed && index + 1 < lines.length) {
        index += 1
        body += `\n${lines[index] ?? ''}`
        closed = closing.exec(body)
      }
      const inner = closed ? (closed[1] ?? '') : body
      raw =
        quote === '"'
          ? inner.replace(/\\([\s\S])/g, (_match, one: string) => (one === 'n' ? '\n' : one === 'r' ? '\r' : one === 't' ? '\t' : one))
          : inner
    } else {
      raw = raw.replace(/\s+#.*$/, '').trim()
    }
    entries.set(key, raw)
  }
  return entries
}

/** A value as a .env writes it: in double quotes, with escapes, when it holds a space, #, =, a quote or a line break. */
export function envValue(value: string): string {
  const clean = value.replace(/\r\n/g, '\n')
  if (!/[\s#="'`]/.test(clean)) return clean
  return `"${clean.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`
}

/**
 * The .env with these secrets added: a value already in it keeps its key, a key already in it is never overwritten
 * (the new one gets _2, _3), and the new entries follow a line saying where they came from. `secrets` carry the names
 * as the .env now has them; `text` is `existing` when nothing was added.
 */
export function mergeEnv(existing: string, secrets: readonly Secret[], date: string): { text: string; secrets: Secret[] } {
  const eol = existing.includes('\r\n') ? '\r\n' : '\n'
  const entries = parseEnv(existing)
  const byValue = new Map<string, string>()
  for (const [key, value] of entries) if (!byValue.has(value)) byValue.set(value, key)
  const taken = new Set(entries.keys())
  const named: Secret[] = []
  const lines: string[] = []
  for (const { name, value } of secrets) {
    const clean = value.replace(/\r\n/g, '\n')
    const known = byValue.get(clean)
    if (known !== undefined) {
      named.push({ name: known, value: clean })
      continue
    }
    let unique = name
    for (let count = 2; taken.has(unique); count += 1) unique = `${name}_${count}`
    taken.add(unique)
    byValue.set(clean, unique)
    named.push({ name: unique, value: clean })
    lines.push(`${unique}=${envValue(clean)}`)
  }
  if (lines.length === 0) return { text: existing, secrets: named }
  let text = existing
  if (text !== '' && !text.endsWith('\n')) text += eol
  if (text.trim() !== '') text += eol
  text += [`# Aus dem Chat übernommen von GlanceFlow am ${date}`, ...lines].join(eol) + eol
  return { text, secrets: named }
}

/** The .gitignore with a line '.env' added, or null when it already ignores the .env; a missing one is made. */
export function gitignoreWithEnv(existing: string | null): string | null {
  if (existing === null) return '.env\n'
  if (existing.split(/\r?\n/).some(line => line.trim() === '.env' || line.trim() === '/.env')) return null
  const eol = existing.includes('\r\n') ? '\r\n' : '\n'
  return `${existing}${existing === '' || existing.endsWith('\n') ? '' : eol}.env${eol}`
}
