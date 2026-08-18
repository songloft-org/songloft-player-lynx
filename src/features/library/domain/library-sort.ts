/**
 * Sort options for the library's flat song lists.
 *
 * Every `field` must be a member of the backend's `songOrderWhitelist`
 * (`internal/database/filters.go:88`): a value outside the whitelist is
 * silently replaced with `added_at DESC` — exactly how the pre-refactor
 * `sort=random` "view" degenerated into a clone of "recent". The unit test
 * asserts membership so a future option can't reintroduce that bug.
 *
 * Directions are bound to the fields (Flutter parity): no separate asc/desc
 * toggle — `added_at`/`file_modified_at`/`year` read descending, text/duration
 * fields ascending.
 */

export const LIBRARY_SORT_OPTIONS = [
  { id: 'added_at', field: 'added_at', order: 'desc', labelKey: 'library.sortRecent' },
  { id: 'file_modified_at', field: 'file_modified_at', order: 'desc', labelKey: 'library.sortFileTime' },
  { id: 'title', field: 'title', order: 'asc', labelKey: 'library.sortTitle' },
  { id: 'artist', field: 'artist', order: 'asc', labelKey: 'library.sortArtist' },
  { id: 'album', field: 'album', order: 'asc', labelKey: 'library.sortAlbum' },
  { id: 'year', field: 'year', order: 'desc', labelKey: 'library.sortYear' },
  { id: 'duration', field: 'duration', order: 'asc', labelKey: 'library.sortDuration' },
] as const

export type LibrarySortId = (typeof LIBRARY_SORT_OPTIONS)[number]['id']

export const DEFAULT_LIBRARY_SORT_ID: LibrarySortId = 'added_at'

/** Look up an option; unknown ids fall back to the default (never throws). */
export function librarySortOption(id: LibrarySortId) {
  return LIBRARY_SORT_OPTIONS.find((o) => o.id === id) ?? LIBRARY_SORT_OPTIONS[0]!
}

/** The `/songs` query params (`sort` + `order`) for a sort option. */
export function librarySortFilters(id: LibrarySortId): { sort: string; order: string } {
  const option = librarySortOption(id)
  return { sort: option.field, order: option.order }
}

/** Coerce a persisted/URL value to a valid sort id; anything else → default. */
export function coerceLibrarySortId(raw: string | null | undefined): LibrarySortId {
  if (raw != null && LIBRARY_SORT_OPTIONS.some((o) => o.id === raw)) {
    return raw as LibrarySortId
  }
  return DEFAULT_LIBRARY_SORT_ID
}
