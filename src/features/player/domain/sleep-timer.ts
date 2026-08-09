/**
 * Pure sleep-timer logic, ported from the Flutter `SleepTimerLogic`.
 *
 * Two mutually-exclusive modes:
 *  - `duration`   — count down `remainingMs`; expire (→ pause) when it hits 0.
 *  - `afterSongs` — pause after `remainingSongs` more tracks complete.
 *
 * The reducer functions here are pure; the store owns the actual 1s interval
 * (cleared through `safeClearInterval`) and calls `tickSleepTimer` /
 * `sleepTimerOnSongCompleted`, applying the returned action.
 */

export type SleepTimerMode = 'duration' | 'afterSongs'

export interface SleepTimerStatus {
  mode: SleepTimerMode
  /** `duration` mode: remaining countdown in ms. */
  remainingMs?: number
  /** `afterSongs` mode: remaining tracks (incl. the current one). */
  remainingSongs?: number
}

export function sleepTimerByDuration(durationMs: number): SleepTimerStatus | undefined {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return undefined
  return { mode: 'duration', remainingMs: Math.round(durationMs) }
}

export function sleepTimerAfterSongs(count: number): SleepTimerStatus | undefined {
  if (!Number.isFinite(count) || count < 1) return undefined
  return { mode: 'afterSongs', remainingSongs: Math.floor(count) }
}

/** Result of a tick / completion event. */
export interface SleepTimerStep {
  /** The next status (`undefined` clears the timer). */
  status: SleepTimerStatus | undefined
  /** When `true` the caller should pause playback. */
  expired: boolean
}

/**
 * Advance a `duration` timer by `deltaMs`. Non-`duration` timers are unchanged.
 * Expires (and clears) when the remaining time reaches 0.
 */
export function tickSleepTimer(
  status: SleepTimerStatus | undefined,
  deltaMs: number,
): SleepTimerStep {
  if (!status || status.mode !== 'duration') return { status, expired: false }
  const remaining = (status.remainingMs ?? 0) - deltaMs
  if (remaining <= 0) return { status: undefined, expired: true }
  return { status: { mode: 'duration', remainingMs: remaining }, expired: false }
}

/**
 * Apply a song-completion to an `afterSongs` timer. Decrements the counter;
 * expires (and clears) when it reaches 0. Non-`afterSongs` timers are unchanged.
 */
export function sleepTimerOnSongCompleted(
  status: SleepTimerStatus | undefined,
): SleepTimerStep {
  if (!status || status.mode !== 'afterSongs') return { status, expired: false }
  const next = (status.remainingSongs ?? 1) - 1
  if (next <= 0) return { status: undefined, expired: true }
  return { status: { mode: 'afterSongs', remainingSongs: next }, expired: false }
}
