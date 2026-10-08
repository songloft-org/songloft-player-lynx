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

const VIEWPORT = { width: 420, height: 900 }

/**
 * Docked vs anchored. Without a measurement the panel is a bottom sheet; with one it
 * becomes a popover placed by the same `placePanel` the toolbar popovers use — which
 * is why each form owns its offsets in a separate modifier: an inline `top` landing on
 * top of the docked `bottom` would stretch the panel between them instead of being
 * overridden (`GlobalMenu.css`, `anchored-overlay.ts`).
 */
test('the panel docks to the bottom when the row could not be measured', () => {
  const { getByTestId } = renderMenu()
  const panel = getByTestId('menu-item-play').parentElement!.parentElement!.parentElement!
  expect(panel.className).toContain('global-menu__panel--docked')
  expect(panel.className).not.toContain('global-menu__panel--anchored')
  // Offsets come from the stylesheet in this form, so nothing may be inlined — a
  // stray inline `top` here is exactly what would stretch the sheet.
  expect(panel.style.top).toBe('')
  expect(panel.style.bottom).toBe('')
})

test('a measured row anchors the panel to the trigger, opening downwards', () => {
  // A row in the upper half: `⋯` at x 280–316, y 100–136.
  const { getByTestId } = renderMenu({
    anchor: { anchor: { left: 280, top: 100, width: 36, height: 36 }, viewport: VIEWPORT },
  })
  const panel = getByTestId('menu-item-play').parentElement!.parentElement!.parentElement!
  expect(panel.className).toContain('global-menu__panel--anchored')
  expect(panel.className).not.toContain('global-menu__panel--docked')
  // Right edge of the trigger (420 - 316), and the gap below it (136 + 6).
  expect(panel.style.right).toBe('104px')
  expect(panel.style.top).toBe('142px')
  // One offset per axis, or the panel is stretched rather than sized.
  expect(panel.style.left).toBe('')
  expect(panel.style.bottom).toBe('')
})

/**
 * The rows are the reason this menu picks its vertical side per opening, unlike the
 * toolbar popovers, which always open the way they were told: the same `⋯` button is
 * near the top of the screen for one song and near the bottom for the next, and a
 * downward menu on the last visible row would be capped to a few scrolling pixels.
 */
test('a row in the lower half opens upwards instead', () => {
  const { getByTestId } = renderMenu({
    anchor: { anchor: { left: 280, top: 700, width: 36, height: 36 }, viewport: VIEWPORT },
  })
  const panel = getByTestId('menu-item-play').parentElement!.parentElement!.parentElement!
  expect(panel.style.bottom).toBe('206px') // 900 - 700 + 6, so it grows upwards
  expect(panel.style.top).toBe('')
})

/**
 * The catcher is always there; only the docked form paints it. An anchored menu is a
 * popover, and a scrim behind it is what made the song menu look like a different
 * mechanism from the sort / speed / play-mode menus. The fill itself lives in
 * `GlobalMenu.css` (asserted in `global-menu-css.test.ts`); this is the class switch.
 */
test('the anchored form leaves its tap catcher unpainted', () => {
  const anchored = renderMenu({
    anchor: { anchor: { left: 280, top: 100, width: 36, height: 36 }, viewport: VIEWPORT },
  })
  expect(anchored.getByTestId('global-menu-backdrop').className)
    .not.toContain('global-menu__backdrop--docked')
})

test('the docked fallback dims what is behind it', () => {
  const docked = renderMenu()
  expect(docked.getByTestId('global-menu-backdrop').className)
    .toContain('global-menu__backdrop--docked')
})
