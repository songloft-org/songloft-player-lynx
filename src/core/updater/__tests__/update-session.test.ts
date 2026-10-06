import { afterEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ download: vi.fn(), cancel: vi.fn(), restore: vi.fn(), getState: vi.fn(), progress: vi.fn() }))
vi.mock('../native-updater.js', () => ({
  nativeUpdaterAvailable: () => true, getUpdateState: mocks.getState,
  prepareBundleUpdate: mocks.download, cancelBundleUpdate: mocks.cancel, restoreBuiltinBundle: mocks.restore,
  createUpdateTaskId: () => 'update-test', subscribeUpdateProgress: mocks.progress,
}))
import { cancelClientBundle, downloadClientBundle, restoreClientBuiltin, updateSession } from '../update-session.js'
import type { ClientUpdateCheck } from '../client-updates.js'
const check = { bundleURL: 'https://example.com/bundle', candidate: { rawManifest: 'raw', signature: 'signed', manifest: { bundle_update: { size: 123 } } } } as ClientUpdateCheck
afterEach(() => { vi.resetAllMocks(); updateSession.setState({ native: null, operation: null, error: null, progress: null, restored: false }) })
test('one download survives UI detach, rejects duplicate tasks and waits for native cancellation acknowledgement', async () => {
  let reject: (error: Error) => void = () => {}
  const unsubscribe = vi.fn()
  let event: (value: unknown) => void = () => {}
  mocks.progress.mockImplementation((_task, callback) => { event = callback; return unsubscribe })
  mocks.getState.mockResolvedValue({ pending: null })
  mocks.download.mockImplementation(() => new Promise((_done, failed) => { reject = failed }))
  const first = downloadClientBundle(check)
  await downloadClientBundle(check)
  expect(mocks.download).toHaveBeenCalledTimes(1)
  event({ task_id: 'update-test', bytes: 40, total: 123 })
  expect(updateSession.getState().progress?.bytes).toBe(40)
  cancelClientBundle()
  expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith('update-test')
  expect(updateSession.getState().operation).toBe('download')
  reject(new Error('cancelled')); await first
  expect(updateSession.getState()).toMatchObject({ operation: null, progress: null, error: 'cancelled' })
  expect(unsubscribe).toHaveBeenCalledOnce()
})
test('pending is displayed only after native durable completion; restore reports only durable success', async () => {
  mocks.progress.mockReturnValue(() => {})
  mocks.download.mockResolvedValue('bundle-new')
  mocks.getState.mockResolvedValue({ pending: { git_commit: 'abcdef0' } })
  await downloadClientBundle(check)
  expect(updateSession.getState().native?.pending?.git_commit).toBe('abcdef0')
  mocks.restore.mockRejectedValue(new Error('update_storage_unavailable'))
  await restoreClientBuiltin()
  expect(updateSession.getState().restored).toBe(false)
  mocks.restore.mockResolvedValue(undefined)
  mocks.getState.mockResolvedValue({ pending: null })
  await restoreClientBuiltin()
  expect(updateSession.getState()).toMatchObject({ operation: null, restored: true, error: null })
})
