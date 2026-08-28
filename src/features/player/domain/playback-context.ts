/**
 * Playback context — identifies *where the current queue was started from*.
 *
 * Ported from the Flutter `PlaybackContext`
 * (`lib/features/player/domain/playback_context.dart`). Two consumers:
 * play history (the backend buckets history per context, each bucket keeping its
 * own most-recent 50 songs — see `GET /api/v1/play-history`) and the
 * "now playing" highlight on playlist cards.
 *
 * A context is the `(type, key)` pair the backend expects:
 * - playlist → `{type: 'playlist', key: '3'}`
 * - facet dimension → `{type: 'artist', key: '周杰伦'}`
 *
 * The flat library list (keyword + type filters, freely combined) is **not** a
 * stable context — those call sites pass nothing, and nothing is recorded.
 */

/**
 * The seven facet dimensions the backend accepts as history contexts.
 *
 * This list lives here rather than being imported from `CategorySongsPage`:
 * that page's `CategoryField` mixes these with seven *source* fields
 * (local/remote/radio/folder/recent/favorites/random) which are not contexts,
 * and it exports neither. Owning the list here keeps one source of truth.
 */
export const PLAYBACK_FACET_TYPES = [
  'artist',
  'album',
  'genre',
  'year',
  'decade',
  'language',
  'style',
] as const

export type PlaybackFacetType = (typeof PLAYBACK_FACET_TYPES)[number]

export const PLAYBACK_CONTEXT_PLAYLIST = 'playlist'
export const PLAYBACK_CONTEXT_TAG = 'tag'

export type PlaybackContextType = typeof PLAYBACK_CONTEXT_PLAYLIST | typeof PLAYBACK_CONTEXT_TAG | PlaybackFacetType

export interface PlaybackContext {
  type: PlaybackContextType
  /** Playlist ID as a string, or the facet dimension's raw value. */
  key: string
}

export function isPlaybackFacetType(field: string): field is PlaybackFacetType {
  return (PLAYBACK_FACET_TYPES as readonly string[]).includes(field)
}

/**
 * Playlist context, or `undefined` when the ID is not usable.
 *
 * The guard is not paranoia: `PlaylistDetailPage` derives its ID as
 * `Number(params.id ?? 0) || 0`, so a missing route param yields `0` — and `0`
 * passes a `!= null` check. A `key: '0'` context would be recorded against a
 * playlist that does not exist.
 */
export function playlistContext(playlistId: number): PlaybackContext | undefined {
  if (!Number.isFinite(playlistId) || playlistId <= 0) return undefined
  return { type: PLAYBACK_CONTEXT_PLAYLIST, key: String(playlistId) }
}

/**
 * Facet context, or `undefined` when this field/value pair is not a context.
 *
 * Two rejections, both of which the backend would answer with 400
 * (`handlers/play_history.go` requires a non-empty `context_key`):
 * - source fields (`favorites`, `random`, …) are not history dimensions;
 * - an empty value — the "unknown artist" / "unknown genre" bucket legitimately
 *   has `value === ''`, and the page renders it as a localized placeholder.
 */
export function facetContext(field: string, value: string): PlaybackContext | undefined {
  if (!isPlaybackFacetType(field)) return undefined
  const key = value.trim()
  if (!key) return undefined
  return { type: field, key }
}

/**
 * The playlist ID this context refers to, or `undefined` for facet contexts.
 *
 * Must not leak `NaN`: `parseInt('周杰伦')` is `NaN`, and while `NaN === id` is
 * always false (so the "now playing" highlight would not misfire), the value
 * also reaches JS plugins as `source_playlist_id`.
 */
export function playlistIdOf(context: PlaybackContext | undefined): number | undefined {
  if (context?.type !== PLAYBACK_CONTEXT_PLAYLIST) return undefined
  const id = Number(context.key)
  return Number.isFinite(id) && id > 0 ? id : undefined
}

export function samePlaybackContext(
  a: PlaybackContext | undefined,
  b: PlaybackContext | undefined,
): boolean {
  if (a == null || b == null) return a == null && b == null
  return a.type === b.type && a.key === b.key
}
