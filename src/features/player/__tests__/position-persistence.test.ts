import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Song } from '../../../models/song.js'

/**
 * Behaviour tests for the two module-level `usePlayerStore.subscribe` side
 * effects: playback-position persistence and the iOS Live Activity mirror. Both
 * need their collaborators mocked before the store module registers the
 * subscriptions, hence a dedicated file.
 */

// Typed to the real signature so `mock.calls` destructures (positionMs is [2]).
const savePlaybackState = vi.fn(
  async (
    _playlist: Song[],
    _currentIndex: number,
    _positionMs: number,
    _sourcePlaylistId?: number,
  ) => {},
)
vi.mock('../data/playback-persistence.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  savePlaybackState,
}))

const liveActivity = {
  start: vi.fn(async (_t: string, _a: string) => 'activity-1'),
  update: vi.fn(async () => {}),
  end: vi.fn(async () => {}),
}
vi.mock('../../../native/live-activity.js', () => ({
  getLiveActivityModule: () => liveActivity,
}))

const { usePlayerStore, resetLiveActivityForTests } = await import('../store/player-store.js')

function song(id: number, durationSec = 300): Song {
  return {
    id,
    type: 'local',
    title: `Song ${id}`,
    artist: `Artist ${id}`,
    year: 0,
    duration: durationSec,
    fileSize: 0,
    bitRate: 0,
    sampleRate: 0,
    isLive: false,
    isVideo: false,
    addedAt: '',
    updatedAt: '',
  } as Song
}

/** The debounce window the persistence subscriber uses. */
const DEBOUNCE_MS = 2_000

beforeEach(() => {
  vi.useFakeTimers()
  usePlayerStore.getState().reset()
  resetLiveActivityForTests()
  vi.clearAllMocks()
})

afterEach(() => {
  usePlayerStore.getState().reset()
  vi.useRealTimers()
})

/**
 * The trigger used to be `|currentTime - prev.currentTime| > 5000`, and progress
 * arrives every 250–500ms — two orders of magnitude smaller, so it never fired.
 * The only deltas that ever cleared 5s were track changes resetting to 0, which
 * is why the persisted position was reliably 0 and "resume" always restarted the
 * track.
 */
describe('playback position persistence', () => {
  test('a position advancing in small ticks is still persisted', async () => {
    usePlayerStore.setState({ playlist: [song(1)], currentIndex: 0, currentSong: song(1) })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    savePlaybackState.mockClear()

    // 40 ticks of 250ms = 10s of playback. No single delta exceeds 250ms.
    for (let i = 1; i <= 40; i += 1) {
      usePlayerStore.setState({ currentTime: i * 250 })
    }
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

    expect(savePlaybackState).toHaveBeenCalled()
    const [, , positionMs] = savePlaybackState.mock.calls.at(-1)!
    expect(positionMs).toBe(10_000)
  })

  test('the debounced write persists the latest position, not the one that scheduled it', async () => {
    usePlayerStore.setState({ playlist: [song(1)], currentIndex: 0, currentSong: song(1) })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    savePlaybackState.mockClear()

    // Cross a bucket boundary to schedule the write…
    usePlayerStore.setState({ currentTime: 10_000 })
    // …then keep playing during the debounce window.
    usePlayerStore.setState({ currentTime: 11_500 })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

    const [, , positionMs] = savePlaybackState.mock.calls.at(-1)!
    expect(positionMs).toBe(11_500)
  })

  test('sub-bucket jitter does not write on every tick', async () => {
    usePlayerStore.setState({ playlist: [song(1)], currentIndex: 0, currentSong: song(1) })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    savePlaybackState.mockClear()

    for (let i = 1; i <= 8; i += 1) usePlayerStore.setState({ currentTime: 20_000 + i * 250 })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

    // All eight ticks sit inside one 10s bucket → a single debounced write.
    expect(savePlaybackState).toHaveBeenCalledTimes(1)
  })
})

describe('iOS Live Activity mirror', () => {
  test('two rapid song changes start only one activity', async () => {
    usePlayerStore.setState({ currentSong: song(1) })
    // Second change lands before `start()` resolves.
    usePlayerStore.setState({ currentSong: song(2) })
    await vi.advanceTimersByTimeAsync(0)

    expect(liveActivity.start).toHaveBeenCalledTimes(1)
    // The in-flight guard cleared, so later changes update rather than re-start.
    usePlayerStore.setState({ currentSong: song(3) })
    await vi.advanceTimersByTimeAsync(0)
    expect(liveActivity.start).toHaveBeenCalledTimes(1)
    expect(liveActivity.update).toHaveBeenCalled()
  })

  test('an empty id (host refused) latches the feature off instead of retrying', async () => {
    liveActivity.start.mockResolvedValueOnce('')

    usePlayerStore.setState({ currentSong: song(1) })
    await vi.advanceTimersByTimeAsync(0)
    expect(liveActivity.start).toHaveBeenCalledTimes(1)

    // Several further track / play-state changes must not ask again.
    usePlayerStore.setState({ currentSong: song(2) })
    await vi.advanceTimersByTimeAsync(0)
    usePlayerStore.setState({ isPlaying: true })
    await vi.advanceTimersByTimeAsync(0)
    usePlayerStore.setState({ currentSong: song(3) })
    await vi.advanceTimersByTimeAsync(0)

    expect(liveActivity.start).toHaveBeenCalledTimes(1)
    expect(liveActivity.update).not.toHaveBeenCalled()
  })

  test('clearing the song ends the activity exactly once', async () => {
    usePlayerStore.setState({ currentSong: song(1) })
    await vi.advanceTimersByTimeAsync(0)

    usePlayerStore.setState({ currentSong: undefined })
    await vi.advanceTimersByTimeAsync(0)
    usePlayerStore.setState({ isPlaying: false, currentSong: undefined })
    await vi.advanceTimersByTimeAsync(0)

    expect(liveActivity.end).toHaveBeenCalledTimes(1)
    expect(liveActivity.end).toHaveBeenCalledWith('activity-1')
  })
})
