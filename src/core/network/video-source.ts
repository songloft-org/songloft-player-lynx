/**
 * Where the picture comes from for a song with a video track.
 *
 * The backend offers two shapes and they are not interchangeable:
 *
 * - `?media=video` serves the **original container** untouched, ignoring
 *   `format`/`quality`/`normalize` (those imply `-vn`, which would drop the video).
 *   Instant, but the device has to demux and decode whatever is inside.
 * - `/video-hls/playlist.m3u8` **re-encodes** to H.264+AAC HLS. Plays anywhere, but
 *   the first request blocks until the whole transcode finishes and needs ffmpeg
 *   (503 when it is missing).
 *
 * So the choice is per platform and per container, and it is deliberately made from
 * the **raw** `song.format` rather than the audio pipeline's normalised value:
 * `normalizeFormat` collapses `mp4`/`mov`/`m4b` into `'m4a'`, which is right for
 * "which codec does the audio path want" and actively misleading here.
 */

import type { Song } from '../../models/song.js'

export type VideoSourceKind = 'none' | 'direct' | 'hls'

/**
 * Containers AVFoundation can open by itself: the MP4/QuickTime family, and nothing
 * else. It cannot demux Matroska, WebM, AVI, FLV, ASF or RealMedia at all, and a
 * standalone `.ts` is only supported as part of an HLS playlist.
 *
 * **`'m4a'` belongs here, and that is not a copy-paste slip.** `songs.format` is what
 * the server's tag library calls the container, and it reports the whole MP4 family
 * as `m4a` — measured 2026-08-16 by scanning an H.264+AAC `.mp4`, which came back
 * `format: 'm4a', is_video: true`. The other containers keep their own names
 * (`mkv` / `avi` / `webm`, all measured the same way). An audio-only `m4a` never
 * reaches this function: `isVideo` gates it.
 */
const IOS_DIRECT = new Set(['m4a', 'mp4', 'm4v', 'mov', 'qt', '3gp', '3g2'])

/**
 * Containers ExoPlayer's `DefaultExtractorsFactory` handles *and* whose usual video
 * codecs are required by the Android CDD (H.264/HEVC/VP8/VP9).
 *
 * `avi`, `flv` and `mpg` are left out even though media3 has extractors for them:
 * what is inside is typically MPEG-2, Xvid or Sorenson, none of which a device is
 * obliged to decode. A container-level allowlist would trade a working stream for
 * an occasional silent black rectangle, which is the harder bug to report.
 */
const ANDROID_DIRECT = new Set([
  'm4a', 'mp4', 'm4v', 'mov', 'qt', '3gp', '3g2', 'mkv', 'matroska', 'webm', 'ts',
])

/**
 * Containers a browser `<video>` element can open directly: the MP4 family plus
 * WebM. Matroska stays out — no browser ships an MKV demuxer in `<video>` — and
 * `.ts` belongs to HLS only.
 */
const WEB_DIRECT = new Set(['m4a', 'mp4', 'm4v', 'mov', 'qt', '3gp', '3g2', 'webm'])

/**
 * How to get a picture for `song` on `platform`.
 *
 * `'none'` means do not offer video at all: not a video song, or a live stream (the
 * `/video-hls` endpoints work off a file, and a radio stream has none). Web answers
 * the same direct/HLS question as the devices now that its host registers a
 * `SongloftVideo` surface — see `platform-capabilities.ts`.
 *
 * An **unknown container** (`format: ''`, which is every remote song until its
 * metadata is refreshed) resolves to `'direct'`. Guessing `'hls'` there would force
 * a server-side transcode on files that are usually plain MP4, and the failure mode
 * of guessing wrong the other way is visible and recoverable.
 */
export function resolveVideoSourceKind(
  song: Pick<Song, 'isVideo' | 'isLive' | 'type' | 'format'>,
  platform: 'web' | 'ios' | 'android' | 'harmony',
): VideoSourceKind {
  if (!song.isVideo) return 'none'
  if (song.isLive || song.type === 'radio') return 'none'
  const format = (song.format ?? '').toLowerCase()
  if (!format) return 'direct'
  if (platform === 'web') return WEB_DIRECT.has(format) ? 'direct' : 'hls'
  const direct = platform === 'ios' ? IOS_DIRECT : ANDROID_DIRECT
  return direct.has(format) ? 'direct' : 'hls'
}
