import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cancelBundleUpdate, confirmUpdateStartup, createUpdateTaskId, getUpdateHost, getUpdateState,
  inspectUpdateManifest, nativeUpdaterAvailable, prepareBundleUpdate, reportUpdateStartupFailure,
  restoreBuiltinBundle, subscribeUpdateProgress } from '../native-updater.js'

const vector = JSON.parse(readFileSync(resolve(__dirname, '../../../../updates/fixtures/signature-v1.json'), 'utf8'))
const manifest = JSON.parse(vector.raw_manifest)
const host = { ...vector.native_host, platform: 'android', engine: '4.0.0', trusted_key_ids: [vector.trusted_key.key_id] }
delete host.trusted_keys
const state = () => ({ host, running: { ...manifest, kind: 'trial' }, active: null, previous: null, pending: null })
type Callback = (value: string) => void
const module = () => ({
  getInfo: vi.fn((callback: Callback) => callback(JSON.stringify(host))),
  getState: vi.fn((callback: Callback) => callback(JSON.stringify(state()))),
  inspectManifest: vi.fn((_raw: string, _signature: string, callback: Callback) => callback(vector.raw_manifest)),
  download: vi.fn((_request: string, callback: Callback) => callback(JSON.stringify({ prepared: true, bundle_id: manifest.bundle_update.bundle_id }))),
  cancel: vi.fn(), confirmStartup: vi.fn(), reportStartupFailure: vi.fn(),
  restoreBuiltin: vi.fn((callback: Callback) => callback('{}')),
})
const input = () => ({ task_id: createUpdateTaskId(), manifest: vector.raw_manifest, signature: JSON.stringify(vector.envelope), url: 'https://example.com/bundle' })
let native: ReturnType<typeof module>
beforeEach(() => { native = module(); vi.stubGlobal('NativeModules', { SongloftUpdate: native }) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('native updater callback boundary', () => {
  test('old/missing shells are unavailable; no native method returns a promise', async () => {
    expect(nativeUpdaterAvailable()).toBe(true)
    vi.stubGlobal('NativeModules', { SongloftUpdate: { ...native, inspectManifest: undefined } })
    expect(nativeUpdaterAvailable()).toBe(false)
    await expect(getUpdateHost()).rejects.toThrow('update_unavailable')
    await confirmUpdateStartup()
    reportUpdateStartupFailure()
    expect(native.confirmStartup).not.toHaveBeenCalled()
  })
  test('reads the immutable host and validates native signed-manifest responses', async () => {
    expect(await getUpdateHost()).toMatchObject({ platform: 'android', bridge_version: 1 })
    expect(await inspectUpdateManifest(vector.raw_manifest, JSON.stringify(vector.envelope))).toEqual(manifest)
    expect(native.inspectManifest).toHaveBeenCalledWith(vector.raw_manifest, JSON.stringify(vector.envelope), expect.any(Function))
    expect(await getUpdateState()).toMatchObject({ running: { kind: 'trial' }, pending: null })
  })
  test('native signature/compatibility failures propagate without accepting parsed JS metadata', async () => {
    native.inspectManifest.mockImplementation((_raw, _signature, callback) => callback('{"error":"invalid_signature"}'))
    await expect(inspectUpdateManifest(vector.raw_manifest, '{}')).rejects.toThrow('invalid_signature')
    expect(native.download).not.toHaveBeenCalled()
  })
  test('malformed asynchronous callback data rejects instead of throwing outside the promise', async () => {
    let callback: Callback = () => {}
    native.getInfo.mockImplementation(value => { callback = value })
    const pending = getUpdateHost()
    callback('not-json')
    await expect(pending).rejects.toThrow()
    native.getInfo.mockImplementation(value => value('{"platform":"android"}'))
    await expect(getUpdateHost()).rejects.toThrow()
    native.getState.mockImplementation(value => value(JSON.stringify({ ...state(), running: { ...manifest, kind: 'unsafe' } })))
    await expect(getUpdateState()).rejects.toThrow('invalid_update_response')
  })
  test('a missing read callback times out, clears its timer and ignores late replies', async () => {
    vi.useFakeTimers()
    let callback: Callback = () => {}
    native.getInfo.mockImplementation(value => { callback = value })
    const pending = getUpdateHost()
    const rejected = expect(pending).rejects.toThrow('update_timeout')
    await vi.advanceTimersByTimeAsync(15_000)
    await rejected
    callback(JSON.stringify(host))
    expect(vi.getTimerCount()).toBe(0)
  })
  test('download input is frozen and completion must explicitly report a prepared bundle', async () => {
    const request = input()
    const original = { ...request }
    let callback: Callback = () => {}
    native.download.mockImplementation((_request, value) => { callback = value })
    const pending = prepareBundleUpdate(request)
    request.url = 'https://changed.example/bundle'
    expect(JSON.parse(native.download.mock.calls[0][0])).toEqual(original)
    callback(JSON.stringify({ prepared: true, bundle_id: manifest.bundle_update.bundle_id }))
    expect(await pending).toBe(manifest.bundle_update.bundle_id)
    native.download.mockImplementation((_request, value) => value('{}'))
    await expect(prepareBundleUpdate(input())).rejects.toThrow('invalid_update_response')
  })
  test('download timeout cancels the exact task even after the caller mutates its object', async () => {
    vi.useFakeTimers()
    native.download.mockImplementation(() => {})
    const request = input(), taskId = request.task_id
    const pending = prepareBundleUpdate(request)
    request.task_id = 'another-task'
    const rejected = expect(pending).rejects.toThrow('update_timeout')
    await vi.advanceTimersByTimeAsync(240_000)
    await rejected
    expect(native.cancel).toHaveBeenCalledWith(taskId)
    expect(vi.getTimerCount()).toBe(0)
  })
  test('only the running trial is confirmed; builtin/active/failed reads preserve native rollback', async () => {
    await confirmUpdateStartup()
    expect(native.confirmStartup).toHaveBeenCalledExactlyOnceWith(manifest.bundle_update.bundle_id)
    native.confirmStartup.mockClear()
    native.getState.mockImplementation(callback => callback(JSON.stringify({ ...state(), running: { ...host, kind: 'builtin' } })))
    await confirmUpdateStartup()
    native.getState.mockImplementation(callback => callback('{"error":"update_failed"}'))
    await confirmUpdateStartup()
    expect(native.confirmStartup).not.toHaveBeenCalled()
    reportUpdateStartupFailure()
    expect(native.reportStartupFailure).toHaveBeenCalledOnce()
  })
  test('restore waits for native persistence; cancel targets the requested operation', async () => {
    let callback: Callback = () => {}
    native.restoreBuiltin.mockImplementation(value => { callback = value })
    let finished = false
    const pending = restoreBuiltinBundle().then(() => { finished = true })
    await Promise.resolve(); expect(finished).toBe(false)
    cancelBundleUpdate('update-1')
    expect(native.cancel).toHaveBeenCalledWith('update-1')
    callback('{}'); await pending
    expect(finished).toBe(true)
  })
  test('progress is task-scoped, bounded and cannot reach an unmounted subscriber', () => {
    let handler: (value: unknown) => void = () => {}
    const emitter = { addListener: vi.fn((_event, value) => { handler = value }), removeListener: vi.fn() }
    vi.stubGlobal('lynx', { getJSModule: () => emitter })
    const listener = vi.fn()
    const unsubscribe = subscribeUpdateProgress('update-1', listener)
    handler({ task_id: 'other', bytes: 1, total: 10 })
    handler({ task_id: 'update-1', bytes: 11, total: 10 })
    handler('not-json')
    handler({ task_id: 'update-1', bytes: 1, total: 10 })
    expect(listener).toHaveBeenCalledExactlyOnceWith({ task_id: 'update-1', bytes: 1, total: 10 })
    unsubscribe(); unsubscribe()
    handler({ task_id: 'update-1', bytes: 2, total: 10 })
    expect(listener).toHaveBeenCalledOnce()
    expect(emitter.removeListener).toHaveBeenCalledExactlyOnceWith('SongloftUpdate.progress', handler)
  })
})
