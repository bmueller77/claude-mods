import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Chunk, CompactMeta, Side, ViewMode } from '../types'
import { chunkMessages } from './chunk'
import { TRANSLATE_SYSTEM, maskCode, needsTranslation, readTranslation, unmask } from './translate'

/** Chunks per file: 100 × 4,000 chars stays well under the 4 MiB a file read or write allows. */
export const FILE_CHUNKS = 100

type Storage = 'temp' | 'home'
// From the plugin's settings; a change there reloads the module, so register sets it again.
let storage: Storage = 'temp'
let model = 'haiku'

const baseDir = async ($: EngineInterface) => {
  if (storage === 'home') {
    const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? '.'
    return `${home}/.claude/visible-compact`
  }
  const temp =
    (await $.env.get('TMPDIR')) ?? (await $.env.get('TEMP')) ?? (await $.env.get('TMP')) ?? '/tmp'
  return `${temp.replace(/[\\/]$/, '')}/visible-compact`
}

const sessionDir = async ($: EngineInterface) => `${await baseDir($)}/sessions/${await $.session.id()}`

const chunkFile = (dir: string, id: string, side: Side, file: number) =>
  `${dir}/${id}.${side}.${file}.json`

export const readIndex = async ($: EngineInterface): Promise<CompactMeta[]> => {
  const path = `${await sessionDir($)}/index.json`
  if (!(await $.fs.exists(path))) return []
  try {
    return JSON.parse(await $.fs.read(path)) as CompactMeta[]
  } catch {
    return []
  }
}

export const saveCompaction = async (
  $: EngineInterface,
  meta: CompactMeta,
  chunks: Record<Side, Chunk[]>,
): Promise<CompactMeta[]> => {
  const dir = await sessionDir($)
  for (const side of ['before', 'after'] as const) {
    const list = chunks[side]
    for (let file = 0; file * FILE_CHUNKS < list.length; file++)
      await $.fs.write(
        chunkFile(dir, meta.id, side, file),
        JSON.stringify(list.slice(file * FILE_CHUNKS, (file + 1) * FILE_CHUNKS)),
      )
  }
  const index = [...(await readIndex($)), meta]
  await $.fs.write(`${dir}/index.json`, JSON.stringify(index))

  return index
}

// A few files' worth of chunks, so paging back and forth doesn't re-read.
const cache = new Map<string, Chunk[]>()

export const readChunks = async (
  $: EngineInterface,
  id: string,
  side: Side,
  from: number,
  count: number,
): Promise<Chunk[]> => {
  const dir = await sessionDir($)
  const out: Chunk[] = []
  for (let at = from; at < from + count; ) {
    const file = Math.floor(at / FILE_CHUNKS)
    const path = chunkFile(dir, id, side, file)
    let list = cache.get(path)
    if (list === undefined) {
      if (!(await $.fs.exists(path))) break
      list = JSON.parse(await $.fs.read(path)) as Chunk[]
      cache.set(path, list)
      if (cache.size > 6) cache.delete(cache.keys().next().value!)
    }
    const offset = at - file * FILE_CHUNKS
    const taken = list.slice(offset, offset + (from + count - at))
    if (taken.length === 0) break
    out.push(...taken)
    at += taken.length
  }

  return out
}

// German translations live beside the chunks they translate, one file per FILE_CHUNKS chunks: a map from a chunk's
// number to its German. Only chunks the model translated are in it; German ones and code are shown as they are.
const translationFile = (dir: string, id: string, side: Side, file: number) =>
  `${dir}/${id}.${side}.de.${file}.json`
const translations = new Map<string, Record<number, string>>()

export const readTranslations = async (
  $: EngineInterface,
  id: string,
  side: Side,
  file: number,
): Promise<Record<number, string>> => {
  const path = translationFile(await sessionDir($), id, side, file)
  let map = translations.get(path)
  if (map === undefined) {
    map = {}
    try {
      if (await $.fs.exists(path)) map = JSON.parse(await $.fs.read(path)) as Record<number, string>
    } catch {
      map = {}
    }
    translations.set(path, map)
  }

  return map
}

const saveTranslation = async ($: EngineInterface, id: string, side: Side, at: number, text: string) => {
  const file = Math.floor(at / FILE_CHUNKS)
  const map = await readTranslations($, id, side, file)
  map[at] = text
  await $.fs.write(translationFile(await sessionDir($), id, side, file), JSON.stringify(map))
}

