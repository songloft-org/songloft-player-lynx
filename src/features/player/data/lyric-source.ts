import { getSongsApi, type LyricPayload } from '../../library/api/index.js'
import type { Song } from '../../../models/song.js'

/**
 * Options threaded through to `SongsApi.getLyric`. `refresh` is the user-facing
 * "re-fetch lyrics" signal: the backend re-runs its lyric search plugins and
 * disables response caching.
 */
export interface LyricFetchOptions {
  refresh?: boolean
}

/** Async lyric fetcher signature (injectable so the store is unit-testable). */
export type LyricFetcher = (song: Song, opts?: LyricFetchOptions) => Promise<LyricPayload>

/**
 * Production lyric fetcher: reuses the library feature's shared authenticated
 * client (Bearer + single-flight 401 refresh) via `SongsApi.getLyric`. Returns
 * an empty payload when the song has no lyric URL so the store can render the
 * "no lyrics" state without a network round-trip.
 */
export const defaultLyricFetcher: LyricFetcher = async (song, opts) => {
  if (!song.lyricUrl) return {}
  return getSongsApi().getLyric(song.lyricUrl, { refresh: opts?.refresh })
}
