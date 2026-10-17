import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { GlanceHistoryEntry, GlanceOutcome } from '../types'

import { activityOf, asksQuestion, carryTokens, questionOf, isButtonsOnly, isContinueWords, liftButtons, isGermanText, isLatinText, isStartWords, cleanName, sentenceCase, localTimes, resetTime, fit, formatCost, formatTokens, headerDetails, ownWords, wholePieces, prettyModel, tokenNote } from '../hooks/glance'
import { envValue, extractSecrets, findSecrets, gitignoreWithEnv, maskPrivate, mergeEnv, parseEnv, replaceSecrets } from '../hooks/privacy'
import { OTHER_WAITING_MS, OTHER_WORKING_MS, askedMergeSha, isMcpMergeAction, otherChats, otherChatsWords, runsPowerShellMerge, runsPrMerge, offersChoice, saysDo, shellPieces, staleResumeKeys, toggled, unsafeMerge, unsafePowerShellMerge } from '../hooks/logic'
import { dayEntries, dayFromArgument, dayKey, expiredHistoryKeys, filesNote, historyDay, historyKey, longDay, mergedEntries, paceFromHistory, sharedDayKeys, shiftDay, teamReport, weekSummary } from '../hooks/history'

const PLAN = 'mcp__glanceflow__plan_steps'
const PROGRESS = 'mcp__glanceflow__report_progress'
const SURFACES = ['terminal', 'desktop'] as const
const BAND = {
  plugin: 'glanceflow',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 12,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

/** Calls a tool as the engine does; typed loosely, since the full tool table is too wide to check here. */
function callTool($: Engine, input: unknown): Promise<{ deny?: string; result?: unknown }> {
  return ($.tool.call as unknown as (input: unknown) => Promise<{ deny?: string; result?: unknown }>)(input)
}

/** The world beneath the plugin: clock, store, Haiku and every tool answer from memory; `toolAnswer` replaces the last. */
function world(on: On, toolAnswer: () => unknown = () => ({ result: {} })) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Build my landing page', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', toolAnswer as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.Notification', () => ({}) as never)
  return clock
}

/** Turns on the detailed view: models, tokens, cache and plan usage. */
async function detailsOn($: Engine) {
  await $.command.run({ command: 'glanceflow', args: 'details on' } as never)
}

async function texts($: Engine, surface: (typeof SURFACES)[number], bodyColumns = 80): Promise<string[]> {
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns }, surface })
  const found = (await ui.findAll({ type: 'Text' })).map(one => one.text)
  const buttons = (await ui.findAll({ type: 'Button' })).map(one => one.text)
  // A menu reads as its label and the option picked, as the desktop draws it; one without a label as the option and
  // its arrow.
  const menus = (await ui.findAll({ type: 'Select' })).map(one => {
    const props = one.props as { label?: string; value?: string; options?: { value: string; label: string }[] }
    const picked = props.options?.find(option => option.value === props.value)?.label ?? ''
    return props.label ? `${props.label}: ${picked}` : `${picked} ▾`
  })
  // Vector surfaces draw marks as SVG: their alt text, bracketed, stands for them.
  const marks = surface === 'terminal' ? [] : (await ui.findAll({ type: 'Svg' })).map(one => `[${String(one.props.alt)}]`)
  await ui.unmount()

  return [...found, ...buttons, ...menus, ...marks]
}

type Drawn = { type: string; props: Record<string, unknown>; children?: (Drawn | string)[] }

/** Marks a screen reader would say twice: an alt its row's words hold, or one another mark in the row has. */
function echoes(boxes: unknown[]): string[] {
  // Each element's words apart, as they are drawn: a name and the line under it are two runs of words, not one.
  const textOf = (node: Drawn | string): string => (typeof node === 'string' ? node : (node.children ?? []).map(textOf).join('\n'))
  const altsOf = (node: Drawn | string): string[] =>
    typeof node === 'string' ? [] : node.type === 'Svg' ? [String(node.props.alt)] : (node.children ?? []).flatMap(altsOf)
  const found = (boxes as Drawn[])
    .filter(one => one.props.flexDirection === 'row')
    .flatMap(row => {
      const alts = altsOf(row)
      const words = textOf(row)
      const says = (alt: string) => new RegExp(`(^|\\W)${alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\W)`, 'i').test(words)
      return alts.filter((alt, at) => alts.indexOf(alt) !== at || says(alt)).map(alt => `${alt} ⟶ ${words}`)
    })
  return [...new Set(found)]
}

describe('clean names', () => {
  test('backtick code is stripped', () => {
    expect(cleanName('Build the pricing section in `src/Pricing.tsx`')).toBe('Build the pricing section in')
  })

  test('a path disappears from the middle of a sentence', () => {
    expect(cleanName('update the src/app/page.tsx header text')).toBe('Update the header text')
    expect(cleanName('Fix styles.css and the menu')).toBe('Fix and the menu')
  })

  test('an 80-character name trims to 40 or less at a word boundary', () => {
    const long = 'Rewrite the welcome message so that it sounds warmer and friendlier to new visitors'
    const name = cleanName(long)
    expect(name.length <= 40).toBe(true)
    expect(name.endsWith('…')).toBe(true)
    expect(long.startsWith(name.slice(0, -1))).toBe(true)
  })

  test('nothing left becomes a friendly placeholder', () => {
    expect(cleanName('`npm run build`')).toBe('Arbeitet daran')
  })

  test('a job named in Title Case reads in sentence case, names like GlanceFlow keep theirs', () => {
    expect(sentenceCase('Copy Mod With Button Choices')).toBe('Copy mod with button choices')
    expect(sentenceCase('Release GlanceFlow Update')).toBe('Release GlanceFlow update')
    expect(sentenceCase('Build my landing page')).toBe('Build my landing page')
    expect(sentenceCase('Fix PR')).toBe('Fix PR')
  })

  test('a German job name keeps its capitals: nouns stay capitalized, Title Case or not', () => {
    expect(sentenceCase('Baue die Preistabelle')).toBe('Baue die Preistabelle')
    expect(sentenceCase('Tests prüfen')).toBe('Tests prüfen')
    // Three words or more in Title Case: German small words or umlauts keep the name as it is.
    expect(sentenceCase('Baue Die Preistabelle')).toBe('Baue Die Preistabelle')
    expect(sentenceCase('Preistabelle Mit Drei Tarifen')).toBe('Preistabelle Mit Drei Tarifen')
    expect(sentenceCase('Prüfe Alle Seiten')).toBe('Prüfe Alle Seiten')
    expect(sentenceCase('Kontaktformular Für Kunden Bauen')).toBe('Kontaktformular Für Kunden Bauen')
    // English Title Case still reads in sentence case.
    expect(sentenceCase('Copy Mod With Button Choices')).toBe('Copy mod with button choices')
  })
})

test('a to-do list plus a 60% report draws done, current, next and up next rows', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, {
    tool: 'TodoWrite',
    todos: [
      { content: 'Read your brand notes', status: 'completed', activeForm: 'Reading' },
      { content: 'Build the pricing section', status: 'in_progress', activeForm: 'Building' },
      { content: 'Add the contact form', status: 'pending', activeForm: 'Adding' },
      { content: 'Polish the footer', status: 'pending', activeForm: 'Polishing' },
    ],
  } as never)
  await callTool($, { tool: PROGRESS, task: 'Build the pricing section', percent: 60 } as never)

  for (const surface of SURFACES) {
    const shown = (await texts($, surface)).join('\n')
    const isTerminal = surface === 'terminal'
    expect(shown).toContain(isTerminal ? '✓' : '[Fertig]')
    expect(shown).toContain('Read your brand notes')
    expect(shown).toContain(isTerminal ? '▶' : '[60%]')
    if (isTerminal) expect(shown).toContain('██████░░░░')
    expect(shown).toContain('60%')
    expect(shown).toContain('Als Nächstes')
    expect(shown).toContain('Später')
    expect(shown).toContain(isTerminal ? 'GlanceFlow: Einfach' : 'Einfach ▾')
    expect(shown).not.toContain('Ansicht')
  }
})

test('a permission prompt shows Needs you', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })

  for (const surface of SURFACES) {
    const shown = (await texts($, surface)).join('\n')
    expect(shown).toContain('Braucht dich')
    expect(shown).toContain('Beantworte Claudes Anfrage im Chat')
    expect(shown).toContain(surface === 'terminal' ? '‖' : '[Wartet]')
  }
})

test('/glanceflow off hides the band but keeps the button', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await $.command.run({ command: 'glanceflow', args: 'off' } as never)

  for (const surface of SURFACES) {
    const shown = (await texts($, surface)).join('\n')
    expect(shown).not.toContain('Verstehe deine Anfrage')
    expect(shown).toContain(surface === 'terminal' ? 'GlanceFlow: Aus' : 'Aus ▾')
  }
})

test('another mod drawing above the prompt still shows, under the checklist', async ($, on) => {
  world(on)
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'X post waiting for your OK') as never
  })
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })

  for (const surface of SURFACES) {
    const shown = await texts($, surface)
    expect(shown.join('\n')).toContain('Build my landing page')
    expect(shown).toContain('X post waiting for your OK')
  }
  await $.command.run({ command: 'glanceflow', args: 'off' } as never)
  expect(await texts($, 'terminal')).toContain('X post waiting for your OK')
})

test('plan_steps then report_progress at 100 checks off step one and starts step two', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  const planned = await callTool($, { tool: PLAN, steps: ['Read your notes', 'Write the page', 'Check it'] } as never)
  expect(planned.result).toBe('3 Schritte geplant. Der erste hat begonnen.')
  const reported = await callTool($, { tool: PROGRESS, task: 'Read your notes', percent: 100 } as never)
  expect(reported.result).toBe('Fortschritt notiert: 100%.')

  const shown = await texts($, 'terminal')
  const at = (text: string) => shown.findIndex(one => one.includes(text))
  // Row order: mark, name, meter, label.
  expect(shown[at('Read your notes') - 1]).toContain('✓')
  expect(shown[at('Read your notes') + 2]?.trim()).toBe('Fertig')
  expect(shown[at('Write the page') - 1]).toContain('▶')
  expect(shown[at('Check it') + 2]?.trim()).toBe('Als Nächstes')
})

test('any tool is denied before a plan exists and allowed after', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  const before = await callTool($, { tool: 'Bash', command: 'ls' })
  expect(before.deny).toContain('plan_steps')

  const allowed = await callTool($, { tool: 'ToolSearch', query: 'select:x', max_results: 1 })
  expect(allowed.deny).toBe(undefined)

  await callTool($, { tool: PLAN, steps: ['Look around', 'Answer you'] } as never)
  const after = await callTool($, { tool: 'Bash', command: 'ls' })
  expect(after.deny).toBe(undefined)
})

test('a finished job says All done and collapses after 5 seconds', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: {} as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.Notification', () => ({}) as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Do it', 'Check it'] } as never)
  await clock.advance(134_000)
  await callTool($, { tool: PROGRESS, task: 'Check it', percent: 100 } as never)
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('✓ Fertig · Build my landing page · dauerte 2 Min. 14')
  // The German header is 9 characters longer: at 80 columns its end is cut, so the whole time is read at 100.
  expect((await texts($, 'terminal', 100)).join('\n')).toContain('✓ Fertig · Build my landing page · dauerte 2 Min. 14 Sek.')
  await clock.advance(5000)
  const collapsed = (await texts($, 'terminal')).join('\n')
  expect(collapsed).toContain('✓ Fertig ·')
  expect(collapsed).not.toContain('Do it')
})

// Sample secrets are built at run time, so no key-shaped text sits in the repository
// (where secret scanners would flag it).
const fakeKey = (length: number) => ['sk', 'ant', 'api03', 'abcdefghijklmnopqrstuvwxyz123456'.slice(0, length)].join('-')
const SAMPLE_PASSWORD = ['hunter', '22'].join('')
const SAMPLE_CARD = Array(4).fill('4242').join(' ')
const SAMPLE_ASSIGNMENT = `${['API', 'KEY'].join('_')}=${['abcd', '1234', 'efgh'].join('')}`

describe('privacy', () => {
  test('passwords, keys and card numbers are found', () => {
    expect(findSecrets(`my password is ${SAMPLE_PASSWORD}`)).toContain('ein Passwort')
    expect(findSecrets('ο κωδικός μου είναι gata1234')).toContain('ein Passwort')
    expect(findSecrets(`use ${fakeKey(32)}`)).toContain('einen Schlüssel oder ein Token')
    expect(findSecrets(SAMPLE_ASSIGNMENT)).toContain('ein Passwort oder einen Schlüssel')
    expect(findSecrets(`card ${SAMPLE_CARD} please`)).toContain('eine Kartennummer')
  })

  test('ordinary messages are left alone', () => {
    expect(findSecrets('Build my landing page with a pricing section')).toEqual([])
    expect(findSecrets('Order 1234 5678 is late')).toEqual([])
  })

  test('everyday words that sound like credentials are not held back', () => {
    for (const text of [
      'Author: Antreas Stirmpou',
      'OAuth: enabled for the login page',
      'tokens: 128kcached in Details',
      'auth: required for /api routes',
      'PIN: optional for now',
      'set GLANCE_AUTH_MODE: simple',
      'Δες το authentication: fallback',
      'Ο κωδικός: γράψε τον καθαρά',
    ]) {
      expect(findSecrets(text)).toEqual([])
      expect(maskPrivate(text)).toBe(text)
    }
    expect(findSecrets(`${['DB', 'PASSWORD'].join('_')}=letmein`)).toContain('ein Passwort oder einen Schlüssel')
    expect(findSecrets(`${['AUTH', 'TOKEN'].join('_')}: ${['abc', '123', 'def'].join('')}`)).toContain('ein Passwort oder einen Schlüssel')
    expect(findSecrets('pin: 4821')).toContain('ein Passwort')
  })

  test('the screen hides emails, phones and keys; names drop them', () => {
    const masked = maskPrivate(`mail jane@example.com or call 555-123-4567, key ${fakeKey(22)}`)
    expect(masked).not.toContain('jane@example.com')
    expect(masked).not.toContain('555-123-4567')
    expect(masked).not.toContain(fakeKey(22))
    expect(cleanName('Email jane@example.com the invoice')).toBe('Email the invoice')
  })

  test('German passwords, keys and an IBAN are found and masked', () => {
    expect(findSecrets('Passwort: geheim123')).toEqual(['ein Passwort oder einen Schlüssel', 'ein Passwort'])
    expect(maskPrivate('Passwort: geheim123')).toBe('Passwort: ••••••••')
    expect(findSecrets('Kennwort ist abc!9')).toEqual(['ein Passwort'])
    expect(maskPrivate('Kennwort ist abc!9')).toBe('Kennwort ist ••••••••')
    expect(findSecrets('Mein WLAN-Passwort lautet sonne2024')).toContain('ein Passwort')
    expect(maskPrivate('Mein WLAN-Passwort lautet sonne2024')).toBe('Mein WLAN-Passwort lautet ••••••••')
    expect(findSecrets('Meine PIN ist 4821')).toContain('ein Passwort')
    expect(findSecrets(`${['DB', 'PASSWORT'].join('_')}=letmein`)).toContain('ein Passwort oder einen Schlüssel')
    expect(findSecrets('IBAN: DE89 3704 0044 0532 0130 00')).toEqual(['eine Kontonummer'])
    expect(maskPrivate('IBAN: DE89 3704 0044 0532 0130 00')).toBe('IBAN: •••')
    // In lower case too, and no group of it stays in view.
    expect(findSecrets('meine iban ist de89 3704 0044 0532 0130 00')).toEqual(['eine Kontonummer'])
    expect(maskPrivate('meine iban ist de89 3704 0044 0532 0130 00')).not.toMatch(/\d{2}/)
  })

  test('German everyday words that sound like credentials are not held back', () => {
    for (const text of ['Der Schlüssel ist verloren', 'Die Zugangsdaten: siehe Wiki', 'Das Passwortfeld ist leer', 'PIN: optional']) {
      expect(findSecrets(text)).toEqual([])
      expect(maskPrivate(text)).toBe(text)
    }
  })
})

test('a message with a German password is held back once, then sent when sent again', async ($, on) => {
  world(on)
  let entered = 0
  on('prompt.submit', (_, e) => {
    entered += 1
    return { text: e.text }
  })
  const prompt = { text: 'Mein Passwort ist geheim123, bitte damit einloggen', wait: false, origin: { kind: 'composer' } } as never

  const first = await $.prompt.submit(prompt)
  expect((first as { drop?: string }).drop).toContain('ein Passwort')
  expect(entered).toBe(0)

  await $.prompt.submit(prompt)
  expect(entered).toBe(1)
})

test('a message with a password is held back once, then sent when sent again', async ($, on) => {
  world(on)
  let entered = 0
  on('prompt.submit', (_, e) => {
    entered += 1
    return { text: e.text }
  })
  const prompt = { text: `log in with password: ${SAMPLE_PASSWORD}`, wait: false, origin: { kind: 'composer' } } as never

  const first = await $.prompt.submit(prompt)
  expect((first as { drop?: string }).drop).toContain('ein Passwort')
  expect(entered).toBe(0)

  await $.prompt.submit(prompt)
  expect(entered).toBe(1)

  await $.prompt.submit({ text: 'Build my landing page', wait: false, origin: { kind: 'composer' } } as never)
  expect(entered).toBe(2)
})

test('with the password guard off, a message with a password is sent straight away', async ($, on) => {
  world(on)
  let entered = 0
  on('prompt.submit', (_, e) => {
    entered += 1
    return { text: e.text }
  })
  const off = await $.command.run({ command: 'glanceflow', args: 'guard off' } as never)
  expect(off.text).toContain('Der Passwortschutz ist aus')
  const prompt = { text: `log in with password: ${SAMPLE_PASSWORD}`, wait: false, origin: { kind: 'composer' } } as never

  const sent = await $.prompt.submit(prompt)
  expect((sent as { drop?: string }).drop).toBeUndefined()
  expect(entered).toBe(1)

  const on_ = await $.command.run({ command: 'glanceflow', args: 'guard on' } as never)
  expect(on_.text).toContain('Der Passwortschutz ist an')
  const held = await $.prompt.submit(prompt)
  expect((held as { drop?: string }).drop).toContain('ein Passwort')
  expect(entered).toBe(1)
})

test('overall progress, time left and a grown plan show in the header and footer', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: {} as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('ui.render', { component: 'SessionMode' }, (t$, e) => {
    const { Text } = t$.ui.resolve(e)
    return Text({ children: [e.props.modes.join(' & ')] })
  })

  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  // Sizes 1 + 2 + 2 + 3 = 8 units of work.
  await callTool($, { tool: PLAN, steps: ['Read notes', 'Write copy', 'Add form', 'Polish it'], sizes: ['S', 'M', 'M', 'L'] })
  await clock.advance(3 * 60_000)
  await callTool($, { tool: PROGRESS, task: 'Read notes', percent: 100 })
  await callTool($, { tool: PROGRESS, task: 'Write copy', percent: 100 })

  // 3 of 8 units in 3 minutes: 38%, about 5 minutes left.
  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('38%')
  expect(shown).toContain('noch etwa 5 Min.')

  const footer = await $.ui.mount({ plugin: 'glanceflow', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
  expect((await footer.find({ type: 'Text' }))?.text).toContain('◎ 38% · noch etwa 5 Min.')
  await footer.unmount()

  await callTool($, { tool: PROGRESS, task: 'Fix the menu', percent: 10 })
  expect((await texts($, 'terminal', 120)).join('\n')).toContain('Plan gewachsen 4 → 5')
  // Narrower: the note drops before the title is squeezed.
  const narrow = (await texts($, 'terminal', 80)).join('\n')
  expect(narrow).not.toContain('Plan gewachsen')
  expect(narrow).toContain('Build my landing page')
})

test('a nearly used-up limit shows a gentle warning; how full the chat is, is left to the Statistik mod', async ($, on) => {
  world(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.measure({
    context: { window: 200_000, tokens: 160_000, percent: 80 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 85 }],
    changed: ['context', 'rateLimits'],
  })

  for (const surface of SURFACES) {
    const shown = (await texts($, surface)).join('\n')
    expect(shown).toContain('Du hast 85% deines Limits (5 Std.) verbraucht')
    expect(shown).not.toContain('80% voll')
    expect(shown).not.toMatch(/aufräumen/i)
  }
})

test('Claude forgetting 100 on the last step still ends in All done', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Do it', 'Check it'] })
  await callTool($, { tool: PROGRESS, task: 'Check it', percent: 80 })
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('✓ Fertig ·')
  expect(shown).not.toContain('Braucht dich')
})

test('two open steps after an answer still say Needs you', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Do it', 'Check it', 'Ship it'] })
  await $.turn.complete({ answer: 'Which colour?', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  expect((await texts($, 'terminal')).join('\n')).toContain('Braucht dich')
})

test('a last message that asks something is a question, in English or Greek', () => {
  expect(asksQuestion('The page is ready. Do you want me to deploy it?')).toBe(true)
  expect(asksQuestion('Έτοιμο. Να το ανεβάσω στο Vercel;')).toBe(true)
  expect(asksQuestion('Which one do you prefer? **Reply with a number?**')).toBe(true)
  expect(asksQuestion('Want me to go on?\n\n')).toBe(true)
  expect(asksQuestion('The page is ready.')).toBe(false)
  expect(asksQuestion('Τελείωσε. Δεν χρειάζεται κάτι άλλο.')).toBe(false)
  expect(asksQuestion('Added the line:\n```js\nconst a = 1;\n```')).toBe(false)
  expect(asksQuestion('')).toBe(false)
  expect(asksQuestion('Kept the old value for now;')).toBe(false)
})

test('a finished job that ends with a question says Needs you and chimes, not All done', async ($, on) => {
  const { heard } = soundWorld(on)
  await $.command.run({ command: 'glanceflow', args: 'sound on' } as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  await callTool($, { tool: PROGRESS, task: 'Write it', percent: 100 })
  await callTool($, { tool: PROGRESS, task: 'Check it', percent: 100 })
  heard.length = 0
  await $.turn.complete({ answer: 'The page is ready. Do you want me to deploy it?', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Braucht dich')
  expect(shown).toContain('Do you want me to deploy it?')
  expect(shown).not.toContain('✓ Fertig')
  expect(shown).not.toContain('‖ Pause')
  expect(heard).toEqual(['sounds/needs-you.wav'])
})

test('a quick answer that ends with a question also says Needs you', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Which database?', turnId: 't1' })
  await $.turn.complete({ answer: 'Postgres or SQLite, which do you prefer?', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  expect((await texts($, 'terminal')).join('\n')).toContain('Braucht dich')
})

test('the reply to that question starts a new job, and the History keeps the first one as done', async ($, on) => {
  world(on)
  historyWorld(on, { cwd: '/work/landing-site' })
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it'] })
  await callTool($, { tool: PROGRESS, task: 'Write it', percent: 100 })
  await $.turn.complete({ answer: 'Ready. Shall I deploy it?', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.turn.start({ text: 'Yes, deploy it to Vercel', turnId: 't2' })

  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).not.toContain('Braucht dich')
  expect(shown).toContain('Yes, deploy it to Vercel')
  await $.command.run({ command: 'glanceflow', args: 'history' } as never)
  const pane = (await paneTexts($)).join('\n')
  expect(pane).toContain('Build my landing page')
  expect(pane).toContain('Gesamt: 1 Aufgabe · 1 fertig')
})

test('the question shown is Claude\'s last sentence, plain and short, with secrets masked', () => {
  expect(questionOf('The page is ready. Do you want me to deploy it?')).toBe('Do you want me to deploy it?')
  expect(questionOf('Έτοιμο. Να το ανεβάσω στο Vercel;')).toBe('Να το ανεβάσω στο Vercel;')
  expect(questionOf('Two options:\n\n1. Postgres\n2. SQLite\n\n**Which do you prefer?**')).toBe('Which do you prefer?')
  // A last sentence of a few words keeps its paragraph, so it still makes sense alone.
  expect(questionOf('Both pass locally and in CI. Merge? ')).toBe('Both pass locally and in CI. Merge?')
  expect(questionOf(`Should I use the key ${fakeKey(32)} for this call?`)).not.toContain('abcdefghijkl')
  expect(questionOf(`Do you want ${'a very long thing '.repeat(20)}done?`)?.length).toBeLessThanOrEqual(160)
  expect(questionOf('The page is ready.')).toBeNull()
  expect(questionOf('')).toBeNull()
})

test('Needs you says what Claude asked, and the general reason comes back when it did not ask', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Do it', 'Check it', 'Ship it'] })
  await $.turn.complete({ answer: 'Two colours fit. Which colour should the buttons be?', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  let shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Which colour should the buttons be?')
  expect(shown).not.toContain('Antworte Claude im Feld unten')
  expect(shown).toContain('▶ Weiter')

  // Claude asks for a permission next: the question does not stay on the line.
  await $.turn.start({ text: 'Blue', turnId: 't2' })
  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' } as never)
  shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Beantworte Claudes Anfrage im Chat')
  expect(shown).not.toContain('Which colour')

  // A turn that ends with steps left and no question keeps the general words.
  await callTool($, { tool: 'Bash', command: 'ls' })
  await $.turn.complete({ answer: 'Paused here for now.', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Antworte Claude im Feld unten')
})

test('a question prompt from the app replaces an earlier question on the line', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Do it', 'Check it'] })
  await $.turn.complete({ answer: 'Which colour should the buttons be?', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.classic.Notification({ message: 'Claude has a question', notification_type: 'elicitation_dialog' } as never)
  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Beantworte Claudes Frage im Chat')
  expect(shown).not.toContain('Which colour')
})

test('the desktop notice carries the question too', async ($, on) => {
  const { clock } = soundWorld(on)
  const shown: string[][] = []
  on('process.run', (_, e) => {
    const argv = (e as { argv: readonly string[] }).argv
    if (argv[0] === 'osascript') throw new Error('osascript: not found')
    shown.push([...argv.slice(-2)])
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  await $.command.run({ command: 'glanceflow', args: 'notify on' } as never)
  await clock.advance(1)
  shown.length = 0
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await $.turn.complete({ answer: 'Postgres or SQLite, which do you prefer?', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(1)
  expect(shown).toEqual([['Claude braucht dich', 'Postgres or SQLite, which do you prefer?']])
})

test('while a plan waits for Start, the row offers Start and no Pause', async ($, on) => {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'approve on' } as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('▶ Start')
  expect(shown).not.toContain('‖ Pause')
})

test('narrow headers drop the least important details first', () => {
  const parts = ['38%', 'about 5m left', 'plan grew 4 → 5']
  expect(headerDetails(parts, 80)).toBe(' · 38% · about 5m left · plan grew 4 → 5')
  expect(headerDetails(parts, 25)).toBe(' · 38% · about 5m left')
  expect(headerDetails(parts, 5)).toBe(' · 38%')
  expect(headerDetails(['', '1m 12s', ''], 40)).toBe(' · 1m 12s')
})

test('time left replaces time spent in the header', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: {} as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['One', 'Two', 'Three', 'Four'] })
  await clock.advance(4 * 60_000)
  await callTool($, { tool: PROGRESS, task: 'Two', percent: 100 })

  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('noch etwa 4 Min.')
  expect(shown).not.toContain('4 Min. 0 Sek.')
})

test("notes an app adds before the prompt don't name the job", async ($, on) => {
  world(on)
  expect(ownWords('<system-reminder>\nThe user started this session without a folder.\n</system-reminder>\nWrite a sea poem')).toBe('Write a sea poem')
  await $.turn.start({
    text: '<system-reminder>\nThe user started this session without choosing a project folder.\n</system-reminder>\nWrite a sea poem',
    turnId: 't1',
  })
  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).not.toContain('session without')
  expect(shown).toContain('Write a sea poem')
})

test('model ids read the way people say them', () => {
  expect(prettyModel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(prettyModel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(prettyModel('haiku')).toBe('Haiku')
  expect(prettyModel(null)).toBe(null)
})

test('a subagent shows under its step with its model and effort, then checks off', async ($, on) => {
  world(on)
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5-20251001', agentId: 'a1' }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  await detailsOn($)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Look around the project', 'Write the page'] })
  await $.agent.spawn({
    tool_use_id: 'tu1',
    prompt: 'Find the pricing data',
    description: 'Find the pricing data',
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-haiku-4-5-20251001', effort: 'low', messageCount: 1, agentId: 'a1' } as never)) {
    // drain the step
  }

  for (const surface of SURFACES) {
    const shown = (await texts($, surface)).join('\n')
    expect(shown).toContain(surface === 'terminal' ? '↳' : '[Läuft]')
    expect(shown).toContain('Find the pricing data')
    expect(shown).toContain('Explore · Haiku 4.5 · Aufwand niedrig')
  }

  await $.turn.complete({ answer: 'found it', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a1' })
  const after = await texts($, 'terminal')
  const at = after.findIndex(one => one.includes('Find the pricing data'))
  expect(after[at - 1]).toContain('✓')
})

test('background work keeps the job open until it finishes', async ($, on) => {
  world(on)
  on('classic.Stop', () => ({}) as never)
  await $.turn.start({ text: 'Merge the pull request', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Watch the checks'] })
  await callTool($, { tool: PROGRESS, task: 'Watch the checks', percent: 100 })
  await $.turn.complete({ answer: 'Merged. Watching CI.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.classic.Stop({
    stop_hook_active: false,
    background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'Wait for main CI and Vercel status to settle' }],
  } as never)

  let shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Arbeitet noch im Hintergrund')
  expect(shown).toContain('noch 1')
  expect(shown).toContain('Wait for main CI and Vercel status')
  // The helper's own label, not the header's "Arbeitet noch im Hintergrund".
  expect(shown).toContain('\n im Hintergrund')
  expect(shown).not.toContain('✓ Fertig')

  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as never)
  shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('✓ Fertig ·')
})

test('Claude waiting for its own helper is not Needs you; it is when Claude waits for the person', async ($, on) => {
  world(on)
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5-20251001', agentId: 'a1' }) as never)
  await $.turn.start({ text: 'Ship the engine change', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Make the change', 'Get an independent review', 'Report results'] })
  await callTool($, { tool: PROGRESS, task: 'Make the change', percent: 100 })
  await $.agent.spawn({
    tool_use_id: 'tu1', prompt: 'Review it', description: 'Review the change', subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: true, fork: false,
  } as never)
  // Claude ends its turn to wait for the review.
  await $.turn.complete({ answer: 'Waiting for the review.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  let shown = (await texts($, 'terminal')).join('\n')
  expect(shown).not.toContain('Braucht dich')
  expect(shown).toContain('Review the change')
  expect(shown).not.toContain('‖ Pause')

  // The review ends; Claude wakes up on its own and carries on.
  await $.turn.complete({ answer: 'Looks good.', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer', agentId: 'a1' } as never)
  await $.turn.start({ text: '<task-notification>Review the change finished</task-notification>', turnId: 't3' })
  shown = (await texts($, 'terminal')).join('\n')
  expect(shown).not.toContain('Braucht dich')
  expect(shown).toContain('‖ Pause')

  // Claude stops with steps left and nothing running: now it waits for the person, and says where to answer.
  await $.turn.complete({ answer: 'Shall I file the follow-ups?', durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer' })
  shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Braucht dich')
  expect(shown).toContain('Shall I file the follow-ups?')
  expect(shown).toContain('▶ Weiter')
})

test('a background shell Claude waits for is not Needs you either', async ($, on) => {
  world(on)
  on('classic.Stop', () => ({}) as never)
  await $.turn.start({ text: 'Run the end-to-end test', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Start the test', 'Read the results', 'Report back'] })
  await callTool($, { tool: PROGRESS, task: 'Start the test', percent: 100 })
  await $.turn.complete({ answer: 'Started; waiting.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.classic.Stop({
    stop_hook_active: false,
    background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'Run the live test' }],
  } as never)

  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).not.toContain('Braucht dich')
  expect(shown).toContain('Run the live test')
})

test('a background task whose name already says background is not labelled twice', async ($, on) => {
  world(on)
  on('classic.Stop', () => ({}) as never)
  await $.turn.start({ text: 'Run a timer', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Start the timer', 'Report back'] })
  await callTool($, { tool: PROGRESS, task: 'Report back', percent: 100 })
  await $.turn.complete({ answer: 'Started.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.classic.Stop({
    stop_hook_active: false,
    background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'Wait 60 seconds in background' }],
  } as never)

  const rows = (await texts($, 'terminal')).filter(one => !one.startsWith('◷'))
  expect(rows.join('\n')).toContain('Wait 60 seconds in background')
  expect(rows.join('\n')).not.toContain('im Hintergrund')
})

test('a background task whose German name already says Hintergrund is not labelled twice', async ($, on) => {
  world(on)
  on('classic.Stop', () => ({}) as never)
  await $.turn.start({ text: 'Run a timer', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Start the timer', 'Report back'] })
  await callTool($, { tool: PROGRESS, task: 'Report back', percent: 100 })
  await $.turn.complete({ answer: 'Started.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.classic.Stop({
    stop_hook_active: false,
    background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'Warte 60 Sekunden im Hintergrund' }],
  } as never)

  const rows = (await texts($, 'terminal')).filter(one => !one.startsWith('◷')).join('\n')
  expect(rows).toContain('Warte 60 Sekunden im Hintergrund')
  expect(rows.split(/hintergrund/i)).toHaveLength(2)
})

test('a background task shows its whole description; "in the background" goes first when the row is short', async ($, on) => {
  world(on)
  on('classic.Stop', () => ({}) as never)
  await $.turn.start({ text: 'Run preflight checks', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Read the scheduled run', 'Report the final status'] })
  await $.turn.complete({ answer: 'Waiting on the run.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  const description = "Wait until the 10:30 run's logs show the preflight result"
  await $.classic.Stop({
    stop_hook_active: false,
    background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description }],
  } as never)

  const wide = (await texts($, 'terminal', 120)).join('\n')
  expect(wide).toContain(description)
  expect(wide).toContain('im Hintergrund')

  const narrow = (await texts($, 'terminal', 64)).join('\n')
  expect(narrow).toContain(description)
  expect(narrow).not.toContain('im Hintergrund')
})

const USAGE = { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 10_000, cache_creation_input_tokens: 400 }

test('token counts read short', () => {
  expect(formatTokens(950)).toBe('950')
  expect(formatTokens(12_400)).toBe('12,4k')
  expect(formatTokens(11_000)).toBe('11k')
  expect(formatTokens(212_000)).toBe('212k')
  expect(formatTokens(3_200_000)).toBe('3,2M')
})

test('a new plan keeps the tokens already counted', () => {
  const old = [
    { id: 'a', name: 'Understand your request', status: 'active', percent: 0, hasReported: false, size: 'M', summary: null, tokens: 500, cachedTokens: 100, startedAt: null, finishedAt: null },
  ] as const
  const next = [
    { id: 'p0', name: 'Write the page', status: 'active', percent: 0, hasReported: false, size: 'M', summary: null, tokens: 0, cachedTokens: 0, startedAt: null, finishedAt: null },
    { id: 'p1', name: 'Check it', status: 'upcoming', percent: 0, hasReported: false, size: 'M', summary: null, tokens: 0, cachedTokens: 0, startedAt: null, finishedAt: null },
  ] as const
  const carried = carryTokens([...old], [...next])
  expect(carried[0]?.tokens).toBe(500)
  expect(carried.reduce((sum, one) => sum + one.tokens, 0)).toBe(500)
})

test('each step shows its tokens and how much came from the cache', async ($, on) => {
  world(on)
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: { ...USAGE, model: 'claude-opus-5-5' } } as never
  })
  await detailsOn($)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Read notes', 'Write copy'] })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1 } as never)) {
    // drain
  }

  for (const surface of SURFACES) {
    const shown = (await texts($, surface, 120)).join('\n')
    // 1,000 + 1,000 + 10,000 + 400 = 12.4k: 2.4k new, 10k read back from the cache.
    expect(shown).toContain('2,4k neu · 10k aus Cache')
  }

  await callTool($, { tool: PROGRESS, task: 'Write copy', percent: 100 })
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect((await texts($, 'terminal', 120)).join('\n')).toMatch(/✓ Fertig .* · 2,4k neu · 10k aus Cache/)
})

test('plan usage shows all the time, not only near the limit', async ($, on) => {
  world(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await detailsOn($)
  await $.session.measure({
    context: { window: 200_000, tokens: 68_000, percent: 34 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 42 },
      { kind: 'seven_day', percentUsed: 18 },
    ],
    changed: ['context', 'rateLimits'],
  })

  for (const surface of SURFACES) {
    const shown = (await texts($, surface)).join('\n')
    // "Plan" is a button on the desktop; its usage line says "Nutzung" so the two don't read as one.
    const usageLine = '5 Std. 42% · Woche 18%'
    if (surface === 'terminal') expect(shown).toContain(`Plan-Nutzung: ${usageLine}`)
    else {
      expect(shown).toMatch(/(^|[^-])Nutzung: 5 Std\. 42% · Woche 18%/m)
      expect(shown).not.toContain('Plan-Nutzung')
    }
    expect(shown).not.toContain('Chat zu')
    expect(shown).not.toContain('⚠')
  }
})

test('the simple view hides models, tokens and low plan usage; the Details button shows them', async ($, on) => {
  world(on)
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5-20251001', agentId: 'a1' }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: { ...USAGE, model: 'claude-opus-5-5' } } as never
  })
  await $.session.measure({
    context: { window: 200_000, tokens: 68_000, percent: 34 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 42 }],
    changed: ['context', 'rateLimits'],
  })
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Look around', 'Write the page'] })
  await $.agent.spawn({
    tool_use_id: 'tu1', prompt: 'Find the prices', description: 'Find the prices', subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: false, fork: false,
  } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1 } as never)) {
    // drain
  }

  for (const surface of SURFACES) {
    const simple = (await texts($, surface, 120)).join('\n')
    expect(simple).toContain('Find the prices')
    expect(simple).toContain(surface === 'terminal' ? 'GlanceFlow: Einfach' : 'Einfach ▾')
    expect(simple).not.toContain('Haiku 4.5')
    expect(simple).not.toMatch(/tokens/i)
    expect(simple).not.toContain('aus Cache')
    expect(simple).not.toContain('Nutzung')
  }

  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 120 }, surface: 'terminal' })
  await ui.press({ key: 'toggle' })
  await ui.unmount()
  const detailed = (await texts($, 'terminal', 120)).join('\n')
  expect(detailed).toContain('GlanceFlow: Details')
  expect(detailed).toContain('Explore · Haiku 4.5')
  expect(detailed).toContain('2,4k neu · 10k aus Cache')
  expect(detailed).toContain('Plan-Nutzung: 5 Std. 42%')
})

test('the simple view still warns near a plan limit', async ($, on) => {
  world(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.measure({
    context: { window: 200_000, tokens: 68_000, percent: 34 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 85 }],
    changed: ['context', 'rateLimits'],
  })
  expect((await texts($, 'terminal')).join('\n')).toContain('Du hast 85% deines Limits (5 Std.) verbraucht')
})

test('a quick answer with no plan ends as one plain step', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'What time zone is Athens in?', turnId: 't1' })
  await $.turn.complete({ answer: 'Eastern European Time.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('✓ Fertig ·')
  expect(shown).toContain('Beantworte deine Frage')
  expect(shown).not.toContain('Plane die Schritte')
})

test('one button cycles Simple, Details and Minimal; from Off it goes back to Simple', async ($, on) => {
  world(on)
  const press = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'toggle' })
    await ui.unmount()
  }
  expect((await texts($, 'terminal')).join('\n')).toContain('GlanceFlow: Einfach')
  await press()
  expect((await texts($, 'terminal')).join('\n')).toContain('GlanceFlow: Details')
  await press()
  expect((await texts($, 'terminal')).join('\n')).toContain('GlanceFlow: Minimal')
  await press()
  expect((await texts($, 'terminal')).join('\n')).toContain('GlanceFlow: Einfach')
  await $.command.run({ command: 'glanceflow', args: 'off' } as never)
  expect((await texts($, 'terminal')).join('\n')).toContain('GlanceFlow: Aus')
  await press()
  expect((await texts($, 'terminal')).join('\n')).toContain('GlanceFlow: Einfach')
})

test('in details, the current step fills gradually and shows its time; done steps show how long they took', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: {} as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await detailsOn($)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Read notes', 'Write copy'], sizes: ['M', 'M'] })

  // No pace yet: a medium step is expected to take 3 minutes, so after 90 seconds it is about half done.
  await clock.advance(90_000)
  let shown = (await texts($, 'terminal', 120)).join('\n')
  expect(shown).toContain('█████░░░░░')
  expect(shown).toContain('50%')
  expect(shown).toContain('1 Min. 30 Sek. · noch etwa 2 Min.')
  expect(shown).not.toContain('Arbeitet')

  // The first step took 2 minutes; the second, the same size, is expected to take 2 minutes too.
  await clock.advance(30_000)
  await callTool($, { tool: PROGRESS, task: 'Read notes', percent: 100 })
  await clock.advance(60_000)
  shown = (await texts($, 'terminal', 120)).join('\n')
  expect(shown).toContain('dauerte 2 Min. 0 Sek.')
  expect(shown).toContain('50%')
  expect(shown).toContain('1 Min. 0 Sek. · noch etwa 1 Min.')
})

test('a step running past its expected time says it is taking longer, not under a minute left', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: {} as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await detailsOn($)
  await $.turn.start({ text: 'Ship the site', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Merge and ship', 'Check the pages'], sizes: ['L', 'M'] })

  // Claude says 95% after a minute: a large step is expected to take about 4.5 minutes, so that is believable.
  await clock.advance(60_000)
  await callTool($, { tool: PROGRESS, task: 'Merge and ship', percent: 95 })
  expect((await texts($, 'terminal', 120)).join('\n')).toContain('1 Min. 0 Sek. · noch unter 1 Min.')

  // 17 minutes later it still sits at 95%: no more "under a minute", and no total that would be a guess.
  await clock.advance(17 * 60_000)
  const shown = (await texts($, 'terminal', 120)).join('\n')
  expect(shown).toContain('18 Min. 0 Sek. · dauert länger')
  expect(shown).not.toContain('noch unter 1 Min.')
  expect(shown).not.toContain('etwa')
  const pane = await planPaneTexts($)
  expect(pane).toContain('dauert länger')
  expect(pane).not.toContain('noch unter 1 Min.')
  expect(pane).not.toContain('fertig gegen')
  // The next step still says how long it usually takes.
  expect(pane).toContain('etwa 3 Min.')

  // A lower report from Claude past that point still gives an honest estimate.
  await callTool($, { tool: PROGRESS, task: 'Merge and ship', percent: 50 })
  const later = (await texts($, 'terminal', 120)).join('\n')
  expect(later).toContain('50%')
  expect(later).toContain('18 Min. 0 Sek. · noch etwa 18 Min.')
})

test('the simple view keeps the sweep until Claude reports', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Read notes', 'Write copy'] })
  const shown = (await texts($, 'terminal', 120)).join('\n')
  expect(shown).toContain('Arbeitet')
  expect(shown).not.toContain('dauerte')
})

test('token notes put new tokens first and cached ones after', () => {
  expect(tokenNote(228_000, 225_000)).toBe('3k neu · 225k aus Cache')
  expect(tokenNote(5_000, 0)).toBe('5k Tokens')
  expect(tokenNote(0, 0)).toBe('')
})

test("Claude's final answer counts in the job's total, not in the last step", async ($, on) => {
  world(on)
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { ...USAGE, model: 'claude-opus-5-5' } } as never
  })
  await detailsOn($)
  await $.turn.start({ text: 'Remove the files', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Move them away', 'Check they are gone'] })
  await callTool($, { tool: PROGRESS, task: 'Check they are gone', percent: 100 })
  // Every step is done; this request is the final answer.
  for await (const _ of $.turn.step({ turnId: 't1', index: 3, model: 'claude-opus-5-5', effort: 'high', messageCount: 5 } as never)) {
    // drain
  }
  await $.turn.complete({ answer: 'Removed.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  const shown = await texts($, 'terminal', 120)
  expect(shown.join('\n')).toMatch(/✓ Fertig .* · 2,4k neu · 10k aus Cache/)
  expect(shown.some(line => line.includes('neu ·') && !line.includes('✓ Fertig'))).toBe(false)
})

const PANE = {
  plugin: 'glanceflow',
  component: 'Pane',
  requestId: 'glanceflow-history',
  props: { title: 'History', isFocused: true, bodyColumns: 110, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

/** A project folder, and a pane that opens. */
function historyWorld(on: On, project: { cwd: string }) {
  on('session.cwd', () => ({ value: project.cwd }) as never)
  on('session.id', () => ({ value: 'chat-1' }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
}

async function paneTexts($: Engine): Promise<string[]> {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const found = [
    ...(await ui.findAll({ type: 'Text' })),
    ...(await ui.findAll({ type: 'Select' })),
    ...(await ui.findAll({ type: 'Button' })),
  ].map(one => one.text)
  await ui.unmount()

  return found
}

describe('history days', () => {
  test('today, yesterday and a date are understood', () => {
    const now = new Date(2026, 9, 6, 12).getTime()
    expect(dayFromArgument('', now)).toBe('2026-10-06')
    expect(dayFromArgument(' yesterday', now)).toBe('2026-10-05')
    expect(dayFromArgument(' heute', now)).toBe('2026-10-06')
    expect(dayFromArgument(' gestern', now)).toBe('2026-10-05')
    expect(dayFromArgument(' 2026-09-30', now)).toBe('2026-09-30')
    expect(dayFromArgument(' last week', now)).toBe(null)
  })

  test('days older than 30 are cleaned away', () => {
    const now = new Date(2026, 9, 6, 12).getTime()
    expect(expiredHistoryKeys(['history:2026-08-01', 'history:2026-09-20', 'glanceEnabled'], now)).toEqual([
      'history:2026-08-01',
    ])
  })

  test('a stored day reads as its entries, and anything else as none', () => {
    const day = [pastJob('a', '/p', 1, 60_000), pastJob('b', '/p', 2, 120_000)]
    expect(dayEntries(day)).toEqual(day)
    expect(dayEntries(undefined)).toEqual([])
    expect(dayEntries(null)).toEqual([])
    expect(dayEntries({ jobId: 'a' })).toEqual([])
  })

  test("each chat keeps its own key for a day; the day's old shared key is told apart", () => {
    const now = new Date(2026, 9, 6, 12).getTime()
    expect(historyKey('2026-10-06', 'chat-1')).toBe('history:2026-10-06:chat-1')
    expect(historyDay('history:2026-10-06:chat-1')).toBe('2026-10-06')
    expect(historyDay('history:2026-10-06')).toBe('2026-10-06')
    expect(sharedDayKeys(['history:2026-10-06', 'history:2026-10-06:chat-1', 'glanceEnabled'])).toEqual(['history:2026-10-06'])
    expect(expiredHistoryKeys(['history:2026-08-01:chat-1', 'history:2026-09-06:chat-1', 'history:2026-09-20:chat-2'], now)).toEqual([
      'history:2026-08-01:chat-1',
    ])
  })

  test('jobs from several keys read once each, the later copy winning, oldest first', () => {
    const early = { ...pastJob('a', '/p', 1, 60_000), startedAt: 5 }
    const late = { ...pastJob('b', '/p', 1, 60_000), startedAt: 9 }
    const redone = { ...early, title: 'Picked up again' }
    expect(mergedEntries([[late, early], undefined, [redone]])).toEqual([redone, late])
  })
})

test('only the most recent saved checklists stay', () => {
  expect(staleResumeKeys([['a', 3], ['b', 1], ['c', 2]], 2)).toEqual(['b'])
  expect(staleResumeKeys([['a', 3]], 2)).toEqual([])
})

test('/glanceflow on and off set a setting, and anything else flips it', () => {
  expect(toggled('on', false)).toBe(true)
  expect(toggled('on', true)).toBe(true)
  expect(toggled('off', true)).toBe(false)
  expect(toggled('off', false)).toBe(false)
  expect(toggled('', true)).toBe(false)
  expect(toggled('', false)).toBe(true)
})

test("each finished job is saved, and /glanceflow history shows the day's jobs for this project", async ($, on) => {
  const clock = mock.clock(on, { now: new Date(2026, 9, 6, 9, 42).getTime() })
  mock.store(on)
  const project = { cwd: '/work/landing-site' }
  historyWorld(on, project)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: {} as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.Stop', () => ({}) as never)

  // A finished job.
  await $.turn.start({ text: 'Build the pricing section', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  await clock.advance(12 * 60_000 + 30_000)
  await callTool($, { tool: PROGRESS, task: 'Check it', percent: 100 })
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  // A stopped job.
  await clock.advance(60_000)
  await $.turn.start({ text: 'Fix the menu', turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['Find the menu', 'Fix it', 'Check it'] })
  await clock.advance(2 * 60_000)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't2', reason: 'aborted' })

  // A job in another project stays out of this one's history.
  project.cwd = '/work/other-project'
  await $.turn.start({ text: 'Rename the files', turnId: 't3' })
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer' })
  project.cwd = '/work/landing-site'

  const result = await $.command.run({ command: 'glanceflow', args: 'history' } as never)
  // The day reads as TT.MM.JJJJ; the key under it stays YYYY-MM-DD.
  expect(dayKey(clock.now())).toBe('2026-10-06')
  expect(result.text).toBe('Verlauf für 06.10.2026: 2 Aufgaben.')

  const shown = (await paneTexts($)).join('\n')
  expect(shown).toContain('09:42')
  expect(shown).toContain('Build the pricing section')
  expect(shown).toContain('2/2 · 12 Min. 30 Sek.')
  expect(shown).toContain('Fix the menu')
  expect(shown).toContain('■')
  expect(shown).toContain('0/3 · 2 Min. 0 Sek.')
  expect(shown).not.toContain('Rename the files')
  expect(shown).toContain('Gesamt: 2 Aufgaben · 1 fertig, 1 gestoppt · 14 Min. 30 Sek.')
})

test('a day with nothing saved says so', async ($, on) => {
  world(on)
  historyWorld(on, { cwd: '/work/landing-site' })
  await $.command.run({ command: 'glanceflow', args: 'history 2026-01-01' } as never)
  expect((await paneTexts($)).join('\n')).toContain('Für dieses Projekt sind an diesem Tag noch keine Aufgaben gespeichert.')
})

const ENTRY = {
  project: '/work/landing-site',
  newTokens: 3000,
  cachedTokens: 225_000,
  isQuickAnswer: false,
} as const

test('the team report is plain: done, in progress, stuck and time, without tokens or quick questions', () => {
  const at = new Date(2026, 9, 6, 9, 0).getTime()
  const report = teamReport({
    day: '2026-10-06',
    project: '/work/landing-site',
    entries: [
      { ...ENTRY, jobId: 'a', startedAt: at, finishedAt: at + 12 * 60_000, title: 'Build the pricing section', outcome: 'done', stepsDone: 2, stepsTotal: 2, doneSteps: ['Write the prices', 'Check the layout'], openSteps: [] },
      { ...ENTRY, jobId: 'b', startedAt: at + 20 * 60_000, finishedAt: at + 22 * 60_000, title: 'Fix the menu', outcome: 'stopped', stepsDone: 1, stepsTotal: 3, doneSteps: ['Find the menu'], openSteps: ['Fix the links', 'Check it'] },
      { ...ENTRY, jobId: 'c', startedAt: at + 30 * 60_000, finishedAt: at + 31 * 60_000, title: 'Update the footer', outcome: 'stuck', stepsDone: 0, stepsTotal: 2, doneSteps: [], openSteps: ['Edit it', 'Check it'] },
      { ...ENTRY, jobId: 'd', startedAt: at + 40 * 60_000, finishedAt: at + 40 * 60_000, title: 'Answer your question', outcome: 'done', stepsDone: 1, stepsTotal: 1, doneSteps: [], openSteps: [], isQuickAnswer: true },
    ],
  })
  expect(report).toContain('Tagesbericht · landing-site ·')
  expect(report).toContain('Fertig\n• Build the pricing section (12 Min.)\n  Write the prices · Check the layout')
  // German step names keep their capitals.
  expect(report).toContain('Noch offen\n• Fix the menu: 1 von 3 Schritten fertig; als Nächstes: Fix the links')
  expect(report).toContain('Braucht Aufmerksamkeit\n• Update the footer: hängt fest und braucht eine Entscheidung')
  expect(report).toContain('1 von 3 Aufgaben abgeschlossen · 15 Min. Arbeitszeit')
  expect(report).not.toContain('Answer your question')
  expect(report).not.toMatch(/token/i)
  expect(report).not.toMatch(/cache/i)
})

test('before any work the band says where the plan will show, without a Fresh chat button', async ($, on) => {
  world(on)
  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Bitte Claude um etwas: Hier erscheint sein Plan')
  expect(shown).toContain('≣ Verlauf')
  expect(shown).not.toContain('Neuer Chat')
})

test('Details keeps the tool rows in view; Simple hides them', async ($, on) => {
  world(on)
  const PROGRESS_ROW = {
    plugin: 'glanceflow',
    component: 'ToolProgress',
    props: { tool_use_id: 'tu1', kind: 'background_hint', hint: '(ctrl+b to run in background)' },
  } as const
  let drawn = ''
  on('ui.render', { component: 'ToolProgress' }, (_, e) => {
    drawn = (e.props as { hint: string }).hint
    return { type: 'Text', props: {}, children: [drawn] } as never
  })
  const hint = async () => {
    const ui = await $.ui.mount({ ...PROGRESS_ROW, surface: 'terminal' } as never)
    await ui.unmount()
    return drawn
  }
  expect(await hint()).not.toContain('ctrl+b')
  await detailsOn($)
  expect(await hint()).toContain('ctrl+b')
})

test('a long plan says how many steps are out of view', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'] })
  await callTool($, { tool: PROGRESS, task: 'Three', percent: 100 })
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 4 }, surface: 'terminal' })
  const shown = (await ui.findAll({ type: 'Text' })).map(one => one.text).join('\n')
  await ui.unmount()
  expect(shown).toContain('… 3 davor · 4 weitere Schritte')
  expect(shown).toContain('Four')
})

test('a long plan folds its finished steps and the ones after next, so the band stays short', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'] })
  await callTool($, { tool: PROGRESS, task: 'Three', percent: 100, summary: 'Wrote the three sections' })
  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('3 Schritte fertig')
  expect(shown).toContain('    Wrote the three sections')
  expect(shown).toContain('Four')
  expect(shown).toContain('Five')
  expect(shown).toContain('3 weitere Schritte')
  for (const hidden of ['One', 'Two', 'Six', 'Seven', 'Eight']) expect(shown).not.toMatch(new RegExp(`^${hidden}\\b`, 'm'))

  // Five steps or fewer stay as they are.
  await $.turn.start({ text: 'Fix the menu', turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['A1', 'B2', 'C3', 'D4', 'E5'] })
  await callTool($, { tool: PROGRESS, task: 'B2', percent: 100 })
  const short = (await texts($, 'terminal')).join('\n')
  for (const name of ['A1', 'B2', 'C3', 'D4', 'E5']) expect(short).toContain(name)
})

test('names in any script line up: CJK and emoji take two cells', () => {
  expect(fit('Read notes', 12)).toBe('Read notes  ')
  expect(fit('设计页面', 10)).toBe('设计页面  ')
  expect(fit('设计页面设计', 9)).toBe('设计页面…')
  expect(fit('设计页面设计', 8)).toBe('设计页… ')
  expect(fit('Ship it 🚀', 10)).toBe('Ship it 🚀')
  expect(fit('Διάβασε τις σημειώσεις', 10)).toBe('Διάβασε τ…')
})

test('with room for one row, the current step is the one shown', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['One', 'Two', 'Three', 'Four'] })
  await callTool($, { tool: PROGRESS, task: 'One', percent: 100 })
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 3 }, surface: 'terminal' })
  const shown = (await ui.findAll({ type: 'Text' })).map(one => one.text).join('\n')
  await ui.unmount()
  expect(shown).toContain('Two')
  expect(shown).not.toContain('One ')
})

test('the band has History and Fresh chat buttons while GlanceFlow is on', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  for (const surface of SURFACES) {
    const shown = (await texts($, surface)).join('\n')
    expect(shown).toContain(surface === 'terminal' ? '≣ Verlauf' : 'Verlauf')
    // The desktop offers a fresh chat once it helps: not mid-job, when it would end the work in hand.
    if (surface === 'terminal') expect(shown).toContain('↻ Neuer Chat')
    else expect(shown).not.toContain('Neuer Chat')
  }
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' })
  expect((await texts($, 'desktop')).join('\n')).toContain('Neuer Chat')
  await $.command.run({ command: 'glanceflow', args: 'off' } as never)
  const off = (await texts($, 'terminal')).join('\n')
  expect(off).not.toContain('≣ Verlauf')
})

test('in the Desktop app the view is a menu at the top right, and everything that acts sits together at the bottom right', async ($, on) => {
  world(on)
  // Another mod's card, with words, stays under the band. (A test can't hold another mod's button; isButtonsOnly
  // below is what lets one, Replay say, join the actions.)
  let beneath: unknown = null
  // Claude Code 2.1.295 takes only a tree from a ui.render hook: with no card, the engine's part is an empty Box.
  on('ui.render', { component: 'AbovePrompt' }, () => (beneath ?? { type: 'Box', props: {}, children: [] }) as never)
  const drawn = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const boxes = await ui.findAll({ type: 'Box' })
    const part = (key: string) => JSON.stringify(boxes.find(one => one.props.key === key) ?? null)
    const menus = (await ui.findAll({ type: 'Select' })).map(one => (one.props.options as { label: string }[]).map(option => option.label).join(' / '))
    const all = JSON.stringify(boxes[0] ?? null)
    await ui.unmount()
    return { top: part('header-right'), bottom: part('actions'), menus, all }
  }

  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  const working = await drawn()
  expect(working.menus).toEqual(['Ausführlich / Einfach / Minimal', 'Auto-Mode / Gruppenarbeit'])
  expect(working.top).toContain('"type":"Select"')
  expect(working.top).not.toContain('Pause')
  expect(working.bottom).toContain('Pause')
  expect(working.bottom.indexOf('Pause')).toBeGreaterThan(working.bottom.indexOf('Einstellungen'))
  expect(working.bottom).not.toContain('"key":"view"')

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' })
  const stopped = await drawn()
  expect(stopped.bottom.indexOf('Neuer Chat')).toBeGreaterThan(stopped.bottom.indexOf('Einstellungen'))
  expect(stopped.bottom.indexOf('"Weiter"')).toBeGreaterThan(stopped.bottom.indexOf('Neuer Chat'))
  expect(stopped.top).not.toContain('Weiter')

  beneath = { type: 'Box', props: {}, children: [{ type: 'Text', props: {}, children: ['A card from another mod'] }] }
  const card = await drawn()
  expect(card.bottom).not.toContain('A card from another mod')
  expect(card.all).toContain('A card from another mod')
})

test('in the Desktop app the welcome cards and the empty band keep that frame: the view on top, places left, actions right', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/work', surface: 'desktop' } as never)
  const drawn = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const boxes = await ui.findAll({ type: 'Box' })
    const part = (key: string) => JSON.stringify(boxes.find(one => one.props.key === key) ?? null)
    await ui.unmount()
    return { top: part('header-right'), bottom: part('actions'), tour: part('tour') }
  }

  const welcome = await drawn()
  expect(welcome.top).toContain('"type":"Select"')
  // The settings are the gear right of the view, not a place at the bottom.
  expect(welcome.top.indexOf('"key":"settings"')).toBeGreaterThan(welcome.top.indexOf('"type":"Select"'))
  expect(welcome.tour).not.toContain('Einstellungen')
  expect(welcome.tour.indexOf('Überspringen')).toBeGreaterThan(welcome.tour.indexOf('Verlauf'))
  expect(welcome.tour.indexOf('"Weiter"')).toBeGreaterThan(welcome.tour.indexOf('Überspringen'))

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'tour-skip' })
  await band.unmount()
  const empty = await drawn()
  expect(empty.top).toContain('"type":"Select"')
  expect(empty.top).toContain('"key":"settings"')
  expect(empty.top).not.toContain('Verlauf')
  expect(empty.bottom).toContain('Verlauf')
  expect(empty.bottom).not.toContain('"key":"settings"')
})

test('in the Desktop app a job that stops on a question offers no Continue, which would read as yes', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it', 'Ship it'] })
  await $.turn.complete({ answer: 'I stopped before the check.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect((await texts($, 'desktop')).join('\n')).toMatch(/^Weiter$/m)

  await $.turn.start({ text: 'continue', turnId: 't2' })
  await $.turn.complete({ answer: 'Should I deploy it now?', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  const asked = (await texts($, 'desktop')).join('\n')
  expect(asked).toContain('Should I deploy it now?')
  expect(asked).not.toContain('Weiter')
})

test('the second welcome card says where the yellow is: in the words on the terminal, a bell beside them in the Desktop app', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/work', surface: 'desktop' } as never)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'tour-next' })
  await band.unmount()
  expect((await texts($, 'desktop', 120)).join('\n')).toContain('Braucht dich neben einer gelben Glocke')
  expect((await texts($, 'terminal', 120)).join('\n')).toContain('Braucht dich in Gelb')
})

test('in the Desktop app a step row keeps whole words: in a narrow band the name stays and what follows keeps whole words', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Read your brand notes', 'Polish the footer'] })
  await callTool($, { tool: PROGRESS, task: 'Read your brand notes', percent: 100 })
  await callTool($, { tool: PROGRESS, task: 'Polish the footer', percent: 100, summary: 'Tidied the footer links' })
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  // 30 cells leave about 32 characters past the mark: the name, " · ", then as many whole words as fit.
  const narrow = await texts($, 'desktop', 30)
  expect(narrow).toContain('Polish the footer')
  expect(narrow.some(one => one.endsWith(' · Tidied the…'))).toBe(true)
  expect((await texts($, 'desktop', 80)).some(one => one.endsWith('Tidied the footer links'))).toBe(true)
})

test('in the Desktop app the Plan panel says Usage, as the band does, so it does not read as the Plan button', async ($, on) => {
  world(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.command.run({ command: 'glanceflow', args: 'details on' } as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  await $.session.measure({ context: { window: 200_000, tokens: 68_000, percent: 34 }, rateLimits: [{ kind: 'five_hour', percentUsed: 42 }], changed: ['context', 'rateLimits'] } as never)
  const ui = await $.ui.mount({ ...PLAN_PANE, surface: 'desktop' })
  const words = (await ui.findAll({ type: 'Text' })).map(one => one.text).join('\n')
  await ui.unmount()
  expect(words).toContain('Nutzung: 5 Std. 42%')
  expect(words).not.toContain('Plan-Nutzung')
})

test('in the Desktop app History reads every time one way, as the report does, and the report puts Copy report last', async ($, on) => {
  mock.clock(on, { now: new Date(2026, 9, 6, 18, 0).getTime() })
  mock.store(on, {
    'history:2026-10-06': [
      { ...ENTRY, jobId: 'a', startedAt: new Date(2026, 9, 6, 9, 0).getTime(), finishedAt: new Date(2026, 9, 6, 9, 12, 30).getTime(), title: 'Build the pricing section', outcome: 'done', stepsDone: 2, stepsTotal: 2, doneSteps: ['Write it', 'Check it'], openSteps: [] },
    ],
  })
  on('session.cwd', () => ({ value: '/work/landing-site' }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('ui.copy', () => ({ value: { isCopied: true } }) as never)
  await $.command.run({ command: 'glanceflow', args: 'history' } as never)
  const list = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const shown = (await list.findAll({ type: 'Text' })).map(one => one.text).join('\n')
  // A job's details sit in empty room under its name: nothing there for a screen reader to say.
  expect((await list.findAll({ type: 'Svg' })).map(one => String(one.props.alt))).not.toContain('Detail')
  await list.press({ key: 'report' })
  await list.unmount()
  expect(shown).toContain('13 Min.')
  expect(shown).not.toContain('12 Min. 30 Sek.')

  const report = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const boxes = await report.findAll({ type: 'Box' })
  await report.unmount()
  const actions = JSON.stringify(boxes.find(one => one.props.key === 'report-actions') ?? null)
  expect(actions.indexOf('Bericht kopieren')).toBeGreaterThan(actions.indexOf('Zurück zur Liste'))
  expect(actions.indexOf('Bericht kopieren')).toBeGreaterThan(actions.indexOf('Wochenbericht'))
})

test('in the Desktop app the mark beside a state says Status, so a screen reader hears the state once', async ($, on) => {
  world(on)
  const alts = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const found = (await ui.findAll({ type: 'Svg' })).map(one => String(one.props.alt))
    await ui.unmount()
    return found
  }
  // The marks in the header row alone.
  const headerAlts = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const header = (await ui.findAll({ type: 'Box' })).find(one => one.props.key === 'header')
    await ui.unmount()
    return [...JSON.stringify(header ?? null).matchAll(/"alt":"([^"]*)"/g)].map(match => match[1])
  }
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  expect(await alts()).toContain('Status')
  expect(await alts()).not.toContain('Braucht dich')
  await callTool($, { tool: PROGRESS, task: 'Write it', percent: 100 })
  await callTool($, { tool: PROGRESS, task: 'Check it', percent: 100 })
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(await alts()).toContain('Status')
  // "Fertig" is also what a done step's own mark says; the header's mark says Status, never the state.
  expect(await headerAlts()).toEqual(['Status'])
})

test('in the Desktop app the bold words of a header are never cut: a narrow band says them in fewer whole words', async ($, on) => {
  world(on)
  on('classic.Stop', () => ({}) as never)
  await $.turn.start({ text: 'Merge the pull request', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Watch the checks'] })
  await callTool($, { tool: PROGRESS, task: 'Watch the checks', percent: 100 })
  await $.turn.complete({ answer: 'Merged. Watching CI.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.classic.Stop({
    stop_hook_active: false,
    background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'Wait for the checks' }],
  } as never)
  for (const [width, lead] of [[30, 'Hintergrund'], [40, 'Im Hintergrund'], [60, 'Arbeitet noch im Hintergrund']] as const) {
    const shown = await texts($, 'desktop', width)
    expect(shown).toContain(lead)
    expect(shown.join('\n')).not.toMatch(/(Arbeitet|Im|Hintergr)\w*…/)
  }
})

test('in the Desktop app the welcome card says Welcome whole in a narrow band and once to a screen reader, and its words sit in empty room', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/work', surface: 'desktop' } as never)
  expect(await texts($, 'desktop', 80)).toContain('Willkommen bei GlanceFlow')
  const narrow = await texts($, 'desktop', 30)
  expect(narrow).toContain('Willkommen')
  expect(narrow).not.toContain('Willkommen bei GlanceFlow')

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const words = (await ui.findAll({ type: 'Box' })).find(one => one.props.key === 'tour-text')
  const alts = (await ui.findAll({ type: 'Svg' })).map(one => String(one.props.alt))
  await ui.unmount()
  expect(JSON.stringify(words ?? null)).not.toContain('"type":"Svg"')
  // The mark beside "Welcome to GlanceFlow" says Status, as every header's does, so Welcome is heard once.
  expect(alts).toContain('Status')
  expect(alts).not.toContain('Willkommen')
})

test('in the Desktop app a line under a step starts in empty room as wide as a mark, so a screen reader hears no blank', async ($, on) => {
  world(on)
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5-20251001', agentId: 'a1' }) as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Check the page', 'Fix the links'] })
  await callTool($, { tool: 'Bash', command: 'npx playwright test', description: 'Check the page on a phone screen' })
  await $.agent.spawn({
    tool_use_id: 'tu1', prompt: 'Review it', description: 'Review the page', subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: true, fork: false,
  } as never)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const boxes = await band.findAll({ type: 'Box' })
  const alts = (await band.findAll({ type: 'Svg' })).map(one => String(one.props.alt))
  await band.unmount()
  type Drawn = { type: string; props: Record<string, unknown>; children?: Drawn[] }
  const first = (key: string) => (boxes.find(one => one.props.key === key) as unknown as Drawn | undefined)?.children?.[0]
  expect(first('helper-a1')).toEqual({ type: 'Box', props: { width: 2, flexShrink: 0 } })
  expect(first('task-0')?.props).toEqual({ width: 2, flexShrink: 0 })
  expect(alts).not.toContain('Detail')
  expect(alts).not.toContain('Helfer')

  await detailsOn($)
  const plan = await $.ui.mount({ ...PLAN_PANE, surface: 'desktop' })
  const planAlts = (await plan.findAll({ type: 'Svg' })).map(one => String(one.props.alt))
  await plan.unmount()
  expect(planAlts).not.toContain('Detail')
})

test('in the Desktop app no mark says again what the words beside it say, in the band, the Plan or History', async ($, on) => {
  world(on)
  historyWorld(on, { cwd: '/work/landing-site' })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  const drawn = async (mount: Parameters<Engine['ui']['mount']>[0]) => {
    const ui = await $.ui.mount(mount)
    const boxes = await ui.findAll({ type: 'Box' })
    await ui.unmount()
    return boxes
  }
  const noticeOf = (boxes: unknown[]) => (boxes as Drawn[]).find(one => one.props.key === 'limit')?.children?.[0]
  const measure = (context: number, limit: number) =>
    $.session.measure({
      context: { window: 200_000, tokens: context * 2000, percent: context },
      rateLimits: [{ kind: 'five_hour', percentUsed: limit }],
      changed: ['context', 'rateLimits'],
    } as never)

  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  await callTool($, { tool: PROGRESS, task: 'Write the page', percent: 40 })
  // The bar says 40%; the mark beside the step's name says Now.
  expect(echoes(await drawn({ ...BAND, surface: 'desktop' }))).toEqual([])
  expect(echoes(await drawn({ ...PLAN_PANE, surface: 'desktop' }))).toEqual([])

  // A notice's words say what it is: its mark says Notice. A full chat makes none: that is the Statistik mod's.
  await measure(60, 10)
  let band = await drawn({ ...BAND, surface: 'desktop' })
  expect(echoes(band)).toEqual([])
  expect(noticeOf(band)).toBeUndefined()
  await measure(10, 85)
  band = await drawn({ ...BAND, surface: 'desktop' })
  expect(echoes(band)).toEqual([])
  expect(JSON.stringify(noticeOf(band))).toContain('"alt":"Hinweis"')
  await detailsOn($)
  await measure(10, 20)
  band = await drawn({ ...BAND, surface: 'desktop' })
  expect(echoes(band)).toEqual([])
  expect(JSON.stringify(noticeOf(band))).toContain('"alt":"Hinweis"')

  // History with nothing saved says so in words; its mark says Notice, History being the panel's title, read just before.
  await $.command.run({ command: 'glanceflow', args: 'history' } as never)
  const history = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const alts = (await history.findAll({ type: 'Svg' })).map(one => String(one.props.alt))
  const words = (await history.findAll({ type: 'Text' })).map(one => one.text).join('\n')
  await history.unmount()
  expect(words).toContain('noch keine Aufgaben gespeichert')
  expect(alts).toEqual(['Hinweis'])
})

test("in the Desktop app a panel's marks say neither its title nor the words beside them: Settings, Where we left off, an empty Plan", async ($, on) => {
  world(on)
  const read = async (requestId: string, title: string) => {
    const ui = await $.ui.mount({ ...PANE, requestId, props: { ...PANE.props, title }, surface: 'desktop' } as never)
    const boxes = await ui.findAll({ type: 'Box' })
    const alts = (await ui.findAll({ type: 'Svg' })).map(one => String(one.props.alt))
    await ui.unmount()
    return { echoes: echoes(boxes), alts, titled: alts.filter(alt => title.toLowerCase().includes(alt.toLowerCase())) }
  }

  // Each setting's mark says Setting; its name follows once, in bold.
  const settings = await read('glanceflow-settings', 'GlanceFlow-Einstellungen')
  expect(settings.echoes).toEqual([])
  expect(settings.alts.length > 0 && settings.alts.every(alt => alt === 'Einstellung')).toBe(true)

  // With no checkpoint yet the words say so; the mark says Notice, not Checkpoint again.
  const recap = await read('glanceflow-recap', 'Letzter Stand')
  expect(recap.echoes).toEqual([])
  expect(recap.titled).toEqual([])
  expect(recap.alts).toEqual(['Hinweis'])

  // An empty Plan: the panel's title says Plan, the words say there is none yet.
  const plan = await read('glanceflow-plan', 'Plan')
  expect(plan.echoes).toEqual([])
  expect(plan.titled).toEqual([])
  expect(plan.alts).toEqual(['Hinweis'])
})

test('in the Desktop app a header keeps whole pieces: what has no room is left out, never cut mid-word', async ($, on) => {
  expect(wholePieces(['Build my landing page', 'took 3m 46s'], 30)).toBe('Build my landing page')
  expect(wholePieces(['Build my landing page', 'took 3m 46s'], 20)).toBe('took 3m 46s')
  expect(wholePieces(['Should I release 0.24.0 now?'], 18)).toBe('Should I release…')
  expect(wholePieces(['Build my landing page'], 5)).toBe('')

  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  await callTool($, { tool: PROGRESS, task: 'Write it', percent: 100 })
  await callTool($, { tool: PROGRESS, task: 'Check it', percent: 100 })
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  for (const width of [30, 44, 60]) {
    const header = (await texts($, 'desktop', width)).find(one => one.startsWith('Fertig')) ?? ''
    expect(header).not.toContain('…')
  }
})

test('in the Desktop app a usage limit offers Check again, and a stopped job offers Fresh chat, full chat or not', async ($, on) => {
  world(on)
  on('classic.StopFailure', () => ({}) as never)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  await $.classic.StopFailure({ error: 'rate_limit', error_details: '' } as never)
  const stuck = (await texts($, 'desktop')).join('\n')
  expect(stuck).toContain('Erneut prüfen')
  expect(stuck).not.toContain('Erneut versuchen')

  await $.turn.start({ text: 'continue', turnId: 't2' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't2', reason: 'aborted' })
  expect((await texts($, 'desktop')).join('\n')).toContain('Neuer Chat')
  await $.session.measure({ context: { window: 200_000, tokens: 120_000, percent: 60 }, rateLimits: [], changed: ['context'] } as never)
  const full = (await texts($, 'desktop')).join('\n')
  expect(full).not.toContain('Jetzt aufräumen')
  expect(full).toContain('Neuer Chat')
  expect(full).toMatch(/^Weiter$/m)
})

test('another mod that draws only buttons joins the actions; anything with words, or nothing, does not', () => {
  const button = (label: string) => ({ type: 'Button', props: { key: label, label } })
  expect(isButtonsOnly(button('Replay 1 edit'))).toBe(true)
  expect(isButtonsOnly({ type: 'Box', props: {}, children: [button('One'), { type: 'Box', props: {}, children: [button('Two')] }] })).toBe(true)
  expect(isButtonsOnly({ type: 'Box', props: {}, children: [{ type: 'Text', props: {}, children: ['▶ Replay: 1 edit (press r)'] }, button('Replay')] })).toBe(false)
  expect(isButtonsOnly({ type: 'Box', props: {}, children: [] })).toBe(false)
  expect(isButtonsOnly(null)).toBe(false)

  // Stacked under another mod's row (the next-steps suggestions, say), Replay still comes out; the row stays.
  const row = { type: 'Box', props: { flexDirection: 'row' }, children: [{ type: 'Text', props: {}, children: ['Try asking'] }, button('Run the tests')] }
  expect(liftButtons({ type: 'Box', props: { flexDirection: 'column' }, children: [button('Replay 1 edit'), row] })).toEqual({
    buttons: [button('Replay 1 edit')],
    rest: { type: 'Box', props: { flexDirection: 'column' }, children: [row] },
  })
  expect(liftButtons(row)).toEqual({ buttons: [], rest: row })

  // In a narrow band next-steps puts its lead on a line of its own over a column of button rows: those rows are its
  // own group and stay with "Try asking"; only Replay, a button on its own, comes up.
  const stacked = {
    type: 'Box',
    props: { flexDirection: 'column' },
    children: [
      { type: 'Box', props: { flexShrink: 0 }, children: [{ type: 'Text', props: {}, children: ['Try asking'] }] },
      { type: 'Box', props: { flexDirection: 'column' }, children: [{ type: 'Box', props: { flexDirection: 'row' }, children: [button('Run the tests')] }, { type: 'Box', props: { flexDirection: 'row' }, children: [button('Review it'), button('Hide')] }] },
    ],
  }
  expect(liftButtons({ type: 'Box', props: { flexDirection: 'column' }, children: [button('Replay 1 edit'), stacked] })).toEqual({
    buttons: [button('Replay 1 edit')],
    rest: { type: 'Box', props: { flexDirection: 'column' }, children: [stacked] },
  })
  expect(liftButtons({ type: 'Box', props: { flexDirection: 'column' }, children: [button('One'), button('Two')] }).buttons).toHaveLength(2)
  expect(liftButtons(null)).toEqual({ buttons: [], rest: null })
})

/** Symbols Unicode 16 draws two cells wide (East Asian Width W) while Claude Code counts one, so a row holding one shifts. */
const WIDE_SYMBOLS =
  /[⌚-⌛〈-〉⏩-⏬⏰⏳◽-◾☔-☕☰-☷♈-♓♿⚊-⚏⚓⚡⚪-⚫⚽-⚾⛄-⛅⛎⛔⛪⛲-⛳⛵⛺⛽✅✊-✋✨❌❎❓-❕❗➕-➗➰➿⬛-⬜⭐⭕]/

test('the band and History draw only symbols every terminal counts as one cell', async ($, on) => {
  world(on)
  historyWorld(on, { cwd: '/work/landing-site' })
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  await $.command.run({ command: 'glanceflow', args: 'history' } as never)
  const shown = [...(await texts($, 'terminal')), ...(await paneTexts($))]
  expect(shown.filter(text => WIDE_SYMBOLS.test(text))).toEqual([])

  // The day picker's label has no colon of its own; the terminal draws "Tag: Heute, …".
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const [day] = await ui.findAll({ type: 'Select' })
  await ui.unmount()
  expect((day?.props as { label?: string } | undefined)?.label).toBe('Tag')
})

/** The terminal's glyph marks and meters, which the desktop draws as SVG instead. */
const GLYPH_MARKS = /[✓✗▶◀‖■◷◐◑◒◓○●◎≣⚙↻▤⚠↳█░]/
const GEAR_LABEL = '\u2699\uFE0F'

test('on the desktop every mark is an SVG icon, and no text or button carries a glyph', async ($, on) => {
  world(on)
  historyWorld(on, { cwd: '/work/landing-site' })
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  await callTool($, { tool: PROGRESS, task: 'Write it', percent: 100, summary: 'Wrote the page' })
  await $.command.run({ command: 'glanceflow', args: 'history' } as never)
  const SETTINGS = { ...PANE, requestId: 'glanceflow-settings' } as const
  for (const target of [BAND, PLAN_PANE, PANE, SETTINGS]) {
    const ui = await $.ui.mount({ ...target, surface: 'desktop' } as never)
    const svgs = await ui.findAll({ type: 'Svg' })
    const buttons = await ui.findAll({ type: 'Button' })
    const words = [...(await ui.findAll({ type: 'Text' })), ...buttons].map(one => one.text)
    await ui.unmount()
    expect(svgs.length > 0).toBe(true)
    // A plain button reads as text in the desktop app: every one there is the app's own button.
    expect(buttons.filter(one => (one.props as { plain?: boolean }).plain).map(one => one.text)).toEqual([])
    expect(svgs.every(one => String(one.props.source).startsWith('<svg '))).toBe(true)
    // The settings gear is the one glyph, on purpose: a Button holds words, never a drawing.
    expect(words.filter(text => GLYPH_MARKS.test(text) && text !== GEAR_LABEL)).toEqual([])
  }
})

// A fixed amber or red can't follow the app's theme: on a light window those words fall under 4.5:1 contrast.
test('on the desktop Needs you and Stuck read in the text colour, with the colour in their icon', async ($, on) => {
  world(on)
  on('classic.StopFailure', () => ({}) as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  const leadColor = async (lead: string) => {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
    const found = (await ui.findAll({ type: 'Text' })).filter(one => one.text === lead)
    await ui.unmount()
    expect(found.length).toBe(1)
    return found[0]?.props.color
  }
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  expect(await leadColor('Braucht dich')).toBeUndefined()
  await $.classic.StopFailure({ error: 'rate_limit', error_details: '' } as never)
  expect(await leadColor('Hängt fest')).toBeUndefined()
})

// The desktop app draws nothing for an Svg whose alt is empty: a mark without words would just be missing.
test('on the desktop every drawing says what it is, in every state of the checklist and in every panel', async ($, on) => {
  world(on)
  historyWorld(on, { cwd: '/work/landing-site' })
  const SETTINGS = { ...PANE, requestId: 'glanceflow-settings' } as const
  const nameless = async (...targets: object[]) => {
    const found: string[] = []
    for (const target of targets) {
      const ui = await $.ui.mount({ ...target, surface: 'desktop' } as never)
      const svgs = await ui.findAll({ type: 'Svg' })
      await ui.unmount()
      found.push(...svgs.filter(one => String(one.props.alt ?? '').trim() === '').map(one => String(one.props.source).slice(0, 80)))
    }
    return found
  }
  expect(await nameless(BAND)).toEqual([])
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  await callTool($, { tool: PROGRESS, task: 'Write it', percent: 100, summary: 'Wrote the page' })
  await callTool($, { tool: 'Bash', command: 'npm run build' })
  await $.command.run({ command: 'glanceflow', args: 'details on' } as never)
  expect(await nameless(BAND, PLAN_PANE, SETTINGS)).toEqual([])
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  expect(await nameless(BAND, PLAN_PANE)).toEqual([])
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' })
  expect(await nameless(BAND, PLAN_PANE)).toEqual([])
  await $.turn.start({ text: 'continue', turnId: 't2' })
  await callTool($, { tool: PROGRESS, task: 'Check it', percent: 100 })
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  await $.command.run({ command: 'glanceflow', args: 'history' } as never)
  expect(await nameless(BAND, PLAN_PANE, PANE)).toEqual([])
})

test('the History button opens the panel; the day picker moves between days', async ($, on) => {
  const clock = mock.clock(on, { now: new Date(2026, 9, 6, 10, 0).getTime() })
  mock.store(on, {
    'history:2026-10-05': [
      { ...ENTRY, jobId: 'y', startedAt: new Date(2026, 9, 5, 15, 0).getTime(), finishedAt: new Date(2026, 9, 5, 15, 5).getTime(), title: 'Write the welcome email', outcome: 'done', stepsDone: 2, stepsTotal: 2, doneSteps: ['Draft it', 'Check it'], openSteps: [] },
    ],
  })
  let opened = 0
  on('session.cwd', () => ({ value: '/work/landing-site' }) as never)
  on('ui.open', () => {
    opened += 1
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await band.press({ key: 'history' })
  await band.unmount()
  expect(opened).toBe(1)

  let pane = (await paneTexts($)).join('\n')
  expect(pane).toContain(`landing-site · ${longDay(dayKey(clock.now()))}`)
  expect(pane).toContain('Für dieses Projekt sind an diesem Tag noch keine Aufgaben gespeichert.')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'earlier' })
  await ui.unmount()
  pane = (await paneTexts($)).join('\n')
  expect(pane).toContain('Write the welcome email')
  expect(pane).toContain(longDay('2026-10-05'))
  expect(pane).toContain('Später ▶')

  const picker = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await $.ui.select({ plugin: 'glanceflow', key: 'day', value: dayKey(clock.now()) })
  await picker.unmount()
  expect((await paneTexts($)).join('\n')).toContain('noch keine Aufgaben gespeichert')
  expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30')
})

test('Team report shows the report and copies it', async ($, on) => {
  mock.clock(on, { now: new Date(2026, 9, 6, 18, 0).getTime() })
  mock.store(on, {
    'history:2026-10-06': [
      { ...ENTRY, jobId: 'a', startedAt: new Date(2026, 9, 6, 9, 0).getTime(), finishedAt: new Date(2026, 9, 6, 9, 12).getTime(), title: 'Build the pricing section', outcome: 'done', stepsDone: 2, stepsTotal: 2, doneSteps: ['Write it', 'Check it'], openSteps: [] },
    ],
  })
  let copied = ''
  on('session.cwd', () => ({ value: '/work/landing-site' }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('ui.copy', (_, e) => {
    copied = e.text
    return { value: { isCopied: true } } as never
  })
  await $.command.run({ command: 'glanceflow', args: 'history' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'report' })
  await ui.unmount()
  expect(copied).toContain('Tagesbericht · landing-site')
  expect(copied).toContain('• Build the pricing section (12 Min.)')
  expect((await paneTexts($)).join('\n')).toContain('Tagesbericht · landing-site')
})

test('Fresh chat asks for a second press, then clears the chat and sends a handoff note', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('ui.toast', () => ({ value: undefined }) as never)
  let cleared = false
  let sent = ''
  on('model.fork', () => ({ value: { isAnswered: true, text: 'Fortsetzung aus einem früheren Chat. So ist der Stand: Das Menü ist repariert.', usage: {} } }) as never)
  on('command.run', (_, e) => {
    cleared = cleared || e.command === 'clear'
    return { text: '' }
  })
  on('prompt.submit', (_, e) => {
    sent = e.text
    return { text: e.text }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  // Fresh chat shows once the chat has some work in it.
  await $.turn.start({ text: 'Fix the menu', turnId: 't1' })

  const press = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'handoff' })
    await ui.unmount()
  }

  // One press only arms it, and it calms down again after 8 seconds.
  await press()
  expect((await texts($, 'terminal')).join('\n')).toContain('Noch mal drücken für neuen Chat')
  expect(cleared).toBe(false)
  await clock.advance(8000)
  expect((await texts($, 'terminal')).join('\n')).toContain('↻ Neuer Chat')

  // Two presses hand off.
  await press()
  await press()
  expect(cleared).toBe(true)
  expect(sent).toContain('Fortsetzung aus einem früheren Chat')
  expect((await texts($, 'terminal')).join('\n')).toContain('↻ Neuer Chat')
})

/** A finished job in a folder whose origin is `remote`, with what Ship it sends kept in `sent`. */
async function shipWorld($: Engine, on: On, remote: string, toolAnswer?: () => unknown) {
  const clock = world(on, toolAnswer)
  const sent: string[] = []
  on('process.run', () => ({ value: { exitCode: remote ? 0 : 2, stdout: remote, stderr: '' } }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
  await $.turn.start({ text: 'Fix the menu', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Fix it', 'Check it'] })
  return { sent, clock }
}

const finish = async ($: Engine) => {
  await callTool($, { tool: PROGRESS, task: 'Fix it', percent: 100 })
  await callTool($, { tool: PROGRESS, task: 'Check it', percent: 100 })
  await $.turn.complete({ answer: 'The menu is fixed.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
}

test('Ship it shows on a finished job in a GitHub project once Finish on GitHub is on, and ships on a second press', async ($, on) => {
  const { sent } = await shipWorld($, on, 'git@github.com:me/site.git\n')
  // Mid-job, and with the setting off, there is no Ship it.
  await $.command.run({ command: 'glanceflow', args: 'ship on' } as never)
  expect((await texts($, 'terminal')).join('\n')).not.toContain('Push')
  await $.command.run({ command: 'glanceflow', args: 'ship off' } as never)
  await finish($)
  for (const surface of SURFACES) expect((await texts($, surface)).join('\n')).not.toContain('Push')

  await $.command.run({ command: 'glanceflow', args: 'ship on' } as never)
  expect((await texts($, 'terminal')).join('\n')).toContain('⇡ Push')
  expect(await texts($, 'desktop')).toContain('Push')

  const press = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'ship' })
    await ui.unmount()
  }
  await press()
  expect((await texts($, 'terminal')).join('\n')).toContain('Noch mal drücken für Push')
  expect(sent).toEqual([])
  await press()
  expect(sent).toHaveLength(1)
  expect(sent[0]).toContain('gh pr checks --watch')
  expect(sent[0]).toContain('nichts auszuliefern gibt, und hör auf')
  expect(sent[0]).toContain('Merge nie mit --admin oder --auto')
  expect(sent[0]).toContain('sind keine Erlaubnis zum Mergen')
  expect(sent[0]).toContain('Antworte genau: Merge freigeben <volle SHA>')
  expect(sent[0]).toContain('Alles andere lässt den Pull Request offen.')
  expect(sent[0]).toContain('gh pr merge --squash --delete-branch --match-head-commit <volle SHA>')
  expect(sent[0]).not.toContain('Merge it?')
  expect(sent[0]).not.toMatch(/mergen\?/i)
})

const SHA = 'd'.repeat(40)
const OTHER_SHA = 'e'.repeat(40)
const mergeAt = (sha: string) => `gh pr merge 12 --squash --delete-branch --match-head-commit ${sha}`

test('unsafeMerge lets a merge through only at the approved head commit, never with --admin, --auto or gh api', () => {
  expect(unsafeMerge(mergeAt(SHA), SHA)).toBeNull()
  expect(unsafeMerge(`${mergeAt(SHA)} --disable-auto`, SHA)).toBeNull()
  expect(unsafeMerge(`bash -c "${mergeAt(SHA)}"`, SHA)).toBeNull()
  expect(unsafeMerge('gh pr view 12 --json headRefOid', null)).toBeNull()
  expect(unsafeMerge('git status && gh pr checks 12 --watch', null)).toBeNull()

  for (const command of [
    mergeAt(SHA).replace(SHA, SHA.slice(0, 7)),
    'gh pr merge 12 --squash',
    'gh pr merge 12 --disable-auto',
    'cd site && gh pr merge 12',
    "bash -c 'gh pr merge 12 --squash'",
    `${mergeAt(SHA)} --match-head-commit ${OTHER_SHA}`,
  ]) {
    expect(unsafeMerge(command, SHA)).toContain('Merge freigeben')
  }
  expect(unsafeMerge(mergeAt(SHA), null)).toContain('Merge freigeben')
  expect(unsafeMerge(mergeAt(SHA), OTHER_SHA)).toContain('Merge freigeben')
  expect(unsafeMerge(`${mergeAt(SHA)} --admin`, SHA)).toContain('--admin oder --auto')
  expect(unsafeMerge(`${mergeAt(SHA)} --auto`, SHA)).toContain('--admin oder --auto')
  expect(unsafeMerge('gh api -X PUT repos/me/site/pulls/12/merge', SHA)).toContain('gh api')
  expect(unsafeMerge("gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'", SHA)).toContain('gh api')

  for (const command of [
    'gh pr merge 12',
    'cd site && gh pr merge 12',
    'git status; gh pr merge 12',
    'bash -c "gh pr merge 12"',
    "sh -c 'gh pr merge 12'",
    'zsh -c "gh pr merge 12"',
    'bash -c "cd site && gh pr merge 12"',
  ]) {
    expect(runsPrMerge(command)).toBe(true)
    expect(unsafeMerge(command, SHA)).toContain('Merge freigeben')
  }
  for (const command of [
    'git commit -m "docs | gh pr merge later"',
    'git commit -m "docs; gh pr merge later"',
    "git commit -m 'docs && gh pr merge later'",
    'echo "gh pr merge later"',
    'grep "gh pr merge" README.md',
    'gh pr view 12 --json headRefOid',
    'git commit -m "run sudo gh pr merge later"',
    "echo 'env gh pr merge'",
    'git commit -m "wrap it in bash -c gh pr merge"',
  ]) {
    expect(runsPrMerge(command)).toBe(false)
    expect(unsafeMerge(command, null)).toBeNull()
  }
  expect(runsPrMerge(`bash -c "${mergeAt(SHA)}"`)).toBe(true)
  expect(unsafeMerge(`bash -c "${mergeAt(SHA)}"`, SHA)).toBeNull()
})

// gh api calls that merge, or schedule a merge, without gh pr merge: auto-merge, the merge queue and branch merges.
const API_MERGES = [
  "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }'",
  "gh api graphql -f query='mutation { enqueuePullRequest(input: {}) { clientMutationId } }'",
  "gh api graphql -f query='mutation { mergeBranch(input: {}) { clientMutationId } }'",
  'gh api -X POST repos/me/site/merges -f base=master -f head=fix',
  'gh api --method POST /repos/{owner}/{repo}/merges -f base=master -f head=fix',
]

test('unsafeMerge refuses gh api auto-merge, merge-queue and branch-merge routes, bare or wrapped, approved or not', () => {
  for (const command of API_MERGES) {
    for (const wrapped of [
      command,
      `(${command})`,
      `env ${command}`,
      `command ${command}`,
      `sudo ${command}`,
      `exec ${command}`,
      `time ${command}`,
      `GH_REPO=me/site ${command}`,
      `{ ${command}; }`,
      `/usr/local/bin/${command}`,
      `eval "${command}"`,
      `bash -c "${command}"`,
      `sudo bash -c "${command}"`,
    ]) {
      expect(runsPrMerge(wrapped)).toBe(false)
      expect(unsafeMerge(wrapped, null)).not.toBeNull()
      expect(unsafeMerge(wrapped, SHA)).not.toBeNull()
    }
    expect(unsafeMerge(command, SHA)).toContain('nie über gh api')
  }

  for (const command of [
    "gh api graphql -f query='mutation { disablePullRequestAutoMerge(input: {}) { clientMutationId } }'",
    "gh api graphql -f query='query { repository(owner: \"me\", name: \"site\") { pullRequest(number: 12) { mergeable autoMergeRequest { enabledAt } } } }'",
    'gh api repos/me/site/pulls/12',
    'gh api repos/me/site/contents/docs/merges.md',
    'git commit -m "refuse enablePullRequestAutoMerge and repos/o/r/merges"',
  ]) {
    expect(unsafeMerge(command, null)).toBeNull()
    expect(unsafeMerge(command, SHA)).toBeNull()
  }
})

// gh pr merge, or a gh api merge route, run through a shell wrapper instead of on its own.
const WRAPPED_MERGES = [
  `(${mergeAt(SHA)})`,
  `! ${mergeAt(SHA)}`,
  `env ${mergeAt(SHA)}`,
  `env GH_TOKEN=x ${mergeAt(SHA)}`,
  `command ${mergeAt(SHA)}`,
  `sudo ${mergeAt(SHA)}`,
  `sudo -u me ${mergeAt(SHA)}`,
  `exec ${mergeAt(SHA)}`,
  `time ${mergeAt(SHA)}`,
  `GH_REPO=me/site ${mergeAt(SHA)}`,
  `{ ${mergeAt(SHA)}; }`,
  `/usr/local/bin/${mergeAt(SHA)}`,
  `\\${mergeAt(SHA)}`,
  `sudo bash -c "${mergeAt(SHA)}"`,
  `bash -lc "${mergeAt(SHA)}"`,
  `eval "${mergeAt(SHA)}"`,
  `bash -c "env ${mergeAt(SHA)}"`,
  'echo 12 | xargs gh pr merge --squash',
  '(gh api -X PUT repos/me/site/pulls/12/merge)',
  'env gh api -X PUT repos/me/site/pulls/12/merge',
  'command gh api -X PUT repos/me/site/pulls/12/merge',
  "sudo gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'",
  'eval "gh api -X PUT repos/me/site/pulls/12/merge"',
]

test('unsafeMerge refuses gh pr merge and gh api merges run through a shell wrapper, approved or not', () => {
  for (const command of WRAPPED_MERGES) {
    expect(unsafeMerge(command, null)).not.toBeNull()
    expect(unsafeMerge(command, SHA)).not.toBeNull()
  }
  expect(unsafeMerge(`env ${mergeAt(SHA)}`, SHA)).toContain('direkt ausgeführt')
})

test('unsafeMerge refuses an approved merge that shares its command with anything that could hide its exit code', () => {
  expect(unsafeMerge(`  ${mergeAt(SHA)}\n`, SHA)).toBeNull()
  for (const command of [
    `${mergeAt(SHA)}; echo "exit=$?"`,
    `${mergeAt(SHA)}; true`,
    `${mergeAt(SHA)} || true`,
    `${mergeAt(SHA)} | cat`,
    `${mergeAt(SHA)} && echo ok`,
    `${mergeAt(SHA)} &`,
    `${mergeAt(SHA)};`,
    `git status; ${mergeAt(SHA)}`,
    `bash -c "${mergeAt(SHA)}; true"`,
    `bash -c "${mergeAt(SHA)}"; echo done`,
  ]) {
    expect(runsPrMerge(command)).toBe(true)
    expect(unsafeMerge(command, SHA)).toContain('allein aus')
  }
  // Without the approval, the approval comes first.
  expect(unsafeMerge(`${mergeAt(SHA)}; true`, null)).toContain('Merge freigeben')
})

// curl and wget calls to the REST pull and branch merges and the four GraphQL merge mutations.
const HTTP_MERGES = [
  'curl -X PUT https://api.github.com/repos/me/site/pulls/12/merge',
  'wget --method=PUT -O- https://api.github.com/repos/me/site/pulls/12/merge',
  `curl -X POST https://api.github.com/repos/me/site/merges -d '{"base":"master","head":"fix"}'`,
  `wget --method=POST --body-data='{"base":"master","head":"fix"}' https://api.github.com/repos/me/site/merges`,
  ...['mergePullRequest', 'enablePullRequestAutoMerge', 'enqueuePullRequest', 'mergeBranch'].flatMap(mutation => [
    `curl -X POST -d '{"query":"mutation { ${mutation}(input: {}) { clientMutationId } }"}' https://api.github.com/graphql`,
    `wget --post-data='{"query":"mutation { ${mutation}(input: {}) { clientMutationId } }"}' https://api.github.com/graphql`,
  ]),
]
const HTTP_REFUSAL = 'Ausliefern mergt nur mit gh pr merge --match-head-commit, nie über curl oder wget. Lass den Pull Request offen.'

test('unsafeMerge refuses curl and wget merge calls, bare, wrapped, continued, in a heredoc or through a literal variable', () => {
  for (const command of HTTP_MERGES) {
    for (const wrapped of [
      command,
      `(${command})`,
      `{ ${command}; }`,
      `! ${command}`,
      `env ${command}`,
      `env -i ${command}`,
      `command ${command}`,
      `sudo ${command}`,
      `sudo -u me ${command}`,
      `exec ${command}`,
      `time ${command}`,
      `GH_TOKEN=x ${command}`,
      `/usr/bin/${command}`,
      `\\${command}`,
      `cd site && ${command}`,
      `git status; ${command}`,
      `echo ok | xargs ${command}`,
      `if ${command}; then echo ok; fi`,
      `for i in 1; do ${command}; done`,
      `R=$(${command})`,
      `R=\`${command}\``,
      `eval ${command}`,
      `eval ${JSON.stringify(command)}`,
      `bash -c ${JSON.stringify(command)}`,
      `bash -lc ${JSON.stringify(command)}`,
      `sh -c ${JSON.stringify(command)}`,
      `zsh -c ${JSON.stringify(command)}`,
      `sudo bash -c ${JSON.stringify(command)}`,
    ]) {
      expect(runsPrMerge(wrapped)).toBe(false)
      expect(unsafeMerge(wrapped, null)).toBe(HTTP_REFUSAL)
      expect(unsafeMerge(wrapped, SHA)).toBe(HTTP_REFUSAL)
    }
  }
  expect(unsafeMerge("bash -c 'curl -X PUT https://api.github.com/repos/me/site/pulls/12/merge'", SHA)).toBe(HTTP_REFUSAL)

  for (const command of [
    // Continued lines and several lines.
    'curl -X PUT \\\n  https://api.github.com/repos/me/site/pulls/12/merge',
    'curl \\\n  -X PUT \\\n  https://api.github.com/repos/me/site/pulls/12/merge',
    'wget \\\n  --method=PUT https://api.github.com/repos/me/site/pulls/12/merge',
    'GH_TOKEN=x \\\n  curl -X POST https://api.github.com/repos/me/site/merges',
    'git fetch\ncurl -X PUT https://api.github.com/repos/me/site/pulls/12/merge',
    // A heredoc body in the same command.
    `curl -X POST https://api.github.com/graphql --data-binary @- <<'EOF'\n{"query":"mutation { mergePullRequest(input: {}) { clientMutationId } }"}\nEOF`,
    `wget --post-file=/dev/stdin -O- https://api.github.com/graphql <<EOF\n{"query":"mutation { enqueuePullRequest(input: {}) { clientMutationId } }"}\nEOF`,
    // A literal route kept in a variable.
    'URL=https://api.github.com/repos/me/site/pulls/12/merge; curl -X PUT "$URL"',
    'URL=https://api.github.com/repos/me/site/merges curl -X POST "$URL"',
    'export URL=https://api.github.com/repos/me/site/pulls/12/merge && wget --method=PUT "$URL"',
    `Q='mutation { mergeBranch(input: {}) { clientMutationId } }'\ncurl -d "{\\"query\\":\\"$Q\\"}" https://api.github.com/graphql`,
  ]) {
    expect(unsafeMerge(command, null)).toBe(HTTP_REFUSAL)
    expect(unsafeMerge(command, SHA)).toBe(HTTP_REFUSAL)
  }

  for (const command of [
    'curl -s https://api.github.com/repos/me/site/pulls/12',
    'wget -qO- https://api.github.com/repos/me/site/pulls/12',
    'curl -s https://api.github.com/repos/me/site/pulls/12/merged',
    'curl -s https://api.github.com/repos/me/site/contents/docs/merges.md',
    'wget -qO- https://api.github.com/repos/me/site/contents/docs/merges.md',
    `curl -d '{"query":"query { repository(owner: \\"me\\", name: \\"site\\") { pullRequest(number: 12) { mergeable autoMergeRequest { enabledAt } } } }"}' https://api.github.com/graphql`,
    `curl -d '{"query":"mutation { disablePullRequestAutoMerge(input: {}) { clientMutationId } }"}' https://api.github.com/graphql`,
    'curlie -X PUT https://api.github.com/repos/me/site/pulls/12/merge',
    'echo curl https://api.github.com/repos/o/r/pulls/12/merge',
    'echo wget --method=PUT https://api.github.com/repos/o/r/merges',
    'echo eval curl https://api.github.com/repos/o/r/pulls/12/merge',
    'grep mergePullRequest file.txt',
    'grep -rn "curl -X PUT https://api.github.com/repos/o/r/pulls/12/merge" docs',
    'echo "curl -X PUT https://api.github.com/repos/o/r/pulls/12/merge"',
    "echo 'wget --post-data=mergePullRequest https://api.github.com/graphql'",
    'git commit -m "Refuse curl -X PUT https://api.github.com/repos/o/r/pulls/12/merge"',
    "git commit -m 'block wget calls to repos/o/r/merges'",
    'bash -c "echo curl https://api.github.com/repos/o/r/pulls/12/merge"',
  ]) {
    expect(unsafeMerge(command, null)).toBeNull()
    expect(unsafeMerge(command, SHA)).toBeNull()
  }
})

const API_REFUSAL = 'Ausliefern mergt nur mit gh pr merge --match-head-commit, nie über gh api. Lass den Pull Request offen.'

// gh api GraphQL merge mutations whose body gh api reads from stdin: a heredoc, a pipe, or -F query=@-.
const STDIN_MERGES = ['mergePullRequest', 'enablePullRequestAutoMerge', 'enqueuePullRequest', 'mergeBranch'].flatMap(mutation => {
  const query = `mutation { ${mutation}(input: {}) { clientMutationId } }`
  const body = `{"query":"${query}"}`
  return [
    `gh api graphql --input - <<EOF\n${body}\nEOF`,
    `gh api graphql --input - <<'EOF'\n${body}\nEOF`,
    `echo '${body}' | gh api graphql --input -`,
    `cat <<EOF | gh api graphql --input -\n${body}\nEOF`,
    `gh api graphql -F query=@- <<'EOF'\n${query}\nEOF`,
    `env gh api graphql --input - <<EOF\n${body}\nEOF`,
  ]
})
const STDIN_QUERY = `gh api graphql --input - <<'EOF'\n{"query":"query { viewer { login } }"}\nEOF`

test('unsafeMerge refuses gh api GraphQL merge mutations sent through stdin, approved or not, and leaves harmless ones alone', () => {
  for (const command of STDIN_MERGES) {
    expect(runsPrMerge(command)).toBe(false)
    expect(unsafeMerge(command, null)).toBe(API_REFUSAL)
    expect(unsafeMerge(command, SHA)).toBe(API_REFUSAL)
  }

  for (const command of [
    STDIN_QUERY,
    `gh api graphql -F query=@- <<'EOF'\nquery { repository(owner: "me", name: "site") { pullRequest(number: 12) { mergeable mergeStateStatus autoMergeRequest { enabledAt } } } }\nEOF`,
    `gh api graphql --input - <<'EOF'\n{"query":"mutation { addComment(input: {subjectId: \\"x\\", body: \\"hi\\"}) { clientMutationId } }"}\nEOF`,
    `gh api graphql --input - <<'EOF'\n{"query":"mutation { disablePullRequestAutoMerge(input: {}) { clientMutationId } }"}\nEOF`,
    `echo '{"title":"New title"}' | gh api -X PATCH repos/me/site/pulls/12 --input -`,
    'gh api repos/me/site/pulls/12 --jq .mergeable',
    'git commit -m "guard gh api graphql --input - with mergePullRequest"',
    'echo "gh api graphql --input - mergePullRequest"',
    'grep -rn "gh api graphql --input -" docs | grep mergePullRequest',
    `cat > notes.md <<'EOF'\nmergePullRequest\nEOF`,
  ]) {
    expect(unsafeMerge(command, null)).toBeNull()
    expect(unsafeMerge(command, SHA)).toBeNull()
  }
})

// shellPieces reads a command into the words Bash passes on: [command, words of each piece, run-time words].
const SHELL_WORDS: [string, string[][], string[]][] = [
  ['gh pr merge 12', [['gh', 'pr', 'merge', '12']], []],
  ['"gh" pr merge', [['gh', 'pr', 'merge']], []],
  [`g''h p"r" mer'g'e`, [['gh', 'pr', 'merge']], []],
  ['gh \\\npr \\\nmerge', [['gh', 'pr', 'merge']], []],
  ['g\\\nh pr', [['gh', 'pr']], []],
  ['\\gh pr \\merge', [['gh', 'pr', 'merge']], []],
  [`gh pr $'\\x6d'erge`, [['gh', 'pr', 'merge']], []],
  [`gh pr $'\\155'erge`, [['gh', 'pr', 'merge']], []],
  [`$'a\\tb' $'it\\'s' $'\\\\'`, [['a\tb', "it's", '\\']], []],
  ['"a\\"b\\\\c\\$d\\`e\\x"', [['a"b\\c$d`e\\x']], []],
  [`'a\\b' 'it'"'"'s'`, [['a\\b', "it's"]], []],
  [`--ad''min --match-head-commit=b"bb"`, [['--admin', '--match-head-commit=bbb']], []],
  ['"a b"c d""e "" \'\'', [['a bc', 'de', '', '']], []],
  ['gh api repos/{owner}/{repo}/pulls x=$ \\$X \'$X\'', [['gh', 'api', 'repos/{owner}/{repo}/pulls', 'x=$', '$X', '$X']], []],
  ['a;b && c|d || e & f\ng', [['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g']], []],
  ['"a;b" \'c|d\' e\\;f', [['a;b', 'c|d', 'e;f']], []],
  ['(gh pr) >out <in', [['(', 'gh', 'pr', ')', '>', 'out', '<', 'in']], []],
  ['echo "$(cat <<\'EOF\'\nx; y\nEOF\n)"', [['echo', '$(cat <<\'EOF\'\nx; y\nEOF\n)']], ['$(cat <<\'EOF\'\nx; y\nEOF\n)']],
  ['$X "$X" ${X} `x` $(x) mer$()ge', [['$X', '$X', '${X}', '`x`', '$(x)', 'mer$()ge']], ['$X', '$X', '${X}', '`x`', '$(x)', 'mer$()ge']],
  ['{merge,} {1..3} mer*e m?rge [m]erge ~/gh =gh', [['{merge,}', '{1..3}', 'mer*e', 'm?rge', '[m]erge', '~/gh', '=gh']], ['{merge,}', '{1..3}', 'mer*e', 'm?rge', '[m]erge', '~/gh', '=gh']],
  [`$"x" $'\\u006d' [ [[ ] { }`, [['x', '\\u006d', '[', '[[', ']', '{', '}']], ['x', '\\u006d']],
  ["gh pr view # it's a#b\ngh mm a#b", [['gh', 'pr', 'view'], ['gh', 'mm', 'a#b']], []],
]

test('shellPieces rebuilds Bash words from quotes, escapes, continued lines and $\'…\', and marks words built at run time', () => {
  for (const [command, words, runTime] of SHELL_WORDS) {
    const pieces = shellPieces(command)
    expect([command, pieces.map(piece => piece.words.map(word => word.text))]).toEqual([command, words])
    expect([command, pieces.flatMap(piece => piece.words.filter(word => word.isRunTime).map(word => word.text))]).toEqual([command, runTime])
  }
  // A heredoc's lines are its body, not commands of their own, and its own quoting does not carry past them.
  const heredoc = shellPieces(`cat <<'EOF'\nit's {a,b}\nEOF\necho ok`)
  expect(heredoc.map(piece => [piece.isBody, piece.words.map(word => word.text)])).toEqual([
    [false, ['cat', '<<', 'EOF']],
    [true, ['its {a,b}']],
    [false, ['echo', 'ok']],
  ])
  expect(shellPieces('cat <<-EOF\n\tbody\n\tEOF\necho ok').map(piece => piece.isBody)).toEqual([false, true, false])
})

// gh pr merge spelled the way Bash rebuilds it: quoted or escaped words, continued lines, $'…' and -R / --repo first.
const SPELLED_MERGES = [
  '"gh" pr merge 12 --squash',
  `g''h pr merge 12 --squash`,
  'gh "pr" merge 12 --squash',
  `gh pr mer''ge 12 --squash`,
  'gh pr mer"ge" 12 --squash',
  'gh pr \\merge 12 --squash',
  `gh pr $'\\x6d'erge 12 --squash`,
  'gh \\\npr merge 12 --squash',
  'gh pr \\\nmerge 12 --squash',
  'gh -R me/site pr merge 12 --squash',
  'gh --repo me/site pr merge 12 --squash',
  'gh --repo=me/site pr merge 12 --squash',
]
// The sanctioned merge with something hidden in it: --admin or --auto, another head commit, a word gh pr merge does
// not take, or a word built at run time. Refused even at the approved head commit.
const HIDDEN_MERGES = [
  `${mergeAt(SHA)} --ad''min`,
  `${mergeAt(SHA)} --a"uto"`,
  `${mergeAt(SHA)} --\\admin`,
  `${mergeAt(SHA)} $'--\\x61dmin'`,
  `${mergeAt(SHA)} \\\n--admin`,
  `${mergeAt(SHA)} --admin=false`,
  `${mergeAt(SHA)} --match-head-commit e"${OTHER_SHA.slice(1)}"`,
  `${mergeAt(SHA)} --match-head-commit $'\\x65'${OTHER_SHA.slice(1)}`,
  `${mergeAt(SHA)} --mat''ch-head-commit ${OTHER_SHA}`,
  `${mergeAt(SHA)} --match-head-commit=${OTHER_SHA}`,
  `${mergeAt(SHA)} --match-head-commit`,
  `${mergeAt(SHA)} --match-head-commit "$HEAD"`,
  `${mergeAt(SHA)} $EXTRA`,
  `${mergeAt(SHA)} --unknown`,
  `${mergeAt(SHA)} -h`,
  `${mergeAt(SHA)} 13`,
  `bash -c "${mergeAt(SHA)} --ad\\\\min"`,
  `bash -c '${mergeAt(SHA)} --ad\\min'`,
  `bash -c "${mergeAt(SHA)} --match-head-commit e${OTHER_SHA.slice(1)}"`,
  `gh pr merge --match-head-commit ${SHA} -b= --match-head-commit ${OTHER_SHA}`,
  `gh pr merge 12 --body --admin --match-head-commit ${SHA}`,
  `gh pr merge 12 --match_head_commit ${OTHER_SHA} --match-head-commit ${SHA}`,
  `${mergeAt(SHA)} >merged.txt`,
]
// gh, or its first two words, built at run time: Bash could spell anything there, so Ship it refuses them.
const RUN_TIME_GH = [
  'gh pr {merge,} 12 --admin',
  'gh pr mer$()ge 12 --admin',
  'gh pr mer*e 12 --admin',
  'gh pr m?rge 12 --admin',
  'gh pr [m]erge 12 --admin',
  'gh pr $SUB 12',
  'gh "$PR" merge 12',
  'gh pr `echo merge` 12',
  'gh $(echo pr) merge 12',
  `gh pr $'\\u006d'erge 12`,
  '$GH pr merge 12',
  '"$GH" pr merge 12',
  'g$()h pr merge 12',
  '~/bin/gh mm 12',
  '=gh mm 12',
  'env $GH pr merge 12',
]
// gh with a first word that is not one of gh's own commands: an alias or extension could run a merge.
const UNKNOWN_GH = [
  'gh mm 12 --admin',
  'gh co 12',
  'gh my-ext merge 12',
  '"gh" mm 12',
  'gh -R me/site mm 12',
  'env gh mm 12',
  'sudo -u me gh mm 12',
  'bash -c "gh mm 12"',
  'eval "gh mm 12"',
  'gh \\\nmm 12',
  'gh extension exec mm 12',
  "git status # don't\ngh mm 12",
  'echo $("gh" mm 12)',
  'X=`g\'\'h mm 12`',
]
// gh pr with a flag before its subcommand: the guard does not guess how many words the flag takes, so gh could read
// the next one as merge. Refused, approved or not, -R and --repo included; before pr they stay allowed.
const PR_FLAG_FIRST = [
  'gh pr --body x merge 12 --admin',
  'gh pr -b x merge 12 --admin',
  'gh pr --subject x merge 12 --auto --squash',
  `gh pr --body x merge 12 --squash --delete-branch --match-head-commit ${SHA}`,
  `gh pr -b x merge 12 --squash --delete-branch --match-head-commit ${SHA}`,
  `"gh" pr --b''ody x merge 12 --squash --delete-branch --match-head-commit ${SHA}`,
  `gh pr -R me/site merge 12 --squash --delete-branch --match-head-commit ${SHA}`,
  `gh pr --repo=me/site merge 12 --squash --delete-branch --match-head-commit ${SHA}`,
  `gh pr -- merge 12 --squash --delete-branch --match-head-commit ${SHA}`,
  `bash -c "gh pr -b x merge 12 --squash --delete-branch --match-head-commit ${SHA}"`,
  'env gh pr -b x merge 12',
]
const MERGE_BODY = '{"query":"mutation{mergePullRequest(input:{pullRequestId:\\"X\\"}){clientMutationId}}"}'
// gh api and curl or wget merges whose command word Bash rebuilds: quoted, escaped, continued or after -R.
const SPELLED_API = [
  `"gh" api graphql --input - <<EOF\n${MERGE_BODY}\nEOF`,
  `gh \\\napi graphql --input - <<EOF\n${MERGE_BODY}\nEOF`,
  `g''h api -X PUT repos/me/site/pulls/12/merge`,
  'gh "api" -X PUT repos/me/site/pulls/12/merge',
  'gh -R me/site api -X PUT repos/{owner}/{repo}/pulls/12/merge',
  '"/usr/bin/gh" api -X PUT repos/me/site/pulls/12/merge',
]
const SPELLED_HTTP = [
  '"curl" -X PUT https://api.github.com/repos/me/site/pulls/12/merge',
  `cu''rl -X PUT https://api.github.com/repos/me/site/pulls/12/merge`,
  'cu\\\nrl -X PUT https://api.github.com/repos/me/site/pulls/12/merge',
  '"wget" --method=PUT https://api.github.com/repos/me/site/pulls/12/merge',
]
// Ordinary commands during Ship it that stay allowed: they read, mention or create, and never merge.
const WORD_HARMLESS = [
  'gh pr view 12 --json headRefOid,mergeable',
  'gh pr checks 12 --watch',
  'gh pr checks --watch',
  'gh -R me/site pr view 12',
  'gh api repos/{owner}/{repo}/pulls/12',
  'gh --version',
  'gh',
  `gh alias set mm 'pr merge'`,
  'gh pr create --title "Read gh pr merge as words" --body "Refuses gh pr merge --admin"',
  `git commit -m "$(cat <<'EOF'\nfix(ship): read gh pr merge as shell words\n\nNo --admin, no --auto.\nEOF\n)"`,
  `gh pr create --body-file - <<'EOF'\n## Why\n* gh is used; $5 a month\n{"a":1,"b":2}\nEOF`,
  'echo "gh pr merge 12 --admin"',
  `grep -rn 'gh pr merge' README.md`,
  'git status && git log --oneline -5',
  'for f in *.ts; do echo "$f"; done',
  'cd "$HOME/site" && npm test',
  'if [ -n "$CI" ]; then echo ci; fi',
  'ls ~/site *.md',
  `git commit -m "$(cat <<'EOF'\nIt's fine (really\nEOF\n)"`,
  'HEAD=$(gh pr view 12 --json headRefOid -q .headRefOid) && echo "$HEAD"',
]

test('unsafeMerge reads gh pr merge as shell words: spelled merges need the approval, and allowed ones count as merges', () => {
  for (const command of SPELLED_MERGES) {
    expect([command, runsPrMerge(command)]).toEqual([command, true])
    expect(unsafeMerge(command, null)).toContain('Merge freigeben')
    expect(unsafeMerge(command, SHA)).toContain('Merge freigeben')
    expect(unsafeMerge(`${command} --admin`, SHA)).toContain('--admin oder --auto')
    // The sanctioned merge, however Bash spells it, runs at the approved head commit and uses the approval.
    const sanctioned = `${command} --delete-branch --match-head-commit ${SHA}`
    expect([sanctioned, unsafeMerge(sanctioned, SHA)]).toEqual([sanctioned, null])
    expect(runsPrMerge(sanctioned)).toBe(true)
    expect(unsafeMerge(sanctioned, OTHER_SHA)).toContain('Merge freigeben')
    expect(unsafeMerge(`${sanctioned}; true`, SHA)).toContain('allein aus')
  }
  for (const command of [
    `"bash" -c "${mergeAt(SHA)}"`,
    `${mergeAt(SHA)} --match-head-commit=${SHA}`,
    `gh pr merge 12 -sd --match-head-commit "${SHA}"`,
    `${mergeAt(SHA)} \\\n`,
    `${mergeAt(SHA)} # a note`,
  ]) {
    expect([command, unsafeMerge(command, SHA)]).toEqual([command, null])
    expect(runsPrMerge(command)).toBe(true)
  }
})

test('unsafeMerge never lets an approval carry --admin, --auto, another head commit or a hidden word', () => {
  for (const command of HIDDEN_MERGES) {
    expect([command, unsafeMerge(command, SHA)]).not.toEqual([command, null])
    expect(unsafeMerge(command, null)).not.toBeNull()
  }
  for (const command of HIDDEN_MERGES.slice(0, 6)) expect(unsafeMerge(command, SHA)).toContain('--admin oder --auto')
  for (const command of HIDDEN_MERGES.slice(6, 11)) expect(unsafeMerge(command, SHA)).toContain('Merge freigeben')
  // A merge gh is reached through by a path, quoted or not, or after a wrapper, is a wrapper.
  for (const command of [`"/opt/homebrew/bin/gh" pr merge 12 --delete-branch --match-head-commit ${SHA}`, `env "gh" pr merge 12 --match-head-commit ${SHA}`, `watch "gh" pr merge 12`, 'X=$("gh" pr merge 12 --admin)']) {
    expect(unsafeMerge(command, SHA)).toContain('direkt ausgeführt')
  }
})

test('unsafeMerge refuses gh words built at run time and gh aliases or extensions, approved or not', () => {
  for (const command of RUN_TIME_GH) {
    expect([command, unsafeMerge(command, null)]).not.toEqual([command, null])
    expect(unsafeMerge(command, SHA)).not.toBeNull()
  }
  for (const command of RUN_TIME_GH) expect(unsafeMerge(command, SHA)).toContain('zur Laufzeit gebildet')
  for (const command of UNKNOWN_GH) {
    expect([command, unsafeMerge(command, null)]).not.toEqual([command, null])
    expect(unsafeMerge(command, SHA)).toContain('Alias oder eine Erweiterung')
  }
})

test('unsafeMerge refuses gh pr with a flag before its subcommand, approved or not, and keeps -R or --repo before pr', () => {
  for (const command of PR_FLAG_FIRST) {
    expect([command, unsafeMerge(command, null)]).not.toEqual([command, null])
    expect([command, unsafeMerge(command, SHA)]).toEqual([command, expect.stringContaining('direkt nach pr')])
  }
  for (const command of [
    mergeAt(SHA),
    `gh -R me/site pr merge 12 --squash --delete-branch --match-head-commit ${SHA}`,
    `gh --repo me/site pr merge 12 --squash --delete-branch --match-head-commit ${SHA}`,
  ]) {
    expect([command, unsafeMerge(command, SHA)]).toEqual([command, null])
    expect(runsPrMerge(command)).toBe(true)
  }
  expect(unsafeMerge('gh pr view 29 --json state', null)).toBeNull()
  expect(unsafeMerge('gh pr view 29 --json state', SHA)).toBeNull()
  expect(runsPrMerge('gh pr view 29 --json state')).toBe(false)
})

test('unsafeMerge refuses gh api, curl and wget merges whose command word is quoted, escaped or continued', () => {
  for (const command of SPELLED_API) {
    expect([command, runsPrMerge(command)]).toEqual([command, false])
    expect(unsafeMerge(command, null)).toBe(API_REFUSAL)
    expect(unsafeMerge(command, SHA)).toBe(API_REFUSAL)
  }
  for (const command of SPELLED_HTTP) {
    expect([command, unsafeMerge(command, null)]).toEqual([command, HTTP_REFUSAL])
    expect(unsafeMerge(command, SHA)).toBe(HTTP_REFUSAL)
  }
})

test('unsafeMerge leaves ordinary gh, git and shell commands alone while it reads words', () => {
  for (const command of WORD_HARMLESS) {
    expect([command, unsafeMerge(command, null)]).toEqual([command, null])
    expect(unsafeMerge(command, SHA)).toBeNull()
    expect(runsPrMerge(command)).toBe(false)
  }
})

test('askedMergeSha reads the full head commit from the approval line', () => {
  expect(askedMergeSha(`Checks passed.\nReply exactly: Approve merge ${SHA}\nAnything else leaves the pull request open.`)).toBe(SHA)
  expect(askedMergeSha(`Reply exactly: \`Approve merge ${SHA}\``)).toBe(SHA)
  expect(askedMergeSha(`Reply exactly: Approve merge ${OTHER_SHA}\nReply exactly: Approve merge ${SHA}`)).toBe(SHA)
  expect(askedMergeSha(`Reply exactly: Approve merge ${SHA.slice(0, 7)}`)).toBeNull()
  expect(askedMergeSha('All checks passed. Merge it?')).toBeNull()
})

test('askedMergeSha reads the German approval line too, as Ship it now asks for it', () => {
  expect(askedMergeSha(`Checks bestanden.\nAntworte genau: Merge freigeben ${SHA}\nAlles andere lässt den Pull Request offen.`)).toBe(SHA)
  expect(askedMergeSha(`Antworte genau: \`Merge freigeben ${SHA}\``)).toBe(SHA)
  expect(askedMergeSha(`Antworte genau mit: Merge freigeben ${SHA}`)).toBe(SHA)
  // The last line asked wins, in either language.
  expect(askedMergeSha(`Antworte genau: Merge freigeben ${OTHER_SHA}\nReply exactly: Approve merge ${SHA}`)).toBe(SHA)
  expect(askedMergeSha(`Reply exactly: Approve merge ${OTHER_SHA}\nAntworte genau: Merge freigeben ${SHA}`)).toBe(SHA)
  expect(askedMergeSha(`Antworte genau: Merge freigeben ${SHA.slice(0, 7)}`)).toBeNull()
  expect(askedMergeSha(`Merge freigeben ${SHA}`)).toBeNull()
  expect(askedMergeSha('Alle Checks sind grün. Soll ich mergen?')).toBeNull()
})

/** Presses ⇡ Ship it twice on the terminal band, the way the person ships. */
async function pressShip($: Engine) {
  for (let press = 0; press < 2; press++) {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'ship' })
    await ui.unmount()
  }
}

/** Ship it sent in a GitHub project, Claude's turn for it planned and done, ready to ask about a head commit. */
async function shipping($: Engine, on: On) {
  // While failing, a tool call fails the way Bash reports a command that exits non-zero.
  let isFailing = false
  const shipped = await shipWorld($, on, 'https://github.com/me/site.git\n', () =>
    isFailing ? { isError: true, result: 'merge failed', text: 'merge failed' } : { result: {} },
  )
  await $.command.run({ command: 'glanceflow', args: 'ship on' } as never)
  await finish($)
  await pressShip($)
  expect(shipped.sent).toHaveLength(1)
  await $.turn.start({ text: shipped.sent[0], turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['Open the pull request', 'Wait for checks'] })
  await callTool($, { tool: PROGRESS, task: 'Open the pull request', percent: 100 })
  await callTool($, { tool: PROGRESS, task: 'Wait for checks', percent: 100 })
  const ask = (sha: string, turnId: string) =>
    $.turn.complete({
      answer: `https://github.com/me/site/pull/12\nChecks: 3 bestanden.\nAntworte genau: Merge freigeben ${sha}\nAlles andere lässt den Pull Request offen.`,
      durationMs: 1,
      isAborted: false,
      turnId,
      reason: 'answer',
    } as never)
  const tries = async (command: string, extra: object = {}) => (await callTool($, { tool: 'Bash', command, ...extra })).deny
  const failMerges = (isOn: boolean) => {
    isFailing = isOn
  }
  const ends = (turnId: string, answer = 'Done.') =>
    $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId, reason: 'answer' } as never)
  return { ask, tries, failMerges, ends }
}

test('Ship it merges once at the exact approved head commit, and a merge that works ends Ship it', async ($, on) => {
  const { ask, tries } = await shipping($, on)
  expect(await tries(mergeAt(SHA))).toContain('Merge freigeben')

  await ask(SHA, 't2')
  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Braucht dich')
  expect(shown).toContain('Antworte genau: Merge freigeben')
  expect(await tries(mergeAt(SHA))).toContain('Merge freigeben')

  await $.turn.start({ text: `Merge freigeben ${SHA}`, turnId: 't3' })
  // The reply starts a new job: GlanceFlow first asks for a plan, and that refusal leaves the approval unused.
  expect(await tries(mergeAt(SHA))).toContain('plan_steps')
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Report back'] })
  expect(await tries(mergeAt(OTHER_SHA))).toContain('Merge freigeben')
  expect(await tries(`${mergeAt(SHA)} --admin`)).toContain('--admin oder --auto')
  // Text that only mentions the command runs and leaves the approval unused.
  expect(await tries('git commit -m "docs | gh pr merge later"')).toBeUndefined()
  expect(await tries(mergeAt(SHA))).toBeUndefined()

  // The merge worked: Ship it is over, and gh pr merge is back to normal.
  expect(await tries('gh pr merge 12 --squash')).toBeUndefined()
})

test('a failed merge keeps Ship it guarded until a fresh exact approval; one approval is one attempt, wrapped or not', async ($, on) => {
  const { ask, tries, failMerges, ends } = await shipping($, on)
  await ask(SHA, 't2')
  await $.turn.start({ text: `Merge freigeben ${SHA}`, turnId: 't3' })
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Report back'] })
  failMerges(true)
  expect(await tries(`bash -c "${mergeAt(SHA)}"`)).toBeUndefined()
  // One approval, one merge attempt.
  expect(await tries(mergeAt(SHA))).toContain('Merge freigeben')
  await ends('t3', 'The merge failed: the branch is out of date.')

  // The person's next turn does not end Ship it while the failed merge waits for a retry.
  await $.turn.start({ text: 'Update the branch and try again', turnId: 't4' })
  expect(await tries(mergeAt(SHA))).toContain('Merge freigeben')
  await ask(SHA, 't4')
  await $.turn.start({ text: `Merge freigeben ${SHA}`, turnId: 't5' })
  failMerges(false)
  expect(await tries(mergeAt(SHA))).toBeUndefined()
  expect(await tries('gh pr merge 12 --squash')).toBeUndefined()
})

test('a merge whose exit code the rest of its command could hide is refused, so it neither ends Ship it nor uses the approval', async ($, on) => {
  const { ask, tries, failMerges } = await shipping($, on)
  await ask(SHA, 't2')
  await $.turn.start({ text: `Merge freigeben ${SHA}`, turnId: 't3' })
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Report back'] })
  // Bash reports these as successes even when gh pr merge fails, since the last command decides the exit code.
  for (const command of [`${mergeAt(SHA)}; echo "exit=$?"`, `${mergeAt(SHA)}; true`, `${mergeAt(SHA)} || true`]) {
    expect(await tries(command)).toContain('allein aus')
  }
  // Still guarded, and the approval is unused: the merge on its own runs once, and after it fails
  // the next try, compound or not, needs a fresh approval.
  expect(await tries('gh pr merge 12 --squash')).toContain('Merge freigeben')
  failMerges(true)
  expect(await tries(mergeAt(SHA))).toBeUndefined()
  expect(await tries(mergeAt(SHA))).toContain('Merge freigeben')
  expect(await tries(`${mergeAt(SHA)}; true`)).toContain('Merge freigeben')
})

test('a merge through a shell wrapper is refused before and after approval, and never uses the approval', async ($, on) => {
  const { ask, tries } = await shipping($, on)
  for (const command of WRAPPED_MERGES) expect(await tries(command)).toBeDefined()
  await ask(SHA, 't2')
  await $.turn.start({ text: `Merge freigeben ${SHA}`, turnId: 't3' })
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Report back'] })
  for (const command of WRAPPED_MERGES) expect(await tries(command)).toBeDefined()
  // Still guarded, and the approval is unused: the plain merge runs, works, and ends Ship it.
  expect(await tries('gh pr merge 12 --squash')).toContain('Merge freigeben')
  expect(await tries(mergeAt(SHA))).toBeUndefined()
  expect(await tries('env gh pr merge 12 --squash')).toBeUndefined()
})

test('a new merge request for a moved head replaces the pending one, and an approval lasts only for its turn', async ($, on) => {
  const { ask, tries, ends } = await shipping($, on)
  await ask(SHA, 't2')
  await ask(OTHER_SHA, 't2')
  await $.turn.start({ text: `Merge freigeben ${OTHER_SHA}`, turnId: 't3' })
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Report back'] })
  expect(await tries(mergeAt(SHA))).toContain('Merge freigeben')
  await ends('t3', 'Stopped before merging.')
  expect(await tries(mergeAt(OTHER_SHA))).toContain('Merge freigeben')
})

// Ship it asks in German now; the English line and reply of before still count, in any mix, and only exactly.
for (const [asked, reply] of [['English', 'English'], ['German', 'English'], ['English', 'German']] as const) {
  test(`a merge asked for in ${asked} is approved by the exact ${reply} reply, and only at that head commit`, async ($, on) => {
    const { ask, tries } = await shipping($, on)
    if (asked === 'German') await ask(SHA, 't2')
    else {
      await $.turn.complete({
        answer: `https://github.com/me/site/pull/12\nChecks: 3 passed.\nReply exactly: Approve merge ${SHA}\nAnything else leaves the pull request open.`,
        durationMs: 1,
        isAborted: false,
        turnId: 't2',
        reason: 'answer',
      } as never)
    }
    // The band asks in German, whichever way Claude asked.
    const shown = (await texts($, 'terminal')).join('\n')
    expect(shown).toContain('Braucht dich')
    expect(shown).toContain('Antworte genau: Merge freigeben')
    expect(await tries(mergeAt(SHA))).toContain('Merge freigeben')

    await $.turn.start({ text: reply === 'German' ? `Merge freigeben ${SHA}` : `Approve merge ${SHA}`, turnId: 't3' })
    await callTool($, { tool: PLAN, steps: ['Merge it', 'Report back'] })
    expect(await tries(mergeAt(OTHER_SHA))).toContain('Merge freigeben')
    expect(await tries(`${mergeAt(SHA)} --admin`)).toContain('--admin oder --auto')
    expect(await tries(mergeAt(SHA))).toBeUndefined()
    // That merge worked and ended Ship it.
    expect(await tries('gh pr merge 12 --squash')).toBeUndefined()
  })
}

for (const reply of [
  'yes', 'ok', 'go ahead', 'no', 'cancel', `Approve merge ${OTHER_SHA}`, `Approve merge ${SHA.slice(0, 7)}`, `Approve merge ${SHA} please`, `ok Approve merge ${SHA}`, `approve merge ${SHA}`,
  // German replies decline alike: only the exact line approves, in either language.
  'ja', 'los', 'passt so', 'nein', 'abbrechen', 'weiter', `Merge freigeben ${OTHER_SHA}`, `Merge freigeben ${SHA.slice(0, 7)}`, `Merge freigeben ${SHA} bitte`, `ja, Merge freigeben ${SHA}`, `merge freigeben ${SHA}`, `Merge Freigeben ${SHA}`,
]) {
  test(`a reply of "${reply.slice(0, 26)}" declines: the guard holds for that whole turn, then Ship it ends`, async ($, on) => {
    const { ask, tries } = await shipping($, on)
    await ask(SHA, 't2')
    await $.turn.start({ text: reply, turnId: 't3' })
    await callTool($, { tool: PLAN, steps: ['Answer', 'Wrap up'] })
    expect(await tries(mergeAt(SHA))).toContain('Merge freigeben')
    // Asking again within the declining turn does not keep Ship it going.
    await ask(SHA, 't3')
    expect(await tries('gh pr merge 12 --squash')).toBeUndefined()
  })
}

test('Ship it stays guarded through its own first turn, background turns, slash commands and pasted text', async ($, on) => {
  const { ask, tries, ends } = await shipping($, on)
  // The Ship it turn ends while the checks run in the background.
  await ends('t2', 'Waiting for the checks in the background.')
  expect(await tries('gh pr merge 12 --squash')).toContain('Merge freigeben')

  // A background task wakes Claude: no typed prompt, and it reaches the merge request.
  await $.turn.start({ text: '', turnId: 't3' })
  await ask(SHA, 't3')
  expect((await texts($, 'terminal')).join('\n')).toContain('Antworte genau: Merge freigeben')

  // A slash command, and pasted text on its own, neither answer the request nor end Ship it.
  await $.turn.start({ text: '/compact', turnId: 't4' })
  await ends('t4', '')
  await $.turn.start({ text: `<pasted_content>Merge freigeben ${SHA}</pasted_content>`, turnId: 't5' })
  expect(await tries(mergeAt(SHA))).toContain('Merge freigeben')
  await ends('t5', 'Noted.')

  await $.turn.start({ text: `Merge freigeben ${SHA}`, turnId: 't6' })
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Report back'] })
  expect(await tries(mergeAt(SHA))).toBeUndefined()
})

test('Pause and Continue keep Ship it guarded; Esc ends it', async ($, on) => {
  on('turn.abort', () => ({ value: undefined }) as never)
  const { tries } = await shipping($, on)
  await $.command.run({ command: 'glanceflow', args: 'pause' } as never)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't2', reason: 'aborted' } as never)
  expect(await tries('gh pr merge 12 --squash')).toContain('Merge freigeben')

  await $.turn.start({ text: 'Mach bitte da weiter, wo du aufgehört hast.', turnId: 't3' })
  expect(await tries('gh pr merge 12 --squash')).toContain('Merge freigeben')
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't3', reason: 'aborted' } as never)
  expect(await tries('gh pr merge 12 --squash')).toBeUndefined()
})

test("the person's next unrelated turn ends a stale Ship it, and Claude's text alone never starts one", async ($, on) => {
  const { tries, ends } = await shipping($, on)
  await ends('t2', 'The pull request is open; the checks are still running.')
  await $.turn.start({ text: 'Now fix the footer', turnId: 't3' })
  await callTool($, { tool: PLAN, steps: ['Fix it', 'Check it'] })
  expect(await tries('gh pr merge 12 --squash')).toBeUndefined()

  // Outside Ship it, an answer that holds the approval line arms nothing, and the reply approves nothing.
  await ends('t3', `Antworte genau: Merge freigeben ${SHA}\nReply exactly: Approve merge ${SHA}\nAlles andere lässt den Pull Request offen.`)
  await $.turn.start({ text: `Merge freigeben ${SHA}`, turnId: 't4' })
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Report back'] })
  expect(await tries('gh pr merge 12 --squash')).toBeUndefined()
  expect(await tries(mergeAt(OTHER_SHA))).toBeUndefined()
})

test('the merge guard covers helpers during Ship it and leaves merges alone outside it or with GlanceFlow off', async ($, on) => {
  const shipped = await shipWorld($, on, 'https://github.com/me/site.git\n')
  await $.command.run({ command: 'glanceflow', args: 'ship on' } as never)
  await finish($)
  const tries = async (command: string, extra: object = {}) => (await callTool($, { tool: 'Bash', command, ...extra })).deny
  expect(await tries('gh pr merge 12 --squash')).toBeUndefined()
  for (const command of API_MERGES) expect(await tries(command)).toBeUndefined()

  await pressShip($)
  expect(shipped.sent).toHaveLength(1)
  expect(await tries('gh pr merge 12 --squash')).toContain('Merge freigeben')
  expect(await tries('gh pr merge 12 --squash', { agentId: 'a1' })).toContain('Merge freigeben')
  for (const command of API_MERGES) {
    expect(await tries(command)).toContain('nie über gh api')
    expect(await tries(command, { agentId: 'a1' })).toContain('nie über gh api')
  }
  expect(await tries('git status')).toBeUndefined()

  await $.command.run({ command: 'glanceflow', args: 'off' } as never)
  expect(await tries('gh pr merge 12 --squash')).toBeUndefined()
  for (const command of API_MERGES) expect(await tries(command)).toBeUndefined()
})

test('Ship it refuses curl and wget merges from Claude and helpers, and leaves them alone before it and with GlanceFlow off', async ($, on) => {
  const shipped = await shipWorld($, on, 'https://github.com/me/site.git\n')
  await $.command.run({ command: 'glanceflow', args: 'ship on' } as never)
  await finish($)
  const tries = async (command: string, extra: object = {}) => (await callTool($, { tool: 'Bash', command, ...extra })).deny
  for (const command of HTTP_MERGES) {
    expect(await tries(command)).toBeUndefined()
    expect(await tries(command, { agentId: 'a1' })).toBeUndefined()
  }

  await pressShip($)
  expect(shipped.sent).toHaveLength(1)
  for (const command of HTTP_MERGES) {
    expect(await tries(command)).toBe(HTTP_REFUSAL)
    expect(await tries(command, { agentId: 'a1' })).toBe(HTTP_REFUSAL)
  }
  for (const command of ['curl -s https://api.github.com/repos/me/site/pulls/12', 'echo curl https://api.github.com/repos/o/r/pulls/12/merge']) {
    expect(await tries(command)).toBeUndefined()
    expect(await tries(command, { agentId: 'a1' })).toBeUndefined()
  }
  // Refusing them does not end Ship it.
  expect(await tries('gh pr merge 12 --squash')).toContain('Merge freigeben')

  await $.command.run({ command: 'glanceflow', args: 'off' } as never)
  for (const command of HTTP_MERGES) {
    expect(await tries(command)).toBeUndefined()
    expect(await tries(command, { agentId: 'a1' })).toBeUndefined()
  }
})

test('a refused curl or wget merge leaves the approval and Ship it as they were, so the approved gh pr merge still runs', async ($, on) => {
  const { ask, tries } = await shipping($, on)
  await ask(SHA, 't2')
  await $.turn.start({ text: `Merge freigeben ${SHA}`, turnId: 't3' })
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Report back'] })
  for (const command of HTTP_MERGES) {
    expect(await tries(command)).toBe(HTTP_REFUSAL)
    expect(await tries(command, { agentId: 'a1' })).toBe(HTTP_REFUSAL)
  }
  // Still guarded, nothing recorded as merged, and the approval is unused.
  expect(await tries('gh pr merge 12 --squash')).toContain('Merge freigeben')
  expect(await tries(mergeAt(OTHER_SHA))).toContain('Merge freigeben')
  expect(await tries(`gh pr merge --squash --delete-branch --match-head-commit ${SHA}`)).toBeUndefined()
  // That merge worked and ended Ship it.
  expect(await tries(HTTP_MERGES[0])).toBeUndefined()
})

test('Ship it refuses gh api merges sent through stdin from Claude and helpers, and leaves them alone before it and with GlanceFlow off', async ($, on) => {
  const shipped = await shipWorld($, on, 'https://github.com/me/site.git\n')
  await $.command.run({ command: 'glanceflow', args: 'ship on' } as never)
  await finish($)
  const tries = async (command: string, extra: object = {}) => (await callTool($, { tool: 'Bash', command, ...extra })).deny
  for (const command of STDIN_MERGES) {
    expect(await tries(command)).toBeUndefined()
    expect(await tries(command, { agentId: 'a1' })).toBeUndefined()
  }

  await pressShip($)
  expect(shipped.sent).toHaveLength(1)
  for (const command of STDIN_MERGES) {
    expect(await tries(command)).toBe(API_REFUSAL)
    expect(await tries(command, { agentId: 'a1' })).toBe(API_REFUSAL)
  }
  expect(await tries(STDIN_QUERY)).toBeUndefined()
  expect(await tries(STDIN_QUERY, { agentId: 'a1' })).toBeUndefined()
  // Refusing them does not end Ship it.
  expect(await tries('gh pr merge 12 --squash')).toContain('Merge freigeben')

  await $.command.run({ command: 'glanceflow', args: 'off' } as never)
  for (const command of STDIN_MERGES) {
    expect(await tries(command)).toBeUndefined()
    expect(await tries(command, { agentId: 'a1' })).toBeUndefined()
  }
})

test('a refused gh api stdin merge leaves the approval and Ship it as they were, so the approved gh pr merge still runs', async ($, on) => {
  const { ask, tries } = await shipping($, on)
  await ask(SHA, 't2')
  await $.turn.start({ text: `Merge freigeben ${SHA}`, turnId: 't3' })
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Report back'] })
  for (const command of STDIN_MERGES) {
    expect(await tries(command)).toBe(API_REFUSAL)
    expect(await tries(command, { agentId: 'a1' })).toBe(API_REFUSAL)
  }
  // Still guarded, nothing recorded as merged, and the approval is unused.
  expect(await tries('gh pr merge 12 --squash')).toContain('Merge freigeben')
  expect(await tries(mergeAt(OTHER_SHA))).toContain('Merge freigeben')
  expect(await tries(`gh pr merge --squash --delete-branch --match-head-commit ${SHA}`)).toBeUndefined()
  // That merge worked and ended Ship it.
  expect(await tries(STDIN_MERGES[0])).toBeUndefined()
})

// Every spelling Ship it refuses at the approved head commit or without it, as Claude or a helper would send it.
const WORD_REFUSED = [...HIDDEN_MERGES, ...RUN_TIME_GH, ...UNKNOWN_GH, ...PR_FLAG_FIRST, ...SPELLED_API, ...SPELLED_HTTP]

test('Ship it refuses merges Bash spells in other words from Claude and helpers, and leaves them alone before it and with GlanceFlow off', async ($, on) => {
  const shipped = await shipWorld($, on, 'https://github.com/me/site.git\n')
  await $.command.run({ command: 'glanceflow', args: 'ship on' } as never)
  await finish($)
  const tries = async (command: string, extra: object = {}) => (await callTool($, { tool: 'Bash', command, ...extra })).deny
  for (const command of [...SPELLED_MERGES, ...WORD_REFUSED]) {
    expect(await tries(command)).toBeUndefined()
    expect(await tries(command, { agentId: 'a1' })).toBeUndefined()
  }

  await pressShip($)
  expect(shipped.sent).toHaveLength(1)
  for (const command of [...SPELLED_MERGES, ...WORD_REFUSED]) {
    expect([command, await tries(command)]).not.toEqual([command, undefined])
    expect(await tries(command, { agentId: 'a1' })).toBeDefined()
  }
  for (const command of WORD_HARMLESS) {
    expect([command, await tries(command)]).toEqual([command, undefined])
    expect(await tries(command, { agentId: 'a1' })).toBeUndefined()
  }
  // Refusing them does not end Ship it.
  expect(await tries('gh pr merge 12 --squash')).toContain('Merge freigeben')

  await $.command.run({ command: 'glanceflow', args: 'off' } as never)
  for (const command of [...SPELLED_MERGES, ...WORD_REFUSED]) {
    expect(await tries(command)).toBeUndefined()
    expect(await tries(command, { agentId: 'a1' })).toBeUndefined()
  }
})

test('a refused spelled merge leaves the approval; a spelled sanctioned merge uses it once, and a failed one needs a fresh approval', async ($, on) => {
  const { ask, tries, failMerges, ends } = await shipping($, on)
  await ask(SHA, 't2')
  await $.turn.start({ text: `Merge freigeben ${SHA}`, turnId: 't3' })
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Report back'] })
  for (const command of WORD_REFUSED) {
    expect([command, await tries(command)]).not.toEqual([command, undefined])
    expect(await tries(command, { agentId: 'a1' })).toBeDefined()
  }
  // Still guarded, nothing recorded as merged, and the approval is unused: the quoted sanctioned merge runs once.
  expect(await tries('"gh" pr merge 12 --squash')).toContain('Merge freigeben')
  failMerges(true)
  const spelled = `"gh" pr mer''ge 12 --squash --delete-branch --match-head-commit ${SHA}`
  expect(await tries(spelled, { agentId: 'a1' })).toBeUndefined()
  // One approval, one attempt: the next one, spelled or plain, from Claude or a helper, needs a fresh approval.
  expect(await tries(spelled)).toContain('Merge freigeben')
  expect(await tries(mergeAt(SHA), { agentId: 'a1' })).toContain('Merge freigeben')
  await ends('t3', 'The merge failed: the branch is out of date.')
  await $.turn.start({ text: 'Update the branch and try again', turnId: 't4' })
  await ask(SHA, 't4')
  await $.turn.start({ text: `Merge freigeben ${SHA}`, turnId: 't5' })
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Report back'] })
  failMerges(false)
  expect(await tries(`gh -R me/site pr merge 12 --squash --delete-branch --match-head-commit ${SHA}`)).toBeUndefined()
  // That merge worked and ended Ship it.
  expect(await tries('gh pr merge 12 --squash')).toBeUndefined()
})

// MCP tools that merge a pull request, turn on auto-merge or add it to a merge queue, under two server prefixes.
const MCP_MERGES = ['mcp__github__', 'mcp__plugin_engineering_github__'].flatMap(server =>
  [
    'merge_pull_request',
    'mergePullRequest',
    'merge-pull-request',
    'enable_auto_merge',
    'enable_pull_request_auto_merge',
    'enqueue_pull_request',
  ].map(action => server + action),
)
// Read-only or unrelated MCP tools, some with "merge" in the name, and a server named like a merge action.
const MCP_OTHERS = [
  'mcp__github__get_pull_request',
  'mcp__github__list_pull_requests',
  'mcp__github__pull_request_read',
  'mcp__github__get_merge_status',
  'mcp__github__disable_auto_merge',
  'mcp__mnemo__mem_merge_tags',
  'mcp__claude_ai_Supabase__merge_branch',
  'mcp__merge_pull_request__get_pull_request',
]

test('isMcpMergeAction matches only the exact merge, auto-merge and merge-queue actions of an MCP tool', () => {
  for (const tool of MCP_MERGES) expect(isMcpMergeAction(tool)).toBe(true)
  for (const tool of [...MCP_OTHERS, PLAN, PROGRESS, 'merge_pull_request', 'Bash', 'mcp__merge_pull_request']) {
    expect(isMcpMergeAction(tool)).toBe(false)
  }
})

test('Ship it refuses MCP merge actions from Claude and helpers alike, and lets other MCP tools run', async ($, on) => {
  const { tries } = await shipping($, on)
  const calls = async (tool: string, extra: object = {}) => (await callTool($, { tool, ...extra })).deny
  for (const tool of MCP_MERGES) {
    expect(await calls(tool)).toContain('nie über ein MCP-Tool')
    expect(await calls(tool, { agentId: 'a1' })).toContain('nie über ein MCP-Tool')
  }
  for (const tool of MCP_OTHERS) {
    expect(await calls(tool)).toBeUndefined()
    expect(await calls(tool, { agentId: 'a1' })).toBeUndefined()
  }
  expect(await calls(PROGRESS, { task: 'Wait for checks', percent: 100 })).toBeUndefined()
  expect(await calls(PLAN, { steps: ['Merge it', 'Report back'] })).toBeUndefined()
  // Refusing them does not end Ship it.
  expect(await tries('gh pr merge 12 --squash')).toContain('Merge freigeben')
})

test('a refused MCP merge leaves the approval for the gh pr merge it names, and once that merge ends Ship it MCP merges are left alone', async ($, on) => {
  const { ask, tries } = await shipping($, on)
  const calls = async (tool: string, extra: object = {}) => (await callTool($, { tool, ...extra })).deny
  await ask(SHA, 't2')
  await $.turn.start({ text: `Merge freigeben ${SHA}`, turnId: 't3' })
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Report back'] })
  for (const tool of MCP_MERGES) expect(await calls(tool)).toContain('nie über ein MCP-Tool')
  expect(await tries(mergeAt(SHA))).toBeUndefined()

  for (const tool of MCP_MERGES) {
    expect(await calls(tool)).toBeUndefined()
    expect(await calls(tool, { agentId: 'a1' })).toBeUndefined()
  }
})

test('MCP merge actions are left alone before Ship it and with GlanceFlow off', async ($, on) => {
  const shipped = await shipWorld($, on, 'https://github.com/me/site.git\n')
  await $.command.run({ command: 'glanceflow', args: 'ship on' } as never)
  await finish($)
  const calls = async (tool: string, extra: object = {}) => (await callTool($, { tool, ...extra })).deny
  for (const tool of MCP_MERGES) {
    expect(await calls(tool)).toBeUndefined()
    expect(await calls(tool, { agentId: 'a1' })).toBeUndefined()
  }

  await pressShip($)
  expect(shipped.sent).toHaveLength(1)
  for (const tool of MCP_MERGES) expect(await calls(tool)).toContain('nie über ein MCP-Tool')

  await $.command.run({ command: 'glanceflow', args: 'off' } as never)
  for (const tool of MCP_MERGES) {
    expect(await calls(tool)).toBeUndefined()
    expect(await calls(tool, { agentId: 'a1' })).toBeUndefined()
  }
})

const PS_REFUSAL = 'darf PowerShell nur mit gh pr merge'
// PowerShell commands Ship it refuses, approved or not: gh merges in any case, path or wrapper, backtick-escaped,
// and merge routes through gh api, the HTTP cmdlets and their aliases, curl.exe or wget.exe.
const PS_MERGES = [
  'gh pr merge 12 --squash',
  'GH PR MERGE 12 --squash',
  'Gh Pr Merge 12 --squash',
  'gh.exe pr merge 12 --squash',
  "& 'C:\\Program Files\\GitHub CLI\\gh.exe' pr merge 12 --squash",
  'g`h pr me`rge 12 --squash',
  'gh api -X PUT repos/me/site/pulls/12/merge',
  'GH API -X PUT repos/me/site/pulls/12/merge',
  "gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'",
  "gh api graphql -f query='mutation { enqueuePullRequest(input: {}) { clientMutationId } }'",
  "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }'",
  'Invoke-RestMethod -Method Put -Uri https://api.github.com/repos/me/site/pulls/12/merge',
  'INVOKE-RESTMETHOD -Method Put -Uri https://api.github.com/repos/me/site/pulls/12/merge',
  'irm -Method Put https://api.github.com/repos/me/site/pulls/12/merge',
  'Invoke-WebRequest -Method Put -Uri https://api.github.com/repos/me/site/pulls/12/merge',
  'iwr -Method Put https://api.github.com/repos/me/site/pulls/12/merge',
  'Invoke-`RestMethod -Method Put https://api.github.com/repos/me/site/pulls/12/mer`ge',
  'curl -X PUT https://api.github.com/repos/me/site/pulls/12/merge',
  'curl.exe -X PUT https://api.github.com/repos/me/site/pulls/12/merge',
  'CURL.EXE -X PUT https://api.github.com/repos/me/site/pulls/12/merge',
  'wget.exe --method=PUT https://api.github.com/repos/me/site/pulls/12/merge',
  "Invoke-RestMethod -Method Post https://api.github.com/graphql -Body '{\"query\":\"mutation { mergePullRequest }\"}'",
  "$u = 'https://api.github.com/repos/me/site/pulls/12/merge'; irm -Method Put $u",
  'pwsh -Command "gh pr merge 12 --squash"',
  "Start-Process gh -ArgumentList 'pr merge 12 --squash'",
  'cmd /c gh pr merge 12 --squash',
  "Invoke-Expression 'gh pr merge 12 --squash'",
  'Write-Output ok; gh pr merge 12 --squash',
]
// The sanctioned form gone wrong: refused even at the approved head commit.
const PS_ALMOST = [
  `${mergeAt(SHA)} --admin`,
  `${mergeAt(SHA)} --auto`,
  `gh pr merge 12 --admin --squash --delete-branch --match-head-commit ${SHA}`,
  `gh pr merge --auto --squash --delete-branch --match-head-commit ${SHA}`,
  `${mergeAt(SHA)}; Write-Output done`,
  `${mergeAt(SHA)} | Out-Null`,
  `${mergeAt(SHA)} && Write-Output done`,
  `${mergeAt(SHA)} || Write-Output failed`,
  `${mergeAt(SHA)}\nWrite-Output done`,
  `Write-Output start\n${mergeAt(SHA)}`,
  `gh pr merge\n12 --squash --delete-branch --match-head-commit ${SHA}`,
  `(${mergeAt(SHA)})`,
  `& ${mergeAt(SHA)}`,
  `$(${mergeAt(SHA)})`,
  `gh pr merge #12 --squash --delete-branch --match-head-commit ${SHA}`,
  `${mergeAt(SHA)} # done`,
  `gh pr merge 12 --squash --delete-branch --match-head-commit \`${SHA}`,
  'g`h pr merge 12 --squash --delete-branch --match-head-commit ' + SHA,
  `GH pr merge 12 --squash --delete-branch --match-head-commit ${SHA}`,
  `gh.exe pr merge 12 --squash --delete-branch --match-head-commit ${SHA}`,
  `pwsh -Command "${mergeAt(SHA)}"`,
  `gh pr merge 12 --squash --delete-branch --match-head-commit ${SHA.toUpperCase()}`,
]
// PowerShell commands Ship it itself runs, and others with no merge route: left alone during Ship it.
const PS_HARMLESS = [
  'gh pr view 12 --json headRefOid',
  'gh pr checks 12 --watch',
  'gh pr create --fill',
  'gh pr create --title "Fix the footer" --body "Adds the missing links"',
  'git merge --ff-only origin/master',
  'Write-Output "merge"',
  'irm https://api.github.com/repos/me/site/pulls/12',
  'curl.exe -s https://api.github.com/repos/me/site/pulls/12',
  'Get-Content README.md',
]
// Accepted false positive: during Ship it, merge in harmless argument text next to gh is refused in PowerShell, with no
// gh pr create exception; Bash reads the same command as it always has.
const PS_FALSE_POSITIVE = 'gh pr create --title "Guard merge routes" --body "Docs only"'

test('unsafePowerShellMerge allows only the exact sanctioned merge at the approved head commit', () => {
  for (const command of [
    mergeAt(SHA),
    `  ${mergeAt(SHA)}\n`,
    `gh pr merge --squash --delete-branch --match-head-commit ${SHA}`,
    `gh pr merge https://github.com/me/site/pull/12 --squash --delete-branch --match-head-commit ${SHA}`,
  ]) {
    expect(unsafePowerShellMerge(command, SHA)).toBeNull()
    expect(runsPowerShellMerge(command)).toBe(true)
    expect(unsafePowerShellMerge(command, null)).toContain('Merge freigeben')
    expect(unsafePowerShellMerge(command, OTHER_SHA)).toContain('Merge freigeben')
  }
  for (const command of [...PS_ALMOST, ...PS_MERGES]) {
    expect(runsPowerShellMerge(command)).toBe(false)
    expect(unsafePowerShellMerge(command, SHA)).toContain(PS_REFUSAL)
    expect(unsafePowerShellMerge(command, null)).not.toBeNull()
  }
  for (const command of PS_HARMLESS) {
    expect(unsafePowerShellMerge(command, null)).toBeNull()
    expect(unsafePowerShellMerge(command, SHA)).toBeNull()
    expect(runsPowerShellMerge(command)).toBe(false)
  }
  // The accepted false positive is refused in PowerShell, and Bash still lets it run.
  expect(unsafePowerShellMerge(PS_FALSE_POSITIVE, SHA)).toContain(PS_REFUSAL)
  expect(unsafePowerShellMerge(PS_FALSE_POSITIVE, null)).toContain(PS_REFUSAL)
  expect(unsafeMerge(PS_FALSE_POSITIVE, SHA)).toBeNull()
  expect(unsafeMerge(PS_FALSE_POSITIVE, null)).toBeNull()
})

test('Ship it refuses PowerShell merges from Claude and helpers, and leaves PowerShell alone before it and with GlanceFlow off', async ($, on) => {
  const shipped = await shipWorld($, on, 'https://github.com/me/site.git\n')
  await $.command.run({ command: 'glanceflow', args: 'ship on' } as never)
  await finish($)
  const tries = async (command: string, extra: object = {}) => (await callTool($, { tool: 'PowerShell', command, ...extra })).deny
  for (const command of [...PS_MERGES, PS_FALSE_POSITIVE, mergeAt(SHA)]) {
    expect(await tries(command)).toBeUndefined()
    expect(await tries(command, { agentId: 'a1' })).toBeUndefined()
  }

  await pressShip($)
  expect(shipped.sent).toHaveLength(1)
  for (const command of [...PS_MERGES, ...PS_ALMOST, PS_FALSE_POSITIVE]) {
    expect(await tries(command)).toContain(PS_REFUSAL)
    expect(await tries(command, { agentId: 'a1' })).toContain(PS_REFUSAL)
  }
  // Not approved yet: the sanctioned merge asks for the approval, from Claude and helpers alike.
  expect(await tries(mergeAt(SHA))).toContain('Merge freigeben')
  expect(await tries(mergeAt(SHA), { agentId: 'a1' })).toContain('Merge freigeben')
  for (const command of PS_HARMLESS) {
    expect(await tries(command)).toBeUndefined()
    expect(await tries(command, { agentId: 'a1' })).toBeUndefined()
  }
  // Refusing them does not end Ship it, for PowerShell or Bash.
  expect(await tries('gh pr merge 12 --squash')).toContain(PS_REFUSAL)
  expect((await callTool($, { tool: 'Bash', command: 'gh pr merge 12 --squash' })).deny).toContain('Merge freigeben')
  // Bash keeps its own reading: the PowerShell false positive runs there.
  expect((await callTool($, { tool: 'Bash', command: PS_FALSE_POSITIVE })).deny).toBeUndefined()

  await $.command.run({ command: 'glanceflow', args: 'off' } as never)
  for (const command of [...PS_MERGES, PS_FALSE_POSITIVE]) {
    expect(await tries(command)).toBeUndefined()
    expect(await tries(command, { agentId: 'a1' })).toBeUndefined()
  }
})

test('a refused PowerShell merge leaves the approval; the sanctioned PowerShell merge uses it once and ends Ship it', async ($, on) => {
  const { ask, tries } = await shipping($, on)
  const ps = async (command: string, extra: object = {}) => tries(command, { tool: 'PowerShell', ...extra })
  await ask(SHA, 't2')
  await $.turn.start({ text: `Merge freigeben ${SHA}`, turnId: 't3' })
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Report back'] })
  for (const command of [...PS_MERGES, ...PS_ALMOST, PS_FALSE_POSITIVE]) {
    expect(await ps(command)).toContain(PS_REFUSAL)
    expect(await ps(command, { agentId: 'a1' })).toContain(PS_REFUSAL)
  }
  expect(await ps(mergeAt(OTHER_SHA))).toContain('Merge freigeben')
  expect(await ps(mergeAt(OTHER_SHA), { agentId: 'a1' })).toContain('Merge freigeben')
  for (const command of PS_HARMLESS) expect(await ps(command)).toBeUndefined()
  // Still guarded, and the approval is unused.
  expect(await tries('gh pr merge 12 --squash')).toContain('Merge freigeben')
  expect(await ps(mergeAt(SHA))).toBeUndefined()

  // That merge worked and ended Ship it: PowerShell is back to normal.
  for (const command of [...PS_MERGES, PS_FALSE_POSITIVE]) {
    expect(await ps(command)).toBeUndefined()
    expect(await ps(command, { agentId: 'a1' })).toBeUndefined()
  }
  expect(await tries('gh pr merge 12 --squash')).toBeUndefined()
})

test('a helper PowerShell merge uses the approval once, like Claude: a failed one needs a fresh approval', async ($, on) => {
  const { ask, tries, failMerges } = await shipping($, on)
  const ps = async (command: string, extra: object = {}) => tries(command, { tool: 'PowerShell', ...extra })
  await ask(SHA, 't2')
  await $.turn.start({ text: `Merge freigeben ${SHA}`, turnId: 't3' })
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Report back'] })
  failMerges(true)
  expect(await ps(mergeAt(SHA), { agentId: 'a1' })).toBeUndefined()
  // One approval, one merge attempt, whichever tool or caller tries next.
  expect(await ps(mergeAt(SHA), { agentId: 'a1' })).toContain('Merge freigeben')
  expect(await ps(mergeAt(SHA))).toContain('Merge freigeben')
  expect(await tries(mergeAt(SHA))).toContain('Merge freigeben')
  expect(await ps('gh pr merge 12 --squash')).toContain(PS_REFUSAL)
})

test("a timer left from an earlier press never cancels a later one, and only one button waits for its second press", async ($, on) => {
  const { sent, clock } = await shipWorld($, on, 'https://github.com/me/site.git\n')
  await $.command.run({ command: 'glanceflow', args: 'ship on' } as never)
  await finish($)
  const press = async (key: string) => {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key })
    await ui.unmount()
  }
  const shown = async () => (await texts($, 'terminal')).join('\n')

  // Arm, ship 7 seconds later, arm again: the first press's timer, due a second later, leaves the new one waiting.
  await press('ship')
  await clock.advance(7000)
  await press('ship')
  expect(sent).toHaveLength(1)
  await press('ship')
  await clock.advance(1500)
  expect(await shown()).toContain('Noch mal drücken für Push')

  // Arming Fresh chat disarms Ship it.
  await press('handoff')
  const both = await shown()
  expect(both).toContain('Noch mal drücken für neuen Chat')
  expect(both).not.toContain('Noch mal drücken für Push')
  expect(both).toContain('⇡ Push')
})

test('Ship it stays hidden in a folder that does not push to GitHub', async ($, on) => {
  await shipWorld($, on, '')
  await $.command.run({ command: 'glanceflow', args: 'ship on' } as never)
  await finish($)
  for (const surface of SURFACES) expect((await texts($, surface)).join('\n')).not.toContain('Push')
})

test('Pause stops the running turn; Continue picks the same job up without typing', async ($, on) => {
  world(on)
  let aborted = ''
  let sent = ''
  on('turn.abort', (_, e) => {
    aborted = e.turnId
    return { value: undefined } as never
  })
  on('prompt.submit', (_, e) => {
    sent = e.text
    return { text: e.text }
  })
  const press = async (key: string) => {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key })
    await ui.unmount()
  }

  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  let shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('‖ Pause')
  expect(shown).not.toContain('▶ Weiter')

  await press('pause')
  expect(aborted).toBe('t1')
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' })
  shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('‖ Pausiert · ')
  expect(shown).toContain('▶ Weiter')
  expect(shown).not.toContain('‖ Pause\n')
  // The step itself says it is paused, not working.
  expect(shown).toContain('\nPausiert ')
  expect(shown).not.toContain('\nArbeitet')

  await press('continue')
  expect(sent).toBe('Mach bitte da weiter, wo du aufgehört hast.')
  await $.turn.start({ text: sent, turnId: 't2' })
  shown = (await texts($, 'terminal')).join('\n')
  // The same job and plan, working again.
  expect(shown).toContain('Write the page')
  expect(shown).toContain('▶ ')
  expect(shown).not.toContain('Pausiert')
  expect(shown).not.toContain('Verstehe deine Anfrage')
  expect(shown).toContain('‖ Pause')
})

test('after Esc the header says Stopped, and Continue is offered', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' })
  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('■ Gestoppt')
  expect(shown).toContain('Du hast Esc gedrückt')
  expect(shown).toContain('▶ Weiter')
})

test("a paused step's time stands still", async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: {} as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.abort', () => ({ value: undefined }) as never)
  await detailsOn($)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  await clock.advance(30_000)
  await $.command.run({ command: 'glanceflow', args: 'pause' } as never)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' })

  const before = (await texts($, 'terminal', 120)).join('\n')
  expect(before).toContain('30 Sek. · ')
  await clock.advance(5 * 60_000)
  const after = (await texts($, 'terminal', 120)).join('\n')
  expect(after).toContain('30 Sek. · ')
  expect(after).not.toContain('5 Min. 30 Sek.')
})


/** A world with a clock to move, and the sounds and words GlanceFlow plays. */
function soundWorld(on: On, canSpeak = true) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: {} as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.Notification', () => ({}) as never)
  on('classic.Stop', () => ({}) as never)
  const heard: string[] = []
  on('audio.play', (_, e) => {
    heard.push(String((e.clip as { asset?: string }).asset))
    return { value: undefined } as never
  })
  on('audio.speak', (_, e) => {
    if (!canSpeak) throw new Error('No synthesizer')
    heard.push(`say: ${(e as { text: string }).text}`)
    return { value: { via: 'system' } } as never
  })
  return { clock, heard }
}

test('sounds are off until turned on; then a chime when Claude needs you, gets stuck or finishes a long job', async ($, on) => {
  const { clock, heard } = soundWorld(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it', 'Ship it'] })
  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' } as never)
  expect(heard).toEqual([])

  const result = await $.command.run({ command: 'glanceflow', args: 'sound on' } as never)
  expect(result.text).toContain('Töne sind an')
  heard.length = 0
  await callTool($, { tool: 'Bash', command: 'ls' })
  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' } as never)
  expect(heard).toEqual(['sounds/needs-you.wav'])

  // A quick job ends quietly; a long one chimes.
  await clock.advance(2 * 60_000)
  await callTool($, { tool: PROGRESS, task: 'Ship it', percent: 100 })
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(heard).toEqual(['sounds/needs-you.wav', 'sounds/done.wav'])

  await $.turn.start({ text: 'What time is it?', turnId: 't2' })
  await $.turn.complete({ answer: 'Noon', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  expect(heard).toEqual(['sounds/needs-you.wav', 'sounds/done.wav'])
})

test('voice mode also says it in a few words', async ($, on) => {
  const { clock, heard } = soundWorld(on)
  await $.command.run({ command: 'glanceflow', args: 'sound voice' } as never)
  heard.length = 0
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' } as never)
  // The words follow the chime.
  await clock.advance(1)
  expect(heard).toEqual(['sounds/needs-you.wav', 'say: Claude braucht dich'])
})

test('desktop notices are off until turned on; then the computer says why Claude needs you', async ($, on) => {
  const { clock, heard } = soundWorld(on)
  const shown: string[][] = []
  on('process.run', (_, e) => {
    const argv = (e as { argv: readonly string[] }).argv
    // Not a Mac here: osascript cannot start, so Linux's notify-send shows it.
    if (argv[0] === 'osascript') throw new Error('osascript: not found')
    shown.push([...argv.slice(-2)])
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it', 'Ship it'] })
  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' } as never)
  await clock.advance(1)
  expect(shown).toEqual([])

  const result = await $.command.run({ command: 'glanceflow', args: 'notify on' } as never)
  expect(result.text).toContain('Desktop-Benachrichtigungen sind an')
  await clock.advance(1)
  expect(shown).toEqual([['Claude braucht dich', 'So sagt dir GlanceFlow Bescheid.']])
  shown.length = 0

  await callTool($, { tool: 'Bash', command: 'ls' })
  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' } as never)
  await clock.advance(1)
  expect(shown).toHaveLength(1)
  expect(shown[0]?.[0]).toBe('Claude braucht dich')
  expect(shown[0]?.[1]).toBeTruthy()
  // Sounds stay off: a notice alone.
  expect(heard).toEqual([])

  await clock.advance(2 * 60_000)
  await callTool($, { tool: PROGRESS, task: 'Ship it', percent: 100 })
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(1)
  expect(shown.at(-1)?.[0]).toBe('Fertig')

  await $.command.run({ command: 'glanceflow', args: 'notify off' } as never)
  shown.length = 0
  await $.turn.start({ text: 'Fix the footer', turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['Fix it', 'Check it'] })
  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' } as never)
  await clock.advance(1)
  expect(shown).toEqual([])
})

test('on Linux and Windows the chime and the words play through the computer\'s own player and voice', async ($, on) => {
  const { clock, heard } = soundWorld(on, false)
  const world = { system: 'Linux' }
  const ran: string[] = []
  on('env.get', (_, e) => ({ value: (e as { name: string }).name === 'OS' && world.system === 'Windows_NT' ? 'Windows_NT' : undefined }) as never)
  on('process.run', (_, e) => {
    const argv = (e as { argv: readonly string[] }).argv
    if (argv[0] === 'uname') return { value: { exitCode: 0, stdout: `${world.system}\n`, stderr: '' } } as never
    // This Linux has no PulseAudio: the next player is tried.
    if (argv[0] === 'paplay') throw new Error('paplay: not found')
    ran.push(argv.join(' '))
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  await $.command.run({ command: 'glanceflow', args: 'sound voice' } as never)

  const alertOn = async (system: string, turnId: string) => {
    world.system = system
    await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
    await clock.advance(1)
    ran.length = 0
    heard.length = 0
    await $.turn.start({ text: 'Build my landing page', turnId })
    await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' } as never)
    await clock.advance(1)
  }

  await alertOn('Linux', 't1')
  expect(heard).toEqual([])
  expect(ran).toHaveLength(2)
  expect(ran[0]).toMatch(/^pw-play \/.*\/sounds\/needs-you\.wav$/)
  expect(ran[1]).toBe('spd-say -w Claude braucht dich')

  await alertOn('Windows_NT', 't2')
  expect(heard).toEqual([])
  expect(ran[0]).toContain("sounds\\needs-you.wav').PlaySync()")
  expect(ran[1]).toContain(".Speak('Claude braucht dich')")
})

test('no news from Claude for 3 minutes says it may be stuck, with a notice; news clears it', async ($, on) => {
  const { clock } = soundWorld(on)
  const shown: string[][] = []
  on('process.run', (_, e) => {
    const argv = (e as { argv: readonly string[] }).argv
    if (argv[0] === 'osascript') throw new Error('osascript: not found')
    shown.push([...argv.slice(-2)])
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  await $.command.run({ command: 'glanceflow', args: 'notify on' } as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  await clock.advance(2 * 60_000)
  expect((await texts($, 'terminal')).join('\n')).not.toContain('nichts Neues')

  shown.length = 0
  await clock.advance(70_000)
  const quiet = (await texts($, 'terminal')).join('\n')
  expect(quiet).toContain('Seit 3 Minuten nichts Neues')
  expect(quiet).toContain('Esc')
  expect(shown.at(-1)?.[0]).toBe('Claude hängt fest')

  await callTool($, { tool: 'Bash', command: 'ls' })
  expect((await texts($, 'terminal')).join('\n')).not.toContain('nichts Neues')

  // Between turns, nothing is running, so nothing is stuck.
  await $.turn.complete({ answer: 'Which colour?', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(5 * 60_000)
  expect((await texts($, 'terminal')).join('\n')).not.toContain('nichts Neues')
})

test('near a plan limit the warning says when it resets, and a notice says so too', async ($, on) => {
  const { clock } = soundWorld(on)
  const shown: string[][] = []
  on('process.run', (_, e) => {
    const argv = (e as { argv: readonly string[] }).argv
    if (argv[0] === 'osascript') throw new Error('osascript: not found')
    shown.push([...argv.slice(-2)])
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.command.run({ command: 'glanceflow', args: 'notify on' } as never)
  await clock.advance(1)
  shown.length = 0
  const resetsAt = new Date(1_000_000 + 2 * 3_600_000)
  const at = `${String(resetsAt.getHours()).padStart(2, '0')}:${String(resetsAt.getMinutes()).padStart(2, '0')}`
  await $.session.measure({
    context: { window: 200_000, tokens: 20_000, percent: 10 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 82, resetsAt: resetsAt.toISOString() }],
    changed: ['context', 'rateLimits'],
  })
  await clock.advance(1)

  expect((await texts($, 'terminal')).join('\n')).toContain(`Du hast 82% deines Limits (5 Std.) verbraucht · wird um ${at} zurückgesetzt`)
  expect(shown).toEqual([['Plan-Limit', `Du hast 82% deines Limits (5 Std.) verbraucht. Es wird um ${at} zurückgesetzt.`]])

  const later = new Date(2026, 9, 6, 12, 0).getTime()
  expect(resetTime(new Date(2026, 9, 6, 18, 40).toISOString(), later)).toBe('um 18:40')
  expect(resetTime(new Date(2026, 9, 8, 9, 0).toISOString(), later)).toBe('am Do um 09:00')
  expect(resetTime(null, later)).toBe(null)
})

test('on Windows the desktop notice is a Windows toast, with the words passed as variables, not as script', async ($, on) => {
  const { clock } = soundWorld(on)
  const ran: { argv: readonly string[]; env?: Record<string, string> }[] = []
  on('env.get', (_, e) => ({ value: (e as { name: string }).name === 'OS' ? 'Windows_NT' : undefined }) as never)
  on('process.run', (_, e) => {
    const { argv, init } = e as { argv: readonly string[]; init?: { env?: Record<string, string> } }
    ran.push({ argv, env: init?.env })
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
  await clock.advance(1)
  await $.command.run({ command: 'glanceflow', args: 'notify on' } as never)
  await clock.advance(1)
  ran.length = 0

  await $.turn.start({ text: "Fix Ana's 'pricing' page", turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Fix it', 'Check it'] })
  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' } as never)
  await clock.advance(1)
  const toast = ran.find(one => one.argv[0] === 'powershell')
  expect(toast?.argv.at(-1)).toContain('ToastNotificationManager')
  expect(toast?.argv.at(-1)).not.toContain('pricing')
  expect(toast?.env?.GLANCEFLOW_TITLE).toBe('Claude braucht dich')
  expect(toast?.env?.GLANCEFLOW_BODY).not.toBe('')
  expect(ran.some(one => one.argv[0] === 'osascript' || one.argv[0] === 'notify-send')).toBe(false)
})

test('a finished job with helpers still running chimes only when they finish', async ($, on) => {
  const { clock, heard } = soundWorld(on)
  await $.command.run({ command: 'glanceflow', args: 'sound on' } as never)
  heard.length = 0
  await $.turn.start({ text: 'Merge the pull request', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Merge it', 'Watch the checks'] })
  await clock.advance(2 * 60_000)
  await callTool($, { tool: PROGRESS, task: 'Watch the checks', percent: 100 })
  await $.turn.complete({ answer: 'Merged.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.classic.Stop({
    stop_hook_active: false,
    background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'Watch CI' }],
  } as never)
  expect(heard.filter(one => one === 'sounds/done.wav').length).toBeLessThanOrEqual(1)
  const before = heard.length
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as never)
  expect(heard.slice(before)).toEqual(['sounds/done.wav'])
})

test('tool calls read as plain words', () => {
  expect(activityOf('Read', {})).toBe('Liest Dateien')
  expect(activityOf('Grep', {})).toBe('Durchsucht das Projekt')
  expect(activityOf('Edit', {})).toBe('Bearbeitet Dateien')
  expect(activityOf('Bash', { command: 'npm test -- --watch=false' })).toBe('Führt die Tests aus')
  expect(activityOf('Bash', { command: 'pnpm add zod' })).toBe('Installiert Pakete')
  expect(activityOf('Bash', { command: 'git status' })).toBe('Arbeitet mit Git')
  expect(activityOf('Bash', { command: 'ls -la' })).toBe('Führt einen Befehl aus')
  expect(activityOf('mcp__slack__post', {})).toBe('Nutzt eine verbundene App')
  expect(activityOf(PROGRESS, {})).toBe(null)
  expect(activityOf('TodoWrite', {})).toBe(null)
})

test('under the current step, what Claude is doing right now, in plain words', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Read notes', 'Write copy'] })
  await callTool($, { tool: 'Read', file_path: '/work/a.md' })
  await callTool($, { tool: 'Read', file_path: '/work/b.md' })
  let shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Liest Dateien (2)')
  expect(shown).not.toContain('a.md')

  await callTool($, { tool: 'Bash', command: 'npm test' })
  shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Führt die Tests aus')
  expect(shown).not.toContain('Liest Dateien')

  // A finished step starts the next one with a clean line.
  await callTool($, { tool: PROGRESS, task: 'Read notes', percent: 100 })
  shown = (await texts($, 'terminal')).join('\n')
  expect(shown).not.toContain('Führt die Tests aus')
})

test('calm mode: nothing moves, and statuses read in bold', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: {} as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  const result = await $.command.run({ command: 'glanceflow', args: 'calm on' } as never)
  expect(result.text).toContain('Ruhemodus ist an')
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Read notes', 'Write copy'] })
  // Only the clock text may change between frames; the bars and marks stay still.
  const still = (lines: string[]) => lines.join('\n').replace(/\d+ Sek\./g, '')
  const first = still(await texts($, 'terminal'))
  await clock.advance(750)
  const later = still(await texts($, 'terminal'))
  expect(later).toBe(first)
  expect(first).toContain('░░░░░░░░░░')

  await callTool($, { tool: PROGRESS, task: 'Write copy', percent: 100 })
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const done = (await ui.findAll({ type: 'Text' })).find(one => one.text.includes('✓ Fertig'))
  await ui.unmount()
  expect((done?.props as { bold?: boolean } | undefined)?.bold).toBe(true)
})

test('costs read in plain dollars', () => {
  expect(formatCost(0.004)).toBe('<0,01 $')
  expect(formatCost(0.4199)).toBe('0,42 $')
  expect(formatCost(3)).toBe('3,00 $')
})

test("in details, a job shows what it cost, and the history keeps it", async ($, on) => {
  world(on)
  historyWorld(on, { cwd: '/work/landing-site' })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  const measure = (usd: number) =>
    $.session.measure({ context: { window: 200_000, tokens: 1000, percent: 1 }, rateLimits: [], cost: { usd }, changed: ['cost'] } as never)
  await measure(1)
  await detailsOn($)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  await measure(1.42)
  expect((await texts($, 'terminal', 120)).join('\n')).toContain('0,42 $')
  // Simple keeps money out of view.
  await $.command.run({ command: 'glanceflow', args: 'details off' } as never)
  expect((await texts($, 'terminal', 120)).join('\n')).not.toContain('0,42 $')

  await callTool($, { tool: PROGRESS, task: 'Check it', percent: 100 })
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.command.run({ command: 'glanceflow', args: 'history' } as never)
  const pane = (await paneTexts($)).join('\n')
  expect(pane).toContain('0,42 $')
})

/** Jetzt aufräumen in the settings: the same tidy-up /glanceflow tidy starts for the Statistik mod's sponge. */
async function tidyFromSettings($: Engine) {
  const panel = await $.ui.mount({
    plugin: 'glanceflow',
    component: 'Pane',
    requestId: 'glanceflow-settings',
    surface: 'terminal',
    props: { title: 'Settings', isFocused: true, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  } as never)
  await panel.press({ key: 'tidy-now' })
  await panel.unmount()
}

/** Tidy it up as the settings and the Statistik mod's sponge do; the test says what compaction and /compact do. */
async function tidyWorld($: Engine, on: On, compactCommand: () => void) {
  mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text: string }).text))
    return { value: undefined } as never
  })
  on('ui.log', () => ({ value: undefined }) as never)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.compact', () => {
    throw new Error('not now')
  })
  const commands: string[] = []
  on('command.run', (_, e) => {
    commands.push(e.command)
    if (e.command === 'compact') compactCommand()
    return { text: '' }
  })
  await $.session.measure({ context: { window: 200_000, tokens: 160_000, percent: 80 }, rateLimits: [], changed: ['context'] } as never)
  await tidyFromSettings($)
  return { toasts, commands }
}

test('Tidy it up falls back to /compact when the engine refuses to compact', async ($, on) => {
  const { toasts, commands } = await tidyWorld($, on, () => undefined)
  expect(commands).toContain('compact')
  expect(toasts.join('\n')).not.toContain('ließ sich nicht aufräumen')
})

test('when /compact fails too, Tidy it up says why', async ($, on) => {
  const { toasts } = await tidyWorld($, on, () => {
    throw new Error('a turn is running')
  })
  // The engine's reason shows in brackets, so the next report says what went wrong.
  expect(toasts.join('\n')).toMatch(/Der Chat ließ sich nicht aufräumen \(.+\)\. Schreib \/compact, um es noch mal zu versuchen\./)
})

test("once, GlanceFlow brings over Glance's settings and history; another mod's store is left alone", async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }) as never)
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined } as never
  })
  on('store.delete', (_, e) => {
    store.delete(e.key)
    return { value: undefined } as never
  })
  on('store.keys', () => ({ value: [...store.keys()] }) as never)
  mock.env(on, { HOME: '/home/me' })
  const job = { jobId: 'j1', project: '/work', startedAt: 1, finishedAt: 2, title: 'Build the page', outcome: 'done', stepsDone: 1, stepsTotal: 1, newTokens: 0, cachedTokens: 0, doneSteps: ['Build the page'], openSteps: [], isQuickAnswer: false }
  const files: Record<string, unknown> = {
    'glance_claude-mods-1a2b.json': { 'history:2026-10-06': [job], glanceDetail: 'detailed', glanceSound: 'chime' },
    'glance_other-3c4d.json': { 'history:2026-10-06': [{ id: 'not ours' }], enabled: false },
    'notes_x-5e6f.json': { glanceCalm: true },
  }
  const reads: string[] = []
  on('fs.list', (_, e) => {
    expect(e.path).toBe('/home/me/.claude/plugins/store')
    return { value: Object.keys(files).map(name => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })) } as never
  })
  on('fs.read', (_, e) => {
    reads.push(e.path)
    return { value: JSON.stringify(files[e.path.split('/').pop()!]) } as never
  })
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)

  expect(store.get('history:2026-10-06:glance')).toEqual([job])
  expect(store.get('glanceDetail')).toBe('detailed')
  expect(store.get('glanceSound')).toBe('chime')
  expect(store.get('glanceEnabled')).toBeUndefined()
  expect(store.get('glanceCalm')).toBeUndefined()
  expect(reads).toHaveLength(2)
})

/** A finished job in History: `units` of step size that took `ms` in all. */
function pastJob(jobId: string, project: string, units: number, ms: number, outcome: GlanceOutcome = 'done'): GlanceHistoryEntry {
  return { jobId, project, startedAt: 1, finishedAt: 2, title: 'Earlier job', outcome, stepsDone: 2, stepsTotal: 2, newTokens: 0, cachedTokens: 0, doneSteps: [], openSteps: [], isQuickAnswer: false, doneUnits: units, doneMs: ms }
}

test("a project's pace comes from its finished jobs, once there is enough to go on", () => {
  const site = '/work/landing-site'
  expect(paceFromHistory([pastJob('a', site, 4, 240_000)], site)).toBeNull()
  expect(
    paceFromHistory(
      [
        pastJob('a', site, 4, 240_000),
        pastJob('b', site, 4, 240_000),
        pastJob('c', '/work/other', 8, 10),
        pastJob('d', site, 8, 10, 'stopped'),
      ],
      site,
    ),
  ).toBe(60_000)
})

test("with this project's pace known, time left shows from the first step and leans toward this job's own pace", async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on, { 'history:2026-10-05': [pastJob('a', '/work/landing-site', 4, 240_000), pastJob('b', '/work/landing-site', 4, 240_000)] })
  on('session.cwd', () => ({ value: '/work/landing-site' }) as never)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: {} as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  // 1 + 2 + 2 + 3 = 8 units at this project's 1 minute a unit.
  await callTool($, { tool: PLAN, steps: ['Read notes', 'Write copy', 'Add form', 'Polish it'], sizes: ['S', 'M', 'M', 'L'] })
  expect((await texts($, 'terminal')).join('\n')).toContain('noch etwa 8 Min.')

  // This job's first unit took 30s: (30s + 2 × 60s) / 3 = 50s a unit, × 7 units left ≈ 6m.
  await clock.advance(30_000)
  await callTool($, { tool: PROGRESS, task: 'Read notes', percent: 100 })
  expect((await texts($, 'terminal')).join('\n')).toContain('noch etwa 6 Min.')
})

test('a finished job keeps the size and time of its steps, so the next job learns from it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }) as never)
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined } as never
  })
  on('store.delete', (_, e) => {
    store.delete(e.key)
    return { value: undefined } as never
  })
  on('store.keys', () => ({ value: [...store.keys()] }) as never)
  on('session.cwd', () => ({ value: '/work/landing-site' }) as never)
  on('session.id', () => ({ value: 'chat-1' }) as never)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: {} as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.Notification', () => ({}) as never)

  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write copy', 'Polish it'], sizes: ['M', 'L'] })
  await clock.advance(2 * 60_000)
  await callTool($, { tool: PROGRESS, task: 'Write copy', percent: 100 })
  await clock.advance(3 * 60_000)
  await callTool($, { tool: PROGRESS, task: 'Polish it', percent: 100 })
  await $.turn.complete({ turnId: 't1' } as never)

  const saved = [...store.entries()].find(([key]) => key.startsWith('history:'))?.[1] as { doneUnits: number; doneMs: number }[]
  expect(saved[0]?.doneUnits).toBe(5)
  expect(saved[0]?.doneMs).toBe(5 * 60_000)
})

test("a finished step's summary shows under it until Claude moves on, and code stays out of it", async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Add pricing', 'Check it'] })
  await callTool($, {
    tool: PROGRESS,
    task: 'Add pricing',
    percent: 100,
    summary: 'Added a pricing table with three plans in `src/Pricing.tsx`',
  })
  let shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('    Added a pricing table with three plans in')
  expect(shown).not.toContain('Pricing.tsx')

  await callTool($, { tool: 'Read', file_path: '/work/a.md' })
  shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Liest Dateien')
  expect(shown).not.toContain('Added a pricing table')
})

test("the team report says what each step got done, in Claude's words where it gave them", () => {
  const report = teamReport({
    day: '2026-10-06',
    project: '/work/landing-site',
    entries: [
      { ...ENTRY, jobId: 'a', startedAt: 0, finishedAt: 12 * 60_000, title: 'Build the pricing section', outcome: 'done', stepsDone: 2, stepsTotal: 2, doneSteps: ['Write it', 'Check it'], doneNotes: ['Added three plans with monthly and yearly prices', ''], openSteps: [] },
    ],
  })
  expect(report).toContain('  ✓ Added three plans with monthly and yearly prices\n  ✓ Check it')
})

test('the weekly team report covers the 7 days up to the day picked, and This week switches to it', async ($, on) => {
  mock.clock(on, { now: new Date(2026, 9, 6, 18, 0).getTime() })
  const job = (jobId: string, day: number, title: string) => ({
    ...ENTRY,
    jobId,
    startedAt: new Date(2026, 9, day, 9, 0).getTime(),
    finishedAt: new Date(2026, 9, day, 9, 30).getTime(),
    title,
    outcome: 'done',
    stepsDone: 1,
    stepsTotal: 1,
    doneSteps: [title],
    openSteps: [],
  })
  mock.store(on, {
    'history:2026-10-06': [job('a', 6, 'Build the pricing section')],
    'history:2026-10-02': [job('b', 2, 'Fix the contact form')],
    'history:2026-09-29': [job('c', 29 - 30, 'Too old for this week')],
  })
  let copied = ''
  on('session.cwd', () => ({ value: '/work/landing-site' }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('ui.copy', (_, e) => {
    copied = e.text
    return { value: { isCopied: true } } as never
  })
  await $.command.run({ command: 'glanceflow', args: 'history' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'report' })
  await ui.unmount()
  const report = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await report.press({ key: 'span' })
  await report.unmount()
  expect(copied).toMatch(/Wochenbericht · landing-site · 30\. Sept?\. 2026 bis 6\. Okt\. 2026/)
  expect(copied).toContain('• Build the pricing section (30 Min.)')
  expect(copied).toContain('• Fix the contact form (30 Min.)')
  expect(copied).not.toContain('Too old')
  expect(copied).toContain('2 von 2 Aufgaben abgeschlossen · 1 Std. Arbeitszeit')
  expect((await paneTexts($)).join('\n')).toContain('Dieser Tag')
})

test('your week sums up every project: steps, tasks, time, the busiest day and the biggest tasks', async ($, on) => {
  mock.clock(on, { now: new Date(2026, 9, 6, 18, 0).getTime() })
  const job = (jobId: string, day: number, title: string, steps: number, project = '/work/landing-site') => ({
    ...ENTRY,
    jobId,
    project,
    startedAt: new Date(2026, 9, day, 9, 0).getTime(),
    finishedAt: new Date(2026, 9, day, 9, 30).getTime(),
    title,
    outcome: 'done',
    stepsDone: steps,
    stepsTotal: steps,
    doneSteps: Array.from({ length: steps }, (_, at) => `Step ${at + 1}`),
    openSteps: [],
  })
  mock.store(on, {
    'history:2026-10-06': [job('a', 6, 'Build the pricing section', 4), job('b', 6, 'Write the newsletter', 2, '/work/newsletter')],
    'history:2026-10-02': [job('c', 2, 'Fix the contact form', 1), { ...job('q', 2, 'What time is it?', 0), isQuickAnswer: true }],
    'history:2026-09-29': [job('d', 29 - 30, 'Too old for this week', 5)],
  })
  let copied = ''
  on('session.cwd', () => ({ value: '/work/landing-site' }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('ui.copy', (_, e) => {
    copied = e.text
    return { value: { isCopied: true } } as never
  })
  const result = await $.command.run({ command: 'glanceflow', args: 'week' } as never)
  expect(result.text).toBe('Claude hat 7 Schritte in 3 Aufgaben abgehakt und 3 davon abgeschlossen.')
  expect(copied).toMatch(/Deine Woche mit Claude · 30\. Sept?\. 2026 bis 6\. Okt\. 2026/)
  expect(copied).toContain('Arbeitszeit: 1 Std. 30 Min., verteilt auf 2 Projekte.')
  expect(copied).toContain('Aktivster Tag: Dienstag, mit 2 Aufgaben.')
  expect(copied).toContain('• Build the pricing section (4 Schritte)')
  expect(copied).toContain('• Write the newsletter (2 Schritte)')
  expect(copied).not.toContain('Too old')
  expect(copied).not.toContain('What time is it')
  const shown = (await paneTexts($)).join('\n')
  expect(shown).toContain('Deine Woche mit Claude')
  expect(shown).not.toContain('Diese Woche')

  // From the list, Your week shows it again.
  const back = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await back.press({ key: 'back' })
  await back.unmount()
  copied = ''
  const list = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await list.press({ key: 'mine' })
  await list.unmount()
  expect(copied).toContain('Claude hat 7 Schritte in 3 Aufgaben abgehakt')
})

test('a week with no planned work says so plainly', () => {
  expect(weekSummary([], '2026-10-06')).toContain('Diese Woche wurde keine geplante Arbeit erfasst.')
})

test("the band says in one whole sentence what Claude is doing; the Plan says more", async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Check the page', 'Fix the links'] })
  await callTool($, { tool: 'Bash', command: 'npx playwright test --project=mobile', description: 'Check the page on a phone screen' })
  let shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Jetzt: Check the page on a phone screen')
  expect(shown).not.toContain('playwright')
  expect(shown).not.toContain('…')

  // Too long for a narrow band: the short label instead of a cut sentence.
  shown = (await texts($, 'terminal', 34)).join('\n')
  expect(shown).toContain('Führt die Tests aus')
  expect(shown).not.toContain('Jetzt: Check')

  // The Plan, in Details, adds what Claude runs.
  await detailsOn($)
  const pane = await planPaneTexts($)
  expect(pane).toContain('Jetzt: Check the page on a phone screen')
  expect(pane).toContain('↳ npx playwright test --project=mobile')
})

test('the Plan shows long step names whole in a narrow panel', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Keep the product profile private', 'Load the social media guide'] })
  const ui = await $.ui.mount({ ...PLAN_PANE, props: { ...PLAN_PANE.props, bodyColumns: 40 }, surface: 'terminal' })
  const pane = (await ui.findAll({ type: 'Text' })).map(one => one.text).join('\n')
  await ui.unmount()
  expect(pane).toContain('Keep the product profile private')
  expect(pane).toContain('Load the social media guide')
  expect(pane).not.toContain('priva…')
})

test('someone new gets a three-card welcome once; /glanceflow tour shows it again', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)

  const shown = (await texts($, 'terminal', 120)).join('\n')
  expect(shown).toContain('Willkommen bei GlanceFlow · 1 von 3')
  expect(shown).toContain('Hier erscheint eine Checkliste, wenn du Claude')
  expect(shown).toContain('≣ Verlauf')
  for (const card of ['2 von 3', '3 von 3']) {
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await band.press({ key: 'tour-next' })
    await band.unmount()
    expect((await texts($, 'terminal', 120)).join('\n')).toContain(card)
  }
  expect((await texts($, 'terminal', 120)).join('\n')).toContain('✓ Verstanden')
  const last = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await last.press({ key: 'tour-next' })
  await last.unmount()
  expect((await texts($, 'terminal', 120)).join('\n')).not.toContain('Willkommen bei GlanceFlow')

  // The next chat does not show it again.
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
  expect((await texts($, 'terminal', 120)).join('\n')).not.toContain('Willkommen bei GlanceFlow')

  await $.command.run({ command: 'glanceflow', args: 'tour' } as never)
  expect((await texts($, 'terminal', 120)).join('\n')).toContain('Willkommen bei GlanceFlow · 1 von 3')
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await band.press({ key: 'tour-skip' })
  await band.unmount()
  expect((await texts($, 'terminal', 120)).join('\n')).not.toContain('Willkommen bei GlanceFlow')
})

test('someone who already uses GlanceFlow is not welcomed again', async ($, on) => {
  mock.store(on, { glanceSound: 'chime' })
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
  expect((await texts($, 'terminal', 120)).join('\n')).not.toContain('Willkommen bei GlanceFlow')
})

test('a time Claude writes in UTC shows in the person\'s own time', () => {
  const today = new Date(Date.UTC(2026, 9, 6, 9, 0))
  const local = (hours: number, minutes: number, seconds?: number) => {
    const at = new Date(Date.UTC(2026, 9, 6, hours, minutes, seconds ?? 0))
    const two = (value: number) => String(value).padStart(2, '0')
    return `${two(at.getHours())}:${two(at.getMinutes())}${seconds === undefined ? '' : `:${two(at.getSeconds())}`}`
  }
  expect(localTimes('Wait until 10:01:45 UTC to start the deploy', today)).toBe(`Wait until ${local(10, 1, 45)} to start the deploy`)
  expect(localTimes('Check again at 9:30 GMT and 23:05Z', today)).toBe(`Check again at ${local(9, 30)} and ${local(23, 5)}`)
  // Without UTC, GMT or Z the time could be anyone's: it stays as Claude wrote it.
  expect(localTimes('Wait for the 10:15 cron run to finish', today)).toBe('Wait for the 10:15 cron run to finish')
  expect(cleanName('Wait until 10:01:45 UTC to start the checks')).not.toContain('UTC')
})

test('a request in another language gets an English title', () => {
  expect(isLatinText('Build my landing page')).toBe(true)
  expect(isLatinText('Φτιάξε τη σελίδα μου')).toBe(false)
  expect(isGermanText('Ich habe die Seite gebaut und die Tests laufen jetzt grün.')).toBe(true)
  expect(isGermanText('Fertig: Preisseite überarbeitet.')).toBe(true)
  expect(isGermanText('I built the page and the tests pass now.')).toBe(false)
  expect(isGermanText('The tests for die() and das() pass, and the build is green.')).toBe(false)
  expect(isGermanText('')).toBe(false)
  expect(isStartWords('Go ahead')).toBe(true)
  expect(isStartWords('ξεκίνα')).toBe(true)
  expect(isStartWords('change step two')).toBe(false)
})

test('with Approve the plan first on, Claude waits for Start before it works', async ($, on) => {
  world(on)
  const on_ = await $.command.run({ command: 'glanceflow', args: 'approve on' } as never)
  expect(on_.text).toContain('wartet')
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  const planned = await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect(String(planned.result)).toContain('warte auf ihre Antwort')
  let shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Lies den Plan, dann drück Start')
  expect(shown).toContain('▶ Start')
  const denied = await callTool($, { tool: 'Bash', command: 'ls' })
  expect(denied.deny).toContain('noch nicht freigegeben')

  await $.turn.start({ text: 'Der Plan sieht gut aus. Leg bitte los.', turnId: 't2' })
  const ran = await callTool($, { tool: 'Bash', command: 'ls' })
  expect(ran.deny).toBeUndefined()
  shown = (await texts($, 'terminal')).join('\n')
  expect(shown).not.toContain('▶ Start')
  expect(shown).toContain('Write the page')
})

test('with Approve the plan first on, a plan Claude makes with its own task list also waits for Start', async ($, on) => {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'approve on' } as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: 'TaskCreate', subject: 'Write the page' } as never)
  await callTool($, { tool: 'TaskCreate', subject: 'Check it' } as never)
  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Lies den Plan, dann drück Start')
  expect(shown).toContain('Check it')
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')

  await $.turn.start({ text: 'start', turnId: 't2' })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  await callTool($, { tool: 'TodoWrite', todos: [{ content: 'Write the page', status: 'in_progress' }] } as never)
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
})

test('each step shows the files Claude added or changed, in the Plan and in History', async ($, on) => {
  world(on)
  historyWorld(on, { cwd: '/work/landing-site' })
  const existing = new Set(['/work/landing-site/styles.css', '/work/landing-site/index.html'])
  on('fs.exists', (_, e) => ({ value: existing.has((e as { path: string }).path) }) as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Add the contact form', 'Check it'] })
  await callTool($, { tool: 'Write', file_path: '/work/landing-site/contact.html', content: '<form>' })
  await callTool($, { tool: 'Edit', file_path: '/work/landing-site/styles.css', old_string: 'a', new_string: 'b' })
  await callTool($, { tool: 'Edit', file_path: '/work/landing-site/contact.html', old_string: 'a', new_string: 'b' })
  // A helper's edit counts for the step it works under.
  await callTool($, { tool: 'Edit', file_path: '/work/landing-site/index.html', old_string: 'a', new_string: 'b', agentId: 'a1' })
  expect(await planPaneTexts($)).toContain('Neu: contact.html · Geändert: styles.css und index.html (bisher)')

  await callTool($, { tool: PROGRESS, task: 'Add the contact form', percent: 100, summary: 'Added a contact form' })
  await callTool($, { tool: PROGRESS, task: 'Check it', percent: 100 })
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  const plan = await planPaneTexts($)
  expect(plan).toContain('    Neu: contact.html · Geändert: styles.css und index.html')
  expect(plan).not.toContain('bisher')

  await $.command.run({ command: 'glanceflow', args: 'history' } as never)
  expect((await paneTexts($)).join('\n')).toContain('Neu: contact.html · Geändert: styles.css und index.html')

  // Names only; the folder where two share a name, and a long list cut short.
  expect(
    filesNote([
      { path: 'app/page.tsx', isNew: false },
      { path: 'app/pricing/page.tsx', isNew: false },
      { path: 'a.css', isNew: false },
      { path: 'b.css', isNew: false },
      { path: 'c.css', isNew: false },
    ]),
  ).toBe('Geändert: app/page.tsx, pricing/page.tsx, a.css, b.css und 1 weitere')
  expect(filesNote([{ path: 'notes.md', isNew: true }])).toBe('Neu: notes.md')
  expect(filesNote([])).toBe('')
})

/** The same world as `world`, with the clock and a store the test can read, starting with `entries`. */
function resumeWorld(on: On, entries: Record<string, unknown> = {}, failsToDelete = false) {
  const clock = mock.clock(on, { now: 1_000_000 })
  const store = new Map(Object.entries(entries))
  on('store.get', (_, e) => ({ value: store.get((e as { key: string }).key) }) as never)
  on('store.set', (_, e) => {
    store.set((e as { key: string }).key, (e as { value: unknown }).value)
    return { value: undefined } as never
  })
  on('store.delete', (_, e) => {
    if (failsToDelete) throw new Error('locked')
    store.delete((e as { key: string }).key)
    return { value: undefined } as never
  })
  on('store.keys', () => ({ value: [...store.keys()] }) as never)
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Build my landing page', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: {} as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.Notification', () => ({}) as never)
  // This chat's id; a test changes it to stand for /clear, after which the process goes on as another chat.
  const session = { id: 'chat-1' }
  on('session.id', () => ({ value: session.id }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  const registered: string[] = []
  on('tool.register', (_, e) => {
    registered.push((e as { name: string }).name)
    return { value: undefined } as never
  })
  on('command.register', () => ({ value: undefined }) as never)
  return { clock, store, registered, session }
}

test("a chat's checklist is kept as it changes, for when the chat is resumed", async ($, on) => {
  const { clock, store } = resumeWorld(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  await callTool($, { tool: PROGRESS, task: 'Write the page', percent: 100, summary: 'Wrote the page' })
  await clock.advance(1500)
  const kept = store.get('resume:chat-1') as { list: { phase: string; tasks: { name: string; status: string }[] } } | undefined
  expect(kept?.list.phase).toBe('working')
  expect(kept?.list.tasks.map(one => `${one.name}:${one.status}`)).toEqual(['Write the page:done', 'Check it:active'])
})

test('a resumed chat gets its checklist back, paused, and Continue picks it up', async ($, on) => {
  const task = (name: string, status: string) => ({
    id: name, name, status, percent: status === 'done' ? 100 : 40, hasReported: true, size: 'M', summary: status === 'done' ? 'Wrote the page' : null,
    tokens: 0, cachedTokens: 0, startedAt: 1_000_000, finishedAt: status === 'done' ? 1_060_000 : null,
  })
  const list = {
    title: 'Build my landing page', phase: 'working', tasks: [task('Write the page', 'done'), task('Check it', 'active')],
    needsYouReason: null, stuckReason: null, startedAt: 1_000_000, finishedAt: null, isCollapsed: false, hasPlan: true, jobId: 'job-1',
    planAt: 1_000_000, plannedCount: 2, extraTokens: 0, extraCachedTokens: 0, stopKind: null, approval: 'none', costAtStart: null, paceMs: null,
    activity: { label: 'Running a command', count: 1, detail: null, target: null },
    helpers: [{ id: 'h1', stepId: 'Check it', kind: 'helper', label: 'Check phones', type: 'Explore', model: null, effort: null, status: 'running', tokens: 0 }],
  }
  resumeWorld(on, {
    glanceResume: { 'chat-1': { at: 1_100_000, list }, 'chat-2': { at: 1_100_000, list: { ...list, title: 'Another chat' } } },
  })
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)

  let shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('‖ Pausiert')
  expect(shown).toContain('Check it')
  expect(shown).toContain('▶ Weiter')
  expect(shown).not.toContain('Another chat')
  // A helper that was running died with the old process.
  expect(shown).not.toContain('Check phones')

  await $.turn.start({ text: 'continue', turnId: 't2' })
  shown = (await texts($, 'terminal')).join('\n')
  expect(shown).not.toContain('Pausiert')
  expect(shown).toContain('Check it')
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
})

test("each chat keeps its checklist under its own key; the old shared key moves over and only the 20 most recent stay", async ($, on) => {
  const saved = (at: number, title: string) => ({ at, list: { title, phase: 'done', tasks: [], helpers: [], startedAt: at, finishedAt: at } })
  const recent = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`resume:chat-${i + 10}`, saved(2_000_000 + i, `Chat ${i + 10}`)]))
  const { store } = resumeWorld(on, {
    ...recent,
    glanceResume: { 'chat-2': saved(900_000, 'Old chat'), 'chat-3': saved(950_000, 'Older chat kept'), 'chat-10': saved(1, 'Stale copy') },
  })
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)

  expect(store.has('glanceResume')).toBe(false)
  // A chat that already has its own key keeps it over the old shared copy.
  expect((store.get('resume:chat-10') as { list: { title: string } }).list.title).toBe('Chat 10')
  expect((store.get('resume:chat-3') as { list: { title: string } }).list.title).toBe('Older chat kept')
  // 20 other chats, 19 kept beside this one: the oldest goes.
  expect(store.has('resume:chat-2')).toBe(false)
  expect([...store.keys()].filter(key => key.startsWith('resume:'))).toHaveLength(19)
})

test('a store that fails while tidying saved checklists does not keep the chat from starting', async ($, on) => {
  const { registered } = resumeWorld(on, { glanceResume: { 'chat-2': { at: 1, list: { title: 'Old', phase: 'done' } } } }, true)
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
  expect(registered).toContain('plan_steps')
})

test('saving one chat never touches another chat\'s key', async ($, on) => {
  const other = { at: 5, list: { title: 'Another chat', phase: 'working' } }
  const { clock, store } = resumeWorld(on, { 'resume:chat-2': other })
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page'] })
  await clock.advance(1500)
  expect(store.get('resume:chat-2')).toEqual(other)
  expect((store.get('resume:chat-1') as { list: { title: string } }).list.title).toBe('Build my landing page')
})

test('the other chats worth a word: those that need you first, then those at work; ended, finished or silent ones are left out', () => {
  const at = 10 * OTHER_WAITING_MS
  const chat = (title: string, phase: string, ago: number, isOpen = true) => ({ at: at - ago, list: { title, phase }, isOpen }) as never
  const others = otherChats(
    [
      chat('Write the email', 'working', 1000),
      chat('Build the pricing page', 'needsYou', 5000),
      chat('Fix the form', 'stuck', 2000),
      chat('Closed one', 'needsYou', 10, false),
      { at: at - 10, list: { title: 'Saved before 0.25', phase: 'needsYou' } } as never,
      chat('Finished', 'done', 10),
      chat('Paused', 'stopped', 10),
      chat('Went silent', 'working', OTHER_WORKING_MS + 1),
      chat('Left for days', 'needsYou', OTHER_WAITING_MS + 1),
      undefined,
    ],
    at,
  )
  expect(others.map(one => one.title)).toEqual(['Fix the form', 'Build the pricing page', 'Write the email'])
  expect(otherChatsWords(others)).toEqual(['2 andere Chats brauchen dich: Fix the form, Build the pricing page', '1 weiterer arbeitet'])
  expect(otherChatsWords(others.slice(1, 2))).toEqual(['Ein anderer Chat braucht dich: Build the pricing page'])
  expect(otherChatsWords(others.slice(2))).toEqual(['1 anderer Chat arbeitet'])
  expect(otherChatsWords([])).toEqual([])
})

test('the band names another chat that needs you, on every surface, and keeps up as the other chats change', async ($, on) => {
  const saved = (title: string, phase: string) => ({
    at: 1_000_000, isOpen: true, list: { title, phase, tasks: [], helpers: [], startedAt: 1_000_000, finishedAt: null },
  })
  const { clock, store } = resumeWorld(on, { 'resume:chat-2': saved('Write the email', 'working') })
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
  for (const surface of SURFACES) {
    expect((await texts($, surface)).join('\n')).toContain('1 anderer Chat arbeitet')
  }

  store.set('resume:chat-3', saved('Build the pricing page', 'needsYou'))
  await clock.advance(20_000)
  for (const surface of SURFACES) {
    const shown = (await texts($, surface)).join('\n')
    expect(shown).toContain('Ein anderer Chat braucht dich: Build the pricing page')
    expect(shown).toContain('1 weiterer arbeitet')
  }

  // A chat that ended is no longer mentioned, and this chat never mentions itself.
  store.set('resume:chat-3', { ...saved('Build the pricing page', 'needsYou'), isOpen: false })
  store.set('resume:chat-1', saved('This chat', 'needsYou'))
  await clock.advance(20_000)
  const shown = (await texts($, 'desktop')).join('\n')
  expect(shown).not.toMatch(/braucht dich|brauchen dich/)
  expect(shown).toContain('1 anderer Chat arbeitet')
})

test('a chat that ends marks its checklist closed and keeps it for when it is resumed', async ($, on) => {
  const { clock, store } = resumeWorld(on)
  on('session.end', () => ({ sessionId: 'chat-1' }) as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page'] })
  await clock.advance(1500)
  await $.session.end({ reason: 'exit' } as never)
  const kept = store.get('resume:chat-1') as { isOpen?: boolean; list: { title: string } }
  expect(kept.isOpen).toBe(false)
  expect(kept.list.title).toBe('Build my landing page')
})

test('a chat that ends right after a change stays marked closed', async ($, on) => {
  const { clock, store } = resumeWorld(on)
  on('session.end', () => ({ sessionId: 'chat-1' }) as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page'] })
  await $.session.end({ reason: 'exit' } as never)
  await clock.advance(1500)
  expect((store.get('resume:chat-1') as { isOpen?: boolean }).isOpen).toBe(false)
})

test('after /clear the chat goes on as a new one: the old one is closed, the new one is open and still reads the others', async ($, on) => {
  const saved = { at: 1_000_000, isOpen: true, list: { title: 'Build the pricing page', phase: 'needsYou', tasks: [], helpers: [], startedAt: 1_000_000, finishedAt: null } }
  const { clock, store, session } = resumeWorld(on, { 'resume:chat-2': saved })
  on('session.end', () => ({ sessionId: 'chat-1' }) as never)
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page'] })
  await clock.advance(1500)
  await $.session.end({ reason: 'clear', sessionId: 'chat-1' } as never)
  session.id = 'chat-3'
  expect((store.get('resume:chat-1') as { isOpen?: boolean }).isOpen).toBe(false)

  await $.turn.start({ text: 'Fix the footer', turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['Fix it'] })
  await clock.advance(1500)
  expect((store.get('resume:chat-3') as { isOpen?: boolean }).isOpen).toBe(true)
  store.set('resume:chat-2', { ...saved, list: { ...saved.list, phase: 'done' } })
  await clock.advance(20_000)
  expect((await texts($, 'desktop')).join('\n')).not.toContain('Ein anderer Chat braucht dich')
})

test('a resumed chat that still waits on the person is saved as open again, so the other chats name it', async ($, on) => {
  const list = {
    title: 'Build my landing page', phase: 'needsYou', needsYouReason: 'Antworte Claude im Feld unten', stuckReason: null, tasks: [], helpers: [],
    startedAt: 1_000_000, finishedAt: null, isCollapsed: false,
  }
  const { clock, store } = resumeWorld(on, { 'resume:chat-1': { at: 1_000_000, list, isOpen: false } })
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
  await clock.advance(1500)
  const kept = store.get('resume:chat-1') as { isOpen?: boolean; list: { phase: string } }
  expect(kept.isOpen).toBe(true)
  expect(kept.list.phase).toBe('needsYou')
})

test('the other chats line can be turned off in Settings or with /glanceflow others off', async ($, on) => {
  const saved = { at: 1_000_000, isOpen: true, list: { title: 'Build the pricing page', phase: 'needsYou', tasks: [], helpers: [], startedAt: 1_000_000, finishedAt: null } }
  const { clock, store } = resumeWorld(on, { 'resume:chat-2': saved })
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
  await clock.advance(20_000)
  expect((await texts($, 'desktop')).join('\n')).toContain('Ein anderer Chat braucht dich')
  const result = await $.command.run({ command: 'glanceflow', args: 'others off' } as never)
  expect(result.text).toContain('erwähnt keine anderen Chats mehr')
  expect(store.get('glanceOthers')).toBe(false)
  for (const surface of SURFACES) {
    expect((await texts($, surface)).join('\n')).not.toContain('Ein anderer Chat')
  }
  await $.command.run({ command: 'glanceflow', args: 'others on' } as never)
  expect((await texts($, 'desktop')).join('\n')).toContain('Ein anderer Chat braucht dich')
})

test('in a narrow band the chat that needs you is named, never left out for the count of chats at work', async ($, on) => {
  const saved = (title: string, phase: string) => ({
    at: 1_000_000, isOpen: true, list: { title, phase, tasks: [], helpers: [], startedAt: 1_000_000, finishedAt: null },
  })
  const { clock } = resumeWorld(on, {
    'resume:chat-2': saved('Write the welcome email for the launch', 'working'),
    'resume:chat-3': saved('Build the pricing page with three plans', 'needsYou'),
  })
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
  await clock.advance(20_000)
  for (const surface of SURFACES) {
    const shown = (await texts($, surface, 50)).join('\n')
    expect(shown).toContain('Ein anderer Chat braucht dich')
    expect(shown).not.toMatch(/weiterer? arbeite/)
  }
})

const PLAN_PANE = {
  plugin: 'glanceflow',
  component: 'Pane',
  requestId: 'glanceflow-plan',
  props: { title: 'Plan', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

async function planPaneTexts($: Engine): Promise<string> {
  const ui = await $.ui.mount({ ...PLAN_PANE, surface: 'terminal' })
  const found = [...(await ui.findAll({ type: 'Text' })), ...(await ui.findAll({ type: 'Button' }))].map(one => one.text)
  await ui.unmount()

  return found.join('\n')
}

test('▤ Plan opens the whole plan beside the chat: every step, what it got done, its time and what Claude is doing', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: {} as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('classic.Notification', () => ({}) as never)

  expect(await planPaneTexts($)).toContain('Noch kein Plan')
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  const steps = ['Read notes', 'Write copy', 'Add pricing', 'Add form', 'Add footer', 'Add menu', 'Check phones', 'Ship it']
  await callTool($, { tool: PLAN, steps })
  await clock.advance(90_000)
  await callTool($, { tool: PROGRESS, task: 'Read notes', percent: 100, summary: 'Found your colors and tone of voice' })
  await callTool($, { tool: 'Read', file_path: '/work/copy.md' })

  // The band keeps to its rows; the panel has room for every step.
  const band = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 6 }, surface: 'terminal' })
  await band.press({ key: 'plan' })
  await band.unmount()
  expect(opened).toEqual(['glanceflow-plan'])

  const pane = await planPaneTexts($)
  for (const name of steps) expect(pane).toContain(name)
  expect(pane).toContain(' dauerte 1 Min. 30 Sek.')
  expect(pane).toContain('    Found your colors and tone of voice')
  expect(pane).toContain('    Jetzt: Liest Dateien')
  expect(pane).toContain('1 von 8 Schritten fertig')
  // More than the band: when it started, the steps grouped, and how long each step still to come should take.
  expect(pane).toMatch(/Begonnen \d\d:\d\d · bisher 1 Min\. 30 Sek\./)
  expect(pane).toMatch(/^Fertig$/m)
  expect(pane).toMatch(/^Jetzt$/m)
  expect(pane).toMatch(/^Als Nächstes$/m)
  expect(pane).toContain(' etwa 2 Min.')

  // In Details, the same percentage as the band, tokens per step, and what Claude needs from you.
  await $.command.run({ command: 'glanceflow', args: 'details on' } as never)
  await clock.advance(60_000)
  await callTool($, { tool: 'mcp__glanceflow__report_progress', task: 'Write copy', percent: 100 })
  await clock.advance(30_000)
  await callTool($, { tool: 'mcp__glanceflow__report_progress', task: 'Add pricing', percent: 40 })
  const band40 = (await texts($, 'terminal')).join('\n')
  const percent = /· (\d+)% ·/.exec(band40)?.[1]
  const details = await planPaneTexts($)
  expect(details).toContain(` ${percent}% · 2 von 8 Schritten fertig`)
  // Time left follows the percentage shown, so band and panel agree.
  const bandLeft = /noch etwa (\d+ \S+(?: \d+ \S+)?)/.exec(band40)?.[1]
  expect(bandLeft).toBeDefined()
  expect(details).toContain(`noch etwa ${bandLeft}`)
  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' } as never)
  expect(await planPaneTexts($)).toContain('Braucht dich: Beantworte Claudes Anfrage im Chat')
  const desktop = await $.ui.mount({ ...PLAN_PANE, surface: 'desktop' })
  expect((await desktop.findAll({ type: 'Text' })).map(one => one.text).join('\n')).toContain('Ship it')
  await desktop.unmount()

  const result = await $.command.run({ command: 'glanceflow', args: 'plan' } as never)
  expect(result.text).toBe('Der Plan ist in der Seitenleiste.')
  expect(opened).toHaveLength(2)
})

test('"continue" typed after Esc picks the same job up; a new request starts a new one', async ($, on) => {
  world(on)
  expect(['continue', 'Continue.', 'go on', 'keep going', 'please continue', 'Συνέχισε', 'συνέχισε παρακαλώ', 'προχώρα'].every(isContinueWords)).toBe(true)
  expect(['continue with the footer', 'add a menu', 'συνέχισε με το μενού'].some(isContinueWords)).toBe(false)

  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it', 'Ship it'] })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' })
  let shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('■ Gestoppt')
  expect(shown).toContain('\nGestoppt')

  await $.turn.start({ text: 'συνέχισε', turnId: 't2' })
  shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Build my landing page')
  expect(shown).toContain('Write the page')
  expect(shown).not.toContain('Gestoppt')

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't2', reason: 'aborted' })
  await $.turn.start({ text: 'Add a contact form', turnId: 't3' })
  shown = (await texts($, 'terminal')).join('\n')
  expect(shown).not.toContain('Write the page')
})

test('German carry-on words continue a job and German go-ahead words approve a plan; "nein" does neither', () => {
  expect(
    ['weiter', 'Weiter.', 'mach weiter', 'Mach weiter!', 'weiter bitte', 'bitte weiter', 'mach bitte weiter', 'weitermachen', 'fortfahren', 'fahr fort', "weiter geht's", 'ja, weiter', 'ok, mach weiter'].every(isContinueWords),
  ).toBe(true)
  expect(['weiter mit dem Footer', 'mach das Menü', 'nicht weiter', 'nein', 'weiter so?'].some(isContinueWords)).toBe(false)
  expect(['los', 'Los!', 'leg los', "los geht's", 'passt', 'passt so', 'Passt so.', 'sieht gut aus', 'ja', 'ja bitte', 'ok', 'okay', 'start', 'starte', 'fang an', 'freigegeben', 'mach das', 'gut, leg los'].every(isStartWords)).toBe(true)
  expect(['nein', 'Nein.', 'nein danke', 'nein, ändere Schritt zwei', 'ändere Schritt zwei', 'noch nicht', 'warte', 'stopp', 'nicht los'].some(isStartWords)).toBe(false)
})

test('"mach weiter" typed after Esc picks the same job up', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it', 'Ship it'] })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' })
  expect((await texts($, 'terminal')).join('\n')).toContain('■ Gestoppt')

  await $.turn.start({ text: 'Mach weiter bitte', turnId: 't2' })
  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Write the page')
  expect(shown).not.toContain('Gestoppt')
  expect(shown).not.toContain('Verstehe deine Anfrage')
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
})

test('with Approve the plan first on, "nein" leaves the plan waiting and "los" starts it', async ($, on) => {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'approve on' } as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')

  await $.turn.start({ text: 'nein', turnId: 't2' })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
  expect((await texts($, 'terminal')).join('\n')).toContain('▶ Start')

  await $.turn.start({ text: 'Los!', turnId: 't3' })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  expect((await texts($, 'terminal')).join('\n')).not.toContain('▶ Start')
})

const SAID_START = [
  'Schreib das irgendwo im Mod rein, damit andere Instanzen auch so arbeiten. Übrigens sollte der Start-Button nur optional sein. Wenn ich sage, das du anfangen sollst, tu das bitte auch ohne, dass ich den Button drücke... also: Leg los.',
  'Ja, leg los... Übrigens sind gerade der Plan und der Start-Button bei Glance nicht da...',
] as const

test('a go-ahead inside a longer message counts; a no, a question, a condition or plain feedback does not', () => {
  const yes = [
    ...SAID_START,
    'Gut so. Leg bitte los.',
    'Prima, legen Sie los!',
    "Alles klar, los geht's.",
    'Okay, fang an.',
    'Dann fang bitte an mit Schritt eins.',
    'Ja, mach das so.',
    'Mach es so, wie du es vorgeschlagen hast.',
    'Passt. Start.',
    'Das klingt gut. Starte.',
    'Danke für die Antworten. Ja, los.',
    'Sieht gut aus. Go!',
  ]
  const no = [
    'leg noch nicht los',
    'Bitte noch nicht loslegen.',
    'Nicht loslegen, erst die Fragen.',
    'Nein, leg los ist falsch.',
    'Warte, leg noch nicht los.',
    'Stopp. Leg los, wenn ich es sage.',
    'Soll ich loslegen?',
    'Gut. Leg los?',
    'Kann ich einfach sagen: leg los?',
    'Gut, aber du hattest ja alle Fragen abgeschlossen …',
    'mach',
    'mach mal einen neuen Plan',
    'Der Start-Button fehlt.',
    'Ich fang an zu zweifeln.',
    'Wenn alles grün ist, leg los.',
    'Mach das so nicht.',
    'Schreib „leg los“ in die Anleitung.',
  ]
  expect(yes.filter(one => !isStartWords(one))).toEqual([])
  expect(no.filter(isStartWords)).toEqual([])
})

test('with Approve the plan first on, a go-ahead said inside a longer message starts the waiting plan', async ($, on) => {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'approve on' } as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  await $.turn.start({ text: 'Gut, aber du hattest ja alle Fragen abgeschlossen …', turnId: 't2' })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')

  await $.turn.start({ text: SAID_START[0], turnId: 't3' })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  expect((await texts($, 'terminal')).join('\n')).not.toContain('▶ Start')
})

for (const [setting, args] of [
  ['with Approve the plan first on', 'approve on'],
  ['in Gruppenarbeit', 'modus gruppenarbeit'],
] as const) {
  test(`${setting}, a plan made in a turn the person started with a go-ahead does not wait; the next job's plan does`, async ($, on) => {
    world(on)
    await $.command.run({ command: 'glanceflow', args } as never)
    await $.turn.start({ text: SAID_START[1], turnId: 't1' })
    const planned = await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
    expect(String(planned.result)).toContain('Der erste hat begonnen')
    expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
    expect((await texts($, 'terminal')).join('\n')).not.toContain('▶ Start')

    await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' })
    await $.turn.start({ text: 'Bau mir eine Kontaktseite, aber leg noch nicht los', turnId: 't2' })
    const waiting = await callTool($, { tool: PLAN, steps: ['Write the form', 'Check it'] })
    expect(String(waiting.result)).toContain('warte auf ihre Antwort')
    expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
  })
}

test("in Gruppenarbeit, a helper's brief is no go-ahead: a waiting plan keeps waiting", async ($, on) => {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'modus gruppenarbeit' } as never)
  await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Plane die Aufgaben', 'Prüfe die Ergebnisse'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')

  await $.turn.start({ text: 'Schreib das rein. also: Leg los.', turnId: 'w-t1', agentId: 'w1' } as never)
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
  expect((await texts($, 'terminal')).join('\n')).toContain('▶ Start')
})

test("in Gruppenarbeit, a helper's turn leaves the person's go-ahead standing: Claude's plan after it does not wait", async ($, on) => {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'modus gruppenarbeit' } as never)
  await $.turn.start({ text: 'Ja, leg los', turnId: 't1' })
  await $.turn.start({ text: 'Lies die Datei und berichte, was drinsteht.', turnId: 'w-t1', agentId: 'w1' } as never)
  const planned = await callTool($, { tool: PLAN, steps: ['Plane die Aufgaben', 'Prüfe die Ergebnisse'] })
  expect(String(planned.result)).toContain('Der erste hat begonnen')
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
})

test('a GlanceFlow worker shows by its tier, without "glanceflow:"; other helpers as named', async ($, on) => {
  world(on)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'w1' }) as never)
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  await detailsOn($)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  await $.agent.spawn({
    tool_use_id: 'tu1',
    prompt: 'Write the page',
    description: 'Write the page carefully',
    subagentType: 'glanceflow:sorgfaeltig',
    provider: { plugin: 'glanceflow', tier: 'user' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1, agentId: 'w1' } as never)) {
    // drain the step
  }

  for (const surface of SURFACES) {
    const shown = (await texts($, surface)).join('\n')
    expect(shown).toContain('Write the page carefully')
    expect(shown).toContain('sorgfältig · Opus 5.5')
    expect(shown).not.toContain('glanceflow:')
  }
  const pane = await planPaneTexts($)
  expect(pane).toContain('sorgfältig')
  expect(pane).not.toContain('glanceflow:')
})

test('the step Claude waits on says Waiting', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' } as never)
  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Braucht dich')
  expect(shown).toContain('\nWartet')
  expect(shown).not.toContain('\nArbeitet')
})

test('in Simple the percentage moves with time before a step is checked off', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: {} as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await texts($, 'terminal')).join('\n')).toContain(' · 0% · ')
  await clock.advance(90_000)
  const percent = Number(/ · (\d+)% · /.exec((await texts($, 'terminal')).join('\n'))?.[1])
  expect(percent).toBeGreaterThan(0)
  expect(percent).toBeLessThan(50)
})

test('in a narrow window the button gets short and the bars go before step names do', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Read your brand notes', 'Build the pricing section'] })
  const wide = (await texts($, 'terminal', 80)).join('\n')
  expect(wide).toContain('● GlanceFlow: Einfach')
  expect(wide).toContain('░░░░░░░░░░')

  // 39, not 36: the status column is 3 cells wider for "Hängt fest", so names get 3 fewer. Still under 40, 50 and 60.
  const narrow = (await texts($, 'terminal', 39)).join('\n')
  expect(narrow).toContain('● Einfach')
  expect(narrow).not.toContain('GlanceFlow: Einfach')
  expect(narrow).not.toContain('░░░░')
  expect(narrow).toContain('Read your brand notes')
})

test('⚙ Settings opens one panel for the view, sounds and calm mode, each with a line on what it does', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  const opened: string[] = []
  const played: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('audio.play', (_, e) => {
    played.push(String((e.clip as { asset?: string }).asset))
    return { value: undefined } as never
  })
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: {} as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  const SETTINGS = {
    plugin: 'glanceflow',
    component: 'Pane',
    requestId: 'glanceflow-settings',
    props: { title: 'Settings', isFocused: true, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  } as const
  const settingsTexts = async () => {
    const ui = await $.ui.mount({ ...SETTINGS, surface: 'terminal' })
    const found = [...(await ui.findAll({ type: 'Text' })), ...(await ui.findAll({ type: 'Button' }))].map(one => one.text).join('\n')
    await ui.unmount()
    return found
  }
  const pick = async (key: string) => {
    const ui = await $.ui.mount({ ...SETTINGS, surface: 'terminal' })
    await ui.press({ key })
    await ui.unmount()
  }

  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await band.press({ key: 'settings' })
  await band.unmount()
  expect(opened).toEqual(['glanceflow-settings'])

  let shown = await settingsTexts()
  expect(shown).toContain('● Einfach')
  expect(shown).toContain('● Aus')
  expect(shown).toContain('Keine Töne')
  expect(shown).toContain('Balken und Kreisel bewegen sich')
  expect(shown).not.toContain('● 50%')
  expect(shown).toContain('Jetzt aufräumen')
  expect(shown).toContain('Wie voll der Chat ist, zeigt der Statistik-Mod')
  expect(shown).toContain('Auf GitHub abschließen')
  expect(shown).toContain('Fertige Aufträge bleiben auf ihrem Branch')

  await pick('view-detailed')
  await pick('ship-on')
  await pick('sound-chime')
  await pick('calm-on')
  shown = await settingsTexts()
  expect(shown).toContain('● Details')
  expect(shown).toContain('● Signalton')
  expect(shown).toContain('Ein kurzer Signalton, wenn Claude dich braucht')
  expect(shown).toContain('▶ Anhören')
  expect(shown).toContain('Nichts auf dem Bildschirm bewegt sich')
  expect(shown).toContain('mergt, sobald du freigibst')
  expect(shown).toContain('● An')
  expect(played).toEqual(['sounds/needs-you.wav'])
  expect((await texts($, 'terminal')).join('\n')).toContain('GlanceFlow: Details')

  await pick('view-off')
  expect((await texts($, 'terminal')).join('\n')).toContain('GlanceFlow: Aus')

  const result = await $.command.run({ command: 'glanceflow', args: 'settings' } as never)
  expect(result.text).toBe('Die Einstellungen sind in der Seitenleiste.')
  expect(opened).toHaveLength(2)
})

test('the band never shows how full the chat is, and /glanceflow tidy at says where that went', async ($, on) => {
  world(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  const full = async (percent: number) => {
    await $.session.measure({ context: { window: 200_000, tokens: percent * 2000, percent }, rateLimits: [], changed: ['context'] } as never)
    return [...(await texts($, 'terminal')), ...(await texts($, 'desktop'))].join('\n')
  }
  for (const percent of [45, 52, 90]) {
    const shown = await full(percent)
    expect(shown).not.toContain(`${percent}% voll`)
    expect(shown).not.toMatch(/aufräumen/i)
  }
  const moved = await $.command.run({ command: 'glanceflow', args: 'tidy at 60' } as never)
  expect(moved.text).toContain('Wie voll der Chat ist, zeigt jetzt der Statistik-Mod')
  const off = await $.command.run({ command: 'glanceflow', args: 'tidy off' } as never)
  expect(off.text).toContain('Statistik-Mod')
})

test('/glanceflow checkpoint says plainly when there is none yet', async ($, on) => {
  world(on)
  const result = await $.command.run({ command: 'glanceflow', args: 'checkpoint' } as never)
  expect(result.text).toContain('In diesem Chat gibt es noch keinen Sicherungspunkt')
})

test('Tidy it up saves a checkpoint first, compacts keeping it, and Claude reads it afterwards', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text: string }).text))
    return { value: undefined } as never
  })
  on('session.id', () => ({ value: 'chat-1' }) as never)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  const forked: string[] = []
  on('model.fork', (_, e) => {
    forked.push(e.prompt)
    return { value: { isAnswered: true, text: 'Sicherungspunkt: the pricing page is done; next, the contact form.', usage: {} } } as never
  })
  let instructions = ''
  on('session.compact', (_, e) => {
    instructions = String((e as { instructions?: string }).instructions ?? '')
    return { messages: [{ role: 'user', text: 'Summary of the chat so far.', toolUses: [] }] } as never
  })
  on('prompt.compose', () => ({ sections: [] }) as never)

  await $.session.measure({ context: { window: 200_000, tokens: 110_000, percent: 55 }, rateLimits: [], changed: ['context'] } as never)
  await tidyFromSettings($)

  expect(forked[0]).toContain('Schreib einen Sicherungspunkt')
  expect(forked[0]).toContain('Beginne genau mit: "Sicherungspunkt:"')
  expect(instructions).toContain('Sicherungspunkt: the pricing page is done; next, the contact form.')
  let band = (await texts($, 'terminal')).join('\n')
  expect(band).toContain('Chat aufgeräumt. Claude hat einen Sicherungspunkt der Arbeit behalten.')
  expect(band).toContain('Letzter Stand')
  // In the Desktop app its buttons sit with the other actions at the bottom right, not in the note's row.
  const desk = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const deskBoxes = await desk.findAll({ type: 'Box' })
  await desk.unmount()
  expect(JSON.stringify(deskBoxes.find(one => one.props.key === 'actions') ?? null)).toContain('Letzter Stand')
  expect(JSON.stringify(deskBoxes.find(one => one.props.key === 'recap') ?? null)).not.toContain('Letzter Stand')
  // Its mark says Notice: the words say the chat was tidied up.
  expect(echoes(deskBoxes)).toEqual([])

  // Where we left off opens the checkpoint in a side panel, and the note on the band goes.
  const card = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await card.press({ key: 'recap' })
  await card.unmount()
  expect(opened).toEqual(['glanceflow-recap'])
  band = (await texts($, 'terminal')).join('\n')
  expect(band).not.toContain('Chat aufgeräumt')
  const recap = await $.ui.mount({ plugin: 'glanceflow', component: 'Pane', requestId: 'glanceflow-recap', surface: 'terminal', props: { title: 'Letzter Stand', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as never)
  const recapText = (await recap.findAll({ type: 'Text' })).map(one => one.text).join('\n')
  await recap.unmount()
  expect(recapText).toContain('the pricing page is done; next, the contact form.')
  expect(recapText).not.toContain('Sicherungspunkt:')
  expect(recapText).toMatch(/Gespeichert um \d\d:\d\d/)

  const composed = await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [], sections: [] } as never)
  const checkpoint = (composed as unknown as { sections: { id: string; text: string }[] }).sections.find(one => one.id === 'glanceflow:checkpoint')
  expect(checkpoint?.text).toContain('the pricing page is done')
})

test("two chats saving jobs the same day keep both; the day's old shared key moves into the chat's own once", async ($, on) => {
  const clock = mock.clock(on, { now: new Date(2026, 9, 6, 9, 42).getTime() })
  const at = new Date(2026, 9, 6, 9, 0).getTime()
  const job = (jobId: string, title: string) => ({ ...pastJob(jobId, '/work/landing-site', 2, 60_000), startedAt: at, finishedAt: at + 60_000, title })
  const store = new Map<string, unknown>([
    ['adoptedGlance', true],
    ['history:2026-10-06', [job('a', 'Saved before 0.25')]],
    ['history:2026-10-06:chat-2', [job('b', 'Saved by another chat')]],
  ])
  const written: string[] = []
  on('store.get', (_, e) => ({ value: store.get(e.key) }) as never)
  on('store.set', (_, e) => {
    written.push(e.key)
    store.set(e.key, e.value)
    return { value: undefined } as never
  })
  on('store.delete', (_, e) => {
    store.delete(e.key)
    return { value: undefined } as never
  })
  on('store.keys', () => ({ value: [...store.keys()] }) as never)
  historyWorld(on, { cwd: '/work/landing-site' })
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: {} as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.Stop', () => ({}) as never)

  await $.session.start({ cwd: '/work/landing-site', surface: 'terminal' } as never)
  expect(store.has('history:2026-10-06')).toBe(false)
  expect(store.get('history:2026-10-06:chat-1')).toEqual([job('a', 'Saved before 0.25')])

  await $.turn.start({ text: 'Build the pricing section', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it'] })
  await clock.advance(60_000)
  await callTool($, { tool: PROGRESS, task: 'Write it', percent: 100 })
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  // This chat writes only its own key: the other chat's job is never read back and rewritten.
  expect(written.filter(key => key.startsWith('history:'))).not.toContain('history:2026-10-06:chat-2')
  expect(store.get('history:2026-10-06:chat-2')).toEqual([job('b', 'Saved by another chat')])
  const result = await $.command.run({ command: 'glanceflow', args: 'history' } as never)
  expect(result.text).toBe('Verlauf für 06.10.2026: 3 Aufgaben.')
  const shown = (await paneTexts($)).join('\n')
  expect(shown).toContain('Saved before 0.25')
  expect(shown).toContain('Saved by another chat')
  expect(shown).toContain('Build the pricing section')
})

describe('Arbeitsweise und Grill mich', () => {
  const SETTINGS = {
    plugin: 'glanceflow',
    component: 'Pane',
    requestId: 'glanceflow-settings',
    props: { title: 'Settings', isFocused: true, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  } as const

  test('Auto ist Standard; Einstellung und Befehl schalten auf Dynamisch und zurück', async ($, on) => {
    world(on)
    const settingsTexts = async () => {
      const ui = await $.ui.mount({ ...SETTINGS, surface: 'terminal' })
      const found = [...(await ui.findAll({ type: 'Text' })), ...(await ui.findAll({ type: 'Button' }))].map(one => one.text).join('\n')
      await ui.unmount()
      return found
    }
    let shown = await settingsTexts()
    // Der Abschnitt hat keine Überschrift: nur die Auswahl und die Zeile darunter.
    expect(shown).not.toContain('Modus')
    expect(shown).not.toContain('Arbeitsweise')
    expect(shown).toContain('● Auto-Mode')
    expect(shown).toContain('Claude entscheidet selbst, ob und welche Helfer')

    const ui = await $.ui.mount({ ...SETTINGS, surface: 'terminal' })
    await ui.press({ key: 'mode-dynamisch' })
    await ui.unmount()
    shown = await settingsTexts()
    expect(shown).toContain('● Gruppenarbeit')
    expect(shown).toContain('sechs Stufen')
    // Plan zuerst freigeben gilt in Dynamisch immer, und die Einstellung sagt es.
    expect(shown).toContain('In der Gruppenarbeit wartet jeder Plan auf deine Freigabe')

    const auto = await $.command.run({ command: 'glanceflow', args: 'arbeitsweise auto' } as never)
    expect(String(auto.text)).toContain('Auto-Mode:')
    const toggled = await $.command.run({ command: 'glanceflow', args: 'arbeitsweise' } as never)
    expect(String(toggled.text)).toContain('Gruppenarbeit:')
    // Die neuen Namen nimmt der Befehl auch.
    expect(String((await $.command.run({ command: 'glanceflow', args: 'modus auto-mode' } as never)).text)).toContain('Auto-Mode:')
    expect(String((await $.command.run({ command: 'glanceflow', args: 'modus gruppenarbeit' } as never)).text)).toContain('Gruppenarbeit:')
  })

  test('beim Sitzungsstart legt GlanceFlow sechs Arbeiter mit Modell und Aufwand an', async ($, on) => {
    world(on)
    const registered: Record<string, unknown>[] = []
    on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
    on('tool.register', () => ({ value: undefined }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('agent.register', (_, e) => {
      registered.push(e as unknown as Record<string, unknown>)
      return { value: { agent: `glanceflow:${String((e as unknown as { name: string }).name)}` } } as never
    })
    await $.session.start({ cwd: '/work', surface: 'desktop' } as never)

    expect(registered.map(one => one.name)).toEqual(['schnell', 'leicht', 'mittel', 'sorgfaeltig', 'schwer', 'fable'])
    expect(registered.map(one => one.model)).toEqual(['haiku', 'sonnet', 'opus', 'opus', 'opus', 'fable'])
    expect(registered.map(one => one.effort)).toEqual([undefined, 'low', 'medium', 'high', 'xhigh', 'high'])
    const prompt = (name: string) => String(registered.find(one => one.name === name)?.prompt)
    expect(prompt('schwer')).toContain('Stufe schwer')
    expect(prompt('schwer')).toContain('Ursache')
    expect(prompt('mittel')).not.toContain('Ursache finden')
    expect(prompt('schnell')).toContain('Ändere keine Dateien')
    expect(prompt('fable')).toContain('Design-Feature')
    expect(String(registered[0]?.description)).toContain('Nur in der Gruppenarbeit')
  })

  test('die Arbeiter bietet GlanceFlow nur in Dynamisch an, dort dafür keine allgemeinen Helfer', async ($, on) => {
    world(on)
    on('agent.offer', () => ({ isOffered: true }) as never)
    const offer = async (agent: string) =>
      ((await ($.agent as unknown as { offer: (e: unknown) => Promise<{ isOffered: boolean }> }).offer({
        agent,
        description: '',
        source: 'plugin',
        provider: { plugin: 'engine', tier: 'core' },
      })) as { isOffered: boolean }).isOffered

    expect(await offer('glanceflow:mittel')).toBe(false)
    expect(await offer('general-purpose')).toBe(true)
    expect(await offer('Explore')).toBe(true)

    await $.command.run({ command: 'glanceflow', args: 'arbeitsweise dynamisch' } as never)
    expect(await offer('glanceflow:mittel')).toBe(true)
    expect(await offer('glanceflow:schnell')).toBe(true)
    expect(await offer('general-purpose')).toBe(false)
    expect(await offer('Explore')).toBe(true)

    // Mit GlanceFlow aus gilt keine Arbeitsweise: alles wie von der Engine.
    await $.command.run({ command: 'glanceflow', args: 'off' } as never)
    expect(await offer('general-purpose')).toBe(true)
  })

  test('in Dynamisch bekommt Claude die Regeln, und in Auto nicht', async ($, on) => {
    world(on)
    on('prompt.compose', () => ({ sections: [] }) as never)
    const compose = async () =>
      ((await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [], sections: [] } as never)) as unknown as {
        sections: { id: string; text: string }[]
      }).sections
    expect((await compose()).some(one => one.id === 'glanceflow:dynamisch')).toBe(false)

    await $.command.run({ command: 'glanceflow', args: 'arbeitsweise dynamisch' } as never)
    const rules = (await compose()).find(one => one.id === 'glanceflow:dynamisch')?.text ?? ''
    expect(rules).toContain('Gruppenarbeit')
    expect(rules).toContain('glanceflow:schnell (Haiku)')
    expect(rules).toContain('glanceflow:fable (Fable, hoher Aufwand)')
    expect(rules).toContain('Kritisch prüfen')
    expect(rules).toContain('Ein Git-Repository legst du nur an, wenn die Person zustimmt')
  })

  test('in Dynamisch wartet der Plan auf Start, nur Arbeiter mit Stufe dürfen ran, und solange sie laufen, ändert Claude keine Dateien', async ($, on) => {
    world(on)
    on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'w1' }) as never)
    await $.command.run({ command: 'glanceflow', args: 'arbeitsweise dynamisch' } as never)
    await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Plane die Aufgaben', 'Prüfe die Ergebnisse'] })
    // Ohne "Plan zuerst freigeben": Dynamisch wartet trotzdem.
    expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')

    await $.turn.start({ text: 'los', turnId: 't2' })
    const general = await callTool($, { tool: 'Agent', subagent_type: 'general-purpose', description: 'Baue die Seite', prompt: 'Baue die Seite' })
    expect(general.deny).toContain('Gruppenarbeit')
    expect(general.deny).toContain('glanceflow:mittel')
    const untyped = await callTool($, { tool: 'Agent', description: 'Baue die Seite', prompt: 'Baue die Seite' })
    expect(untyped.deny).toContain('Gruppenarbeit')
    expect((await callTool($, { tool: 'Agent', subagent_type: 'glanceflow:mittel', description: 'Baue die Seite', prompt: 'x' })).deny).toBeUndefined()
    expect((await callTool($, { tool: 'Agent', subagent_type: 'Explore', description: 'Suche', prompt: 'x' })).deny).toBeUndefined()

    await $.agent.spawn({
      tool_use_id: 'tu1',
      prompt: 'Baue die Seite',
      description: 'Baue die Seite',
      subagentType: 'glanceflow:mittel',
      provider: { plugin: 'glanceflow', tier: 'user' },
      parentModel: 'claude-opus-5-5',
      background: true,
      fork: false,
    } as never)
    const edit = { tool: 'Edit', file_path: '/work/index.html', old_string: 'a', new_string: 'b' }
    expect((await callTool($, edit)).deny).toContain('Solange Arbeiter laufen')
    // Lesen bleibt erlaubt, und der Arbeiter selbst darf ändern.
    expect((await callTool($, { tool: 'Read', file_path: '/work/index.html' })).deny).toBeUndefined()

    await $.turn.complete({ answer: 'fertig', durationMs: 1, isAborted: false, turnId: 'w', reason: 'answer', agentId: 'w1' })
    expect((await callTool($, edit)).deny).toBeUndefined()
  })

  test('in Auto bleibt alles wie gehabt: allgemeine Helfer erlaubt, Claude ändert Dateien auch neben Helfern', async ($, on) => {
    world(on)
    on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'h1' }) as never)
    await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Baue die Seite', 'Prüfe sie'] })
    expect((await callTool($, { tool: 'Agent', subagent_type: 'general-purpose', description: 'x', prompt: 'x' })).deny).toBeUndefined()
    await $.agent.spawn({
      tool_use_id: 'tu1',
      prompt: 'x',
      description: 'Suche',
      subagentType: 'general-purpose',
      provider: { plugin: 'engine', tier: 'core' },
      parentModel: 'claude-opus-5-5',
      background: true,
      fork: false,
    } as never)
    expect((await callTool($, { tool: 'Edit', file_path: '/work/a.txt', old_string: 'a', new_string: 'b' })).deny).toBeUndefined()
  })

  test('Grill mich startet grill-me zum aktuellen Plan; fehlt der Skill in der Liste, steht er mit vollem Namen im Eingabefeld', async ($, on) => {
    // Wie world(), aber mit eigenen Toasts.
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    on('model.complete', () => ({ value: { isAnswered: true, text: 'Baue die Preisseite', usage: {} } as never }))
    on('tool.call', () => ({ result: {} }) as never)
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    on('classic.Notification', () => ({}) as never)
    const runs: { command: string; args: string }[] = []
    const toasts: string[] = []
    let commands = [{ name: 'anthropic-skills:grill-me', description: 'Löchert dich', source: 'plugin' }]
    on('command.list', () => ({ value: commands }) as never)
    on('command.run', (_, e) => {
      runs.push({ command: e.command, args: e.args })
      return { text: '' }
    })
    on('ui.toast', (_, e) => {
      toasts.push(String((e as unknown as { text: string }).text))
      return { value: undefined } as never
    })
    const filled: string[] = []
    on('prompt.fill', (_, e) => {
      filled.push(String((e as unknown as { text: string }).text))
      return { isFilled: true } as never
    })
    await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Lies die Markennotizen', 'Baue die Preistabelle'] })

    expect((await texts($, 'terminal')).some(one => one.endsWith('Grill mich'))).toBe(true)
    // In der App das Zeichen fuer Dampf, direkt hinter dem Modus-Menue.
    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const row = JSON.stringify((await desktop.findAll({ type: 'Box' })).find(one => one.props.key === 'actions') ?? null)
    await desktop.unmount()
    expect(row).toContain('"label":"\u2668\uFE0F"')
    expect(row).not.toContain('Grill mich')
    expect(row.indexOf('"key":"grill"')).toBeGreaterThan(row.indexOf('"key":"workmode"'))
    expect(row.indexOf('"key":"grill"')).toBeLessThan(row.indexOf('"key":"plan"'))
    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await band.press({ key: 'grill' })
    await band.unmount()
    expect(runs).toHaveLength(1)
    expect(runs[0]?.command).toBe('anthropic-skills:grill-me')
    expect(runs[0]?.args).toContain('zum aktuellen Plan')
    expect(runs[0]?.args).toContain('Lies die Markennotizen; Baue die Preistabelle')

    commands = []
    const again = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await again.press({ key: 'grill' })
    await again.unmount()
    expect(runs).toHaveLength(1)
    // The app may know the skill by its full name though the list leaves it out.
    expect(filled).toHaveLength(1)
    expect(filled[0]).toMatch(/^\/anthropic-skills:grill-me zum aktuellen Plan/)
    expect(toasts).toContain('grill-me steht im Eingabefeld: Drück Enter, um zu starten.')
  })

  /** Like the Grill mich test's world: commands to list and run, toasts and the chat's messages to read. */
  const skillWorld = async ($: Engine, on: On) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    on('model.complete', () => ({ value: { isAnswered: true, text: 'Baue die Preisseite', usage: {} } as never }))
    on('tool.call', () => ({ result: {} }) as never)
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    on('classic.Notification', () => ({}) as never)
    const state = {
      runs: [] as { command: string; args: string | undefined }[],
      toasts: [] as string[],
      commands: [] as { name: string; description: string; source: string }[],
      messages: [] as { role: 'user' | 'assistant'; text: string; toolUses: never[] }[],
      filled: [] as string[],
      runFails: false,
      // The app's Remote Control switch as get_session reports it; null while the session has no ccd_session_mgmt.
      app: null as 'on' | 'off' | 'connecting' | 'unavailable' | null,
      appSets: [] as boolean[],
      appSetFails: false,
    }
    on('command.list', () => ({ value: state.commands }) as never)
    on('mcp.call', (_, e) => {
      if (e.server !== 'ccd_session_mgmt' || state.app === null) throw new Error(`MCP server ${e.server} is not connected`)
      if (e.tool === 'set_remote_control') {
        // A refusal comes back as the server's error result.
        if (state.appSetFails) return { value: { content: [{ type: 'text', text: 'Die Person hat abgelehnt' }], isError: true } } as never
        state.appSets.push(e.args.enabled === true)
        state.app = e.args.enabled === true ? 'on' : 'off'
      }
      const answer = { sessionId: 'local_1', remoteControlActive: state.app === 'on', remoteControlState: state.app }
      return { value: { content: [{ type: 'text', text: JSON.stringify(answer) }], isError: false } } as never
    })
    on('command.run', (_, e) => {
      if (state.runFails) throw new Error('no command with that name is available')
      state.runs.push({ command: e.command, args: e.args === '' ? undefined : e.args })
      return { text: '' }
    })
    on('prompt.fill', (_, e) => {
      state.filled.push(String((e as unknown as { text: string }).text))
      return { isFilled: true } as never
    })
    on('ui.toast', (_, e) => {
      state.toasts.push(String((e as unknown as { text: string }).text))
      return { value: undefined } as never
    })
    on('session.messages', () => ({ value: state.messages }) as never)
    await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Lies die Markennotizen', 'Baue die Preistabelle'] })
    const press = async (key: string) => {
      const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
      await band.press({ key })
      await band.unmount()
    }
    return { state, press, clock }
  }
  const skill = (name: string) => ({ name, description: name, source: 'plugin' })

  test('in der App stehen hinter Grill mich Vermenschlichen, ADHS, Nachtschicht, Verdecken und Tresor, im Terminal nicht', async ($, on) => {
    await skillWorld($, on)
    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const row = JSON.stringify((await desktop.findAll({ type: 'Box' })).find(one => one.props.key === 'actions') ?? null)
    await desktop.unmount()
    const order = ['workmode', 'grill', 'humanize', 'adhd', 'nightshift', 'privacy', 'vault', 'plan', 'history'].map(key => row.indexOf(`"key":"${key}"`))
    expect(order.every(index => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    for (const label of ['\u{1F9CD}', '\u{1F9E0}', '\u{1F170}\uFE0F', '\u{1F512}', '\u{1F6E1}\uFE0F']) expect(row).toContain(`"label":"${label}"`)
    // Review and Usage are gone.
    for (const key of ['review', 'usage']) expect(row).not.toContain(`"key":"${key}"`)
    for (const label of ['\u{1F50D}', '\u{1F4C8}']) expect(row).not.toContain(label)

    for (const bodyColumns of [50, 80, 140]) {
      const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns }, surface: 'terminal' })
      const keys = (await ui.findAll({ type: 'Button' })).map(one => one.props.key)
      await ui.unmount()
      for (const key of ['review', 'usage', 'humanize', 'adhd', 'nightshift', 'privacy', 'vault']) expect(keys).not.toContain(key)
    }
  })

  /** The bottom left of the band in the app, in order: each button's key, a bar as its dim | (the tree keeps no key of a Text). */
  const leftRow = async ($: Engine) => {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const actions = (await ui.findAll({ type: 'Box' })).find(one => one.props.key === 'actions')
    await ui.unmount()
    type Kid = { type: string; props: Record<string, unknown>; children?: unknown[] }
    const left = ((actions as unknown as { children?: Kid[] } | undefined)?.children?.[0]?.children ?? []) as Kid[]
    return left.map(kid => (kid.type === 'Text' ? `${kid.props.dimColor === true ? 'dim' : ''}${(kid.children ?? []).join('')}` : String(kid.props.key)))
  }

  test('in der App trennen Striche die Gruppen unten links: hinter ADHS und vor Plan, im Terminal keine', async ($, on) => {
    await skillWorld($, on)
    expect(await leftRow($)).toEqual(['workmode', 'grill', 'humanize', 'adhd', 'dim|', 'nightshift', 'privacy', 'vault', 'dim|', 'plan', 'history'])

    for (const bodyColumns of [50, 80, 140]) {
      const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns }, surface: 'terminal' })
      const words = (await ui.findAll({ type: 'Text' })).map(one => one.text)
      await ui.unmount()
      expect(words).not.toContain('|')
    }
  })

  test('ohne Plan steht der Strich vor Verlauf; nie zwei nebeneinander, nie einer am Rand', async ($, on) => {
    world(on)
    expect(await leftRow($)).toEqual(['workmode', 'grill', 'humanize', 'adhd', 'dim|', 'nightshift', 'privacy', 'vault', 'dim|', 'history'])
  })

  test('ADHS (🧠) steht direkt hinter Vermenschlichen und vor dem ersten Strich', async ($, on) => {
    await skillWorld($, on)
    const row = await leftRow($)
    expect(row.indexOf('adhd')).toBe(row.indexOf('humanize') + 1)
    expect(row.indexOf('adhd')).toBeLessThan(row.indexOf('dim|'))
  })

  /** The ADHD button's variant in the app, and what is sent as a prompt, with its origin; the chat can start again. */
  const adhdWorld = async ($: Engine, on: On) => {
    const sent: { text: string; asUser: boolean }[] = []
    on('prompt.submit', (_, e) => {
      sent.push({ text: e.text, asUser: e.origin.kind === 'plugin' && e.origin.asUser === true })
      return { text: e.text }
    })
    on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
    on('process.run', () => ({ value: { exitCode: 2, stdout: '', stderr: '' } }) as never)
    on('tool.register', () => ({ value: undefined }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    const world = await skillWorld($, on)
    const variant = async () => {
      const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
      const button = (await ui.findAll({ type: 'Button' })).find(one => one.props.key === 'adhd')
      await ui.unmount()
      return button?.props.variant
    }
    return { ...world, sent, variant }
  }

  test('ADHS aus: ein Druck startet den Skill i-have-adhd, danach ist 🧠 hervorgehoben', async ($, on) => {
    const { state, press, variant } = await adhdWorld($, on)
    expect(await variant()).toBe('secondary')
    state.commands = [skill('i-have-adhd:i-have-adhd')]
    await press('adhd')
    expect(state.runs).toEqual([{ command: 'i-have-adhd:i-have-adhd', args: undefined }])
    expect(await variant()).toBe('primary')
  })

  test('ADHS an: ein Druck sagt „stop adhd mode“ als die Person, danach ist 🧠 schlicht', async ($, on) => {
    const { state, press, sent, variant } = await adhdWorld($, on)
    state.commands = [skill('i-have-adhd:i-have-adhd')]
    await press('adhd')
    expect(await variant()).toBe('primary')
    await press('adhd')
    expect(sent).toEqual([{ text: 'stop adhd mode', asUser: true }])
    expect(state.runs).toHaveLength(1)
    expect(await variant()).toBe('secondary')
  })

  test('ADHS folgt dem Getippten: /i-have-adhd:i-have-adhd schaltet an, „Stop ADHD mode“ aus', async ($, on) => {
    const { variant } = await adhdWorld($, on)
    const composer = { wait: false, origin: { kind: 'composer' } }
    await $.prompt.submit({ text: '/i-have-adhd:i-have-adhd', ...composer } as never)
    expect(await variant()).toBe('primary')
    await $.prompt.submit({ text: '  Stop ADHD mode  ', ...composer } as never)
    expect(await variant()).toBe('secondary')
    // The command as the engine reports it counts too.
    await $.prompt.submit({ text: '/i-have-adhd', command: { name: 'i-have-adhd', args: '' }, ...composer } as never)
    expect(await variant()).toBe('primary')
    await $.prompt.submit({ text: 'Zurück zum normal mode, bitte', ...composer } as never)
    expect(await variant()).toBe('secondary')
  })

  test('ADHS bleibt aus, wenn der Befehl nur im Eingabefeld wartet', async ($, on) => {
    const { state, press, variant } = await adhdWorld($, on)
    // Not listed: the full name has a prefix, so it waits in the prompt.
    state.commands = []
    await press('adhd')
    expect(state.runs).toEqual([])
    expect(state.filled).toEqual(['/i-have-adhd:i-have-adhd'])
    expect(await variant()).toBe('secondary')
    // Listed, but the run fails: in the prompt again, still off.
    state.commands = [skill('i-have-adhd:i-have-adhd')]
    state.runFails = true
    await press('adhd')
    expect(state.filled).toHaveLength(2)
    expect(await variant()).toBe('secondary')
  })

  test('ADHS nach dem Neuladen wie im Verlauf: Aufruf, dann „normal mode“ aus; nur Aufruf an', async ($, on) => {
    const { state, variant } = await adhdWorld($, on)
    const call = { role: 'user' as const, text: '<command-name>/i-have-adhd:i-have-adhd</command-name>', toolUses: [] as never[] }
    // The skill's own text names the words that stop it; it is not the person's.
    const body = { role: 'user' as const, text: 'Base directory for this skill: /x/i-have-adhd\n\nStays on until "stop adhd mode".', toolUses: [] as never[] }
    const answer = { role: 'assistant' as const, text: 'Next: open the file.', toolUses: [] as never[] }

    state.messages = [call, body, answer, { role: 'user', text: 'normal mode', toolUses: [] }, answer]
    await $.session.start({ cwd: '/work', surface: 'desktop' } as never)
    expect(await variant()).toBe('secondary')

    state.messages = [call, body, answer]
    await $.session.start({ cwd: '/work', surface: 'desktop' } as never)
    expect(await variant()).toBe('primary')

    state.messages = []
    await $.session.start({ cwd: '/work', surface: 'desktop' } as never)
    expect(await variant()).toBe('secondary')
  })

  test('Nachtschicht startet ihren Befehl; fehlt er, sagt GlanceFlow das', async ($, on) => {
    const { state, press } = await skillWorld($, on)
    state.commands = [skill('nachtschicht')]
    await press('nightshift')
    expect(state.runs).toEqual([{ command: 'nachtschicht', args: undefined }])

    // Another plugin's copy counts too.
    state.runs.length = 0
    state.commands = [skill('nachtschicht-mod:nachtschicht')]
    await press('nightshift')
    expect(state.runs.map(one => one.command)).toEqual(['nachtschicht-mod:nachtschicht'])

    // A name without a prefix the session does not list: a toast, nothing in the prompt.
    state.runs.length = 0
    state.commands = []
    await press('nightshift')
    expect(state.runs).toEqual([])
    expect(state.filled).toEqual([])
    expect(state.toasts).toContain('nachtschicht ist in dieser Sitzung nicht verfügbar.')
  })

  /**
   * The Nachtschicht mod as far as GlanceFlow sees it, written inline: it keeps its shift in its own state, null when
   * there is none. /nachtschicht with no argument ends a shift that is there, else starts one; `an` and `aus` say which.
   * A turn that ends on its mark finishes the shift and a refusal halts it, both keeping it; Esc ends it.
   */
  const FAKE_NIGHT_SHIFT = {
    name: 'nachtschicht',
    register(on: On) {
      type Shift = { seit: number; phase: 'laeuft' | 'fertig' | 'angehalten'; grund: string | null; geschoben: number; fragen: string[] }
      // A hooks module spells $ at its call sites only, so each hook reads and writes the shift itself.
      const ref = { plugin: 'nachtschicht', key: 'schicht' } as const
      on('command.run', { command: 'nachtschicht' }, async ($, e) => {
        const arg = String(e.args ?? '').trim().toLowerCase()
        const shift = ((await $.state.get(ref as never)) as { value?: Shift | null }).value ?? null
        const wants = arg === 'an' ? true : arg === 'aus' ? false : shift === null
        const changed: Shift | null = wants ? { seit: 0, geschoben: 0, fragen: [], ...shift, phase: 'laeuft', grund: null } : null
        await $.state.set(ref as never, changed as never)
        return { text: wants ? 'Nachtschicht ist an.' : shift ? 'Nachtschicht ist aus.' : 'Die Nachtschicht war nicht an.' }
      })
      on('turn.complete', async ($, e, next) => {
        const answer = await next(e)
        const shift = ((await $.state.get(ref as never)) as { value?: Shift | null }).value ?? null
        if (shift === null || e.agentId) return answer
        const changed: Shift | null =
          e.reason === 'aborted'
            ? null
            : e.reason === 'refusal'
              ? { ...shift, phase: 'angehalten', grund: 'Claude hat abgelehnt' }
              : e.answer.trim().endsWith('NACHTSCHICHT-FERTIG')
                ? { ...shift, phase: 'fertig', grund: 'Claude meldet fertig' }
                : shift
        if (changed !== shift) await $.state.set(ref as never, changed as never)
        return answer
      })
    },
  }
  const WITH_NIGHT_SHIFT = { plugins: [FAKE_NIGHT_SHIFT] }
  /** The night shift button's variant in the app. */
  const nightShiftVariant = async ($: Engine) => {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const button = (await ui.findAll({ type: 'Button' })).find(one => one.props.key === 'nightshift')
    await ui.unmount()
    return button?.props.variant
  }
  /** /nachtschicht as typed, with its argument. */
  const typeNightShift = ($: Engine, args = '') => $.command.run({ command: 'nachtschicht', args } as never)

  test('ohne den Mod Nachtschicht steht 🅰️ schlicht da, auch nach einem Druck', async ($, on) => {
    const { state, press } = await skillWorld($, on)
    expect(await nightShiftVariant($)).toBe('secondary')
    // Listed, but nobody keeps a shift: the run changes nothing.
    state.commands = [skill('nachtschicht')]
    await press('nightshift')
    expect(state.runs).toHaveLength(1)
    expect(await nightShiftVariant($)).toBe('secondary')
    // Not there at all.
    state.commands = []
    await press('nightshift')
    expect(await nightShiftVariant($)).toBe('secondary')
  })

  test('Nachtschicht per Knopf: ein Druck schaltet sie an und hebt 🅰️ hervor, der nächste aus', WITH_NIGHT_SHIFT, async ($, on) => {
    const { state, press } = await skillWorld($, on)
    state.commands = [skill('nachtschicht')]
    expect(await nightShiftVariant($)).toBe('secondary')
    await press('nightshift')
    // The Nachtschicht answered its command itself.
    expect(state.runs).toEqual([])
    expect(await nightShiftVariant($)).toBe('primary')
    await press('nightshift')
    expect(await nightShiftVariant($)).toBe('secondary')
  })

  test('Nachtschicht getippt: /nachtschicht, /nachtschicht an und aus schalten 🅰️ mit', WITH_NIGHT_SHIFT, async ($, on) => {
    await skillWorld($, on)
    await typeNightShift($)
    expect(await nightShiftVariant($)).toBe('primary')
    await typeNightShift($, 'aus')
    expect(await nightShiftVariant($)).toBe('secondary')
    await typeNightShift($, 'an')
    expect(await nightShiftVariant($)).toBe('primary')
    await typeNightShift($)
    expect(await nightShiftVariant($)).toBe('secondary')
  })

  test('Nachtschicht fertig oder angehalten: 🅰️ bleibt hervorgehoben, bis ein Druck sie beendet; Esc beendet sie', WITH_NIGHT_SHIFT, async ($, on) => {
    const { state, press } = await skillWorld($, on)
    state.commands = [skill('nachtschicht')]
    const end = (answer: string, reason: string) =>
      $.turn.complete({ answer, durationMs: 1, isAborted: reason === 'aborted', turnId: 't1', reason } as never)

    await typeNightShift($)
    await end('Uebergabe: alles gebaut.\nNACHTSCHICHT-FERTIG', 'answer')
    expect(await nightShiftVariant($)).toBe('primary')
    await press('nightshift')
    expect(await nightShiftVariant($)).toBe('secondary')

    await typeNightShift($)
    await end('', 'refusal')
    expect(await nightShiftVariant($)).toBe('primary')
    await end('', 'aborted')
    expect(await nightShiftVariant($)).toBe('secondary')
  })

  test('Nachtschicht nach dem Neuladen: 🅰️ zeigt weiter, was die Nachtschicht hält', WITH_NIGHT_SHIFT, async ($, on) => {
    on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
    on('process.run', () => ({ value: { exitCode: 2, stdout: '', stderr: '' } }) as never)
    on('tool.register', () => ({ value: undefined }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await skillWorld($, on)
    await typeNightShift($)
    await $.session.start({ cwd: '/work', surface: 'desktop' } as never)
    expect(await nightShiftVariant($)).toBe('primary')
    await typeNightShift($, 'aus')
    await $.session.start({ cwd: '/work', surface: 'desktop' } as never)
    expect(await nightShiftVariant($)).toBe('secondary')
  })

  /** /remote-control as the CLI lists it: its description says Disconnect while connected. */
  const remoteCommand = (isOn: boolean) => ({
    name: 'remote-control',
    description: isOn ? 'Disconnect Remote Control' : 'Control this session from your phone or claude.ai/code',
    source: 'builtin',
  })
  /** A main turn ends, so GlanceFlow reads Remote Control's state again. */
  const endTurn = ($: Engine) => $.turn.complete({ answer: 'Fertig.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  /** The Remote Control button in the app: its variant and label, or null when there is none. */
  const remoteButton = async ($: Engine) => {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const button = (await ui.findAll({ type: 'Button' })).find(one => one.props.key === 'remote')
    await ui.unmount()
    return button === undefined ? null : { variant: button.props.variant, label: button.props.label }
  }

  test('Remote Control verbunden: 🛜 steht hervorgehoben zwischen dem ersten Strich und Nachtschicht', async ($, on) => {
    const { state } = await skillWorld($, on)
    state.commands = [remoteCommand(true), skill('nachtschicht')]
    await endTurn($)
    expect(await remoteButton($)).toEqual({ variant: 'primary', label: '\u{1F6DC}' })
    const row = await leftRow($)
    expect(row.slice(0, 7)).toEqual(['workmode', 'grill', 'humanize', 'adhd', 'dim|', 'remote', 'nightshift'])
    expect(row.filter(one => one === 'dim|')).toHaveLength(2)
  })

  test('Remote Control nicht verbunden: 🛜 steht schlicht da', async ($, on) => {
    const { state } = await skillWorld($, on)
    state.commands = [remoteCommand(false)]
    await endTurn($)
    expect(await remoteButton($)).toEqual({ variant: 'secondary', label: '\u{1F6DC}' })
  })

  test('ohne /remote-control kein 🛜; die Striche stehen trotzdem richtig', async ($, on) => {
    const { state } = await skillWorld($, on)
    state.commands = [remoteCommand(true)]
    await endTurn($)
    expect(await remoteButton($)).not.toBeNull()
    // The command goes away (a policy turns it off, say): the button goes with it.
    state.commands = [skill('nachtschicht')]
    await endTurn($)
    expect(await remoteButton($)).toBeNull()
    const row = await leftRow($)
    expect(row).not.toContain('remote')
    expect(row.slice(0, 6)).toEqual(['workmode', 'grill', 'humanize', 'adhd', 'dim|', 'nightshift'])
    expect(row[0]).not.toBe('dim|')
    expect(row.at(-1)).not.toBe('dim|')
    expect(row.some((one, at) => one === 'dim|' && row[at + 1] === 'dim|')).toBe(false)
  })

  test('ein Druck auf 🛜 startet /remote-control und liest den Zustand danach neu', async ($, on) => {
    const { state, press, clock } = await skillWorld($, on)
    state.commands = [remoteCommand(false)]
    await endTurn($)
    expect((await remoteButton($))?.variant).toBe('secondary')
    await press('remote')
    expect(state.runs).toEqual([{ command: 'remote-control', args: undefined }])
    // The connection stands a moment later: the next read finds it.
    state.commands = [remoteCommand(true)]
    await clock.advance(2000)
    expect((await remoteButton($))?.variant).toBe('primary')
  })

  test('im Terminal gibt es kein 🛜', async ($, on) => {
    const { state } = await skillWorld($, on)
    state.commands = [remoteCommand(true)]
    await endTurn($)
    for (const bodyColumns of [50, 80, 140]) {
      const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns }, surface: 'terminal' })
      const keys = (await ui.findAll({ type: 'Button' })).map(one => one.props.key)
      const words = (await ui.findAll({ type: 'Text' })).map(one => one.text).join('\n')
      await ui.unmount()
      expect(keys).not.toContain('remote')
      expect(words).not.toContain('\u{1F6DC}')
    }
  })

  test('App-Schalter: on und connecting heben 🛜 hervor, off zeigt ihn schlicht, unavailable blendet ihn aus', async ($, on) => {
    const { state } = await skillWorld($, on)
    state.app = 'on'
    await endTurn($)
    expect(await remoteButton($)).toEqual({ variant: 'primary', label: '\u{1F6DC}' })
    state.app = 'off'
    await endTurn($)
    expect((await remoteButton($))?.variant).toBe('secondary')
    state.app = 'connecting'
    await endTurn($)
    expect((await remoteButton($))?.variant).toBe('primary')
    state.app = 'unavailable'
    await endTurn($)
    expect(await remoteButton($)).toBeNull()
  })

  test('App-Schalter an: ein Druck schaltet ihn über set_remote_control aus, danach steht 🛜 schlicht da', async ($, on) => {
    const { state, press } = await skillWorld($, on)
    state.app = 'on'
    await endTurn($)
    expect((await remoteButton($))?.variant).toBe('primary')
    await press('remote')
    expect(state.appSets).toEqual([false])
    expect(state.runs).toEqual([])
    expect((await remoteButton($))?.variant).toBe('secondary')
  })

  test('ohne App-Server greift /remote-control: 🛜 hervorgehoben, ein Druck startet den Befehl', async ($, on) => {
    const { state, press } = await skillWorld($, on)
    state.app = null
    state.commands = [remoteCommand(true)]
    await endTurn($)
    expect((await remoteButton($))?.variant).toBe('primary')
    await press('remote')
    expect(state.runs).toEqual([{ command: 'remote-control', args: undefined }])
    expect(state.appSets).toEqual([])
  })

  test('nur die App ist an: 🛜 hervorgehoben, ein Druck schaltet nur die App aus', async ($, on) => {
    const { state, press } = await skillWorld($, on)
    state.app = 'on'
    state.commands = [remoteCommand(false)]
    await endTurn($)
    expect((await remoteButton($))?.variant).toBe('primary')
    await press('remote')
    expect(state.appSets).toEqual([false])
    expect(state.runs).toEqual([])
  })

  test('nur der Befehl ist an: 🛜 hervorgehoben, ein Druck startet nur /remote-control', async ($, on) => {
    const { state, press } = await skillWorld($, on)
    state.app = 'off'
    state.commands = [remoteCommand(true)]
    await endTurn($)
    expect((await remoteButton($))?.variant).toBe('primary')
    await press('remote')
    expect(state.appSets).toEqual([])
    expect(state.runs).toEqual([{ command: 'remote-control', args: undefined }])
  })

  test('beide sind an: ein Druck schaltet App und Befehl aus', async ($, on) => {
    const { state, press } = await skillWorld($, on)
    state.app = 'on'
    state.commands = [remoteCommand(true)]
    await endTurn($)
    expect((await remoteButton($))?.variant).toBe('primary')
    await press('remote')
    expect(state.appSets).toEqual([false])
    expect(state.runs).toEqual([{ command: 'remote-control', args: undefined }])
  })

  test('beide sind aus: 🛜 schlicht, ein Druck schaltet über die App ein', async ($, on) => {
    const { state, press } = await skillWorld($, on)
    state.app = 'off'
    state.commands = [remoteCommand(false)]
    await endTurn($)
    expect((await remoteButton($))?.variant).toBe('secondary')
    await press('remote')
    expect(state.appSets).toEqual([true])
    expect(state.runs).toEqual([])
    expect((await remoteButton($))?.variant).toBe('primary')
  })

  test('weder App-Schalter noch /remote-control: kein 🛜', async ($, on) => {
    const { state } = await skillWorld($, on)
    state.app = 'unavailable'
    state.commands = [skill('nachtschicht')]
    await endTurn($)
    expect(await remoteButton($)).toBeNull()
    state.app = null
    await endTurn($)
    expect(await remoteButton($)).toBeNull()
  })

  test('lehnt die App das Umschalten ab, sagt ein Hinweis warum', async ($, on) => {
    const { state, press } = await skillWorld($, on)
    state.app = 'off'
    await endTurn($)
    state.appSetFails = true
    await press('remote')
    expect(state.toasts).toContain('Remote Control ließ sich nicht umschalten: Die Person hat abgelehnt')
    expect((await remoteButton($))?.variant).toBe('secondary')
  })

  test('ein Skill mit Vorsilbe läuft unter vollem Namen; scheitert der bloße Name, steht der volle im Eingabefeld', async ($, on) => {
    const { state, press } = await skillWorld($, on)
    state.messages = [{ role: 'assistant', text: 'Die Seite ist fertig und die Tests laufen.', toolUses: [] }]
    // Both listed: the full name runs.
    state.commands = [skill('vermenschlichen'), skill('anthropic-skills:vermenschlichen')]
    await press('humanize')
    expect(state.runs.map(one => one.command)).toEqual(['anthropic-skills:vermenschlichen'])

    // Only the bare name listed, and running it fails: the full name waits in the prompt, and the toast names it.
    state.runs.length = 0
    state.commands = [skill('vermenschlichen')]
    state.runFails = true
    await press('humanize')
    expect(state.filled).toEqual(['/anthropic-skills:vermenschlichen Überarbeite deine letzte Antwort hier im Chat.'])
    expect(state.toasts).toContain('anthropic-skills:vermenschlichen steht im Eingabefeld: Drück Enter, um zu starten.')

    // Another plugin's copy, which has a prefix of its own, keeps its name.
    state.filled.length = 0
    state.commands = [skill('other:vermenschlichen')]
    await press('humanize')
    expect(state.filled).toEqual(['/other:vermenschlichen Überarbeite deine letzte Antwort hier im Chat.'])
  })

  test('Vermenschlichen überarbeitet die letzte Antwort: deutsch mit vermenschlichen, sonst mit humanizer', async ($, on) => {
    const { state, press } = await skillWorld($, on)
    state.commands = [skill('anthropic-skills:vermenschlichen'), skill('humanizer-de'), skill('humanizer')]

    // No answer yet: a toast, nothing runs.
    state.messages = [{ role: 'user', text: 'Baue die Preisseite', toolUses: [] }]
    await press('humanize')
    expect(state.runs).toEqual([])
    expect(state.toasts).toContain('Noch keine Antwort zum Überarbeiten.')

    state.messages = [
      { role: 'user', text: 'Baue die Preisseite', toolUses: [] },
      { role: 'assistant', text: 'Ich habe die Preisseite gebaut, und die Tests sind jetzt grün.', toolUses: [] },
      { role: 'assistant', text: '', toolUses: [] },
    ]
    await press('humanize')
    expect(state.runs).toHaveLength(1)
    expect(state.runs[0]?.command).toBe('anthropic-skills:vermenschlichen')
    expect(state.runs[0]?.args).toContain('letzte Antwort')

    state.messages = [
      { role: 'assistant', text: 'Ich habe die Preisseite gebaut.', toolUses: [] },
      { role: 'user', text: 'Und auf Englisch?', toolUses: [] },
      { role: 'assistant', text: 'I built the pricing page, and the tests pass now.', toolUses: [] },
    ]
    await press('humanize')
    expect(state.runs).toHaveLength(2)
    expect(state.runs[1]?.command).toBe('humanizer')
    expect(state.runs[1]?.args).toContain('Rewrite your last answer')

    // Without vermenschlichen, humanizer-de does the German one; without any, a toast.
    state.commands = [skill('humanizer-de')]
    state.messages = [{ role: 'assistant', text: 'Die Seite ist fertig und die Tests laufen.', toolUses: [] }]
    await press('humanize')
    expect(state.runs[2]?.command).toBe('humanizer-de')
    // None listed: the full name waits in the prompt, since the app often knows it.
    state.commands = []
    await press('humanize')
    expect(state.runs).toHaveLength(3)
    expect(state.filled).toEqual(['/anthropic-skills:vermenschlichen Überarbeite deine letzte Antwort hier im Chat.'])
  })

  test('auf dem Desktop steht das Modus-Menü ohne Wort davor unten links vor Verlauf und schaltet um', async ($, on) => {
    world(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const boxes = await ui.findAll({ type: 'Box' })
    const top = JSON.stringify(boxes.find(one => one.props.key === 'header-right') ?? null)
    const bottom = JSON.stringify(boxes.find(one => one.props.key === 'actions') ?? null)
    expect(top).not.toContain('"key":"workmode"')
    expect(bottom).toContain('"key":"workmode"')
    // Erstes Element links, vor Verlauf.
    expect(bottom.indexOf('"key":"history"')).toBeGreaterThan(bottom.indexOf('"key":"workmode"'))
    const menu = (await ui.findAll({ type: 'Select' })).find(one => one.props.key === 'workmode')
    expect(menu?.props.label).toBeUndefined()
    expect(menu?.props.value).toBe('auto')
    expect(menu?.props.options).toEqual([
      { value: 'auto', label: 'Auto-Mode' },
      { value: 'dynamisch', label: 'Gruppenarbeit' },
    ])
    await $.ui.select({ plugin: 'glanceflow', key: 'workmode', value: 'dynamisch' })
    await ui.unmount()

    expect(await texts($, 'desktop')).toContain('Gruppenarbeit ▾')
    const asked = await $.command.run({ command: 'glanceflow', args: 'arbeitsweise' } as never)
    // Ohne Wert schaltet der Befehl um: von Gruppenarbeit zurück auf Auto-Mode.
    expect(String(asked.text)).toContain('Auto-Mode:')
  })

  test('im Terminal hat die Leiste in keiner Breite einen Umschalter für die Arbeitsweise', async ($, on) => {
    world(on)
    for (const bodyColumns of [50, 80, 140]) {
      const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns }, surface: 'terminal' })
      const all = [...(await ui.findAll({ type: 'Button' })), ...(await ui.findAll({ type: 'Select' })), ...(await ui.findAll({ type: 'Box' }))]
      expect(all.some(one => one.props.key === 'workmode')).toBe(false)
      await ui.unmount()
    }
  })

  test('mit GlanceFlow aus gibt es keinen Umschalter für die Arbeitsweise', async ($, on) => {
    world(on)
    await $.command.run({ command: 'glanceflow', args: 'off' } as never)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      const all = [...(await ui.findAll({ type: 'Button' })), ...(await ui.findAll({ type: 'Select' }))]
      expect(all.some(one => one.props.key === 'workmode')).toBe(false)
      await ui.unmount()
    }
    expect((await texts($, 'desktop')).some(one => one.startsWith('Auto-Mode') || one.startsWith('Gruppenarbeit'))).toBe(false)
  })
})

test('über dem Band steht ein Trennstrich: in der App eine dünne Linie, im Terminal eine Reihe Striche', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Lies die Markennotizen', 'Baue die Preistabelle'] })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const alts = (await band.findAll({ type: 'Svg' })).map(one => String(one.props.alt))
  await band.unmount()
  expect(alts[0]).toBe('Trennlinie')
  expect((await texts($, 'terminal'))[0]).toBe('─'.repeat(80))

  // Auch mit GlanceFlow aus steht der Strich über der kurzen Zeile.
  await $.command.run({ command: 'glanceflow', args: 'off' } as never)
  expect((await texts($, 'terminal'))[0]).toBe('─'.repeat(80))
  expect(await texts($, 'desktop')).toContain('[Trennlinie]')
})

describe('Ansicht Minimal', () => {
  const minimal = async ($: Engine) => {
    const settings = await $.ui.mount({
      plugin: 'glanceflow',
      component: 'Pane',
      requestId: 'glanceflow-settings',
      surface: 'terminal',
      props: { title: 'Settings', isFocused: true, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    await settings.press({ key: 'view-minimal' })
    await settings.unmount()
  }

  test('oben eine Zeile: Stand, erledigte Schritte in Klammern, Restzeit und Tokens, rechts das Menü ohne das Wort Ansicht; darunter die Knopfzeile', async ($, on) => {
    world(on)
    on('turn.step', async function* (_, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: { ...USAGE, model: 'claude-opus-5-5' } } as never
    })
    await minimal($)
    await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Lies die Notizen', 'Baue die Tabelle', 'Prüfe die Seite'] })
    await callTool($, { tool: PROGRESS, task: 'Lies die Notizen', percent: 100 })
    for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1 } as never)) {
      // drain
    }

    for (const surface of SURFACES) {
      const shown = await texts($, surface, 100)
      const line = shown.join('\n')
      expect(line).toMatch(/Arbeitet \(1\/3\) · (noch etwa|bisher) [^·]+ · 12,4k Tokens/)
      // Die Schritte selbst stehen nicht da; die Knopfzeile darunter schon, wie in den anderen Ansichten.
      expect(line).not.toContain('Baue die Tabelle')
      expect(line).not.toContain('Ansicht')
      expect(line).toContain('Verlauf')
      expect(line).toContain('Pause')
      expect(line).toContain(surface === 'terminal' ? 'Grill' : '♨️')
      if (surface === 'desktop') expect(shown).toContain('Auto-Mode ▾')
      expect(line).toContain(surface === 'terminal' ? 'GlanceFlow: Minimal' : 'Minimal ▾')
    }
  })

  test('wartet der Plan auf Freigabe, sagt die Zeile das und hat Start; ohne Plan sagt sie Bereit', async ($, on) => {
    world(on)
    await minimal($)
    expect((await texts($, 'desktop')).join('\n')).toContain('Bereit')

    await $.command.run({ command: 'glanceflow', args: 'arbeitsweise dynamisch' } as never)
    await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Lies die Notizen', 'Baue die Tabelle'] })
    for (const surface of SURFACES) {
      const shown = (await texts($, surface)).join('\n')
      expect(shown).toContain('Wartet auf Start (0/2)')
      expect(shown).toMatch(/^(\S+ )?Start$/m)
    }
  })

  test('fertig sagt, wie lange es dauerte; das Menü bietet Minimal statt Aus, die Einstellungen beides', async ($, on) => {
    world(on)
    await minimal($)
    await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Lies die Notizen', 'Baue die Tabelle'] })
    await callTool($, { tool: PROGRESS, task: 'Lies die Notizen', percent: 100 })
    await callTool($, { tool: PROGRESS, task: 'Baue die Tabelle', percent: 100 })
    await $.turn.complete({ answer: 'Fertig.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    expect((await texts($, 'desktop')).join('\n')).toMatch(/Fertig \(2\/2\) · dauerte /)

    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const menu = (await band.findAll({ type: 'Select' })).find(one => one.props.key === 'view')
    await band.unmount()
    expect((menu?.props.options as { label: string }[]).map(one => one.label)).toEqual(['Ausführlich', 'Einfach', 'Minimal'])
    expect(menu?.props.label).toBeUndefined()

    const settings = await $.ui.mount({
      plugin: 'glanceflow',
      component: 'Pane',
      requestId: 'glanceflow-settings',
      surface: 'terminal',
      props: { title: 'Settings', isFocused: true, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    const choices = (await settings.findAll({ type: 'Button' })).map(one => one.text)
    const help = (await settings.findAll({ type: 'Text' })).map(one => one.text).join('\n')
    await settings.unmount()
    expect(choices).toContain('● Minimal')
    expect(choices).toContain('○ Aus')
    expect(help).toContain('Nur eine Zeile über dem Eingabefeld')
  })
})

describe('Zahnrad für die Einstellungen', () => {
  test('in der App steht es in jeder Lage rechts neben dem Ansicht-Menü und öffnet die Einstellungen; unten fehlt der Knopf', async ($, on) => {
    world(on)
    const opened: string[] = []
    on('ui.open', (_, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true } } as never
    })
    const top = async () => {
      const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
      const boxes = await ui.findAll({ type: 'Box' })
      const right = boxes.find(one => one.props.key === 'header-right')
      const actions = JSON.stringify(boxes.find(one => one.props.key === 'actions') ?? null)
      await ui.unmount()
      const kids = ((right as unknown as { children?: unknown[] })?.children ?? [])
        .flat(3)
        .filter((one): one is { type: string; props: Record<string, unknown> } => typeof one === 'object' && one !== null)
      const order = kids.map(one => (one.type === 'Button' ? String(one.props.label) : one.type))
      return { order, actions }
    }

    // Noch kein Plan, bei der Arbeit, in Minimal und ganz aus.
    let shown = await top()
    expect(shown.order).toEqual(['Select', GEAR_LABEL])
    await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Lies die Notizen', 'Baue die Tabelle'] })
    shown = await top()
    expect(shown.order).toEqual(['Select', GEAR_LABEL])
    expect(shown.actions).toContain('Verlauf')
    expect(shown.actions).not.toContain('Einstellungen')
    expect(shown.actions).not.toContain('"key":"settings"')

    await $.command.run({ command: 'glanceflow', args: 'details on' } as never)
    const settings = await $.ui.mount({
      plugin: 'glanceflow',
      component: 'Pane',
      requestId: 'glanceflow-settings',
      surface: 'terminal',
      props: { title: 'Settings', isFocused: true, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    await settings.press({ key: 'view-minimal' })
    await settings.unmount()
    expect((await top()).order).toEqual(['Select', GEAR_LABEL])

    await $.command.run({ command: 'glanceflow', args: 'off' } as never)
    expect((await top()).order).toEqual(['Select', GEAR_LABEL])

    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await band.press({ key: 'settings' })
    await band.unmount()
    expect(opened).toEqual(['glanceflow-settings'])
  })

  test('in der App ist das Zahnrad ein Emoji (U+FE0F), so breit wie die anderen Knöpfe mit Zeichen', async ($, on) => {
    world(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const gear = (await ui.findAll({ type: 'Button' })).find(one => one.props.key === 'settings')
    await ui.unmount()
    expect(gear?.props.label).toBe('\u2699\uFE0F')
  })

  test('im Terminal bleiben die Einstellungen unten bei Verlauf', async ($, on) => {
    world(on)
    await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Lies die Notizen', 'Baue die Tabelle'] })
    const shown = (await texts($, 'terminal', 100)).join('\n')
    expect(shown).toContain('Einstellungen')
    expect(shown).not.toContain(GEAR_LABEL)
  })
})

describe('Verdecken und Tresor', () => {
  const LOCK = '\u{1F512}'
  const OPEN_LOCK = '\u{1F513}'
  const SHIELD = '\u{1F6E1}\uFE0F'
  // Built from pieces, so no scanner takes them for real keys.
  const ANTHROPIC = ['sk', 'ant', 'api03', 'abcdefghijklmnopqrstuvwx'].join('-')
  const GITHUB = ['ghp', 'abcdefghijklmnopqrstuvwxyz0123'].join('_')
  const GITHUB_PAT = ['github', 'pat', '11ABCDEFG0123456789abcdef'].join('_')
  const AWS = ['AKIA', 'ABCDEFGHIJ234567'].join('')
  const GOOGLE = ['AIza', 'B'.repeat(33)].join('')
  const SLACK = ['xoxb', '1234567890', 'abcdefghij'].join('-')
  const OPENAI = ['sk', 'proj', 'abcdefghijklmnopqrstuvwxyz'].join('-')
  const JWT = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'abcdefghijklmnop'].join('.')
  const BEARER = 'abcdefghijklmnopqrstuvwxyz123456'
  const PEM = ['-----BEGIN RSA PRIVATE KEY-----', 'MIIEowIBAAKCAQEA', '-----END RSA PRIVATE KEY-----'].join('\n')
  const CARD = '4111 1111 1111 1111'
  const IBAN = 'DE89 3704 0044 0532 0130 00'

  test('extractSecrets: Schlüssel bekommen sprechende Namen, Zuweisungen und Sätze ihre eigenen', () => {
    const found = extractSecrets([
      `Hier ist der Schlüssel ${ANTHROPIC} und das Token ${GITHUB}, dazu ${GITHUB_PAT}.`,
      `AWS ${AWS}, Google ${GOOGLE}, Slack ${SLACK}, OpenAI ${OPENAI}, Sitzung ${JWT}`,
      `Authorization: Bearer ${BEARER}`,
      PEM,
      `${['DB', 'PASSWORD'].join('_')}=letmein!`,
      'Das WLAN-Kennwort lautet sonne2024',
      'Mein Passwort ist abc!9xyz',
      `Karte ${CARD}, IBAN: ${IBAN}`,
    ])
    expect(found).toEqual([
      { name: 'ANTHROPIC_API_KEY', value: ANTHROPIC },
      { name: 'GITHUB_TOKEN', value: GITHUB },
      { name: 'GITHUB_TOKEN_2', value: GITHUB_PAT },
      { name: 'OPENAI_API_KEY', value: OPENAI },
      { name: 'SLACK_TOKEN', value: SLACK },
      { name: 'GOOGLE_API_KEY', value: GOOGLE },
      { name: 'AWS_ACCESS_KEY_ID', value: AWS },
      { name: 'JWT', value: JWT },
      { name: 'BEARER_TOKEN', value: BEARER },
      { name: 'PRIVATE_KEY', value: PEM },
      { name: 'DB_PASSWORD', value: 'letmein!' },
      { name: 'WLAN_KENNWORT', value: 'sonne2024' },
      { name: 'PASSWORT', value: 'abc!9xyz' },
      { name: 'KARTENNUMMER', value: CARD },
      { name: 'IBAN', value: IBAN },
    ])
  })

  test('extractSecrets: E-Mail und Telefon bleiben, ein Wert zählt einmal, gleiche Namen werden durchgezählt', () => {
    expect(extractSecrets('Schreib an jane@example.com oder ruf an: 555-123-4567, +49 30 1234 5678')).toEqual([])
    expect(extractSecrets(['Passwort: geheim123', 'noch mal: Passwort: geheim123', `export TOKEN="${GITHUB}"`, `und ${GITHUB}`])).toEqual([
      { name: 'PASSWORT', value: 'geheim123' },
      { name: 'TOKEN', value: GITHUB },
    ])
    expect(extractSecrets(['API_KEY=abc123def456', 'API_KEY=zzz999yyy888', 'api_key: qqq777www666'])).toEqual([
      { name: 'API_KEY', value: 'abc123def456' },
      { name: 'API_KEY_2', value: 'zzz999yyy888' },
      { name: 'API_KEY_3', value: 'qqq777www666' },
    ])
    // Code that only names a credential holds none.
    expect(extractSecrets('password: string; const token = process.env.GITHUB_TOKEN; apiKey = getApiKey()')).toEqual([])
  })

  test('mergeEnv, envValue, parseEnv und gitignoreWithEnv', () => {
    const existing = 'API_KEY=old-value\nDB_PASSWORD="letmein!"\n'
    const merged = mergeEnv(
      existing,
      [
        { name: 'API_KEY', value: 'new value #1' },
        { name: 'SECRET', value: 'letmein!' },
        { name: 'PRIVATE_KEY', value: 'line "one"\nline two' },
      ],
      '17.10.2026',
    )
    expect(merged.secrets.map(one => one.name)).toEqual(['API_KEY_2', 'DB_PASSWORD', 'PRIVATE_KEY'])
    expect(merged.text).toBe(
      'API_KEY=old-value\nDB_PASSWORD="letmein!"\n\n# Aus dem Chat übernommen von GlanceFlow am 17.10.2026\n' +
        'API_KEY_2="new value #1"\nPRIVATE_KEY="line \\"one\\"\\nline two"\n',
    )
    const parsed = parseEnv(merged.text)
    expect(parsed.get('API_KEY')).toBe('old-value')
    expect(parsed.get('API_KEY_2')).toBe('new value #1')
    expect(parsed.get('PRIVATE_KEY')).toBe('line "one"\nline two')
    expect(envValue('plain-value')).toBe('plain-value')
    expect(envValue('a=b')).toBe('"a=b"')
    // Nothing new: the file stays as it is.
    expect(mergeEnv(existing, [{ name: 'X', value: 'old-value' }], '17.10.2026')).toEqual({ text: existing, secrets: [{ name: 'API_KEY', value: 'old-value' }] })
    expect(gitignoreWithEnv(null)).toBe('.env\n')
    expect(gitignoreWithEnv('node_modules')).toBe('node_modules\n.env\n')
    expect(gitignoreWithEnv('node_modules\r\n.env\r\n')).toBeNull()
    expect(replaceSecrets(`Key ${GITHUB}, Karte 4111111111111111`, [{ name: 'GITHUB_TOKEN', value: GITHUB }, { name: 'KARTENNUMMER', value: CARD }])).toBe(
      'Key ${GITHUB_TOKEN}, Karte ${KARTENNUMMER}',
    )
  })

  /** The props a component reaches the engine's own drawing with, as JSON: what shows on screen. */
  const drawn = async ($: Engine, component: string, props: Record<string, unknown>) => {
    const ui = await $.ui.mount({ plugin: 'glanceflow', surface: 'desktop', component, props } as never)
    await ui.unmount()
    return JSON.stringify(engineDrew.at(-1) ?? null)
  }
  // What the engine beneath the plugins was last asked to draw.
  const engineDrew: unknown[] = []
  const drawsBeneath = (on: On) =>
    on('ui.render', (_, e) => {
      engineDrew.push((e as { props: unknown }).props)
      return { type: 'Box', props: {}, children: [] } as never
    })
  const bandButton = async ($: Engine, key: string) => {
    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const found = (await band.findAll({ type: 'Button' })).find(one => one.props.key === key)
    await band.unmount()
    return found?.props.label
  }
  const pressBand = async ($: Engine, key: string) => {
    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await band.press({ key })
    await band.unmount()
  }

  /** A project on Windows with a chat, a fake disk, and everything the tidy-up asks for. */
  const vaultWorld = async ($: Engine, on: On, options: {
      cwd?: string
      files?: Record<string, string>
      messages?: unknown[]
      failsWrite?: boolean
      drawsBeneath?: boolean
      /** What compaction leaves; until /compact runs, the engine refuses a plugin's compaction. */
      compacted?: unknown[]
    } = {},
  ) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    if (options.drawsBeneath) drawsBeneath(on)
    const store = new Map<string, unknown>()
    on('store.get', (_, e) => ({ value: store.get((e as { key: string }).key) }) as never)
    on('store.set', (_, e) => {
      store.set((e as { key: string }).key, (e as { value: unknown }).value)
      return { value: undefined } as never
    })
    on('store.delete', (_, e) => {
      store.delete((e as { key: string }).key)
      return { value: undefined } as never
    })
    on('store.keys', () => ({ value: [...store.keys()] }) as never)
    on('model.complete', () => ({ value: { isAnswered: true, text: 'Baue die Preisseite', usage: {} } as never }))
    on('tool.call', () => ({ result: {} }) as never)
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    on('classic.Notification', () => ({}) as never)
    on('ui.log', () => ({ value: undefined }) as never)
    on('session.id', () => ({ value: 'chat-1' }) as never)
    const state = {
      toasts: [] as string[],
      forks: [] as string[],
      compacts: [] as string[],
      writes: [] as string[],
      commands: [] as string[],
      refusesCompact: options.compacted !== undefined,
      clock,
      files: new Map(Object.entries(options.files ?? {}).map(([path, text]) => [path.replace(/\\/g, '/'), text])),
      store,
    }
    const norm = (path: string) => path.replace(/\\/g, '/')
    on('ui.toast', (_, e) => {
      state.toasts.push(String((e as { text: string }).text))
      return { value: undefined } as never
    })
    on('session.cwd', () => ({ value: options.cwd ?? 'C:\\work\\shop' }) as never)
    on('session.messages', () => ({ value: options.messages ?? [] }) as never)
    on('fs.exists', (_, e) => ({ value: state.files.has(norm(e.path)) || [...state.files.keys()].some(one => one.startsWith(`${norm(e.path)}/`)) }) as never)
    on('fs.read', (_, e) => {
      const text = state.files.get(norm(e.path))
      if (text === undefined) throw new Error('ENOENT')
      return { value: text } as never
    })
    on('fs.write', (_, e) => {
      if (options.failsWrite) throw new Error('EACCES: permission denied')
      state.writes.push(norm(e.path))
      state.files.set(norm(e.path), e.text)
      return { value: undefined } as never
    })
    on('model.fork', (_, e) => {
      state.forks.push(e.prompt)
      return {
        value: { isAnswered: true, text: `Sicherungspunkt: Die Datenbank läuft mit dem Passwort letmein! und dem Token ${GITHUB}.`, usage: {} },
      } as never
    })
    on('session.compact', (_, e) => {
      if (state.refusesCompact) throw new Error('not now')
      state.compacts.push(String((e as { instructions?: string }).instructions ?? ''))
      return { messages: options.compacted ?? [{ role: 'user', text: 'Zusammenfassung.', toolUses: [] }] } as never
    })
    // /compact starts the engine's own compaction, which comes as session.compact once the command is through.
    on('command.run', (_, e) => {
      state.commands.push(e.command)
      if (e.command === 'compact') state.refusesCompact = false
      return { text: '' }
    })
    await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Lies die Notizen', 'Baue die Tabelle'] })
    return state
  }
  test('🔒 verdeckt Nachrichten, Befehls- und Werkzeugausgaben; 🔓 zeigt alles; Einstellung und Befehl schalten mit', async ($, on) => {
    const { toasts } = await vaultWorld($, on, { drawsBeneath: true })
    await detailsOn($)
    const secret = 'mail jane@example.com'
    const shows = async () => ({
      user: (await drawn($, 'UserMessage', { text: secret })).includes('jane@example.com'),
      command: (await drawn($, 'CommandOutput', { command: 'cost', args: '', text: secret, isErrored: false })).includes('jane@example.com'),
      result: (await drawn($, 'ToolResult', { tool_use_id: 'u1', tool: 'Bash', output: { stdout: secret, stderr: '', interrupted: false }, isErrored: false })).includes(
        'jane@example.com',
      ),
      use: (
        await drawn($, 'ToolUse', {
          tool_use_id: 'u1',
          tool: 'Bash',
          input: { command: `echo ${secret}` },
          isRunning: false,
          isErrored: false,
          isInterrupted: false,
          output: { stdout: secret, stderr: '', interrupted: false },
        })
      ).includes('jane@example.com'),
    })
    const hidden = { user: false, command: false, result: false, use: false }
    const visible = { user: true, command: true, result: true, use: true }

    // On by default.
    expect(await bandButton($, 'privacy')).toBe(LOCK)
    expect(await shows()).toEqual(hidden)

    await pressBand($, 'privacy')
    expect(await bandButton($, 'privacy')).toBe(OPEN_LOCK)
    expect(toasts).toContain('Verdecken aus: alles ist wieder sichtbar.')
    expect(await shows()).toEqual(visible)

    await pressBand($, 'privacy')
    expect(await bandButton($, 'privacy')).toBe(LOCK)
    expect(toasts).toContain('Verdecken an: Passwörter, Schlüssel und persönliche Daten erscheinen als Punkte.')
    expect(await shows()).toEqual(hidden)

    // The command and the settings switch it too.
    const off = await $.command.run({ command: 'glanceflow', args: 'privacy off' } as never)
    expect(JSON.stringify(off)).toContain('Verdecken aus')
    expect(await bandButton($, 'privacy')).toBe(OPEN_LOCK)
    expect(await shows()).toEqual(visible)
    const settings = await $.ui.mount({
      plugin: 'glanceflow',
      component: 'Pane',
      requestId: 'glanceflow-settings',
      surface: 'terminal',
      props: { title: 'Settings', isFocused: true, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
    } as never)
    expect((await settings.findAll({ type: 'Text' })).map(one => one.text)).toContain('Verdecken')
    await settings.press({ key: 'privacy-on' })
    await settings.unmount()
    expect(await bandButton($, 'privacy')).toBe(LOCK)
    expect(await shows()).toEqual(hidden)
    await $.command.run({ command: 'glanceflow', args: 'privacy off' } as never)
    await $.command.run({ command: 'glanceflow', args: 'privacy on' } as never)
    expect(await bandButton($, 'privacy')).toBe(LOCK)
  })

  test('🔒 ist hervorgehoben, solange Verdecken an ist; 🔓 steht schlicht da, per Knopf und per Befehl', async ($, on) => {
    await vaultWorld($, on)
    const privacy = async () => {
      const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
      const found = (await band.findAll({ type: 'Button' })).find(one => one.props.key === 'privacy')
      await band.unmount()
      return { label: found?.props.label, variant: found?.props.variant }
    }
    const locked = { label: LOCK, variant: 'primary' }
    const open = { label: OPEN_LOCK, variant: 'secondary' }

    // On by default.
    expect(await privacy()).toEqual(locked)
    await pressBand($, 'privacy')
    expect(await privacy()).toEqual(open)
    await pressBand($, 'privacy')
    expect(await privacy()).toEqual(locked)
    await $.command.run({ command: 'glanceflow', args: 'privacy off' } as never)
    expect(await privacy()).toEqual(open)
    await $.command.run({ command: 'glanceflow', args: 'privacy on' } as never)
    expect(await privacy()).toEqual(locked)
  })

  const CHAT = [
    { role: 'user', text: `Die Datenbank: ${['DB', 'PASSWORD'].join('_')}=letmein! und schreib mir an jane@example.com`, toolUses: [] },
    {
      role: 'assistant',
      text: 'Ich lege los.',
      toolUses: [{ tool_use_id: 'u1', tool: 'Bash', input: { command: `curl -H "Authorization: token ${GITHUB}"` }, text: 'ok' }],
    },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'u1', text: `Karte ${CARD}`, isError: false }] },
  ]

  test('🛡️ wartet beim ersten Druck, schreibt beim zweiten die .env und verdichtet mit Platzhaltern', async ($, on) => {
    const state = await vaultWorld($, on, {
      messages: CHAT,
      files: { 'C:\\work\\shop\\.env': 'DB_PASSWORD=letmein!\nGITHUB_TOKEN=old\n', 'C:\\work\\shop\\.git\\HEAD': 'ref' },
    })
    expect(await bandButton($, 'vault')).toBe(SHIELD)
    await pressBand($, 'vault')
    expect(await bandButton($, 'vault')).toBe(`${SHIELD} Noch mal drücken`)
    expect(state.writes).toEqual([])
    expect(state.compacts).toEqual([])

    await pressBand($, 'vault')
    expect(await bandButton($, 'vault')).toBe(SHIELD)
    const env = state.files.get('C:/work/shop/.env') ?? ''
    // What was there stays; the value already there keeps its key; a taken name gets _2.
    expect(env.startsWith('DB_PASSWORD=letmein!\nGITHUB_TOKEN=old\n\n# Aus dem Chat übernommen von GlanceFlow am ')).toBe(true)
    expect(env).toContain(`GITHUB_TOKEN_2=${GITHUB}\n`)
    expect(env).toContain(`KARTENNUMMER="${CARD}"\n`)
    expect(env).not.toContain('jane@example.com')
    expect(env.match(/DB_PASSWORD=/g)).toHaveLength(1)
    expect(state.files.get('C:/work/shop/.gitignore')).toBe('.env\n')
    expect(state.toasts).toContain(
      '3 Geheimnisse in die .env übernommen (DB_PASSWORD, GITHUB_TOKEN_2, KARTENNUMMER). Der Chat wird jetzt verdichtet; danach kennt Claude nur noch Platzhalter.',
    )
    // The checkpoint and the compaction are told the placeholders, never the values.
    expect(state.forks[0]).toContain('${GITHUB_TOKEN_2}')
    expect(state.compacts).toHaveLength(1)
    for (const name of ['DB_PASSWORD', 'GITHUB_TOKEN_2', 'KARTENNUMMER']) expect(state.compacts[0]).toContain(`\${${name}}`)
    const saved = JSON.stringify(state.store.get('lastCheckpoint'))
    expect(saved).toContain('${DB_PASSWORD}')
    expect(saved).toContain('${GITHUB_TOKEN_2}')
    for (const value of ['letmein!', GITHUB, CARD]) {
      expect(saved).not.toContain(value)
      expect(state.compacts[0]).not.toContain(value)
    }
  })

  test('🛡️ ersetzt die Werte auch in dem, was die Verdichtung hinterlässt; eine andere Verdichtung bleibt, wie sie ist', async ($, on) => {
    const leftOver = () => [
      { role: 'user', text: `Zusammenfassung: Die Datenbank nutzt letmein!, das Token ist ${GITHUB}.`, toolUses: [], handle: 'h1' },
      {
        role: 'assistant',
        text: 'Ich prüfe es.',
        toolUses: [{ tool_use_id: 'u1', tool: 'Bash', input: { command: `echo ${GITHUB}` }, text: `Karte ${CARD}` }],
        handle: 'h2',
      },
      { role: 'user', text: 'Weiter so.', toolUses: [], handle: 'h3' },
    ]
    const state = await vaultWorld($, on, { messages: CHAT, compacted: leftOver() })
    const compact = async () =>
      (await $.session.compact({ trigger: 'manual', instructions: 'x', messages: [{ role: 'user', text: 'Hallo', toolUses: [] }] } as never)) as unknown as {
        messages: { text: string; handle?: string; toolUses: { input: { command: string }; text?: string }[] }[]
      }
    await pressBand($, 'vault')
    await pressBand($, 'vault')
    // The engine refused the plugin's compaction; /compact took over, and its compaction follows.
    expect(state.commands).toContain('compact')
    const result = await compact()
    const words = JSON.stringify(result)
    for (const value of ['letmein!', GITHUB, CARD]) expect(words).not.toContain(value)
    expect(result.messages[0]?.text).toBe('Zusammenfassung: Die Datenbank nutzt ${DB_PASSWORD}, das Token ist ${GITHUB_TOKEN}.')
    expect(result.messages[1]?.toolUses[0]?.input.command).toBe('echo ${GITHUB_TOKEN}')
    expect(result.messages[1]?.toolUses[0]?.text).toBe('Karte ${KARTENNUMMER}')
    // A changed message loses the engine's handle, so the engine builds it from these words; an unchanged one keeps it.
    expect(result.messages.map(one => one.handle)).toEqual([undefined, undefined, 'h3'])

    // Ten minutes on, the shield's run has lapsed: a compaction stays as the engine made it.
    await state.clock.advance(11 * 60_000)
    expect(await compact()).toEqual({ messages: leftOver() })
  })

  test('ohne 🛡️ bleibt eine Verdichtung, wie sie ist', async ($, on) => {
    const leftOver = [{ role: 'user', text: 'Zusammenfassung: Passwort: geheim123', toolUses: [], handle: 'h1' }]
    const state = await vaultWorld($, on, { messages: CHAT, compacted: leftOver })
    state.refusesCompact = false
    const result = await $.session.compact({ trigger: 'manual', instructions: 'x', messages: [{ role: 'user', text: 'Hallo', toolUses: [] }] } as never)
    expect(result).toEqual({ messages: leftOver })
    // Nor does a plain tidy-up change it.
    await tidyFromSettings($)
    expect(state.compacts).toHaveLength(2)
    expect(await $.session.compact({ trigger: 'manual', instructions: 'x', messages: [{ role: 'user', text: 'Hallo', toolUses: [] }] } as never)).toEqual({ messages: leftOver })
  })

  test('🛡️ ohne .git lässt die .gitignore in Ruhe', async ($, on) => {
    const state = await vaultWorld($, on, { messages: CHAT, files: { 'C:\\work\\shop\\.gitignore': 'node_modules\n' } })
    await pressBand($, 'vault')
    await pressBand($, 'vault')
    expect(state.writes).toEqual(['C:/work/shop/.env'])
    expect(state.files.get('C:/work/shop/.gitignore')).toBe('node_modules\n')
    expect(state.compacts).toHaveLength(1)
  })

  test('🛡️ ohne Geheimnisse im Chat: Toast, nichts geschrieben, nicht verdichtet', async ($, on) => {
    const state = await vaultWorld($, on, { messages: [{ role: 'user', text: 'Schreib an jane@example.com', toolUses: [] }] })
    await pressBand($, 'vault')
    await pressBand($, 'vault')
    expect(state.toasts).toContain('Im Chat stehen keine Passwörter oder Schlüssel.')
    expect(state.writes).toEqual([])
    expect(state.forks).toEqual([])
    expect(state.compacts).toEqual([])
  })

  test('🛡️ in einem Chat ohne Projektordner: nur ein Toast', async ($, on) => {
    const state = await vaultWorld($, on, {
      cwd: 'C:\\Users\\me\\AppData\\Roaming\\Claude\\scratch-workspaces\\abc\\scratch-1',
      messages: CHAT,
    })
    await pressBand($, 'vault')
    await pressBand($, 'vault')
    expect(state.toasts).toContain('Dieser Chat hat keinen Projektordner, darum gibt es keinen Ort für eine .env.')
    expect(state.writes).toEqual([])
    expect(state.forks).toEqual([])
    expect(state.compacts).toEqual([])
  })

  test('🛡️ kann die .env nicht schreiben: Toast mit Grund, nicht verdichtet', async ($, on) => {
    const state = await vaultWorld($, on, { messages: CHAT, failsWrite: true })
    await pressBand($, 'vault')
    await pressBand($, 'vault')
    // The engine's reason shows in brackets.
    expect(state.toasts.find(one => one.startsWith('Die .env ließ sich nicht schreiben ('))).toMatch(/\(.+\)\. Der Chat bleibt, wie er ist\.$/)
    expect(state.compacts).toEqual([])
  })
})

// Messages the person wrote while a plan waited for Start; each asked for the work, none said "leg los".
const SAID_DO = [
  'dann setze bitte b) um... Übrigens... Antwortzeit haben wir ja bereits im umgebauten Glance-Mod... kann also weg. catch me up auch, denn wir haben ja den Verlauf, blast-radius empfinde ich nur als störend. Meine Erfahrung mit Claude ist, dass du nichts versehentlich löschst.',
  'Lass uns beim Text bleiben, aber nenne es lieber "Push"',
  'Ja, eine eindeutige Aufforderung, etwas umzusetzen, egal wie ich es schreibe, sollte als Startsignal verstanden werden.',
] as const

test('a clear request to carry out work counts as a go-ahead, worded any way; a question, a no or an explanation does not', () => {
  const yes = [
    ...SAID_DO,
    'Bitte umsetzen.',
    'Das bitte so umsetzen.',
    'Bau das so ein.',
    'Nimm die Zeile raus.',
    'Ok, füg den Test hinzu.',
    'Entferne den alten Knopf.',
    'Lösche die alte Version.',
    'Benenne die Datei um.',
    'Pass die Farben an.',
    'Schalte den Ton ab.',
    'Spiel das Update ein.',
    'Korrigiere den Tippfehler.',
    'Ergänze einen Test.',
    'Erstelle die Datei.',
    'Ändere die Farbe auf Blau.',
    'Mach den Rand dünner.',
    'Schreib das in die Anleitung rein.',
    'Übernimm den Vorschlag.',
    'Setz den Plan um.',
    'Lass uns das so machen.',
    'Das kann weg.',
    'Entferne den Plan-Knopf.',
    'Ja.',
    'Ja, so machen wir es.',
    'Behebe den Fehler.',
    'Repariere den Link.',
    'Implementiere die Suche.',
    'Aktualisiere die Doku.',
    'Installiere das Paket.',
    'Teste das.',
    'Räum den Ordner auf.',
    'Verschieb den Knopf nach rechts.',
    'Stell die Farben um.',
    'Richte die Tests ein.',
    'Binde die Schrift ein.',
    'Nimm b.',
    'Bitte beheben.',
  ]
  const no = [
    'Ich musste übrigens 2x auf den Start-Button klicken, bevor es losging',
    'Der Start-Button fehlt.',
    'Gut, aber du hattest ja alle Fragen abgeschlossen …',
    'Lass uns beim Text bleiben.',
    'Kannst du das umsetzen?',
    'Setz das um?',
    'Setz das bitte noch nicht um.',
    'Wenn die Tests grün sind, bau es ein.',
    'Bau es ein, aber erst morgen.',
    'Lass uns beim Text bleiben, aber nenne es nicht Push.',
    'Ja, aber erst die Tests.',
    'Ja?',
    'Ja, wenn du meinst.',
    'Ja, das ist nicht gut.',
    'Nein, entferne das.',
    'Warte, setz das um.',
    'Stopp. Entferne das.',
    'Erkläre mir, wie du das umsetzen würdest.',
    'Erklär mir den Fehler und entferne ihn.',
    'Zeig mir den Code.',
    'Sag mir, was du ändern würdest.',
    'Liste die Änderungen auf.',
    'Nenn mir die Vorteile.',
    'Ändere Schritt zwei.',
    'Ja. Ändere Schritt zwei.',
    'mach mal einen neuen Plan',
    'Mach Pause.',
    'Das setze ich später selbst um.',
    'Setze ich um.',
    'Schreib mir kurz, was du vorhast.',
    'Schreib „leg los“ in die Anleitung.',
    'Das ist ja schön.',
    'mach',
    'Verschieb das auf morgen.',
    'Ich teste das später.',
    'Teste ich gleich.',
    // Everything that never was a go-ahead stays none.
    'leg noch nicht los',
    'Bitte noch nicht loslegen.',
    'Nicht loslegen, erst die Fragen.',
    'Nein, leg los ist falsch.',
    'Soll ich loslegen?',
    'Kann ich einfach sagen: leg los?',
    'Ich fang an zu zweifeln.',
    'Mach das so nicht.',
    'nein, ändere Schritt zwei',
    'ändere Schritt zwei',
    'change step two',
  ]
  expect(yes.filter(one => !saysDo(one))).toEqual([])
  expect(no.filter(saysDo)).toEqual([])
  // A request alone is no go-ahead for a plan not yet made: isStartWords, which a new request's own plan asks, keeps
  // to the go-ahead words.
  expect(SAID_DO.filter(isStartWords)).toEqual([])
})

test('with Approve the plan first on, a clear request to carry out work starts the waiting plan; a new request still gets its plan shown first', async ($, on) => {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'approve on' } as never)
  await $.turn.start({ text: 'Bau mir eine Kontaktseite ein', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')

  await $.turn.start({ text: 'Gut, aber du hattest ja alle Fragen abgeschlossen …', turnId: 't2' })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')

  await $.turn.start({ text: SAID_DO[0], turnId: 't3' })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  // Claude lays out a different plan: the go-ahead went to the waiting one, so this one waits for its own.
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it', 'Ship it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
  expect((await texts($, 'terminal')).join('\n')).toContain('▶ Start')
})

test('mit Freigabe-Pflicht gibt „los“ den wartenden Plan frei; ein anderer Plan in derselben Runde wartet wieder', async ($, on) => {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'approve on' } as never)
  await $.turn.start({ text: 'Bau mir eine Kontaktseite ein', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  await $.turn.complete({ answer: 'Der Plan steht.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')

  await $.turn.start({ text: 'los', turnId: 't2' })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  await callTool($, { tool: PLAN, steps: ['Build the form', 'Send the mail', 'Test it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
  expect((await texts($, 'terminal')).join('\n')).toContain('▶ Start')
})

test('mit Freigabe-Pflicht und „los“ ohne wartenden Plan ist der erste Plan der Runde frei, ein zweiter, anderer wartet', async ($, on) => {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'approve on' } as never)
  await $.turn.start({ text: 'los', turnId: 't1' })
  const first = await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect(String(first.result)).toContain('Der erste hat begonnen')
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()

  const second = await callTool($, { tool: PLAN, steps: ['Build the form', 'Test it'] })
  expect(String(second.result)).toContain('warte auf ihre Antwort')
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
})

test('mit Freigabe-Pflicht bleibt derselbe Plan, noch einmal angelegt, frei, auch in einer späteren Runde mit „weiter“', async ($, on) => {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'approve on' } as never)
  await $.turn.start({ text: 'Bau mir eine Kontaktseite ein', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  await $.turn.complete({ answer: 'Der Plan steht.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  await $.turn.start({ text: 'los', turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  // A step a progress report adds needs no approval, and the plan with it counts as the same.
  await callTool($, { tool: PROGRESS, task: 'Fix the footer', percent: 50 } as never)
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  await $.turn.complete({ answer: 'Zwischenstand.', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })

  await $.turn.start({ text: 'weiter', turnId: 't3' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  expect((await texts($, 'terminal')).join('\n')).not.toContain('▶ Start')
})

for (const surface of SURFACES) {
  test(`one press on Start starts the waiting plan, and the band holds still while the plan waits (${surface})`, async ($, on) => {
    const clock = world(on)
    const sent: string[] = []
    on('prompt.submit', (_, e) => {
      sent.push(e.text)
      return { text: e.text }
    })
    // How often the band's clock ticks: each tick draws the band afresh.
    let ticks = 0
    on('state.set', (_, e, next) => {
      if ((e as { key?: string }).key === 'tick') ticks += 1
      return next(e)
    })
    const tick = async () => ticks
    await $.command.run({ command: 'glanceflow', args: 'approve on' } as never)
    await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
    await $.turn.complete({ answer: 'Der Plan steht.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

    // Nothing moves while the plan waits: the band is not drawn again four times a second, so a click is not lost to
    // a fresh drawing between press and release.
    const before = await tick()
    await clock.advance(2000)
    expect(await tick()).toBe(before)

    const band = await $.ui.mount({ ...BAND, surface })
    await band.press({ key: 'start' })
    await band.unmount()
    expect(sent).toEqual(['Der Plan sieht gut aus. Leg bitte los.'])
    await $.turn.start({ text: sent[0]!, turnId: 't2' })
    expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
    const after = await $.ui.mount({ ...BAND, surface })
    const labels = (await after.findAll({ type: 'Button' })).map(one => one.text)
    await after.unmount()
    expect(labels.filter(label => /(^|\s)Start$/.test(label))).toEqual([])

    // Working again, the steps move as before.
    const working = await tick()
    await clock.advance(2000)
    expect(await tick()).toBeGreaterThan(working)
  })
}

describe('Verdichtung des Chats', () => {
  const COMPACT_MESSAGES = [{ role: 'user', text: 'Hallo', toolUses: [] }]
  const START_LINE = /^(\S+ )?Start$/m
  // A plan that waits for Start; the engine's compaction draws the band on both surfaces while it runs.
  const waitingPlan = async ($: Engine, on: On) => {
    // The world beneath, as world() lays it, with the toasts kept.
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    on('model.complete', () => ({ value: { isAnswered: true, text: 'Build my landing page', usage: {} } as never }))
    const toasts: string[] = []
    on('ui.toast', (_, e) => {
      toasts.push(String((e as { text: string }).text))
      return { value: undefined } as never
    })
    on('tool.call', (() => ({ result: {} })) as never)
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    on('classic.Notification', () => ({}) as never)
    const sent: string[] = []
    on('prompt.submit', (_, e) => {
      sent.push(e.text)
      return { text: e.text }
    })
    const during: Record<string, string> = {}
    const state = { onCompact: async () => {}, hidesCompacting: false }
    // A band drawn while hidesCompacting holds has not caught up with the compaction yet: it still shows Start.
    on('state.get', async (_, e, next) => {
      const result = await next(e)
      return (state.hidesCompacting && (e as { key?: string }).key === 'isCompacting' ? { ...result, value: false } : result) as never
    })
    on('session.compact', async () => {
      for (const surface of SURFACES) during[surface] = (await texts($, surface)).join('\n')
      await state.onCompact()
      return { messages: [{ role: 'user', text: 'Zusammenfassung.', toolUses: [] }] } as never
    })
    await $.command.run({ command: 'glanceflow', args: 'approve on' } as never)
    await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
    await $.turn.complete({ answer: 'Der Plan steht.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    return { sent, toasts, during, state }
  }
  const viewMinimal = async ($: Engine) => {
    const settings = await $.ui.mount({
      plugin: 'glanceflow',
      component: 'Pane',
      requestId: 'glanceflow-settings',
      surface: 'terminal',
      props: { title: 'Settings', isFocused: true, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    await settings.press({ key: 'view-minimal' })
    await settings.unmount()
  }

  test('während der Hauptchat verdichtet wird, sagt das Band Räumt auf… und hat kein Start; danach ist Start wieder da', async ($, on) => {
    const { during } = await waitingPlan($, on)
    for (const surface of SURFACES) expect((await texts($, surface)).join('\n')).toMatch(START_LINE)

    await $.session.compact({ trigger: 'manual', messages: COMPACT_MESSAGES } as never)
    for (const surface of SURFACES) {
      expect(during[surface]).toContain('Räumt auf…')
      expect(during[surface]).not.toMatch(START_LINE)
      const after = (await texts($, surface)).join('\n')
      expect(after).not.toContain('Räumt auf…')
      expect(after).toMatch(START_LINE)
    }

    // Minimal says it in its one line too.
    await viewMinimal($)
    await $.session.compact({ trigger: 'manual', messages: COMPACT_MESSAGES } as never)
    for (const surface of SURFACES) {
      expect(during[surface]).toContain('Räumt auf…')
      expect(during[surface]).not.toContain('Wartet auf Start')
      expect(during[surface]).not.toMatch(START_LINE)
      expect((await texts($, surface)).join('\n')).toContain('Wartet auf Start (0/2)')
    }
  })

  test('die Verdichtung vorab im Hintergrund und die eines Helfers lassen Start stehen', async ($, on) => {
    const { during } = await waitingPlan($, on)
    for (const compaction of [
      { trigger: 'precompute', messages: COMPACT_MESSAGES },
      { trigger: 'manual', agentId: 'a1', messages: COMPACT_MESSAGES },
    ]) {
      await $.session.compact(compaction as never)
      for (const surface of SURFACES) {
        expect(during[surface]).not.toContain('Räumt auf…')
        expect(during[surface]).toMatch(START_LINE)
      }
    }
  })

  test('ein Druck auf Start während der Verdichtung schickt nichts und sagt, dass gleich noch mal', async ($, on) => {
    const { sent, toasts, state } = await waitingPlan($, on)
    // A band that has not caught up with the compaction still shows Start: the press comes from there.
    let pressed = false
    state.onCompact = async () => {
      state.hidesCompacting = true
      const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
      state.hidesCompacting = false
      await band.press({ key: 'start' })
      await band.unmount()
      pressed = true
    }
    await $.session.compact({ trigger: 'manual', messages: COMPACT_MESSAGES } as never)
    expect(pressed).toBe(true)
    expect(sent).toEqual([])
    expect(toasts).toContain('Der Chat wird gerade aufgeräumt. Drück gleich noch mal.')

    // Once it is through, Start sends again.
    const again = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await again.press({ key: 'start' })
    await again.unmount()
    expect(sent).toEqual(['Der Plan sieht gut aus. Leg bitte los.'])
  })
})

test("Claude's answer that asks something or offers a choice is told apart from one that just ends", () => {
  const asks = [
    'Es gibt zwei Wege: a) neu bauen, b) umbauen. Welche Variante meinst du?',
    'Ich sehe drei Möglichkeiten. Sag mir, welche du willst.',
    'Soll ich das so bauen?',
    'Wofür entscheidest du dich?',
    '**Nimm a oder b, dann lege ich los.**',
    'Wenn das passt: Schreib los.',
    'Gib mir kurz Rückmeldung zu den Farben.',
  ]
  const ends = [
    'Fertig. Die Tests laufen grün.',
    'Sag mir Bescheid, wenn du noch etwas brauchst.',
    'Die Preisseite steht.',
    'Hier der Befehl:\n```\nwelche fragen?\n```',
    '',
  ]
  expect(asks.filter(one => !offersChoice(one))).toEqual([])
  expect(ends.filter(offersChoice)).toEqual([])
})

/** One main turn of Claude's that ends with this answer. */
async function answered($: Engine, turnId: string, answer: string) {
  await $.turn.start({ text: 'Wie bauen wir die Preisseite?', turnId })
  await $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId, reason: 'answer' })
}

test('in Gruppenarbeit, a clear request in reply to Claude\'s question starts the plan Claude makes for it', async ($, on) => {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'arbeitsweise dynamisch' } as never)
  await answered($, 't1', 'a) eine neue Seite, b) die alte umbauen. Welche Variante meinst du?')
  await $.turn.start({ text: SAID_DO[0], turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  expect((await texts($, 'terminal')).join('\n')).not.toContain('▶ Start')
})

test('in Gruppenarbeit, a new request out of the blue still gets its plan shown first', async ($, on) => {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'arbeitsweise dynamisch' } as never)
  await answered($, 't1', 'Die Startseite steht.')
  await $.turn.start({ text: 'Baue mir eine Preisseite.', turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
  expect((await texts($, 'terminal')).join('\n')).toContain('▶ Start')
})

test('with Approve the plan first on, "Nimm b." after "Sag mir, welche du willst." starts the plan Claude makes for it', async ($, on) => {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'approve on' } as never)
  await answered($, 't1', 'a) schlicht, b) mit Tabelle. Sag mir, welche du willst.')
  await $.turn.start({ text: 'Nimm b.', turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
})

test("with Approve the plan first on, a question back to Claude's choice starts nothing", async ($, on) => {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'approve on' } as never)
  await answered($, 't1', 'a) schlicht, b) mit Tabelle. Sag mir, welche du willst.')
  await $.turn.start({ text: 'Was kostet b?', turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
})

test('with Approve the plan first on, "Nimm b." with no question before it starts no plan Claude makes for it', async ($, on) => {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'approve on' } as never)
  await answered($, 't1', 'Die Startseite steht.')
  await $.turn.start({ text: 'Nimm b.', turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
})

test('Anweisungen zum Nachmessen, Prüfen und Nachsehen geben frei; ein Einwand, eine Verneinung, eine Frage, eine Erklärung oder der Plan selbst nicht', () => {
  const yes = [
    'Miss Striche und Knopfbreiten nach und nenn die Werte',
    'Miss das nach und nenn die Werte',
    'Prüf das bitte',
    'Schau nach, ob es passt',
    'Ich habe die App neu gestartet. Schau bitte nach, ob Striche und Knopfbreiten passen.',
    'Miß die Abstände nach.',
    'Messe die Ränder aus.',
    'Prüfe die Links.',
    'Schau dir die Seite an.',
    'Sieh bitte nach, ob der Test läuft.',
    'Probier das aus.',
    'Führe die Tests aus.',
    'Check das.',
    'Zeig das Ergebnis im Band.',
    'Bitte nachmessen.',
    'Das bitte prüfen.',
    'Bitte nachsehen.',
    'Bitte ausprobieren.',
    'Bitte ausführen.',
  ]
  const no = [
    'Das Kürzen klappt so leider nicht',
    'Miss das nicht nach',
    'Kannst du das nachmessen?',
    'Zeig mir die Werte',
    'Zeig uns das Ergebnis.',
    'Prüf den Plan noch mal',
    'Schau dir Schritt zwei an.',
    'Prüfe ich gleich.',
    'Schau ich mir an.',
    'Wenn die Tests grün sind, führ sie aus.',
    'Nein, miss das nach.',
    // A sentence that opens with no instruction stays none, "und" or not.
    'Das ist gut und mach weiter',
    'Ich habe die App neu gestartet und schau mal',
    'Ich habe die App neu gestartet und schau bitte nach, ob es passt.',
  ]
  expect(yes.filter(one => !saysDo(one))).toEqual([])
  expect(no.filter(saysDo)).toEqual([])
})

/** With Approve the plan first on, a plan waits for Start; then the person says this. */
async function waitingThenSaid($: Engine, on: On, said: string) {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'approve on' } as never)
  await $.turn.start({ text: 'Bau mir eine Kontaktseite ein', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  await $.turn.complete({ answer: 'Der Plan steht.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.turn.start({ text: said, turnId: 't2' })
}

for (const said of ['Miss Striche und Knopfbreiten nach und nenn die Werte', 'Prüf das bitte', 'Schau nach, ob es passt']) {
  test(`mit Freigabe-Pflicht gibt „${said}“ den wartenden Plan frei`, async ($, on) => {
    await waitingThenSaid($, on, said)
    expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  })
}

for (const said of ['Das Kürzen klappt so leider nicht', 'Miss das nicht nach', 'Kannst du das nachmessen?', 'Zeig mir die Werte', 'Prüf den Plan noch mal']) {
  test(`mit Freigabe-Pflicht lässt „${said}“ den Plan weiter warten`, async ($, on) => {
    await waitingThenSaid($, on, said)
    expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
  })
}

const BOX = 'mcp__ccd_turn__wrap_up'
const RESTARTED = 'Ich habe die App neu gestartet. Schau bitte nach, ob Striche und Knopfbreiten passen.'

/**
 * In Gruppenarbeit, a main turn whose plan runs and that makes these calls at its end (wrap_up puts `ask` in the app's
 * box under the answer); then, after `between` turns, the person's instruction and the new plan Claude makes for it.
 */
async function askedInBox($: Engine, on: On, calls: Record<string, unknown>[], between: string[] = []) {
  world(on)
  await $.command.run({ command: 'glanceflow', args: 'arbeitsweise dynamisch' } as never)
  await $.turn.start({ text: 'los', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  for (const call of calls) await callTool($, call)
  await $.turn.complete({ answer: 'Die Striche sind dünner.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  for (const [at, text] of between.entries()) {
    await $.turn.start({ text, turnId: `b${at}` })
    await $.turn.complete({ answer: 'Gern.', durationMs: 1, isAborted: false, turnId: `b${at}`, reason: 'answer' })
  }
  await $.turn.start({ text: RESTARTED, turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['Measure the lines', 'Report the widths'] })
}

test('in Gruppenarbeit startet eine Anweisung den Plan, wenn Claude davor im Kasten von wrap_up gefragt hat', async ($, on) => {
  await askedInBox($, on, [{ tool: BOX, recap: 'Die Striche sind dünner.', ask: 'Passen die Striche jetzt?' }])
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  expect((await texts($, 'terminal')).join('\n')).not.toContain('▶ Start')
})

const NO_BOX_QUESTION: [string, Record<string, unknown>[], string[]][] = [
  ['ohne wrap_up', [], []],
  ['nach wrap_up ohne ask', [{ tool: BOX, recap: 'Die Striche sind dünner.' }], []],
  ['nach wrap_up mit leerem ask', [{ tool: BOX, recap: 'Die Striche sind dünner.', ask: '' }], []],
  ['nach wrap_up eines Helfers', [{ tool: BOX, recap: 'Die Striche sind dünner.', ask: 'Passen die Striche jetzt?', agentId: 'a1' }], []],
  ['nach einer Frage im Kasten zwei Runden vorher', [{ tool: BOX, recap: 'Die Striche sind dünner.', ask: 'Passen die Striche jetzt?' }], ['Danke.']],
]
for (const [name, calls, between] of NO_BOX_QUESTION) {
  test(`in Gruppenarbeit wartet der Plan zu einer Anweisung ${name}`, async ($, on) => {
    await askedInBox($, on, calls, between)
    expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
    expect((await texts($, 'terminal')).join('\n')).toContain('▶ Start')
  })
}

type Row = { role: 'user' | 'assistant'; text: string; toolUses: { tool_use_id: string; tool: string; input: Record<string, unknown> }[] }
const DO_A = 'Ja, setz Variante A um'

/** Freshly loaded in Gruppenarbeit: the transcript holds `rows`; counts how often GlanceFlow reads it. */
function reloaded(on: On, rows: Row[]) {
  world(on)
  const reads = { count: 0 }
  on('session.messages', () => {
    reads.count += 1
    return { value: rows } as never
  })
  return reads
}

test('frisch geladen gibt eine Anweisung auf „Soll ich das umsetzen?“ im Verlauf den Plan frei', async ($, on) => {
  reloaded(on, [
    { role: 'user', text: 'Wie bauen wir die Preisseite?', toolUses: [] },
    { role: 'assistant', text: 'Variante A ist schlicht, Variante B hat eine Tabelle. Soll ich das umsetzen?', toolUses: [] },
    { role: 'user', text: DO_A, toolUses: [] },
  ])
  await $.command.run({ command: 'glanceflow', args: 'arbeitsweise dynamisch' } as never)
  await $.turn.start({ text: DO_A, turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  expect((await texts($, 'terminal')).join('\n')).not.toContain('▶ Start')
})

test('frisch geladen gibt dieselbe Anweisung nichts frei, wenn die Antwort im Verlauf ohne Frage endet', async ($, on) => {
  reloaded(on, [
    { role: 'user', text: 'Wie bauen wir die Preisseite?', toolUses: [] },
    { role: 'assistant', text: 'Variante A ist schlicht, Variante B hat eine Tabelle.', toolUses: [] },
  ])
  await $.command.run({ command: 'glanceflow', args: 'arbeitsweise dynamisch' } as never)
  await $.turn.start({ text: DO_A, turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
  expect((await texts($, 'terminal')).join('\n')).toContain('▶ Start')
})

test('frisch geladen gibt eine Anweisung frei, wenn im Verlauf wrap_up mit ask gefragt hat', async ($, on) => {
  reloaded(on, [
    { role: 'user', text: 'los', toolUses: [] },
    { role: 'assistant', text: 'Die Striche sind dünner.', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'w1', tool: BOX, input: { recap: 'Die Striche sind dünner.', ask: 'Passen die Striche jetzt?' } }] },
  ])
  await $.command.run({ command: 'glanceflow', args: 'arbeitsweise dynamisch' } as never)
  await $.turn.start({ text: RESTARTED, turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Measure the lines', 'Report the widths'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
})

test('nach einer Runde mit turn.complete liest GlanceFlow den Verlauf nicht mehr nach', async ($, on) => {
  const reads = reloaded(on, [{ role: 'assistant', text: 'Soll ich das umsetzen?', toolUses: [] }])
  await $.command.run({ command: 'glanceflow', args: 'arbeitsweise dynamisch' } as never)
  await $.turn.start({ text: 'Wie bauen wir die Preisseite?', turnId: 't1' })
  expect(reads.count).toBe(1)
  await $.turn.complete({ answer: 'Die Preisseite steht.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.turn.start({ text: DO_A, turnId: 't2' })
  expect(reads.count).toBe(1)
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
})
