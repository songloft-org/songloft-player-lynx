import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Playlist } from '../../../models/playlist.js'
import { useToastStore } from '../../../shared/ui/toast-store.js'

/**
 * The add-to-playlist sheet, modelled on the Flutter build's
 * `AddToPlaylistModal`: playlists with cover + type, a "new playlist" row, paged
 * loading, and outcomes that distinguish added / added-with-skips / failed.
 *
 * The query hook and the API are stood in — a real `useInfiniteQuery` needs a
 * provider and a transport, and what is worth pinning here is which branch
 * renders and what each outcome does to the sheet.
 */

const { addSpy, createSpy, holder } = vi.hoisted(() => ({
  addSpy: vi.fn(),
  createSpy: vi.fn(),
  holder: {
    query: {} as Record<string, unknown>,
  },
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@lynx-js/lynx-ui-dialog', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiDialog(),
)
vi.mock('@lynx-js/lynx-ui-input', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiInput(),
)
// The sheet only invalidates through it; a plain stub keeps the provider out.
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('../data/playlist-query.js', () => ({
  usePlaylistsInfiniteQuery: () => holder.query,
}))
vi.mock('../api/index.js', () => ({
  getPlaylistApi: () => ({ addSongsToPlaylist: addSpy, createPlaylist: createSpy }),
}))

const { AddToPlaylistSheet } = await import('../widgets/AddToPlaylistSheet.js')

function makePlaylist(id: number, over: Partial<Playlist> = {}): Playlist {
  return {
    id,
    type: 'normal',
    name: `List ${id}`,
    songCount: 3,
    isBuiltIn: false,
    ...over,
  } as Playlist
}

/** A settled query with the given rows and no further pages. */
function loaded(playlists: Playlist[], over: Record<string, unknown> = {}) {
  return {
    data: { pages: [{ playlists }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...over,
  }
}

function renderSheet(songIds: number[] = [7], onAdded?: () => void) {
  const onClose = vi.fn()
  render(<AddToPlaylistSheet songIds={songIds} onClose={onClose} onAdded={onAdded} />)
  return { onClose, ...getQueriesForElement(elementTree.root!) }
}

beforeEach(() => {
  holder.query = loaded([makePlaylist(1), makePlaylist(2, { type: 'radio' })])
  addSpy.mockResolvedValue({ added: 1, skipped: 0 })
  createSpy.mockResolvedValue(makePlaylist(9, { name: 'Road Trip' }))
})

afterEach(() => {
  vi.clearAllMocks()
  useToastStore.getState().clearToast()
})

test('renders nothing without any songs', () => {
  const { queryByTestId } = renderSheet([])
  expect(queryByTestId('add-to-playlist-sheet')).toBeNull()
})

test('lists the playlists with their type as the subtitle', () => {
  const { queryByText } = renderSheet()
  expect(queryByText('List 1')).toBeInTheDocument()
  expect(queryByText('List 2')).toBeInTheDocument()
  // Radio playlists are labelled as such, as in the Flutter sheet.
  expect(queryByText('Radio')).toBeInTheDocument()
  expect(queryByText('Playlist')).toBeInTheDocument()
})

test('offers "new playlist" above the list', () => {
  const { queryByTestId } = renderSheet()
  expect(queryByTestId('atp-create')).toBeInTheDocument()
})

test('an empty library says so instead of showing a bare list', () => {
  holder.query = loaded([])
  const { queryByTestId } = renderSheet()
  expect(queryByTestId('atp-empty')).toBeInTheDocument()
})

/*
 * The header count is what tells a batch open apart from a row's: the library's
 * multi-select hands over its whole selection.
 */
test('the header counts every song it was opened with', () => {
  const { queryByText } = renderSheet([7, 8, 9])
  expect(queryByText('3 songs')).toBeInTheDocument()
})

test('a first-page failure offers a retry', () => {
  const refetch = vi.fn()
  holder.query = loaded([], { isError: true, refetch })
  const { getByTestId } = renderSheet()
  fireEvent.tap(getByTestId('atp-retry'), {})
  expect(refetch).toHaveBeenCalled()
})

test('the footer reports that everything is loaded', () => {
  const { queryByText } = renderSheet()
  expect(queryByText('— All loaded —')).toBeInTheDocument()
})

/**
 * A next-page failure is `isError` *with* rows on screen — the first-page branch
 * has already been ruled out — and it must stay tappable rather than silently
 * stopping the list.
 */
test('a next-page failure offers a retry in the footer', () => {
  holder.query = loaded([makePlaylist(1)], { isError: true, hasNextPage: true })
  const { queryByText } = renderSheet()
  expect(queryByText('Failed to load, tap to retry')).toBeInTheDocument()
})

test('tapping the backdrop closes the sheet', () => {
  const { onClose, getByTestId } = renderSheet()
  fireEvent.tap(getByTestId('atp-backdrop'), {})
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('picking a playlist adds the song, reports it and closes', async () => {
  const { onClose, getByText } = renderSheet()
  fireEvent.tap(getByText('List 1'), {})
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })

  expect(addSpy).toHaveBeenCalledWith(1, [7])
  expect(useToastStore.getState().toast?.tone).toBe('success')
  expect(useToastStore.getState().toast?.text).toContain('Added 1')
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('a batch open sends every id in one request', async () => {
  addSpy.mockResolvedValue({ added: 3, skipped: 0 })
  const onAdded = vi.fn()
  const { getByText } = renderSheet([7, 8, 9], onAdded)
  fireEvent.tap(getByText('List 1'), {})
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })

  expect(addSpy).toHaveBeenCalledWith(1, [7, 8, 9])
  // Only a success reports back — that is what lets the caller keep its
  // selection when the sheet is merely dismissed.
  expect(onAdded).toHaveBeenCalledTimes(1)
})

test('a dismissed sheet never reports an add', () => {
  const onAdded = vi.fn()
  const { getByTestId } = renderSheet([7, 8], onAdded)
  fireEvent.tap(getByTestId('atp-backdrop'), {})
  expect(onAdded).not.toHaveBeenCalled()
})

test('skipped songs get their own message', async () => {
  addSpy.mockResolvedValue({ added: 1, skipped: 2 })
  const { getByText } = renderSheet()
  fireEvent.tap(getByText('List 1'), {})
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })

  expect(useToastStore.getState().toast?.text).toContain('skipped 2')
})

/**
 * The sheet must survive a failed add: closing it would look exactly like
 * success, which is the confusion the old menu produced.
 */
test('a failed add reports the error and leaves the sheet open', async () => {
  addSpy.mockRejectedValue(new Error('boom'))
  const { onClose, getByText } = renderSheet()
  fireEvent.tap(getByText('List 1'), {})
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })

  expect(useToastStore.getState().toast?.tone).toBe('error')
  expect(onClose).not.toHaveBeenCalled()
})
