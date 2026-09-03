import type { ReactNode } from '@lynx-js/react'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { formatDuration } from '../data/format.js'
import './SongRow.css'

export interface SongRowProps {
  song: Song
  index: number
  onTap?: (song: Song, index: number) => void
  onLongPress?: (song: Song) => void
  isFavorite?: boolean
  onToggleFavorite?: () => void
  isCurrentSong?: boolean
  /**
   * Multi-select: this row is one of the selected ones. The wash itself is painted
   * by the wrapper (it has to cover the checkbox column too), so all the row does
   * with this is step its own tertiary text up — see `SongRow.css`.
   */
  isSelected?: boolean
  /**
   * Row-tail action area (wide-screen shortcut buttons, injected by
   * `SongListRow`). Rendered between the favorite heart and the more button.
   */
  trailing?: ReactNode
  /**
   * Extra info appended to the subtitle (artist · album) after another ` · `,
   * e.g. a play-history entry's played-at time — mirrors the Flutter
   * `SongTile.subtitleSuffix` ("Artist · 07-29 21:30"). Empty leaves the
   * subtitle as-is.
   */
  subtitleSuffix?: string
  /** Renders a trailing "more" button (overflow menu entry point). */
  onMore?: (song: Song) => void
  /**
   * `id` for that button, so the menu it opens can be anchored to it. The menu
   * itself renders outside every list (see `song-row-overlays.ts`), so the id is
   * how it addresses the button it belongs to.
   */
  moreAnchorId?: string
}

export function SongRow({ song, index, onTap, onLongPress, isFavorite, onToggleFavorite, isCurrentSong, isSelected, trailing, subtitleSuffix, onMore, moreAnchorId }: SongRowProps) {
  const cover = song.coverUrl ? buildCoverUrl(song.coverUrl, song.updatedAt) : ''
  const subtitle = [song.artist, song.album, subtitleSuffix].filter(Boolean).join(' · ')

  return (
    <view className={`song-row${isCurrentSong ? ' song-row--current' : ''}${isSelected ? ' song-row--selected' : ''}`} bindtap={() => onTap?.(song, index)} bindlongpress={() => onLongPress?.(song)}>
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
          <view id={moreAnchorId} className='song-row__more' catchtap={() => onMore(song)} data-testid='song-row-more'>
            <Icon name='more' size={18} color={ICON_COLORS.contentMuted} />
          </view>
        )
        : null}
    </view>
  )
}
