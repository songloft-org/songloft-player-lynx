import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { parseSong } from '../../../models/song.js'
import { usePlayerStore } from '../../player/store/index.js'
import { handlePluginHostCall, playerStateToJson, pluginPlayerStateChanged, type PluginHostContext } from '../domain/plugin-host-dispatch.js'
import { createPluginReplyGate } from '../domain/plugin-host-reply.js'
import { pluginHostContext } from '../domain/plugin-host-context.js'

const h = vi.hoisted(() => ({ playlist: vi.fn(), favorite: vi.fn() }))
vi.mock('../../playlist/api/index.js', () => ({ getPlaylistApi: () => ({
  getPlaylistSongs: h.playlist, touchPlaylist: async () => {},
  getPlaylist: async () => ({ sortBy: 'title', sortOrder: 'desc' }),
}) }))
vi.mock('../../library/data/favorites.js', () => ({
  refreshFavoritesFromPlugin: h.favorite, getFavoriteState: async () => false, toggleFavoriteNonReact: vi.fn(),
}))
vi.mock('../../player/store/lyric-store.js', () => ({
  useLyricStore: { getState: () => ({ loadForSong() {}, clear() {}, syncPosition() {} }) },
}))

const song = (id: number) => parseSong({ id, type: 'remote', title: `Song ${id}`, duration: 60,
  cover_url: `/covers/${id}.png`, lyric_url: `/lyrics/${id}`, is_live: false })
const ctx: PluginHostContext = { platform: 'android', version: 'dev',
  resolveSongs: async ids => ids.filter(id => id !== 404).map(song) }
const call = (method: string, params?: Record<string, unknown>) => handlePluginHostCall({ ns: 'player', method, params }, ctx)
const ids = () => usePlayerStore.getState().playlist.map(s => s.id)

beforeEach(() => { vi.useFakeTimers(); usePlayerStore.getState().reset(); vi.clearAllMocks() })
afterEach(() => { usePlayerStore.getState().reset(); vi.useRealTimers() })

test.each([
  ['win32', 'windows'],
  ['darwin', 'macos'],
] as const)('reports the packaged client version through the %s plugin bridge', async (os, platform) => {
  vi.stubGlobal('lynx', {
    __globalProps: { songloftDesktop: {
      id: 'org.songloft.lynx.desktop.dev',
      token: 'test',
      os,
      build: { version: '2.13.16' },
    } },
  })
  try {
    expect(await handlePluginHostCall({ ns: 'host', method: 'getInfo' }, pluginHostContext))
      .toMatchObject({ ok: true, data: { platform, version: '2.13.16' } })
  } finally {
    vi.unstubAllGlobals()
  }
})

test('all queue SDK operations preserve the playing occurrence and Flutter insertion indices', async () => {
  expect(await call('setQueue', { ids: [1, 404, 2, 3], startIndex: 1, sourcePlaylistId: 7 })).toEqual({ ok: true, data: null })
  await call('addToQueue', { ids: [3, 4] })
  expect(ids()).toEqual([1, 2, 3, 4])
  await call('insertToQueue', { index: 0, id: 2 })
  expect(ids()).toEqual([2, 1, 2, 3, 4])
  expect(usePlayerStore.getState().currentIndex).toBe(2)
  await call('reorderQueue', { oldIndex: 2, newIndex: 5 })
  expect(ids()).toEqual([2, 1, 3, 4, 2])
  expect(usePlayerStore.getState().currentIndex).toBe(4)
  await call('removeFromQueue', { index: 0 })
  expect(usePlayerStore.getState().currentIndex).toBe(3)
  expect(usePlayerStore.getState().sourcePlaylistId).toBe(7)
  await call('clearQueue')
  expect(ids()).toEqual([])
  expect(usePlayerStore.getState().isPlaying).toBe(false)
})

test('play(id) selects or appends without throwing the existing queue away', async () => {
  await call('setQueue', { ids: [1, 2, 3] })
  await call('play', { id: 2 })
  expect(ids()).toEqual([1, 2, 3])
  expect(usePlayerStore.getState().currentIndex).toBe(1)
  await call('play', { id: 4 })
  expect(ids()).toEqual([1, 2, 3, 4])
})

