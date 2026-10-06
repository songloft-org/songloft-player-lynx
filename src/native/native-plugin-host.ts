import { readLynxGlobal, readNativeModules } from './native-modules.js'
import type { HostCallRequest, HostCallResult } from '../features/jsplugin/domain/plugin-host-dispatch.js'

export const PLUGIN_HOST_CALL_EVENT = 'SongloftPluginBridge.hostCall'

export interface PluginBridgeNativeModule {
  registerHost(frameId: string): void
  unregisterHost(frameId: string): void
  hostReply(frameId: string, callId: string, resultJson: string): void
  pushToChild(frameId: string, eventName: string, dataJson: string): void
}

export interface NativePluginHost {
  push(event: string, data: string): void
  dispose(): void
}

/** Scope registration, readiness, replies and queued snapshots to one mounted frame. */
export function connectNativePluginHost(
  frameId: string,
  dispatch: (request: HostCallRequest) => Promise<HostCallResult>,
): NativePluginHost {
  'background only'
  let active = true
  let ready = false
  const queued = new Map<string, string>()
  queued.set('lifecycle', JSON.stringify({ state: 'resumed' }))
  const raw = readNativeModules()?.SongloftPluginBridge as Partial<PluginBridgeNativeModule> | undefined
  let emitter: ReturnType<typeof readLynxGlobal>
  try { emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter') }
  catch { return { push() {}, dispose() {} } }
  const methods = ['registerHost', 'unregisterHost', 'hostReply', 'pushToChild'] as const
  if (!raw || !methods.every(method => typeof raw[method] === 'function')
    || typeof emitter?.addListener !== 'function' || typeof emitter?.removeListener !== 'function') {
    return { push() {}, dispose() {} }
  }
  const mod = raw as PluginBridgeNativeModule
  const push = (event: string, data: string) => {
    if (!active) return
    if (!ready) { queued.set(event, data); return }
    try { mod.pushToChild(frameId, event, data) } catch { /* The child may already be disposed. */ }
  }
  const reply = (callId: string, result: HostCallResult) => {
    if (!active) return
    try { mod.hostReply(frameId, callId, JSON.stringify(result)) } catch { /* Late/disposed child. */ }
  }
  const handler = (payload: unknown) => {
    if (!active || !payload || typeof payload !== 'object') return
    const call = payload as Record<string, unknown>
    if (call.frameId !== frameId || typeof call.callId !== 'string'
      || typeof call.ns !== 'string' || typeof call.method !== 'string') return
    if (call.ns === 'lifecycle' && call.method === 'ready') {
      if (!ready) {
        ready = true
        for (const [event, data] of queued) push(event, data)
        queued.clear()
      }
      return
    }
    let params: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(typeof call.params === 'string' ? call.params : '{}')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_params')
      params = parsed as Record<string, unknown>
    } catch { reply(call.callId, { ok: false, error: 'invalid_params' }); return }
    const callId = call.callId
    void Promise.resolve().then(() => {
      if (!active) return null
      return dispatch({ ns: call.ns as string, method: call.method as string, params })
    }).then(result => {
      if (result) reply(callId, result)
    }).catch(() => reply(callId, { ok: false, error: 'host_call_failed' }))
  }
  const dispose = () => {
    if (!active) return
    active = false
    queued.clear()
    try { emitter.removeListener(PLUGIN_HOST_CALL_EVENT, handler) } catch { /* Host teardown. */ }
    try { mod.unregisterHost(frameId) } catch { /* Host teardown. */ }
  }
  try {
    emitter.addListener(PLUGIN_HOST_CALL_EVENT, handler)
    mod.registerHost(frameId)
  } catch { dispose() }
  return { push, dispose }
}
