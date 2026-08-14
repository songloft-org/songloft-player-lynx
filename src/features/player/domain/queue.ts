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
  const next = [...playlist]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  const newIndex = indexAfterMove(currentIndex, from, to)
  return { playlist: next, currentIndex: newIndex, currentSong: songAt(next, newIndex) }
}

/**
 * Where `currentIndex` lands after moving `from` → `to`, derived from the indices
 * alone.
 *
 * This used to be `next.indexOf(pinned)`, i.e. locate the playing song by object
 * identity. The same `Song` object legitimately appears twice in a queue — "add
 * to queue" on a song already queued pushes the very same reference — and
 * `indexOf` then always reports the *first* copy. Reordering with a duplicate
 * present would silently re-pin `currentIndex` to the wrong entry, so progress
 * and the now-playing highlight drifted onto a different row than the audio.
 *
 * Arithmetic has no such ambiguity. An out-of-range `currentIndex` (notably -1,
 * "nothing playing") is passed through untouched.
 */
function indexAfterMove(currentIndex: number, from: number, to: number): number {
  if (currentIndex < 0) return currentIndex
  if (currentIndex === from) return to
  // Removing an earlier item shifts us down; re-inserting at/before us shifts us back up.
  if (from < currentIndex) return to >= currentIndex ? currentIndex - 1 : currentIndex
  // Removing a later item leaves us put; inserting at/before us pushes us down.
  return to <= currentIndex ? currentIndex + 1 : currentIndex
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
