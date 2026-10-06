import { describe, expect, test, vi } from 'vitest'
import { CacheBatchController, parseCacheBatch, type CacheBatchDeps, type CacheBatchItem } from '../domain/cache-batch.js'
import type { CacheDownload } from '../domain/cache-identity.js'
import type { CachedEntry, CacheTask } from '../data/indexed-song-cache.js'

const namespace = JSON.stringify(['profile', 'https://music.test', 'user'])
const request = (id: number, taskId = `task-${id}`): CacheDownload => ({ namespace, task_id: taskId,
  key: JSON.stringify([namespace, String(id), 'default', 'original', '0', 'revision', 'mp3']),
  url: `https://music.test/song/${id}?access_token=NEVER_PERSIST`, max_bytes: 1000000,
  snapshot: { id, type: 'local', title: `Song ${id}`, artist: '', album: '', duration: 10,
    isVideo: false, format: 'mp3', updatedAt: 'revision' } })
const entry = (value: CacheDownload): CachedEntry => ({ ...value, cached: true, url: `file:///cache/${value.snapshot.id}.mp3`,
  sizeBytes: 100, createdAt: 1 })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
async function settle(controller: CacheBatchController) {
  await vi.waitFor(() => expect(controller.getState().running).toBe(false))
}
async function setup(overrides: Partial<CacheBatchDeps> = {}) {
  const history = new Map<string, CacheBatchItem[]>()
  const deps: CacheBatchDeps = {
    cached: vi.fn(async () => null), download: vi.fn(async value => entry(value)), cancel: vi.fn(),
    read: vi.fn(async ns => history.get(ns) ?? []),
    save: vi.fn(async (ns, items) => { history.set(ns, structuredClone(items)) }),
    rebuild: vi.fn(async item => request(item.snapshot.id, `${item.taskId}-retry`)), ...overrides,
  }
  const controller = new CacheBatchController(deps)
  await controller.setNamespace(namespace)
  return { controller, deps, history }
}

