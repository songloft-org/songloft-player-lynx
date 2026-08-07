import type { SongloftStorage } from './types.js'

/**
 * Fully in-memory `SongloftStorage`. Used by unit tests and as a safe default
 * when no persistent backend is available. Nothing survives a reload.
 */
export function createMemoryStorage(): SongloftStorage {
  const prefsMap = new Map<string, string>()
  const secureMap = new Map<string, string>()

  return {
    prefs: {
      async get(key) {
        return prefsMap.has(key) ? prefsMap.get(key)! : null
      },
      async set(key, value) {
        prefsMap.set(key, value)
      },
      async remove(key) {
        prefsMap.delete(key)
      },
      async keys() {
        return [...prefsMap.keys()]
      },
    },
    secure: {
      async get(key) {
        return secureMap.has(key) ? secureMap.get(key)! : null
      },
      async set(key, value) {
        secureMap.set(key, value)
      },
      async remove(key) {
        secureMap.delete(key)
      },
    },
    paths: {
      async appData() {
        return '/memory/app-data'
      },
      async cache() {
        return '/memory/cache'
      },
      async documents() {
        return '/memory/documents'
      },
    },
  }
}
