export { usePlayerStore } from './player-store.js'
export type { PlayerState } from './player-store.js'
export { useLyricStore } from './lyric-store.js'
export type { LyricState } from './lyric-store.js'
export {
  type PlayerData,
  hasSong,
  hasNext,
  hasPrev,
  progressOf,
  isMuted,
  nextSongOf,
} from './derive.js'
