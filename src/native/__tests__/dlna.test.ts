import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createRequire } from 'node:module'

import { getDlnaModule, resetDlnaModuleForTests } from '../dlna.js'
import { readClientLog, resetClientLoggerForTests } from '../../core/logging/client-logger.js'

/**
 * `dlna.ts` used to be a one-line lie: `nm.SongloftDlna as DlnaModule`, i.e. a
 * claim that the native bag returns Promises. It does not — Lynx native methods
 * take a `Callback` and return `undefined` — so `DlnaPage`'s
 * `dlna.startDiscovery().then(…)` threw `TypeError: Cannot read properties of
 * undefined (reading 'then')` the instant the effect mounted, and the cast screen
 * crashed on open for every Android user. The repo's own rule ("promisify in the
 * TS adapter, never cast") is stated in `core/storage/native-storage.ts`.
 *
 * These tests pin the real native contract, taken from the Kotlin/Swift sources:
 * `startDiscovery/stopDiscovery/getDevices` take a lone callback receiving a JSON
 * string; `cast/control` take one JSON-string argument plus a callback; failures
 * come back as `{"error": "..."}`.
 */

const g = globalThis as Record<string, unknown>
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (xml: string, options: { contentType: string }) => { window: { document: Document; close(): void } }
}

function parseMetadata(xml: string): Document {
  const dom = new JSDOM(xml, { contentType: 'application/xml' })
  const document = dom.window.document
  dom.window.close()
  return document
}

/** A fake native module in the exact callback shape both hosts implement. */
function fakeNative(overrides: Record<string, unknown> = {}) {
  const calls: Array<{ method: string; args: string | undefined }> = []
  const answer = (json: string) => (cb: (s: string) => void) => cb(json)
  const mod: Record<string, unknown> = {
    startDiscovery: vi.fn((cb: (s: string) => void) => {
      calls.push({ method: 'startDiscovery', args: undefined })
      answer('{"success":true}')(cb)
    }),
    stopDiscovery: vi.fn((cb: (s: string) => void) => {
      calls.push({ method: 'stopDiscovery', args: undefined })
      answer('{"success":true}')(cb)
    }),
    getDevices: vi.fn((cb: (s: string) => void) => {
      calls.push({ method: 'getDevices', args: undefined })
      answer('[{"id":"d1","name":"Living Room","location":"http://1.2.3.4/desc.xml"}]')(cb)
    }),
    cast: vi.fn((args: string, cb: (s: string) => void) => {
      calls.push({ method: 'cast', args })
      answer('{"success":true}')(cb)
    }),
    control: vi.fn((args: string, cb: (s: string) => void) => {
      calls.push({ method: 'control', args })
      answer('{"success":true}')(cb)
    }),
    ...overrides,
  }
  return { mod, calls }
}

function install(mod: Record<string, unknown> | undefined): void {
  if (mod) g.NativeModules = { SongloftDlna: mod }
  else delete g.NativeModules
  resetDlnaModuleForTests()
}

beforeEach(() => {
  resetDlnaModuleForTests()
  resetClientLoggerForTests()
})

afterEach(() => {
  delete g.NativeModules
  resetDlnaModuleForTests()
})

