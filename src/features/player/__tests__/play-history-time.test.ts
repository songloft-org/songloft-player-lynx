import { describe, expect, test } from 'vitest'

import { playedAtLabel, type PlayHistoryTimeLabels } from '../domain/play-history-time.js'

const LABELS: PlayHistoryTimeLabels = {
  today: 'Today',
  yesterday: 'Yesterday',
  daysAgo: (days) => `${days} days ago`,
}

const NOW = new Date('2026-08-17T12:00:00Z')

describe('playedAtLabel', () => {
  test('same day reads as today', () => {
    expect(playedAtLabel('2026-08-17T01:00:00Z', LABELS, NOW)).toBe('Today')
  })

  test('one day back reads as yesterday', () => {
    expect(playedAtLabel('2026-08-16T10:00:00Z', LABELS, NOW)).toBe('Yesterday')
  })

  test('within the week counts whole elapsed days', () => {
    expect(playedAtLabel('2026-08-14T12:00:00Z', LABELS, NOW)).toBe('3 days ago')
    // 5 d 23 h floors to 5, not 6 — the count is elapsed time, not calendar days.
    expect(playedAtLabel('2026-08-11T13:00:00Z', LABELS, NOW)).toBe('5 days ago')
    // 6 d 1 h — the last value still inside the week.
    expect(playedAtLabel('2026-08-11T11:00:00Z', LABELS, NOW)).toBe('6 days ago')
  })

  test('a week or more falls back to month/day', () => {
    expect(playedAtLabel('2026-08-10T12:00:00Z', LABELS, NOW)).toBe('8/10')
    expect(playedAtLabel('2026-01-05T12:00:00Z', LABELS, NOW)).toBe('1/5')
  })

  test('a future timestamp reads as today rather than a negative count', () => {
    // Clock skew between server and device is normal; "-1 days ago" is not.
    expect(playedAtLabel('2026-08-18T12:00:00Z', LABELS, NOW)).toBe('Today')
  })

  test('empty or unparseable input yields no label', () => {
    expect(playedAtLabel('', LABELS, NOW)).toBe('')
    expect(playedAtLabel('not a date', LABELS, NOW)).toBe('')
  })
})
