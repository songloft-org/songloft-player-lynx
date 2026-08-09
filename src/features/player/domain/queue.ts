import type { Song } from '../../../models/song.js'

/**
 * Pure play-queue mutations, ported (trimmed) from the Flutter `PlayQueue`
 * use-case. Each returns a fresh `{ playlist, currentIndex }` plus the derived
 * `currentSong`, keeping the current track pinned to the same song across the
 * mutation. Extracted as pure functions so the queue math is unit-tested
 * independently of the zustand store / audio bridge.
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

/** Move the item at `from` to `to`, keeping the current track pinned. */
export function moveItem(
  playlist: Song[],
  currentIndex: number,
  from: number,
  to: number,
): QueueSnapshot {
  if (
    from === to ||
    from < 0 ||
    from >= playlist.length ||
    to < 0 ||
    to >= playlist.length
  ) {
    return { playlist, currentIndex, currentSong: songAt(playlist, currentIndex) }
  }
  const pinned = songAt(playlist, currentIndex)
  const next = [...playlist]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  const newIndex = pinned ? next.indexOf(pinned) : currentIndex
  return { playlist: next, currentIndex: newIndex, currentSong: songAt(next, newIndex) }
}

/**
 * Classic `onReorder` semantics (the `newIndex` is the pre-removal target),
 * converted to a `moveItem` call. Mirrors the Flutter `reorderPlaylist`.
 */
export function reorder(
  playlist: Song[],
  currentIndex: number,
  oldIndex: number,
  newIndex: number,
): QueueSnapshot {
  const insertIndex = newIndex > oldIndex ? newIndex - 1 : newIndex
  return moveItem(playlist, currentIndex, oldIndex, insertIndex)
}
