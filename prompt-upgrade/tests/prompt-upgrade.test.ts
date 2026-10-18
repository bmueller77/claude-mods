import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
    GRUND_ABGEFANGEN,
    PANE,
    SPEICHER_AUTOMATIK,
    SPEICHER_VERLAUF,
    TEXT_AN,
    TEXT_AUS,
    TEXT_EINGABE,
    TEXT_HANDY,
    TEXT_OFFEN,
    TEXT_ZU_SCHMAL,
    leseBefehl,
    verlaufText,
} from '../hooks/register'
import {
    SYSTEM_FRAGEN,
    SYSTEM_UMSCHREIBEN,
    abdeckungZeile,
    entscheide,
    grosseZahl,
    istKurzeAntwort,
    kuerze,
    leseAbdeckung,
    leseFragen,
    leseUmschrift,
    packe,
    platzhalter,
    spur,
    umbrechen,
    woerter,
    zellen,
} from '../hooks/logik'

const FLAECHEN = ['terminal', 'desktop'] as const
type Flaeche = (typeof FLAECHEN)[number]

const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const ORIGINAL = 'Mach die Login-Seite schneller'

const FRAGEN = JSON.stringify({
    fragen: [
        { frage: 'Für wen ist die Seite?', optionen: ['Kunden', 'Team intern'] },
        { frage: 'Welches Ergebnis willst du?', optionen: ['Code', 'Plan', 'Beides'] },
    ],
})

const UPGRADE =
    'Mach die Login-Seite für Team intern schneller: Ziel ist eine Ladezeit unter [Zielzeit]. ' +
    'Liefere den geänderten Code mit einem kurzen Vorher-Nachher-Vergleich. Fertig ist es, wenn die Seite messbar schneller lädt und alle Tests grün sind.'

const ABDECKUNG = '<abdeckung>auftrag=ja warum=nein leitplanken=nein fertig=ja</abdeckung>'

const UMSCHRIFT = `<upgrade>\n${UPGRADE}\n</upgrade>\n<ergaenzt>\n- Ziel: messbare Ladezeit\n- Zielgruppe aus der Antwort\n- Format: Code mit Vergleich\n- Wann es fertig ist\n</ergaenzt>\n${ABDECKUNG}`

/** Wie das Modell vor 0.2.0 antwortete: ohne Abdeckung. */
const UMSCHRIFT_OHNE = `<upgrade>\n${UPGRADE}\n</upgrade>\n<ergaenzt>\n- Ziel: messbare Ladezeit\n</ergaenzt>`

/** Die Abdeckungszeile, egal in welcher Breite: ein Kernteil mit Haekchen oder Strich davor. */
const ABDECKUNGS_ZEILE = /[✓–] (Auftrag|Warum|Leitplanken|Grenzen|Fertig)|Kernteile/

type Antwort = string | { grund: 'api-error' | 'empty-reply' } | { spaeter: number; text: string }

type Eingang = { text: string; origin: string; asUser: boolean }

/**
 * Der Boden unter dem Mod: was die Engine sonst beantworten wuerde.
 *
 * `antworten` sind die Antworten des Modells der Reihe nach (die letzte gilt
 * fuer alle weiteren); `spaeter` antwortet erst, wenn die Uhr so weit ist.
 * Zurueck kommt, was unten ankam, damit ein Test es zaehlen kann.
 */
function boden(on: On, clock: MockClock, x: { antworten?: Antwort[]; platz?: boolean; offen?: () => boolean } = {}) {
    const b = {
        chat: 'chat-a',
        feld: '',
        eingang: [] as Eingang[],
        gefuellt: [] as { text: string; mode: string }[],
        geoeffnet: [] as string[],
        geschlossen: [] as string[],
        logs: [] as string[],
        modell: [] as { system: string; prompt: string }[],
        kopiert: [] as string[],
    }
    const antworten = x.antworten ?? [FRAGEN, UMSCHRIFT]
    on('session.start', (_$, e, _next) => ({ cwd: e.cwd }))
    on('session.id', (_$, _e, _next) => ({ value: b.chat }) as never)
    on('command.register', (_$, e, _next) => ({ value: { command: e.name } }) as never)
    on('turn.start', (_$, e, _next) => ({ turnId: e.turnId }))
    on('turn.complete', (_$, e, _next) => ({ text: e.answer }) as never)
    on('prompt.submit', (_$, e, _next) => {
        const o = e.origin as { kind: string; name?: string; asUser?: boolean }
        b.eingang.push({ text: e.text, origin: o.name ? `${o.kind}:${o.name}` : o.kind, asUser: o.asUser === true })
        return { text: e.text, origin: e.origin }
    })
    on('prompt.fill', (_$, e, _next) => {
        b.gefuellt.push({ text: e.text, mode: e.mode })
        return { isFilled: true }
    })
    on('prompt.read', (_$, _e, _next) => ({ value: { text: b.feld, cursor: 0 } }) as never)
    on('ui.open', (_$, e, _next) => {
        b.geoeffnet.push(e.id)
        return { value: x.platz === false ? { isPlaced: false, reason: 'unasked below 144 columns: 60' } : { isPlaced: true } } as never
    })
    on('ui.close', (_$, e, _next) => {
        b.geschlossen.push(e.id)
        return { value: undefined } as never
    })
    on('ui.panes', (_$, _e, _next) => {
        const offen = x.offen?.() ?? true
        return { value: offen ? [{ id: PANE, title: 'Prompt-Upgrade', isShown: true, isFocused: false, isPlaced: true }] : [] } as never
    })
    on('ui.log', (_$, e, _next) => {
        b.logs.push(e.text)
        return { value: undefined } as never
    })
    on('ui.copy', (_$, e, _next) => {
        b.kopiert.push(e.text)
        return { value: { isCopied: true } } as never
    })
    on('model.complete', async (_$, e, _next) => {
        const a = antworten[Math.min(b.modell.length, antworten.length - 1)] ?? FRAGEN
        b.modell.push({ system: e.system ?? '', prompt: e.prompt })
        if (typeof a === 'object' && 'grund' in a) {
            return {
                value:
                    a.grund === 'api-error'
                        ? { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE }
                        : { isAnswered: false, reason: 'empty-reply', usage: USAGE },
            } as never
        }
        if (typeof a === 'object') {
            await clock.sleep(a.spaeter)
            return { value: { isAnswered: true, text: a.text, usage: USAGE } } as never
        }
        return { value: { isAnswered: true, text: a, usage: USAGE } } as never
    })
    return b
}

async function start($: Engine) {
    await $.session.start({ cwd: '/projekt', surface: 'terminal', isInteractive: true } as never)
}

async function befehl($: Engine, args: string, art = 'composer'): Promise<string> {
    const r = await $.command.run({ command: 'better', args, origin: { kind: art }, presentation: { isFullscreen: true, columns: 160 } } as never)
    return String(r.text ?? '')
}

/** Ein Prompt, abgeschickt; zurueck kommt, was die Kette daraus machte. */
async function tippe($: Engine, text: string, x: { art?: string; turnId?: string; attachments?: unknown[] } = {}) {
    return (await $.prompt.submit({
        text,
        wait: false,
        origin: { kind: x.art ?? 'composer' },
        ...(x.turnId ? { turnId: x.turnId } : {}),
        ...(x.attachments ? { attachments: x.attachments } : {}),
    } as never)) as { text?: string; drop?: string }
}

function fensterProps(breite: number) {
    return {
        title: 'Prompt-Upgrade',
        isFocused: true,
        bodyColumns: breite,
        placement: breite >= 110 ? 'dock' : 'inline',
        scroll: { offset: 0, bodyRows: 40, isAtTop: true, isAtBottom: true },
        view: {},
    } as never
}

