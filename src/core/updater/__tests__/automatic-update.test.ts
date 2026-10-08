import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMemoryStorage } from '../../storage/index.js'
import { AutomaticUpdateController } from '../automatic-update.js'
import {
  AutomaticUpdatePolicy, AUTOMATIC_UPDATE_INTERVAL, AUTOMATIC_UPDATE_STARTUP_INTERVAL,
  PREF_AUTOMATIC_UPDATE, updateBundleKey
} from '../automatic-update-policy.js'
import type { UpdateState } from '../native-updater.js'
import type { ClientUpdateCheck } from '../client-updates.js'
import type { UpdateSession } from '../update-session.js'

const vector = JSON.parse(readFileSync(resolve(__dirname, '../../../../updates/fixtures/signature-v1.json'), 'utf8'))
const manifest = JSON.parse(vector.raw_manifest)
const result = (): ClientUpdateCheck => ({
  comparison: 'newer', bundleReason: 'compatible', bundleURL: 'https://example.com/bundle',
  candidate: {
    manifest, rawManifest: vector.raw_manifest, signature: JSON.stringify(vector.envelope), proxy: '',
    release: { id: 1, tag_name: 'dev', updated_at: '', published_at: '', body: '', assets: [] }
  }
})
const controllers: AutomaticUpdateController[] = []
async function fixture(saved?: Record<string, unknown>) {
  const storage = createMemoryStorage()
  if (saved) await storage.prefs.set(PREF_AUTOMATIC_UPDATE, JSON.stringify(saved))
  const policy = new AutomaticUpdatePolicy(() => storage)
  const native: UpdateState = {
    host: { ...vector.native_host, platform: 'android' },
    running: { ...manifest, kind: 'builtin', git_commit: '1111111', bundle_update: null }, active: null, previous: null, pending: null
  }
  const session: UpdateSession = {
    native, operation: null, progress: null, error: null, restored: false,
    checking: false, check: null, checkError: null, downloadSource: null
  }
  let resume = () => { }
  const deps = {
    policy, session: () => session, available: vi.fn(() => true), refresh: vi.fn(async () => native),
    check: vi.fn(async () => result()), download: vi.fn(async () => { native.pending = manifest; return 'prepared' as const }),
    cancel: vi.fn(), subscribeResume: vi.fn((listener: () => void) => { resume = listener; return vi.fn() }),
  }
  const controller = new AutomaticUpdateController(deps)
  controllers.push(controller)
  return { controller, policy, storage, native, session, deps, resume: () => resume() }
}
const settle = () => vi.advanceTimersByTimeAsync(0)
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000_000) })
afterEach(() => { controllers.splice(0).forEach(value => value.stop()); vi.useRealTimers() })

test('default OFF produces no metadata request or download, including resume and timer triggers', async () => {
  const f = await fixture()
  f.controller.start(); await settle()
  f.resume(); await vi.advanceTimersByTimeAsync(AUTOMATIC_UPDATE_INTERVAL * 2)
  expect(f.policy.store.getState()).toMatchObject({ loaded: true, enabled: false })
  expect(f.deps.refresh).not.toHaveBeenCalled()
  expect(f.deps.check).not.toHaveBeenCalled()
  expect(f.deps.download).not.toHaveBeenCalled()
})

test('turning ON checks immediately once and preserves a prepared bundle until a cold start', async () => {
  const f = await fixture()
  f.controller.start(); f.controller.start(); await settle()
  await f.policy.setEnabled(true); await settle()
  expect(f.deps.check).toHaveBeenCalledOnce()
  expect(f.deps.download).toHaveBeenCalledExactlyOnceWith(result())
  expect(f.native.running.kind).toBe('builtin')
  expect(f.native.pending).toEqual(manifest)
  await vi.advanceTimersByTimeAsync(AUTOMATIC_UPDATE_INTERVAL)
  f.resume(); await settle()
  expect(f.deps.check).toHaveBeenCalledOnce()
  expect(f.deps.subscribeResume).toHaveBeenCalledOnce()
  const restored = new AutomaticUpdatePolicy(() => f.storage)
  await restored.hydrate()
  expect(restored.store.getState().enabled).toBe(true)
})

