import { describe, expect, test } from 'claude-code/testing'

import { extractSecrets, findSecrets, maskPrivate, mergeEnv, removeSecrets, replaceSecrets } from '../hooks/privacy'

// IP-Adressen und Hostnamen: Das Schloss verdeckt sie, das Schild nimmt sie in die .env, der Passwortschutz lässt sie durch.

describe('Netz-Stellen', () => {
  test('Versionen, Loopback, Uhrzeiten, Dateinamen und öffentliche Dienste bleiben stehen', () => {
    for (const text of [
      'Version 0.63.4.0',
      'claude 2.1.309',
      '127.0.0.1',
      'localhost:3000',
      'http://localhost:3000/api',
      'http://127.0.0.1:8080/',
      '::1',
      '[::1]:8080',
      'um 12:30:45',
      '2026-10-31T12:30:45.123Z',
      '2026-10-31 12:30:45',
      'https://github.com/x',
      'https://raw.githubusercontent.com/a/b',
      'https://www.example.com/a',
      'ssh root@localhost',
      'http://nas.test:8080/x',
      'settings.local.json',
      'glance.tsx:42',
      '.env.local',
      'cfg.local()',
      'npm i react@latest',
      'docker pull image@sha256:abc',
      'std::vector<int>',
      'a[::2]',
      'Netzmaske 255.255.255.0',
      '1.2.3.4.5',
      String.raw`C:\Users\Bjoern`,
      String.raw`cd "E:\\Development\\claude-mods"`,
    ]) {
      expect(maskPrivate(text)).toBe(text)
      expect(extractSecrets(text)).toEqual([])
    }
  })

  test('IP-Adressen und Hostnamen werden verdeckt, Port, Schema und Pfad bleiben', () => {
    const cases: [string, string][] = [
      ['192.168.178.20', '•••.•••.•••.•••'],
      ['unter 10.0.0.5:8080 erreichbar', 'unter •••.•••.•••.•••:8080 erreichbar'],
      ['Netz 192.168.1.0/24.', 'Netz •••.•••.•••.•••/24.'],
      ['fe80::1', '••••:••••'],
      ['ping 2001:db8::1', 'ping ••••:••••'],
      ['2001:0db8:85a3:0000:0000:8a2e:0370:7334', '••••:••••'],
      ['[fe80::1%eth0]:8080', '[••••:••••]:8080'],
      ['https://nas.fritz.box:5001/x', 'https://•••.•••:5001/x'],
      ['smb://admin@fileserver/share', 'smb://admin@•••.•••/share'],
      ['ssh root@nas01', 'ssh root@•••.•••'],
      [String.raw`\\nas01\daten`, String.raw`\\•••.•••\daten`],
      ['//nas01/daten', '//•••.•••/daten'],
      ['server.local', '•••.•••'],
      ['Die Box heißt nas.fritz.box.', 'Die Box heißt •••.•••.'],
      ['drucker.buero.home.arpa', '•••.•••'],
    ]
    for (const [text, masked] of cases) expect(maskPrivate(text)).toBe(masked)
  })

  test('E-Mail-Adressen werden verdeckt wie bisher, Passwörter neben einer IP auch', () => {
    expect(maskPrivate('mail an bjoern@mueller.family')).toBe('mail an •••@•••')
    expect(maskPrivate('Passwort: geheim123 auf 10.0.0.5')).toBe('Passwort: •••••••• auf •••.•••.•••.•••')
    expect(extractSecrets('Schreib an anna@firma.de')).toEqual([])
  })

  test('Schild: extractSecrets nimmt IP und Host mit Namen, replaceSecrets ersetzt sie', () => {
    const found = extractSecrets([
      'DB_HOST=10.0.0.5',
      'server: nas.fritz.box',
      'ssh root@nas01 und dann 192.168.178.20:22',
      'fe80::1',
      'https://intranet.firma.de/wiki',
    ])
    expect(found).toEqual([
      { name: 'DB_HOST', value: '10.0.0.5' },
      { name: 'SERVER', value: 'nas.fritz.box' },
      { name: 'HOST', value: 'nas01' },
      { name: 'IP', value: '192.168.178.20' },
      { name: 'IP_2', value: 'fe80::1' },
      { name: 'HOST_2', value: 'intranet.firma.de' },
    ])
    expect(replaceSecrets('Verbinde mit 10.0.0.5:5432, ssh root@nas01, NAS nas.fritz.box, Wiki https://intranet.firma.de/wiki', found)).toBe(
      'Verbinde mit ${DB_HOST}:5432, ssh root@${HOST}, NAS ${SERVER}, Wiki https://${HOST_2}/wiki',
    )
    const merged = mergeEnv('', found, '31.10.2026')
    expect(merged.text).toContain('DB_HOST=10.0.0.5\n')
    expect(merged.text).toContain('IP_2=fe80::1\n')
  })

  test('Schild: ein kurzer Host wird nur als ganzes Wort ersetzt', () => {
    const found = extractSecrets('ssh pi@nas')
    expect(found).toEqual([{ name: 'HOST', value: 'nas' }])
    expect(replaceSecrets(String.raw`ssh pi@nas, Gymnasium, \\nas\daten`, found)).toBe(String.raw`ssh pi@${'${HOST}'}, Gymnasium, \\${'${HOST}'}\daten`)
  })

  test('Schild: user@host zählt mit Ziffer, Bindestrich oder ssh davor; ein Host wird nur als ganzes Wort ersetzt', () => {
    const found = extractSecrets('ssh root@server')
    expect(found).toEqual([{ name: 'HOST', value: 'server' }])
    expect(extractSecrets('weights@inputs und a@word')).toEqual([])
    expect(maskPrivate('weights@inputs')).toBe('weights@inputs')
    expect(extractSecrets(['admin@pi-hole', 'backup@nas01'])).toEqual([
      { name: 'HOST', value: 'pi-hole' },
      { name: 'HOST_2', value: 'nas01' },
    ])
    expect(replaceSecrets('ssh root@server, Webserver, servers, server.firma.de, server-2, server_name, sub.server, server.', found)).toBe(
      'ssh root@${HOST}, Webserver, servers, server.firma.de, server-2, server_name, sub.server, ${HOST}.',
    )
    const ip = [{ name: 'IP', value: '10.0.0.5' }]
    expect(replaceSecrets('10.0.0.5:22, 10.0.0.50, 110.0.0.5, 10.0.0.5.', ip)).toBe('${IP}:22, 10.0.0.50, 110.0.0.5, ${IP}.')
  })

  test('mehrdeutige private Endungen zählen nicht in Code, eindeutige und Adressen schon', () => {
    for (const text of ['Nimm `options.local` und `props.home`', '```\nself.internal = 1\ncfg.lan = 2\n```']) {
      expect(maskPrivate(text)).toBe(text)
      expect(extractSecrets(text)).toEqual([])
    }
    expect(extractSecrets('Der NAS heißt nas.local')).toEqual([{ name: 'HOST', value: 'nas.local' }])
    expect(extractSecrets('`nas.fritz.box` und `https://wiki.firma.de/x`')).toEqual([
      { name: 'HOST', value: 'nas.fritz.box' },
      { name: 'HOST_2', value: 'wiki.firma.de' },
    ])
  })

  test('Passwortschutz: eine IP oder ein Hostname hält nichts zurück', () => {
    for (const text of ['Der Server hat 10.0.0.5', 'ssh root@nas01 auf server.local', 'https://nas.fritz.box:5001/x', 'fe80::1']) {
      expect(findSecrets(text)).toEqual([])
      expect(removeSecrets(text)).toBe(text)
    }
  })
})
