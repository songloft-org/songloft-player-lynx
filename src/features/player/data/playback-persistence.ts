import { getSongloftStorage } from '../../../core/storage/index.js'
import type { Song } from '../../../models/song.js'
import { songToJson, songSchema } from '../../../models/song.js'
import {
  playlistContext,
  type PlaybackContext,
  playlistIdOf,
} from '../domain/playback-context.js'

const PREF_PLAYBACK_QUEUE = 'playback_queue'
const PREF_PLAYBACK_INDEX = 'playback_index'
const PREF_PLAYBACK_POSITION = 'playback_position'
const PREF_PLAYBACK_CONTEXT = 'playback_context'
/**
 * Superseded by {@link PREF_PLAYBACK_CONTEXT}, which stores the full
 * `(type, key)` pair instead of a playlist ID alone. Still read so an upgrade
 * keeps the restored queue's context, and removed on the next write.
 */
const PREF_PLAYBACK_SOURCE_PLAYLIST = 'playback_source_playlist'

export interface SavedPlaybackState {
  playlist: Song[]
  currentIndex: number
  positionMs: number
  context?: PlaybackContext
  /** Derived from {@link context}; see `PlayerData.sourcePlaylistId`. */
  sourcePlaylistId?: number
}

/**
 * Parses the persisted context, tolerating anything.
 *
 * In its own try on purpose: folding this into the caller's would turn one bad
 * pref into "the whole restored queue is gone".
 */
function parseSavedContext(json: string | null | undefined): PlaybackContext | undefined {
  if (!json) return undefined
  try {
    const raw = JSON.parse(json) as { type?: unknown, key?: unknown }
    if (typeof raw?.type !== 'string' || typeof raw?.key !== 'string') return undefined
    if (!raw.type || !raw.key) return undefined
    return { type: raw.type as PlaybackContext['type'], key: raw.key }
  } catch {
    return undefined
  }
}

export async function loadPlaybackState(): Promise<SavedPlaybackState | null> {
  try {
    const storage = getSongloftStorage()
    const [queueJson, indexStr, posStr, contextJson, playlistIdStr] = await Promise.all([
      storage.prefs.get(PREF_PLAYBACK_QUEUE),
      storage.prefs.get(PREF_PLAYBACK_INDEX),
      storage.prefs.get(PREF_PLAYBACK_POSITION),
      storage.prefs.get(PREF_PLAYBACK_CONTEXT),
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
    // Falls back to the legacy playlist-only key for one upgrade.
    const context = parseSavedContext(contextJson)
      ?? playlistContext(playlistIdStr ? parseInt(playlistIdStr, 10) || 0 : 0)

    return { playlist, currentIndex, positionMs, context, sourcePlaylistId: playlistIdOf(context) }
  } catch {
    return null
  }
}

export async function savePlaybackState(
  playlist: Song[],
  currentIndex: number,
  positionMs: number,
  context?: PlaybackContext,
): Promise<void> {
  try {
    const storage = getSongloftStorage()
    if (playlist.length === 0) {
      await Promise.all([
        storage.prefs.remove(PREF_PLAYBACK_QUEUE),
        storage.prefs.remove(PREF_PLAYBACK_INDEX),
        storage.prefs.remove(PREF_PLAYBACK_POSITION),
        storage.prefs.remove(PREF_PLAYBACK_CONTEXT),
        storage.prefs.remove(PREF_PLAYBACK_SOURCE_PLAYLIST),
      ])
      return
    }
    const queueJson = JSON.stringify(playlist.map(songToJson))
    await Promise.all([
      storage.prefs.set(PREF_PLAYBACK_QUEUE, queueJson),
      storage.prefs.set(PREF_PLAYBACK_INDEX, String(currentIndex)),
      storage.prefs.set(PREF_PLAYBACK_POSITION, String(Math.round(positionMs))),
      context != null
        ? storage.prefs.set(PREF_PLAYBACK_CONTEXT, JSON.stringify(context))
        : storage.prefs.remove(PREF_PLAYBACK_CONTEXT),
      // The legacy key is never written again; drop whatever an older build left.
      storage.prefs.remove(PREF_PLAYBACK_SOURCE_PLAYLIST),
    ])
  } catch {
    // best-effort
  }
}
