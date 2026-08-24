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

import type { Song } from '../../../models/song.js'

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

/** `m:ss` for a remaining countdown, as both the top bar and the sheet show it. */
export function formatSleepRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1_000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Whether "after N songs" can work for what is playing.
 *
 * A live stream never raises a song-completion, so an `afterSongs` timer set
 * against one would sit there forever and never pause anything — the Flutter build
 * hides the whole section for the same reason. Same test as `video-source.ts`:
 * `type === 'radio'` is the catalogue entry, `isLive` the stream itself.
 */
export function supportsAfterSongs(
  song: Pick<Song, 'isLive' | 'type'> | undefined,
): boolean {
  if (!song) return true
  return !(song.isLive || song.type === 'radio')
}

/** Inclusive bounds for a custom value, as the input dialog validates them. */
export interface IntegerRange {
  min: number
  max: number
}

/** Custom duration, in minutes — the Flutter build's range. */
export const SLEEP_TIMER_MINUTES_RANGE: IntegerRange = { min: 1, max: 999 }
/** Custom track count — the Flutter build's range. */
export const SLEEP_TIMER_SONGS_RANGE: IntegerRange = { min: 1, max: 99 }

export type ParsedInteger =
  | { ok: true, value: number }
  | { ok: false, reason: 'empty' | 'notInteger' | 'outOfRange' }

/**
 * Parse a typed custom value. Kept pure and reason-tagged rather than returning a
 * message, so the three failures stay testable without a locale and the caller
 * owns the wording (`player.enterNumber` / `enterValidInteger` /
 * `enterIntegerInRange`, matching Flutter's three).
 *
 * Only whole numbers: `'12.5'` is `notInteger`, as it is in Dart's `int.tryParse`.
 * A sign is accepted by the shape and then rejected by the range, so `'-5'`
 * reports "out of range" instead of "not a number" — which is the true reason.
 */
export function parseIntegerInRange(raw: string, range: IntegerRange): ParsedInteger {
  const text = raw.trim()
  if (text.length === 0) return { ok: false, reason: 'empty' }
  if (!/^[+-]?\d+$/.test(text)) return { ok: false, reason: 'notInteger' }
  const value = Number(text)
  if (!Number.isFinite(value) || value < range.min || value > range.max) {
    return { ok: false, reason: 'outOfRange' }
  }
  return { ok: true, value }
}
