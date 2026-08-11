import { describe, expect, test } from 'vitest'

import { formatBytes, splitDuration } from '../domain/stats-format.js'

describe('splitDuration', () => {
  test('splits the live backend value (9643s) into 2h 40min', () => {
    expect(splitDuration(9643)).toEqual({ hours: 2, minutes: 40 })
  })

  test('is hour-less below an hour, and floors rather than rounds up', () => {
    expect(splitDuration(59)).toEqual({ hours: 0, minutes: 0 })
    expect(splitDuration(60)).toEqual({ hours: 0, minutes: 1 })
    expect(splitDuration(3599)).toEqual({ hours: 0, minutes: 59 })
    expect(splitDuration(3600)).toEqual({ hours: 1, minutes: 0 })
  })

  test('clamps junk to zero rather than producing NaN in the label', () => {
    expect(splitDuration(0)).toEqual({ hours: 0, minutes: 0 })
    expect(splitDuration(-5)).toEqual({ hours: 0, minutes: 0 })
    expect(splitDuration(Number.NaN)).toEqual({ hours: 0, minutes: 0 })
    expect(splitDuration(Number.POSITIVE_INFINITY)).toEqual({ hours: 0, minutes: 0 })
  })
})

describe('formatBytes', () => {
  test('whole units below KB, one decimal above', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  test('climbs binary units and drops a trailing .0', () => {
    expect(formatBytes(1024 * 1024 * 12)).toBe('12 MB')
    expect(formatBytes(1024 * 1024 * 1024 * 3.5)).toBe('3.5 GB')
    expect(formatBytes(1024 ** 4)).toBe('1 TB')
  })

  test('saturates at TB rather than inventing a unit', () => {
    expect(formatBytes(1024 ** 5)).toBe('1024 TB')
  })

  test('clamps junk to zero', () => {
    expect(formatBytes(-1)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
  })
})
