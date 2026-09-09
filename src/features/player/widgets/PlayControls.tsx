import { useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { PopoverMenu } from '../../../shared/ui/PopoverMenu.js'
import type { PopoverMenuItem } from '../../../shared/ui/PopoverMenu.js'
import type { IconName } from '../../../shared/ui/icons.js'
import { useFavoriteToggle } from '../../library/data/favorites.js'
import { writeDefaultPlayMode } from '../../settings/data/settings-prefs.js'
import { hasNext, hasPrev, usePlayerStore } from '../store/index.js'
import type { PlayMode } from '../domain/play-mode.js'
import './PlayControls.css'

/** Icon shown on the play-mode toggle for each mode. */
const MODE_ICON: Record<PlayMode, IconName> = {
  order: 'order',
  loop: 'repeat',
  single: 'repeat-one',
  random: 'shuffle',
}

/** i18n key for the play-mode toggle label per mode. */
const MODE_LABEL_KEY: Record<PlayMode, string> = {
  order: 'player.modeOrder',
  loop: 'player.modeLoop',
  single: 'player.modeSingle',
  random: 'player.modeRandom',
}

/** Favorite toggle. Split out so its react-query hooks stay off the transport row. */
function FavoriteButton({ songId, slot }: { songId: number, slot: number }) {
  const { t } = useTranslation()
  const { isFavorite, toggle, isPending } = useFavoriteToggle(songId)

  return (
    <view
      className={isPending
        ? 'player-controls__btn player-controls__btn--disabled'
        : 'player-controls__btn'}
      style={{ width: `${slot}px`, height: `${slot}px` }}
      bindtap={isPending ? undefined : toggle}
      data-testid='favorite-btn'
      // Names the *action*, not the state: "favorited" does not tell you what a tap
      // will do.
      aria-label={isFavorite ? t('player.unfavorite') : t('player.favorite')}
    >
      {/* `key` flips on toggle so the wrapper remounts and the bounce animation
          replays from frame 0 — CSS animations do not restart on a class change. */}
      <view key={isFavorite ? 'filled' : 'empty'} className='player-controls__heart'>
        <Icon
          name={isFavorite ? 'heart-filled' : 'heart'}
          size={22}
          color={isFavorite ? ICON_COLORS.primary : ICON_COLORS.content}
        />
      </view>
    </view>
  )
}

export interface PlayControlsProps {
  /** Play/pause edge length, from `player-layout.ts`. */
  playBtn: number
  /** Play/pause corner radius. Half of `playBtn` renders a circle. */
  playRadius: number
  /** Edge length of the secondary controls (mode, prev/next, favorite). */
  slot: number
  /** Current song id, for the favorite toggle. Omitted ⇒ no favorite button. */
  songId?: number
}

/**
 * `[play mode | prev · play/pause · next | favorite]`, mirroring Flutter's transport
 * row.
 *
 * The favorite button is new. The Lynx player had no way to favorite the song you were
 * listening to — the one screen where you most want it. It goes through
 * `useFavoriteToggle`, so it shares the query cache and invalidation with the library's
 * rows instead of tracking its own idea of the state.
 *
 * Sizes arrive as props rather than from CSS: they scale with the screen class, and
 * this repo has no `@media`. Reactive values come through selectors while actions fire
 * via `getState()` inside the handlers, so the buttons do not re-render on action
 * identity.
 */
export function PlayControls({ playBtn, playRadius, slot, songId }: PlayControlsProps) {
  const { t } = useTranslation()
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isBuffering = usePlayerStore((s) => s.isBuffering)
  const playMode = usePlayerStore((s) => s.playMode)
  const canNext = usePlayerStore(hasNext)
  const canPrev = usePlayerStore(hasPrev)
  const [showModePopover, setShowModePopover] = useState(false)

  const slotBox = { width: `${slot}px`, height: `${slot}px` }

  const modeItems: PopoverMenuItem[] = [
    { key: 'order',  label: t('player.modeOrder'),  icon: 'order',      selected: playMode === 'order' },
    { key: 'loop',   label: t('player.modeLoop'),   icon: 'repeat',     selected: playMode === 'loop' },
    { key: 'single', label: t('player.modeSingle'), icon: 'repeat-one', selected: playMode === 'single' },
    { key: 'random', label: t('player.modeRandom'), icon: 'shuffle',    selected: playMode === 'random' },
  ]

  return (
    <view className='player-controls'>
      <PopoverMenu
        show={showModePopover}
        onShowChange={setShowModePopover}
        placement='top-start'
        triggerClassName='player-controls__btn'
        trigger={
          <view className='player-controls__mode-hit' style={slotBox}>
            <Icon
              name={MODE_ICON[playMode]}
              size={20}
              color={playMode !== 'order' ? ICON_COLORS.primary : ICON_COLORS.content2}
            />
            {/* The label is what makes the current mode readable without opening the
                menu; `full-player.test.tsx` asserts exactly one copy of it exists
                while the menu is shut. */}
            <text className='player-controls__mode-label'>{t(MODE_LABEL_KEY[playMode])}</text>
          </view>
        }
        items={modeItems}
        // Persist the picked mode as the default. Without this the pref
        // `src/index.tsx` restores at startup would never be written and the
        // mode would reset every launch.
        onSelect={(key) => {
          usePlayerStore.getState().setPlayMode(key as PlayMode)
          void writeDefaultPlayMode(key as PlayMode)
        }}
      />

      <view className='player-controls__transport'>
        <view
          className={canPrev
            ? 'player-controls__btn'
            : 'player-controls__btn player-controls__btn--disabled'}
          style={slotBox}
          bindtap={() => usePlayerStore.getState().playPrev()}
        >
          <Icon name='skip-prev' size={26} color={ICON_COLORS.content} />
        </view>

        <view
          className='player-controls__btn player-controls__btn--primary'
          style={{
            width: `${playBtn}px`,
            height: `${playBtn}px`,
            borderRadius: `${playRadius}px`,
          }}
          bindtap={() => usePlayerStore.getState().togglePlay()}
        >
          {isBuffering
            ? (
              <text className='player-controls__glyph player-controls__glyph--primary player-controls__glyph--buffering'>
                …
              </text>
            )
            : (
              <Icon
                name={isPlaying ? 'pause' : 'play'}
                // Flutter derives the glyph from the button (`size * 0.6`), so the
                // proportions hold at 52px and at 76px alike.
                size={Math.round(playBtn * 0.6)}
                color={ICON_COLORS.primaryContent}
              />
            )}
        </view>

        <view
          className={canNext
            ? 'player-controls__btn'
            : 'player-controls__btn player-controls__btn--disabled'}
          style={slotBox}
          bindtap={() => usePlayerStore.getState().playNext()}
        >
          <Icon name='skip-next' size={26} color={ICON_COLORS.content} />
        </view>
      </view>

      {/* Empty slot when there is no song, so the transport stays centred rather than
          sliding right the moment the favorite button appears. */}
      {songId != null
        ? <FavoriteButton songId={songId} slot={slot} />
        : <view className='player-controls__btn' style={slotBox} />}
    </view>
  )
}
