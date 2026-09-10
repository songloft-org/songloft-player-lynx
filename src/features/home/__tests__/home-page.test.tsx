import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, getQueriesForElement, render } from '@lynx-js/react/testing-library'

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
const { normalHook, radioHook, statsHook } = vi.hoisted(() => ({
  normalHook: vi.fn(),
  radioHook: vi.fn(),
  statsHook: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))

vi.mock('../../player/store/index.js', async () =>
  (await import('../../../__tests__/_render-mocks.js')).makePlayerStoreMock({}),
)

vi.mock('../../jsplugin/widgets/PluginGrid.js', () => ({
  PluginGrid: () => null,
}))

vi.mock('../data/home-query.js', () => ({
  useHomePlaylists: (type: string) => (type === 'radio' ? radioHook() : normalHook()),
}))

vi.mock('../data/home-stats-query.js', () => ({
  useLibraryStatsQuery: () => statsHook(),
}))

const { HomePage } = await import('../pages/HomePage.js')

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

beforeEach(() => {
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
