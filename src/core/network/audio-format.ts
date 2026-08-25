/**
 * Audio transcode decision, ported from the Flutter `AudioFormatHelper`.
 *
 * `getTranscodeFormat` returns the container the backend should transcode to
 * (via the `?format=` query), or `null` when the source plays natively on the
 * target platform. Lynx has no compile-time `kIsWeb`/`Platform`, so the target
 * is an explicit `platform` argument (defaults to `'web'`, the most restrictive
 * / deterministic set — the real per-device capability set is a later concern).
 */
export type AudioPlatform = 'web' | 'ios' | 'android' | 'native'

const WEB_FORMATS = new Set(['mp3', 'flac', 'ogg', 'm4a', 'aac', 'wav', 'opus'])
const IOS_FORMATS = new Set(['mp3', 'flac', 'm4a', 'aac', 'wav', 'alac', 'aiff'])
const ANDROID_FORMATS = new Set(['mp3', 'flac', 'ogg', 'm4a', 'aac', 'wav', 'opus'])

const VIDEO_CONTAINERS = new Set([
  'mpg', 'flv', 'wmv', 'rmvb', 'rm', '3gp', 'm4v', 'mkv', 'matroska', 'webm', 'avi', 'ts',
])

export function normalizeFormat(fmt: string): string | null {
  if (fmt.startsWith('id3v')) return 'mp3'
  switch (fmt) {
    case 'mpeg':
    case 'mp3':
      return 'mp3'
    case 'mp4':
    case 'm4a':
    case 'aac':
    case 'm4b':
    case 'mov':
      return 'm4a'
    case 'ogg':
    case 'vorbis':
    case 'oga':
      return 'ogg'
    case 'flac':
      return 'flac'
    case 'wav':
    case 'wave':
      return 'wav'
    case 'wma':
    case 'asf':
      return 'wma'
    case 'ape':
      return 'ape'
    case 'opus':
      return 'opus'
    case 'aif':
    case 'aiff':
      return 'aiff'
    case 'mka':
      return 'mka'
    case 'mpg':
    case 'flv':
    case 'wmv':
    case 'rmvb':
    case 'rm':
    case '3gp':
    case 'm4v':
    case 'mkv':
    case 'matroska':
    case 'webm':
    case 'avi':
    case 'ts':
      return fmt
    default:
      return null
  }
}

function platformFormats(platform: AudioPlatform): Set<string> {
  switch (platform) {
    case 'web':
      return WEB_FORMATS
    case 'ios':
      return IOS_FORMATS
    case 'android':
      return ANDROID_FORMATS
    case 'native':
      return new Set()
  }
}

/**
 * Video/Matroska containers whose **audio track** a device player can be trusted
 * to demux on its own. Deliberately just the MP4 family.
 *
 * The rest of {@link VIDEO_CONTAINERS} plus `mka` keep being transcoded to mp3 on
 * every platform, and that is a decision rather than an oversight:
 *
 * - The container name does not reveal the codec inside it. A `.mka` may hold
 *   FLAC (fine everywhere) or AC-3/DTS (needs a licence many Android devices do
 *   not have) — a container-level allowlist would trade a working stream for an
 *   occasional silent one.
 * - AVFoundation cannot demux Matroska/AVI/FLV/ASF/RealMedia/MPEG-PS at all, and
 *   standalone `.ts` is not supported outside HLS. On iOS those *must* be
 *   transcoded or the song simply will not play.
 * - Nothing is lost for actual video songs: they do not come through here at all.
 *   `player-store` sends them to the video endpoints (`?media=video` or
 *   `/video-hls/`), which serve the original container untouched.
 *
 * Net effect: every URL this function produced before `platform` was threaded
 * through stays byte-identical except audio-only `.m4v`/`.3gp` **on a device**,
 * which now play without a server round-trip. Web is untouched.
 */
const DEMUXABLE_VIDEO_CONTAINERS = new Set(['m4v', '3gp'])

/**
 * The container to request via `?format=`, or `null` for native playback.
 * `native` platforms (libmpv-class players) transcode nothing.
 *
 * ⚠️ `platform` defaults to `'web'`, the most restrictive set. That default used to
 * be what every caller got — `player-store`'s `songUrl()` never passed one — which
 * is how video songs ended up asking the server for `?format=mp3`, i.e. asking it
 * to run `-vn` and throw the picture away. Pass a real platform.
 */
export function getTranscodeFormat(
  songFormat: string | null | undefined,
  platform: AudioPlatform = 'web',
): string | null {
  if (!songFormat) return null
  const fmt = normalizeFormat(songFormat.toLowerCase())
  if (fmt == null) return null
  if (fmt === 'mka' || VIDEO_CONTAINERS.has(fmt)) {
    // Web stays exactly as it was: `<audio>` is the consumer there, and this
    // function is the only thing standing between it and a container it cannot
    // open. No reason to widen that surface in a batch about native video.
    if (platform === 'web') return 'mp3'
    if (platform === 'native' || DEMUXABLE_VIDEO_CONTAINERS.has(fmt)) return null
    return 'mp3'
  }
  const supported = platformFormats(platform)
  if (supported.size === 0) return null
  if (supported.has(fmt)) return null
  return 'mp3'
}
