import { useCallback, useEffect, useState } from '@lynx-js/react'
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
 * Measure `selector` once, via the same async `boundingClientRect` invoke the
 * equalizer's slider uses (Lynx exposes no synchronous measurement).
 *
 * Addressed by selector rather than by `ref`: a `ref` on a `<view>` breaks the
 * ReactLynx Vitest render tree outright (`Cannot use 'in' operator to search for
 * 'refAttr' in null`), and the whole point here is a measurement that is safe to
 * take on every mount.
 */
function measureWidth(selector: string, apply: (w: number) => void): void {
  try {
    // `lynx` is a **bare** host global, not a property of `globalThis` — reading
    // it as `globalThis.lynx` yields undefined in the background realm, which is
    // exactly how the first version of this silently measured nothing at all.
    // Same rule as `fetch` (see AGENTS §4) and the note in `e2e-bridge.ts`.
    if (typeof lynx === 'undefined' || typeof lynx.createSelectorQuery !== 'function') return
    lynx
      .createSelectorQuery()
      .select(selector)
      .invoke({
        method: 'boundingClientRect',
        success: (res: unknown) => apply(Number((res as { width?: number })?.width)),
        fail: () => {
          /* no measurement here; layout events stay the only source */
        },
      })
      .exec()
  } catch {
    // Hosts (and the Vitest env) without the invoke bridge throw rather than
    // report failure. Measurement is an enhancement — never let it escape.
  }
}

/**
 * Tracks the container width and derives the current breakpoint.
 *
 * Two sources, both needed:
 *
 * 1. **`bindlayoutchange`** — the officially supported responsive primitive
 *    (Lynx has no `window.innerWidth`). It reports *changes*.
 * 2. **One `boundingClientRect` measurement on mount**, when the caller passes
 *    `measureSelector` — because a change notification is useless to a component
 *    that mounted after the layout it would have described.
 *
 * Why (2) exists: on Web, `bindlayoutchange` fires for elements present at first
 * paint and never for anything mounted later. `ShellLayout` is in the first
 * paint, so it got a width and picked its side rail correctly; `SettingsPage`
 * mounts on navigation and received **nothing at all**, leaving `width` at its
 * initial `0` → breakpoint `mobile` → the wide-screen master–detail layout was
 * dead on Web from the day it shipped. Measured, not guessed: driving the real
 * browser window 700px ↔ 1500px, `.settings` tracked the width while
 * `settings__body--dual` never appeared once.
 */
export function useBreakpoint(initialWidth = 0, measureSelector?: string): UseBreakpointResult {
  const [width, setWidth] = useState(initialWidth)

  const apply = useCallback((next: number) => {
    if (!Number.isFinite(next) || next <= 0) return
    setWidth(prev => (prev === next ? prev : next))
  }, [])

  const onLayoutChange = useCallback((event: LayoutChangeEvent) => {
    apply(event.detail?.width ?? 0)
  }, [apply])

  useEffect(() => {
    if (!measureSelector) return
    measureWidth(measureSelector, apply)
  }, [measureSelector, apply])

  const breakpoint = breakpointFromWidth(width)

  return {
    width,
    breakpoint,
    isWide: isWide(breakpoint),
    onLayoutChange,
  }
}
