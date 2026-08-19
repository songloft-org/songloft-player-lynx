import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { useLyricStore } from '../store/index.js'
import './LyricCalibratePage.css'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'

export function LyricCalibratePage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const offsetMs = useLyricStore((s) => s.offsetMs)
  const adjustOffset = useLyricStore((s) => s.adjustOffset)
  const setOffset = useLyricStore((s) => s.setOffset)

  const sign = offsetMs >= 0 ? '+' : ''
  const display = `${sign}${(offsetMs / 1000).toFixed(1)}s`

  return (
    <view className='lyric-calibrate'>
      <view className='lyric-calibrate__topbar'>
        <view className='lyric-calibrate__back' bindtap={() => performRouteBack()}>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='lyric-calibrate__title'>{t('lyricCalibrate.title')}</text>
        <view className='lyric-calibrate__reset' bindtap={() => setOffset(0)}>
          <text className='lyric-calibrate__reset-text'>{t('lyricCalibrate.reset')}</text>
        </view>
      </view>

      <view className='lyric-calibrate__body'>
        <text className='lyric-calibrate__hint'>{t('lyricCalibrate.hint')}</text>
        <text className='lyric-calibrate__value'>{display}</text>

        <view className='lyric-calibrate__controls'>
          <view className='lyric-calibrate__btn' bindtap={() => adjustOffset(-500)}>
            <text className='lyric-calibrate__btn-text'>-0.5s</text>
          </view>
          <view className='lyric-calibrate__btn' bindtap={() => adjustOffset(-100)}>
            <text className='lyric-calibrate__btn-text'>-0.1s</text>
          </view>
          <view className='lyric-calibrate__btn' bindtap={() => adjustOffset(100)}>
            <text className='lyric-calibrate__btn-text'>+0.1s</text>
          </view>
          <view className='lyric-calibrate__btn' bindtap={() => adjustOffset(500)}>
            <text className='lyric-calibrate__btn-text'>+0.5s</text>
          </view>
        </view>

        <text className='lyric-calibrate__explain'>{t('lyricCalibrate.explain')}</text>
      </view>
    </view>
  )
}