type Gezeichnet = {
    drawn: () => Promise<unknown>
    press: (t: { key: string }) => Promise<unknown>
    find: (q: { type?: string; key?: string; text?: string | RegExp }) => Promise<{ props: Record<string, unknown> } | undefined>
    unmount: () => Promise<void>
}

async function zeige($: Engine, surface: Flaeche, breite = 100): Promise<Gezeichnet> {
    return (await $.ui.mount({ plugin: 'prompt-upgrade', surface, component: 'Pane', requestId: PANE, props: fensterProps(breite) })) as never
}

/** Tippen in ein Eingabefeld des Fensters (nur Flaechen mit Input). */
async function tippeInsFeld(ui: Gezeichnet, key: string, text: string, kind: 'submit' | 'change' = 'submit') {
    await (ui as unknown as { input: (t: { key: string; text: string; kind: string }) => Promise<unknown> }).input({ key, text, kind })
}

type El = { type?: string; props?: Record<string, unknown>; children?: unknown[] }

/** Der Baum flach: Texte in Reihenfolge, Knoepfe als [key], Felder als <key>. */
function flach(n: unknown, aus: string[] = []): string[] {
    if (typeof n === 'string') {
        aus.push(n)
    } else if (Array.isArray(n)) {
        n.forEach(k => flach(k, aus))
    } else if (n && typeof n === 'object') {
        const el = n as El
        if (el.type === 'Button') {
            aus.push(`[${String(el.props?.key)}]`)
        }
        if (el.type === 'Input') {
            aus.push(`<${String(el.props?.key)}>`)
        }
        flach(el.children ?? [], aus)
    }
    return aus
}

async function inhalt(ui: Gezeichnet): Promise<string> {
    return flach(await ui.drawn()).join('|')
}

// --- Breitenpruefung: keine Zeile breiter als ihr Platz ---

function zahl(v: unknown): number {
    return typeof v === 'number' ? v : 0
}

function kinderVon(el: El): unknown[] {
    return (el.children ?? []).filter(k => k !== null && k !== undefined && k !== false)
}

/** Breite eines Texts samt eingebetteter Texte: die laengste Zeile. */
function textBreite(kinder: unknown[]): number {
    const s = flachText(kinder)
    return Math.max(0, ...s.split('\n').map(z => zellen(z)))
}

function flachText(n: unknown): string {
    if (typeof n === 'string') {
        return n
    }
    if (Array.isArray(n)) {
        return n.map(flachText).join('')
    }
    if (n && typeof n === 'object') {
        return flachText((n as El).children ?? [])
    }
    return ''
}

function rand(el: El): { rahmen: number; innenAbstand: number } {
    const p = el.props ?? {}
    const rahmen = p.borderStyle ? 2 : 0
    const x = zahl(p.paddingX) || zahl(p.padding)
    const innenAbstand = 2 * x + zahl(p.paddingLeft) + zahl(p.paddingRight)
    return { rahmen, innenAbstand }
}

/** Wie breit ein Element von selbst wird, gemessen wie das Terminal zeichnet. */
function natur(n: unknown, terminal: boolean): number {
    if (typeof n === 'string') {
        return zellen(n)
    }
    if (!n || typeof n !== 'object') {
        return 0
    }
    const el = n as El
    const p = el.props ?? {}
    const kinder = kinderVon(el)
    if (el.type === 'Text') {
        return textBreite(kinder)
    }
    if (el.type === 'Button') {
        if (terminal && kinder.length > 0) {
            return textBreite(kinder)
        }
        return zellen(String(p.label ?? '')) + (p.plain ? 0 : 4)
    }
    if (el.type === 'Input') {
        return 0
    }
    if (typeof p.width === 'number') {
        return p.width
    }
    const { rahmen, innenAbstand } = rand(el)
    const breiten = kinder.map(k => natur(k, terminal))
    const reihe = p.flexDirection === 'row'
    const abstand = zahl(p.columnGap) || zahl(p.gap)
    const inhaltBreite = reihe ? breiten.reduce((s, w) => s + w, 0) + abstand * Math.max(0, breiten.length - 1) : Math.max(0, ...breiten)
    return inhaltBreite + rahmen + innenAbstand
}

/** Sammelt jede Stelle, an der ein Element breiter ist als sein Platz. */
function pruefeBreite(n: unknown, platz: number, terminal: boolean, pfad: string, fehler: string[]): void {
    if (!n || typeof n !== 'object' || Array.isArray(n)) {
        return
    }
    const el = n as El
    const w = natur(el, terminal)
    if (w > platz) {
        fehler.push(`${pfad}/${el.type}: ${w} > ${platz} (${kuerze(flachText(el.children ?? []), 50)})`)
    }
    if (el.type !== 'Box') {
        return
    }
    const p = el.props ?? {}
    const { rahmen, innenAbstand } = rand(el)
    const innen = (typeof p.width === 'number' ? p.width : platz) - rahmen - innenAbstand
    const kinder = kinderVon(el)
    if (p.flexDirection === 'row') {
        const abstand = zahl(p.columnGap) || zahl(p.gap)
        const summe = kinder.reduce((s: number, k) => s + natur(k, terminal), 0) + abstand * Math.max(0, kinder.length - 1)
        if (summe > innen) {
            fehler.push(`${pfad}/Box(row): ${summe} > ${innen}`)
        }
        kinder.forEach((k, i) => pruefeBreite(k, natur(k, terminal), terminal, `${pfad}/${i}`, fehler))
    } else {
        kinder.forEach((k, i) => pruefeBreite(k, innen, terminal, `${pfad}/${i}`, fehler))
    }
}

async function breiteOk(ui: Gezeichnet, breite: number, surface: Flaeche, schritt: string) {
    const fehler: string[] = []
    pruefeBreite(await ui.drawn(), breite, surface === 'terminal', `${surface}@${breite}:${schritt}`, fehler)
    expect(fehler).toEqual([])
}

// --- Reine Logik ---

