import { readNativeModules } from '../../native/native-modules.js'
import { createMemoryStorage } from './memory-storage.js'
import {
  createNativeStorage,
  isNativeStorageAvailable,
  type SongloftStorageNativeModule,
} from './native-storage.js'
import { createWebStorage } from './web-storage.js'
import { createIndexedDBStorage, isIndexedDBAvailable } from './idb-storage.js'
import type { SongloftStorage } from './types.js'

export type {
  SongloftStorage,
  SongloftPrefs,
  SongloftSecure,
  SongloftPaths,
} from './types.js'
export { createMemoryStorage } from './memory-storage.js'
export { createWebStorage } from './web-storage.js'
export { createIndexedDBStorage, isIndexedDBAvailable } from './idb-storage.js'
export {
  createNativeStorage,
  isNativeStorageAvailable,
  type SongloftStorageNativeModule,
} from './native-storage.js'

let warnedInterimStorage = false

/**
 * Pick a `SongloftStorage` implementation by capability probe:
 * - a native `NativeModules.SongloftStorage` (methods complete) → **native,
 *   persistent** storage (SharedPreferences on Android) — survives app restart;
 * - else a realm with `indexedDB` → IndexedDB storage, **persistent**. This is
 *   the one the Web platform actually lands on: web-core runs the app in a
 *   `Worker`, and Web Storage is window-only (see `idb-storage.ts`);
 * - else a realm with `localStorage` → web storage, persistent only if that
 *   `localStorage` is the browser's real one (see the ordering note below);
 * - else (Lynx runtime with no native module) → **in-memory** storage as an
 *   INTERIM (in-session, NON-persistent) so the app stays usable.
 *
 * Ordering matters between the two web backends, and it is the REVERSE of what
 * it used to be. web-core injects a list of browser globals — `window`,
 * `document`, `localStorage`, … — into the background realm as scope bindings
 * (see its worker chunk's global list), and whatever `localStorage` that
 * surfaces is **not** the browser's persistent one: tokens written there were
 * gone after every reload (and invisible to the page's own DevTools storage
 * view), which is the "logged in, refresh, bounced to /login — with a flash of
 * the login card" bug. `indexedDB` in the same realm IS shared with the page
 * origin and persists, so it must win whenever both are present.
 *
 * On device the native module is now present (batch B2 follow-up), so tokens /
 * server address / language persist and the user is no longer bounced to /login
 * after backgrounding. We never throw on Lynx — a throwing stub blocked login.
 *
 * Pass an explicit `impl` to bypass detection (tests inject `createMemoryStorage()`).
 */
export function createSongloftStorage(impl?: SongloftStorage): SongloftStorage {
  if (impl) return impl
  const nativeModules = readNativeModules()
  if (isNativeStorageAvailable(nativeModules)) {
    try {
      const mod = (nativeModules as { SongloftStorage: SongloftStorageNativeModule })
        .SongloftStorage
      return createNativeStorage(mod)
    } catch {
      // fall through to web / memory
    }
  }
  if (isIndexedDBAvailable()) return createIndexedDBStorage()
  const hasLocalStorage =
    typeof (globalThis as { localStorage?: unknown }).localStorage !== 'undefined'
  if (hasLocalStorage) return createWebStorage()
  if (!warnedInterimStorage) {
    warnedInterimStorage = true
    console.warn(
      '[SongloftStorage] no NativeModules.SongloftStorage, no indexedDB and no ' +
        'localStorage; using in-memory storage (non-persistent) — sessions do ' +
        'not survive app restart',
    )
  }
  return createMemoryStorage()
}

let singleton: SongloftStorage | null = null

/** Process-wide storage facade. `setSongloftStorage` overrides it (tests / DI). */
export function getSongloftStorage(): SongloftStorage {
  if (!singleton) singleton = createSongloftStorage()
  return singleton
}

export function setSongloftStorage(storage: SongloftStorage): void {
  singleton = storage
}
