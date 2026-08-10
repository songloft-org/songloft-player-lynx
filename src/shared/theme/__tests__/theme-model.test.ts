import { describe, expect, test } from 'vitest'

import { createMemoryStorage } from '../../../core/storage/index.js'
import {
  applySavedTheme,
  changeAppTheme,
  coerceAppTheme,
  getAppTheme,
  PREF_THEME,
  readSavedTheme,
  resolveTheme,
  subscribeAppTheme,
} from '../theme-model.js'

describe('theme coercion + resolution (pure)', () => {
  test('coerceAppTheme accepts light/dark, else falls back to system', () => {
    expect(coerceAppTheme('light')).toBe('light')
    expect(coerceAppTheme('dark')).toBe('dark')
    expect(coerceAppTheme(null)).toBe('system')
    expect(coerceAppTheme(undefined)).toBe('system')
    expect(coerceAppTheme('')).toBe('system')
    expect(coerceAppTheme('auto')).toBe('system')
  })

  test('resolveTheme maps system → dark (no host signal yet), else itself', () => {
    expect(resolveTheme('system')).toBe('dark')
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
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
