import { z } from 'zod'

import { makeParsers } from './_shared.js'

/**
 * Fingerprint-related zod schemas and types — ported from the Flutter
 * `FingerprintStatus` / `FingerprintProgress` models in `scan_api.dart`.
 *
 * Follows the repo zod rule (AGENTS.md §2): `z.coerce.number()` + `.catch()`
 * on every field, so one bad field cannot blank the whole page.
 */

/* ───────────────────────── FingerprintStatus ─────────────────────────────── */

export const fingerprintStatusSchema = z
  .object({
    chromaprint_available: z.coerce.boolean().catch(false),
    total: z.coerce.number().catch(0),
    computed: z.coerce.number().catch(0),
    missing: z.coerce.number().catch(0),
    failed: z.coerce.number().catch(0),
    auto_enabled: z.coerce.boolean().catch(false),
  })
  .transform((s) => ({
    chromaprintAvailable: s.chromaprint_available,
    total: s.total,
    computed: s.computed,
    missing: s.missing,
    failed: s.failed,
    autoEnabled: s.auto_enabled,
  }))

export type FingerprintStatus = z.output<typeof fingerprintStatusSchema>

const fingerprintStatusParsers = makeParsers(fingerprintStatusSchema)
export const parseFingerprintStatus = fingerprintStatusParsers.parse
export const safeParseFingerprintStatus = fingerprintStatusParsers.safeParse

/* ───────────────────────── FingerprintProgress ───────────────────────────── */

export const FINGERPRINT_PROGRESS_STATUSES = [
  'idle',
  'running',
  'done',
  'cancelled',
] as const

export type FingerprintProgressStatus = (typeof FINGERPRINT_PROGRESS_STATUSES)[number]

export const fingerprintProgressSchema = z
  .object({
    status: z.enum(FINGERPRINT_PROGRESS_STATUSES).catch('idle'),
    computed: z.coerce.number().catch(0),
    total: z.coerce.number().catch(0),
    failed: z.coerce.number().catch(0),
  })
  .transform((p) => ({
    status: p.status,
    computed: p.computed,
    total: p.total,
    failed: p.failed,
    percent: p.total > 0 ? Math.min(100, Math.floor((p.computed * 100) / p.total)) : 0,
    isRunning: p.status === 'running',
    isFinished: p.status === 'done' || p.status === 'cancelled',
    isIdle: p.status === 'idle',
  }))

export type FingerprintProgress = z.output<typeof fingerprintProgressSchema>

const fingerprintProgressParsers = makeParsers(fingerprintProgressSchema)
export const parseFingerprintProgress = fingerprintProgressParsers.parse
export const safeParseFingerprintProgress = fingerprintProgressParsers.safeParse

/* ───────────────────────── FingerprintComputeRequest ─────────────────────── */

export const fingerprintComputeRequestSchema = z.object({
  recompute_all: z.boolean().optional(),
  retry_failed: z.boolean().optional(),
})

export type FingerprintComputeRequest = z.input<typeof fingerprintComputeRequestSchema>

/* ───────────────────────── FingerprintCancelResponse ─────────────────────── */

export const fingerprintCancelResponseSchema = z
  .object({
    cancelled: z.coerce.boolean().catch(false),
  })
  .transform((r) => ({ cancelled: r.cancelled }))

export type FingerprintCancelResponse = z.output<typeof fingerprintCancelResponseSchema>

const fingerprintCancelParsers = makeParsers(fingerprintCancelResponseSchema)
export const parseFingerprintCancelResponse = fingerprintCancelParsers.parse
