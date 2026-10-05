import { expect, test } from 'vitest'
import type { Song } from '../../../models/song.js'
import { dlnaMedia } from '../data/dlna-media.js'

const context = { resolvedBaseUrl: 'http://192.168.2.2:58091', basePath: '/music', accessToken: 'example' }
const song = (format: string, isVideo = false) => ({ url: '/api/v1/songs/2/play', format, isVideo }) as Song

test('MP3 playback API URLs have an explicit audio/mpeg declaration', () => {
  expect(dlnaMedia(song('MP3'), context)).toEqual({
    url: 'http://192.168.2.2:58091/music/api/v1/songs/2/play?access_token=example',
    mimeType: 'audio/mpeg',
  })
})

test('audio MIME follows the requested transcode rather than the source format', () => {
  const media = dlnaMedia(song('wma'), context)
  expect(media.url).toContain('&format=mp3')
  expect(media.mimeType).toBe('audio/mpeg')
  expect(dlnaMedia(song('flac'), context).mimeType).toBe('audio/flac')
})

test('video casting preserves the original video and declares its container', () => {
  const media = dlnaMedia(song('mp4', true), context)
  expect(media.url).toContain('&media=video')
  expect(media.url).not.toContain('format=')
  expect(media.mimeType).toBe('video/mp4')
})

test('unknown formats do not advertise an invented MP3 MIME', () => {
  expect(dlnaMedia(song('unknown'), context).mimeType).toBeUndefined()
})

test('video MIME uses the file container when the backend normalizes MP4 to m4a', () => {
  expect(dlnaMedia({ ...song('m4a', true), filePath: '/music/video.mp4' }, context).mimeType).toBe('video/mp4')
})
