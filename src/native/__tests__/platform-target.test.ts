import { afterEach, expect, test } from 'vitest'

import { getPlatformTarget } from '../platform-target.js'
import { isWebPlatform } from '../web-platform.js'

/**
 * `getPlatformTarget` decides which containers the server has to transcode. Getting
 * it wrong is silent in both directions: too permissive and the device is handed a
 * container it cannot open (an `.ogg` on AVPlayer just never plays), too restrictive
 * and every video song is sent `?format=mp3`, which makes the server run `-vn` and
 * throw the picture away. That second one shipped, because `songUrl()` passed no
 * platform at all and the default was `'web'`.
 *
 * The host values here are **measured**, not assumed: read through the TestBridge on
 * 2026-08-16 from an iPhone 16 Pro (iOS 18.3) and an Android 13 emulator,
 * `SystemInfo.platform` is exactly `'iOS'` and `'Android'`.
 */

const g = globalThis as Record<string, unknown>

afterEach(() => {
  delete g.SystemInfo
})

test('the measured host values map to their platforms', () => {
  g.SystemInfo = { platform: 'Android' }
  expect(getPlatformTarget()).toBe('android')
  g.SystemInfo = { platform: 'iOS' }
  expect(getPlatformTarget()).toBe('ios')
  g.SystemInfo = { platform: 'web' }
  expect(getPlatformTarget()).toBe('web')
})

test('older Apple spellings still count as iOS', () => {
  // Falling through to 'web' here would ask the server to transcode everything —
  // wasteful rather than broken, but silently so.
  for (const platform of ['iPadOS', 'iPhone OS', 'iphone os']) {
    g.SystemInfo = { platform }
    expect(getPlatformTarget(), platform).toBe('ios')
  }
})

test('an unknown or malformed platform falls back to the most restrictive set', () => {
  expect(getPlatformTarget()).toBe('web')
  g.SystemInfo = {}
  expect(getPlatformTarget()).toBe('web')
  g.SystemInfo = { platform: 42 }
  expect(getPlatformTarget()).toBe('web')
  g.SystemInfo = { platform: 'Harmony' }
  expect(getPlatformTarget()).toBe('web')
})

/**
 * The two readers of `SystemInfo.platform` disagree on purpose when there is no
 * host, and that asymmetry is load-bearing: implementing either in terms of the
 * other would make `isWebPlatform()` true in every unit test, flipping the
 * `<refresh>` / `<webview>` render decisions that AGENTS.md §4 warns about.
 */
test('the no-host fallbacks are deliberately different from isWebPlatform', () => {
  expect(getPlatformTarget()).toBe('web')
  expect(isWebPlatform()).toBe(false)
})
