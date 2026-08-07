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

function normalizeFormat(fmt: string): string | null {
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
 * The container to request via `?format=`, or `null` for native playback.
 * `native` platforms (libmpv-class players) transcode nothing.
 */
export function getTranscodeFormat(
  songFormat: string | null | undefined,
  platform: AudioPlatform = 'web',
): string | null {
  if (!songFormat) return null
  const fmt = normalizeFormat(songFormat.toLowerCase())
  if (fmt == null) return null
  const isWeb = platform === 'web'
  if (fmt === 'mka') return isWeb ? 'mp3' : null
  if (VIDEO_CONTAINERS.has(fmt)) return isWeb ? 'mp3' : null
  const supported = platformFormats(platform)
  if (supported.size === 0) return null
  if (supported.has(fmt)) return null
  return 'mp3'
}