test('cold launches within ten minutes are throttled; normal running checks again in six hours', async () => {
  const now = Date.now()
  const f = await fixture({ enabled: true, lastAttempt: now, nextAttempt: now + AUTOMATIC_UPDATE_INTERVAL })
  f.deps.check.mockResolvedValue({ ...result(), comparison: 'current', bundleURL: null })
  f.controller.start(); await settle()
  expect(f.deps.check).not.toHaveBeenCalled()
  f.resume(); await settle()
  await vi.advanceTimersByTimeAsync(AUTOMATIC_UPDATE_STARTUP_INTERVAL - 1)
  expect(f.deps.check).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(f.deps.check).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(AUTOMATIC_UPDATE_INTERVAL)
  expect(f.deps.check).toHaveBeenCalledTimes(2)
  expect(f.deps.download).not.toHaveBeenCalled()
})

test('resume checks overdue releases after suspension, without launching duplicate work', async () => {
  const f = await fixture({ enabled: true })
  f.deps.check.mockResolvedValue({ ...result(), comparison: 'current', bundleURL: null })
  f.controller.start(); await settle()
  vi.setSystemTime(Date.now() + AUTOMATIC_UPDATE_INTERVAL)
  f.resume(); f.resume(); f.resume(); await settle()
  expect(f.deps.check).toHaveBeenCalledTimes(2)
})

test.each([
  { comparison: 'unknown' as const, bundleURL: null },
  { bundleReason: 'engine', bundleURL: null },
  { bundleReason: 'signature_invalid', bundleURL: null },
  { bundleReason: 'signature_missing', bundleURL: null },
])('incompatible, unsigned or unknown candidates never download: %j', async patch => {
  const f = await fixture({ enabled: true })
  f.deps.check.mockResolvedValue({ ...result(), ...patch })
  f.controller.start(); await settle()
  expect(f.deps.check).toHaveBeenCalledOnce()
  expect(f.deps.download).not.toHaveBeenCalled()
})

test('checks wait for trial confirmation and manual operations; existing pending updates are not replaced', async () => {
  const f = await fixture({ enabled: true })
  f.native.running.kind = 'trial'
  f.controller.start(); await settle()
  expect(f.deps.check).not.toHaveBeenCalled()
  f.native.running.kind = 'active'; f.session.operation = 'restore'
  await vi.advanceTimersByTimeAsync(60_000)
  expect(f.deps.check).not.toHaveBeenCalled()
  f.session.operation = null; f.native.pending = manifest
  await vi.advanceTimersByTimeAsync(60_000)
  expect(f.deps.check).not.toHaveBeenCalled()
})

test('a lost race to a manual operation retries after it finishes, instead of waiting six hours', async () => {
  const f = await fixture({ enabled: true })
  f.deps.check.mockResolvedValueOnce(null as never)
  f.controller.start(); await settle()
  await vi.advanceTimersByTimeAsync(60_000)
  expect(f.deps.check).toHaveBeenCalledTimes(2)
  expect(f.deps.download).toHaveBeenCalledOnce()
})

test('OFF invalidates an in-flight check; its late response cannot start a download', async () => {
  const f = await fixture({ enabled: true })
  let finish: (value: ClientUpdateCheck) => void = () => { }
  f.deps.check.mockImplementation(() => new Promise(done => { finish = done }))
  f.controller.start(); await settle()
  await f.policy.setEnabled(false)
  finish(result()); await settle()
  f.resume(); await vi.advanceTimersByTimeAsync(AUTOMATIC_UPDATE_INTERVAL)
  expect(f.deps.download).not.toHaveBeenCalled()
  expect(f.deps.cancel).toHaveBeenCalledOnce()
  expect(JSON.parse((await f.storage.prefs.get(PREF_AUTOMATIC_UPDATE))!).enabled).toBe(false)
})

test('OFF then ON during a check serializes the new request and discards the previous response', async () => {
  const f = await fixture({ enabled: true })
  let finish: (value: ClientUpdateCheck) => void = () => { }
  f.deps.check.mockImplementationOnce(() => new Promise(done => { finish = done }))
  f.controller.start(); await settle()
  await f.policy.setEnabled(false); await f.policy.setEnabled(true)
  finish(result()); await settle()
  expect(f.deps.check).toHaveBeenCalledTimes(2)
  expect(f.deps.download).toHaveBeenCalledOnce()
})

