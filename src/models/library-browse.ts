import { z } from 'zod'

import { makeParsers } from './_shared.js'

/**
 * Library browse config — `GET/PUT /api/v1/settings/library-browse`
 * (backend `internal/handlers/library_browse_setting.go`).
 *
 * Wire contract, verified against the backend handler rather than the old
 * Lynx port (which spoke `{id, visible, order}` and got a silent 400 on every
 * PUT): each view is `{ key, visible }`; **order is the array position**, not
 * a field. The backend validates keys against its 14-key whitelist and echoes
 * a normalized, always-complete 14-entry config.
 */

/**
 * The 14 legal view keys in the backend's default order
 * (`libraryViewKeys`, library_browse_setting.go:31) — three contiguous groups:
 *   - songs: flat song lists filtered by `type` (`all` sends no type);
 *   - facets: `/songs/facets` category dimensions, drilled into song lists;
 *   - playlists: playlist card lists.
 */
export const LIBRARY_VIEW_KEYS = [
  'all', 'local', 'remote', 'radio',
  'folder', 'artist', 'album', 'genre', 'year', 'decade', 'language', 'style', 'tag',
  'playlist', 'playlist_normal', 'playlist_radio',
] as const

export type LibraryViewKey = (typeof LIBRARY_VIEW_KEYS)[number]

/** One view entry: which view, and whether the library page shows it. */
export interface LibraryBrowseView {
  key: LibraryViewKey
  visible: boolean
}

/** The full config; `views` order is the user's chosen display order. */
export interface LibraryBrowseConfig {
  views: LibraryBrowseView[]
}

const libraryViewKeySet: ReadonlySet<string> = new Set(LIBRARY_VIEW_KEYS)

export function isLibraryViewKey(value: string): value is LibraryViewKey {
  return libraryViewKeySet.has(value)
}

/** Default config: all 14 views visible, backend default order. */
export const DEFAULT_LIBRARY_BROWSE_CONFIG: LibraryBrowseConfig = {
  views: LIBRARY_VIEW_KEYS.map((key) => ({ key, visible: true })),
}

const libraryBrowseViewSchema = z
  .preprocess(
    (v) => (v !== null && typeof v === 'object' ? v : {}),
    z.object({
      key: z.string().catch(''),
      // The backend always sends a boolean; missing → visible (Flutter parity).
      visible: z.boolean().catch(true),
    }),
  )

/**
 * Parse a `/settings/library-browse` payload. Never throws (AGENTS §2):
 * unknown/duplicate keys are dropped and missing keys appended at the end
 * (visible, backend default order) — the same normalization the backend's
 * `normalizeLibraryBrowse` applies, kept client-side too so an older backend
 * that returns a partial list still yields a complete, renderable config.
 */
export const libraryBrowseConfigSchema = z
  .preprocess(
    (v) => (v !== null && typeof v === 'object' ? v : {}),
    z.object({
      views: z.array(libraryBrowseViewSchema).catch([]),
    }),
  )
  .transform(({ views }): LibraryBrowseConfig => {
    const seen = new Set<LibraryViewKey>()
    const out: LibraryBrowseView[] = []
    for (const v of views) {
      if (!isLibraryViewKey(v.key) || seen.has(v.key)) continue
      seen.add(v.key)
      out.push({ key: v.key, visible: v.visible })
    }
    for (const key of LIBRARY_VIEW_KEYS) {
      if (!seen.has(key)) out.push({ key, visible: true })
    }
    return { views: out }
  })

const libraryBrowseConfigParsers = makeParsers(libraryBrowseConfigSchema)
export const parseLibraryBrowseConfig = libraryBrowseConfigParsers.parse
export const safeParseLibraryBrowseConfig = libraryBrowseConfigParsers.safeParse
