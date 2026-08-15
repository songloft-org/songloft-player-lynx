import { describe, expect, test } from 'vitest'

import { getTranscodeFormat } from '../core/network/audio-format.js'

/**
 * `getTranscodeFormat` had no test of its own, and its `platform` parameter had no
 * caller — `player-store`'s `songUrl()` never passed one, so every device got the
 * `'web'` default. Two wrong answers came out of that, in opposite directions, and
 * both were silent. This table pins them and the blast radius of fixing them.
 *
 * The rule being encoded: **the audio path's job is that the song plays.** Video
 * songs never come through here (`player-store` sends them to `?media=video` /
 * `/video-hls/`), so there is nothing to gain by guessing whether a device can open
 * a Matroska stream — and a container name does not reveal the codec inside it.
 */
describe('getTranscodeFormat', () => {
  test('the two bugs the missing platform argument caused', () => {
    // ogg/opus are in the Web set but not the iOS one. Left untranscoded, AVPlayer
    // cannot open them and the song silently never starts.
    expect(getTranscodeFormat('ogg', 'ios')).toBe('mp3')
    expect(getTranscodeFormat('opus', 'ios')).toBe('mp3')
    // Video containers were told to transcode to mp3, i.e. the client asked the
    // server for `-vn`. On a device they now stay untouched (mp4/mov normalise to
    // 'm4a' and were already fine) or get handled by the video endpoints.
    expect(getTranscodeFormat('m4v', 'ios')).toBeNull()
    expect(getTranscodeFormat('3gp', 'android')).toBeNull()
  })

  test('containers no device player can be trusted with stay transcoded', () => {
    // AVFoundation cannot demux any of these; ExoPlayer can open some, but the
    // codecs inside (AC-3/DTS audio, MPEG-2/Xvid video) are not guaranteed.
    for (const platform of ['ios', 'android'] as const) {
      for (const fmt of ['mkv', 'matroska', 'webm', 'mka', 'avi', 'flv', 'wmv', 'rm', 'rmvb', 'mpg', 'ts']) {
        expect(getTranscodeFormat(fmt, platform), `${fmt}/${platform}`).toBe('mp3')
      }
    }
  })

  test('formats each device plays natively are left alone', () => {
    for (const fmt of ['mp3', 'flac', 'm4a', 'aac', 'wav', 'aiff', 'alac']) {
      expect(getTranscodeFormat(fmt, 'ios'), fmt).toBeNull()
    }
    for (const fmt of ['mp3', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'wav']) {
      expect(getTranscodeFormat(fmt, 'android'), fmt).toBeNull()
    }
    // mp4/mov/m4b all normalise to 'm4a', which is in every set — so video songs in
    // an MP4 container have always been served untranscoded, picture included.
    for (const fmt of ['mp4', 'mov', 'm4b']) {
      expect(getTranscodeFormat(fmt, 'ios'), fmt).toBeNull()
      expect(getTranscodeFormat(fmt, 'android'), fmt).toBeNull()
    }
  })

  test('formats no device plays are transcoded on both', () => {
    for (const fmt of ['ape', 'wma', 'asf']) {
      expect(getTranscodeFormat(fmt, 'ios'), fmt).toBe('mp3')
      expect(getTranscodeFormat(fmt, 'android'), fmt).toBe('mp3')
    }
  })

  test('Web is byte-identical to before the platform argument was threaded through', () => {
    // `<audio>` is the consumer on Web and this function is all that protects it,
    // so the fix deliberately did not widen anything here.
    for (const fmt of ['mkv', 'mka', 'm4v', '3gp', 'avi', 'ts', 'webm']) {
      expect(getTranscodeFormat(fmt, 'web'), fmt).toBe('mp3')
    }
    for (const fmt of ['mp3', 'flac', 'ogg', 'opus', 'm4a', 'wav']) {
      expect(getTranscodeFormat(fmt, 'web'), fmt).toBeNull()
    }
    expect(getTranscodeFormat('aiff', 'web')).toBe('mp3')
    // The default is still 'web'; callers that forget are no worse off than before.
    expect(getTranscodeFormat('mkv')).toBe('mp3')
  })

  test('libmpv-class targets transcode nothing', () => {
    for (const fmt of ['mkv', 'mka', 'ape', 'wma', 'ogg']) {
      expect(getTranscodeFormat(fmt, 'native'), fmt).toBeNull()
    }
  })

  test('an unknown or missing format is never transcoded', () => {
    expect(getTranscodeFormat(null)).toBeNull()
    expect(getTranscodeFormat('')).toBeNull()
    expect(getTranscodeFormat('not-a-container', 'ios')).toBeNull()
  })
})
