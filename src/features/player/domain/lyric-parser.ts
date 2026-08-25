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

const WORD_TAG = /<(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?>/g

export function parseEnhancedLrc(content: string): LyricLine[] {
  const out: LyricLine[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line.length === 0) continue

    TIME_TAG.lastIndex = 0
    const lineMatches = [...line.matchAll(TIME_TAG)]
    if (lineMatches.length === 0) continue

    const lastLineTag = lineMatches[lineMatches.length - 1]
    const lineTimeMs = toMs(lineMatches[0][1], lineMatches[0][2], lineMatches[0][3])
    const afterLineTags = line.slice((lastLineTag.index ?? 0) + lastLineTag[0].length)

    WORD_TAG.lastIndex = 0
    const wordMatches = [...afterLineTags.matchAll(WORD_TAG)]

    if (wordMatches.length === 0) {
      const text = afterLineTags.trim()
      for (const m of lineMatches) {
        out.push({ timeMs: toMs(m[1], m[2], m[3]), text })
      }
      continue
    }

    const words: LyricWord[] = []
    let fullText = ''

    for (let i = 0; i < wordMatches.length; i++) {
      const wm = wordMatches[i]
      const startMs = toMs(wm[1], wm[2], wm[3])
      const textStart = (wm.index ?? 0) + wm[0].length
      let textEnd: number
      if (i + 1 < wordMatches.length) {
        textEnd = wordMatches[i + 1].index ?? textStart
      } else {
        textEnd = afterLineTags.length
      }
      const wordText = afterLineTags.slice(textStart, textEnd)

      let endMs: number
      if (i + 1 < wordMatches.length) {
        endMs = toMs(
          wordMatches[i + 1][1],
          wordMatches[i + 1][2],
          wordMatches[i + 1][3],
        )
      } else {
        endMs = startMs + 1_000
      }

      if (wordText.length > 0) {
        words.push({ text: wordText, startMs, endMs })
        fullText += wordText
      }
    }

    const textBeforeFirstWord = afterLineTags.slice(0, wordMatches[0].index ?? 0)
    if (textBeforeFirstWord.trim().length > 0) {
      words.unshift({
        text: textBeforeFirstWord,
        startMs: lineTimeMs,
        endMs: words.length > 0 ? words[0].startMs : lineTimeMs + 500,
      })
      fullText = textBeforeFirstWord + fullText
    }

    if (words.length > 0 && words.length > 1) {
      words[words.length - 1].endMs = Math.max(
        words[words.length - 1].startMs + 100,
        words[words.length - 1].endMs,
      )
    }

    out.push({ timeMs: lineTimeMs, text: fullText.trim(), words })
  }
  out.sort((a, b) => a.timeMs - b.timeMs)
  return out
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
