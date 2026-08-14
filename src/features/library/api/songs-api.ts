import { apiPrefix } from '../../../core/config/app-config.js'
import { defaultPageSize } from '../../../core/config/constants.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import { parseLibraryStats, type LibraryStats } from '../../../models/library-stats.js'
import {
  parsePlayHistoryResponse,
  parseSong,
  parseSongFacetResponse,
  parseSongListResponse,
  type PlayHistoryResponse,
  type Song,
  type SongFacetResponse,
  type SongListResponse,
} from '../../../models/song.js'

/**
 * Songs API service, ported from the Flutter `SongsApi`
 * (`features/library/data/songs_api.dart`). It wraps a batch-2 `HttpClient` and
 * parses every response through the batch-2 zod models (`Song` /
 * `SongListResponse` / `SongFacetResponse`).
 *
 * Only the read endpoints the Lynx library batch needs are ported here
 * (`/songs`, `/songs/facets`, `/songs/ids`, `/songs/{id}`, `/songs/stats`); the
 * mutating endpoints (create/update/delete/played/clean) are deferred.
 *
 * The query-string builders are pure + exported so the exact param wiring
 * (which filters are included, how empties are pruned, how pagination maps to
 * `limit`/`offset`) is unit-testable without a live transport.
 */

/** Shared filter set for the songs list + song-ids endpoints. */
export interface SongsFilters {
  /** Song source type: `local` / `remote` / `radio`. */
  type?: string
  keyword?: string
  /** Filter by `file_path` prefix (e.g. `music/Pop`). */
  pathPrefix?: string
  /**
   * Exclude songs belonging to playlists with these labels. `undefined` → the
   * backend excludes hidden playlists by default; `'none'` → show everything.
   */
  excludePlaylistLabels?: string
  genre?: string
  artist?: string
  album?: string
  language?: string
  style?: string
  year?: number
  decade?: number
  /** Sort field, e.g. `added_at` / `title` / `file_modified_at`. */
  sort?: string
  /** Sort direction: `asc` / `desc`. */
  order?: string
}

export interface PageParams {
  limit?: number
  offset?: number
}

export interface FacetParams extends PageParams {
  keyword?: string
  sort?: string
  order?: string
}

export interface SongIdsResponse {
  ids: number[]
  total: number
}

/** Append a string filter to `query` only when it is non-empty (Flutter parity). */
function putStr(
  query: Record<string, string | number>,
  key: string,
  value: string | undefined,
): void {
  if (value != null && value !== '') query[key] = value
}

/** Append the shared tag filters (genre/artist/album/…/year/decade). */
function applyTagFilters(
  query: Record<string, string | number>,
  filters: SongsFilters,
): void {
  putStr(query, 'genre', filters.genre)
  putStr(query, 'artist', filters.artist)
  putStr(query, 'album', filters.album)
  putStr(query, 'language', filters.language)
  putStr(query, 'style', filters.style)
  // year/decade are only meaningful when > 0 (mirrors the Flutter guard).
  if (filters.year != null && filters.year > 0) query.year = filters.year
  if (filters.decade != null && filters.decade > 0) query.decade = filters.decade
}

/** Build the `/songs` query object (paginated). Pure + exported for testing. */
export function buildSongsQuery(
  filters: SongsFilters,
  page: PageParams = {},
): Record<string, string | number> {
  const query: Record<string, string | number> = {
    limit: page.limit ?? defaultPageSize,
    offset: page.offset ?? 0,
  }
  putStr(query, 'type', filters.type)
  putStr(query, 'keyword', filters.keyword)
  putStr(query, 'path_prefix', filters.pathPrefix)
  putStr(query, 'exclude_playlist_labels', filters.excludePlaylistLabels)
  applyTagFilters(query, filters)
  putStr(query, 'sort', filters.sort)
  putStr(query, 'order', filters.order)
  return query
}

/** Build the `/songs/ids` query object (no pagination). Pure + exported. */
export function buildSongIdsQuery(
  filters: SongsFilters,
): Record<string, string | number> {
  const query: Record<string, string | number> = {}
  putStr(query, 'type', filters.type)
  putStr(query, 'keyword', filters.keyword)
  putStr(query, 'path_prefix', filters.pathPrefix)
  putStr(query, 'exclude_playlist_labels', filters.excludePlaylistLabels)
  applyTagFilters(query, filters)
  putStr(query, 'sort', filters.sort)
  putStr(query, 'order', filters.order)
  return query
}

/** Build the `/songs/facets` query object (paginated). Pure + exported. */
export function buildFacetsQuery(
  field: string,
  params: FacetParams = {},
): Record<string, string | number> {
  const query: Record<string, string | number> = {
    field,
    limit: params.limit ?? defaultPageSize,
    offset: params.offset ?? 0,
  }
  putStr(query, 'keyword', params.keyword)
  putStr(query, 'sort', params.sort)
  putStr(query, 'order', params.order)
  return query
}

export class SongsApi {
  constructor(private readonly client: HttpClient) {}

  /** `GET /songs` → `{ songs, total }` (paginated by `limit`/`offset`). */
  async getSongs(
    filters: SongsFilters = {},
    page: PageParams = {},
  ): Promise<SongListResponse> {
    const res = await this.client.get<unknown>(`${apiPrefix}/songs`, {
      query: buildSongsQuery(filters, page),
    })
    return parseSongListResponse(res.data)
  }

