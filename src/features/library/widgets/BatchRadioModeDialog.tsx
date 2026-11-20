import { useEffect, useState } from '@lynx-js/react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import type { RadioMode } from '../../../models/song.js'
import { AppCheckbox } from '../../../shared/ui/AppCheckbox.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { SegmentedControl } from '../../settings/widgets/SegmentedControl.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { getSongsApi } from '../api/index.js'
import './BatchRadioModeDialog.css'

const RADIO_MODES: readonly RadioMode[] = ['', 'hls', 'flv', 'audio_only']

export interface BatchRadioModeTarget {
  songIds: number[]
  onUpdated?: (updated: number) => void
}

export interface BatchRadioModeDialogProps {
  target: BatchRadioModeTarget | null
  onClose: () => void
}

export function BatchRadioModeDialog({ target, onClose }: BatchRadioModeDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<RadioMode>('')
  const [updateVideo, setUpdateVideo] = useState(false)
  const [video, setVideo] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const targetKey = target?.songIds.join(',') ?? ''
  useEffect(() => {
    if (targetKey) {
      setMode('')
      setUpdateVideo(false)
      setVideo(false)
      setSubmitting(false)
    }
  }, [targetKey])

  const submit = () => {
    if (!target || submitting) return
    setSubmitting(true)
    void getSongsApi().batchUpdateRadioMode({
      ids: target.songIds,
      radioMode: mode,
      ...(mode === 'audio_only' || !updateVideo ? {} : { isVideo: video }),
    })
      .then((updated) => {
        void queryClient.invalidateQueries({ queryKey: ['library'] })
        void queryClient.invalidateQueries({ queryKey: ['playlist'] })
        toast.success(t('library.radioModeUpdated', { updated, total: target.songIds.length }))
        target.onUpdated?.(updated)
        onClose()
      })
      .catch((error) => {
        toast.error(error instanceof Error && error.message ? error.message : t('library.radioModeUpdateFailed'))
      })
      .finally(() => setSubmitting(false))
  }

  const labels: Record<RadioMode, string> = {
    '': t('library.radioModeAuto'),
    hls: 'HLS',
    audio_only: t('library.radioModeAudioOnly'),
    flv: 'HTTP-FLV',
  }

  return (
    <ConfirmDialog
      show={target != null}
      title={t('library.batchRadioModeTitle')}
      message={t('library.batchRadioModeMessage', { count: target?.songIds.length ?? 0 })}
      confirmLabel={submitting ? t('common.loading') : t('common.confirm')}
      onConfirm={submit}
      onCancel={submitting ? () => {} : onClose}
      testId='batch-radio-mode-dialog'
      confirmTestId='batch-radio-mode-confirm'
      cancelTestId='batch-radio-mode-cancel'
    >
      <view className='batch-radio-mode__body'>
        <text className='batch-radio-mode__label'>{t('library.radioMode')}</text>
        <SegmentedControl
          options={RADIO_MODES}
          selected={mode}
          onSelect={setMode}
          labelFor={(value) => labels[value]}
          testId='batch-radio-mode-options'
        />
        <view
          className='batch-radio-mode__video-option'
          bindtap={() => setUpdateVideo(value => !value)}
          data-testid='batch-radio-mode-update-video'
        >
          <AppCheckbox checked={updateVideo} />
          <text className='batch-radio-mode__video-title'>{t('library.batchRadioModeUpdateVideo')}</text>
        </view>
        {updateVideo && mode !== 'audio_only'
          ? (
            <view className='batch-radio-mode__video-switch'>
              <text className='batch-radio-mode__video-title'>{t('addSongs.videoToggleTitle')}</text>
              <AppSwitch checked={video} onChange={setVideo} />
            </view>
          )
          : null}
        {mode === 'audio_only'
          ? <text className='batch-radio-mode__hint'>{t('library.batchRadioModeAudioHint')}</text>
          : null}
      </view>
    </ConfirmDialog>
  )
}
