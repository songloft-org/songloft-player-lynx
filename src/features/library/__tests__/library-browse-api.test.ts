import { describe, expect, test } from 'vitest'

import { apiPrefix } from '../../../core/config/app-config.js'
import { createPublicClient } from '../../../core/network/api-client.js'
import type { Transport } from '../../../core/network/http-client.js'
import { DEFAULT_LIBRARY_BROWSE_CONFIG } from '../../../models/library-browse.js'
import { LibraryBrowseApi } from '../api/library-browse-api.js'

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

describe('LibraryBrowseApi.getLibraryBrowse', () => {
  test('GETs the endpoint and parses the {key, visible} wire shape', async () => {
    const cap = capture(200, JSON.stringify({
      views: [
        { key: 'all', visible: true },
        { key: 'artist', visible: false },
      ],
    }))
    const api = new LibraryBrowseApi(client(cap.transport))
    const config = await api.getLibraryBrowse()

    expect(cap.method()).toBe('GET')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/settings/library-browse`)
    expect(config.views.find((v) => v.key === 'artist')?.visible).toBe(false)
    // Partial responses are padded to the full 14.
    expect(config.views).toHaveLength(14)
  })
})

describe('LibraryBrowseApi.updateLibraryBrowse', () => {
  test('PUTs {views:[{key,visible}]} — the exact contract the old port broke', async () => {
    // The backend echoes the normalized config; return a reordered one so the
    // test also proves the response is parsed, not ignored.
    const cap = capture(200, JSON.stringify(DEFAULT_LIBRARY_BROWSE_CONFIG))
    const api = new LibraryBrowseApi(client(cap.transport))

    await api.updateLibraryBrowse({
      views: [
        { key: 'genre', visible: true },
        { key: 'all', visible: false },
      ],
    })

    expect(cap.method()).toBe('PUT')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/settings/library-browse`)
    // NOT {id, visible, order} — that dialect earned a silent 400 from the
    // backend's `isValidLibraryViewKey("")` check.
    expect(JSON.parse(cap.body()!)).toEqual({
      views: [
        { key: 'genre', visible: true },
        { key: 'all', visible: false },
      ],
    })
  })

  test('returns the server-normalized config', async () => {
    const cap = capture(200, JSON.stringify(DEFAULT_LIBRARY_BROWSE_CONFIG))
    const api = new LibraryBrowseApi(client(cap.transport))
    const saved = await api.updateLibraryBrowse({ views: [{ key: 'all', visible: true }] })
    expect(saved.views).toHaveLength(14)
  })
})