test('Abfangen: was ins Fenster geht und was unveraendert durchgeht', () => {
    const an = { automatik: true, arbeitet: false }
    const getippt = (text: string, x: Record<string, unknown> = {}) => ({ text, origin: { kind: 'composer' }, ...x })
    const art = (e: Parameters<typeof entscheide>[0], lage = an) => entscheide(e, lage).art

    expect(art(getippt(ORIGINAL))).toBe('abfangen')
    expect(art(getippt('Tests reparieren'))).toBe('abfangen')
    expect(art(getippt('Fix the flaky login test'))).toBe('abfangen')
    // Automatik aus: nichts.
    expect(art(getippt(ORIGINAL), { automatik: false, arbeitet: false })).toBe('durch')
    // Vom Handy, von Plugins, vom SDK, aus Zeitplaenen: durch.
    for (const kind of ['bridge', 'plugin', 'sdk', 'scheduled-trigger', 'peer', 'task-notification', 'unclassified']) {
        expect(art({ text: ORIGINAL, origin: { kind } })).toBe('durch')
    }
    expect(art({ text: ORIGINAL })).toBe('durch')
    // Befehle, Bash, Anhaenge, @-Dateien, waehrend Claude arbeitet, verborgene.
    expect(art(getippt('/compact', { command: { name: 'compact', args: '' } }))).toBe('durch')
    expect(art(getippt('/irgendwas mit Text'))).toBe('durch')
    expect(art(getippt('!ls -la'))).toBe('durch')
    expect(art(getippt(ORIGINAL, { attachments: [{ type: 'image' }] }))).toBe('durch')
    expect(art(getippt('Erklaer mir @src/login.ts bitte genauer'))).toBe('durch')
    expect(art(getippt(ORIGINAL, { turnId: 't1' }))).toBe('durch')
    expect(art(getippt(ORIGINAL), { automatik: true, arbeitet: true })).toBe('durch')
    expect(art(getippt(ORIGINAL, { isMeta: true }))).toBe('durch')
    // Kurze Antworten.
    for (const kurz of ['ja', 'Ja!', 'Mach weiter.', 'keep going', 'ok danke', 'ja bitte', '2', '1 und 3', 'LGTM', 'go ahead', 'Weiter']) {
        expect(art(getippt(kurz)), kurz).toBe('durch')
    }
    // > vorn: das Zeichen weg, sonst unveraendert.
    expect(entscheide(getippt('> Mach das direkt'), an)).toEqual({ art: 'ohneZeichen', text: 'Mach das direkt' })
    expect(entscheide(getippt('>Zeile eins\nZeile zwei'), an)).toEqual({ art: 'ohneZeichen', text: 'Zeile eins\nZeile zwei' })
    expect(art(getippt('>'))).toBe('durch')
    expect(art(getippt('> egal', { turnId: 't1' }))).toBe('ohneZeichen')

    expect(istKurzeAntwort('Bau mir eine Seite mit Preisen')).toBe(false)
    expect(leseBefehl('  AN ')).toEqual({ art: 'an' })
    expect(leseBefehl('off')).toEqual({ art: 'aus' })
    expect(leseBefehl('history')).toEqual({ art: 'verlauf' })
    expect(leseBefehl('verlauf')).toEqual({ art: 'verlauf' })
    expect(leseBefehl('')).toEqual({ art: 'leer' })
    expect(leseBefehl(' Mach was ')).toEqual({ art: 'prompt', text: 'Mach was' })
})

test('Fragen lesen: JSON, im Zaun, als Zeilen, gekappt und gesaeubert', () => {
    expect(leseFragen(FRAGEN)).toEqual([
        { frage: 'Für wen ist die Seite?', optionen: ['Kunden', 'Team intern'] },
        { frage: 'Welches Ergebnis willst du?', optionen: ['Code', 'Plan', 'Beides'] },
    ])
    expect(leseFragen('```json\n{"fragen":[{"frage":"A?","optionen":["x","y"]}]}\n```')).toEqual([{ frage: 'A?', optionen: ['x', 'y'] }])
    // Hoechstens drei Fragen, je hoechstens vier Antworten; unter zwei faellt die Frage weg; doppelte Antworten einmal.
    const viele = JSON.stringify({
        fragen: [
            { frage: 'Eins?', optionen: ['a', 'b', 'c', 'd', 'e'] },
            { frage: 'Zu wenig?', optionen: ['nur eine'] },
            { frage: 'Zwei?', optionen: ['a', 'A', 'b'] },
            { frage: 'Drei?', optionen: ['a', 'b'] },
            { frage: 'Vier?', optionen: ['a', 'b'] },
        ],
    })
    expect(leseFragen(viele)).toEqual([
        { frage: 'Eins?', optionen: ['a', 'b', 'c', 'd'] },
        { frage: 'Zwei?', optionen: ['a', 'b'] },
        { frage: 'Drei?', optionen: ['a', 'b'] },
    ])
    expect(leseFragen('Hier sind sie: [{"question":"Wer?","options":["Ich","Du"]}]')).toEqual([{ frage: 'Wer?', optionen: ['Ich', 'Du'] }])
    expect(leseFragen('1. Für wen?\n- Kunden\n- Team\n2. Welches Format?\n- Code\n- Text')).toEqual([
        { frage: 'Für wen?', optionen: ['Kunden', 'Team'] },
        { frage: 'Welches Format?', optionen: ['Code', 'Text'] },
    ])
    expect(leseFragen('{"fragen":[]}')).toEqual([])
    expect(leseFragen('Keine Fragen noetig.')).toEqual([])
    expect(leseFragen('')).toEqual([])
    // Ueberlange Antworten werden gekuerzt.
    const lang = leseFragen(JSON.stringify({ fragen: [{ frage: 'X?', optionen: ['a'.repeat(80), 'b'] }] }))
    expect(zellen(lang[0]!.optionen[0]!)).toBe(40)
})

test('Umschrift lesen: Marken, JSON, roher Text', () => {
    expect(leseUmschrift(UMSCHRIFT)).toEqual({
        upgrade: UPGRADE,
        ergaenzt: ['Ziel: messbare Ladezeit', 'Zielgruppe aus der Antwort', 'Format: Code mit Vergleich', 'Wann es fertig ist'],
        abdeckung: { auftrag: true, warum: false, leitplanken: false, fertig: true },
    })
    expect(leseUmschrift('<upgrade>\n"Bitte tu X."\n</upgrade>')).toEqual({ upgrade: 'Bitte tu X.', ergaenzt: [], abdeckung: null })
    expect(leseUmschrift('<upgrade>Ohne Ende')).toEqual({ upgrade: 'Ohne Ende', ergaenzt: [], abdeckung: null })
    expect(leseUmschrift('{"upgrade":"Tu Y.","ergaenzt":["Ziel"]}')).toEqual({ upgrade: 'Tu Y.', ergaenzt: ['Ziel'], abdeckung: null })
    expect(leseUmschrift('```\nUpgrade: Tu Z.\n\n\n\nGenau so.\n```')).toEqual({ upgrade: 'Tu Z.\n\nGenau so.', ergaenzt: [], abdeckung: null })
    expect(leseUmschrift('<upgrade>\n   \n</upgrade>')).toBeNull()
    expect(leseUmschrift('')).toBeNull()
    expect(platzhalter(UPGRADE)).toEqual(['[Zielzeit]'])
})

