import { useTranslation } from 'react-i18next'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { SongFacet } from '../../../models/song.js'

/**
 * A single facet card (one aggregated value in a dimension — an artist, album,
 * genre…), used in the categories grid. Shows the representative cover, the
 * value, and the song count. Styled via LUNA tokens.
 */
export interface FacetCardProps {
  facet: SongFacet
  onTap?: (facet: SongFacet) => void
  onPlayAll?: (facet: SongFacet) => void
  layout?: 'grid' | 'list'
}

export function FacetCard({ facet, onTap, onPlayAll, layout = 'grid' }: FacetCardProps) {
  const { t } = useTranslation()
  const cover = facet.coverUrl ? buildCoverUrl(facet.coverUrl) : ''

  if (layout === 'list') {
    return (
      <view className='facet-list-item' bindtap={() => onTap?.(facet)}>
        <view className='facet-list-item__cover-wrap'>
          {cover
            ? <image className='facet-list-item__cover' mode='aspectFill' src={cover} />
            : <view className='facet-list-item__cover facet-list-item__cover--empty' />}
        </view>
        <view className='facet-list-item__info'>
          <text className='facet-list-item__value'>{facet.value || t('common.unknown')}</text>
          <text className='facet-list-item__count'>
            {t(facet.count === 1 ? 'common.songCountOne' : 'common.songCountOther', {
              count: facet.count,
            })}
          </text>
        </view>
        {onPlayAll
          ? (
            <view
              className='facet-list-item__play-btn'
              catchtap={() => { onPlayAll(facet) }}
            >
              <Icon name='play' size={16} color={ICON_COLORS.content} />
            </view>
          )
          : null}
      </view>
    )
  }

  return (
    <view className='facet-card' bindtap={() => onTap?.(facet)}>
      <view className='facet-card__cover-wrap'>
        {cover
          ? <image className='facet-card__cover' mode='aspectFill' src={cover} />
          : <view className='facet-card__cover facet-card__cover--empty' />}
        {onPlayAll
          ? (
            <view
              className='facet-card__play-btn'
              catchtap={() => { onPlayAll(facet) }}
            >
              <Icon name='play' size={14} color={ICON_COLORS.primaryContent} />
            </view>
          )
          : null}
      </view>
      <text className='facet-card__value'>{facet.value || t('common.unknown')}</text>
      <text className='facet-card__count'>
        {t(facet.count === 1 ? 'common.songCountOne' : 'common.songCountOther', {
          count: facet.count,
        })}
      </text>
    </view>
  )
}
