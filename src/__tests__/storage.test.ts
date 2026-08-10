import { afterEach, describe, expect, test } from 'vitest'

import {
  createMemoryStorage,
  createNativeStorage,
  createSongloftStorage,
  createWebStorage,
  isNativeStorageAvailable,
  type SongloftStorageNativeModule,
} from '../core/storage/index.js'

/**
 * Fake `NativeModules.SongloftStorage`: SharedPreferences-like, callback-based
 * reads (mirrors the Kotlin module + the Lynx `Callback` shape). Two areas.
 */
function fakeNativeStorageModule(): SongloftStorageNativeModule & {
  dump(area: string): Record<string, string>
} {
  const areas: Record<string, Map<string, string>> = {
    prefs: new Map(),
    secure: new Map(),
  }
  const areaMap = (area: string) => (areas[area] ??= new Map())
  return {
    getItem(area, key, callback) {
      const m = areaMap(area)
      callback(m.has(key) ? m.get(key)! : null)
    },
    setItem(area, key, value) {
      areaMap(area).set(key, value)
    },
    removeItem(area, key) {
      areaMap(area).delete(key)
    },
    getKeys(area, callback) {
      callback([...areaMap(area).keys()])
    },
    getPath(name, callback) {
      callback(`/data/data/org.songloft.lynx/${name}`)
    },
    dump(area) {
      return Object.fromEntries(areaMap(area))
    },
  }
}

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

describe('native storage (callback → Promise adapter)', () => {
  test('prefs and secure round-trip through the native module (persisted)', async () => {
    const mod = fakeNativeStorageModule()
    const s = createNativeStorage(mod)
    expect(await s.prefs.get('lang')).toBeNull()
    await s.prefs.set('lang', 'zh')
    await s.secure.set('access_token', 'jwt-123')
    expect(await s.prefs.get('lang')).toBe('zh')
    expect(await s.secure.get('access_token')).toBe('jwt-123')
    // areas are backed separately (secure never leaks into prefs)
    expect(await s.prefs.keys()).toEqual(['lang'])
    expect(mod.dump('secure')).toEqual({ access_token: 'jwt-123' })
    await s.secure.remove('access_token')
    expect(await s.secure.get('access_token')).toBeNull()
  })

  test('paths use the native getPath', async () => {
    const s = createNativeStorage(fakeNativeStorageModule())
    expect(await s.paths.cache()).toBe('/data/data/org.songloft.lynx/cache')
  })

  test('a missing getPath falls back to a virtual path', async () => {
    const mod = fakeNativeStorageModule() as SongloftStorageNativeModule
    delete (mod as { getPath?: unknown }).getPath
    const s = createNativeStorage(mod)
    expect(await s.paths.appData()).toBe('/songloft/appData')
  })

  test('a getItem that throws resolves to null (never rejects auth bootstrap)', async () => {
    const mod: SongloftStorageNativeModule = {
      getItem: () => {
        throw new Error('bridge down')
      },
      setItem: () => {},
      removeItem: () => {},
      getKeys: () => {},
    }
    const s = createNativeStorage(mod)
    await expect(s.secure.get('access_token')).resolves.toBeNull()
  })
})

describe('isNativeStorageAvailable (probe)', () => {
  test('true only when every required method is present', () => {
    expect(isNativeStorageAvailable(undefined)).toBe(false)
    expect(isNativeStorageAvailable({})).toBe(false)
    expect(isNativeStorageAvailable({ SongloftStorage: {} })).toBe(false)
    const partial = fakeNativeStorageModule() as unknown as Record<string, unknown>
    delete partial.getKeys
    expect(isNativeStorageAvailable({ SongloftStorage: partial })).toBe(false)
    expect(
      isNativeStorageAvailable({ SongloftStorage: fakeNativeStorageModule() }),
    ).toBe(true)
  })
})

describe('createSongloftStorage selection (native → web → memory)', () => {
  afterEach(() => {
    delete (globalThis as { NativeModules?: unknown }).NativeModules
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  test('prefers the persistent native module when present', async () => {
    const mod = fakeNativeStorageModule()
    ;(globalThis as { NativeModules?: unknown }).NativeModules = { SongloftStorage: mod }
    const s = createSongloftStorage()
    await s.secure.set('access_token', 'persisted')
    // The write landed in the native module's backing store (survives restart).
    expect(mod.dump('secure')).toEqual({ access_token: 'persisted' })
  })

  test('falls back to web storage when only localStorage exists', async () => {
    ;(globalThis as { localStorage?: unknown }).localStorage = fakeLocalStorage()
    const s = createSongloftStorage()
    await s.prefs.set('k', 'v')
    expect(await s.prefs.get('k')).toBe('v')
    // web storage namespaces into the injected localStorage
    expect(
      (globalThis as { localStorage: ReturnType<typeof fakeLocalStorage> }).localStorage.getItem(
        'songloft.prefs.k',
      ),
    ).toBe('v')
  })

  test('falls back to in-memory storage when neither is available', async () => {
    const s = createSongloftStorage()
    await s.prefs.set('k', 'v')
    expect(await s.prefs.get('k')).toBe('v')
  })
})
