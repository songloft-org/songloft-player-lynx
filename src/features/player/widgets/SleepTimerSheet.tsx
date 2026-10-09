import { useRef, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { PromptDialog } from '../../../shared/ui/PromptDialog.js'
import { usePlayerStore } from '../store/index.js'
import {
  formatSleepRemaining,
  parseIntegerInRange,
  SLEEP_TIMER_MINUTES_RANGE,
  SLEEP_TIMER_SONGS_RANGE,
  supportsAfterSongs,
  type IntegerRange,
  type SleepTimerStatus,
} from '../domain/sleep-timer.js'
import { ModalMaterial } from '../../../shared/ui/ModalMaterial.js'
import { ModalScrim } from '../../../shared/ui/ModalScrim.js'
import { usePresence } from '../../../shared/ui/usePresence.js'
import '../../../shared/ui/overlay-motion.css'
import './SheetShell.css'
import './SleepTimerSheet.css'

const DURATION_OPTIONS = [15, 30, 45, 60, 90]

const SONG_COUNT_OPTIONS = [1, 3, 5]

/** Which custom-value dialog is open, if any. */
type CustomKind = 'duration' | 'songs'

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
  const sleepTimer = usePlayerStore((s) => s.sleepTimer)
  const song = usePlayerStore((s) => s.currentSong)
  const [custom, setCustom] = useState<CustomKind | null>(null)

  const lastCustomRef = useRef<CustomKind>('duration')
  if (custom != null) lastCustomRef.current = custom
  const activeCustom = custom ?? lastCustomRef.current

  useBackHandler(show, () => {
    onClose()
    return true
  })

  function selectDuration(minutes: number) {
    usePlayerStore.getState().setSleepTimerByDuration(minutes * 60_000)
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

  const customRange: IntegerRange = activeCustom === 'songs'
    ? SLEEP_TIMER_SONGS_RANGE
    : SLEEP_TIMER_MINUTES_RANGE

  function validateCustom(raw: string): string | undefined {
    const parsed = parseIntegerInRange(raw, customRange)
    if (parsed.ok) return undefined
    if (parsed.reason === 'empty') return t('player.enterNumber')
    if (parsed.reason === 'notInteger') return t('player.enterValidInteger')
    return t('player.enterIntegerInRange', { min: customRange.min, max: customRange.max })
  }

  function confirmCustom(raw: string) {
    const parsed = parseIntegerInRange(raw, customRange)
    if (!parsed.ok) return
    const kind = custom
    setCustom(null)
    if (kind === 'songs') selectSongCount(parsed.value)
    else selectDuration(parsed.value)
  }

  const statusLabel = sleepTimer
    ? sleepTimer.mode === 'duration'
      ? formatSleepRemaining(sleepTimer.remainingMs ?? 0)
      : t(sleepTimer.remainingSongs === 1
          ? 'player.sleepTimerSongsLeftOne'
          : 'player.sleepTimerSongsLeft',
        { count: sleepTimer.remainingSongs ?? 0 })
    : undefined

  const { mounted, leaving } = usePresence(show)
  if (!mounted) return null

  const leaveClass = leaving ? ' overlay--leave-fade' : ''
  const panelMotion = leaving ? 'overlay--leave-up' : 'overlay--enter-up'

  return (
    <>
      <view className='drawer__root' data-testid='sleep-timer-sheet'>
        {/* Light page dim; the content panel owns its local material. */}

        <ModalScrim className={`drawer__backdrop${leaveClass}`} bindtap={onClose} />
        <view className={`drawer__panel drawer__panel--sleep ${panelMotion}`} catchtap={() => {}}>
          <ModalMaterial shape='sheet' captureTarget='songloft-player-content' />
          <view className='drawer__handle-wrap'>
            <view className='drawer__handle' />
          </view>
          <view className='drawer__header'>
            <text className='drawer__title'>{t('player.sleepTimer')}</text>
          </view>

          <scroll-view className='drawer__list sleep-timer__body' scroll-y>
            {statusLabel
              ? (
                <view className='sleep-timer__status'>
                  <Icon name='timer' size={18} color={ICON_COLORS.primary} />
                  <text className='sleep-timer__status-text'>{statusLabel}</text>
                  <view
                    className='sleep-timer__cancel'
                    bindtap={cancel}
                    data-testid='sleep-timer-cancel'
                  >
                    <text className='sleep-timer__cancel-text'>
                      {t('player.sleepTimerOff')}
                    </text>
                  </view>
                </view>
              )
              : null}

            <text className='sleep-timer__section'>{t('player.sleepTimerByDuration')}</text>
            <view className='sleep-timer__chips'>
              {DURATION_OPTIONS.map((minutes) => (
                <view
                  key={`d-${minutes}`}
                  className='sleep-timer__chip'
                  bindtap={() => selectDuration(minutes)}
                  data-testid={`sleep-timer-minutes-${minutes}`}
                >
                  <text className='sleep-timer__chip-text'>
                    {t('player.sleepTimerMinutes', { count: minutes })}
                  </text>
                </view>
              ))}
              <view
                className='sleep-timer__chip sleep-timer__chip--custom'
                bindtap={() => setCustom('duration')}
                data-testid='sleep-timer-custom-duration'
              >
                <Icon name='edit' size={14} color={ICON_COLORS.content2} />
                <text className='sleep-timer__chip-text'>{t('player.custom')}</text>
              </view>
            </view>

            {supportsAfterSongs(song)
              ? (
                <>
                  <text className='sleep-timer__section'>
                    {t('player.sleepTimerBySongs')}
                  </text>
                  <view className='sleep-timer__chips'>
                    {SONG_COUNT_OPTIONS.map((count) => {
                      const active = isActiveSongCount(sleepTimer, count)
                      return (
                        <view
                          key={`s-${count}`}
                          className={active
                            ? 'sleep-timer__chip sleep-timer__chip--active'
                            : 'sleep-timer__chip'}
                          bindtap={() => selectSongCount(count)}
                          data-testid={`sleep-timer-songs-${count}`}
                        >
                          <text
                            className={active
                              ? 'sleep-timer__chip-text sleep-timer__chip-text--active'
                              : 'sleep-timer__chip-text'}
                          >
                            {t(count === 1
                              ? 'common.songCountOne'
                              : 'common.songCountOther', { count })}
                          </text>
                        </view>
                      )
                    })}
                    <view
                      className='sleep-timer__chip sleep-timer__chip--custom'
                      bindtap={() => setCustom('songs')}
                      data-testid='sleep-timer-custom-songs'
                    >
                      <Icon name='edit' size={14} color={ICON_COLORS.content2} />
                      <text className='sleep-timer__chip-text'>{t('player.custom')}</text>
                    </view>
                  </view>
                </>
              )
              : null}
          </scroll-view>
        </view>
      </view>

      <PromptDialog
        show={custom !== null}
        title={activeCustom === 'songs' ? t('player.customSongCount') : t('player.customDuration')}
        label={t('player.enterIntegerInRange', {
          min: customRange.min,
          max: customRange.max,
        })}
        confirmLabel={t('common.confirm')}
        inputType='number'
        validate={validateCustom}
        onConfirm={confirmCustom}
        onCancel={() => setCustom(null)}
        testId='sleep-timer-custom-dialog'
        confirmTestId='sleep-timer-custom-confirm'
        cancelTestId='sleep-timer-custom-cancel'
        errorTestId='sleep-timer-custom-error'
      />
    </>
  )
}
