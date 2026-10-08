import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ download: vi.fn(), cancel: vi.fn(), restore: vi.fn(), getState: vi.fn(), progress: vi.fn(), check: vi.fn() }))
vi.mock('../client-updates.js', () => ({ checkClientUpdate: mocks.check }))
vi.mock('../../../features/settings/api/index.js', () => ({ getSettingsApi: () => ({ getGithubProxy: async () => '' }) }))
vi.mock('../native-updater.js', () => ({
  nativeUpdaterAvailable: () => true, getUpdateState: mocks.getState,
  prepareBundleUpdate: mocks.download, cancelBundleUpdate: mocks.cancel, restoreBuiltinBundle: mocks.restore,
  createUpdateTaskId: () => 'update-test', subscribeUpdateProgress: mocks.progress,
}))
import {
  cancelAutomaticClientBundle, cancelClientBundle, checkClientRelease, downloadAutomaticClientBundle,
  downloadClientBundle, restoreClientBuiltin, updateSession
} from '../update-session.js'
import { automaticUpdatePolicy, updateBundleKey } from '../automatic-update-policy.js'
import { createMemoryStorage, setSongloftStorage } from '../../storage/index.js'
import type { ClientUpdateCheck } from '../client-updates.js'
const check = {
  comparison: 'newer', bundleReason: 'compatible', bundleURL: 'https://example.com/bundle',
  candidate: { rawManifest: 'raw', signature: 'signed', manifest: { bundle_update: { size: 123, bundle_id: 'dev-1-abcdef0', sha256: 'a'.repeat(64) } } }
} as ClientUpdateCheck
const settle = async () => { for (let i = 0; i < 25; i++) await Promise.resolve() }
beforeEach(() => {
  setSongloftStorage(createMemoryStorage())
  automaticUpdatePolicy.store.setState({ loaded: true, enabled: false, skippedBundles: [], preparedBundle: null, lastAttempt: 0, nextAttempt: 0, failures: 0 })
})
afterEach(() => {
  vi.resetAllMocks(); updateSession.setState({
    native: null, operation: null, error: null, progress: null,
    restored: false, checking: false, check: null, checkError: null, downloadSource: null
  })
})
test('one download survives UI detach, rejects duplicate tasks and waits for native cancellation acknowledgement', async () => {
  let reject: (error: Error) => void = () => { }
  const unsubscribe = vi.fn()
  let event: (value: unknown) => void = () => { }
  mocks.progress.mockImplementation((_task, callback) => { event = callback; return unsubscribe })
  mocks.getState.mockResolvedValue({ pending: null })
  mocks.download.mockImplementation(() => new Promise((_done, failed) => { reject = failed }))
  const first = downloadClientBundle(check)
  await downloadClientBundle(check)
  await settle()
  expect(mocks.download).toHaveBeenCalledTimes(1)
  event({ task_id: 'update-test', bytes: 40, total: 123 })
  expect(updateSession.getState().progress?.bytes).toBe(40)
  cancelClientBundle()
  expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith('update-test')
  expect(updateSession.getState().operation).toBe('download')
  reject(new Error('cancelled')); await first
  expect(updateSession.getState()).toMatchObject({ operation: null, progress: null, error: 'cancelled' })
  expect(unsubscribe).toHaveBeenCalledOnce()
  expect(automaticUpdatePolicy.store.getState().skippedBundles).toContain(updateBundleKey(check.candidate.manifest))
})
test('pending is displayed only after native durable completion; restore reports only durable success', async () => {
  mocks.progress.mockReturnValue(() => { })
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

test('manual and automatic checks share one native inspection even after the page detaches', async () => {
  let finish: (value: ClientUpdateCheck) => void = () => { }
  mocks.check.mockImplementation(() => new Promise(done => { finish = done }))
  const first = checkClientRelease()
  const second = checkClientRelease({ force: true })
  await settle()
  expect(mocks.check).toHaveBeenCalledExactlyOnceWith({ proxy: '', force: false })
  expect(updateSession.getState().checking).toBe(true)
  finish(check)
  expect(await first).toBe(check)
  expect(await second).toBe(check)
  expect(updateSession.getState()).toMatchObject({ checking: false, check })
})

test('turning automatic updates OFF cancels only an automatic download, never a manual download', async () => {
  mocks.progress.mockReturnValue(() => { })
  mocks.getState.mockResolvedValue({ pending: null })
  let finish: (id: string) => void = () => { }
  mocks.download.mockImplementation(() => new Promise(done => { finish = done }))
  const manual = downloadClientBundle(check); await settle()
  cancelAutomaticClientBundle()
  expect(mocks.cancel).not.toHaveBeenCalled()
  finish('bundle'); await manual
  await automaticUpdatePolicy.setEnabled(true)
  let reject: (error: Error) => void = () => { }
  mocks.download.mockImplementation(() => new Promise((_done, failed) => { reject = failed }))
  const automatic = downloadAutomaticClientBundle(check); await settle()
  cancelAutomaticClientBundle()
  expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith('update-test')
  reject(new Error('cancelled')); await automatic
  expect(updateSession.getState()).toMatchObject({ operation: null, error: 'cancelled' })
})

test('cancellation during a proxy failure never falls back to another download', async () => {
  mocks.progress.mockReturnValue(() => { })
  mocks.getState.mockResolvedValue({ pending: null })
  let reject: (error: Error) => void = () => { }
  mocks.download.mockImplementation(() => new Promise((_done, failed) => { reject = failed }))
  const task = downloadClientBundle(check); await settle()
  cancelClientBundle()
  reject(new Error('download_failed')); await task
  expect(mocks.download).toHaveBeenCalledOnce()
  expect(updateSession.getState().error).toBe('cancelled')
})

test('restore disables scheduling before the native call and invalidates a late check result', async () => {
  await automaticUpdatePolicy.setEnabled(true)
  let finish: (value: ClientUpdateCheck) => void = () => { }
  mocks.check.mockImplementation(() => new Promise(done => { finish = done }))
  mocks.restore.mockImplementation(async () => { expect(automaticUpdatePolicy.store.getState().enabled).toBe(false) })
  mocks.getState.mockResolvedValue({ pending: null })
  const pending = checkClientRelease(); await settle()
  await restoreClientBuiltin()
  finish(check)
  expect(await pending).toBeNull()
  expect(updateSession.getState()).toMatchObject({ restored: true, check: null })
})

test('cached native pending state cannot be overwritten by either manual or automatic preparation', async () => {
  updateSession.setState({ native: { pending: check.candidate.manifest } as never })
  await automaticUpdatePolicy.setEnabled(true)
  expect(await downloadClientBundle(check)).toBe('busy')
  expect(await downloadAutomaticClientBundle(check)).toBe('busy')
  expect(mocks.download).not.toHaveBeenCalled()
})