  /** `GET /songs/facets?field=…` → `{ facets, total }` (paginated). */
  async getFacets(
    field: string,
    params: FacetParams = {},
  ): Promise<SongFacetResponse> {
    const res = await this.client.get<unknown>(`${apiPrefix}/songs/facets`, {
      query: buildFacetsQuery(field, params),
    })
    return parseSongFacetResponse(res.data)
  }

  /** `GET /songs/stats` → library totals (song counts, duration, size, facet counts). */
  async getLibraryStats(): Promise<LibraryStats> {
    const res = await this.client.get<unknown>(`${apiPrefix}/songs/stats`)
    return parseLibraryStats(res.data)
  }

  /** `GET /songs/ids` (same filters as `/songs`) → `{ ids, total }`. */
  async getSongIds(filters: SongsFilters = {}): Promise<SongIdsResponse> {
    const res = await this.client.get<unknown>(`${apiPrefix}/songs/ids`, {
      query: buildSongIdsQuery(filters),
    })
    const body = (res.data ?? {}) as { ids?: unknown[]; total?: number }
    const ids = Array.isArray(body.ids)
      ? body.ids.map((v) => Number(v)).filter((n) => Number.isFinite(n))
      : []
    return { ids, total: body.total ?? ids.length }
  }

  /** `GET /songs/{id}` → `Song`. */
  async getSong(id: number): Promise<Song> {
    const res = await this.client.get<unknown>(`${apiPrefix}/songs/${id}`)
    return parseSong(res.data)
  }

  async updateSong(id: number, data: { title?: string; artist?: string; album?: string; url?: string; coverUrl?: string }): Promise<void> {
    const body: Record<string, unknown> = {}
    if (data.title !== undefined) body.title = data.title
    if (data.artist !== undefined) body.artist = data.artist
    if (data.album !== undefined) body.album = data.album
    if (data.url !== undefined) body.url = data.url
    if (data.coverUrl !== undefined) body.cover_url = data.coverUrl
    await this.client.put(`${apiPrefix}/songs/${id}`, body)
  }

  async deleteSong(id: number): Promise<void> {
    await this.client.delete(`${apiPrefix}/songs/${id}`)
  }

  async updateLyrics(id: number, data: { lyric?: string; tlyric?: string; rlyric?: string; lxlyric?: string }): Promise<void> {
    await this.client.put(`${apiPrefix}/songs/${id}/lyrics`, data)
  }

  async cleanInvalidSongs(): Promise<{ cleaned: number }> {
    const res = await this.client.post<Record<string, unknown>>(`${apiPrefix}/songs/clean`, {})
    const data = res.data ?? {}
    return { cleaned: Number(data.cleaned ?? data.count ?? 0) }
  }

  async addRemoteSongs(songs: { title: string; url: string; artist?: string; album?: string; cover_url?: string; duration?: number }[]): Promise<void> {
    await this.client.post(`${apiPrefix}/songs/remote`, songs)
  }

  async addRadioStations(stations: { title: string; url: string; cover_url?: string }[]): Promise<void> {
    await this.client.post(`${apiPrefix}/songs/radio`, stations)
  }

  async writeTags(id: number): Promise<void> {
    await this.client.put(`${apiPrefix}/songs/${id}/tags`, {})
  }

  async getSongNames(field: 'title' | 'artist' = 'title'): Promise<string[]> {
    const res = await this.client.get<Record<string, unknown>>(`${apiPrefix}/songs/names`, { query: { field } })
    const data = res.data ?? {}
    const names = data.names ?? data.items ?? []
    return Array.isArray(names) ? names.map(String) : []
  }

  /**
   * `GET <lyricUrl>` → the lyric payload `{ lyric, lxlyric, tlyric, rlyric }`.
   *
   * `lyricUrl` comes straight from `Song.lyricUrl` (a relative `/api/v1/...`
   * path the authenticated client resolves against the base URL + injects the
   * Bearer token). Only the plain `lyric` (LRC) field is consumed by the
   * batch-5 player; word-by-word / translations are deferred.
   */
  async getLyric(lyricUrl: string): Promise<LyricPayload> {
    const res = await this.client.get<unknown>(lyricUrl)
    const body = (res.data ?? {}) as Record<string, unknown>
    const str = (k: string): string | undefined =>
      typeof body[k] === 'string' ? (body[k] as string) : undefined
    return {
      lyric: str('lyric'),
      lxlyric: str('lxlyric'),
      tlyric: str('tlyric'),
      rlyric: str('rlyric'),
    }
  }

  async getPlayHistory(limit = 50): Promise<PlayHistoryResponse> {
    const res = await this.client.get<unknown>(`${apiPrefix}/play-history?limit=${limit}`)
    return parsePlayHistoryResponse(res.data)
  }

  async deletePlayHistoryEntry(songId: number): Promise<void> {
    await this.client.delete(`${apiPrefix}/play-history/entry?song_id=${songId}`)
  }

  /**
   * `POST /songs/{id}/played` — record a play event for history.
   * Fire-and-forget (the store never awaits this). `contextType` / `contextKey`
   * let the backend tag the source (e.g. `playlist` / `library`).
   */
  async recordPlayed(
    songId: number,
    contextType?: string,
    contextKey?: string,
  ): Promise<void> {
    const body: Record<string, unknown> = {}
    if (contextType) body.context_type = contextType
    if (contextKey) body.context_key = contextKey
    await this.client.post(`${apiPrefix}/songs/${songId}/played`, body)
  }
}

/** Lyric endpoint payload (only the plain `lyric` field is used in batch 5). */
export interface LyricPayload {
  lyric?: string
  lxlyric?: string
  tlyric?: string
  rlyric?: string
}
