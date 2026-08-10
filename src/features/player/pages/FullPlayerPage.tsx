import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Swiper, SwiperItem } from '@lynx-js/lynx-ui-swiper'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
import { useBreakpoint } from '../../../shared/responsive/useBreakpoint.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
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

function CoverArt({ song }: { song: Song }) {
  const cover = song.coverUrl ? buildCoverUrl(song.coverUrl) : ''
  return (
    <view className='full-player__cover-wrap'>
      {cover
        ? <image className='full-player__cover' src={cover} />
        : <view className='full-player__cover full-player__cover--empty'>
            <Icon name='music' size={56} color={ICON_COLORS.contentMuted} />
          </view>}
    </view>
  )
}

export function FullPlayerPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const song = usePlayerStore((s) => s.currentSong)
  const sleepTimer = usePlayerStore((s) => s.sleepTimer)
  const { width, isWide, onLayoutChange } = useBreakpoint()
  const [showSleepTimer, setShowSleepTimer] = useState(false)

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
        <view className='full-player__icon-btn' bindtap={() => navigate({ to: '/' })}>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='full-player__eyebrow'>{t('player.nowPlaying')}</text>
        <view className='full-player__timer-wrap'>
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
                data={[0, 1]}
                itemWidth={width}
                containerWidth={width}
                itemHeight='auto'
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
