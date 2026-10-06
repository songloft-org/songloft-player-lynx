import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { BackdropBlur } from '../../../shared/ui/BackdropBlur.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { useFavoriteToggle } from '../../library/data/favorites.js'
import { cachedSongIdentity } from '../domain/offline-cache.js'
import { hasNext, hasPrev, progressOf, usePlayerStore } from '../store/index.js'
import '../../../shared/ui/overlay-motion.css'
import '../../../shared/ui/glass-sheen-motion.css'
import './MiniPlayer.css'

/**
 * Persistent mini-player, mounted in the shell above the bottom nav (narrow) /
 * at the foot of the content column (wide). Only rendered when a song is loaded.
 * Tapping the body opens the full `/player`; the play/pause button uses
 * `catchtap` so it does not also trigger the open. A thin non-interactive
 * progress bar (plain views — no gesture leaf) tracks position.
 */
/**
 * The prev/next controls are the only ones here that can be disabled. Exposing a
 * disabled control as a plain accessibility element would announce an action that
 * cannot happen, so its trait switches to `disabled`.
 *
 * Not `'button,disabled'`: Lynx's converter does split a comma list and OR the
 * traits, but the typed prop is a union of single tokens, so one of the two has
 * to go. Written as a helper rather than inline because prose inside a JSX
 * opening tag is a trap — `openingTags()` elides block comments only, so a line
 * comment carrying an apostrophe flips the scanner's quote state and swallows
 * every following tag (this is what put `mini-player__play` into the tappable
 * roster of `a11y-tap-target.test.ts`).
 */
function accessibilityTrait(enabled: boolean) {
  return enabled ? 'button' : 'disabled'
}

export function MiniPlayer() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const song = usePlayerStore((s) => s.currentSong)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const progress = usePlayerStore(progressOf)
  const canNext = usePlayerStore(hasNext)
  const canPrev = usePlayerStore(hasPrev)
  const { isFavorite, toggle: toggleFavorite, isPending: isFavPending } =
    useFavoriteToggle(song?.id ?? 0, song != null && !cachedSongIdentity(song))

  if (!song) return null

  const cover = song.coverUrl ? buildCoverUrl(song.coverUrl, song.updatedAt) : ''
  const subtitle = [song.artist, song.album].filter(Boolean).join(' · ')
  const pct = `${Math.round(progress * 100)}%`

  return (
    <view className='mini-player overlay--enter-scale glass-sheen-breathe' bindtap={() => navigate({ to: '/player' })}>
      {/* Panel-mode blur — same reason as the nav capsule below it: this bar
          floats over scrolling content with no scrim of its own. The root's
          `bindtap` still receives taps, since a child bubbles to it. */}
      <BackdropBlur className='ui-backdrop-blur--pill' container />
      <view className='mini-player__progress'>
        <view className='mini-player__progress-fill' style={{ width: pct }} />
      </view>
      <view className='mini-player__row'>
        {cover
          ? <image className='mini-player__cover' mode='aspectFill' src={cover} />
          : <view className='mini-player__cover mini-player__cover--empty' />}
        <view className='mini-player__meta'>
          <text className='mini-player__title'>{song.title}</text>
          {subtitle ? <text className='mini-player__subtitle'>{subtitle}</text> : null}
        </view>
        <view className='mini-player__transport'>
          <view
            className={canPrev
              ? 'mini-player__btn'
              : 'mini-player__btn mini-player__btn--disabled'}
            catchtap={canPrev ? () => usePlayerStore.getState().playPrev() : undefined}
            accessibility-element={true}
            accessibility-label={t('common.previous')}
            accessibility-traits={accessibilityTrait(canPrev)}
          >
            <Icon name='skip-prev' size={22} color={ICON_COLORS.content} />
          </view>
          <view
            className='mini-player__play-hit'
            catchtap={() => usePlayerStore.getState().togglePlay()}
            accessibility-element={true}
            accessibility-label={isPlaying ? t('common.pause') : t('common.play')}
          >
            <view className='mini-player__play'>
              <Icon name={isPlaying ? 'pause' : 'play'} size={18} color={ICON_COLORS.primaryContent} />
            </view>
          </view>
          <view
            className={canNext
              ? 'mini-player__btn'
              : 'mini-player__btn mini-player__btn--disabled'}
            catchtap={canNext ? () => usePlayerStore.getState().playNext() : undefined}
            accessibility-element={true}
            accessibility-label={t('common.next')}
            accessibility-traits={accessibilityTrait(canNext)}
          >
            <Icon name='skip-next' size={22} color={ICON_COLORS.content} />
          </view>
        </view>
        {(!cachedSongIdentity(song)) && <view
          className={isFavPending
            ? 'mini-player__favorite mini-player__favorite--pending'
            : 'mini-player__favorite'}
          catchtap={isFavPending ? undefined : toggleFavorite}
          accessibility-element={true}
          accessibility-label={isFavorite ? t('player.unfavorite') : t('player.favorite')}
          data-testid='mini-favorite-btn'
        >
          <Icon
            name={isFavorite ? 'heart-filled' : 'heart'}
            size={20}
            color={isFavorite ? ICON_COLORS.primary : ICON_COLORS.content2}
          />
        </view>}
      </view>
    </view>
  )
}
