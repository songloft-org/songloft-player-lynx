import {
  isLibraryViewKey,
  LIBRARY_VIEW_KEYS,
  type LibraryBrowseConfig,
  type LibraryBrowseView,
  type LibraryViewKey,
} from '../../../models/library-browse.js'
import type { IconName } from '../../../shared/ui/icons.js'

/**
 * The library's 14-view browse model — the single source of truth for what a
 * "view" is (Lynx counterpart of the Flutter `library_view_switcher.dart`).
 *
 * The wire contract (which keys exist, `{key, visible}` shape, order = array
 * position) lives in `models/library-browse.ts`; this module is the UI-side
 * knowledge on top: which group each view belongs to, its label/icon, how to
 * bucket an ordered view list into groups, and how the URL's `?view=` value is
 * resolved against the user's config.
 */

/** The three view groups, in the backend's default order. */
export type LibraryViewGroup = 'songs' | 'facets' | 'playlists'

export const LIBRARY_VIEW_GROUP: Record<LibraryViewKey, LibraryViewGroup> = {
  all: 'songs',
  local: 'songs',
  remote: 'songs',
  radio: 'songs',
  artist: 'facets',
  album: 'facets',
  genre: 'facets',
  year: 'facets',
  decade: 'facets',
  language: 'facets',
  style: 'facets',
  playlist: 'playlists',
  playlist_normal: 'playlists',
  playlist_radio: 'playlists',
}

/** i18n keys, resolved through `t()` at render time (never store the text). */
export const LIBRARY_VIEW_LABEL_KEY: Record<LibraryViewKey, string> = {
  all: 'library.viewAll',
  local: 'library.viewLocal',
  remote: 'library.viewRemote',
  radio: 'library.viewRadio',
  artist: 'library.viewArtist',
  album: 'library.viewAlbum',
  genre: 'library.viewGenre',
  year: 'library.viewYear',
  decade: 'library.viewDecade',
  language: 'library.viewLanguage',
  style: 'library.viewStyle',
  playlist: 'library.viewPlaylistAll',
  playlist_normal: 'library.viewPlaylistNormal',
  playlist_radio: 'library.viewPlaylistRadio',
}

export const LIBRARY_VIEW_ICON: Record<LibraryViewKey, IconName> = {
  all: 'library',
  local: 'folder',
  remote: 'cloud',
  radio: 'radio',
  artist: 'person',
  album: 'album',
  genre: 'tag',
  year: 'calendar',
  decade: 'calendar',
  language: 'globe',
  style: 'brush',
  playlist: 'queue',
  playlist_normal: 'music',
  playlist_radio: 'radio',
}

export const LIBRARY_VIEW_GROUP_LABEL_KEY: Record<LibraryViewGroup, string> = {
  songs: 'library.viewGroupSongs',
  facets: 'library.viewGroupFacets',
  playlists: 'library.viewGroupPlaylists',
}

/** Flat song lists (`all` / `local` / `remote` / `radio`). */
export function isFlatLibraryView(key: LibraryViewKey): boolean {
  return LIBRARY_VIEW_GROUP[key] === 'songs'
}

/** Playlist card lists (`playlist` / `playlist_normal` / `playlist_radio`). */
export function isPlaylistLibraryView(key: LibraryViewKey): boolean {
  return LIBRARY_VIEW_GROUP[key] === 'playlists'
}

/** A run of same-group keys, in display order. */
export interface LibraryViewGroupBucket {
  group: LibraryViewGroup
  keys: LibraryViewKey[]
}

/**
 * Bucket `keys` by group. **Group order is implicit**: the order in which each
 * group first appears in `keys` (Flutter `groupLibraryViewKeys`). A group is
 * one bucket even if the input is non-contiguous (the backend's normalize
 * appends missing keys at the end, which can interleave groups) — members are
 * collected into their group's bucket, so the display is always clean group
 * runs. Never render the raw config array anywhere else: this is the only path
 * from stored order to display order.
 */
