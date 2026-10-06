export interface CacheIdentity { namespace: string; key: string }
export interface CacheSnapshot {
  id: number
  type: string
  title: string
  artist: string
  album: string
  duration: number
  isVideo: boolean
  format: string
  updatedAt: string
}
export interface CacheRequest extends CacheIdentity {
  task_id: string
  snapshot: CacheSnapshot
  url: string
  max_bytes: number
}
export interface CacheEntry extends CacheIdentity {
  snapshot: CacheSnapshot
  sizeBytes: number
  createdAt: number
}
export interface PlayableCacheEntry extends CacheEntry { cached: boolean; url: string }
export interface CacheLookup { namespace: string; key?: string; song_id?: number; offset?: number; limit?: number }
export interface CacheTask extends CacheIdentity {
  task_id: string
  status: string
  bytes: number
  total: number
  error: string | null
}
export interface CachePage { entries: PlayableCacheEntry[]; total: number; bytes: number; legacy_bytes: number }
export interface CacheError { error: string }
export interface CacheMissing { cached: boolean }
export interface CacheSize { bytes: number }
export interface CacheHistory { tasks: CacheTask[] }
export interface CacheContract { version: number }
export interface CacheLegacyFile { cached: boolean; url: string; sizeBytes: number }
export interface CacheDone { success: boolean }
