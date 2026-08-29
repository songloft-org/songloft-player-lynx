/**
 * Worker-side facade for `NativeModules.SongloftLynxFrame` (Web platform only).
 *
 * Mirrors `web-webview.ts` — probes the module, exposes typed methods, and
 * subscribes to bridge events from the child frame.
 */
import { readLynxGlobal, readNativeModules } from './native-modules.js'

export const LYNX_FRAME_MESSAGE_EVENT = 'SongloftLynxFrame.message'
export const LYNX_FRAME_OPEN_FAILED_EVENT = 'SongloftLynxFrame.openFailed'

interface LynxFrameNativeModule {
  open(bundleUrl: string, selector: string, globalPropsJson: string): void
  updateGlobalProps(json: string): void
  sendEvent(name: string, dataJson: string): void
  hostReply(callId: string, resultJson: string): void
  close(): void
}

export interface LynxFrameModule {
  readonly available: boolean
  open(bundleUrl: string, selector: string, globalPropsJson: string): void
  updateGlobalProps(json: string): void
  sendEvent(name: string, dataJson: string): void
  hostReply(callId: string, resultJson: string): void
  close(): void
}

export interface LynxFrameHostCallPayload {
  type: string
  frameId: string
  callId: string
  ns: string
  method: string
  params: string
}

export interface LynxFrameBridgeHandlers {
  onMessage: (payload: LynxFrameHostCallPayload) => void
  onOpenFailed?: () => void
}

let cached: LynxFrameModule | null = null

export function getLynxFrameModule(): LynxFrameModule {
  if (cached) return cached

  const nm = readNativeModules()
  const mod = nm?.SongloftLynxFrame as LynxFrameNativeModule | undefined

  if (!mod) {
    cached = {
      available: false,
      open() {},
      updateGlobalProps() {},
      sendEvent() {},
      hostReply() {},
      close() {},
    }
    return cached
  }

  cached = {
    available: true,
    open(url, sel, gp) { mod.open(url, sel, gp) },
    updateGlobalProps(json) { mod.updateGlobalProps(json) },
    sendEvent(name, data) { mod.sendEvent(name, data) },
    hostReply(callId, result) { mod.hostReply(callId, result) },
    close() { mod.close() },
  }
  return cached
}

// ── bridge event handlers ──

let bridgeHandlers: LynxFrameBridgeHandlers | null = null
let listenersInstalled = false

export function setLynxFrameBridgeHandlers(h: LynxFrameBridgeHandlers | null): void {
  bridgeHandlers = h
  if (h && !listenersInstalled) installListeners()
}

function installListeners() {
  try {
    const l = readLynxGlobal()
    if (!l) return
    const emitter = l.getJSModule('GlobalEventEmitter')
    if (!emitter || typeof emitter.addListener !== 'function') return
    emitter.addListener(LYNX_FRAME_MESSAGE_EVENT, (payload: unknown) => {
      if (bridgeHandlers?.onMessage && payload && typeof payload === 'object') {
        bridgeHandlers.onMessage(payload as LynxFrameHostCallPayload)
      }
    })
    emitter.addListener(LYNX_FRAME_OPEN_FAILED_EVENT, () => {
      bridgeHandlers?.onOpenFailed?.()
    })
    listenersInstalled = true
  } catch {
    // No usable emitter — degraded mode, no communication from child
  }
}
