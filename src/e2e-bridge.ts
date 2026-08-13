/**
 * E2E test bridge — exposes internal stores on `globalThis` and registers
 * the TestBridge eval listener so the native TCP server can evaluate JS
 * expressions in the BTS context.
 *
 * Flow:
 *   1. Native TestBridgeServer receives eval command from e2e driver
 *   2. Native module fires `TestBridge.eval` global event with {id, expr}
 *   3. This listener evaluates the expression and calls back via
 *      NativeModules.SongloftTestBridge.respond(id, resultJson)
 */
import { usePlayerStore } from './features/player/store/player-store.js'
import { useAuthStore } from './features/auth/store/auth-store.js'
import { appConfig } from './core/config/app-config.js'
import { readNativeModules, readLynxGlobal } from './native/native-modules.js'

// Expose stores and config globally for direct access in eval expressions
;(globalThis as Record<string, unknown>).__E2E_PLAYER_STORE__ = usePlayerStore
;(globalThis as Record<string, unknown>).__E2E_AUTH_STORE__ = useAuthStore
;(globalThis as Record<string, unknown>).__E2E_APP_CONFIG__ = appConfig

// Register the TestBridge eval listener
function setupTestBridgeListener(): void {
  const lynx = readLynxGlobal()
  if (!lynx || typeof lynx.getJSModule !== 'function') return

  const emitter = lynx.getJSModule('GlobalEventEmitter')
  if (!emitter || typeof emitter.addListener !== 'function') return

  const nativeModules = readNativeModules()
  const bridge = (nativeModules as Record<string, unknown>)?.SongloftTestBridge as {
    respond?: (id: number, result: string) => void
    respondError?: (id: number, error: string) => void
  } | undefined

  if (!bridge?.respond) return

  emitter.addListener('TestBridge.eval', (payload: { id: number; expr: string }) => {
    const { id, expr } = payload
    try {
      // Use indirect eval to execute in global scope
      // eslint-disable-next-line no-eval
      const result = (0, eval)(expr)

      // Handle promises
      if (result && typeof result === 'object' && typeof result.then === 'function') {
        result.then(
          (resolved: unknown) => {
            bridge.respond!(id, JSON.stringify(resolved ?? null))
          },
          (err: unknown) => {
            bridge.respondError!(id, String(err))
          },
        )
      } else {
        bridge.respond!(id, JSON.stringify(result ?? null))
      }
    } catch (e) {
      bridge.respondError!(id, String(e))
    }
  })
}

setupTestBridgeListener()
