import { z } from 'zod'

import { makeParsers } from './_shared.js'

/**
 * Library-ops models (batch 19): scan progress, metadata-refresh progress,
 * auto-scan setting and the scan directory listing. Ported from the Flutter
 * `ScanApi`/`DirectoryApi`/`SettingsApi` payload classes.
 *
 * The Flutter versions only tolerate "missing / null" (`json['x'] as int? ?? 0`)
 * and would `TypeError` on a stringified or float int. We follow the repo's zod
 * rule instead (AGENTS.md §2): `z.coerce.number()` + `.catch()` on every field,
 * because `.default()` does not cover `null` and one bad field otherwise blanks
 * the whole page.
 *
 * Two deliberate divergences from the Flutter reference, both fixing real bugs
 * there (see the batch-19 plan):
 *
 * 1. **`percent` is always a 0-100 integer.** Flutter has two conventions —
 *    `ScanProgress.progress` is 0-100 `int` but `MetadataRefreshProgress.progress`
 *    is a 0.0-1.0 `double` — which makes the two progress bars non-interchangeable.
 * 2. **No `'error'` status.** Flutter's `startScan` failure path writes
 *    `status: 'error'` while its `isError` getter tests for `'failed'`, so that
 *    value matches no branch and the scan area renders blank. Start failures are
 *    represented outside the model (see `deriveScanView`'s `startError` arg).
 */

/** Backend scan lifecycle. `cancelling` is still an in-flight state. */
export const SCAN_STATUSES = [
  'idle',
  'scanning',
  'importing',
  'splitting_cue',
  'creating_playlists',
  'completed',
  'failed',
  'cancelling',
  'cancelled',
] as const

export type ScanStatus = (typeof SCAN_STATUSES)[number]

/** Statuses during which the server is still working (mirrors `isScanning`). */
const ACTIVE_SCAN_STATUSES: readonly ScanStatus[] = [
  'scanning',
  'importing',
  'splitting_cue',
  'creating_playlists',
  'cancelling',
]

/** Integer percentage, clamped to 0-100. `total <= 0` yields 0 (not NaN). */
function percentOf(done: number, total: number): number {
  if (total <= 0) return 0
  const pct = Math.floor((done * 100) / total)
  return pct < 0 ? 0 : pct > 100 ? 100 : pct
}

/**
 * Tolerant boolean with an explicit fallback.
 *
 * `z.coerce.boolean()` is **wrong** for wire data: it applies JS `Boolean()`, so
 * the string `"false"` becomes `true` — worse than the Flutter reference, which
 * at least only accepted real booleans. This accepts real booleans, `0`/`1` and
 * the usual string spellings, and falls back for anything else. The fallback is
 * a parameter because the backend defaults differ per endpoint (e.g.
 * `scan-auto-create-playlists` defaults to **true**).
 */
function tolerantBoolean(fallback: boolean) {
  // `.optional()` is required: in zod v4 a bare `z.unknown()` inside an object
  // is NOT optional, so a missing key throws `invalid_type`. Inside
  // `dirEntrySchema` that throw was being swallowed by the enclosing
  // `z.array(...).catch([])`, silently emptying the whole directory listing.
  return z.unknown().optional().transform((v) => {
    if (typeof v === 'boolean') return v
    if (typeof v === 'number') return v !== 0
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase()
      if (s === 'true' || s === '1') return true
      if (s === 'false' || s === '0') return false
    }
    return fallback
  })
}

/** Shared tolerant-boolean parser for a standalone `{ enabled: bool }` payload. */
export function parseEnabledFlag(data: unknown, fallback: boolean): boolean {
  const body = (data ?? {}) as { enabled?: unknown }
  return tolerantBoolean(fallback).parse(body.enabled)
}

