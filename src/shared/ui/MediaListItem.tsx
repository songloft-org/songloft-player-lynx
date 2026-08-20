import { Icon, ICON_COLORS } from './Icon.js'
import { AppCheckbox } from './AppCheckbox.js'
import './MediaListItem.css'

export interface MediaListItemProps {
  /** Main line — playlist name, artist/album value, … */
  name: string
  /** Secondary line under the name (usually a song count). */
  subtitle?: string
  /** Fully resolved cover URL (caller runs `buildCoverUrl`). */
  coverUrl?: string
  isPlaying?: boolean
  selectMode?: boolean
  isSelected?: boolean
  onTap?: () => void
  onPlayAll?: () => void
}

/**
 * A horizontal list row for a media collection — cover + name + subtitle +
 * play-all button. Extracted from the playlists list view so every list-mode
 * collection (playlists, artists, albums, …) shares one implementation.
 */
export function MediaListItem({
  name,
  subtitle,
  coverUrl,
  isPlaying,
  selectMode,
  isSelected,
  onTap,
  onPlayAll,
}: MediaListItemProps) {
  return (
    <view
      className={'media-list-item' + (isPlaying ? ' media-list-item--playing' : '')}
      bindtap={() => onTap?.()}
    >
      {selectMode
        ? (
          <view className='media-list-item__check'>
            <AppCheckbox checked={isSelected ?? false} />
          </view>
        )
        : null}
      <view className='media-list-item__cover-wrap'>
        {coverUrl
          ? <image className='media-list-item__cover' src={coverUrl} mode='aspectFill' />
          : (
            <view className='media-list-item__cover media-list-item__cover--empty'>
              <Icon name='music' size={20} color={ICON_COLORS.contentMuted} />
            </view>
          )}
      </view>
      <view className='media-list-item__info'>
        <text className='media-list-item__name'>{name}</text>
        {subtitle ? <text className='media-list-item__subtitle'>{subtitle}</text> : null}
      </view>
      {onPlayAll && !selectMode
        ? (
          <view
            className='media-list-item__play-btn'
            catchtap={() => { onPlayAll() }}
          >
            <Icon name='play' size={16} color={ICON_COLORS.content} />
          </view>
        )
        : null}
    </view>
  )
}
