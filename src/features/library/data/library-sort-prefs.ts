import { getSongloftStorage } from '../../../core/storage/index.js'
import type { SongloftStorage } from '../../../core/storage/types.js'
import {
  coerceLibrarySortId,
  DEFAULT_LIBRARY_SORT_ID,
  type LibrarySortId,
} from '../domain/library-sort.js'

/**
 * Persistence for the library song-list sort order. Same best-effort pattern
 * as `features/settings/data/settings-prefs.ts`: the native storage module is
 * present on device (SharedPreferences / UserDefaults), so the choice survives
 * restarts; in realms without it the in-memory fallback keeps session state.
 */

/** prefs key for the library sort option id. */
export const PREF_LIBRARY_SORT = 'library_sort'

export async function readLibrarySort(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<LibrarySortId> {
  try {
    return coerceLibrarySortId(await storage.prefs.get(PREF_LIBRARY_SORT))
  } catch {
    return DEFAULT_LIBRARY_SORT_ID
  }
}

export async function writeLibrarySort(
  id: LibrarySortId,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<void> {
  try {
    await storage.prefs.set(PREF_LIBRARY_SORT, id)
  } catch {
    // ignore — persistence is best-effort; in-memory state still updates.
  }
}
