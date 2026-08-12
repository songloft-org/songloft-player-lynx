import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getSongsApi } from '../api/index.js'
import './AddSongsPage.css'

type Mode = 'remote' | 'radio'

export function AddSongsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [mode, setMode] = useState<Mode>('remote')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [album, setAlbum] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const onAdd = () => {
    const trimUrl = url.trim()
    if (!trimUrl || saving) return
    setSaving(true)
    setResult(null)

    const promise = mode === 'remote'
      ? getSongsApi().addRemoteSongs([{
          title: title.trim() || trimUrl,
          url: trimUrl,
          artist: artist.trim() || undefined,
          album: album.trim() || undefined,
        }])
      : getSongsApi().addRadioStations([{
          title: title.trim() || trimUrl,
          url: trimUrl,
        }])

    void promise
      .then(() => {
        setResult(t('addSongs.success'))
        setUrl('')
        setTitle('')
        setArtist('')
        setAlbum('')
      })
      .catch(e => setResult(String(e instanceof Error ? e.message : e)))
      .finally(() => setSaving(false))
  }

  return (
    <view className='add-songs'>
      <view className='add-songs__topbar'>
        <view className='add-songs__back' bindtap={() => navigate({ to: '/library' })}>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='add-songs__title'>{t('addSongs.title')}</text>
      </view>

      <view className='add-songs__tabs'>
        <view className={mode === 'remote' ? 'add-songs__tab add-songs__tab--active' : 'add-songs__tab'} bindtap={() => setMode('remote')}>
          <text className='add-songs__tab-text'>{t('addSongs.remote')}</text>
        </view>
        <view className={mode === 'radio' ? 'add-songs__tab add-songs__tab--active' : 'add-songs__tab'} bindtap={() => setMode('radio')}>
          <text className='add-songs__tab-text'>{t('addSongs.radio')}</text>
        </view>
      </view>

      <scroll-view className='add-songs__form' scroll-y>
        <text className='add-songs__label'>{t('addSongs.urlLabel')}</text>
        <Input className='add-songs__input' value={url} onInput={(v: string) => setUrl(v)} placeholder='https://' />

        <text className='add-songs__label'>{t('addSongs.titleLabel')}</text>
        <Input className='add-songs__input' value={title} onInput={(v: string) => setTitle(v)} placeholder={t('addSongs.titlePlaceholder')} />

        {mode === 'remote' ? (
          <view>
            <text className='add-songs__label'>{t('songDetail.artistField')}</text>
            <Input className='add-songs__input' value={artist} onInput={(v: string) => setArtist(v)} placeholder={t('songDetail.artistField')} />
            <text className='add-songs__label'>{t('songDetail.albumField')}</text>
            <Input className='add-songs__input' value={album} onInput={(v: string) => setAlbum(v)} placeholder={t('songDetail.albumField')} />
          </view>
        ) : null}

        <view className='add-songs__btn' bindtap={onAdd}>
          <text className='add-songs__btn-text'>{saving ? t('common.loading') : t('addSongs.add')}</text>
        </view>

        {result ? <text className='add-songs__result'>{result}</text> : null}
      </scroll-view>
    </view>
  )
}
