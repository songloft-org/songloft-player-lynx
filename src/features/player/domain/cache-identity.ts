import { getTranscodeFormat, normalizeFormat, type AudioPlatform } from '../../../core/network/audio-format.js'
import { buildSongUrl, type UrlContext } from '../../../core/network/url-helper.js'
import type { AudioTrackInfo } from '../../../models/audio-track.js'
import type { Song } from '../../../models/song.js'

export interface CacheScope { profile: string | null; server: string; username: string }
export interface CacheVariant { track: number | null; quality: 'original' | '320' | '192' | '128'; normalize: boolean }
export interface CacheSnapshot {
  id: number
  type: 'local' | 'remote'
  title: string
  artist: string
  album: string
  duration: number
  isVideo: boolean
  format: string
  updatedAt: string
}
export interface CacheIdentity { namespace: string; key: string }
export interface CacheDownload extends CacheIdentity { task_id: string; url: string; max_bytes: number; snapshot: CacheSnapshot }

/** Preserve path case while normalizing the origin. No credentials, query, fragment or token can enter the index. */
export function normalizeCacheServer(raw: string): string {
  const match = /^(https?):\/\/([^/?#@\s\\]+)(\/[^?#\s\\]*)?$/i.exec(raw.trim())
  if (!match) throw new Error('invalid_cache_identity')
  const scheme = match[1].toLowerCase()
  const authority = match[2].toLowerCase().replace(scheme === 'http' ? /:80$/ : /:443$/, '')
  return `${scheme}://${authority}${(match[3] ?? '').replace(/\/+$/, '')}`
}
export function cacheNamespace(scope: CacheScope): string {
  if (!scope.username || scope.username.length > 256 || (scope.profile ?? 'default').length > 128) throw new Error('invalid_cache_identity')
  return JSON.stringify([scope.profile ?? 'default', normalizeCacheServer(scope.server), scope.username])
}
export function cacheIdentity(input: { namespace: string; song: Song; variant: CacheVariant; format: string }): CacheIdentity {
  const { namespace, song, variant, format } = input
  if (!Number.isSafeInteger(song.id) || song.id <= 0 || song.type === 'radio' || song.isLive ||
    variant.track !== null && (!Number.isSafeInteger(variant.track) || variant.track < 0 || variant.track > 999999) ||
    !/^[a-z0-9]{1,12}$/.test(format)) throw new Error('invalid_cache_identity')
  return { namespace, key: JSON.stringify([namespace, String(song.id), variant.track === null ? 'default' : String(variant.track),
    variant.quality, variant.normalize ? '1' : '0', song.updatedAt || 'unknown', format]) }
}
export function cacheSnapshot(song: Song): CacheSnapshot {
  if (song.type === 'radio' || song.isLive) throw new Error('unsupported_media')
  return { id: song.id, type: song.type, title: song.title, artist: song.artist ?? '', album: song.album ?? '',
    duration: song.duration, isVideo: song.isVideo, format: song.format ?? '', updatedAt: song.updatedAt }
}
/** Backend track extraction overrides quality/format: AAC -> M4A, every other codec -> MP3. */
export function plannedCacheFormat(input: { song: Song; variant: CacheVariant; platform: AudioPlatform; tracks?: AudioTrackInfo[] }): string {
  const { song, variant, platform, tracks } = input
  if (variant.track !== null) {
    const track = tracks?.find(value => value.index === variant.track)
    if (!track) throw new Error('track_metadata_unavailable')
    return track.codec.toLowerCase() === 'aac' ? 'm4a' : 'mp3'
  }
  return getTranscodeFormat(song.format ?? null, platform) ??
    (variant.quality !== 'original' || variant.normalize ? 'mp3' : normalizeFormat((song.format ?? '').toLowerCase()) ?? 'mp3')
}
export function freezeCacheDownload(input: {
  scope: CacheScope; song: Song; variant: CacheVariant; platform: AudioPlatform; context: UrlContext;
  taskId: string; maxBytes: number; tracks?: AudioTrackInfo[]
}): CacheDownload {
  const { song, variant } = input
  const namespace = cacheNamespace(input.scope)
  const format = plannedCacheFormat(input)
  const identity = cacheIdentity({ namespace, song, variant, format })
  let url = buildSongUrl(song.url ?? '', { songFormat: song.format, audioTrack: variant.track,
    quality: variant.quality, normalize: variant.normalize, platform: input.platform }, input.context)
  // Freeze an explicit normalization value; a later server default cannot silently change this variant.
  if (!variant.normalize) url += `${url.includes('?') ? '&' : '?'}normalize=0`
  if (!/^https?:\/\//.test(url) || !Number.isSafeInteger(input.maxBytes) || input.maxBytes <= 0) throw new Error('invalid_cache_request')
  return { ...identity, task_id: input.taskId, url, max_bytes: input.maxBytes, snapshot: cacheSnapshot(song) }
}
