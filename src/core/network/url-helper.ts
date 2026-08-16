import { appConfig } from '../config/app-config.js'
import { getTranscodeFormat, type AudioPlatform } from './audio-format.js'
import { getCachedAccessToken } from './token-cache.js'

/**
 * Resource-URL builder, ported from the Flutter `UrlHelper`.
 *
 * Relative paths (`/api/v1/...`) get `resolvedBaseUrl` + `basePath` prepended
 * and an `access_token` query appended; absolute `http(s)://` URLs pass through
 * untouched. All functions accept an explicit `UrlContext` (last arg) so they
 * are pure and unit-testable; the default reads live `appConfig` + the sync
 * token cache.
 */
export interface UrlContext {
  resolvedBaseUrl: string
  basePath: string
  accessToken: string
}

export function defaultUrlContext(): UrlContext {
  return {
    resolvedBaseUrl: appConfig.resolvedBaseUrl,
    basePath: appConfig.basePath,
    accessToken: getCachedAccessToken() ?? '',
  }
}

function append(url: string, param: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${param}`
}

export function buildResourceUrl(url: string, ctx: UrlContext = defaultUrlContext()): string {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return append(
    `${ctx.resolvedBaseUrl}${ctx.basePath}${url}`,
    `access_token=${ctx.accessToken}`,
  )
}

export interface SongUrlOptions {
  songFormat?: string | null
  quality?: string | null
  hlsDirect?: boolean
  audioTrack?: number | null
  platform?: AudioPlatform
  normalize?: boolean
}

export function buildSongUrl(
  url: string,
  opts: SongUrlOptions = {},
  ctx: UrlContext = defaultUrlContext(),
): string {
  let result = buildResourceUrl(url, ctx)
  if (!result) return ''
  const { songFormat, quality, hlsDirect = false, audioTrack, platform } = opts
  if (audioTrack != null && audioTrack >= 0) {
    result = append(result, `track=${audioTrack}`)
  } else {
    const transcode = getTranscodeFormat(songFormat, platform)
    if (transcode != null) result = append(result, `format=${transcode}`)
  }
  if (quality && quality !== 'original') result = append(result, `quality=${quality}`)
  if (hlsDirect) result = append(result, 'hls=direct')
  if (opts.normalize) result = append(result, 'normalize=1')
  return result
}

/** Append `media=video` (native player uses this to detect a video source). */
export function appendMediaVideoParam(url: string): string {
  if (!url) return url
  return append(url, 'media=video')
}

/**
 * The song's own stream with the picture kept.
 *
 * `media=video` makes the server hand over the **original container** and ignore
 * `format`/`quality`/`normalize` — all three imply `-vn` on the server side, which
 * would strip the video track. So this URL deliberately carries none of them, and
 * volume normalisation cannot apply while watching: the backend cannot do both.
 */
export function buildVideoUrl(url: string, ctx: UrlContext = defaultUrlContext()): string {
  const result = buildResourceUrl(url, ctx)
  if (!result) return ''
  return appendMediaVideoParam(result)
}

/**
 * Master playlist for the server-side H.264+AAC transcode of a video song.
 *
 * Note what is **not** here: `media=video`. That parameter belongs to
 * `/songs/{id}/play` and means "serve the original container"; this endpoint takes
 * only the song id (`docs/swagger.json`). It used to accept a `mediaVideoFlag`
 * option that appended it anyway — a knob wired to nothing, kept alive by its own
 * unit test.
 *
 * The result carries a query string (`?access_token=…`), so anything sniffing for a
 * `.m3u8` **suffix on the whole URL** will miss it. Callers pass `hls: true` to the
 * audio facade instead of relying on the extension.
 */
export function buildVideoHlsUrl(
  songId: number,
  ctx: UrlContext = defaultUrlContext(),
): string {
  return buildResourceUrl(`/api/v1/songs/${songId}/video-hls/playlist.m3u8`, ctx)
}

export function buildCoverUrl(
  coverUrl: string,
  updatedAt?: string,
  ctx: UrlContext = defaultUrlContext(),
): string {
  let result = buildResourceUrl(coverUrl, ctx)
  if (!result) return ''
  if (updatedAt) {
    const ms = Date.parse(updatedAt)
    if (!Number.isNaN(ms)) result = append(result, `_t=${ms}`)
  }
  return result
}

export function buildLyricUrl(lyricUrl: string, ctx: UrlContext = defaultUrlContext()): string {
  return buildResourceUrl(lyricUrl, ctx)
}
