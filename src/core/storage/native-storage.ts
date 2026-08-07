import type { SongloftStorage } from './types.js'

/**
 * Native `SongloftStorage` stub. On real Lynx devices this will bridge to the
 * `SongloftStorage` native module (Keystore/Keychain/DPAPI for `secure`,
 * SharedPreferences/UserDefaults/better-sqlite3 for `prefs`, native app dirs for
 * `paths`). Until that JSB binding lands, every call throws a clear error so a
 * missing native module never fails silently.
 */
const NOT_IMPLEMENTED =
  '[SongloftStorage] native storage not implemented yet (awaiting Lynx SongloftStorage JSB binding)'

// Every method honors the async contract: it returns a rejected Promise (rather
// than throwing synchronously) so callers can `await`/`.catch` uniformly.
function notImplemented(): Promise<never> {
  return Promise.reject(new Error(NOT_IMPLEMENTED))
}

export function createNativeStorage(): SongloftStorage {
  return {
    prefs: {
      get: notImplemented,
      set: notImplemented,
      remove: notImplemented,
      keys: notImplemented,
    },
    secure: {
      get: notImplemented,
      set: notImplemented,
      remove: notImplemented,
    },
    paths: {
      appData: notImplemented,
      cache: notImplemented,
      documents: notImplemented,
    },
  }
}
