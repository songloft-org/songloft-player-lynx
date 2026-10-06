import { afterEach, expect, test, vi } from 'vitest'
import { connectNativePluginHost, PLUGIN_HOST_CALL_EVENT } from '../native-plugin-host.js'

afterEach(() => vi.unstubAllGlobals())
function host() {
  const listeners = new Set<(payload: unknown) => void>()
  const mod = { registerHost: vi.fn(), unregisterHost: vi.fn(), hostReply: vi.fn(), pushToChild: vi.fn() }
  const emitter = {
    addListener: vi.fn((name: string, fn: (p: unknown) => void) => { expect(name).toBe(PLUGIN_HOST_CALL_EVENT); listeners.add(fn) }),
    removeListener: vi.fn((_name: string, fn: (p: unknown) => void) => listeners.delete(fn)),
  }
  vi.stubGlobal('NativeModules', { SongloftPluginBridge: mod })
  vi.stubGlobal('lynx', { getJSModule: () => emitter })
  const call = (frameId = 'a', ns = 'lifecycle', method = 'ready', params = '{}') => {
    const payload = { frameId, callId: 'c', ns, method, params }
    for (const fn of listeners) fn(payload)
  }
  return { mod, emitter, listeners, call }
}

test('queues latest snapshots and one initial resume until the child push listener is ready', () => {
  const h = host(), dispatch = vi.fn(async () => ({ ok: true }))
  const bridge = connectNativePluginHost('a', dispatch)
  bridge.push('playerState', 'old'); bridge.push('playerState', 'new')
  bridge.push('lifecycle', '{"state":"resumed"}')
  expect(h.mod.pushToChild).not.toHaveBeenCalled()
  h.call('other'); expect(h.mod.pushToChild).not.toHaveBeenCalled()
  h.call()
  expect(h.mod.pushToChild.mock.calls).toEqual([
    ['a', 'lifecycle', '{"state":"resumed"}'], ['a', 'playerState', 'new'],
  ])
  h.call(); expect(h.mod.pushToChild).toHaveBeenCalledTimes(2)
  expect(dispatch).not.toHaveBeenCalled()
  bridge.push('lifecycle', '{"state":"resumed"}')
  expect(h.mod.pushToChild).toHaveBeenCalledTimes(3)
  bridge.dispose()
})

test('initial RPC does not consume the resume queued for a later event-only subscription', async () => {
  const h = host(), dispatch = vi.fn(async () => ({ ok: true, data: 'snapshot' }))
  const bridge = connectNativePluginHost('a', dispatch)
  h.call('a', 'host', 'getInfo'); await vi.waitFor(() => expect(h.mod.hostReply).toHaveBeenCalled())
  expect(h.mod.pushToChild).not.toHaveBeenCalled()
  h.call(); expect(h.mod.pushToChild).toHaveBeenCalledOnce()
  bridge.dispose()
})

test('rejects malformed params and catches dispatch failure without an unhandled promise', async () => {
  const h = host(), dispatch = vi.fn(async () => { throw new Error('failure') })
  const bridge = connectNativePluginHost('a', dispatch)
  h.call('a', 'host', 'getInfo', '[]')
  expect(h.mod.hostReply.mock.calls[0]).toEqual(['a', 'c', '{"ok":false,"error":"invalid_params"}'])
  expect(dispatch).not.toHaveBeenCalled()
  h.call('a', 'host', 'getInfo')
  await vi.waitFor(() => expect(h.mod.hostReply).toHaveBeenLastCalledWith('a', 'c', '{"ok":false,"error":"host_call_failed"}'))
  bridge.dispose()
})

test('unmount removes registration and ignores queued callbacks and late RPC replies', async () => {
  const h = host()
  let finish!: (value: { ok: boolean }) => void
  const dispatch = vi.fn(() => new Promise<{ ok: boolean }>(done => { finish = done }))
  const bridge = connectNativePluginHost('a', dispatch)
  h.call('a', 'host', 'getInfo'); await Promise.resolve()
  const queued = [...h.listeners][0]!
  bridge.dispose(); bridge.dispose()
  finish({ ok: true }); await Promise.resolve(); await Promise.resolve()
  bridge.push('lifecycle', '{}'); queued({ frameId: 'a', callId: 'late', ns: 'lifecycle', method: 'ready' })
  expect(h.mod.hostReply).not.toHaveBeenCalled()
  expect(h.mod.pushToChild).not.toHaveBeenCalled()
  expect(h.listeners.size).toBe(0)
  expect(h.mod.unregisterHost).toHaveBeenCalledExactlyOnceWith('a')
})

test('missing, partial and throwing old hosts degrade safely', () => {
  vi.stubGlobal('NativeModules', {})
  expect(() => connectNativePluginHost('a', async () => ({ ok: true })).dispose()).not.toThrow()
  const h = host()
  h.mod.registerHost.mockImplementation(() => { throw new Error('disposed') })
  const bridge = connectNativePluginHost('a', async () => ({ ok: true }))
  bridge.push('lifecycle', '{}'); expect(h.listeners.size).toBe(0)
  vi.stubGlobal('lynx', { getJSModule: () => { throw new Error('unavailable') } })
  expect(() => connectNativePluginHost('a', async () => ({ ok: true }))).not.toThrow()
})
