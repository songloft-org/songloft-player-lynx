import { apiPrefix } from '../../../core/config/app-config.js'
import { defaultPageSize } from '../../../core/config/constants.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import {
  parsePlaylist,
  parsePlaylistListResponse,
  type Playlist,
  type PlaylistListResponse,
} from '../../../models/playlist.js'
import {
  parseSongListResponse,
  type SongListResponse,
} from '../../../models/song.js'

export interface PlaylistsFilters {
  type?: string
  excludeLabels?: string
  keyword?: string
}

export interface PlaylistSongsFilters {
  sort?: string
  order?: string
  keyword?: string
}

export interface PageParams {
  limit?: number
  offset?: number
}

/** Outcome of an add-songs call: the server skips duplicates and mismatched types. */
export interface AddSongsResult {
  added: number
  skipped: number
}

export interface CreatePlaylistParams {
  name: string
  description?: string
  /**
   * Playlist type. Optional here and defaulted to `normal` by
   * `buildCreatePlaylistBody` — see it for why the field cannot be omitted from
   * the wire body.
   */
  type?: Playlist['type']
}

export interface UpdatePlaylistParams {
  name?: string
  description?: string
  coverSongId?: number
}

function putStr(
  query: Record<string, string | number>,
  key: string,
  value: string | undefined,
): void {
  if (value != null && value !== '') query[key] = value
}

export function buildPlaylistsQuery(
  filters: PlaylistsFilters = {},
  page: PageParams = {},
): Record<string, string | number> {
  const query: Record<string, string | number> = {
    limit: page.limit ?? defaultPageSize,
    offset: page.offset ?? 0,
  }
  putStr(query, 'type', filters.type)
  putStr(query, 'exclude_labels', filters.excludeLabels)
  putStr(query, 'keyword', filters.keyword)
  return query
}

export function buildPlaylistSongsQuery(
  filters: PlaylistSongsFilters = {},
  page: PageParams = {},
): Record<string, string | number> {
  const query: Record<string, string | number> = {
    limit: page.limit ?? defaultPageSize,
    offset: page.offset ?? 0,
  }
  putStr(query, 'sort', filters.sort)
  putStr(query, 'order', filters.order)
  putStr(query, 'keyword', filters.keyword)
  return query
}

/**
 * `type` is **always** sent, defaulting to `normal`.
 *
 * The backend has no default for it: `POST /playlists` with the field absent or
 * empty answers **500** `{"detail":"invalid playlist data: invalid type"}` (verified
 * against the dev server; `normal` and `radio` are the accepted values, and
 * `playlist` is not one of them). Only `PUT` tolerates its absence.
 *
 * So omitting an "optional" type is not a smaller request, it is a failed one.
 * `CreatePlaylistPage` always passes a type because its form makes the user pick
 * one, which is why the whole-page flow worked while the add-to-playlist sheet's
 * quick-create — name only — failed with the backend's own "创建歌单失败".
 */
export function buildCreatePlaylistBody(params: CreatePlaylistParams): Record<string, string> {
  const body: Record<string, string> = {
    name: params.name,
    type: params.type ?? 'normal',
  }
  if (params.description != null && params.description !== '') {
    body.description = params.description
  }
  return body
}

export function buildUpdatePlaylistBody(params: UpdatePlaylistParams): Record<string, string | number> {
  const body: Record<string, string | number> = {}
  if (params.coverSongId != null) {
    body.cover_song_id = params.coverSongId
  }
  if (params.name != null && params.name !== '') body.name = params.name
  if (params.description != null) body.description = params.description
  return body
}

export function buildAddSongsBody(songIds: number[]): { song_ids: number[] } {
  return { song_ids: songIds }
}

export function buildReorderPlaylistsBody(playlistIds: number[]): { playlist_ids: number[] } {
  return { playlist_ids: playlistIds }
}

export function buildReorderSongsBody(songIds: number[]): { song_ids: number[] } {
  return { song_ids: songIds }
}

export class PlaylistApi {
  constructor(private readonly client: HttpClient) {}

  async getPlaylists(
    filters: PlaylistsFilters = {},
    page: PageParams = {},
  ): Promise<PlaylistListResponse> {
    const res = await this.client.get<unknown>(`${apiPrefix}/playlists`, {
      query: buildPlaylistsQuery(filters, page),
    })
    return parsePlaylistListResponse(res.data)
  }

  async getPlaylist(id: number): Promise<Playlist> {
    const res = await this.client.get<unknown>(`${apiPrefix}/playlists/${id}`)
    return parsePlaylist(res.data)
  }

