/**
 * LRC lyric parsing, ported from the Flutter `LyricParser` (the plain-LRC path;
 * word-by-word / translation merging are deferred to a later batch). Pure +
 * unit-tested. Times are stored as **milliseconds** (the Lynx player works in
 * ms), unlike the Dart `Duration`.
 */

export interface LyricLine {
  /** Absolute line time in milliseconds. */
  timeMs: number
  text: string
}

/** `[mm:ss]` or `[mm:ss.xx]` / `[mm:ss.xxx]` time tags. */
const TIME_TAG = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g

function toMs(min: string, sec: string, frac: string | undefined): number {
  const ms = frac == null ? 0 : Number(frac.padEnd(3, '0'))
  return Number(min) * 60_000 + Number(sec) * 1_000 + ms
}

/**
 * Parse standard LRC. Supports multiple time tags per line
 * (`[00:01.00][00:02.00]text`) — each becomes its own line. Lines without a
 * time tag are skipped. Output is sorted ascending by time.
 */
export function parseLrc(content: string): LyricLine[] {
  const out: LyricLine[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line.length === 0) continue

    TIME_TAG.lastIndex = 0
    const matches = [...line.matchAll(TIME_TAG)]
    if (matches.length === 0) continue

    // Text is whatever follows the last time tag on the line.
    const last = matches[matches.length - 1]
    const text = line.slice((last.index ?? 0) + last[0].length).trim()

    for (const m of matches) {
      out.push({ timeMs: toMs(m[1], m[2], m[3]), text })
    }
  }
  out.sort((a, b) => a.timeMs - b.timeMs)
  return out
}

/**
 * Fallback for timestamp-less lyrics: split non-empty lines into static
 * `timeMs: 0` entries (no highlight / auto-scroll). Mirrors `parsePlain`.
 */
export function parsePlain(content: string): LyricLine[] {
  const out: LyricLine[] = []
  for (const raw of content.split('\n')) {
    const t = raw.trim()
    if (t.length === 0) continue
    out.push({ timeMs: 0, text: t })
  }
  return out
}

/**
 * Index of the line that should be highlighted at `positionMs` — the last line
 * whose time is `<= positionMs` (binary search). Returns `-1` before the first
 * line or when there are none. Mirrors `LyricParser.findCurrentLine`.
 */
export function findCurrentLine(lines: readonly LyricLine[], positionMs: number): number {
  if (lines.length === 0) return -1
  if (positionMs < lines[0].timeMs) return -1

  let left = 0
  let right = lines.length - 1
  let result = 0
  while (left <= right) {
    const mid = (left + right) >> 1
    if (lines[mid].timeMs <= positionMs) {
      result = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }
  return result
}
