import { hasNext, hasPrev, usePlayerStore } from '../store/index.js'
import type { PlayMode } from '../domain/play-mode.js'

/** Glyph shown on the play-mode toggle for each mode. */
const MODE_GLYPH: Record<PlayMode, string> = {
  order: '➡',
  loop: '🔁',
  single: '🔂',
  random: '🔀',
}

const MODE_LABEL: Record<PlayMode, string> = {
  order: 'Order',
  loop: 'Repeat all',
  single: 'Repeat one',
  random: 'Shuffle',
}

/**
 * Transport controls: play-mode toggle · previous · play/pause · next.
 * Reactive values are read via selectors; actions fire through `getState()` in
 * the tap handlers so the buttons don't re-render on action identity.
 */
export function PlayControls() {
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isBuffering = usePlayerStore((s) => s.isBuffering)
  const playMode = usePlayerStore((s) => s.playMode)
  const canNext = usePlayerStore(hasNext)
  const canPrev = usePlayerStore(hasPrev)

  return (
    <view className='player-controls'>
      <view
        className='player-controls__btn player-controls__btn--mode'
        bindtap={() => usePlayerStore.getState().cyclePlayMode()}
      >
        <text className='player-controls__mode-glyph'>{MODE_GLYPH[playMode]}</text>
        <text className='player-controls__mode-label'>{MODE_LABEL[playMode]}</text>
      </view>

      <view
        className={canPrev
          ? 'player-controls__btn'
          : 'player-controls__btn player-controls__btn--disabled'}
        bindtap={() => usePlayerStore.getState().playPrev()}
      >
        <text className='player-controls__glyph'>⏮</text>
      </view>

      <view
        className='player-controls__btn player-controls__btn--primary'
        bindtap={() => usePlayerStore.getState().togglePlay()}
      >
        <text className='player-controls__glyph player-controls__glyph--primary'>
          {isBuffering ? '…' : isPlaying ? '⏸' : '▶'}
        </text>
      </view>

      <view
        className={canNext
          ? 'player-controls__btn'
          : 'player-controls__btn player-controls__btn--disabled'}
        bindtap={() => usePlayerStore.getState().playNext()}
      >
        <text className='player-controls__glyph'>⏭</text>
      </view>
    </view>
  )
}
