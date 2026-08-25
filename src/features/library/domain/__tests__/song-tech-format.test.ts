import { describe, expect, test } from 'vitest'

import { formatBitRate, formatSampleRate } from '../song-tech-format.js'

describe('formatBitRate', () => {
  test('values under 1000 are already kbps', () => {
    expect(formatBitRate(320)).toBe('320 kbps')
    expect(formatBitRate(999)).toBe('999 kbps')
    expect(formatBitRate(128)).toBe('128 kbps')
  })

  test('values at or above 1000 are bps and get divided down', () => {
    expect(formatBitRate(1000)).toBe('1 kbps')
    expect(formatBitRate(320000)).toBe('320 kbps')
    expect(formatBitRate(1411200)).toBe('1411 kbps')
  })

  test('unknown or non-positive values return null', () => {
    expect(formatBitRate(0)).toBeNull()
    expect(formatBitRate(-1)).toBeNull()
    expect(formatBitRate(Number.NaN)).toBeNull()
  })
})

describe('formatSampleRate', () => {
  test('formats to one decimal kHz', () => {
    expect(formatSampleRate(44100)).toBe('44.1 kHz')
    expect(formatSampleRate(48000)).toBe('48 kHz')
    expect(formatSampleRate(96000)).toBe('96 kHz')
    expect(formatSampleRate(8000)).toBe('8 kHz')
  })

  test('unknown or non-positive values return null', () => {
    expect(formatSampleRate(0)).toBeNull()
    expect(formatSampleRate(-1)).toBeNull()
    expect(formatSampleRate(Number.NaN)).toBeNull()
  })
})
