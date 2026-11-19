import { desktopCall, desktopConfig } from './client.js'
type Callback = (json: string) => void
function invoke(method: string, request: string, callback: Callback): void {
  try {
    void desktopCall(`cache.${method}`, JSON.parse(request)).then(
      (value) => callback(JSON.stringify(value)),
      (error) => callback(JSON.stringify({ error: error.message })),
    )
  } catch {
    callback(JSON.stringify({ error: 'invalid_cache_request' }))
  }
}
const adapter = {
  getCacheContract: (callback: Callback) => callback('{"version":2}'),
  cacheEntry: (request: string, callback: Callback) =>
    invoke('cacheEntry', request, callback),
  getEntry: (request: string, callback: Callback) =>
    invoke('getEntry', request, callback),
  listEntries: (request: string, callback: Callback) =>
    invoke('listEntries', request, callback),
  removeEntry: (request: string, callback: Callback) =>
    invoke('removeEntry', request, callback),
  clearNamespace: (request: string, callback: Callback) =>
    invoke('clearNamespace', request, callback),
  clearLegacy: (callback: Callback) => callback('{}'),
  getTasks: (callback: Callback) => invoke('getTasks', '{}', callback),
  cancelTask: (task_id: string) => {
    void desktopCall('cache.cancelTask', { task_id }).catch(() => {})
  },
}
export function desktopCacheModule() {
  return desktopConfig()?.capabilities.songCache ? adapter : null
}
