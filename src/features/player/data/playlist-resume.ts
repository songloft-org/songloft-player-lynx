import { parseSong, type Song } from '../../../models/song.js'
import { getPlaylistApi } from '../../playlist/api/index.js'
import { playlistContext } from '../domain/playback-context.js'
import { usePlayerStore, type PlayerState } from '../store/player-store.js'
import type { PlayMode } from '../domain/play-mode.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { i18n } from '../../../i18n/index.js'
import { subscribeAppVisibility } from '../../../native/app-visibility.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import { appConfig } from '../../../core/config/app-config.js'
import { loadPlaylistWindow } from '../domain/playlist-window-loader.js'

let generation = 0
let active: { id: number; version: number; blocked: boolean; ready: boolean } | undefined
let writes = Promise.resolve()
let lastSave = 0
let restoring = false

export function flushPlaylistProgress({ completed, modeOnly = false, snapshot }: { completed?: boolean; modeOnly?: boolean; snapshot?: PlayerState } = {}): void {
  const s = snapshot ?? usePlayerStore.getState()
  const session = active
  if (!session || session.blocked || (!session.ready && !modeOnly) || !s.currentSong || s.sourcePlaylistId !== session.id) return
  const data = modeOnly ? { play_mode: s.playMode } : { song_id: s.currentSong.id, position_ms: Math.round(s.currentTime), play_mode: s.playMode, completed: completed ?? s.playlistCompleted ?? false }
  writes = writes.then(async () => {
    if (session.blocked) return
    const prefs = getSongloftStorage().prefs
    const key = `playlist_pending:${appConfig.baseUrl}:${session.id}`
    const request = { ...data, version: session.version }
    try {
      await prefs.set(key, JSON.stringify(request))
      const saved = await getPlaylistApi().saveProgress(session.id, request)
      session.version = saved.version
      await prefs.remove(key)
    } catch (e) {
      if ((e as { status?: number }).status === 409) {
        session.blocked = true
        await prefs.remove(key)
        toast.error(i18n.t('playlistProgressConflict'))
      }
    }
  }).catch(() => {})
}

let installed = false
function installPlaylistSync(): void {
 if (installed) return
 installed = true
 usePlayerStore.subscribe((s, previous) => {
  if (s.currentSong?.id !== previous.currentSong?.id || s.sourcePlaylistId !== previous.sourcePlaylistId) {
    flushPlaylistProgress({ snapshot: previous })
  }
  if ((s.currentSong?.id !== previous.currentSong?.id || s.confirmedSongId == null) && s.sourcePlaylistId === active?.id) {
    if (active) active.ready = false
  }
  if (!restoring && s.confirmedSongId === s.currentSong?.id && s.isPlaying && !s.isBuffering && s.sourcePlaylistId === active?.id) {
    if (active) active.ready = true
  }
  const now = Date.now()
  if ((s.isPlaying && now - lastSave >= 5000) || (previous.isPlaying && !s.isPlaying) || s.playMode !== previous.playMode || Math.abs(s.currentTime - previous.currentTime) > 1500) {
    lastSave = now
    flushPlaylistProgress({ completed: s.playlistCompleted ?? false, modeOnly: s.playMode !== previous.playMode })
  }
})
subscribeAppVisibility(visible => { if (!visible) flushPlaylistProgress() })
}

/** A playlist tap always resolves its complete order independently of page search. */
export async function playPlaylistTarget(options: { id: number; song?: Song; resume?: boolean }): Promise<void> {
  installPlaylistSync()
  flushPlaylistProgress()
  await writes
  const run = ++generation
  const api = getPlaylistApi()
  const [playlist, fetchedProgress] = await Promise.all([
    api.getPlaylist(options.id),
    api.getProgress(options.id).catch(() => null),
  ])
  let progress = fetchedProgress
  if (progress) {
    const prefs = getSongloftStorage().prefs
    const key = `playlist_pending:${appConfig.baseUrl}:${options.id}`
    try {
      const pending = await prefs.get(key)
      if (pending) {
        const body = JSON.parse(pending)
        if (body.version === progress.version) progress = await api.saveProgress(options.id, body)
        await prefs.remove(key)
      }
    } catch { /* Retry a pending snapshot on the next explicit playback request. */ }
  }
  if (run !== generation) return
  const state = usePlayerStore.getState()
  const continuing = !!options.resume && !!progress?.song && !progress.invalid && !progress.completed
  const reuseAudio = continuing && state.sourcePlaylistId === options.id && state.currentSong?.id === Number(progress?.song?.id)
  const mode = progress?.play_mode || (playlist.labels.includes('audiobook') ? 'order' : state.playMode)
  active = progress ? { id: options.id, version: progress.version, blocked: false, ready: reuseAudio && state.confirmedSongId === state.currentSong?.id } : undefined
  state.setPlayMode(mode as PlayMode)
  const sort = { sort: playlist.sortBy, order: playlist.sortOrder }
  const ids = await api.getPlaylistSongIds(options.id, sort)
  if (run !== generation || ids.length === 0) return
  const target = reuseAudio ? state.currentSong : options.song ?? (continuing ? parseSong(progress!.song) : undefined)
  const targetId = target?.id ?? ids[0]
  const index = ids.indexOf(targetId)
  if (index < 0) throw new Error(i18n.t('playlistProgressInvalid'))
  if (reuseAudio && state.playlist.length === ids.length && state.playlist.every((song, i) => song.id === ids[i])) {
    if (!state.isPlaying) await state.togglePlay()
    return
  }
  const context = reuseAudio ? state.playbackContext : playlistContext(options.id)
  let started = false
  let playing: Promise<void> = Promise.resolve()
  const isCurrent = () => run === generation && (!started || usePlayerStore.getState().playbackContext === context)
  restoring = continuing && !reuseAudio
  try {
    const complete = await loadPlaylistWindow({
      targetIndex: index,
      total: ids.length,
      fetch: (offset, limit) => api.getPlaylistSongs(options.id, sort, { offset, limit }).then(page => page.songs),
      isCurrent,
      onWindow: (songs, window) => {
        if (window.initial && !reuseAudio) {
          const localIndex = songs.findIndex(song => song.id === targetId)
          if (localIndex < 0) throw new Error(i18n.t('playlistProgressInvalid'))
          playing = usePlayerStore.getState().playPlaylist(songs, localIndex, context, {
            initialPositionMs: continuing && !options.song ? progress!.position_ms : 0,
          })
          usePlayerStore.setState({ queueHydrating: !window.complete })
        } else {
          usePlayerStore.getState().hydratePlaylistQueue(songs, window.complete)
          if (window.initial && !state.isPlaying) playing = usePlayerStore.getState().togglePlay()
        }
        started = true
        if (window.initial) {
          playing = playing.then(() => {
            if (!isCurrent()) return
            restoring = false
            if (active && usePlayerStore.getState().confirmedSongId === usePlayerStore.getState().currentSong?.id) active.ready = true
          })
          void playing.catch(() => {})
        }
      },
    })
    if (!complete || !isCurrent()) return
    await playing
    if (isCurrent()) flushPlaylistProgress()
  } catch (error) {
    if (isCurrent()) toast.error(i18n.t('playlistQueueLoadFailed'))
  } finally {
    if (isCurrent()) {
      usePlayerStore.setState({ queueHydrating: false })
      restoring = false
    }
  }
}
