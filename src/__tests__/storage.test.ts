import { describe, expect, test } from 'vitest'

import {
  createMemoryStorage,
  createNativeStorage,
  createWebStorage,
} from '../core/storage/index.js'

/** Minimal in-memory `localStorage` stand-in for the web storage impl. */
function fakeLocalStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
  }
}

describe('web storage', () => {
  test('prefs read/write/remove/keys round-trip', async () => {
    const s = createWebStorage(fakeLocalStorage())
    expect(await s.prefs.get('theme')).toBeNull()
    await s.prefs.set('theme', 'dark')
    await s.prefs.set('lang', 'zh')
    expect(await s.prefs.get('theme')).toBe('dark')
    expect((await s.prefs.keys()).sort()).toEqual(['lang', 'theme'])
    await s.prefs.remove('theme')
    expect(await s.prefs.get('theme')).toBeNull()
  })

  test('secure and prefs are namespaced separately', async () => {
    const store = fakeLocalStorage()
    const s = createWebStorage(store)
    await s.prefs.set('access_token', 'pref-value')
    await s.secure.set('access_token', 'secure-value')
    expect(await s.prefs.get('access_token')).toBe('pref-value')
    expect(await s.secure.get('access_token')).toBe('secure-value')
    // secure keys must not leak into prefs.keys()
    expect(await s.prefs.keys()).toEqual(['access_token'])
  })

  test('paths return virtual paths', async () => {
    const s = createWebStorage(fakeLocalStorage())
    expect(await s.paths.appData()).toContain('/songloft/')
    expect(await s.paths.cache()).toContain('/songloft/')
  })
})

describe('memory storage', () => {
  test('round-trips prefs and secure', async () => {
    const s = createMemoryStorage()
    await s.prefs.set('a', '1')
    await s.secure.set('t', 'secret')
    expect(await s.prefs.get('a')).toBe('1')
    expect(await s.secure.get('t')).toBe('secret')
    await s.secure.remove('t')
    expect(await s.secure.get('t')).toBeNull()
  })
})

describe('native storage stub', () => {
  test('throws a clear not-implemented error', async () => {
    const s = createNativeStorage()
    await expect(s.prefs.get('x')).rejects.toThrow(/not implemented/i)
    await expect(s.secure.set('x', 'y')).rejects.toThrow(/not implemented/i)
    await expect(s.paths.appData()).rejects.toThrow(/not implemented/i)
  })
})
