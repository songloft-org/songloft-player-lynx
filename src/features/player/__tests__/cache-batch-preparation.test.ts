import { beforeEach, expect, test, vi } from 'vitest'
import { parseSong } from '../../../models/song.js'
import { cacheNamespace } from '../domain/cache-identity.js'
import { setCachedAccessToken } from '../../../core/network/token-cache.js'

const fixture = vi.hoisted(() => ({ namespace: '', tracks: vi.fn(), task: 0 }))
vi.mock('../../../core/storage/index.js', () => ({ getSongloftStorage: () => ({ prefs: { get: async () => null, set: async () => {} } }) }))
vi.mock('../../../native/platform-target.js', () => ({ getPlatformTarget: () => 'android' }))
vi.mock('../../../native/app-lifecycle.js', () => ({ subscribeAppResumed: vi.fn() }))
vi.mock('../../../store/app-session.js', () => ({ useAppSessionStore: { subscribe: vi.fn() } }))
vi.mock('../../settings/store/server-store.js', () => ({ useServerStore: { subscribe: vi.fn() } }))
vi.mock('../../library/api/index.js', () => ({ getSongsApi: () => ({ getTracks: fixture.tracks }) }))
vi.mock('../../playlist/api/index.js', () => ({ getPlaylistApi: vi.fn() }))
vi.mock('../store/player-store.js', () => ({ currentCacheVariant: vi.fn(), usePlayerStore: { getState: vi.fn() } }))
vi.mock('../data/cache-context.js', () => ({ currentCacheNamespace: () => fixture.namespace, captureCacheContext: vi.fn(), trackCacheDownload: vi.fn() }))
vi.mock('../data/song-cache-prefs.js', () => ({ readLocalCacheMaxSize: async () => 1000000 }))
vi.mock('../data/indexed-song-cache.js', () => ({ requireIndexedSongCache: async () => {}, indexedSongCacheAvailable: () => true,
  createCacheTaskId: () => `prepared-${++fixture.task}`, cacheIndexedSong: vi.fn(), cancelCacheTask: vi.fn(),
  readCacheTasks: vi.fn(), readIndexedSong: vi.fn(), subscribeCacheTask: vi.fn() }))
const { prepareCacheBatch } = await import('../data/cache-batch-controller.js')
const scope = { profile: 'profile', server: 'https://server.test/music', username: 'user' }
const namespace = cacheNamespace(scope)
const captured = { scope, namespace, context: { resolvedBaseUrl: 'https://server.test', basePath: '/music', accessToken: 'expired' },
  platform: 'android' as const, variant: { track: null, quality: '192' as const, normalize: true }, selectedSongId: 2, selectedTrack: 1 }
const songs = [1, 2, 3].map(id => parseSong({ id, title: `Song ${id}`, type: 'local', url: `/api/v1/songs/${id}/play`, format: 'mp3', updated_at: 'revision' }))
beforeEach(() => { vi.clearAllMocks(); fixture.namespace = namespace; fixture.task = 0; setCachedAccessToken('expired') })

test('all URLs freeze the refreshed token after metadata, including earlier songs, while retaining captured parameters', async () => {
  fixture.tracks.mockImplementation(async () => { setCachedAccessToken('refreshed'); return [{ index: 1, codec: 'aac', title: '', language: '', default: false }] })
  const result = await prepareCacheBatch(songs, captured)
  expect(result.failed).toEqual([])
  expect(result.requests).toHaveLength(3)
  for (const request of result.requests) {
    expect(request.url).toContain('https://server.test/music/api/v1/songs/')
    expect(request.url).toContain('access_token=refreshed')
    expect(request.url).toContain('quality=192'); expect(request.url).toContain('normalize=1')
  }
  expect(result.requests[0].url).not.toContain('track=')
  expect(result.requests[1].url).toContain('track=1')
  expect(JSON.parse(result.requests[1].key)[6]).toBe('m4a')
  setCachedAccessToken('later'); expect(result.requests[0].url).toContain('access_token=refreshed')
})
test('one unavailable selected track is recorded without dropping the remaining ordinary songs or leaking the raw error', async () => {
  fixture.tracks.mockRejectedValue(new Error('https://private.test?access_token=SECRET'))
  const result = await prepareCacheBatch(songs, captured)
  expect(result.requests.map(request => request.snapshot.id)).toEqual([1, 3])
  expect(result.failed).toHaveLength(1)
  expect(result.failed[0].snapshot.id).toBe(2)
  expect(result.failed[0].error).toBe('track_metadata_unavailable')
  expect(JSON.stringify(result.failed)).not.toContain('SECRET')
})
test('an identity change during metadata refresh rejects the entire submission', async () => {
  fixture.tracks.mockImplementation(async () => { fixture.namespace = 'other-user'; return [] })
  await expect(prepareCacheBatch(songs, captured)).rejects.toThrow('cancelled')
})
