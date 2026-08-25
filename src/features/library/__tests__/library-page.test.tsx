import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import {
  DEFAULT_LIBRARY_BROWSE_CONFIG,
  LIBRARY_VIEW_KEYS,
  type LibraryBrowseConfig,
  type LibraryViewKey,
} from '../../../models/library-browse.js'

/**
 * Library page render tests — the 14-view shell.
 *
 * The page resolves `?view=` against the browse config and dispatches one of
 * three content kinds. The heavy children's hooks are all mocked (songs /
 * facets / playlists queries, router), so these tests assert the
 * SHELL: which pills render (and in how many groups), which content hook is
 * driven by which `?view=`, and the loading / all-hidden edge states.
 */
const { songsHook, facetsHook, playlistsHook, navigateSpy, searchHook, browseConfigHook } = vi.hoisted(
  () => ({
    songsHook: vi.fn(),
    facetsHook: vi.fn(),
    playlistsHook: vi.fn(),
    navigateSpy: vi.fn(),
    searchHook: vi.fn(),
    browseConfigHook: vi.fn(),
  }),
)

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('../data/songs-query.js', () => ({
  useSongsInfiniteQuery: songsHook,
  useFacetsInfiniteQuery: facetsHook,
  libraryQueryKeys: { songs: () => [], facets: () => [] },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateSpy,
  useSearch: searchHook,
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
  useInfiniteQuery: playlistsHook,
  useQuery: browseConfigHook,
  useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))

vi.mock('../../playlist/api/index.js', () => ({
  getPlaylistApi: () => ({ addSongsToPlaylist: vi.fn(async () => {}) }),
}))

vi.mock('../../playlist/data/playlist-query.js', () => ({
  usePlaylistsInfiniteQuery: playlistsHook,
  playlistQueryKeys: { list: () => [] },
}))

vi.mock('../../playlist/data/playlist-mutations.js', () => ({
  useCreatePlaylistMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useReorderPlaylistsMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeletePlaylistMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => {}) }),
  useSetPinnedMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => {}) }),
  useSetVisibilityMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => {}) }),
}))

vi.mock('../widgets/VirtualList.js', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockVirtualList(),
)

/* Row mocked down to the plain `SongRow` — see flat-songs-view.test.tsx. */
vi.mock('../widgets/SongListRow.js', async () => {
  const { SongRow } = await import('../widgets/SongRow.js')
  return { SongListRow: SongRow }
})

vi.mock('@lynx-js/lynx-ui-input', () => ({
  Input: (props: Record<string, unknown>) => (
    <view className={props.className as string}>
      <text>{(props.value || props.placeholder) as string}</text>
    </view>
  ),
}))

vi.mock('../data/use-debounce.js', () => ({
  useDebounce: <T,>(value: T, _delay: number): T => value,
}))

const { LibraryPage } = await import('../pages/LibraryPage.js')
const { LibraryViewportProvider } = await import('../pages/library-viewport.js')
type LibraryViewport = { isWide: boolean }

/** Build a config from an ordered key list, optionally hiding some keys. */
function configOf(keys: LibraryViewKey[] = [...LIBRARY_VIEW_KEYS], hidden: LibraryViewKey[] = []): LibraryBrowseConfig {
  return { views: keys.map((key) => ({ key, visible: !hidden.includes(key) })) }
}

