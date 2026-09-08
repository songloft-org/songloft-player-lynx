/**
 * Safe-area insets — the status bar / Dynamic Island / home indicator margins the
 * page has to keep its content out of, in px.
 *
 * **Why this module exists rather than plain CSS.** Every stylesheet reads the
 * insets through the `--safe-top` / `--safe-bottom` / `--safe-left` /
 * `--safe-right` tokens, and `tokens.css` declares those from
 * `env(safe-area-inset-*)` — the function the Lynx CSS docs list as supported on
 * all backends. On iOS Lynx 4.0.1 it is not: measured on an iPhone 17 Pro
 * simulator through `boundingClientRect`, `padding-top: env(safe-area-inset-top)`
 * on `.shell__body` leaves its child at `top: 0`, while a literal `59px` in the
 * same place correctly reports `top: 59`. It fails as a direct declaration and
 * through a custom property alike — it parses, resolves to zero, warns about
 * nothing. (That is why the iOS host used to inset the whole LynxView to the safe
 * area instead, which left the status-bar and home-indicator bands painted by the
 * host's background colour rather than the page's — the reported "顶部和底部区域
 * 没覆盖到".)
 *
 * So the host measures and sends them, and {@link safeAreaStyleVars} turns what
 * arrived into inline custom properties on the theme root. Inline beats the class
 * declarations.
 *
 * What to do about an edge the host did **not** report depends on the platform
 * ({@link resolveInsetsForPlatform}):
 *  - **Web** keeps the stylesheet `env()` default — `env()` works there (given
 *    `viewport-fit=cover`, see `web/index.html`), so only there may an unreported
 *    edge stay at `env(...)`.
 *  - **native** (iOS/Android/HarmonyOS) pins an unreported edge to `0px`. On iOS
 *    that is just the landing state before the host's push arrives; on
 *    Android/HarmonyOS there is nothing to push, and their `env()` inside a
 *    custom-property value is invalid the same way iOS's is — leaving it to
 *    `env()` dropped the bottom-bar and mini-player `left/right/bottom`
 *    declarations entirely.
 *
 * Two channels, same shape and the same reasoning as
 * [system-appearance.ts](./system-appearance.ts):
 *  - `lynx.__globalProps` carries the values the **first frame** needs. A native
 *    getter could not: it would answer after the launch frame had painted, and the
 *    frame it painted would be the one under the status bar.
 *  - a global event carries later changes (rotation, a call-in status bar).
 *
 * Everything is read defensively — it all crosses the native boundary, so a
 * missing or non-numeric value means "host said nothing" (`null`) rather than a
 * guessed zero, and only the edges the host actually reported are overridden.
 */
import { readLynxGlobal } from './native-modules.js'
import { getPlatformTarget } from './platform-target.js'

/** One edge's inset in px, or `null` when the host reported nothing usable. */
export type SafeAreaEdge = number | null

export interface SafeAreaInsets {
  top: SafeAreaEdge
  bottom: SafeAreaEdge
  left: SafeAreaEdge
  right: SafeAreaEdge
}

/**
 * Global-event name the host pushes inset changes on. Must match
 * `SafeAreaInsets.eventChanged` (iOS) byte for byte — same rule as the audio
 * module's event names.
 */
export const SAFE_AREA_EVENT = 'SongloftSystem.safeAreaChanged'

/** `lynx.__globalProps` keys the host populates. Must match the host constants. */
export const GLOBAL_PROP_SAFE_TOP = 'safeAreaTop'
export const GLOBAL_PROP_SAFE_BOTTOM = 'safeAreaBottom'
export const GLOBAL_PROP_SAFE_LEFT = 'safeAreaLeft'
export const GLOBAL_PROP_SAFE_RIGHT = 'safeAreaRight'

/** CSS custom properties the tokens declare and this module overrides. */
export const SAFE_AREA_VARS = {
  top: '--safe-top',
  bottom: '--safe-bottom',
  left: '--safe-left',
  right: '--safe-right',
} as const

/** Nothing known about the host — the stylesheets' `env()` defaults stand. */
const UNKNOWN_INSETS: SafeAreaInsets = { top: null, bottom: null, left: null, right: null }

/**
 * On native Lynx hosts an `env(safe-area-inset-*)` inside a custom-property value
 * is invalid at computed-value time (measured on iOS 4.0.1; Android/HarmonyOS
 * report no insets and showed the same breakage — the bottom-bar and mini-player
 * `left/right/bottom` calc()s were dropped when they fell through to the stylesheet
 * `--safe-*` defaults). Web is the one platform where `env()` resolves, so only
 * there may an unreported edge stay `null` and fall back to `env()`.
 *
 * A known native host that reported nothing therefore gets an explicit `0px` per
 * edge: an inline `0px` is a valid length that keeps every
 * `calc(var(--safe-*))` alive, whereas the stylesheet's `env()` default would
 * make the token invalid and drop the whole declaration. An unknown host (tests /
 * plain node) stays `null`, same as Web — it is the safe default when the engine
 * is unidentified.
 */
export function resolveInsetsForPlatform(
  insets: SafeAreaInsets,
  isNativeHost: boolean,
): SafeAreaInsets {
  if (!isNativeHost) return insets
  return {
    top: insets.top ?? 0,
    bottom: insets.bottom ?? 0,
    left: insets.left ?? 0,
    right: insets.right ?? 0,
  }
}

