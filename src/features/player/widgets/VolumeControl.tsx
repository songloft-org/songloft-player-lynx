import {
  SliderIndicator,
  SliderRoot,
  SliderThumb,
  SliderTrack,
} from '@lynx-js/lynx-ui-slider'

import { isMuted, usePlayerStore } from '../store/index.js'

/**
 * Volume control: a mute toggle + a lynx-ui `Slider` over the `0..100` volume.
 * The slider works in `[0,1]`, so it maps to/from the store's `0..100` scale.
 */
export function VolumeControl() {
  const volume = usePlayerStore((s) => s.volume)
  const muted = usePlayerStore(isMuted)

  return (
    <view className='player-volume'>
      <view
        className='player-volume__mute'
        bindtap={() => usePlayerStore.getState().toggleMute()}
      >
        <text className='player-volume__icon'>{muted ? '🔇' : '🔊'}</text>
      </view>
      <SliderRoot
        className='player-volume__slider'
        value={volume / 100}
        onValueChange={(v: number) => {
          void usePlayerStore.getState().setVolume(v * 100)
        }}
      >
        <SliderTrack className='player-volume__track'>
          <SliderIndicator className='player-volume__indicator' />
          <SliderThumb className='player-volume__thumb-wrap'>
            <view className='player-volume__thumb' />
          </SliderThumb>
        </SliderTrack>
      </SliderRoot>
    </view>
  )
}
