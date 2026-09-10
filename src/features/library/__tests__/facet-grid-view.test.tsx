import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { SongFacet } from '../../../models/song.js'

/**
 * FacetGridView render tests — the category grid content view. Covers the
 * server-side search wiring (the `/songs/facets` `keyword` param the old view
 * never exposed) and the two distinct empty states.
 */
const { facetsHook, navigateSpy, searchInputs } = vi.hoisted(() => ({
  facetsHook: vi.fn(),
  navigateSpy: vi.fn(),
  searchInputs: [] as Array<{ placeholder: string; onInput: (v: string) => void }>,
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('../data/songs-query.js', () => ({
  useFacetsInfiniteQuery: facetsHook,
  libraryQueryKeys: { facets: () => [] },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateSpy,
}))

vi.mock('@lynx-js/lynx-ui-input', () => ({
  Input: (props: Record<string, unknown>) => {
    if (typeof props.onInput === 'function') {
      searchInputs.push({
        placeholder: props.placeholder as string,
        onInput: props.onInput as (v: string) => void,
      })
    }
    return (
      <view className={props.className as string}>
        <text>{(props.value || props.placeholder) as string}</text>
      </view>
    )
  },
}))

vi.mock('../data/use-debounce.js', () => ({
  useDebounce: <T,>(value: T, _delay: number): T => value,
}))

const { FacetGridView } = await import('../widgets/FacetGridView.js')

function facetsResult(pages: { facets: SongFacet[]; total: number }[], over = {}) {
  return {
    data: { pages },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    ...over,
  }
}

beforeEach(() => {
  facetsHook.mockReturnValue(facetsResult([{ facets: [], total: 0 }]))
  searchInputs.length = 0
})

afterEach(() => vi.clearAllMocks())

async function renderView(viewMode?: 'grid' | 'list') {
  render(<FacetGridView field='artist' viewMode={viewMode} />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

function oneArtistPage() {
  return [{
    facets: [{ value: 'Miles Davis', count: 12, coverUrl: 'covers/miles.jpg' }],
    total: 1,
  }]
}

test('queries the given field with an empty keyword by default', async () => {
  await renderView()
  expect(facetsHook).toHaveBeenCalledWith('artist', '')
})

test('renders a card per facet and tapping one drills into the category page', async () => {
  facetsHook.mockReturnValue(
    facetsResult([
      { facets: [{ value: 'Miles Davis', count: 12, coverUrl: 'covers/miles.jpg' }], total: 1 },
    ]),
  )
  const { getByText } = await renderView()

  expect(getByText('Miles Davis')).toBeInTheDocument()
  await act(async () => {
    fireEvent.tap(getByText('Miles Davis'))
  })
  expect(navigateSpy).toHaveBeenCalledWith({
    to: '/library/category/$field',
    params: { field: 'artist' },
    search: { value: 'Miles Davis', cover: 'covers/miles.jpg' },
  })
})

test('typing in the search box passes the keyword to the query', async () => {
  await renderView()
  const input = searchInputs.find((i) => i.placeholder === 'Search artists…')
  expect(input).toBeDefined()
  await act(async () => {
    input!.onInput('mi')
  })
  expect(facetsHook).toHaveBeenCalledWith('artist', 'mi')
})

test('empty with a keyword shows the no-match state', async () => {
  facetsHook.mockReturnValue(facetsResult([{ facets: [], total: 0 }]))
  const { queryByText } = await renderView()
  const input = searchInputs.find((i) => i.placeholder === 'Search artists…')
  await act(async () => {
    input!.onInput('zzz')
  })
  expect(queryByText('No matching categories')).toBeInTheDocument()
})

test('empty without a keyword shows the plain empty state', async () => {
  const { queryByText } = await renderView()
  expect(queryByText('No categories')).toBeInTheDocument()
})

/**
 * Layout gate. This view once grew a private `.facet-list-item` row that was a
 * near-verbatim clone of `MediaListItem` (minus the empty-cover icon and the
 * `--playing` state), and reused `.library__list` as its container — a class
 * written for the songs virtual `<list>`, whose `height: 100%` clamps a plain
 * `<view>` inside the scroll-view to one viewport. Nothing asserted either, so
 * the fix was lost in a stash for days. These two tests are that missing gate.
 */
test('list mode renders the shared MediaListItem row in its own flex column', async () => {
  facetsHook.mockReturnValue(facetsResult(oneArtistPage()))
  await renderView('list')
  const root = elementTree.root!

  expect(root.querySelectorAll('.media-list-item')).toHaveLength(1)
  expect(root.querySelectorAll('.facet-list-item')).toHaveLength(0)
  // Play-all stays reachable in list mode (it lives inside the shared row now).
  expect(root.querySelectorAll('.media-list-item__play-btn')).toHaveLength(1)

  expect(root.querySelectorAll('.library__facet-list')).toHaveLength(1)
  expect(root.querySelectorAll('.library__list')).toHaveLength(0)
})

test('grid mode still renders facet cards', async () => {
  facetsHook.mockReturnValue(facetsResult(oneArtistPage()))
  await renderView('grid')
  const root = elementTree.root!

  expect(root.querySelectorAll('.facet-card')).toHaveLength(1)
  expect(root.querySelectorAll('.media-list-item')).toHaveLength(0)
  expect(root.querySelectorAll('.library__grid')).toHaveLength(1)
})
