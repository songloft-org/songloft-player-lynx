import { useSyncExternalStore } from '@lynx-js/react'

import { getShellWidth, subscribeShellWidth } from '../nav/shell-navigation.js'
import {
  breakpointFromWidth,
  isWide as isWideBreakpoint,
  useBreakpoint,
  type UseBreakpointResult,
} from './useBreakpoint.js'

/** Width of `.shell__rail`, the app-level nav rail (`ShellLayout.css`). */
const SHELL_RAIL_WIDTH = 220

/**
 * `useBreakpoint` seeded from the shell's already-measured width, so a page that
 * mounts on navigation paints the correct layout on frame 1.
 *
 * `useBreakpoint(0, …)` guarantees one `mobile` (width 0) frame on every mount,
 * because `bindlayoutchange` is a change notification and `boundingClientRect`
 * is an async invoke — both land only after paint. On a wide screen that first
 * frame is wrong (narrow), and the snap to the real layout one or more frames
 * later is the "flash" / "left sidebar appears late" report
 * (songloft-player-lynx#6).
 *
 * The shell measures the window and publishes it to the module-level
 * `shellWidth` cache, which survives a page's unmount/remount (e.g. the round
 * trip through the chrome-less `/player` route). This hook reads that cache,
 * subtracts the 220 px nav rail when the shell is wide (the content area is
 * the window minus the rail), and hands the result to `useBreakpoint` as its
 * `initialWidth` — frame 1 is then right. The hook's own `bindlayoutchange`
 * and one-shot `boundingClientRect` still drive any changes after mount.
 *
 * Same arithmetic `LibraryLayout` inlined before this existed; extracted so
 * `HomePage`, `SettingsPage`, and any future shell-internal page cannot forget
 * the seed and reintroduce the flash.
 *
 * Cold start: the cache is `0` → `useBreakpoint(0, …)` → identical to the
 * pre-seed behaviour (a narrow first frame is unavoidable on a cold start;
 * the shell itself has not measured yet).
 */
export function useShellSeededBreakpoint(selector: string): UseBreakpointResult {
  const shellWidth = useSyncExternalStore(subscribeShellWidth, getShellWidth)
  const seedWidth = isWideBreakpoint(breakpointFromWidth(shellWidth))
    ? Math.max(0, shellWidth - SHELL_RAIL_WIDTH)
    : shellWidth
  return useBreakpoint(seedWidth, selector)
}
