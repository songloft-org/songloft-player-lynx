import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { PopoverMenu } from '../../../shared/ui/PopoverMenu.js'
import type { PopoverMenuItem } from '../../../shared/ui/PopoverMenu.js'

export interface PlayerMoreMenuProps {
  onOpenSleepTimer: () => void
  timerActive: boolean
}

/**
 * The `⋯` overflow menu: equalizer and sleep timer.
 *
 * Groups the player's secondary functions the way Flutter's `PopupMenuButton` does,
 * which is what frees the top bar.
 *
 * The song's own actions are deliberately *not* here: the player already shows the
 * song it is playing, and every action on it is reachable from the row in the
 * library/playlist that queued it (`GlobalMenu`, via `song-row-overlays.ts`). A
 * second entry point only duplicates them.
 */
export function PlayerMoreMenu({ onOpenSleepTimer, timerActive }: PlayerMoreMenuProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [show, setShow] = useState(false)

  const items: PopoverMenuItem[] = [
    /*
     * The equalizer's only entry point. Its page lives at `/player/eq` (a
     * chrome-less sibling of `/player`, not a settings sub-page) so returning
     * from it goes back to the player rather than the settings list — which is
     * where a playback control belongs. If it should be hidden where it cannot
     * work (e.g. a host without native EQ), that belongs in
     * `platform-capabilities.ts`, not here.
     */
    { key: 'equalizer', label: t('player.equalizer'), icon: 'tune' },
    {
      key: 'sleepTimer',
      label: t('player.sleepTimer'),
      icon: 'timer',
      // Flags a running timer, matching the countdown shown beside this button.
      selected: timerActive,
    },
  ]

  return (
    <>
      <PopoverMenu
        show={show}
        onShowChange={setShow}
        placement='bottom-end'
        triggerClassName='full-player__icon-btn'
        trigger={
          <Icon
            name='more'
            size={22}
            color={timerActive ? ICON_COLORS.primary : ICON_COLORS.content}
          />
        }
        items={items}
        onSelect={(key) => {
          if (key === 'equalizer') void navigate({ to: '/player/eq' })
          else onOpenSleepTimer()
        }}
      />
    </>
  )
}