const translateText = async ($: EngineInterface, text: string): Promise<string | null> => {
  const { masked, blocks } = maskCode(text)
  const r = await $.model.complete({
    model,
    maxTokens: 4000,
    timeoutMs: 90_000,
    system: TRANSLATE_SYSTEM,
    prompt: `<text>\n${masked}\n</text>`,
  })
  const german = r.isAnswered ? readTranslation(r.text) : null

  return german === null ? null : unmask(german, blocks)
}

const PANE = 'visible-compact'
const TITLE = 'Verdichtungen des Chats'
const COMMAND = 'show-last-compact'
// Below this many body columns the two sides stack instead of sitting side by side.
const SIDE_BY_SIDE_MIN = 80
// Chunks drawn per page of each column; at 4,000 chars a chunk, a page is at most 40k chars.
const PAGE_CHUNKS = 10
// Translations running at once: the first ones show soon, and a page of twenty doesn't fire twenty calls.
const TRANSLATING_AT_ONCE = 3
// Theme keys, so the colors follow the app's light or dark theme. Each side's color heads its column and marks its
// number in the tokens line.
const COLORS: Record<Side | 'user' | 'assistant', string> = {
  after: 'success',
  before: 'warning',
  user: 'suggestion',
  assistant: 'claude',
}
// Whether chunks are shown in German, per chat: `{ at, isOn }` under `translate:<session id>`. The old keys `translate`
// (for every chat) and `theme` are no longer read, and left alone.
const TRANSLATE_STORE_PREFIX = 'translate:'
// When stale chat keys were last cleared away; chats untouched for 30 days go, at most once a day.
const TIDIED_STORE_NAME = 'tidied'
const CHAT_KEEP_MS = 30 * 24 * 60 * 60_000
const TIDY_EVERY_MS = 24 * 60 * 60_000
// The default for a new chat, from the settings.
let translateByDefault = false

type ChatTranslate = { at: number; isOn: boolean }
const isChatTranslate = (v: unknown): v is ChatTranslate =>
  typeof v === 'object' && v !== null && typeof (v as ChatTranslate).at === 'number' && typeof (v as ChatTranslate).isOn === 'boolean'

/** This chat's choice, else the default; a choice found is marked as touched. */
const loadTranslate = async ($: EngineInterface, sid: string, now: number) => {
  const saved = await $.store.get(TRANSLATE_STORE_PREFIX + sid)
  if (!isChatTranslate(saved)) return translateByDefault
  await $.store.set(TRANSLATE_STORE_PREFIX + sid, { at: now, isOn: saved.isOn })
  return saved.isOn
}

/** Drops other chats' keys untouched for 30 days; at most once a day. */
const tidyChats = async ($: EngineInterface, sid: string, now: number) => {
  const last = await $.store.get(TIDIED_STORE_NAME)
  if (typeof last === 'number' && now - last < TIDY_EVERY_MS) return
  await $.store.set(TIDIED_STORE_NAME, now)
  for (const key of await $.store.keys()) {
    if (!key.startsWith(TRANSLATE_STORE_PREFIX) || key === TRANSLATE_STORE_PREFIX + sid) continue
    const saved = await $.store.get(key)
    if (!isChatTranslate(saved) || now - saved.at > CHAT_KEEP_MS) await $.store.delete(key)
  }
}

const index = atom({ plugin: 'visible-compact', key: 'index' } as const, [])
const selected = atom({ plugin: 'visible-compact', key: 'selected' } as const, null)
const view = atom({ plugin: 'visible-compact', key: 'view' } as const, 'both')
const pages = atom({ plugin: 'visible-compact', key: 'pages' } as const, { before: 0, after: 0 })
const translate = atom({ plugin: 'visible-compact', key: 'translate' } as const, false)
const translation = atom({ plugin: 'visible-compact', key: 'translation' } as const, { open: 0, version: 0, failed: 0 })

// Chunks with the model now, by `${id}.${side}.${number}`, so a second press doesn't send them twice.
const inFlight = new Set<string>()

