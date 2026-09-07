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
import {
  disableFloatingLyricOverlay,
  enableFloatingLyricOverlay,
  syncFloatingLyricOverlay,
} from './features/settings/domain/floating-lyric-overlay.js'
import { getVideoModule } from './native/video.js'
import { getPlatformTarget } from './native/platform-target.js'
import { resolveVideoSourceKind } from './core/network/video-source.js'
import { getSafeAreaInsets, safeAreaStyleVars } from './native/safe-area.js'
import { getSystemAppearance } from './native/system-appearance.js'
import { changeAppTheme, getAppTheme, resolveTheme } from './shared/theme/theme-model.js'
import { dispatchBack, getBackStackDepth, pushBackHandler } from './shared/nav/back-stack.js'
import { resolveRouteBack } from './shared/nav/route-back.js'
import { getLastShellLocation, getNavPaths } from './shared/nav/shell-navigation.js'
import { isExitArmed } from './shared/nav/exit-prompt.js'
import { getLastLibrarySearch } from './features/library/data/last-library-search.js'
import { useSongRowOverlays } from './shared/ui/song-row-overlays.js'
import { currentBackAction, performRouteBack } from './core/navigation/route-back-action.js'
import {
  clearSongCache,
  getCacheInfo,
  getSongCacheSize,
} from './features/player/data/song-cache.js'
import { cacheSongToDevice, removeSongCache } from './features/player/domain/song-cache-actions.js'
import { songCacheExtOf } from './features/player/store/player-store.js'
import { getPlatformCapabilities } from './native/platform-capabilities.js'

// Expose stores and config globally for direct access in eval expressions
;(globalThis as Record<string, unknown>).__E2E_PLAYER_STORE__ = usePlayerStore
;(globalThis as Record<string, unknown>).__E2E_AUTH_STORE__ = useAuthStore
;(globalThis as Record<string, unknown>).__E2E_LYRIC_STORE__ = useLyricStore
;(globalThis as Record<string, unknown>).__E2E_EQ_STORE__ = useEqStore
;(globalThis as Record<string, unknown>).__E2E_SERVER_STORE__ = useServerStore
;(globalThis as Record<string, unknown>).__E2E_APP_CONFIG__ = appConfig
;(globalThis as Record<string, unknown>).__E2E_ROUTER__ = router
// Song-row overlays store. The song info/edit dialogs are store-driven (no
// routes anymore), so a scenario opens them the same way the rows do — through
// the actions — and asserts the mutual exclusion directly on state.
;(globalThis as Record<string, unknown>).__E2E_SONG_OVERLAYS__ = useSongRowOverlays
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
  hasPermission: () => getFloatingLyricModule().hasPermission(),
  requestPermission: () => getFloatingLyricModule().requestPermission(),
  show: () => getFloatingLyricModule().show(),
  updateLyric: (line: string, nextLine?: string) => getFloatingLyricModule().updateLyric(line, nextLine),
  hide: () => getFloatingLyricModule().hide(),
  isShowing: () => getFloatingLyricModule().isShowing(),
  setTwoLine: (twoLine: boolean) => getFloatingLyricModule().setTwoLine(twoLine),
  // The settings switch's whole chain (grant → pref → show), not just one module
  // call: the 2026-08-28 bug lived exactly in the seam between the page's promise
  // chain and the native answer, so a module-only test cannot see it.
  enableOverlay: () => enableFloatingLyricOverlay(),
  disableOverlay: () => disableFloatingLyricOverlay(),
  syncOverlay: () => syncFloatingLyricOverlay(),
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

