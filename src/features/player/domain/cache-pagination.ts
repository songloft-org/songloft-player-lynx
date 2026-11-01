import type { Song } from '../../../models/song.js'

/** Collect frozen selected IDs across pages, without caching unrelated library songs. */
export async function collectCacheSelection(input: {
  ids: ReadonlySet<number>
  fetch(offset: number, limit: number): Promise<{ songs: Song[]; total: number }>
  valid(): boolean
}): Promise<Song[]> {
  if (input.ids.size > 10000) throw new Error('cache_queue_full')
  const selected = new Map<number, Song>()
  let expected: number | undefined
  let offset = 0
  while (selected.size < input.ids.size) {
    if (!input.valid()) throw new Error('cancelled')
    const page = await input.fetch(offset, 200)
    if (!input.valid()) throw new Error('cancelled')
    if (!Number.isSafeInteger(page.total) || page.total < 0
      || (expected !== undefined && expected !== page.total) || page.songs.length === 0) {
      throw new Error('cache_playlist_changed')
    }
    expected = page.total
    for (const song of page.songs) if (input.ids.has(song.id)) selected.set(song.id, song)
    offset += page.songs.length
    if (offset >= expected && selected.size !== input.ids.size) throw new Error('cache_playlist_changed')
  }
  return Array.from(input.ids, id => selected.get(id)!)
}

/** Read the entire frozen playlist, respecting servers that cap requested page sizes. */
export async function collectCachePlaylist(input: {
  fetch(offset: number, limit: number): Promise<{ songs: Song[]; total: number }>
  valid(): boolean
}): Promise<Song[]> {
  const songs: Song[] = []
  let expected: number | null = null
  let offset = 0
  while (true) {
    if (!input.valid()) throw new Error('cancelled')
    const page = await input.fetch(offset, 200)
    if (!input.valid()) throw new Error('cancelled')
    if (!Number.isSafeInteger(page.total) || page.total < 0 || page.total > 10000 || !Array.isArray(page.songs)) {
      throw new Error('cache_queue_full')
    }
    if (expected !== null && page.total !== expected) throw new Error('cache_playlist_changed')
    expected = page.total
    if (!page.songs.length && offset < expected) throw new Error('cache_playlist_changed')
    songs.push(...page.songs)
    offset += page.songs.length
    if (offset >= expected) return songs
  }
}