describe('native adapter (callback → Promise)', () => {
  test('716 cast failures reach exported logs with device and redacted media context', async () => {
    const { mod } = fakeNative({
      cast: vi.fn((_args: string, cb: (s: string) => void) => cb(JSON.stringify({
        error: 'SOAP SetAVTransportURI failed: HTTP 500: UPnP 716 Resource not found https://host/play?access_token=private-token&quality=original',
      }))),
    })
    install(mod)
    await getDlnaModule().getDevices()
    await expect(getDlnaModule().cast({
      deviceId: 'd1', url: 'https://host/play?access_token=private-token&quality=original',
      title: '歌曲', mimeType: 'audio/mpeg',
    })).rejects.toThrow(/716/)
    const log = await readClientLog()
    expect(log).toContain('E/dlna cast device=d1 name=Living Room location=http://1.2.3.4/desc.xml')
    expect(log).toContain('mime=audio/mpeg url=https://host/play?access_token=***&quality=original')
    expect(log).toContain('SetAVTransportURI failed: HTTP 500: UPnP 716 Resource not found')
    expect(log).not.toContain('private-token')
  })

  test('control failures are captured and repeated polling failures are deduplicated', async () => {
    let error = true
    const { mod } = fakeNative({
      control: vi.fn((_args: string, cb: (s: string) => void) => cb(error
        ? '{"error":"SOAP GetTransportInfo failed: HTTP 500: UPnP 716"}'
        : '{"state":"PLAYING","positionMs":100,"durationMs":200}')),
    })
    install(mod)
    const dlna = getDlnaModule()
    await expect(dlna.control('pause', { deviceId: 'd1' })).rejects.toThrow(/716/)
    for (let i = 0; i < 3; i++) await expect(dlna.getPlaybackState('d1')).rejects.toThrow(/716/)
    let log = await readClientLog()
    expect(log).toContain('E/dlna control/pause device=d1')
    expect(log.match(/E\/dlna status/g)).toHaveLength(1)
    error = false
    await dlna.getPlaybackState('d1')
    await dlna.getPlaybackState('d1')
    expect((await readClientLog()).match(/I\/dlna transport .*state=PLAYING/g)).toHaveLength(1)
    error = true
    await expect(dlna.getPlaybackState('d1')).rejects.toThrow(/716/)
    log = await readClientLog()
    expect(log.match(/E\/dlna status/g)).toHaveLength(2)
  })

  test('discovery and device listing resolve through the callback', async () => {
    const { mod } = fakeNative()
    install(mod)
    const dlna = getDlnaModule()

    expect(dlna.available).toBe(true)
    // The bug in one line: without promisification this call has no `.then`.
    await expect(dlna.startDiscovery()).resolves.toBeUndefined()

    const devices = await dlna.getDevices()
    expect(devices).toEqual([
      { id: 'd1', name: 'Living Room', location: 'http://1.2.3.4/desc.xml' },
    ])
  })

  test('cast passes its arguments as one JSON string, as the hosts expect', async () => {
    const { mod, calls } = fakeNative()
    install(mod)

    await getDlnaModule().cast({ deviceId: 'd1', url: 'http://host/song.mp3', title: 'Song A', mimeType: 'audio/mpeg' })

    const call = calls.find((c) => c.method === 'cast')!
    expect(JSON.parse(call.args!)).toEqual({
      deviceId: 'd1',
      url: 'http://host/song.mp3',
      title: 'Song A',
      metadata: expect.any(String),
    })
    const metadata = JSON.parse(call.args!).metadata
    const document = parseMetadata(metadata)
    expect(document.getElementsByTagName('res')[0].getAttribute('protocolInfo')).toBe('http-get:*:audio/mpeg:*')
  })

  test('suffixless URLs carry MIME metadata and XML entities survive one metadata decode', async () => {
    const { mod, calls } = fakeNative()
    install(mod)
    const url = 'http://host/api/v1/songs/2/play?access_token=example&quality=original'
    const title = '中文 & <曲名> "引号"'
    await getDlnaModule().cast({ deviceId: 'd1', url, title, mimeType: 'audio/mpeg' })
    const { metadata } = JSON.parse(calls.find(c => c.method === 'cast')!.args!)
    const document = parseMetadata(metadata)
    expect(document.getElementsByTagName('res')[0].textContent).toBe(url)
    expect(document.getElementsByTagName('dc:title')[0].textContent).toBe(title)
    expect(document.getElementsByTagName('upnp:class')[0].textContent).toBe('object.item.audioItem')
  })

  test('unknown formats do not claim to be MP3', async () => {
    const { mod, calls } = fakeNative()
    install(mod)
    await getDlnaModule().cast({ deviceId: 'd1', url: 'http://host/stream', title: 'Unknown' })
    const { metadata } = JSON.parse(calls.find(c => c.method === 'cast')!.args!)
    expect(metadata).not.toContain('protocolInfo=')
  })

  test('control serializes the action and optional value', async () => {
    const { mod, calls } = fakeNative()
    install(mod)

    await getDlnaModule().control('seek', { value: 42 })

    expect(JSON.parse(calls.find((c) => c.method === 'control')!.args!)).toEqual({
      action: 'seek',
      value: 42,
    })
  })

  test('an {error} payload rejects instead of resolving silently', async () => {
    const { mod } = fakeNative({
      cast: vi.fn((_args: string, cb: (s: string) => void) =>
        cb('{"error":"Device not found"}'),
      ),
    })
    install(mod)

    await expect(getDlnaModule().cast({ deviceId: 'gone', url: 'http://x/y.mp3', title: 'T' })).rejects.toThrow(
      /Device not found/,
    )
  })

  test('a malformed payload rejects rather than corrupting the device list', async () => {
    const { mod } = fakeNative({
      getDevices: vi.fn((cb: (s: string) => void) => cb('not json at all')),
    })
    install(mod)

    await expect(getDlnaModule().getDevices()).rejects.toThrow(/malformed/)
  })

  test('a native method that throws synchronously rejects the promise', async () => {
    const { mod } = fakeNative({
      startDiscovery: vi.fn(() => {
        throw new Error('bridge down')
      }),
    })
    install(mod)

    await expect(getDlnaModule().startDiscovery()).rejects.toThrow(/bridge down/)
  })

  test('malformed device entries are skipped, not passed through', async () => {
    const { mod } = fakeNative({
      getDevices: vi.fn((cb: (s: string) => void) =>
        cb('[{"id":"ok"},{"name":"no id"},null,{"id":"","name":"empty"}]'),
      ),
    })
    install(mod)

    const devices = await getDlnaModule().getDevices()
    // Only the entry with a usable id survives; name falls back to the id.
    expect(devices).toEqual([{ id: 'ok', name: 'ok', location: '' }])
  })
})

describe('no native module (Web, or a build without it)', () => {
  test('reports unavailable and every call is an inert no-op', async () => {
    install(undefined)
    const dlna = getDlnaModule()

    expect(dlna.available).toBe(false)
    await expect(dlna.startDiscovery()).resolves.toBeUndefined()
    await expect(dlna.getDevices()).resolves.toEqual([])
    await expect(dlna.cast({ deviceId: 'd', url: 'u', title: 't' })).resolves.toBeUndefined()
  })

  test('a partially implemented module is treated as absent', async () => {
    const { mod } = fakeNative()
    delete mod.control
    install(mod)

    // Better to disable casting than to crash deep inside the page later.
    expect(getDlnaModule().available).toBe(false)
  })
})
