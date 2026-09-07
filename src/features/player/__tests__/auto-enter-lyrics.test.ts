import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * Issue #7 — "打开后自动进入歌词" never fired on a cold start because nothing
 * navigated to `/player`: the pref only drove FullPlayerPage's internal swipe, and
 * that page only mounts when the user opens the player by hand. These tests pin the
 * startup-chain half (`navigateAutoEnterLyricsIfNeeded`); the swipe half is covered
 * by `full-player-responsive.test.tsx`.
 *
 * The three gates each get their own case: restored song, pref on, navigate. Drop
 * any one of them from the implementation and exactly one case goes red.
 */

const SONG = { id: 7, title: 'song' }

const { navigateSpy, readPrefSpy, getStateSpy } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  readPrefSpy: vi.fn(async (): Promise<boolean> => false),
  getStateSpy: vi.fn((): { currentSong: unknown } => ({ currentSong: undefined })),
}))

vi.mock('../../../router.js', () => ({ router: { navigate: navigateSpy } }))
vi.mock('../../settings/data/settings-prefs.js', () => ({
  readAutoEnterLyrics: readPrefSpy,
}))
vi.mock('../store/index.js', () => ({
  usePlayerStore: { getState: getStateSpy },
}))

import { navigateAutoEnterLyricsIfNeeded } from '../data/auto-enter-lyrics.js'

describe('navigateAutoEnterLyricsIfNeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('navigates to /player when the pref is on and a song was restored', async () => {
    getStateSpy.mockReturnValue({ currentSong: SONG })
    readPrefSpy.mockResolvedValue(true)
    await navigateAutoEnterLyricsIfNeeded()
    expect(navigateSpy).toHaveBeenCalledWith({ to: '/player' })
    expect(navigateSpy).toHaveBeenCalledTimes(1)
  })

  test('stays on the launch tab when the pref is off', async () => {
    getStateSpy.mockReturnValue({ currentSong: SONG })
    readPrefSpy.mockResolvedValue(false)
    await navigateAutoEnterLyricsIfNeeded()
    expect(navigateSpy).not.toHaveBeenCalled()
  })

  test('does not hijack the launch into the empty player when nothing was restored', async () => {
    getStateSpy.mockReturnValue({ currentSong: undefined })
    readPrefSpy.mockResolvedValue(true)
    await navigateAutoEnterLyricsIfNeeded()
    expect(navigateSpy).not.toHaveBeenCalled()
    // The song gate is synchronous and runs before the async pref read — with no
    // queue there is no reason to touch storage at all.
    expect(readPrefSpy).not.toHaveBeenCalled()
  })
})