function emptyPages() {
  return {
    data: { pages: [{ songs: [], facets: [], playlists: [], total: 0 }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }
}

beforeEach(() => {
  songsHook.mockReturnValue(emptyPages())
  facetsHook.mockReturnValue(emptyPages())
  playlistsHook.mockReturnValue(emptyPages())
  searchHook.mockReturnValue({})
  browseConfigHook.mockReturnValue({ data: DEFAULT_LIBRARY_BROWSE_CONFIG, isError: false })
})

afterEach(() => vi.clearAllMocks())

/**
 * The breakpoint reaches the page through the real context that `LibraryLayout`
 * provides, not a mock — the page's only job with it is choosing whether to show
 * the pill strip, and going through the context keeps that wired to the same
 * default (narrow) the layout hands it before its first measurement.
 */
async function renderPage(viewport: LibraryViewport = { isWide: false }) {
  render(
    <LibraryViewportProvider value={viewport}>
      <LibraryPage />
    </LibraryViewportProvider>,
  )
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('all 14 views visible → 14 pills in 3 groups (2 dividers), defaulting to the flat "all" list', async () => {
  const { queryAllByTestId } = await renderPage()

  expect(queryAllByTestId(/^library-view-pill-/)).toHaveLength(14)
  expect(queryAllByTestId('library-view-divider')).toHaveLength(2)
  // Default selection is the first visible view (`all`) → flat songs query
  // driven WITHOUT a `type` filter.
  expect(songsHook).toHaveBeenCalledWith(expect.not.objectContaining({ type: expect.anything() }))
})

test('hiding 3 views removes exactly their pills', async () => {
  browseConfigHook.mockReturnValue({
    data: configOf([...LIBRARY_VIEW_KEYS], ['decade', 'style', 'playlist_radio']),
    isError: false,
  })
  const { queryAllByTestId, queryByTestId } = await renderPage()

  expect(queryAllByTestId(/^library-view-pill-/)).toHaveLength(11)
  expect(queryByTestId('library-view-pill-decade')).not.toBeInTheDocument()
  expect(queryByTestId('library-view-pill-style')).not.toBeInTheDocument()
  expect(queryByTestId('library-view-pill-playlist_radio')).not.toBeInTheDocument()
  expect(queryByTestId('library-view-pill-artist')).toBeInTheDocument()
})

test('?view=local drives the flat list with type=local', async () => {
  searchHook.mockReturnValue({ view: 'local' })
  await renderPage()
  expect(songsHook).toHaveBeenCalledWith(expect.objectContaining({ type: 'local' }))
})

test('?view=artist drives the facet grid for the artist field', async () => {
  searchHook.mockReturnValue({ view: 'artist' })
  await renderPage()
  expect(facetsHook).toHaveBeenCalledWith('artist', '')
})

test('?view=playlist_radio drives the playlists view with type=radio', async () => {
  searchHook.mockReturnValue({ view: 'playlist_radio' })
  await renderPage()
  expect(playlistsHook).toHaveBeenCalledWith({ type: 'radio' })
})

test('a hidden-but-requested view is still selected (deep link) and slotted back into the switcher', async () => {
  browseConfigHook.mockReturnValue({
    data: configOf([...LIBRARY_VIEW_KEYS], ['year']),
    isError: false,
  })
  searchHook.mockReturnValue({ view: 'year' })
  const { queryByTestId } = await renderPage()

  // The facet grid is driven by `year` even though it is hidden…
  expect(facetsHook).toHaveBeenCalledWith('year', '')
  // …and its pill is present (temporarily re-shown for the deep link).
  expect(queryByTestId('library-view-pill-year')).toBeInTheDocument()
})

test('config still pending → loading state, no pills, no content', async () => {
  browseConfigHook.mockReturnValue({ data: undefined, isError: false })
  const { queryByText, queryAllByTestId } = await renderPage()

  expect(queryByText('Loading…')).toBeInTheDocument()
  expect(queryAllByTestId(/^library-view-pill-/)).toHaveLength(0)
  expect(songsHook).not.toHaveBeenCalled()
})

test('every view hidden → the keep-one-visible empty state', async () => {
  browseConfigHook.mockReturnValue({
    data: configOf([...LIBRARY_VIEW_KEYS], [...LIBRARY_VIEW_KEYS]),
    isError: false,
  })
  const { queryByText, queryAllByTestId } = await renderPage()

  expect(queryByText('Keep at least one view visible')).toBeInTheDocument()
  expect(queryAllByTestId(/^library-view-pill-/)).toHaveLength(0)
})

test('tapping a pill navigates to /library with that view', async () => {
  const { getByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(getByTestId('library-view-pill-album'))
  })
  expect(navigateSpy).toHaveBeenCalledWith({ to: '/library', search: { view: 'album' } })
})

/*
 * On wide screens the choice is offered by the rail, which belongs to
 * `LibraryLayout` (see `library-layout.test.tsx`) — so this page must render
 * *neither* chrome, not "the rail instead". Asserting the absence of the rows here
 * is what would catch the page growing its own second copy again.
 */
test('wide viewport drops the pill strip and does not render a rail of its own', async () => {
  const { queryAllByTestId } = await renderPage({ isWide: true })
  expect(queryAllByTestId(/^library-view-pill-/)).toHaveLength(0)
  expect(queryAllByTestId(/^library-view-row-/)).toHaveLength(0)
})
