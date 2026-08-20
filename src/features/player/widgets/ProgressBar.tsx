import { useState } from '@lynx-js/react'

import {
  SliderIndicator,
  SliderRoot,
  SliderThumb,
  SliderTrack,
} from '@lynx-js/lynx-ui-slider'

import { formatDuration } from '../../library/data/format.js'
import { usePlayerStore } from '../store/index.js'
import './ProgressBar.css'

/** Format a millisecond position as `mm:ss` (reuses the library formatter). */
function formatMs(ms: number): string {
  return formatDuration(Math.round(ms / 1000))
}

/**
 * Seek bar: a lynx-ui `Slider` bound to the player progress. While dragging it
 * shows the drag position (and previews the time); on commit it seeks the mock
 * audio, which then drives `currentTime` back through the store.
 */
export function ProgressBar() {
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)

  const [dragging, setDragging] = useState(false)
  const [dragValue, setDragValue] = useState(0)

  const liveValue = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0
  const value = dragging ? dragValue : liveValue
  const shownMs = dragging ? dragValue * duration : currentTime

  /*
   * `[elapsed | slider | total]` on one line, matching Flutter's `progress_bar.dart`.
   *
   * They used to sit on a second line below the rail, which cost a whole row of
   * vertical space — the scarcest thing on this screen, and the reason the cover has
   * to shrink on short viewports at all (see `player-layout.ts`). Fixed-width time
   * columns keep the rail from twitching sideways as `9:59` becomes `10:00`.
   */
  return (
    <view className='player-progress'>
      {dragging
        ? (
          <view className='player-progress__preview'>
            <text className='player-progress__preview-text'>{formatMs(shownMs)}</text>
          </view>
        )
        : null}
      <view className='player-progress__row'>
        <text className='player-progress__time'>{formatMs(shownMs)}</text>
        <SliderRoot
          className='player-progress__slider'
          value={value}
          onDragging={() => setDragging(true)}
          onValueChange={(v: number) => {
            if (dragging) setDragValue(v)
          }}
          onValueCommit={(v: number) => {
            setDragging(false)
            void usePlayerStore.getState().seek(v * duration)
          }}
        >
          <SliderTrack className='player-progress__track'>
            <SliderIndicator className='player-progress__indicator' />
            <SliderThumb className='player-progress__thumb-wrap'>
              <view className='player-progress__thumb' />
            </SliderThumb>
          </SliderTrack>
        </SliderRoot>
        <text className='player-progress__time player-progress__time--total'>
          {formatMs(duration)}
        </text>
      </view>
    </view>
  )
}
