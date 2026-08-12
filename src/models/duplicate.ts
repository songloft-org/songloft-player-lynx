import { z } from 'zod'

import { makeParsers } from './_shared.js'

/**
 * Duplicate-detection models — ported from the Flutter `DuplicateSong` /
 * `DuplicateGroup` / `DuplicatesResult` in `scan_api.dart`.
 */

/* ───────────────────────── DuplicateSong ─────────────────────────────────── */

export const duplicateSongSchema = z
  .object({
    id: z.coerce.number().catch(0),
    title: z.string().catch(''),
    artist: z.string().catch(''),
    album: z.string().catch(''),
    duration: z.coerce.number().catch(0),
    file_path: z.string().catch(''),
    format: z.string().catch(''),
    bit_rate: z.coerce.number().catch(0),
    file_size: z.coerce.number().catch(0),
    cover_url: z.string().nullish().catch(undefined),
    added_at: z.string().nullish().catch(undefined),
  })
  .transform((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    album: s.album,
    duration: s.duration,
    filePath: s.file_path,
    format: s.format,
    bitRate: s.bit_rate,
    fileSize: s.file_size,
    coverUrl: s.cover_url ?? undefined,
    addedAt: s.added_at ?? undefined,
    /** Human-readable file size. */
    fileSizeDisplay: formatFileSize(s.file_size),
  }))

export type DuplicateSong = z.output<typeof duplicateSongSchema>

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/* ───────────────────────── DuplicateGroup ────────────────────────────────── */

export const duplicateGroupSchema = z
  .object({
    fingerprint: z.string().catch(''),
    songs: z.array(duplicateSongSchema).catch([]),
  })
  .transform((g) => ({
    fingerprint: g.fingerprint,
    songs: g.songs,
  }))

export type DuplicateGroup = z.output<typeof duplicateGroupSchema>

/* ───────────────────────── DuplicatesResult ──────────────────────────────── */

export const duplicatesResultSchema = z
  .object({
    groups: z.array(duplicateGroupSchema).catch([]),
    total_groups: z.coerce.number().catch(0),
    total_duplicates: z.coerce.number().catch(0),
  })
  .transform((r) => ({
    groups: r.groups,
    totalGroups: r.total_groups,
    totalDuplicates: r.total_duplicates,
  }))

export type DuplicatesResult = z.output<typeof duplicatesResultSchema>

const duplicatesResultParsers = makeParsers(duplicatesResultSchema)
export const parseDuplicatesResult = duplicatesResultParsers.parse
export const safeParseDuplicatesResult = duplicatesResultParsers.safeParse

/* ───────────────────────── BatchDeleteRequest ────────────────────────────── */

export const batchDeleteRequestSchema = z.object({
  ids: z.array(z.number()),
  delete_files: z.boolean(),
})

export type BatchDeleteRequest = z.input<typeof batchDeleteRequestSchema>

/* ───────────────────────── BatchDeleteResponse ───────────────────────────── */

export const batchDeleteResponseSchema = z
  .object({
    deleted: z.coerce.number().catch(0),
  })
  .transform((r) => ({ deleted: r.deleted }))

export type BatchDeleteResponse = z.output<typeof batchDeleteResponseSchema>

const batchDeleteParsers = makeParsers(batchDeleteResponseSchema)
export const parseBatchDeleteResponse = batchDeleteParsers.parse
export const safeParseBatchDeleteResponse = batchDeleteParsers.safeParse