test('Prompt-Texte folgen dem Guide: Warum, Fertig, Gruende statt Verbote, keine Einzelschritte, keine Extra-Prüfung', () => {
    const f = SYSTEM_FRAGEN.toLowerCase()
    // Rueckfragen zielen auf blinde Flecken, in der Rangfolge Warum, Fertig, Leitplanken, erst dann Format.
    expect(f).toMatch(/blinde[nm]? fleck/)
    expect(f).toMatch(/selbstverständlich/)
    const rang = ['warum', 'fertig', 'leitplanken', 'format'].map(w => f.indexOf(w))
    expect(rang.every(i => i >= 0)).toBe(true)
    expect(rang).toEqual([...rang].sort((x, y) => x - y))
    expect(f).toMatch(/nicht nach dem wie in einzelschritten/)
    // Unveraendert: hoechstens drei Fragen, zwei bis vier Optionen, Sprache des Prompts, JSON-Form.
    expect(f).toMatch(/höchstens drei/)
    expect(f).toMatch(/zwei bis vier/)
    expect(f).toMatch(/sprache des prompts/)
    expect(SYSTEM_FRAGEN).toContain('{"fragen":[{"frage":"...?","optionen":["...","..."]}]}')

    const u = SYSTEM_UMSCHREIBEN.toLowerCase()
    expect(u).toMatch(/ganzen auftrag als ergebnis, nicht als schrittfolge/)
    expect(u).toMatch(/keine einzelschritte/)
    // Das Warum nach Muster, mit Platzhaltern.
    expect(u).toMatch(/warum[^.]*ich arbeite an \[[^\]]+\] für \[[^\]]+\]/)
    // Fertig: pruefbare Bedingung, Abbruchkriterium, erst arbeiten, dann fragen.
    expect(u).toMatch(/fertig ist es, wenn/)
    expect(u).toMatch(/prüfbar/)
    expect(u).toMatch(/abbruchkriterium/)
    expect(u).toMatch(/erledige zuerst die arbeit, bevor du rückfragen stellst/)
    // Leitplanken als Gruende statt Verbote.
    expect(u).toMatch(/leitplanken[^.]*grund statt[^.]*verbot/)
    // Kein offengelegter Gedankengang, keine Extra-Pruefschleife, keine Rollen-Tricks; Ausnahme nur bei hohem Risiko.
    expect(u).toMatch(/lass weg[^.]*überlegungen offenzulegen/)
    expect(u).toMatch(/lass weg[^.]*schritt für schritt zu denken/)
    expect(u).toMatch(/lass weg[^.]*(selbstprüfung|zweiten prüfer)/)
    expect(u).toMatch(/lass weg[^.]*du bist ein experte/)
    expect(u).toMatch(/teuer[^.]*(kunden|verträge)/)
    // Form: hoechstens vier Absaetze in der Reihenfolge des Guides, Ausgabe mit Abdeckung.
    expect(u).toMatch(/höchstens vier kurze absätze in der reihenfolge auftrag, warum, leitplanken, fertig/)
    expect(u).toMatch(/aufzählungen nur für wirklich parallele/)
    expect(SYSTEM_UMSCHREIBEN).toContain('<abdeckung>auftrag=ja|nein warum=ja|nein leitplanken=ja|nein fertig=ja|nein</abdeckung>')
    expect(SYSTEM_UMSCHREIBEN).toContain('<upgrade>')
    expect(SYSTEM_UMSCHREIBEN).toContain('<ergaenzt>')
})

test('Abdeckung lesen: Schreibweisen und Reihenfolge egal, fehlt oder kaputt heisst null', () => {
    const alle = { auftrag: true, warum: true, leitplanken: true, fertig: true }
    expect(leseAbdeckung('<abdeckung>auftrag=ja warum=ja leitplanken=ja fertig=ja</abdeckung>')).toEqual(alle)
    expect(leseAbdeckung('Vorweg.\n<Abdeckung>\n  Fertig = YES, Warum: no;\n LEITPLANKEN=false   auftrag = True\n</ABDECKUNG>')).toEqual({
        auftrag: true,
        warum: false,
        leitplanken: false,
        fertig: true,
    })
    expect(leseAbdeckung('<abdeckung>Hinweis: warum="nein" fertig wenn=ja task=yes grenzen=n</abdeckung>')).toEqual({
        auftrag: true,
        warum: false,
        leitplanken: false,
        fertig: true,
    })
    // Ohne schliessende Marke am Ende der Antwort.
    expect(leseAbdeckung('<abdeckung>auftrag=nein warum=nein leitplanken=nein fertig=nein')).toEqual({
        auftrag: false,
        warum: false,
        leitplanken: false,
        fertig: false,
    })
    // Fehlt, unvollstaendig, unlesbar, nur die Vorlage abgeschrieben: keine Abdeckung.
    expect(leseAbdeckung(UMSCHRIFT_OHNE)).toBeNull()
    expect(leseAbdeckung('')).toBeNull()
    expect(leseAbdeckung('<abdeckung></abdeckung>')).toBeNull()
    expect(leseAbdeckung('<abdeckung>auftrag=ja warum=ja fertig=ja</abdeckung>')).toBeNull()
    expect(leseAbdeckung('<abdeckung>auftrag=ja warum=ja leitplanken=vielleicht fertig=ja</abdeckung>')).toBeNull()
    expect(leseAbdeckung('<abdeckung>auftrag=ja|nein warum=ja|nein leitplanken=ja|nein fertig=ja|nein</abdeckung>')).toBeNull()

    // Im Ganzen gelesen: die Abdeckung landet nie im Upgrade, auch bei offenen Marken.
    expect(leseUmschrift('<upgrade>\nTu X.\n<ergaenzt>\n- Ziel\n<abdeckung>auftrag=ja warum=nein leitplanken=nein fertig=nein')).toEqual({
        upgrade: 'Tu X.',
        ergaenzt: ['Ziel'],
        abdeckung: { auftrag: true, warum: false, leitplanken: false, fertig: false },
    })
    expect(leseUmschrift('Tu Z.\n<abdeckung>auftrag=ja warum=ja leitplanken=ja fertig=ja</abdeckung>')).toEqual({
        upgrade: 'Tu Z.',
        ergaenzt: [],
        abdeckung: alle,
    })
    expect(
        leseUmschrift('{"upgrade":"Tu Y.","ergaenzt":["Ziel"],"abdeckung":{"auftrag":true,"warum":true,"leitplanken":false,"fertig":true}}'),
    ).toEqual({ upgrade: 'Tu Y.', ergaenzt: ['Ziel'], abdeckung: { auftrag: true, warum: true, leitplanken: false, fertig: true } })
    expect(leseUmschrift(`${UMSCHRIFT_OHNE}\n<abdeckung>kaputt</abdeckung>`)?.abdeckung).toBeNull()

    // Die Zeile: so lang wie sie passt, dann kuerzere Namen, zuletzt nur die Zaehlung.
    const ab = { auftrag: true, warum: false, leitplanken: true, fertig: true }
    const zeile = (b: number) => abdeckungZeile(ab, b).map(t => t.text).join('')
    expect(zeile(120)).toBe('✓ Auftrag  – Warum  ✓ Leitplanken  ✓ Fertig wenn')
    expect(zeile(48)).toBe('✓ Auftrag  – Warum  ✓ Leitplanken  ✓ Fertig wenn')
    expect(zeile(40)).toBe('✓ Auftrag  – Warum  ✓ Grenzen  ✓ Fertig')
    expect(zeile(36)).toBe('✓ Auftrag – Warum ✓ Grenzen ✓ Fertig')
    expect(zeile(30)).toBe('3/4 Kernteile')
    expect(abdeckungZeile(ab, 120).filter(t => t.art !== 'luecke').map(t => t.art)).toEqual(['ja', 'nein', 'ja', 'ja'])
    for (const b of [120, 48, 47, 40, 39, 36, 35, 30, 20, 13]) {
        expect(zellen(zeile(b))).toBeLessThanOrEqual(b)
    }
})

test('Woerter, Zellen, Umbruch, Packen, Schrittleiste und grosse Ziffern', () => {
    expect(woerter(ORIGINAL)).toBe(4)
    expect(woerter('  ')).toBe(0)
    expect(zellen('Prüfen')).toBe(6)
    expect(zellen('日本')).toBe(4)
    expect(kuerze('Ein Satz, der zu lang ist', 10)).toBe('Ein Satz,…')
    expect(zellen(kuerze('Ein Satz, der zu lang ist', 10))).toBeLessThanOrEqual(10)
    for (const b of [10, 20, 37]) {
        for (const z of umbrechen(`${UPGRADE}\n\nZweiter Absatz mit einemsehrsehrsehrlangenwortdasnichtpasst.`, b)) {
            expect(zellen(z)).toBeLessThanOrEqual(b)
        }
    }
    expect(umbrechen('a b c', 3)).toEqual(['a b', 'c'])
    expect(packe([5, 5, 5], 11)).toEqual([[0, 1], [2]])
    expect(packe([20, 3], 10)).toEqual([[0], [1]])
    for (const b of [120, 54, 40, 25, 20]) {
        for (let aktuell = 0; aktuell < 4; aktuell += 1) {
            const teile = spur(aktuell, b)
            expect(teile.reduce((n, t) => n + zellen(t.text), 0)).toBeLessThanOrEqual(b)
        }
    }
    const voll = spur(2, 120)
    expect(voll.map(t => t.text).join('')).toBe('✓ Dein Prompt ── ✓ Fragen ── 3 Umschreiben ── 4 Prüfen')
    expect(voll.filter(t => t.art !== 'linie').map(t => t.art)).toEqual(['fertig', 'fertig', 'aktuell', 'offen'])
    expect(spur(1, 40).map(t => t.text).join('')).toBe('✓ ─ 2 Fragen ─ 3 ─ 4')
    expect(grosseZahl(42)).toEqual(['╻ ╻ ╺━┓', '┗━┫ ┏━┛', '  ╹ ┗━╸'])
    expect(grosseZahl(7).every(z => zellen(z) === 3)).toBe(true)
})