export function groupLibraryViewKeys(keys: LibraryViewKey[]): LibraryViewGroupBucket[] {
  const order: LibraryViewGroup[] = []
  const buckets = new Map<LibraryViewGroup, LibraryViewKey[]>()
  for (const key of keys) {
    const group = LIBRARY_VIEW_GROUP[key]
    let bucket = buckets.get(group)
    if (!bucket) {
      bucket = []
      buckets.set(group, bucket)
      order.push(group)
    }
    bucket.push(key)
  }
  return order.map((group) => ({ group, keys: buckets.get(group)! }))
}

/**
 * Rebuild a contiguous-by-group view list from `views`, preserving each
 * group's internal order and the groups' first-appearance order. Run this
 * before saving an edited config — otherwise a list like
 * `[all, artist, local]` would be bucketed into *four* runs (songs/facets/
 * songs) and the group-move UI would misbehave.
 */
export function groupedFlatten(views: LibraryBrowseView[]): LibraryBrowseView[] {
  const buckets = new Map<LibraryViewGroup, LibraryBrowseView[]>()
  const order: LibraryViewGroup[] = []
  for (const view of views) {
    const group = LIBRARY_VIEW_GROUP[view.key]
    let bucket = buckets.get(group)
    if (!bucket) {
      bucket = []
      buckets.set(group, bucket)
      order.push(group)
    }
    bucket.push(view)
  }
  return order.flatMap((group) => buckets.get(group)!)
}

/**
 * Move a whole group one slot earlier (`delta = -1`) or later (`delta = +1`).
 * Out-of-range moves are no-ops (the caller disables those buttons anyway).
 */
export function moveGroup(
  views: LibraryBrowseView[],
  group: LibraryViewGroup,
  delta: -1 | 1,
): LibraryBrowseView[] {
  const buckets = new Map<LibraryViewGroup, LibraryBrowseView[]>()
  const order: LibraryViewGroup[] = []
  for (const view of views) {
    const g = LIBRARY_VIEW_GROUP[view.key]
    let bucket = buckets.get(g)
    if (!bucket) {
      bucket = []
      buckets.set(g, bucket)
      order.push(g)
    }
    bucket.push(view)
  }
  const index = order.indexOf(group)
  const target = index + delta
  if (index < 0 || target < 0 || target >= order.length) return views
  const nextOrder = [...order]
  nextOrder[index] = order[target]!
  nextOrder[target] = group
  return nextOrder.flatMap((g) => buckets.get(g)!)
}

/**
 * Replace one group's internal order with `orderedKeys` (the final order a
 * `SortableRoot` `onSortEnd` reports). Other groups are untouched. Keys that
 * don't belong to `group` — or that the group doesn't contain — are ignored,
 * so a stale drag result can never drop a view.
 */
export function setGroupOrder(
  views: LibraryBrowseView[],
  group: LibraryViewGroup,
  orderedKeys: LibraryViewKey[],
): LibraryBrowseView[] {
  const byKey = new Map(views.map((v) => [v.key, v]))
  const groupKeys = new Set(
    views.filter((v) => LIBRARY_VIEW_GROUP[v.key] === group).map((v) => v.key),
  )
  const reordered: LibraryBrowseView[] = []
  for (const key of orderedKeys) {
    if (!groupKeys.has(key)) continue
    const view = byKey.get(key)
    if (view) {
      reordered.push(view)
      groupKeys.delete(key)
    }
  }
  // Keep anything the ordered list forgot (defensive; shouldn't happen).
  for (const view of views) {
    if (LIBRARY_VIEW_GROUP[view.key] === group && groupKeys.has(view.key)) {
      reordered.push(view)
    }
  }
  const result: LibraryBrowseView[] = []
  let inserted = false
  for (const view of views) {
    if (LIBRARY_VIEW_GROUP[view.key] === group) {
      if (!inserted) {
        result.push(...reordered)
        inserted = true
      }
      continue
    }
    result.push(view)
  }
  if (!inserted) result.push(...reordered)
  return result
}

/** The `type` query param for a flat view; `all` sends none. */
export function flatViewType(key: LibraryViewKey): 'local' | 'remote' | 'radio' | undefined {
  switch (key) {
    case 'local': return 'local'
    case 'remote': return 'remote'
    case 'radio': return 'radio'
    default: return undefined
  }
}

