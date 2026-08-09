import { playMode, playModes, type PlayMode } from '../../../core/config/constants.js'

export { playMode, playModes }
export type { PlayMode }

/** Injectable RNG (returns [0,1)); defaults to `Math.random`. Test seam. */
export type Rng = () => number

function randomIndex(currentIndex: number, length: number, rng: Rng): number {
  if (length <= 1) return 0
  // Avoid immediately repeating the current track (mirrors PlayModeResolver).
  let next = Math.floor(rng() * length)
  if (next === currentIndex) next = (next + 1) % length
  return next
}

/**
 * Resolve the next track index for a play mode (used for both auto-advance on
 * completion and the manual "next" button — matching the Flutter
 * `PlayModeResolver.nextIndex`). Returns `null` when playback should stop
 * (order mode at the end of the queue).
 *
 * - `order`  → `index + 1`, or `null` past the end.
 * - `loop`   → wraps with modulo.
 * - `single` → stays on `index` (single-track repeat).
 * - `random` → a random index (avoiding an immediate repeat when `length > 1`).
 */
export function resolveNext(
  mode: PlayMode,
  index: number,
  length: number,
  rng: Rng = Math.random,
): number | null {
  if (length <= 0) return null
  switch (mode) {
    case 'order': {
      const next = index + 1
      return next < length ? next : null
    }
    case 'loop':
      return (index + 1) % length
    case 'single':
      return index
    case 'random':
      return randomIndex(index, length, rng)
    default:
      return null
  }
}

/**
 * Resolve the previous track index for a play mode (the caller applies the
 * "restart current track if position > 3s" rule before calling this). Returns
 * `null` when there is no previous track (order mode at the start).
 */
export function resolvePrev(
  mode: PlayMode,
  index: number,
  length: number,
  rng: Rng = Math.random,
): number | null {
  if (length <= 0) return null
  switch (mode) {
    case 'order': {
      const prev = index - 1
      return prev >= 0 ? prev : null
    }
    case 'loop':
      return (index - 1 + length) % length
    case 'single':
      return index
    case 'random':
      return randomIndex(index, length, rng)
    default:
      return null
  }
}

/** Whether a "next" is available (Flutter `PlayerState.hasNext`). */
export function hasNextForMode(mode: PlayMode, index: number, length: number): boolean {
  if (length <= 0) return false
  if (mode === 'loop' || mode === 'random') return true
  return index < length - 1
}

/** Whether a "previous" is available (Flutter `PlayerState.hasPrev`). */
export function hasPrevForMode(mode: PlayMode, index: number, length: number): boolean {
  if (length <= 0) return false
  if (mode === 'loop' || mode === 'random') return true
  return index > 0
}

/** Cycle to the next play mode (order → loop → single → random → order). */
export function cyclePlayMode(mode: PlayMode): PlayMode {
  const i = playModes.indexOf(mode)
  return playModes[(i + 1) % playModes.length]
}
