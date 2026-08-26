/**
 * Theme model (batch 13) — light/dark/system selection, following the same
 * shape as the language module (`src/i18n/index.ts`): a concrete choice is
 * persisted and applied immediately, and `'system'` follows the host OS.
 *
 * **`'system'` (batch 21).** It used to be a label with nothing behind it,
 * resolving to a hardcoded `'dark'` — exactly `docs/project/bugs.md`'s "外观跟随系统没
 * 效果，始终是深色". Lynx has no `prefers-color-scheme`, so the signal comes from
 * the host via `src/native/system-appearance.ts`, and
 * {@link DEFAULT_RESOLVED_THEME} is now only the fallback for hosts that inject
 * nothing (LynxExplorer, Lynxtron, tests).
 *
 * **Live re-render without `useSyncExternalStore`.** `ThemeProvider` mounts at
 * the very root of the router tree (see `router.tsx`), so every rendered page
 * sits underneath it. `useSyncExternalStore`-based subscriptions (zustand,
 * `useInfiniteQuery`) are documented (`docs/project/progress.md`) to crash with
 * `isListHolder` in the ReactLynx Vitest render tree during the initial
 * dual-thread lifecycle flush, and every affected page needed a store mock to
 * work around it. Putting that pattern at the tree root would force every
 * existing render test to add a theme-store mock. Instead this module keeps a
 * plain listener `Set` + `useState`/`useEffect` in `ThemeProvider` — ordinary
 * React state, no `useSyncExternalStore`, so no test needs to know it exists.
 */
import { getSongloftStorage } from '../../core/storage/index.js'
import type { SongloftStorage } from '../../core/storage/types.js'
import {
  getSystemAppearance,
  subscribeSystemAppearance,
} from '../../native/system-appearance.js'

/** prefs key persisting the user's theme choice. */
export const PREF_THEME = 'app_theme'

export type ResolvedTheme = 'light' | 'dark'

/**
 * User-selectable theme options. `'system'` means "follow the host OS"; storing
 * it removes the pref, so the host signal (and any future host that starts
 * providing one) wins on the next launch (mirrors `AppLanguage` in `i18n/index.ts`).
 */
export type AppTheme = 'system' | ResolvedTheme
export const APP_THEME_OPTIONS: readonly AppTheme[] = ['system', 'light', 'dark']

/** Fallback for `'system'` on hosts that report no dark-mode signal at all. */
export const DEFAULT_RESOLVED_THEME: ResolvedTheme = 'light'

/** True when `value` is one of the concrete resolved themes. */
export function isResolvedTheme(value: unknown): value is ResolvedTheme {
  return value === 'light' || value === 'dark'
}

/**
 * Coerce an arbitrary persisted value into an {@link AppTheme}. A stored
 * `'light'`/`'dark'` → itself; anything else (null / unknown / '') → `'system'`.
 * Mirrors `coerceAppLanguage`'s never-throw-just-default rule (AGENTS §2).
 */
export function coerceAppTheme(raw: string | null | undefined): AppTheme {
  if (isResolvedTheme(raw)) return raw
  return 'system'
}

/**
 * Resolve an {@link AppTheme} to the concrete theme actually rendered.
 * `'system'` asks the host; {@link DEFAULT_RESOLVED_THEME} covers hosts that
 * report nothing.
 */
export function resolveTheme(app: AppTheme): ResolvedTheme {
  if (app !== 'system') return app
  return getSystemAppearance().theme ?? DEFAULT_RESOLVED_THEME
}

let current: AppTheme = 'system'
const listeners = new Set<() => void>()
let followingSystem = false

/** The live (module-scoped) theme choice. */
export function getAppTheme(): AppTheme {
  return current
}

/** Subscribe to live theme changes; returns an unsubscribe function. */
export function subscribeAppTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setLiveTheme(next: AppTheme): void {
  if (current === next) return
  current = next
  listeners.forEach((listener) => listener())
}

/**
 * Start re-notifying subscribers when the *host* theme flips while the user's
 * choice is `'system'`. Idempotent; a no-op on hosts with no signal.
 *
 * The choice itself does not change here — `getAppTheme()` still returns
 * `'system'`. That is why `ThemeProvider` holds the **resolved** theme in state:
 * re-notifying with an unchanged `'system'` would make React bail out of the
 * re-render and the flip would be invisible.
 */
function followSystemAppearance(): void {
  if (followingSystem) return
  followingSystem = true
  subscribeSystemAppearance(() => {
    if (current !== 'system') return
    listeners.forEach((listener) => listener())
  })
}

async function tryReadPref(
  storage: SongloftStorage,
  key: string,
): Promise<string | null> {
  try {
    return await storage.prefs.get(key)
  } catch {
    return null
  }
}

/** Read the persisted theme choice (best-effort; defaults to `'system'`). */
export async function readSavedTheme(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<AppTheme> {
  return coerceAppTheme(await tryReadPref(storage, PREF_THEME))
}

/**
 * One-time startup: read the persisted theme and apply it live, and start
 * following host theme changes. Best-effort — a rejecting prefs stub falls back
 * to `'system'` (i.e. no visual change from the module's initial state).
 */
export async function applySavedTheme(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<AppTheme> {
  followSystemAppearance()
  const saved = await readSavedTheme(storage)
  setLiveTheme(saved)
  return saved
}

/**
 * Switch the theme AND persist the choice. `'system'` removes the pref (so the
 * host signal wins on the next launch); a concrete choice is stored.
 */
export async function changeAppTheme(
  app: AppTheme,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<AppTheme> {
  // Also covers picking "system" at runtime in a process that never ran startup.
  followSystemAppearance()
  setLiveTheme(app)
  try {
    if (app === 'system') await storage.prefs.remove(PREF_THEME)
    else await storage.prefs.set(PREF_THEME, app)
  } catch {
    // best-effort — persistence may be unavailable (native stub / memory).
  }
  return app
}