test('controls, seconds, percent volume, and complete snake_case snapshots', async () => {
  await call('setQueue', { ids: [1, 2, 3], sourcePlaylistId: 9 })
  await call('next'); expect(usePlayerStore.getState().currentSong?.id).toBe(2)
  await call('prev'); expect(usePlayerStore.getState().currentSong?.id).toBe(1)
  await call('seek', { seconds: 1.25 }); expect(usePlayerStore.getState().currentTime).toBe(1250)
  await call('setVolume', { volume: 65 }); expect(usePlayerStore.getState().volume).toBe(65)
  await call('pause'); expect(usePlayerStore.getState().isPlaying).toBe(false)
  await call('play'); expect(usePlayerStore.getState().isPlaying).toBe(true)
  await call('togglePlay'); expect(usePlayerStore.getState().isPlaying).toBe(false)
  // Engine duration may differ from the metadata duration.
  usePlayerStore.setState({ duration: 61500 })
  expect(await call('getState')).toMatchObject({ ok: true, data: {
    current_song: { id: 1, type: 'remote', cover_url: '/covers/1.png', lyric_url: '/lyrics/1' },
    current_time: 1.25, duration: 61.5, volume: 65, source_playlist_id: 9,
  } })
  expect(playerStateToJson().queue[0]).toHaveProperty('is_live', false)
})

test('singlePlay stops on completion while manual next and previous still work', async () => {
  await call('setQueue', { ids: [1, 2, 3] })
  expect(await call('setPlayMode', { mode: 'singlePlay' })).toEqual({ ok: true, data: null })
  usePlayerStore.getState()._onCompleted()
  expect(usePlayerStore.getState().currentSong?.id).toBe(1)
  expect(usePlayerStore.getState().isPlaying).toBe(false)
  await call('next'); expect(usePlayerStore.getState().currentSong?.id).toBe(2)
  await call('prev'); expect(usePlayerStore.getState().currentSong?.id).toBe(1)
})

test('playlist id starts the first page, fills remaining songs and returns total; empty/error retain queue', async () => {
  h.playlist.mockResolvedValueOnce({ songs: [song(1), song(2)], total: 3 })
    .mockResolvedValueOnce({ songs: [song(3)], total: 3 })
  expect(await call('playPlaylistById', { playlistId: 8 })).toEqual({ ok: true, data: 3 })
  await vi.advanceTimersByTimeAsync(0)
  expect(ids()).toEqual([1, 2, 3])
  expect(usePlayerStore.getState().sourcePlaylistId).toBe(8)
  expect(h.playlist.mock.calls[1]).toEqual([8, { sort: 'title', order: 'desc' }, { offset: 2, limit: 100 }])
  h.playlist.mockResolvedValueOnce({ songs: [], total: 0 })
  expect(await call('playPlaylistById', { playlistId: 9 })).toEqual({ ok: true, data: 0 })
  h.playlist.mockRejectedValueOnce(new Error('offline'))
  expect(await call('playPlaylistById', { playlistId: 9 })).toEqual({ ok: true, data: -1 })
  expect(ids()).toEqual([1, 2, 3])
})

test('state subscriptions detect volume, source and same-length queue edits, ignoring position ticks', () => {
  const s = usePlayerStore.getState()
  expect(pluginPlayerStateChanged({ ...s, volume: 44 }, s)).toBe(true)
  expect(pluginPlayerStateChanged({ ...s, playlist: [...s.playlist] }, s)).toBe(true)
  expect(pluginPlayerStateChanged({ ...s, sourcePlaylistId: 3 }, s)).toBe(true)
  expect(pluginPlayerStateChanged({ ...s, duration: 12 }, s)).toBe(true)
  expect(pluginPlayerStateChanged({ ...s, currentTime: 1000 }, s)).toBe(false)
})

