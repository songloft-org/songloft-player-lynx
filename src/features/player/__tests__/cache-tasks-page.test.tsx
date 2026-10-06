import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'
import type { CacheBatchState } from '../domain/cache-batch.js'

const fixture = vi.hoisted(() => ({ state: { namespace: null, items: [], running: false, blocked: false } as CacheBatchState,
  available: true, cancel: vi.fn(), cancelRemaining: vi.fn(), retryFailed: vi.fn(async () => 1) }))
vi.mock('react-i18next', async () => (await import('../../../__tests__/_render-mocks.js')).mockReactI18next())
vi.mock('../../library/widgets/VirtualList.js', async () => (await import('../../../__tests__/_render-mocks.js')).mockVirtualList())
vi.mock('../widgets/use-cache-batch.js', () => ({ useCacheBatchState: () => fixture.state }))
vi.mock('../data/cache-batch-controller.js', () => ({ cacheBatchController: fixture }))
vi.mock('../data/indexed-song-cache.js', () => ({ indexedSongCacheAvailable: () => fixture.available }))
const { CacheTasksPage } = await import('../pages/CacheTasksPage.js')

beforeEach(() => {
  vi.clearAllMocks()
  fixture.available = true
  fixture.state = { namespace: 'current-user', running: true, blocked: false, items: [{
    taskId: 'active', key: 'key', snapshot: { id: 7, type: 'local', title: 'Slow song', artist: '', album: '',
      duration: 10, isVideo: false, format: 'mp3', updatedAt: 'revision' }, status: 'downloading',
    bytes: 4096, total: 0, error: null, skipped: false, cancelling: false,
  }] }
})
function page() { render(<CacheTasksPage />); return getQueriesForElement(elementTree.root!) }

test('unknown-length progress remains visible and current/all cancellation reaches the controller', async () => {
  const { getByTestId, getByText } = page()
  expect(getByText('Slow song')).toBeInTheDocument()
  expect(getByText('4 KB downloaded · unknown total')).toBeInTheDocument()
  await act(async () => { fireEvent.tap(getByTestId('cache-task-cancel-7')) })
  await act(async () => { fireEvent.tap(getByTestId('cache-tasks-cancel-all')) })
  expect(fixture.cancel).toHaveBeenCalledExactlyOnceWith('active')
  expect(fixture.cancelRemaining).toHaveBeenCalledTimes(1)
})
test('retry is disabled while the producer runs', async () => {
  fixture.state.items[0].status = 'failed'; fixture.state.items[0].error = 'download_failed'
  const { getByTestId } = page()
  await act(async () => { fireEvent.tap(getByTestId('cache-tasks-retry')) })
  expect(fixture.retryFailed).not.toHaveBeenCalled()
})
test('retry reaches the controller after failure leaves the producer idle', async () => {
  fixture.state.running = false
  fixture.state.items[0].status = 'failed'; fixture.state.items[0].error = 'download_failed'
  const { getByTestId } = page()
  await act(async () => { fireEvent.tap(getByTestId('cache-tasks-retry')) })
  expect(fixture.retryFailed).toHaveBeenCalledTimes(1)
})
test('an older shell gets an upgrade explanation and no task action', () => {
  fixture.available = false
  const { getByText, queryByTestId } = page()
  expect(getByText('Install a newer client to use batch caching')).toBeInTheDocument()
  expect(queryByTestId('cache-tasks-cancel-all')).not.toBeInTheDocument()
})
