import { useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getSongsApi } from '../../library/api/index.js'
import { usePlayerStore } from '../store/index.js'
import { useLyricStore } from '../store/index.js'
import './LyricEditPage.css'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'

export function LyricEditPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const song = usePlayerStore((s) => s.currentSong)
  const rawLyric = useLyricStore((s) => s.rawLyric)

  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setText(rawLyric ?? '')
  }, [rawLyric])

  const onSave = () => {
    if (!song || saving) return
    setSaving(true)
    void getSongsApi().updateLyrics(song.id, { lyric: text })
      .then(() => {
        setSaved(true)
        useLyricStore.getState().setRawLyric(text)
      })
      .finally(() => setSaving(false))
  }

  return (
    <view className='lyric-edit'>
      <view className='lyric-edit__topbar'>
        <view className='lyric-edit__back' bindtap={() => performRouteBack()}>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='lyric-edit__title'>{t('lyricEdit.title')}</text>
        <view className='lyric-edit__save' bindtap={onSave}>
          <text className='lyric-edit__save-text'>
            {saving ? t('playlist.saving') : saved ? t('lyricEdit.saved') : t('playlist.save')}
          </text>
        </view>
      </view>
      <view className='lyric-edit__body'>
        <textarea
          className='lyric-edit__textarea'
          default-value={text}
          bindinput={(e: { detail: { value: string } }) => { setText(e.detail.value); setSaved(false) }}
          placeholder={t('lyricEdit.placeholder')}
        />
      </view>
    </view>
  )
}
