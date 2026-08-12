import { getSongloftStorage } from '../../../core/storage/index.js'
import type { Song } from '../../../models/song.js'
import { songToJson, songSchema } from '../../../models/song.js'

const PREF_PLAYBACK_QUEUE = 'playback_queue'
const PREF_PLAYBACK_INDEX = 'playback_index'
const PREF_PLAYBACK_POSITION = 'playback_position'
const PREF_PLAYBACK_SOURCE_PLAYLIST = 'playback_source_playlist'

export interface SavedPlaybackState {
  playlist: Song[]
  currentIndex: number
  positionMs: number
  sourcePlaylistId?: number
}

export async function loadPlaybackState(): Promise<SavedPlaybackState | null> {
  try {
    const storage = getSongloftStorage()
    const [queueJson, indexStr, posStr, playlistIdStr] = await Promise.all([
      storage.prefs.get(PREF_PLAYBACK_QUEUE),
      storage.prefs.get(PREF_PLAYBACK_INDEX),
      storage.prefs.get(PREF_PLAYBACK_POSITION),
      storage.prefs.get(PREF_PLAYBACK_SOURCE_PLAYLIST),
    ])

    if (!queueJson) return null

    const raw = JSON.parse(queueJson) as unknown[]
    if (!Array.isArray(raw) || raw.length === 0) return null

    const playlist: Song[] = []
    for (const item of raw) {
      const result = songSchema.safeParse(item)
      if (result.success) playlist.push(result.data)
    }
    if (playlist.length === 0) return null

    const currentIndex = Math.min(
      Math.max(0, indexStr ? parseInt(indexStr, 10) || 0 : 0),
      playlist.length - 1,
    )
    const positionMs = Math.max(0, posStr ? parseInt(posStr, 10) || 0 : 0)
    const sourcePlaylistId = playlistIdStr ? parseInt(playlistIdStr, 10) || undefined : undefined

    return { playlist, currentIndex, positionMs, sourcePlaylistId }
  } catch {
    return null
  }
}

export async function savePlaybackState(
  playlist: Song[],
  currentIndex: number,
  positionMs: number,
  sourcePlaylistId?: number,
): Promise<void> {
  try {
    const storage = getSongloftStorage()
    if (playlist.length === 0) {
      await Promise.all([
        storage.prefs.remove(PREF_PLAYBACK_QUEUE),
        storage.prefs.remove(PREF_PLAYBACK_INDEX),
        storage.prefs.remove(PREF_PLAYBACK_POSITION),
        storage.prefs.remove(PREF_PLAYBACK_SOURCE_PLAYLIST),
      ])
      return
    }
    const queueJson = JSON.stringify(playlist.map(songToJson))
    await Promise.all([
      storage.prefs.set(PREF_PLAYBACK_QUEUE, queueJson),
      storage.prefs.set(PREF_PLAYBACK_INDEX, String(currentIndex)),
      storage.prefs.set(PREF_PLAYBACK_POSITION, String(Math.round(positionMs))),
      sourcePlaylistId != null
        ? storage.prefs.set(PREF_PLAYBACK_SOURCE_PLAYLIST, String(sourcePlaylistId))
        : storage.prefs.remove(PREF_PLAYBACK_SOURCE_PLAYLIST),
    ])
  } catch {
    // best-effort
  }
}
