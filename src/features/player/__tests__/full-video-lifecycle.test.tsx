import { act, render } from '@lynx-js/react/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import type { Song } from '../../../models/song.js'
import { usePlayerStore } from '../store/player-store.js'
import { FullVideoPage } from '../pages/FullVideoPage.js'

const back = vi.hoisted(() => vi.fn())
const desktop = vi.hoisted(() => ({ enabled: false }))
vi.mock('../../../desktop/client.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../desktop/client.js')>(),
  desktopConfig: () => desktop.enabled
    ? { id: 'test', token: 'test', os: 'win32', capabilities: {} }
    : null,
}))
// ReactLynx's renderer cannot mount zustand's React hooks. Keep the real
// store and its subscriptions, adapting only the hook to Lynx's renderer.
vi.mock('../store/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../store/index.js')>()
  const { useState, useEffect } = await import('@lynx-js/react')
  return {
    ...actual,
    usePlayerStore: Object.assign(
      (select: (state: ReturnType<typeof actual.usePlayerStore.getState>) => unknown) => {
        const [value, setValue] = useState(() => select(actual.usePlayerStore.getState()))
        useEffect(
          () => actual.usePlayerStore.subscribe((state) => setValue(() => select(state))),
          [select],
        )
        return value
      },
      actual.usePlayerStore,
    ),
  }
})
vi.mock('../../../core/navigation/route-back-action.js', () => ({
  performRouteBack: back,
}))
vi.mock('../data/video-open.js', () => ({
  openCurrentSongVideo: async () => 'opened',
}))
vi.mock('../widgets/VideoSubtitleOverlay.js', () => ({
  VideoSubtitleOverlay: () => null,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const original = usePlayerStore.getState()
afterEach(() => {
  usePlayerStore.setState(original, true)
  vi.clearAllMocks()
  desktop.enabled = false
  vi.useRealTimers()
})

test.each([false, true])(
  'changing from MV to a new song (video=%s) leaves the closed surface once',
  async (isVideo) => {
    const song = { id: 3, title: 'MV', isVideo: true, format: 'mp4' } as Song
    usePlayerStore.setState({ currentSong: song, isPlaying: false })
    const view = render(<FullVideoPage />)
    await act(async () => {
      usePlayerStore.setState({ currentTime: 3000 })
    })
    expect(back).not.toHaveBeenCalled()
    await act(async () => {
      usePlayerStore.setState({ currentSong: { ...song, id: 4, isVideo } })
    })
    expect(back).toHaveBeenCalledOnce()
    await act(async () => {
      usePlayerStore.setState({ currentTime: 1000 })
    })
    expect(back).toHaveBeenCalledOnce()
    view.unmount()
    expect(back).toHaveBeenCalledOnce()
  },
)

test('desktop keeps transport controls at the edge after the mobile hide delay', async () => {
  vi.useFakeTimers()
  desktop.enabled = true
  usePlayerStore.setState({ isPlaying: true, isBuffering: false })
  const view = render(<FullVideoPage />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000)
  })
  expect(view.queryByTestId('video-rotate')).toBeNull()
  const playback = view.container.querySelector('[data-testid="video-centre-toggle"]')
  expect(playback?.getAttribute('class')).toBe('full-video__tool')
  expect(playback?.closest('.full-video__chrome--hidden')).toBeNull()
  view.unmount()
})
