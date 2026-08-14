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

export interface CreatePlaylistParams {
  name: string
  description?: string
  /** Playlist type: `normal` (default) or `radio`. */
  type?: string
}

export interface UpdatePlaylistParams {
  name?: string
  description?: string
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

export function buildCreatePlaylistBody(params: CreatePlaylistParams): Record<string, string> {
  const body: Record<string, string> = { name: params.name }
  if (params.description != null && params.description !== '') {
    body.description = params.description
  }
  if (params.type != null && params.type !== '') {
    body.type = params.type
  }
  return body
}

export function buildUpdatePlaylistBody(params: UpdatePlaylistParams): Record<string, string> {
  const body: Record<string, string> = {}
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

  async addSongsToPlaylist(id: number, songIds: number[]): Promise<void> {
    await this.client.post(
      `${apiPrefix}/playlists/${id}/songs`,
      buildAddSongsBody(songIds),
    )
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
