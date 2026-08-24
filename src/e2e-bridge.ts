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
import { useLyricStore } from './features/player/store/lyric-store.js'
import { useEqStore } from './features/player/store/eq-store.js'
import { useServerStore } from './features/settings/store/server-store.js'
import { appConfig } from './core/config/app-config.js'
import { router } from './router.js'
import { readNativeModules, readLynxGlobal } from './native/native-modules.js'
import { getFloatingLyricModule } from './native/floating-lyric.js'
import { getVideoModule } from './native/video.js'
import { getPlatformTarget } from './native/platform-target.js'
import { resolveVideoSourceKind } from './core/network/video-source.js'
import { getSystemAppearance } from './native/system-appearance.js'
import { changeAppTheme, getAppTheme, resolveTheme } from './shared/theme/theme-model.js'
import { dispatchBack, getBackStackDepth, pushBackHandler } from './shared/nav/back-stack.js'
import { resolveRouteBack } from './shared/nav/route-back.js'
import { getLastShellLocation, getNavPaths } from './shared/nav/shell-navigation.js'
import { isExitArmed } from './shared/nav/exit-prompt.js'
import { getLastLibrarySearch } from './features/library/data/last-library-search.js'
import { currentBackAction, performRouteBack } from './core/navigation/route-back-action.js'

// Expose stores and config globally for direct access in eval expressions
;(globalThis as Record<string, unknown>).__E2E_PLAYER_STORE__ = usePlayerStore
;(globalThis as Record<string, unknown>).__E2E_AUTH_STORE__ = useAuthStore
;(globalThis as Record<string, unknown>).__E2E_LYRIC_STORE__ = useLyricStore
;(globalThis as Record<string, unknown>).__E2E_EQ_STORE__ = useEqStore
;(globalThis as Record<string, unknown>).__E2E_SERVER_STORE__ = useServerStore
;(globalThis as Record<string, unknown>).__E2E_APP_CONFIG__ = appConfig
;(globalThis as Record<string, unknown>).__E2E_ROUTER__ = router
// Theme / system-appearance accessors. The e2e eval runs in the BTS global scope
// where the bare `lynx` global (and thus `lynx.__globalProps`) is NOT visible —
// it lives in the bundle's module wrapper scope — so tests must read the theme
// through these BTS-reachable functions instead of `lynx.__globalProps`.
//
// `resolveTheme` + `getAppTheme` are what let a test assert the theme the app
// actually renders rather than merely the value the host pushed; `changeAppTheme` is
// the same entry point the settings page uses, so a test can establish the
// `'system'` precondition instead of inheriting whatever the device last persisted.
;(globalThis as Record<string, unknown>).__E2E_APPEARANCE__ = {
  getSystemAppearance,
  getAppTheme,
  resolveTheme,
  changeAppTheme,
}
// Floating-lyrics overlay (Android). Same realm problem as the theme block above,
// one level worse: `NativeModules` is not reachable from the eval scope *at all*
// — neither bare nor on `globalThis` (measured) — so a test cannot poke a native
// module directly the way it can a store. Every call is forwarded through the
// facade rather than a cached instance, because `getFloatingLyricModule()` latches
// its no-op fallback on first call and bundle init is too early to resolve it.
;(globalThis as Record<string, unknown>).__E2E_FLOATING_LYRIC__ = {
  requestPermission: () => getFloatingLyricModule().requestPermission(),
  show: () => getFloatingLyricModule().show(),
  updateLyric: (line: string) => getFloatingLyricModule().updateLyric(line),
  hide: () => getFloatingLyricModule().hide(),
  isShowing: () => getFloatingLyricModule().isShowing(),
}
// Fullscreen video. `platformTarget` / `sourceKind` are exposed alongside the module
// calls because the interesting failures are decisions, not calls: a wrong platform
// read or a container on the wrong side of the direct/transcode split both end in
// "no picture" with nothing on screen to say which.
;(globalThis as Record<string, unknown>).__E2E_VIDEO__ = {
  open: () => getVideoModule().open(),
  close: () => getVideoModule().close(),
  isOpen: () => getVideoModule().isOpen(),
  available: () => getVideoModule().available,
  platformTarget: () => getPlatformTarget(),
  sourceKind: (songJson: string) =>
    resolveVideoSourceKind(
      JSON.parse(songJson) as Parameters<typeof resolveVideoSourceKind>[0],
      getPlatformTarget(),
    ),
  enterVideoSource: () => usePlayerStore.getState().enterVideoSource(),
}

// Back key. The interesting failures are decisions, not renders: "back closed the
// wrong thing" and "back exited the app" look identical in a screenshot, so a test
// has to read the depth and the resolved action rather than look at the screen.
// `dispatch` is the same entry point the host event uses, so a test can exercise
// the whole chain without an `adb keyevent`.
;(globalThis as Record<string, unknown>).__E2E_BACK__ = {
  depth: () => getBackStackDepth(),
  dispatch: () => dispatchBack(),
  routeBack: () => performRouteBack(),
  currentAction: () => currentBackAction(),
  resolveRouteBack: (pathname: string) =>
    resolveRouteBack(pathname, {
      navPaths: getNavPaths(),
      lastShellLocation: getLastShellLocation(),
      lastLibrarySearch: getLastLibrarySearch(),
    }),
  navPaths: () => getNavPaths(),
  exitArmed: () => isExitArmed(Date.now()),
  /**
   * Register a handler on the LIFO stack from a test.
   *
   * Lets a scenario prove the overlay layer is really wired to the hardware key —
   * that a press is consumed there and does *not* fall through to the router —
   * without depending on any particular overlay's UI being reachable first.
   */
  push: (handler: () => boolean) => pushBackHandler(handler),
}

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
