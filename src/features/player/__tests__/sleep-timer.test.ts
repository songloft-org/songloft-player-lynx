import { describe, expect, test } from 'vitest'

import {
  formatSleepRemaining,
  parseIntegerInRange,
  SLEEP_TIMER_MINUTES_RANGE,
  SLEEP_TIMER_SONGS_RANGE,
  sleepTimerAfterSongs,
  sleepTimerByDuration,
  sleepTimerOnSongCompleted,
  supportsAfterSongs,
  tickSleepTimer,
} from '../domain/sleep-timer.js'

describe('sleep timer constructors', () => {
  test('duration rejects non-positive values', () => {
    expect(sleepTimerByDuration(0)).toBeUndefined()
    expect(sleepTimerByDuration(-5)).toBeUndefined()
    expect(sleepTimerByDuration(60_000)).toEqual({ mode: 'duration', remainingMs: 60_000 })
  })

  test('afterSongs rejects counts below 1', () => {
    expect(sleepTimerAfterSongs(0)).toBeUndefined()
    expect(sleepTimerAfterSongs(3)).toEqual({ mode: 'afterSongs', remainingSongs: 3 })
  })
})

describe('tickSleepTimer', () => {
  test('counts down and does not expire early', () => {
    const step = tickSleepTimer({ mode: 'duration', remainingMs: 3_000 }, 1_000)
    expect(step.expired).toBe(false)
    expect(step.status).toEqual({ mode: 'duration', remainingMs: 2_000 })
  })

  test('expires and clears when the remaining time reaches 0', () => {
    const step = tickSleepTimer({ mode: 'duration', remainingMs: 1_000 }, 1_000)
    expect(step.expired).toBe(true)
    expect(step.status).toBeUndefined()
  })

  test('ignores afterSongs / undefined timers', () => {
    const a = tickSleepTimer({ mode: 'afterSongs', remainingSongs: 2 }, 1_000)
    expect(a).toEqual({ status: { mode: 'afterSongs', remainingSongs: 2 }, expired: false })
    expect(tickSleepTimer(undefined, 1_000)).toEqual({ status: undefined, expired: false })
  })
})

describe('sleepTimerOnSongCompleted', () => {
  test('decrements the afterSongs counter', () => {
    const step = sleepTimerOnSongCompleted({ mode: 'afterSongs', remainingSongs: 2 })
    expect(step.expired).toBe(false)
    expect(step.status).toEqual({ mode: 'afterSongs', remainingSongs: 1 })
  })

  test('expires and clears on the last song', () => {
    const step = sleepTimerOnSongCompleted({ mode: 'afterSongs', remainingSongs: 1 })
    expect(step.expired).toBe(true)
    expect(step.status).toBeUndefined()
  })

  test('ignores duration / undefined timers', () => {
    const d = sleepTimerOnSongCompleted({ mode: 'duration', remainingMs: 5_000 })
    expect(d.expired).toBe(false)
    expect(sleepTimerOnSongCompleted(undefined).expired).toBe(false)
  })
})

describe('formatSleepRemaining', () => {
  test('renders m:ss with a padded seconds field', () => {
    expect(formatSleepRemaining(90_000)).toBe('1:30')
    expect(formatSleepRemaining(65_000)).toBe('1:05')
    expect(formatSleepRemaining(600_000)).toBe('10:00')
  })

  test('rounds up, so a running timer never reads 0:00 while it is still armed', () => {
    expect(formatSleepRemaining(1)).toBe('0:01')
    expect(formatSleepRemaining(1_001)).toBe('0:02')
  })

  test('clamps a spent timer instead of printing a negative time', () => {
    expect(formatSleepRemaining(0)).toBe('0:00')
    expect(formatSleepRemaining(-5_000)).toBe('0:00')
  })
})

describe('supportsAfterSongs', () => {
  /*
   * The "by songs" section is hidden for anything live: those streams never raise a
   * song-completion, so `sleepTimerOnSongCompleted` would never be called and the
   * timer would stay armed forever — an option that silently does nothing.
   */
  test('a normal track supports it', () => {
    expect(supportsAfterSongs({ type: 'local', isLive: false })).toBe(true)
    expect(supportsAfterSongs({ type: 'remote', isLive: false })).toBe(true)
  })

  test('a radio entry or a live stream does not', () => {
    expect(supportsAfterSongs({ type: 'radio', isLive: false })).toBe(false)
    expect(supportsAfterSongs({ type: 'remote', isLive: true })).toBe(false)
  })

  test('no song at all is not treated as live', () => {
    expect(supportsAfterSongs(undefined)).toBe(true)
  })
})

describe('parseIntegerInRange', () => {
  test('accepts a whole number inside the range', () => {
    expect(parseIntegerInRange('20', SLEEP_TIMER_MINUTES_RANGE)).toEqual({ ok: true, value: 20 })
    expect(parseIntegerInRange(' 7 ', SLEEP_TIMER_SONGS_RANGE)).toEqual({ ok: true, value: 7 })
  })

  test('both ends of the range are inclusive', () => {
    for (const range of [SLEEP_TIMER_MINUTES_RANGE, SLEEP_TIMER_SONGS_RANGE]) {
      expect(parseIntegerInRange(String(range.min), range).ok).toBe(true)
      expect(parseIntegerInRange(String(range.max), range).ok).toBe(true)
      expect(parseIntegerInRange(String(range.max + 1), range))
        .toEqual({ ok: false, reason: 'outOfRange' })
    }
  })

  test('empty input is its own reason, so the message can say "enter a number"', () => {
    expect(parseIntegerInRange('', SLEEP_TIMER_MINUTES_RANGE))
      .toEqual({ ok: false, reason: 'empty' })
    expect(parseIntegerInRange('   ', SLEEP_TIMER_MINUTES_RANGE))
      .toEqual({ ok: false, reason: 'empty' })
  })

  test('non-integers are rejected as such, decimals included', () => {
    for (const raw of ['abc', '12.5', '1e3', '3 4', '--1']) {
      expect(parseIntegerInRange(raw, SLEEP_TIMER_MINUTES_RANGE))
        .toEqual({ ok: false, reason: 'notInteger' })
    }
  })

  test('a negative or zero value reports the range, which is the real reason', () => {
    // `-5` parses fine as an integer; what is wrong with it is that the minimum is 1.
    expect(parseIntegerInRange('-5', SLEEP_TIMER_SONGS_RANGE))
      .toEqual({ ok: false, reason: 'outOfRange' })
    expect(parseIntegerInRange('0', SLEEP_TIMER_SONGS_RANGE))
      .toEqual({ ok: false, reason: 'outOfRange' })
  })

  test('the two ranges match the Flutter build', () => {
    expect(SLEEP_TIMER_MINUTES_RANGE).toEqual({ min: 1, max: 999 })
    expect(SLEEP_TIMER_SONGS_RANGE).toEqual({ min: 1, max: 99 })
  })

  test('a parsed custom value is accepted by the constructors it feeds', () => {
    // The two halves have to agree: the dialog validates, the constructor is what
    // actually builds the timer, and each has its own guard.
    const minutes = parseIntegerInRange('45', SLEEP_TIMER_MINUTES_RANGE)
    const songs = parseIntegerInRange('12', SLEEP_TIMER_SONGS_RANGE)
    expect(minutes.ok && sleepTimerByDuration(minutes.value * 60_000))
      .toEqual({ mode: 'duration', remainingMs: 45 * 60_000 })
    expect(songs.ok && sleepTimerAfterSongs(songs.value))
      .toEqual({ mode: 'afterSongs', remainingSongs: 12 })
  })
})
