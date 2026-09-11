import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from './Icon.js'
import { AppCheckbox } from './AppCheckbox.js'
import { useTapAnchor } from './anchored-overlay.js'
import type { AnchorMeasurement } from './anchored-overlay.js'
import './MediaListItem.css'

export interface MediaListItemProps {
  /** Main line — playlist name, artist/album value, … */
  name: string
  /** Secondary line under the name (usually a song count). */
  subtitle?: string
  /** Small chip shown beside the subtitle (e.g. "Pinned"). */
  badge?: string
  /** Fully resolved cover URL (caller runs `buildCoverUrl`). */
  coverUrl?: string
  isPlaying?: boolean
  selectMode?: boolean
  isSelected?: boolean
  onTap?: () => void
  onPlayAll?: () => void
  /**
   * Open this row's action menu. The rect is the `⋯` box, measured here because
   * only the row can address it; the menu itself is mounted outside the
   * scrolling list by the caller. Null when the host could not measure.
   *
   * Optional so the rows that have no menu (artists, albums) are unaffected.
   */
  onMore?: (anchor: AnchorMeasurement | null) => void
  /** Suffix for this row's `data-testid`s, so a list of rows stays addressable. */
  testIdSuffix?: string
}

/**
 * A horizontal list row for a media collection — cover + name + subtitle +
 * play-all button. Extracted from the playlists list view so every list-mode
 * collection (playlists, artists, albums, …) shares one implementation.
 */
export function MediaListItem({
  name,
  subtitle,
  badge,
  coverUrl,
  isPlaying,
  selectMode,
  isSelected,
  onTap,
  onPlayAll,
  onMore,
  testIdSuffix,
}: MediaListItemProps) {
  const { t } = useTranslation()
  const { anchorId, measure } = useTapAnchor()
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
        {/*
          * The badge wraps the subtitle into a row; without a badge the subtitle
          * stays exactly where it was, so the rows that never pass one (artists,
          * albums) keep their original markup and layout.
          */}
        {badge
          ? (
            <view className='media-list-item__meta'>
              <text
                className='media-list-item__badge'
                data-testid={testIdSuffix ? `media-list-item-badge-${testIdSuffix}` : undefined}
              >
                {badge}
              </text>
              {subtitle ? <text className='media-list-item__subtitle'>{subtitle}</text> : null}
            </view>
          )
          : subtitle
            ? <text className='media-list-item__subtitle'>{subtitle}</text>
            : null}
      </view>
      {onPlayAll && !selectMode
        ? (
          <view
            className='media-list-item__play-btn'
            catchtap={() => { onPlayAll() }}
            accessibility-element={true}
            accessibility-label={t('common.play')}
          >
            <Icon name='play' size={16} color={ICON_COLORS.content} />
          </view>
        )
        : null}
      {/*
        * `catchtap`, not `bindtap` — the whole row is tappable, and a bubbling tap
        * would open the menu *and* navigate. The test env does not implement that
        * interception, so it is device/browser-verified only.
        */}
      {onMore && !selectMode
        ? (
          <view
            id={anchorId}
            className='media-list-item__more-btn'
            catchtap={() => { measure((rect) => onMore(rect)) }}
            accessibility-element={true}
            accessibility-label={t('common.more')}
            data-testid={testIdSuffix ? `media-list-item-more-${testIdSuffix}` : undefined}
          >
            <Icon name='more' size={16} color={ICON_COLORS.content} />
          </view>
        )
        : null}
    </view>
  )
}
