/**
 * Der Boden unter dem Mod in den Tests: was die Engine sonst beantwortet.
 * Aufbau nach dem world() der Tests von reflect-mod (BayramAnnakov/claude-reflect, MIT).
 */
import { expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const VOID = { value: undefined } as never
const ok = (value: unknown) => ({ value }) as never

export const FLAECHEN = ['terminal', 'desktop'] as const
export const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
export const START_ZEIT = Date.parse('2026-10-02T12:00:00Z')
export const TAG = 24 * 60 * 60_000

export const REFLEXION = [
  '## Auftrag',
  'Ein Band für gelernte Regeln bauen.',
  '',
  '## Erledigt',
  '- hooks/register.tsx geschrieben',
  '',
  '## Könnte falsch sein oder fehlen',
  '- hooks/register.tsx, speichere(): zwei Sitzungen können gleichzeitig dieselbe CLAUDE.md schreiben.',
  '',
  '## Riskante Annahmen',
  '- HOME ist unter Windows gesetzt.',
  '',
  '## Als Nächstes prüfen',
  '1. claude plugin test laufen lassen.',
].join('\n')

/** Ein Pfad so, wie die Tests ihn vergleichen: Schraegstriche, ohne Laufwerk. */
export const pfad = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:(?=\/)/, '')

export type Opts = {
  verdicts?: Record<string, object | 'error' | 'throw'>
  files?: Record<string, string>
  root?: () => string
  sid?: () => string
  box?: string
  env?: Record<string, string>
  /** Beantwortet $.model.fork: der Wert, den der Mod bekommt. */
  fork?: (prompt: string) => unknown
  /** Ein Store, den der Test zuruecklesen kann; sonst mock.store. */
  speicher?: Map<string, unknown>
}

export type Welt = ReturnType<typeof welt>

