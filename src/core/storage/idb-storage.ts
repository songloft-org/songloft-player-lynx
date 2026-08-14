import type { SongloftStorage } from './types.js'

/**
 * IndexedDB `SongloftStorage` — the persistent backend for the **Web** platform.
 *
 * **Why not `localStorage`.** `web-storage.ts` is only reachable in a realm that
 * has one, and the realm this app actually runs in does not: `@lynx-js/web-core`
 * executes the background thread inside a real `Worker`, where `localStorage`
 * and `sessionStorage` are both `undefined` (Web Storage is window-only). So on
 * Web the capability probe fell through to `createMemoryStorage()`, and every
 * page reload dropped the tokens with it — you were bounced back to /login,
 * announced only by a console warning.
 *
 * **Why not bridge to the main thread.** web-core can expose host-provided
 * native modules to the worker, but that means shipping and wiring an extra host
 * file into *both* deployments (`web/index.html` and the embedded Go bundle).
 * `indexedDB` is available in the worker with no host cooperation at all
 * (verified in a headless Chrome: `typeof indexedDB === 'object'` and a
 * put/get round-trip succeeds), and it is same-origin persistent exactly like
 * `localStorage`.
 *
 * ⚠️ Same caveat as `web-storage.ts`: the Web platform has no secure enclave, so
 * `secure` here is only as safe as any same-origin script. Namespacing keeps the
 * two spaces apart, nothing more.
 */

const DB_NAME = 'songloft'
const DB_VERSION = 1
const STORE_NAME = 'kv'
const PREFS_PREFIX = 'prefs.'
const SECURE_PREFIX = 'secure.'

/**
 * Auth bootstrap (`hydrate` → `checkAuth`) awaits the first read, so an `open`
 * that never settles would hang the app on a blank screen. Browsers fire neither
 * `onsuccess` nor `onerror` while a version change is blocked by another tab, and
 * private-mode quirks can stall it too — so give up and degrade instead of waiting.
 */
const OPEN_TIMEOUT_MS = 3000

/** Minimal shape used here, so this file needs no DOM-lib IDB types at runtime. */
type Factory = Pick<IDBFactory, 'open'>

/** True when the current realm exposes an `indexedDB` factory at all. */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB != null
  } catch {
    // undeclared bare identifier in an exotic realm
    return false
  }
}

/** Resolves to the open database, or `null` if it cannot be opened in time. */
function openDatabase(factory: Factory): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (db: IDBDatabase | null) => {
      if (settled) return
      settled = true
      resolve(db)
    }
    const timer = setTimeout(() => finish(null), OPEN_TIMEOUT_MS)
    const done = (db: IDBDatabase | null) => {
      clearTimeout(timer)
      finish(db)
    }
    try {
      const req = factory.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
      }
      req.onsuccess = () => done(req.result)
      req.onerror = () => done(null)
      req.onblocked = () => done(null)
    } catch {
      done(null)
    }
  })
}

/** Never rejects: a failed request reads as "absent", like `native-storage`. */
function requested<T>(req: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

/**
 * Writes are only durable once the transaction commits — `request.onsuccess`
 * fires before that — so `set`/`remove` wait for `oncomplete`.
 */
function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
}

/**
 * Build an IndexedDB-backed storage over an explicit factory (tests inject a
 * fake) or `globalThis.indexedDB`.
 *
 * If the database cannot be opened, every operation transparently degrades to a
 * process-local map: the session still works, it just does not survive a reload
 * — the pre-existing behaviour, minus the hard failure. Writes go to that map
 * either way, so a read still answers correctly when a later IDB request fails
 * on its own.
 */
export function createIndexedDBStorage(factory?: Factory): SongloftStorage {
  const idb = factory ?? (globalThis as { indexedDB?: Factory }).indexedDB
  const mirror = new Map<string, string>()
  let opening: Promise<IDBDatabase | null> | null = null

  const database = (): Promise<IDBDatabase | null> => {
    opening ??= idb ? openDatabase(idb) : Promise.resolve(null)
    return opening
  }

  function namespaced(prefix: string) {
    return {
      async get(key: string): Promise<string | null> {
        const full = prefix + key
        const db = await database()
        if (db) {
          try {
            const tx = db.transaction(STORE_NAME, 'readonly')
            const value = await requested(tx.objectStore(STORE_NAME).get(full))
            if (typeof value === 'string') return value
            // Absent in IDB: fall through to the mirror rather than reporting
            // "no value" for something this session just wrote.
          } catch {
            // fall through to the mirror
          }
        }
        return mirror.get(full) ?? null
      },

      async set(key: string, value: string): Promise<void> {
        const full = prefix + key
        mirror.set(full, value)
        const db = await database()
        if (!db) return
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite')
          tx.objectStore(STORE_NAME).put(value, full)
          await committed(tx)
        } catch {
          // mirror already holds it; persistence is what was lost
        }
      },

      async remove(key: string): Promise<void> {
        const full = prefix + key
        mirror.delete(full)
        const db = await database()
        if (!db) return
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite')
          tx.objectStore(STORE_NAME).delete(full)
          await committed(tx)
        } catch {
          // nothing else to do — the mirror no longer has it
        }
      },

      async keys(): Promise<string[]> {
        const out = new Set<string>()
        const db = await database()
        if (db) {
          try {
            const tx = db.transaction(STORE_NAME, 'readonly')
            const raw = await requested(tx.objectStore(STORE_NAME).getAllKeys())
            for (const k of raw ?? []) {
              if (typeof k === 'string' && k.startsWith(prefix)) out.add(k.slice(prefix.length))
            }
          } catch {
            // fall through to the mirror
          }
        }
        for (const k of mirror.keys()) {
          if (k.startsWith(prefix)) out.add(k.slice(prefix.length))
        }
        return [...out]
      },
    }
  }

  const prefs = namespaced(PREFS_PREFIX)
  const secure = namespaced(SECURE_PREFIX)

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