/** Sends the English chunks on the pages shown to the model, if the translation is on; each shows as it comes back. */
export const translateShown = async ($: EngineInterface) => {
  try {
    if (!(await read($, translate))) return
    const all = await read($, index)
    if (all.length === 0) return
    const pick = await read($, selected)
    const meta = all.find(m => m.id === pick) ?? all[all.length - 1]!
    const mode = await read($, view)
    const page = await read($, pages)
    const jobs: { side: Side; at: number; text: string; key: string }[] = []
    for (const side of mode === 'both' ? (['after', 'before'] as const) : [mode]) {
      const pageCount = Math.max(1, Math.ceil(meta.chunks[side] / PAGE_CHUNKS))
      const from = Math.min(page[side], pageCount - 1) * PAGE_CHUNKS
      const chunks = await readChunks($, meta.id, side, from, PAGE_CHUNKS)
      const done = await readTranslations($, meta.id, side, Math.floor(from / FILE_CHUNKS))
      chunks.forEach((chunk, k) => {
        const at = from + k
        const key = `${meta.id}.${side}.${at}`
        if (done[at] !== undefined || inFlight.has(key) || !needsTranslation(chunk.text)) return
        inFlight.add(key)
        jobs.push({ side, at, text: chunk.text, key })
      })
    }
    if (jobs.length === 0) return
    await update($, translation, t => ({ ...t, open: t.open + jobs.length }))
    const work = async () => {
      for (let job = jobs.shift(); job !== undefined; job = jobs.shift()) {
        let isDone = false
        try {
          const german = await translateText($, job.text)
          if (german !== null) {
            await saveTranslation($, meta.id, job.side, job.at, german)
            isDone = true
          }
        } catch {
          isDone = false
        }
        inFlight.delete(job.key)
        await update($, translation, t => ({
          open: Math.max(0, t.open - 1),
          version: t.version + 1,
          failed: t.failed + (isDone ? 0 : 1),
        }))
      }
    }
    await Promise.all(Array.from({ length: TRANSLATING_AT_ONCE }, work))
  } catch {
    // Nothing shown changes; the chunks stay in their own words.
  }
}

const toggleTranslate = async ($: EngineInterface) => {
  const isOn = await update($, translate, current => !current)
  await $.store.set(TRANSLATE_STORE_PREFIX + (await $.session.id()), { at: await $.clock.now(), isOn })
  if (isOn) {
    await update($, translation, t => ({ ...t, failed: 0 }))
    await translateShown($)
  }
}

const tokens = (n?: number) =>
  n === undefined ? '?' : n >= 1000 ? `${Math.round(n / 1000).toLocaleString('de-DE')}k` : String(n)

const clock = (at: number) => new Date(at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })

const who = (meta: CompactMeta) => (meta.agentId === undefined ? 'Hauptchat' : (meta.agentLabel ?? `Helfer ${meta.agentId}`))

/** What set the compaction off, in German. */
export const triggerLabel = (trigger: CompactMeta['trigger']) =>
  trigger === 'manual' ? 'von Hand' : trigger === 'auto' ? 'automatisch' : 'durch einen Mod'

const optionLabel = (meta: CompactMeta) => `${clock(meta.at)} · ${who(meta)} · ${triggerLabel(meta.trigger)}`

/** "1 Nachricht", "2 Nachrichten". */
export const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const agentLabel = async ($: EngineInterface, agentId: string) => {
  const agent = (await $.agent.list()).find(a => a.id === agentId)

  return agent === undefined ? undefined : `${agent.type}: ${agent.description}`
}

const show = async ($: EngineInterface, id: string | null) => {
  await update($, selected, () => id)
  await update($, pages, () => ({ before: 0, after: 0 }))
}

