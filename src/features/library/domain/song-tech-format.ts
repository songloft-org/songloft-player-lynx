/**
 * Technical audio metadata formatters for the song detail view, ported from the
 * Flutter player's `_bitRateLabel` / `_sampleRateLabel`. Pure + unit-tested.
 *
 * Each returns `null` when the value is unknown (≤ 0) so the caller can render
 * its own "—" placeholder, matching how the surrounding rows treat missing data.
 */

/**
 * Bit rate in **kbps**. The backend is inconsistent about units — some sources
 * report bits per second (e.g. `320000`), others kilobits (e.g. `320`) — so any
 * value ≥ 1000 is assumed to be bps and divided down. Returns `null` when ≤ 0.
 */
export function formatBitRate(bitRate: number): string | null {
  if (!Number.isFinite(bitRate) || bitRate <= 0) return null
  const kbps = bitRate >= 1000 ? Math.round(bitRate / 1000) : Math.round(bitRate)
  return `${kbps} kbps`
}

/**
 * Sample rate in **kHz**, one decimal place (`44100` → `44.1 kHz`). Returns
 * `null` when ≤ 0.
 */
export function formatSampleRate(sampleRate: number): string | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return null
  const khz = Math.round((sampleRate / 1000) * 10) / 10
  return `${khz} kHz`
}