// --- Ablaeufe ---

test('der ganze Weg: /better, Fragen, Umschreiben, Pruefen, Ausfuehren', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)

    for (const surface of FLAECHEN) {
        b.eingang.length = 0
        b.modell.length = 0
        expect(await befehl($, ORIGINAL)).toBe(TEXT_OFFEN)
        await clock.settle()
        expect(b.geoeffnet.at(-1)).toBe(PANE)
        expect(b.modell).toHaveLength(1)
        expect(b.modell[0]!.prompt).toContain(`<prompt>\n${ORIGINAL}\n</prompt>`)
        expect(b.modell[0]!.system).toContain('höchstens drei Multiple-Choice-Fragen')

        const ui = await zeige($, surface)
        let text = await inhalt(ui)
        expect(text).toContain('PROMPT-UPGRADE')
        expect(text).toContain('Für wen ist die Seite?')
        expect(text).toContain('0 von 2 beantwortet')
        expect(text).toContain('[rest]')
        expect(text).toContain('[f0-o1]')
        expect(text).toContain('[f0-anders]')
        expect(text).toContain('[f1-skip]')

        await ui.press({ key: 'f0-o1' })
        text = await inhalt(ui)
        expect(text).toContain('1 von 2 beantwortet')
        expect(b.modell).toHaveLength(1)

        // Die letzte Frage uebersprungen: jetzt wird umgeschrieben.
        await ui.press({ key: 'f1-skip' })
        await clock.settle()
        expect(b.modell).toHaveLength(2)
        expect(b.modell[1]!.prompt).toContain('Antwort: Team intern')
        expect(b.modell[1]!.prompt).not.toContain('Welches Ergebnis')
        expect(b.modell[1]!.system).toContain('derselben Sprache wie der Original-Prompt')

        text = await inhalt(ui)
        expect(text).toContain('Prüfen')
        expect(text).toContain('[ausfuehren]')
        expect(text).toContain('[bearbeiten]')
        expect(text).toContain('[kopieren]')
        expect(text).toContain('[abbrechen]')
        expect(text).toContain('WAS ICH ERGÄNZT HABE')
        expect(text).toContain('Ziel: messbare Ladezeit')
        expect(text).toContain('[Zielzeit]')
        // Die Knoepfe stehen vor den Karten.
        expect(text.indexOf('[ausfuehren]')).toBeLessThan(text.indexOf('DEIN PROMPT'))
        expect(text.indexOf('DEIN PROMPT')).toBeLessThan(text.indexOf('|UPGRADE|'))
        // Die Abdeckung: enthaltene Kernteile mit Haekchen, fehlende mit Strich, vor den Knoepfen.
        expect(text).toContain('✓ Auftrag')
        expect(text).toContain('– Warum')
        expect(text).toContain('– Leitplanken')
        expect(text).toContain('✓ Fertig wenn')
        expect(text.indexOf('✓ Auftrag')).toBeLessThan(text.indexOf('[ausfuehren]'))
        expect((await ui.find({ type: 'Text', text: /^✓ Auftrag$/ }))?.props.color).toBe('#3DD68C')
        expect((await ui.find({ type: 'Text', text: /^– Warum$/ }))?.props.color).toBe('#7D8590')
        if (surface === 'terminal') {
            // Woerter vorher und nachher als grosse Ziffern in Kacheln, die Abdeckung darunter.
            expect(text).toContain('WÖRTER VORHER')
            expect(text.indexOf('WÖRTER VORHER')).toBeLessThan(text.indexOf('✓ Auftrag'))
            expect(text).toContain(grosseZahl(woerter(ORIGINAL))[0])
        } else {
            // In der App ist Text nicht gleich breit: Kacheln und Linien als Grafik.
            const grafiken = await (ui as unknown as { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }).findAll({ type: 'Svg' })
            const kacheln = grafiken.find(g => String(g.props.alt).startsWith('Wörter vorher'))
            expect(kacheln?.props.alt).toBe(`Wörter vorher ${woerter(ORIGINAL)}, nachher ${woerter(UPGRADE)}, 4 ergänzt`)
            expect(String(kacheln?.props.source)).toContain('WÖRTER NACHHER')
            expect(grafiken.some(g => g.props.alt === 'Titellinie')).toBe(true)
        }

        await ui.press({ key: 'ausfuehren' })
        expect(b.eingang).toEqual([{ text: UPGRADE, origin: 'plugin:prompt-upgrade', asUser: true }])
        expect(b.geschlossen.at(-1)).toBe(PANE)
        // Nichts hat ein neues Fenster ausgeloest.
        expect(b.modell).toHaveLength(2)
        expect(await inhalt(ui)).toContain('Kein Prompt offen')
        await ui.unmount()
    }
    // Im Verlauf; dasselbe Upgrade zweimal ausgefuehrt steht nur einmal da.
    const liste = await befehl($, 'verlauf')
    expect(liste).toContain('die letzten 1 ')
    expect(liste).toContain(ORIGINAL)
})

test('Abbrechen schliesst das Fenster und legt den Original-Prompt zurueck', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)

    for (const surface of FLAECHEN) {
        // In den Fragen.
        b.gefuellt.length = 0
        b.modell.length = 0
        await befehl($, ORIGINAL)
        await clock.settle()
        let ui = await zeige($, surface)
        await ui.press({ key: 'abbrechen' })
        expect(b.gefuellt).toEqual([{ text: ORIGINAL, mode: 'replace' }])
        expect(b.geschlossen.at(-1)).toBe(PANE)
        expect(b.eingang).toEqual([])
        await ui.unmount()

        // In der Pruefung, mit schon getipptem Text im Feld: dahinter.
        b.gefuellt.length = 0
        b.feld = 'schon getippt'
        b.modell.length = 0
        await befehl($, ORIGINAL)
        await clock.settle()
        ui = await zeige($, surface)
        await ui.press({ key: 'rest' })
        await clock.settle()
        expect(await inhalt(ui)).toContain('[ausfuehren]')
        await ui.press({ key: 'abbrechen' })
        expect(b.gefuellt).toEqual([{ text: `\n\n${ORIGINAL}`, mode: 'append' }])
        expect(b.eingang).toEqual([])
        b.feld = ''
        await ui.unmount()
    }
})

