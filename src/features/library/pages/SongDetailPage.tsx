import { useEffect, useState } from '@lynx-js/react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { toast } from '../../../shared/ui/toast-store.js'
import type { Song } from '../../../models/song.js'
import { getSongsApi } from '../api/index.js'
import './SongDetailPage.css'

export function SongDetailPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const params = useParams({ strict: false }) as { songId?: string }
  const id = Number(params.songId ?? 0) || 0

  const [song, setSong] = useState<Song | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [album, setAlbum] = useState('')

  useEffect(() => {
    if (!id) return
    void getSongsApi().getSong(id)
      .then(s => {
        setSong(s)
        setTitle(s.title)
        setArtist(s.artist ?? '')
        setAlbum(s.album ?? '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  const onSave = () => {
    if (saving || !song) return
    setSaving(true)
    void getSongsApi().updateSong(id, {
      title: title.trim() || song.title,
      artist: artist.trim() || undefined,
      album: album.trim() || undefined,
    }).then(() => {
      setSong({ ...song, title: title.trim() || song.title, artist: artist.trim() || song.artist, album: album.trim() || song.album })
      setEditing(false)
    }).finally(() => setSaving(false))
  }

  const cover = song?.coverUrl ? buildCoverUrl(song.coverUrl, song.updatedAt) : ''

  return (
    <view className='song-detail'>
      <view className='song-detail__topbar'>
        <view className='song-detail__back' bindtap={() => navigate({ to: '/library' })}>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='song-detail__topbar-title'>{t('songDetail.title')}</text>
        {song && !editing
          ? (
            <view className='song-detail__edit-btn' bindtap={() => setEditing(true)}>
              <text className='song-detail__edit-btn-text'>{t('songDetail.edit')}</text>
            </view>
          )
          : null}
      </view>

      {loading
        ? <text className='song-detail__state'>{t('common.loading')}</text>
        : !song
          ? <text className='song-detail__state'>{t('songDetail.notFound')}</text>
          : (
            <scroll-view className='song-detail__content' scroll-y>
              <view className='song-detail__hero'>
                {cover
                  ? <image className='song-detail__cover' src={cover} />
                  : <view className='song-detail__cover song-detail__cover--empty'><Icon name='music' size={48} color={ICON_COLORS.contentMuted} /></view>}
              </view>

              {editing
                ? (
                  <view className='song-detail__form'>
                    <text className='song-detail__label'>{t('songDetail.titleField')}</text>
                    <Input className='song-detail__input' value={title} onInput={(v: string) => setTitle(v)} placeholder={t('songDetail.titleField')} />
                    <text className='song-detail__label'>{t('songDetail.artistField')}</text>
                    <Input className='song-detail__input' value={artist} onInput={(v: string) => setArtist(v)} placeholder={t('songDetail.artistField')} />
                    <text className='song-detail__label'>{t('songDetail.albumField')}</text>
                    <Input className='song-detail__input' value={album} onInput={(v: string) => setAlbum(v)} placeholder={t('songDetail.albumField')} />
                    <view className='song-detail__form-actions'>
                      <view className='song-detail__cancel-btn' bindtap={() => setEditing(false)}>
                        <text className='song-detail__cancel-btn-text'>{t('playlist.cancel')}</text>
                      </view>
                      <view className='song-detail__save-btn' bindtap={onSave}>
                        <text className='song-detail__save-btn-text'>{saving ? t('playlist.saving') : t('playlist.save')}</text>
                      </view>
                    </view>
                  </view>
                )
                : (
                  <view className='song-detail__info'>
                    <view className='song-detail__row'>
                      <text className='song-detail__row-label'>{t('songDetail.titleField')}</text>
                      <text className='song-detail__row-value'>{song.title}</text>
                    </view>
                    <view className='song-detail__row'>
                      <text className='song-detail__row-label'>{t('songDetail.artistField')}</text>
                      <text className='song-detail__row-value'>{song.artist || '—'}</text>
                    </view>
                    <view className='song-detail__row'>
                      <text className='song-detail__row-label'>{t('songDetail.albumField')}</text>
                      <text className='song-detail__row-value'>{song.album || '—'}</text>
                    </view>
                    <view className='song-detail__row'>
                      <text className='song-detail__row-label'>{t('songDetail.type')}</text>
                      <text className='song-detail__row-value'>{song.type}{song.isVideo ? ' ▶' : ''}</text>
                    </view>
                    {song.genre ? (
                      <view className='song-detail__row'>
                        <text className='song-detail__row-label'>{t('songDetail.genre')}</text>
                        <text className='song-detail__row-value'>{song.genre}</text>
                      </view>
                    ) : null}
                    {song.year ? (
                      <view className='song-detail__row'>
                        <text className='song-detail__row-label'>{t('songDetail.year')}</text>
                        <text className='song-detail__row-value'>{String(song.year)}</text>
                      </view>
                    ) : null}
                    {song.type === 'local' ? (
                      <view className='song-detail__tags-section'>
                        <view className='song-detail__save-btn' bindtap={() => {
                          void getSongsApi().writeTags(song.id)
                            .then(() => toast.success(t('songDetail.tagsWritten')))
                            .catch(() => toast.error(t('songDetail.tagsFailed')))
                        }}>
                          <text className='song-detail__save-btn-text'>{t('songDetail.writeTags')}</text>
                        </view>
                      </view>
                    ) : null}
                  </view>
                )}
            </scroll-view>
          )}
    </view>
  )
}
