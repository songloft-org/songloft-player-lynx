import { useBackHandler } from '../nav/use-back-handler.js'
import { pickMenuPlacement, placePanel } from './anchored-overlay.js'
import type { AnchorMeasurement } from './anchored-overlay.js'
import { MenuItem } from './MenuItem.js'
import type { MenuItemSpec } from './MenuItem.js'
import { BackdropBlur } from './BackdropBlur.js'
import { ModalMaterial } from './ModalMaterial.js'
import { ModalScrim } from './ModalScrim.js'
import { menuScrollMaxHeight } from './menu-viewport.js'
import './overlay-motion.css'
import './PopoverMenu.css'
import './GlobalMenu.css'

export interface GlobalMenuProps {
  show: boolean
  onClose: () => void
  items: MenuItemSpec[]
  onSelect: (key: string) => void
  /**
   * Where the menu belongs on screen — the trigger's box and the viewport, as
   * measured by `measureAnchor` when the row was tapped. Supplied, the panel is a
   * popover beside the trigger; omitted, it falls back to docking at the bottom
   * edge (no invoke bridge, or a selector that matched nothing).
   *
   * Handing the rect in is the escape hatch for the constraint that made this menu
   * hand-rolled in the first place: `PopoverMenu` measures a trigger in its own
   * subtree, and the song rows live inside a virtualized `<list-item>` whose paint
   * containment re-anchors and clips any `position: fixed` descendant (see
   * `song-row-overlays.ts`). Measuring the row and placing a panel mounted
   * *outside* every list sidesteps it.
   */
  anchor?: AnchorMeasurement
  testId?: string
}

/**
 * A menu that renders at the top level of the app rather than beside its
 * trigger — for rows inside virtualized lists, which cannot host an overlay.
 *
 * Rows come from the same `MenuItem` as `PopoverMenu` and the panel is placed by the
 * same `placePanel`, so the two menus look and land alike by construction. Mount
 * this in the root route (inside `ThemeProvider`, so `var(--*)` resolves and the
 * Router context exists); `src/__tests__/root-overlay-mount.test.ts` holds that line.
 */
export function GlobalMenu({
  show,
  onClose,
  items,
  onSelect,
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

  /*
   * One offset per axis, from the measured rect — never a computed corner, so the
   * panel's own size never enters the calculation. The docked fallback gets its
   * offsets from the stylesheet instead, which is why the two forms are separate
   * classes: an anchored `top` and a docked `bottom` on the same box would stretch
   * it between them (see `anchored-overlay.ts`).
   */
  const position = anchor != null
    ? placePanel(anchor.anchor, anchor.viewport, pickMenuPlacement(anchor))
    : undefined
  const anchored = position != null

  return (
    <view className='global-menu' data-testid={testId}>
      {/* Only the docked form participates in the modal dim stack. Both forms
          blur locally inside the panel, leaving the rest of the page sharp. */}
      {/*
        * The outside-tap catcher is the backdrop, a sibling of the panel — so a
        * tap on a menu row cannot reach it. Putting the close handler on the root
        * instead and relying on a `catchtap` in the panel to stop the bubble
        * works on device but is untestable, since the test env does not implement
        * that interception.
        *
        * It only *paints* in the docked form: anchored, this menu is a popover, and a
        * scrim behind it would be the one thing setting it apart from every other
        * popover menu in the app.
        */}
      <ModalScrim active={!anchored}
        className={anchored
          ? 'global-menu__backdrop'
          : 'global-menu__backdrop global-menu__backdrop--docked'}
        bindtap={onClose}
        data-testid='global-menu-backdrop'
      />
      <view
        className={anchored
          ? 'global-menu__panel global-menu__panel--anchored overlay--enter-scale'
          : 'global-menu__panel global-menu__panel--docked overlay--enter-up'}
        style={position}
      >
        {!anchored && <ModalMaterial shape='sheet' />}
        {/* Anchored popovers use the compact material, docked menus use the
            content material above. The shell clips either local blur while
            only the sibling scroll-view moves. */}
        {anchored && <BackdropBlur className='ui-backdrop-blur--panel' />}
        <scroll-view
          className='global-menu__scroll'
          scroll-orientation='vertical'
          style={{ maxHeight: menuScrollMaxHeight({ panelMaxHeight: position?.maxHeight }) }}
        >
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
        </scroll-view>
      </view>
    </view>
  )
}