test('Schalter: /better an und aus, auch on und off', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)

    // Standard aus: getippt geht durch.
    expect(await tippe($, ORIGINAL)).toEqual(expect.objectContaining({ text: ORIGINAL }))
    expect(b.eingang).toHaveLength(1)

    expect(await befehl($, 'an')).toBe(TEXT_AN)
    const r = await tippe($, ORIGINAL)
    expect(r.drop).toBe(GRUND_ABGEFANGEN)
    await clock.settle()
    expect(b.eingang).toHaveLength(1)
    expect(b.geoeffnet).toEqual([PANE])
    expect(b.modell).toHaveLength(1)

    expect(await befehl($, 'aus')).toBe(TEXT_AUS)
    await tippe($, 'Noch ein Prompt fuer die Seite')
    expect(b.eingang.at(-1)).toEqual({ text: 'Noch ein Prompt fuer die Seite', origin: 'composer', asUser: false })

    expect(await befehl($, 'on')).toBe(TEXT_AN)
    expect((await tippe($, 'Bau den Export neu')).drop).toBe(GRUND_ABGEFANGEN)
    expect(await befehl($, 'off')).toBe(TEXT_AUS)
    expect((await tippe($, 'Bau den Export neu')).drop).toBeUndefined()
})

test('Vom Handy (bridge) geht alles unveraendert durch, auch mit Automatik', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)
    await befehl($, 'an')

    await tippe($, ORIGINAL, { art: 'bridge' })
    await tippe($, '> mit Zeichen vom Handy', { art: 'bridge' })
    await clock.settle()
    expect(b.eingang).toEqual([
        { text: ORIGINAL, origin: 'bridge', asUser: false },
        { text: '> mit Zeichen vom Handy', origin: 'bridge', asUser: false },
    ])
    expect(b.geoeffnet).toEqual([])
    expect(b.modell).toEqual([])

    // /better vom Handy oeffnet nichts, was dort nicht zu sehen ist.
    expect(await befehl($, ORIGINAL, 'bridge')).toBe(TEXT_HANDY)
    expect(await befehl($, '', 'bridge')).toBe(TEXT_HANDY)
    expect(await befehl($, 'verlauf', 'bridge')).toBe(verlaufText([]))
    expect(await befehl($, 'aus', 'bridge')).toBe(TEXT_AUS)
    await clock.settle()
    expect(b.geoeffnet).toEqual([])
})

test('Was durchgeht, wenn die Automatik an ist: Befehle, Anhaenge, waehrend der Arbeit, kurze Antworten, > vorn', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)
    await befehl($, 'an')

    await tippe($, '> Mach das direkt')
    expect(b.eingang.at(-1)).toEqual({ text: 'Mach das direkt', origin: 'composer', asUser: false })
    await tippe($, 'ja')
    await tippe($, 'keep going')
    await tippe($, ORIGINAL, { attachments: [{ type: 'image', mediaType: 'image/png' }] })
    await tippe($, ORIGINAL, { turnId: 't1' })
    // Waehrend eine Runde laeuft (ohne turnId gemeldet), auch.
    await $.turn.start({ text: '', turnId: 't2' } as never)
    await tippe($, 'Noch etwas waehrend der Arbeit')
    await $.turn.complete({ answer: 'fertig', durationMs: 10, isAborted: false, turnId: 't2', reason: 'answer' } as never)
    await clock.settle()
    expect(b.eingang.map(x => x.text)).toEqual(['Mach das direkt', 'ja', 'keep going', ORIGINAL, ORIGINAL, 'Noch etwas waehrend der Arbeit'])
    expect(b.geoeffnet).toEqual([])
    // Danach wird wieder abgefangen.
    expect((await tippe($, ORIGINAL)).drop).toBe(GRUND_ABGEFANGEN)
})

test('Die eigene Sendung schleift nicht zurueck ins Fenster', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)
    await befehl($, 'an')

    expect((await tippe($, ORIGINAL)).drop).toBe(GRUND_ABGEFANGEN)
    await clock.settle()
    const ui = await zeige($, 'terminal')
    await ui.press({ key: 'rest' })
    await clock.settle()
    await ui.press({ key: 'ausfuehren' })
    await clock.settle()
    // Unten kam genau das Upgrade an, als Worte der Person, und kein zweites Fenster ging auf.
    expect(b.eingang).toEqual([{ text: UPGRADE, origin: 'plugin:prompt-upgrade', asUser: true }])
    expect(b.geoeffnet).toEqual([PANE])
    expect(b.modell).toHaveLength(2)
    // Auch ein Plugin-Prompt mit genau diesem Text geht durch.
    await $.prompt.submit({ text: UPGRADE, wait: false, origin: { kind: 'plugin', name: 'prompt-upgrade', asUser: true } } as never)
    expect(b.eingang).toHaveLength(2)
    expect(b.geoeffnet).toEqual([PANE])
})

test('Automatik je Chat: A an, B bleibt aus', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)

    b.chat = 'chat-a'
    await befehl($, 'an')
    b.chat = 'chat-b'
    expect((await tippe($, ORIGINAL)).drop).toBeUndefined()
    b.chat = 'chat-a'
    expect((await tippe($, ORIGINAL)).drop).toBe(GRUND_ABGEFANGEN)
    b.chat = 'chat-b'
    await befehl($, 'aus')
    b.chat = 'chat-a'
    expect((await tippe($, ORIGINAL)).drop).toBe(GRUND_ABGEFANGEN)
})

test('Standard aus den Einstellungen: an fuer neue Chats, /better aus nur im Chat', { options: { automatik: true } }, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)

    b.chat = 'neu-1'
    expect((await tippe($, ORIGINAL)).drop).toBe(GRUND_ABGEFANGEN)
    await befehl($, 'aus')
    expect((await tippe($, ORIGINAL)).drop).toBeUndefined()
    b.chat = 'neu-2'
    expect((await tippe($, ORIGINAL)).drop).toBe(GRUND_ABGEFANGEN)
})

test('Alte Chat-Schluessel verschwinden nach 30 Tagen', async ($, on) => {
    const jetzt = 100 * 24 * 60 * 60_000
    const clock = mock.clock(on, { now: jetzt })
    mock.store(on, {
        [`${SPEICHER_AUTOMATIK}alt`]: { at: jetzt - 31 * 24 * 60 * 60_000, isOn: true },
        [`${SPEICHER_AUTOMATIK}frisch`]: { at: jetzt - 2 * 24 * 60 * 60_000, isOn: true },
        [`${SPEICHER_AUTOMATIK}kaputt`]: 'ja',
    })
    const b = boden(on, clock)
    await start($)
    await clock.settle()
    // Der frische Chat hat seine Automatik noch, der alte nicht mehr (Standard: aus).
    b.chat = 'frisch'
    expect((await tippe($, ORIGINAL)).drop).toBe(GRUND_ABGEFANGEN)
    b.chat = 'alt'
    expect((await tippe($, ORIGINAL)).drop).toBeUndefined()
})

test('Keine Frage noetig: gleich umschreiben', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock, { antworten: ['{"fragen":[]}', UMSCHRIFT] })
    await start($)
    await befehl($, ORIGINAL)
    await clock.settle()
    expect(b.modell).toHaveLength(2)
    expect(b.modell[1]!.prompt).toContain('<antworten>\n(keine)\n</antworten>')
    const ui = await zeige($, 'terminal')
    const text = await inhalt(ui)
    expect(text).toContain('[ausfuehren]')
    expect(text).toContain('✓ Fragen')
})

