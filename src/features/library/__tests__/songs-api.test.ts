import { describe, expect, test } from 'vitest'

import { apiPrefix } from '../../../core/config/app-config.js'
import { createPublicClient } from '../../../core/network/api-client.js'
import type { Transport } from '../../../core/network/http-client.js'
import {
  SongsApi,
  buildFacetsQuery,
  buildSongIdsQuery,
  buildSongsQuery,
  playedEventParams,
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

// A transport that captures the whole request, not just the URL — the play-event
// bug lived in the method/body/query split, which `capture` cannot see.
function captureRequest(body: unknown): {
  transport: Transport
  req: () => { url: string, method?: string, body?: unknown }
} {
  let seen: { url: string, method?: string, body?: unknown } = { url: '' }
  const transport: Transport = async (r) => {
    seen = { url: r.url, method: r.method, body: r.body }
    return { status: 200, headers: {}, body: JSON.stringify(body) }
  }
  return { transport, req: () => seen }
}

describe('playedEventParams (pure)', () => {
  test('always reports type=play and the client source', () => {
    // `type` is the whole ballgame: the backend defaults it to `finish` and only
    // records history for `play`. Omitting it is what made every call a no-op.
    expect(playedEventParams()).toEqual({ type: 'play', source: 'songloft-player' })
  })

  test('carries the context when there is one', () => {
    expect(playedEventParams({ type: 'artist', key: '周杰伦' })).toEqual({
      type: 'play',
      source: 'songloft-player',
      context_type: 'artist',
      context_key: '周杰伦',
    })
  })
})

describe('play history endpoints', () => {
  test('recordPlayed puts type + context in the QUERY, not the body', async () => {
    const cap = captureRequest(null)
    await new SongsApi(client(cap.transport)).recordPlayed(5, { type: 'playlist', key: '3' })
    const { url, method, body } = cap.req()
    expect(method).toBe('POST')
    expect(url).toContain(`${apiPrefix}/songs/5/played?`)
    expect(url).toContain('type=play')
    expect(url).toContain('context_type=playlist')
    expect(url).toContain('context_key=3')
    // The previous implementation sent the context here and no `type` at all,
    // so the backend recorded nothing while still answering 204.
    expect(body).toBeUndefined()
  })

  test('recordPlayed without a context sends no context params', async () => {
    const cap = captureRequest(null)
    await new SongsApi(client(cap.transport)).recordPlayed(5)
    const url = cap.req().url
    expect(url).toContain('type=play')
    expect(url).not.toContain('context_type')
    expect(url).not.toContain('context_key')
  })

  test('getPlayHistory sends both context params and the limit', async () => {
    const cap = captureRequest({ items: [], total: 0 })
    await new SongsApi(client(cap.transport)).getPlayHistory({ type: 'album', key: 'Kind of Blue' })
    const url = cap.req().url
    expect(url).toContain(`${apiPrefix}/play-history?`)
    expect(url).toContain('context_type=album')
    expect(url).toContain('context_key=Kind%20of%20Blue')
    expect(url).toContain('limit=50')
  })

  test('context keys are encoded exactly once', async () => {
    const cap = captureRequest({ items: [], total: 0 })
    await new SongsApi(client(cap.transport)).getPlayHistory({ type: 'artist', key: 'AC/DC & 周杰伦' })
    const url = cap.req().url
    // HttpClient.buildQuery already encodes; encoding again here would turn the
    // leading `%` of each escape into `%25`.
    expect(url).toContain('context_key=AC%2FDC%20%26%20%E5%91%A8%E6%9D%B0%E4%BC%A6')
    expect(url).not.toContain('%25')
  })

  test('clearPlayHistory deletes the context and returns the count', async () => {
    const cap = captureRequest({ deleted: 4 })
    const deleted = await new SongsApi(client(cap.transport))
      .clearPlayHistory({ type: 'playlist', key: '2' })
    const { url, method } = cap.req()
    expect(method).toBe('DELETE')
    expect(url).toContain(`${apiPrefix}/play-history?`)
    expect(url).toContain('context_key=2')
    expect(deleted).toBe(4)
  })

  test('deletePlayHistoryEntry scopes the deletion to one context', async () => {
    const cap = captureRequest(null)
    await new SongsApi(client(cap.transport))
      .deletePlayHistoryEntry({ type: 'genre', key: 'Jazz' }, 11)
    const { url, method } = cap.req()
    expect(method).toBe('DELETE')
    expect(url).toContain(`${apiPrefix}/play-history/entry?`)
    expect(url).toContain('context_type=genre')
    expect(url).toContain('context_key=Jazz')
    expect(url).toContain('song_id=11')
  })
})
