import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { SEEK_STEP_MS } from '../domain/shortcut-bindings.js'
import { canSeekBy, usePlayerStore } from '../store/index.js'

export function SeekStepButton({ forward, slot }: { forward: boolean, slot?: number }) {
  const { t } = useTranslation()
  const enabled = usePlayerStore(canSeekBy)
  const compact = slot == null
  const buttonClass = compact ? 'mini-player__btn' : 'player-controls__btn'
  const seek = () => {
    if (enabled) void usePlayerStore.getState().seekBy(forward ? SEEK_STEP_MS : -SEEK_STEP_MS)
  }

  return (
    <view
      className={enabled ? buttonClass : `${buttonClass} ${buttonClass}--disabled`}
      style={slot == null ? undefined : { width: `${slot}px`, height: `${slot}px` }}
      bindtap={!compact && enabled ? seek : undefined}
      catchtap={compact ? seek : undefined}
      accessibility-element={true}
      accessibility-label={t(forward ? 'player.seekForward' : 'player.seekBackward')}
      accessibility-traits={enabled ? 'button' : 'disabled'}
      data-testid={forward ? 'seek-forward-btn' : 'seek-backward-btn'}
    >
      <Icon
        name={forward ? 'seek-forward-10' : 'seek-backward-10'}
        size={compact ? 22 : 28}
        color={ICON_COLORS.primary}
      />
    </view>
  )
}
