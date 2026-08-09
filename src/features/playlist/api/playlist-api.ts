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

/**
 * Playlist API service, ported (read paths only) from the Flutter `PlaylistApi`
 * (`features/playlist/data/playlist_api.dart`). It wraps a batch-2 `HttpClient`
 * and parses every response through the batch-2 zod models (`Playlist` /
 * `PlaylistListResponse` / `SongListResponse`).
 *
 * Only the read endpoints the Lynx playlist batch needs are ported here:
 *  - `GET /playlists`            — paginated playlist list
 *  - `GET /playlists/{id}`       — single playlist detail
 *  - `GET /playlists/{id}/songs` — the songs inside a playlist (paginated)
 *
 * The mutating endpoints (create/update/delete/cover/reorder/visibility/touch/
 * add-remove songs/batch-delete) from the Flutter class are deferred to a later
 * batch (see PROGRESS).
 *
 * The query-string builders are pure + exported so the exact param wiring (which
 * filters are included, how empties are pruned, how pagination maps to
 * `limit`/`offset`) is unit-testable without a live transport.
 */

/** Filters for the playlist list endpoint (`GET /playlists`). */
export interface PlaylistsFilters {
  /** Playlist type: `normal` / `radio`. */
  type?: string
  /** Exclude playlists carrying these labels (e.g. `hidden`). */
  excludeLabels?: string
  keyword?: string
}

/** Filters for the playlist-songs endpoint (`GET /playlists/{id}/songs`). */
export interface PlaylistSongsFilters {
  /** Sort field, e.g. `position` / `title` / `added_at`. */
  sort?: string
  /** Sort direction: `asc` / `desc`. */
  order?: string
  keyword?: string
}

export interface PageParams {
  limit?: number
  offset?: number
}

/** Append a string filter to `query` only when it is non-empty (Flutter parity). */
function putStr(
  query: Record<string, string | number>,
  key: string,
  value: string | undefined,
): void {
  if (value != null && value !== '') query[key] = value
}

/** Build the `/playlists` query object (paginated). Pure + exported. */
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

/** Build the `/playlists/{id}/songs` query object (paginated). Pure + exported. */
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

export class PlaylistApi {
  constructor(private readonly client: HttpClient) {}

  /** `GET /playlists` → `{ playlists, total }` (paginated by `limit`/`offset`). */
  async getPlaylists(
    filters: PlaylistsFilters = {},
    page: PageParams = {},
  ): Promise<PlaylistListResponse> {
    const res = await this.client.get<unknown>(`${apiPrefix}/playlists`, {
      query: buildPlaylistsQuery(filters, page),
    })
    return parsePlaylistListResponse(res.data)
  }

  /** `GET /playlists/{id}` → `Playlist`. */
  async getPlaylist(id: number): Promise<Playlist> {
    const res = await this.client.get<unknown>(`${apiPrefix}/playlists/${id}`)
    return parsePlaylist(res.data)
  }

  /** `GET /playlists/{id}/songs` → `{ songs, total }` (paginated). */
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
}
