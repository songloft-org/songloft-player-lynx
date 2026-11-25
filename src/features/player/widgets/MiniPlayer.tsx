import { useEffect, useState, useSyncExternalStore } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { getShellWidth, subscribeShellWidth } from '../../../shared/nav/shell-navigation.js'
import { BREAKPOINTS, useBreakpoint } from '../../../shared/responsive/useBreakpoint.js'
import { useTapAnchor } from '../../../shared/ui/anchored-overlay.js'
import { BackdropBlur } from '../../../shared/ui/BackdropBlur.js'
import { useCapsuleMaterialStyle } from '../../../shared/ui/capsule-material.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { songRowOverlays } from '../../../shared/ui/song-row-overlays.js'
import type { Song } from '../../../models/song.js'
import { useFavoriteToggle } from '../../library/data/favorites.js'
import { cachedSongIdentity } from '../domain/offline-cache.js'
import { loadMiniPlayerControls, miniPlayerControls } from '../data/mini-player-controls.js'
import { writeDefaultPlayMode } from '../../settings/data/settings-prefs.js'
import type { IconName } from '../../../shared/ui/icons.js'
import type { PlayMode } from '../domain/play-mode.js'
import { hasNext, hasPrev, isMuted, progressOf, usePlayerStore } from '../store/index.js'
import { PlayerMoreMenu } from './PlayerMoreMenu.js'
import { PlaylistDrawer } from './PlaylistDrawer.js'
import { SeekStepButton } from './SeekStepButton.js'
import { SleepTimerSheet } from './SleepTimerSheet.js'
import '../../../shared/ui/overlay-motion.css'
import './MiniPlayer.css'

/**
 * The four-button row (play mode + transport) leaves too little title width
 * below this. Mirrors Flutter's `_kPlayModeMinWidth` in `mini_player.dart`:
 * the preference survives, the fourth button just drops out on narrow phones.
 */
const PLAY_MODE_MIN_WIDTH = 340
// Leave room for the six transport slots, four outer actions, cover and title.
const SEEK_CONTROLS_MIN_WIDTH = 616

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
  const song = usePlayerStore((s) => s.currentSong)
  return song ? <MiniPlayerBar song={song} /> : null
}

