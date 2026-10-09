import { afterEach, expect, test, vi } from 'vitest'
import { cacheDirectorySupported, cancelCacheMigration, chooseCacheDirectory, migrateCacheDirectory, readCacheDirectory,
  restoreCacheDirectory, storageAwareRequest, subscribeCacheMigration } from '../data/cache-directory.js'

const host = globalThis as Record<string, unknown>
function install() {
  const module = { getStorageContract: vi.fn((callback: (json: string) => void) => callback('{"version":1}')),
    storageCommand: vi.fn((_request: string, callback: (json: string) => void) => callback('{"saved":true}')), cancelTask: vi.fn() }
  host.NativeModules = { SongloftSongCache: module }
  return module
}
afterEach(() => { delete host.NativeModules; delete host.lynx; vi.useRealTimers() })
test('missing or partial Android extension leaves the original request untouched', async () => {
  const request = { namespace: 'identity' }
  expect(await cacheDirectorySupported()).toBe(false)
  expect(await storageAwareRequest(request)).toBe(request)
  host.NativeModules = { SongloftSongCache: { getStorageContract: vi.fn() } }
  expect(await cacheDirectorySupported()).toBe(false)
  await expect(chooseCacheDirectory()).rejects.toThrow('cache_update_required')
})
test('callback commands distinguish picker cancellation and require a successful save acknowledgement', async () => {
  const module = install()
  expect(await chooseCacheDirectory()).toBe(true)
  expect(JSON.parse(module.storageCommand.mock.calls[0][0])).toEqual({ command: 'pickDirectory' })
  module.storageCommand.mockImplementationOnce((_request, callback) => callback('{"cancelled":true}'))
  expect(await chooseCacheDirectory()).toBe(false)
  await restoreCacheDirectory()
  expect(JSON.parse(module.storageCommand.mock.calls.at(-1)![0])).toEqual({ command: 'setDirectory', tree: null, label: null })
  module.storageCommand.mockImplementationOnce((_request, callback) => callback('{}'))
  await expect(restoreCacheDirectory()).rejects.toThrow('invalid_cache_response')
})
test('directory status retains unavailable selections and rejects malformed replies', async () => {
  const module = install()
  const directory = { tree: 'content://tree', label: 'SD:Music', available: false, busy: false }
  module.storageCommand.mockImplementationOnce((_request, callback) => callback(JSON.stringify(directory)))
  expect(await readCacheDirectory()).toEqual(directory)
  module.storageCommand.mockImplementationOnce((_request, callback) => callback('{"tree":null,"label":null,"available":"true","busy":false}'))
  await expect(readCacheDirectory()).rejects.toThrow('invalid_cache_response')
  module.storageCommand.mockImplementationOnce((_request, callback) => callback('{"error":"cache_busy"}'))
  await expect(chooseCacheDirectory()).rejects.toThrow('cache_busy')
})
test('migration timeout cancels the same native operation and ignores its late reply', async () => {
  vi.useFakeTimers()
  const module = install()
  let reply = (_json: string) => {}
  module.storageCommand.mockImplementation((_request, callback) => { reply = callback })
  const operation = migrateCacheDirectory({ task_id: 'move', namespace: 'account' })
  const rejected = expect(operation).rejects.toThrow('cache_timeout')
  await vi.advanceTimersByTimeAsync(20 * 60_000 + 1)
  await rejected
  expect(module.cancelTask).toHaveBeenCalledExactlyOnceWith('move')
  reply('{"done":1,"total":1}')
  expect(module.cancelTask).toHaveBeenCalledOnce()
})
test('a detached native host cannot interrupt migration disposal', () => {
  const module = install()
  module.cancelTask.mockImplementation(() => { throw new Error('host detached') })
  expect(() => cancelCacheMigration('move')).not.toThrow()
})
test('migration progress is bounded, operation scoped and detached with its listener', () => {
  const handlers = new Map<string, (value: unknown) => void>()
  const removeListener = vi.fn()
  host.lynx = { getJSModule: () => ({ addListener: (name: string, listener: (value: unknown) => void) => handlers.set(name, listener), removeListener }) }
  const update = vi.fn(), detach = subscribeCacheMigration('move', update)
  const event = handlers.get('songCacheMigrationProgress')!
  event({ task_id: 'other', namespace: 'account', done: 0, total: 1 })
  event({ task_id: 'move', namespace: 'account', done: 2, total: 1 })
  event(JSON.stringify({ task_id: 'move', namespace: 'account', done: 1, total: 2 }))
  expect(update).toHaveBeenCalledOnce()
  detach(); event({ task_id: 'move', namespace: 'account', done: 2, total: 2 })
  expect(update).toHaveBeenCalledOnce()
  expect(removeListener).toHaveBeenCalledWith('songCacheMigrationProgress', event)
})
