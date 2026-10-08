/**
 * System appearance (batch 21) — the host OS's dark/light setting and locale,
 * which is what `'system'` means in Settings → Appearance / Language.
 *
 * **Why this needs the host at all.** Lynx is not a browser: there is no
 * `@media (prefers-color-scheme)`, no `matchMedia`, and no locale API. Before
 * this module `'system'` was a label with nothing behind it — `resolveTheme`
 * returned a hardcoded `'dark'` and `resolveLanguage` a hardcoded `'en'`
 * (`docs/project/bugs.md`: "外观跟随系统没效果" / "语言跟随系统没效果"). `SystemInfo`
 * exposes only `theme?: object`, whose contents come from a host
 * `LynxView.setTheme(LynxTheme)` call — i.e. still host-supplied, just via a
 * shape nobody documents. So the host has to tell us either way.
 *
 * **Two channels, on purpose:**
 *  - `lynx.__globalProps` carries the *initial* values. The host sets them
 *    before `renderTemplateUrl`, so the very first render already knows the
 *    system theme — no flash of the wrong theme on launch. A native-module
 *    `getAppearance()` call could not do this: it would be async, and the first
 *    frame would paint before the answer arrived.
 *  - a global event (`SongloftSystem.appearanceChanged`) carries *changes*, the
 *    same `LynxContext.sendGlobalEvent` path the native audio module already
 *    uses on device. Nothing else in Lynx pushes host config changes into a
 *    running page.
 *
 * Both are read defensively: everything here crosses the native boundary, so
 * unknown/missing values coerce to `null` ("host said nothing") and each caller
 * applies its own fallback, rather than this module inventing one.
 */
import { readLynxGlobal } from './native-modules.js'

/** The concrete system-level appearance. `null` anywhere means "host said nothing". */
export type SystemTheme = 'light' | 'dark'

export interface SystemAppearance {
  /** System dark/light setting. */
  theme: SystemTheme | null
  /** System locale as a BCP-47-ish tag, e.g. `'zh-CN'`, `'en-US'`. */
  locale: string | null
  /**
   * Whether the user enabled the OS "reduce motion" / "reduce animations"
   * accessibility setting. `null`/absent means the host said nothing; the page
   * treats that as "motion on" (the default) — see `reduce-motion-model.ts`.
   */
  reduceMotion?: boolean | null
  reduceTransparency?: boolean | null
  increaseContrast?: boolean | null
}

/**
 * Global-event name the host pushes appearance changes on. Must match
 * `MainActivity.EVENT_APPEARANCE_CHANGED` byte for byte (same rule as the audio
 * module's event names).
 */
export const SYSTEM_APPEARANCE_EVENT = 'SongloftSystem.appearanceChanged'

/** `lynx.__globalProps` keys the host populates. Must match `MainActivity`. */
export const GLOBAL_PROP_THEME = 'systemTheme'
export const GLOBAL_PROP_LOCALE = 'systemLocale'
/** Host key for the OS reduce-motion accessibility flag, same channel as theme. */
export const GLOBAL_PROP_REDUCE_MOTION = 'systemReduceMotion'

/** Nothing known about the host — every consumer falls back to its own default. */
const UNKNOWN_APPEARANCE: SystemAppearance = { theme: null, locale: null }

/** `null` until the first read; afterwards the last value the host reported. */
let current: SystemAppearance | null = null
const listeners = new Set<() => void>()
let hostListenerInstalled = false

/** Coerce an untrusted host value into a {@link SystemTheme}, else `null`. */
export function coerceSystemTheme(raw: unknown): SystemTheme | null {
  return raw === 'light' || raw === 'dark' ? raw : null
}

/** Coerce an untrusted host value into a non-empty locale tag, else `null`. */
export function coerceSystemLocale(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Coerce an untrusted host value into the reduce-motion flag, else `null`. */
export function coerceReduceMotion(raw: unknown): boolean | null {
  return typeof raw === 'boolean' ? raw : null
}

/** Decode an appearance out of an arbitrary host payload (globalProps or event). */
export function parseSystemAppearance(raw: unknown): SystemAppearance {
  const data = (raw ?? {}) as Record<string, unknown>
  const reduceMotion = coerceReduceMotion(data[GLOBAL_PROP_REDUCE_MOTION])
  const reduceTransparency = coerceReduceMotion(data.systemReduceTransparency)
  const increaseContrast = coerceReduceMotion(data.systemIncreaseContrast)
  // Only surface the flag when the host actually reported it, so callers and
  // tests that compare against `{ theme, locale }` do not need to know about the
  // optional field; `getReduceMotion()` treats absent as motion-on (the default).
  return {
    theme: coerceSystemTheme(data[GLOBAL_PROP_THEME]),
    locale: coerceSystemLocale(data[GLOBAL_PROP_LOCALE]),
    ...(reduceMotion !== null ? { reduceMotion } : {}),
    ...(reduceTransparency !== null ? { reduceTransparency } : {}),
    ...(increaseContrast !== null ? { increaseContrast } : {}),
  }
}

/** Read `lynx.__globalProps` (no-op outside a Lynx host). */
function readHostAppearance(): SystemAppearance {
  const l = readLynxGlobal()
  if (!l) return UNKNOWN_APPEARANCE
  try {
    return parseSystemAppearance(l.__globalProps)
  } catch {
    return UNKNOWN_APPEARANCE
  }
}

/**
 * The host's current appearance. Reads `lynx.__globalProps` on first call so it
 * works even if {@link initSystemAppearance} was never called (tests, and any
 * consumer that runs before startup finishes).
 */
export function getSystemAppearance(): SystemAppearance {
  if (!current) current = readHostAppearance()
  return current
}

/** Subscribe to host appearance changes; returns an unsubscribe function. */
export function subscribeSystemAppearance(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Record a new host appearance and notify subscribers if anything changed.
 * Exported for the host-event path and for tests to drive a change.
 */
export function applySystemAppearance(next: SystemAppearance): void {
  const prev = getSystemAppearance()
  if (prev.theme === next.theme
    && prev.locale === next.locale
    && (prev.reduceMotion ?? null) === (next.reduceMotion ?? null)
    && (prev.reduceTransparency ?? null) === (next.reduceTransparency ?? null)
    && (prev.increaseContrast ?? null) === (next.increaseContrast ?? null)) return
  current = next
  listeners.forEach((listener) => listener())
}

/**
 * One-time startup: re-read `lynx.__globalProps` and start listening for host
 * pushes. Idempotent — the host listener is installed at most once, so calling
 * this twice does not double-deliver.
 */
export function initSystemAppearance(): SystemAppearance {
  current = readHostAppearance()
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
    // `sendGlobalEvent(name, [payload])` delivers the array's first element as
    // the listener's first argument — same contract as `mapGlobalEvent`.
    emitter.addListener(SYSTEM_APPEARANCE_EVENT, (payload: unknown) => {
      applySystemAppearance(parseSystemAppearance(payload))
    })
    hostListenerInstalled = true
  } catch {
    // No usable emitter (non-Lynx host / tests) — globalProps still applies.
  }
}

/**
 * Test hook: force an appearance (or `null` to make the next read re-probe).
 *
 * Deliberately does **not** clear {@link listeners}. Consumers like
 * `theme-model` subscribe exactly once per process and cannot re-subscribe;
 * dropping their listener here would silently disable the very behaviour the
 * following tests assert, and they would pass by asserting nothing.
 */
export function setSystemAppearanceForTests(next: SystemAppearance | null): void {
  current = next
  hostListenerInstalled = false
}
