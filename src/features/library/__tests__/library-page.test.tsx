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

vi.mock('../data/song-tags-query.js', () => ({
  useTagListInfiniteQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  flattenTags: () => [],
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
type LibraryViewport = { isWide: boolean; isSongListWide: boolean }

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
async function renderPage(viewport: LibraryViewport = { isWide: false, isSongListWide: false }) {
  const { rerender } = render(
    <LibraryViewportProvider value={viewport}>
      <LibraryPage />
    </LibraryViewportProvider>,
  )
  await act(async () => {
    await Promise.resolve()
  })
  return {
    ...getQueriesForElement(elementTree.root!),
    async switchView(view: LibraryViewKey) {
      searchHook.mockReturnValue({ view })
      await act(async () => {
        rerender(
          <LibraryViewportProvider value={viewport}>
            <LibraryPage />
          </LibraryViewportProvider>,
        )
      })
    },
  }
}

test.each(['all', 'local', 'remote', 'radio'] as const)('%s has a song visibility button even with no visible songs', async (view) => {
  searchHook.mockReturnValue({ view })
  const { getByTestId } = await renderPage()
  expect(getByTestId('library-hidden-toggle')).toHaveAttribute('accessibility-label', 'Show hidden songs')
  expect(getByTestId('icon-eye-off')).toBeInTheDocument()
})

test.each(['playlist', 'playlist_normal', 'playlist_radio', 'playlist_remote', 'playlist_local'] as const)('%s has a playlist visibility button even with no visible playlists', async (view) => {
  searchHook.mockReturnValue({ view })
  const { getByTestId } = await renderPage()
  expect(getByTestId('library-hidden-toggle')).toHaveAttribute('accessibility-label', 'Show hidden playlists')
})

test.each(['artist', 'album', 'folder', 'tag'] as const)('%s omits the visibility button', async (view) => {
  searchHook.mockReturnValue({ view })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('library-hidden-toggle')).not.toBeInTheDocument()
})

test('song and playlist visibility drive independent server filters and survive category switches', async () => {
  const { getByTestId, switchView } = await renderPage()
  expect(songsHook.mock.lastCall?.[0].excludePlaylistLabels).toBeUndefined()
  await act(async () => { fireEvent.tap(getByTestId('library-hidden-toggle')) })
  expect(songsHook.mock.lastCall?.[0].excludePlaylistLabels).toBe('none')
  expect(getByTestId('library-hidden-toggle')).toHaveAttribute('accessibility-label', 'Hide hidden songs')
  expect(getByTestId('icon-eye')).toBeInTheDocument()

  await switchView('local')
  expect(songsHook.mock.lastCall?.[0]).toMatchObject({ type: 'local', excludePlaylistLabels: 'none' })
  await switchView('playlist_normal')
  expect(playlistsHook.mock.lastCall?.[0].excludeLabels).toBeUndefined()
  await act(async () => { fireEvent.tap(getByTestId('library-hidden-toggle')) })
  expect(playlistsHook.mock.lastCall?.[0]).toMatchObject({ type: 'normal', excludeLabels: 'none' })
  expect(getByTestId('library-hidden-toggle')).toHaveAttribute('accessibility-label', 'Hide hidden playlists')

  await switchView('playlist_remote')
  expect(playlistsHook.mock.lastCall?.[0]).toMatchObject({ songSource: 'remote', excludeLabels: 'none' })
  await act(async () => { fireEvent.tap(getByTestId('library-hidden-toggle')) })
  expect(playlistsHook.mock.lastCall?.[0].excludeLabels).toBeUndefined()
  await switchView('artist')
  await switchView('all')
  expect(songsHook.mock.lastCall?.[0].excludePlaylistLabels).toBe('none')
  await act(async () => { fireEvent.tap(getByTestId('library-hidden-toggle')) })
  expect(songsHook.mock.lastCall?.[0].excludePlaylistLabels).toBeUndefined()
})

test('all 18 views visible → 18 pills in 3 groups (2 dividers), defaulting to the flat "all" list', async () => {
  const { queryAllByTestId } = await renderPage()

  expect(queryAllByTestId(/^library-view-pill-/)).toHaveLength(18)
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

  expect(queryAllByTestId(/^library-view-pill-/)).toHaveLength(15)
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
  expect(queryAllByTestId('library-hidden-toggle')).toHaveLength(0)
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
  const { queryAllByTestId } = await renderPage({ isWide: true, isSongListWide: false })
  expect(queryAllByTestId(/^library-view-pill-/)).toHaveLength(0)
  expect(queryAllByTestId(/^library-view-row-/)).toHaveLength(0)
})
