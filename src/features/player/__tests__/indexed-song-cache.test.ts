import { afterEach, expect, test, vi } from 'vitest'
import { cacheIndexedSong, cancelCacheTask, indexedSongCacheAvailable, listIndexedSongs, readIndexedSong, subscribeCacheTask } from '../data/indexed-song-cache.js'
import { cacheIdentity, cacheNamespace, cacheSnapshot } from '../domain/cache-identity.js'
import { parseSong } from '../../../models/song.js'

const global = globalThis as Record<string, unknown>
const namespace = cacheNamespace({ profile: null, server: 'http://server', username: 'user' })
const song = parseSong({ id: 7, title: 'Song', type: 'local', updated_at: 'revision' })
const identity = cacheIdentity({ namespace, song, variant: { track: null, normalize: false, quality: 'original' }, format: 'mp3' })
const cached = { ...identity, cached: true, url: 'file:///private/7.mp3', sizeBytes: 123, createdAt: 1, snapshot: cacheSnapshot(song) }
function install(overrides: Record<string, unknown> = {}) {
  const module = { getCacheContract: vi.fn(callback => callback('{"version":2}')), cacheEntry: vi.fn(), getEntry: vi.fn(),
    listEntries: vi.fn(), removeEntry: vi.fn(), clearNamespace: vi.fn(), clearLegacy: vi.fn(), getTasks: vi.fn(), cancelTask: vi.fn(), ...overrides }
  global.NativeModules = { SongloftSongCache: module }
  return module
}
afterEach(() => { delete global.NativeModules; delete global.lynx; vi.useRealTimers() })
test('old and partial shells do not advertise the indexed contract', async () => {
  global.NativeModules = { SongloftSongCache: { getCacheInfo: vi.fn(), download: vi.fn() } }
  expect(indexedSongCacheAvailable()).toBe(false)
  await expect(readIndexedSong(identity)).rejects.toThrow('cache_update_required')
  install({ cancelTask: undefined })
  expect(indexedSongCacheAvailable()).toBe(false)
})
test('version handshake rejects changed ABI before sending a cache request', async () => {
  const module = install({ getCacheContract: vi.fn(callback => callback('{"version":3}')) })
  await expect(readIndexedSong(identity)).rejects.toThrow('cache_update_required')
  expect(module.getEntry).not.toHaveBeenCalled()
})
test('callback reads validate identity, actual format and complete entry, with no Promise cast', async () => {
  const getEntry = vi.fn((_raw, callback) => { callback(JSON.stringify(cached)); return undefined })
  install({ getEntry })
  expect(await readIndexedSong(identity)).toEqual(cached)
  getEntry.mockImplementationOnce((_raw, callback) => callback(JSON.stringify({ ...cached, namespace: 'another-user' })))
  await expect(readIndexedSong(identity)).rejects.toThrow('invalid_cache_response')
  const wrongTrack = JSON.parse(identity.key); wrongTrack[2] = '2'
  getEntry.mockImplementationOnce((_raw, callback) => callback(JSON.stringify({ ...cached, key: JSON.stringify(wrongTrack) })))
  await expect(readIndexedSong(identity)).rejects.toThrow('invalid_cache_response')
  getEntry.mockImplementationOnce((_raw, callback) => callback('{"cached":false}'))
  expect(await readIndexedSong(identity)).toBeNull()
})
test('bounded pagination validates namespace and nonnegative byte reports', async () => {
  const list = vi.fn((_raw, callback) => callback(JSON.stringify({ entries: [cached], total: 1, bytes: 123, legacy_bytes: 20 })))
  install({ listEntries: list })
  expect((await listIndexedSongs({ namespace, offset: 0, limit: 50 })).legacy_bytes).toBe(20)
  expect(JSON.parse(list.mock.calls[0][0])).toEqual({ namespace, offset: 0, limit: 50 })
  list.mockImplementationOnce((_raw, callback) => callback('{"entries":[],"total":1,"bytes":-1,"legacy_bytes":0}'))
  await expect(listIndexedSongs({ namespace })).rejects.toThrow('invalid_cache_response')
})
test('download timeout cancels exactly its native task and ignores a late callback', async () => {
  vi.useFakeTimers()
  let callback = (_value: string) => {}
  const module = install({ cacheEntry: vi.fn((_raw, value) => { callback = value }) })
  const result = cacheIndexedSong({ ...identity, task_id: 'cache-timeout', url: 'http://server/play?access_token=secret', max_bytes: 1234, snapshot: cacheSnapshot(song) })
  const rejected = expect(result).rejects.toThrow('cache_timeout')
  await vi.advanceTimersByTimeAsync(20 * 60_000 + 1)
  await rejected
  expect(module.cancelTask).toHaveBeenCalledExactlyOnceWith('cache-timeout')
  callback(JSON.stringify(cached))
  expect(module.cancelTask).toHaveBeenCalledOnce()
})
test('progress is task scoped, tolerates unknown total, and unregisters after detach', () => {
  const handlers = new Map<string, (value: unknown) => void>()
  const remove = vi.fn()
  global.lynx = { getJSModule: () => ({ addListener: (name: string, handler: (value: unknown) => void) => handlers.set(name, handler), removeListener: remove }) }
  const update = vi.fn(), detach = subscribeCacheTask('current', update)
  const event = handlers.get('songCacheProgress')!
  const task = { ...identity, status: 'downloading', bytes: 40, total: 0, error: null }
  event({ ...task, task_id: 'other' }); event({ ...task, task_id: 'current' })
  expect(update).toHaveBeenCalledOnce()
  detach(); event({ ...task, task_id: 'current' })
  expect(update).toHaveBeenCalledOnce()
  expect(remove).toHaveBeenCalledWith('songCacheProgress', event)
  install(); cancelCacheTask('cancel')
  expect((global.NativeModules as { SongloftSongCache: { cancelTask: ReturnType<typeof vi.fn> } }).SongloftSongCache.cancelTask).toHaveBeenCalledWith('cancel')
})