test('favorite, cookies, host info, null params and explicit errors share one result envelope', async () => {
  expect(await handlePluginHostCall({ ns: 'host', method: 'getInfo', params: null as never }, ctx))
    .toMatchObject({ ok: true, data: { platform: 'android', version: 'dev' } })
  await handlePluginHostCall({ ns: 'favorite', method: 'refresh', params: { songId: 2, isFavorited: false } }, ctx)
  expect(h.favorite).toHaveBeenCalledWith(2, false)
  await handlePluginHostCall({ ns: 'favorite', method: 'refresh' }, ctx)
  expect(h.favorite).toHaveBeenLastCalledWith(undefined, undefined)
  const provider = vi.fn(async () => ({ session: 'a=b' }))
  expect(await handlePluginHostCall({ ns: 'cookies', method: 'get', params: { origin: 'https://example.com' } }, { ...ctx, cookieProvider: provider }))
    .toEqual({ ok: true, data: { session: 'a=b' } })
  expect(await handlePluginHostCall({ ns: 'cookies', method: 'get' }, ctx)).toMatchObject({ ok: false, error: expect.stringContaining('not available') })
  expect(await handlePluginHostCall({ ns: 'cookies', method: 'get', params: { origin: 'invalid' } }, { ...ctx, cookieProvider: provider })).toMatchObject({ ok: false })
  expect(provider).toHaveBeenCalledTimes(1)
  for (const method of ['addToQueue', 'insertToQueue', 'removeFromQueue', 'reorderQueue', 'clearQueue']) {
    expect(await call(method, { index: NaN, oldIndex: NaN, id: 404 })).toMatchObject({ ok: method === 'addToQueue' || method === 'clearQueue' })
  }
  expect(await call('play', { id: 404 })).toMatchObject({ ok: false, error: 'song not found' })
  expect(await call('seek', { seconds: '1' })).toMatchObject({ ok: false })
  expect(await call('missing')).toMatchObject({ ok: false, error: expect.stringContaining('unknown player') })
  expect(await handlePluginHostCall({ ns: 'missing' }, ctx)).toMatchObject({ ok: false })
})

test('Android effects follow the owning plugin queue, clear without stopping, and reject stale writes', async () => {
  const setPluginEqualizer = vi.fn((_: string, reply: (ok: boolean) => void) => reply(true))
  vi.stubGlobal('SystemInfo', { platform: 'Android' })
  vi.stubGlobal('NativeModules', { SongloftAudio: {
    getPluginEqualizerAvailable: (reply: (available: boolean) => void) => reply(true),
    setPluginEqualizer,
  } })
  const ownedCall = (method: string, params?: Record<string, unknown>, owner = 'effects') =>
    handlePluginHostCall({ ns: 'player', method, params }, {
      ...ctx, pluginEntryPath: owner, isPluginActive: () => true,
    })
  try {
    expect(await ownedCall('getAudioEffects')).toMatchObject({
      ok: true, data: { playbackId: null, supported: { equalizer: { presets: expect.arrayContaining(['vocal']) } } },
    })
    await ownedCall('setQueue', { ids: [1, 2] })
    const query = await ownedCall('getAudioEffects')
    const { playbackId } = query.data as { playbackId: string }
    expect(playbackId).toEqual(expect.any(String))

    const effects = { equalizer: { preset: 'vocal' } }
    expect(await ownedCall('applyAudioEffects', { playbackId, effects }, 'other')).toMatchObject({ ok: false })
    expect(await ownedCall('applyAudioEffects', {
      playbackId, effects: { ...effects, reverb: { preset: 'hall' } },
    })).toMatchObject({ ok: false })
    expect(setPluginEqualizer).not.toHaveBeenCalled()

    const originalHasOwn = Object.hasOwn
    let applyResult
    try {
      // Lynx Android's JS runtime does not implement the Node host's Object.hasOwn.
      Reflect.deleteProperty(Object, 'hasOwn')
      applyResult = await ownedCall('applyAudioEffects', { playbackId, effects })
    } finally {
      Object.defineProperty(Object, 'hasOwn', {
        value: originalHasOwn, writable: true, configurable: true,
      })
    }
    expect(applyResult).toEqual({ ok: true, data: effects })
    const profile = JSON.parse(setPluginEqualizer.mock.calls[0][0])
    expect(profile.frequencies).toHaveLength(10)
    expect(profile.gains).toContain(4)
    await ownedCall('play', { id: 2 })
    expect(await ownedCall('getAudioEffects')).toMatchObject({ data: { playbackId, applied: effects } })

    expect(await ownedCall('clearAudioEffects', { playbackId })).toEqual({ ok: true, data: null })
    expect(await ownedCall('clearAudioEffects', { playbackId })).toEqual({ ok: true, data: null })
    expect(usePlayerStore.getState().isPlaying).toBe(true)
    await ownedCall('applyAudioEffects', { playbackId, effects })
    await usePlayerStore.getState().playSong(song(3))
    expect(setPluginEqualizer.mock.calls.at(-1)?.[0]).toBe('')
    expect(await ownedCall('applyAudioEffects', { playbackId, effects })).toMatchObject({ ok: false })
    expect(await ownedCall('getAudioEffects')).toMatchObject({ data: { playbackId: null, applied: null } })
    await ownedCall('play', { id: 1 })
    await ownedCall('setPlayMode', { mode: 'singlePlay' })
    usePlayerStore.getState()._onCompleted()
    expect(await ownedCall('getAudioEffects')).toMatchObject({ data: { playbackId: null } })
  } finally {
    vi.unstubAllGlobals()
  }
})

