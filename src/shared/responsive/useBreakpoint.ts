import { useCallback, useState } from '@lynx-js/react'
import type { LayoutChangeEvent } from '@lynx-js/types'

/**
 * Four responsive tiers, mirroring the Flutter app's breakpoints
 * (see `songloft-player/lib/core/theme/responsive.dart` and `shell_layout.dart`):
 *   Mobile  <600
 *   Tablet  600 - 900
 *   Desktop 900 - 1920
 *   TV      >=1920
 */
export type Breakpoint = 'mobile' | 'tablet' | 'desktop' | 'tv'

export const BREAKPOINTS = {
  tablet: 600,
  desktop: 900,
  tv: 1920,
} as const

export function breakpointFromWidth(width: number): Breakpoint {
  if (width >= BREAKPOINTS.tv) return 'tv'
  if (width >= BREAKPOINTS.desktop) return 'desktop'
  if (width >= BREAKPOINTS.tablet) return 'tablet'
  return 'mobile'
}

/** Wide layouts (>= tablet) use a side rail; narrow layouts use a bottom bar. */
export function isWide(breakpoint: Breakpoint): boolean {
  return breakpoint !== 'mobile'
}

export interface UseBreakpointResult {
  width: number
  breakpoint: Breakpoint
  isWide: boolean
  /** Attach to a root `<view>`'s `bindlayoutchange` to drive the breakpoint. */
  onLayoutChange: (event: LayoutChangeEvent) => void
}

/**
 * Tracks the container width via `bindlayoutchange` (the officially supported
 * responsive primitive in Lynx — there is no `window.innerWidth`) and derives
 * the current breakpoint.
 */
export function useBreakpoint(initialWidth = 0): UseBreakpointResult {
  const [width, setWidth] = useState(initialWidth)

  const onLayoutChange = useCallback((event: LayoutChangeEvent) => {
    const next = event.detail?.width ?? 0
    setWidth(prev => (prev === next ? prev : next))
  }, [])

  const breakpoint = breakpointFromWidth(width)

  return {
    width,
    breakpoint,
    isWide: isWide(breakpoint),
    onLayoutChange,
  }
}
