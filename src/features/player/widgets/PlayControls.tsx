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
import { PlayerToolBar } from './PlayerToolBar.js'
import { SeekStepButton } from './SeekStepButton.js'
import './PlayControls.css'

/** Icon shown on the play-mode toggle for each mode. */
const MODE_ICON: Record<PlayMode, IconName> = {
  order: 'order',
  loop: 'repeat',
  single: 'repeat-one',
  random: 'shuffle',
  singlePlay: 'play',
}

/** i18n key for the play-mode toggle label per mode. */
const MODE_LABEL_KEY: Record<PlayMode, string> = {
  order: 'player.modeOrder',
  loop: 'player.modeLoop',
  single: 'player.modeSingle',
  random: 'player.modeRandom',
  singlePlay: 'player.modeSinglePlay',
}

/** Favorite toggle. Split out so its react-query hooks stay off the transport row. */
function FavoriteButton({ songId, slot }: { songId: number, slot: number }) {
  const { t } = useTranslation()
  const { isFavorite, toggle, isPending } = useFavoriteToggle(songId)

  return (
    // Names the *action*, not the state: "favorited" does not tell you what a tap
    // will do. Written above the tag rather than inside it because `openingTags()`
    // elides block comments only — a line comment with a quote in it flips the
    // scanner's quote state and swallows the following tags (batch 67).
    <view
      className={isPending
        ? 'player-controls__btn player-controls__btn--disabled'
        : 'player-controls__btn'}
      style={{ width: `${slot}px`, height: `${slot}px` }}
      bindtap={isPending ? undefined : toggle}
      accessibility-element={true}
      accessibility-label={isFavorite ? t('player.unfavorite') : t('player.favorite')}
      data-testid='favorite-btn'
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
  /** Edge length of the secondary controls and tool buttons. */
  slot: number
  /** Current song id, for the favorite toggle. Omitted ⇒ no favorite button. */
  songId?: number
}

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
    { key: 'singlePlay', label: t('player.modeSinglePlay'), icon: 'play', selected: playMode === 'singlePlay' },
  ]

  return (
    <>
      <view className='player-controls__transport'>
        <view
          className={canPrev
            ? 'player-controls__btn'
            : 'player-controls__btn player-controls__btn--disabled'}
          style={slotBox}
          data-testid='prev-btn'
          bindtap={canPrev ? () => usePlayerStore.getState().playPrev() : undefined}
          accessibility-element={true}
          accessibility-label={t('common.previous')}
          accessibility-traits={canPrev ? 'button' : 'disabled'}
        >
          <Icon name='skip-prev' size={26} color={ICON_COLORS.content} />
        </view>

        <SeekStepButton forward={false} slot={slot} />

        <view
          className='player-controls__btn player-controls__btn--primary'
          style={{
            width: `${playBtn}px`,
            height: `${playBtn}px`,
            borderRadius: `${playRadius}px`,
          }}
          bindtap={() => usePlayerStore.getState().togglePlay()}
          accessibility-element={true}
          accessibility-label={isPlaying ? t('common.pause') : t('common.play')}
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
                size={Math.round(playBtn * 0.6)}
                color={ICON_COLORS.primaryContent}
              />
            )}
        </view>

        <SeekStepButton forward={true} slot={slot} />

        <view
          className={canNext
            ? 'player-controls__btn'
            : 'player-controls__btn player-controls__btn--disabled'}
          style={slotBox}
          data-testid='next-btn'
          bindtap={canNext ? () => usePlayerStore.getState().playNext() : undefined}
          accessibility-element={true}
          accessibility-label={t('common.next')}
          accessibility-traits={canNext ? 'button' : 'disabled'}
        >
          <Icon name='skip-next' size={26} color={ICON_COLORS.content} />
        </view>
      </view>

      <PlayerToolBar
        slot={slot}
        trailing={songId == null ? undefined : <FavoriteButton songId={songId} slot={slot} />}
        leading={
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
                <text className='player-controls__mode-label'>{t(MODE_LABEL_KEY[playMode])}</text>
              </view>
            }
            items={modeItems}
            onSelect={(key) => {
              usePlayerStore.getState().setPlayMode(key as PlayMode)
              void writeDefaultPlayMode(key as PlayMode)
            }}
          />
        }
      />
    </>
  )
}