/** `getPlatformTarget()` is `'web'` for both Web and an unknown host. */
function isNativeHost(): boolean {
  return getPlatformTarget() !== 'web'
}

/** `null` until the first read; afterwards the last value the host reported. */
let current: SafeAreaInsets | null = null
const listeners = new Set<() => void>()
let hostListenerInstalled = false

/**
 * Coerce an untrusted host value into a usable inset, else `null`.
 *
 * Negative values are rejected rather than clamped: an inset is a margin, a
 * negative one can only mean the host sent something it did not mean, and turning
 * it into `0` would hide that while turning it into padding would pull content
 * off screen. `0` itself is a perfectly good answer (a device without a notch) and
 * must stay distinguishable from "not reported".
 */
export function coerceSafeAreaEdge(raw: unknown): SafeAreaEdge {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null
  return raw
}

/** Decode insets out of an arbitrary host payload (globalProps or event). */
export function parseSafeAreaInsets(raw: unknown): SafeAreaInsets {
  const data = (raw ?? {}) as Record<string, unknown>
  return {
    top: coerceSafeAreaEdge(data[GLOBAL_PROP_SAFE_TOP]),
    bottom: coerceSafeAreaEdge(data[GLOBAL_PROP_SAFE_BOTTOM]),
    left: coerceSafeAreaEdge(data[GLOBAL_PROP_SAFE_LEFT]),
    right: coerceSafeAreaEdge(data[GLOBAL_PROP_SAFE_RIGHT]),
  }
}

/** Read `lynx.__globalProps` (no-op outside a Lynx host). */
function readHostInsets(): SafeAreaInsets {
  const l = readLynxGlobal()
  if (!l) return UNKNOWN_INSETS
  try {
    return resolveInsetsForPlatform(
      parseSafeAreaInsets(l.__globalProps),
      isNativeHost(),
    )
  } catch {
    return UNKNOWN_INSETS
  }
}

/**
 * The host's current insets. Reads `lynx.__globalProps` on first call so it works
 * even if {@link initSafeArea} was never called (tests, and any consumer that runs
 * before startup finishes).
 */
export function getSafeAreaInsets(): SafeAreaInsets {
  if (!current) current = readHostInsets()
  return current
}

/** Subscribe to host inset changes; returns an unsubscribe function. */
export function subscribeSafeArea(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Record new insets and notify subscribers if anything changed.
 * Exported for the host-event path and for tests to drive a change.
 */
export function applySafeAreaInsets(next: SafeAreaInsets): void {
  const prev = getSafeAreaInsets()
  if (
    prev.top === next.top
    && prev.bottom === next.bottom
    && prev.left === next.left
    && prev.right === next.right
  ) return
  current = next
  listeners.forEach((listener) => listener())
}

/**
 * Inline custom properties for the edges the host reported, `{}` when it reported
 * none.
 *
 * Only reported edges are emitted, and that is the point: an unreported edge must
 * fall through to the stylesheet's `env()` default, which is the only thing that
 * works on Web. Emitting `0px` for it instead would override `env()` with a zero
 * and break the platform where the CSS is correct.
 *
 * Unlike the theme pack's vars this may legitimately shrink between renders (a
 * host stops reporting an edge), and the runtime's style diffs merge rather than
 * remove — a stale inset would survive. In practice a host either reports all four
 * edges every time or none at all (both hosts snapshot the whole `UIEdgeInsets`),
 * so the set never actually shrinks; the all-or-nothing shape is what makes that
 * safe, not luck.
 */
export function safeAreaStyleVars(insets: SafeAreaInsets): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
    const value = insets[edge]
    if (value !== null) vars[SAFE_AREA_VARS[edge]] = `${value}px`
  }
  return vars
}

/**
 * One-time startup: re-read `lynx.__globalProps` and start listening for host
 * pushes. Idempotent — the host listener is installed at most once, so calling
 * this twice does not double-deliver.
 */
export function initSafeArea(): SafeAreaInsets {
  current = readHostInsets()
  installHostListener()
  return current
}

function installHostListener(): void {
  if (hostListenerInstalled) return
  const l = readLynxGlobal()
  if (!l || typeof l.getJSModule !== 'function') return
  try {
    const emitter = l.getJSModule('GlobalEventEmitter')
    if (!emitter || typeof emitter.addListener !== 'function') return
    // `sendGlobalEvent(name, [payload])` delivers the array's first element as the
    // listener's first argument — same contract as `mapGlobalEvent`.
    emitter.addListener(SAFE_AREA_EVENT, (payload: unknown) => {
      applySafeAreaInsets(resolveInsetsForPlatform(
        parseSafeAreaInsets(payload),
        isNativeHost(),
      ))
    })
    hostListenerInstalled = true
  } catch {
    // No usable emitter (non-Lynx host / tests) — globalProps still applies.
  }
}

/**
 * Test hook: force insets (or `null` to make the next read re-probe).
 *
 * Deliberately does **not** clear {@link listeners}, for the same reason
 * `setSystemAppearanceForTests` does not: `ThemeProvider` subscribes once per
 * process, and dropping its listener here would silently disable the behaviour the
 * following tests assert — they would pass by asserting nothing.
 */
export function setSafeAreaForTests(next: SafeAreaInsets | null): void {
  current = next
  hostListenerInstalled = false
}