test('Ohne Abdeckung (fehlt oder kaputt) entfaellt die Zeile, der Rest der Pruefung bleibt', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const KAPUTT = `${UMSCHRIFT_OHNE}\n<abdeckung>auftrag=vielleicht warum=ja</abdeckung>`
    // Terminal bekommt eine Antwort ohne Abdeckung, die App eine mit kaputter.
    const b = boden(on, clock, { antworten: ['{"fragen":[]}', UMSCHRIFT_OHNE, '{"fragen":[]}', KAPUTT] })
    await start($)

    for (const surface of FLAECHEN) {
        b.eingang.length = 0
        await befehl($, ORIGINAL)
        await clock.settle()
        const ui = await zeige($, surface)
        const text = await inhalt(ui)
        expect(text).toContain('[ausfuehren]')
        expect(text).toContain('WAS ICH ERGÄNZT HABE')
        expect(text).not.toMatch(ABDECKUNGS_ZEILE)
        expect(await ui.find({ type: 'Text', text: /Kernteile|Auftrag/ })).toBeUndefined()
        await ui.press({ key: 'ausfuehren' })
        expect(b.eingang).toEqual([{ text: UPGRADE, origin: 'plugin:prompt-upgrade', asUser: true }])
        await ui.unmount()
    }
    expect(b.modell.map(m => m.system.includes('<abdeckung>'))).toEqual([false, true, false, true])
})

test('Fehlerkarte: Prompt ist sicher, Erneut versuchen, Original senden', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock, { antworten: [{ grund: 'api-error' }, FRAGEN, { grund: 'empty-reply' }] })
    await start($)

    for (const surface of FLAECHEN) {
        b.modell.length = 0
        b.eingang.length = 0
        await befehl($, ORIGINAL)
        await clock.settle()
        const ui = await zeige($, surface)
        let text = await inhalt(ui)
        expect(text).toContain('DAS HAT NICHT GEKLAPPT')
        expect(text).toContain('Dein Prompt ist sicher; gesendet wurde nichts.')
        expect(text).toContain('Status 529')
        expect(text).toContain('[erneut]')
        expect(text).toContain('[original]')
        expect(text).toContain('[abbrechen]')

        await ui.press({ key: 'erneut' })
        await clock.settle()
        text = await inhalt(ui)
        expect(text).toContain('Für wen ist die Seite?')

        // Das Umschreiben scheitert: wieder die Karte, diesmal im dritten Schritt.
        await ui.press({ key: 'rest' })
        await clock.settle()
        text = await inhalt(ui)
        expect(text).toContain('Das Modell hat nichts geantwortet.')
        expect(text).toContain('3 Umschreiben')

        await ui.press({ key: 'original' })
        expect(b.eingang).toEqual([{ text: ORIGINAL, origin: 'plugin:prompt-upgrade', asUser: true }])
        expect(b.geschlossen.at(-1)).toBe(PANE)
        await ui.unmount()
    }
})

test('Bearbeiten: der Text laesst sich aendern, Enter fuehrt aus; Kopieren', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)

    for (const surface of FLAECHEN) {
        b.eingang.length = 0
        b.modell.length = 0
        await befehl($, ORIGINAL)
        await clock.settle()
        const ui = await zeige($, surface)
        await ui.press({ key: 'rest' })
        await clock.settle()

        await ui.press({ key: 'kopieren' })
        expect(b.kopiert.at(-1)).toBe(UPGRADE)
        expect(String((await ui.find({ type: 'Button', key: 'kopieren' }))?.props.label)).toContain('Kopiert')

        await ui.press({ key: 'bearbeiten' })
        expect(await inhalt(ui)).toContain('<entwurf>')
        await tippeInsFeld(ui, 'entwurf', 'Mach die Login-Seite schneller, [Zielzeit] = 1 s.', 'change')
        expect(await inhalt(ui)).toContain('UPGRADE (BEARBEITET)')
        await tippeInsFeld(ui, 'entwurf', 'Mach die Login-Seite schneller, Ziel 1 s.')
        expect(b.eingang).toEqual([{ text: 'Mach die Login-Seite schneller, Ziel 1 s.', origin: 'plugin:prompt-upgrade', asUser: true }])
        await ui.unmount()
    }
})

test('Eigene Antwort eintippen', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)
    await befehl($, ORIGINAL)
    await clock.settle()
    const ui = await zeige($, 'desktop')
    await ui.press({ key: 'f0-anders' })
    expect(await inhalt(ui)).toContain('<f0-text>')
    await tippeInsFeld(ui, 'f0-text', 'Partner-Agenturen')
    let text = await inhalt(ui)
    expect(text).toContain('Partner-Agenturen')
    expect(text).not.toContain('<f0-text>')
    await ui.press({ key: 'f1-o0' })
    await clock.settle()
    expect(b.modell[1]!.prompt).toContain('Antwort: Partner-Agenturen')
    expect(b.modell[1]!.prompt).toContain('Antwort: Code')
    text = await inhalt(ui)
    expect(text).toContain('[ausfuehren]')
})

test('/better ohne Text oeffnet ein Feld zum Eintippen', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock)
    await start($)
    expect(await befehl($, '')).toBe(TEXT_EINGABE)
    await clock.settle()
    expect(b.geoeffnet).toEqual([PANE])
    expect(b.modell).toEqual([])
    const ui = await zeige($, 'terminal')
    expect(await inhalt(ui)).toContain('<eingabe>')
    await tippeInsFeld(ui, 'eingabe', ORIGINAL)
    await clock.settle()
    expect(b.modell).toHaveLength(1)
    expect(await inhalt(ui)).toContain('Für wen ist die Seite?')
    // Abbrechen im leeren Feld legt nichts zurueck.
    await befehl($, '')
    await ui.press({ key: 'abbrechen' })
    expect(b.gefuellt).toEqual([])
})

test('Verlauf: die letzten 20, ein Klick oeffnet die Pruefung wieder', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    // Eintraege von vor 0.2.0 haben keine Abdeckung; einer hat eine kaputte und bleibt trotzdem.
    const alt: Record<string, unknown>[] = Array.from({ length: 25 }, (_, i) => ({
        at: i,
        original: `Alter Prompt ${i}`,
        upgrade: `Altes Upgrade ${i} mit Text`,
        ergaenzt: ['Ziel'],
    }))
    alt[1] = { ...alt[1], abdeckung: { auftrag: 'ja' } }
    mock.store(on, { [SPEICHER_VERLAUF]: alt })
    const b = boden(on, clock)
    await start($)

    await befehl($, ORIGINAL)
    await clock.settle()
    let ui = await zeige($, 'terminal')
    await ui.press({ key: 'rest' })
    await clock.settle()
    await ui.press({ key: 'ausfuehren' })
    await ui.unmount()

    const text = await befehl($, 'history')
    expect(text).toContain('die letzten 20')
    expect(text.split('\n')[1]).toContain(ORIGINAL)
    expect(text.split('\n')).toHaveLength(21)
    await clock.settle()

    for (const surface of FLAECHEN) {
        ui = await zeige($, surface)
        let inh = await inhalt(ui)
        expect(inh).toContain('VERLAUF')
        expect(inh).toContain('[v0]')
        expect(inh).toContain('[v19]')
        expect(inh).not.toContain('[v20]')
        await ui.press({ key: 'v1' })
        inh = await inhalt(ui)
        expect(inh).toContain('Altes Upgrade 0 mit Text')
        expect(inh).toContain('[ausfuehren]')
        expect(inh).toContain('4 Prüfen')
        // Ohne Abdeckung: die Pruefung oeffnet, nur die Zeile fehlt.
        expect(inh).not.toMatch(ABDECKUNGS_ZEILE)
        // Abbrechen legt hier nichts ins Eingabefeld: der Eintrag ist schon gesendet worden.
        await ui.press({ key: 'abbrechen' })
        expect(b.gefuellt).toEqual([])

        // Mit kaputter Abdeckung genauso.
        await befehl($, 'verlauf')
        await ui.press({ key: 'v2' })
        inh = await inhalt(ui)
        expect(inh).toContain('Altes Upgrade 1 mit Text')
        expect(inh).not.toMatch(ABDECKUNGS_ZEILE)
        await ui.press({ key: 'abbrechen' })

        // Das neue Upgrade hat seine Abdeckung mit in den Verlauf genommen.
        await befehl($, 'verlauf')
        await ui.press({ key: 'v0' })
        inh = await inhalt(ui)
        expect(inh).toContain('✓ Auftrag')
        expect(inh).toContain('– Warum')
        expect(inh).toContain('✓ Fertig wenn')
        await ui.press({ key: 'abbrechen' })
        expect(b.gefuellt).toEqual([])
        await befehl($, 'verlauf')
        await ui.unmount()
    }
    expect(b.modell).toHaveLength(2)
})

