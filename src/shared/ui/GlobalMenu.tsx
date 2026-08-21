import { useBackHandler } from '../nav/use-back-handler.js'
import { MenuItem } from './MenuItem.js'
import type { MenuItemSpec } from './MenuItem.js'
import './PopoverMenu.css'
import './GlobalMenu.css'

/** Screen-space box of the element the menu belongs to. */
export interface MenuAnchor {
  left: number
  top: number
  width: number
  height: number
}

export interface GlobalMenuProps {
  show: boolean
  onClose: () => void
  items: MenuItemSpec[]
  onSelect: (key: string) => void
  /** Optional heading (song title etc.) above the rows. */
  title?: string
  subtitle?: string
  /**
   * Where the menu belongs on screen. Omitted (today) the panel docks to the
   * bottom edge; supplied, it is placed against the anchor like a popover.
   *
   * This is the escape hatch for the constraint that made the song menu
   * hand-rolled in the first place: `PopoverMenu` positions itself relative to a
   * `PopoverTrigger` in its own subtree, and the song rows live inside a
   * virtualized `<list-item>` whose paint containment re-anchors and clips any
   * `position: fixed` descendant (see `song-row-overlays.ts`). Measuring the row
   * and handing the rect to a menu mounted *outside* every list sidesteps it.
   */
  anchor?: MenuAnchor
  testId?: string
}

/**
 * A menu that renders at the top level of the app rather than beside its
 * trigger — for rows inside virtualized lists, which cannot host an overlay.
 *
 * Rows come from the same `MenuItem` as `PopoverMenu`, so the two menus look
 * identical by construction. Mount this in the root route (inside
 * `ThemeProvider`, so `var(--*)` resolves and the Router context exists);
 * `src/__tests__/root-overlay-mount.test.ts` holds that line.
 */
export function GlobalMenu({
  show,
  onClose,
  items,
  onSelect,
  title,
  subtitle,
  anchor,
  testId,
}: GlobalMenuProps) {
  /*
   * Registered before the early return — hooks cannot be skipped — and with
   * `show` starting false at every call site, which is what the back stack's
   * activation-order priority requires (see `back-stack.ts`).
   */
  useBackHandler(show, () => {
    onClose()
    return true
  })

  if (!show) return null

  const anchored = anchor != null
  return (
    <view className='global-menu' data-testid={testId}>
      {/*
        * The outside-tap catcher is the backdrop, a sibling of the panel — so a
        * tap on a menu row cannot reach it. Putting the close handler on the root
        * instead and relying on a `catchtap` in the panel to stop the bubble
        * works on device but is untestable, since the test env does not implement
        * that interception.
        */}
      <view className='global-menu__backdrop' bindtap={onClose} data-testid='global-menu-backdrop' />
      <view
        className={anchored ? 'global-menu__panel global-menu__panel--anchored' : 'global-menu__panel'}
        style={anchored
          ? { left: `${anchor.left}px`, top: `${anchor.top + anchor.height}px` }
          : undefined}
      >
        {title != null
          ? (
            <view className='global-menu__header'>
              <text className='global-menu__title'>{title}</text>
              {subtitle
                ? <text className='global-menu__subtitle'>{subtitle}</text>
                : null}
            </view>
          )
          : null}
        <view className='global-menu__items'>
          {items.map((item) => (
            <MenuItem
              key={item.key}
              item={item}
              hideCheckmark
              onTap={() => {
                onSelect(item.key)
                onClose()
              }}
            />
          ))}
        </view>
      </view>
    </view>
  )
}
