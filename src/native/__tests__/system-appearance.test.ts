import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  applySystemAppearance,
  coerceSystemLocale,
  coerceSystemTheme,
  getSystemAppearance,
  GLOBAL_PROP_LOCALE,
  GLOBAL_PROP_THEME,
  initSystemAppearance,
  parseSystemAppearance,
  setSystemAppearanceForTests,
  subscribeSystemAppearance,
  SYSTEM_APPEARANCE_EVENT,
} from '../system-appearance.js'

/**
 * A `lynx` double: `__globalProps` for the initial read plus a
 * `GlobalEventEmitter` whose registered listeners we can fire, so the host-push
 * path is exercised the same way the device delivers it
 * (`sendGlobalEvent(name, [payload])` → listener's first argument).
 */
function installLynxDouble(globalProps: Record<string, unknown>) {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const emitter = {
    addListener: (name: string, fn: (...args: unknown[]) => void) => {
      const list = listeners.get(name) ?? []
      list.push(fn)
      listeners.set(name, list)
    },
    removeListener: () => {},
  }
  ;(globalThis as Record<string, unknown>).lynx = {
    __globalProps: globalProps,
    getJSModule: (name: string) => (name === 'GlobalEventEmitter' ? emitter : null),
  }
  return {
    /** Emit as the host does: one transparent payload argument. */
    emit(name: string, payload: unknown) {
      for (const fn of listeners.get(name) ?? []) fn(payload)
    },
    listenerCount: (name: string) => (listeners.get(name) ?? []).length,
  }
}

afterEach(() => {
  setSystemAppearanceForTests(null)
  delete (globalThis as Record<string, unknown>).lynx
})

describe('coercion (host values are untrusted)', () => {
  test('only light/dark survive as a theme; everything else is "unknown"', () => {
    expect(coerceSystemTheme('light')).toBe('light')
    expect(coerceSystemTheme('dark')).toBe('dark')
    // The host sends '' for UI_MODE_NIGHT_UNDEFINED — must not become a guess.
    expect(coerceSystemTheme('')).toBeNull()
    expect(coerceSystemTheme('DARK')).toBeNull()
    expect(coerceSystemTheme(undefined)).toBeNull()
    expect(coerceSystemTheme(null)).toBeNull()
    expect(coerceSystemTheme(1)).toBeNull()
  })

  test('a locale must be a non-empty string', () => {
    expect(coerceSystemLocale('zh-CN')).toBe('zh-CN')
    expect(coerceSystemLocale('  en-US  ')).toBe('en-US')
    expect(coerceSystemLocale('')).toBeNull()
    expect(coerceSystemLocale('   ')).toBeNull()
    expect(coerceSystemLocale(42)).toBeNull()
  })

  test('parseSystemAppearance tolerates a missing / non-object payload', () => {
    expect(parseSystemAppearance(null)).toEqual({ theme: null, locale: null })
    expect(parseSystemAppearance(undefined)).toEqual({ theme: null, locale: null })
    expect(parseSystemAppearance({})).toEqual({ theme: null, locale: null })
    expect(
      parseSystemAppearance({ [GLOBAL_PROP_THEME]: 'dark', [GLOBAL_PROP_LOCALE]: 'zh-CN' }),
    ).toEqual({ theme: 'dark', locale: 'zh-CN' })
  })
})

describe('reading the host', () => {
  test('no lynx global at all → unknown, and no throw', () => {
    expect(getSystemAppearance()).toEqual({ theme: null, locale: null })
  })

  test('lynx.__globalProps is read lazily, so the first render sees it', () => {
    installLynxDouble({ [GLOBAL_PROP_THEME]: 'light', [GLOBAL_PROP_LOCALE]: 'zh-CN' })
    // No initSystemAppearance() call — this is the launch-frame path.
    expect(getSystemAppearance()).toEqual({ theme: 'light', locale: 'zh-CN' })
  })

  test('initSystemAppearance re-reads globalProps and is idempotent', () => {
    const host = installLynxDouble({ [GLOBAL_PROP_THEME]: 'dark' })
    expect(initSystemAppearance()).toEqual({ theme: 'dark', locale: null })
    initSystemAppearance()
    initSystemAppearance()
    // One host listener, not three — repeated startup must not double-deliver.
    expect(host.listenerCount(SYSTEM_APPEARANCE_EVENT)).toBe(1)
  })
})

describe('host pushes', () => {
  test('a global event updates the value and notifies subscribers', () => {
    const host = installLynxDouble({ [GLOBAL_PROP_THEME]: 'dark' })
    initSystemAppearance()
    const seen = vi.fn()
    const unsubscribe = subscribeSystemAppearance(seen)

    host.emit(SYSTEM_APPEARANCE_EVENT, {
      [GLOBAL_PROP_THEME]: 'light',
      [GLOBAL_PROP_LOCALE]: 'en-US',
    })

    expect(getSystemAppearance()).toEqual({ theme: 'light', locale: 'en-US' })
    expect(seen).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  test('an unchanged appearance does not notify', () => {
    installLynxDouble({ [GLOBAL_PROP_THEME]: 'dark', [GLOBAL_PROP_LOCALE]: 'zh-CN' })
    initSystemAppearance()
    const seen = vi.fn()
    const unsubscribe = subscribeSystemAppearance(seen)

    applySystemAppearance({ theme: 'dark', locale: 'zh-CN' })

    expect(seen).not.toHaveBeenCalled()
    unsubscribe()
  })

  test('unsubscribing stops delivery', () => {
    const host = installLynxDouble({})
    initSystemAppearance()
    const seen = vi.fn()
    subscribeSystemAppearance(seen)()

    host.emit(SYSTEM_APPEARANCE_EVENT, { [GLOBAL_PROP_THEME]: 'light' })

    expect(getSystemAppearance().theme).toBe('light')
    expect(seen).not.toHaveBeenCalled()
  })

  test('a host with no GlobalEventEmitter still yields globalProps', () => {
    ;(globalThis as Record<string, unknown>).lynx = {
      __globalProps: { [GLOBAL_PROP_THEME]: 'light' },
      getJSModule: () => null,
    }
    expect(initSystemAppearance()).toEqual({ theme: 'light', locale: null })
  })
})
