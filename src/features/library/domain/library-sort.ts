/**
 * Sort options for the library's flat song lists.
 *
 * Every `field` must be a member of the backend's `songOrderWhitelist`
 * (`internal/database/filters.go:88`): a value outside the whitelist is
 * silently replaced with `added_at DESC` — exactly how the pre-refactor
 * `sort=random` "view" degenerated into a clone of "recent". The unit test
 * asserts membership so a future option can't reintroduce that bug.
 *
 * `defaultOrder` is the natural direction for each field. Clicking an
 * already-selected sort item flips the direction (asc↔desc); clicking a
 * different field uses its `defaultOrder`. Matches the Flutter behaviour
 * introduced in `9263dca`.
 */

export const LIBRARY_SORT_OPTIONS = [
  { id: 'added_at', field: 'added_at', defaultOrder: 'desc', labelKey: 'library.sortRecent' },
  { id: 'file_modified_at', field: 'file_modified_at', defaultOrder: 'desc', labelKey: 'library.sortFileTime' },
  { id: 'title', field: 'title', defaultOrder: 'asc', labelKey: 'library.sortTitle' },
  { id: 'artist', field: 'artist', defaultOrder: 'asc', labelKey: 'library.sortArtist' },
  { id: 'album', field: 'album', defaultOrder: 'asc', labelKey: 'library.sortAlbum' },
  { id: 'year', field: 'year', defaultOrder: 'desc', labelKey: 'library.sortYear' },
  { id: 'duration', field: 'duration', defaultOrder: 'asc', labelKey: 'library.sortDuration' },
] as const

export type LibrarySortId = (typeof LIBRARY_SORT_OPTIONS)[number]['id']
export type SortOrder = 'asc' | 'desc'

/** Sort options grouped for menu display. */
export const LIBRARY_SORT_GROUPS: { labelKey: string; ids: LibrarySortId[] }[] = [
  { labelKey: 'library.sortGroupTime', ids: ['added_at', 'file_modified_at'] },
  { labelKey: 'library.sortGroupText', ids: ['title', 'artist', 'album'] },
  { labelKey: 'library.sortGroupOther', ids: ['year', 'duration'] },
]

export const DEFAULT_LIBRARY_SORT_ID: LibrarySortId = 'added_at'

/** Look up an option; unknown ids fall back to the default (never throws). */
export function librarySortOption(id: LibrarySortId) {
  return LIBRARY_SORT_OPTIONS.find((o) => o.id === id) ?? LIBRARY_SORT_OPTIONS[0]!
}

/** The default sort direction for a given field. */
export function defaultLibrarySortOrder(id: LibrarySortId): SortOrder {
  return librarySortOption(id).defaultOrder as SortOrder
}

/** The `/songs` query params (`sort` + `order`) for a sort option. */
export function librarySortFilters(id: LibrarySortId, order?: SortOrder): { sort: string; order: string } {
  const option = librarySortOption(id)
  return { sort: option.field, order: order ?? option.defaultOrder }
}

/** Coerce a persisted/URL value to a valid sort id; anything else → default. */
export function coerceLibrarySortId(raw: string | null | undefined): LibrarySortId {
  if (raw != null && LIBRARY_SORT_OPTIONS.some((o) => o.id === raw)) {
    return raw as LibrarySortId
  }
  return DEFAULT_LIBRARY_SORT_ID
}

/** Coerce a persisted order value to 'asc' | 'desc'. */
export function coerceSortOrder(raw: string | null | undefined): SortOrder | undefined {
  if (raw === 'asc' || raw === 'desc') return raw
  return undefined
}
