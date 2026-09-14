/**
 * Artist / song-artist models — the structured multi-artist link that backs
 * the duet/chorus fix (`songloft-org/songloft#462`).
 *
 * The backend stores one song's participants in the normalized `song_artists`
 * table (`role` = `artist` | `album_artist`, `position` = display order
 * within a role). The single `songs.artist` column is now just a display cache
 * (`"A & B"`), so searching by the partner singer works only via the
 * structured link — which is exactly what the edit form writes back.
 *
 * Wire shape (snake_case from the backend):
 *  - `GET /songs/{id}/artists` → `{ artists: [{ artist: { id, name, created_at }, role, position }] }`
 *  - `PUT /songs/{id}/artists`  → body `{ artists: [{ name, role, position }] }` (full replace)
 *
 * Mirrors the Flutter `Artist` / `SongArtist` / `ArtistInput`
 * (`lib/shared/models/artist.dart`).
 */

/** Singer role: lead (`artist`) or album artist (`album_artist`). */
export const ARTIST_ROLE_ARTIST = 'artist'
export const ARTIST_ROLE_ALBUM_ARTIST = 'album_artist'
export type ArtistRole = typeof ARTIST_ROLE_ARTIST | typeof ARTIST_ROLE_ALBUM_ARTIST

/** Artist entity (the `artist` object nested in a GET response item). */
export interface Artist {
  id: number
  name: string
  createdAt?: string
}

/** One song's participant: the artist, its role, and display order. */
export interface SongArtist {
  artist: Artist
  role: ArtistRole
  position: number
}

/**
 * Edit-time input (PUT body item). `role` defaults to `artist`; `position`
 * is omitted when 0 to match the backend's `omitempty`.
 */
export interface ArtistInput {
  name: string
  role: ArtistRole
  position: number
}

/** Build the wire object for a PUT body item (camelCase → snake-free flat). */
export function artistInputToJson(input: ArtistInput): Record<string, unknown> {
  const obj: Record<string, unknown> = { name: input.name, role: input.role }
  if (input.position !== 0) obj.position = input.position
  return obj
}

/** GET response body: `{ artists: [...] }`. */
export interface SongArtistsResponse {
  artists: SongArtist[]
}

/**
 * Parse a `GET /songs/{id}/artists` response body into `SongArtist[]`.
 *
 * Defensive (the backend always returns `artists`, but a plugin/proxy could
 * shape things differently): missing/empty arrays collapse to `[]`, bad
 * items are dropped rather than throwing, and `role` falls back to `artist`.
 */
export function parseSongArtists(body: unknown): SongArtist[] {
  const root = (body ?? {}) as { artists?: unknown }
  const list = Array.isArray(root.artists) ? root.artists : []
  const out: SongArtist[] = []
  for (const item of list) {
    if (item == null || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const artistRaw = rec.artist
    if (artistRaw == null || typeof artistRaw !== 'object') continue
    const a = artistRaw as Record<string, unknown>
    const name = typeof a.name === 'string' ? a.name : ''
    if (!name) continue
    const role =
      rec.role === ARTIST_ROLE_ALBUM_ARTIST
        ? ARTIST_ROLE_ALBUM_ARTIST
        : ARTIST_ROLE_ARTIST
    const position = typeof rec.position === 'number' ? rec.position : 0
    const id = typeof a.id === 'number' ? a.id : 0
    const createdAt =
      typeof a.created_at === 'string' ? a.created_at : undefined
    out.push({ artist: { id, name, createdAt }, role, position })
  }
  return out
}
