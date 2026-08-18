import { z } from 'zod'

import { makeParsers } from '../../../models/_shared.js'

/**
 * Cache management models (Zod schemas + TypeScript types). Ported from the
 * backend swagger for `GET/PUT /api/v1/cache-manage/*` endpoints.
 *
 * Follows the repo zod rule (AGENTS.md §2): `z.coerce.number()` + `.catch()`
 * on every field so one bad field cannot blank the page.
 */

// ---------------------------------------------------------------------------
// Cache Stats — GET /api/v1/cache-manage/stats
// ---------------------------------------------------------------------------

export const cacheStatsSchema = z
  .object({
    file_count: z.coerce.number().catch(0),
    max_size: z.coerce.number().catch(0),
    total_size: z.coerce.number().catch(0),
  })
  .transform((s) => ({
    fileCount: s.file_count,
    maxSize: s.max_size, // 0 = unlimited
    totalSize: s.total_size,
  }))

export type CacheStats = z.output<typeof cacheStatsSchema>

const cacheStatsParsers = makeParsers(cacheStatsSchema)
export const parseCacheStats = cacheStatsParsers.parse
export const safeParseCacheStats = cacheStatsParsers.safeParse

// ---------------------------------------------------------------------------
// Cache Config — GET /api/v1/cache-manage/config
// ---------------------------------------------------------------------------

export const cacheConfigSchema = z
  .object({
    cache_dir: z.string().catch(''),
    default_cache_dir: z.string().catch(''),
    max_size: z.coerce.number().catch(0),
    transcode_format: z.string().catch(''),
    transcode_quality: z.string().catch(''),
  })
  .transform((c) => ({
    cacheDir: c.cache_dir,
    defaultCacheDir: c.default_cache_dir,
    maxSize: c.max_size,
    transcodeFormat: c.transcode_format,
    transcodeQuality: c.transcode_quality,
  }))

export type CacheConfig = z.output<typeof cacheConfigSchema>

const cacheConfigParsers = makeParsers(cacheConfigSchema)
export const parseCacheConfig = cacheConfigParsers.parse

// ---------------------------------------------------------------------------
// Update Cache Config — PUT /api/v1/cache-manage/config (request body)
// ---------------------------------------------------------------------------

export interface CacheConfigUpdate {
  cache_dir: string
  max_size: number
  transcode_format: string
  transcode_quality: string
}

// ---------------------------------------------------------------------------
// Clean Cache Response — POST /api/v1/cache-manage/clean
// ---------------------------------------------------------------------------

export const cleanCacheResponseSchema = z
  .object({
    message: z.string().optional().catch(undefined),
  })
  .transform((r) => ({
    message: r.message,
  }))

export type CleanCacheResponse = z.output<typeof cleanCacheResponseSchema>

const cleanCacheResponseParsers = makeParsers(cleanCacheResponseSchema)
export const parseCleanCacheResponse = cleanCacheResponseParsers.parse

// ---------------------------------------------------------------------------
// Validate Directory — POST /api/v1/cache-manage/validate-dir
// ---------------------------------------------------------------------------

export interface DirValidateRequest {
  path: string
}

export const dirValidateResponseSchema = z
  .object({
    created: z.boolean().catch(false),
    error: z.string().catch(''),
    free_size: z.coerce.number().catch(0),
    total_size: z.coerce.number().catch(0),
    valid: z.boolean().catch(false),
  })
  .transform((r) => ({
    created: r.created,
    error: r.error,
    freeSize: r.free_size,
    totalSize: r.total_size,
    valid: r.valid,
  }))

export type DirValidateResponse = z.output<typeof dirValidateResponseSchema>

const dirValidateResponseParsers = makeParsers(dirValidateResponseSchema)
export const parseDirValidateResponse = dirValidateResponseParsers.parse

// ---------------------------------------------------------------------------
// Transcode format options
// ---------------------------------------------------------------------------

export const TRANSCODE_FORMATS = ['', 'mp3', 'm4a', 'ogg', 'flac', 'wav'] as const

export const TRANSCODE_QUALITIES = ['128', '192', '320'] as const
