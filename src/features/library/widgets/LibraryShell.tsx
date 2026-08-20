import type { ReactNode } from '@lynx-js/react'
import type { LayoutChangeEvent } from '@lynx-js/types'

import type { LibraryViewKey } from '../domain/library-views.js'
import { LibraryViewRail } from './LibraryViewRail.js'
import './LibraryShell.css'

export interface LibraryShellProps {
  /** Wide (>= tablet) renders the left rail; narrow renders nothing but the pane. */
  isWide: boolean
  /** Attach to drive the breakpoint (see `useBreakpoint`). */
  onLayoutChange: (event: LayoutChangeEvent) => void
  displayKeys: LibraryViewKey[]
  selected?: LibraryViewKey
  onSelect: (key: LibraryViewKey) => void
  /** The routed page (`<Outlet/>`): library, add-songs, or create-playlist. */
  children: ReactNode
}

/**
 * The library section chrome: the view rail beside the routed page on wide
 * screens, the page alone on narrow. Kept a pure prop-driven component so the
 * wide/narrow branch is testable without faking `bindlayoutchange` events —
 * `LibraryLayout` forwards `useBreakpoint().isWide` down.
 *
 * The narrow pill strip is **not** here: it belongs to `LibraryPage`, whose edit
 * mode replaces the page body wholesale (a strip owned by this component would
 * survive above the editor). So on narrow this renders only the pane, and the
 * element stays in the tree either way — `bindlayoutchange` must keep firing on
 * the same box across the breakpoint switch.
 */
export function LibraryShell({
  isWide,
  onLayoutChange,
  displayKeys,
  selected,
  onSelect,
  children,
}: LibraryShellProps) {
  return (
    <view
      className={isWide ? 'library-shell library-shell--wide' : 'library-shell library-shell--narrow'}
      bindlayoutchange={onLayoutChange}
    >
      {isWide
        ? <LibraryViewRail displayKeys={displayKeys} selected={selected} onSelect={onSelect} />
        : null}
      <view className='library-shell__content'>{children}</view>
    </view>
  )
}