export function welt(on: On, opts: Opts = {}) {
  const clock = mock.clock(on, { now: START_ZEIT })
  if (opts.speicher === undefined) mock.store(on, {})
  else {
    const speicher = opts.speicher
    on('store.get', async ($, e) => ok(speicher.get(e.key)))
    on('store.set', async ($, e) => {
      speicher.set(e.key, e.value)
      return VOID
    })
    on('store.delete', async ($, e) => {
      speicher.delete(e.key)
      return VOID
    })
    on('store.keys', async () => ok([...speicher.keys()]))
  }
  mock.env(on, opts.env ?? { HOME: '/home/u' })
  // Die Engine macht Pfade absolut (unter Windows C:\repo\CLAUDE.md); die Tests vergleichen sie als /repo/CLAUDE.md.
  const files: Record<string, string> = Object.fromEntries(Object.entries(opts.files ?? {}).map(([k, v]) => [pfad(k), v]))
  const asked: string[] = []
  const systems: string[] = []
  const filled: { text: string; mode: string }[] = []
  const toasts: string[] = []
  const opened: string[] = []
  const closed: string[] = []
  const copied: string[] = []
  const forks: string[] = []
  const submitted: string[] = []
  on('model.complete', async ($, e) => {
    const text = /<user_message>([\s\S]*)<\/user_message>/.exec(e.prompt)?.[1] ?? ''
    asked.push(text)
    systems.push(e.system ?? '')
    const v = opts.verdicts?.[text]
    if (v === 'throw') throw new Error('model blocked')
    if (v === 'error') return ok({ isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE })
    return ok({ isAnswered: true, text: JSON.stringify(v ?? { is_rule: false, rule: '', scope: 'global', confidence: 0.9 }), usage: USAGE })
  })
  on('model.fork', async ($, e) => {
    forks.push(e.prompt)
    const antwort = opts.fork === undefined ? { isAnswered: true, text: REFLEXION, usage: USAGE } : await opts.fork(e.prompt)
    return ok(antwort)
  })
  on('session.messages', async () => ok([{ role: 'assistant', text: 'Ich habe npm benutzt.', toolUses: [] }]))
  on('session.root', async () => ok(opts.root?.() ?? '/repo'))
  on('session.id', async () => ok(opts.sid?.() ?? 'chat-a'))
  on('fs.exists', async ($, e) => ok(pfad(e.path) in files))
  on('fs.read', async ($, e) => ok(files[pfad(e.path)] ?? ''))
  on('fs.write', async ($, e) => {
    files[pfad(e.path)] = e.text
    return VOID
  })
  on('prompt.read', async () => ok({ text: opts.box ?? '', cursor: 0 }))
  on('prompt.fill', async ($, e) => {
    filled.push({ text: e.text, mode: e.mode })
    return { isFilled: true } as never
  })
  const angemeldet: { name: string; description: string; argumentHint?: string; immediate?: true }[] = []
  on('command.register', async ($, e) => {
    angemeldet.push(e)
    return ok({ command: e.name })
  })
  on('ui.toast', async ($, e) => {
    toasts.push(e.text)
    return VOID
  })
  on('ui.open', async ($, e) => {
    opened.push(e.id)
    return ok({ isPlaced: true })
  })
  on('ui.close', async ($, e) => {
    closed.push(e.id)
    return VOID
  })
  on('ui.copy', async ($, e) => {
    copied.push(e.text)
    return ok({ isCopied: true })
  })
  on('ui.render', async () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('prompt.submit', async ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('prompt.compose', async () => ({ sections: [] }))
  on('turn.start', async ($, e) => ({ turnId: e.turnId }) as never)
  on('tool.call', async () => ({ result: 'ok' }) as never)
  on('turn.complete', async ($, e) => ({ text: e.answer }) as never)
  return { clock, files, asked, systems, filled, toasts, opened, closed, copied, forks, submitted, angemeldet }
}

export const start = ($: Engine) =>
  $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)

export async function say($: Engine, w: Welt, text: string, kind = 'composer') {
  await $.prompt.submit({ text, origin: { kind }, wait: false } as never)
  await w.clock.settle()
}

/** /reflect mit Argumenten; die Antwort als Text. */
export async function befehl($: Engine, args = '') {
  const r = await $.command.run({ command: 'reflect', args } as never)
  return String(r.text ?? '')
}

const SCROLL = { offset: 0, bodyRows: 30, isAtTop: true, isAtBottom: true }

export const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: SCROLL, view: {} } as never,
} as const

export const FENSTER = {
  component: 'Pane',
  requestId: 'reflect',
  props: { title: 'Reflexion', isFocused: true, bodyColumns: 70, placement: 'dock', scroll: SCROLL, view: {} } as never,
} as const

export const band = ($: Engine, surface: (typeof FLAECHEN)[number]) => $.ui.mount({ plugin: 'reflect', surface, ...BAND })
export const fenster = ($: Engine, surface: (typeof FLAECHEN)[number]) => $.ui.mount({ plugin: 'reflect', surface, ...FENSTER })

/** Die Regelzeilen des Bands; auf beiden Oberflaechen gleich. */
export async function zeilen($: Engine) {
  const je: string[][] = []
  for (const surface of FLAECHEN) {
    const ui = await band($, surface)
    je.push((await ui.findAll({ type: 'Text', text: /^💡 / })).map(t => t.text))
    await ui.unmount()
  }
  expect(je[1]).toEqual(je[0])
  return je[0] ?? []
}

/** Drueckt im Band den ersten Knopf, dessen Key so beginnt. */
export async function druecke($: Engine, praefix: string, surface: (typeof FLAECHEN)[number] = 'terminal') {
  const ui = await band($, surface)
  const key = (await ui.findAll({ type: 'Button' })).find(b => b.key?.startsWith(praefix))?.key ?? ''
  await ui.press({ key })
  await ui.unmount()
}

export const compose = ($: Engine) =>
  $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never)

/** Der Text eines Abschnitts im Systemprompt, oder undefined. */
export async function abschnittText($: Engine, id: string) {
  return (await compose($)).sections.find(s => s.id === id)?.text
}
