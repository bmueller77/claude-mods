import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { maskCode, needsTranslation, proseOf, readTranslation, unmask } from '../hooks/translate'

const SUMMARY =
  'This is the summary of the work so far. The user asked for a pricing page and we built it with the table.\n\n' +
  '```json\n{"a": 1}\n```\n\n' +
  'After that we tested it in the browser.'
const GERMAN = 'Bitte baue mir eine Preisseite mit drei Tarifen und teste sie.'
const TOOL_CALL = '[Werkzeug: Read]\n```json\n{\n  "file_path": "/work/index.html"\n}\n```'

describe('was übersetzt wird', () => {
  test('englischer Text ja, deutscher Text und reiner Code nicht', () => {
    expect(needsTranslation(SUMMARY)).toBe(true)
    expect(needsTranslation(GERMAN)).toBe(false)
    expect(needsTranslation(TOOL_CALL)).toBe(false)
    expect(needsTranslation('[Ergebnis]\n```\nok\n```')).toBe(false)
    // Ein paar Wörter reichen nicht.
    expect(needsTranslation('Done.')).toBe(false)
  })

  test('der Fließtext ohne Codeblöcke, Inline-Code und Werkzeug-Marken', () => {
    const prose = proseOf(`${TOOL_CALL}\n\nRun \`npm test\` and check the output.`)
    expect(prose).not.toContain('file_path')
    expect(prose).not.toContain('npm test')
    expect(prose).not.toContain('Werkzeug')
    expect(prose).toContain('and check the output.')
  })
})

describe('Code bleibt, wie er ist', () => {
  test('Codeblöcke werden zu Platzhaltern und kommen an ihre Stelle zurück', () => {
    const { masked, blocks } = maskCode(SUMMARY)
    expect(masked).not.toContain('{"a": 1}')
    expect(masked).toContain('@@CODE1@@')
    expect(blocks).toEqual(['```json\n{"a": 1}\n```'])
    expect(unmask(masked, blocks)).toBe(SUMMARY)
    expect(unmask('Zusammenfassung.\n\n@@CODE1@@\n\nDanach getestet.', blocks)).toBe(
      'Zusammenfassung.\n\n```json\n{"a": 1}\n```\n\nDanach getestet.',
    )
  })

  test('einen Platzhalter, den das Modell weglässt, hängt die Übersetzung hinten an', () => {
    expect(unmask('Nur Text.', ['```\nx\n```'])).toBe('Nur Text.\n\n```\nx\n```')
  })

  test('die Antwort des Modells steht zwischen den Marken; ohne Marken gilt die ganze Antwort', () => {
    expect(readTranslation('Hier: <uebersetzung>\nHallo Welt\n</uebersetzung> Ende')).toBe('Hallo Welt')
    expect(readTranslation('Hallo Welt')).toBe('Hallo Welt')
    expect(readTranslation('<uebersetzung>Hallo')).toBe('Hallo')
    expect(readTranslation('<uebersetzung></uebersetzung>')).toBeNull()
  })
})

