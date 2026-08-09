import { useNavigate } from '@tanstack/react-router'

import { Swiper, SwiperItem } from '@lynx-js/lynx-ui-swiper'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
import { useBreakpoint } from '../../../shared/responsive/useBreakpoint.js'
import { usePlayerStore } from '../store/index.js'
import { LyricsView } from '../widgets/LyricsView.js'
import { PlayControls } from '../widgets/PlayControls.js'
import { PlaylistDrawer } from '../widgets/PlaylistDrawer.js'
import { ProgressBar } from '../widgets/ProgressBar.js'
import { VolumeControl } from '../widgets/VolumeControl.js'
import './FullPlayerPage.css'

function CoverArt({ song }: { song: Song }) {
  const cover = song.coverUrl ? buildCoverUrl(song.coverUrl) : ''
  return (
    <view className='full-player__cover-wrap'>
      {cover
        ? <image className='full-player__cover' src={cover} />
        : <view className='full-player__cover full-player__cover--empty'>
            <text className='full-player__cover-glyph'>♪</text>
          </view>}
    </view>
  )
}

/**
 * Full-screen "Now Playing" page (chrome-less, at `/player`), the Lynx analogue
 * of the Flutter `MobilePlayer` / `DesktopFullPlayer`.
 *
 * - Narrow: cover + lyrics are a two-page horizontal `Swiper` (per the batch
 *   brief); wide: cover and lyrics sit side by side.
 * - Progress (drag-seek), transport, volume and a playlist-drawer trigger sit
 *   below. Renders an empty placeholder when nothing is loaded.
 * - The page slides in via CSS transform/opacity (`full-player--enter`).
 */
export function FullPlayerPage() {
  const navigate = useNavigate()
  const song = usePlayerStore((s) => s.currentSong)
  const { width, isWide, onLayoutChange } = useBreakpoint()

  if (!song) {
    return (
      <view className='full-player full-player--enter full-player--empty'>
        <text className='full-player__empty-title'>Nothing playing</text>
        <text className='full-player__empty-subtitle'>
          Pick a song from your library to start.
        </text>
        <view className='full-player__empty-btn' bindtap={() => navigate({ to: '/library' })}>
          <text className='full-player__empty-btn-text'>Go to library</text>
        </view>
      </view>
    )
  }

  return (
    <view
      className='full-player full-player--enter'
      bindlayoutchange={onLayoutChange}
    >
      <view className='full-player__topbar'>
        <view className='full-player__icon-btn' bindtap={() => navigate({ to: '/' })}>
          <text className='full-player__icon'>⌄</text>
        </view>
        <text className='full-player__eyebrow'>Now Playing</text>
        <view
          className='full-player__icon-btn'
          bindtap={() => usePlayerStore.getState().togglePlaylistDrawer()}
        >
          <text className='full-player__icon'>☰</text>
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
    </view>
  )
}
