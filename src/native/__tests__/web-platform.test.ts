import { afterEach, expect, test } from 'vitest'

import { isWebPlatform } from '../web-platform.js'

/**
 * `isWebPlatform` exists because `isWebEnvironment` cannot answer the question it
 * was being asked. Under `@lynx-js/web-core` the app's background thread is a
 * real `Worker` (`new Worker(…, {name:'lynx-bg'})`), so the realm that renders
 * components has no `window` and no `document` — a DOM probe reports "not Web" on
 * the Web platform. That mis-answer is what kept the home page's "下拉刷新…" label
 * on screen: `enable-refresh={!isWebEnvironment()}` evaluated to `true` there.
 *
 * `SystemInfo` is the signal that survives the thread boundary: web-core builds it
 * on the main thread (`systemInfoBase = { platform: 'web' }`) and forwards the same
 * object into the worker's start message. These tests pin that contract — including
 * the device values, where a false positive would strip pull-to-refresh from
 * Android/iOS.
 */

const g = globalThis as Record<string, unknown>

afterEach(() => {
  delete g.SystemInfo
})

test('web-core’s SystemInfo means Web, on either thread', () => {
  g.SystemInfo = { platform: 'web', lynxSdkVersion: '3.0' }
  expect(isWebPlatform()).toBe(true)
})

test('device platforms are not Web', () => {
  for (const platform of ['Android', 'iOS', 'macOS', 'windows', 'Harmony']) {
    g.SystemInfo = { platform }
    expect(isWebPlatform(), platform).toBe(false)
  }
})

test('a missing or malformed SystemInfo is not Web', () => {
  expect(isWebPlatform()).toBe(false)
  g.SystemInfo = {}
  expect(isWebPlatform()).toBe(false)
  g.SystemInfo = { platform: 42 }
  expect(isWebPlatform()).toBe(false)
})
