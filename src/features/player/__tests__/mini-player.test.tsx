import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, getQueriesForElement, render } from '@lynx-js/react/testing-library'

/**
 * MiniPlayer render smoke. Mocks the player store (static, non-subscribing) and
 * `useNavigate`; asserts the mini-player shows the current song's title +
 * "artist · album" subtitle and the play control (a vector `<Icon>`, queried by
 * its `data-testid`). MiniPlayer uses only plain views + the native `<svg>` icon
 * (no lynx-ui gesture leaf), so no component mocks are needed.
 */
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))
vi.mock('../store/player-store.js', async () => {
  const actual = await vi.importActual<typeof import('../store/player-store.js')>(
    '../store/player-store.js',
  )
  const { makePlayerStoreMock } = await import('../../../__tests__/_render-mocks.js')
  return makePlayerStoreMock(actual)
})

const { MiniPlayer } = await import('../widgets/MiniPlayer.js')

afterEach(() => vi.clearAllMocks())

test('shows the current song title, subtitle and play control', async () => {
  render(<MiniPlayer />)
  await act(async () => {
    await Promise.resolve()
  })
  const { queryByText, queryByTestId } = getQueriesForElement(elementTree.root!)

  expect(queryByText('Mock Song')).toBeInTheDocument()
  expect(queryByText('Mock Artist · Mock Album')).toBeInTheDocument()
  // Paused mock state -> the play (not pause) icon is rendered.
  expect(queryByTestId('icon-play')).toBeInTheDocument()
  expect(queryByTestId('icon-pause')).not.toBeInTheDocument()
})
