import { type Breakpoint } from '../../../shared/responsive/useBreakpoint.js'

/**
 * Every size the full-screen player scales by screen class, in one table.
 *
 * Ported from the Flutter reference, which splits the player into two widgets and
 * reads a size table plus two runtime formulas:
 *   - `mobile_player.dart:279`      cover = screenWidth * 0.75
 *   - `desktop_full_player.dart:119` padding = isDesktop ? 48 : 24
 *   - `desktop_full_player.dart:120` cover   = isDesktop ? 300 : 220
 *   - `desktop_full_player.dart:270` the height budget reproduced in {@link fitCover}
 *
 * Kept as a pure function rather than CSS because this repo has no `@media` and
 * bans viewport units (`DESIGN.md`): the only way to scale by screen class is to
 * compute a number in JS and hand it to an inline style. Being pure also means the
 * table is unit-testable without a host — which is the point, since a wrong number
 * here looks exactly like a correct one in a screenshot of the other breakpoint.
 *
 * **The `tv` row has no Flutter counterpart.** Flutter's fourth class is
 * `widescreen` = width >= 900 **and** aspect ratio > 2.2 (`core/theme/responsive.dart`),
 * used to pick a side panel for the *non*-fullscreen player; its full-screen player
 * only ever branches on `isDesktop`. Lynx's `useBreakpoint` instead defines `tv` as
 * width >= 1920, a drift that predates this file (`AGENTS.md` documents the 1920
 * form too). Rather than re-cut the breakpoints — six callers depend on them — the
 * `tv` numbers below are chosen to extend the existing progression.
 */

/** Per-screen-class constants. Nothing else in the player may hardcode these. */
export interface PlayerMetrics {
  /** Horizontal padding of the page. */
  padH: number
  /** Cover edge length in px, or `null` when it derives from the width instead. */
  coverPx: number | null
  /** Cover edge length as a fraction of the container width (mobile only). */
  coverRatio: number | null
  /**
   * Padding inside the stage the cover may not use, excluded from its budget.
   *
   * Flutter's equivalent is 100, because its `LayoutBuilder` measures the left column
   * and the title + artist live *inside* it. Here they sit below the stage, so the only
   * thing to subtract is the cover wrapper's own padding — and the height fed to
   * {@link fitCover} is the **stage's**, not the page's. Getting that wrong is not
   * subtle: the page height with Flutter's 100 asked for a 220px cover in a 186px
   * column, and the frame overflowed upwards under the top bar (caught on a device in
   * landscape, where the stage is shortest).
   *
   * Still a table field rather than a constant, so a class with roomier padding can say
   * so without disturbing the others.
   */
  chromeH: number
  /** Play/pause button edge length. */
  playBtn: number
  /** Play/pause corner radius. Equal to `playBtn / 2` means a circle. */
  playRadius: number
  /** Edge length of a secondary control's hit box (transport + tool row). */
  toolSlot: number
}

export const PLAYER_METRICS: Record<Breakpoint, PlayerMetrics> = {
  // Flutter: single column, cover 75% of the screen width, 76px rounded-rect play
  // button (`useRoundedRect: true` → radius 28, this repo's `--radius-xl`).
  mobile: {
    padH: 16,
    coverPx: null,
    coverRatio: 0.75,
    chromeH: 32,
    playBtn: 76,
    playRadius: 28,
    toolSlot: 48,
  },
  tablet: {
    padH: 24,
    coverPx: 220,
    coverRatio: null,
    chromeH: 32,
    playBtn: 52,
    playRadius: 26, // circle
    toolSlot: 48,
  },
  desktop: {
    padH: 48,
    coverPx: 300,
    coverRatio: null,
    chromeH: 32,
    playBtn: 52,
    playRadius: 26, // circle
    toolSlot: 48,
  },
  tv: {
    padH: 64,
    coverPx: 420,
    coverRatio: null,
    chromeH: 40,
    playBtn: 64,
    playRadius: 32, // circle
    toolSlot: 56,
  },
}

/** Smallest cover we will ever draw; below this it reads as an icon, not art. */
export const MIN_COVER = 140

/** Breathing room above and below the cover, kept out of its budget. */
const COVER_MARGIN = 16

/**
 * Shrink `desired` to what `available` vertical space can actually hold.
 *
 * Without this a tall fixed cover overflows the column on short viewports — a phone
 * in landscape, a half-height desktop window, a car display. Flutter clamps up at
 * {@link MIN_COVER} first and only then down to `desired`, so an extremely short
 * viewport gets a too-tall-but-visible cover rather than a zero-sized or negative
 * one; the order is preserved here.
 */
export function fitCover(desired: number, available: number, chromeH: number): number {
  const budget = available - chromeH - COVER_MARGIN
  const maxCover = budget < MIN_COVER ? MIN_COVER : budget
  return Math.min(desired, maxCover)
}

export interface PlayerLayoutInput {
  /** Page width in px, `0` before it has been measured. */
  width: number
  /**
   * Height of the **stage** (the cover/lyrics region) in px, `0` before measurement.
   *
   * Not the page height: the cover has to fit the space left after the top bar, title,
   * progress and both control rows, and only the stage knows how much that is.
   */
  height: number
  breakpoint: Breakpoint
}

export interface PlayerLayout extends PlayerMetrics {
  /** Cover and lyrics side by side (>= tablet) rather than two swipeable screens. */
  isSplit: boolean
  /** Resolved cover edge length in px, already fitted to the available height. */
  coverSize: number
  /** Flex weight of the cover column when {@link isSplit}. Flutter uses 4 : 5. */
  coverFlex: number
  /** Flex weight of the lyrics column when {@link isSplit}. */
  lyricsFlex: number
  /**
   * Whether the container has actually been measured.
   *
   * Callers must not mount anything that needs a real pixel width while this is
   * `false` — notably the lyrics `Swiper`, which caches the `itemWidth` it is first
   * given and stays misaligned forever if that value was a guess.
   */
  measured: boolean
}

/**
 * Resolve every scaled size for one frame.
 *
 * Falls back to the `mobile` row while unmeasured. That is deliberately the *narrow*
 * layout: it is the one that degrades gracefully into a single readable column, and
 * `measured: false` lets the caller withhold the parts that cannot cope.
 */
export function resolvePlayerLayout({
  width,
  height,
  breakpoint,
}: PlayerLayoutInput): PlayerLayout {
  const measured = width > 0 && height > 0
  const metrics = PLAYER_METRICS[measured ? breakpoint : 'mobile']

  const desired = metrics.coverPx ?? Math.round(width * (metrics.coverRatio ?? 0.75))
  // Unmeasured: no height to fit against, and no cover to draw yet either. Report
  // the floor rather than 0 so a consumer that ignores `measured` still renders
  // something with a sane size instead of an invisible box.
  const coverSize = measured
    ? Math.round(fitCover(desired, height, metrics.chromeH))
    : MIN_COVER

  return {
    ...metrics,
    isSplit: measured && breakpoint !== 'mobile',
    coverSize,
    coverFlex: 4,
    lyricsFlex: 5,
    measured,
  }
}