describe('device cache batch scheduler', () => {
  test('serializes downloads, skips exact cached variants, deduplicates concurrent submissions and freezes requests', async () => {
    const slow = deferred<CachedEntry>()
    const { controller, deps } = await setup({
      cached: vi.fn(async value => value.snapshot.id === 2 ? entry(value) : null),
      download: vi.fn(value => value.snapshot.id === 1 ? slow.promise : Promise.resolve(entry(value))),
    })
    const first = request(1)
    expect(controller.submit([first, request(2), request(2, 'duplicate')])).toBe(2)
    await vi.waitFor(() => expect(deps.download).toHaveBeenCalledTimes(1))
    first.url = 'https://another.test/changed'; first.snapshot.title = 'changed'
    expect(controller.submit([request(1, 'again'), request(2, 'again-two'), request(3)])).toBe(1)
    expect(deps.download).toHaveBeenCalledTimes(1)
    expect(vi.mocked(deps.download).mock.calls[0][0].url).toContain('music.test')
    slow.resolve(entry(request(1))); await settle(controller)
    expect(vi.mocked(deps.download).mock.calls.map(call => call[0].snapshot.id)).toEqual([1, 3])
    expect(controller.getState().items.map(item => [item.status, item.skipped])).toEqual([
      ['completed', false], ['completed', true], ['completed', false],
    ])
  })
  test('ordinary failures retain a machine reason and continue; retry excludes successful and cancelled items', async () => {
    const { controller, deps } = await setup({ download: vi.fn(async value => {
      if (value.task_id === 'task-1') throw new Error('remote URL with access_token=SECRET failed')
      return entry(value)
    }) })
    controller.submit([request(1), request(2), request(3)])
    controller.cancel('task-3'); await settle(controller)
    expect(controller.getState().items.map(item => item.status)).toEqual(['failed', 'completed', 'cancelled'])
    expect(controller.getState().items[0].error).toBe('download_failed')
    expect(await controller.retryFailed()).toBe(1); await settle(controller)
    expect(deps.rebuild).toHaveBeenCalledTimes(1)
    expect(controller.getState().items.map(item => item.status)).toEqual(['completed', 'completed', 'cancelled'])
  })
  test.each(['limit_exceeded', 'insufficient_space'])('%s stops remaining items until explicit retry rebuilds their URLs and caps', async code => {
    const { controller, deps } = await setup({ download: vi.fn(async value => {
      if (value.task_id === 'task-1') throw new Error(code)
      return entry(value)
    }) })
    controller.submit([request(1), request(2)])
    await settle(controller)
    expect(controller.getState().blocked).toBe(true)
    expect(deps.download).toHaveBeenCalledTimes(1)
    expect(controller.getState().items[1]).toMatchObject({ status: 'waiting', error: 'batch_capacity_stop' })
    expect(await controller.retryFailed()).toBe(2); await settle(controller)
    expect(deps.rebuild).toHaveBeenCalledTimes(2)
    expect(controller.getState().items.every(item => item.status === 'completed')).toBe(true)
  })
  test('cancellation waits for the real active callback and never opens or cancels queued native connections', async () => {
    const slow = deferred<CachedEntry>()
    const { controller, deps } = await setup({ download: vi.fn(() => slow.promise) })
    controller.submit([request(1), request(2)])
    await vi.waitFor(() => expect(deps.download).toHaveBeenCalledTimes(1))
    controller.cancelRemaining()
    expect(deps.cancel).toHaveBeenCalledExactlyOnceWith('task-1')
    expect(controller.getState().items[0]).toMatchObject({ status: 'downloading', cancelling: true })
    expect(controller.getState().items[1].status).toBe('cancelled')
    slow.reject(new Error('cancelled')); await settle(controller)
    expect(controller.getState().items.every(item => item.status === 'cancelled')).toBe(true)
  })
  test('scope change cancels the old owner and a late callback cannot fill another identity view', async () => {
    const slow = deferred<CachedEntry>()
    const { controller, deps, history } = await setup({ download: vi.fn(() => slow.promise) })
    controller.submit([request(1), request(2)])
    await vi.waitFor(() => expect(deps.download).toHaveBeenCalledTimes(1))
    const other = JSON.stringify(['profile', 'https://music.test', 'other'])
    await controller.setNamespace(other)
    expect(deps.cancel).toHaveBeenCalledWith('task-1')
    slow.resolve(entry(request(1)))
    await vi.waitFor(() => expect(history.get(namespace)?.[1].status).toBe('cancelled'))
    expect(controller.getState()).toMatchObject({ namespace: other, items: [], running: false })
  })
  test('cold history marks unfinished work interrupted, has no credentials/URLs, and ignores foreign or corrupt records', async () => {
    const { controller, deps, history } = await setup()
    const value = request(1)
    Object.assign(value.snapshot, { access_token: 'NEVER_PERSIST', url: 'NEVER_PERSIST' })
    controller.submit([value]); await settle(controller)
    await vi.waitFor(() => expect(history.get(namespace)?.[0].status).toBe('completed'))
    const items = history.get(namespace)!
    const raw = JSON.stringify({ version: 1, namespace, items })
    expect(raw).not.toContain('NEVER_PERSIST')
    expect(parseCacheBatch(raw, 'foreign')).toEqual([])
    expect(parseCacheBatch('{broken', namespace)).toEqual([])
    const pending = [{ ...items[0], taskId: 'interrupted-one', status: 'downloading' as const }]
    vi.mocked(deps.read).mockResolvedValue(pending)
    await controller.setNamespace(null); await controller.setNamespace(namespace)
    expect(controller.getState().items[0]).toMatchObject({ status: 'interrupted', error: 'interrupted' })
    expect(deps.cancel).toHaveBeenCalledWith('interrupted-one')
    expect(deps.download).toHaveBeenCalledTimes(1)
  })
  test('a late hydration cannot overwrite a newly submitted batch', async () => {
    const history = deferred<CacheBatchItem[]>()
    const { controller } = await setup()
    await controller.setNamespace(null)
    const read = vi.fn(() => history.promise)
    const late = new CacheBatchController({ cached: async () => null, download: async value => entry(value),
      cancel: () => {}, read, save: async () => {}, rebuild: async item => request(item.snapshot.id) })
    const hydration = late.setNamespace(namespace)
    late.submit([request(1)])
    history.resolve([]); await hydration; await settle(late)
    expect(late.getState().items).toHaveLength(1)
  })
  test('cancel-all during async retry preparation cannot enqueue the rebuilt request', async () => {
    const rebuilt = deferred<CacheDownload>()
    const { controller, deps } = await setup({ download: vi.fn(async () => { throw new Error('download_failed') }),
      rebuild: vi.fn(() => rebuilt.promise) })
    controller.submit([request(1)]); await settle(controller)
    const retry = controller.retryFailed()
    controller.cancelRemaining(); rebuilt.resolve(request(1, 'rebuilt'))
    await retry; await settle(controller)
    expect(controller.getState().items[0].status).toBe('cancelled')
    expect(deps.download).toHaveBeenCalledTimes(1)
  })
})
