import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { Song } from '../../../models/song.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { PopoverMenu } from '../../../shared/ui/PopoverMenu.js'
import type { PopoverMenuItem } from '../../../shared/ui/PopoverMenu.js'
import { SongContextMenu } from '../../../shared/ui/SongContextMenu.js'

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
  const [show, setShow] = useState(false)
  const [showSongActions, setShowSongActions] = useState(false)

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
          else setShowSongActions(true)
        }}
      />
      {/*
        * Mounted only while open, unlike the library's call sites which keep it mounted
        * with `song = null`.
        *
        * Its `usePlaylistsInfiniteQuery` has no `staleTime`, so merely being mounted
        * refetches the playlist list — and this component lives in the player, which the
        * user opens constantly. Keeping it mounted here bought a network request per
        * player open, for a menu that is mostly not used. Unmounting also resets the
        * sub-view state its own docs otherwise reset by hand on close.
        *
        * This does leave its `useBackHandler` active at mount, which the back-navigation
        * rules warn against. That warning is about layers registering during *page*
        * mount and outranking a parent; this one mounts on a tap, long afterwards, so it
        * lands on top exactly as intended — verified in `player-overlay-back.test.tsx`,
        * not assumed.
        */}
      {showSongActions
        ? <SongContextMenu song={song} onClose={() => setShowSongActions(false)} />
        : null}
    </>
  )
}
