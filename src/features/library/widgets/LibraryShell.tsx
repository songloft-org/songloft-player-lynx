import type { ReactNode } from '@lynx-js/react'
import type { LayoutChangeEvent } from '@lynx-js/types'

import type { LibraryViewKey } from '../domain/library-views.js'
import { LibraryViewRail } from './LibraryViewRail.js'
import { LibraryViewSwitcher } from './LibraryViewSwitcher.js'
import './LibraryShell.css'

export interface LibraryShellProps {
  /** Wide (>= tablet) renders the left rail; narrow renders the pill strip. */
  isWide: boolean
  /** Attach to drive the breakpoint (see `useBreakpoint`). */
  onLayoutChange: (event: LayoutChangeEvent) => void
  displayKeys: LibraryViewKey[]
  selected?: LibraryViewKey
  onSelect: (key: LibraryViewKey) => void
  /** The dispatched content view (flat songs / facet grid / playlists). */
  children: ReactNode
}

/**
 * The library page chrome: a view switcher (pill strip on narrow, left rail on
 * wide) beside/above the dispatched content. Kept a pure prop-driven component
 * so the wide/narrow branch is testable without faking `bindlayoutchange`
 * events — `LibraryPage` only forwards `useBreakpoint().isWide` down.
 */
export function LibraryShell({
  isWide,
  onLayoutChange,
  displayKeys,
  selected,
  onSelect,
  children,
}: LibraryShellProps) {
  if (isWide) {
    return (
      <view className='library-shell library-shell--wide' bindlayoutchange={onLayoutChange}>
        <LibraryViewRail displayKeys={displayKeys} selected={selected} onSelect={onSelect} />
        <view className='library-shell__content'>{children}</view>
      </view>
    )
  }
  return (
    <view className='library-shell library-shell--narrow' bindlayoutchange={onLayoutChange}>
      <LibraryViewSwitcher displayKeys={displayKeys} selected={selected} onSelect={onSelect} />
      <view className='library-shell__content'>{children}</view>
    </view>
  )
}
