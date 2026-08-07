import { describe, expect, test } from 'vitest'

import {
  buildCoverUrl,
  buildResourceUrl,
  buildSongUrl,
  buildVideoHlsUrl,
  buildVideoUrl,
  type UrlContext,
} from '../core/network/url-helper.js'

const ctx: UrlContext = {
  resolvedBaseUrl: 'http://host:58091',
  basePath: '',
  accessToken: 'tok123',
}

describe('UrlHelper', () => {
  test('relative path gets base + access_token', () => {
    expect(buildResourceUrl('/api/v1/songs/1/cover', ctx)).toBe(
      'http://host:58091/api/v1/songs/1/cover?access_token=tok123',
    )
  })

  test('absolute URL passes through untouched', () => {
    expect(buildResourceUrl('https://cdn/x.jpg', ctx)).toBe('https://cdn/x.jpg')
  })

  test('existing query uses & separator', () => {
    expect(buildResourceUrl('/api/v1/x?y=1', ctx)).toBe(
      'http://host:58091/api/v1/x?y=1&access_token=tok123',
    )
  })

  test('basePath is prepended', () => {
    expect(buildResourceUrl('/api/v1/health', { ...ctx, basePath: '/app' })).toBe(
      'http://host:58091/app/api/v1/health?access_token=tok123',
    )
  })

  test('buildSongUrl adds transcode format for unsupported formats (web)', () => {
    const url = buildSongUrl('/api/v1/songs/1/play', { songFormat: 'wma' }, ctx)
    expect(url).toContain('access_token=tok123')
    expect(url).toContain('format=mp3')
  })

  test('buildSongUrl skips format for natively supported format', () => {
    expect(buildSongUrl('/api/v1/songs/1/play', { songFormat: 'mp3' }, ctx)).not.toContain(
      'format=',
    )
  })

  test('buildSongUrl adds quality but not for original', () => {
    expect(buildSongUrl('/api/v1/songs/1/play', { quality: '320' }, ctx)).toContain('quality=320')
    expect(
      buildSongUrl('/api/v1/songs/1/play', { quality: 'original' }, ctx),
    ).not.toContain('quality=')
  })

  test('buildSongUrl audioTrack takes precedence over format', () => {
    const url = buildSongUrl('/api/v1/songs/1/play', { songFormat: 'wma', audioTrack: 1 }, ctx)
    expect(url).toContain('track=1')
    expect(url).not.toContain('format=')
  })

  test('buildSongUrl hls=direct', () => {
    expect(buildSongUrl('/api/v1/songs/1/play', { hlsDirect: true }, ctx)).toContain('hls=direct')
  })

  test('buildVideoUrl appends media=video', () => {
    expect(buildVideoUrl('/api/v1/songs/1/play', ctx)).toContain('media=video')
  })

  test('buildVideoHlsUrl builds m3u8 path with optional media=video', () => {
    expect(buildVideoHlsUrl(5, {}, ctx)).toBe(
      'http://host:58091/api/v1/songs/5/video-hls/playlist.m3u8?access_token=tok123',
    )
    expect(buildVideoHlsUrl(5, { mediaVideoFlag: true }, ctx)).toContain('media=video')
  })

  test('buildCoverUrl is buildResourceUrl', () => {
    expect(buildCoverUrl('/api/v1/songs/1/cover', ctx)).toBe(
      'http://host:58091/api/v1/songs/1/cover?access_token=tok123',
    )
  })

  test('empty input returns empty string', () => {
    expect(buildResourceUrl('', ctx)).toBe('')
    expect(buildSongUrl('', {}, ctx)).toBe('')
  })
})
