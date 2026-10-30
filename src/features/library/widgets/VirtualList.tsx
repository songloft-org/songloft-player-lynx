import { useMemo, type ReactNode } from '@lynx-js/react'
import type { ScrollEvent } from '@lynx-js/types'
import { isWebPlatform } from '../../../native/web-platform.js'

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
  /** Fired on every scroll; used to feed the cross-layer scroll-edge signal. */
  onScroll?: (event: ScrollEvent) => void
  /** Optional trailing element (e.g. a "loading more…" footer). */
  footer?: ReactNode
  /** Scrolls with the rows, so large-font page chrome cannot consume their viewport. */
  header?: ReactNode
  className?: string
  id?: string
  /** Placeholder estimate only; rendered rows can still grow with font size. */
  estimatedItemHeight?: number
  /** Distance (px) from the end that triggers `onEndReached`. */
  lowerThreshold?: number
}

export function VirtualList<T>({
  items,
  itemKey,
  renderItem,
  onEndReached,
  onScroll,
  footer,
  header,
  className,
  id,
  estimatedItemHeight,
  lowerThreshold = 200,
}: VirtualListProps<T>) {
  // Scrollbar/hint updates must not rebuild every loaded song and its effects.
  // Data, row callbacks and size changes still invalidate the row tree.
  const rows = useMemo(
    () =>
      items.map((item, index) => {
        const key = itemKey(item, index)
        return (
          <list-item
            id={id ? `${id}-item-${key}` : undefined}
            key={key}
            item-key={key}
            estimated-main-axis-size-px={estimatedItemHeight}
            className='library__list-item'
          >
            {renderItem(item, index)}
          </list-item>
        )
      }),
    [items, itemKey, renderItem, id, estimatedItemHeight],
  )

  // Web observes a single threshold row. A fast jump can pass that row when
  // prefetching more than one viewport ahead; keep the actual end observable.
  // This event is provided by web-elements, not the native list contract.
  const webEndEdge = isWebPlatform() ? { bindscrolltoloweredge: onEndReached } : {}

  return (
    <list
      {...webEndEdge}
      id={id}
      className={className}
      scroll-y
      lower-threshold={lowerThreshold}
      lower-threshold-item-count={
        isWebPlatform()
          ? Math.max(1, Math.ceil(lowerThreshold / (estimatedItemHeight || 64)))
          : undefined
      }
      bindscrolltolower={onEndReached}
      bindscroll={onScroll}
    >
      {header ? (
        <list-item
          key='__header__'
          item-key='__header__'
          className='library__list-item'
        >
          {header}
        </list-item>
      ) : null}
      {rows}
      {footer ? (
        <list-item
          key='__footer__'
          item-key='__footer__'
          recyclable={false}
          className='library__list-item'
        >
          {footer}
        </list-item>
      ) : null}
    </list>
  )
}
