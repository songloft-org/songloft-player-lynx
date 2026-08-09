import type { ReactNode } from '@lynx-js/react'

/**
 * Thin wrapper over the native Lynx `<list>` element (virtualized scrolling +
 * `bindscrolltolower` load-more). Extracted as its own component for two
 * reasons:
 *
 *  1. it centralizes the `<list>` guardrails (resolved height via CSS, stable
 *     `item-key`, `lower-threshold`), and
 *  2. `<list>`/`<list-item>` virtualize their children, so the ReactLynx Vitest
 *     testing-library env does not mount item content into the queryable tree.
 *     Render tests therefore mock THIS module with a plain-`<view>` stand-in
 *     (see `src/__tests__/_render-mocks.tsx` → `mockVirtualList`), exercising the
 *     row/page logic while the real `<list>` ships in build/dev/on-device.
 */
export interface VirtualListProps<T> {
  items: readonly T[]
  /** Stable, unique key per item (used for both `key` and `item-key`). */
  itemKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => ReactNode
  /** Fired when the list scrolls near the bottom (load-more). */
  onEndReached?: () => void
  /** Optional trailing element (e.g. a "loading more…" footer). */
  footer?: ReactNode
  className?: string
  /** Distance (px) from the end that triggers `onEndReached`. */
  lowerThreshold?: number
}

export function VirtualList<T>({
  items,
  itemKey,
  renderItem,
  onEndReached,
  footer,
  className,
  lowerThreshold = 200,
}: VirtualListProps<T>) {
  return (
    <list
      className={className}
      scroll-y
      lower-threshold={lowerThreshold}
      bindscrolltolower={onEndReached}
    >
      {items.map((item, index) => (
        <list-item
          key={itemKey(item, index)}
          item-key={itemKey(item, index)}
          className='library__list-item'
        >
          {renderItem(item, index)}
        </list-item>
      ))}
      {footer
        ? (
          <list-item key='__footer__' item-key='__footer__' className='library__list-item'>
            {footer}
          </list-item>
        )
        : null}
    </list>
  )
}
