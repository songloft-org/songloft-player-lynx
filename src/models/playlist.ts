import { z } from 'zod'

import { makeParsers, nowIso } from './_shared.js'

/**
 * Playlist model. snake_case wire → camelCase domain. The `labels` array
 * carries `built_in` / `auto_created` / `hidden` markers; the derived booleans
 * `isBuiltIn` / `isAutoCreated` / `isHidden` (Flutter getters) are computed at
 * parse time. Equality is by `id` (`playlistEquals`).
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
    sort_by: z.string().catch('position'),
    sort_order: z.string().catch('asc'),
    created_at: z.string().nullish().catch(undefined),
    updated_at: z.string().nullish().catch(undefined),
  })
  .transform((p) => ({
    id: p.id,
    type: p.type,
    name: p.name,
    description: p.description ?? undefined,
    coverUrl: p.cover_url ?? undefined,
    labels: p.labels,
    songCount: p.song_count,
    sortBy: p.sort_by,
    sortOrder: p.sort_order,
    createdAt: p.created_at ?? nowIso(),
    updatedAt: p.updated_at ?? nowIso(),
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
  sort_by: string
  sort_order: string
  created_at: string
  updated_at: string
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
    sort_by: playlist.sortBy,
    sort_order: playlist.sortOrder,
    created_at: playlist.createdAt,
    updated_at: playlist.updatedAt,
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
