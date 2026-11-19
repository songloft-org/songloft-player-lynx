import { useTranslation } from 'react-i18next'

import type { RadioMode } from '../../../models/song.js'
import { SegmentedControl } from '../../settings/widgets/SegmentedControl.js'

const modes: readonly RadioMode[] = ['', 'hls', 'flv', 'audio_only']

export function RadioModeControl({ value, onChange, labelClass }: {
  value: RadioMode
  onChange: (value: RadioMode) => void
  labelClass: string
}) {
  const { t } = useTranslation()
  const labels = {
    '': t('addSongs.radioModeAuto'),
    hls: 'HLS',
    audio_only: t('addSongs.radioModeAudioOnly'),
    flv: 'HTTP-FLV',
  }
  return (
    <view>
      <text className={labelClass}>{t('addSongs.radioMode')}</text>
      <SegmentedControl options={modes} selected={value} onSelect={onChange}
        labelFor={mode => labels[mode]} testId='radio-mode' />
    </view>
  )
}
