export { FullPlayerPage } from './pages/FullPlayerPage.js'
export { MiniPlayer } from './widgets/MiniPlayer.js'
export {
  usePlayerStore,
  useLyricStore,
  hasSong,
  hasNext,
  hasPrev,
  progressOf,
  isMuted,
  nextSongOf,
} from './store/index.js'
export type { PlayerState, LyricState, PlayerData } from './store/index.js'
