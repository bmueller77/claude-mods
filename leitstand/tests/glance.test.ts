import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { GlanceHistoryEntry, GlanceOutcome } from '../types'

import { GEMELDET, ohneVorsatz, activityOf, asksQuestion, carryTokens, questionOf, isButtonsOnly, isContinueWords, liftButtons, isGermanText, isLatinText, isStartWords, cleanName, sentenceCase, localTimes, resetTime, fit, formatCost, formatTokens, headerDetails, ownWords, takeOut, wholePieces, prettyModel, tokenNote } from '../hooks/glance'
import { envValue, extractSecrets, findSecrets, gitignoreWithEnv, maskPrivate, mergeEnv, parseEnv, removeSecrets, replaceSecrets } from '../hooks/privacy'
import { FACTORY_SETTINGS, LEITSTAND_BEFEHLE, LEITSTAND_KURZFORMEN, TEIL_BEFEHLE, startsAtOnce, OTHER_WAITING_MS, OTHER_WORKING_MS, SETTINGS_DAYS, SETTINGS_PREFIX, askedMergeSha, chatSettings, defaultSettings, ownValues, staleSettingsKeys, isMcpMergeAction, otherChats, otherChatsWords, runsPowerShellMerge, runsPrMerge, offersChoice, saysDo, shellPieces, staleResumeKeys, toggled, unsafeMerge, unsafePowerShellMerge } from '../hooks/logic'
import { dayEntries, dayFromArgument, dayKey, expiredHistoryKeys, filesNote, historyDay, historyKey, longDay, mergedEntries, paceFromHistory, sharedDayKeys, shiftDay, teamReport, weekSummary } from '../hooks/history'
import { inBerlin } from '../hooks/berlin'

/** A time on Berlin's wall clock as a moment: what the Leitstand shows on every machine, on UTC servers too. */
const berlinZeit = (year: number, month: number, date: number, hours = 0, minutes = 0, seconds = 0) => {
  const wall = Date.UTC(year, month, date, hours, minutes, seconds)
  const seen = inBerlin(wall)
  return wall - (Date.UTC(seen.year, seen.month - 1, seen.date, seen.hours, seen.minutes, seen.seconds) - wall)
}

