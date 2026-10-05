import type { Song } from '../../../models/song.js'
import { getTranscodeFormat, normalizeFormat } from '../../../core/network/audio-format.js'
import { buildSongUrl, buildVideoUrl, type UrlContext } from '../../../core/network/url-helper.js'
import { getPlatformTarget } from '../../../native/platform-target.js'

const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg',
  m4a: 'audio/mp4', alac: 'audio/mp4', wav: 'audio/wav', aiff: 'audio/aiff', amr: 'audio/amr',
}
const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
  webm: 'video/webm', avi: 'video/x-msvideo', mpg: 'video/mpeg', mpeg: 'video/mpeg',
  ts: 'video/mp2t', '3gp': 'video/3gpp', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
}

/** The MIME describes the resource requested from the backend, including transcodes. */
export function dlnaMedia(song: Song, context?: UrlContext): { url: string; mimeType?: string } {
  const source = song.format?.toLowerCase() ?? ''
  if (song.isVideo) {
    const container = song.filePath?.split('.').pop()?.toLowerCase() ?? source
    return { url: buildVideoUrl(song.url ?? '', context), mimeType: VIDEO_MIME[container] }
  }
  const platform = getPlatformTarget()
  const format = getTranscodeFormat(source, platform) ?? normalizeFormat(source) ?? source
  return {
    url: buildSongUrl(song.url ?? '', { songFormat: source, platform }, context),
    mimeType: AUDIO_MIME[format],
  }
}
