import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { PopoverMenu } from '../../../shared/ui/PopoverMenu.js'
import type { PopoverMenuItem } from '../../../shared/ui/PopoverMenu.js'
import { usePlayerStore } from '../store/index.js'
import { VolumePopover } from './VolumePopover.js'
import './PlayerToolBar.css'

/** Playback rates offered by the speed menu, matching Flutter's list. */
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export interface PlayerToolBarProps {
  /** Edge length of one control's hit box, from `player-layout.ts`. */
  slot: number
}

/**
 * `[cast · volume · speed · queue]` — the player's secondary controls.
 *
 * These four all used to sit in the top bar, alongside the collapse button and the
 * album name. Flutter keeps that row down here, below the transport, which is both
 * less crowded and a better match for how often they are used.
 */
export function PlayerToolBar({ slot }: PlayerToolBarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const speed = usePlayerStore((s) => s.speed)
  const [showSpeed, setShowSpeed] = useState(false)

  const box = { width: `${slot}px`, height: `${slot}px` }

  const speedItems: PopoverMenuItem[] = SPEEDS.map((s) => ({
    key: String(s),
    label: s === 1 ? t('player.speedNormal') : `${s}x`,
    selected: speed === s,
  }))

  return (
    <view className='player-tools'>
      {/* No DLNA module (Web, or a build without it) ⇒ the cast screen could only ever
          scan forever, so do not offer the entry at all. */}
      {getPlatformCapabilities().dlna
        ? (
          <view
            className='player-tools__btn'
            style={box}
            bindtap={() => void navigate({ to: '/player/dlna' })}
            data-testid='full-player-dlna'
          >
            <Icon name='cast' size={20} color={ICON_COLORS.content} />
          </view>
        )
        : null}

      <VolumePopover slot={slot} />

      <PopoverMenu
        show={showSpeed}
        onShowChange={setShowSpeed}
        placement='top'
        triggerClassName='player-tools__btn'
        trigger={
          <view className='player-tools__hit' style={box} data-testid='speed-btn'>
            {/* Text, not an icon: the current rate is the useful label, and it is the
                only control here whose state is a number. */}
            <text
              className={speed !== 1
                ? 'player-tools__speed player-tools__speed--active'
                : 'player-tools__speed'}
            >
              {speed}x
            </text>
          </view>
        }
        items={speedItems}
        onSelect={(key) => { void usePlayerStore.getState().setSpeed(Number(key)) }}
      />

      <view
        className='player-tools__btn'
        style={box}
        bindtap={() => usePlayerStore.getState().togglePlaylistDrawer()}
        data-testid='queue-btn'
      >
        <Icon name='queue' size={20} color={ICON_COLORS.content} />
      </view>
    </view>
  )
}
