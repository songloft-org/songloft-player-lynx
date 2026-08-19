import { useEffect, useRef, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Swiper, SwiperItem, type SwiperRef } from '@lynx-js/lynx-ui-swiper'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
// Direct module import, not the library barrel: that would pull the whole library
// feature (API client included) into the player's graph for one getter.
import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { resolveVideoSourceKind } from '../../../core/network/video-source.js'
import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import { readAutoEnterLyrics } from '../../settings/data/settings-prefs.js'
import { getPlatformTarget } from '../../../native/platform-target.js'
import { getVideoModule } from '../../../native/video.js'
import { useBreakpoint } from '../../../shared/responsive/useBreakpoint.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { PopoverMenu } from '../../../shared/ui/PopoverMenu.js'
import type { PopoverMenuItem } from '../../../shared/ui/PopoverMenu.js'
import { usePlayerStore } from '../store/index.js'
import { LyricsView } from '../widgets/LyricsView.js'
import { PlayControls } from '../widgets/PlayControls.js'
import { PlaylistDrawer } from '../widgets/PlaylistDrawer.js'
import { ProgressBar } from '../widgets/ProgressBar.js'
import { SleepTimerSheet } from '../widgets/SleepTimerSheet.js'
import { VolumeControl } from '../widgets/VolumeControl.js'
import './FullPlayerPage.css'

function formatRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1_000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Cover, with the ▶ badge doubling as the entry point to fullscreen video.
 *
 * The badge stays visible whenever the song has a video track, because it is also
 * plain metadata ("this is a music video"). It only becomes *tappable* where a
 * fullscreen surface actually exists and the container can be shown — on Web, or in a
 * build without the native module, tapping would be the silent no-op this repo has
 * already shipped three times.
 *
 * `kind === 'hls'` means the server has to transcode the file before anything can be
 * drawn, and it answers only when the whole transcode is done. So that path shows a
 * pending state and switches the source first; `'direct'` opens straight away,
 * because the picture is already in the stream being played.
 */
function CoverArt({ song }: { song: Song }) {
  const cover = song.coverUrl ? buildCoverUrl(song.coverUrl, song.updatedAt) : ''
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const [note, setNote] = useState('')

  const kind = resolveVideoSourceKind(song, getPlatformTarget())
  const canWatch = getPlatformCapabilities().video && kind !== 'none'

  useEffect(() => {
    setPending(false)
    setNote('')
  }, [song.id])

  const openVideo = async (): Promise<void> => {
    setNote('')
    setPending(true)
    try {
      if (kind === 'hls') await usePlayerStore.getState().enterVideoSource()
      const shown = await getVideoModule().open()
      // The host refuses when the stream turns out to carry no video track — a real
      // case for remote songs cached through `-vn`, and one only the host can see.
      if (!shown) setNote(t('player.videoNoTrack'))
    } catch {
      setNote(t('player.videoUnavailable'))
    } finally {
      setPending(false)
    }
  }

  return (
    <view className='full-player__cover-wrap'>
      {cover
        ? <image className='full-player__cover' src={cover} />
        : <view className='full-player__cover full-player__cover--empty'>
            <Icon name='music' size={56} color={ICON_COLORS.contentMuted} />
          </view>}
      {song.isVideo
        ? (
          <view
            className='full-player__video-badge'
            bindtap={canWatch && !pending ? () => { void openVideo() } : undefined}
            data-testid={canWatch ? 'video-fullscreen' : undefined}
          >
            <text className='full-player__video-badge-text'>{pending ? '…' : '▶'}</text>
          </view>
        )
        : null}
      {note
        ? <text className='full-player__video-note'>{note}</text>
        : null}
    </view>
  )
}

