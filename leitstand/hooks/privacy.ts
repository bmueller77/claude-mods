// Finds and masks secrets and personal details.
// Patterns adapted from Nate Herk's Recording Mode (MIT licence):
// https://github.com/nateherkai/claude-code-mods

const DOTS = '••••••••'

/** What stands in a message from afar (Remote Control) where the guard took a secret out; never itself a secret. */
export const REMOVED = '[Passwort entfernt]'

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
// Here and in PHRASE the value is never REMOVED: "Passwort: [Passwort entfernt]" holds no secret.
const ASSIGNMENT =
  /\b([A-Za-z0-9_.-]*(?:API[_-]?KEY|AUTH[_-]?TOKEN|ACCESS[_-]?TOKEN|CLIENT[_-]?SECRET|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|SECRET|TOKEN|PASSWORD|PASSWD|PASSWORT|KENNWORT|ZUGANGSDATEN|SCHLÜSSEL|SCHLUESSEL|AUTH)(?:[_.-][A-Za-z0-9_.-]*)?)(["']?\s*[=:]\s*["']?)(?!\[Passwort entfernt\])([^\s"'`,;}{]{6,})/gi

// "my password is X", "mein Passwort ist X", "das WLAN-Kennwort lautet X" (also "lautet: X"), "meine PIN ist 4821",
// "ο κωδικός μου είναι X".
// A German word may stand at the end of a compound (Datenbankpasswort, Lizenzschlüssel).
const PHRASE =
  /(?<!\p{L})((?:password|passcode|passphrase|pin|\p{L}*passw(?:ort|örter)|\p{L}*kennw(?:ort|örter)|\p{L}*zugangsdaten|\p{L}*schl(?:ü|ue)ssel|κωδικ[όο]ς(?: πρόσβασης)?|συνθηματικ[όο])(?:\s+(?:μου|is|my))?\s*(?:(?:ist|lautet|heißt|heisst|is|είναι|ειναι)(?:\s*[=:])?|=|:)\s*["']?)(?!\[Passwort entfernt\])([^\s"']{4,})/giu

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

// Network spots: IP addresses, and host names where a host stands (in an address, after user@, in a UNC path) or
// where the name ends in a private suffix. The screen masks them and the shield moves them into the .env; the guard
// lets them through.

// IPv4 with an optional :port or /CIDR. The first number is at least 1 (so versions like 0.63.4.0 stay), and a longer
// chain of dots (1.2.3.4.5) is no address. Group 1 is the address alone. A match without port or CIDR may still be a
// version (1.1.0.0); isVersionAt sorts those out.
const IPV4 = /(?<![\w.])((?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d?)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})(?::\d{1,5})?(?:\/\d{1,2})?(?![\w-]|\.[\w-])/g

// IPv6: eight groups, or fewer around one '::', with an optional zone (%eth0); also inside [..]:port. isIpv6 sorts out
// the rest, so a time (12:30:45) or a C++ name (a::b) never counts. Group 1 is the address.
const IPV6 =
  /(?<![\w:.%])((?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){0,6})?::(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){0,6})?)(?:%[\w.-]+)?(?![\w:%]|\.[\w-])/g

// A host name: labels of letters, digits and inner hyphens, joined by dots.
const HOST_NAME = '[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*'

// The host of an address with a network scheme: scheme://[user[:pass]@]host[:port]/… Group 1 is everything before
// the host, group 2 the host; scheme, port and path stay.
const URL_HOST = new RegExp(
  '\\b((?:https?|s?ftps?|ssh|scp|smb|cifs|afp|nfs|rdp|vnc|wss?|git|svn|telnet|ldaps?|rsync|mqtts?|redis|postgres(?:ql)?|mysql|mariadb|mongodb(?:\\+srv)?|amqps?|smtps?|imaps?|pop3s?)://(?:[^\\s/?#@]*@)?)' +
    `(${HOST_NAME})(?![\\w-]|\\.[\\w-])`,
  'gi',
)

// user@host outside an address (ssh root@nas01): a single label, since a dotted one is an email address, which EMAIL
// takes. Group 1 is user@, group 2 the host. It counts when the host has a digit or a hyphen (nas01, pi-hole) or a
// remote command stands before it on the line (REMOTE_COMMAND), so weights@inputs is no host.
const USER_HOST = /(?<![\w.%+/@-])([A-Za-z_][\w.-]*@)([A-Za-z][A-Za-z0-9-]*[A-Za-z0-9])(?![\w+@-]|\.[\w-])/g
const REMOTE_COMMAND = /\b(?:ssh|scp|sftp|rsync|mosh|telnet)\b/i

// What stands after @ without being a host: package tags (react@latest) and digests (image@sha256:…).
const NOT_A_HOST = new Set(['latest', 'next', 'beta', 'alpha', 'canary', 'rc', 'lts', 'stable', 'nightly', 'dev', 'experimental', 'insiders', 'edge', 'main', 'master', 'head', 'preview', 'release', 'sha1', 'sha256', 'sha512'])

// UNC paths \\host\share and //host/share. Group 1 is the leading pair, group 2 the host.
const UNC_BACKSLASH = new RegExp(`(?<![\\w:\\\\])(\\\\\\\\)(${HOST_NAME})(?=\\\\[^\\s\\\\])`, 'g')
const UNC_SLASH = new RegExp(`(?<![\\w:/])(//)(${HOST_NAME})(?=/[^\\s/])`, 'g')

// A name with a private suffix anywhere in the text, subdomains too. The suffix ends the name, so settings.local.json
// and a member call (cfg.local()) are no host.
const PRIVATE_HOST =
  /(?<![\w.$-])((?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+(?:home\.arpa|fritz\.box|localdomain|intranet|internal|intern|local|lan|corp|home))(?![\w(\[-]|\.[\w-])/g

// Suffixes that are host names only; the others (.local, .home, …) also end member names in code (options.local),
// so they do not count inside backticks or a code block.
const SURE_SUFFIX = /\.(?:home\.arpa|fritz\.box|localdomain)$/

// Inline code and fenced code blocks; a block left open runs to the end.
const CODE = /```[\s\S]*?(?:```|$)|`[^`\n]*`/g

// Public services nobody needs hidden, each with its subdomains; add more here.
const OPEN_HOSTS = [
  'example.com', 'example.net', 'example.org',
  'github.com', 'githubusercontent.com', 'gitlab.com', 'anthropic.com', 'claude.ai', 'claude.com', 'google.com',
  'googleapis.com', 'microsoft.com', 'npmjs.com', 'npmjs.org', 'pypi.org', 'cloudflare.com', 'jsdelivr.net', 'unpkg.com',
  'wikipedia.org', 'stackoverflow.com', 'youtube.com', 'apple.com', 'mozilla.org',
]
// Names reserved for tests and local use: localhost, *.localhost, *.example, *.test, *.invalid.
const OPEN_SUFFIXES = ['localhost', 'example', 'test', 'invalid']

const isOpenHost = (raw: string) => {
  const host = raw.toLowerCase().replace(/\.$/, '')
  if (host === 'localhost') return true
  if (OPEN_SUFFIXES.some(suffix => host.endsWith(`.${suffix}`))) return true
  return OPEN_HOSTS.some(open => host === open || host.endsWith(`.${open}`))
}

const isIpv4 = (host: string) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)

// A version word right before a number on the same line, then at most : or =, quotes, blanks and one of von, from,
// auf, to, nach: "auf Version 1.1.0.0", "version": "1.2.0.0", "updated to 1.3.0.0". The word must stand right before
// the number, so "Update: Server 10.0.0.5" and "Release-Server 10.0.0.5" stay addresses.
const VERSION_BEFORE =
  /(?:\b(?:version|versionen|versions|release|tag|update|updates|updated|aktualisiert|upgrade|upgraded)|\bver\.|["']version["'])\s*[:=]?\s*["']?\s*(?:(?:von|from|auf|to|nach)\s+["']?)?$/i

// The next link of a chain after a version: the earlier number, then blanks and auf, to, nach, bis (zu), →, -> or -
// ("Version 1.1.0.0 auf 1.2.0.0", "Version 1.1.0.0 → 1.2.0.0"). Group 1 is the earlier number.
const VERSION_CHAIN = /(?<![\w.])(\d+(?:\.\d+)+)(?:\s*(?:→|->|-)\s*|\s+(?:auf|to|nach|bis zu|bis)\s+)$/i

/**
 * Whether the number starting at start is a version, by what stands before it on its line: an @ (clean-code@1.2.0.0),
 * a version word (VERSION_BEFORE), or a chain link after a number that is a version itself (VERSION_CHAIN).
 */
function isVersionAt(text: string, start: number): boolean {
  const before = text.slice(text.lastIndexOf('\n', start - 1) + 1, start)
  if (before.endsWith('@') || VERSION_BEFORE.test(before)) return true
  const chain = VERSION_CHAIN.exec(before)
  if (!chain) return false
  return isVersionAt(text, start - before.length + chain.index)
}

/** Loopback (127.x) and net masks (255.x) are no address worth hiding. */
const isOpenIpv4 = (address: string) => /^(?:127|255)\./.test(address)

/** An IPv6 match that is an address: a digit in it, at most seven groups around '::', and not ::1 or ::2 ([::2] slices). */
function isIpv6(match: string): boolean {
  const address = match.replace(/%.*$/, '')
  if (!/\d/.test(address)) return false
  if (!address.includes('::')) return true
  const groups = address.split(':').filter(group => group !== '')
  return groups.length <= 7 && !(address.startsWith('::') && groups.length < 2)
}

type NetSpot = { kind: 'ipv4' | 'ipv6' | 'host'; value: string; start: number; end: number }

/** The network spots of a text in order: only the address or host itself, never its scheme, port or path. */
function findNetSpots(text: string): NetSpot[] {
  const spots: NetSpot[] = []
  const add = (kind: NetSpot['kind'], value: string, start: number) => {
    const end = start + value.length
    if (spots.some(one => start < one.end && one.start < end)) return
    spots.push({ kind, value, start, end })
  }
  for (const re of [URL_HOST, USER_HOST, UNC_BACKSLASH, UNC_SLASH]) {
    for (const m of matches(re, text)) {
      const [, head = '', host = ''] = m
      if (isIpv4(host) || isOpenHost(host) || !/[A-Za-z]/.test(host)) continue
      if (re === USER_HOST) {
        if (NOT_A_HOST.has(host.toLowerCase())) continue
        const line = text.slice(text.lastIndexOf('\n', m.index) + 1, m.index)
        if (!/[\d-]/.test(host) && !REMOTE_COMMAND.test(line)) continue
      }
      add('host', host, m.index + head.length)
    }
  }
  const code = matches(CODE, text).map(m => [m.index, m.index + m[0].length] as const)
  for (const m of matches(PRIVATE_HOST, text)) {
    if (isOpenHost(m[0])) continue
    if (!SURE_SUFFIX.test(m[0]) && code.some(([from, to]) => from <= m.index && m.index < to)) continue
    add('host', m[0], m.index)
  }
  for (const m of matches(IPV6, text)) {
    const [, address = ''] = m
    if (isIpv6(address)) add('ipv6', m[0], m.index)
  }
  // With a port or CIDR it is an address; without one, a number a version word, an @ or a version chain leads to is a
  // version (isVersionAt), so "auf Version 1.1.0.0" stays while "Version 2 läuft auf 192.168.1.10" is masked.
  for (const m of matches(IPV4, text)) {
    const [whole, address = ''] = m
    if (isOpenIpv4(address)) continue
    if (whole === address && isVersionAt(text, m.index)) continue
    add('ipv4', address, m.index)
  }

  return spots.sort((a, b) => a.start - b.start)
}

const NET_MASKS: Record<NetSpot['kind'], string> = { ipv4: '•••.•••.•••.•••', ipv6: '••••:••••', host: '•••.•••' }

/** The text with each network spot masked; scheme, port, path and the user before @ stay. */
function maskNetwork(text: string): string {
  let out = ''
  let at = 0
  for (const spot of findNetSpots(text)) {
    out += text.slice(at, spot.start) + NET_MASKS[spot.kind]
    at = spot.end
  }

  return out + text.slice(at)
}

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

/** The text with each secret findSecrets names covered: a key or password by `cover.secret`, the words before it kept. */
function coverSecrets(text: string, cover: { secret: string; card: string; iban: string }): string {
  let out = text
  for (const re of SECRET_PATTERNS) out = out.replace(re, cover.secret)
  out = out.replace(ASSIGNMENT, (match, name: string, sep: string, value: string) =>
    isCredential(name, value) ? name + sep + cover.secret : match,
  )
  out = out.replace(PHRASE, (match, head: string, value: string) => (isPhraseSecret(head, value) ? head + cover.secret : match))
  out = out.replace(IBAN_PHRASE, (_match, head: string) => head + cover.iban)
  out = out.replace(CARD, match => (isCard(match) ? cover.card : match))
  out = out.replace(IBAN, cover.iban)

  return out
}

/** A message from afar (Remote Control) with each secret the guard finds as REMOVED: Claude reads the rest, not the secret. */
export const removeSecrets = (text: string): string => coverSecrets(text, { secret: REMOVED, card: REMOVED, iban: REMOVED })

/** Masks secrets and personal details, IP addresses and host names too, for the screen; what Claude reads is unchanged. */
export function maskPrivate(text: string): string {
  let out = coverSecrets(text, { secret: DOTS, card: '•••• •••• •••• ••••', iban: '•••' })
  out = out.replace(EMAIL, '•••@•••')
  out = maskNetwork(out)
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
 * numbers and IBANs, IP addresses and host names (IP and HOST, or the name before them: DB_HOST=10.0.0.5). Email
 * addresses and phone numbers stay: the screen masks those. A value counts once; a name taken twice gets _2, _3.
 * Several texts (a chat's messages) are read each on its own.
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
  for (const spot of findNetSpots(text)) {
    // A name right before the spot names it: DB_HOST=10.0.0.5, "server": "nas.fritz.box".
    const before = NAME_BEFORE.exec(text.slice(Math.max(0, spot.start - 120), spot.start))?.[1] ?? ''
    add(envName(before) || (spot.kind === 'host' ? 'HOST' : 'IP'), spot.value, spot.start, spot.end)
  }
}

// NAME=, NAME: or "name": right before a value; group 1 is the name.
// The name stands on its own: in ::ffff:192.168.1.1 the ffff is part of the address, not a name.
const NAME_BEFORE = /(?<![\w.:-])([A-Za-z_][\w.-]*)["']?\s*[=:]\s*["']?$/

// A value shaped like an IP address or a host name; it is replaced as a whole word only (wholeWord).
const NET_VALUE = new RegExp(`^(?:\\d{1,3}(?:\\.\\d{1,3}){3}|[0-9A-Fa-f:]*::?[0-9A-Fa-f:]*(?:%[\\w.-]+)?|${HOST_NAME})$`)

/**
 * Every place a network value stands as a whole word: no letter, digit, _ or - right before or after, and a dot only
 * where no further label joins it. So a host "server" leaves Webserver, servers and server.firma.de alone.
 */
const wholeWord = (value: string) =>
  new RegExp(`(?<![\\p{L}\\d_{-])(?<![\\p{L}\\d-]\\.)${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d_}-])(?!\\.[\\p{L}\\d-])`, 'gu')

/**
 * The text with each secret's value, also as written without spaces or with CRLF, as its placeholder `${NAME}`. An IP
 * address or host name is replaced as a whole word only, whatever its length.
 */
export function replaceSecrets(text: string, secrets: readonly Secret[]): string {
  const pairs = secrets.flatMap(({ name, value }) => {
    const placeholder = `\${${name}}`
    if (NET_VALUE.test(value) && value.length >= 2) return [{ form: value, placeholder, isWhole: true }]
    return [...new Set([value, value.replace(/\n/g, '\r\n'), value.replace(/\s+/g, '')])]
      .filter(form => form.length >= 4)
      .map(form => ({ form, placeholder, isWhole: false }))
  })
  pairs.sort((a, b) => b.form.length - a.form.length)
  let out = text
  for (const { form, placeholder, isWhole } of pairs) {
    out = isWhole ? out.replace(wholeWord(form), () => placeholder) : out.split(form).join(placeholder)
  }
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
  text += [`# Aus dem Chat übernommen vom Leitstand am ${date}`, ...lines].join(eol) + eol
  return { text, secrets: named }
}

/** The .gitignore with a line '.env' added, or null when it already ignores the .env; a missing one is made. */
export function gitignoreWithEnv(existing: string | null): string | null {
  if (existing === null) return '.env\n'
  if (existing.split(/\r?\n/).some(line => line.trim() === '.env' || line.trim() === '/.env')) return null
  const eol = existing.includes('\r\n') ? '\r\n' : '\n'
  return `${existing}${existing === '' || existing.endsWith('\n') ? '' : eol}.env${eol}`
}
