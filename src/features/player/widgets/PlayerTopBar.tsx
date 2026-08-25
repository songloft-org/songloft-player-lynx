import { useTranslation } from 'react-i18next'

import type { Song } from '../../../models/song.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { PlayerMoreMenu } from './PlayerMoreMenu.js'

export interface PlayerTopBarProps {
  song: Song
  /** Wide layouts show "Now Playing"; narrow ones show the album (see below). */
  isWide: boolean
  onClose: () => void
  /** Opens the sleep-timer sheet, reached from the overflow menu. */
  onOpenSleepTimer: () => void
  /** True while a sleep timer is running, so the menu can flag it. */
  timerActive: boolean
  /** Countdown text, rendered beside the overflow button when a timer is set. */
  timerLabel?: string
}

/**
 * `[collapse ⌄ | title | more ⋯]`, mirroring the Flutter player's top bar.
 *
 * Everything that used to live up here — speed, sleep timer, cast, queue — moved
 * down to the transport and tool rows, which is what Flutter does and what makes the
 * row legible: five icon buttons crowded against the album name is a toolbar, not a
 * header.
 *
 * The middle slot differs by width for the same reason it does in Flutter: narrow
 * layouts show the **album**, because the song title is already directly below the
 * cover and repeating it wastes the one line available; wide layouts have the title
 * off in the left column, so the header states what the screen is instead.
 */
export function PlayerTopBar({
  song,
  isWide,
  onClose,
  onOpenSleepTimer,
  timerActive,
  timerLabel,
}: PlayerTopBarProps) {
  const { t } = useTranslation()
  const album = song.album?.trim()

  return (
    <view className='full-player__topbar'>
      <view
        className='full-player__icon-btn'
        bindtap={onClose}
        data-testid='full-player-close'
      >
        <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
      </view>

      {!isWide && album
        ? <text className='full-player__album'>{album}</text>
        : <text className='full-player__eyebrow'>{t('player.nowPlaying')}</text>}

      <view className='full-player__topbar-end'>
        {timerLabel
          ? <text className='full-player__timer-remaining'>{timerLabel}</text>
          : null}
        <PlayerMoreMenu song={song} onOpenSleepTimer={onOpenSleepTimer} timerActive={timerActive} />
      </view>
    </view>
  )
}