const PLAN = 'mcp__leitstand__plan_steps'
const PROGRESS = 'mcp__leitstand__report_progress'
const START_TEXT = 'Der Plan sieht gut aus. Leg bitte los.'
const SURFACES = ['terminal', 'desktop'] as const
// A new chat starts as the config menu says (minimal view, no other chats named); tests of the full band and of the
// other chats line say what they start with.
const VIEW_SIMPLE = { options: { ansicht: 'einfach' } }
const OTHERS_ON = { options: { ansicht: 'einfach', andereChats: true } }
const BAND = {
  plugin: 'leitstand',
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

/** Turns on the detailed view: time, tokens, cache and plan usage. */
async function detailsOn($: Engine) {
  await $.command.run({ command: 'leitstand', args: 'details on' } as never)
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

/**
 * The tags behind the helpers, as the band (or `pane`, the Plan) draws them: each tag Text's runs, a run as its words
 * and, after a bar, its color or `dim`. A tag is small (caption) on vector surfaces and has no size on the terminal.
 */
async function helperTags($: Engine, surface: (typeof SURFACES)[number], bodyColumns = 80, pane = false): Promise<string[][]> {
  const ui = await $.ui.mount(pane ? { ...PLAN_PANE, props: { ...PLAN_PANE.props, bodyColumns }, surface } : { ...BAND, props: { ...BAND.props, bodyColumns }, surface })
  // A tag is the Text whose first run is its opening bracket.
  const opens = (run: unknown) => typeof run === 'object' && run !== null && (run as Drawn).type === 'Text' && (run as Drawn).children?.join('') === '['
  const small = (await ui.findAll({ type: 'Text' })).filter(one => opens(one.children[0]))
  await ui.unmount()
  expect(small.filter(one => (surface === 'terminal' ? 'size' in one.props : one.props.size !== 'caption'))).toEqual([])
  const textOf = (node: Drawn | string): string => (typeof node === 'string' ? node : (node.children ?? []).map(textOf).join(''))

  return small.map(one =>
    (one.children as (Drawn | string)[]).map(run =>
      typeof run === 'string' ? `${run}|plain` : `${textOf(run)}|${run.props.dimColor === true ? 'dim' : String(run.props.color)}`,
    ),
  )
}

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
    expect(shown).toContain(isTerminal ? 'Leitstand: Einfach' : 'Einfach ▾')
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

test('/leitstand off hides the band but keeps the button', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await $.command.run({ command: 'leitstand', args: 'off' } as never)

  for (const surface of SURFACES) {
    const shown = (await texts($, surface)).join('\n')
    expect(shown).not.toContain('Verstehe deine Anfrage')
    expect(shown).toContain(surface === 'terminal' ? 'Leitstand: Aus' : 'Aus ▾')
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
  await $.command.run({ command: 'leitstand', args: 'off' } as never)
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
    // Mit Doppelpunkt nach dem Verb (so kam ein echter Test durch).
    expect(findSecrets('Mein Passwort lautet: zo$febhj367!')).toContain('ein Passwort')
    expect(maskPrivate('Mein Passwort lautet: zo$febhj367!')).toBe('Mein Passwort lautet: ••••••••')
    expect(maskPrivate('Das Kennwort ist = geheim42')).toBe('Das Kennwort ist = ••••••••')
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

  test('removeSecrets puts [Passwort entfernt] where the guard finds a secret; what is left holds none, and the rest stays', () => {
    expect(removeSecrets('Mein Passwort ist geheim123 und so')).toBe('Mein Passwort ist [Passwort entfernt] und so')
    expect(removeSecrets(`log in with password: ${SAMPLE_PASSWORD}`)).toBe('log in with password: [Passwort entfernt]')
    expect(removeSecrets(`nimm ${fakeKey(32)} bitte`)).toBe('nimm [Passwort entfernt] bitte')
    expect(removeSecrets(`Karte ${SAMPLE_CARD} bitte`)).toBe('Karte [Passwort entfernt] bitte')
    for (const text of [
      'Mein Passwort ist geheim123, bitte damit einloggen',
      'Passwort: geheim123',
      'Mein WLAN-Passwort lautet sonne2024',
      'Meine PIN ist 4821',
      `my password is ${SAMPLE_PASSWORD}`,
      SAMPLE_ASSIGNMENT,
      `use ${fakeKey(32)}`,
      `card ${SAMPLE_CARD} please`,
      'IBAN: DE89 3704 0044 0532 0130 00',
      'ο κωδικός μου είναι gata1234',
    ]) {
      const left = removeSecrets(text)
      expect(left).toContain('[Passwort entfernt]')
      expect(findSecrets(left)).toEqual([])
      expect(extractSecrets(left)).toEqual([])
      expect(maskPrivate(left)).toBe(left)
    }
    // Without a secret the text is the same; email addresses and phone numbers are no secret to the guard.
    for (const text of ['Build my landing page', 'Schreib an anna@example.com', 'Das Passwortfeld ist leer']) expect(removeSecrets(text)).toBe(text)
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

test('Fortschritt ohne Schrittnamen gilt für den laufenden Schritt, nicht für einen neuen', async ($, on) => {
  // Haiku ließ im Live-Test (2026-10-19) den Namen weg; daraus wurde ein Schritt "Arbeitet daran".
  world(on)
  await $.turn.start({ text: 'Wie spät ist es?', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Lies die Uhrzeit ab', 'Nenne die Uhrzeit'] } as never)
  await callTool($, { tool: PROGRESS, percent: 100, summary: 'Hat die Uhrzeit abgelesen' } as never)
  const shown = (await texts($, 'desktop')).join(' ')
  expect(shown).not.toContain('Arbeitet daran')
  expect(shown).toContain('1 von 2 fertig')
  expect(shown).toContain('Hat die Uhrzeit abgelesen')
})

test('with the password guard off, a message with a password is sent straight away', async ($, on) => {
  world(on)
  let entered = 0
  on('prompt.submit', (_, e) => {
    entered += 1
    return { text: e.text }
  })
  const off = await $.command.run({ command: 'leitstand', args: 'guard off' } as never)
  expect(off.text).toContain('Der Passwortschutz ist aus')
  const prompt = { text: `log in with password: ${SAMPLE_PASSWORD}`, wait: false, origin: { kind: 'composer' } } as never

  const sent = await $.prompt.submit(prompt)
  expect((sent as { drop?: string }).drop).toBeUndefined()
  expect(entered).toBe(1)

  const on_ = await $.command.run({ command: 'leitstand', args: 'guard on' } as never)
  expect(on_.text).toContain('Der Passwortschutz ist an')
  const held = await $.prompt.submit(prompt)
  expect((held as { drop?: string }).drop).toContain('ein Passwort')
  expect(entered).toBe(1)
})

test('vom Handy (Remote Control) geht eine Nachricht mit Passwort gleich durch, ohne das Passwort; Claude soll es als Erstes sagen', async ($, on) => {
  // As world(), with the toasts kept.
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Build my landing page', usage: {} } as never }))
  on('tool.call', () => ({ result: {} }) as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.Notification', () => ({}) as never)
  const toasts: string[] = []
  const filled: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(String((e as unknown as { text: string }).text))
    return { value: undefined } as never
  })
  on('prompt.fill', (_, e) => {
    filled.push(String((e as unknown as { text: string }).text))
    return { isFilled: true } as never
  })
  const entered: { text: string; context: readonly string[] }[] = []
  on('prompt.submit', (_, e) => {
    entered.push({ text: e.text, context: e.context ?? [] })
    return { text: e.text }
  })
  const sent = await $.prompt.submit({ text: 'Mein Passwort ist geheim123, bitte damit einloggen', wait: false, origin: { kind: 'bridge' } } as never)
  expect((sent as { drop?: string }).drop).toBeUndefined()
  expect(entered).toHaveLength(1)
  expect(entered[0]!.text).toBe('Mein Passwort ist [Passwort entfernt] bitte damit einloggen')
  expect(entered[0]!.text).not.toContain('geheim123')
  const note = entered[0]!.context.join('\n')
  expect(note).toContain('Remote Control')
  expect(note).toContain('Beginne deine Antwort mit genau diesem einen Satz: „Der Passwortschutz hat ein Passwort aus deiner Nachricht entfernt; ich habe es nicht gesehen.“')
  expect(note).not.toContain('geheim123')
  // Nothing waits on the computer: no toast, nothing in the prompt box.
  await clock.advance(100)
  expect(toasts).toEqual([])
  expect(filled).toEqual([])

  // Typed at the computer it is held back as before, with its toast and back in the prompt box, and goes through
  // unchanged when sent again.
  const typed = { text: 'Mein Passwort ist anders456, bitte damit einloggen', wait: false, origin: { kind: 'composer' } } as never
  const first = await $.prompt.submit(typed)
  expect((first as { drop?: string }).drop).toContain('zurückgehalten')
  expect(entered).toHaveLength(1)
  await clock.advance(100)
  expect(toasts).toHaveLength(1)
  expect(filled).toEqual(['Mein Passwort ist anders456, bitte damit einloggen'])
  await $.prompt.submit(typed)
  expect(entered).toHaveLength(2)
  expect(entered[1]).toEqual({ text: 'Mein Passwort ist anders456, bitte damit einloggen', context: [] })

  // A message without a secret from the phone goes on as it is, with no note.
  await $.prompt.submit({ text: 'Baue die Preisseite', wait: false, origin: { kind: 'bridge' } } as never)
  expect(entered[2]).toEqual({ text: 'Baue die Preisseite', context: [] })
})

test('nur vom Handy geht eine Nachricht mit Passwort ohne Zurückhalten durch; vom SDK hält der Passwortschutz sie wie bisher zurück', async ($, on) => {
  world(on)
  const entered: string[] = []
  on('prompt.submit', (_, e) => {
    entered.push(e.text)
    return { text: e.text }
  })
  const text = `log in with password: ${SAMPLE_PASSWORD}`
  // The SDK host is held back as typed at the computer.
  const sdk = await $.prompt.submit({ text, wait: false, origin: { kind: 'sdk' } } as never)
  expect((sdk as { drop?: string }).drop).toContain('zurückgehalten')
  expect(entered).toEqual([])
  const phone = await $.prompt.submit({ text, wait: false, origin: { kind: 'bridge' } } as never)
  expect((phone as { drop?: string }).drop).toBeUndefined()
  expect(entered).toEqual(['log in with password: [Passwort entfernt]'])
})

test('ein Slash-Befehl vom Handy mit Passwort läuft, aber ohne das Passwort; vom Computer wird er wie bisher zurückgehalten', async ($, on) => {
  world(on)
  const entered: string[] = []
  on('prompt.submit', (_, e) => {
    entered.push(e.text)
    return { text: e.text }
  })
  const ran: { command: string; args: string }[] = []
  on('command.run', (_, e) => {
    ran.push({ command: e.command, args: e.args })
    return { text: 'ok' }
  })
  const args = `log in with password: ${SAMPLE_PASSWORD}`
  const typed = (kind: string) =>
    ({ text: `/deploy ${args}`, command: { name: 'deploy', args }, wait: false, origin: { kind } }) as never

  // From the phone the command is not held back...
  const phone = await $.prompt.submit(typed('bridge'))
  expect((phone as { drop?: string }).drop).toBeUndefined()
  expect(entered).toEqual([`/deploy ${args}`])
  // ...and runs without the password, with the note for Claude.
  const run = await $.command.run({ command: 'deploy', args, origin: { kind: 'bridge' } } as never)
  expect(ran).toEqual([{ command: 'deploy', args: 'log in with password: [Passwort entfernt]' }])
  expect(JSON.stringify(ran)).not.toContain(SAMPLE_PASSWORD)
  expect(run.text).toBe('ok')
  expect((run.context ?? []).join('\n')).toContain('Remote Control')

  // Typed at the computer it is held back as before, and runs as typed.
  const computer = await $.prompt.submit(typed('composer'))
  expect((computer as { drop?: string }).drop).toContain('zurückgehalten')
  expect(entered).toHaveLength(1)
  await $.command.run({ command: 'deploy', args, origin: { kind: 'composer' } } as never)
  expect(ran[1]).toEqual({ command: 'deploy', args })

  // From the phone without a secret it runs unchanged, with no note.
  const plain = await $.command.run({ command: 'deploy', args: 'staging', origin: { kind: 'bridge' } } as never)
  expect(ran[2]).toEqual({ command: 'deploy', args: 'staging' })
  expect(plain.context ?? []).toEqual([])
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

  const footer = await $.ui.mount({ plugin: 'leitstand', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
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
  await $.command.run({ command: 'leitstand', args: 'sound on' } as never)
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

test('the reply to that question starts a new job, and the History keeps the first one as done', VIEW_SIMPLE, async ($, on) => {
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
  await $.command.run({ command: 'leitstand', args: 'history' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'notify on' } as never)
  await clock.advance(1)
  shown.length = 0
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await $.turn.complete({ answer: 'Postgres or SQLite, which do you prefer?', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(1)
  expect(shown).toEqual([['Claude braucht dich', 'Postgres or SQLite, which do you prefer?']])
})

test('while a plan waits for Start, the row offers Start and no Pause', async ($, on) => {
  world(on)
  await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
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
    expect(shown).toContain('Explore')
    expect(shown).not.toContain('Aufwand')
    expect(await helperTags($, surface)).toEqual([['[|dim', 'Haiku 4.5|#3fa45a', ' · |dim', 'Niedrig|#3fa45a', ']|dim']])
  }

  await $.turn.complete({ answer: 'found it', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a1' })
  const after = await texts($, 'terminal')
  const at = after.findIndex(one => one.includes('Find the pricing data'))
  expect(after[at - 1]).toContain('✓')
})

/** Starts a helper as the engine does, `model` its answer, and has it make one model request at `effort`. */
async function spawnHelper($: Engine, agentId: string, description: string, effort?: string) {
  await $.agent.spawn({
    tool_use_id: `tu-${agentId}`, prompt: description, description, subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: false, fork: false,
  } as never)
  if (effort === undefined) return
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort, messageCount: 1, agentId } as never)) {
    // drain the step
  }
}

describe('Modell und Aufwand hinter jedem Helfer', () => {
  /** A world whose helpers answer with `models[agentId]`, each request with an empty answer. */
  const helperWorld = (on: On, models: Record<string, string | undefined>) => {
    world(on)
    let spawned = 0
    on('agent.spawn', () => {
      const agentId = Object.keys(models)[spawned++] ?? 'x'
      return { model: models[agentId], agentId } as never
    })
    on('turn.step', async function* (_, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
    })
    on('classic.Stop', () => ({}) as never)
  }
  const OPUS_MITTEL = ['[|dim', 'Opus 5.5|#e2683a', ' · |dim', 'Mittel|#8aa62e', ']|dim']

  test('im Band und im Plan steht [Opus 5.5 · Mittel] klein und farbig, in jeder Ansicht; die Details sagen es nicht noch einmal', async ($, on) => {
    helperWorld(on, { a1: 'claude-opus-5-5' })
    await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Look around the project', 'Write the page'] })
    await spawnHelper($, 'a1', 'Find the pricing data', 'medium')

    // The minimal view a new chat starts in, then Details.
    for (const view of ['minimal', 'details']) {
      if (view === 'details') await detailsOn($)
      for (const surface of SURFACES) {
        expect(await helperTags($, surface)).toEqual([OPUS_MITTEL])
        expect(await helperTags($, surface, 80, true)).toEqual([OPUS_MITTEL])
        const shown = await texts($, surface)
        expect(shown.some(one => one.includes('Aufwand'))).toBe(false)
        expect(shown.some(one => one.includes('· Opus 5.5'))).toBe(false)
      }
      expect(await planPaneTexts($)).not.toContain('Aufwand')
    }

    // Finished, it keeps its tag.
    await $.turn.complete({ answer: 'found it', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a1' })
    for (const surface of SURFACES) {
      expect(await helperTags($, surface)).toEqual([OPUS_MITTEL])
    }
  })

  test('ohne Aufwand steht nur [Haiku 5.5] da, ohne Modell gar keine Klammer', async ($, on) => {
    helperWorld(on, { a1: 'claude-haiku-5-5' })
    await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Look around the project', 'Write the page'] })
    await spawnHelper($, 'a1', 'Find the pricing data')
    await $.classic.Stop({
      stop_hook_active: false,
      background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'Run the build' }],
    } as never)

    for (const surface of SURFACES) {
      const shown = (await texts($, surface)).join('\n')
      expect(shown).toContain('Find the pricing data')
      expect(shown).toContain('Run the build')
      expect(await helperTags($, surface)).toEqual([['[|dim', 'Haiku 5.5|#3fa45a', ']|dim']])
      expect(await helperTags($, surface, 80, true)).toEqual([['[|dim', 'Haiku 5.5|#3fa45a', ']|dim']])
    }
  })

  test('ein Auftrag mit „ultracode“ zeigt Ultracode statt der Stufe; die nächste Runde ohne das Wort wieder die Stufe', async ($, on) => {
    helperWorld(on, { a1: 'claude-opus-5-5', a2: 'claude-opus-5-5' })
    await $.turn.start({ text: 'Bau die Seite mit Ultracode', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Look around the project', 'Write the page'] })
    await spawnHelper($, 'a1', 'Find the pricing data', 'xhigh')
    const ultracode = ['[|dim', 'Opus 5.5|#e2683a', ' · |dim', 'Ultracode|#d93f3f', ']|dim']
    for (const surface of SURFACES) {
      expect(await helperTags($, surface)).toEqual([ultracode])
    }

    await $.turn.start({ text: 'Und jetzt die Preise', turnId: 't2' })
    await spawnHelper($, 'a2', 'Check the prices', 'high')
    for (const surface of SURFACES) {
      const tags = await helperTags($, surface)
      expect(tags).toContainEqual(ultracode)
      expect(tags).toContainEqual(['[|dim', 'Opus 5.5|#e2683a', ' · |dim', 'Hoch|#c29d0b', ']|dim'])
      expect(tags).toHaveLength(2)
    }
  })

  test('size nur auf Vektor-Oberflächen: im Terminal hat kein Text den Schlüssel size, am Desktop ist die Klammer caption', async ($, on) => {
    helperWorld(on, { a1: 'claude-opus-5-5' })
    await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Look around the project', 'Write the page'] })
    await spawnHelper($, 'a1', 'Find the pricing data', 'medium')
    const drawnTexts = async (surface: (typeof SURFACES)[number], pane: boolean) => {
      const ui = await $.ui.mount(pane ? { ...PLAN_PANE, surface } : { ...BAND, surface })
      const found = await ui.findAll({ type: 'Text' })
      await ui.unmount()
      return found
    }

    for (const pane of [false, true]) {
      const terminal = await drawnTexts('terminal', pane)
      // The tag is drawn there, only without a size: older engines refuse the prop and drop the whole band.
      expect(terminal.some(one => one.text.includes('Opus 5.5'))).toBe(true)
      expect(terminal.filter(one => 'size' in one.props)).toEqual([])
      const desktop = (await drawnTexts('desktop', pane)).filter(one => 'size' in one.props)
      expect(desktop.length).toBe(1)
      expect(desktop[0]?.props.size).toBe('caption')
    }
  })

  test('im Terminal steht die Klammer in der Zeile; wird es eng, gehen erst die Details, dann die ganze Klammer', async ($, on) => {
    helperWorld(on, { a1: 'claude-opus-5-5' })
    await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Look around the project', 'Write the page'] })
    await spawnHelper($, 'a1', 'Find the pricing data', 'medium')
    const rowOf = async (bodyColumns: number) => {
      const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns }, surface: 'terminal' })
      const row = (await ui.findAll({ type: 'Box' })).find(one => one.props.key === 'helper-a1')
      await ui.unmount()
      const textOf = (node: Drawn | string): string => (typeof node === 'string' ? node : (node.children ?? []).map(textOf).join(''))
      return row === undefined ? '' : textOf(row as unknown as Drawn)
    }

    expect(await rowOf(80)).toContain('Find the pricing data Explore [Opus 5.5 · Mittel]')
    // Room for the name and the tag, not the details too.
    const middle = await rowOf(50)
    expect(middle).toContain('Find the pricing data [Opus 5.5 · Mittel]')
    expect(middle).not.toContain('Explore')
    // Narrow: the name alone, no half tag.
    const narrow = await rowOf(40)
    expect(narrow).toContain('Find the pricing data')
    expect(narrow).not.toMatch(/[[\]]|Opus|Mittel|Explore/)
    expect(await helperTags($, 'terminal', 40)).toEqual([])
  })
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

test('the details view shows no usage line under the limit, as the mod Statistik does; near the limit it warns', async ($, on) => {
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
    expect(shown).not.toContain('Nutzung')
    expect(shown).not.toContain('42%')
    expect(shown).not.toContain('Chat zu')
    expect(shown).not.toContain('⚠')
  }

  await $.session.measure({
    context: { window: 200_000, tokens: 68_000, percent: 34 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 85 },
      { kind: 'seven_day', percentUsed: 18 },
    ],
    changed: ['context', 'rateLimits'],
  })
  for (const surface of SURFACES) {
    const shown = (await texts($, surface, 120)).join('\n')
    expect(shown).toContain('Du hast 85% deines Limits (5 Std.) verbraucht')
    expect(shown).not.toContain('Nutzung')
  }
})

test("the simple view hides tokens and low plan usage, not the helper's model; the Details button shows them", async ($, on) => {
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
    expect(simple).toContain(surface === 'terminal' ? 'Leitstand: Einfach' : 'Einfach ▾')
    // The tag behind a helper stands in every view.
    expect(simple).toContain('Haiku 4.5')
    expect(simple).not.toMatch(/tokens/i)
    expect(simple).not.toContain('aus Cache')
    expect(simple).not.toContain('Nutzung')
  }

  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 120 }, surface: 'terminal' })
  await ui.press({ key: 'toggle' })
  await ui.unmount()
  const detailed = (await texts($, 'terminal', 120)).join('\n')
  expect(detailed).toContain('Leitstand: Details')
  expect(detailed).toContain('Explore')
  expect(detailed).toContain('Haiku 4.5')
  expect(detailed).toContain('2,4k neu · 10k aus Cache')
  expect(detailed).not.toContain('Nutzung')
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
  expect((await texts($, 'terminal')).join('\n')).toContain('Leitstand: Einfach')
  await press()
  expect((await texts($, 'terminal')).join('\n')).toContain('Leitstand: Details')
  await press()
  expect((await texts($, 'terminal')).join('\n')).toContain('Leitstand: Minimal')
  await press()
  expect((await texts($, 'terminal')).join('\n')).toContain('Leitstand: Einfach')
  await $.command.run({ command: 'leitstand', args: 'off' } as never)
  expect((await texts($, 'terminal')).join('\n')).toContain('Leitstand: Aus')
  await press()
  expect((await texts($, 'terminal')).join('\n')).toContain('Leitstand: Einfach')
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
  plugin: 'leitstand',
  component: 'Pane',
  requestId: 'leitstand-history',
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
    const now = berlinZeit(2026, 9, 6, 12)
    expect(dayFromArgument('', now)).toBe('2026-10-06')
    expect(dayFromArgument(' yesterday', now)).toBe('2026-10-05')
    expect(dayFromArgument(' heute', now)).toBe('2026-10-06')
    expect(dayFromArgument(' gestern', now)).toBe('2026-10-05')
    expect(dayFromArgument(' 2026-09-30', now)).toBe('2026-09-30')
    expect(dayFromArgument(' last week', now)).toBe(null)
  })

  test('days older than 30 are cleaned away', () => {
    const now = berlinZeit(2026, 9, 6, 12)
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
    const now = berlinZeit(2026, 9, 6, 12)
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

test('/leitstand on and off set a setting, and anything else flips it', () => {
  expect(toggled('on', false)).toBe(true)
  expect(toggled('on', true)).toBe(true)
  expect(toggled('off', true)).toBe(false)
  expect(toggled('off', false)).toBe(false)
  expect(toggled('', true)).toBe(false)
  expect(toggled('', false)).toBe(true)
})

test("each finished job is saved, and /leitstand history shows the day's jobs for this project", async ($, on) => {
  const clock = mock.clock(on, { now: berlinZeit(2026, 9, 6, 9, 42) })
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

  const result = await $.command.run({ command: 'leitstand', args: 'history' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'history 2026-01-01' } as never)
  expect((await paneTexts($)).join('\n')).toContain('Für dieses Projekt sind an diesem Tag noch keine Aufgaben gespeichert.')
})

const ENTRY = {
  project: '/work/landing-site',
  newTokens: 3000,
  cachedTokens: 225_000,
  isQuickAnswer: false,
} as const

test('the team report is plain: done, in progress, stuck and time, without tokens or quick questions', () => {
  const at = berlinZeit(2026, 9, 6, 9, 0)
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
    plugin: 'leitstand',
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

test('auf dem Handy (mobile, ohne Band) bleiben die Werkzeugzeilen auch in der einfachen Ansicht, verdeckt; am Desktop nicht', async ($, on) => {
  world(on)
  // What the engine beneath the plugins was asked to draw.
  const engineDrew: unknown[] = []
  on('ui.render', (_, e) => {
    engineDrew.push((e as { props: unknown }).props)
    return { type: 'Box', props: {}, children: [] } as never
  })
  const secret = 'mail jane@example.com'
  const rows = [
    {
      component: 'ToolUse',
      props: { tool_use_id: 'u1', tool: 'Bash', input: { command: `echo ${secret}` }, isRunning: false, isErrored: true, isInterrupted: false, output: 'Die Person hat den Plan noch nicht freigegeben.' },
    },
    { component: 'ToolResult', props: { tool_use_id: 'u1', tool: 'Bash', output: { stdout: secret, stderr: '', interrupted: false }, isErrored: false } },
  ]
  for (const { component, props } of rows) {
    const desk = await $.ui.mount({ plugin: 'leitstand', surface: 'desktop', component, props } as never)
    await desk.unmount()
    expect(engineDrew).toHaveLength(0)
  }
  for (const [at, { component, props }] of rows.entries()) {
    const phone = await $.ui.mount({ plugin: 'leitstand', surface: 'mobile', component, props } as never)
    await phone.unmount()
    expect(engineDrew).toHaveLength(at + 1)
    const row = JSON.stringify(engineDrew.at(-1))
    expect(row).not.toContain('jane@example.com')
    expect(row).toContain('•••@•••')
  }
  expect(JSON.stringify(engineDrew[0])).toContain('Die Person hat den Plan noch nicht freigegeben.')
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

test('the band has History and Fresh chat buttons while Leitstand is on', async ($, on) => {
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
  await $.command.run({ command: 'leitstand', args: 'off' } as never)
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
  // Die Arbeitsweise ist kein Menü mehr, sondern der Knopf 👨‍💼/👨‍👨‍👧‍👦 unten links.
  expect(working.menus).toEqual(['Ausführlich / Einfach / Minimal'])
  expect(working.bottom).toContain('"key":"workmode"')
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

test("Autopilot's line stands over the band, wherever it comes in what other mods draw beneath", async ($, on) => {
  world(on)
  const line = {
    type: 'Box',
    props: { key: 'autopilot', flexDirection: 'column', paddingX: 1 },
    children: [{ type: 'Box', props: { flexDirection: 'row', gap: 1 }, children: [{ type: 'Text', props: {}, children: ['Autopilot:'] }, { type: 'Text', props: {}, children: ['Claude arbeitet ohne Rueckfragen weiter'] }] }],
  }
  const card = { type: 'Text', props: {}, children: ['A card from another mod'] }
  const column = (...children: unknown[]) => ({ type: 'Box', props: { flexDirection: 'column' }, children })
  let beneath: unknown = null
  on('ui.render', { component: 'AbovePrompt' }, () => beneath as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  // Under another mod's card, in the middle of a stack another mod built around it, and alone.
  for (const shape of [column(card, line), column(card, column(line, { type: 'Text', props: {}, children: ['More from below'] })), line]) {
    beneath = shape
    for (const surface of SURFACES) {
      const shown = await texts($, surface)
      const at = (words: string) => shown.findIndex(one => one.includes(words))
      expect(at('Autopilot:')).toBe(0)
      expect(at('Autopilot:')).toBeLessThan(at('Write it'))
      // Moved, not doubled, and its words still side by side.
      expect(shown.filter(one => one.includes('Autopilot:'))).toHaveLength(1)
      expect(at('Claude arbeitet ohne Rueckfragen weiter')).toBe(at('Autopilot:') + 1)
      if (shape !== line) expect(at('Write it')).toBeLessThan(at('A card from another mod'))
    }
  }
})

test('in the Desktop app the welcome cards and the empty band keep that frame: the view on top, places left, actions right', VIEW_SIMPLE, async ($, on) => {
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

test('the second welcome card says where the yellow is: in the words on the terminal, a question mark beside them in the Desktop app', VIEW_SIMPLE, async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/work', surface: 'desktop' } as never)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'tour-next' })
  await band.unmount()
  expect((await texts($, 'desktop', 120)).join('\n')).toContain('Braucht dich neben einem gelben Fragezeichen')
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

test('in the details view the Plan panel shows no usage line: the mod Statistik shows limits and context', async ($, on) => {
  world(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.command.run({ command: 'leitstand', args: 'details on' } as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  await $.session.measure({ context: { window: 200_000, tokens: 68_000, percent: 34 }, rateLimits: [{ kind: 'five_hour', percentUsed: 42 }], changed: ['context', 'rateLimits'] } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PLAN_PANE, surface })
    const words = (await ui.findAll({ type: 'Text' })).map(one => one.text).join('\n')
    await ui.unmount()
    expect(words).toContain('Write it')
    expect(words).not.toContain('Nutzung')
    expect(words).not.toContain('Chat zu')
  }
})

test('in the Desktop app History reads every time one way, as the report does, and the report puts Copy report last', async ($, on) => {
  mock.clock(on, { now: berlinZeit(2026, 9, 6, 18, 0) })
  mock.store(on, {
    'history:2026-10-06': [
      { ...ENTRY, jobId: 'a', startedAt: berlinZeit(2026, 9, 6, 9, 0), finishedAt: berlinZeit(2026, 9, 6, 9, 12, 30), title: 'Build the pricing section', outcome: 'done', stepsDone: 2, stepsTotal: 2, doneSteps: ['Write it', 'Check it'], openSteps: [] },
    ],
  })
  on('session.cwd', () => ({ value: '/work/landing-site' }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('ui.copy', () => ({ value: { isCopied: true } }) as never)
  await $.command.run({ command: 'leitstand', args: 'history' } as never)
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
  // Seit dem ❓ links neben dem Zahnrad hat der Kopf 5 Zellen weniger: Im Hintergrund passt ab 45 statt 40.
  for (const [width, lead] of [[30, 'Hintergrund'], [45, 'Im Hintergrund'], [60, 'Arbeitet noch im Hintergrund']] as const) {
    const shown = await texts($, 'desktop', width)
    expect(shown).toContain(lead)
    expect(shown.join('\n')).not.toMatch(/(Arbeitet|Im|Hintergr)\w*…/)
  }
})

test('in the Desktop app the welcome card says Welcome whole in a narrow band and once to a screen reader, and its words sit in empty room', VIEW_SIMPLE, async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/work', surface: 'desktop' } as never)
  expect(await texts($, 'desktop', 80)).toContain('Willkommen im Leitstand')
  const narrow = await texts($, 'desktop', 30)
  expect(narrow).toContain('Willkommen')
  expect(narrow).not.toContain('Willkommen im Leitstand')

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const words = (await ui.findAll({ type: 'Box' })).find(one => one.props.key === 'tour-text')
  const alts = (await ui.findAll({ type: 'Svg' })).map(one => String(one.props.alt))
  await ui.unmount()
  expect(JSON.stringify(words ?? null)).not.toContain('"type":"Svg"')
  // The mark beside "Welcome to Leitstand" says Status, as every header's does, so Welcome is heard once.
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

test('in the Desktop app no mark says again what the words beside it say, in the band, the Plan or History', VIEW_SIMPLE, async ($, on) => {
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
  // Details under the limit show no usage line either: limits and context are the Statistik mod's.
  await detailsOn($)
  await measure(10, 20)
  band = await drawn({ ...BAND, surface: 'desktop' })
  expect(echoes(band)).toEqual([])
  expect(noticeOf(band)).toBeUndefined()

  // History with nothing saved says so in words; its mark says Notice, History being the panel's title, read just before.
  await $.command.run({ command: 'leitstand', args: 'history' } as never)
  const history = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const alts = (await history.findAll({ type: 'Svg' })).map(one => String(one.props.alt))
  const words = (await history.findAll({ type: 'Text' })).map(one => one.text).join('\n')
  await history.unmount()
  expect(words).toContain('noch keine Aufgaben gespeichert')
  expect(alts).toEqual(['Hinweis'])
})

test("in the Desktop app a panel's marks say neither its title nor the words beside them: Settings and an empty Plan", async ($, on) => {
  world(on)
  const read = async (requestId: string, title: string) => {
    const ui = await $.ui.mount({ ...PANE, requestId, props: { ...PANE.props, title }, surface: 'desktop' } as never)
    const boxes = await ui.findAll({ type: 'Box' })
    const alts = (await ui.findAll({ type: 'Svg' })).map(one => String(one.props.alt))
    await ui.unmount()
    return { echoes: echoes(boxes), alts, titled: alts.filter(alt => title.toLowerCase().includes(alt.toLowerCase())) }
  }

  // Each setting's mark says Setting; its name follows once, in bold.
  const settings = await read('leitstand-settings', 'Leitstand-Einstellungen')
  expect(settings.echoes).toEqual([])
  expect(settings.alts.length > 0 && settings.alts.every(alt => alt === 'Einstellung')).toBe(true)

  // An empty Plan: the panel's title says Plan, the words say there is none yet.
  const plan = await read('leitstand-plan', 'Plan')
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
  // 50 statt 44: das ❓ nimmt dem Kopf 5 Zellen.
  for (const width of [30, 50, 60]) {
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

test("Autopilot's line comes out of what is beneath whole, wherever it sits, its words and its buttons together", () => {
  const button = (label: string) => ({ type: 'Button', props: { key: label, label } })
  const line = {
    type: 'Box',
    props: { key: 'autopilot', flexDirection: 'column', paddingX: 1 },
    children: [
      { type: 'Box', props: { flexDirection: 'row', gap: 1 }, children: [{ type: 'Text', props: {}, children: ['Autopilot:'] }, { type: 'Text', props: {}, children: ['Claude arbeitet ohne Rueckfragen weiter'] }] },
      { type: 'Box', props: { flexDirection: 'row', gap: 2 }, children: [button('Fragen (1)'), button('Beenden')] },
    ],
  }
  const card = { type: 'Text', props: {}, children: ['A card from another mod'] }
  const column = (...children: unknown[]) => ({ type: 'Box', props: { flexDirection: 'column' }, children })
  // At the bottom of what is beneath; in the middle of a stack another mod built around it, beside a lone button.
  expect(takeOut(column(card, line), 'autopilot')).toEqual({ rest: column(card), taken: line })
  const around = column(line, button('Replay 1 edit'))
  expect(takeOut(column(card, around), 'autopilot')).toEqual({ rest: column(card, column(button('Replay 1 edit'))), taken: line })
  // Alone, or not there at all.
  expect(takeOut(line, 'autopilot')).toEqual({ rest: null, taken: line })
  expect(takeOut(column(card), 'autopilot')).toEqual({ rest: column(card), taken: null })
  expect(takeOut(null, 'autopilot')).toEqual({ rest: null, taken: null })
  // Taken out before the buttons are lifted: the line keeps both its buttons, and the lone Replay still joins the actions.
  const rest = takeOut(column(card, around), 'autopilot').rest
  expect(liftButtons(rest).buttons).toEqual([button('Replay 1 edit')])
  expect(JSON.stringify(takeOut(column(card, around), 'autopilot').taken)).toContain('"Beenden"')
})

/** Symbols Unicode 16 draws two cells wide (East Asian Width W) while Claude Code counts one, so a row holding one shifts. */
const WIDE_SYMBOLS =
  /[⌚-⌛〈-〉⏩-⏬⏰⏳◽-◾☔-☕☰-☷♈-♓♿⚊-⚏⚓⚡⚪-⚫⚽-⚾⛄-⛅⛎⛔⛪⛲-⛳⛵⛺⛽✅✊-✋✨❌❎❓-❕❗➕-➗➰➿⬛-⬜⭐⭕]/

test('the band and History draw only symbols every terminal counts as one cell', async ($, on) => {
  world(on)
  historyWorld(on, { cwd: '/work/landing-site' })
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  await $.command.run({ command: 'leitstand', args: 'history' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'history' } as never)
  const SETTINGS = { ...PANE, requestId: 'leitstand-settings' } as const
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

/** What a desktop screen draws, each drawing as its alt and its source. */
async function drawings($: Engine, target: object = BAND): Promise<{ alt: string; source: string }[]> {
  const ui = await $.ui.mount({ ...target, surface: 'desktop' } as never)
  const svgs = (await ui.findAll({ type: 'Svg' })).map(one => ({ alt: String(one.props.alt), source: String(one.props.source) }))
  await ui.unmount()
  return svgs
}
/** A slice of the pie, from its middle out (look.ts pieSvg). */
const PIE_SLICE = '<path d="M12 12 L'
/** The question mark's bowl and the bell's body (look.ts PATHS). */
const QUESTION_PATH = 'M9.3 9.6a2.8 2.8 0 1 1 3.9 2.6'
const BELL_PATH = 'M6.3 16.6v-5.1'
/** The tick (look.ts PATHS.check) and the filled disc a badge draws it on, in the green of done. */
const CHECK_PATH = 'M6.8 12.5l3.4 3.4 7-7.4'
const DONE_DISC = '<circle cx="12" cy="12" r="10" fill="#3fa45a"/>'

test('on the desktop a working job heads with a pie: filled to its percentage with a plan, turning with the tick without one', VIEW_SIMPLE, async ($, on) => {
  const clock = world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: 'Bash', command: 'npm run build' })
  const turning = async () => (await drawings($)).find(one => one.alt === 'Status')?.source ?? ''
  const before = await turning()
  expect(before).toContain(PIE_SLICE)
  expect(before).toContain('fill-opacity=".28"')
  expect(before).not.toContain('stroke-dasharray')
  await clock.advance(250)
  const after = await turning()
  expect(after).toContain(PIE_SLICE)
  expect(after).not.toBe(before)

  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  await callTool($, { tool: PROGRESS, task: 'Write it', percent: 100 })
  const pie = (await drawings($)).find(one => /% fertig$/.test(one.alt))
  expect(pie?.source).toContain(PIE_SLICE)
  expect(pie?.source).toContain('fill-opacity=".28"')
  expect(pie?.source).not.toContain('stroke-dasharray')
})

test('on the desktop Needs you shows a question mark, in the header and on the step that waits, never the bell', VIEW_SIMPLE, async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  const drawn = await drawings($)
  const header = drawn.find(one => one.alt === 'Status')
  expect(header?.source).toContain(QUESTION_PATH)
  expect(header?.source).not.toContain(BELL_PATH)
  // The step that waits keeps its amber disc, now with the question mark in it.
  const waits = drawn.find(one => one.alt === 'Wartet')
  expect(waits?.source).toContain('<circle cx="12" cy="12" r="10" fill="#d9970b"/>')
  expect(waits?.source).toContain(QUESTION_PATH)
  expect(drawn.some(one => one.source.includes(BELL_PATH))).toBe(false)
  // So does the Plan.
  const plan = await drawings($, PLAN_PANE)
  expect(plan.find(one => one.alt === 'Braucht dich')?.source).toContain(QUESTION_PATH)
})

test('on the desktop the steps read by their marks: done a disc with a tick, now a turning ring, to come a ring with its number', VIEW_SIMPLE, async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it', 'Ship it', 'Tell the team'] })
  await callTool($, { tool: PROGRESS, task: 'Write it', percent: 100 })
  for (const target of [BAND, PLAN_PANE]) {
    const drawn = await drawings($, target)
    const done = drawn.find(one => one.alt === 'Fertig')
    expect(done?.source).toContain(DONE_DISC)
    expect(done?.source).toContain(CHECK_PATH)
    const now = drawn.find(one => one.alt === 'Jetzt')
    expect(now?.source).toContain('stroke-dasharray')
    expect(now?.source).not.toContain(PIE_SLICE)
    // Each step to come carries its place in the plan.
    const coming = drawn.filter(one => ['Als Nächstes', 'Später', 'Offen'].includes(one.alt)).map(one => one.source)
    expect(coming).toHaveLength(2)
    expect(coming[0]).toContain('>3<')
    expect(coming[1]).toContain('>4<')
    expect(coming.every(source => source.includes('r="10" stroke="#8e8e8e" stroke-width="1.6"'))).toBe(true)
  }
  expect((await drawings($)).find(one => one.alt === 'Als Nächstes')?.source).toContain('>3<')
})

test('on the desktop a plan waiting for Start numbers its first step too', VIEW_SIMPLE, async ($, on) => {
  world(on)
  await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  const coming = (await drawings($)).filter(one => one.alt === 'Als Nächstes').map(one => one.source)
  expect(coming).toHaveLength(2)
  expect(coming[0]).toContain('>1<')
  expect(coming[1]).toContain('>2<')
})

test('on the desktop a folded block of steps says how many it stands for, +N, not three dots', VIEW_SIMPLE, async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'] })
  await callTool($, { tool: PROGRESS, task: 'Two', percent: 100 })
  const folded = (await drawings($)).filter(one => one.alt === 'Zusammengefasst').map(one => one.source)
  expect(folded).toHaveLength(2)
  expect(folded[0]).toContain('>+2<')
  expect(folded[1]).toContain('>+4<')
  expect(folded.every(source => !source.includes('stroke-width="3.4"'))).toBe(true)
})

// The desktop app draws nothing for an Svg whose alt is empty: a mark without words would just be missing.
test('on the desktop every drawing says what it is, in every state of the checklist and in every panel', async ($, on) => {
  world(on)
  historyWorld(on, { cwd: '/work/landing-site' })
  const SETTINGS = { ...PANE, requestId: 'leitstand-settings' } as const
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
  await $.command.run({ command: 'leitstand', args: 'details on' } as never)
  expect(await nameless(BAND, PLAN_PANE, SETTINGS)).toEqual([])
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  expect(await nameless(BAND, PLAN_PANE)).toEqual([])
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' })
  expect(await nameless(BAND, PLAN_PANE)).toEqual([])
  await $.turn.start({ text: 'continue', turnId: 't2' })
  await callTool($, { tool: PROGRESS, task: 'Check it', percent: 100 })
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  await $.command.run({ command: 'leitstand', args: 'history' } as never)
  expect(await nameless(BAND, PLAN_PANE, PANE)).toEqual([])
})

test('the History button opens the panel; the day picker moves between days', async ($, on) => {
  const clock = mock.clock(on, { now: berlinZeit(2026, 9, 6, 10, 0) })
  mock.store(on, {
    'history:2026-10-05': [
      { ...ENTRY, jobId: 'y', startedAt: berlinZeit(2026, 9, 5, 15, 0), finishedAt: berlinZeit(2026, 9, 5, 15, 5), title: 'Write the welcome email', outcome: 'done', stepsDone: 2, stepsTotal: 2, doneSteps: ['Draft it', 'Check it'], openSteps: [] },
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
  await $.ui.select({ plugin: 'leitstand', key: 'day', value: dayKey(clock.now()) })
  await picker.unmount()
  expect((await paneTexts($)).join('\n')).toContain('noch keine Aufgaben gespeichert')
  expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30')
})

test('Team report shows the report and copies it', async ($, on) => {
  mock.clock(on, { now: berlinZeit(2026, 9, 6, 18, 0) })
  mock.store(on, {
    'history:2026-10-06': [
      { ...ENTRY, jobId: 'a', startedAt: berlinZeit(2026, 9, 6, 9, 0), finishedAt: berlinZeit(2026, 9, 6, 9, 12), title: 'Build the pricing section', outcome: 'done', stepsDone: 2, stepsTotal: 2, doneSteps: ['Write it', 'Check it'], openSteps: [] },
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
  await $.command.run({ command: 'leitstand', args: 'history' } as never)

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

test('Neuer Chat vom Handy: die Antwort nennt /leitstand handoff note, und das gibt die Notiz als Antwort aus, nicht ins Eingabefeld', async ($, on) => {
  const NOTE = 'Fortsetzung aus einem früheren Chat. So ist der Stand: Das Menü ist repariert.'
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('ui.toast', () => ({ value: undefined }) as never)
  const filled: string[] = []
  on('prompt.fill', (_, e) => {
    filled.push(String((e as unknown as { text: string }).text))
    return { isFilled: true } as never
  })
  on('model.fork', () => ({ value: { isAnswered: true, text: NOTE, usage: {} } }) as never)
  on('command.run', () => ({ text: '' }))
  // The note does not get through after /clear: on the phone nothing comes.
  on('prompt.submit', () => ({ drop: 'abgelehnt' }) as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: {} } as never }))
  await $.turn.start({ text: 'Fix the menu', turnId: 't1' })

  const started = await $.command.run({ command: 'leitstand', args: 'handoff', origin: { kind: 'bridge' } } as never)
  expect(started.text).toBe('Starte einen neuen Chat mit Übergabenotiz… Kommt danach nichts, schreib /leitstand handoff note.')
  await clock.advance(5000)
  const before = filled.length
  const note = await $.command.run({ command: 'leitstand', args: 'handoff note', origin: { kind: 'bridge' } } as never)
  expect(note.text).toBe(NOTE)
  expect(filled).toHaveLength(before)

  // At the computer the note goes in the prompt box as before, and the answer to /leitstand handoff stays short.
  const typed = await $.command.run({ command: 'leitstand', args: 'handoff note', origin: { kind: 'composer' } } as never)
  expect(typed.text).toBe('Die letzte Übergabenotiz steht im Eingabefeld.')
  expect(filled.at(-1)).toBe(NOTE)
  const atDesk = await $.command.run({ command: 'leitstand', args: 'handoff', origin: { kind: 'composer' } } as never)
  expect(atDesk.text).toBe('Starte einen neuen Chat mit Übergabenotiz…')
  await clock.advance(5000)
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
  await $.command.run({ command: 'leitstand', args: 'ship on' } as never)
  expect((await texts($, 'terminal')).join('\n')).not.toContain('Push')
  await $.command.run({ command: 'leitstand', args: 'ship off' } as never)
  await finish($)
  for (const surface of SURFACES) expect((await texts($, surface)).join('\n')).not.toContain('Push')

  await $.command.run({ command: 'leitstand', args: 'ship on' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'ship on' } as never)
  await finish($)
  await pressShip($)
  expect(shipped.sent).toHaveLength(1)
  await $.turn.start({ text: shipped.sent[0]!, turnId: 't2' })
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

test('Ship it merges once at the exact approved head commit, and a merge that works ends Ship it', VIEW_SIMPLE, async ($, on) => {
  const { ask, tries } = await shipping($, on)
  expect(await tries(mergeAt(SHA))).toContain('Merge freigeben')

  await ask(SHA, 't2')
  const shown = (await texts($, 'terminal')).join('\n')
  expect(shown).toContain('Braucht dich')
  expect(shown).toContain('Antworte genau: Merge freigeben')
  expect(await tries(mergeAt(SHA))).toContain('Merge freigeben')

  await $.turn.start({ text: `Merge freigeben ${SHA}`, turnId: 't3' })
  // The reply starts a new job: Leitstand first asks for a plan, and that refusal leaves the approval unused.
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
  test(`a merge asked for in ${asked} is approved by the exact ${reply} reply, and only at that head commit`, VIEW_SIMPLE, async ($, on) => {
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

test('Ship it stays guarded through its own first turn, background turns, slash commands and pasted text', VIEW_SIMPLE, async ($, on) => {
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
  await $.command.run({ command: 'leitstand', args: 'pause' } as never)
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

test('the merge guard covers helpers during Ship it and leaves merges alone outside it or with Leitstand off', async ($, on) => {
  const shipped = await shipWorld($, on, 'https://github.com/me/site.git\n')
  await $.command.run({ command: 'leitstand', args: 'ship on' } as never)
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

  await $.command.run({ command: 'leitstand', args: 'off' } as never)
  expect(await tries('gh pr merge 12 --squash')).toBeUndefined()
  for (const command of API_MERGES) expect(await tries(command)).toBeUndefined()
})

test('Ship it refuses curl and wget merges from Claude and helpers, and leaves them alone before it and with Leitstand off', async ($, on) => {
  const shipped = await shipWorld($, on, 'https://github.com/me/site.git\n')
  await $.command.run({ command: 'leitstand', args: 'ship on' } as never)
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

  await $.command.run({ command: 'leitstand', args: 'off' } as never)
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
  expect(await tries(HTTP_MERGES[0]!)).toBeUndefined()
})

test('Ship it refuses gh api merges sent through stdin from Claude and helpers, and leaves them alone before it and with Leitstand off', async ($, on) => {
  const shipped = await shipWorld($, on, 'https://github.com/me/site.git\n')
  await $.command.run({ command: 'leitstand', args: 'ship on' } as never)
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

  await $.command.run({ command: 'leitstand', args: 'off' } as never)
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
  expect(await tries(STDIN_MERGES[0]!)).toBeUndefined()
})

// Every spelling Ship it refuses at the approved head commit or without it, as Claude or a helper would send it.
const WORD_REFUSED = [...HIDDEN_MERGES, ...RUN_TIME_GH, ...UNKNOWN_GH, ...PR_FLAG_FIRST, ...SPELLED_API, ...SPELLED_HTTP]

test('Ship it refuses merges Bash spells in other words from Claude and helpers, and leaves them alone before it and with Leitstand off', async ($, on) => {
  const shipped = await shipWorld($, on, 'https://github.com/me/site.git\n')
  await $.command.run({ command: 'leitstand', args: 'ship on' } as never)
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

  await $.command.run({ command: 'leitstand', args: 'off' } as never)
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

test('MCP merge actions are left alone before Ship it and with Leitstand off', async ($, on) => {
  const shipped = await shipWorld($, on, 'https://github.com/me/site.git\n')
  await $.command.run({ command: 'leitstand', args: 'ship on' } as never)
  await finish($)
  const calls = async (tool: string, extra: object = {}) => (await callTool($, { tool, ...extra })).deny
  for (const tool of MCP_MERGES) {
    expect(await calls(tool)).toBeUndefined()
    expect(await calls(tool, { agentId: 'a1' })).toBeUndefined()
  }

  await pressShip($)
  expect(shipped.sent).toHaveLength(1)
  for (const tool of MCP_MERGES) expect(await calls(tool)).toContain('nie über ein MCP-Tool')

  await $.command.run({ command: 'leitstand', args: 'off' } as never)
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

test('Ship it refuses PowerShell merges from Claude and helpers, and leaves PowerShell alone before it and with Leitstand off', async ($, on) => {
  const shipped = await shipWorld($, on, 'https://github.com/me/site.git\n')
  await $.command.run({ command: 'leitstand', args: 'ship on' } as never)
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

  await $.command.run({ command: 'leitstand', args: 'off' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'ship on' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'ship on' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'pause' } as never)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' })

  const before = (await texts($, 'terminal', 120)).join('\n')
  expect(before).toContain('30 Sek. · ')
  await clock.advance(5 * 60_000)
  const after = (await texts($, 'terminal', 120)).join('\n')
  expect(after).toContain('30 Sek. · ')
  expect(after).not.toContain('5 Min. 30 Sek.')
})


/** A world with a clock to move, and the sounds and words Leitstand plays. */
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

  const result = await $.command.run({ command: 'leitstand', args: 'sound on' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'sound voice' } as never)
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

  const result = await $.command.run({ command: 'leitstand', args: 'notify on' } as never)
  expect(result.text).toContain('Desktop-Benachrichtigungen sind an')
  await clock.advance(1)
  expect(shown).toEqual([['Claude braucht dich', 'So sagt dir der Leitstand Bescheid.']])
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

  await $.command.run({ command: 'leitstand', args: 'notify off' } as never)
  shown.length = 0
  await $.turn.start({ text: 'Fix the footer', turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['Fix it', 'Check it'] })
  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' } as never)
  await clock.advance(1)
  expect(shown).toEqual([])
})

test('on Linux and Windows the chime and the words play through the computer\'s own player and voice', VIEW_SIMPLE, async ($, on) => {
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
  await $.command.run({ command: 'leitstand', args: 'sound voice' } as never)

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
  expect(ran[0]).toMatch(/^pw-play (?:\/|[A-Za-z]:\\).*\/sounds\/needs-you\.wav$/)
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
  await $.command.run({ command: 'leitstand', args: 'notify on' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'notify on' } as never)
  await clock.advance(1)
  shown.length = 0
  const resetsAt = new Date(1_000_000 + 2 * 3_600_000)
  // 8_200_000 is 02:16 UTC on 1 January 1970, 03:16 in Berlin.
  const at = '03:16'
  await $.session.measure({
    context: { window: 200_000, tokens: 20_000, percent: 10 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 82, resetsAt: resetsAt.toISOString() }],
    changed: ['context', 'rateLimits'],
  })
  await clock.advance(1)

  expect((await texts($, 'terminal')).join('\n')).toContain(`Du hast 82% deines Limits (5 Std.) verbraucht · wird um ${at} zurückgesetzt`)
  expect(shown).toEqual([['Plan-Limit', `Du hast 82% deines Limits (5 Std.) verbraucht. Es wird um ${at} zurückgesetzt.`]])

  const later = berlinZeit(2026, 9, 6, 12, 0)
  expect(resetTime(new Date(berlinZeit(2026, 9, 6, 18, 40)).toISOString(), later)).toBe('um 18:40')
  expect(resetTime(new Date(berlinZeit(2026, 9, 8, 9, 0)).toISOString(), later)).toBe('am Do um 09:00')
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
  await $.command.run({ command: 'leitstand', args: 'notify on' } as never)
  await clock.advance(1)
  ran.length = 0

  await $.turn.start({ text: "Fix Ana's 'pricing' page", turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Fix it', 'Check it'] })
  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' } as never)
  await clock.advance(1)
  const toast = ran.find(one => one.argv[0] === 'powershell')
  expect(toast?.argv.at(-1)).toContain('ToastNotificationManager')
  expect(toast?.argv.at(-1)).not.toContain('pricing')
  expect(toast?.env?.LEITSTAND_TITLE).toBe('Claude braucht dich')
  expect(toast?.env?.LEITSTAND_BODY).not.toBe('')
  expect(ran.some(one => one.argv[0] === 'osascript' || one.argv[0] === 'notify-send')).toBe(false)
})

test('a finished job with helpers still running chimes only when they finish', async ($, on) => {
  const { clock, heard } = soundWorld(on)
  await $.command.run({ command: 'leitstand', args: 'sound on' } as never)
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
  const result = await $.command.run({ command: 'leitstand', args: 'calm on' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'details off' } as never)
  expect((await texts($, 'terminal', 120)).join('\n')).not.toContain('0,42 $')

  await callTool($, { tool: PROGRESS, task: 'Check it', percent: 100 })
  await $.turn.complete({ answer: 'Done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.command.run({ command: 'leitstand', args: 'history' } as never)
  const pane = (await paneTexts($)).join('\n')
  expect(pane).toContain('0,42 $')
})

test("once, Leitstand brings over Glance's history, not its settings; another mod's store is left alone", async ($, on) => {
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
    expect(e.path.replaceAll('\\', '/')).toMatch(/^(?:[A-Za-z]:)?\/home\/me\/\.claude\/plugins\/store$/)
    return { value: Object.keys(files).map(name => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })) } as never
  })
  on('fs.read', (_, e) => {
    reads.push(e.path)
    return { value: JSON.stringify(files[e.path.split(/[\\/]/).pop()!]) } as never
  })
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)

  expect(store.get('history:2026-10-06:glance')).toEqual([job])
  // Settings are kept per chat since 0.51: Glance's are not brought over.
  expect(store.get('glanceDetail')).toBeUndefined()
  expect(store.get('glanceSound')).toBeUndefined()
  expect(store.get('glanceEnabled')).toBeUndefined()
  expect(store.get('glanceCalm')).toBeUndefined()
  expect(reads).toHaveLength(2)
})

test("where only USERPROFILE is set (Windows), Leitstand still finds Glance's store and brings over its history", async ($, on) => {
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
  mock.env(on, { USERPROFILE: '/home/me' })
  const job = { jobId: 'j1', project: '/work', startedAt: 1, finishedAt: 2, title: 'Build the page', outcome: 'done', stepsDone: 1, stepsTotal: 1, newTokens: 0, cachedTokens: 0, doneSteps: ['Build the page'], openSteps: [], isQuickAnswer: false }
  const files: Record<string, unknown> = {
    'glance_claude-mods-1a2b.json': { 'history:2026-10-06': [job], glanceDetail: 'detailed', glanceSound: 'chime' },
    'glance_other-3c4d.json': { 'history:2026-10-06': [{ id: 'not ours' }], enabled: false },
    'notes_x-5e6f.json': { glanceCalm: true },
  }
  const reads: string[] = []
  on('fs.list', (_, e) => {
    expect(e.path.replaceAll('\\', '/')).toMatch(/^(?:[A-Za-z]:)?\/home\/me\/\.claude\/plugins\/store$/)
    return { value: Object.keys(files).map(name => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })) } as never
  })
  on('fs.read', (_, e) => {
    reads.push(e.path)
    return { value: JSON.stringify(files[e.path.split(/[\\/]/).pop()!]) } as never
  })
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)

  expect(store.get('history:2026-10-06:glance')).toEqual([job])
  // Settings are kept per chat since 0.51: Glance's are not brought over.
  expect(store.get('glanceDetail')).toBeUndefined()
  expect(store.get('glanceSound')).toBeUndefined()
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
  mock.clock(on, { now: berlinZeit(2026, 9, 6, 18, 0) })
  const job = (jobId: string, day: number, title: string) => ({
    ...ENTRY,
    jobId,
    startedAt: berlinZeit(2026, 9, day, 9, 0),
    finishedAt: berlinZeit(2026, 9, day, 9, 30),
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
  await $.command.run({ command: 'leitstand', args: 'history' } as never)

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
  mock.clock(on, { now: berlinZeit(2026, 9, 6, 18, 0) })
  const job = (jobId: string, day: number, title: string, steps: number, project = '/work/landing-site') => ({
    ...ENTRY,
    jobId,
    project,
    startedAt: berlinZeit(2026, 9, day, 9, 0),
    finishedAt: berlinZeit(2026, 9, day, 9, 30),
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
  const result = await $.command.run({ command: 'leitstand', args: 'week' } as never)
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

test('someone new gets a three-card welcome once; /leitstand tour shows it again', VIEW_SIMPLE, async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)

  const shown = (await texts($, 'terminal', 120)).join('\n')
  expect(shown).toContain('Willkommen im Leitstand · 1 von 3')
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
  expect((await texts($, 'terminal', 120)).join('\n')).not.toContain('Willkommen im Leitstand')

  // The next chat does not show it again.
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
  expect((await texts($, 'terminal', 120)).join('\n')).not.toContain('Willkommen im Leitstand')

  await $.command.run({ command: 'leitstand', args: 'tour' } as never)
  expect((await texts($, 'terminal', 120)).join('\n')).toContain('Willkommen im Leitstand · 1 von 3')
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await band.press({ key: 'tour-skip' })
  await band.unmount()
  expect((await texts($, 'terminal', 120)).join('\n')).not.toContain('Willkommen im Leitstand')
})

test('someone who already uses Leitstand is not welcomed again', async ($, on) => {
  mock.store(on, { glanceSound: 'chime' })
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
  expect((await texts($, 'terminal', 120)).join('\n')).not.toContain('Willkommen im Leitstand')
})

test('a time Claude writes in UTC shows in Berlin time', () => {
  const today = new Date(Date.UTC(2026, 9, 6, 9, 0))
  // October: Berlin runs two hours ahead of UTC.
  expect(localTimes('Wait until 10:01:45 UTC to start the deploy', today)).toBe('Wait until 12:01:45 to start the deploy')
  expect(localTimes('Check again at 9:30 GMT and 23:05Z', today)).toBe('Check again at 11:30 and 01:05')
  // November: one hour, winter time.
  expect(localTimes('Deploy at 22:30 UTC', new Date(Date.UTC(2026, 10, 2, 9, 0)))).toBe('Deploy at 23:30')
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
  const on_ = await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
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

test('ein wartender Plan: Claude nennt die Schritte nummeriert und sagt, dass „los“ freigibt, auch nach einem abgelehnten Tool', async ($, on) => {
  world(on)
  await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
  await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
  const planned = await callTool($, { tool: PLAN, steps: ['Lies die Notizen', 'Baue die Tabelle'] })
  expect(String(planned.result)).toContain(
    'Nenne in deiner Antwort die Schritte nummeriert (1. Lies die Notizen; 2. Baue die Tabelle) und schließ mit dem Satz: ' +
      'Ich warte auf deine Freigabe: Schreib „los“ oder sag, was sich ändern soll.',
  )
  // Without Autopilot nothing follows the closing sentence.
  expect(String(planned.result).endsWith('was sich ändern soll.')).toBe(true)
  const denied = await callTool($, { tool: 'Bash', command: 'ls' })
  expect(denied.deny).toBe(
    'Die Person hat den Plan noch nicht freigegeben. Hör auf und warte auf ihre Antwort. Sag in deiner Antwort, dass der Plan wartet und „los“ ihn freigibt.',
  )
  // „los“, as the answer says, starts it.
  await $.turn.start({ text: 'los', turnId: 't2' })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
})

test('with Approve the plan first on, a plan Claude makes with its own task list also waits for Start', async ($, on) => {
  world(on)
  await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
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

  await $.command.run({ command: 'leitstand', args: 'history' } as never)
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
  // Keys a test makes the store refuse to save.
  const fails = { set: null as RegExp | null }
  on('store.get', (_, e) => ({ value: store.get((e as { key: string }).key) }) as never)
  on('store.set', (_, e) => {
    if (fails.set?.test((e as { key: string }).key)) throw new Error('disk full')
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
  return { clock, store, registered, session, fails }
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

test('a resumed chat gets its checklist back, paused, and Continue picks it up', VIEW_SIMPLE, async ($, on) => {
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

test('the band names another chat that needs you, on every surface, and keeps up as the other chats change', OTHERS_ON, async ($, on) => {
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

test('the other chats line can be turned off in Settings or with /leitstand others off', OTHERS_ON, async ($, on) => {
  const saved = { at: 1_000_000, isOpen: true, list: { title: 'Build the pricing page', phase: 'needsYou', tasks: [], helpers: [], startedAt: 1_000_000, finishedAt: null } }
  const { clock, store } = resumeWorld(on, { 'resume:chat-2': saved })
  await $.session.start({ cwd: '/work', surface: 'terminal' } as never)
  await clock.advance(20_000)
  expect((await texts($, 'desktop')).join('\n')).toContain('Ein anderer Chat braucht dich')
  const result = await $.command.run({ command: 'leitstand', args: 'others off' } as never)
  expect(result.text).toContain('erwähnt keine anderen Chats mehr')
  expect((store.get('settings:chat-1') as { values: { others?: boolean } }).values.others).toBe(false)
  expect(store.get('glanceOthers')).toBeUndefined()
  for (const surface of SURFACES) {
    expect((await texts($, surface)).join('\n')).not.toContain('Ein anderer Chat')
  }
  await $.command.run({ command: 'leitstand', args: 'others on' } as never)
  expect((await texts($, 'desktop')).join('\n')).toContain('Ein anderer Chat braucht dich')
})

test('in a narrow band the chat that needs you is named, never left out for the count of chats at work', OTHERS_ON, async ($, on) => {
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
  plugin: 'leitstand',
  component: 'Pane',
  requestId: 'leitstand-plan',
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
  expect(opened).toEqual(['leitstand-plan'])

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
  await $.command.run({ command: 'leitstand', args: 'details on' } as never)
  await clock.advance(60_000)
  await callTool($, { tool: 'mcp__leitstand__report_progress', task: 'Write copy', percent: 100 })
  await clock.advance(30_000)
  await callTool($, { tool: 'mcp__leitstand__report_progress', task: 'Add pricing', percent: 40 })
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

  const result = await $.command.run({ command: 'leitstand', args: 'plan' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
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
    await $.command.run({ command: 'leitstand', args } as never)
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
  await $.command.run({ command: 'leitstand', args: 'modus gruppenarbeit' } as never)
  await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Plane die Aufgaben', 'Prüfe die Ergebnisse'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')

  await $.turn.start({ text: 'Schreib das rein. also: Leg los.', turnId: 'w-t1', agentId: 'w1' } as never)
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
  expect((await texts($, 'terminal')).join('\n')).toContain('▶ Start')
})

test("in Gruppenarbeit, a helper's turn leaves the person's go-ahead standing: Claude's plan after it does not wait", async ($, on) => {
  world(on)
  await $.command.run({ command: 'leitstand', args: 'modus gruppenarbeit' } as never)
  await $.turn.start({ text: 'Ja, leg los', turnId: 't1' })
  await $.turn.start({ text: 'Lies die Datei und berichte, was drinsteht.', turnId: 'w-t1', agentId: 'w1' } as never)
  const planned = await callTool($, { tool: PLAN, steps: ['Plane die Aufgaben', 'Prüfe die Ergebnisse'] })
  expect(String(planned.result)).toContain('Der erste hat begonnen')
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
})

test('a Leitstand worker shows by its tier, without "leitstand:"; other helpers as named', async ($, on) => {
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
    subagentType: 'leitstand:sorgfaeltig',
    provider: { plugin: 'leitstand', tier: 'user' },
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
    expect(shown).toContain('sorgfältig')
    expect(shown).toContain('Opus 5.5')
    expect(shown).not.toContain('leitstand:')
  }
  const pane = await planPaneTexts($)
  expect(pane).toContain('sorgfältig')
  expect(pane).not.toContain('leitstand:')
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
  expect(wide).toContain('● Leitstand: Einfach')
  expect(wide).toContain('░░░░░░░░░░')

  // 39, not 36: the status column is 3 cells wider for "Hängt fest", so names get 3 fewer. Still under 40, 50 and 60.
  const narrow = (await texts($, 'terminal', 39)).join('\n')
  expect(narrow).toContain('● Einfach')
  expect(narrow).not.toContain('Leitstand: Einfach')
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
    plugin: 'leitstand',
    component: 'Pane',
    requestId: 'leitstand-settings',
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
  expect(opened).toEqual(['leitstand-settings'])

  let shown = await settingsTexts()
  expect(shown).toContain('● Einfach')
  expect(shown).toContain('● Aus')
  expect(shown).toContain('Keine Töne')
  expect(shown).toContain('Balken und Kreisel bewegen sich')
  expect(shown).not.toContain('● 50%')
  // Tidying up with a checkpoint is the Statistik mod's now.
  expect(shown).not.toContain('Jetzt aufräumen')
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
  expect((await texts($, 'terminal')).join('\n')).toContain('Leitstand: Details')

  await pick('view-off')
  expect((await texts($, 'terminal')).join('\n')).toContain('Leitstand: Aus')

  const result = await $.command.run({ command: 'leitstand', args: 'settings' } as never)
  expect(result.text).toBe('Die Einstellungen sind in der Seitenleiste.')
  expect(opened).toHaveLength(2)
})

test('the band never shows how full the chat is, and /leitstand tidy says tidying up is the Statistik mod\'s', async ($, on) => {
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
  const moved = await $.command.run({ command: 'leitstand', args: 'tidy at 60' } as never)
  expect(moved.text).toContain('/statistik:chat-aufraeumen')
  const now = await $.command.run({ command: 'leitstand', args: 'tidy' } as never)
  expect(now.text).toContain('gehört jetzt zur Statistik')
})

test('/leitstand checkpoint says where the checkpoint went', async ($, on) => {
  world(on)
  const result = await $.command.run({ command: 'leitstand', args: 'checkpoint' } as never)
  expect(result.text).toContain('/statistik:letzter-stand-zeigen')
})

test("two chats saving jobs the same day keep both; the day's old shared key moves into the chat's own once", async ($, on) => {
  const clock = mock.clock(on, { now: berlinZeit(2026, 9, 6, 9, 42) })
  const at = berlinZeit(2026, 9, 6, 9, 0)
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
  const result = await $.command.run({ command: 'leitstand', args: 'history' } as never)
  expect(result.text).toBe('Verlauf für 06.10.2026: 3 Aufgaben.')
  const shown = (await paneTexts($)).join('\n')
  expect(shown).toContain('Saved before 0.25')
  expect(shown).toContain('Saved by another chat')
  expect(shown).toContain('Build the pricing section')
})

describe('Arbeitsweise und Grill mich', () => {
  const SETTINGS = {
    plugin: 'leitstand',
    component: 'Pane',
    requestId: 'leitstand-settings',
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
    expect(shown.split('\n')).not.toContain('Modus')
    expect(shown).not.toContain('Arbeitsweise')
    expect(shown).toContain('● Auto-Modus')
    expect(shown).toContain('Claude entscheidet selbst, ob und welche Helfer')

    const ui = await $.ui.mount({ ...SETTINGS, surface: 'terminal' })
    await ui.press({ key: 'mode-dynamisch' })
    await ui.unmount()
    shown = await settingsTexts()
    expect(shown).toContain('● Gruppenarbeit')
    expect(shown).toContain('sechs Stufen')
    // Plan zuerst freigeben gilt in Dynamisch immer, und die Einstellung sagt es.
    expect(shown).toContain('In der Gruppenarbeit wartet jeder Plan auf deine Freigabe')

    const auto = await $.command.run({ command: 'leitstand', args: 'arbeitsweise auto' } as never)
    expect(String(auto.text)).toContain('Auto-Modus:')
    const toggled = await $.command.run({ command: 'leitstand', args: 'arbeitsweise' } as never)
    expect(String(toggled.text)).toContain('Gruppenarbeit:')
    // Die neuen Namen nimmt der Befehl auch.
    expect(String((await $.command.run({ command: 'leitstand', args: 'modus auto-mode' } as never)).text)).toContain('Auto-Modus:')
    expect(String((await $.command.run({ command: 'leitstand', args: 'modus gruppenarbeit' } as never)).text)).toContain('Gruppenarbeit:')
  })

  test('beim Sitzungsstart legt Leitstand sechs Arbeiter mit Modell und Aufwand an', async ($, on) => {
    world(on)
    const registered: Record<string, unknown>[] = []
    on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
    on('tool.register', () => ({ value: undefined }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('agent.register', (_, e) => {
      registered.push(e as unknown as Record<string, unknown>)
      return { value: { agent: `leitstand:${String((e as unknown as { name: string }).name)}` } } as never
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

  test('die Arbeiter bietet Leitstand nur in Dynamisch an, dort dafür keine allgemeinen Helfer', async ($, on) => {
    world(on)
    on('agent.offer', () => ({ isOffered: true }) as never)
    const offer = async (agent: string) =>
      ((await ($.agent as unknown as { offer: (e: unknown) => Promise<{ isOffered: boolean }> }).offer({
        agent,
        description: '',
        source: 'plugin',
        provider: { plugin: 'engine', tier: 'core' },
      })) as { isOffered: boolean }).isOffered

    expect(await offer('leitstand:mittel')).toBe(false)
    expect(await offer('general-purpose')).toBe(true)
    expect(await offer('Explore')).toBe(true)

    await $.command.run({ command: 'leitstand', args: 'arbeitsweise dynamisch' } as never)
    expect(await offer('leitstand:mittel')).toBe(true)
    expect(await offer('leitstand:schnell')).toBe(true)
    expect(await offer('general-purpose')).toBe(false)
    expect(await offer('Explore')).toBe(true)

    // Mit Leitstand aus gilt keine Arbeitsweise: alles wie von der Engine.
    await $.command.run({ command: 'leitstand', args: 'off' } as never)
    expect(await offer('general-purpose')).toBe(true)
  })

  test('in Dynamisch bekommt Claude die Regeln, und in Auto nicht', async ($, on) => {
    world(on)
    on('prompt.compose', () => ({ sections: [] }) as never)
    const compose = async () =>
      ((await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [], sections: [] } as never)) as unknown as {
        sections: { id: string; text: string }[]
      }).sections
    expect((await compose()).some(one => one.id === 'leitstand:dynamisch')).toBe(false)

    await $.command.run({ command: 'leitstand', args: 'arbeitsweise dynamisch' } as never)
    const rules = (await compose()).find(one => one.id === 'leitstand:dynamisch')?.text ?? ''
    expect(rules).toContain('Gruppenarbeit')
    expect(rules).toContain('leitstand:schnell (Haiku)')
    expect(rules).toContain('leitstand:fable (Fable, hoher Aufwand)')
    expect(rules).toContain('Kritisch prüfen')
    expect(rules).toContain('Ein Git-Repository legst du nur an, wenn die Person zustimmt')
  })

  test('in Dynamisch wartet der Plan auf Start, nur Arbeiter mit Stufe dürfen ran, und solange sie laufen, ändert Claude keine Dateien', async ($, on) => {
    world(on)
    on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'w1' }) as never)
    await $.command.run({ command: 'leitstand', args: 'arbeitsweise dynamisch' } as never)
    await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Plane die Aufgaben', 'Prüfe die Ergebnisse'] })
    // Ohne "Plan zuerst freigeben": Dynamisch wartet trotzdem.
    expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')

    await $.turn.start({ text: 'los', turnId: 't2' })
    const general = await callTool($, { tool: 'Agent', subagent_type: 'general-purpose', description: 'Baue die Seite', prompt: 'Baue die Seite' })
    expect(general.deny).toContain('Gruppenarbeit')
    expect(general.deny).toContain('leitstand:mittel')
    const untyped = await callTool($, { tool: 'Agent', description: 'Baue die Seite', prompt: 'Baue die Seite' })
    expect(untyped.deny).toContain('Gruppenarbeit')
    expect((await callTool($, { tool: 'Agent', subagent_type: 'leitstand:mittel', description: 'Baue die Seite', prompt: 'x' })).deny).toBeUndefined()
    expect((await callTool($, { tool: 'Agent', subagent_type: 'Explore', description: 'Suche', prompt: 'x' })).deny).toBeUndefined()

    await $.agent.spawn({
      tool_use_id: 'tu1',
      prompt: 'Baue die Seite',
      description: 'Baue die Seite',
      subagentType: 'leitstand:mittel',
      provider: { plugin: 'leitstand', tier: 'user' },
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
      // A run that never comes through, as while a running Autopilot keeps the session busy.
      runHangs: false,
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
      if (state.runHangs) return new Promise<never>(() => {})
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

  test('in der App stehen hinter Grill mich Vermenschlichen, Kurzantworten, Dateien, Autopilot, Verdecken und Tresor, im Terminal nicht', async ($, on) => {
    await skillWorld($, on)
    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const row = JSON.stringify((await desktop.findAll({ type: 'Box' })).find(one => one.props.key === 'actions') ?? null)
    await desktop.unmount()
    const order = ['workmode', 'nightshift', 'grill', 'cleancode', 'reflect', 'humanize', 'adhd', 'filetree', 'privacy', 'vault', 'plan', 'history'].map(key => row.indexOf(`"key":"${key}"`))
    expect(order.every(index => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    for (const label of ['\u{1F9F9}', '\u{1FA9E}', '\u{1F9CD}', '\u{1F4D6}', '\u{1F4C2}', '\u{1F170}\uFE0F', '\u{1F512}', '\u{1F6E1}\uFE0F']) expect(row).toContain(`"label":"${label}"`)
    // Review and Usage are gone.
    for (const key of ['review', 'usage']) expect(row).not.toContain(`"key":"${key}"`)
    for (const label of ['\u{1F50D}', '\u{1F4C8}']) expect(row).not.toContain(label)

    for (const bodyColumns of [50, 80, 140]) {
      const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns }, surface: 'terminal' })
      const keys = (await ui.findAll({ type: 'Button' })).map(one => one.props.key)
      await ui.unmount()
      for (const key of ['review', 'usage', 'cleancode', 'reflect', 'humanize', 'adhd', 'filetree', 'nightshift', 'privacy', 'vault']) expect(keys).not.toContain(key)
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

  test('in der App trennen Striche die Gruppen unten links: hinter dem Autopiloten, hinter Kurzantworten, hinter Dateien und vor Plan, im Terminal keine', async ($, on) => {
    await skillWorld($, on)
    expect(await leftRow($)).toEqual(['workmode', 'nightshift', 'dim|', 'grill', 'cleancode', 'reflect', 'humanize', 'adhd', 'dim|', 'filetree', 'dim|', 'privacy', 'vault', 'dim|', 'plan', 'history'])

    for (const bodyColumns of [50, 80, 140]) {
      const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns }, surface: 'terminal' })
      const words = (await ui.findAll({ type: 'Text' })).map(one => one.text)
      await ui.unmount()
      expect(words).not.toContain('|')
    }
  })

  test('in der App stehen die Knöpfe der unteren Zeile eine halbe Zelle auseinander, damit Neuer Chat mit hineinpasst', async ($, on) => {
    await skillWorld($, on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const actions = (await ui.findAll({ type: 'Box' })).find(one => one.props.key === 'actions')
    await ui.unmount()
    type Kid = { props: Record<string, unknown> }
    const [left, right] = ((actions as unknown as { children?: Kid[] } | undefined)?.children ?? []) as Kid[]
    expect(actions?.props.columnGap).toBe(1)
    expect(left?.props.columnGap).toBe(0.5)
    expect(right?.props.columnGap).toBe(0.5)
  })

  test('in der App steht über der unteren Zeile und zwischen ihren Umbrüchen so viel Platz, dass sich keine Knöpfe berühren', async ($, on) => {
    await skillWorld($, on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const actions = (await ui.findAll({ type: 'Box' })).find(one => one.props.key === 'actions')
    await ui.unmount()
    type Kid = { props: Record<string, unknown> }
    const [left, right] = ((actions as unknown as { children?: Kid[] } | undefined)?.children ?? []) as Kid[]
    // In halben Zeilen (10 px): die App zeichnet einen Knopf 8 px höher als seine Zeile, 1.2 lässt 4 px frei.
    expect(actions?.props.marginTop).toBe(1.2)
    expect(actions?.props.rowGap).toBe(1.2)
    expect(left?.props.rowGap).toBe(1.2)
    expect(right?.props.rowGap).toBe(1.2)
    // Im Terminal bleibt es bei einer Zeile Abstand.
    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const row = (await terminal.findAll({ type: 'Box' })).find(one => one.props.key === 'actions')
    await terminal.unmount()
    expect(row?.props.marginTop).toBeUndefined()
  })

  test('in der App steht ❓ links neben dem Zahnrad und öffnet das Fenster Leitstand-Knöpfe; im Terminal fehlt es wie das Zahnrad', async ($, on) => {
    const opened: string[] = []
    on('ui.open', (_, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true } } as never
    })
    await skillWorld($, on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const right = JSON.stringify((await ui.findAll({ type: 'Box' })).find(one => one.props.key === 'header-right') ?? null)
    expect((await ui.findAll({ type: 'Button' })).find(one => one.props.key === 'help')?.props.label).toBe('\u2753')
    expect(right.indexOf('"key":"help"')).toBeLessThan(right.indexOf('"key":"settings"'))
    await ui.press({ key: 'help' })
    await ui.unmount()
    expect(opened).toEqual(['leitstand-knoepfe'])
    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect((await terminal.findAll({ type: 'Button' })).some(one => one.props.key === 'help')).toBe(false)
    await terminal.unmount()
  })

  test('das Fenster Leitstand-Knöpfe nennt jeden Knopf, den das Band zeigt, in beiden Arbeitsweisen', async ($, on) => {
    await skillWorld($, on)
    const labels = async () => {
      const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
      const found = (await ui.findAll({ type: 'Button' })).map(one => String(one.props.label))
      await ui.unmount()
      return found
    }
    const shown: string[] = [...(await labels())]
    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await band.press({ key: 'workmode' })
    await band.press({ key: 'privacy' })
    await band.press({ key: 'adhd' })
    await band.unmount()
    shown.push(...(await labels()))
    const pane = await $.ui.mount({
      plugin: 'leitstand',
      component: 'Pane',
      requestId: 'leitstand-knoepfe',
      surface: 'desktop',
      props: { title: 'Leitstand-Knöpfe', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} },
    })
    const text = (await pane.findAll({ type: 'Text' })).map(one => one.text).join('\n')
    await pane.unmount()
    expect(shown.length).toBeGreaterThan(20)
    for (const label of new Set(shown)) expect(text).toContain(label)
    expect(text).toContain('/leitstand:knoepfe-zeigen')
  })

  test('ohne Plan steht der Strich vor Verlauf; nie zwei nebeneinander, nie einer am Rand', async ($, on) => {
    world(on)
    expect(await leftRow($)).toEqual(['workmode', 'nightshift', 'dim|', 'grill', 'cleancode', 'reflect', 'humanize', 'adhd', 'dim|', 'filetree', 'dim|', 'privacy', 'vault', 'dim|', 'history'])
  })

  test('Kurzantworten (📖) steht direkt hinter Vermenschlichen und vor dem Strich vor Dateien', async ($, on) => {
    await skillWorld($, on)
    const row = await leftRow($)
    expect(row.indexOf('adhd')).toBe(row.indexOf('humanize') + 1)
    expect(row[row.indexOf('adhd') + 1]).toBe('dim|')
    expect(row[row.indexOf('adhd') + 2]).toBe('filetree')
  })

  test('in der App steht genau ein Strich zwischen 🅰️ und dem Knopf dahinter; keiner am Rand, nie zwei nebeneinander', async ($, on) => {
    await skillWorld($, on)
    const row = await leftRow($)
    const at = row.indexOf('nightshift')
    expect(row.slice(at - 1, at + 3)).toEqual(['workmode', 'nightshift', 'dim|', 'grill'])
    // Nothing before 🅰️ is a bar: the first one stands right behind it.
    expect(row.slice(0, at + 1).filter(one => one === 'dim|')).toEqual([])
    expect(row[0]).not.toBe('dim|')
    expect(row.at(-1)).not.toBe('dim|')
    expect(row.some((one, index) => one === 'dim|' && row[index + 1] === 'dim|')).toBe(false)

    // Off, the Leitstand shows neither 🅰️ nor the buttons after it, and so no bar beside it either.
    await $.command.run({ command: 'leitstand', args: 'off' } as never)
    const off = await leftRow($)
    expect(off).not.toContain('nightshift')
    expect(off[0]).not.toBe('dim|')
    expect(off.at(-1)).not.toBe('dim|')
  })

  test('Dateien (📂) steht hinter 📖 allein zwischen zwei Strichen, schlicht, als Öffner', async ($, on) => {
    await skillWorld($, on)
    const row = await leftRow($)
    const at = row.indexOf('filetree')
    expect(row.slice(at - 2, at + 2)).toEqual(['adhd', 'dim|', 'filetree', 'dim|'])
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const button = (await ui.findAll({ type: 'Button' })).find(one => one.props.key === 'filetree')
    await ui.unmount()
    expect(button?.props.label).toBe('\u{1F4C2}')
    expect(button?.props.variant).toBe('secondary')
  })

  test('ein Druck auf 🧹 hinter ♨️ startet den Skill clean-code; fehlt er, sagt der Leitstand das', async ($, on) => {
    const { state, press } = await skillWorld($, on)
    state.commands = [skill('clean-code')]
    await press('cleancode')
    expect(state.runs).toEqual([{ command: 'clean-code', args: undefined }])
    state.runs.length = 0
    state.commands = []
    await press('cleancode')
    expect(state.runs).toEqual([])
    expect(state.toasts).toContain('clean-code ist in dieser Sitzung nicht verfügbar.')
  })

  test('ein Druck auf 🪞 direkt hinter 🧹 startet die Selbstkritik sofort, ohne Befehl und ohne Prompt', async ($, on) => {
    // Beneath the plugins, before the test first calls $.
    const opened: string[] = []
    on('ui.open', (_, e) => {
      opened.push(String((e as unknown as { id: string }).id))
      return { value: { isPlaced: true } } as never
    })
    const { state, press } = await skillWorld($, on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const button = (await ui.findAll({ type: 'Button' })).find(one => one.props.key === 'reflect')
    await ui.unmount()
    expect(button?.props.label).toBe('\u{1FA9E}')
    expect(button?.props.variant).toBe('secondary')
    const row = await leftRow($)
    expect(row.indexOf('reflect')).toBe(row.indexOf('cleancode') + 1)

    // The Selbstkritik part (once the Reflect mod) answers the press itself: no command, nothing in the prompt.
    state.runHangs = true
    expect(await pressBack(press, 'reflect')).toBe('back')
    expect(state.runs).toEqual([])
    expect(state.filled).toEqual([])
    // Its pane opens with the run in it.
    expect(opened).toContain('leitstand-selbstkritik')
  })

  test('ein Druck auf 📂 öffnet das Fenster Dateien sofort, ohne Befehl', async ($, on) => {
    const opened: { id: string; title: string }[] = []
    on('ui.open', (_, e) => {
      const { id, title } = e as unknown as { id: string; title: string }
      opened.push({ id, title })
      return { value: { isPlaced: true } } as never
    })
    const { state, press } = await skillWorld($, on)
    state.runHangs = true
    expect(await pressBack(press, 'filetree')).toBe('back')
    expect(state.runs).toEqual([])
    expect(state.filled).toEqual([])
    expect(opened.map(one => one.id)).toEqual(['leitstand-dateien'])
    expect(opened[0]?.title.startsWith('Dateien')).toBe(true)
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
    const button = async () => {
      const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
      const found = (await ui.findAll({ type: 'Button' })).find(one => one.props.key === 'adhd')
      await ui.unmount()
      return found
    }
    const variant = async () => (await button())?.props.variant
    const label = async () => (await button())?.props.label
    return { ...world, sent, variant, label }
  }

  test('Kurzantworten aus: 📖, ein Druck startet den Skill i-have-adhd, danach steht 📝, nie hervorgehoben', async ($, on) => {
    const { state, press, variant, label } = await adhdWorld($, on)
    expect(await variant()).toBe('secondary')
    expect(await label()).toBe('\u{1F4D6}')
    state.commands = [skill('i-have-adhd:i-have-adhd')]
    await press('adhd')
    expect(state.runs).toEqual([{ command: 'i-have-adhd:i-have-adhd', args: undefined }])
    expect(await variant()).toBe('secondary')
    expect(await label()).toBe('\u{1F4DD}')
  })

  test('Kurzantworten an: ein Druck sagt „stop adhd mode“ als die Person, danach steht wieder 📖', async ($, on) => {
    const { state, press, sent, variant, label } = await adhdWorld($, on)
    state.commands = [skill('i-have-adhd:i-have-adhd')]
    await press('adhd')
    expect(await variant()).toBe('secondary')
    expect(await label()).toBe('\u{1F4DD}')
    await press('adhd')
    expect(sent).toEqual([{ text: 'stop adhd mode', asUser: true }])
    expect(state.runs).toHaveLength(1)
    expect(await variant()).toBe('secondary')
    expect(await label()).toBe('\u{1F4D6}')
  })

  test('ADHS folgt dem Getippten: /i-have-adhd:i-have-adhd schaltet an, „Stop ADHD mode“ aus', async ($, on) => {
    const { label } = await adhdWorld($, on)
    const composer = { wait: false, origin: { kind: 'composer' } }
    await $.prompt.submit({ text: '/i-have-adhd:i-have-adhd', ...composer } as never)
    expect(await label()).toBe('\u{1F4DD}')
    await $.prompt.submit({ text: '  Stop ADHD mode  ', ...composer } as never)
    expect(await label()).toBe('\u{1F4D6}')
    // The command as the engine reports it counts too.
    await $.prompt.submit({ text: '/i-have-adhd', command: { name: 'i-have-adhd', args: '' }, ...composer } as never)
    expect(await label()).toBe('\u{1F4DD}')
    await $.prompt.submit({ text: 'Zurück zum normal mode, bitte', ...composer } as never)
    expect(await label()).toBe('\u{1F4D6}')
  })

  test('ADHS bleibt aus, wenn der Befehl nur im Eingabefeld wartet', async ($, on) => {
    const { state, press, label } = await adhdWorld($, on)
    // Not listed: the full name has a prefix, so it waits in the prompt.
    state.commands = []
    await press('adhd')
    expect(state.runs).toEqual([])
    expect(state.filled).toEqual(['/i-have-adhd:i-have-adhd'])
    expect(await label()).toBe('\u{1F4D6}')
    // Listed, but the run fails: in the prompt again, still off.
    state.commands = [skill('i-have-adhd:i-have-adhd')]
    state.runFails = true
    await press('adhd')
    expect(state.filled).toHaveLength(2)
    expect(await label()).toBe('\u{1F4D6}')
  })

  test('ADHS nach dem Neuladen wie im Verlauf: Aufruf, dann „normal mode“ aus; nur Aufruf an', async ($, on) => {
    const { state, label } = await adhdWorld($, on)
    const call = { role: 'user' as const, text: '<command-name>/i-have-adhd:i-have-adhd</command-name>', toolUses: [] as never[] }
    // The skill's own text names the words that stop it; it is not the person's.
    const body = { role: 'user' as const, text: 'Base directory for this skill: /x/i-have-adhd\n\nStays on until "stop adhd mode".', toolUses: [] as never[] }
    const answer = { role: 'assistant' as const, text: 'Next: open the file.', toolUses: [] as never[] }

    state.messages = [call, body, answer, { role: 'user', text: 'normal mode', toolUses: [] }, answer]
    await $.session.start({ cwd: '/work', surface: 'desktop' } as never)
    expect(await label()).toBe('\u{1F4D6}')

    state.messages = [call, body, answer]
    await $.session.start({ cwd: '/work', surface: 'desktop' } as never)
    expect(await label()).toBe('\u{1F4DD}')

    state.messages = []
    await $.session.start({ cwd: '/work', surface: 'desktop' } as never)
    expect(await label()).toBe('\u{1F4D6}')
  })

  /** Reads Leitstand's wish to end Autopilot from another plugin: /wish answers with it. */
  const WISH_READER = {
    name: 'wish-reader',
    register(on: On) {
      on('command.run', { command: 'wish' }, async $ => {
        const { value } = (await $.state.get({ plugin: 'leitstand', key: 'autopilotStop' } as never)) as { value?: unknown }
        return { text: String(value ?? null) }
      })
    },
  }
  const wishOf = async ($: Engine) => String((await $.command.run({ command: 'wish', args: '' } as never)).text)
  /** A press that comes back within two seconds of real time (the kit's clock is mocked), or `waits`. */
  const pressBack = (press: (key: string) => Promise<void>, key: string) => {
    const { setTimeout: later } = globalThis as unknown as { setTimeout: (done: () => void, ms: number) => unknown }
    return Promise.race([press(key).then(() => 'back'), new Promise<string>(done => later(() => done('waits'), 2000))])
  }
  /** The Autopilot button's variant in the app. */
  const nightShiftVariant = async ($: Engine) => {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const button = (await ui.findAll({ type: 'Button' })).find(one => one.props.key === 'nightshift')
    await ui.unmount()
    return button?.props.variant
  }
  /** /autopilot as typed, with its argument. */
  const typeNightShift = ($: Engine, args = '') => $.command.run({ command: 'autopilot', args } as never)

  test('der Autopilot steckt im Leitstand: ein Druck auf 🅰️ schaltet ihn sofort an, ohne Befehl, Prompt oder Wunsch', { plugins: [WISH_READER] }, async ($, on) => {
    const { state, press } = await skillWorld($, on)
    state.runHangs = true
    expect(await nightShiftVariant($)).toBe('secondary')
    expect(await pressBack(press, 'nightshift')).toBe('back')
    expect(state.runs).toEqual([])
    expect(state.filled).toEqual([])
    expect(state.toasts.some(one => one.startsWith('Der Autopilot ist an'))).toBe(true)
    expect(await wishOf($)).toBe('null')
    expect(await nightShiftVariant($)).toBe('primary')
  })

  test('Autopilot per Knopf: ein Druck schaltet ihn an und hebt 🅰️ hervor, der nächste aus', async ($, on) => {
    const { state, press } = await skillWorld($, on)
    expect(await nightShiftVariant($)).toBe('secondary')
    await press('nightshift')
    expect(state.runs).toEqual([])
    expect(await nightShiftVariant($)).toBe('primary')
    await press('nightshift')
    expect(await nightShiftVariant($)).toBe('secondary')
  })

  test('Autopilot läuft: ein Druck auf 🅰️ kommt sofort zurück und beendet ihn', async ($, on) => {
    const { state, press } = await skillWorld($, on)
    await typeNightShift($, 'an')
    expect(await nightShiftVariant($)).toBe('primary')
    expect(await pressBack(press, 'nightshift')).toBe('back')
    expect(state.toasts.some(one => one.startsWith('Der Autopilot ist aus'))).toBe(true)
    expect(await nightShiftVariant($)).toBe('secondary')
  })

  test('Autopilot getippt: /autopilot, /autopilot an und aus schalten 🅰️ mit', async ($, on) => {
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

  test('Autopilot fertig: mit der Marke geht 🅰️ aus; angehalten bleibt er hervorgehoben, bis ein Druck oder Esc ihn beendet', async ($, on) => {
    const { press } = await skillWorld($, on)
    const end = (answer: string, reason: string) =>
      $.turn.complete({ answer, durationMs: 1, isAborted: reason === 'aborted', turnId: 't1', reason } as never)

    await typeNightShift($, 'an')
    await end('Uebergabe: alles gebaut.\nAUTOPILOT-FERTIG', 'answer')
    expect(await nightShiftVariant($)).toBe('secondary')

    await typeNightShift($, 'an')
    await end('', 'refusal')
    expect(await nightShiftVariant($)).toBe('primary')
    await press('nightshift')
    expect(await nightShiftVariant($)).toBe('secondary')

    await typeNightShift($, 'an')
    await end('', 'refusal')
    await end('', 'aborted')
    expect(await nightShiftVariant($)).toBe('secondary')
  })

  test('Autopilot nach dem Neuladen: 🅰️ zeigt weiter, was der Autopilot hält', async ($, on) => {
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

  /**
   * A plan that waits for Start in Gruppenarbeit, with Autopilot on or off; what Leitstand sends as the
   * person's words is kept. The turn that laid it out has ended, as Claude stops to wait.
   */
  const nightPlan = async ($: Engine, on: On, isNightShift: boolean) => {
    const clock = world(on)
    const sent: string[] = []
    on('prompt.submit', (_, e) => {
      sent.push(e.text)
      return { text: e.text }
    })
    if (isNightShift) await typeNightShift($)
    await $.command.run({ command: 'leitstand', args: 'arbeitsweise dynamisch' } as never)
    await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
    const planned = await callTool($, { tool: PLAN, steps: ['Lies die Markennotizen', 'Baue die Preistabelle'] })
    await $.turn.complete({ answer: 'Der Plan steht.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    return { clock, sent, planned }
  }
  const START_WORDS = 'Der Plan sieht gut aus. Leg bitte los.'
  const NIGHT_NOTE = 'Der Autopilot startet den Plan in 30 Sekunden von selbst.'
  /** Autopilot's hint beside Start as drawn, marked when dim; none while nothing counts down. */
  const nightHint = async ($: Engine, surface: (typeof SURFACES)[number]) => {
    const ui = await $.ui.mount({ ...BAND, surface })
    const found = (await ui.findAll({ type: 'Text' })).filter(one => one.text.startsWith('startet in'))
    await ui.unmount()
    return found.map(one => `${one.text}${one.props.dimColor ? ' (gedimmt)' : ''}`)
  }
  const bash = ($: Engine) => callTool($, { tool: 'Bash', command: 'ls' })

  test('Autopilot an: ein wartender Plan startet nach 30 s von selbst, genau einmal, und Claude weiß es', async ($, on) => {
    const { clock, sent, planned } = await nightPlan($, on, true)
    expect(String(planned.result)).toContain(
      'warte auf ihre Antwort. Nutze noch keine anderen Tools. Wünscht sie Änderungen, leg den neuen Plan mit plan_steps an. ' +
        'Nenne in deiner Antwort die Schritte nummeriert (1. Lies die Markennotizen; 2. Baue die Preistabelle) und schließ mit dem Satz: ' +
        `Ich warte auf deine Freigabe: Schreib „los“ oder sag, was sich ändern soll. ${NIGHT_NOTE}`,
    )
    expect(String(planned.result).endsWith(NIGHT_NOTE)).toBe(true)
    expect((await bash($)).deny).toBe(
      `Die Person hat den Plan noch nicht freigegeben. Hör auf und warte auf ihre Antwort. Sag in deiner Antwort, dass der Plan wartet und „los“ ihn freigibt. ${NIGHT_NOTE}`,
    )
    await clock.advance(29_000)
    expect(sent).toEqual([])
    await clock.advance(1000)
    expect(sent).toEqual([START_WORDS])
    // Until its turn begins the plan still waits: later ticks send nothing more.
    await clock.advance(60_000)
    expect(sent).toEqual([START_WORDS])
    await $.turn.start({ text: sent[0]!, turnId: 't2' })
    expect((await bash($)).deny).toBeUndefined()
    await clock.advance(60_000)
    expect(sent).toEqual([START_WORDS])
  })

  test('Autopilot nach 25 s aus: der Plan wartet weiter; wieder an, zählt er volle 30 s', async ($, on) => {
    const { clock, sent } = await nightPlan($, on, true)
    await clock.advance(25_000)
    await typeNightShift($, 'aus')
    expect(await nightHint($, 'desktop')).toEqual([])
    expect((await bash($)).deny).not.toContain('Autopilot')
    await clock.advance(60_000)
    expect(sent).toEqual([])

    await typeNightShift($, 'an')
    await clock.advance(10_000)
    expect(sent).toEqual([])
    await clock.advance(30_000)
    expect(sent).toEqual([START_WORDS])
  })

  test('Plan in den 30 s mit Start freigegeben: der Autopilot schickt nichts dazu, auch vor seiner Runde nicht', async ($, on) => {
    const { clock, sent } = await nightPlan($, on, true)
    await clock.advance(10_000)
    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await band.press({ key: 'start' })
    await band.unmount()
    expect(sent).toEqual([START_WORDS])
    expect(await nightHint($, 'desktop')).toEqual([])
    // Claude's turn may still run, so the message waits: the count does not send it a second time.
    await clock.advance(30_000)
    expect(sent).toEqual([START_WORDS])
    await $.turn.start({ text: START_WORDS, turnId: 't2' })
    await clock.advance(60_000)
    expect(sent).toEqual([START_WORDS])
  })

  test('ohne Autopilot wartet der Plan auch nach 60 s auf Start, ohne Hinweis, und Claude liest nichts von ihm', async ($, on) => {
    const { clock, sent, planned } = await nightPlan($, on, false)
    expect(String(planned.result)).not.toContain('Autopilot')
    expect((await bash($)).deny).not.toContain('Autopilot')
    for (const surface of SURFACES) expect(await nightHint($, surface)).toEqual([])
    await clock.advance(60_000)
    expect(sent).toEqual([])
  })

  test('derselbe Plan, noch einmal gemeldet, startet einmal; ein anderer Plan bekommt volle 30 s', async ($, on) => {
    const { clock, sent } = await nightPlan($, on, true)
    const same = ['Lies die Markennotizen', 'Baue die Preistabelle']
    // Laid out again while it counts: the count goes on.
    await clock.advance(20_000)
    await callTool($, { tool: PLAN, steps: same })
    await clock.advance(10_000)
    expect(sent).toEqual([START_WORDS])
    // Again, before the start's turn begins, as Autopilot's rounds bring it: nothing more.
    await callTool($, { tool: PLAN, steps: same })
    await clock.advance(60_000)
    expect(sent).toEqual([START_WORDS])

    await callTool($, { tool: PLAN, steps: [...same, 'Prüfe die Seite'] })
    await clock.advance(25_000)
    expect(sent).toEqual([START_WORDS])
    await clock.advance(5000)
    expect(sent).toEqual([START_WORDS, START_WORDS])
  })

  test('während der Chat verdichtet wird, startet der Autopilot den Plan nicht, gleich danach schon', async ($, on) => {
    let isCompacting = false
    on('state.get', async (_, e, next) => {
      // The read comes back as { value: { value, version } }: the inner value is the one Leitstand reads.
      const result = (await next(e)) as { value: { value?: unknown; version: number } }
      return (isCompacting && (e as { key?: string }).key === 'isCompacting' ? { value: { ...result.value, value: true } } : result) as never
    })
    const { clock, sent } = await nightPlan($, on, true)
    isCompacting = true
    await clock.advance(40_000)
    expect(sent).toEqual([])
    isCompacting = false
    await clock.advance(5000)
    expect(sent).toEqual([START_WORDS])
  })

  for (const surface of SURFACES) {
    test(`Autopilot an: neben Start steht gedimmt, in wie vielen Sekunden der Plan startet (${surface})`, async ($, on) => {
      const { clock } = await nightPlan($, on, true)
      expect(await nightHint($, surface)).toEqual(['startet in 30 s (gedimmt)'])
      // Right beside Start, as the row reads: in the app before it, Start staying last; on the terminal after it.
      const ui = await $.ui.mount({ ...BAND, surface })
      const row = (await ui.findAll({ type: 'Box' })).find(one => one.props.key === 'actions')
      await ui.unmount()
      expect(row?.text ?? '').toContain(surface === 'terminal' ? '▶ Startstartet in 30 s' : 'startet in 30 sStart')
      // On the terminal its room comes from the long labels of the settings and Grill mich: the row still fits.
      if (surface === 'terminal' && row) expect(row.text.length + 2 * (row.children.length - 1) <= BAND.props.bodyColumns).toBe(true)

      // In the steps the band redraws in, while Start holds still.
      await clock.advance(5000)
      expect(await nightHint($, surface)).toEqual(['startet in 25 s (gedimmt)'])
      await clock.advance(20_000)
      expect(await nightHint($, surface)).toEqual(['startet in 5 s (gedimmt)'])
      // Started: nothing counts any more.
      await clock.advance(5000)
      expect(await nightHint($, surface)).toEqual([])
    })
  }

  /** /remote-control as the CLI lists it: its description says Disconnect while connected. */
  const remoteCommand = (isOn: boolean) => ({
    name: 'remote-control',
    description: isOn ? 'Disconnect Remote Control' : 'Control this session from your phone or claude.ai/code',
    source: 'builtin',
  })
  /** A main turn ends, so Leitstand reads Remote Control's state again. */
  const endTurn = ($: Engine) => $.turn.complete({ answer: 'Fertig.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  /** The Remote Control button in the app: its variant and label, or null when there is none. */
  const remoteButton = async ($: Engine) => {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const button = (await ui.findAll({ type: 'Button' })).find(one => one.props.key === 'remote')
    await ui.unmount()
    return button === undefined ? null : { variant: button.props.variant, label: button.props.label }
  }

  test('Remote Control verbunden: 🛜 steht hervorgehoben zwischen dem Strich hinter Filetree und Autopilot', async ($, on) => {
    const { state } = await skillWorld($, on)
    state.commands = [remoteCommand(true), skill('autopilot')]
    await endTurn($)
    expect(await remoteButton($)).toEqual({ variant: 'primary', label: '\u{1F6DC}' })
    const row = await leftRow($)
    expect(row.slice(0, 12)).toEqual(['workmode', 'nightshift', 'dim|', 'grill', 'cleancode', 'reflect', 'humanize', 'adhd', 'dim|', 'filetree', 'dim|', 'remote'])
    expect(row.filter(one => one === 'dim|')).toHaveLength(4)
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
    state.commands = [skill('autopilot')]
    await endTurn($)
    expect(await remoteButton($)).toBeNull()
    const row = await leftRow($)
    expect(row).not.toContain('remote')
    expect(row.slice(0, 12)).toEqual(['workmode', 'nightshift', 'dim|', 'grill', 'cleancode', 'reflect', 'humanize', 'adhd', 'dim|', 'filetree', 'dim|', 'privacy'])
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
    state.commands = [skill('autopilot')]
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

  test('auf dem Desktop steht die Arbeitsweise als Knopf 👨‍💼/👨‍👨‍👧‍👦 unten links vor Verlauf und schaltet um', async ($, on) => {
    world(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const boxes = await ui.findAll({ type: 'Box' })
    const top = JSON.stringify(boxes.find(one => one.props.key === 'header-right') ?? null)
    const bottom = JSON.stringify(boxes.find(one => one.props.key === 'actions') ?? null)
    expect(top).not.toContain('"key":"workmode"')
    expect(bottom).toContain('"key":"workmode"')
    // Erstes Element links, vor Verlauf.
    expect(bottom.indexOf('"key":"history"')).toBeGreaterThan(bottom.indexOf('"key":"workmode"'))
    // Kein Menü mehr, ein Knopf mit dem Zeichen der Arbeitsweise, in keiner hell (Björns Wunsch, 2026-10-27).
    expect((await ui.findAll({ type: 'Select' })).some(one => one.props.key === 'workmode')).toBe(false)
    const knopf = async () => (await ui.findAll({ type: 'Button' })).find(one => one.props.key === 'workmode')
    expect((await knopf())?.props.label).toBe('\u{1F468}\u200D\u{1F4BC}')
    expect((await knopf())?.props.variant).toBe('secondary')
    await ui.press({ key: 'workmode' })
    expect((await knopf())?.props.label).toBe('\u{1F468}\u200D\u{1F468}\u200D\u{1F467}\u200D\u{1F466}')
    expect((await knopf())?.props.variant).toBe('secondary')
    await ui.unmount()

    const asked = await $.command.run({ command: 'leitstand', args: 'arbeitsweise' } as never)
    // Ohne Wert schaltet der Befehl um: von Gruppenarbeit zurück auf Auto-Mode.
    expect(String(asked.text)).toContain('Auto-Modus:')
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

  test('mit Leitstand aus gibt es keinen Umschalter für die Arbeitsweise', async ($, on) => {
    world(on)
    await $.command.run({ command: 'leitstand', args: 'off' } as never)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      const all = [...(await ui.findAll({ type: 'Button' })), ...(await ui.findAll({ type: 'Select' }))]
      expect(all.some(one => one.props.key === 'workmode')).toBe(false)
      await ui.unmount()
    }
    expect((await texts($, 'desktop')).some(one => one.startsWith('Auto-Modus') || one.startsWith('Gruppenarbeit'))).toBe(false)
  })
})

test('über dem Band steht ein Trennstrich: in der App eine dünne Linie, im Terminal eine Reihe Striche', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Lies die Markennotizen', 'Baue die Preistabelle'] })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svgs = await band.findAll({ type: 'Svg' })
  const alts = svgs.map(one => String(one.props.alt))
  await band.unmount()
  expect(alts[0]).toBe('Trennlinie')
  // 7 px Luft über und unter der Linie: ein Knopf daneben ragt 4 px hinein und verdeckt sie nicht.
  expect(svgs[0]?.props.height).toBe(15)
  expect(String(svgs[0]?.props.source)).toContain('y="7"')
  expect((await texts($, 'terminal'))[0]).toBe('─'.repeat(80))

  // Auch mit Leitstand aus steht der Strich über der kurzen Zeile.
  await $.command.run({ command: 'leitstand', args: 'off' } as never)
  expect((await texts($, 'terminal'))[0]).toBe('─'.repeat(80))
  expect(await texts($, 'desktop')).toContain('[Trennlinie]')
})

describe('Ansicht Minimal', () => {
  const minimal = async ($: Engine) => {
    const settings = await $.ui.mount({
      plugin: 'leitstand',
      component: 'Pane',
      requestId: 'leitstand-settings',
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
      if (surface === 'desktop') expect(shown).toContain('\u{1F468}\u200D\u{1F4BC}')
      expect(line).toContain(surface === 'terminal' ? 'Leitstand: Minimal' : 'Minimal ▾')
    }
  })

  test('wartet der Plan auf Freigabe, sagt die Zeile das und hat Start; ohne Plan sagt sie Bereit', async ($, on) => {
    world(on)
    await minimal($)
    expect((await texts($, 'desktop')).join('\n')).toContain('Bereit')

    await $.command.run({ command: 'leitstand', args: 'arbeitsweise dynamisch' } as never)
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
      plugin: 'leitstand',
      component: 'Pane',
      requestId: 'leitstand-settings',
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
    expect(shown.order).toEqual(['Select', '\u2753', GEAR_LABEL])
    await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Lies die Notizen', 'Baue die Tabelle'] })
    shown = await top()
    expect(shown.order).toEqual(['Select', '\u2753', GEAR_LABEL])
    expect(shown.actions).toContain('Verlauf')
    expect(shown.actions).not.toContain('Einstellungen')
    expect(shown.actions).not.toContain('"key":"settings"')

    await $.command.run({ command: 'leitstand', args: 'details on' } as never)
    const settings = await $.ui.mount({
      plugin: 'leitstand',
      component: 'Pane',
      requestId: 'leitstand-settings',
      surface: 'terminal',
      props: { title: 'Settings', isFocused: true, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    await settings.press({ key: 'view-minimal' })
    await settings.unmount()
    expect((await top()).order).toEqual(['Select', '\u2753', GEAR_LABEL])

    await $.command.run({ command: 'leitstand', args: 'off' } as never)
    expect((await top()).order).toEqual(['Select', '\u2753', GEAR_LABEL])

    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await band.press({ key: 'settings' })
    await band.unmount()
    expect(opened).toEqual(['leitstand-settings'])
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
      'API_KEY=old-value\nDB_PASSWORD="letmein!"\n\n# Aus dem Chat übernommen vom Leitstand am 17.10.2026\n' +
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
    const ui = await $.ui.mount({ plugin: 'leitstand', surface: 'desktop', component, props } as never)
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
    // Unter Linux ist C:\work\shop kein absoluter Pfad, die Engine setzt den Mod-Ordner davor: der faellt weg.
    const norm = (path: string) => path.replace(/\\/g, '/').replace(/^.*\/(?=[A-Za-z]:\/)/, '')
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
    const off = await $.command.run({ command: 'leitstand', args: 'privacy off' } as never)
    expect(JSON.stringify(off)).toContain('Verdecken aus')
    expect(await bandButton($, 'privacy')).toBe(OPEN_LOCK)
    expect(await shows()).toEqual(visible)
    const settings = await $.ui.mount({
      plugin: 'leitstand',
      component: 'Pane',
      requestId: 'leitstand-settings',
      surface: 'terminal',
      props: { title: 'Settings', isFocused: true, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
    } as never)
    expect((await settings.findAll({ type: 'Text' })).map(one => one.text)).toContain('Verdecken')
    await settings.press({ key: 'privacy-on' })
    await settings.unmount()
    expect(await bandButton($, 'privacy')).toBe(LOCK)
    expect(await shows()).toEqual(hidden)
    await $.command.run({ command: 'leitstand', args: 'privacy off' } as never)
    await $.command.run({ command: 'leitstand', args: 'privacy on' } as never)
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
    await $.command.run({ command: 'leitstand', args: 'privacy off' } as never)
    expect(await privacy()).toEqual(open)
    await $.command.run({ command: 'leitstand', args: 'privacy on' } as never)
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

  test('🛡️ wartet beim ersten Druck, schreibt beim zweiten die .env und verdichtet mit Platzhaltern', VIEW_SIMPLE, async ($, on) => {
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
    expect(env.startsWith('DB_PASSWORD=letmein!\nGITHUB_TOKEN=old\n\n# Aus dem Chat übernommen vom Leitstand am ')).toBe(true)
    expect(env).toContain(`GITHUB_TOKEN_2=${GITHUB}\n`)
    expect(env).toContain(`KARTENNUMMER="${CARD}"\n`)
    expect(env).not.toContain('jane@example.com')
    expect(env.match(/DB_PASSWORD=/g)).toHaveLength(1)
    expect(state.files.get('C:/work/shop/.gitignore')).toBe('.env\n')
    expect(state.toasts).toContain(
      '3 Geheimnisse in die .env übernommen (DB_PASSWORD, GITHUB_TOKEN_2, KARTENNUMMER). Der Chat wird jetzt verdichtet; danach kennt Claude nur noch Platzhalter.',
    )
    // The compaction is told the placeholders, never the values; a checkpoint is the Statistik mod's, not the shield's.
    expect(state.forks).toEqual([])
    expect(state.compacts).toHaveLength(1)
    for (const name of ['DB_PASSWORD', 'GITHUB_TOKEN_2', 'KARTENNUMMER']) expect(state.compacts[0]).toContain(`\${${name}}`)
    expect(state.store.get('checkpoint:chat-1')).toBeUndefined()
    for (const value of ['letmein!', GITHUB, CARD]) expect(state.compacts[0]).not.toContain(value)
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
    expect(state.compacts).toHaveLength(1)
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

  test('/leitstand:geheimnisse-sichern: ohne ja passiert nichts, mit ja wie 🛡️ beim zweiten Druck', VIEW_SIMPLE, async ($, on) => {
    const state = await vaultWorld($, on, { messages: CHAT, files: { 'C:\\work\\shop\\.git\\HEAD': 'ref' } })
    const run = async (args: string) => String((await $.command.run({ command: 'leitstand:geheimnisse-sichern', args } as never)).text)
    const { setTimeout: later } = globalThis as unknown as { setTimeout: (done: () => void, ms: number) => unknown }
    const asked = await run('')
    expect(asked.endsWith('\nZum Ausführen: /leitstand:geheimnisse-sichern ja')).toBe(true)
    await state.clock.advance(1)
    await new Promise<void>(done => later(done, 20))
    expect(state.writes).toEqual([])
    expect(state.compacts).toEqual([])

    expect(await run('ja')).toBe('Verschiebe die Passwörter und Schlüssel dieses Chats in die .env und räume den Chat danach auf.')
    await state.clock.advance(1)
    await new Promise<void>(done => later(done, 50))
    expect(state.files.get('C:/work/shop/.env')).toContain(`GITHUB_TOKEN=${GITHUB}\n`)
    expect(state.compacts).toHaveLength(1)
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
  await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
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
    await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
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

  // A new plan waits for Start while a helper of the one before still runs (group work): the band holds still there too.
  test(`a plan waiting for Start holds still while a helper runs, and one press starts it (${surface})`, async ($, on) => {
    const clock = world(on)
    on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'w1' }) as never)
    const sent: string[] = []
    on('prompt.submit', (_, e) => {
      sent.push(e.text)
      return { text: e.text }
    })
    let ticks = 0
    on('state.set', (_, e, next) => {
      if ((e as { key?: string }).key === 'tick') ticks += 1
      return next(e)
    })
    await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
    await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
    await $.turn.complete({ answer: 'Der Plan steht.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    await $.turn.start({ text: START_TEXT, turnId: 't2' })
    await $.agent.spawn({
      tool_use_id: 'tu1',
      prompt: 'Look at the settings',
      description: 'Look at the settings',
      subagentType: 'leitstand:schwer',
      provider: { plugin: 'leitstand', tier: 'user' },
      parentModel: 'claude-opus-5-5',
      background: true,
      fork: false,
    } as never)
    await $.turn.complete({ answer: 'Der Arbeiter läuft.', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
    await $.turn.start({ text: 'Fix the autopilot too', turnId: 't3' })
    const planned = await callTool($, { tool: PLAN, steps: ['Find the bug', 'Fix the bug', 'Check it'] })
    expect(String(planned.result)).toContain('warte auf ihre Antwort')
    await $.turn.complete({ answer: 'Gib den Plan mit Start frei.', durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer' })

    const before = ticks
    await clock.advance(2000)
    expect(ticks).toBe(before)

    const band = await $.ui.mount({ ...BAND, surface })
    await band.press({ key: 'start' })
    await band.unmount()
    await clock.advance(10)
    expect(sent).toEqual([START_TEXT])
  })

  // Start pressed while Claude still writes: the message waits for its turn, and so did the press. Pressed again and
  // again, it sends once.
  test(`a second press on Start while the first waits for its turn sends nothing more (${surface})`, async ($, on) => {
    const clock = world(on)
    const sent: string[] = []
    on('prompt.submit', async (_, e) => {
      sent.push(e.text)
      await clock.sleep(15_000)
      return { text: e.text }
    })
    await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
    await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
    const band = await $.ui.mount({ ...BAND, surface })
    const first = band.press({ key: 'start' })
    await clock.advance(3000)
    const second = band.press({ key: 'start' })
    await clock.advance(3000)
    const third = band.press({ key: 'start' })
    await clock.advance(20_000)
    await Promise.all([first, second, third])
    await band.unmount()
    expect(sent).toEqual([START_TEXT])
  })

  test(`while its message is on its way, Start reads Startet gleich… and a press on it sends nothing (${surface})`, async ($, on) => {
    const clock = world(on)
    const sent: string[] = []
    on('prompt.submit', async (_, e) => {
      sent.push(e.text)
      await clock.sleep(15_000)
      return { text: e.text }
    })
    await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
    await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
    const startButton = async () => {
      const ui = await $.ui.mount({ ...BAND, surface })
      const found = (await ui.findAll({ type: 'Button' })).find(one => one.props.key === 'start')
      await ui.unmount()
      return found
    }
    const band = await $.ui.mount({ ...BAND, surface })
    await band.press({ key: 'start' })
    await band.unmount()
    await clock.advance(10)
    const starting = await startButton()
    expect(starting?.text).toContain('Startet gleich…')
    if (surface === 'desktop') expect(starting?.props.variant).toBe('secondary')
    const again = await $.ui.mount({ ...BAND, surface })
    await again.press({ key: 'start' })
    await again.unmount()
    await clock.advance(10)
    expect(sent).toEqual([START_TEXT])

    // Its turn begins: the plan runs and the button is gone.
    await $.turn.start({ text: START_TEXT, turnId: 't2' })
    await clock.advance(20_000)
    expect(await startButton()).toBeUndefined()
  })

  test(`a Start a hook drops reads Start again, and the next press sends (${surface})`, async ($, on) => {
    // The world beneath, as world() lays it, with the toasts kept.
    const clock = mock.clock(on, { now: 1_000_000 })
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
    let drops = 1
    on('prompt.submit', (_, e) => {
      sent.push(e.text)
      if (drops > 0) {
        drops -= 1
        return { drop: 'nicht jetzt' } as never
      }
      return { text: e.text }
    })
    await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
    await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
    await $.turn.complete({ answer: 'Der Plan steht.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    const press = async () => {
      const band = await $.ui.mount({ ...BAND, surface })
      await band.press({ key: 'start' })
      await band.unmount()
      await clock.advance(10)
    }
    await press()
    expect(sent).toEqual([START_TEXT])
    // Dropped counts as not sent: the person reads what to do instead.
    expect(toasts).toContain('Starten geht gerade nicht. Schreib: los')
    const labels = (await texts($, surface)).join('\n')
    expect(labels).not.toContain('Startet gleich…')
    expect(labels).toMatch(/^(\S+ )?Start$/m)
    await press()
    expect(sent).toEqual([START_TEXT, START_TEXT])
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
    await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
    await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
    await $.turn.complete({ answer: 'Der Plan steht.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    return { sent, toasts, during, state }
  }
  const viewMinimal = async ($: Engine) => {
    const settings = await $.ui.mount({
      plugin: 'leitstand',
      component: 'Pane',
      requestId: 'leitstand-settings',
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

  test('eine Start-Nachricht, die beim Verdichten verloren geht, gibt Start wieder frei', async ($, on) => {
    const clock = world(on)
    const sent: string[] = []
    on('prompt.submit', async (_, e) => {
      sent.push(e.text)
      // The first waits in the queue, which the compaction loses: it never returns.
      if (sent.length === 1) await new Promise(() => undefined)
      return { text: e.text }
    })
    on('session.compact', () => ({ messages: [{ role: 'user', text: 'Zusammenfassung.', toolUses: [] }] }) as never)
    await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
    await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
    await $.turn.complete({ answer: 'Der Plan steht.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    const press = async () => {
      const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
      await band.press({ key: 'start' })
      await band.unmount()
      await clock.advance(10)
    }
    await press()
    for (const surface of SURFACES) expect((await texts($, surface)).join('\n')).toContain('Startet gleich…')

    await $.session.compact({ trigger: 'manual', messages: COMPACT_MESSAGES } as never)
    for (const surface of SURFACES) {
      const after = (await texts($, surface)).join('\n')
      expect(after).not.toContain('Startet gleich…')
      expect(after).toMatch(START_LINE)
    }
    await press()
    expect(sent).toEqual([START_TEXT, START_TEXT])
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
  await $.command.run({ command: 'leitstand', args: 'arbeitsweise dynamisch' } as never)
  await answered($, 't1', 'a) eine neue Seite, b) die alte umbauen. Welche Variante meinst du?')
  await $.turn.start({ text: SAID_DO[0], turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  expect((await texts($, 'terminal')).join('\n')).not.toContain('▶ Start')
})

test('in Gruppenarbeit, a new request out of the blue still gets its plan shown first', async ($, on) => {
  world(on)
  await $.command.run({ command: 'leitstand', args: 'arbeitsweise dynamisch' } as never)
  await answered($, 't1', 'Die Startseite steht.')
  await $.turn.start({ text: 'Baue mir eine Preisseite.', turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
  expect((await texts($, 'terminal')).join('\n')).toContain('▶ Start')
})

test('with Approve the plan first on, "Nimm b." after "Sag mir, welche du willst." starts the plan Claude makes for it', async ($, on) => {
  world(on)
  await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
  await answered($, 't1', 'a) schlicht, b) mit Tabelle. Sag mir, welche du willst.')
  await $.turn.start({ text: 'Nimm b.', turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
})

test("with Approve the plan first on, a question back to Claude's choice starts nothing", async ($, on) => {
  world(on)
  await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
  await answered($, 't1', 'a) schlicht, b) mit Tabelle. Sag mir, welche du willst.')
  await $.turn.start({ text: 'Was kostet b?', turnId: 't2' })
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
})

test('with Approve the plan first on, "Nimm b." with no question before it starts no plan Claude makes for it', async ($, on) => {
  world(on)
  await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'approve on' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'arbeitsweise dynamisch' } as never)
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

/** Freshly loaded in Gruppenarbeit: the transcript holds `rows`; counts how often Leitstand reads it. */
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
  await $.command.run({ command: 'leitstand', args: 'arbeitsweise dynamisch' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'arbeitsweise dynamisch' } as never)
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
  await $.command.run({ command: 'leitstand', args: 'arbeitsweise dynamisch' } as never)
  await $.turn.start({ text: RESTARTED, turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Measure the lines', 'Report the widths'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
})

test('nach einer Runde mit turn.complete liest Leitstand den Verlauf nicht mehr nach', async ($, on) => {
  const reads = reloaded(on, [{ role: 'assistant', text: 'Soll ich das umsetzen?', toolUses: [] }])
  await $.command.run({ command: 'leitstand', args: 'arbeitsweise dynamisch' } as never)
  await $.turn.start({ text: 'Wie bauen wir die Preisseite?', turnId: 't1' })
  expect(reads.count).toBe(1)
  await $.turn.complete({ answer: 'Die Preisseite steht.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.turn.start({ text: DO_A, turnId: 't2' })
  expect(reads.count).toBe(1)
  await callTool($, { tool: PLAN, steps: ['Write the page', 'Check it'] })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toContain('noch nicht freigegeben')
})

describe('Einstellungen je Chat', () => {
  const START = { cwd: '/work', surface: 'terminal' } as never
  const SETTINGS = {
    plugin: 'leitstand',
    component: 'Pane',
    requestId: 'leitstand-settings',
    props: { title: 'Settings', isFocused: true, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  } as const
  // Each setting, as the settings panel shows it picked: its group there, and how the pick reads as the setting's value.
  const READS: Record<string, [string, (picked: string) => unknown]> = {
    glanceEnabled: ['view', picked => picked !== 'off'],
    detailLevel: ['view', picked => picked],
    workMode: ['mode', picked => picked],
    soundMode: ['sound', picked => picked],
    isNoticing: ['notice', picked => picked === 'on'],
    showsOthers: ['others', picked => picked === 'on'],
    isCalm: ['calm', picked => picked === 'on'],
    isGuarded: ['guard', picked => picked === 'on'],
    masksPrivate: ['privacy', picked => picked === 'on'],
    approvePlan: ['approve', picked => picked === 'on'],
    shipsOnGithub: ['ship', picked => picked === 'on'],
  }
  /** A setting as this chat has it, read from the settings panel. */
  const stateOf = async ($: Engine, key: string) => {
    const [group, reads] = READS[key]!
    const ui = await $.ui.mount({ ...SETTINGS, surface: 'terminal' })
    const buttons = await ui.findAll({ type: 'Button' })
    await ui.unmount()
    const picked = buttons.find(one => String(one.props.key).startsWith(`${group}-`) && one.props.variant === 'primary')
    return reads(String(picked?.props.key).slice(group.length + 1))
  }
  /** Opens a chat: the id the session reports, then the session's start. */
  const openChat = async ($: Engine, session: { id: string }, id: string) => {
    session.id = id
    await $.session.start(START)
  }
  const settingsPress = async ($: Engine, key: string) => {
    const ui = await $.ui.mount({ ...SETTINGS, surface: 'terminal' })
    await ui.press({ key })
    await ui.unmount()
  }
  const settingsTexts = async ($: Engine) => {
    const ui = await $.ui.mount({ ...SETTINGS, surface: 'terminal' })
    const found = [...(await ui.findAll({ type: 'Text' })), ...(await ui.findAll({ type: 'Button' }))].map(one => one.text).join('\n')
    await ui.unmount()
    return found
  }
  const DAY = 24 * 60 * 60_000
  const oldGlobal = (store: Map<string, unknown>) => [...store.keys()].filter(key => key.startsWith('glance') && key !== 'glanceTour')

  test('jede Einstellung, in einem Chat geändert, bleibt in diesem Chat: ein anderer startet mit dem Standard', OTHERS_ON, async ($, on) => {
    const { store, session } = resumeWorld(on)
    const cases: [string, string, unknown, unknown][] = [
      ['off', 'glanceEnabled', false, true],
      ['details on', 'detailLevel', 'detailed', 'simple'],
      ['arbeitsweise dynamisch', 'workMode', 'dynamisch', 'auto'],
      ['sound on', 'soundMode', 'chime', 'off'],
      ['notify on', 'isNoticing', true, false],
      ['others off', 'showsOthers', false, true],
      ['calm on', 'isCalm', true, false],
      ['guard off', 'isGuarded', false, true],
      ['privacy off', 'masksPrivate', false, true],
      ['approve on', 'approvePlan', true, false],
      ['ship on', 'shipsOnGithub', true, false],
    ]
    for (const [args, key, changed, standard] of cases) {
      await openChat($, session, 'chat-1')
      expect(await stateOf($, key)).toEqual(standard)
      await $.command.run({ command: 'leitstand', args } as never)
      expect(await stateOf($, key)).toEqual(changed)
      // Another chat, opened after the change, starts with the default.
      await openChat($, session, 'chat-2')
      expect(await stateOf($, key)).toEqual(standard)
      // The first chat, resumed, has its own value again.
      await openChat($, session, 'chat-1')
      expect(await stateOf($, key)).toEqual(changed)
      expect(oldGlobal(store)).toEqual([])
      // Back to the default in chat-1 for the next setting.
      await settingsPress($, 'reset')
      expect(store.has('settings:chat-1')).toBe(false)
    }
    expect(store.has('settings:chat-2')).toBe(false)
  })

  test('im Desktop ändern 👨‍👨‍👧‍👦 und 🔒 nur diesen Chat', VIEW_SIMPLE, async ($, on) => {
    // Past the welcome, so the band shows its buttons.
    const { store, session } = resumeWorld(on, { glanceTour: true })
    await openChat($, session, 'chat-1')
    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await band.press({ key: 'workmode' })
    await band.press({ key: 'privacy' })
    await band.unmount()
    expect(await stateOf($, 'workMode')).toBe('dynamisch')
    expect(await stateOf($, 'masksPrivate')).toBe(false)
    expect((store.get('settings:chat-1') as { values: unknown }).values).toEqual({ workMode: 'dynamisch', mask: false })

    await openChat($, session, 'chat-2')
    expect(await stateOf($, 'workMode')).toBe('auto')
    expect(await stateOf($, 'masksPrivate')).toBe(true)
    expect(store.has('settings:chat-2')).toBe(false)
    expect(oldGlobal(store)).toEqual([])
  })

  test(
    'ein neuer Chat startet mit dem Standard aus dem Einstellungsmenü; die eigene Änderung geht vor',
    { options: { ansicht: 'minimal', arbeitsweise: 'gruppenarbeit', verdecken: false } },
    async ($, on) => {
      const { session } = resumeWorld(on)
      await openChat($, session, 'chat-1')
      expect(await stateOf($, 'detailLevel')).toBe('minimal')
      expect(await stateOf($, 'glanceEnabled')).toBe(true)
      expect(await stateOf($, 'workMode')).toBe('dynamisch')
      expect(await stateOf($, 'masksPrivate')).toBe(false)
      await $.command.run({ command: 'leitstand', args: 'privacy on' } as never)
      await $.command.run({ command: 'leitstand', args: 'arbeitsweise auto' } as never)

      await openChat($, session, 'chat-2')
      expect(await stateOf($, 'masksPrivate')).toBe(false)
      expect(await stateOf($, 'workMode')).toBe('dynamisch')
      await openChat($, session, 'chat-1')
      expect(await stateOf($, 'masksPrivate')).toBe(true)
      expect(await stateOf($, 'workMode')).toBe('auto')
      expect(await stateOf($, 'detailLevel')).toBe('minimal')
    },
  )

  test('Zurücksetzen nimmt nur die Werte dieses Chats zurück', VIEW_SIMPLE, async ($, on) => {
    const { store, session } = resumeWorld(on)
    await openChat($, session, 'chat-2')
    await $.command.run({ command: 'leitstand', args: 'calm on' } as never)
    await openChat($, session, 'chat-1')
    await $.command.run({ command: 'leitstand', args: 'sound on' } as never)
    await $.command.run({ command: 'leitstand', args: 'details on' } as never)
    expect(store.has('settings:chat-1')).toBe(true)

    await settingsPress($, 'reset')
    expect(store.has('settings:chat-1')).toBe(false)
    expect(store.has('settings:chat-2')).toBe(true)
    expect(await stateOf($, 'soundMode')).toBe('off')
    expect(await stateOf($, 'detailLevel')).toBe('simple')
    await openChat($, session, 'chat-2')
    expect(await stateOf($, 'isCalm')).toBe(true)
  })

  test('scheitert das Speichern, behält ein Neuladen die Werte des Chats', VIEW_SIMPLE, async ($, on) => {
    const { store, session, fails } = resumeWorld(on)
    await openChat($, session, 'chat-1')
    fails.set = /^settings:/
    await $.command.run({ command: 'leitstand', args: 'calm on' } as never)
    await $.command.run({ command: 'leitstand', args: 'details on' } as never)
    expect(store.has('settings:chat-1')).toBe(false)
    // A reload starts the module afresh; this chat's state still holds its values.
    await $.session.start(START)
    expect(await stateOf($, 'isCalm')).toBe(true)
    expect(await stateOf($, 'detailLevel')).toBe('detailed')
  })

  test('nach /clear behält der Chat seine Werte, nach der nächsten Runde unter der neuen Chat-Id', VIEW_SIMPLE, async ($, on) => {
    const { store, session } = resumeWorld(on)
    on('session.end', () => ({ sessionId: 'chat-1' }) as never)
    await openChat($, session, 'chat-1')
    await $.command.run({ command: 'leitstand', args: 'sound voice' } as never)
    await $.session.end({ reason: 'clear', sessionId: 'chat-1' } as never)
    session.id = 'chat-3'
    await $.turn.start({ text: 'Fix the footer', turnId: 't2' })
    // A change after /clear lands under the new id too, after the carried values.
    await $.command.run({ command: 'leitstand', args: 'calm on' } as never)
    expect(await stateOf($, 'soundMode')).toBe('voice')
    expect((store.get('settings:chat-3') as { values: unknown }).values).toEqual({ sound: 'voice', calm: true })
    expect((store.get('settings:chat-1') as { values: unknown }).values).toEqual({ sound: 'voice' })
  })

  test('alte globale glance-Schlüssel werden nicht mehr gelesen und bleiben stehen; die Begrüßung bleibt aus', VIEW_SIMPLE, async ($, on) => {
    const old = { glanceSound: 'chime', glanceDetail: 'detailed', glanceWorkMode: 'dynamisch', glanceCalm: true, glanceEnabled: false }
    const { store, session } = resumeWorld(on, old)
    await openChat($, session, 'chat-1')
    expect(await stateOf($, 'soundMode')).toBe('off')
    expect(await stateOf($, 'detailLevel')).toBe('simple')
    expect(await stateOf($, 'workMode')).toBe('auto')
    expect(await stateOf($, 'isCalm')).toBe(false)
    expect(await stateOf($, 'glanceEnabled')).toBe(true)
    for (const [key, value] of Object.entries(old)) expect(store.get(key)).toEqual(value)
    expect(store.has('settings:chat-1')).toBe(false)
    // Someone with old settings already knows their way: no welcome.
    expect(store.get('glanceTour')).toBe(true)
    expect((await texts($, 'terminal', 120)).join('\n')).not.toContain('Willkommen im Leitstand')
  })

  test('Einstellungen und Sicherungspunkte anderer Chats gehen nach 30 Tagen, die eigenen bleiben', VIEW_SIMPLE, async ($, on) => {
    const long = 1_000_000 - 31 * DAY
    const { store, session } = resumeWorld(on, {
      'settings:chat-old': { at: long, values: { calm: true } },
      'checkpoint:chat-old': { at: long, note: 'Sicherungspunkt: alt' },
      'settings:chat-new': { at: 1_000_000 - DAY, values: { calm: true } },
      'settings:chat-1': { at: long, values: { sound: 'chime' } },
      'checkpoint:chat-1': { at: long, note: 'Sicherungspunkt: meiner' },
    })
    await openChat($, session, 'chat-1')
    expect(store.has('settings:chat-old')).toBe(false)
    expect(store.has('checkpoint:chat-old')).toBe(false)
    expect(store.has('settings:chat-new')).toBe(true)
    expect(store.has('checkpoint:chat-1')).toBe(true)
    // Its own settings are in use again: kept for another 30 days.
    expect((store.get('settings:chat-1') as { at: number }).at).toBe(1_000_000)
    expect(await stateOf($, 'soundMode')).toBe('chime')
    expect(store.get('settingsTidiedAt')).toBe(1_000_000)

    // At most once a day.
    store.set('settings:chat-older', { at: long, values: {} })
    await openChat($, session, 'chat-2')
    expect(store.has('settings:chat-older')).toBe(true)
  })

  test('in der Gruppenarbeit steht Plan zuerst freigeben fest auf An; ein Druck ändert und speichert nichts', VIEW_SIMPLE, async ($, on) => {
    const { store, session } = resumeWorld(on)
    await openChat($, session, 'chat-1')
    await $.command.run({ command: 'leitstand', args: 'arbeitsweise dynamisch' } as never)
    const shown = await settingsTexts($)
    expect(shown).toContain('An (in der Gruppenarbeit immer)')
    expect(shown).toContain('Änderungen gelten sofort, nur in diesem Chat. Den Standard für neue Chats stellst du im Einstellungsmenü ein.')
    await settingsPress($, 'approve-off')
    await settingsPress($, 'approve-on')
    expect((store.get('settings:chat-1') as { values: unknown }).values).toEqual({ workMode: 'dynamisch' })

    // In Auto-Mode the row switches as before; the presses in Gruppenarbeit left it off.
    await $.command.run({ command: 'leitstand', args: 'arbeitsweise auto' } as never)
    expect(await settingsTexts($)).not.toContain('in der Gruppenarbeit immer')
    expect(await stateOf($, 'approvePlan')).toBe(false)
    await settingsPress($, 'approve-on')
    expect(await stateOf($, 'approvePlan')).toBe(true)
    expect((store.get('settings:chat-1') as { values: unknown }).values).toEqual({ workMode: 'auto', approve: true })
  })

  test('die Menüwerte werden zu den Einstellungen eines neuen Chats', () => {
    expect(defaultSettings({})).toEqual(FACTORY_SETTINGS)
    expect(FACTORY_SETTINGS).toEqual({
      enabled: true, detail: 'minimal', workMode: 'auto', sound: 'off', notice: false, others: false,
      calm: false, guard: true, mask: true, approve: false, ship: false,
    })
    expect(defaultSettings({ ansicht: 'einfach' })).toMatchObject({ enabled: true, detail: 'simple' })
    expect(defaultSettings({ ansicht: 'ausfuehrlich' })).toMatchObject({ enabled: true, detail: 'detailed' })
    expect(defaultSettings({ ansicht: 'aus' })).toMatchObject({ enabled: false, detail: 'simple' })
    expect(defaultSettings({ ansicht: 'bunt' })).toMatchObject({ enabled: true, detail: 'minimal' })
    expect(defaultSettings({ arbeitsweise: 'gruppenarbeit' }).workMode).toBe('dynamisch')
    expect(defaultSettings({ toene: 'signalton' }).sound).toBe('chime')
    expect(defaultSettings({ toene: 'stimme' }).sound).toBe('voice')
    expect(
      defaultSettings({
        benachrichtigungen: true, andereChats: true, ruhemodus: true, passwortschutz: false, verdecken: false, planFreigeben: true, githubAbschluss: true,
      }),
    ).toMatchObject({ notice: true, others: true, calm: true, guard: false, mask: false, approve: true, ship: true })
    expect(defaultSettings({ ruhemodus: 'ja' }).calm).toBe(false)
  })

  test('eigene Werte gehen vor, ein Wert vom falschen Typ gilt als ungesetzt', () => {
    expect(chatSettings(FACTORY_SETTINGS, { calm: true, detail: 'detailed' })).toEqual({ ...FACTORY_SETTINGS, calm: true, detail: 'detailed' })
    expect(chatSettings(FACTORY_SETTINGS, { calm: 'yes', detail: 'huge', sound: 3, workMode: 'dynamisch' })).toEqual({ ...FACTORY_SETTINGS, workMode: 'dynamisch' })
    expect(chatSettings(FACTORY_SETTINGS, null)).toEqual(FACTORY_SETTINGS)
    expect(ownValues({ at: 1, values: { others: false, mask: 'no', extra: 1 } })).toEqual({ others: false })
    expect(ownValues(undefined)).toEqual({})
    expect(ownValues({ at: 1 })).toEqual({})
    expect(ownValues('settings')).toEqual({})
  })

  test('veraltet sind nur fremde settings:- und checkpoint:-Schlüssel, älter als 30 Tage', () => {
    const now = 100 * DAY
    const saved: [string, unknown][] = [
      ['settings:a', { at: now - 31 * DAY }],
      ['checkpoint:a', { at: now - 31 * DAY, note: 'x' }],
      ['settings:b', { at: now - 29 * DAY }],
      ['settings:me', { at: 0 }],
      ['checkpoint:me', { at: 0 }],
      ['settings:broken', 'x'],
      ['resume:a', { at: 0 }],
    ]
    expect(staleSettingsKeys(saved, now, 'me')).toEqual(['settings:a', 'checkpoint:a', 'settings:broken'])
    expect(staleSettingsKeys(saved, now, null)).toEqual(['settings:a', 'checkpoint:a', 'settings:me', 'checkpoint:me', 'settings:broken'])
    expect(SETTINGS_PREFIX).toBe('settings:')
    expect(SETTINGS_DAYS).toBe(30)
  })
})

describe('Vorsatz vor Befehlsantworten', () => {
  const setup = (on: On) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    on('ui.toast', () => ({ value: undefined }) as never)
  }
  const CALM = 'Ruhemodus ist an: Nichts bewegt sich, der Status steht fett.'

  test('die eigene Antwort nennt den Leitstand am Ende statt davor, die Antwort selbst bleibt ohne', async ($, on) => {
    setup(on)
    const sitzung = mock.session(on)
    const result = await $.command.run({ command: 'leitstand', args: 'calm on' } as never)
    expect(result.text).toBe(CALM)
    await append($, `<local-command-stdout>leitstand: ${CALM}</local-command-stdout>`)
    expect(rows(sitzung)).toEqual([`<local-command-stdout>${CALM} (gemeldet vom Mod Leitstand)</local-command-stdout>`])
  })

  test('bei der eigenen Antwort bleiben die Namen anderer Mods davor stehen', async ($, on) => {
    setup(on)
    const sitzung = mock.session(on)
    await $.command.run({ command: 'leitstand', args: 'calm on' } as never)
    await append($, `<local-command-stdout>leitstand+prompt-upgrade: ${CALM}</local-command-stdout>`)
    expect(rows(sitzung)).toEqual([`<local-command-stdout>prompt-upgrade: ${CALM} (gemeldet vom Mod Leitstand)</local-command-stdout>`])
  })

  test('bei einem fremden Befehl streicht der Leitstand nur seinen Namen, ohne Herkunft', async ($, on) => {
    setup(on)
    const sitzung = mock.session(on)
    await $.command.run({ command: 'leitstand', args: 'calm on' } as never)
    await append($, `<local-command-stdout>leitstand: ${CALM}</local-command-stdout>`)
    await append($, '<local-command-stdout>leitstand+prompt-upgrade: Dein Prompt ist jetzt klarer.</local-command-stdout>')
    await append($, '<local-command-stdout>leitstand: Fremde Antwort.</local-command-stdout>')
    expect(rows(sitzung).slice(1)).toEqual(['<local-command-stdout>prompt-upgrade: Dein Prompt ist jetzt klarer.</local-command-stdout>', '<local-command-stdout>Fremde Antwort.</local-command-stdout>'])
  })

  test('Zeilen ohne den Namen des Leitstands bleiben, wie sie sind', async ($, on) => {
    setup(on)
    const sitzung = mock.session(on)
    await $.command.run({ command: 'leitstand', args: 'calm on' } as never)
    const zeilen = [`<local-command-stdout>prompt-upgrade: ${CALM}</local-command-stdout>`, '<local-command-stdout>leitstandx: Text</local-command-stdout>', `<local-command-stdout>${CALM}</local-command-stdout>`]
    for (const z of zeilen) await append($, z)
    expect(rows(sitzung)).toEqual(zeilen)
  })

  test('nach einer mehrzeiligen Antwort steht die Herkunft in einer eigenen Zeile', () => {
    expect(ohneVorsatz('<local-command-stdout>leitstand: Eins\nZwei</local-command-stdout>', 'leitstand', GEMELDET)).toBe('<local-command-stdout>Eins\nZwei\n(gemeldet vom Mod Leitstand)</local-command-stdout>')
    expect(ohneVorsatz('<local-command-stdout>leitstand+autopilot: Eins</local-command-stdout>', 'leitstand', GEMELDET)).toBe('<local-command-stdout>autopilot: Eins (gemeldet vom Mod Leitstand)</local-command-stdout>')
    expect(ohneVorsatz('<local-command-stdout>leitstand: Eins</local-command-stdout>', 'leitstand', null)).toBe('<local-command-stdout>Eins</local-command-stdout>')
    expect(ohneVorsatz('<local-command-stdout>autopilot: Eins</local-command-stdout>', 'leitstand', GEMELDET)).toBe('<local-command-stdout>autopilot: Eins</local-command-stdout>')
  })
})

async function append($: Engine, text: string): Promise<void> {
  await $.session.append({
    message: { type: 'system', name: 'local_command', content: [{ type: 'text', text }] },
    door: 'command',
    origin: { kind: 'engine' },
    uuid: `befehl-${text.length}-${Math.random()}`,
  } as never)
}

function rows(sitzung: ReturnType<typeof mock.session>): string[] {
  return sitzung.appended().map(z => {
    const b = z.message.content[0]
    return typeof b?.text === 'string' ? b.text : ''
  })
}

describe('Eigene Befehle /leitstand-…', () => {
  const START = { cwd: '/work', surface: 'terminal' } as never
  type Spec = { name: string; description: string; argumentHint?: string; immediate?: boolean }
  /** Runs a command as typed, at the computer or from the phone (Remote Control); its answer. */
  const run = async ($: Engine, command: string, args = '', kind: 'composer' | 'bridge' = 'composer') =>
    String((await $.command.run({ command, args, origin: { kind } } as never)).text)
  /** Reads Leitstand's state from another plugin: /zustand answers with the values the tests look at. */
  const STATE_READER = {
    name: 'state-reader',
    register(on: On) {
      // A module names each value it reads: these are the ones the tests here look at.
      on('command.run', { command: 'zustand' }, async $ => {
        const read: Record<string, { value?: unknown }> = {
          glanceEnabled: (await $.state.get({ plugin: 'leitstand', key: 'glanceEnabled' } as never)) as { value?: unknown },
          detailLevel: (await $.state.get({ plugin: 'leitstand', key: 'detailLevel' } as never)) as { value?: unknown },
          workMode: (await $.state.get({ plugin: 'leitstand', key: 'workMode' } as never)) as { value?: unknown },
          masksPrivate: (await $.state.get({ plugin: 'leitstand', key: 'masksPrivate' } as never)) as { value?: unknown },
          isGuarded: (await $.state.get({ plugin: 'leitstand', key: 'isGuarded' } as never)) as { value?: unknown },
          isNoticing: (await $.state.get({ plugin: 'leitstand', key: 'isNoticing' } as never)) as { value?: unknown },
          showsOthers: (await $.state.get({ plugin: 'leitstand', key: 'showsOthers' } as never)) as { value?: unknown },
          isCalm: (await $.state.get({ plugin: 'leitstand', key: 'isCalm' } as never)) as { value?: unknown },
          approvePlan: (await $.state.get({ plugin: 'leitstand', key: 'approvePlan' } as never)) as { value?: unknown },
          shipsOnGithub: (await $.state.get({ plugin: 'leitstand', key: 'shipsOnGithub' } as never)) as { value?: unknown },
          soundMode: (await $.state.get({ plugin: 'leitstand', key: 'soundMode' } as never)) as { value?: unknown },
          adhdMode: (await $.state.get({ plugin: 'leitstand', key: 'adhdMode' } as never)) as { value?: unknown },
        }
        return { text: JSON.stringify(Object.fromEntries(Object.entries(read).map(([key, one]) => [key, one.value ?? null]))) }
      })
    },
  }
  const READS = { plugins: [STATE_READER] }
  const stateOf = async ($: Engine, key: string): Promise<unknown> =>
    (JSON.parse(String((await $.command.run({ command: 'zustand', args: '' } as never)).text)) as Record<string, unknown>)[key]
  /** Real time for what a command started without waiting for it: a skill, a message, a pane. */
  const settle = async (clock?: { advance: (ms: number) => Promise<unknown> }) => {
    // What a command sets off starts on the clock, once its answer is given.
    await clock?.advance(1)
    const { setTimeout: later } = globalThis as unknown as { setTimeout: (done: () => void, ms: number) => unknown }
    await new Promise<void>(done => later(done, 20))
  }

  test('jeder Befehl läuft als /leitstand:…, seine Kurzform ist registriert, sofort (immediate) wie ein Druck, und jeder erklärt sich mit hilfe', READS, async ($, on) => {
    world(on)
    on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
    on('tool.register', () => ({ value: undefined }) as never)
    const registered: Spec[] = []
    on('command.register', (_, e) => {
      registered.push(e as unknown as Spec)
      return { value: undefined } as never
    })
    await $.session.start(START)

    const names = LEITSTAND_BEFEHLE.map(one => one.name)
    // Die des Leitstands selbst und die seiner Teile (Selbstkritik und Regeln, Dateien, Autopilot), jeder mit Kurzform.
    expect(names).toHaveLength(48 + TEIL_BEFEHLE.length)
    expect(new Set(names).size).toBe(names.length)
    const short = registered.find(one => one.name === 'leitstand')
    expect(short).toBeDefined()
    for (const one of LEITSTAND_BEFEHLE) {
      expect(one.name.startsWith('leitstand:')).toBe(true)
      // The long form is a file in the plugin's commands/ folder: a name with a colon is not registered.
      expect(registered.find(r => r.name === one.name)).toBeUndefined()
      expect(one.description.length).toBeGreaterThan(5)
      for (const ask of ['hilfe', '?', ' Hilfe ']) {
        const help = await run($, one.name, ask)
        expect(help.startsWith(`/${one.name}: ${one.description}\n`)).toBe(true)
        for (const part of ['\nWas: ', '\nKnopf: ', '\nGilt: ', '\nArgumente: ', '\nBeispiel: /leitstand:']) expect(help).toContain(part)
        if (one.gilt !== 'einmal') expect(help).toContain('nur in diesem Chat')
      }
    }
    // Short forms without leitstand: in front: the same command, the menu names the mod.
    expect(LEITSTAND_KURZFORMEN.size).toBe(44 + TEIL_BEFEHLE.length)
    for (const name of ['an', 'aus', 'hilfe', 'vermenschlichen']) expect(registered.find(one => one.name === name)).toBeUndefined()
    for (const [kurz, name] of LEITSTAND_KURZFORMEN) {
      const one = LEITSTAND_BEFEHLE.find(befehl => befehl.name === name)
      expect(kurz).toBe(name.slice('leitstand:'.length))
      const spec = registered.find(r => r.name === kurz)
      expect(spec?.description).toBe(`${one?.description} (Leitstand)`)
      expect(spec?.argumentHint).toBe(one?.argumentHint)
      expect(spec?.immediate).toBe(true)
      const help = await run($, kurz, 'hilfe')
      expect(help.startsWith(`/${name}: `)).toBe(true)
      expect(help.endsWith(`\nKurzform: /${kurz}`)).toBe(true)
    }
    expect(registered.find(one => one.name === 'verlauf-zeigen')?.argumentHint).toBe('[gestern|JJJJ-MM-TT]')
    expect(registered.find(one => one.name === 'ausfragen')?.argumentHint).toBe('[Thema]')
    for (const name of ['geheimnisse-sichern', 'neuer-chat', 'abschliessen']) {
      expect(registered.find(one => one.name === name)?.argumentHint).toBe('[ja]')
    }
    // An old name says the new one and does nothing; one renamed says its new name.
    expect(await run($, 'leitstand-pause')).toBe('Der Befehl heißt jetzt /leitstand:pause, kurz /pause.')
    expect(await run($, 'leitstand-an')).toBe('Der Befehl heißt jetzt /leitstand:an.')
    expect(await run($, 'leitstand-adhs-an')).toBe('Der Befehl heißt jetzt /leitstand:kurzantworten-an, kurz /kurzantworten-an.')
    expect(await run($, 'adhs-aus')).toBe('Der Befehl heißt jetzt /leitstand:kurzantworten-aus, kurz /kurzantworten-aus.')
    expect(registered.find(one => one.name.startsWith('leitstand-') || one.name.startsWith('adhs-'))).toBeUndefined()
    // Asking for help changes nothing.
    expect(await stateOf($, 'glanceEnabled')).toBe(true)
    expect(await stateOf($, 'masksPrivate')).toBe(true)
    expect(await stateOf($, 'isGuarded')).toBe(true)
  })

  test('leitstand:hilfe listet alle Befehle nach Gruppen, je eine Zeile', async ($, on) => {
    world(on)
    const lines = (await run($, 'leitstand:hilfe')).split('\n')
    for (const one of LEITSTAND_BEFEHLE) {
      const own = lines.filter(line => line.startsWith(`/${one.name}:`) || line.startsWith(`/${one.name} `))
      expect(own).toEqual([`/${one.name}${one.argumentHint ? ` ${one.argumentHint}` : ''}: ${one.description}`])
    }
    for (const gruppe of new Set(LEITSTAND_BEFEHLE.map(one => one.gruppe))) expect(lines).toContain(gruppe)
  })

  test('jeder Schalter wirkt wie sein Knopf, nur in diesem Chat, und die Antwort nennt den neuen Zustand', READS, async ($, on) => {
    const { store, session } = resumeWorld(on)
    session.id = 'chat-1'
    await $.session.start(START)
    // Command, state, its value after, the chat's own setting, its value.
    const cases: [string, string, unknown, string, unknown][] = [
      ['leitstand:aus', 'glanceEnabled', false, 'enabled', false],
      ['leitstand:an', 'glanceEnabled', true, 'enabled', true],
      ['leitstand:ansicht-ausfuehrlich', 'detailLevel', 'detailed', 'detail', 'detailed'],
      ['leitstand:ansicht-minimal', 'detailLevel', 'minimal', 'detail', 'minimal'],
      ['leitstand:ansicht-einfach', 'detailLevel', 'simple', 'detail', 'simple'],
      ['leitstand:arbeitsmodus-gruppenarbeit', 'workMode', 'dynamisch', 'workMode', 'dynamisch'],
      ['leitstand:arbeitsmodus-auto', 'workMode', 'auto', 'workMode', 'auto'],
      ['leitstand:verdecken-aus', 'masksPrivate', false, 'mask', false],
      ['leitstand:verdecken-an', 'masksPrivate', true, 'mask', true],
      ['leitstand:passwortschutz-aus', 'isGuarded', false, 'guard', false],
      ['leitstand:passwortschutz-an', 'isGuarded', true, 'guard', true],
      ['leitstand:benachrichtigungen-an', 'isNoticing', true, 'notice', true],
      ['leitstand:benachrichtigungen-aus', 'isNoticing', false, 'notice', false],
      ['leitstand:andere-chats-aus', 'showsOthers', false, 'others', false],
      ['leitstand:andere-chats-an', 'showsOthers', true, 'others', true],
      ['leitstand:ruhemodus-an', 'isCalm', true, 'calm', true],
      ['leitstand:ruhemodus-aus', 'isCalm', false, 'calm', false],
      ['leitstand:plan-freigeben-an', 'approvePlan', true, 'approve', true],
      ['leitstand:plan-freigeben-aus', 'approvePlan', false, 'approve', false],
      ['leitstand:github-abschluss-an', 'shipsOnGithub', true, 'ship', true],
      ['leitstand:github-abschluss-aus', 'shipsOnGithub', false, 'ship', false],
      ['leitstand:ton-signalton', 'soundMode', 'chime', 'sound', 'chime'],
      ['leitstand:ton-stimme', 'soundMode', 'voice', 'sound', 'voice'],
      ['leitstand:ton-aus', 'soundMode', 'off', 'sound', 'off'],
    ]
    for (const [command, key, value, field, saved] of cases) {
      expect(await run($, command)).toMatch(/ jetzt .+ \(nur in diesem Chat\)\.$/)
      expect(await stateOf($, key)).toEqual(value)
      expect((store.get('settings:chat-1') as { values: Record<string, unknown> }).values[field]).toEqual(saved)
    }
    // The short form does the same.
    expect(await run($, 'verdecken-an')).toBe('Verdecken ist jetzt an (nur in diesem Chat).')
    expect(await stateOf($, 'masksPrivate')).toBe(true)
    expect(await run($, 'verdecken-aus')).toBe('Verdecken ist jetzt aus (nur in diesem Chat).')
    expect(await stateOf($, 'masksPrivate')).toBe(false)
    await run($, 'ruhemodus-an')

    // Another chat starts with the defaults from the config menu; the first one, opened again, has its own.
    session.id = 'chat-2'
    await $.session.start(START)
    expect(await stateOf($, 'masksPrivate')).toBe(true)
    expect(await stateOf($, 'isCalm')).toBe(false)
    expect(store.has('settings:chat-2')).toBe(false)
    session.id = 'chat-1'
    await $.session.start(START)
    expect(await stateOf($, 'masksPrivate')).toBe(false)
    expect(await stateOf($, 'isCalm')).toBe(true)

    // Zurücksetzen as its button: this chat's own values go.
    expect(await run($, 'leitstand:zuruecksetzen')).toBe('Alle Leitstand-Einstellungen stehen wieder auf dem Standard (nur in diesem Chat).')
    expect(store.has('settings:chat-1')).toBe(false)
    expect(await stateOf($, 'masksPrivate')).toBe(true)
  })

  test('in der Gruppenarbeit bleibt Plan zuerst freigeben an, wie am Knopf, und die Antwort sagt es', READS, async ($, on) => {
    const { store, session } = resumeWorld(on)
    session.id = 'chat-1'
    await $.session.start(START)
    await run($, 'leitstand:arbeitsmodus-gruppenarbeit')
    for (const command of ['leitstand:plan-freigeben-aus', 'leitstand:plan-freigeben-an']) {
      expect(await run($, command)).toBe('In der Gruppenarbeit wartet jeder Plan auf deine Freigabe: Plan zuerst freigeben ist dort immer an.')
    }
    expect(await stateOf($, 'approvePlan')).toBe(false)
    expect((store.get('settings:chat-1') as { values: Record<string, unknown> }).values).toEqual({ workMode: 'dynamisch' })
  })

  test('Kurzantworten an und aus wirken wie 📖/📝, ausdrücklich: ein zweites an sagt, dass er schon an ist', READS, async ($, on) => {
    const clock = world(on)
    const runs: string[] = []
    const sent: string[] = []
    on('command.list', () => ({ value: [{ name: 'i-have-adhd:i-have-adhd', description: 'ADHS', source: 'plugin' }] }) as never)
    on('command.run', (_, e) => {
      runs.push(e.command)
      return { text: '' }
    })
    on('prompt.submit', (_, e) => {
      sent.push(e.text)
      return { text: e.text }
    })
    expect(await run($, 'leitstand:kurzantworten-aus')).toBe('Kurzantworten sind schon aus.')
    expect(await run($, 'leitstand:kurzantworten-an')).toBe('Kurzantworten gehen an (nur in diesem Chat): Claude antwortet mit dem nächsten Schritt zuerst.')
    await settle(clock)
    expect(runs).toEqual(['i-have-adhd:i-have-adhd'])
    expect(await stateOf($, 'adhdMode')).toBe(true)
    expect(await run($, 'leitstand:kurzantworten-an')).toBe('Kurzantworten sind schon an.')
    expect(runs).toHaveLength(1)
    expect(await run($, 'leitstand:kurzantworten-aus')).toBe('Kurzantworten gehen aus (nur in diesem Chat).')
    await settle(clock)
    expect(await stateOf($, 'adhdMode')).toBe(false)
    expect(sent).toEqual(['stop adhd mode'])
  })

  test('Remote Control an und aus wie 🛜; ohne Remote Control sagt der Befehl, dass es hier nicht geht', async ($, on) => {
    world(on)
    let app: 'on' | 'off' | null = null
    on('command.list', () => ({ value: [] }) as never)
    on('mcp.call', (_, e) => {
      if (app === null) throw new Error(`MCP server ${e.server} is not connected`)
      if (e.tool === 'set_remote_control') app = e.args.enabled === true ? 'on' : 'off'
      return { value: { content: [{ type: 'text', text: JSON.stringify({ remoteControlState: app }) }], isError: false } } as never
    })
    expect(await run($, 'leitstand:fernsteuerung-an')).toBe('Remote Control ist hier nicht verfügbar.')
    app = 'off'
    expect(await run($, 'leitstand:fernsteuerung-aus')).toBe('Remote Control ist schon aus.')
    expect(await run($, 'leitstand:fernsteuerung-an')).toBe('Remote Control ist jetzt an (nur in diesem Chat).')
    expect(app).toBe('on')
    expect(await run($, 'leitstand:fernsteuerung-an')).toBe('Remote Control ist schon an.')
    expect(await run($, 'leitstand:fernsteuerung-aus')).toBe('Remote Control ist jetzt aus (nur in diesem Chat).')
    expect(app).toBe('off')
  })

  test('Neuer Chat: ohne ja passiert nichts, mit ja schreibt Claude die Notiz, leert den Chat und schickt sie', async ($, on) => {
    const clock = world(on)
    const NOTE = 'Fortsetzung aus einem früheren Chat. So ist der Stand: Das Menü ist repariert.'
    const forks: string[] = []
    const runs: string[] = []
    const sent: string[] = []
    on('model.fork', (_, e) => {
      forks.push(String((e as { prompt: string }).prompt))
      return { value: { isAnswered: true, text: NOTE, usage: {} } } as never
    })
    on('command.run', (_, e) => {
      runs.push(e.command)
      return { text: '' }
    })
    on('prompt.submit', (_, e) => {
      sent.push(e.text)
      return { text: e.text }
    })
    for (const args of ['', 'vielleicht']) {
      const asked = await run($, 'leitstand:neuer-chat', args)
      expect(asked.startsWith('Würde eine Übergabenotiz schreiben')).toBe(true)
      expect(asked.endsWith('\nZum Ausführen: /leitstand:neuer-chat ja')).toBe(true)
    }
    await settle(clock)
    expect(forks).toEqual([])
    expect(runs).toEqual([])
    expect(sent).toEqual([])

    expect(await run($, 'leitstand:neuer-chat', 'ja')).toBe('Starte einen neuen Chat mit Übergabenotiz…')
    await settle(clock)
    expect(forks).toHaveLength(1)
    expect(runs).toEqual(['clear'])
    expect(sent).toEqual([NOTE])
  })

  test('Abschließen: ohne ja passiert nichts, mit ja geht der Auftrag wie mit Push an GitHub', async ($, on) => {
    const { sent, clock } = await shipWorld($, on, 'git@github.com:me/site.git\n')
    // As Push, once the job is done.
    await finish($)
    const asked = await run($, 'leitstand:abschliessen')
    expect(asked.endsWith('\nZum Ausführen: /leitstand:abschliessen ja')).toBe(true)
    await settle(clock)
    expect(sent).toEqual([])
    expect(await run($, 'leitstand:abschliessen', 'ja')).toBe('Liefere auf GitHub aus…')
    await settle(clock)
    await run($, 'leitstand:hilfe')
    await settle(clock)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('Liefere sie auf GitHub aus')
  })

  test('Abschließen gibt es nur in einem GitHub-Projekt, wie den Knopf Push', async ($, on) => {
    const { sent, clock } = await shipWorld($, on, '')
    expect(await run($, 'leitstand:abschliessen', 'ja')).toBe('Dieses Projekt liegt nicht auf GitHub, darum gibt es hier keinen Push.')
    await settle(clock)
    expect(sent).toEqual([])
  })

  test('vom Handy bringt ein Fenster-Befehl den Inhalt als Text; am Computer geht das Fenster nach der Antwort auf', async ($, on) => {
    world(on)
    const opened: string[] = []
    on('ui.open', (_, e) => {
      opened.push(String((e as { id?: string }).id))
      return { value: { isPlaced: true } } as never
    })
    expect(await run($, 'leitstand:plan-zeigen', '', 'bridge')).toBe('Noch kein Plan. Bitte Claude um etwas, dann erscheint hier sein Plan.')
    await $.turn.start({ text: 'Baue die Preisseite', turnId: 't1' })
    await callTool($, { tool: PLAN, steps: ['Lies die Notizen', 'Baue die Tabelle'] })
    await callTool($, { tool: PROGRESS, task: 'Lies die Notizen', percent: 100, summary: 'Die Notizen gelesen' })

    const phone = await run($, 'leitstand:plan-zeigen', '', 'bridge')
    expect(phone.split('\n').slice(1)).toEqual(['1 von 2 Schritten fertig.', '', '✓ Lies die Notizen', '   Die Notizen gelesen', '▶ Baue die Tabelle'])
    expect(await run($, 'leitstand:plan-zeigen')).toBe('Der Plan ist in der Seitenleiste.')
    await settle()
    expect(opened).toEqual(['leitstand-plan', 'leitstand-plan'])
    expect(await run($, 'leitstand:einstellungen-zeigen', '', 'bridge')).toContain('auf dem Handy sind Fenster nicht zu sehen')
    expect(await run($, 'leitstand:einstellungen-zeigen')).toBe('Die Einstellungen sind in der Seitenleiste.')
    await settle()
    expect(opened.at(-1)).toBe('leitstand-settings')
  })

  test('/leitstand:knoepfe-zeigen öffnet am Computer das Fenster, vom Handy kommt die Erklärung als Text; jeder genannte Befehl gibt es', async ($, on) => {
    world(on)
    const opened: string[] = []
    on('ui.open', (_, e) => {
      opened.push(String((e as { id?: string }).id))
      return { value: { isPlaced: true } } as never
    })
    expect(await run($, 'leitstand:knoepfe-zeigen')).toBe('Die Erklärung der Knöpfe ist in der Seitenleiste.')
    await settle()
    expect(opened).toEqual(['leitstand-knoepfe'])
    const phone = await run($, 'leitstand:knoepfe-zeigen', '', 'bridge')
    expect(phone.startsWith('Die Knöpfe des Leitstands:\n\nOben rechts\n')).toBe(true)
    expect(phone).toContain('\u2753 Knöpfe: Dieses Fenster')
    expect(phone).toContain('\u{1F468}\u200D\u{1F4BC} Auto-Modus: ')
    expect(phone).toContain('Neuer Chat: ')
    const named = [...phone.matchAll(/\((\/leitstand:[a-z-]+)\)/g)].map(one => one[1]?.slice(1))
    expect(named.length).toBeGreaterThan(20)
    for (const name of named) expect(LEITSTAND_BEFEHLE.some(one => one.name === name)).toBe(true)
  })

  test('Tagesbericht, Wochenbericht und Deine Woche stehen als Text in der Antwort, kopiert wie am Knopf', async ($, on) => {
    world(on)
    const copied: string[] = []
    on('session.cwd', () => ({ value: '/work/landing-site' }) as never)
    on('ui.open', () => ({ value: { isPlaced: true } }) as never)
    on('ui.copy', (_, e) => {
      copied.push(String((e as { text: string }).text))
      return { value: { isCopied: true } } as never
    })
    const day = await run($, 'leitstand:tagesbericht')
    expect(day.startsWith('Tagesbericht · landing-site · ')).toBe(true)
    expect(day).toContain('An diesem Tag wurde keine geplante Arbeit erfasst.')
    const week = await run($, 'leitstand:wochenbericht', '', 'bridge')
    expect(week.startsWith('Wochenbericht · landing-site · ')).toBe(true)
    const mine = await run($, 'leitstand:meine-woche')
    expect(mine.startsWith('Deine Woche mit Claude · ')).toBe(true)
    expect(copied).toEqual([day, week, mine])
  })

  test('der Verlauf vom Handy listet die Aufgaben; ein falsches Datum sagt, wie es geht', async ($, on) => {
    world(on)
    on('session.cwd', () => ({ value: '/work/landing-site' }) as never)
    on('ui.open', () => ({ value: { isPlaced: true } }) as never)
    expect(await run($, 'leitstand:verlauf-zeigen', 'morgen')).toBe(
      'Versuch /leitstand:verlauf-zeigen, /leitstand:verlauf-zeigen gestern oder /leitstand:verlauf-zeigen 2026-10-06.',
    )
    expect(await run($, 'leitstand:verlauf-zeigen', 'gestern', 'bridge')).toMatch(/^Verlauf für \d\d\.\d\d\.\d{4}: 0 Aufgaben\.$/)
    expect(await run($, 'leitstand:verlauf-zeigen')).toMatch(/: 0 Aufgaben\. Er ist in der Seitenleiste\.$/)
  })

  test('Plan starten ohne wartenden Plan sagt das; ein Fehler kommt als schlichter Satz', async ($, on) => {
    world(on)
    on('session.cwd', () => {
      throw new Error('kein Ordner')
    })
    expect(await run($, 'leitstand:plan-starten')).toBe('Gerade wartet kein Plan auf Start.')
    expect(await run($, 'leitstand:pause')).toBe('Gerade läuft nichts, das sich anhalten ließe.')
    expect(await run($, 'leitstand:verlauf-zeigen')).toBe('Das hat gerade nicht geklappt. Versuch es gleich noch einmal oder nimm den Knopf im Leitstand.')
  })

  test('der Vorsatz-Hook hängt die Herkunft auch an die Antwort eines neuen Befehls', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    on('ui.toast', () => ({ value: undefined }) as never)
    const sitzung = mock.session(on)
    const text = await run($, 'leitstand:ruhemodus-an')
    expect(text).toBe('Der Ruhemodus ist jetzt an (nur in diesem Chat).')
    await append($, `<local-command-stdout>leitstand: ${text}</local-command-stdout>`)
    expect(rows(sitzung)).toEqual([`<local-command-stdout>${text} (gemeldet vom Mod Leitstand)</local-command-stdout>`])
    // A help of several lines gets it on a line of its own.
    const help = await run($, 'leitstand:pause', 'hilfe')
    await append($, `<local-command-stdout>leitstand: ${help}</local-command-stdout>`)
    expect(rows(sitzung)[1]).toBe(`<local-command-stdout>${help}\n(gemeldet vom Mod Leitstand)</local-command-stdout>`)
  })
})

test('days and times count in Berlin on every machine, summer and winter time alike', () => {
  expect(dayKey(Date.UTC(2026, 9, 5, 22, 30))).toBe('2026-10-06')
  expect(dayKey(Date.UTC(2026, 10, 1, 22, 30))).toBe('2026-11-01')
  // The night the clocks go forward has 23 hours: yesterday is still the calendar's day before.
  expect(shiftDay('2026-03-30', -1)).toBe('2026-03-29')
  expect(dayFromArgument('gestern', Date.UTC(2026, 2, 29, 22, 30))).toBe('2026-03-29')
  expect(resetTime(new Date(Date.UTC(2026, 10, 5, 8, 0)).toISOString(), Date.UTC(2026, 10, 1, 12, 0))).toBe('am Do um 09:00')
})

test('startsAtOnce: nur "Starte sofort" am Anfang der Nachricht', () => {
  expect(startsAtOnce('Starte sofort: Schreib die Übergabe')).toBe(true)
  expect(startsAtOnce('  starte bitte sofort')).toBe(true)
  expect(startsAtOnce('STARTE SOFORT.')).toBe(true)
  expect(startsAtOnce('Bitte starte sofort')).toBe(false)
  expect(startsAtOnce('Starte sofortige Prüfung')).toBe(false)
})

test('"Starte sofort" vorn: in der Gruppenarbeit wartet der Plan nicht, auch mit "bevor" im Satz', async ($, on) => {
  world(on)
  await $.command.run({ command: 'leitstand', args: 'modus gruppenarbeit' } as never)
  await $.turn.start({ text: 'Starte sofort: Schreib eine Übergabe für die nächste Instanz, bevor der Server neu startet.', turnId: 't1' })
  const planned = await callTool($, { tool: PLAN, steps: ['Lies den Stand', 'Schreib die Übergabe'] })
  expect(String(planned.result)).toContain('Der erste hat begonnen')
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
})

test('Auftrag aus einer geplanten Aufgabe: der Plan wartet, startet nach 30 s von selbst, und Claude weiß es', async ($, on) => {
  const clock = world(on)
  const sent: string[] = []
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await $.command.run({ command: 'leitstand', args: 'modus gruppenarbeit' } as never)
  const auftrag = 'Schreib eine Übergabe für die nächste Instanz.'
  await $.prompt.submit({ text: auftrag, wait: false, origin: { kind: 'scheduled-trigger' } } as never)
  await $.turn.start({ text: auftrag, turnId: 't1' })
  const planned = await callTool($, { tool: PLAN, steps: ['Lies den Stand', 'Schreib die Übergabe'] })
  expect(String(planned.result)).toContain(
    'Der Auftrag kam aus einer geplanten Aufgabe, niemand sieht zu: Der Leitstand startet den Plan in 30 Sekunden von selbst.',
  )
  await $.turn.complete({ answer: 'Der Plan steht.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  for (const surface of SURFACES) expect((await texts($, surface)).join('\n')).toContain('startet in 30 s')
  await clock.advance(29_000)
  expect(sent.filter(one => one === START_TEXT)).toHaveLength(0)
  await clock.advance(1000)
  expect(sent.filter(one => one === START_TEXT)).toHaveLength(1)
  await $.turn.start({ text: START_TEXT, turnId: 't2' })
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  await clock.advance(60_000)
  expect(sent.filter(one => one === START_TEXT)).toHaveLength(1)
})

test('derselbe Auftrag von der Person: der Plan wartet auch nach 60 s auf Start', async ($, on) => {
  const clock = world(on)
  const sent: string[] = []
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await $.command.run({ command: 'leitstand', args: 'modus gruppenarbeit' } as never)
  const auftrag = 'Schreib eine Übergabe für die nächste Instanz.'
  await $.prompt.submit({ text: auftrag, wait: false, origin: { kind: 'composer' } } as never)
  await $.turn.start({ text: auftrag, turnId: 't1' })
  const planned = await callTool($, { tool: PLAN, steps: ['Lies den Stand', 'Schreib die Übergabe'] })
  expect(String(planned.result)).not.toContain('geplanten Aufgabe')
  await $.turn.complete({ answer: 'Der Plan steht.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(60_000)
  expect(sent.filter(one => one === START_TEXT)).toHaveLength(0)
})

test('claude -p ohne Oberfläche: der Plan wartet nicht; mit einer Oberfläche (App) wartet er', async ($, on) => {
  world(on)
  let surfaces: string[] = []
  on('session.surfaces', () => ({ value: surfaces }) as never)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.command.run({ command: 'leitstand', args: 'modus gruppenarbeit' } as never)
  await $.prompt.submit({ text: 'Schreib die Übergabe.', wait: false, origin: { kind: 'sdk' } } as never)
  await $.turn.start({ text: 'Schreib die Übergabe.', turnId: 't1' })
  expect(String((await callTool($, { tool: PLAN, steps: ['Lies den Stand', 'Schreib die Übergabe'] })).result)).toContain('Der erste hat begonnen')
  await $.turn.complete({ answer: 'Fertig.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  surfaces = ['desktop']
  await $.prompt.submit({ text: 'Baue die Preisseite.', wait: false, origin: { kind: 'sdk' } } as never)
  await $.turn.start({ text: 'Baue die Preisseite.', turnId: 't2' })
  expect(String((await callTool($, { tool: PLAN, steps: ['Plane die Seite', 'Prüfe sie'] })).result)).toContain('warte auf ihre Antwort')
})

test('nurLesen: der Plan startet ohne Freigabe, schreibt aber keine Dateien; ein Plan zum Ändern wartet wieder', async ($, on) => {
  world(on)
  await $.command.run({ command: 'leitstand', args: 'modus gruppenarbeit' } as never)
  await $.turn.start({ text: 'Mach einen Plan, wie wir die Preisseite umbauen', turnId: 't1' })
  const read = await callTool($, { tool: PLAN, steps: ['Lies die Preisseite', 'Schreib den Plan in den Chat'], nurLesen: true })
  expect(String(read.result)).toContain('nur lesen: Der Plan startet ohne Freigabe')
  expect((await callTool($, { tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  expect((await callTool($, { tool: 'Read', file_path: '/work/preise.html' })).deny).toBeUndefined()
  expect((await callTool($, { tool: 'Edit', file_path: '/work/preise.html', old_string: 'a', new_string: 'b' })).deny).toContain('nur lesen')
  expect((await callTool($, { tool: 'Write', file_path: '/work/neu.html', content: 'x' })).deny).toContain('nur lesen')

  // Dieselben Schritte ohne nurLesen sind ein Plan zum Ändern: er wartet auf Start.
  const change = await callTool($, { tool: PLAN, steps: ['Lies die Preisseite', 'Schreib den Plan in den Chat'] })
  expect(String(change.result)).toContain('warte auf ihre Antwort')
  await $.turn.start({ text: 'los', turnId: 't2' })
  expect((await callTool($, { tool: 'Edit', file_path: '/work/preise.html', old_string: 'a', new_string: 'b' })).deny).toBeUndefined()
})

test('nurLesen im Auto-Modus ohne Plan-Freigabe ändert nichts: nichts wartet, nichts ist gesperrt', async ($, on) => {
  world(on)
  await $.turn.start({ text: 'Was steht in der Preisseite?', turnId: 't1' })
  const read = await callTool($, { tool: PLAN, steps: ['Lies die Preisseite', 'Antworte im Chat'], nurLesen: true })
  expect(String(read.result)).toContain('Der erste hat begonnen')
  expect((await callTool($, { tool: 'Edit', file_path: '/work/preise.html', old_string: 'a', new_string: 'b' })).deny).toBeUndefined()
})

/** Modellwahl as it draws its proposal: a keyed line with its words and its two buttons, over what is beneath. */
const FAKE_MODELLWAHL = {
  name: 'modellwahl',
  register(on: On) {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      const beneath = await next(e)
      const { Box, Text, Button } = $.ui.resolve(e)
      const look = (variant: 'primary' | 'secondary') => (e.surface === 'terminal' ? { plain: true } : { variant })
      return h(
        Box,
        { flexDirection: 'column' },
        h(
          Box,
          { key: 'modellwahl', flexDirection: 'row', gap: 1 },
          h(Text, {}, 'Modellwahl schlägt Haiku · niedrig vor · gilt in 12 s'),
          h(Button, { key: 'modellwahl-ja', label: 'Übernehmen', ...look('primary'), onPress: () => undefined }),
          h(Button, { key: 'modellwahl-nein', label: 'Nein', ...look('secondary'), onPress: () => undefined }),
        ),
        beneath,
      ) as never
    })
  },
}

test('die Zeile der Modellwahl steht oben im Band; ihre Knöpfe bleiben bei ihr', { plugins: [FAKE_MODELLWAHL] }, async ($, on) => {
  world(on)
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: ['A card from another mod'] }) as never)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await callTool($, { tool: PLAN, steps: ['Write it', 'Check it'] })
  for (const surface of SURFACES) {
    const shown = await texts($, surface)
    const at = (words: string) => shown.findIndex(one => one.includes(words))
    expect(at('Modellwahl schlägt')).toBe(0)
    expect(at('Modellwahl schlägt')).toBeLessThan(at('Write it'))
    expect(at('Write it')).toBeLessThan(at('A card from another mod'))
    const ui = await $.ui.mount({ ...BAND, surface })
    const boxes = await ui.findAll({ type: 'Box' })
    const line = JSON.stringify(boxes.find(one => one.props.key === 'modellwahl') ?? null)
    const actions = JSON.stringify(boxes.find(one => one.props.key === 'actions') ?? null)
    await ui.unmount()
    expect(line).toContain('Übernehmen')
    expect(line).toContain('Nein')
    expect(actions).not.toContain('Übernehmen')
  }
})
