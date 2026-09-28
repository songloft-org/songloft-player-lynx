/** Marquee velocity (px/s) and end pauses — mirrors the Flutter client's ScrollingText. */
export const MARQUEE_VELOCITY = 30
export const MARQUEE_PAUSE_MS = 2000

/**
 * Pure marquee schedule for a round trip over `overflow` pixels: hold at the
 * start, scroll to the end, hold, scroll back. Returns keyframe offsets, their
 * normalized times and the total loop duration in ms.
 */
export function marqueeSchedule(
  overflow: number,
  velocity: number = MARQUEE_VELOCITY,
  pauseMs: number = MARQUEE_PAUSE_MS,
): { x: number[]; times: number[]; durationMs: number } {
  const scrollMs = (overflow / velocity) * 1000
  const total = 2 * pauseMs + 2 * scrollMs
  const hold = pauseMs / total
  const scroll = scrollMs / total
  return {
    x: [0, 0, -overflow, -overflow, 0],
    times: [0, hold, hold + scroll, 2 * hold + scroll, 1],
    durationMs: total,
  }
}
