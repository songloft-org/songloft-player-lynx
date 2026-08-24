import { describe, expect, test } from 'vitest'

import { apiPrefix } from '../../../core/config/app-config.js'
import { createPublicClient } from '../../../core/network/api-client.js'
import type { Transport } from '../../../core/network/http-client.js'
import {
  PlaylistApi,
  buildPlaylistSongsQuery,
  buildPlaylistsQuery,
  buildCreatePlaylistBody,
  buildUpdatePlaylistBody,
  buildAddSongsBody,
} from '../api/playlist-api.js'

function client(transport: Transport) {
  return createPublicClient({ transport, getBaseUrl: () => 'http://api.test' })
}

function capture(body: unknown): { transport: Transport; url: () => string; method: () => string; body: () => string | undefined } {
  let seenUrl = ''
  let seenMethod = ''
  let seenBody: string | undefined
  const transport: Transport = async (req) => {
    seenUrl = req.url
    seenMethod = req.method
    seenBody = req.body
    return { status: 200, headers: {}, body: JSON.stringify(body) }
  }
  return { transport, url: () => seenUrl, method: () => seenMethod, body: () => seenBody }
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

/**
 * `type` is the load-bearing case here: the backend 500s on a create body without
 * it (`invalid playlist data: invalid type`), so "omit what the caller did not
 * provide" — right for every other field — silently broke the add-to-playlist
 * sheet's quick-create. See `buildCreatePlaylistBody`.
 */
describe('buildCreatePlaylistBody (pure)', () => {
  test('defaults the type to normal so the backend accepts the body', () => {
    expect(buildCreatePlaylistBody({ name: 'My Playlist' })).toEqual({
      name: 'My Playlist',
      type: 'normal',
    })
  })

  test('keeps an explicit type', () => {
    expect(buildCreatePlaylistBody({ name: 'Jazz FM', type: 'radio' })).toEqual({
      name: 'Jazz FM',
      type: 'radio',
    })
  })

  test('includes both name and description', () => {
    expect(buildCreatePlaylistBody({ name: 'Chill', description: 'Relaxing' })).toEqual({
      name: 'Chill',
      type: 'normal',
      description: 'Relaxing',
    })
  })

  test('drops empty description', () => {
    expect(buildCreatePlaylistBody({ name: 'A', description: '' })).toEqual({
      name: 'A',
      type: 'normal',
    })
  })
})

describe('buildUpdatePlaylistBody (pure)', () => {
  test('includes only provided fields', () => {
    expect(buildUpdatePlaylistBody({ name: 'New Name' })).toEqual({ name: 'New Name' })
  })

  test('includes both when both provided', () => {
    expect(buildUpdatePlaylistBody({ name: 'X', description: 'Y' })).toEqual({
      name: 'X',
      description: 'Y',
    })
  })

  test('includes description even if empty string (to clear it)', () => {
    expect(buildUpdatePlaylistBody({ description: '' })).toEqual({ description: '' })
  })

  test('drops empty name', () => {
    expect(buildUpdatePlaylistBody({ name: '' })).toEqual({})
  })
})

describe('buildAddSongsBody (pure)', () => {
  test('wraps song ids in song_ids array', () => {
    expect(buildAddSongsBody([1, 2, 3])).toEqual({ song_ids: [1, 2, 3] })
  })

  test('handles empty array', () => {
    expect(buildAddSongsBody([])).toEqual({ song_ids: [] })
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

  test('tolerates null fields + stringified ints (real backend payload)', async () => {
    const cap = capture({
      playlists: [
        {
          id: '3',
          type: null,
          name: 'Empty PL',
          description: null,
          cover_url: null,
          labels: null,
          song_count: null,
          created_at: null,
          updated_at: null,
        },
      ],
      total: null,
    })
    const res = await new PlaylistApi(client(cap.transport)).getPlaylists()
    expect(res.playlists).toHaveLength(1)
    const pl = res.playlists[0]!
    expect(pl.id).toBe(3)
    expect(pl.type).toBe('normal')
    expect(pl.labels).toEqual([])
    expect(pl.songCount).toBe(0)
    expect(pl.isBuiltIn).toBe(false)
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

  test('createPlaylist sends POST /playlists with name+description body', async () => {
    const cap = capture({
      id: 10,
      type: 'normal',
      name: 'New PL',
      description: 'desc',
      song_count: 0,
    })
    const pl = await new PlaylistApi(client(cap.transport)).createPlaylist({
      name: 'New PL',
      description: 'desc',
    })
    expect(cap.method()).toBe('POST')
    expect(cap.url()).toContain(`${apiPrefix}/playlists`)
    const sentBody = JSON.parse(cap.body()!)
    expect(sentBody).toEqual({ name: 'New PL', type: 'normal', description: 'desc' })
    expect(pl.id).toBe(10)
    expect(pl.name).toBe('New PL')
  })

  test('createPlaylist omits description but never the type', async () => {
    const cap = capture({ id: 11, type: 'normal', name: 'Solo', song_count: 0 })
    await new PlaylistApi(client(cap.transport)).createPlaylist({ name: 'Solo' })
    const sentBody = JSON.parse(cap.body()!)
    // A body without `type` is answered with 500 by the real backend.
    expect(sentBody).toEqual({ name: 'Solo', type: 'normal' })
    expect(sentBody.description).toBeUndefined()
  })

  test('updatePlaylist sends PUT /playlists/{id} with partial body', async () => {
    const cap = capture({
      id: 7,
      type: 'normal',
      name: 'Renamed',
      song_count: 5,
    })
    const pl = await new PlaylistApi(client(cap.transport)).updatePlaylist(7, {
      name: 'Renamed',
    })
    expect(cap.method()).toBe('PUT')
    expect(cap.url()).toContain(`${apiPrefix}/playlists/7`)
    const sentBody = JSON.parse(cap.body()!)
    expect(sentBody).toEqual({ name: 'Renamed' })
    expect(pl.name).toBe('Renamed')
  })

  test('deletePlaylist sends DELETE /playlists/{id}', async () => {
    const cap = capture({})
    await new PlaylistApi(client(cap.transport)).deletePlaylist(7)
    expect(cap.method()).toBe('DELETE')
    expect(cap.url()).toContain(`${apiPrefix}/playlists/7`)
  })

  test('addSongsToPlaylist sends POST /playlists/{id}/songs with song_ids', async () => {
    const cap = capture({})
    await new PlaylistApi(client(cap.transport)).addSongsToPlaylist(7, [1, 2, 3])
    expect(cap.method()).toBe('POST')
    expect(cap.url()).toContain(`${apiPrefix}/playlists/7/songs`)
    const sentBody = JSON.parse(cap.body()!)
    expect(sentBody).toEqual({ song_ids: [1, 2, 3] })
  })

  /*
   * The counts drive which message the add-to-playlist sheet shows ("added 3"
   * vs "added 1, skipped 2"), so they have to survive parsing. Swagger types the
   * body as an open object, hence the defaults below rather than a schema.
   */
  test('addSongsToPlaylist reports the added / skipped counts', async () => {
    const cap = capture({ added: 2, skipped: 1 })
    const result = await new PlaylistApi(client(cap.transport)).addSongsToPlaylist(7, [1, 2, 3])
    expect(result).toEqual({ added: 2, skipped: 1 })
  })

  test('addSongsToPlaylist defaults missing counts to zero', async () => {
    // A leaner response must degrade to a plain success, not to NaN in the toast.
    const cap = capture({ message: 'ok' })
    const result = await new PlaylistApi(client(cap.transport)).addSongsToPlaylist(7, [1])
    expect(result).toEqual({ added: 0, skipped: 0 })
  })

  test('removeSongFromPlaylist sends DELETE /playlists/{id}/songs/{songId}', async () => {
    const cap = capture({})
    await new PlaylistApi(client(cap.transport)).removeSongFromPlaylist(7, 42)
    expect(cap.method()).toBe('DELETE')
    expect(cap.url()).toContain(`${apiPrefix}/playlists/7/songs/42`)
  })
})
