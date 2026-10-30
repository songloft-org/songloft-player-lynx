import { expect, test, vi } from 'vitest'
import { fireEvent, render } from '@lynx-js/react/testing-library'
import { VirtualList } from '../widgets/VirtualList.js'

const platform = vi.hoisted(() => ({ web: false }))
vi.mock('../../../native/web-platform.js', () => ({ isWebPlatform: () => platform.web }))

test('Web can load at the actual end after a fast jump skips the prefetch row', () => {
  platform.web = true
  try {
    const onEndReached = vi.fn()
    const view = render(<VirtualList items={[1, 2]} itemKey={String} renderItem={String}
      lowerThreshold={768} onEndReached={onEndReached} />)
    const list = view.container.querySelector('list')!
    fireEvent.scrolltoloweredge(list, { detail: {} })
    expect(onEndReached).toHaveBeenCalledTimes(1)
  } finally { platform.web = false }
})

test('scroll callback changes reuse loaded rows; new pages and row callbacks invalidate them', () => {
  const items = Array.from({ length: 80 }, (_, id) => ({ id }))
  const itemKey = (item: { id: number }) => String(item.id)
  const renderItem = vi.fn((item: { id: number }) => (
    <text>{String(item.id)}</text>
  ))
  const props = { items, itemKey, renderItem }
  const view = render(<VirtualList {...props} onScroll={() => {}} />)
  expect(renderItem).toHaveBeenCalledTimes(80)
  view.rerender(<VirtualList {...props} onScroll={() => {}} />)
  expect(renderItem).toHaveBeenCalledTimes(80)
  view.rerender(<VirtualList {...props} items={[...items, { id: 80 }]} />)
  expect(renderItem).toHaveBeenCalledTimes(161)
  const nextRender = vi.fn(renderItem)
  view.rerender(<VirtualList {...props} renderItem={nextRender} />)
  expect(nextRender).toHaveBeenCalledTimes(80)
})
