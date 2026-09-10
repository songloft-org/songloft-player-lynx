import { useTranslation } from 'react-i18next'

import type { Playlist } from '../../../models/playlist.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { IconName } from '../../../shared/ui/icons.js'
// Reuse the batch-6 playlist card (cover / music-note placeholder + name +
// song-count). Its base rules are global CSS tuned for the library's three-per-row
// grid (`width: 33.33%`, cover `height: 96px`); the home strip overrides both into
// a fixed square-cover card through descendant selectors in `HomePage.css`.
import { PlaylistCard } from '../../playlist/widgets/PlaylistCard.js'

/**
 * One home content section: a header (optional icon + title + "View all") over a
 * capped, horizontally scrolling strip of {@link PlaylistCard}s. Mirrors the
 * Flutter home's "My Playlists" / "My Radios" carousels. When the section's own
 * load failed (and the other section still has data) it shows an inline retry row
 * instead of the strip, matching `_SectionLoadError`.
 */
export interface HomeSectionProps {
  title: string
  icon?: IconName
  items: Playlist[]
  failed?: boolean
  /** Section still loading its first page. When true and `items` is empty, no
   * empty state is shown yet — otherwise a section whose query resolves later
   * than its sibling would flash "no playlists" before populating. */
  loading?: boolean
  onViewAll: () => void
  onRetry?: () => void
  onTapPlaylist: (playlist: Playlist) => void
  /** One-tap "play this playlist" from the cover's play disc. Mirrors the
   * PlaylistsView affordance; when omitted the disc does not render. */
  onPlayAll?: (playlist: Playlist) => void
  playingPlaylistId?: number
  /** Title shown in the section's own empty state (items=0, not failed, not
   * loading). Constructive, not an error — styled via `.home-section__empty`. */
  emptyTitle?: string
  /** CTA label for the empty state. Omitted on sections with no sensible
   * "create" target (radios): those show text only, leaving the header's
   * "View all" as the escape so the screen keeps a single accent CTA. */
  emptyActionLabel?: string
  onEmptyAction?: () => void
  /** Wide-screen layout switch, sourced from `HomePage`'s shell-seeded breakpoint
   * (not measured independently here — see songloft-player-lynx#6). */
  isWide: boolean
}

export function HomeSection({
  title,
  icon,
  items,
  failed,
  loading,
  onViewAll,
  onRetry,
  onTapPlaylist,
  onPlayAll,
  playingPlaylistId,
  emptyTitle,
  emptyActionLabel,
  onEmptyAction,
  isWide,
}: HomeSectionProps) {
  const { t } = useTranslation()

  const cards = items.map((playlist) => (
    <PlaylistCard
      key={String(playlist.id)}
      playlist={playlist}
      onTap={onTapPlaylist}
      onPlayAll={onPlayAll}
      isPlaying={playingPlaylistId === playlist.id}
    />
  ))

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
          <text className='home-section__action-text'>{t('home.viewAll')}</text>
        </view>
      </view>

      {failed && items.length === 0
        ? (
          <view className='home-section__error'>
            <text className='home-section__error-text'>{t('home.sectionError')}</text>
            {onRetry
              ? (
                <view className='home-section__retry' bindtap={() => onRetry()}>
                  <text className='home-section__retry-text'>{t('common.retry')}</text>
                </view>
              )
              : null}
          </view>
        )
        : items.length === 0
          ? (loading
              ? null
              : (
                <view className='home-section__empty'>
                  <text className='home-section__empty-title'>{emptyTitle}</text>
                  {onEmptyAction && emptyActionLabel
                    ? (
                      <view className='home-section__empty-action' bindtap={() => onEmptyAction()}>
                        <text className='home-section__empty-action-text'>{emptyActionLabel}</text>
                      </view>
                    )
                    : null}
                </view>
              ))
          : isWide
            ? (
              <view className='home-section__grid'>
                {cards}
              </view>
            )
            : (
              <scroll-view
                className='home-section__scroll'
                scroll-orientation='horizontal'
                enable-nested-scroll={true}
              >
                <view className='home-section__row'>
                  {cards}
                </view>
              </scroll-view>
            )}
    </view>
  )
}