test('Passt das Fenster nicht hin, steht der Prompt wieder im Eingabefeld, mit einer Zeile dazu', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const b = boden(on, clock, { platz: false })
    await start($)
    await befehl($, 'an')
    expect((await tippe($, ORIGINAL)).drop).toBe(GRUND_ABGEFANGEN)
    await clock.settle()
    // Erst kurz nach dem Absenden, wenn das Feld geleert ist.
    expect(b.gefuellt).toEqual([])
    await clock.advance(100)
    expect(b.gefuellt).toEqual([{ text: ORIGINAL, mode: 'replace' }])
    expect(b.logs).toContain(TEXT_ZU_SCHMAL)
    expect(b.geschlossen).toContain(PANE)
    // Der Durchlauf ist weg: das Fenster zeigt nichts Offenes.
    const ui = await zeige($, 'terminal')
    expect(await inhalt(ui)).toContain('Kein Prompt offen')
})

test('Neu geladen mitten im Schritt: der Schritt wird wieder aufgenommen', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const ANDERE = JSON.stringify({ fragen: [{ frage: 'Alte Frage?', optionen: ['a', 'b'] }] })
    const b = boden(on, clock, { antworten: [{ spaeter: 60_000, text: ANDERE }, FRAGEN, UMSCHRIFT] })
    // Wie eine fruehere Umgebung: was der Mod schreibt, traegt eine fremde Umgebung.
    let alt = true
    on('state.set', { plugin: 'prompt-upgrade', key: 'ablauf' } as never, (_$, e, next) => {
        const v = (e as { value: unknown }).value
        if (alt && v && typeof v === 'object') {
            return next({ ...e, value: { ...v, umgebung: 'frueher' } } as never)
        }
        return next(e)
    })
    await start($)
    await befehl($, ORIGINAL)
    await clock.settle()
    expect(b.modell).toHaveLength(1)
    const ui = await zeige($, 'terminal')
    expect(await inhalt(ui)).toContain('Lese deinen Prompt')

    alt = false
    await start($)
    await clock.settle()
    expect(b.modell).toHaveLength(2)
    expect(await inhalt(ui)).toContain('Für wen ist die Seite?')
    // Die Antwort des alten Aufrufs kommt spaeter und wird verworfen.
    await clock.advance(60_000)
    const text = await inhalt(ui)
    expect(text).toContain('Für wen ist die Seite?')
    expect(text).not.toContain('Alte Frage?')
})

test('Neu geladen, aber das Fenster ist zu: der Prompt kommt zurueck ins Eingabefeld', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    let offen = true
    const b = boden(on, clock, { antworten: [{ spaeter: 60_000, text: FRAGEN }], offen: () => offen })
    on('state.set', { plugin: 'prompt-upgrade', key: 'ablauf' } as never, (_$, e, next) => {
        const v = (e as { value: unknown }).value
        return next(v && typeof v === 'object' ? ({ ...e, value: { ...v, umgebung: 'frueher' } } as never) : e)
    })
    await start($)
    await befehl($, ORIGINAL)
    await clock.settle()
    offen = false
    await start($)
    await clock.settle()
    expect(b.gefuellt).toEqual([{ text: ORIGINAL, mode: 'replace' }])
    await clock.advance(60_000)
    expect(b.eingang).toEqual([])
})

// --- Breiten ---

test('Breiten: bei 40 und 120 Spalten ist keine Zeile breiter als das Fenster', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const LANG = `${UPGRADE}\n\nZweiter Absatz: ${'sehr '.repeat(30)}lang, mit einemsehrsehrsehrsehrsehrlangenwortdasnirgendwohinpasst und [Platzhalter eins].`
    const LANG_UMSCHRIFT = `<upgrade>\n${LANG}\n</upgrade>\n<ergaenzt>\n- ${'Ein sehr langer Punkt, der umbrechen muss '.repeat(3)}\n- Kurz\n</ergaenzt>\n<abdeckung>auftrag=ja warum=ja leitplanken=nein fertig=ja</abdeckung>`
    const LANGE_FRAGEN = JSON.stringify({
        fragen: [
            { frage: `Eine sehr lange Frage, ${'die weitergeht '.repeat(8)}?`, optionen: ['Eine lange Antwortmöglichkeit hier', 'Kurz', 'Mittel lang', 'Vier'] },
            { frage: 'Kurz?', optionen: ['a', 'b'] },
            { frage: 'Format?', optionen: ['Code', 'Plan'] },
        ],
    })
    const b = boden(on, clock, {
        antworten: [
            { spaeter: 1000, text: LANGE_FRAGEN },
            { spaeter: 1000, text: LANG_UMSCHRIFT },
            { grund: 'api-error' },
        ],
    })
    await start($)

    /** Jede Flaeche in beiden Breiten; `mitAbdeckung`: die Abdeckungszeile muss dabei sein, in der Fassung fuer die Breite. */
    const pruefeAlle = async (schritt: string, mitAbdeckung = false) => {
        for (const surface of FLAECHEN) {
            for (const breite of [40, 120]) {
                const ui = await zeige($, surface, breite)
                await breiteOk(ui, breite, surface, schritt)
                if (mitAbdeckung) {
                    const text = await inhalt(ui)
                    expect(text).toContain('✓ Auftrag')
                    expect(text).toContain(breite === 40 ? '– Grenzen' : '– Leitplanken')
                    expect(text).toContain(breite === 40 ? '✓ Fertig' : '✓ Fertig wenn')
                }
                await ui.unmount()
            }
        }
    }

    await pruefeAlle('leer')
    await befehl($, '')
    await clock.settle()
    await pruefeAlle('eingabe')

    await befehl($, `${ORIGINAL} ${'und noch mehr '.repeat(20)}`)
    await clock.settle()
    await pruefeAlle('lesen')
    await clock.advance(1000)
    await pruefeAlle('fragen')

    let ui = await zeige($, 'terminal', 120)
    await ui.press({ key: 'f0-o0' })
    await ui.press({ key: 'f1-anders' })
    await ui.unmount()
    await pruefeAlle('fragen mit Feld')

    ui = await zeige($, 'terminal', 120)
    await ui.press({ key: 'rest' })
    await ui.unmount()
    await clock.settle()
    await pruefeAlle('umschreiben')
    await clock.advance(1000)
    await pruefeAlle('pruefen', true)

    ui = await zeige($, 'terminal', 120)
    await ui.press({ key: 'bearbeiten' })
    await ui.unmount()
    await pruefeAlle('bearbeiten', true)

    ui = await zeige($, 'terminal', 120)
    await ui.press({ key: 'ausfuehren' })
    await ui.unmount()
    await befehl($, 'verlauf')
    await pruefeAlle('verlauf')

    await befehl($, ORIGINAL)
    await clock.settle()
    await pruefeAlle('fehler')
    expect(b.eingang).toHaveLength(1)
})
