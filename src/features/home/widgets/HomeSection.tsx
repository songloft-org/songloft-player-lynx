import type { Playlist } from '../../../models/playlist.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { IconName } from '../../../shared/ui/icons.js'
// Reuse the batch-6 playlist card (cover / music-note placeholder + name +
// song-count). Its `.playlist-card { width: 33.33% }` rule is global CSS, so the
// cards flow three-per-row inside the wrapping grid below, same as the library
// Playlists view.
import { PlaylistCard } from '../../playlist/widgets/PlaylistCard.js'

/**
 * One home content section: a header (optional icon + title + "View all") over a
 * capped, wrapping grid of {@link PlaylistCard}s. Mirrors the Flutter home's
 * "My Playlists" / "My Radios" blocks (`SectionHeader` + grid). When the
 * section's own load failed (and the other section still has data) it shows an
 * inline retry row instead of grid, matching `_SectionLoadError`.
 */
export interface HomeSectionProps {
  title: string
  icon?: IconName
  items: Playlist[]
  failed?: boolean
  onViewAll: () => void
  onRetry?: () => void
  onTapPlaylist: (playlist: Playlist) => void
}

export function HomeSection({
  title,
  icon,
  items,
  failed,
  onViewAll,
  onRetry,
  onTapPlaylist,
}: HomeSectionProps) {
  return (
    <view className='home-section'>
      <view className='home-section__header'>
        {icon
          ? (
            <view className='home-section__icon'>
              <Icon name={icon} size={20} color={ICON_COLORS.primary} />
            </view>
          )
          : null}
        <text className='home-section__title'>{title}</text>
        <view className='home-section__spacer' />
        <view className='home-section__action' bindtap={() => onViewAll()}>
          <text className='home-section__action-text'>View all</text>
        </view>
      </view>

      {failed && items.length === 0
        ? (
          <view className='home-section__error'>
            <text className='home-section__error-text'>Couldn’t load this section.</text>
            {onRetry
              ? (
                <view className='home-section__retry' bindtap={() => onRetry()}>
                  <text className='home-section__retry-text'>Retry</text>
                </view>
              )
              : null}
          </view>
        )
        : (
          <view className='home-section__grid'>
            {items.map((playlist) => (
              <PlaylistCard
                key={String(playlist.id)}
                playlist={playlist}
                onTap={onTapPlaylist}
              />
            ))}
          </view>
        )}
    </view>
  )
}
