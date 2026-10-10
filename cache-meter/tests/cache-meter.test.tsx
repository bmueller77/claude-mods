import { describe, expect, test } from 'claude-code/testing'

import { cacheState, toReading, tokens, weather } from '../hooks/register'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120 } }

function engine(on: any, percent = 72) {
  const store: Record<string, unknown> = {}
  on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
  on('store.get', (_$: any, e: any) => ({ value: store[e.key] }))
  on('store.set', (_$: any, e: any) => ((store[e.key] = e.value), { value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: percent * 2000, window: 200_000, percent }, rateLimits: [], cost: { usd: 0 } } }))
  on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: 'band below' }))
  return { store }
}

describe('cache-meter', () => {
  test('Trefferquote und TTL aus der Usage', () => {
    const r = toReading(1000, { input_tokens: 10, cache_read_input_tokens: 970, cache_creation_input_tokens: 20, cache_creation: { ephemeral_1h_input_tokens: 20, ephemeral_5m_input_tokens: 0 } }, 1)
    expect(r.hit).toBe(97)
    expect(r.ttlMs).toBe(3_600_000)
    expect(toReading(0, { input_tokens: 1, cache_read_input_tokens: 9, cache_creation_input_tokens: 0 }, 300_000).ttlMs).toBe(300_000)
  })

  test('Countdown, Ablauf, Wetter', () => {
    const r = { at: 0, ttlMs: 3_600_000, hit: 90 }
    expect(cacheState(r, 60_000).text).toBe('warm, noch 59 min')
    expect(cacheState(r, 3_600_001).dot).toBe('○')
    expect(cacheState(null, 0).text).toBe('noch leer')
    expect(weather(10).icon).toBe('☀')
    expect(weather(70).icon).toBe('🌧')
    expect(weather(90).icon).toBe('⛈')
    expect(tokens(77_000)).toBe('77k')
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`zeichnet die Leiste mit Kontext-Wetter und Compact-Knopf (${surface})`, async ($, on) => {
      engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)
      const band = await $.ui.mount({ plugin: 'cache-meter', surface, ...BAND } as any)
      expect(await band.find({ type: 'Text', text: /Cache/ })).toBeDefined()
      expect(await band.find({ type: 'Text', text: '72 %' })).toBeDefined()
      expect(await band.find({ type: 'Text', text: /bald komprimieren/ })).toBeDefined()
      expect(await band.find({ key: 'compact' } as any)).toBeDefined()
      expect(await band.find({ type: 'Text', text: 'band below' })).toBeDefined()
      await band.unmount()
    })
  }

  test('/cache-meter blendet aus und merkt es sich', async ($, on) => {
    const { store } = engine(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    await $.command.run({ command: 'cache-meter', args: '' } as any)
    expect(store.isHidden).toBe(true)
    const band = await $.ui.mount({ plugin: 'cache-meter', surface: 'terminal', ...BAND } as any)
    expect(await band.find({ type: 'Text', text: /Treffer/ })).toBeUndefined()
    await band.unmount()
  })
})
