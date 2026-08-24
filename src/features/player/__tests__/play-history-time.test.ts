import { describe, expect, test } from 'vitest'

import { formatPlayedAt } from '../domain/play-history-time.js'

describe('formatPlayedAt', () => {
  test('formats as MM-dd HH:mm in the local timezone', () => {
    // Dates are built from local-time parts and round-tripped through
    // `toISOString`, so the expectations hold in any runner timezone — the
    // formatter must land back on the same local wall clock.
    expect(formatPlayedAt(new Date(2026, 7, 17, 9, 5).toISOString())).toBe('08-17 09:05')
    expect(formatPlayedAt(new Date(2026, 0, 2, 0, 0).toISOString())).toBe('01-02 00:00')
    expect(formatPlayedAt(new Date(2026, 11, 31, 23, 59).toISOString())).toBe('12-31 23:59')
  })

  test('pads single-digit parts', () => {
    expect(formatPlayedAt(new Date(2026, 2, 5, 4, 7).toISOString())).toBe('03-05 04:07')
  })

  test('empty or unparseable input yields no label', () => {
    expect(formatPlayedAt('')).toBe('')
    expect(formatPlayedAt('not a date')).toBe('')
  })
})
