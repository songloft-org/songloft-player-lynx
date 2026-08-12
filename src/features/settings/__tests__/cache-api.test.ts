import { describe, expect, test } from 'vitest'

import { apiPrefix } from '../../../core/config/app-config.js'
import { createPublicClient } from '../../../core/network/api-client.js'
import type { Transport } from '../../../core/network/http-client.js'
import { CacheApi } from '../api/cache-api.js'

function client(transport: Transport) {
  return createPublicClient({ transport, getBaseUrl: () => 'http://api.test' })
}

function capture(status: number, body: string): {
  transport: Transport
  url: () => string
  method: () => string
  body: () => string | undefined
} {
  let seenUrl = ''
  let seenMethod = ''
  let seenBody: string | undefined
  const transport: Transport = async (req) => {
    seenUrl = req.url
    seenMethod = req.method
    seenBody = req.body
    return { status, headers: {}, body }
  }
  return { transport, url: () => seenUrl, method: () => seenMethod, body: () => seenBody }
}

describe('CacheApi.getStats', () => {
  test('GETs the stats endpoint and parses the response', async () => {
    const cap = capture(200, JSON.stringify({ file_count: 42, max_size: 1024, total_size: 512 }))
    const api = new CacheApi(client(cap.transport))
    const result = await api.getStats()
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/cache-manage/stats`)
    expect(cap.method()).toBe('GET')
    expect(result).toEqual({ fileCount: 42, maxSize: 1024, totalSize: 512 })
  })
})

describe('CacheApi.getConfig', () => {
  test('GETs the config endpoint and parses the response', async () => {
    const cap = capture(200, JSON.stringify({
      cache_dir: '/data/cache',
      default_cache_dir: '/default/cache',
      max_size: 0,
      transcode_format: 'mp3',
      transcode_quality: '320',
    }))
    const api = new CacheApi(client(cap.transport))
    const result = await api.getConfig()
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/cache-manage/config`)
    expect(cap.method()).toBe('GET')
    expect(result).toEqual({
      cacheDir: '/data/cache',
      defaultCacheDir: '/default/cache',
      maxSize: 0,
      transcodeFormat: 'mp3',
      transcodeQuality: '320',
    })
  })
})

describe('CacheApi.updateConfig', () => {
  test('PUTs the config body and parses the response', async () => {
    const cap = capture(200, JSON.stringify({
      cache_dir: '/new/dir',
      default_cache_dir: '/default/cache',
      max_size: 2048,
      transcode_format: 'ogg',
      transcode_quality: '192',
    }))
    const api = new CacheApi(client(cap.transport))
    const result = await api.updateConfig({
      cache_dir: '/new/dir',
      max_size: 2048,
      transcode_format: 'ogg',
      transcode_quality: '192',
    })
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/cache-manage/config`)
    expect(cap.method()).toBe('PUT')
    expect(cap.body()).toBe(JSON.stringify({
      cache_dir: '/new/dir',
      max_size: 2048,
      transcode_format: 'ogg',
      transcode_quality: '192',
    }))
    expect(result.cacheDir).toBe('/new/dir')
    expect(result.maxSize).toBe(2048)
  })
})

describe('CacheApi.cleanCache', () => {
  test('POSTs to the clean endpoint', async () => {
    const cap = capture(200, JSON.stringify({ message: 'done' }))
    const api = new CacheApi(client(cap.transport))
    const result = await api.cleanCache()
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/cache-manage/clean`)
    expect(cap.method()).toBe('POST')
    expect(result.message).toBe('done')
  })
})

describe('CacheApi.validateDir', () => {
  test('POSTs the path and parses the validation result', async () => {
    const cap = capture(200, JSON.stringify({
      created: true,
      error: '',
      free_size: 500000,
      total_size: 1000000,
      valid: true,
    }))
    const api = new CacheApi(client(cap.transport))
    const result = await api.validateDir({ path: '/some/dir' })
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/cache-manage/validate-dir`)
    expect(cap.method()).toBe('POST')
    expect(cap.body()).toBe(JSON.stringify({ path: '/some/dir' }))
    expect(result).toEqual({
      created: true,
      error: '',
      freeSize: 500000,
      totalSize: 1000000,
      valid: true,
    })
  })
})
