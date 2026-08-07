import type { SongloftStorage } from './types.js'

/**
 * Web `SongloftStorage`: `prefs` and `secure` both persist to `localStorage`
 * (namespaced by prefix); `paths` return virtual paths.
 *
 * Note the ⚠️ from the native-modules spec: web has no real secure enclave, so
 * `secure` here is only as safe as `localStorage`. This matches the Flutter web
 * behaviour (SharedPreferences → localStorage).
 */

const PREFS_PREFIX = 'songloft.prefs.'
const SECURE_PREFIX = 'songloft.secure.'

interface WebLocalStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  readonly length: number
  key(index: number): string | null
}

function namespace(store: WebLocalStorage, prefix: string) {
  return {
    async get(key: string): Promise<string | null> {
      return store.getItem(prefix + key)
    },
    async set(key: string, value: string): Promise<void> {
      store.setItem(prefix + key, value)
    },
    async remove(key: string): Promise<void> {
      store.removeItem(prefix + key)
    },
    async keys(): Promise<string[]> {
      const out: string[] = []
      for (let i = 0; i < store.length; i++) {
        const raw = store.key(i)
        if (raw != null && raw.startsWith(prefix)) out.push(raw.slice(prefix.length))
      }
      return out
    },
  }
}

/**
 * Build a web storage over an explicit `localStorage`-like object (injectable
 * for tests), or over `globalThis.localStorage`. Throws a clear error if none
 * is available — this impl must only be selected in a web-like realm.
 */
export function createWebStorage(localStorageLike?: WebLocalStorage): SongloftStorage {
  const store =
    localStorageLike ??
    (globalThis as { localStorage?: WebLocalStorage }).localStorage
  if (!store) {
    throw new Error(
      '[SongloftStorage] web storage selected but no localStorage is available',
    )
  }

  const prefs = namespace(store, PREFS_PREFIX)
  const secure = namespace(store, SECURE_PREFIX)

  return {
    prefs,
    secure: { get: secure.get, set: secure.set, remove: secure.remove },
    paths: {
      async appData() {
        return '/songloft/app-data'
      },
      async cache() {
        return '/songloft/cache'
      },
      async documents() {
        return '/songloft/documents'
      },
    },
  }
}
