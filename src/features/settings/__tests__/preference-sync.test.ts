import { afterEach, expect, test, vi } from 'vitest'

import {
  DEFAULT_USER_PREFERENCES,
  PreferenceSync,
  parseUserPreferences,
} from '../domain/preference-sync.js'
import { filterRemotePreferencesForPlatform } from '../data/preference-sync.js'
import type {
  PreferencePatch,
  UserPreferences,
} from '../../../core/storage/user-preference-events.js'

afterEach(() => vi.useRealTimers())
const defaults = { ...DEFAULT_USER_PREFERENCES }

test('a local edit retries an initially offline pull while preserving the edit', async () => {
  vi.useFakeTimers()
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ ...defaults, theme_mode: 'dark', volume: 77 })
  const save = vi.fn(async (_prefs: UserPreferences) => {})
  const applied: string[] = []
  const sync = new PreferenceSync({
    readLocal: async () => defaults,
    fetch,
    save,
    apply: async (patch, canApply) => {
      for (const key of Object.keys(patch) as (keyof UserPreferences)[])
        if (canApply(key)) applied.push(key)
    },
  })
  await sync.start()
  sync.change({ volume: 42 })
  await vi.runAllTimersAsync()
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(applied).toContain('theme_mode')
  expect(applied).not.toContain('volume')
  expect(save.mock.calls[0]?.[0]).toMatchObject({ theme_mode: 'dark', volume: 42 })
  sync.stop()
})

test('existing server preferences update the client without echoing a PUT', async () => {
  vi.useFakeTimers()
  const remote = { ...defaults, theme_mode: 'dark' as const, volume: 77 }
  const save = vi.fn(async (_prefs: UserPreferences) => {})
  const apply = vi.fn(async (_patch: PreferencePatch) => {})
  const sync = new PreferenceSync({
    readLocal: async () => defaults,
    fetch: async () => remote,
    save,
    apply,
  })
  await sync.start()
  expect(apply.mock.calls[0]?.[0]).toEqual(remote)
  await vi.runAllTimersAsync()
  expect(save).not.toHaveBeenCalled()
  sync.stop()
})

test('an all-default server is seeded from local settings, and subsequent edits debounce', async () => {
  vi.useFakeTimers()
  const save = vi.fn(async (_prefs: UserPreferences) => {})
  const apply = vi.fn(async () => {})
  const sync = new PreferenceSync({
    readLocal: async () => ({ ...defaults, audio_quality: '320' }),
    fetch: async () => defaults,
    save,
    apply,
  })
  await sync.start()
  sync.change({ volume: 40 })
  sync.change({ volume: 42 })
  await vi.advanceTimersByTimeAsync(499)
  expect(save).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(save.mock.calls[0]?.[0]).toMatchObject({ audio_quality: '320', volume: 42 })
  expect(apply).not.toHaveBeenCalled()
  sync.stop()
})

test('an edit made during the initial GET wins over the late server response', async () => {
  vi.useFakeTimers()
  let resolve!: (value: unknown) => void
  const save = vi.fn(async (_prefs: UserPreferences) => {})
  const fields: string[] = []
  const sync = new PreferenceSync({
    readLocal: async () => defaults,
    fetch: () =>
      new Promise((done) => {
        resolve = done
      }),
    save,
    apply: async (patch, canApply) => {
      for (const key of Object.keys(patch) as (keyof typeof defaults)[])
        if (canApply(key)) fields.push(key)
    },
  })
  const pending = sync.start()
  sync.change({ theme_mode: 'light' })
  resolve({ ...defaults, theme_mode: 'dark', volume: 33 })
  await pending
  expect(fields).not.toContain('theme_mode')
  expect(fields).toContain('volume')
  await vi.runAllTimersAsync()
  expect(save.mock.calls[0]?.[0]).toMatchObject({ theme_mode: 'light', volume: 33 })
  sync.stop()
})

test('logout discards a pending GET and cancels a debounced write', async () => {
  vi.useFakeTimers()
  let resolve!: (value: unknown) => void
  const apply = vi.fn(async () => {})
  const save = vi.fn(async () => {})
  const sync = new PreferenceSync({
    readLocal: async () => defaults,
    fetch: () =>
      new Promise((done) => {
        resolve = done
      }),
    save,
    apply,
  })
  const pending = sync.start()
  sync.stop()
  resolve({ ...defaults, volume: 88 })
  await pending
  expect(apply).not.toHaveBeenCalled()
  const next = new PreferenceSync({
    readLocal: async () => defaults,
    fetch: async () => defaults,
    save,
    apply,
  })
  await next.start()
  next.change({ volume: 5 })
  next.stop()
  await vi.runAllTimersAsync()
  expect(save).not.toHaveBeenCalled()
})

test('failed or malformed initial reads never overwrite the server with guessed defaults', async () => {
  vi.useFakeTimers()
  for (const fetch of [
    async () => ({}),
    async () => {
      throw new Error('offline')
    },
  ]) {
    const save = vi.fn(async () => {})
    const sync = new PreferenceSync({
      readLocal: async () => defaults,
      fetch,
      save,
      apply: async () => {},
    })
    await sync.start()
    sync.change({ volume: 20 })
    await vi.runAllTimersAsync()
    expect(save).not.toHaveBeenCalled()
    sync.stop()
  }
  expect(() => parseUserPreferences({ ...defaults, volume: NaN })).toThrow()
})

test('Android ignores the remote app volume during startup', () => {
  const globals = globalThis as Record<string, unknown>
  globals.SystemInfo = { platform: 'Android' }
  try {
    expect(
      filterRemotePreferencesForPlatform({ volume: 12, play_mode: 'order' }),
    ).toEqual({ play_mode: 'order' })
  } finally {
    delete globals.SystemInfo
  }
})