test('the external URL call waits for the OS handoff and reports unsupported and invalid URLs', async () => {
  const url = 'https://example.com/search?q=MV'
  let complete!: () => void
  const open = vi.fn(() => new Promise<void>((resolve) => { complete = resolve }))
  const request = (value: string) => ({ ns: 'plugin', method: 'openUrl', params: { url: value } })
  const android = { ...ctx, confirmedPluginOpenUrl: open, isPluginActive: () => true }
  expect(await handlePluginHostCall(request('https:///bad'), android)).toMatchObject({ ok: false })
  expect(await handlePluginHostCall(request('file:///video.mp4'), android)).toMatchObject({ ok: false })
  expect(await handlePluginHostCall(request(url), ctx)).toMatchObject({ ok: false })
  expect(open).not.toHaveBeenCalled()

  const settled = vi.fn()
  const result = handlePluginHostCall(request(url), android).then(settled)
  expect(open).toHaveBeenCalledWith(url)
  expect(settled).not.toHaveBeenCalled()
  complete()
  await result
  expect(settled).toHaveBeenCalledWith({ ok: true, data: null })

  open.mockRejectedValueOnce(new Error('could not open external URL'))
  expect(await handlePluginHostCall(request(url), android))
    .toEqual({ ok: false, error: 'could not open external URL' })
})

test('fullscreen waits for the correlated plugin receipt and preserves the current video position', async () => {
  vi.stubGlobal('SystemInfo', { platform: 'Android' })
  vi.stubGlobal('NativeModules', { SongloftVideo: {} })
  const video = parseSong({
    id: 5, type: 'remote', title: 'MV', is_video: true, format: 'mp4', duration: 60,
    url: '/api/v1/songs/5/play',
  })
  const open = vi.fn(async () => {})
  const resolveSongs = vi.fn(async () => [video])
  const android = {
    ...ctx, pluginEntryPath: 'mv', isPluginActive: () => true, resolveSongs,
    preparePluginVideo: () => ({ isCurrent: () => true, open }),
  }
  const request = { ns: 'player', method: 'openVideo', params: { id: 5, __songloftReplyAck: true } }
  try {
    const store = usePlayerStore.getState()
    await store.playSong(video)
    await store.seek(12300)
    const reply = await handlePluginHostCall(request, android)
    const gate = createPluginReplyGate()
    expect(gate.stage('open-1', reply)).toEqual({ ok: true, data: null, acknowledge: true })
    gate.confirm('open-unknown')
    await Promise.resolve()
    expect(open).not.toHaveBeenCalled()
    gate.confirm('open-1')
    gate.confirm('open-1')
    await Promise.resolve()
    expect(open).toHaveBeenCalledExactlyOnceWith()
    expect(usePlayerStore.getState().currentTime).toBe(12300)

    const obsolete = await handlePluginHostCall(request, {
      ...android, preparePluginVideo: () => ({ isCurrent: () => true, open }),
    })
    gate.stage('open-2', obsolete)
    gate.clear()
    gate.confirm('open-2')
    await Promise.resolve()
    expect(open).toHaveBeenCalledTimes(1)
  } finally {
    vi.unstubAllGlobals()
  }
})
