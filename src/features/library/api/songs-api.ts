import { apiPrefix } from '../../../core/config/app-config.js'
import {
  defaultPageSize,
  maxPlayHistoryEntries,
  playEventSource,
} from '../../../core/config/constants.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import type { PlaybackContext } from '../../player/domain/playback-context.js'
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
export interface AudioTrackInfo {
  index: number
  codec: string
  language: string | null
  title: string | null
}

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
  /** Filter by custom tag ID. */
  tagId?: number
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

/** Append the shared tag filters (genre/artist/album/…/year/decade/tagId). */
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
  if (filters.tagId != null && filters.tagId > 0) query.tag_id = filters.tagId
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

  /**
   * `PUT /songs/{id}` — update a song (remote / radio; local songs keep their
   * tags in sync via {@link writeTags}). Undefined fields are omitted; the
   * backend decodes artist/album/cover_url as plain strings, so "omitted" and
   * "empty" both mean "cleared" there, while url is only replaced when non-empty.
   */
  async updateSong(
    id: number,
    data: {
      title?: string
      artist?: string
      album?: string
      url?: string
      coverUrl?: string
      duration?: number
      isVideo?: boolean
    },
  ): Promise<void> {
    const body: Record<string, unknown> = {}
    if (data.title !== undefined) body.title = data.title
    if (data.artist !== undefined) body.artist = data.artist
    if (data.album !== undefined) body.album = data.album
    if (data.url !== undefined) body.url = data.url
    if (data.coverUrl !== undefined) body.cover_url = data.coverUrl
    if (data.duration !== undefined) body.duration = data.duration
    if (data.isVideo !== undefined) body.is_video = data.isVideo
    await this.client.put(`${apiPrefix}/songs/${id}`, body)
  }

  async getTracks(id: number): Promise<AudioTrackInfo[]> {
    const res = await this.client.get<unknown[]>(`${apiPrefix}/songs/${id}/tracks`)
    const raw = Array.isArray(res.data) ? res.data : []
    return raw.map((t: any) => ({
      index: typeof t.index === 'number' ? t.index : 0,
      codec: String(t.codec ?? ''),
      language: t.language ?? null,
      title: t.title ?? null,
    }))
  }

  async deleteSong(id: number): Promise<void> {
    await this.client.delete(`${apiPrefix}/songs/${id}`)
  }

  /**
   * `PUT /songs/{id}/lyrics` — update a song's lyric content and source.
   *
   * Two payload shapes, picked by `lyricSource`: `'url'` writes
   * `lyric_remote_url` (fetched at play time); any other source writes the
   * lyric/tlyric/rlyric/lxlyric payload. An empty source with an empty lyric is
   * the "clear the lyric" form the song edit page uses.
   *
   * Returns `file_write_status` (`written` / `failed` / absent) so the caller can
   * tell the user whether the audio file's USLT tag was touched — the backend
   * falls back to DB-only when the tag write fails.
   */
  async updateLyrics(
    id: number,
    data: {
      lyricSource?: string
      lyric?: string
      tlyric?: string
      rlyric?: string
      lxlyric?: string
      lyricRemoteUrl?: string
    },
  ): Promise<{ fileWriteStatus?: string }> {
    const body: Record<string, unknown> = {}
    if (data.lyricSource !== undefined) body.lyric_source = data.lyricSource
    if (data.lyric !== undefined) body.lyric = data.lyric
    if (data.tlyric !== undefined) body.tlyric = data.tlyric
    if (data.rlyric !== undefined) body.rlyric = data.rlyric
    if (data.lxlyric !== undefined) body.lxlyric = data.lxlyric
    if (data.lyricRemoteUrl !== undefined) body.lyric_remote_url = data.lyricRemoteUrl
    const res = await this.client.put<unknown>(`${apiPrefix}/songs/${id}/lyrics`, body)
    const payload = (res.data ?? {}) as Record<string, unknown>
    return {
      fileWriteStatus:
        typeof payload.file_write_status === 'string' ? payload.file_write_status : undefined,
    }
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

  /**
   * `PUT /songs/{id}/tags` — write metadata into the DB **and** the local audio
   * file's tags (local songs only). Non-empty fields override, empty values keep
   * the original, so the edit form passes trimmed strings verbatim; `renameFile`
   * renames the file to the (new) title. Without `data` the song's current DB
   * values are written back into the file — the detail page's button.
   */
  async writeTags(
    id: number,
    data: { title?: string; artist?: string; album?: string; renameFile?: boolean } = {},
  ): Promise<void> {
    const body: Record<string, unknown> = {}
    if (data.title !== undefined) body.title = data.title
    if (data.artist !== undefined) body.artist = data.artist
    if (data.album !== undefined) body.album = data.album
    if (data.renameFile !== undefined) body.rename_file = data.renameFile
    await this.client.put(`${apiPrefix}/songs/${id}/tags`, body)
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
   *
   * `refresh` appends `?refresh=1` — the backend then re-runs its lyric search
   * plugins instead of returning the stored (empty/scraped/cached) lyric and
   * sends `Cache-Control: no-store`. Authoritative sources (file/embedded/
   * manual) still win over the search result, so a refresh can never clobber
   * user-entered lyrics.
   */
  async getLyric(
    lyricUrl: string,
    opts?: { refresh?: boolean },
  ): Promise<LyricPayload> {
    const res = await this.client.get<unknown>(lyricUrl, {
      query: opts?.refresh ? { refresh: '1' } : undefined,
    })
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

  /**
   * `GET /play-history` — the most recently played songs *within one playback
   * context*. Both context params are required by the backend; there is no
   * global "recently played" endpoint.
   */
  async getPlayHistory(
    context: PlaybackContext,
    limit = maxPlayHistoryEntries,
  ): Promise<PlayHistoryResponse> {
    const res = await this.client.get<unknown>(`${apiPrefix}/play-history`, {
      query: { ...contextQuery(context), limit },
    })
    return parsePlayHistoryResponse(res.data)
  }

  /** `DELETE /play-history` — clear one context's history, returns the count. */
  async clearPlayHistory(context: PlaybackContext): Promise<number> {
    const res = await this.client.delete<unknown>(`${apiPrefix}/play-history`, {
      query: contextQuery(context),
    })
    const deleted = (res.data as { deleted?: unknown } | null)?.deleted
    return typeof deleted === 'number' ? deleted : 0
  }

  /** `DELETE /play-history/entry` — drop one song from one context's history. */
  async deletePlayHistoryEntry(context: PlaybackContext, songId: number): Promise<void> {
    await this.client.delete(`${apiPrefix}/play-history/entry`, {
      query: { ...contextQuery(context), song_id: songId },
    })
  }

  /**
   * `POST /songs/{id}/played` — record a play event.
   *
   * Fire-and-forget (the store never awaits this). Pass a context to have the
   * event recorded into that context's play history; without one the backend
   * only broadcasts the event to plugins, which is correct for playback that has
   * no stable context (the flat library list).
   */
  async recordPlayed(songId: number, context?: PlaybackContext): Promise<void> {
    await this.client.post(`${apiPrefix}/songs/${songId}/played`, undefined, {
      query: playedEventParams(context),
    })
  }
}

/**
 * Query params for `POST /songs/{id}/played`.
 *
 * Pure + exported because the exact wiring is the whole bug this replaced: the
 * backend reads `type` / `source` / `context_type` / `context_key` **from the
 * query string** and defaults `type` to `finish`, while only `type=play` is
 * recorded into history (`internal/handlers/music.go`, `SongPlayed`). The old
 * implementation put the context in the JSON body and never sent `type`, so
 * every call returned 204 and recorded nothing — for every context, including
 * playlists. Unit-tested rather than trusted.
 */
export function playedEventParams(
  context?: PlaybackContext,
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    type: 'play',
    source: playEventSource,
  }
  if (context) {
    params.context_type = context.type
    params.context_key = context.key
  }
  return params
}

/**
 * Context params for the three `/play-history` endpoints.
 *
 * Values are handed to `HttpClient` as `query` and encoded there — do **not**
 * `encodeURIComponent` here, or an artist named `周杰伦` goes out double-encoded.
 */
function contextQuery(context: PlaybackContext): Record<string, string> {
  return { context_type: context.type, context_key: context.key }
}

/** Lyric endpoint payload (only the plain `lyric` field is used in batch 5). */
export interface LyricPayload {
  lyric?: string
  lxlyric?: string
  tlyric?: string
  rlyric?: string
}
