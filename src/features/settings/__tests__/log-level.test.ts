import { describe, expect, test } from 'vitest'

import { coerceLogLevel, logLevelLabelKey, LOG_LEVELS } from '../domain/log-level.js'

describe('coerceLogLevel', () => {
  test('passes through a valid level', () => {
    for (const level of LOG_LEVELS) {
      expect(coerceLogLevel(level)).toBe(level)
    }
  })

  test('falls back to info for null/undefined/unknown values', () => {
    expect(coerceLogLevel(null)).toBe('info')
    expect(coerceLogLevel(undefined)).toBe('info')
    expect(coerceLogLevel('trace')).toBe('info')
    expect(coerceLogLevel('')).toBe('info')
  })
})

describe('logLevelLabelKey', () => {
  test('maps every level to a distinct settings.* key', () => {
    const keys = LOG_LEVELS.map(logLevelLabelKey)
    expect(new Set(keys).size).toBe(LOG_LEVELS.length)
    for (const key of keys) expect(key.startsWith('settings.logLevel')).toBe(true)
  })
})
