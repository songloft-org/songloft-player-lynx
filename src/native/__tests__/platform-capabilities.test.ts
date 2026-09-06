import { afterEach, describe, expect, test } from 'vitest'

import { getPlatformCapabilities } from '../platform-capabilities.js'

/**
 * `getPlatformCapabilities` exists so the UI can hide entries that cannot work
 * here — and for its whole life it had **no callers at all**, while internally
 * computing an `isWeb` it never used. Meanwhile Web users saw a cast button that
 * scanned forever, a floating-lyrics row that did nothing, and an export button
 * that was simply dead.
 *
 * These tests pin the contract the consumers now depend on. Note the device
 * expectations too: a false positive here would hide working features on
 * Android/iOS, which is worse than the bug being fixed.
 */

const g = globalThis as Record<string, unknown>

afterEach(() => {
  delete g.NativeModules
  delete g.SystemInfo
})

/** Pretend to be the Web platform (what `isWebPlatform` reads). */
function asWeb(): void {
  g.SystemInfo = { platform: 'web', lynxSdkVersion: '3.0' }
}

/** Pretend to be a device host exposing the given module names. */
function withModules(...names: string[]): void {
  g.SystemInfo = { platform: 'Android' }
  g.NativeModules = Object.fromEntries(names.map((n) => [n, {}]))
}

describe('on the Web platform', () => {
  test('every native-only capability is off', () => {
    asWeb()
    const caps = getPlatformCapabilities()
    expect(caps.dlna).toBe(false)
    expect(caps.floatingLyric).toBe(false)
    expect(caps.liveActivity).toBe(false)
    expect(caps.systemTray).toBe(false)
  })

  test('data transfer is off even if a platform module were present', () => {
    asWeb()
    g.NativeModules = { SongloftPlatform: {} }
    // openURL / pickAndUploadFile need main-thread APIs the render realm lacks.
    expect(getPlatformCapabilities().dataTransfer).toBe(false)
  })

  test('file export is on once the web module implements shareFile', () => {
    asWeb()
    // Web registers SongloftPlatform via nativeModulesMap and implements
    // shareFile as a browser download (there is no OS share sheet), so the
    // capability must be advertised — log export includes the client logs.
    g.NativeModules = { SongloftPlatform: { shareFile: () => {} } }
    expect(getPlatformCapabilities().fileExport).toBe(true)
  })

  test('file export is off if the web module lacks shareFile', () => {
    asWeb()
    g.NativeModules = { SongloftPlatform: {} }
    expect(getPlatformCapabilities().fileExport).toBe(false)
  })
})

describe('on a device host', () => {
  test('a capability is on exactly when its own module is registered', () => {
    withModules('SongloftPlatform', 'SongloftDlna')
    const caps = getPlatformCapabilities()
    expect(caps.dlna).toBe(true)
    expect(caps.dataTransfer).toBe(true)
    expect(caps.systemTray).toBe(true)
    // Not registered on any host yet — must not be advertised.
    expect(caps.floatingLyric).toBe(false)
    expect(caps.liveActivity).toBe(false)
  })

  test('a capability does not ride along on SongloftPlatform', () => {
    // Only the platform module: casting must still report unavailable, otherwise
    // the cast screen is offered on a build without the DLNA module.
    withModules('SongloftPlatform')
    expect(getPlatformCapabilities().dlna).toBe(false)
  })

  test('floating lyrics and live activity light up once registered', () => {
    withModules('SongloftPlatform', 'SongloftFloatingLyric', 'SongloftLiveActivity')
    const caps = getPlatformCapabilities()
    expect(caps.floatingLyric).toBe(true)
    expect(caps.liveActivity).toBe(true)
  })

  test('file export needs the shareFile method, not just the module', () => {
    // A hot-updated bundle on an older shell sees SongloftPlatform without
    // shareFile — advertising the capability there would surface an export row
    // that only errors out when tapped.
    withModules('SongloftPlatform')
    expect(getPlatformCapabilities().fileExport).toBe(false)

    g.NativeModules = { SongloftPlatform: { shareFile: () => {} } }
    expect(getPlatformCapabilities().fileExport).toBe(true)
  })
})

describe('native log-archive fast path', () => {
  test('off when the host only has the old shareFile', () => {
    // This is the shape that made "export logs" slow: JS deflates + base64s up
    // to 30 MB on a JIT-less engine. A shell without `shareLogArchive` must
    // still get that path, not a rejected call.
    withModules('SongloftPlatform')
    g.NativeModules = { SongloftPlatform: { shareFile: () => {} } }
    const caps = getPlatformCapabilities()
    expect(caps.fastLogExport).toBe(false)
    expect(caps.fileExport).toBe(true)
  })

  test('on once the host implements shareLogArchive', () => {
    g.SystemInfo = { platform: 'Android' }
    g.NativeModules = { SongloftPlatform: { shareFile: () => {}, shareLogArchive: () => {} } }
    expect(getPlatformCapabilities().fastLogExport).toBe(true)
  })

  test('shareLogArchive alone is enough for fileExport', () => {
    // Either method hands a file to the user. Keying `fileExport` on `shareFile`
    // alone would push a host that implements only the newer method to the
    // degraded "open the backend log URL" row — which carries no client logs —
    // despite having the better implementation of this exact feature.
    g.SystemInfo = { platform: 'Android' }
    g.NativeModules = { SongloftPlatform: { shareLogArchive: () => {} } }
    const caps = getPlatformCapabilities()
    expect(caps.fileExport).toBe(true)
    expect(caps.fastLogExport).toBe(true)
  })

  test('off on Web, which has no client log file to zip natively', () => {
    // Web keeps the JS path deliberately: its client log lives in an in-memory
    // buffer no host can read, the realm has a JIT, and `shareFile` there is a
    // browser download rather than a share sheet.
    asWeb()
    g.NativeModules = { SongloftPlatform: { shareFile: () => {} } }
    expect(getPlatformCapabilities().fastLogExport).toBe(false)
  })
})

describe('on-device song cache', () => {
  test('off when the module is absent', () => {
    withModules('SongloftPlatform')
    expect(getPlatformCapabilities().songCache).toBe(false)
  })

  test('off for a stale shell that has the module but not getCacheInfo', () => {
    // `download` changed arity this batch; keying the capability off it would let
    // an old shell (which still exposes the 3-arg `download`) advertise caching and
    // then be fed arguments it cannot bind. `getCacheInfo` only exists on the new
    // module, so its absence must read as "no cache support".
    g.SystemInfo = { platform: 'Android' }
    g.NativeModules = { SongloftSongCache: { download: () => {} } }
    expect(getPlatformCapabilities().songCache).toBe(false)
  })

  test('on once getCacheInfo is present', () => {
    g.SystemInfo = { platform: 'Android' }
    g.NativeModules = { SongloftSongCache: { getCacheInfo: () => {} } }
    expect(getPlatformCapabilities().songCache).toBe(true)
  })
})

describe('with no host at all (unit-test realm)', () => {
  test('everything degrades to off rather than throwing', () => {
    const caps = getPlatformCapabilities()
    expect(caps.dlna).toBe(false)
    expect(caps.dataTransfer).toBe(false)
    expect(caps.nativeFilePicker).toBe(false)
  })
})
