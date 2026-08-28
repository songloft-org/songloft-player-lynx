import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Song } from '../../../models/song.js'

/**
 * `SleepTimerSheet` — both modes are on screen, and the custom values are real.
 *
 * The gap this covers: "after N songs" and the two custom entries were the pieces
 * missing against the Flutter build, and the by-songs half is also the half that has
 * to *disappear* for a live stream (a stream never completes a track, so such a timer
 * would never fire). All three are structural, so a render test can hold them.
 *
 * `Sheet` and `Dialog` are stood in with plain views (shared `_render-mocks`
 * factories) so the content renders regardless of the imperative open/close, and the
 * lynx-ui `Input` gets a tappable stub per file — `mockLynxUiInput` only renders the
 * placeholder, and what matters here is a value arriving through `onInput`.
 */

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@lynx-js/lynx-ui-dialog', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiDialog(),
)

/** The value the stub types when tapped; each test sets it before rendering. */
let typed = '120'
vi.mock('@lynx-js/lynx-ui-input', () => ({
  Input: ({ placeholder, onInput }: { placeholder?: string; onInput?: (v: string) => void }) => (
    <view data-testid='stub-input' bindtap={() => onInput?.(typed)}>
      <text>{placeholder}</text>
    </view>
  ),
}))

const setSleepTimerByDuration = vi.fn()
const setSleepTimerAfterSongs = vi.fn()
const cancelSleepTimer = vi.fn()

let state: {
  sleepTimer: { mode: 'duration' | 'afterSongs', remainingMs?: number, remainingSongs?: number }
    | undefined
  currentSong: Song | undefined
} = { sleepTimer: undefined, currentSong: undefined }

vi.mock('../store/index.js', () => {
  function usePlayerStore<T>(selector?: (s: typeof state) => T) {
    return selector ? selector(state) : state
  }
  usePlayerStore.getState = () => ({
    setSleepTimerByDuration,
    setSleepTimerAfterSongs,
    cancelSleepTimer,
  })
  return { usePlayerStore }
})

const { SleepTimerSheet } = await import('../widgets/SleepTimerSheet.js')

function song(over: Partial<Song> = {}): Song {
  return { id: 1, type: 'local', title: 'Song', isLive: false, ...over } as Song
}

afterEach(() => {
  state = { sleepTimer: undefined, currentSong: undefined }
  typed = '120'
  vi.clearAllMocks()
})

async function renderSheet() {
  const onClose = vi.fn()
  render(<SleepTimerSheet show onClose={onClose} />)
  await act(async () => {
    await Promise.resolve()
  })
  return { onClose, ...getQueriesForElement(elementTree.root!) }
}

test('both modes are offered: duration presets and song-count presets', async () => {
  state.currentSong = song()
  const { queryByText, getByTestId } = await renderSheet()

  // Section headers, so neither mode reads as the only thing the sheet does.
  expect(queryByText('By duration')).toBeInTheDocument()
  expect(queryByText('By songs')).toBeInTheDocument()

  fireEvent.tap(getByTestId('sleep-timer-minutes-30'), {})
  expect(setSleepTimerByDuration).toHaveBeenCalledWith(30 * 60_000)

  fireEvent.tap(getByTestId('sleep-timer-songs-3'), {})
  expect(setSleepTimerAfterSongs).toHaveBeenCalledWith(3)
})

test('the by-songs half is hidden for a live stream, which never completes a song', async () => {
  state.currentSong = song({ type: 'radio' })
  const { queryByText, queryByTestId } = await renderSheet()

  expect(queryByText('By duration')).toBeInTheDocument()
  expect(queryByText('By songs')).not.toBeInTheDocument()
  expect(queryByTestId('sleep-timer-songs-3')).not.toBeInTheDocument()
  expect(queryByTestId('sleep-timer-custom-songs')).not.toBeInTheDocument()
})

test('a custom duration is accepted in minutes and closes the sheet', async () => {
  state.currentSong = song()
  typed = '120'
  const { onClose, getByTestId } = await renderSheet()

  fireEvent.tap(getByTestId('sleep-timer-custom-duration'), {})
  fireEvent.tap(getByTestId('stub-input'), {})
  fireEvent.tap(getByTestId('sleep-timer-custom-confirm'), {})

  expect(setSleepTimerByDuration).toHaveBeenCalledWith(120 * 60_000)
  expect(onClose).toHaveBeenCalled()
})

test('a custom song count is accepted as a count, not milliseconds', async () => {
  state.currentSong = song()
  typed = '12'
  const { getByTestId } = await renderSheet()

  fireEvent.tap(getByTestId('sleep-timer-custom-songs'), {})
  fireEvent.tap(getByTestId('stub-input'), {})
  fireEvent.tap(getByTestId('sleep-timer-custom-confirm'), {})

  expect(setSleepTimerAfterSongs).toHaveBeenCalledWith(12)
  expect(setSleepTimerByDuration).not.toHaveBeenCalled()
})

test('an out-of-range value is refused with a message, and sets nothing', async () => {
  state.currentSong = song()
  // 1000 minutes is one past the 999 the range allows.
  typed = '1000'
  const { onClose, getByTestId, queryByTestId } = await renderSheet()

  fireEvent.tap(getByTestId('sleep-timer-custom-duration'), {})
  fireEvent.tap(getByTestId('stub-input'), {})
  expect(queryByTestId('sleep-timer-custom-error')).not.toBeInTheDocument()

  fireEvent.tap(getByTestId('sleep-timer-custom-confirm'), {})

  expect(setSleepTimerByDuration).not.toHaveBeenCalled()
  /*
   * Asserted through the error element, not by looking for the sentence: the field's
   * placeholder is deliberately the *same* sentence (the range is the hint), so a
   * text query would pass with no error shown at all.
   */
  expect(queryByTestId('sleep-timer-custom-error'))
    .toHaveTextContent('Enter an integer between 1 and 999')
  // The dialog stays open with the complaint, rather than closing on a value it
  // silently dropped.
  expect(onClose).not.toHaveBeenCalled()
})

test('a running timer shows its remaining time with a way to cancel', async () => {
  state.currentSong = song()
  state.sleepTimer = { mode: 'duration', remainingMs: 90_000 }
  const { queryByText, getByTestId } = await renderSheet()

  expect(queryByText('1:30')).toBeInTheDocument()

  fireEvent.tap(getByTestId('sleep-timer-cancel'), {})
  expect(cancelSleepTimer).toHaveBeenCalled()
})

test('a running by-songs timer marks the preset it was set from', async () => {
  // Unlike a duration, this value only changes when a track ends, so comparing it to
  // the preset is stable enough to highlight.
  state.currentSong = song()
  state.sleepTimer = { mode: 'afterSongs', remainingSongs: 3 }
  const { getByTestId, queryByText } = await renderSheet()

  expect(getByTestId('sleep-timer-songs-3').className).toContain('sleep-timer__chip--active')
  expect(getByTestId('sleep-timer-songs-1').className).not.toContain('sleep-timer__chip--active')
  expect(queryByText('3 songs left')).toBeInTheDocument()
})
