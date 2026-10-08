import { render, fireEvent, getQueriesForElement } from '@lynx-js/react/testing-library'
import { expect, test, vi } from 'vitest'
import { PopoverSurface } from '../PopoverSurface.js'
import { GlobalMenu } from '../GlobalMenu.js'
import { menuScrollMaxHeight } from '../menu-viewport.js'
vi.mock('../../../native/backdrop-capabilities.js', () => ({
  BACKDROP_CAPTURE_TARGET: 'songloft-backdrop',
  getBackdropCapabilities: () => ({ blur: true, liquidGlass: false, androidCapture: false }),
}))

function findBlur(node: Element): Element | undefined {
  if (node.className?.includes('ui-backdrop-blur')) return node
  for (const child of Array.from(node.children)) {
    const found = findBlur(child)
    if (found) return found
  }
}

test('a popover keeps its blur outside the bounded native scroller', () => {
  render(<PopoverSurface show onShowChange={vi.fn()} trigger={<text>Open</text>}
    placement='bottom' panelClassName='popover-menu'>
    <text data-testid='last-row'>Last</text>
  </PopoverSurface>)
  const { getByTestId } = getQueriesForElement(elementTree.root!)
  const content = getByTestId('last-row').parentElement!
  const scroll = content.parentElement!
  const shell = scroll.parentElement!
  expect(scroll.tagName.toLowerCase()).toBe('scroll-view')
  expect(scroll.getAttribute('scroll-orientation')).toBe('vertical')
  expect(scroll.style.maxHeight).toBeTruthy()
  const blur = findBlur(shell)!
  expect(blur).toBeDefined()
  expect(scroll.contains(blur)).toBe(false)
})

test.each([true, false])('a long global menu remains selectable with anchored=%s', anchored => {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(<GlobalMenu show onClose={onClose} onSelect={onSelect}
    items={Array.from({ length: 30 }, (_, i) => ({ key: String(i), label: `Item ${i}` }))}
    anchor={anchored ? {
      anchor: { left: 100, top: 60, width: 40, height: 40 }, viewport: { width: 320, height: 240 },
    } : undefined} />)
  const { getByTestId } = getQueriesForElement(elementTree.root!)
  const last = getByTestId('menu-item-29')
  const scroll = last.parentElement!.parentElement!
  expect(scroll.tagName.toLowerCase()).toBe('scroll-view')
  expect(scroll.style.maxHeight).toBe(anchored ? '124px' : menuScrollMaxHeight())
  if (anchored) {
    const blur = findBlur(scroll.parentElement!)!
    expect(blur).toBeDefined()
    expect(scroll.contains(blur)).toBe(false)
  }
  fireEvent.tap(last, {})
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('29')
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('a nearly exhausted anchor cannot create a negative scroll height', () => {
  expect(menuScrollMaxHeight({ panelMaxHeight: '1px' })).toBe('0px')
})
