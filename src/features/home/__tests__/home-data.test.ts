import { describe, expect, test } from 'vitest'

import { apiPrefix } from '../../../core/config/app-config.js'
import { createPublicClient } from '../../../core/network/api-client.js'
import type { Transport } from '../../../core/network/http-client.js'
import {
  PlaylistApi,
  buildPlaylistsQuery,
} from '../../playlist/api/playlist-api.js'

/**
 * The home sections reuse the batch-6 playlist list filtered by `type`
 * (`useHomePlaylists(type)` → `usePlaylistsInfiniteQuery({ type })` →
 * `PlaylistApi.getPlaylists({ type }, …)`). These tests pin the exact wire
 * contract the home page depends on: the `type` filter reaches the query string
 * and the response is zod-parsed (snake_case → camelCase + derived flags).
 */

function client(transport: Transport) {
  return createPublicClient({ transport, getBaseUrl: () => 'http://api.test' })
}

function capture(body: unknown): { transport: Transport; url: () => string } {
  let seen = ''
  const transport: Transport = async (req) => {
    seen = req.url
    return { status: 200, headers: {}, body: JSON.stringify(body) }
  }
  return { transport, url: () => seen }
}

describe('home playlist filter wiring', () => {
  test('normal / radio types map to the type query param', () => {
    expect(buildPlaylistsQuery({ type: 'normal' })).toMatchObject({ type: 'normal' })
    expect(buildPlaylistsQuery({ type: 'radio' })).toMatchObject({ type: 'radio' })
  })

  test('fetching the "radio" section hits /playlists?type=radio and parses', async () => {
    const cap = capture({
      playlists: [
        { id: 2, type: 'radio', name: 'Jazz Radio', song_count: '17', labels: null },
      ],
      total: 1,
    })
    const res = await new PlaylistApi(client(cap.transport)).getPlaylists(
      { type: 'radio' },
      { limit: 20, offset: 0 },
    )
    const url = cap.url()
    expect(url).toContain(`${apiPrefix}/playlists?`)
    expect(url).toContain('type=radio')
    expect(res.playlists).toHaveLength(1)
    expect(res.playlists[0]!.type).toBe('radio')
    expect(res.playlists[0]!.name).toBe('Jazz Radio')
    // Coerced/tolerated null + stringified int (real backend payload).
    expect(res.playlists[0]!.songCount).toBe(17)
    expect(res.playlists[0]!.labels).toEqual([])
  })
})
