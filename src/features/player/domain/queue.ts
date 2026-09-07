import type { Song } from '../../../models/song.js'

/**
 * Pure play-queue mutations, ported (trimmed) from the Flutter `PlayQueue`
 * use-case. Each returns a fresh `{ playlist, currentIndex }` plus the derived
 * `currentSong`, keeping the current track pinned to the same song across the
 * mutation. Extracted as pure functions so the queue math is unit-tested
 * independently of the zustand store / audio bridge.
 *
 * The reorder family (`moveItem`/`reorder`) was removed together with the
 * queue drawer's drag-to-sort UI: eagerly mounting one draggable row per
 * queued song froze the drawer on large queues
 * (songloft-org/songloft-player-lynx#4), and the drawer now renders through
 * the virtualized `VirtualList`, which has no in-list drag. If drag-to-sort
 * ever returns, restore them from git history rather than re-deriving the
 * duplicate-song pinning arithmetic.
 */

export interface QueueSnapshot {
  playlist: Song[]
  currentIndex: number
  currentSong: Song | undefined
}

export interface RemoveResult extends QueueSnapshot {
  /** `true` when the queue became empty (caller should stop playback). */
  shouldStop: boolean
  /** `true` when the removed index was the currently-playing track. */
  removedCurrent: boolean
}

function songAt(playlist: Song[], index: number): Song | undefined {
  return index >= 0 && index < playlist.length ? playlist[index] : undefined
}

/** Remove `removeIndex`, keeping the current track pinned where possible. */
export function removeAt(
  playlist: Song[],
  currentIndex: number,
  removeIndex: number,
): RemoveResult {
  if (removeIndex < 0 || removeIndex >= playlist.length) {
    return {
      playlist,
      currentIndex,
      currentSong: songAt(playlist, currentIndex),
      shouldStop: false,
      removedCurrent: false,
    }
  }

  const next = [...playlist.slice(0, removeIndex), ...playlist.slice(removeIndex + 1)]
  if (next.length === 0) {
    return {
      playlist: next,
      currentIndex: -1,
      currentSong: undefined,
      shouldStop: true,
      removedCurrent: removeIndex === currentIndex,
    }
  }

  let newIndex: number
  if (removeIndex < currentIndex) newIndex = currentIndex - 1
  else if (removeIndex > currentIndex) newIndex = currentIndex
  else newIndex = Math.min(currentIndex, next.length - 1) // removed current → next song shifts in

  return {
    playlist: next,
    currentIndex: newIndex,
    currentSong: songAt(next, newIndex),
    shouldStop: false,
    removedCurrent: removeIndex === currentIndex,
  }
}
