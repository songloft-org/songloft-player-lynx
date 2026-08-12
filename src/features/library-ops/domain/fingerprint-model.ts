import type { DuplicateGroup, DuplicateSong } from '../../../models/duplicate.js'

/**
 * Pure domain logic for the duplicate-check / fingerprint page.
 *
 * Everything here is a pure function — no side effects, no i18n, no hooks — so
 * it stays unit-testable without pulling in any framework deps (same convention
 * as `scan-model.ts`).
 */

/* ─────────────────────────── Page phase state machine ────────────────────── */

/** The three phases the DuplicateCheckPage can be in. */
export type DuplicatePagePhase = 'status' | 'computing' | 'results'

/* ─────────────────────────── Polling constants ───────────────────────────── */

/**
 * Polling interval (ms) for fingerprint progress — matches Flutter's 2s.
 *
 * The `DuplicateCheckPage` drives the poll with an explicit `setInterval` at
 * this cadence rather than query-core's `refetchInterval` (batch 29b: the
 * functional `refetchInterval` proved unreliable on the Lynx 4.0 build — the
 * interval callback stopped firing after the first fetch, freezing the count
 * while the backend advanced). See the poll effect in `DuplicateCheckPage`.
 */
export const FINGERPRINT_POLL_MS = 2000

/* ─────────────────────────── Recommend-keep strategy ─────────────────────── */

/**
 * Pick the recommended song to keep from a duplicate group.
 * Strategy: highest bitRate wins; ties broken by largest fileSize.
 * Falls back to the first song if the group is somehow empty (should not happen).
 */
export function recommendedKeepSong(group: DuplicateGroup): DuplicateSong {
  let best = group.songs[0]
  for (const s of group.songs) {
    if (
      s.bitRate > best.bitRate ||
      (s.bitRate === best.bitRate && s.fileSize > best.fileSize)
    ) {
      best = s
    }
  }
  return best
}

/**
 * Get the recommended song ID to keep for a group.
 */
export function recommendedKeepId(group: DuplicateGroup): number {
  return recommendedKeepSong(group).id
}

/* ─────────────────────────── Deletion helpers ────────────────────────────── */

/**
 * Compute the IDs to delete from a single group, given the ID to keep.
 */
export function groupDeleteIds(group: DuplicateGroup, keepId: number): number[] {
  return group.songs.filter((s) => s.id !== keepId).map((s) => s.id)
}

/**
 * Compute all IDs to delete across all groups (excluding ignored groups).
 *
 * @param groups All duplicate groups.
 * @param selectedKeep Map of groupIndex → song ID to keep.
 * @param ignoredGroups Set of group indices to skip.
 */
export function allDeleteIds(
  groups: DuplicateGroup[],
  selectedKeep: Map<number, number>,
  ignoredGroups: Set<number>,
): number[] {
  const ids: number[] = []
  for (let i = 0; i < groups.length; i++) {
    if (ignoredGroups.has(i)) continue
    const keepId = selectedKeep.get(i) ?? recommendedKeepId(groups[i])
    for (const s of groups[i].songs) {
      if (s.id !== keepId) ids.push(s.id)
    }
  }
  return ids
}

/**
 * Count total songs that will be deleted (across non-ignored groups).
 */
export function countTotalToDelete(
  groups: DuplicateGroup[],
  selectedKeep: Map<number, number>,
  ignoredGroups: Set<number>,
): number {
  return allDeleteIds(groups, selectedKeep, ignoredGroups).length
}
