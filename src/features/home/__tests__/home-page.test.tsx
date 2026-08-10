import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Playlist } from '../../../models/playlist.js'

/**
 * HomePage render smoke.
 *
 * Same rule as the batch-4/6 page tests: the playlist infinite hook subscribes
 * via `useSyncExternalStore` (crashes the ReactLynx Vitest snapshot tree + needs
 * a live QueryClient), so `useHomePlaylists` is a `vi.fn()` returning a static
 * infinite-query shape — dispatched per `type` so the two sections get distinct
 * data. `useNavigate` is stubbed. The real pure selectors (`homeSectionItems` /
 * `homeSectionTotal` / `homeStats`), `HomeSection`, `PlaylistCard` and
 * `StatsStrip` all run against the injected data; assertions check the rendered
 * structure (greeting, section titles, card names, stats, states), not fixtures
 * echoed back.
 */
const { normalHook, radioHook } = vi.hoisted(() => ({
  normalHook: vi.fn(),
  radioHook: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))

vi.mock('../../player/store/index.js', async () =>
  (await import('../../../__tests__/_render-mocks.js')).makePlayerStoreMock({}),
)

vi.mock('../data/home-query.js', () => ({
  useHomePlaylists: (type: string) => (type === 'radio' ? radioHook() : normalHook()),
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
    createdAt: '',
    updatedAt: '',
    isBuiltIn: false,
    isAutoCreated: false,
    isHidden: false,
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

beforeEach(() => {
  normalHook.mockReturnValue(result([{ playlists: [], total: 0 }]))
  radioHook.mockReturnValue(result([{ playlists: [], total: 0 }]))
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
  // Stats strip labels + backend totals (10 normal, 4 radio → 14 total).
  expect(queryByText('Playlists')).toBeInTheDocument()
  expect(queryByText('Radios')).toBeInTheDocument()
  expect(queryByText('Total')).toBeInTheDocument()
  expect(queryByText('10')).toBeInTheDocument()
  expect(queryByText('4')).toBeInTheDocument()
  expect(queryByText('14')).toBeInTheDocument()
})

test('shows the first-load state while both sections load', async () => {
  normalHook.mockReturnValue(result(undefined, { isLoading: true }))
  radioHook.mockReturnValue(result(undefined, { isLoading: true }))
  const { queryByText } = await renderPage()
  expect(queryByText('Loading…')).toBeInTheDocument()
})

test('shows the empty state when both sections are empty', async () => {
  normalHook.mockReturnValue(result([{ playlists: [], total: 0 }]))
  radioHook.mockReturnValue(result([{ playlists: [], total: 0 }]))
  const { queryByText } = await renderPage()
  expect(queryByText('No playlists yet')).toBeInTheDocument()
  expect(queryByText('Browse library')).toBeInTheDocument()
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
