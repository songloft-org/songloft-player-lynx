import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

/**
 * The narrow library pill strip is a horizontal `<scroll-view>`, so its scroll
 * position is the x offset — not the y offset that the settings/list
 * `scroll-memory` tests exercise. These tests pin (a) the strip restores the x
 * offset after remount and (b) `bindscroll` records `scrollLeft`: if the hook
 * still read `scrollTop`, scrolling below would store 0 and the restore stays '0'.
 */
const { clearScrollMemory } = await import('../../../shared/nav/scroll-memory.js')
const { LibraryViewSwitcher } = await import('../widgets/LibraryViewSwitcher.js')
import type { LibraryViewKey } from '../domain/library-views.js'

const DISPLAY_KEYS: LibraryViewKey[] = [
  'all', 'local', 'remote', 'radio',
  'artist', 'album', 'genre', 'year', 'decade', 'language', 'style',
  'tag', 'folder', 'playlist',
]

beforeEach(() => clearScrollMemory())
afterEach(() => vi.clearAllMocks())

async function renderSwitcher() {
  const { unmount } = render(
    <LibraryViewSwitcher displayKeys={DISPLAY_KEYS} selected='all' onSelect={vi.fn()} />,
  )
  await act(async () => {
    await Promise.resolve()
  })
  return { ...getQueriesForElement(elementTree.root!), unmount }
}

function scrollSwitcherTo(scrollLeft: number) {
  const target = lynx.createSelectorQuery().select('[data-testid="library-view-switcher-scroll"]')
  fireEvent.scroll(target as unknown as Element, { detail: { scrollLeft } })
}

test('starts at the left on the first visit of a session', async () => {
  const { getByTestId } = await renderSwitcher()
  expect(getByTestId('library-view-switcher-scroll').getAttribute('initial-scroll-offset')).toBe('0')
})

test('returning to the library restores the pill strip x offset', async () => {
  const first = await renderSwitcher()
  scrollSwitcherTo(320)
  first.unmount()

  const second = await renderSwitcher()
  expect(second.getByTestId('library-view-switcher-scroll').getAttribute('initial-scroll-offset')).toBe('320')
})