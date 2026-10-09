import '@testing-library/jest-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'
import type { CacheDirectory, MigrationProgress } from '../data/cache-directory.js'

const fixture = vi.hoisted(() => ({ platform: 'android', namespace: 'account', supported: true,
  directory: { tree: null, label: null, available: true, busy: false } as CacheDirectory,
  read: vi.fn(), choose: vi.fn(), restore: vi.fn(), migrate: vi.fn(), cancel: vi.fn(), changed: vi.fn(async () => {}),
  forget: vi.fn(async () => {}), reset: vi.fn(), source: 'cache', toast: { success: vi.fn(), error: vi.fn() },
  progress: (_value: MigrationProgress) => {}, stopProgress: vi.fn() }))
vi.mock('react-i18next', async () => (await import('../../../__tests__/_render-mocks.js')).mockReactI18next())
vi.mock('../../../native/platform-target.js', () => ({ getPlatformTarget: () => fixture.platform }))
vi.mock('../../../shared/ui/toast-store.js', () => ({ toast: fixture.toast }))
vi.mock('../../../shared/ui/ConfirmDialog.js', () => ({ ConfirmDialog: ({ show, onConfirm }: { show: boolean; onConfirm: () => void }) =>
  show ? <view bindtap={onConfirm} data-testid='cache-directory-confirm' /> : null }))
vi.mock('../data/indexed-song-cache.js', () => ({ createCacheTaskId: () => 'move-test' }))
vi.mock('../data/offline-identity.js', () => ({ currentOfflineOwner: () => ({ namespace: fixture.namespace }) }))
vi.mock('../store/player-store.js', () => ({ forgetCachedPlayback: fixture.forget, playbackSourceKindOf: () => fixture.source,
  usePlayerStore: { getState: () => ({ currentSong: { id: 7 }, reset: fixture.reset }) } }))
vi.mock('../data/cache-directory.js', () => ({ cacheDirectorySupported: async () => fixture.supported,
  readCacheDirectory: () => fixture.read(), chooseCacheDirectory: fixture.choose, restoreCacheDirectory: fixture.restore,
  migrateCacheDirectory: fixture.migrate, cancelCacheMigration: fixture.cancel,
  subscribeCacheMigration: (_id: string, handler: typeof fixture.progress) => { fixture.progress = handler; return fixture.stopProgress } }))
