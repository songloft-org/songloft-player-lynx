import { getSongloftStorage } from '../../core/storage/index.js'
import type { SongloftStorage } from '../../core/storage/types.js'

/**
 * Increase Contrast model — the **app-level** accessibility toggle that puts
 * `.increase-contrast` on the theme root.
 *
 * `tokens.css` has shipped `.theme-root.theme-<name>.increase-contrast` since
 * the Apple Design System migration: Apple's accessible accent, the accessible
 * grey ladder and `--separator: var(--opaque-separator)`, per theme. Nothing
 * ever added the class — the stylesheet's own comment said the activation
 * channel "is not wired yet" because the plan at the time was a native
 * `SystemAppearance` field (same shape as `reduce-motion-model.ts`).
 *
 * This module retains the local choice. `surface-policy.ts` combines it with
 * the host's optional Increase Contrast flag using OR; switching the app choice
 * off cannot override an enabled OS setting. Theme-pack mapping applies the same
 * effective flag to inline palette values.
 *
 * Shape mirrors `font-scale-model.ts`: a persisted choice applied live, with a
 * plain listener `Set` + `useState` in `ThemeProvider` rather than
 * `useSyncExternalStore` (see `theme-model.ts`'s note on the ReactLynx Vitest
 * `isListHolder` crash — this model sits at the tree root, so every render test
 * would otherwise need a store mock).
 *
 * **Default OFF**, and off *removes* the pref rather than storing `'false'` —
 * the same convention as `'default'` for font scale and `'system'` for theme.
 */

/** prefs key persisting the toggle. Absent means off (the default). */
export const PREF_INCREASE_CONTRAST = 'increase_contrast'

/**
 * Coerce an arbitrary persisted value into the flag. Only a stored `'true'` is
 * on; anything else (null / unknown / empty / `'false'`) is off. Never throws —
 * same rule as `coerceFontScale` (AGENTS §2).
 */
export function coerceIncreaseContrast(raw: string | null | undefined): boolean {
  return raw === 'true'
}

let current = false
const listeners = new Set<() => void>()

/** Whether the increase-contrast class should be on the theme root. */
export function getIncreaseContrast(): boolean {
  return current
}

/** Subscribe to live toggle changes; returns an unsubscribe function. */
export function subscribeIncreaseContrast(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setLive(next: boolean): void {
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

/** Read the persisted flag (best-effort; defaults to off). */
export async function readSavedIncreaseContrast(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<boolean> {
  return coerceIncreaseContrast(await tryReadPref(storage, PREF_INCREASE_CONTRAST))
}

/**
 * One-time startup: read the persisted flag and apply it live. Best-effort — a
 * rejecting prefs stub leaves the default (off), i.e. no visual change.
 */
export async function applySavedIncreaseContrast(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<boolean> {
  const saved = await readSavedIncreaseContrast(storage)
  setLive(saved)
  return saved
}

/**
 * Flip the toggle AND persist it. Turning it off removes the pref, so the
 * default and "never touched it" are the same state on the next launch.
 */
export async function changeIncreaseContrast(
  on: boolean,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<boolean> {
  setLive(on)
  try {
    if (on) await storage.prefs.set(PREF_INCREASE_CONTRAST, 'true')
    else await storage.prefs.remove(PREF_INCREASE_CONTRAST)
  } catch {
    // best-effort — persistence may be unavailable (native stub / memory).
  }
  return on
}