// On-device song cache. `capable` reports the platform capability (false on Web,
// where there is no native cache module), so a scenario can skip cleanly instead
// of asserting against a feature the host cannot provide. `cache`/`remove` take a
// JSON song because the facade's actions consume the camelCase `Song` shape.
;(globalThis as Record<string, unknown>).__E2E_SONG_CACHE__ = {
  capable: () => getPlatformCapabilities().songCache,
  info: (songId: number) => getCacheInfo(songId),
  size: () => getSongCacheSize(),
  cache: (songJson: string) => cacheSongToDevice(JSON.parse(songJson)),
  remove: (songJson: string) => removeSongCache(JSON.parse(songJson)),
  clear: () => clearSongCache(),
  ext: (songJson: string) => songCacheExtOf(JSON.parse(songJson)),
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

/**
 * Measure one element's box, the only way a scenario can assert *geometry*.
 *
 * Why this exists: the safe-area contract (`--safe-top` / `--safe-bottom` in
 * `tokens.css`) is a number the CSS engine resolves from `env(safe-area-inset-*)`
 * at runtime, and every way it can fail is invisible to every other kind of
 * assertion. If the engine ever stops resolving `env()` through a custom property,
 * the tokens silently collapse to their `0px` fallbacks: the store state is
 * identical, the class names are identical, the route is identical, and the page
 * simply renders under the status bar and the home indicator. A screenshot shows
 * it, but nothing *fails*.
 *
 * Same `boundingClientRect` invoke `useBreakpoint`/`anchored-overlay` use, so the
 * coordinates are the ones the app itself lays out against: lynx-view-relative on
 * native, `<lynx-view>`-relative on Web. `lynx` is read as a **bare** global for
 * the reason spelled out in `useBreakpoint.measureRect` — `globalThis.lynx` is
 * undefined in this realm.
 *
 * Resolves `null` (never rejects) when the selector matches nothing or the host
 * has no invoke bridge, so a scenario can distinguish "not on screen" from "at the
 * wrong place" instead of failing with a timeout for both.
 *
 * **`position: fixed` boxes are timing-sensitive — settle before trusting them.**
 * Measured on iOS, the same two fixed elements in the same session: shortly after
 * launch `.shell__bottombar` reported `left 0, top 0, width 2` and `.mini-player`
 * `left 0, top 0, width 126`; once the shell had finished laying out they reported
 * `left 12, top 768, width 378, height 64` and `left 8, top 707, width 386,
 * height 53` — both matching the CSS exactly. So a fixed element's numbers are
 * either right or nonsense with nothing in between to warn you. Give the page a
 * moment after navigation/launch, and cross-check against the CSS before building
 * an assertion on a box that looks plausible.
 */
;(globalThis as Record<string, unknown>).__E2E_MEASURE__ = (
  selector: string,
): Promise<{ left: number, top: number, width: number, height: number } | null> =>
  new Promise((resolve) => {
    try {
      if (typeof lynx === 'undefined' || typeof lynx.createSelectorQuery !== 'function') {
        resolve(null)
        return
      }
      lynx
        .createSelectorQuery()
        .select(selector)
        .invoke({
          method: 'boundingClientRect',
          success: (res: unknown) => {
            const r = res as Record<string, unknown>
            resolve({
              left: Number(r?.left ?? 0),
              top: Number(r?.top ?? 0),
              width: Number(r?.width ?? 0),
              height: Number(r?.height ?? 0),
            })
          },
          fail: () => resolve(null),
        })
        .exec()
    } catch {
      resolve(null)
    }
  })

/**
 * Scroll geometry, because `boundingClientRect` cannot see any of it.
 *
 * A scroll container's box is its **viewport**; the thing a scenario usually has to
 * assert on is the *content* — how far it can scroll, and whether the tail padding
 * that clears the floating nav capsule is actually there. Neither is a box, so
 * neither is measurable through `__E2E_MEASURE__`.
 *
 * Three numbers, from the two invoke methods `<scroll-view>` documents:
 *  - `getScrollInfo` → `{scrollX, scrollY, scrollRange}` on the default path, or
 *    `{scrollLeft, scrollTop, scrollWidth, scrollHeight}` on the new-arch path. The
 *    shapes differ by runtime path, so this returns the raw object rather than
 *    normalising it and silently dropping the half a given device does not report.
 *  - `takeContentScreenshot` → the **full** scrollable content size. The `data`
 *    field is a base64 image, megabytes for a long list, so it is stripped here:
 *    only the size crosses the bridge.
 *
 * Both resolve `null` (never reject) when the selector matches nothing, the element
 * is not a scroller, or the host lacks the invoke bridge — the same "not on screen"
 * vs "wrong value" distinction `__E2E_MEASURE__` makes.
 */
function invokeScroll(
  selector: string,
  method: string,
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    try {
      if (typeof lynx === 'undefined' || typeof lynx.createSelectorQuery !== 'function') {
        resolve(null)
        return
      }
      lynx
        .createSelectorQuery()
        .select(selector)
        .invoke({
          method,
          success: (res: unknown) => {
            const r = (res ?? {}) as Record<string, unknown>
            // Never let the base64 image cross the bridge.
            const { data: _data, ...size } = r
            void _data
            resolve(size)
          },
          fail: () => resolve(null),
        })
        .exec()
    } catch {
      resolve(null)
    }
  })
}

;(globalThis as Record<string, unknown>).__E2E_SCROLL_INFO__ = (selector: string) =>
  invokeScroll(selector, 'getScrollInfo')

;(globalThis as Record<string, unknown>).__E2E_CONTENT_SIZE__ = (selector: string) =>
  invokeScroll(selector, 'takeContentScreenshot')

/** Scroll to an absolute offset (px) and report whether the invoke was accepted. */
;(globalThis as Record<string, unknown>).__E2E_SCROLL_TO__ = (
  selector: string,
  offset: number,
): Promise<boolean> =>
  new Promise((resolve) => {
    try {
      if (typeof lynx === 'undefined' || typeof lynx.createSelectorQuery !== 'function') {
        resolve(false)
        return
      }
      lynx
        .createSelectorQuery()
        .select(selector)
        .invoke({
          method: 'scrollTo',
          params: { offset },
          success: () => resolve(true),
          fail: () => resolve(false),
        })
        .exec()
    } catch {
      resolve(false)
    }
  })

/**
 * Safe-area insets as the page received them, the counterpart to
 * `__E2E_APPEARANCE__` for the other host→page geometry channel.
 *
 * A scenario needs both halves to say anything useful: what the host *reported*
 * (this) and what the tree *laid out to* (`__E2E_MEASURE__`). Either alone passes
 * while the feature is broken — the host can report 62 into a stylesheet that
 * ignores it, and a page can be inset by 62 for some unrelated reason.
 */
;(globalThis as Record<string, unknown>).__E2E_SAFE_AREA__ = {
  get: () => getSafeAreaInsets(),
  styleVars: () => safeAreaStyleVars(getSafeAreaInsets()),
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
