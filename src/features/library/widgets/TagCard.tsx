import { useTranslation } from 'react-i18next'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { SongTag } from '../../../models/song-tag.js'

export interface TagCardProps {
  tag: SongTag
  onTap?: (tag: SongTag) => void
  onPlayAll?: (tag: SongTag) => void
}

export function TagCard({ tag, onTap, onPlayAll }: TagCardProps) {
  const { t } = useTranslation()
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
        {onPlayAll
          ? (
            <view
              className='facet-card__play-btn'
              catchtap={() => { onPlayAll(tag) }}
            >
              <Icon name='play' size={14} color={ICON_COLORS.primaryContent} />
            </view>
          )
          : null}
      </view>
      <text className='facet-card__value'>{tag.name}</text>
      <text className='facet-card__count'>
        {t(tag.songCount === 1 ? 'common.songCountOne' : 'common.songCountOther', {
          count: tag.songCount,
        })}
      </text>
    </view>
  )
}
