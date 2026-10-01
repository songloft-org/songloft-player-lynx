/**
 * Wide-rail collapse: the 收起/展开 state of the shell's side navigation rail.
 *
 * Ported from the Flutter client's desktop sidebar (elastic#487): the rail
 * collapses to a glyph-only column, the choice is remembered, and — the part
 * that matters for the animation — **the content keeps its expanded geometry
 * while only the clip edge moves**. `ShellLayout.css` owns that half; this file
 * owns the state and its persistence.
 *
 * Persistence is the same best-effort shape as the other preference models
 * (`theme-model.ts`, `material-model.ts`): a module-level value plus a listener
 * set for `useSyncExternalStore`, read once during startup and written on
 * toggle. On a host whose storage is still the in-memory interim (see
 * `core/storage/index.ts`) the value simply does not survive a restart.
 */
import { getSongloftStorage } from '../../core/storage/index.js'
import type { SongloftStorage } from '../../core/storage/types.js'

/** prefs key; deliberately the same name the Flutter client persists under. */
export const PREF_RAIL_COLLAPSED = 'sidebar_collapsed'

let railCollapsed = false
const railCollapsedListeners = new Set<() => void>()

/** The live value. Expanded is the default — the rail must not hide itself. */
export function getRailCollapsed(): boolean {
  return railCollapsed
}

export function subscribeRailCollapsed(listener: () => void): () => void {
  railCollapsedListeners.add(listener)
  return () => railCollapsedListeners.delete(listener)
}

function setLive(next: boolean): void {
  if (railCollapsed === next) return
  railCollapsed = next
  railCollapsedListeners.forEach((l) => l())
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

/**
 * Reads the persisted value. Anything but the literal `'true'` (missing, a
 * legacy value, a rejecting native stub) reads as expanded — the default that
 * keeps the rail discoverable.
 */
export async function readRailCollapsed(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<boolean> {
  return (await tryReadPref(storage, PREF_RAIL_COLLAPSED)) === 'true'
}

/**
 * Persists the value. Best-effort by design: a device whose prefs stub rejects
 * still collapses in-session, it just forgets across restarts.
 */
export async function writeRailCollapsed(
  next: boolean,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<void> {
  try {
    await storage.prefs.set(PREF_RAIL_COLLAPSED, String(next))
  } catch {
    // In-session state already applied; nothing to report.
  }
}

/** Applies the saved value at startup (see `src/index.tsx`). */
export async function applySavedRailCollapsed(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<boolean> {
  const saved = await readRailCollapsed(storage)
  setLive(saved)
  return saved
}

/** Flips the rail and persists the new value. Returns the value applied. */
export function toggleRailCollapsed(
  storage: SongloftStorage = getSongloftStorage(),
): boolean {
  const next = !railCollapsed
  setLive(next)
  void writeRailCollapsed(next, storage)
  return next
}

/** Test seam: drop the module-level value between cases. */
export function resetRailCollapsedForTests(): void {
  railCollapsed = false
}
