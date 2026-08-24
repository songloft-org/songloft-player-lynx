import { useEffect, useRef, useState } from '@lynx-js/react'
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
import './SheetShell.css'
import './SleepTimerSheet.css'

const CLAIMED_ANGLES: [number, number][] = [
  [-135, -45],
  [45, 135],
]

const DURATION_OPTIONS = [15, 30, 45, 60, 90]

const SONG_COUNT_OPTIONS = [1, 3, 5]

/** Which custom-value dialog is open, if any. */
type CustomKind = 'duration' | 'songs'

function isActiveSongCount(timer: SleepTimerStatus | undefined, count: number): boolean {
  if (!timer || timer.mode !== 'afterSongs') return false
  return timer.remainingSongs === count
}

/**
 * Sleep timer: presets for both modes, plus a custom value for each.
 *
 * Laid out as Flutter's sheet is — two labelled sections of chips rather than one
 * long list of rows. The list version fit about seven rows in the 60% sheet, so
 * "after N songs" was below the fold and read as a missing feature; chips put both
 * modes on screen at once, which is the whole point of having section headers.
 *
 * Three details carried over from the Flutter build:
 *
 *  - **Duration chips are never highlighted.** The countdown ticks every second, so
 *    `remainingMs` stops equalling the preset that started it a second later —
 *    highlighting by comparison would flicker off. Feedback for a running timer is
 *    the status row here (and the countdown beside the `⋯` button), which shows the
 *    real remaining time rather than which button was pressed. Song counts *are*
 *    highlighted: that value only changes when a track ends.
 *  - **"By songs" disappears for a live stream**, because a stream never completes a
 *    song and the timer would never fire (`supportsAfterSongs`).
 *  - **Custom values are validated with a message, not silently clamped**: 1–999
 *    minutes, 1–99 songs.
 *
 * The custom dialog is a **sibling of the sheet**, never a child: `SheetContent`
 * animates itself with a `transform`, which would become the containing block for
 * the dialog's `position: fixed` layers and drag them along with the sheet.
 */
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
  const song = usePlayerStore((s) => s.currentSong)
  const [custom, setCustom] = useState<CustomKind | null>(null)

  /*
   * The custom dialog stays mounted through its close animation, so anything its
   * title / range derive from must not re-derive while `custom` is already null —
   * otherwise closing the *songs* dialog flashes the *duration* title and range
   * (the `=== 'songs'` fallbacks) for the length of the fade before it unmounts.
   * Freeze the last real kind and read display values off that; `show` and the
   * confirm action still key off `custom` itself.
   */
  const lastCustomRef = useRef<CustomKind>('duration')
  if (custom != null) lastCustomRef.current = custom
  const activeCustom = custom ?? lastCustomRef.current

  useEffect(() => {
    if (show) ref.current?.open()
    else ref.current?.close()
  }, [show])

  // Back closes the sheet through the same `show` prop the drag-to-dismiss gesture
  // reports to, so the imperative ref stays in sync via the effect above.
  // The dialog registers its own layer when opened, so back peels that one first.
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

  /** Maps the parser's reason to Flutter's three messages. */
  function validateCustom(raw: string): string | undefined {
    const parsed = parseIntegerInRange(raw, customRange)
    if (parsed.ok) return undefined
    if (parsed.reason === 'empty') return t('player.enterNumber')
    if (parsed.reason === 'notInteger') return t('player.enterValidInteger')
    return t('player.enterIntegerInRange', { min: customRange.min, max: customRange.max })
  }

  function confirmCustom(raw: string) {
    const parsed = parseIntegerInRange(raw, customRange)
    // Unreachable: `validate` runs first and blocks the submit. Guarded rather than
    // asserted so a future caller cannot turn it into a NaN timer.
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

  return (
    <>
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

            <scroll-view className='sleep-timer__body' scroll-y>
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
          </SheetContent>
        </SheetView>
      </SheetRoot>

      <PromptDialog
        show={custom !== null}
        title={activeCustom === 'songs' ? t('player.customSongCount') : t('player.customDuration')}
        // The range doubles as the field's hint, which is also the out-of-range
        // message — one sentence to read instead of two to reconcile.
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
