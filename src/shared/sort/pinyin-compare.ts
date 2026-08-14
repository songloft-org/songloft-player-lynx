/**
 * Pinyin-aware string comparator for sorting Chinese text.
 *
 * Uses localeCompare with 'zh' locale when available (V8 with ICU data),
 * falls back to case-insensitive codepoint comparison.
 */

let _hasZhLocale: boolean | null = null

function hasZhCollation(): boolean {
  if (_hasZhLocale !== null) return _hasZhLocale
  try {
    _hasZhLocale = 'a'.localeCompare('b', 'zh') === -1
  } catch {
    _hasZhLocale = false
  }
  return _hasZhLocale
}

export function pinyinCompare(a: string, b: string): number {
  if (hasZhCollation()) {
    return a.localeCompare(b, 'zh', { sensitivity: 'base' })
  }
  return a.toLowerCase().localeCompare(b.toLowerCase())
}

export function extractLeadingNumber(text: string): number | null {
  const match = /(\d+)/.exec(text)
  if (!match) return null
  return parseInt(match[1], 10)
}

export function numberAwareCompare(a: string, b: string): number {
  const numA = extractLeadingNumber(a)
  const numB = extractLeadingNumber(b)
  if (numA != null && numB != null) {
    const cmp = numA - numB
    if (cmp !== 0) return cmp
    return pinyinCompare(a, b)
  }
  if (numA != null) return -1
  if (numB != null) return 1
  return pinyinCompare(a, b)
}
