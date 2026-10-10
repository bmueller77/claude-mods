import { describe, expect, test } from 'claude-code/testing'

import { cacheState, chunks, compactLog, toReading, ttlFrom, weather } from '../hooks/register'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 140 } }
const H = 3_600_000

function engine(on: any, percent = 70) {
  const store: Record<string, unknown> = {}
  on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
  on('clock.now', () => ({ value: 1000 }))
  on('store.get', (_$: any, e: any) => ({ value: store[e.key] }))
  on('store.set', (_$: any, e: any) => ((store[e.key] = e.value), { value: undefined }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: percent * 2000, window: 200_000, percent, breakdown: { isAutoCompactEnabled: true, autoCompactThreshold: 150_000, rawMaxTokens: 200_000, categories: [], totalTokens: 0, percentage: percent } },
      rateLimits: [{}],
      cost: { usd: 0 },
    },
  }))
  on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: 'band below' }))
  return { store }
}

describe('cache-meter', () => {
  test('Trefferquote und tatsächliche Cache-Laufzeit', () => {
    expect(toReading(0, { input_tokens: 10, cache_read_input_tokens: 970, cache_creation_input_tokens: 20 }).hit).toBe(97)
    expect(ttlFrom({ input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 5, cache_creation: { ephemeral_1h_input_tokens: 5, ephemeral_5m_input_tokens: 0 } })).toBe(H)
    expect(ttlFrom({ input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 5, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 5 } })).toBe(300_000)
    expect(ttlFrom({ input_tokens: 1, cache_read_input_tokens: 9, cache_creation_input_tokens: 0 })).toBeNull()
  })

  test('Balken: grün, gelb im letzten Viertel, rot in den letzten 10 %, dann abgelaufen', () => {
    const r = { at: 0, hit: 90 }
    const full = cacheState(r, H, 60_000)
    expect(full.color).toBe('green')
    expect(full.text).toBe('noch 59 min')
    expect(full.bar.length).toBe(20)
    expect(cacheState(r, H, H * 0.8).color).toBe('yellow')
    expect(cacheState(r, H, H * 0.95).color).toBe('red')
    expect(cacheState(r, H, H + 1).text).toBe('abgelaufen')
  })

  test('Wetter relativ zur Auto-Compact-Schwelle', () => {
    expect(weather({ percent: 40, threshold: 83 }).icon).toBe('☀️')
    expect(weather({ percent: 60, threshold: 83 }).icon).toBe('🌧️')
    expect(weather({ percent: 70, threshold: 83 }).storm).toBe(true)
  })

  test('lange Zusammenfassungen werden an Absätzen geteilt', () => {
    const para = 'x'.repeat(1000)
    const parts = chunks([para, para, para].join('\n\n'), 1800)
    expect(parts.length).toBe(3)
    expect(parts.every(p => p.length <= 1800)).toBe(true)
    expect(chunks('y'.repeat(4000), 1800).every(p => p.length <= 1800)).toBe(true)
    expect(compactLog(120_000, 30_000, 'kurz')[0]).toContain('120k → 30k')
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`Leiste mit Schwelle, Gewitter-Knopf und Zuklappen (${surface})`, async ($, on) => {
      engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)
      let band = await $.ui.mount({ plugin: 'cache-meter', surface, ...BAND } as any)
      expect(await band.find({ type: 'Text', text: '70 %' })).toBeDefined()
      expect(await band.find({ type: 'Text', text: / \/ Compact bei 75 %/ })).toBeDefined()
      expect(await band.find({ type: 'Text', text: '⛈️ ' })).toBeDefined()
      expect(await band.find({ key: 'compact' } as any)).toBeDefined()
      expect(await band.find({ type: 'Text', text: 'band below' })).toBeDefined()
      await band.press({ key: 'toggle' })
      await band.unmount()
      band = await $.ui.mount({ plugin: 'cache-meter', surface, ...BAND } as any)
      expect(await band.find({ key: 'compact' } as any)).toBeUndefined()
      expect(await band.find({ type: 'Text', text: '70 %' })).toBeDefined()
      await band.unmount()
    })
  }
})
