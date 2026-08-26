import { describe, it, expect } from 'vitest'

import { buildSongUrl, isHlsPlaylistPath } from '../url-helper.js'

const CTX = { resolvedBaseUrl: 'http://host:58091', basePath: '', accessToken: 'TK' }

/**
 * Regression gate for "HLS radio loaded as a progressive source".
 *
 * The shapes below are what a live backend actually returned for three radios
 * (an `.m3u8` upstream, an `.mp3` upstream, and an extension-less icecast URL).
 */
describe('isHlsPlaylistPath', () => {
  it('flags the backend path the backend marks as a playlist', () => {
    expect(isHlsPlaylistPath('/api/v1/songs/73/play.m3u8')).toBe(true)
  })

  it('does NOT flag progressive radio streams', () => {
    // Handing HlsMediaSource an mp3/icecast stream breaks playback that works today.
    expect(isHlsPlaylistPath('/api/v1/songs/74/play')).toBe(false)
    expect(isHlsPlaylistPath('/api/v1/songs/75/play')).toBe(false)
  })

  it('reads the extension off the path, not the query string', () => {
    // This is the whole point: the engines' own `url.endsWith(".m3u8")` fails here.
    const built = buildSongUrl('/api/v1/songs/73/play.m3u8', { songFormat: '' }, CTX)
    expect(built.endsWith('.m3u8')).toBe(false) // ← why the engine check is useless
    expect(isHlsPlaylistPath(built)).toBe(true) // ← but ours still sees it
  })

  it('is not fooled by .m3u8 appearing elsewhere in the URL', () => {
    expect(isHlsPlaylistPath('/api/v1/songs/9/play?next=a.m3u8')).toBe(false)
    expect(isHlsPlaylistPath('/api/v1/songs/9/play.m3u8#frag')).toBe(true)
  })

  it('handles empty input', () => {
    expect(isHlsPlaylistPath('')).toBe(false)
  })
})
