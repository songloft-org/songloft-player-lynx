import { useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { PopoverPanel } from '../../../shared/ui/PopoverPanel.js'
import { isMuted, usePlayerStore } from '../store/index.js'
import { VolumeControl } from './VolumeControl.js'

/**
 * Volume behind a tap, as a slider in a popover.
 *
 * It used to be a permanently-visible slider row at the foot of the player. Flutter
 * puts it in the tool row instead, and that row is where the vertical space it was
 * occupying went: the transport controls and the progress bar are what the screen is
 * for, and volume is usually the device's hardware buttons' job anyway.
 *
 * The panel reuses {@link VolumeControl} verbatim, so mute-toggle and slider behaviour
 * (including the 0..100 ↔ 0..1 conversion) stays in one place.
 */
export function VolumePopover({ slot }: { slot: number }) {
  const { t } = useTranslation()
  const [show, setShow] = useState(false)
  const muted = usePlayerStore(isMuted)

  return (
    <PopoverPanel
      show={show}
      onShowChange={setShow}
      placement='top'
      triggerClassName='player-tools__btn'
      contentClassName='player-volume-panel'
      trigger={
        <view
          className='player-tools__hit'
          style={{ width: `${slot}px`, height: `${slot}px` }}
          data-testid='volume-btn'
        >
          <Icon
            name={muted ? 'volume-mute' : 'volume'}
            size={20}
            color={ICON_COLORS.content}
          />
        </view>
      }
    >
      <text className='player-volume-panel__label'>{t('player.volume')}</text>
      <VolumeControl />
    </PopoverPanel>
  )
}
