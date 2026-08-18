import type { Playlist } from '../../../models/playlist.js'

/**
 * Playlist sorting — ports `songloft-player/lib/features/playlist/domain/use_cases/playlist_sort.dart`.
 *
 * The Flutter client has never actually enabled pinyin/locale-aware sorting
 * (its `pinyin_comparator.dart` is only sample code showing how one *could* be
 * injected); its shipped default is a case-insensitive, non-locale codepoint
 * compare. Match that exactly here rather than reintroducing pinyin ordering.
 */

/** First run of digits anywhere in the string, e.g. "04.校园故事" → 4. */
export function extractLeadingNumber(text: string): number | null {
  const match = /(\d+)/.exec(text)
  if (!match) return null
  return parseInt(match[1]!, 10)
}

function defaultCompare(a: string, b: string): number {
  const la = a.toLowerCase()
  const lb = b.toLowerCase()
  if (la < lb) return -1
  if (la > lb) return 1
  return 0
}

function idsEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/** Sorted playlist ids by name, or `null` if already in that order. */
export function sortPlaylistsByName(
  playlists: Playlist[],
  ascending = true,
): number[] | null {
  const sorted = [...playlists].sort((a, b) => {
    const result = defaultCompare(a.name, b.name)
    return ascending ? result : -result
  })
  const sortedIds = sorted.map((p) => p.id)
  const originalIds = playlists.map((p) => p.id)
  return idsEqual(sortedIds, originalIds) ? null : sortedIds
}

/**
 * Sorted playlist ids by leading number in the name (numbered playlists
 * first, ties broken by name), or `null` if already in that order.
 */
export function sortPlaylistsByNumberPrefix(playlists: Playlist[]): number[] | null {
  const sorted = [...playlists].sort((a, b) => {
    const numA = extractLeadingNumber(a.name)
    const numB = extractLeadingNumber(b.name)
    if (numA != null && numB != null) {
      const cmp = numA - numB
      if (cmp !== 0) return cmp
      return defaultCompare(a.name, b.name)
    }
    if (numA != null) return -1
    if (numB != null) return 1
    return defaultCompare(a.name, b.name)
  })
  const sortedIds = sorted.map((p) => p.id)
  const originalIds = playlists.map((p) => p.id)
  return idsEqual(sortedIds, originalIds) ? null : sortedIds
}