const { useCacheDirectory } = await import('../widgets/use-cache-directory.js')
function Harness({ namespace = 'account' }: { namespace?: string }) {
  const directory = useCacheDirectory({ namespace, busy: false, hasEntries: true, onChanged: fixture.changed })
  return <view>{directory.controls}{directory.overlay}</view>
}
beforeEach(() => {
  vi.clearAllMocks(); fixture.platform = 'android'; fixture.namespace = 'account'; fixture.supported = true; fixture.source = 'cache'
  fixture.directory = { tree: null, label: null, available: true, busy: false }
  fixture.read.mockImplementation(async () => fixture.directory)
  fixture.choose.mockImplementation(async () => { fixture.directory = { ...fixture.directory, tree: 'content://tree', label: 'primary:Music' }; return true })
  fixture.restore.mockImplementation(async () => { fixture.directory = { ...fixture.directory, tree: null, label: null } })
  fixture.migrate.mockResolvedValue(undefined); fixture.forget.mockResolvedValue(undefined)
})
async function show() {
  let result!: ReturnType<typeof render>
  await act(async () => { result = render(<Harness />) })
  await act(async () => {})
  return { result, queries: getQueriesForElement(elementTree.root!) }
}
test('select and restore refresh the device-only label without starting migration', async () => {
  const { queries } = await show()
  expect(queries.getByText('Default (app-private folder)')).toBeInTheDocument()
  await act(async () => { fireEvent.tap(queries.getByTestId('cache-directory-choose')) })
  await act(async () => {})
  expect(queries.getByText('primary:Music')).toBeInTheDocument()
  await act(async () => { fireEvent.tap(queries.getByTestId('cache-directory-default')) })
  await act(async () => {})
  expect(queries.getByText('Default (app-private folder)')).toBeInTheDocument()
  expect(fixture.migrate).not.toHaveBeenCalled(); expect(fixture.changed).toHaveBeenCalledTimes(2)
})
test('picker cancellation does not claim a directory was saved', async () => {
  fixture.choose.mockResolvedValue(false)
  const { queries } = await show()
  await act(async () => { fireEvent.tap(queries.getByTestId('cache-directory-choose')) })
  expect(fixture.toast.success).not.toHaveBeenCalled()
})
test('old Android APK explains the upgrade while other hosts have no folder controls', async () => {
  fixture.supported = false
  const { queries, result } = await show()
  expect(queries.getByText('Install the latest Android APK to use a custom cache folder.')).toBeInTheDocument()
  expect(queries.queryByTestId('cache-directory-choose')).not.toBeInTheDocument()
  fixture.platform = 'ios'; fixture.namespace = 'ios-account'
  await act(async () => { result.rerender(<Harness namespace='ios-account' />) })
  expect(queries.queryByTestId('cache-directory')).not.toBeInTheDocument()
})
test('revoked grants preserve the displayed selection and allow restoring the default', async () => {
  fixture.directory = { tree: 'content://tree', label: 'SD:Music', available: false, busy: false }
  const { queries } = await show()
  expect(queries.getByText('SD:Music')).toBeInTheDocument()
  expect(queries.getByText(/The folder is unavailable/)).toBeInTheDocument()
  await act(async () => { fireEvent.tap(queries.getByTestId('cache-directory-default')) })
  expect(fixture.restore).toHaveBeenCalledOnce()
})
test('migration requires confirmation, stops cached playback, reports progress and cancels its own operation', async () => {
  let fail = (_error: Error) => {}
  fixture.migrate.mockImplementation(() => new Promise<void>((_resolve, reject) => { fail = reject }))
  const { queries } = await show()
  await act(async () => { fireEvent.tap(queries.getByTestId('cache-directory-migrate')) })
  expect(fixture.migrate).not.toHaveBeenCalled()
  await act(async () => { fireEvent.tap(queries.getByTestId('cache-directory-confirm')) })
  expect(fixture.migrate).toHaveBeenCalledExactlyOnceWith({ task_id: 'move-test', namespace: 'account' })
  expect(fixture.forget).toHaveBeenCalledExactlyOnceWith({ namespace: 'account' }); expect(fixture.reset).toHaveBeenCalledOnce()
  await act(async () => { fixture.progress({ task_id: 'move-test', namespace: 'account', done: 1, total: 2 }) })
  expect(queries.getByText('Moved 1 / 2 variants')).toBeInTheDocument()
  await act(async () => { fireEvent.tap(queries.getByTestId('cache-directory-cancel')); fail(new Error('cancelled')) })
  expect(fixture.cancel).toHaveBeenCalledExactlyOnceWith('move-test')
  expect(fixture.stopProgress).toHaveBeenCalledOnce()
  expect(fixture.toast.error).toHaveBeenCalledWith('Migration cancelled. Completed moves are preserved; remaining original files were not deleted.')
})
test('leaving the page cancels migration and ignores a late successful callback', async () => {
  let complete = () => {}
  fixture.migrate.mockImplementation(() => new Promise<void>(resolve => { complete = resolve }))
  const { queries, result } = await show()
  await act(async () => { fireEvent.tap(queries.getByTestId('cache-directory-migrate')) })
  await act(async () => { fireEvent.tap(queries.getByTestId('cache-directory-confirm')) })
  await act(async () => { result.unmount() })
  await act(async () => { complete() })
  expect(fixture.cancel).toHaveBeenCalledExactlyOnceWith('move-test')
  expect(fixture.toast.success).not.toHaveBeenCalled(); expect(fixture.changed).not.toHaveBeenCalled()
})
test('an identity change during playback cleanup cannot stop the new account or submit the old migration', async () => {
  let complete = () => {}
  fixture.forget.mockImplementation(() => new Promise<void>(resolve => { complete = resolve }))
  const { queries, result } = await show()
  await act(async () => { fireEvent.tap(queries.getByTestId('cache-directory-migrate')) })
  await act(async () => { fireEvent.tap(queries.getByTestId('cache-directory-confirm')) })
  fixture.namespace = 'other-account'
  await act(async () => { result.rerender(<Harness namespace='other-account' />) })
  await act(async () => { complete() })
  expect(fixture.reset).not.toHaveBeenCalled(); expect(fixture.migrate).not.toHaveBeenCalled()
  expect(fixture.cancel).toHaveBeenCalledWith('move-test'); expect(fixture.toast.success).not.toHaveBeenCalled()
})
