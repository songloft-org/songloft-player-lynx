import type { Song } from '../../../models/song.js'

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