  async getPlaylistSongs(
    id: number,
    filters: PlaylistSongsFilters = {},
    page: PageParams = {},
  ): Promise<SongListResponse> {
    const res = await this.client.get<unknown>(
      `${apiPrefix}/playlists/${id}/songs`,
      { query: buildPlaylistSongsQuery(filters, page) },
    )
    return parseSongListResponse(res.data)
  }

  async createPlaylist(params: CreatePlaylistParams): Promise<Playlist> {
    const res = await this.client.post<unknown>(
      `${apiPrefix}/playlists`,
      buildCreatePlaylistBody(params),
    )
    return parsePlaylist(res.data)
  }

  async updatePlaylist(id: number, params: UpdatePlaylistParams): Promise<Playlist> {
    const res = await this.client.put<unknown>(
      `${apiPrefix}/playlists/${id}`,
      buildUpdatePlaylistBody(params),
    )
    return parsePlaylist(res.data)
  }

  async deletePlaylist(id: number): Promise<void> {
    await this.client.delete(`${apiPrefix}/playlists/${id}`)
  }

  /**
   * Adds songs and reports what the server actually did.
   *
   * The counts matter to the caller: the backend skips songs already in the
   * playlist (and type-incompatible ones), so "added 3" and "added 1, skipped 2"
   * are different outcomes and the add-to-playlist sheet says which. Swagger
   * types the 200 body as an open object; the two fields are the ones the
   * Flutter client reads (`playlist_api.dart`), and both default to 0 so an
   * older/leaner response degrades to a plain success rather than `NaN`.
   */
  async addSongsToPlaylist(id: number, songIds: number[]): Promise<AddSongsResult> {
    const res = await this.client.post<Record<string, unknown>>(
      `${apiPrefix}/playlists/${id}/songs`,
      buildAddSongsBody(songIds),
    )
    const data = res.data ?? {}
    return {
      added: Number(data.added ?? 0) || 0,
      skipped: Number(data.skipped ?? 0) || 0,
    }
  }

  async removeSongFromPlaylist(playlistId: number, songId: number): Promise<void> {
    await this.client.delete(`${apiPrefix}/playlists/${playlistId}/songs/${songId}`)
  }

  async reorderPlaylists(playlistIds: number[]): Promise<void> {
    await this.client.put(
      `${apiPrefix}/playlists/reorder`,
      buildReorderPlaylistsBody(playlistIds),
    )
  }

  async reorderPlaylistSongs(playlistId: number, songIds: number[]): Promise<void> {
    await this.client.put(
      `${apiPrefix}/playlists/${playlistId}/songs/reorder`,
      buildReorderSongsBody(songIds),
    )
  }

  async getPlaylistSongIds(id: number): Promise<number[]> {
    const res = await this.client.get<unknown>(`${apiPrefix}/playlists/${id}/song-ids`)
    const data = res.data as Record<string, unknown> | undefined
    const ids = Array.isArray(data?.ids) ? data.ids : []
    return ids.map((v: unknown) => Number(v))
  }

  async touchPlaylist(id: number): Promise<void> {
    await this.client.post(`${apiPrefix}/playlists/${id}/touch`)
  }

  async setPlaylistVisibility(id: number, hidden: boolean): Promise<Playlist> {
    const res = await this.client.put<unknown>(
      `${apiPrefix}/playlists/${id}/visibility`,
      { hidden },
    )
    return parsePlaylist(res.data)
  }

  /**
   * Pin or unpin a playlist.
   *
   * The ordering it produces is entirely the backend's: pinned playlists come
   * first, most recently pinned before the rest, with the manual `position` as
   * the tiebreaker. `getPlaylists` sends no sort parameters, so re-reading the
   * list after this call is what surfaces the new order — there is nothing to
   * sort client-side. Built-in playlists (Favorites, Radio favorites) are
   * pinnable too; the backend deliberately skips its usual built-in guard here.
   */
  async setPlaylistPinned(id: number, pinned: boolean): Promise<Playlist> {
    const res = await this.client.put<unknown>(
      `${apiPrefix}/playlists/${id}/pin`,
      { pinned },
    )
    return parsePlaylist(res.data)
  }

  async updatePlaylistSort(id: number, sortBy: string, sortOrder: string): Promise<void> {
    await this.client.put(`${apiPrefix}/playlists/${id}/sort`, {
      sort_by: sortBy,
      sort_order: sortOrder,
    })
  }

  /** Move a single song to a new position (does not reload the full list). */
  async movePlaylistSong(
    id: number,
    songId: number,
    afterSongId: number | null,
  ): Promise<void> {
    await this.client.put(`${apiPrefix}/playlists/${id}/songs/move`, {
      song_id: songId,
      after_song_id: afterSongId,
    })
  }
}
