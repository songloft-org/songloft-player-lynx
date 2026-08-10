import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { formatDuration } from '../data/format.js'

export interface SongRowProps {
  song: Song
  index: number
  onTap?: (song: Song, index: number) => void
  isFavorite?: boolean
  onToggleFavorite?: () => void
}

export function SongRow({ song, index, onTap, isFavorite, onToggleFavorite }: SongRowProps) {
  const cover = song.coverUrl ? buildCoverUrl(song.coverUrl) : ''
  const subtitle = [song.artist, song.album].filter(Boolean).join(' · ')

  return (
    <view className='song-row' bindtap={() => onTap?.(song, index)}>
      {cover
        ? <image className='song-row__cover' src={cover} />
        : <view className='song-row__cover song-row__cover--empty' />}
      <view className='song-row__meta'>
        <text className='song-row__title'>{song.title}</text>
        {subtitle
          ? <text className='song-row__subtitle'>{subtitle}</text>
          : null}
      </view>
      <text className='song-row__duration'>{formatDuration(song.duration)}</text>
      {onToggleFavorite != null
        ? <view className='song-row__fav' catchtap={() => onToggleFavorite()}>
            <Icon
              name={isFavorite ? 'heart-filled' : 'heart'}
              size={18}
              color={isFavorite ? ICON_COLORS.danger : ICON_COLORS.contentMuted}
            />
          </view>
        : null}
    </view>
  )
}
