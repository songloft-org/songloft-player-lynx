import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { IconName } from '../../../shared/ui/icons.js'
import { hasNext, hasPrev, usePlayerStore } from '../store/index.js'
import type { PlayMode } from '../domain/play-mode.js'

/** Icon shown on the play-mode toggle for each mode. */
const MODE_ICON: Record<PlayMode, IconName> = {
  order: 'order',
  loop: 'repeat',
  single: 'repeat-one',
  random: 'shuffle',
}

/** i18n key for the play-mode toggle label per mode. */
const MODE_LABEL_KEY: Record<PlayMode, string> = {
  order: 'player.modeOrder',
  loop: 'player.modeLoop',
  single: 'player.modeSingle',
  random: 'player.modeRandom',
}

/**
 * Transport controls: play-mode toggle · previous · play/pause · next.
 * Reactive values are read via selectors; actions fire through `getState()` in
 * the tap handlers so the buttons don't re-render on action identity.
 */
export function PlayControls() {
  const { t } = useTranslation()
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
        <view className='player-controls__mode-glyph'>
          <Icon name={MODE_ICON[playMode]} size={20} color={ICON_COLORS.content2} />
        </view>
        <text className='player-controls__mode-label'>{t(MODE_LABEL_KEY[playMode])}</text>
      </view>

      <view
        className={canPrev
          ? 'player-controls__btn'
          : 'player-controls__btn player-controls__btn--disabled'}
        bindtap={() => usePlayerStore.getState().playPrev()}
      >
        <Icon name='skip-prev' size={26} color={ICON_COLORS.content} />
      </view>

      <view
        className='player-controls__btn player-controls__btn--primary'
        bindtap={() => usePlayerStore.getState().togglePlay()}
      >
        {isBuffering
          ? <text className='player-controls__glyph player-controls__glyph--primary'>…</text>
          : (
            <Icon
              name={isPlaying ? 'pause' : 'play'}
              size={30}
              color={ICON_COLORS.primaryContent}
            />
          )}
      </view>

      <view
        className={canNext
          ? 'player-controls__btn'
          : 'player-controls__btn player-controls__btn--disabled'}
        bindtap={() => usePlayerStore.getState().playNext()}
      >
        <Icon name='skip-next' size={26} color={ICON_COLORS.content} />
      </view>
    </view>
  )
}
