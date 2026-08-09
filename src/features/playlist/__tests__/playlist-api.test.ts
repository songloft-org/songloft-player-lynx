import { describe, expect, test } from 'vitest'

import { apiPrefix } from '../../../core/config/app-config.js'
import { createPublicClient } from '../../../core/network/api-client.js'
import type { Transport } from '../../../core/network/http-client.js'
import {
  PlaylistApi,
  buildPlaylistSongsQuery,
  buildPlaylistsQuery,
} from '../api/playlist-api.js'

function client(transport: Transport) {
  return createPublicClient({ transport, getBaseUrl: () => 'http://api.test' })
}

// A transport that captures the requested URL and returns a canned body.
function capture(body: unknown): { transport: Transport; url: () => string } {
  let seen = ''
  const transport: Transport = async (req) => {
    seen = req.url
    return { status: 200, headers: {}, body: JSON.stringify(body) }
  }
  return { transport, url: () => seen }
}

describe('buildPlaylistsQuery (pure)', () => {
  test('always carries limit/offset with defaults', () => {
    expect(buildPlaylistsQuery()).toEqual({ limit: 20, offset: 0 })
  })

  test('applies pagination overrides', () => {
    expect(buildPlaylistsQuery({}, { limit: 50, offset: 40 })).toEqual({
      limit: 50,
      offset: 40,
    })
  })

  test('includes every non-empty filter and prunes empties', () => {
    expect(
      buildPlaylistsQuery(
        { type: 'radio', excludeLabels: 'hidden', keyword: 'chill' },
        { limit: 20, offset: 20 },
      ),
    ).toEqual({
      limit: 20,
      offset: 20,
      type: 'radio',
      exclude_labels: 'hidden',
      keyword: 'chill',
    })
  })

  test('drops empty-string filters', () => {
    expect(buildPlaylistsQuery({ type: undefined, keyword: '', excludeLabels: '' })).toEqual({
      limit: 20,
      offset: 0,
    })
  })
})

describe('buildPlaylistSongsQuery (pure)', () => {
  test('carries pagination and prunes empty sort/order/keyword', () => {
    expect(
      buildPlaylistSongsQuery({ sort: 'position', order: '', keyword: '' }, { offset: 20 }),
    ).toEqual({
      limit: 20,
      offset: 20,
      sort: 'position',
    })
  })
})

describe('PlaylistApi endpoints', () => {
  test('getPlaylists hits /playlists with query params and parses {playlists,total}', async () => {
    const cap = capture({
      playlists: [
        { id: 1, type: 'normal', name: 'Favorites', song_count: 5, labels: ['built_in'] },
        { id: 2, type: 'radio', name: 'My Radio' },
      ],
      total: 42,
    })
    const res = await new PlaylistApi(client(cap.transport)).getPlaylists(
      { type: 'normal', keyword: 'fav' },
      { limit: 20, offset: 20 },
    )
    const url = cap.url()
    expect(url).toContain(`${apiPrefix}/playlists?`)
    expect(url).toContain('limit=20')
    expect(url).toContain('offset=20')
    expect(url).toContain('type=normal')
    expect(url).toContain('keyword=fav')
    // Parsed through the batch-2 zod model (snake_case → camelCase + derived flags).
    expect(res.total).toBe(42)
    expect(res.playlists).toHaveLength(2)
    expect(res.playlists[0]!.name).toBe('Favorites')
    expect(res.playlists[0]!.songCount).toBe(5)
    expect(res.playlists[0]!.isBuiltIn).toBe(true)
    expect(res.playlists[1]!.type).toBe('radio')
  })

  test('getPlaylists infers total from length when the server omits it', async () => {
    const cap = capture({ playlists: [{ id: 1, type: 'normal', name: 'Solo' }] })
    const res = await new PlaylistApi(client(cap.transport)).getPlaylists()
    expect(res.total).toBe(1)
  })

  test('getPlaylist hits /playlists/{id} and parses a Playlist', async () => {
    const cap = capture({
      id: 7,
      type: 'normal',
      name: 'Road Trip',
      description: 'For the drive',
      song_count: 12,
    })
    const playlist = await new PlaylistApi(client(cap.transport)).getPlaylist(7)
    expect(cap.url()).toContain(`${apiPrefix}/playlists/7`)
    expect(playlist.id).toBe(7)
    expect(playlist.name).toBe('Road Trip')
    expect(playlist.description).toBe('For the drive')
    expect(playlist.songCount).toBe(12)
  })

  test('getPlaylistSongs hits /playlists/{id}/songs and parses {songs,total}', async () => {
    const cap = capture({
      songs: [
        { id: 1, title: 'A', artist: 'x', duration: 100 },
        { id: 2, title: 'B', duration: 200 },
      ],
      total: 2,
    })
    const res = await new PlaylistApi(client(cap.transport)).getPlaylistSongs(
      7,
      { sort: 'position', order: 'asc' },
      { limit: 20, offset: 0 },
    )
    const url = cap.url()
    expect(url).toContain(`${apiPrefix}/playlists/7/songs?`)
    expect(url).toContain('sort=position')
    expect(url).toContain('order=asc')
    expect(res.total).toBe(2)
    expect(res.songs).toHaveLength(2)
    expect(res.songs[0]!.title).toBe('A')
    expect(res.songs[1]!.artist).toBeUndefined()
  })
})
