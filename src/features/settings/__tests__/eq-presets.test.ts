import { describe, expect, test } from 'vitest'

import {
  clampGain,
  EQ_BAND_COUNT,
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  EQ_PRESET_NAMES,
  EQ_PRESETS,
  formatFreq,
} from '../domain/eq-presets.js'
import { EQ_CENTER_FREQS } from '../../../native/audio-types.js'

describe('EQ presets data integrity', () => {
  test('every preset has exactly 10 bands', () => {
    for (const name of EQ_PRESET_NAMES) {
      expect(EQ_PRESETS[name]).toHaveLength(EQ_BAND_COUNT)
    }
  })

  test('all gain values are within [-12, +12]', () => {
    for (const name of EQ_PRESET_NAMES) {
      for (const gain of EQ_PRESETS[name]) {
        expect(gain).toBeGreaterThanOrEqual(EQ_GAIN_MIN)
        expect(gain).toBeLessThanOrEqual(EQ_GAIN_MAX)
      }
    }
  })

  test('flat preset is all zeros', () => {
    expect(EQ_PRESETS.flat.every((g) => g === 0)).toBe(true)
  })

  test('EQ_BAND_COUNT matches EQ_CENTER_FREQS length', () => {
    expect(EQ_BAND_COUNT).toBe(EQ_CENTER_FREQS.length)
    expect(EQ_BAND_COUNT).toBe(10)
  })
})

describe('clampGain', () => {
  test('values within range pass through', () => {
    expect(clampGain(0)).toBe(0)
    expect(clampGain(5)).toBe(5)
    expect(clampGain(-7)).toBe(-7)
  })

  test('values below min are clamped', () => {
    expect(clampGain(-20)).toBe(EQ_GAIN_MIN)
    expect(clampGain(-13)).toBe(EQ_GAIN_MIN)
  })

  test('values above max are clamped', () => {
    expect(clampGain(20)).toBe(EQ_GAIN_MAX)
    expect(clampGain(13)).toBe(EQ_GAIN_MAX)
  })

  test('boundary values', () => {
    expect(clampGain(EQ_GAIN_MIN)).toBe(EQ_GAIN_MIN)
    expect(clampGain(EQ_GAIN_MAX)).toBe(EQ_GAIN_MAX)
  })
})

describe('formatFreq', () => {
  test('frequencies below 1000 remain as-is', () => {
    expect(formatFreq(31)).toBe('31')
    expect(formatFreq(500)).toBe('500')
  })

  test('frequencies >= 1000 are converted to k', () => {
    expect(formatFreq(1000)).toBe('1k')
    expect(formatFreq(4000)).toBe('4k')
    expect(formatFreq(16000)).toBe('16k')
  })
})
