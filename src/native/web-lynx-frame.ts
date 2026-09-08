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
  /** `key` is the plugin's `entryPath` — what the host keeps children alive by. */
  open(bundleUrl: string, selector: string, globalPropsJson: string, key: string): void
  updateGlobalProps(json: string): void
  sendEvent(name: string, dataJson: string): void
  hostReply(callId: string, resultJson: string): void
  /** Leave the page, keep the child alive off screen (the tab-switch path). */
  hide(key: string): void
  /** Release the child. Empty `key` releases all (logout). */
  close(key: string): void
}

export interface LynxFrameModule {
  readonly available: boolean
  open(bundleUrl: string, selector: string, globalPropsJson: string, key: string): void
  updateGlobalProps(json: string): void
  sendEvent(name: string, dataJson: string): void
  hostReply(callId: string, resultJson: string): void
  hide(key: string): void
  close(key: string): void
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

const NATIVE_METHODS = [
  'open', 'updateGlobalProps', 'sendEvent', 'hostReply', 'hide', 'close',
] as const

/**
 * A partial module is rejected as a whole — the rule `web-webview.ts` and
 * `navigation.ts` already follow, adopted here late.
 *
 * This facade used to accept any object under `SongloftLynxFrame` and forward to
 * it bare. That was survivable while every host script had the same three
 * methods; it stopped being survivable when `hide` was added, because `hide` is
 * called from a React cleanup — against a host page that predates it,
 * `mod.hide(...)` is a TypeError thrown while unmounting. And a stale host page is
 * not hypothetical here: `lynx-frame-host.js` was missing from the deploy list
 * entirely until 2026-09-08, so upgrading from any earlier build is exactly this
 * case. Rejecting the whole module degrades the plugin page to its "unavailable"
 * state instead.
 */
function readNative(): LynxFrameNativeModule | null {
  const mod = readNativeModules()?.SongloftLynxFrame as Record<string, unknown> | undefined
  if (!mod) return null
  for (const name of NATIVE_METHODS) {
    if (typeof mod[name] !== 'function') return null
  }
  return mod as unknown as LynxFrameNativeModule
}

let cached: LynxFrameModule | null = null

export function getLynxFrameModule(): LynxFrameModule {
  if (cached) return cached

  const mod = readNative()

  if (!mod) {
    /*
     * Deliberately NOT memoised, same as `getWebviewModule`: `NativeModules` may
     * still be empty at the first probe, and caching the stub would make the
     * whole feature permanently unavailable for the session.
     */
    return {
      available: false,
      open() {},
      updateGlobalProps() {},
      sendEvent() {},
      hostReply() {},
      hide() {},
      close() {},
    }
  }

  // Every call is guarded: a dead bridge must not take the plugin page down with
  // it, and these are all fire-and-forget writes.
  cached = {
    available: true,
    open(url, sel, gp, key) { try { mod.open(url, sel, gp, key) } catch { /* page keeps its placeholder */ } },
    updateGlobalProps(json) { try { mod.updateGlobalProps(json) } catch { /* next change re-sends */ } },
    sendEvent(name, data) { try { mod.sendEvent(name, data) } catch { /* one lost push */ } },
    hostReply(callId, result) { try { mod.hostReply(callId, result) } catch { /* child times out */ } },
    hide(key) { try { mod.hide(key) } catch { /* worst case the child stays on screen */ } },
    close(key) { try { mod.close(key) } catch { /* worst case it lives until reload */ } },
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

/** Test hook: drop the memoised module and re-arm listener installation. */
export function resetLynxFrameModuleForTests(): void {
  cached = null
  bridgeHandlers = null
  listenersInstalled = false
}
