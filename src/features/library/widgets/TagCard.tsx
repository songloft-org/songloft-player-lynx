import { useTranslation } from 'react-i18next'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { useTapAnchor } from '../../../shared/ui/anchored-overlay.js'
import type { AnchorMeasurement } from '../../../shared/ui/anchored-overlay.js'
import type { SongTag } from '../../../models/song-tag.js'

export interface TagCardProps {
  tag: SongTag
  onTap?: (tag: SongTag) => void
  onPlayAll?: (tag: SongTag) => void
  onMore?: (tag: SongTag, anchor: AnchorMeasurement | null) => void
}

export function TagCard({ tag, onTap, onPlayAll, onMore }: TagCardProps) {
  const { t } = useTranslation()
  const { anchorId, measure } = useTapAnchor()
  const cover = tag.coverUrl ? buildCoverUrl(tag.coverUrl) : ''

  return (
    <view className='facet-card' bindtap={() => onTap?.(tag)}>
      <view className='facet-card__cover-wrap'>
        {cover
          ? <image className='facet-card__cover' mode='aspectFill' src={cover} />
          : (
            <view className='facet-card__cover facet-card__cover--empty tag-card__placeholder'>
              {tag.color
                ? <view className='tag-card__dot' style={{ backgroundColor: tag.color }} />
                : <Icon name='label' size={28} color={ICON_COLORS.contentMuted} />}
            </view>
          )}
        {onMore
          ? (
            <view
              id={anchorId}
              className='tag-card__more-hit'
              catchtap={() => { measure((rect) => onMore(tag, rect)) }}
              accessibility-element={true}
              accessibility-label={t('common.more')}
              data-testid={`tag-card-more-${tag.id}`}
            >
              <view className='tag-card__more-btn'>
                <Icon name='more' size={16} color={ICON_COLORS.content} />
              </view>
            </view>
          )
          : null}
        {onPlayAll
          ? (
            <view
              className='facet-card__play-hit'
              catchtap={() => { onPlayAll(tag) }}
              accessibility-element={true}
              accessibility-label={t('common.playAll')}
            >
              <view className='facet-card__play-btn'>
                <Icon name='play' size={14} color={ICON_COLORS.primaryContent} />
              </view>
            </view>
          )
          : null}
      </view>
      <text className='facet-card__value'>{tag.name}</text>
      <text className='facet-card__count'>
        {t(tag.songCount === 1 ? 'common.songCountOne' : 'common.songCountOther', {
          count: tag.songCount,
        })}
        {tag.playlistCount > 0 ? ` · ${t('songTag.playlistCount', { count: tag.playlistCount })}` : ''}
      </text>
    </view>
  )
}
