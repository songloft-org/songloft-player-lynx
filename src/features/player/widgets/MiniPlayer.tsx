import { useNavigate } from '@tanstack/react-router'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { BackdropBlur } from '../../../shared/ui/BackdropBlur.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { progressOf, usePlayerStore } from '../store/index.js'
import './MiniPlayer.css'

/**
 * Persistent mini-player, mounted in the shell above the bottom nav (narrow) /
 * at the foot of the content column (wide). Only rendered when a song is loaded.
 * Tapping the body opens the full `/player`; the play/pause button uses
 * `catchtap` so it does not also trigger the open. A thin non-interactive
 * progress bar (plain views — no gesture leaf) tracks position.
 */
export function MiniPlayer() {
  const navigate = useNavigate()
  const song = usePlayerStore((s) => s.currentSong)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const progress = usePlayerStore(progressOf)

  if (!song) return null

  const cover = song.coverUrl ? buildCoverUrl(song.coverUrl, song.updatedAt) : ''
  const subtitle = [song.artist, song.album].filter(Boolean).join(' · ')
  const pct = `${Math.round(progress * 100)}%`

  return (
    <view className='mini-player' bindtap={() => navigate({ to: '/player' })}>
      {/* Panel-mode blur — same reason as the nav capsule below it: this bar
          floats over scrolling content with no scrim of its own. The root's
          `bindtap` still receives taps, since a child bubbles to it. */}
      <BackdropBlur className='ui-backdrop-blur--pill' />
      <view className='mini-player__progress'>
        <view className='mini-player__progress-fill' style={{ width: pct }} />
      </view>
      <view className='mini-player__row'>
        {cover
          ? <image className='mini-player__cover' src={cover} />
          : <view className='mini-player__cover mini-player__cover--empty' />}
        <view className='mini-player__meta'>
          <text className='mini-player__title'>{song.title}</text>
          {subtitle ? <text className='mini-player__subtitle'>{subtitle}</text> : null}
        </view>
        <view
          className='mini-player__play-hit'
          catchtap={() => usePlayerStore.getState().togglePlay()}
        >
          <view className='mini-player__play'>
            <Icon name={isPlaying ? 'pause' : 'play'} size={18} color={ICON_COLORS.primaryContent} />
          </view>
        </view>
      </view>
    </view>
  )
}
