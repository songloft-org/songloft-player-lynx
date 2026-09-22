import { useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { getSongsApi } from '../api/index.js'
import './AddSongsPage.css'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'

type Mode = 'remote' | 'radio'

/**
 * `/library/add` — the remote-song / radio-station form.
 *
 * Renders only its own content: the wide-screen view rail beside it belongs to
 * `LibraryLayout`, which this route sits under. It used to render a second copy
 * of that rail itself, gated on an async width store and on the browse-config
 * query, and that is what flashed on open.
 */
export function AddSongsPage() {
  const { t } = useTranslation()

  const [mode, setMode] = useState<Mode>('remote')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [album, setAlbum] = useState('')
  const [isVideo, setIsVideo] = useState(false)
  const [saving, setSaving] = useState(false)

  const onAdd = () => {
    const trimUrl = url.trim()
    if (!trimUrl || saving) return
    setSaving(true)

    const promise = mode === 'remote'
      ? getSongsApi().addRemoteSongs([{
          title: title.trim() || trimUrl,
          url: trimUrl,
          artist: artist.trim() || undefined,
          album: album.trim() || undefined,
          is_video: isVideo || undefined,
        }])
      : getSongsApi().addRadioStations([{
          title: title.trim() || trimUrl,
          url: trimUrl,
          is_video: isVideo || undefined,
        }])

    void promise
      .then(() => {
        toast.success(t('addSongs.success'))
        setUrl('')
        setTitle('')
        setArtist('')
        setAlbum('')
        setIsVideo(false)
      })
      .catch(e => toast.error(String(e instanceof Error ? e.message : e)))
      .finally(() => setSaving(false))
  }

  return (
    <view className='add-songs'>
      <view className='add-songs__topbar'>
        <view
          className='add-songs__back'
          bindtap={() => performRouteBack()}
          accessibility-element={true}
          accessibility-label={t('common.back')}
        >
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

        <view className='add-songs__switch-row'>
          <view className='add-songs__switch-body'>
            <text className='add-songs__switch-title'>{t('addSongs.videoToggleTitle')}</text>
            <text className='add-songs__switch-subtitle'>{t('addSongs.videoToggleSubtitle')}</text>
          </view>
          <AppSwitch checked={isVideo} onChange={setIsVideo} />
        </view>

        <view className='add-songs__btn' bindtap={onAdd}>
          <text className='add-songs__btn-text'>{saving ? t('common.loading') : t('addSongs.add')}</text>
        </view>
              <view className='add-songs__nav-inset' />
</scroll-view>
    </view>
  )
}