function MiniPlayerBar({ song }: { song: Song }) {
  const navigate = useNavigate()
  const capsuleMaterialStyle = useCapsuleMaterialStyle()
  const { t } = useTranslation()
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const progress = usePlayerStore(progressOf)
  const canNext = usePlayerStore(hasNext)
  const canPrev = usePlayerStore(hasPrev)
  const playMode = usePlayerStore((s) => s.playMode)
  const muted = usePlayerStore(isMuted)
  const sleepTimer = usePlayerStore((s) => s.sleepTimer)
  const volumeAnchor = useTapAnchor()
  const controls = useSyncExternalStore(miniPlayerControls.subscribe, () => miniPlayerControls.getState().mode)
  const shellWidth = useSyncExternalStore(subscribeShellWidth, getShellWidth)
  const { width: rowWidth, onLayoutChange } = useBreakpoint(0, '.mini-player__row')
  const showSeek = controls !== 'playOnly'
    && shellWidth >= BREAKPOINTS.tablet
    && rowWidth >= SEEK_CONTROLS_MIN_WIDTH
  const [showSleepTimer, setShowSleepTimer] = useState(false)
  useEffect(() => { void loadMiniPlayerControls() }, [])
  // The volume panel is root-mounted and the queue drawer is store-driven;
  // leaving the shell (or losing the song) must not leave either floating over
  // the next page.
  useEffect(() => () => {
    songRowOverlays.closeMiniVolume()
    usePlayerStore.getState().closePlaylistDrawer()
  }, [])
  const { isFavorite, toggle: toggleFavorite, isPending: isFavPending } =
    useFavoriteToggle(song.id, !cachedSongIdentity(song))

  const cover = song.coverUrl ? buildCoverUrl(song.coverUrl, song.updatedAt) : ''
  const subtitle = [song.artist, song.album].filter(Boolean).join(' · ')
  const pct = `${Math.round(progress * 100)}%`

  return (
    <>
      <view className='mini-player overlay--enter-scale' bindtap={() => navigate({ to: '/player' })}>
      {/* Panel-mode blur — same reason as the nav capsule below it: this bar
          floats over scrolling content with no scrim of its own. The root's
          `bindtap` still receives taps, since a child bubbles to it. */}
      <BackdropBlur className='ui-backdrop-blur--pill' />
      <view className='ui-capsule-material' style={capsuleMaterialStyle} flatten={false} accessibility-element={false} />
      <view className='mini-player__progress'>
        <view className='mini-player__progress-fill' style={{ width: pct }} />
      </view>
      <view className='mini-player__row' bindlayoutchange={onLayoutChange}>
        {cover
          ? <image className='mini-player__cover' mode='aspectFill' src={cover} />
          : <view className='mini-player__cover mini-player__cover--empty' />}
        <view className='mini-player__meta'>
          <text className='mini-player__title'>{song.title}</text>
          {subtitle ? <text className='mini-player__subtitle'>{subtitle}</text> : null}
        </view>
        <view className='mini-player__transport'>
          {controls !== 'playOnly' && <view
            className={canPrev
              ? 'mini-player__btn'
              : 'mini-player__btn mini-player__btn--disabled'}
            catchtap={canPrev ? () => usePlayerStore.getState().playPrev() : undefined}
            accessibility-element={true}
            accessibility-label={t('common.previous')}
            accessibility-traits={accessibilityTrait(canPrev)}
          >
            <Icon name='skip-prev' size={22} color={ICON_COLORS.content} />
          </view>}
          {showSeek && <SeekStepButton forward={false} />}
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
          {showSeek && <SeekStepButton forward={true} />}
          {controls !== 'playOnly' && <view
            className={canNext
              ? 'mini-player__btn'
              : 'mini-player__btn mini-player__btn--disabled'}
            catchtap={canNext ? () => usePlayerStore.getState().playNext() : undefined}
            accessibility-element={true}
            accessibility-label={t('common.next')}
            accessibility-traits={accessibilityTrait(canNext)}
          >
            <Icon name='skip-next' size={22} color={ICON_COLORS.content} />
          </view>}
          {controls === 'prevNextMode' && shellWidth >= PLAY_MODE_MIN_WIDTH && <view
            className='mini-player__btn'
            catchtap={() => {
              const player = usePlayerStore.getState()
              player.cyclePlayMode()
              void writeDefaultPlayMode(usePlayerStore.getState().playMode)
            }}
            accessibility-element={true}
            accessibility-label={t(`player.${{ order: 'modeOrder', loop: 'modeLoop', single: 'modeSingle', random: 'modeRandom', singlePlay: 'modeSinglePlay' }[playMode]}`)}
            data-testid='mini-play-mode'
          >
            <Icon name={({ order: 'order', loop: 'repeat', single: 'repeat-one', random: 'shuffle', singlePlay: 'play' } satisfies Record<PlayMode, IconName>)[playMode]} size={20} color={ICON_COLORS.content} />
          </view>}
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
        {/* Wide-only, like the favorite: phone capsules have no room for a
            fifth control, and hardware keys cover volume there. */}
        <view
          id={volumeAnchor.anchorId}
          className='mini-player__btn mini-player__volume'
          catchtap={() => {
            volumeAnchor.measure((anchor) => songRowOverlays.openMiniVolume(anchor))
          }}
          accessibility-element={true}
          accessibility-label={t('player.volume')}
          data-testid='mini-volume-btn'
        >
          <Icon
            name={muted ? 'volume-mute' : 'volume'}
            size={20}
            color={ICON_COLORS.content2}
          />
        </view>
        {/* Queue and overflow: wide-only, like the favorite and volume. The
            Flutter dense capsule grows its row with the same set at tablet
            width; phones keep the transport cluster and open the full player
            for everything else. */}
        <view
          className='mini-player__btn mini-player__wide-action'
          catchtap={() => usePlayerStore.getState().togglePlaylistDrawer()}
          accessibility-element={true}
          accessibility-label={t('player.queue')}
          data-testid='mini-queue-btn'
        >
          <Icon name='queue' size={20} color={ICON_COLORS.content2} />
        </view>
        <PlayerMoreMenu
          song={song}
          onOpenSleepTimer={() => setShowSleepTimer(true)}
          timerActive={sleepTimer != null}
          placement='top-end'
          iconSize={20}
          triggerClassName='mini-player__btn mini-player__wide-action'
          triggerTestId='mini-more-btn'
          // The capsule root opens the full player on tap; a bubbling trigger
          // would open the menu and navigate away in the same gesture.
          stopTriggerPropagation={true}
        />
      </view>
    </view>
    <PlaylistDrawer />
    <SleepTimerSheet show={showSleepTimer} onClose={() => setShowSleepTimer(false)} />
  </>
  )
}
