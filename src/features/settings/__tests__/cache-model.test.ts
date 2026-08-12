import { describe, expect, test } from 'vitest'

import {
  parseCacheConfig,
  parseCacheStats,
  parseDirValidateResponse,
  safeParseCacheStats,
} from '../domain/cache-model.js'

describe('cacheStatsSchema', () => {
  test('parses a valid stats response', () => {
    const result = parseCacheStats({ file_count: 10, max_size: 1024, total_size: 512 })
    expect(result).toEqual({ fileCount: 10, maxSize: 1024, totalSize: 512 })
  })

  test('coerces stringified numbers', () => {
    const result = parseCacheStats({ file_count: '5', max_size: '0', total_size: '100' })
    expect(result).toEqual({ fileCount: 5, maxSize: 0, totalSize: 100 })
  })

  test('falls back to 0 for missing/invalid fields', () => {
    const result = parseCacheStats({})
    expect(result).toEqual({ fileCount: 0, maxSize: 0, totalSize: 0 })
  })

  test('handles undefined fields gracefully via safeParse', () => {
    const result = safeParseCacheStats({ file_count: undefined, max_size: undefined, total_size: undefined })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ fileCount: 0, maxSize: 0, totalSize: 0 })
    }
  })
})

describe('cacheConfigSchema', () => {
  test('parses a full config response', () => {
    const result = parseCacheConfig({
      cache_dir: '/data/cache',
      default_cache_dir: '/default',
      max_size: 5000,
      transcode_format: 'mp3',
      transcode_quality: '320',
    })
    expect(result).toEqual({
      cacheDir: '/data/cache',
      defaultCacheDir: '/default',
      maxSize: 5000,
      transcodeFormat: 'mp3',
      transcodeQuality: '320',
    })
  })

  test('falls back to empty strings and 0 for missing fields', () => {
    const result = parseCacheConfig({})
    expect(result.cacheDir).toBe('')
    expect(result.defaultCacheDir).toBe('')
    expect(result.maxSize).toBe(0)
    expect(result.transcodeFormat).toBe('')
    expect(result.transcodeQuality).toBe('')
  })
})

describe('dirValidateResponseSchema', () => {
  test('parses a valid directory response', () => {
    const result = parseDirValidateResponse({
      created: true,
      error: '',
      free_size: 999,
      total_size: 2000,
      valid: true,
    })
    expect(result).toEqual({
      created: true,
      error: '',
      freeSize: 999,
      totalSize: 2000,
      valid: true,
    })
  })

  test('falls back for missing/invalid fields', () => {
    const result = parseDirValidateResponse({})
    expect(result).toEqual({
      created: false,
      error: '',
      freeSize: 0,
      totalSize: 0,
      valid: false,
    })
  })

  test('parses an error response', () => {
    const result = parseDirValidateResponse({
      created: false,
      error: 'permission denied',
      free_size: 0,
      total_size: 0,
      valid: false,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('permission denied')
  })
})
