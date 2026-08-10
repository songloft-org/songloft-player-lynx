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
  return result
}

/** Append `media=video` (native player uses this to detect a video source). */
export function appendMediaVideoParam(url: string): string {
  if (!url) return url
  return append(url, 'media=video')
}

export function buildVideoUrl(url: string, ctx: UrlContext = defaultUrlContext()): string {
  const result = buildResourceUrl(url, ctx)
  if (!result) return ''
  return appendMediaVideoParam(result)
}

export function buildVideoHlsUrl(
  songId: number,
  opts: { mediaVideoFlag?: boolean } = {},
  ctx: UrlContext = defaultUrlContext(),
): string {
  const result = buildResourceUrl(`/api/v1/songs/${songId}/video-hls/playlist.m3u8`, ctx)
  if (!result) return ''
  return opts.mediaVideoFlag ? appendMediaVideoParam(result) : result
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
