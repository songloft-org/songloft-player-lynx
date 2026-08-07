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

/**
 * Pick a `SongloftStorage` implementation by capability probe:
 * - a web-like realm (has `localStorage`) → web storage;
 * - otherwise → the native stub (throws until the JSB binding lands).
 *
 * Pass an explicit `impl` to bypass detection (tests inject `createMemoryStorage()`).
 */
export function createSongloftStorage(impl?: SongloftStorage): SongloftStorage {
  if (impl) return impl
  const hasLocalStorage =
    typeof (globalThis as { localStorage?: unknown }).localStorage !== 'undefined'
  return hasLocalStorage ? createWebStorage() : createNativeStorage()
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