export function FullPlayerPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const song = usePlayerStore((s) => s.currentSong)
  const sleepTimer = usePlayerStore((s) => s.sleepTimer)
  const speed = usePlayerStore((s) => s.speed)
  const { width, isWide, onLayoutChange } = useBreakpoint()
  const [showSleepTimer, setShowSleepTimer] = useState(false)
  const swiperRef = useRef<SwiperRef>(null)
  /**
   * Which Swiper screen is showing (0 = cover, 1 = lyrics). Tracked so the back key
   * can slide back to the cover instead of leaving the player. `swipeTo` fires
   * `onChange`, so the auto-enter effect below keeps this in sync without a second
   * write.
   */
  const [swiperIndex, setSwiperIndex] = useState(0)

  /*
   * On the lyrics screen, back returns to the cover first. Only on the narrow
   * layout: wide shows cover and lyrics side by side, so there is no second screen
   * to leave. Registered below the sleep-timer sheet / speed popover (they activate
   * later), so an open overlay still closes before the swiper slides.
   */
  useBackHandler(!isWide && swiperIndex === 1, () => {
    swiperRef.current?.swipeTo(0)
    return true
  })

  // Auto-enter full-screen lyrics when the preference is enabled.
  useEffect(() => {
    void readAutoEnterLyrics().then((enabled) => {
      if (enabled) swiperRef.current?.swipeTo(1)
    })
  }, [])

  useEffect(() => {
    return () => { usePlayerStore.getState().closePlaylistDrawer() }
  }, [])

  const [showSpeedPopover, setShowSpeedPopover] = useState(false)
  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
  const speedItems: PopoverMenuItem[] = SPEEDS.map((s) => ({
    key: String(s),
    label: s === 1 ? t('player.speedNormal') : `${s}x`,
    selected: speed === s,
  }))

  /**
   * Return to the tab the player was opened from, not always Home.
   *
   * Not `history.back()`: the memory history's first entry is `/login`, and any
   * navigation the user did before opening the player would make "back" land
   * somewhere arbitrary. The shell records its own last tab instead, which is also
   * how the library remembers its sub-tab — restored so returning to the library
   * does not reset it. That rule now lives in `shared/nav/route-back.ts`, where the
   * hardware back key reads it too.
   */
  const closePlayer = () => {
    performRouteBack()
  }

  if (!song) {
    return (
      <view className='full-player full-player--enter full-player--empty'>
        <text className='full-player__empty-title'>{t('player.nothingPlaying')}</text>
        <text className='full-player__empty-subtitle'>
          {t('player.nothingPlayingSubtitle')}
        </text>
        <view className='full-player__empty-btn' bindtap={() => navigate({ to: '/library' })}>
          <text className='full-player__empty-btn-text'>{t('player.goToLibrary')}</text>
        </view>
      </view>
    )
  }

  const timerActive = sleepTimer != null
  const timerLabel = sleepTimer
    ? sleepTimer.mode === 'duration'
      ? t('player.sleepTimerActive', { time: formatRemaining(sleepTimer.remainingMs ?? 0) })
      : t(sleepTimer.remainingSongs === 1
          ? 'player.sleepTimerSongsLeftOne'
          : 'player.sleepTimerSongsLeft',
        { count: sleepTimer.remainingSongs ?? 0 })
    : undefined

  return (
    <view
      className='full-player full-player--enter'
      bindlayoutchange={onLayoutChange}
    >
      <view className='full-player__topbar'>
        <view
          className='full-player__icon-btn'
          bindtap={closePlayer}
          data-testid='full-player-close'
        >
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='full-player__eyebrow'>{t('player.nowPlaying')}</text>
        <view className='full-player__timer-wrap'>
          <PopoverMenu
            show={showSpeedPopover}
            onShowChange={setShowSpeedPopover}
            placement='bottom'
            triggerClassName={speed !== 1 ? 'full-player__speed-btn' : 'full-player__icon-btn'}
            trigger={
              <text
                className={speed !== 1
                  ? 'full-player__speed-text'
                  : 'full-player__speed-text-idle'}
                data-testid='speed-btn'
              >
                {speed}x
              </text>
            }
            items={speedItems}
            onSelect={(key) => { void usePlayerStore.getState().setSpeed(Number(key)) }}
          />
          {timerLabel
            ? <text className='full-player__timer-remaining'>{timerLabel}</text>
            : null}
          <view
            className='full-player__icon-btn'
            bindtap={() => setShowSleepTimer(true)}
          >
            <Icon
              name='timer'
              size={20}
              color={timerActive ? ICON_COLORS.primary : ICON_COLORS.content}
            />
          </view>
          {/* No DLNA module (Web, or a build without it) ⇒ the cast screen could
              only ever scan forever, so do not offer the entry at all. */}
          {getPlatformCapabilities().dlna
            ? (
              <view
                className='full-player__icon-btn'
                bindtap={() => void navigate({ to: '/player/dlna' })}
                data-testid='full-player-dlna'
              >
                <Icon name='volume' size={20} color={ICON_COLORS.content} />
              </view>
            )
            : null}
          <view
            className='full-player__icon-btn'
            bindtap={() => usePlayerStore.getState().togglePlaylistDrawer()}
          >
            <Icon name='menu' size={22} color={ICON_COLORS.content} />
          </view>
        </view>
      </view>

      <view className='full-player__stage'>
        {isWide
          ? (
            <view className='full-player__stage-row'>
              <CoverArt song={song} />
              <view className='full-player__lyrics-pane'>
                <LyricsView />
              </view>
            </view>
          )
          : width > 0
            ? (
              <Swiper
                ref={swiperRef}
                data={[0, 1]}
                itemWidth={width}
                containerWidth={width}
                itemHeight='auto'
                onChange={setSwiperIndex}
              >
                {({ index }: { index: number }) => (
                  <SwiperItem>
                    {index === 0
                      ? <CoverArt song={song} />
                      : (
                        <view className='full-player__lyrics-page'>
                          <LyricsView />
                        </view>
                      )}
                  </SwiperItem>
                )}
              </Swiper>
            )
            : <CoverArt song={song} />}
      </view>

      <view className='full-player__meta'>
        <text className='full-player__title'>{song.title}</text>
        {song.artist ? <text className='full-player__artist'>{song.artist}</text> : null}
      </view>

      <ProgressBar />
      <PlayControls />
      <VolumeControl />

      <PlaylistDrawer />
      <SleepTimerSheet show={showSleepTimer} onClose={() => setShowSleepTimer(false)} />
    </view>
  )
}
