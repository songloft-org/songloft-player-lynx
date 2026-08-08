import { createMemoryStorage } from './memory-storage.js'
import { createNativeStorage } from './native-storage.js'
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
export { createNativeStorage } from './native-storage.js'

let warnedInterimStorage = false

/**
 * Pick a `SongloftStorage` implementation by capability probe:
 * - a web-like realm (has `localStorage`) → web storage;
 * - otherwise (Lynx runtime) → **in-memory** storage as an INTERIM (in-session,
 *   NON-persistent — tokens are lost on app restart) so the app stays usable.
 *
 * The persistent native SongloftStorage (JSB) is a later batch; `createNativeStorage`
 * is kept for explicit use once that binding lands (wire it in here then). We do
 * NOT throw on Lynx anymore — a throwing stub blocked login on device.
 *
 * Pass an explicit `impl` to bypass detection (tests inject `createMemoryStorage()`).
 */
export function createSongloftStorage(impl?: SongloftStorage): SongloftStorage {
  if (impl) return impl
  const hasLocalStorage =
    typeof (globalThis as { localStorage?: unknown }).localStorage !== 'undefined'
  if (hasLocalStorage) return createWebStorage()
  if (!warnedInterimStorage) {
    warnedInterimStorage = true
    console.warn(
      '[SongloftStorage] no localStorage; using in-memory storage (non-persistent) ' +
        'until the native JSB module lands — sessions do not survive app restart',
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