describe('das Fenster', () => {
  const DIR = '/tmp/visible-compact/sessions/sitzung-1'
  const META = {
    id: 'v1',
    at: Date.UTC(2026, 9, 17, 9, 44),
    durationMs: 80_800,
    trigger: 'manual',
    tokensBefore: 763_000,
    tokensAfter: 16_000,
    messages: { before: 1, after: 2 },
    chunks: { before: 1, after: 2 },
  }
  const PANE = {
    plugin: 'visible-compact',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'visible-compact',
    props: { title: 'Verdichtungen des Chats', isFocused: false, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  } as const

  // On Windows the engine hands paths over as C:\tmp\...: compare them as /tmp/... Every chat sees the same compaction.
  const plain = (path: string) =>
    path
      .replace(/\\/g, '/')
      .replace(/^[A-Za-z]:/, '')
      .replace(/\/sessions\/[^/]+\//, '/sessions/sitzung-1/')

  /** Disk, store and model from memory; the model answers every request with the same German. */
  function world(on: On, chat = { id: 'sitzung-1' }, store?: Map<string, unknown>) {
    const files = new Map<string, string>([
      [`${DIR}/index.json`, JSON.stringify([META])],
      [
        `${DIR}/v1.after.0.json`,
        JSON.stringify([
          { m: 0, role: 'user', i: 0, n: 1, text: SUMMARY },
          { m: 1, role: 'assistant', i: 0, n: 1, text: TOOL_CALL },
        ]),
      ],
      [`${DIR}/v1.before.0.json`, JSON.stringify([{ m: 0, role: 'user', i: 0, n: 1, text: GERMAN }])],
    ])
    const prompts: string[] = []
    if (store === undefined) mock.store(on)
    else {
      // A store the test reads back.
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
    }
    const clock = mock.clock(on, { now: Date.UTC(2026, 9, 18) })
    on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('session.id', () => ({ value: chat.id }) as never)
    on('env.get', () => ({ value: undefined }) as never)
    on('fs.exists', (_, e) => ({ value: files.has(plain(e.path)) }) as never)
    on('fs.read', (_, e) => ({ value: files.get(plain(e.path)) ?? '' }) as never)
    on('fs.write', (_, e) => {
      files.set(plain(e.path), e.text)
      return { value: undefined } as never
    })
    on('model.complete', (_, e) => {
      prompts.push(e.prompt)
      return {
        value: { isAnswered: true, text: '<uebersetzung>Das ist die Zusammenfassung.\n\n@@CODE1@@\n\nDanach im Browser getestet.</uebersetzung>', usage: {} },
      } as never
    })
    return { files, prompts, chat, clock }
  }

  async function look($: Engine) {
    const ui = await $.ui.mount(PANE as never)
    const found = {
      texts: (await ui.findAll({ type: 'Text' })).map(one => one.text).join('\n'),
      buttons: (await ui.findAll({ type: 'Button' })).map(one => one.text),
      markdown: (await ui.findAll({ type: 'Markdown' })).map(one => String(one.props.text)),
      selects: (await ui.findAll({ type: 'Select' })).length,
    }
    await ui.unmount()
    return found
  }

  async function press($: Engine, key: string) {
    const ui = await $.ui.mount(PANE as never)
    await ui.press({ key })
    await ui.unmount()
  }

  test('ohne Hell-Dunkel-Schalter; die Ansichten stehen in einer eigenen Zeile unter der Auswahl', async ($, on) => {
    world(on)
    await $.session.start({ cwd: '/work', surface: 'desktop' } as never)
    const shown = await look($)
    expect(shown.buttons.some(one => one.includes('☾') || one.includes('☀'))).toBe(false)
    expect(shown.selects).toBe(1)
    expect(shown.buttons).toContain('Übersetzen')

    // Unter dem Fenster: die Auswahl allein, dann die Zeile mit den Ansichten und Übersetzen.
    const ui = await $.ui.mount(PANE as never)
    const root = (await ui.findAll({ type: 'Box' }))[0] as unknown as { children: { type: string; children?: unknown[] }[] }
    await ui.unmount()
    expect(root.children[0]?.type).toBe('Select')
    expect(JSON.stringify(root.children[1])).toContain('◧ Nachher')
    expect(JSON.stringify(root.children[1])).toContain('Übersetzen')
  })

  test('Übersetzen schickt nur die englischen Abschnitte, ohne Code, und zeigt sie auf Deutsch; Original zeigt sie wieder wie sie waren', async ($, on) => {
    const { files, prompts } = world(on)
    await $.session.start({ cwd: '/work', surface: 'desktop' } as never)
    expect((await look($)).markdown).toContain(SUMMARY)

    await press($, 'translate')
    for (let i = 0; i < 50 && ![...files.keys()].some(one => one.includes('.de.')); i++) await Promise.resolve()

    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain('@@CODE1@@')
    expect(prompts[0]).not.toContain('{"a": 1}')
    expect(files.has(`${DIR}/v1.after.de.0.json`)).toBe(true)

    const translated = await look($)
    expect(translated.markdown).toContain('Das ist die Zusammenfassung.\n\n```json\n{"a": 1}\n```\n\nDanach im Browser getestet.')
    // Deutsches und Code stehen da wie vorher.
    expect(translated.markdown).toContain(GERMAN)
    expect(translated.markdown).toContain(TOOL_CALL)
    expect(translated.texts).toContain('· übersetzt')
    expect(translated.buttons).toContain('Original zeigen')

    // Ein zweites Mal kostet nichts: die Übersetzung liegt schon auf der Platte.
    await press($, 'translate')
    expect((await look($)).markdown).toContain(SUMMARY)
    await press($, 'translate')
    expect(prompts).toHaveLength(1)
    expect((await look($)).markdown).toContain('Das ist die Zusammenfassung.\n\n```json\n{"a": 1}\n```\n\nDanach im Browser getestet.')
  })
  const start = ($: Engine) => $.session.start({ cwd: '/work', surface: 'desktop' } as never)
  const isGerman = async ($: Engine) => (await look($)).buttons.includes('Original zeigen')

  test('Übersetzen in Chat A schaltet Chat B nicht mit; A behält seine Wahl beim Fortsetzen', async ($, on) => {
    const { chat } = world(on)
    await start($)
    expect(await isGerman($)).toBe(false)
    await press($, 'translate')
    expect(await isGerman($)).toBe(true)

    chat.id = 'sitzung-2'
    await start($)
    expect(await isGerman($)).toBe(false)

    // Chat A wird fortgesetzt: dieselbe ID, ein neuer Sitzungsstart.
    chat.id = 'sitzung-1'
    await start($)
    expect(await isGerman($)).toBe(true)
  })

  test('ein neuer Chat beginnt mit dem Standard aus den Einstellungen', { options: { uebersetzen: true } }, async ($, on) => {
    const { chat } = world(on)
    await start($)
    expect(await isGerman($)).toBe(true)
    await press($, 'translate')
    expect(await isGerman($)).toBe(false)

    chat.id = 'sitzung-2'
    await start($)
    expect(await isGerman($)).toBe(true)
    chat.id = 'sitzung-1'
    await start($)
    expect(await isGerman($)).toBe(false)
  })

  test('translate und theme von früher gelten nicht mehr und bleiben liegen; fremde Chats gehen nach 30 Tagen', async ($, on) => {
    const TAG = 24 * 60 * 60_000
    const jetzt = Date.UTC(2026, 9, 18)
    const store = new Map<string, unknown>([
      ['translate', true],
      ['theme', 'dark'],
      ['translate:alt', { at: jetzt - 31 * TAG, isOn: true }],
      ['translate:jung', { at: jetzt - 29 * TAG, isOn: true }],
    ])
    const { clock } = world(on, { id: 'sitzung-1' }, store)
    await start($)
    expect(await isGerman($)).toBe(false)
    const keys = async () => [...store.keys()].sort()
    expect(await keys()).toEqual(['theme', 'tidied', 'translate', 'translate:jung'])

    // Am selben Tag wird nicht noch einmal aufgeräumt, am nächsten schon.
    store.set('translate:alt', { at: 0, isOn: true })
    await start($)
    expect(await keys()).toContain('translate:alt')
    await clock.advance(TAG)
    await start($)
    expect(await keys()).not.toContain('translate:alt')
    expect(store.get('translate')).toBe(true)
    expect(store.get('theme')).toBe('dark')
  })
})
