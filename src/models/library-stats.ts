import { z } from 'zod'

import { makeParsers } from './_shared.js'

/**
 * Library summary from `GET /songs/stats` (swagger `database.LibraryStats`).
 *
 * Every field is optional in swagger and none is guaranteed non-null by the
 * backend, so all of them go through `z.coerce.number().catch(0)` — a single throw
 * here would blank the home page's stats panel (AGENTS §2).
 *
 * Units, confirmed against a live backend rather than swagger (which only says
 * `integer`/`number`):
 *  - `total_duration` is in **seconds** (60 songs → 9643, i.e. ~160s each);
 *  - `total_file_size` is in **bytes**, and reads 0 for an all-remote library —
 *    which is why the UI hides it when zero rather than printing "0 B".
 */
export const libraryStatsSchema = z
  // Per-field `.catch()` does not cover a non-object payload — the object schema
  // itself still throws on `null` / a bare string, which a 500 with an empty body
  // can produce. Normalising first keeps the promise that parsing never throws.
  .preprocess((v) => (v !== null && typeof v === 'object' ? v : {}), z.object({
    total_songs: z.coerce.number().catch(0),
    local_songs: z.coerce.number().catch(0),
    remote_songs: z.coerce.number().catch(0),
    radio_songs: z.coerce.number().catch(0),
    artist_count: z.coerce.number().catch(0),
    album_count: z.coerce.number().catch(0),
    genre_count: z.coerce.number().catch(0),
    total_duration: z.coerce.number().catch(0),
    total_file_size: z.coerce.number().catch(0),
  }))
  .transform((s) => ({
    totalSongs: s.total_songs,
    localSongs: s.local_songs,
    remoteSongs: s.remote_songs,
    radioSongs: s.radio_songs,
    artistCount: s.artist_count,
    albumCount: s.album_count,
    genreCount: s.genre_count,
    /** Seconds. */
    totalDuration: s.total_duration,
    /** Bytes; 0 for a library with no local files. */
    totalFileSize: s.total_file_size,
  }))

export type LibraryStats = z.output<typeof libraryStatsSchema>

const libraryStatsParsers = makeParsers(libraryStatsSchema)
export const parseLibraryStats = libraryStatsParsers.parse
export const safeParseLibraryStats = libraryStatsParsers.safeParse

/** All-zero stats, for the pre-load / failed-read state. */
export const EMPTY_LIBRARY_STATS: LibraryStats = parseLibraryStats({})
