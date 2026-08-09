import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { SongFacet } from '../../../models/song.js'

/**
 * A single facet card (one aggregated value in a dimension — an artist, album,
 * genre…), used in the categories grid. Shows the representative cover, the
 * value, and the song count. Styled via LUNA tokens.
 */
export interface FacetCardProps {
  facet: SongFacet
  onTap?: (facet: SongFacet) => void
}

export function FacetCard({ facet, onTap }: FacetCardProps) {
  const cover = facet.coverUrl ? buildCoverUrl(facet.coverUrl) : ''

  return (
    <view className='facet-card' bindtap={() => onTap?.(facet)}>
      {cover
        ? <image className='facet-card__cover' src={cover} />
        : <view className='facet-card__cover facet-card__cover--empty' />}
      <text className='facet-card__value'>{facet.value || 'Unknown'}</text>
      <text className='facet-card__count'>{`${facet.count} songs`}</text>
    </view>
  )
}