export const register: Register = (on, options) => {
  storage = options.storage === 'home' ? 'home' : 'temp'
  model = typeof options.modell === 'string' && options.modell.trim() !== '' ? options.modell.trim() : 'haiku'
  translateByDefault = options.uebersetzen === true

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Öffnet "Verdichtungen des Chats" wieder: was verdichtet wurde, neben dem, was danach übrig blieb',
    })
    // Compactions live on disk under the session id, so a restart or --resume picks them up again.
    const saved = await readIndex($)
    await update($, index, () => saved)
    // Restore whether chunks are shown in German, as picked earlier in this chat; a new chat starts with the default.
    const sid = await $.session.id()
    const now = await $.clock.now()
    const isOn = await loadTranslate($, sid, now)
    await update($, translate, () => isOn)
    await tidyChats($, sid, now)
    // A reload drops the calls that were out; their chunks are sent again when next shown.
    await update($, translation, t => ({ ...t, open: 0 }))

    return next(e)
  })

  // /clear goes on under a new session id, with nothing compacted yet.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, index, () => [])
      await show($, null)
    }

    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const started = Date.now()
    const result = await next(e)
    if (e.trigger === 'precompute' || result.skip !== undefined) return result

    const before = chunkMessages(e.messages)
    const after = chunkMessages(result.messages)
    const meta: CompactMeta = {
      id: `${started.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      at: started,
      durationMs: Date.now() - started,
      trigger: e.trigger,
      agentId: e.agentId,
      agentLabel: e.agentId === undefined ? undefined : await agentLabel($, e.agentId),
      instructions: e.instructions,
      tokensBefore: result.tokensBefore,
      tokensAfter: result.tokensAfter,
      usage: result.usage,
      messages: { before: e.messages.length, after: result.messages.length },
      chunks: { before: before.length, after: after.length },
    }
    try {
      const saved = await saveCompaction($, meta, { before, after })
      await update($, index, () => saved)
    } catch (error) {
      $.ui.toast(`visible-compact: Die Verdichtung ließ sich nicht speichern (${String(error)})`)

      return result
    }
    // Your own /compact opens the pane on it; auto and subagent compactions just join the picker.
    if (e.trigger === 'manual' && e.agentId === undefined) {
      await show($, null)
      void $.ui.open({ id: PANE, title: TITLE })
      void translateShown($)
    }

    return result
  })

  on('command.run', { command: COMMAND }, async $ => {
    if ((await read($, index)).length === 0)
      return { text: 'In diesem Chat wurde noch nichts verdichtet. Führ zuerst /compact aus.' }
    await show($, null)
    await $.ui.open({ id: PANE, title: TITLE })
    void translateShown($)

    return { text: '"Verdichtungen des Chats" ist geöffnet.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button, Markdown } = ui
    const all = await read($, index)
    if (all.length === 0) return <Text dimColor>In diesem Chat wurde noch nichts verdichtet.</Text>

    const pick = await read($, selected)
    const meta = all.find(m => m.id === pick) ?? all[all.length - 1]!
    const mode = await read($, view)
    const page = await read($, pages)
    const columns = e.props.bodyColumns
    const isTranslated = await read($, translate)
    // Read while drawing, so each chunk that comes back draws the pane again.
    const progress = await read($, translation)

    const setView = (next: ViewMode) => () => void update($, view, () => next).then(() => translateShown($))
    // Laid out as the columns are: after on the left, before on the right.
    // A Button's label is one plain string, so the selected mode is drawn as bold
    // text in its column's color instead; pressing it would change nothing anyway.
    const modes = [
      { mode: 'after' as const, label: '◧ Nachher', selected: <Text bold color={COLORS.after}>◧ Nachher</Text> },
      {
        mode: 'both' as const,
        label: '◫ Beide',
        selected: (
          <Text>
            <Text bold color={COLORS.after}>◫ Bei</Text>
            <Text bold color={COLORS.before}>de</Text>
          </Text>
        ),
      },
      { mode: 'before' as const, label: '◨ Vorher', selected: <Text bold color={COLORS.before}>◨ Vorher</Text> },
    ]
    const translateNote =
      !isTranslated
        ? null
        : progress.open > 0
          ? `Übersetze … noch ${progress.open}`
          : progress.failed > 0
            ? `${count(progress.failed, 'Abschnitt', 'Abschnitte')} nicht übersetzt`
            : null
    // The modes on a row of their own, under the picker; on its right the translation's switch.
    const toolbar = (
      <Box justifyContent="space-between" marginTop={1}>
        <Box gap={1}>
          {modes.map(m =>
            m.mode === mode ? (
              <Box key={m.mode}>{m.selected}</Box>
            ) : (
              <Button key={m.mode} plain dimColor onPress={setView(m.mode)}>
                {m.label}
              </Button>
            ),
          )}
        </Box>
        <Box gap={1}>
          {translateNote !== null && <Text dimColor>{translateNote}</Text>}
          <Button
            key="translate"
            plain
            label={isTranslated ? 'Original zeigen' : 'Übersetzen'}
            onPress={() => void toggleTranslate($)}
          />
        </Box>
      </Box>
    )

    const newestFirst = [...all].reverse()
    const options = newestFirst.map((m, i) => ({
      value: m.id,
      label: `${i === 0 ? '(neueste) ' : ''}${optionLabel(m)}`,
    }))
    const pickId = (id: string) => void show($, id === newestFirst[0]?.id ? null : id).then(() => translateShown($))
    // Mobile draws no Select: there the latest few are buttons instead.
    const picker =
      'Select' in ui ? (
        <ui.Select key="compaction" label="Verdichtung: " value={meta.id} options={options} onSelect={pickId} />
      ) : (
        <Box flexDirection="column">
          {options.slice(0, 5).map(o => (
            <Button key={o.value} plain dimColor={o.value !== meta.id} onPress={() => pickId(o.value)}>
              {o.label}
            </Button>
          ))}
        </Box>
      )

    // When, who and what triggered it are in the picker; message counts head each column.
    const stats = (
      <Box justifyContent="space-between">
        {/* Only the words are dim, so the bold numbers don't inherit it. */}
        <Text>
          <Text dimColor>Tokens verringert auf </Text>
          <Text bold color={COLORS.after}>
            {tokens(meta.tokensAfter)}
          </Text>
          <Text dimColor> von </Text>
          <Text bold color={COLORS.before}>
            {tokens(meta.tokensBefore)}
          </Text>
        </Text>
        <Text dimColor>Dauer: {(meta.durationMs / 1000).toFixed(1).replace('.', ',')} Sek.</Text>
      </Box>
    )

    // `gap` is the blank rows above the column, so a stacked Before stands apart from After's end.
    const column = async (side: Side, width: number, gap = 1) => {
      const total = meta.chunks[side]
      const pageCount = Math.max(1, Math.ceil(total / PAGE_CHUNKS))
      const at = Math.min(page[side], pageCount - 1)
      const chunks = await readChunks($, meta.id, side, at * PAGE_CHUNKS, PAGE_CHUNKS)
      const german = isTranslated ? await readTranslations($, meta.id, side, Math.floor((at * PAGE_CHUNKS) / FILE_CHUNKS)) : {}
      const turn = (by: number) => () =>
        void update($, pages, p => ({ ...p, [side]: Math.max(0, Math.min(pageCount - 1, at + by)) })).then(() =>
          translateShown($),
        )

      const pager = pageCount > 1 && (
        <Box gap={1}>
          <Button plain dimColor={at === 0} onPress={turn(-1)}>
            ‹ Zurück
          </Button>
          <Text dimColor>
            {at + 1}/{pageCount}
          </Text>
          <Button plain dimColor={at === pageCount - 1} onPress={turn(1)}>
            Weiter ›
          </Button>
        </Box>
      )

      return (
        <Box flexDirection="column" width={width} paddingRight={1} marginTop={gap}>
          <Box justifyContent="space-between">
            <Text bold underline color={COLORS[side]}>
              {side === 'after' ? 'Nachher' : 'Vorher'} ({count(meta.messages[side], 'Nachricht', 'Nachrichten')}, {count(total, 'Abschnitt', 'Abschnitte')})
            </Text>
            {pager}
          </Box>
          {chunks.length === 0 && <Text dimColor>(leer)</Text>}
          {chunks.map((chunk: Chunk, k) => {
            const number = at * PAGE_CHUNKS + k
            const shown = german[number]
            const note =
              shown !== undefined ? ' · übersetzt' : inFlight.has(`${meta.id}.${side}.${number}`) ? ' · wird übersetzt …' : ''

            return (
              <Box key={`${side}-${number}`} flexDirection="column" marginTop={1}>
                <Text dimColor>
                  <Text bold color={chunk.role === 'user' ? COLORS.user : COLORS.assistant}>
                    {chunk.role === 'user' ? 'Person' : 'Claude'}
                  </Text>{' '}
                  · Nachricht {chunk.m + 1}
                  {chunk.n > 1 ? ` · Teil ${chunk.i + 1}/${chunk.n}` : ''}
                  {note}
                </Text>
                <Markdown text={shown ?? chunk.text} />
              </Box>
            )
          })}
          {pager && (
            <Box marginTop={1} justifyContent="flex-end">
              {pager}
            </Box>
          )}
        </Box>
      )
    }

    const isSideBySide = mode === 'both' && columns >= SIDE_BY_SIDE_MIN
    const half = isSideBySide ? Math.floor(columns / 2) : columns
    const body =
      mode === 'after' ? (
        await column('after', columns)
      ) : mode === 'before' ? (
        await column('before', columns)
      ) : (
        <Box flexDirection={isSideBySide ? 'row' : 'column'}>
          {await column('after', half)}
          {await column('before', half, isSideBySide ? 1 : 3)}
        </Box>
      )

    return (
      <Box flexDirection="column">
        {picker}
        {toolbar}
        {stats}
        <Box marginTop={1}>
          <Text wrap="wrap">
            <Text bold>Anweisungen: </Text>
            {meta.instructions ?? <Text dimColor>keine hinter /compact angegeben (nur die übliche Anweisung für die Zusammenfassung)</Text>}
          </Text>
        </Box>
        {body}
      </Box>
    )
  })
}
