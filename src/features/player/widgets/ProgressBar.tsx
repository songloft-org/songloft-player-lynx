import { useState } from '@lynx-js/react'

import {
  SliderIndicator,
  SliderRoot,
  SliderThumb,
  SliderTrack,
} from '@lynx-js/lynx-ui-slider'

import { formatDuration } from '../../library/data/format.js'
import { usePlayerStore } from '../store/index.js'

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

  return (
    <view className='player-progress'>
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
      <view className='player-progress__times'>
        <text className='player-progress__time'>{formatMs(shownMs)}</text>
        <text className='player-progress__time'>{formatMs(duration)}</text>
      </view>
    </view>
  )
}
