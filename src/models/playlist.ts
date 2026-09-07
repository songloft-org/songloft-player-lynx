import { z } from 'zod'

import { makeParsers, nowIso } from './_shared.js'

/**
 * Playlist model. snake_case wire → camelCase domain. The `labels` array
 * carries `built_in` / `auto_created` / `hidden` markers; the derived booleans
 * `isBuiltIn` / `isAutoCreated` / `isHidden` (Flutter getters) are computed at
 * parse time. Equality is by `id` (`playlistEquals`).
 *
 * Pinning is **not** a label — it is its own `pinned_at` timestamp, because the
 * backend orders by it (pinned first, most recently pinned before the rest) and
 * a label carries no order. `isPinned` is derived from its presence.
 */
export const playlistSchema = z
  .object({
    // Mirror the Flutter `_intFromJson`/`_labelsFromJson` tolerance: the backend
    // sends nulls (e.g. `labels`/`song_count` null for empty/user playlists) and
    // occasionally stringified ints. `.default()` only covers `undefined` (NOT
    // `null`), so use `.catch()` + coercion to never throw on a live payload.
    id: z.coerce.number().catch(0),
    type: z.enum(['normal', 'radio']).catch('normal'),
    name: z.string().catch(''),
    description: z.string().nullish().catch(undefined),
    cover_url: z.string().nullish().catch(undefined),
    labels: z.array(z.string()).catch([]),
    song_count: z.coerce.number().catch(0),
    // Number of network songs (`songs.type = 'remote'`) the playlist holds; > 0
    // means it is a "network playlist". Only the *list* endpoint fills this —
    // `GET /playlists/{id}` always sends 0 (songloft-org/songloft#445).
    remote_count: z.coerce.number().catch(0),
    sort_by: z.string().catch('position'),
    sort_order: z.string().catch('asc'),
    created_at: z.string().nullish().catch(undefined),
    updated_at: z.string().nullish().catch(undefined),
    // NOT given the `?? nowIso()` fallback the two timestamps above get: absent
    // `pinned_at` means "not pinned", and defaulting it to now would read as
    // "pinned a moment ago" — every playlist would claim to be pinned, and the
    // backend's pinned-first ordering would silently disagree with the UI.
    pinned_at: z.string().nullish().catch(undefined),
  })
  .transform((p) => ({
    id: p.id,
    type: p.type,
    name: p.name,
    description: p.description ?? undefined,
    coverUrl: p.cover_url ?? undefined,
    labels: p.labels,
    songCount: p.song_count,
    remoteCount: p.remote_count,
    sortBy: p.sort_by,
    sortOrder: p.sort_order,
    createdAt: p.created_at ?? nowIso(),
    updatedAt: p.updated_at ?? nowIso(),
    pinnedAt: p.pinned_at ?? undefined,
    isPinned: p.pinned_at != null,
    // "Holds network songs", not "is entirely network" — matches the backend's
    // EXISTS-based `song_source` filter, so a mixed playlist is true here too.
    hasRemoteSongs: p.remote_count > 0,
    isBuiltIn: p.labels.includes('built_in'),
    isAutoCreated: p.labels.includes('auto_created'),
    isHidden: p.labels.includes('hidden'),
  }))

export type Playlist = z.output<typeof playlistSchema>

export interface PlaylistJson {
  id: number
  type: Playlist['type']
  name: string
  description: string | null
  cover_url: string | null
  labels: string[]
  song_count: number
  remote_count: number
  sort_by: string
  sort_order: string
  created_at: string
  updated_at: string
  pinned_at: string | null
}

export function playlistToJson(playlist: Playlist): PlaylistJson {
  return {
    id: playlist.id,
    type: playlist.type,
    name: playlist.name,
    description: playlist.description ?? null,
    cover_url: playlist.coverUrl ?? null,
    labels: playlist.labels,
    song_count: playlist.songCount,
    remote_count: playlist.remoteCount,
    sort_by: playlist.sortBy,
    sort_order: playlist.sortOrder,
    created_at: playlist.createdAt,
    updated_at: playlist.updatedAt,
    pinned_at: playlist.pinnedAt ?? null,
  }
}

export function playlistEquals(a: Playlist, b: Playlist): boolean {
  return a.id === b.id
}

const playlistParsers = makeParsers(playlistSchema)
export const parsePlaylist = playlistParsers.parse
export const safeParsePlaylist = playlistParsers.safeParse

export const playlistListResponseSchema = z
  .object({
    playlists: z.array(playlistSchema).catch([]),
    total: z.coerce.number().nullish().catch(undefined),
  })
  .transform((r) => ({
    playlists: r.playlists,
    total: r.total && r.total > 0 ? r.total : r.playlists.length,
  }))

export type PlaylistListResponse = z.output<typeof playlistListResponseSchema>

const playlistListParsers = makeParsers(playlistListResponseSchema)
export const parsePlaylistListResponse = playlistListParsers.parse
export const safeParsePlaylistListResponse = playlistListParsers.safeParse
