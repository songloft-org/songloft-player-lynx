import { describe, expect, test } from 'vitest'

import {
  parseFingerprintStatus,
  parseFingerprintProgress,
  parseFingerprintCancelResponse,
} from '../fingerprint.js'

describe('parseFingerprintStatus', () => {
  test('parses a complete response', () => {
    const result = parseFingerprintStatus({
      chromaprint_available: true,
      total: 500,
      computed: 420,
      missing: 75,
      failed: 5,
      auto_enabled: true,
    })
    expect(result).toEqual({
      chromaprintAvailable: true,
      total: 500,
      computed: 420,
      missing: 75,
      failed: 5,
      autoEnabled: true,
    })
  })

  test('falls back gracefully on null/missing fields', () => {
    const result = parseFingerprintStatus({})
    expect(result.chromaprintAvailable).toBe(false)
    expect(result.total).toBe(0)
    expect(result.computed).toBe(0)
    expect(result.missing).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.autoEnabled).toBe(false)
  })

  test('coerces string numbers', () => {
    const result = parseFingerprintStatus({
      chromaprint_available: 'true',
      total: '100',
      computed: '50',
      missing: '45',
      failed: '5',
    })
    expect(result.total).toBe(100)
    expect(result.computed).toBe(50)
  })
})

describe('parseFingerprintProgress', () => {
  test('parses a running state', () => {
    const result = parseFingerprintProgress({
      status: 'running',
      computed: 30,
      total: 100,
      failed: 2,
    })
    expect(result.status).toBe('running')
    expect(result.computed).toBe(30)
    expect(result.total).toBe(100)
    expect(result.failed).toBe(2)
    expect(result.percent).toBe(30)
    expect(result.isRunning).toBe(true)
    expect(result.isFinished).toBe(false)
    expect(result.isIdle).toBe(false)
  })

  test('parses a done state', () => {
    const result = parseFingerprintProgress({
      status: 'done',
      computed: 100,
      total: 100,
      failed: 0,
    })
    expect(result.isFinished).toBe(true)
    expect(result.isRunning).toBe(false)
    expect(result.percent).toBe(100)
  })

  test('parses a cancelled state', () => {
    const result = parseFingerprintProgress({ status: 'cancelled', computed: 50, total: 100 })
    expect(result.isFinished).toBe(true)
    expect(result.isRunning).toBe(false)
  })

  test('falls back to idle on unknown status', () => {
    const result = parseFingerprintProgress({ status: 'unknown_xyz' })
    expect(result.status).toBe('idle')
    expect(result.isIdle).toBe(true)
  })

  test('percent is 0 when total is 0', () => {
    const result = parseFingerprintProgress({ status: 'running', computed: 5, total: 0 })
    expect(result.percent).toBe(0)
  })

  test('percent is capped at 100', () => {
    const result = parseFingerprintProgress({ status: 'running', computed: 200, total: 100 })
    expect(result.percent).toBe(100)
  })
})

describe('parseFingerprintCancelResponse', () => {
  test('parses cancelled: true', () => {
    expect(parseFingerprintCancelResponse({ cancelled: true })).toEqual({ cancelled: true })
  })

  test('falls back to false on missing field', () => {
    expect(parseFingerprintCancelResponse({})).toEqual({ cancelled: false })
  })
})
