/**
 * Theme model (batch 13) — light/dark/system selection, following the same
 * shape as the language module (`src/i18n/index.ts`): a `'system'` option that
 * currently has no reliable host signal to follow, so it resolves to a fixed
 * default; a concrete choice is persisted and applied immediately.
 *
 * **Live re-render without `useSyncExternalStore`.** `ThemeProvider` mounts at
 * the very root of the router tree (see `router.tsx`), so every rendered page
 * sits underneath it. `useSyncExternalStore`-based subscriptions (zustand,
 * `useInfiniteQuery`) are documented (`docs/PROGRESS.md`) to crash with
 * `isListHolder` in the ReactLynx Vitest render tree during the initial
 * dual-thread lifecycle flush, and every affected page needed a store mock to
 * work around it. Putting that pattern at the tree root would force every
 * existing render test to add a theme-store mock. Instead this module keeps a
 * plain listener `Set` + `useState`/`useEffect` in `ThemeProvider` — ordinary
 * React state, no `useSyncExternalStore`, so no test needs to know it exists.
 */
import { getSongloftStorage } from '../../core/storage/index.js'
import type { SongloftStorage } from '../../core/storage/types.js'

/** prefs key persisting the user's theme choice. */
export const PREF_THEME = 'app_theme'

export type ResolvedTheme = 'light' | 'dark'

/**
 * User-selectable theme options. `'system'` means "follow the system / no
 * explicit choice" — with no reliable host dark-mode API on Lynx yet it
 * resolves to {@link DEFAULT_RESOLVED_THEME}; persisting it removes the pref so
 * future host detection can take over (mirrors `AppLanguage` in `i18n/index.ts`).
 */
export type AppTheme = 'system' | ResolvedTheme
export const APP_THEME_OPTIONS: readonly AppTheme[] = ['system', 'light', 'dark']

/** Fallback for `'system'` until a real host dark-mode signal exists. */
export const DEFAULT_RESOLVED_THEME: ResolvedTheme = 'dark'

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

/** Resolve an {@link AppTheme} to the concrete theme actually rendered. */
export function resolveTheme(app: AppTheme): ResolvedTheme {
  return app === 'system' ? DEFAULT_RESOLVED_THEME : app
}

let current: AppTheme = 'system'
const listeners = new Set<() => void>()

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
 * One-time startup: read the persisted theme and apply it live. Best-effort —
 * a rejecting prefs stub falls back to `'system'` (i.e. no visual change from
 * the module's initial state).
 */
export async function applySavedTheme(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<AppTheme> {
  const saved = await readSavedTheme(storage)
  setLiveTheme(saved)
  return saved
}

/**
 * Switch the theme AND persist the choice. `'system'` removes the pref (so
 * future host detection wins); a concrete choice is stored.
 */
export async function changeAppTheme(
  app: AppTheme,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<AppTheme> {
  setLiveTheme(app)
  try {
    if (app === 'system') await storage.prefs.remove(PREF_THEME)
    else await storage.prefs.set(PREF_THEME, app)
  } catch {
    // best-effort — persistence may be unavailable (native stub / memory).
  }
  return app
}
