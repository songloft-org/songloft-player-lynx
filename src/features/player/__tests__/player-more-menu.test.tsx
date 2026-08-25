import '@testing-library/jest-dom'
import { expect, test, vi } from 'vitest'
import { render, getQueriesForElement, fireEvent, act } from '@lynx-js/react/testing-library'

const { navigateSpy, goToSongDetailSpy, popoverProps } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  goToSongDetailSpy: vi.fn(),
  popoverProps: { current: null as unknown as Record<string, unknown> },
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateSpy }))
vi.mock('../../../shared/nav/navigate-to-song-detail.js', () => ({
  useNavigateToSongDetail: () => goToSongDetailSpy,
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

test('selecting song info opens the song detail page for the current song', async () => {
  render(<PlayerMoreMenu song={song} onOpenSleepTimer={() => {}} timerActive={false} />)
  const { getByTestId } = getQueriesForElement(elementTree.root!)
  await act(async () => {
    fireEvent.tap(getByTestId('more-menu-item-songInfo')!)
    await Promise.resolve()
  })
  expect(goToSongDetailSpy).toHaveBeenCalledWith(7)
})
