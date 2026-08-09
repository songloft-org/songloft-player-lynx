import { getSongsApi, type LyricPayload } from '../../library/api/index.js'
import type { Song } from '../../../models/song.js'

/** Async lyric fetcher signature (injectable so the store is unit-testable). */
export type LyricFetcher = (song: Song) => Promise<LyricPayload>

/**
 * Production lyric fetcher: reuses the library feature's shared authenticated
 * client (Bearer + single-flight 401 refresh) via `SongsApi.getLyric`. Returns
 * an empty payload when the song has no lyric URL so the store can render the
 * "no lyrics" state without a network round-trip.
 *
 * ⚠️ Device-untested in batch 5 (needs a reachable backend + LAN IP). Wired but
 * best-effort; see PROGRESS.
 */
export const defaultLyricFetcher: LyricFetcher = async (song) => {
  if (!song.lyricUrl) return {}
  return getSongsApi().getLyric(song.lyricUrl)
}
