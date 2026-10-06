import { useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { Song } from '../../../models/song.js'
import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { songRowOverlays } from '../../../shared/ui/song-row-overlays.js'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { PopoverMenu } from '../../../shared/ui/PopoverMenu.js'
import type { PopoverMenuItem } from '../../../shared/ui/PopoverMenu.js'
import { getCacheInfo } from '../data/song-cache.js'
import { indexedSongCacheAvailable } from '../data/indexed-song-cache.js'
import { getIndexedCacheInfo } from '../data/cache-context.js'
import { currentCacheVariant } from '../store/player-store.js'
import { cacheSongToDevice, removeSongCache } from '../domain/song-cache-actions.js'
import { useAudioTracks } from '../data/audio-tracks-query.js'
import { usePlayerStore } from '../store/player-store.js'
import { useDlnaStore } from '../store/dlna-store.js'

export interface PlayerMoreMenuProps {
  /** The song being played; its per-song entries are omitted when nothing is loaded. */
  song: Song | null
  onOpenSleepTimer: () => void
  timerActive: boolean
}

/**
 * The `⋯` overflow menu: song info, cache-on-device, equalizer and sleep timer.
 *
 * Groups the player's secondary functions the way Flutter's `PopupMenuButton` does,
 * which is what frees the top bar.
 *
 * Most of the song's own actions are deliberately *not* here: the player already
 * shows the song it is playing, and every action on it is reachable from the row in
 * the library/playlist that queued it (`GlobalMenu`, via `song-row-overlays.ts`). A
 * second entry point only duplicates them.
 *
 * The two per-song entries that ARE here are the ones that only make sense
 * mid-playback:
 *
 *  - **Song info** — "what am I listening to, exactly". The library row that queued
 *    the song may be far away (another tab, a radio, a search), so this opens
 *    the global info dialog (`SongInfoDialog` via `song-row-overlays.ts`)
 *    right here over the player, instead of routing into the library's
 *    browsing context.
 *  - **Cache on device / remove from cache** — caching is something you do to the
 *    song that is playing, and its state (cached or not) drives the label. Gated on
 *    the `songCache` capability, so hosts without the native module (Web) never see
 *    it. The decision logic lives in `song-cache-actions.ts`; this component owns the
 *    video confirm dialog and the toasts.
 */
export function PlayerMoreMenu({ song, onOpenSleepTimer, timerActive }: PlayerMoreMenuProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [show, setShow] = useState(false)
  const [cached, setCached] = useState(false)
  const [videoConfirm, setVideoConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const songCacheCapable = getPlatformCapabilities().songCache
  const casting = useDlnaStore((s) => s.activeDevice != null)
  const selectedTrack = usePlayerStore((s) => s.audioTrack)
  const switchingTrack = usePlayerStore((s) => s.isAudioTrackSwitching)
  const indexedCache = indexedSongCacheAvailable()
  const cacheVariant = song ? currentCacheVariant(song) : null
  const audioTracks = useAudioTracks(casting ? null : song)

  // Track whether the current song is already on device so the entry reads as
  // "remove" vs "cache". Re-runs when the song changes.
  useEffect(() => {
    if (!song || !songCacheCapable) {
      setCached(false)
      return
    }
    let alive = true
    const lookup = indexedCache && cacheVariant ? getIndexedCacheInfo(song, cacheVariant) : getCacheInfo(song.id)
    lookup
      .then((info) => { if (alive) setCached(info.cached) })
      .catch(() => { if (alive) setCached(false) })
    return () => { alive = false }
  }, [song?.id, song?.updatedAt, songCacheCapable, indexedCache, selectedTrack, cacheVariant?.quality, cacheVariant?.normalize])

  const cacheCurrent = async () => {
    if (!song || busy) return
    setBusy(true)
    toast.show(t('player.cacheStarted', { title: song.title }))
    const outcome = await cacheSongToDevice(song)
    setBusy(false)
    if (outcome === 'cached') {
      setCached(true)
      toast.success(t('player.cacheDone'))
    } else if (outcome === 'limit') {
      toast.error(t('player.cacheLimitExceeded'))
    } else {
      toast.error(t('player.cacheFailed'))
    }
  }

  const removeCurrent = async () => {
    if (!song || busy) return
    setBusy(true)
    const outcome = await removeSongCache(song)
    setBusy(false)
    if (outcome === 'removed') {
      setCached(false)
      toast.success(t('player.cacheRemoved'))
    } else {
      toast.error(t('player.cacheFailed'))
    }
  }

  const onCacheEntry = () => {
    if (!song) return
    if (cached) {
      void removeCurrent()
      return
    }
    // Video files are large — confirm before pulling one onto the device.
    if (song.isVideo) {
      setVideoConfirm(true)
      return
    }
    void cacheCurrent()
  }

  const items: PopoverMenuItem[] = [
    ...(song != null
      ? [{ key: 'songInfo', label: t('player.songInfo'), icon: 'info' as const }]
      : []),
    ...(!casting && ((audioTracks.data?.length ?? 0) >= 2 || audioTracks.isError)
      ? [{ key: 'audioTracks', label: t(audioTracks.isError ? 'player.audioTracksRetry' : 'player.audioTracks'), icon: 'music' as const }]
      : []),
    ...(song != null && song.type !== 'radio' && !song.isLive && songCacheCapable && (selectedTrack == null || indexedCache) && !switchingTrack
      ? [{
        key: 'cache',
        label: cached ? t('player.removeFromCache') : t('player.cacheToDevice'),
        icon: (cached ? 'trash' : 'download') as 'trash' | 'download',
      }]
      : []),
    /*
     * DLNA cast. Moved here from the tool row so that row stays a fixed three
     * items (volume · speed · queue) regardless of platform capability — which
     * stops the layout shifting when DLNA is absent. The cast screen lives at
     * `/player/dlna`, a chrome-less sibling of `/player`.
     */
    ...(getPlatformCapabilities().dlna
      ? [{ key: 'cast', label: t('player.cast'), icon: 'cast' as const }]
      : []),
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
          if (key === 'songInfo' && song != null) songRowOverlays.openInfo(song)
          else if (key === 'audioTracks') {
            if (audioTracks.isError) void audioTracks.refetch()
            else usePlayerStore.getState().openAudioTrackSheet()
          }
          else if (key === 'cache') onCacheEntry()
          else if (key === 'cast') void navigate({ to: '/player/dlna' })
          else if (key === 'equalizer') void navigate({ to: '/player/eq' })
          else onOpenSleepTimer()
        }}
      />
      <ConfirmDialog
        show={videoConfirm}
        title={t('player.cacheVideoWarnTitle')}
        message={t('player.cacheVideoWarnContent')}
        confirmLabel={t('player.cacheToDevice')}
        onConfirm={() => {
          setVideoConfirm(false)
          void cacheCurrent()
        }}
        onCancel={() => setVideoConfirm(false)}
        testId='player-cache-video-dialog'
        confirmTestId='player-cache-video-confirm'
        cancelTestId='player-cache-video-cancel'
      />
    </>
  )
}
