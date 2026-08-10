import { readNativeModules } from '../../native/native-modules.js'
import { createMemoryStorage } from './memory-storage.js'
import {
  createNativeStorage,
  isNativeStorageAvailable,
  type SongloftStorageNativeModule,
} from './native-storage.js'
import { createWebStorage } from './web-storage.js'
import type { SongloftStorage } from './types.js'

export type {
  SongloftStorage,
  SongloftPrefs,
  SongloftSecure,
  SongloftPaths,
} from './types.js'
export { createMemoryStorage } from './memory-storage.js'
export { createWebStorage } from './web-storage.js'
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
 * - else a web-like realm (has `localStorage`) → web storage;
 * - else (Lynx runtime with no native module) → **in-memory** storage as an
 *   INTERIM (in-session, NON-persistent) so the app stays usable.
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
  if (!warnedInterimStorage) {
    warnedInterimStorage = true
    console.warn(
      '[SongloftStorage] no NativeModules.SongloftStorage and no localStorage; ' +
        'using in-memory storage (non-persistent) — sessions do not survive app restart',
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
