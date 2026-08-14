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
})

describe('with no host at all (unit-test realm)', () => {
  test('everything degrades to off rather than throwing', () => {
    const caps = getPlatformCapabilities()
    expect(caps.dlna).toBe(false)
    expect(caps.dataTransfer).toBe(false)
    expect(caps.nativeFilePicker).toBe(false)
  })
})
