import { describe, expect, test } from 'vitest'

import { apiPrefix } from '../../../core/config/app-config.js'
import { createPublicClient } from '../../../core/network/api-client.js'
import type { Transport } from '../../../core/network/http-client.js'
import { FingerprintApi } from '../api/fingerprint-api.js'

function client(transport: Transport) {
  return createPublicClient({ transport, getBaseUrl: () => 'http://api.test' })
}

function capture(status: number, body: string) {
  let seenUrl = ''
  let seenMethod = ''
  let seenBody: string | undefined
  const transport: Transport = async (req) => {
    seenUrl = req.url
    seenMethod = req.method
    seenBody = req.body
    return { status, headers: {}, body }
  }
  return {
    transport,
    url: () => seenUrl,
    method: () => seenMethod,
    body: () => seenBody,
  }
}

describe('FingerprintApi.getFingerprintStatus', () => {
  test('GETs the status endpoint and parses', async () => {
    const cap = capture(
      200,
      JSON.stringify({
        chromaprint_available: true,
        total: 100,
        computed: 80,
        missing: 15,
        failed: 5,
        auto_enabled: false,
      }),
    )
    const result = await new FingerprintApi(client(cap.transport)).getFingerprintStatus()
    expect(cap.method()).toBe('GET')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/scan/fingerprints/status`)
    expect(result.chromaprintAvailable).toBe(true)
    expect(result.total).toBe(100)
    expect(result.computed).toBe(80)
    expect(result.missing).toBe(15)
    expect(result.failed).toBe(5)
  })
})

describe('FingerprintApi.startFingerprintCompute', () => {
  test('POSTs with no body when no params given', async () => {
    const cap = capture(200, '{}')
    await new FingerprintApi(client(cap.transport)).startFingerprintCompute()
    expect(cap.method()).toBe('POST')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/scan/fingerprints`)
    expect(cap.body()).toBeUndefined()
  })

  test('POSTs with recompute_all when specified', async () => {
    const cap = capture(200, '{}')
    await new FingerprintApi(client(cap.transport)).startFingerprintCompute({
      recomputeAll: true,
    })
    expect(cap.body()).toBe(JSON.stringify({ recompute_all: true }))
  })

  test('POSTs with retry_failed when specified', async () => {
    const cap = capture(200, '{}')
    await new FingerprintApi(client(cap.transport)).startFingerprintCompute({
      retryFailed: true,
    })
    expect(cap.body()).toBe(JSON.stringify({ retry_failed: true }))
  })
})

describe('FingerprintApi.getFingerprintProgress', () => {
  test('GETs progress and parses running state', async () => {
    const cap = capture(
      200,
      JSON.stringify({ status: 'running', computed: 40, total: 100, failed: 2 }),
    )
    const result = await new FingerprintApi(client(cap.transport)).getFingerprintProgress()
    expect(cap.method()).toBe('GET')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/scan/fingerprints/progress`)
    expect(result.status).toBe('running')
    expect(result.isRunning).toBe(true)
    expect(result.percent).toBe(40)
  })
})

describe('FingerprintApi.cancelFingerprintCompute', () => {
  test('POSTs cancel and returns the response', async () => {
    const cap = capture(200, JSON.stringify({ cancelled: true }))
    const result = await new FingerprintApi(client(cap.transport)).cancelFingerprintCompute()
    expect(cap.method()).toBe('POST')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/scan/fingerprints/cancel`)
    expect(result.cancelled).toBe(true)
  })
})

describe('FingerprintApi.getDuplicates', () => {
  test('GETs duplicates and parses groups', async () => {
    const cap = capture(
      200,
      JSON.stringify({
        groups: [
          {
            fingerprint: 'fp1',
            songs: [
              { id: 1, title: 'A', artist: 'X', format: 'flac', bit_rate: 320, file_size: 1000, file_path: '/a.flac' },
              { id: 2, title: 'A', artist: 'X', format: 'mp3', bit_rate: 192, file_size: 500, file_path: '/a.mp3' },
            ],
          },
        ],
        total_groups: 1,
        total_duplicates: 2,
      }),
    )
    const result = await new FingerprintApi(client(cap.transport)).getDuplicates()
    expect(cap.method()).toBe('GET')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/songs/duplicates`)
    expect(result.totalGroups).toBe(1)
    expect(result.groups[0].songs).toHaveLength(2)
    expect(result.groups[0].songs[0].bitRate).toBe(320)
  })
})

describe('FingerprintApi.batchDelete', () => {
  test('POSTs batch-delete with ids and delete_files', async () => {
    const cap = capture(200, JSON.stringify({ deleted: 3 }))
    const result = await new FingerprintApi(client(cap.transport)).batchDelete([1, 2, 3], true)
    expect(cap.method()).toBe('POST')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/songs/batch-delete`)
    expect(cap.body()).toBe(JSON.stringify({ ids: [1, 2, 3], delete_files: true }))
    expect(result.deleted).toBe(3)
  })
})
