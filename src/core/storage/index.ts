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
 * - else a realm with `localStorage` → web storage, **persistent**;
 * - else a realm with `indexedDB` → IndexedDB storage, **persistent**. This is
 *   the one the Web platform actually lands on: web-core runs the app in a
 *   `Worker`, and Web Storage is window-only, so `localStorage` is `undefined`
 *   there while `indexedDB` is not (see `idb-storage.ts`);
 * - else (Lynx runtime with no native module) → **in-memory** storage as an
 *   INTERIM (in-session, NON-persistent) so the app stays usable.
 *
 * Order matters only between the two web backends: where both exist,
 * `localStorage` is synchronous underneath and needs no `open`, so it wins.
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
  const hasLocalStorage =
    typeof (globalThis as { localStorage?: unknown }).localStorage !== 'undefined'
  if (hasLocalStorage) return createWebStorage()
  if (isIndexedDBAvailable()) return createIndexedDBStorage()
  if (!warnedInterimStorage) {
    warnedInterimStorage = true
    console.warn(
      '[SongloftStorage] no NativeModules.SongloftStorage, no localStorage and no ' +
        'indexedDB; using in-memory storage (non-persistent) — sessions do not ' +
        'survive app restart',
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
