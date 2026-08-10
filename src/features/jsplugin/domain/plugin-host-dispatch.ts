import type { Song } from '../../../models/song.js'
import type { PlayMode } from '../../player/domain/play-mode.js'
import { usePlayerStore } from '../../player/store/index.js'

export interface HostCallRequest {
  ns?: string
  method?: string
  params?: Record<string, unknown>
}

export interface HostCallResult {
  ok: boolean
  data?: unknown
  error?: string
}

export interface PluginHostContext {
  platform: string
  version: string
  resolveSongs: (ids: number[]) => Promise<Song[]>
}

function playerStateToJson() {
  const s = usePlayerStore.getState()
  return {
    queue: s.playlist.map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      duration: song.duration,
    })),
    current_index: s.currentIndex,
    current_song: s.currentSong
      ? { id: s.currentSong.id, title: s.currentSong.title, artist: s.currentSong.artist }
      : null,
    is_playing: s.isPlaying,
    current_time: s.currentTime / 1000,
    duration: (s.currentSong?.duration ?? 0),
    volume: s.volume,
    play_mode: s.playMode,
    source_playlist_id: s.sourcePlaylistId ?? null,
  }
}

async function dispatchPlayer(
  method: string | undefined,
  params: Record<string, unknown>,
  ctx: PluginHostContext,
): Promise<unknown> {
  const store = usePlayerStore.getState()

  switch (method) {
    case 'getState':
      return playerStateToJson()

    case 'setQueue': {
      const ids = Array.isArray(params.ids) ? params.ids.map(Number) : []
      const songs = await ctx.resolveSongs(ids)
      if (songs.length === 0) throw new Error('no valid songs resolved')
      const startIndex = Number(params.startIndex ?? 0)
      const playlistId = params.sourcePlaylistId != null ? Number(params.sourcePlaylistId) : undefined
      await store.playPlaylist(songs, startIndex, playlistId)
      return null
    }

    case 'play': {
      const id = params.id != null ? Number(params.id) : undefined
      if (id != null) {
        const songs = await ctx.resolveSongs([id])
        if (songs.length === 0) throw new Error('song not found')
        await store.playPlaylist(songs, 0)
      } else if (!store.isPlaying) {
        await store.togglePlay()
      }
      return null
    }

    case 'pause':
      if (store.isPlaying) await store.togglePlay()
      return null

    case 'togglePlay':
      await store.togglePlay()
      return null

    case 'next':
      await store.playNext()
      return null

    case 'prev':
      await store.playPrev()
      return null

    case 'seek':
      await store.seek(Number(params.seconds ?? 0) * 1000)
      return null

    case 'setVolume':
      await store.setVolume(Number(params.volume ?? 1))
      return null

    case 'setPlayMode':
      store.setPlayMode(String(params.mode ?? 'order') as PlayMode)
      return null

    default:
      throw new Error(`unknown player method: ${method}`)
  }
}

export async function handlePluginHostCall(
  req: HostCallRequest,
  ctx: PluginHostContext,
): Promise<HostCallResult> {
  try {
    const { ns, method, params = {} } = req

    if (ns === 'host') {
      if (method === 'getInfo') {
        return {
          ok: true,
          data: {
            version: ctx.version,
            platform: ctx.platform,
            capabilities: ['player'],
          },
        }
      }
      throw new Error(`unknown host method: ${method}`)
    }

    if (ns === 'player') {
      const data = await dispatchPlayer(method, params, ctx)
      return { ok: true, data }
    }

    throw new Error(`unknown namespace: ${ns}`)
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) }
  }
}
