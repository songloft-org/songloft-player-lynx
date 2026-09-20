import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearch } from '@tanstack/react-router'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { canUploadCover, uploadPlaylistCover } from '../domain/cover-upload.js'
import { usePlaylistQuery } from '../data/playlist-query.js'
import { useUpdatePlaylistMutation } from '../data/playlist-mutations.js'
import { PlaylistFormFields } from '../widgets/PlaylistFormFields.js'
import { SongCoverPicker } from '../widgets/SongCoverPicker.js'
import './EditPlaylistPage.css'

/**
 * `/playlists/$id/edit` — the edit form for one playlist.
 *
 * Supports `?coverOnly=true` search param for built-in playlists (Favorites)
 * that only allow cover editing — name and description fields are hidden.
 */
export function EditPlaylistPage() {
  const { t } = useTranslation()
  const params = useParams({ strict: false }) as { id?: string }
  const search = useSearch({ strict: false }) as { coverOnly?: boolean }
  const id = Number(params.id ?? 0) || 0
  const coverOnly = search.coverOnly === true

  const detail = usePlaylistQuery(id)
  const playlist = detail.data

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  useEffect(() => {
    const g = globalThis as Record<string, unknown>
    const prev = g.__E2E_EDIT_PLAYLIST__ as Record<string, unknown> | undefined
    const obj = prev ?? {}
    obj.setPickerOpen = setPickerOpen
    g.__E2E_EDIT_PLAYLIST__ = obj
    return () => { delete obj.setPickerOpen }
  }, [])
  const [selectedCover, setSelectedCover] = useState<{ songId: number; url: string } | null>(null)

  useEffect(() => {
    if (!playlist) return
    setName((prev) => (prev === '' ? playlist.name : prev))
    setDesc((prev) => (prev === '' ? (playlist.description ?? '') : prev))
  }, [playlist])

  const updateMutation = useUpdatePlaylistMutation(id)

  const onSave = () => {
    if (updateMutation.isPending) return
    if (selectedCover) {
      updateMutation.mutate(
        { coverSongId: selectedCover.songId, ...(!coverOnly && { name: name.trim(), description: desc.trim() }) },
        {
          onSuccess: () => {
            toast.success(t('playlist.save'))
            performRouteBack()
          },
          onError: (e) => toast.error(String(e instanceof Error ? e.message : e)),
        },
      )
    } else if (!coverOnly) {
      const trimmed = name.trim()
      if (!trimmed) return
      updateMutation.mutate(
        { name: trimmed, description: desc.trim() },
        {
          onSuccess: () => {
            toast.success(t('playlist.save'))
            performRouteBack()
          },
          onError: (e) => toast.error(String(e instanceof Error ? e.message : e)),
        },
      )
    }
  }

  const onPickFromSongs = (songId: number, coverUrl: string) => {
    setSelectedCover({ songId, url: coverUrl })
    setPickerOpen(false)
  }

  const displayCover = selectedCover
    ? buildCoverUrl(selectedCover.url)
    : playlist?.coverUrl
      ? buildCoverUrl(playlist.coverUrl, playlist.updatedAt)
      : ''

  const pageTitle = coverOnly ? t('playlist.editCoverPageTitle') : t('playlist.editPageTitle')

  return (
    <view className='edit-playlist'>
      <view className='edit-playlist__topbar'>
        <view
          className='edit-playlist__back'
          bindtap={() => performRouteBack()}
          accessibility-element={true}
          accessibility-label={t('common.back')}
        >
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='edit-playlist__title'>{pageTitle}</text>
      </view>

      <scroll-view className='edit-playlist__form' scroll-y>
        {detail.isLoading
          ? <text className='edit-playlist__state'>{t('common.loading')}</text>
          : detail.isError
            ? <text className='edit-playlist__state edit-playlist__state--error'>{t('playlist.playlistsError')}</text>
            : playlist
              ? (
                <view>
                  <text className='playlist-form__label'>{t('playlist.coverLabel')}</text>
                  <view className='edit-playlist__cover-row'>
                    {displayCover
                      ? <image className='edit-playlist__cover' src={displayCover} mode='aspectFill' />
                      : (
                        <view className='edit-playlist__cover edit-playlist__cover--empty'>
                          <Icon name='music' size={32} color={ICON_COLORS.contentMuted} />
                        </view>
                      )}
                    <view className='edit-playlist__cover-actions'>
                      {canUploadCover()
                        ? (
                          <view
                            className='edit-playlist__upload-btn'
                            bindtap={() => {
                              void uploadPlaylistCover(id).then(() => void detail.refetch())
                            }}
                            data-testid='edit-playlist-upload-cover'
                          >
                            <Icon name='plus' size={16} color={ICON_COLORS.content} />
                            <text className='edit-playlist__upload-btn-text'>{t('playlist.uploadCover')}</text>
                          </view>
                        )
                        : null}
                      <view
                        className='edit-playlist__upload-btn'
                        bindtap={() => setPickerOpen(true)}
                        data-testid='edit-playlist-pick-from-songs'
                      >
                        <Icon name='music' size={16} color={ICON_COLORS.content} />
                        <text className='edit-playlist__upload-btn-text'>{t('playlist.pickFromSongs')}</text>
                      </view>
                    </view>
                  </view>

                  {!coverOnly
                    ? (
                      <PlaylistFormFields
                        name={name}
                        onNameChange={setName}
                        description={desc}
                        onDescriptionChange={setDesc}
                      />
                    )
                    : null}

                  <view className='edit-playlist__btn' bindtap={onSave} data-testid='edit-playlist-save'>
                    <text className='edit-playlist__btn-text'>
                      {updateMutation.isPending ? t('playlist.saving') : t('playlist.save')}
                    </text>
                  </view>
                </view>
              )
              : null}
              <view className='edit-playlist__nav-inset' />
</scroll-view>

      {pickerOpen
        ? (
          <SongCoverPicker
            playlistId={id}
            onSelect={onPickFromSongs}
            onClose={() => setPickerOpen(false)}
          />
        )
        : null}
    </view>
  )
}
