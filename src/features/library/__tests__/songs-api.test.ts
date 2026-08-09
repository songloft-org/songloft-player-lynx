import { describe, expect, test } from 'vitest'

import { apiPrefix } from '../../../core/config/app-config.js'
import { createPublicClient } from '../../../core/network/api-client.js'
import type { Transport } from '../../../core/network/http-client.js'
import {
  SongsApi,
  buildFacetsQuery,
  buildSongIdsQuery,
  buildSongsQuery,
} from '../api/songs-api.js'

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

describe('buildSongsQuery (pure)', () => {
  test('always carries limit/offset with defaults', () => {
    expect(buildSongsQuery({})).toEqual({ limit: 20, offset: 0 })
  })

  test('applies pagination overrides', () => {
    expect(buildSongsQuery({}, { limit: 50, offset: 40 })).toEqual({
      limit: 50,
      offset: 40,
    })
  })

  test('includes every non-empty filter and prunes empties', () => {
    const q = buildSongsQuery(
      {
        type: 'remote',
        keyword: 'jazz',
        pathPrefix: 'music/Pop',
        excludePlaylistLabels: 'none',
        genre: 'Jazz',
        artist: 'Miles',
        album: 'Kind of Blue',
        language: 'en',
        style: 'cool',
        year: 1959,
        decade: 1950,
        sort: 'title',
        order: 'asc',
      },
      { limit: 20, offset: 20 },
    )
    expect(q).toEqual({
      limit: 20,
      offset: 20,
      type: 'remote',
      keyword: 'jazz',
      path_prefix: 'music/Pop',
      exclude_playlist_labels: 'none',
      genre: 'Jazz',
      artist: 'Miles',
      album: 'Kind of Blue',
      language: 'en',
      style: 'cool',
      year: 1959,
      decade: 1950,
      sort: 'title',
      order: 'asc',
    })
  })

  test('drops empty strings and non-positive year/decade', () => {
    const q = buildSongsQuery({ keyword: '', type: undefined, year: 0, decade: -1 })
    expect(q).toEqual({ limit: 20, offset: 0 })
  })
})

describe('buildSongIdsQuery (pure)', () => {
  test('mirrors song filters without pagination', () => {
    expect(buildSongIdsQuery({ type: 'local', keyword: 'x', year: 0 })).toEqual({
      type: 'local',
      keyword: 'x',
    })
  })
})

describe('buildFacetsQuery (pure)', () => {
  test('carries field + pagination and prunes empty keyword', () => {
    expect(buildFacetsQuery('artist', { keyword: '', sort: 'count', order: 'desc' })).toEqual({
      field: 'artist',
      limit: 20,
      offset: 0,
      sort: 'count',
      order: 'desc',
    })
  })
})

describe('SongsApi endpoints', () => {
  test('getSongs hits /songs with query params and parses {songs,total}', async () => {
    const cap = capture({
      songs: [
        { id: 1, title: 'A', artist: 'x', duration: 100 },
        { id: 2, title: 'B', duration: 200 },
      ],
      total: 42,
    })
    const res = await new SongsApi(client(cap.transport)).getSongs(
      { keyword: 'blue', type: 'remote' },
      { limit: 20, offset: 20 },
    )
    const url = cap.url()
    expect(url).toContain(`${apiPrefix}/songs?`)
    expect(url).toContain('limit=20')
    expect(url).toContain('offset=20')
    expect(url).toContain('keyword=blue')
    expect(url).toContain('type=remote')
    // Parsed through the batch-2 zod model (snake_case → camelCase).
    expect(res.total).toBe(42)
    expect(res.songs).toHaveLength(2)
    expect(res.songs[0]!.title).toBe('A')
    expect(res.songs[0]!.artist).toBe('x')
    expect(res.songs[1]!.artist).toBeUndefined()
  })

  test('getSongs infers total from length when the server omits it', async () => {
    const cap = capture({ songs: [{ id: 1, title: 'Solo', duration: 0 }] })
    const res = await new SongsApi(client(cap.transport)).getSongs()
    expect(res.total).toBe(1)
  })

  test('getFacets hits /songs/facets and parses {facets,total}', async () => {
    const cap = capture({
      facets: [
        { value: 'Miles', count: 12, cover_url: '/c/1.jpg' },
        { value: 'Coltrane', count: 8 },
      ],
      total: 2,
    })
    const res = await new SongsApi(client(cap.transport)).getFacets('artist', {
      offset: 0,
    })
    const url = cap.url()
    expect(url).toContain(`${apiPrefix}/songs/facets?`)
    expect(url).toContain('field=artist')
    expect(url).toContain('limit=20')
    expect(res.total).toBe(2)
    expect(res.facets[0]!.value).toBe('Miles')
    expect(res.facets[0]!.coverUrl).toBe('/c/1.jpg')
    expect(res.facets[1]!.coverUrl).toBe('')
  })

  test('getSongIds hits /songs/ids and coerces ids to numbers', async () => {
    const cap = capture({ ids: [3, '5', 7.0], total: 3 })
    const res = await new SongsApi(client(cap.transport)).getSongIds({ type: 'local' })
    const url = cap.url()
    expect(url).toContain(`${apiPrefix}/songs/ids?`)
    expect(url).toContain('type=local')
    expect(res.ids).toEqual([3, 5, 7])
    expect(res.total).toBe(3)
  })

  test('getSong hits /songs/{id} and parses a Song', async () => {
    const cap = capture({ id: 9, title: 'Nine', album: 'Album', duration: 321 })
    const song = await new SongsApi(client(cap.transport)).getSong(9)
    expect(cap.url()).toContain(`${apiPrefix}/songs/9`)
    expect(song.id).toBe(9)
    expect(song.title).toBe('Nine')
    expect(song.album).toBe('Album')
  })
})
