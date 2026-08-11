/**
 * Presentation helpers for the home library-stats panel. Pure — no i18next, no
 * stores — so they stay unit-testable; the duration pieces are returned as numbers
 * for the caller to localise (same split of concerns as the settings domain's
 * key-returning helpers).
 */

/**
 * Split a duration in **seconds** into whole hours + leftover whole minutes.
 *
 * `library/data/format.ts`'s `formatDuration` is deliberately not reused: it
 * renders `hh:mm:ss`, which reads as a timestamp. A library total wants a coarse
 * "2 h 40 min" — nobody cares about the seconds across 60 tracks.
 */
export function splitDuration(seconds: number): { hours: number; minutes: number } {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  return { hours: Math.floor(total / 3600), minutes: Math.floor((total % 3600) / 60) }
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * Byte count with a binary unit suffix, e.g. `1.4 GB`. The units are left
 * untranslated on purpose — they read the same in both supported locales.
 *
 * Whole units below KB (no "0.4 B"), one decimal above, and the decimal is dropped
 * when it would be `.0`.
 */
export function formatBytes(bytes: number): string {
  const value = Math.max(0, Number.isFinite(bytes) ? bytes : 0)
  let scaled = value
  let unit = 0
  while (scaled >= 1024 && unit < BYTE_UNITS.length - 1) {
    scaled /= 1024
    unit += 1
  }
  const rounded = unit === 0 ? Math.round(scaled) : Math.round(scaled * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${BYTE_UNITS[unit]}`
}
