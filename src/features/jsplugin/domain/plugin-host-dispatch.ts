import type { preparePluginVideoRoute } from '../../../core/navigation/route-back-action.js'
import { canWatchVideo } from '../../player/data/video-open.js'
import type { PluginHostReply } from './plugin-host-reply.js'
import { songToJson, type Song } from '../../../models/song.js'
import { playModes, type PlayMode } from '../../player/domain/play-mode.js'
import { playlistContext } from '../../player/domain/playback-context.js'
import { usePlayerStore } from '../../player/store/index.js'
import type { PlayerState } from '../../player/store/player-store.js'
import { getPlaylistApi } from '../../playlist/api/index.js'
import { useDlnaStore } from '../../player/store/dlna-store.js'
import {
  getPluginAudioEffects,
  hasPluginAudioEffects,
  setPluginAudioEffects,
} from '../../player/store/plugin-audio-effects.js'
import { refreshFavoritesFromPlugin } from '../../library/data/favorites.js'

export interface HostCallRequest {
  ns?: string
  method?: string
  params?: Record<string, unknown>
}

export interface HostCallResult {
  ok: boolean
  data?: unknown
  error?: string
  acknowledge?: true
}

export interface PluginHostContext {
  pluginEntryPath?: string
  isPluginActive?: () => boolean
  pluginNavigation?: (method: string, params: Record<string, unknown>) => void
  pluginOpenUrl?: (url: string) => void | Promise<void>
  confirmedPluginOpenUrl?: (url: string) => Promise<void>
  preparePluginVideo?: typeof preparePluginVideoRoute
  pluginResourceUrl?: (path: string) => Promise<string>
  pluginSocketRequest?: (
    method: string,
    params: Record<string, unknown>,
  ) => Promise<unknown>
  pluginApiRequest?: (params: Record<string, unknown>) => Promise<unknown>
  platform: string
  version: string
  resolveSongs: (ids: number[]) => Promise<Song[]>
  cookieProvider?: (origin: string) => Promise<Record<string, string>>
}

/**
 * The player state as pushed to plugins (`songloft-player-state`) and returned
 * from `player.getState` — the port of the Flutter dispatcher's `stateToJson`.
 * Exported for the Web iframe path, which posts it straight through postMessage.
 */
export function playerStateToJson(s = usePlayerStore.getState()) {
  return {
    queue: s.playlist.map(songToJson),
    current_index: s.currentIndex,
    current_song: s.currentSong ? songToJson(s.currentSong) : null,
    is_playing: s.isPlaying,
    current_time: s.currentTime / 1000,
    duration: s.duration / 1000,
    volume: s.volume,
    play_mode: s.playMode,
    source_playlist_id: s.sourcePlaylistId ?? null,
  }
}

/** Ignore position ticks, but include queue edits and every SDK-visible control change. */
export function pluginPlayerStateChanged(
  s: PlayerState,
  prev: PlayerState,
): boolean {
  return (
    s.playlist !== prev.playlist ||
    s.currentIndex !== prev.currentIndex ||
    s.currentSong !== prev.currentSong ||
    s.isPlaying !== prev.isPlaying ||
    s.playMode !== prev.playMode ||
    s.volume !== prev.volume ||
    s.duration !== prev.duration ||
    s.sourcePlaylistId !== prev.sourcePlaylistId
  )
}

