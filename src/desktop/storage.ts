import type { SongloftStorage } from '../core/storage/types.js'
import { desktopCall } from './client.js'

export function createDesktopStorage(): SongloftStorage {
  const area = (name: 'prefs' | 'secure') => ({
    get: (key: string) =>
      desktopCall<string | null>('storage.get', { area: name, key }),
    set: async (key: string, value: string) => {
      await desktopCall('storage.set', { area: name, key, value })
    },
    remove: async (key: string) => {
      await desktopCall('storage.remove', { area: name, key })
    },
  })
  return {
    prefs: {
      ...area('prefs'),
      keys: () => desktopCall<string[]>('storage.keys', { area: 'prefs' }),
    },
    secure: area('secure'),
    paths: {
      appData: () => desktopCall<string>('storage.path', { name: 'appData' }),
      cache: () => desktopCall<string>('storage.path', { name: 'cache' }),
      documents: () =>
        desktopCall<string>('storage.path', { name: 'documents' }),
    },
  }
}
