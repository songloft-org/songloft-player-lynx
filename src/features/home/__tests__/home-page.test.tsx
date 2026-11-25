import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import { parseLibraryStats } from '../../../models/library-stats.js'
import type { Playlist } from '../../../models/playlist.js'

/**
 * HomePage render smoke.
 *
 * Same rule as the batch-4/6 page tests: the playlist infinite hook subscribes
 * via `useSyncExternalStore` (crashes the ReactLynx Vitest snapshot tree + needs
 * a live QueryClient), so `useHomePlaylists` is a `vi.fn()` returning a static
 * infinite-query shape — dispatched per `type` so the two sections get distinct
 * data. The library-stats query is mocked for the same reason (there is no
 * `QueryClientProvider` in these tests). `useNavigate` is stubbed. The real
 * `homeSectionItems` selector, `HomeSection`, `PlaylistCard` and `StatsStrip` all
 * run against the injected data; assertions check the rendered structure
 * (greeting, section titles, card names, stats, states), not fixtures echoed back.
 */
const { normalHook, radioHook, statsHook, breakpointHook, favoritesHook } = vi.hoisted(() => ({
  favoritesHook: vi.fn(),
  breakpointHook: vi.fn(),
  normalHook: vi.fn(),
  radioHook: vi.fn(),
  statsHook: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

const navigate = vi.hoisted(() => vi.fn())
const playback = vi.hoisted(() => ({ sourcePlaylistId: undefined as number | undefined }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

vi.mock('../../player/store/index.js', () => ({
  usePlayerStore: (select: (state: typeof playback) => unknown) => select(playback),
}))

vi.mock('../../jsplugin/widgets/PluginGrid.js', () => ({
  PluginGrid: () => null,
}))

vi.mock('../data/home-query.js', () => ({
  useHomePlaylists: (type: string) => (type === 'radio' ? radioHook() : normalHook()),
}))

vi.mock('../data/home-favorites.js', () => ({
  useHomeFavoritesVisibility: () => favoritesHook(),
}))

vi.mock('../../../shared/responsive/use-shell-seeded-breakpoint.js', () => ({
  useShellSeededBreakpoint: () => breakpointHook(),
}))

vi.mock('../data/home-stats-query.js', () => ({
  useLibraryStatsQuery: () => statsHook(),
}))

const { HomePage } = await import('../pages/HomePage.js')
const { changeHomeConfig } = await import('../data/home-layout.js')

function makePlaylist(id: number, over: Partial<Playlist> = {}): Playlist {
  return {
    id,
    type: 'normal',
    name: `Playlist ${id}`,
    description: undefined,
    coverUrl: undefined,
    labels: [],
    songCount: 0,
    sortBy: 'position',
    sortOrder: 'asc',
    createdAt: '',
    updatedAt: '',
    isBuiltIn: false,
    isAutoCreated: false,
    isHidden: false,
    pinnedAt: undefined,
    isPinned: false,
    remoteCount: 0,
    hasRemoteSongs: false,
    ...over,
  }
}

function result(
  pages: { playlists: Playlist[]; total: number }[] | undefined,
  over: Record<string, unknown> = {},
) {
  return {
    data: pages ? { pages } : undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...over,
  }
}

/** A `/songs/stats` payload, run through the real schema so the shape cannot drift. */
function stats(over: Record<string, number> = {}) {
  return { data: parseLibraryStats(over), refetch: vi.fn() }
}

beforeEach(async () => {
  playback.sourcePlaylistId = undefined
  favoritesHook.mockReturnValue({ config: { showFavorites: true, showRadioFavorites: true } })
  await changeHomeConfig({ showRadios: true })
  breakpointHook.mockReturnValue({ width: 390, isWide: false, breakpoint: 'mobile', onLayoutChange: () => {} })
  normalHook.mockReturnValue(result([{ playlists: [], total: 0 }]))
  radioHook.mockReturnValue(result([{ playlists: [], total: 0 }]))
  statsHook.mockReturnValue(stats())
})

afterEach(() => vi.clearAllMocks())

async function renderPage() {
  render(<HomePage />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('opens the playing playlist even when its card is outside the home preview', async () => {
  playback.sourcePlaylistId = 88
  const q = await renderPage()
  expect(q.queryByText('Playlist 88')).toBeNull()
  await act(async () => { fireEvent.tap(q.getByTestId('home-locate-playlist')) })
  expect(navigate).toHaveBeenCalledWith({ to: '/playlists/$id', params: { id: '88' } })
})

test('hides the playing playlist shortcut without a playlist context', async () => {
  const q = await renderPage()
  expect(q.queryByTestId('home-locate-playlist')).toBeNull()
})

test('home-only favorites switches filter built-ins and refill the visible card budget', async () => {
  await changeHomeConfig({ layout: 'grid', columns: 2, rows: 1 })
  favoritesHook.mockReturnValue({ config: { showFavorites: false, showRadioFavorites: false } })
  const favorites = makePlaylist(1, { name: 'Favorites', isBuiltIn: true, labels: ['built_in'] })
  const radioFavorites = makePlaylist(2, { name: 'Radio favorites', isBuiltIn: true, labels: ['built_in'], type: 'radio' })
  const fetchNextPage = vi.fn()
  normalHook.mockReturnValue(result([{ playlists: [favorites, makePlaylist(3)], total: 3 }], {
    hasNextPage: true, isFetchingNextPage: false, fetchNextPage,
  }))
  radioHook.mockReturnValue(result([{ playlists: [radioFavorites, makePlaylist(4, { type: 'radio' })], total: 2 }]))
  const q = await renderPage()
  expect(q.queryByText('Favorites')).toBeNull()
  expect(q.queryByText('Radio favorites')).toBeNull()
  expect(q.getByText('Playlist 3')).toBeTruthy()
  expect(q.getByText('Playlist 4')).toBeTruthy()
  expect(fetchNextPage).toHaveBeenCalledTimes(1)
  expect(favorites.labels).toEqual(['built_in'])
})

test('a layout larger than one API page fills its budget and stops after enough cards load', async () => {
  await changeHomeConfig({ layout: 'carousel' })
  const fetchNextPage = vi.fn()
  const playlists = Array.from({ length: 40 }, (_, index) => makePlaylist(index + 1))
  normalHook.mockReturnValue(result([{ playlists: playlists.slice(0, 20), total: 44 }], {
    hasNextPage: true, isFetchingNextPage: false, fetchNextPage,
  }))
  const view = render(<HomePage />)
  await act(async () => { await Promise.resolve() })
  expect(fetchNextPage).toHaveBeenCalledTimes(1)
  normalHook.mockReturnValue(result([{ playlists, total: 44 }], {
    hasNextPage: true, isFetchingNextPage: false, fetchNextPage,
  }))
  await act(async () => { view.rerender(<HomePage />); await Promise.resolve() })
  expect(fetchNextPage).toHaveBeenCalledTimes(1)
  expect(view.container.querySelectorAll('.playlist-card')).toHaveLength(30)
  view.unmount()
  await changeHomeConfig({ layout: 'adaptive' })
})

test('renders greeting, both sections, cards and the stats strip', async () => {
  normalHook.mockReturnValue(
    result([{ playlists: [makePlaylist(1, { name: 'Morning Mix', songCount: 3 })], total: 10 }]),
  )
  radioHook.mockReturnValue(
    result([
      {
        playlists: [makePlaylist(2, { type: 'radio', name: 'Jazz Radio', songCount: 1 })],
        total: 4,
      },
    ]),
  )
  const { queryByTestId, queryByText, getAllByText } = await renderPage()

  expect(queryByTestId('home-greeting')).toBeInTheDocument()
  expect(queryByText('My Playlists')).toBeInTheDocument()
  expect(queryByText('My Radios')).toBeInTheDocument()
  expect(queryByText('Morning Mix')).toBeInTheDocument()
  expect(queryByText('Jazz Radio')).toBeInTheDocument()
  // Each section has its own "View all".
  expect(getAllByText('View all')).toHaveLength(2)
  expect(queryByTestId('home-stats')).toBeInTheDocument()
  // The home cover now wires onPlayAll → the play disc renders on each card
  // (the disc is conditional on the handler being passed).
  expect(elementTree.root!.querySelector('.playlist-card__play-hit')).not.toBeNull()
})

/**
 * The stats panel only renders alongside the sections — an empty library shows the
 * "no playlists yet" state instead — so these give the normal section one card.
 */
function withPlaylists() {
  normalHook.mockReturnValue(result([{ playlists: [makePlaylist(1)], total: 1 }]))
}

test('the stats panel renders the library summary from /songs/stats', async () => {
  withPlaylists()
  // The live backend's actual shape (60 remote songs, 9643s, no local files).
  statsHook.mockReturnValue(stats({
    total_songs: 60,
    local_songs: 0,
    remote_songs: 60,
    radio_songs: 0,
    artist_count: 27,
    album_count: 58,
    genre_count: 0,
    total_duration: 9643,
    total_file_size: 0,
  }))
  const { queryByText } = await renderPage()

  // Queried by class, not by text: `total_songs` and `remote_songs` are both 60
  // here, so a bare text query cannot tell the headline from a cell.
  const headline = elementTree.root!.querySelector('.home-stats__headline-value')
  expect(headline?.textContent).toBe('60')
  expect(queryByText('songs in library')).toBeInTheDocument()
  // 9643s → 2h 40m, coarse rather than the hh:mm:ss the library song rows use.
  expect(queryByText('2 h 40 min')).toBeInTheDocument()
  expect(queryByText('27')).toBeInTheDocument()
  expect(queryByText('58')).toBeInTheDocument()
  // An all-remote library reports 0 bytes; "0 B" must not be rendered.
  expect(queryByText('0 B on disk')).not.toBeInTheDocument()
})

test('the stats panel shows total size only when the library has local files', async () => {
  withPlaylists()
  statsHook.mockReturnValue(stats({ total_songs: 3, total_file_size: 1024 * 1024 * 12 }))
  const { queryByText } = await renderPage()
  expect(queryByText('12 MB on disk')).toBeInTheDocument()
})

test('a failed stats read degrades to zeroes instead of hiding the panel', async () => {
  withPlaylists()
  statsHook.mockReturnValue({ data: undefined, refetch: vi.fn() })
  const { queryByTestId, queryByText } = await renderPage()
  expect(queryByTestId('home-stats')).toBeInTheDocument()
  expect(queryByText('songs in library')).toBeInTheDocument()
})

test('shows the first-load state while both sections load', async () => {
  normalHook.mockReturnValue(result(undefined, { isLoading: true }))
  radioHook.mockReturnValue(result(undefined, { isLoading: true }))
  const { queryByText } = await renderPage()
  expect(queryByText('Loading…')).toBeInTheDocument()
})

test('shows per-section empty states when both sections are empty', async () => {
  normalHook.mockReturnValue(result([{ playlists: [], total: 0 }]))
  radioHook.mockReturnValue(result([{ playlists: [], total: 0 }]))
  const { queryByText } = await renderPage()
  // Normal section: empty title + the single accent CTA (create playlist).
  expect(queryByText('No playlists yet')).toBeInTheDocument()
  expect(queryByText('Create playlist')).toBeInTheDocument()
  // Radio section: text-only empty — no dedicated CTA (header "View all" is the
  // escape), keeping one accent surface on a both-empty screen.
  expect(queryByText('No radios yet')).toBeInTheDocument()
  // The old whole-page "Browse library" CTA is gone.
  expect(queryByText('Browse library')).not.toBeInTheDocument()
})

test('shows the whole-page error when both sections fail with no data', async () => {
  normalHook.mockReturnValue(result(undefined, { isError: true }))
  radioHook.mockReturnValue(result(undefined, { isError: true }))
  const { queryByText } = await renderPage()
  expect(queryByText('Couldn’t load your home.')).toBeInTheDocument()
})

test('degrades one failed section to an inline error while the other still renders', async () => {
  normalHook.mockReturnValue(result(undefined, { isError: true }))
  radioHook.mockReturnValue(
    result([{ playlists: [makePlaylist(2, { type: 'radio', name: 'Jazz Radio' })], total: 1 }]),
  )
  const { queryByText } = await renderPage()
  // Failed normal section → inline retry; radio section still shows its card.
  expect(queryByText('Couldn’t load this section.')).toBeInTheDocument()
  expect(queryByText('My Radios')).toBeInTheDocument()
  expect(queryByText('Jazz Radio')).toBeInTheDocument()
})

test('hidden radios remove the whole section, skip paging and ignore its loading state', async () => {
  await changeHomeConfig({ showRadios: false })
  normalHook.mockReturnValue(result([{ playlists: [makePlaylist(1)], total: 1 }]))
  const fetchNextPage = vi.fn()
  radioHook.mockReturnValue(result(undefined, { isLoading: true, hasNextPage: true, fetchNextPage }))
  const view = render(<HomePage />)
  await act(async () => { await Promise.resolve() })
  expect(view.queryByText('My Playlists')).toBeInTheDocument()
  expect(view.queryByText('My Radios')).not.toBeInTheDocument()
  expect(fetchNextPage).not.toHaveBeenCalled()
  await act(async () => { await changeHomeConfig({ showRadios: true }) })
  expect(view.queryByText('My Radios')).toBeInTheDocument()
})

test('a single desktop section uses six automatic columns and fills both rows', async () => {
  await changeHomeConfig({ layout: 'adaptive', columns: 0, rows: 2, showRadios: false })
  breakpointHook.mockReturnValue({ width: 1664, isWide: true, breakpoint: 'desktop', onLayoutChange: () => {} })
  normalHook.mockReturnValue(result([{ playlists: Array.from({ length: 20 }, (_, i) => makePlaylist(i + 1)), total: 20 }]))
  const view = render(<HomePage />)
  await act(async () => { await Promise.resolve() })
  expect(view.container.querySelector('.home--bento')).toBeNull()
  expect(view.container.querySelector('.home-section__grid--6')).not.toBeNull()
  expect(view.container.querySelectorAll('.playlist-card')).toHaveLength(12)
  await act(async () => { await changeHomeConfig({ showRadios: true }) })
  expect(view.container.querySelector('.home--bento')).not.toBeNull()
  expect(view.container.querySelector('.home-section__grid--4')).not.toBeNull()
  expect(view.container.querySelectorAll('.playlist-card')).toHaveLength(8)
})
