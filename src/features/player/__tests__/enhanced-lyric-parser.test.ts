import { describe, expect, test } from 'vitest'

import {
  findCurrentWord,
  mergeTranslations,
  parseEnhancedLrc,
  parseTranslation,
  type LyricLine,
} from '../domain/lyric-parser.js'

describe('parseEnhancedLrc', () => {
  test('parses word-level timestamps within a line', () => {
    const input = '[00:01.00]<00:01.00>Hello <00:01.50>World'
    const lines = parseEnhancedLrc(input)
    expect(lines).toHaveLength(1)
    expect(lines[0].timeMs).toBe(1_000)
    expect(lines[0].text).toBe('Hello World')
    expect(lines[0].words).toHaveLength(2)
    expect(lines[0].words![0]).toEqual({ text: 'Hello ', startMs: 1_000, endMs: 1_500 })
    expect(lines[0].words![1].text).toBe('World')
    expect(lines[0].words![1].startMs).toBe(1_500)
  })

  test('falls back to plain line if no word tags', () => {
    const input = '[00:05.00]Just a normal line'
    const lines = parseEnhancedLrc(input)
    expect(lines).toHaveLength(1)
    expect(lines[0].timeMs).toBe(5_000)
    expect(lines[0].text).toBe('Just a normal line')
    expect(lines[0].words).toBeUndefined()
  })

  test('parses multiple lines with word-level timestamps', () => {
    const input = [
      '[00:01.00]<00:01.00>Hello <00:01.50>World',
      '[00:05.00]<00:05.00>Foo <00:05.30>Bar <00:05.60>Baz',
    ].join('\n')
    const lines = parseEnhancedLrc(input)
    expect(lines).toHaveLength(2)
    expect(lines[0].words).toHaveLength(2)
    expect(lines[1].words).toHaveLength(3)
    expect(lines[1].words![2].text).toBe('Baz')
  })

  test('handles lines without any time tags (skips them)', () => {
    const input = 'metadata\n[00:01.00]<00:01.00>Word'
    const lines = parseEnhancedLrc(input)
    expect(lines).toHaveLength(1)
  })

  test('handles empty content', () => {
    expect(parseEnhancedLrc('')).toEqual([])
    expect(parseEnhancedLrc('  \n  ')).toEqual([])
  })

  test('sorts output by time', () => {
    const input = [
      '[00:10.00]<00:10.00>Second',
      '[00:01.00]<00:01.00>First',
    ].join('\n')
    const lines = parseEnhancedLrc(input)
    expect(lines[0].text).toBe('First')
    expect(lines[1].text).toBe('Second')
  })

  test('handles fractional seconds with varying digit counts', () => {
    const input = '[00:01.5]<00:01.5>A <00:02.05>B <00:03.123>C'
    const lines = parseEnhancedLrc(input)
    expect(lines[0].words![0].startMs).toBe(1_500)
    expect(lines[0].words![1].startMs).toBe(2_050)
    expect(lines[0].words![2].startMs).toBe(3_123)
  })

  test('last word endMs defaults to startMs + 1000 when no next word', () => {
    const input = '[00:01.00]<00:01.00>Only'
    const lines = parseEnhancedLrc(input)
    expect(lines[0].words![0].endMs).toBe(2_000)
  })
})

describe('parseTranslation', () => {
  test('parses standard LRC as translation lines', () => {
    const input = '[00:01.00]Hello\n[00:05.00]World'
    const lines = parseTranslation(input)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({ timeMs: 1_000, text: 'Hello' })
    expect(lines[1]).toEqual({ timeMs: 5_000, text: 'World' })
  })

  test('handles empty input', () => {
    expect(parseTranslation('')).toEqual([])
  })
})

describe('mergeTranslations', () => {
  test('pairs translation lines with original lyrics by closest timestamp', () => {
    const lyrics: LyricLine[] = [
      { timeMs: 1_000, text: 'Hello' },
      { timeMs: 5_000, text: 'World' },
    ]
    const translations: LyricLine[] = [
      { timeMs: 1_000, text: '你好' },
      { timeMs: 5_000, text: '世界' },
    ]
    const map = mergeTranslations(lyrics, translations)
    expect(map.get(0)).toBe('你好')
    expect(map.get(1)).toBe('世界')
  })

  test('tolerates small time differences (within 500ms)', () => {
    const lyrics: LyricLine[] = [
      { timeMs: 1_000, text: 'Hello' },
    ]
    const translations: LyricLine[] = [
      { timeMs: 1_200, text: '你好' },
    ]
    const map = mergeTranslations(lyrics, translations)
    expect(map.get(0)).toBe('你好')
  })

  test('rejects translations with time difference > 500ms', () => {
    const lyrics: LyricLine[] = [
      { timeMs: 1_000, text: 'Hello' },
    ]
    const translations: LyricLine[] = [
      { timeMs: 5_000, text: '你好' },
    ]
    const map = mergeTranslations(lyrics, translations)
    expect(map.has(0)).toBe(false)
  })

  test('returns empty map for empty translations', () => {
    const lyrics: LyricLine[] = [{ timeMs: 1_000, text: 'Hello' }]
    expect(mergeTranslations(lyrics, []).size).toBe(0)
  })

  test('skips empty translation text', () => {
    const lyrics: LyricLine[] = [{ timeMs: 1_000, text: 'Hello' }]
    const translations: LyricLine[] = [{ timeMs: 1_000, text: '' }]
    const map = mergeTranslations(lyrics, translations)
    expect(map.has(0)).toBe(false)
  })
})

describe('findCurrentWord', () => {
  const words = [
    { text: 'Hello ', startMs: 1_000, endMs: 1_500 },
    { text: 'World ', startMs: 1_500, endMs: 2_000 },
    { text: 'Foo', startMs: 2_000, endMs: 2_500 },
  ]

  test('returns -1 before first word', () => {
    expect(findCurrentWord(words, 500)).toBe(-1)
  })

  test('returns index of the word at its start time', () => {
    expect(findCurrentWord(words, 1_000)).toBe(0)
    expect(findCurrentWord(words, 1_500)).toBe(1)
    expect(findCurrentWord(words, 2_000)).toBe(2)
  })

  test('returns the last word whose startMs <= positionMs', () => {
    expect(findCurrentWord(words, 1_200)).toBe(0)
    expect(findCurrentWord(words, 1_800)).toBe(1)
    expect(findCurrentWord(words, 3_000)).toBe(2)
  })

  test('returns -1 for empty words', () => {
    expect(findCurrentWord([], 1_000)).toBe(-1)
  })
})
