import { afterEach, describe, expect, test } from 'vitest'

import { createMemoryStorage } from '../../../core/storage/index.js'
import {
  applySystemAppearance,
  setSystemAppearanceForTests,
} from '../../../native/system-appearance.js'
import {
  applySavedTheme,
  changeAppTheme,
  coerceAppTheme,
  DEFAULT_RESOLVED_THEME,
  getAppTheme,
  PREF_THEME,
  readSavedTheme,
  resolveTheme,
  subscribeAppTheme,
} from '../theme-model.js'

afterEach(() => {
  setSystemAppearanceForTests(null)
})

describe('theme coercion + resolution (pure)', () => {
  test('coerceAppTheme accepts light/dark, else falls back to system', () => {
    expect(coerceAppTheme('light')).toBe('light')
    expect(coerceAppTheme('dark')).toBe('dark')
    expect(coerceAppTheme(null)).toBe('system')
    expect(coerceAppTheme(undefined)).toBe('system')
    expect(coerceAppTheme('')).toBe('system')
    expect(coerceAppTheme('auto')).toBe('system')
  })

  test('resolveTheme returns an explicit choice unchanged, host or no host', () => {
    setSystemAppearanceForTests({ theme: 'light', locale: null })
    expect(resolveTheme('dark')).toBe('dark')
    setSystemAppearanceForTests({ theme: 'dark', locale: null })
    expect(resolveTheme('light')).toBe('light')
  })

  test('resolveTheme("system") follows the host signal', () => {
    setSystemAppearanceForTests({ theme: 'light', locale: null })
    expect(resolveTheme('system')).toBe('light')

    setSystemAppearanceForTests({ theme: 'dark', locale: null })
    expect(resolveTheme('system')).toBe('dark')
  })

  test('resolveTheme("system") falls back only when the host reports nothing', () => {
    setSystemAppearanceForTests({ theme: null, locale: 'zh-CN' })
    expect(resolveTheme('system')).toBe(DEFAULT_RESOLVED_THEME)
  })
})

describe('following the host theme (bug.md: 外观跟随系统没效果)', () => {
  test('a host flip re-notifies subscribers while the choice is system', async () => {
    const storage = createMemoryStorage()
    setSystemAppearanceForTests({ theme: 'dark', locale: null })
    await changeAppTheme('system', storage)

    let notified = 0
    subscribeAppTheme(() => {
      notified += 1
    })

    applySystemAppearance({ theme: 'light', locale: null })

    // The *choice* is still 'system' — only the resolution changed, which is why
    // ThemeProvider must keep the resolved theme in state.
    expect(getAppTheme()).toBe('system')
    expect(resolveTheme(getAppTheme())).toBe('light')
    expect(notified).toBe(1)
  })

  test('a host flip is ignored while the user picked a concrete theme', async () => {
    const storage = createMemoryStorage()
    setSystemAppearanceForTests({ theme: 'dark', locale: null })
    await changeAppTheme('dark', storage)

    let notified = 0
    subscribeAppTheme(() => {
      notified += 1
    })

    applySystemAppearance({ theme: 'light', locale: null })

    expect(resolveTheme(getAppTheme())).toBe('dark')
    expect(notified).toBe(0)
  })
})

describe('changeAppTheme (persists + switches live state)', () => {
  test('a concrete theme updates the live module state and persists the choice', async () => {
    const storage = createMemoryStorage()

    const resolved = await changeAppTheme('light', storage)
    expect(resolved).toBe('light')
    expect(getAppTheme()).toBe('light')
    expect(await storage.prefs.get(PREF_THEME)).toBe('light')
    expect(await readSavedTheme(storage)).toBe('light')

    await changeAppTheme('dark', storage)
    expect(getAppTheme()).toBe('dark')
    expect(await storage.prefs.get(PREF_THEME)).toBe('dark')
  })

  test('system removes the pref and resets the live state to system', async () => {
    const storage = createMemoryStorage()
    await storage.prefs.set(PREF_THEME, 'light')

    const resolved = await changeAppTheme('system', storage)
    expect(resolved).toBe('system')
    expect(getAppTheme()).toBe('system')
    expect(await storage.prefs.get(PREF_THEME)).toBeNull()
    expect(await readSavedTheme(storage)).toBe('system')
  })

  test('notifies subscribers only when the live theme actually changes', async () => {
    const storage = createMemoryStorage()
    await changeAppTheme('dark', storage)

    let notified = 0
    const unsubscribe = subscribeAppTheme(() => {
      notified += 1
    })

    await changeAppTheme('dark', storage) // no-op, same value
    expect(notified).toBe(0)

    await changeAppTheme('light', storage)
    expect(notified).toBe(1)

    unsubscribe()
    await changeAppTheme('dark', storage)
    expect(notified).toBe(1) // no longer subscribed
  })
})

describe('applySavedTheme (startup)', () => {
  test('applies the persisted theme to the live module state', async () => {
    const storage = createMemoryStorage()
    await storage.prefs.set(PREF_THEME, 'light')

    const resolved = await applySavedTheme(storage)
    expect(resolved).toBe('light')
    expect(getAppTheme()).toBe('light')
  })

  test('falls back to system when nothing is persisted', async () => {
    const storage = createMemoryStorage()

    const resolved = await applySavedTheme(storage)
    expect(resolved).toBe('system')
    expect(getAppTheme()).toBe('system')
  })
})
