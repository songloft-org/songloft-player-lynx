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
}

export function PlaylistCard({ playlist, onTap }: PlaylistCardProps) {
  const cover = playlist.coverUrl ? buildCoverUrl(playlist.coverUrl) : ''
  const count = `${playlist.songCount} ${playlist.songCount === 1 ? 'song' : 'songs'}`

  return (
    <view className='playlist-card' bindtap={() => onTap?.(playlist)}>
      {cover
        ? <image className='playlist-card__cover' src={cover} />
        : (
          <view className='playlist-card__cover playlist-card__cover--empty'>
            <Icon name='music' size={28} color={ICON_COLORS.contentMuted} />
          </view>
        )}
      <text className='playlist-card__name'>{playlist.name || 'Untitled'}</text>
      <text className='playlist-card__count'>{count}</text>
    </view>
  )
}
