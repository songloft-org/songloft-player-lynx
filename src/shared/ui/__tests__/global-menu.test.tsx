import '@testing-library/jest-dom'
import { expect, test, vi } from 'vitest'
import { fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import { GlobalMenu } from '../GlobalMenu.js'

/**
 * `GlobalMenu` is the song menu's surface: a menu that renders at the top level
 * of the app instead of beside its trigger, because the rows that open it live
 * inside virtualized `<list-item>`s that clip overlays.
 *
 * Back-key behaviour lives in `overlay-back-contract.test.tsx` (it enumerates
 * every shared overlay); this file covers the markup and the tap wiring.
 */

const items = [
  { key: 'play', label: 'Play', icon: 'play' as const },
  { key: 'delete', label: 'Delete song', icon: 'x' as const, danger: true },
]

function renderMenu(overrides: Partial<Parameters<typeof GlobalMenu>[0]> = {}) {
  const onClose = vi.fn()
  const onSelect = vi.fn()
  render(
    <GlobalMenu
      show
      onClose={onClose}
      items={items}
      onSelect={onSelect}
      testId='song-menu'
      {...overrides}
    />,
  )
  return { onClose, onSelect, ...getQueriesForElement(elementTree.root!) }
}

test('renders nothing while closed', () => {
  const { queryByTestId } = renderMenu({ show: false })
  expect(queryByTestId('song-menu')).toBeNull()
})

test('renders every item with the shared popover-menu row classes', () => {
  const { queryByText, queryByTestId } = renderMenu()
  expect(queryByText('Play')).toBeInTheDocument()
  expect(queryByText('Delete song')).toBeInTheDocument()
  // The row markup is shared with the anchored `PopoverMenu` (see MenuItem.tsx);
  // if it ever forks, the two menus stop looking alike.
  expect(queryByTestId('menu-item-play')?.className).toContain('popover-menu__item')
})

test('a destructive item labels itself with the danger class', () => {
  const { getByText } = renderMenu()
  expect(getByText('Delete song').className).toContain('popover-menu__item-label--danger')
})

test('selecting an item reports the key and closes', () => {
  const { onSelect, onClose, getByTestId } = renderMenu()
  fireEvent.tap(getByTestId('menu-item-play'), {})
  expect(onSelect).toHaveBeenCalledWith('play')
  expect(onSelect).toHaveBeenCalledTimes(1)
  // Exactly once: the close handler lives on the backdrop, a sibling of the
  // panel, so a row tap cannot also trigger the outside-tap close.
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('tapping the backdrop closes without selecting anything', () => {
  const { onClose, onSelect, getByTestId } = renderMenu()
  fireEvent.tap(getByTestId('global-menu-backdrop'), {})
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(onSelect).not.toHaveBeenCalled()
})

test('the header shows the song it belongs to', () => {
  const { queryByText } = renderMenu({ title: 'Blue in Green', subtitle: 'Miles Davis' })
  expect(queryByText('Blue in Green')).toBeInTheDocument()
  expect(queryByText('Miles Davis')).toBeInTheDocument()
})

/**
 * Docked vs anchored. Without an `anchor` the panel is a bottom sheet; with one
 * it becomes a popover placed under the measured trigger box — the form the
 * anchoring step turns on, and the reason the class is a separate modifier
 * (`GlobalMenu.css` has to release the docked `bottom`/`right`).
 */
test('the panel docks to the bottom when no anchor is given', () => {
  const { getByTestId } = renderMenu()
  const panel = getByTestId('menu-item-play').parentElement!.parentElement!
  expect(panel.className).toContain('global-menu__panel')
  expect(panel.className).not.toContain('global-menu__panel--anchored')
})

test('an anchor switches the panel to the anchored variant below the trigger', () => {
  const { getByTestId } = renderMenu({
    anchor: { left: 120, top: 40, width: 24, height: 24 },
  })
  const panel = getByTestId('menu-item-play').parentElement!.parentElement!
  expect(panel.className).toContain('global-menu__panel--anchored')
  // Under the trigger: top + height.
  expect(panel.style.top).toBe('64px')
  expect(panel.style.left).toBe('120px')
})
