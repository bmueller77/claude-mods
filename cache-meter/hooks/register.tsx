// Cache-Meter: eine schmale Leiste direkt über dem Eingabefeld.
//   Cache-Restzeit ab der letzten Antwort (mit 20-Kästchen-Balken) · Cache-Trefferquote
//   der letzten Antwort · Kontext-Wetter · Kontextfüllung und Auto-Compact-Schwelle ·
//   Compact-Knopf · Pfeil zum Zuklappen.
// Nach jeder Komprimierung stehen Tokens vorher/nachher und die Zusammenfassung im Chat,
// als Log-Zeilen, die das Modell nicht mitliest.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Context, Reading } from '../types'

const HOUR = 60 * 60 * 1000
const FIVE_MIN = 5 * 60 * 1000
const MINUTE = 60 * 1000
const BOXES = 20
const FALLBACK_THRESHOLD = 83
const LOG_CHUNK = 1800 // das Terminal zeichnet von einer Log-Zeile höchstens 2000 Zeichen

const reading = atom({ plugin: 'cache-meter', key: 'reading' } as const, null as Reading | null)
const ttl = atom({ plugin: 'cache-meter', key: 'ttlMs' } as const, HOUR)
const context = atom({ plugin: 'cache-meter', key: 'context' } as const, null as Context | null)
const now = atom({ plugin: 'cache-meter', key: 'now' } as const, 0)
const isCollapsed = atom({ plugin: 'cache-meter', key: 'isCollapsed' } as const, false)

type Usage = {
  input_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  cache_creation?: { ephemeral_1h_input_tokens: number; ephemeral_5m_input_tokens: number } | null
}

// Was eine Komprimierung hinterlässt; geloggt wird, sobald Zahlen und Zusammenfassung da sind.
type Pending = { before?: number; after?: number; summary?: string; logged: boolean }

let pending: Pending | null = null
let surface = 'terminal'

function flush($: EngineInterface) {
  if (!pending || pending.logged || !pending.summary) return
  pending.logged = true
  for (const line of compactLog(pending.before, pending.after, pending.summary)) $.ui.log(line)
  pending = null
}

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    surface = e.surface
    await $.command.register({ name: 'cache-meter', description: 'Cache-Meter über dem Prompt auf- oder zuklappen' }).catch(() => {})
    const collapsed = (await $.store.get('isCollapsed').catch(() => undefined)) === true
    await update($, isCollapsed, () => collapsed)
    // Startwert der Cache-Laufzeit: im Abo 1 h, mit API-Key 5 min. Die erste Antwort bestätigt oder korrigiert.
    const u = await $.session.usage().catch(() => null)
    if (u && !(await read($, reading))) await update($, ttl, () => (u.rateLimits.length > 0 ? HOUR : FIVE_MIN))
    await refreshContext($).catch(() => {})
    await tick($)
    $.clock.every(MINUTE, () => void tick($).catch(() => {}))
    return r
  })

  // Jede Antwort des Hauptstrangs: Zeitpunkt, Trefferquote und tatsächliche Cache-Laufzeit.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId) {
      yield* next(e)
      return
    }
    for await (const chunk of next(e)) {
      if (chunk.kind === 'stop' && chunk.usage) {
        const u = chunk.usage as Usage
        const at = await $.clock.now()
        await update($, reading, () => toReading(at, u))
        const t = ttlFrom(u)
        if (t) await update($, ttl, () => t)
        await update($, now, () => at)
      }
      yield chunk
    }
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) await refreshContext($).catch(() => {})
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId || !('messages' in r) || e.trigger === 'precompute') return r
    await refreshContext($).catch(() => {})
    const fromMessages = r.messages.find(m => m.text.trim())?.text
    pending = { ...(pending ?? { logged: false }), before: r.tokensBefore, after: r.tokensAfter }
    // Die Zusammenfassung liefert classic.PostCompact; kommt sie nicht, nimm die erste Nachricht danach.
    $.clock.after(1500, () => {
      if (pending && !pending.logged && !pending.summary && fromMessages) pending.summary = fromMessages
      flush($)
    })
    flush($)
    return r
  })

  on('classic.PostCompact', async ($, e, next) => {
    const r = await next(e)
    pending = { ...(pending ?? { logged: false }), summary: e.compact_summary }
    if (pending.before !== undefined) flush($)
    return r
  })

  on('command.run', { command: 'cache-meter' }, async $ => {
    const collapsed = await toggle($)
    return { text: collapsed ? 'Cache-Meter zugeklappt.' : 'Cache-Meter aufgeklappt.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    if (e.props.hasSurvey) return rest
    const r = await read($, reading)
    const ttlMs = await read($, ttl)
    const c = await read($, context)
    const t = await read($, now)
    const collapsed = await read($, isCollapsed)
    const { Box, Text, Button } = $.ui.resolve(e)

    const cache = cacheState(r, ttlMs, t)
    const w = weather(c)
    const pct = c ? `${c.percent} %` : '–'
    const sep = <Text dimColor>{'  │  '}</Text>

    const arrow = <Button key="toggle" label={collapsed ? '▸' : '▾'} plain onPress={() => void toggle($)} />

    if (collapsed) {
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" gap={1}>
            {arrow}
            <Text wrap="truncate-end">
              <Text>{`${w.icon} `}</Text>
              <Text color={cache.color}>{cache.short}</Text>
              {sep}
              <Text bold color={w.color}>{pct}</Text>
            </Text>
          </Box>
          {rest}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          {arrow}
          <Text wrap="truncate-end">
            <Text dimColor>{'Cache '}</Text>
            <Text color={cache.color} bold>{cache.text}</Text>
            <Text>{' '}</Text>
            <Text color={cache.color}>{cache.bar}</Text>
            {sep}
            <Text dimColor>{'Treffer '}</Text>
            <Text bold>{r?.hit == null ? '–' : `${r.hit} %`}</Text>
            {sep}
            <Text>{`${w.icon} `}</Text>
            <Text dimColor>{'Kontext '}</Text>
            <Text bold color={w.color}>{pct}</Text>
            <Text dimColor>{c ? ` / Compact bei ${c.threshold} %` : ''}</Text>
          </Text>
          <Button
            key="compact"
            label="Compact"
            variant={w.storm ? 'primary' : 'secondary'}
            onPress={() => void compact($, surface === 'desktop' || e.props.isWorking)}
          />
        </Box>
        {rest}
      </Box>
    )
  })
}

