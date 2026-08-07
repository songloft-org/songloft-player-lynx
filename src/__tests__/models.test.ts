import { describe, expect, test } from 'vitest'

import type { ApiResponse } from '../models/index.js'
import {
  apiFailure,
  apiSuccess,
  isApiError,
  isApiSuccess,
  PaginatedResponse,
  PaginationParams,
  parseAuthTokens,
  authTokensToJson,
  parsePlaylist,
  parsePlaylistListResponse,
  playlistToJson,
  parseSong,
  parseSongListResponse,
  safeParseSong,
  songEquals,
  songToJson,
} from '../models/index.js'

describe('Song', () => {
  const wire = {
    id: 7,
    type: 'remote',
    title: 'Song A',
    artist: 'Artist A',
    album: 'Album A',
    year: 2021,
    genre: 'rock',
    language: 'en',
    style: 'indie',
    duration: 213.5,
    file_path: '/music/a.flac',
    url: 'http://x/a',
    cover_url: '/api/v1/songs/7/cover',
    lyric_url: '/api/v1/songs/7/lyric',
    lyric_remote_url: 'http://lrc/a',
    file_size: 12345,
    format: 'flac',
    bit_rate: 900,
    sample_rate: 44100,
    source_url: 'http://src/a',
    source_cover_url: 'http://src/a.jpg',
    is_live: false,
    is_video: true,
    added_at: '2021-01-01T00:00:00.000Z',
    updated_at: '2021-02-02T00:00:00.000Z',
  }

  test('parses snake_case JSON into camelCase', () => {
    const s = parseSong(wire)
    expect(s.id).toBe(7)
    expect(s.type).toBe('remote')
    expect(s.filePath).toBe('/music/a.flac')
    expect(s.coverUrl).toBe('/api/v1/songs/7/cover')
    expect(s.lyricRemoteUrl).toBe('http://lrc/a')
    expect(s.fileSize).toBe(12345)
    expect(s.bitRate).toBe(900)
    expect(s.sampleRate).toBe(44100)
    expect(s.isVideo).toBe(true)
    expect(s.addedAt).toBe('2021-01-01T00:00:00.000Z')
  })

  test('round-trips back to snake_case', () => {
    const json = songToJson(parseSong(wire))
    expect(json).toMatchObject({
      id: 7,
      file_path: '/music/a.flac',
      cover_url: '/api/v1/songs/7/cover',
      lyric_remote_url: 'http://lrc/a',
      file_size: 12345,
      bit_rate: 900,
      sample_rate: 44100,
      is_video: true,
      added_at: '2021-01-01T00:00:00.000Z',
      updated_at: '2021-02-02T00:00:00.000Z',
    })
  })

  test('applies defaults for missing optional fields', () => {
    const s = parseSong({ id: 1, title: 'Bare' })
    expect(s.type).toBe('local')
    expect(s.year).toBe(0)
    expect(s.duration).toBe(0)
    expect(s.fileSize).toBe(0)
    expect(s.bitRate).toBe(0)
    expect(s.isLive).toBe(false)
    expect(s.isVideo).toBe(false)
    expect(s.artist).toBeUndefined()
    expect(typeof s.addedAt).toBe('string')
    expect(typeof s.updatedAt).toBe('string')
  })

  test('unknown type falls back to local; invalid input fails safeParse', () => {
    expect(parseSong({ id: 1, title: 't', type: 'weird' }).type).toBe('local')
    expect(safeParseSong({ title: 'no id' }).success).toBe(false)
  })

  test('equality is by id', () => {
    const a = parseSong({ id: 5, title: 'A' })
    const b = parseSong({ id: 5, title: 'B different' })
    const c = parseSong({ id: 6, title: 'A' })
    expect(songEquals(a, b)).toBe(true)
    expect(songEquals(a, c)).toBe(false)
  })

  test('SongListResponse defaults total to song count', () => {
    const r = parseSongListResponse({ songs: [{ id: 1, title: 'x' }] })
    expect(r.total).toBe(1)
    expect(r.songs[0]!.title).toBe('x')
  })
})