function numberParam(
  params: Record<string, unknown>,
  key: string,
  fallback?: number,
): number {
  const value = params[key] ?? fallback
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${key} must be a finite number`)
  return value
}

function integerParam(
  params: Record<string, unknown>,
  key: string,
  fallback?: number,
): number {
  const value = numberParam(params, key, fallback)
  if (!Number.isSafeInteger(value)) throw new Error(`${key} must be an integer`)
  return value
}

function songIds(params: Record<string, unknown>): number[] {
  return Array.isArray(params.ids)
    ? params.ids.filter(
        (id): id is number =>
          typeof id === 'number' && Number.isSafeInteger(id),
      )
    : []
}

async function dispatchPlayer(
  method: string | undefined,
  params: Record<string, unknown>,
  ctx: PluginHostContext,
): Promise<unknown> {
  const store = usePlayerStore.getState()
  const localAudio = () => !useDlnaStore.getState().activeDevice
  const canWriteEffects = () => localAudio() && ctx.isPluginActive?.() === true
  const pluginPlayback = () => {
    if (!localAudio() || !hasPluginAudioEffects() || !ctx.pluginEntryPath) return undefined
    if (!canWriteEffects()) throw new Error('plugin page is no longer active')
    return { pluginOwner: ctx.pluginEntryPath }
  }

  switch (method) {
    case 'getState':
      return playerStateToJson()

    case 'getAudioEffects':
      return getPluginAudioEffects(ctx.pluginEntryPath, localAudio())

    case 'applyAudioEffects':
    case 'clearAudioEffects':
      return setPluginAudioEffects(
        ctx.pluginEntryPath,
        params.playbackId,
        method === 'applyAudioEffects' ? params.effects : {},
        canWriteEffects,
      )

    case 'setQueue': {
      const songs = await ctx.resolveSongs(songIds(params))
      if (songs.length === 0) throw new Error('no valid songs resolved')
      const startIndex = integerParam(params, 'startIndex', 0)
      // Plugins only ever express a playlist source (the inbound key is
      // `sourcePlaylistId`), so facet contexts are not reachable from here.
      const context =
        params.sourcePlaylistId != null
          ? playlistContext(integerParam(params, 'sourcePlaylistId'))
          : undefined
      await store.playPlaylist(songs, startIndex, context, pluginPlayback())
      return null
    }

    case 'addToQueue':
      store.addToPlaylist(await ctx.resolveSongs(songIds(params)))
      return null

    case 'insertToQueue': {
      const index = integerParam(params, 'index')
      const songs = await ctx.resolveSongs([integerParam(params, 'id')])
      if (songs.length === 0) throw new Error('song not found')
      store.insertToPlaylist(index, songs[0])
      return null
    }

    case 'removeFromQueue':
      await store.removeFromPlaylist(integerParam(params, 'index'))
      return null

    case 'reorderQueue':
      store.reorderPlaylist(
        integerParam(params, 'oldIndex'),
        integerParam(params, 'newIndex'),
      )
      return null

    case 'clearQueue':
      store.clearPlaylist()
      return null

    case 'playPlaylistById': {
      const playlistId = integerParam(params, 'playlistId')
      try {
        const api = getPlaylistApi()
        const playlist = await api.getPlaylist(playlistId)
        const filters = {
          sort: playlist.sortBy ?? 'position',
          order: playlist.sortOrder ?? 'asc',
        }
        const first = await api.getPlaylistSongs(playlistId, filters, {
          offset: 0,
          limit: 10,
        })
        if (first.songs.length === 0) return 0
        // Start immediately; the existing loader cancels fills after a queue replacement/clear.
        const playing = store.playAll(first.songs, playlistContext(playlistId), pluginPlayback())
        usePlayerStore.getState().loadRemainingSongsForCurrentPlaylist({
          loadedCount: first.songs.length,
          total: first.total,
          fetch: async (offset, limit) =>
            (await api.getPlaylistSongs(playlistId, filters, { offset, limit }))
              .songs,
        })
        await playing
        return first.total
      } catch {
        return -1
      }
    }

    case 'play': {
      const id = params.id != null ? integerParam(params, 'id') : undefined
      if (id != null) {
        const songs = await ctx.resolveSongs([id])
        if (songs.length === 0) throw new Error('song not found')
        await store.playSong(songs[0], undefined, pluginPlayback())
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
      await store.seek(Math.round(numberParam(params, 'seconds') * 1000))
      return null

    case 'setVolume':
      await store.setVolume(numberParam(params, 'volume'))
      return null

    case 'setPlayMode':
      store.setPlayMode(
        playModes.includes(params.mode as PlayMode)
          ? (params.mode as PlayMode)
          : 'order',
      )
      return null

    default:
      throw new Error(`unknown player method: ${method}`)
  }
}

export async function handlePluginHostCall(
  req: HostCallRequest,
  ctx: PluginHostContext,
): Promise<PluginHostReply> {
  try {
    if (!req || typeof req !== 'object') throw new Error('invalid request')
    const { ns, method } = req
    const params =
      req.params && typeof req.params === 'object' && !Array.isArray(req.params)
        ? req.params
        : {}

    if (
      ns === 'plugin' &&
      (method === 'navigationState' || method === 'navigationResult')
    ) {
      ctx.pluginNavigation?.(method, params)
      return { ok: true, data: null }
    }
    if (ns === 'plugin' && method === 'openUrl') {
      const url = params.url
      if (typeof url !== 'string' || !/^https?:\/\/[^\s\\/?#]+(?:[/?#]|$)/i.test(url) ||
          /[\s\\\u0000-\u001f\u007f]/.test(url))
        throw new Error('invalid external URL')
      const open = ctx.confirmedPluginOpenUrl ?? ctx.pluginOpenUrl
      if (!open) throw new Error('external URLs are unavailable')
      if (ctx.isPluginActive?.() === false) throw new Error('plugin page is no longer active')
      await open(url)
      return { ok: true, data: null }
    }
    if (ns === 'plugin' && method === 'resourceUrl') {
      if (typeof params.path !== 'string' || !ctx.pluginResourceUrl)
        throw new Error('resource URL unavailable')
      return { ok: true, data: await ctx.pluginResourceUrl(params.path) }
    }
    if (
      ns === 'plugin' &&
      ['socketOpen', 'socketSend', 'socketClose'].includes(method || '')
    ) {
      if (!ctx.pluginSocketRequest)
        throw new Error('plugin sockets are unavailable')
      return { ok: true, data: await ctx.pluginSocketRequest(method!, params) }
    }

    if (ns === 'plugin' && method === 'apiRequest') {
      if (!ctx.pluginApiRequest) throw new Error('plugin API is unavailable')
      return { ok: true, data: await ctx.pluginApiRequest(params) }
    }

    if (ns === 'host') {
      if (method === 'getInfo') {
        return {
          ok: true,
          data: {
            version: ctx.version,
            platform: ctx.platform,
            capabilities: [
              'player',
              ...(hasPluginAudioEffects() ? ['player.audioEffects'] : []),
              ...(ctx.confirmedPluginOpenUrl ? ['plugin.openUrl'] : []),
              ...(ctx.preparePluginVideo ? ['player.openVideo'] : []),
            ],
          },
        }
      }
      throw new Error(`unknown host method: ${method}`)
    }

    if (ns === 'player' && method === 'openVideo') {
      const id = integerParam(params, 'id')
      if (id <= 0) throw new Error('id must be a positive integer')
      const route = ctx.preparePluginVideo?.(ctx.pluginEntryPath ?? '')
      const isCurrent = () => route?.isCurrent() && ctx.isPluginActive?.() === true
      if (!route || !isCurrent() || useDlnaStore.getState().activeDevice)
        throw new Error('fullscreen video is unavailable')
      if (params.__songloftReplyAck !== true)
        throw new Error('fullscreen video requires an updated plugin SDK bridge')

      const [song] = await ctx.resolveSongs([id])
      if (!song) throw new Error('song not found')
      if (!canWatchVideo(song)) throw new Error('video is unavailable for this song')
      if (!isCurrent() || useDlnaStore.getState().activeDevice)
        throw new Error('fullscreen video is unavailable')
      return {
        ok: true,
        data: null,
        afterReply: async () => {
          if (!isCurrent() || useDlnaStore.getState().activeDevice) return
          const player = usePlayerStore.getState()
          if (player.currentSong?.id !== song.id) {
            await player.playSong(song)
          } else if (!player.isPlaying && !player.isBuffering) {
            await player.togglePlay()
          }
          if (isCurrent() && usePlayerStore.getState().currentSong?.id === song.id &&
              !useDlnaStore.getState().activeDevice) await route.open()
        },
      }
    }

    if (ns === 'player') {
      const data = await dispatchPlayer(method, params, ctx)
      return { ok: true, data }
    }

    if (ns === 'favorite') {
      if (method !== 'refresh')
        throw new Error(`unknown favorite method: ${method}`)
      const songId =
        params.songId != null ? integerParam(params, 'songId') : undefined
      const isFavorited =
        typeof params.isFavorited === 'boolean' ? params.isFavorited : undefined
      await refreshFavoritesFromPlugin(songId, isFavorited)
      return { ok: true, data: null }
    }

    if (ns === 'cookies') {
      if (method !== 'get') throw new Error(`unknown cookies method: ${method}`)
      if (!ctx.cookieProvider)
        throw new Error('getCookies is not available on this platform')
      const origin = params.origin
      if (typeof origin !== 'string' || !origin)
        throw new Error('origin is required')
      // URL is not a universal Lynx global; validate without browser APIs.
      if (!/^https?:\/\/[^\s/?#]+(?:[/?#]|$)/i.test(origin)) {
        throw new Error('invalid origin: must include scheme and host')
      }
      return { ok: true, data: await ctx.cookieProvider(origin) }
    }

    throw new Error(`unknown namespace: ${ns}`)
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) }
  }
}
