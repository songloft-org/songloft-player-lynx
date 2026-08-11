import { describe, expect, test } from 'vitest'

import { apiPrefix } from '../../../core/config/app-config.js'
import { createPublicClient } from '../../../core/network/api-client.js'
import type { Transport } from '../../../core/network/http-client.js'
import { ScanApi, buildDirectoriesQuery, buildScanBody } from '../api/scan-api.js'

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

/**
 * The `paths` key must be **absent**, not `[]` or `null`, when nothing is
 * selected: the backend treats presence of the key as "restrict to these", so an
 * empty array would scan nothing at all.
 */
describe('buildScanBody', () => {
  test('omits paths entirely when none are selected', () => {
    expect('paths' in buildScanBody({ reimport: false })).toBe(false)
    expect(buildScanBody({ reimport: false })).toEqual({ reimport: false })
  })

  test('omits paths for an empty array', () => {
    const body = buildScanBody({ reimport: true, paths: [] })
    expect('paths' in body).toBe(false)
    expect(body).toEqual({ reimport: true })
  })

  test('includes paths when directories are selected', () => {
    expect(buildScanBody({ reimport: true, paths: ['/m/a', '/m/b'] })).toEqual({
      reimport: true,
      paths: ['/m/a', '/m/b'],
    })
  })

  test('defaults reimport to false with no arguments', () => {
    expect(buildScanBody()).toEqual({ reimport: false })
  })
})

describe('buildDirectoriesQuery', () => {
  test('sends no path key for the music root', () => {
    expect(buildDirectoriesQuery()).toEqual({})
    expect(buildDirectoriesQuery('')).toEqual({})
    expect(buildDirectoriesQuery('   ')).toEqual({})
  })

  test('sends a trimmed path for a sub-directory', () => {
    expect(buildDirectoriesQuery('/music/rock')).toEqual({ path: '/music/rock' })
    expect(buildDirectoriesQuery('  /music/rock  ')).toEqual({ path: '/music/rock' })
  })
})

describe('ScanApi scan endpoints', () => {
  test('startScan POSTs the built body', async () => {
    const cap = capture(200, '')
    await new ScanApi(client(cap.transport)).startScan({ reimport: true, paths: ['/m'] })
    expect(cap.method()).toBe('POST')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/scan`)
    expect(cap.body()).toBe(JSON.stringify({ reimport: true, paths: ['/m'] }))
  })

  test('startScan with no selection sends no paths key on the wire', async () => {
    const cap = capture(200, '')
    await new ScanApi(client(cap.transport)).startScan({ reimport: false })
    expect(cap.body()).toBe(JSON.stringify({ reimport: false }))
  })

  test('getScanProgress GETs and parses', async () => {
    const cap = capture(200, JSON.stringify({ status: 'importing', scanned_files: 5, total_files: 10 }))
    const p = await new ScanApi(client(cap.transport)).getScanProgress()
    expect(cap.method()).toBe('GET')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/scan/progress`)
    expect(p.status).toBe('importing')
    expect(p.percent).toBe(50)
  })

  test('getScanProgress tolerates a null-heavy body', async () => {
    const cap = capture(200, JSON.stringify({ status: null, total_files: null, current_file: null }))
    const p = await new ScanApi(client(cap.transport)).getScanProgress()
    expect(p.status).toBe('idle')
  })

  test('cancelScan POSTs with no body', async () => {
    const cap = capture(200, '')
    await new ScanApi(client(cap.transport)).cancelScan()
    expect(cap.method()).toBe('POST')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/scan/cancel`)
    expect(cap.body()).toBeUndefined()
  })
})

describe('ScanApi.getDirectories', () => {
  test('the root request carries no query string', async () => {
    const cap = capture(200, JSON.stringify({ root: '/m', directories: [] }))
    await new ScanApi(client(cap.transport)).getDirectories()
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/scan/directories`)
    expect(cap.url()).not.toContain('?')
  })

  test('a sub-directory request url-encodes the path', async () => {
    const cap = capture(200, JSON.stringify({ root: '/m', directories: [] }))
    await new ScanApi(client(cap.transport)).getDirectories('/m/rock')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/scan/directories?path=%2Fm%2Frock`)
  })

  test('parses entries into camelCase', async () => {
    const cap = capture(
      200,
      JSON.stringify({ root: '/m', directories: [{ name: 'rock', path: '/m/rock', has_children: true }] }),
    )
    const list = await new ScanApi(client(cap.transport)).getDirectories()
    expect(list.directories).toEqual([{ name: 'rock', path: '/m/rock', hasChildren: true }])
    expect(list.root).toBe('/m')
  })
})

/** Metadata refresh lives under `/songs/*`, not `/scan/*` — easy to get wrong. */
describe('ScanApi metadata endpoints', () => {
  test('startMetadataRefresh POSTs the songs endpoint with no body', async () => {
    const cap = capture(200, '')
    await new ScanApi(client(cap.transport)).startMetadataRefresh()
    expect(cap.method()).toBe('POST')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/songs/refresh-metadata`)
    expect(cap.body()).toBeUndefined()
  })

  test('getMetadataProgress GETs and parses', async () => {
    const cap = capture(200, JSON.stringify({ status: 'running', total: 4, processed: 1, failed: 1 }))
    const m = await new ScanApi(client(cap.transport)).getMetadataProgress()
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/songs/refresh-metadata/progress`)
    expect(m.completedCount).toBe(2)
    expect(m.percent).toBe(50)
  })

  test('cancelMetadataRefresh POSTs the cancel endpoint', async () => {
    const cap = capture(200, '')
    await new ScanApi(client(cap.transport)).cancelMetadataRefresh()
    expect(cap.method()).toBe('POST')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/songs/refresh-metadata/cancel`)
  })
})
