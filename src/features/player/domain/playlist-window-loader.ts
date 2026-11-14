import type { Song } from '../../../models/song.js'

/** Publish a contiguous interval: target neighbours first, then forward, then prefix. */
export async function loadPlaylistWindow(options: {
  targetIndex: number
  total: number
  fetch: (offset: number, limit: number) => Promise<Song[]>
  onWindow: (songs: Song[], state: { initial: boolean; complete: boolean }) => void
  isCurrent: () => boolean
}): Promise<boolean> {
  const { targetIndex, total, fetch, onWindow, isCurrent } = options
  if (targetIndex < 0 || targetIndex >= total) throw new Error('Track removed from playlist')
  const request = async (offset: number, count: number): Promise<Song[] | null> => {
    for (let attempt = 0; ; attempt++) {
      if (!isCurrent()) return null
      try {
        const songs = await fetch(offset, count)
        if (!isCurrent()) return null
        if (songs.length !== count) throw new Error('Playlist changed while loading')
        return songs
      } catch (error) {
        if (!isCurrent()) return null
        if (attempt === 2) throw error
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
      }
    }
  }
  let start = Math.max(0, targetIndex - 1)
  let window = await request(start, Math.min(100, total - start))
  if (!window) return false
  let end = start + window.length
  onWindow(window, { initial: true, complete: start === 0 && end === total })
  while (end < total) {
    const batch = await request(end, Math.min(100, total - end))
    if (!batch) return false
    window = [...window, ...batch]
    end += batch.length
    onWindow(window, { initial: false, complete: start === 0 && end === total })
  }
  while (start > 0) {
    const next = Math.max(0, start - 100)
    const batch = await request(next, start - next)
    if (!batch) return false
    window = [...batch, ...window]
    start = next
    onWindow(window, { initial: false, complete: start === 0 })
  }
  return isCurrent()
}
