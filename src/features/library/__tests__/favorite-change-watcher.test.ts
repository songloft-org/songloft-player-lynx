import { afterEach, expect, test, vi } from 'vitest'
import { FavoriteChangeWatcher, type FavoriteChange } from '../domain/favorite-change-watcher.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
afterEach(() => vi.useRealTimers())

test('holds one request and refreshes only on changes before advancing the cursor', async () => {
  const first = deferred<FavoriteChange>()
  const next = deferred<FavoriteChange>()
  const refreshed = deferred<void>()
  const poll = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise)
  const refresh = vi.fn(() => refreshed.promise)
  const watcher = new FavoriteChangeWatcher({ poll, refresh })
  const running = watcher.run()
  expect(poll).toHaveBeenCalledTimes(1)
  expect(refresh).not.toHaveBeenCalled()
  first.resolve({ cursor: 'one', changed: true })
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  expect(poll).toHaveBeenCalledTimes(1)
  refreshed.resolve()
  await vi.waitFor(() => expect(poll).toHaveBeenCalledTimes(2))
  expect(poll.mock.calls[1]![0]).toBe('one')
  watcher.stop()
  next.resolve({ cursor: 'one', changed: false })
  await running
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('stopping rejects a late notification from a former session', async () => {
  const first = deferred<FavoriteChange>()
  const refresh = vi.fn()
  const watcher = new FavoriteChangeWatcher({ poll: () => first.promise, refresh })
  const running = watcher.run()
  watcher.stop()
  first.resolve({ cursor: 'old', changed: true })
  await running
  expect(refresh).not.toHaveBeenCalled()
})

test('refresh failure backs off and reconnects without acknowledging the failed cursor', async () => {
  vi.useFakeTimers()
  const next = deferred<FavoriteChange>()
  const poll = vi.fn().mockResolvedValueOnce({ cursor: 'one', changed: true }).mockReturnValueOnce(next.promise)
  const watcher = new FavoriteChangeWatcher({ poll, refresh: vi.fn().mockRejectedValue(new Error('offline')) })
  const running = watcher.run()
  await vi.advanceTimersByTimeAsync(999)
  expect(poll).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(poll).toHaveBeenCalledTimes(2)
  expect(poll.mock.calls[1]![0]).toBeUndefined()
  watcher.stop()
  next.resolve({ cursor: 'one', changed: false })
  await running
})

test('old hosts stop the subscription without repeated unsupported requests', async () => {
  const poll = vi.fn().mockRejectedValue('unsupported')
  const watcher = new FavoriteChangeWatcher({ poll, refresh: vi.fn(), unsupported: error => error === 'unsupported' })
  await watcher.run()
  expect(poll).toHaveBeenCalledTimes(1)
})
