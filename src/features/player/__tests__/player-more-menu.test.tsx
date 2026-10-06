import '@testing-library/jest-dom'
vi.mock('../store/player-store.js', async (original) => {
  const actual = await original<Record<string, unknown>>()
  const { makePlayerStoreMock } = await import('../../../__tests__/_render-mocks.js')
  return makePlayerStoreMock(actual)
})
// New player consumers use native stores/query observers; render stand-ins
// keep this renderer from invoking Node's external React dispatcher.
vi.mock('../data/audio-tracks-query.js', () => ({
  useAudioTracks: () => ({ data: [], isPending: false, isError: false, refetch: async () => {} }),
}))
vi.mock('../store/dlna-store.js', async (original) => {
  const actual = await original<typeof import('../store/dlna-store.js')>()
  const { makeDlnaStoreMock } = await import('../../../__tests__/_render-mocks.js')
  return makeDlnaStoreMock(actual)
})
import { expect, test, vi } from 'vitest'
import { render, getQueriesForElement, fireEvent, act } from '@lynx-js/react/testing-library'

const { navigateSpy, openInfoSpy, popoverProps } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  openInfoSpy: vi.fn(),
  popoverProps: { current: null as unknown as Record<string, unknown> },
}))
const capability = vi.hoisted(() => ({ equalizer: true }))
vi.mock('../../../native/platform-capabilities.js', async original => ({
  ...await original<typeof import('../../../native/platform-capabilities.js')>(),
  getPlatformCapabilities: () => capability,
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateSpy }))
/*
 * Song info is no longer a route: the entry dispatches through the global
 * overlay store, which mounts `SongInfoDialog` in the root route. Only the
 * imperative object is mocked — that is all this component touches.
 */
vi.mock('../../../shared/ui/song-row-overlays.js', () => ({
  songRowOverlays: { openInfo: openInfoSpy },
}))
/*
 * Stand the popover up as a flat list of its items so the test can tap them
 * directly — the real positioning (`anchored-overlay`) is covered by its own
 * tests and needs a layout engine this env does not have.
 */
vi.mock('../../../shared/ui/PopoverMenu.js', () => ({
  PopoverMenu: (props: Record<string, unknown>) => {
    popoverProps.current = props
    const items = props.items as { key: string; label: string }[]
    return (
      <view>
        {items.map((item) => (
          <text
            key={item.key}
            data-testid={`more-menu-item-${item.key}`}
            bindtap={() => (props.onSelect as (k: string) => void)(item.key)}
          >
            {item.label}
          </text>
        ))}
      </view>
    )
  },
}))

const { PlayerMoreMenu } = await import('../widgets/PlayerMoreMenu.js')

const song = {
  id: 7,
  type: 'local',
  title: 'T',
  duration: 1,
  year: 0,
  fileSize: 0,
  bitRate: 0,
  sampleRate: 0,
  isLive: false,
  isVideo: false,
  addedAt: '',
  updatedAt: '',
} as never

test('offers song info alongside equalizer and sleep timer when a song is loaded', () => {
  render(<PlayerMoreMenu song={song} onOpenSleepTimer={() => {}} timerActive={false} />)
  const keys = (popoverProps.current.items as { key: string }[]).map((i) => i.key)
  expect(keys).toEqual(['songInfo', 'equalizer', 'sleepTimer'])
})

test('omits song info when nothing is loaded', () => {
  render(<PlayerMoreMenu song={null} onOpenSleepTimer={() => {}} timerActive={false} />)
  const keys = (popoverProps.current.items as { key: string }[]).map((i) => i.key)
  expect(keys).toEqual(['equalizer', 'sleepTimer'])
})

test('selecting song info opens the global info dialog for the current song', async () => {
  render(<PlayerMoreMenu song={song} onOpenSleepTimer={() => {}} timerActive={false} />)
  const { getByTestId } = getQueriesForElement(elementTree.root!)
  await act(async () => {
    fireEvent.tap(getByTestId('more-menu-item-songInfo')!)
    await Promise.resolve()
  })
  expect(openInfoSpy).toHaveBeenCalledWith(song)
})

test('unsupported EQ has no menu entry while other playback actions remain', () => {
  capability.equalizer = false
  try {
    render(<PlayerMoreMenu song={song} onOpenSleepTimer={() => {}} timerActive={false} />)
    expect((popoverProps.current.items as { key: string }[]).map(i => i.key)).toEqual(['songInfo', 'sleepTimer'])
  } finally { capability.equalizer = true }
})
