import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import {
  clearBackHandlersForTests,
  dispatchBack,
  getBackStackDepth,
} from '../../../shared/nav/back-stack.js'

/**
 * One back press peels exactly one of the player's overlay layers.
 *
 * The player now stacks three of them — the speed menu, the volume popover, and the
 * overflow menu that hands off to `SongContextMenu` — on top of a page-level handler
 * that slides the swiper back from the lyrics screen. Back-stack priority is
 * *activation order*, so the risk is not "does back work" but "does it peel the layer
 * the user is actually looking at".
 *
 * The overflow menu's handoff to `SongContextMenu` was the suspected sharp edge:
 * `PopoverMenu` invokes `onSelect` and then immediately `onShowChange(false)`, so
 * opening another overlay from that callback puts both state writes in one commit —
 * one layer unregistering while a *sibling* registers. That looked like it should
 * reduce to render order rather than to what the user did. It was measured instead of
 * assumed, and it does not: depth stays 1 and the right layer is peeled whether the
 * handoff is inline or deferred by a render.
 *
 * So these tests pin the **invariant**, not the mechanism — one layer at a time, and
 * back peels the one on screen. Rewriting `PlayerMoreMenu` to defer again would keep
 * them green, which is correct: both mechanisms are fine, and the file says so.
 */

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useInfiniteQuery: () => ({ data: undefined, isLoading: false }),
  useQuery: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@lynx-js/lynx-ui-slider', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSlider(),
)
vi.mock('@lynx-js/lynx-ui-popover', async () => ({
  ...(await vi.importActual<typeof import('@lynx-js/lynx-ui-popover')>(
    '@lynx-js/lynx-ui-popover',
  )),
  ...(await import('../../../__tests__/_render-mocks.js')).mockLynxUiPopover(),
}))
vi.mock('../store/player-store.js', async () => {
  const actual = await vi.importActual<typeof import('../store/player-store.js')>(
    '../store/player-store.js',
  )
  const { makePlayerStoreMock } = await import('../../../__tests__/_render-mocks.js')
  return makePlayerStoreMock(actual)
})

const { PlayerToolBar } = await import('../widgets/PlayerToolBar.js')
const { PlayerMoreMenu } = await import('../widgets/PlayerMoreMenu.js')
const { mockSong } = await import('../../../__tests__/_render-mocks.js')

beforeEach(() => clearBackHandlersForTests())
afterEach(() => {
  clearBackHandlersForTests()
  vi.clearAllMocks()
})

async function renderAndQuery(node: React.ReactElement) {
  render(node)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('nothing claims the back key while every overlay is shut', async () => {
  await renderAndQuery(<PlayerToolBar slot={48} />)

  // The other half of the contract: these components stay mounted while closed, so a
  // registration that ignored the visibility flag would eat every press on the page.
  expect(getBackStackDepth()).toBe(0)
  expect(dispatchBack()).toBe(false)
})

test('back closes the volume popover rather than leaving the player', async () => {
  const { getByTestId } = await renderAndQuery(<PlayerToolBar slot={48} />)

  await act(async () => {
    fireEvent.tap(getByTestId('volume-btn'))
  })
  expect(getBackStackDepth()).toBe(1)

  await act(async () => {
    expect(dispatchBack()).toBe(true)
  })
  expect(getBackStackDepth()).toBe(0)
})

test('back closes the speed menu rather than leaving the player', async () => {
  const { getByTestId } = await renderAndQuery(<PlayerToolBar slot={48} />)

  await act(async () => {
    fireEvent.tap(getByTestId('speed-btn'))
  })
  expect(getBackStackDepth()).toBe(1)

  await act(async () => {
    expect(dispatchBack()).toBe(true)
  })
  expect(getBackStackDepth()).toBe(0)
})

test('opening the volume popover then the speed menu leaves one layer each', async () => {
  const { getByTestId } = await renderAndQuery(<PlayerToolBar slot={48} />)

  // Both live in the same row and share the backdrop rule that stops two popovers
  // being open at once, so the depth must never accumulate.
  await act(async () => {
    fireEvent.tap(getByTestId('volume-btn'))
  })
  await act(async () => {
    expect(dispatchBack()).toBe(true)
  })
  await act(async () => {
    fireEvent.tap(getByTestId('speed-btn'))
  })
  expect(getBackStackDepth()).toBe(1)
})

test('the overflow menu hands off to the song menu without stacking two layers', async () => {
  const { getByTestId, getByText, queryByText } = await renderAndQuery(
    <PlayerMoreMenu song={mockSong()} onOpenSleepTimer={vi.fn()} timerActive={false} />,
  )

  await act(async () => {
    fireEvent.tap(getByTestId('icon-more'))
  })
  expect(getBackStackDepth()).toBe(1)

  // Selecting the row closes this menu and opens `SongContextMenu` one render later.
  await act(async () => {
    fireEvent.tap(getByText('Song actions…'))
  })
  await act(async () => {
    await Promise.resolve()
  })

  // The song menu is open…
  expect(queryByText('Play next')).toBeInTheDocument()
  // …and it is the *only* layer holding the back key. A depth of 2 here would mean
  // the overflow menu never let go, i.e. two backdrops and a back press that leaves
  // one of them on screen.
  expect(getBackStackDepth()).toBe(1)

  await act(async () => {
    expect(dispatchBack()).toBe(true)
  })
  await act(async () => {
    await Promise.resolve()
  })
  expect(queryByText('Play next')).not.toBeInTheDocument()
  expect(getBackStackDepth()).toBe(0)
})
