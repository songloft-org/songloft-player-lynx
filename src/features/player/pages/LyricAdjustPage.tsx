import { useMemo, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import {
  SliderIndicator,
  SliderRoot,
  SliderThumb,
  SliderTrack,
} from '@lynx-js/lynx-ui-slider'

import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { getSongsApi } from '../../library/api/index.js'
import { parseLrc, stringifyLyric } from '../domain/lyric-parser.js'
import { removeCachedLyric } from '../data/lyric-cache.js'
import { usePlayerStore } from '../store/index.js'
import { useLyricStore } from '../store/index.js'
import './LyricAdjustPage.css'

/** Slider range for the global offset, ±10 s at 100 ms granularity (Flutter parity). */
const GLOBAL_RANGE_MS = 10_000
const GLOBAL_STEP_MS = 100

/** Line nudge granularity (Flutter parity: ±100 ms per tap). */
const LINE_STEP_MS = 100

function formatTime(ms: number): string {
  const clamped = Math.max(0, ms)
  const minutes = String(Math.floor(clamped / 60_000)).padStart(2, '0')
  const seconds = String(Math.floor(clamped / 1_000) % 60).padStart(2, '0')
  const millis = String(clamped % 1_000).padStart(3, '0')
  return `${minutes}:${seconds}.${millis}`
}

function formatSigned(ms: number): string {
  return `${ms >= 0 ? '+' : ''}${ms}ms`
}

/**
 * `/player/lyrics/adjust` — lyric timing adjustment, ported from the Flutter
 * `LyricAdjustPage`.
 *
 * Two knobs over the *parsed* LRC: a global offset (slider + quick nudges)
 * applied to every line, and a per-line ±100 ms nudge for the odd line that
 * drifted. Saving re-assembles the LRC (word-level timing is dropped — this
 * page edits line timestamps) and PUTs it with `lyric_source: 'manual'`, then
 * evicts the local lyric cache and reloads, so the player immediately shows
 * the corrected timing.
 *
 * Reached only from the lyrics view's tools row, and only for local songs
 * with synced lyrics (the entry gate lives there, same as the Flutter build).
 */
export function LyricAdjustPage() {
  const { t } = useTranslation()
  const song = usePlayerStore((s) => s.currentSong)
  const rawLyric = useLyricStore((s) => s.rawLyric)

  const [globalOffsetMs, setGlobalOffsetMs] = useState(0)
  const [perLineDeltaMs, setPerLineDeltaMs] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  // Base lines parsed once from the raw LRC — the times never move; every
  // adjustment is layered on top so "reset" is trivial.
  const baseLines = useMemo(() => parseLrc(rawLyric ?? ''), [rawLyric])

  const hasChanges =
    globalOffsetMs !== 0 || Object.values(perLineDeltaMs).some((v) => v !== 0)

  const adjustedTime = (index: number): number => {
    const base = baseLines[index]?.timeMs ?? 0
    const delta = globalOffsetMs + (perLineDeltaMs[index] ?? 0)
    return Math.max(0, base + delta)
  }

  const nudgeGlobal = (deltaMs: number) => {
    setGlobalOffsetMs((prev) =>
      Math.min(GLOBAL_RANGE_MS, Math.max(-GLOBAL_RANGE_MS, prev + deltaMs)))
  }

  const nudgeLine = (index: number, deltaMs: number) => {
    setPerLineDeltaMs((prev) => ({ ...prev, [index]: (prev[index] ?? 0) + deltaMs }))
  }

  const reset = () => {
    setGlobalOffsetMs(0)
    setPerLineDeltaMs({})
  }

  // Back with unsaved changes asks first (the dialog's own back handling takes
  // over while it is open — that is why it is excluded from `active` here).
  const requestClose = (): boolean => {
    if (hasChanges) {
      setConfirmDiscard(true)
      return true
    }
    return performRouteBack()
  }
  useBackHandler(hasChanges && !confirmDiscard, requestClose)

  const onSave = () => {
    if (!song || saving || !hasChanges) return
    setSaving(true)

    const adjusted = baseLines.map((line, index) => ({
      timeMs: adjustedTime(index),
      text: line.text,
    }))
    const newLrc = stringifyLyric(adjusted)

    void getSongsApi().updateLyrics(song.id, { lyricSource: 'manual', lyric: newLrc })
      .then(async ({ fileWriteStatus }) => {
        // Evict the pre-adjustment cache so the player's next load pulls the
        // new text (the lyric URL itself did not change).
        await removeCachedLyric(song.id)
        await useLyricStore.getState().loadForSong(song)

        if (fileWriteStatus === 'written') {
          toast.success(t('lyricAdjust.savedWritten'))
        } else if (fileWriteStatus === 'failed') {
          toast.error(t('lyricAdjust.savedWriteFailed'))
        } else {
          toast.success(t('lyricAdjust.savedDbOnly'))
        }
        performRouteBack()
      })
      .catch((e: unknown) => {
        toast.error(t('songEdit.operationFailed', {
          error: String(e instanceof Error ? e.message : e),
        }))
      })
      .finally(() => setSaving(false))
  }

  return (
    <view className='lyric-adjust'>
      <view className='lyric-adjust__topbar'>
        <view
          className='lyric-adjust__back'
          bindtap={() => requestClose()}
          accessibility-element={true}
          accessibility-label={t('common.back')}
          data-testid='lyric-adjust-back'
        >
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='lyric-adjust__title'>{t('lyricAdjust.title')}</text>
        <view
          className={hasChanges ? 'lyric-adjust__reset' : 'lyric-adjust__reset lyric-adjust__reset--disabled'}
          bindtap={hasChanges ? reset : undefined}
          data-testid='lyric-adjust-reset'
        >
          <text className='lyric-adjust__reset-text'>{t('lyricAdjust.reset')}</text>
        </view>
        <view
          className={saving || !hasChanges
            ? 'lyric-adjust__save lyric-adjust__save--disabled'
            : 'lyric-adjust__save'}
          bindtap={saving || !hasChanges ? undefined : onSave}
          data-testid='lyric-adjust-save'
        >
          <text className='lyric-adjust__save-text'>
            {saving ? t('playlist.saving') : t('playlist.save')}
          </text>
        </view>
      </view>

      {baseLines.length === 0
        ? (
          <view className='lyric-adjust__empty'>
            <text className='lyric-adjust__empty-text'>{t('lyricAdjust.noLines')}</text>
          </view>
        )
        : (
          <scroll-view className='lyric-adjust__body' scroll-y>
            <view className='lyric-adjust__card'>
              <view className='lyric-adjust__card-head'>
                <text className='lyric-adjust__card-title'>{t('lyricAdjust.globalOffset')}</text>
                <text className='lyric-adjust__card-value' data-testid='lyric-adjust-global-value'>
                  {formatSigned(globalOffsetMs)}
                </text>
              </view>

              {/* lynx-ui Slider is 0–1; map ±10 s onto it. Rounding happens on
                  every value change so the readout only ever shows 100 ms steps. */}
              <SliderRoot
                className='lyric-adjust__slider'
                value={(globalOffsetMs + GLOBAL_RANGE_MS) / (GLOBAL_RANGE_MS * 2)}
                onValueChange={(v: number) => {
                  const ms = Math.round((v * GLOBAL_RANGE_MS * 2 - GLOBAL_RANGE_MS) / GLOBAL_STEP_MS)
                    * GLOBAL_STEP_MS
                  setGlobalOffsetMs(ms)
                }}
              >
                <SliderTrack className='lyric-adjust__track'>
                  <SliderIndicator className='lyric-adjust__indicator' />
                  <SliderThumb className='lyric-adjust__thumb-wrap'>
                    <view className='lyric-adjust__thumb' />
                  </SliderThumb>
                </SliderTrack>
              </SliderRoot>

              <view className='lyric-adjust__nudges'>
                {[-500, -100, 100, 500].map((delta) => (
                  <view
                    key={delta}
                    className='lyric-adjust__nudge'
                    bindtap={() => nudgeGlobal(delta)}
                    data-testid={`lyric-adjust-nudge-${delta}`}
                  >
                    <text className='lyric-adjust__nudge-text'>{formatSigned(delta)}</text>
                  </view>
                ))}
              </view>

              <text className='lyric-adjust__hint'>{t('lyricAdjust.offsetHint')}</text>
            </view>

            <view className='lyric-adjust__lines'>
              {baseLines.map((line, index) => {
                const delta = perLineDeltaMs[index] ?? 0
                return (
                  <view key={`${index}:${line.timeMs}`} className='lyric-adjust__line'>
                    <text className='lyric-adjust__line-time'>
                      {`[${formatTime(adjustedTime(index))}]`}
                    </text>
                    <view className='lyric-adjust__line-main'>
                      <text
                        className='lyric-adjust__line-text'
                        text-maxline='2'
                      >
                        {line.text.length > 0 ? line.text : t('lyricAdjust.emptyLine')}
                      </text>
                      {delta !== 0
                        ? (
                          <text className='lyric-adjust__line-delta'>
                            {t('lyricAdjust.lineOffset', { offset: formatSigned(delta) })}
                          </text>
                        )
                        : null}
                    </view>
                    <view
                      className='lyric-adjust__line-btn'
                      bindtap={() => nudgeLine(index, -LINE_STEP_MS)}
                      data-testid={`lyric-adjust-line-${index}-minus`}
                    >
                      <text className='lyric-adjust__line-btn-text'>-</text>
                    </view>
                    <view
                      className='lyric-adjust__line-btn'
                      bindtap={() => nudgeLine(index, LINE_STEP_MS)}
                      data-testid={`lyric-adjust-line-${index}-plus`}
                    >
                      <text className='lyric-adjust__line-btn-text'>+</text>
                    </view>
                  </view>
                )
              })}
            </view>
          </scroll-view>
        )}

      <ConfirmDialog
        show={confirmDiscard}
        title={t('lyricAdjust.discardTitle')}
        message={t('lyricAdjust.discardContent')}
        confirmLabel={t('lyricAdjust.discard')}
        cancelLabel={t('lyricAdjust.continueEditing')}
        onConfirm={() => {
          setConfirmDiscard(false)
          performRouteBack()
        }}
        onCancel={() => setConfirmDiscard(false)}
        testId='lyric-adjust-discard-dialog'
      />
    </view>
  )
}