/** The playlist `type` filter for a playlist view; `playlist` sends none. */
export function playlistViewType(key: LibraryViewKey): 'normal' | 'radio' | undefined {
  switch (key) {
    case 'playlist_normal': return 'normal'
    case 'playlist_radio': return 'radio'
    default: return undefined
  }
}

/** The `/songs/facets` field for a facet view; `undefined` for other groups. */
export function facetViewField(key: LibraryViewKey): LibraryViewKey | undefined {
  return LIBRARY_VIEW_GROUP[key] === 'facets' ? key : undefined
}

/** What the library page shows for a requested `?view=` value + config. */
export interface ResolvedLibraryView {
  /** The view to render; `undefined` only when every view is hidden. */
  selected?: LibraryViewKey
  /** Keys for the switcher, in display order (group runs, config order). */
  displayKeys: LibraryViewKey[]
}

/**
 * Resolve the URL's `?view=` against the user's config.
 *
 * - no/invalid request → first visible view;
 * - visible request → that view;
 * - **hidden but valid request → still selected** (deep links, e.g. Home's
 *   "View all", must land on their view), temporarily slotted back into
 *   `displayKeys` at its config position — Flutter's `_forcedViewKey`;
 * - everything hidden → no selection; the page renders the "keep at least one
 *   view visible" empty state.
 */
export function resolveLibraryView(
  requested: string | undefined,
  config: LibraryBrowseConfig,
): ResolvedLibraryView {
  const visibleKeys = config.views.filter((v) => v.visible).map((v) => v.key)
  const displayKeys = [...visibleKeys]

  const wantsValid = requested != null && requested !== '' && isLibraryViewKey(requested)
  if (!wantsValid) {
    return { selected: visibleKeys[0], displayKeys }
  }

  const key = requested as LibraryViewKey
  if (!displayKeys.includes(key)) {
    // Slot the forced view back in at its config position: before the first
    // displayed key that sits after it in the stored order.
    const configIndex = config.views.findIndex((v) => v.key === key)
    const insertAt = displayKeys.findIndex((k) => {
      const i = config.views.findIndex((v) => v.key === k)
      return i > configIndex
    })
    if (insertAt < 0) displayKeys.push(key)
    else displayKeys.splice(insertAt, 0, key)
  }
  return { selected: key, displayKeys }
}

/**
 * Old four-tab values → the 14-view keys they map onto.
 *
 * `radio` is deliberately ABSENT: it collides with the new songs-group `radio`
 * key (radio stations as a flat list). New keys win the passthrough below —
 * an old `?view=radio` deep link therefore lands on radio *songs* rather than
 * the old radio *playlists* tab. That one-time drift is the price of keeping
 * the in-app pill tap on `?view=radio` working; mapping legacy-first would
 * hijack every navigation to the new radio view.
 */
const LEGACY_VIEW_MAP: Record<string, LibraryViewKey> = {
  songs: 'all',
  facets: 'artist',
  playlists: 'playlist_normal',
}

/**
 * Normalize `/library` search params: accept any current view key, migrate the
 * pre-refactor `view` values (and the dropped `field` param), drop the rest.
 * Kept optional-valued so a bare `navigate({ to: '/library' })` stays valid.
 */
export function migrateLibrarySearch(
  search: Record<string, unknown>,
): { view?: LibraryViewKey } {
  // Legacy deep links carried the facet dimension in `field`.
  const field = search.field
  if (typeof field === 'string' && isLibraryViewKey(field)) {
    return { view: field }
  }
  const view = search.view
  if (typeof view !== 'string' || view === '') return {}
  if (isLibraryViewKey(view)) return { view }
  const migrated = LEGACY_VIEW_MAP[view]
  return migrated ? { view: migrated } : {}
}

/** Re-export so consumers only import from this module. */
export { LIBRARY_VIEW_KEYS, isLibraryViewKey }
export type { LibraryBrowseConfig, LibraryBrowseView, LibraryViewKey }
