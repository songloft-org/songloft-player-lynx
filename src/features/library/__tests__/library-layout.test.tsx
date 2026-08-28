import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import { DEFAULT_LIBRARY_BROWSE_CONFIG } from '../../../models/library-browse.js'

/**
 * `LibraryLayout` — the route layout that owns the library view rail.
 *
 * The rail lives here, above the `<Outlet/>`, so that drilling into
 * `/library/add` or `/playlists/create` cannot re-create it: those pages used to
 * render their own copy, gated on an async width store plus the browse-config
 * query, and the rail therefore appeared one frame (or one fetch) after paint —
 * the "flashes on open" report. These tests pin the two properties that fix
 * carries: the rail is present exactly when wide, and its width decision is
 * seeded from the shell's already-measured width rather than from 0.
 */
const { navigateSpy, searchHook, browseConfigHook, breakpointHook, lastSearch, location } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  searchHook: vi.fn(),
  browseConfigHook: vi.fn(),
  breakpointHook: vi.fn(),
  lastSearch: { current: {} as { view?: string } },
  location: { pathname: '/library' },
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateSpy,
  useSearch: searchHook,
  // The rail highlight is per-route, so the layout reads the pathname.
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) => select({ location }),
  Outlet: () => <text>OUTLET</text>,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: browseConfigHook,
}))

vi.mock('../data/last-library-search.js', () => ({
  getLastLibrarySearch: () => lastSearch.current,
}))

/*
 * Only `useBreakpoint` is faked — `breakpointFromWidth` / `isWide` stay real,
 * because the seeding arithmetic (window width minus the 220px nav rail) is
 * exactly what the last test asserts.
 */
vi.mock('../../../shared/responsive/useBreakpoint.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../shared/responsive/useBreakpoint.js')>()),
  useBreakpoint: breakpointHook,
}))

const { LibraryLayout } = await import('../pages/LibraryLayout.js')
const { setShellWidth } = await import('../../../shared/nav/shell-navigation.js')

beforeEach(() => {
  searchHook.mockReturnValue({})
  browseConfigHook.mockReturnValue({ data: DEFAULT_LIBRARY_BROWSE_CONFIG, isError: false })
  breakpointHook.mockReturnValue({ isWide: false, onLayoutChange: vi.fn() })
  lastSearch.current = {}
  location.pathname = '/library'
})

/** Render at `pathname`, wide, so the rail is up and its highlight is assertable. */
async function renderWideAt(pathname: string) {
  location.pathname = pathname
  breakpointHook.mockReturnValue({ isWide: true, onLayoutChange: vi.fn() })
  return renderLayout()
}

const activeRow = (q: ReturnType<typeof getQueriesForElement>) =>
  [...'artist album genre year decade language style all local remote radio playlist playlist_normal playlist_radio'.split(' ')]
    .find(k => q.queryByTestId(`library-view-row-${k}`)?.className.includes('library-rail__row--active'))

afterEach(() => vi.clearAllMocks())

async function renderLayout() {
  render(<LibraryLayout />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('narrow: the routed page only, no rail', async () => {
  const { queryAllByTestId, queryByText } = await renderLayout()
  expect(queryByText('OUTLET')).toBeInTheDocument()
  expect(queryAllByTestId(/^library-view-row-/)).toHaveLength(0)
})

test('wide: the rail renders one row per visible view, beside the routed page', async () => {
  breakpointHook.mockReturnValue({ isWide: true, onLayoutChange: vi.fn() })
  const { queryAllByTestId, queryByText } = await renderLayout()
  expect(queryAllByTestId(/^library-view-row-/)).toHaveLength(15)
  expect(queryByText('OUTLET')).toBeInTheDocument()
})

test('tapping a rail row navigates to that library view', async () => {
  breakpointHook.mockReturnValue({ isWide: true, onLayoutChange: vi.fn() })
  const { getByTestId } = await renderLayout()
  await act(async () => {
    fireEvent.tap(getByTestId('library-view-row-album'))
  })
  expect(navigateSpy).toHaveBeenCalledWith({ to: '/library', search: { view: 'album' } })
})

test('config still pending → no rail rows, and the page still renders', async () => {
  breakpointHook.mockReturnValue({ isWide: true, onLayoutChange: vi.fn() })
  browseConfigHook.mockReturnValue({ data: undefined, isError: false })
  const { queryAllByTestId, queryByText } = await renderLayout()
  expect(queryAllByTestId(/^library-view-row-/)).toHaveLength(0)
  expect(queryByText('OUTLET')).toBeInTheDocument()
})

/*
 * The highlight on a sub-page: `/library/add` carries no `?view=`, so without the
 * fallback the rail would light up the first visible view instead of the one the
 * user came from. This replaces the `selectedView` state the two drill-ins used to
 * keep by hand.
 */
test('with no ?view= the highlight follows the last library view visited', async () => {
  breakpointHook.mockReturnValue({ isWide: true, onLayoutChange: vi.fn() })
  lastSearch.current = { view: 'genre' }
  const { getByTestId } = await renderLayout()
  expect(getByTestId('library-view-row-genre').className).toContain('library-rail__row--active')
  expect(getByTestId('library-view-row-all').className).not.toContain('library-rail__row--active')
})

/*
 * The anti-flash property. `useBreakpoint`'s first argument is the width it starts
 * at, and everything else about it lands only after paint — so a 0 seed means one
 * narrow frame on every mount, which is what the drill-in pages suffered. The
 * layout must hand it the content-area width derived from the shell's measurement:
 * the window minus the 220px nav rail while the shell is wide, the window itself
 * otherwise.
 */
test('seeds the measurement with the shell width minus the nav rail', async () => {
  setShellWidth(1280)
  await renderLayout()
  expect(breakpointHook).toHaveBeenCalledWith(1280 - 220, '.library-shell')
})

test('below the tablet breakpoint the shell has no nav rail, so the seed is the full width', async () => {
  setShellWidth(420)
  await renderLayout()
  expect(breakpointHook).toHaveBeenCalledWith(420, '.library-shell')
})

/*
 * The detail pages sit under this layout too, so the rail stays put while drilling
 * in — which makes the highlight the only cue for where you are.
 */
test('a facet drill-in lights its own dimension, not the view visited last', async () => {
  lastSearch.current = { view: 'all' }
  const q = await renderWideAt('/library/category/artist')
  expect(activeRow(q)).toBe('artist')
})

test('playlist detail anchors to the playlists group even when arriving from a songs view', async () => {
  lastSearch.current = { view: 'all' }
  const q = await renderWideAt('/playlists/7')
  expect(activeRow(q)).toBe('playlist')
})

test('playlist detail keeps the playlist view it was reached from', async () => {
  lastSearch.current = { view: 'playlist_radio' }
  const q = await renderWideAt('/playlists/7')
  expect(activeRow(q)).toBe('playlist_radio')
})
