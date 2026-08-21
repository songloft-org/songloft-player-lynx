import type { ReactNode } from '@lynx-js/react'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { formatDuration } from '../data/format.js'

export interface SongRowProps {
  song: Song
  index: number
  onTap?: (song: Song, index: number) => void
  onLongPress?: (song: Song) => void
  isFavorite?: boolean
  onToggleFavorite?: () => void
  isCurrentSong?: boolean
  /**
   * Row-tail action area (wide-screen shortcut buttons, injected by
   * `SongListRow`). Rendered between the favorite heart and the more button.
   */
  trailing?: ReactNode
  /** Renders a trailing "more" button (overflow menu entry point). */
  onMore?: (song: Song) => void
}

export function SongRow({ song, index, onTap, onLongPress, isFavorite, onToggleFavorite, isCurrentSong, trailing, onMore }: SongRowProps) {
  const cover = song.coverUrl ? buildCoverUrl(song.coverUrl, song.updatedAt) : ''
  const subtitle = [song.artist, song.album].filter(Boolean).join(' · ')

  return (
    <view className={`song-row${isCurrentSong ? ' song-row--current' : ''}`} bindtap={() => onTap?.(song, index)} bindlongpress={() => onLongPress?.(song)}>
      {cover
        ? <image className='song-row__cover' src={cover} />
        : <view className='song-row__cover song-row__cover--empty' />}
      <view className='song-row__meta'>
        <view className='song-row__title-row'>
          <text className='song-row__title'>{song.title}</text>
          {song.isVideo ? <text className='song-row__video-badge'>▶</text> : null}
        </view>
        {subtitle
          ? <text className='song-row__subtitle'>{subtitle}</text>
          : null}
      </view>
      <text className='song-row__duration'>{formatDuration(song.duration)}</text>
      {onToggleFavorite != null
        ? <view className='song-row__fav' catchtap={() => onToggleFavorite()} data-testid='song-row-fav'>
            <Icon
              name={isFavorite ? 'heart-filled' : 'heart'}
              size={18}
              color={isFavorite ? ICON_COLORS.danger : ICON_COLORS.contentMuted}
            />
          </view>
        : null}
      {trailing}
      {onMore != null
        ? (
          <view className='song-row__more' catchtap={() => onMore(song)} data-testid='song-row-more'>
            <Icon name='more' size={18} color={ICON_COLORS.contentMuted} />
          </view>
        )
        : null}
    </view>
  )
}