async function toggle($: EngineInterface) {
  const collapsed = await update($, isCollapsed, v => !v)
  await $.store.set('isCollapsed', collapsed).catch(() => {})
  return collapsed
}

// Direkt komprimieren; in der Desktop-App oder solange Claude arbeitet /compact einreihen.
async function compact($: EngineInterface, queue: boolean) {
  const enqueue = () =>
    $.command.run({ command: 'compact', args: '' }).catch(err => $.ui.toast(`Compact ging nicht: ${message(err)}`))
  if (queue) {
    $.ui.toast('/compact eingereiht – startet, sobald Claude fertig ist.')
    void enqueue()
    return
  }
  $.ui.toast('Sitzung wird komprimiert …')
  try {
    const res = await $.session.compact({})
    if (res.skip) $.ui.toast(`Compact abgelehnt: ${res.skip}`)
  } catch {
    $.ui.toast('/compact eingereiht – startet, sobald Claude fertig ist.')
    void enqueue()
  }
}

function message(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

async function tick($: EngineInterface) {
  const t = await $.clock.now()
  await update($, now, () => t)
}

async function refreshContext($: EngineInterface) {
  const u = await $.session.usage({ breakdown: 'summary' })
  const ctx = u.context
  if (!ctx.window) return
  const percent = ctx.percent ?? Math.round(((ctx.tokens ?? 0) / ctx.window) * 100)
  const b = ctx.breakdown
  const threshold =
    b && b.isAutoCompactEnabled && b.autoCompactThreshold && b.rawMaxTokens > 0
      ? Math.round((b.autoCompactThreshold / b.rawMaxTokens) * 100)
      : FALLBACK_THRESHOLD
  await update($, context, () => ({ percent, threshold }))
}

export function toReading(at: number, u: Usage): Reading {
  const total = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
  return { at, hit: total > 0 ? Math.round((u.cache_read_input_tokens / total) * 100) : null }
}

// Die Laufzeit, mit der die Antwort in den Cache geschrieben hat; null, wenn sie nichts schrieb.
export function ttlFrom(u: Usage): number | null {
  if ((u.cache_creation?.ephemeral_1h_input_tokens ?? 0) > 0) return HOUR
  if ((u.cache_creation?.ephemeral_5m_input_tokens ?? 0) > 0) return FIVE_MIN
  return null
}

export function cacheState(r: Reading | null, ttlMs: number, t: number) {
  if (!r) return { color: 'inactive', text: 'noch keine Antwort', short: '–', bar: '□'.repeat(BOXES) }
  const left = Math.max(0, r.at + ttlMs - t)
  if (left === 0) return { color: 'red', text: 'abgelaufen', short: 'abgelaufen', bar: '□'.repeat(BOXES) }
  const frac = left / ttlMs
  const filled = Math.max(1, Math.round(frac * BOXES))
  const color = frac <= 0.1 ? 'red' : frac <= 0.25 ? 'yellow' : 'green'
  const min = `${Math.ceil(left / MINUTE)} min`
  return { color, text: `noch ${min}`, short: min, bar: '■'.repeat(filled) + '□'.repeat(BOXES - filled) }
}

export function weather(c: Context | null) {
  if (!c) return { icon: '☀️', color: 'green', storm: false }
  if (c.percent <= c.threshold * 0.5) return { icon: '☀️', color: 'green', storm: false }
  if (c.percent <= c.threshold * 0.8) return { icon: '🌧️', color: 'yellow', storm: false }
  return { icon: '⛈️', color: 'red', storm: true }
}

// Kopfzeile plus Zusammenfassung, an Absätzen in Stücke unter LOG_CHUNK Zeichen geteilt.
export function compactLog(before: number | undefined, after: number | undefined, summary: string) {
  const head =
    before !== undefined && after !== undefined
      ? `Compact: ${tokens(before)} → ${tokens(after)} Tokens (${tokens(Math.max(0, before - after))} gespart). Zusammenfassung, mit der Claude weitermacht:`
      : 'Compact fertig. Zusammenfassung, mit der Claude weitermacht:'
  return [head, ...chunks(summary.trim(), LOG_CHUNK)]
}

export function chunks(text: string, max: number) {
  const out: string[] = []
  let cur = ''
  const push = (piece: string) => {
    if (!cur) cur = piece
    else if (cur.length + 2 + piece.length <= max) cur += '\n\n' + piece
    else {
      out.push(cur)
      cur = piece
    }
  }
  for (const para of text.split(/\n\s*\n/)) {
    if (para.length <= max) {
      push(para)
      continue
    }
    // Ein Absatz über dem Limit: an Zeilen, notfalls hart teilen.
    for (const line of para.split('\n')) {
      for (let i = 0; i < line.length || i === 0; i += max) push(line.slice(i, i + max))
    }
  }
  if (cur) out.push(cur)
  return out
}

export function tokens(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`
  return String(n)
}
