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
  onViewAll: () => void
  onRetry?: () => void
  onTapPlaylist: (playlist: Playlist) => void
  playingPlaylistId?: number
  /**
   * Told `false` while a finger is on the strip and `true` when it lifts, so the
   * page's pull-to-refresh can stand down — see the comment on the scroll-view.
   */
  onStripTouch?: (refreshEnabled: boolean) => void
}

export function HomeSection({
  title,
  icon,
  items,
  failed,
  onViewAll,
  onRetry,
  onTapPlaylist,
  playingPlaylistId,
  onStripTouch,
}: HomeSectionProps) {
  const { t } = useTranslation()

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
        : (
          // Structure and attributes here were all established on-device; each line
          // fixes a distinct defect that batch 18b's tag swap introduced or left:
          //
          //  - the scroll-view carries ONLY size + scrolling, with the flex row in an
          //    inner `<view>`. `display:flex` on the scroll-view itself makes the cards
          //    flex items of the scroller's own box, and `.home-section__row` needs
          //    `width: max-content` or it is laid out at viewport width and there is
          //    nothing longer than the viewport to translate;
          //  - `scroll-orientation`, not the deprecated `scroll-x`, whose per-platform
          //    legacy alias is why this ever worked on iOS but not Android. Lynx's
          //    hyphenated attributes are exempt from TypeScript's unknown-property
          //    check, so a wrong name here fails silently (as `placeholder-color` did);
          //  - `enable-nested-scroll` (default false) to coordinate with the vertical
          //    page scroller instead of fighting it. Not declared in `@lynx-js/types`
          //    for `<scroll-view>` — only `<list>` has it — so the bundle assertion in
          //    `home-section-scroll.test.ts` is what proves it ships;
          //  - `onStripTouch` disables the page's `<refresh>` for the duration of a
          //    drag. `<refresh>` otherwise swallows horizontal gestures outright: with
          //    it enabled the strip measured correctly and `scrollTo` moved `scrollX`,
          //    yet nothing moved under a finger and `bindscroll` never fired. It has no
          //    gesture filter of its own, so standing it down is the only lever.
          <scroll-view
            className='home-section__scroll'
            scroll-orientation='horizontal'
            enable-nested-scroll={true}
            bindtouchstart={() => onStripTouch?.(false)}
            bindtouchend={() => onStripTouch?.(true)}
            bindtouchcancel={() => onStripTouch?.(true)}
          >
            <view className='home-section__row'>
              {items.map((playlist) => (
                <PlaylistCard
                  key={String(playlist.id)}
                  playlist={playlist}
                  onTap={onTapPlaylist}
                  isPlaying={playingPlaylistId === playlist.id}
                />
              ))}
            </view>
          </scroll-view>
        )}
    </view>
  )
}
