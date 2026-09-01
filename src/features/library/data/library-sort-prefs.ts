import { getSongloftStorage } from '../../../core/storage/index.js'
import type { SongloftStorage } from '../../../core/storage/types.js'
import {
  coerceLibrarySortId,
  coerceSortOrder,
  defaultLibrarySortOrder,
  DEFAULT_LIBRARY_SORT_ID,
  type LibrarySortId,
  type SortOrder,
} from '../domain/library-sort.js'

/**
 * Persistence for the library song-list sort order. Same best-effort pattern
 * as `features/settings/data/settings-prefs.ts`: the native storage module is
 * present on device (SharedPreferences / UserDefaults), so the choice survives
 * restarts; in realms without it the in-memory fallback keeps session state.
 */

/** prefs key for the library sort option id. */
export const PREF_LIBRARY_SORT = 'library_sort'
/** prefs key for the library sort direction. */
export const PREF_LIBRARY_SORT_ORDER = 'library_sort_order'

export async function readLibrarySort(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<{ id: LibrarySortId; order: SortOrder }> {
  try {
    const id = coerceLibrarySortId(await storage.prefs.get(PREF_LIBRARY_SORT))
    const order = coerceSortOrder(await storage.prefs.get(PREF_LIBRARY_SORT_ORDER))
      ?? defaultLibrarySortOrder(id)
    return { id, order }
  } catch {
    return { id: DEFAULT_LIBRARY_SORT_ID, order: defaultLibrarySortOrder(DEFAULT_LIBRARY_SORT_ID) }
  }
}

export async function writeLibrarySort(
  id: LibrarySortId,
  order: SortOrder,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<void> {
  try {
    await storage.prefs.set(PREF_LIBRARY_SORT, id)
    await storage.prefs.set(PREF_LIBRARY_SORT_ORDER, order)
  } catch {
    // ignore — persistence is best-effort; in-memory state still updates.
  }
}
