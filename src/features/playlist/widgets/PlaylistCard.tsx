import { useTranslation } from 'react-i18next'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Playlist } from '../../../models/playlist.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'

/**
 * A single playlist grid card, ported (trimmed) from the Flutter `PlaylistCard`
 * (grid `BrowseCard`): cover (or a music-note placeholder) + name + song count.
 * Edit / delete / play-all / visibility menus from the Flutter card are deferred
 * (see PROGRESS). Styled entirely via LUNA tokens.
 */
export interface PlaylistCardProps {
  playlist: Playlist
  onTap?: (playlist: Playlist) => void
  isPlaying?: boolean
}

export function PlaylistCard({ playlist, onTap, isPlaying }: PlaylistCardProps) {
  const { t } = useTranslation()
  const cover = playlist.coverUrl ? buildCoverUrl(playlist.coverUrl, playlist.updatedAt) : ''
  const count = t(
    playlist.songCount === 1 ? 'common.songCountOne' : 'common.songCountOther',
    { count: playlist.songCount },
  )

  return (
    <view
      className={'playlist-card' + (isPlaying ? ' playlist-card--playing' : '')}
      bindtap={() => onTap?.(playlist)}
    >
      <view className='playlist-card__cover-wrap'>
        {cover
          // `mode` is Lynx's fitting control (there is no `object-fit` CSS property
          // on `<image>`). Without it the default `scaleToFill` stretches covers to
          // the box — visible as squashed art now that the home strip uses a square.
          // `aspectFill` == Flutter's `BoxFit.cover`, which the reference card used.
          ? <image className='playlist-card__cover' mode='aspectFill' src={cover} />
          : (
            <view className='playlist-card__cover playlist-card__cover--empty'>
              <Icon name='music' size={28} color={ICON_COLORS.contentMuted} />
            </view>
          )}
        {playlist.isBuiltIn
          ? (
            <view className='playlist-card__badge' data-testid={`playlist-card-builtin-${playlist.id}`}>
              <Icon name='heart-filled' size={12} color={ICON_COLORS.primaryContent} />
            </view>
          )
          : null}
      </view>
      <text className='playlist-card__name'>{playlist.name || t('common.untitled')}</text>
      <text className='playlist-card__count'>{count}</text>
    </view>
  )
}
