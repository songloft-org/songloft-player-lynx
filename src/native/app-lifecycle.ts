import { readLynxGlobal } from './native-modules.js'

/** Native hosts push this event into the root LynxView after foreground/readiness. */
export const APP_RESUMED_EVENT = 'SongloftLifecycle.resumed'

/** Subscribe from a background effect; other hosts may never emit this event. */
export function subscribeAppResumed(listener: () => void): () => void {
  'background only'
  try {
    const emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter')
    if (typeof emitter?.addListener !== 'function'
      || typeof emitter?.removeListener !== 'function') return () => {}
    let active = true
    const handler = () => {
      if (active) listener()
    }
    emitter.addListener(APP_RESUMED_EVENT, handler)
    return () => {
      if (!active) return
      active = false
      try {
        emitter.removeListener(APP_RESUMED_EVENT, handler)
      } catch { /* A late event still cannot reach the unmounted page. */ }
    }
  } catch {
    return () => {}
  }
}
