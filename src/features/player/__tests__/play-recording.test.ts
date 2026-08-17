import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Song } from '../../../models/song.js'
import { facetContext, playlistContext } from '../domain/playback-context.js'

/**
 * What gets reported to `POST /songs/{id}/played`, and when.
 *
 * A dedicated file because the songs/playlist API modules have to be mocked
 * before the store module is imported (same reason as
 * `position-persistence.test.ts`). This is the pairing that the shipped bug got
 * wrong in both directions: playback with a context recorded nothing, and
 * playback without one still called the endpoint with a `'library'` context type
 * the backend does not accept.
 */
const recordPlayed = vi.fn(async () => {})
vi.mock('../../library/api/index.js', () => ({
  getSongsApi: () => ({ recordPlayed }),
}))

const touchPlaylist = vi.fn(async () => {})
vi.mock('../../playlist/api/index.js', () => ({
  getPlaylistApi: () => ({ touchPlaylist }),
}))

const { usePlayerStore } = await import('../store/player-store.js')

function song(id: number): Song {
  return {
    id,
    type: 'local',
    title: `Song ${id}`,
    year: 0,
    duration: 30,
    fileSize: 0,
    bitRate: 0,
    sampleRate: 0,
    isLive: false,
    isVideo: false,
    addedAt: '',
    updatedAt: '',
  } as Song
}

/** Flush the async load/play chain in `playAtIndex`. */
async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  usePlayerStore.getState().reset()
  vi.clearAllMocks()
})

afterEach(() => {
  usePlayerStore.getState().reset()
  vi.useRealTimers()
})

describe('play event recording', () => {
  test('a playlist context is reported, and exposes its ID for the Home highlight', async () => {
    await usePlayerStore.getState().playPlaylist([song(1)], 0, playlistContext(7))
    await flush()

    expect(recordPlayed).toHaveBeenCalledWith(1, { type: 'playlist', key: '7' })
    expect(usePlayerStore.getState().playbackContext).toEqual({ type: 'playlist', key: '7' })
    expect(usePlayerStore.getState().sourcePlaylistId).toBe(7)
    expect(touchPlaylist).toHaveBeenCalledWith(7)
  })

  test('a facet context is reported and carries no playlist ID', async () => {
    await usePlayerStore.getState().playPlaylist([song(2)], 0, facetContext('artist', '周杰伦'))
    await flush()

    expect(recordPlayed).toHaveBeenCalledWith(2, { type: 'artist', key: '周杰伦' })
    expect(usePlayerStore.getState().sourcePlaylistId).toBeUndefined()
    // A facet drill-in is not a playlist, so nothing should be touched.
    expect(touchPlaylist).not.toHaveBeenCalled()
  })

  test('playback with no context still reports the event, but without a context', async () => {
    // The flat library list is not a context, so there is no history bucket to
    // record into — but the event is still worth sending: the backend broadcasts
    // it to subscribed JS plugins. The old code invented `context_type:
    // 'library'` here, a value the backend does not accept.
    await usePlayerStore.getState().playPlaylist([song(3)], 0)
    await flush()

    expect(recordPlayed).toHaveBeenCalledWith(3, undefined)
    expect(usePlayerStore.getState().playbackContext).toBeUndefined()
  })

  test('playSong clears a previous context instead of inheriting it', async () => {
    await usePlayerStore.getState().playPlaylist([song(1)], 0, playlistContext(7))
    await flush()
    vi.clearAllMocks()

    await usePlayerStore.getState().playSong(song(9))
    await flush()

    // Would otherwise be recorded into playlist 7, which it was not played from.
    expect(usePlayerStore.getState().playbackContext).toBeUndefined()
    expect(usePlayerStore.getState().sourcePlaylistId).toBeUndefined()
    expect(recordPlayed).toHaveBeenCalledWith(9, undefined)
  })
})
