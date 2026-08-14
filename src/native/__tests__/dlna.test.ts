import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { getDlnaModule, resetDlnaModuleForTests } from '../dlna.js'

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

beforeEach(() => resetDlnaModuleForTests())

afterEach(() => {
  delete g.NativeModules
  resetDlnaModuleForTests()
})

describe('native adapter (callback → Promise)', () => {
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

    await getDlnaModule().cast('d1', 'http://host/song.mp3', 'Song A')

    const call = calls.find((c) => c.method === 'cast')!
    expect(JSON.parse(call.args!)).toEqual({
      deviceId: 'd1',
      url: 'http://host/song.mp3',
      title: 'Song A',
    })
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

    await expect(getDlnaModule().cast('gone', 'http://x/y.mp3', 'T')).rejects.toThrow(
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
    await expect(dlna.cast('d', 'u', 't')).resolves.toBeUndefined()
  })

  test('a partially implemented module is treated as absent', async () => {
    const { mod } = fakeNative()
    delete mod.control
    install(mod)

    // Better to disable casting than to crash deep inside the page later.
    expect(getDlnaModule().available).toBe(false)
  })
})
