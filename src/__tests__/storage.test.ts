import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  createIndexedDBStorage,
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

/**
 * Minimal `IDBFactory` stand-in: enough of the request/transaction protocol for
 * `idb-storage.ts` to exercise its real code paths (jsdom ships no IndexedDB, and
 * the point of these tests is our commit/read logic, not a browser's).
 *
 * Handlers are invoked on a later microtask, like the real thing — assigning
 * `onsuccess` after the call must still work — and `oncomplete` fires strictly
 * after the request's own `onsuccess`, which is what makes the `committed()`
 * wait in `set`/`remove` meaningful.
 */
function fakeIndexedDB(opts: { failOpen?: boolean; stallOpen?: boolean } = {}) {
  const data = new Map<string, string>()
  const later = (fn: () => void) => void Promise.resolve().then(fn)

  const makeRequest = <T,>(run: () => T) => {
    const req: Record<string, unknown> = { result: undefined, error: null }
    later(() => {
      try {
        req.result = run()
        ;(req.onsuccess as (() => void) | undefined)?.()
      } catch (e) {
        req.error = e
        ;(req.onerror as (() => void) | undefined)?.()
      }
    })
    return req
  }

  const store = {
    get: (k: string) => makeRequest(() => (data.has(k) ? data.get(k) : undefined)),
    put: (v: string, k: string) => makeRequest(() => void data.set(k, v)),
    delete: (k: string) => makeRequest(() => void data.delete(k)),
    getAllKeys: () => makeRequest(() => [...data.keys()]),
  }

  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => store,
    transaction: () => {
      const tx: Record<string, unknown> = { objectStore: () => store }
      // Two microtask hops: after the request's own handler, never before.
      later(() => later(() => (tx.oncomplete as (() => void) | undefined)?.()))
      return tx
    },
  }

  return {
    dump: () => Object.fromEntries(data),
    factory: {
      open: () => {
        const req: Record<string, unknown> = { result: db, error: null }
        if (!opts.stallOpen) {
          later(() => {
            if (opts.failOpen) (req.onerror as (() => void) | undefined)?.()
            else (req.onsuccess as (() => void) | undefined)?.()
          })
        }
        return req
      },
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

/**
 * The Web platform's persistent backend. It exists because the realm this app
 * renders in — web-core's background `Worker` — has no `localStorage` at all, so
 * the probe used to fall through to memory and every reload logged the user out.
 */
describe('IndexedDB storage', () => {
  const asFactory = (f: { open: () => unknown }) => f as unknown as IDBFactory

  test('prefs and secure round-trip and persist under separate namespaces', async () => {
    const idb = fakeIndexedDB()
    const s = createIndexedDBStorage(asFactory(idb.factory))
    await s.prefs.set('server_url', 'http://localhost:58091')
    await s.secure.set('access_token', 'tok')
    expect(await s.prefs.get('server_url')).toBe('http://localhost:58091')
    expect(await s.secure.get('access_token')).toBe('tok')
    // Same key in both spaces must not collide.
    await s.prefs.set('access_token', 'not-a-token')
    expect(await s.secure.get('access_token')).toBe('tok')
    // Committed to the store, not just held in the process (this is the bug).
    expect(idb.dump()).toEqual({
      'prefs.server_url': 'http://localhost:58091',
      'prefs.access_token': 'not-a-token',
      'secure.access_token': 'tok',
    })
  })

  test('a reopened database sees what the previous session wrote', async () => {
    const idb = fakeIndexedDB()
    const first = createIndexedDBStorage(asFactory(idb.factory))
    await first.secure.set('access_token', 'survives')
    // Fresh instance, same backing store = the page reload this fixes.
    const second = createIndexedDBStorage(asFactory(idb.factory))
    expect(await second.secure.get('access_token')).toBe('survives')
  })

  test('keys are filtered by namespace and returned unprefixed', async () => {
    const idb = fakeIndexedDB()
    const s = createIndexedDBStorage(asFactory(idb.factory))
    await s.prefs.set('a', '1')
    await s.prefs.set('b', '2')
    await s.secure.set('c', '3')
    expect((await s.prefs.keys()).sort()).toEqual(['a', 'b'])
  })

  test('remove deletes from the store, not just the process mirror', async () => {
    const idb = fakeIndexedDB()
    const s = createIndexedDBStorage(asFactory(idb.factory))
    await s.secure.set('access_token', 'tok')
    await s.secure.remove('access_token')
    expect(await s.secure.get('access_token')).toBeNull()
    expect(idb.dump()).toEqual({})
  })

  test('an unopenable database degrades to the session instead of failing', async () => {
    const idb = fakeIndexedDB({ failOpen: true })
    const s = createIndexedDBStorage(asFactory(idb.factory))
    await s.prefs.set('k', 'v')
    // Usable in-session…
    expect(await s.prefs.get('k')).toBe('v')
    expect(await s.prefs.keys()).toEqual(['k'])
    // …but nothing was persisted, and no call rejected.
    expect(idb.dump()).toEqual({})
  })

  test('an open that never settles times out rather than hanging auth bootstrap', async () => {
    vi.useFakeTimers()
    try {
      const idb = fakeIndexedDB({ stallOpen: true })
      const s = createIndexedDBStorage(asFactory(idb.factory))
      const read = s.prefs.get('k')
      let settled = false
      void read.then(() => (settled = true))
      await vi.advanceTimersByTimeAsync(2999)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(2)
      expect(await read).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  test('no factory at all still yields a working, non-persistent storage', async () => {
    const s = createIndexedDBStorage()
    await s.prefs.set('k', 'v')
    expect(await s.prefs.get('k')).toBe('v')
  })
})

describe('createSongloftStorage selection (native → indexedDB → web → memory)', () => {
  afterEach(() => {
    delete (globalThis as { NativeModules?: unknown }).NativeModules
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { indexedDB?: unknown }).indexedDB
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

  /**
   * The Web platform's actual shape: web-core's `Worker` realm has `indexedDB`
   * but no `localStorage`. Before this branch existed the probe reached memory
   * storage here and tokens died with the page.
   */
  test('falls back to IndexedDB when only indexedDB exists (the Web worker realm)', async () => {
    const idb = fakeIndexedDB()
    ;(globalThis as { indexedDB?: unknown }).indexedDB = idb.factory
    const s = createSongloftStorage()
    await s.secure.set('access_token', 'tok')
    expect(await s.secure.get('access_token')).toBe('tok')
    // Chose IndexedDB, i.e. wrote through to a store that survives a reload.
    expect(idb.dump()).toEqual({ 'secure.access_token': 'tok' })
  })

  /**
   * The regression this ordering exists for: web-core surfaces a
   * `localStorage` inside its background realm that is NOT the browser's
   * persistent one — tokens written there died on every reload (the
   * "refresh bounces to /login with a flash" bug). IndexedDB in the same
   * realm is shared with the page origin and persists, so it must win.
   */
  test('prefers indexedDB over localStorage when a realm has both', async () => {
    const local = fakeLocalStorage()
    const idb = fakeIndexedDB()
    ;(globalThis as { localStorage?: unknown }).localStorage = local
    ;(globalThis as { indexedDB?: unknown }).indexedDB = idb.factory
    const s = createSongloftStorage()
    await s.prefs.set('k', 'v')
    expect(idb.dump()).toEqual({ 'prefs.k': 'v' })
    expect(local.getItem('songloft.prefs.k')).toBeNull()
  })

  test('falls back to in-memory storage when none is available', async () => {
    const s = createSongloftStorage()
    await s.prefs.set('k', 'v')
    expect(await s.prefs.get('k')).toBe('v')
  })
})