test('network failures back off for 30 minutes, two hours and six hours, surviving a relaunch', async () => {
  const f = await fixture({ enabled: true })
  f.deps.check.mockRejectedValue(new Error('metadata_failed'))
  f.controller.start(); await settle()
  for (const [delay, count] of [[30 * 60_000, 2], [2 * 60 * 60_000, 3], [AUTOMATIC_UPDATE_INTERVAL, 4]]) {
    await vi.advanceTimersByTimeAsync(delay! - 1)
    expect(f.deps.check).toHaveBeenCalledTimes(count! - 1)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.deps.check).toHaveBeenCalledTimes(count!)
  }
  const saved = JSON.parse((await f.storage.prefs.get(PREF_AUTOMATIC_UPDATE))!)
  const next = await fixture(saved)
  next.controller.start(); await settle()
  expect(next.deps.check).not.toHaveBeenCalled()
  f.deps.check.mockResolvedValue({ ...result(), comparison: 'current', bundleURL: null })
  await vi.advanceTimersByTimeAsync(AUTOMATIC_UPDATE_INTERVAL)
  expect(f.policy.store.getState().failures).toBe(0)
})

test('rolled-back bundle identity is persisted and skipped; a corrected hash may be downloaded', async () => {
  const key = updateBundleKey(manifest)!
  const f = await fixture({ enabled: true, preparedBundle: key })
  f.native.last_error = 'rollback_unconfirmed'
  f.controller.start(); await settle()
  expect(f.policy.store.getState().skippedBundles).toContain(key)
  expect(f.deps.download).not.toHaveBeenCalled()
  const saved = JSON.parse((await f.storage.prefs.get(PREF_AUTOMATIC_UPDATE))!)
  expect(saved.skippedBundles).toContain(key)
  f.deps.check.mockResolvedValue({
    ...result(), candidate: {
      ...result().candidate,
      manifest: { ...manifest, bundle_update: { ...manifest.bundle_update, sha256: 'a'.repeat(64) } }
    }
  })
  await vi.advanceTimersByTimeAsync(AUTOMATIC_UPDATE_INTERVAL)
  expect(f.deps.download).toHaveBeenCalledOnce()
})

test('a persisted cancelled bundle is skipped, but a later release can update', async () => {
  const f = await fixture({ enabled: true, skippedBundles: [updateBundleKey(manifest)] })
  f.controller.start(); await settle()
  expect(f.deps.download).not.toHaveBeenCalled()
  f.deps.check.mockResolvedValue({
    ...result(), candidate: {
      ...result().candidate,
      manifest: { ...manifest, bundle_update: { ...manifest.bundle_update, bundle_id: 'dev-2-abcdef0' } }
    }
  })
  await vi.advanceTimersByTimeAsync(AUTOMATIC_UPDATE_INTERVAL)
  expect(f.deps.download).toHaveBeenCalledOnce()
})

test('Web and older shells do not initialize automatic scheduling', async () => {
  const f = await fixture({ enabled: true })
  f.deps.available.mockReturnValue(false)
  f.controller.start(); await settle()
  expect(f.deps.subscribeResume).not.toHaveBeenCalled()
  expect(f.deps.check).not.toHaveBeenCalled()
})

test('late preference reads cannot overwrite a user choice, and writes retain the final OFF', async () => {
  const storage = createMemoryStorage()
  let read: (raw: string) => void = () => { }
  storage.prefs.get = () => new Promise(done => { read = done })
  const policy = new AutomaticUpdatePolicy(() => storage)
  const hydration = policy.hydrate()
  const writes = [policy.setEnabled(true), policy.setEnabled(false)]
  read(JSON.stringify({ enabled: true })); await hydration; await Promise.all(writes)
  expect(policy.store.getState()).toMatchObject({ loaded: true, enabled: false })
})

test('a storage callback that never arrives leaves the feature disabled after a bounded wait', async () => {
  const storage = createMemoryStorage()
  storage.prefs.get = () => new Promise(() => { })
  const policy = new AutomaticUpdatePolicy(() => storage)
  const pending = policy.hydrate()
  await vi.advanceTimersByTimeAsync(5000); await pending
  expect(policy.store.getState()).toMatchObject({ loaded: true, enabled: false })
})

test('clock rollback does not indefinitely suppress a startup check', async () => {
  const f = await fixture({
    enabled: true, lastAttempt: Date.now() + AUTOMATIC_UPDATE_INTERVAL,
    nextAttempt: Date.now() + AUTOMATIC_UPDATE_INTERVAL * 2
  })
  f.controller.start(); await settle()
  expect(f.deps.check).toHaveBeenCalledOnce()
})
