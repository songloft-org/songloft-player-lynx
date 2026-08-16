import { describe, expect, test } from 'vitest'

import type { Song } from '../models/song.js'
import { resolveVideoSourceKind } from '../core/network/video-source.js'

/**
 * The three-way decision behind every video URL. Getting a container onto the wrong
 * side is silent in both directions: `'direct'` for something AVFoundation cannot
 * demux is a dead player, `'hls'` for something the device handles fine is a
 * server-side transcode the user waits through for no reason.
 */
type VideoSong = Pick<Song, 'isVideo' | 'isLive' | 'type' | 'format'>

function video(format: string, over: Partial<VideoSong> = {}): VideoSong {
  return { isVideo: true, isLive: false, type: 'local', format, ...over }
}

describe('resolveVideoSourceKind', () => {
  test('only video songs get a picture', () => {
    expect(resolveVideoSourceKind(video('mkv', { isVideo: false }), 'android')).toBe('none')
    expect(resolveVideoSourceKind(video('mp4', { isVideo: false }), 'ios')).toBe('none')
  })

  test('Web never gets one — it has no native video surface', () => {
    for (const fmt of ['mp4', 'mkv', 'avi', '']) {
      expect(resolveVideoSourceKind(video(fmt), 'web'), fmt).toBe('none')
    }
  })

  test('live sources are excluded: the HLS endpoints work off a file', () => {
    expect(resolveVideoSourceKind(video('mp4', { isLive: true }), 'android')).toBe('none')
    expect(resolveVideoSourceKind(video('mp4', { type: 'radio' }), 'ios')).toBe('none')
  })

  test('the MP4/QuickTime family plays directly on both', () => {
    // 'm4a' first because it is what the server actually reports for a `.mp4`
    // (measured: scanning an H.264+AAC mp4 yields `format: 'm4a', is_video: true`).
    // Dropping it would send every MP4 video song through a needless transcode.
    for (const fmt of ['m4a', 'mp4', 'MP4', 'mov', 'm4v', '3gp']) {
      expect(resolveVideoSourceKind(video(fmt), 'ios'), `${fmt}/ios`).toBe('direct')
      expect(resolveVideoSourceKind(video(fmt), 'android'), `${fmt}/android`).toBe('direct')
    }
  })

  test('Matroska and WebM split by platform', () => {
    // ExoPlayer demuxes them and the usual codecs are CDD-required; AVFoundation
    // cannot open them at all, so iOS has to pay for a transcode.
    for (const fmt of ['mkv', 'matroska', 'webm', 'ts']) {
      expect(resolveVideoSourceKind(video(fmt), 'android'), `${fmt}/android`).toBe('direct')
      expect(resolveVideoSourceKind(video(fmt), 'ios'), `${fmt}/ios`).toBe('hls')
    }
  })

  test('the legacy containers are transcoded on both', () => {
    // media3 has extractors for avi/flv/mpg, but what is inside is typically
    // MPEG-2 / Xvid / Sorenson — no device is obliged to decode those.
    for (const fmt of ['avi', 'flv', 'wmv', 'rm', 'rmvb', 'mpg']) {
      expect(resolveVideoSourceKind(video(fmt), 'android'), `${fmt}/android`).toBe('hls')
      expect(resolveVideoSourceKind(video(fmt), 'ios'), `${fmt}/ios`).toBe('hls')
    }
  })

  test('an unknown container is assumed playable rather than transcoded', () => {
    // `format` is '' for every remote song until its metadata is refreshed. Guessing
    // 'hls' there would transcode files that are usually plain MP4.
    expect(resolveVideoSourceKind(video(''), 'ios')).toBe('direct')
    expect(resolveVideoSourceKind(video(''), 'android')).toBe('direct')
  })
})
