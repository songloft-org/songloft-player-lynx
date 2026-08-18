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

async function renderView() {
  render(<FacetGridView field='artist' />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
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
  const input = searchInputs.find((i) => i.placeholder === 'Search categories…')
  expect(input).toBeDefined()
  await act(async () => {
    input!.onInput('mi')
  })
  expect(facetsHook).toHaveBeenCalledWith('artist', 'mi')
})

test('empty with a keyword shows the no-match state', async () => {
  facetsHook.mockReturnValue(facetsResult([{ facets: [], total: 0 }]))
  const { queryByText } = await renderView()
  const input = searchInputs.find((i) => i.placeholder === 'Search categories…')
  await act(async () => {
    input!.onInput('zzz')
  })
  expect(queryByText('No matching categories')).toBeInTheDocument()
})

test('empty without a keyword shows the plain empty state', async () => {
  const { queryByText } = await renderView()
  expect(queryByText('No categories')).toBeInTheDocument()
})