describe('Playlist', () => {
  const wire = {
    id: 1,
    type: 'normal',
    name: 'Favorites',
    description: 'my favs',
    cover_url: '/api/v1/playlists/1/cover',
    labels: ['built_in', 'hidden'],
    song_count: 12,
    created_at: '2020-01-01T00:00:00.000Z',
    updated_at: '2020-02-01T00:00:00.000Z',
  }

  test('parses snake_case and derives label getters', () => {
    const p = parsePlaylist(wire)
    expect(p.name).toBe('Favorites')
    expect(p.coverUrl).toBe('/api/v1/playlists/1/cover')
    expect(p.songCount).toBe(12)
    expect(p.isBuiltIn).toBe(true)
    expect(p.isHidden).toBe(true)
    expect(p.isAutoCreated).toBe(false)
  })

  test('round-trips and defaults labels/songCount', () => {
    const p = parsePlaylist({ id: 2, name: 'P2' })
    expect(p.labels).toEqual([])
    expect(p.songCount).toBe(0)
    expect(p.isBuiltIn).toBe(false)
    expect(playlistToJson(parsePlaylist(wire))).toMatchObject({
      id: 1,
      cover_url: '/api/v1/playlists/1/cover',
      song_count: 12,
      labels: ['built_in', 'hidden'],
    })
  })

  test('PlaylistListResponse maps + totals', () => {
    const r = parsePlaylistListResponse({ playlists: [wire], total: 0 })
    expect(r.total).toBe(1)
    expect(r.playlists[0]!.isBuiltIn).toBe(true)
  })
})

describe('AuthTokens', () => {
  test('parses snake_case and round-trips', () => {
    const t = parseAuthTokens({
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 3600,
    })
    expect(t.accessToken).toBe('a')
    expect(t.refreshToken).toBe('r')
    expect(t.expiresIn).toBe(3600)
    expect(t.tokenType).toBe('Bearer')
    expect(authTokensToJson(t)).toEqual({
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 3600,
      token_type: 'Bearer',
    })
  })
})

describe('pagination', () => {
  test('PaginationParams query + navigation', () => {
    const p = new PaginationParams()
    expect(p.limit).toBe(20)
    expect(p.offset).toBe(0)
    expect(p.toQueryParams()).toEqual({ limit: '20', offset: '0' })
    expect(p.nextPage().offset).toBe(20)
    expect(p.previousPage()).toBeNull()
    expect(p.nextPage().previousPage()!.offset).toBe(0)
    expect(p.page(3).offset).toBe(60)
  })

  test('PaginatedResponse hasMore + merge', () => {
    const first = new PaginatedResponse<number>({ items: [1, 2], total: 4, offset: 0, limit: 2 })
    expect(first.hasMore).toBe(true)
    expect(first.nextPageParams()!.offset).toBe(2)
    const second = new PaginatedResponse<number>({ items: [3, 4], total: 4, offset: 2, limit: 2 })
    const merged = first.merge(second)
    expect(merged.items).toEqual([1, 2, 3, 4])
    expect(merged.hasMore).toBe(false)
    expect(merged.totalPages).toBe(2)
  })

  test('PaginatedResponse.fromJson parses items', () => {
    const r = PaginatedResponse.fromJson<number>(
      { items: [1, 2, 3], total: 3, offset: 0, limit: 20 },
      (x) => x as number,
    )
    expect(r.items).toEqual([1, 2, 3])
    expect(r.total).toBe(3)
  })
})

describe('ApiResponse', () => {
  test('success/failure helpers', () => {
    const ok: ApiResponse<number> = apiSuccess(1)
    const bad = apiFailure('boom', 'detail')
    expect(isApiSuccess(ok)).toBe(true)
    expect(isApiError(ok)).toBe(false)
    expect(isApiError(bad)).toBe(true)
    expect(bad.detail).toBe('detail')
  })
})
