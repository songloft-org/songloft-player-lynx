import { useEffect, useRef } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import {
  SheetBackdrop,
  SheetContent,
  SheetHandle,
  SheetRoot,
  SheetView,
  type SheetRootRef,
} from '@lynx-js/lynx-ui-sheet'

import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { usePlayerStore } from '../store/index.js'
import type { SleepTimerStatus } from '../domain/sleep-timer.js'

const CLAIMED_ANGLES: [number, number][] = [
  [-135, -45],
  [45, 135],
]

const DURATION_OPTIONS = [
  { minutes: 15, ms: 15 * 60_000 },
  { minutes: 30, ms: 30 * 60_000 },
  { minutes: 45, ms: 45 * 60_000 },
  { minutes: 60, ms: 60 * 60_000 },
  { minutes: 90, ms: 90 * 60_000 },
]

const SONG_COUNT_OPTIONS = [1, 3, 5]

function isActiveDuration(timer: SleepTimerStatus | undefined, ms: number): boolean {
  if (!timer || timer.mode !== 'duration') return false
  const diff = Math.abs((timer.remainingMs ?? 0) - ms)
  return diff < 2_000
}

function isActiveSongCount(timer: SleepTimerStatus | undefined, count: number): boolean {
  if (!timer || timer.mode !== 'afterSongs') return false
  return timer.remainingSongs === count
}

export function SleepTimerSheet({
  show,
  onClose,
}: {
  show: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ref = useRef<SheetRootRef>(null)
  const sleepTimer = usePlayerStore((s) => s.sleepTimer)

  useEffect(() => {
    if (show) ref.current?.open()
    else ref.current?.close()
  }, [show])

  // Back closes the sheet through the same `show` prop the drag-to-dismiss gesture
  // reports to, so the imperative ref stays in sync via the effect above.
  useBackHandler(show, () => {
    onClose()
    return true
  })

  function selectDuration(ms: number) {
    usePlayerStore.getState().setSleepTimerByDuration(ms)
    onClose()
  }

  function selectSongCount(count: number) {
    usePlayerStore.getState().setSleepTimerAfterSongs(count)
    onClose()
  }

  function cancel() {
    usePlayerStore.getState().cancelSleepTimer()
    onClose()
  }

  return (
    <SheetRoot
      ref={ref}
      side='bottom'
      snapPoints={['60%']}
      initialSnap={0}
      claimedGestureAngles={CLAIMED_ANGLES}
      onShowChange={(visible: boolean) => {
        if (!visible) onClose()
      }}
    >
      <SheetView className='drawer__viewport'>
        <SheetBackdrop className='drawer__backdrop' />
        <SheetContent className='drawer__content' innerClassName='drawer__inner'>
          <SheetHandle className='drawer__handle' />
          <view className='drawer__header'>
            <text className='drawer__title'>{t('player.sleepTimer')}</text>
          </view>
          <scroll-view className='sleep-timer__list' scroll-y>
            {DURATION_OPTIONS.map(({ minutes, ms }) => {
              const active = isActiveDuration(sleepTimer, ms)
              return (
                <view
                  key={`d-${minutes}`}
                  className={active
                    ? 'sleep-timer__option sleep-timer__option--active'
                    : 'sleep-timer__option'}
                  bindtap={() => selectDuration(ms)}
                >
                  <text
                    className={active
                      ? 'sleep-timer__option-text sleep-timer__option-text--active'
                      : 'sleep-timer__option-text'}
                  >
                    {t('player.sleepTimerMinutes', { count: minutes })}
                  </text>
                  {active
                    ? <Icon name='check' size={18} color={ICON_COLORS.primary} />
                    : null}
                </view>
              )
            })}

            <view className='sleep-timer__divider' />

            {SONG_COUNT_OPTIONS.map((count) => {
              const active = isActiveSongCount(sleepTimer, count)
              return (
                <view
                  key={`s-${count}`}
                  className={active
                    ? 'sleep-timer__option sleep-timer__option--active'
                    : 'sleep-timer__option'}
                  bindtap={() => selectSongCount(count)}
                >
                  <text
                    className={active
                      ? 'sleep-timer__option-text sleep-timer__option-text--active'
                      : 'sleep-timer__option-text'}
                  >
                    {t(count === 1
                      ? 'player.sleepTimerAfterSongsOne'
                      : 'player.sleepTimerAfterSongs', { count })}
                  </text>
                  {active
                    ? <Icon name='check' size={18} color={ICON_COLORS.primary} />
                    : null}
                </view>
              )
            })}

            {sleepTimer
              ? (
                <>
                  <view className='sleep-timer__divider' />
                  <view className='sleep-timer__option' bindtap={cancel}>
                    <text className='sleep-timer__option-text sleep-timer__option-text--off'>
                      {t('player.sleepTimerOff')}
                    </text>
                  </view>
                </>
              )
              : null}
          </scroll-view>
        </SheetContent>
      </SheetView>
    </SheetRoot>
  )
}
