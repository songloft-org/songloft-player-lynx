import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { Song } from '../../../models/song.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { PopoverMenu } from '../../../shared/ui/PopoverMenu.js'
import type { PopoverMenuItem } from '../../../shared/ui/PopoverMenu.js'
import { useSongRowOverlays } from '../../../shared/ui/song-row-overlays.js'

export interface PlayerMoreMenuProps {
  song: Song
  onOpenSleepTimer: () => void
  timerActive: boolean
}

/**
 * The `⋯` overflow menu: equalizer, sleep timer, and the song's own actions.
 *
 * Groups the player's secondary functions the way Flutter's `PopupMenuButton` does,
 * which is what frees the top bar. The song actions are not re-implemented here —
 * selecting that row opens the shared `SongContextMenu`, so "play next", "add to
 * playlist", "delete" and its confirm step behave identically to a long-press in the
 * library.
 */
export function PlayerMoreMenu({ song, onOpenSleepTimer, timerActive }: PlayerMoreMenuProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const openMenu = useSongRowOverlays((s) => s.openMenu)
  const [show, setShow] = useState(false)

  const items: PopoverMenuItem[] = [
    /*
     * Not gated by platform. Flutter hides this on Web (no libmpv there), but here it
     * is a shortcut to `/settings/eq`, which Settings itself offers unconditionally —
     * hiding it in one place and not the other would just make the shortcut look
     * broken. If the EQ should be hidden where it cannot work, that belongs in
     * `platform-capabilities.ts` and applies to both entry points.
     */
    { key: 'equalizer', label: t('player.equalizer'), icon: 'tune' },
    {
      key: 'sleepTimer',
      label: t('player.sleepTimer'),
      icon: 'timer',
      // Flags a running timer, matching the countdown shown beside this button.
      selected: timerActive,
    },
    { key: 'songActions', label: t('player.songActions'), icon: 'more' },
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
          if (key === 'equalizer') void navigate({ to: '/settings/eq' })
          else if (key === 'sleepTimer') onOpenSleepTimer()
          else openMenu(song)
        }}
      />
    </>
  )
}
