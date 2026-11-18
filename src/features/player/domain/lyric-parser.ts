export interface LyricWord {
  text: string
  startMs: number
  endMs: number
}

export interface LyricLine {
  timeMs: number
  text: string
  words?: LyricWord[]
}

const TIME_TAG = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g

function toMs(min: string, sec: string, frac: string | undefined): number {
  const ms = frac == null ? 0 : Number(frac.padEnd(3, '0'))
  return Number(min) * 60_000 + Number(sec) * 1_000 + ms
}

export function parseLrc(content: string): LyricLine[] {
  const out: LyricLine[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line.length === 0) continue

    TIME_TAG.lastIndex = 0
    const matches = [...line.matchAll(TIME_TAG)]
    if (matches.length === 0) continue

    const last = matches[matches.length - 1]
    const text = line.slice((last.index ?? 0) + last[0].length).trim()

    for (const m of matches) {
      out.push({ timeMs: toMs(m[1], m[2], m[3]), text })
    }
  }
  out.sort((a, b) => a.timeMs - b.timeMs)
  return out
}

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
 * Re-assemble parsed lines into LRC text (`[mm:ss.mmm]text`, one per line) —
 * the inverse of `parseLrc` used by the lyric timing adjust page. Lines are
 * sorted by time and negative timestamps clamp to 0 (matches the Flutter
 * build's `LyricParser.stringify`, which the saved lyric must stay compatible
 * with). Word-level timing is dropped on purpose: the adjust page edits plain
 * line timestamps only.
 */
export function stringifyLyric(lines: readonly LyricLine[]): string {
  if (lines.length === 0) return ''
  const sorted = [...lines].sort((a, b) => a.timeMs - b.timeMs)
  let out = ''
  for (const line of sorted) {
    const totalMs = Math.max(0, line.timeMs)
    const minutes = String(Math.floor(totalMs / 60_000)).padStart(2, '0')
    const seconds = String(Math.floor(totalMs / 1_000) % 60).padStart(2, '0')
    const ms = String(totalMs % 1_000).padStart(3, '0')
    out += `[${minutes}:${seconds}.${ms}]${line.text}\n`
  }
  return out
}

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

const LEADING_TIMES = /^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](?:[ \t]*\[\d{1,2}:\d{2}(?:\.\d{1,3})?\])*/
const RELATIVE_WORD = /<(\d+),(\d+)>([^<]*)/g
const DOUBLE_BRACKET_WORD = /\[\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\]/g
const ANGLE_WORD = /<(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?>/g

export function parseEnhancedLrc(content: string): LyricLine[] {
  const out: LyricLine[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line.length === 0) continue

    const lineTag = LEADING_TIMES.exec(line)
    const lineTimeMs = lineTag ? toMs(lineTag[1], lineTag[2], lineTag[3]) : undefined
    const body = line.slice(lineTag?.[0].length ?? 0)
    const words = parseWords(line, body, lineTimeMs)
    if (words.length > 0) {
      out.push({
        timeMs: lineTimeMs ?? words[0].startMs,
        text: words.map((word) => word.text).join('').trim(),
        words,
      })
    } else {
      out.push(...parseLrc(line))
    }
  }
  out.sort((a, b) => a.timeMs - b.timeMs)
  return out
}

function parseWords(line: string, body: string, lineTimeMs?: number): LyricWord[] {
  const relative = [...body.matchAll(RELATIVE_WORD)]
  if (relative.length > 0) {
    const words: LyricWord[] = []
    for (const [, rawOffset, rawDuration, text] of relative) {
      const offset = Number(rawOffset)
      const duration = Number(rawDuration)
      if (!text || !Number.isSafeInteger(offset) || !Number.isSafeInteger(duration)) continue
      const startMs = (lineTimeMs ?? 0) + offset
      words.push({ text, startMs, endMs: startMs + duration })
    }
    return words
  }
  const doubleBrackets = [...body.matchAll(DOUBLE_BRACKET_WORD)]
  if (doubleBrackets.length > 0) return parseAbsoluteWords(body, doubleBrackets, lineTimeMs)
  const angles = [...body.matchAll(ANGLE_WORD)]
  if (angles.length > 0) return parseAbsoluteWords(body, angles, lineTimeMs)

  if (lineTimeMs !== undefined) {
    // Adjacent leading tags repeat a standard LRC line. Text between tags signals word timing.
    const tags = [...line.matchAll(TIME_TAG)]
    for (let i = 1; i < tags.length; i++) {
      const previous = tags[i - 1]
      if (line.slice(previous.index + previous[0].length, tags[i].index).trim()) {
        return parseAbsoluteWords(line, tags)
      }
    }
  }
  return []
}

function parseAbsoluteWords(
  body: string,
  tags: RegExpExecArray[],
  leadingTimeMs?: number,
): LyricWord[] {
  const words: LyricWord[] = []
  let startMs = leadingTimeMs
  let textStart = 0
  for (const tag of tags) {
    const timeMs = toMs(tag[1], tag[2], tag[3])
    const text = body.slice(textStart, tag.index)
    if (startMs !== undefined && text && (textStart > 0 || text.trim())) {
      words.push({ text, startMs, endMs: Math.max(startMs, timeMs) })
    }
    startMs = timeMs
    textStart = tag.index + tag[0].length
  }
  if (startMs !== undefined && textStart < body.length) {
    words.push({ text: body.slice(textStart), startMs, endMs: startMs + 1_000 })
  }
  return words
}

export function parseTranslation(content: string): LyricLine[] {
  return parseLrc(content)
}

export function mergeTranslations(
  lyrics: readonly LyricLine[],
  translations: readonly LyricLine[],
): Map<number, string> {
  const result = new Map<number, string>()
  if (translations.length === 0) return result

  for (let li = 0; li < lyrics.length; li++) {
    const lineTime = lyrics[li].timeMs
    let bestIdx = -1
    let bestDiff = Infinity
    for (let ti = 0; ti < translations.length; ti++) {
      const diff = Math.abs(translations[ti].timeMs - lineTime)
      if (diff < bestDiff) {
        bestDiff = diff
        bestIdx = ti
      }
    }
    if (bestIdx >= 0 && bestDiff <= 500 && translations[bestIdx].text.length > 0) {
      result.set(li, translations[bestIdx].text)
    }
  }
  return result
}

export function findCurrentWord(
  words: readonly LyricWord[],
  positionMs: number,
): number {
  if (words.length === 0) return -1
  for (let i = words.length - 1; i >= 0; i--) {
    if (positionMs >= words[i].startMs) return i
  }
  return -1
}