export const scanProgressSchema = z
  .object({
    status: z.enum(SCAN_STATUSES).catch('idle'),
    current_file: z.string().nullish().catch(undefined),
    // Backend-supplied failure reason (swagger: "错误信息"). Surfaced verbatim in
    // the failed state — otherwise a failed scan gives the user nothing to act on.
    error: z.string().nullish().catch(undefined),
    discovered_files: z.coerce.number().catch(0),
    total_files: z.coerce.number().catch(0),
    scanned_files: z.coerce.number().catch(0),
    imported_files: z.coerce.number().catch(0),
    skipped_files: z.coerce.number().catch(0),
    failed_files: z.coerce.number().catch(0),
    cue_split_sources: z.coerce.number().catch(0),
    local_song_count: z.coerce.number().catch(0),
  })
  .transform((s) => ({
    status: s.status,
    currentFile: s.current_file ?? undefined,
    errorMessage: s.error && s.error.length > 0 ? s.error : undefined,
    discoveredFiles: s.discovered_files,
    totalFiles: s.total_files,
    scannedFiles: s.scanned_files,
    importedFiles: s.imported_files,
    skippedFiles: s.skipped_files,
    failedFiles: s.failed_files,
    cueSplitSources: s.cue_split_sources,
    localSongCount: s.local_song_count,
    percent: percentOf(s.scanned_files, s.total_files),
    isScanning: ACTIVE_SCAN_STATUSES.includes(s.status),
    isCompleted: s.status === 'completed',
    isCancelled: s.status === 'cancelled',
    isFailed: s.status === 'failed',
    isIdle: s.status === 'idle',
    isTerminal:
      s.status === 'completed' || s.status === 'cancelled' || s.status === 'failed',
  }))

export type ScanProgress = z.output<typeof scanProgressSchema>

const scanProgressParsers = makeParsers(scanProgressSchema)
export const parseScanProgress = scanProgressParsers.parse
export const safeParseScanProgress = scanProgressParsers.safeParse

/** Metadata-refresh lifecycle (`GET /songs/refresh-metadata/progress`). */
export const METADATA_STATUSES = [
  'idle',
  'running',
  'cancelling',
  'done',
  'cancelled',
  'failed',
] as const

export type MetadataStatus = (typeof METADATA_STATUSES)[number]

export const metadataProgressSchema = z
  .object({
    status: z.enum(METADATA_STATUSES).catch('idle'),
    total: z.coerce.number().catch(0),
    processed: z.coerce.number().catch(0),
    failed: z.coerce.number().catch(0),
  })
  .transform((m) => {
    const completedCount = m.processed + m.failed
    return {
      status: m.status,
      total: m.total,
      processed: m.processed,
      failed: m.failed,
      completedCount,
      // 0-100 int — unified with ScanProgress (Flutter used 0.0-1.0 here).
      percent: percentOf(completedCount, m.total),
      isRunning: m.status === 'running' || m.status === 'cancelling',
      isDone:
        m.status === 'done' || m.status === 'cancelled' || m.status === 'failed',
      isIdle: m.status === 'idle',
    }
  })

export type MetadataProgress = z.output<typeof metadataProgressSchema>

const metadataProgressParsers = makeParsers(metadataProgressSchema)
export const parseMetadataProgress = metadataProgressParsers.parse
export const safeParseMetadataProgress = metadataProgressParsers.safeParse

/** `GET/PUT /settings/auto-scan`. Interval default mirrors Flutter's 3600s. */
export const autoScanSettingSchema = z
  .object({
    enabled: tolerantBoolean(false),
    interval_seconds: z.coerce.number().catch(3600),
  })
  .transform((a) => ({
    enabled: a.enabled,
    intervalSeconds: a.interval_seconds > 0 ? a.interval_seconds : 3600,
  }))

export type AutoScanSetting = z.output<typeof autoScanSettingSchema>

const autoScanParsers = makeParsers(autoScanSettingSchema)
export const parseAutoScanSetting = autoScanParsers.parse
export const safeParseAutoScanSetting = autoScanParsers.safeParse

/**
 * One directory entry from `GET /scan/directories`. Flutter reads `name`/`path`
 * as non-nullable `as String` and throws when the backend omits them; we fall
 * back to `''` so a single malformed entry cannot break the whole tree.
 */
export const dirEntrySchema = z
  .object({
    name: z.string().catch(''),
    path: z.string().catch(''),
    has_children: tolerantBoolean(false),
  })
  .transform((d) => ({
    name: d.name,
    path: d.path,
    hasChildren: d.has_children,
  }))

export type DirEntry = z.output<typeof dirEntrySchema>

export const directoryListSchema = z
  .object({
    directories: z.array(dirEntrySchema).catch([]),
    root: z.string().catch(''),
  })
  .transform((r) => ({
    // Entries with no usable path cannot be selected or expanded — drop them.
    directories: r.directories.filter((d) => d.path.length > 0),
    root: r.root,
  }))

export type DirectoryList = z.output<typeof directoryListSchema>

const directoryListParsers = makeParsers(directoryListSchema)
export const parseDirectoryList = directoryListParsers.parse
export const safeParseDirectoryList = directoryListParsers.safeParse
