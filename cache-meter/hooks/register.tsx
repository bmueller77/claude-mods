// Cache-Meter: eine Leiste über dem Prompt mit drei Angaben.
//   1. Cache: wie lange der Prompt-Cache noch warm ist (Countdown ab der letzten Anfrage)
//   2. Treffer: wie viel der letzten Anfrage aus dem Cache kam
//   3. Kontext: wie voll das Kontextfenster ist, als Wetter, dazu ein Compact-Knopf
// /cache-meter blendet die Leiste ein oder aus; die Wahl bleibt über Sitzungen erhalten.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Context, Reading } from '../types'

const HOUR = 60 * 60 * 1000
const FIVE_MIN = 5 * 60 * 1000
const TICK_MS = 15_000

const reading = atom({ plugin: 'cache-meter', key: 'reading' } as const, null as Reading | null)
const context = atom({ plugin: 'cache-meter', key: 'context' } as const, null as Context | null)
const now = atom({ plugin: 'cache-meter', key: 'now' } as const, 0)
const isHidden = atom({ plugin: 'cache-meter', key: 'isHidden' } as const, false)
const isCompacting = atom({ plugin: 'cache-meter', key: 'isCompacting' } as const, false)

type Usage = {
  input_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  cache_creation?: { ephemeral_1h_input_tokens: number; ephemeral_5m_input_tokens: number } | null
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: 'cache-meter', description: 'Cache-Meter über dem Prompt ein- oder ausblenden' }).catch(() => {})
    const hidden = (await $.store.get('isHidden').catch(() => undefined)) === true
    await update($, isHidden, () => hidden)
    await update($, now, () => 0)
    await refreshContext($)
    await tick($)
    $.clock.every(TICK_MS, () => void tick($).catch(() => {}))
    return r
  })

  // Jede Anfrage des Hauptstrangs: Zeitpunkt merken, am Ende die Cache-Zahlen lesen.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId) {
      yield* next(e)
      return
    }
    const at = await $.clock.now()
    for await (const chunk of next(e)) {
      if (chunk.kind === 'stop' && chunk.usage) {
        const prev = await read($, reading)
        await update($, reading, () => toReading(at, chunk.usage as Usage, prev?.ttlMs ?? HOUR))
      }
      yield chunk
    }
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) await refreshContext($)
    await tick($)
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && 'messages' in r) {
      await refreshContext($).catch(() => {})
      const saved = (r.tokensBefore ?? 0) - (r.tokensAfter ?? 0)
      if (saved > 0) $.ui.toast(`Sitzung komprimiert, ${tokens(saved)} Token gespart. Kontext ist wieder frisch.`)
    }
    return r
  })

  on('command.run', { command: 'cache-meter' }, async $ => {
    const hidden = await update($, isHidden, h => !h)
    await $.store.set('isHidden', hidden).catch(() => {})
    return { text: hidden ? 'Cache-Meter ausgeblendet. /cache-meter blendet es wieder ein.' : 'Cache-Meter eingeblendet.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    if (e.props.hasSurvey || (await read($, isHidden))) return rest
    const r = await read($, reading)
    const c = await read($, context)
    const t = await read($, now)
    const busy = await read($, isCompacting)
    const { Box, Text, Button } = $.ui.resolve(e)

    const cache = cacheState(r, t)
    const w = weather(c?.percent ?? 0)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" borderStyle="round" borderColor="inactive" paddingX={1} justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text color={cache.color} bold>{`${cache.dot} Cache `}</Text>
            <Text>{cache.text}</Text>
            <Text dimColor>{'  ·  '}</Text>
            <Text dimColor>{'Treffer '}</Text>
            <Text bold>{r?.hit == null ? '–' : `${r.hit} %`}</Text>
            <Text dimColor>{'  ·  '}</Text>
            <Text>{`${w.icon} Kontext `}</Text>
            <Text bold color={w.color}>{c ? `${c.percent} %` : '–'}</Text>
            {c && <Text dimColor>{` (${tokens(c.tokens)}/${tokens(c.window)})`}</Text>}
            <Text dimColor>{`  ${w.hint}`}</Text>
          </Text>
          {c && c.percent >= 50 && (
            <Button
              key="compact"
              label={busy ? 'Komprimiere …' : 'Compact'}
              onPress={() => void compact($)}
            />
          )}
        </Box>
        {rest}
      </Box>
    )
  })
}

async function compact($: EngineInterface) {
  if (await read($, isCompacting)) return
  await update($, isCompacting, () => true)
  $.ui.toast('Sitzung wird komprimiert …')
  try {
    const res = await $.session.compact({})
    if (res.skip) $.ui.toast(`Compact abgelehnt: ${res.skip}`)
  } catch (err) {
    $.ui.toast(`Compact geht gerade nicht: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    await update($, isCompacting, () => false)
  }
}

async function tick($: EngineInterface) {
  const t = await $.clock.now()
  await update($, now, () => t)
}

async function refreshContext($: EngineInterface) {
  const u = await $.session.usage().catch(() => null)
  const ctx = u?.context
  if (!ctx || !ctx.window) return
  const tokensUsed = ctx.tokens ?? 0
  const percent = ctx.percent ?? Math.round((tokensUsed / ctx.window) * 100)
  await update($, context, () => ({ tokens: tokensUsed, window: ctx.window, percent }))
}

export function toReading(at: number, u: Usage, prevTtl: number): Reading {
  const total = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
  const hit = total > 0 ? Math.round((u.cache_read_input_tokens / total) * 100) : null
  // Was zuletzt in den Cache geschrieben wurde, verrät die Lebensdauer; ohne Schreibvorgang bleibt die alte.
  const h1 = u.cache_creation?.ephemeral_1h_input_tokens ?? 0
  const m5 = u.cache_creation?.ephemeral_5m_input_tokens ?? 0
  const ttlMs = h1 > 0 ? HOUR : m5 > 0 ? FIVE_MIN : prevTtl
  return { at, ttlMs, hit }
}

export function cacheState(r: Reading | null, t: number) {
  if (!r) return { dot: '○', color: 'inactive', text: 'noch leer' }
  const left = r.at + r.ttlMs - t
  if (left <= 0) return { dot: '○', color: 'red', text: 'abgelaufen – nächste Nachricht lädt alles neu' }
  const min = Math.ceil(left / 60_000)
  const color = left < r.ttlMs * 0.15 ? 'yellow' : 'green'
  return { dot: '●', color, text: `warm, noch ${min} min` }
}

export function weather(percent: number) {
  if (percent < 40) return { icon: '☀', color: 'green', hint: 'alles gut' }
  if (percent < 60) return { icon: '⛅', color: 'green', hint: 'läuft' }
  if (percent < 80) return { icon: '🌧', color: 'yellow', hint: 'bald komprimieren' }
  return { icon: '⛈', color: 'red', hint: 'jetzt komprimieren oder neu starten' }
}

export function tokens(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`
  return String(n)
}
