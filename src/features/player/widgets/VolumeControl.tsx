import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { VerticalSlider } from '../../../shared/ui/VerticalSlider.js'
import { isMuted, usePlayerStore } from '../store/index.js'
import './VolumeControl.css'

/**
 * Volume control: a vertical slider over the `0..100` volume + a mute toggle.
 *
 * Vertical rather than the horizontal row it used to be, because the control lives
 * in a popover hanging off one button in the tool row: a horizontal slider forces
 * that popover to be as wide as the slider is long (it was pinned to 200px, the
 * widest panel in the app), while a vertical one is the shape of the gesture people
 * already make for volume on both platforms' system UI.
 *
 * The drag surface is the shared {@link VerticalSlider} — lynx-ui's Slider is
 * horizontal-only, so this is not a prop away (see `vertical-slider.ts`). The
 * `0..100 ↔ 0..1` conversion stays here, and the store keeps owning the mute
 * memory.
 */
export function VolumeControl() {
  const { t } = useTranslation()
  const volume = usePlayerStore((s) => s.volume)
  const muted = usePlayerStore(isMuted)

  return (
    <view className='player-volume'>
      <VerticalSlider
        value={volume / 100}
        onChange={(ratio) => {
          void usePlayerStore.getState().setVolume(ratio * 100)
        }}
        className='player-volume__slider'
        trackClassName='player-volume__track'
        indicatorClassName='player-volume__indicator'
        thumbClassName='player-volume__thumb'
        testId='volume-slider'
      />
      {/* Below the slider, where the "0" end is: tapping it is "silence", and the
          store restores the previous level on the second tap. */}
      <view
        className='player-volume__mute'
        bindtap={() => usePlayerStore.getState().toggleMute()}
        accessibility-element={true}
        accessibility-label={muted ? t('common.unmute') : t('common.mute')}
        data-testid='volume-mute'
      >
        <Icon
          name={muted ? 'volume-mute' : 'volume'}
          size={20}
          color={muted ? ICON_COLORS.primary : ICON_COLORS.content2}
        />
      </view>
    </view>
  )
}
