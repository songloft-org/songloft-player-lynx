import { describe, expect, test } from 'vitest'

import {
  sleepTimerAfterSongs,
  sleepTimerByDuration,
  sleepTimerOnSongCompleted,
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
