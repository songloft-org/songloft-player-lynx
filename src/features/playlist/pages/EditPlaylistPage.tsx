import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import { useParams } from '@tanstack/react-router'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { canUploadCover, uploadPlaylistCover } from '../domain/cover-upload.js'
import { usePlaylistQuery } from '../data/playlist-query.js'
import { useUpdatePlaylistMutation } from '../data/playlist-mutations.js'
import { PlaylistFormFields } from '../widgets/PlaylistFormFields.js'
import './EditPlaylistPage.css'

/**
 * `/playlists/$id/edit` — the edit form for one playlist.
 *
 * A page, not the inline form the detail page used to swap into its header:
 * the header swap put two inputs at the very top of the screen (keyboard cover
 * territory) and cost the detail page a fourth render mode. Here the form gets
 * a scroll-view of its own, and cover management moved in with it from the
 * detail hero's `+` corner badge — matching the Flutter edit dialog's scope
 * (cover + name + description).
 *
 * Content only: the wide-screen view rail beside it is rendered by
 * `LibraryLayout`, this route's parent — same as `CreatePlaylistPage`.
 */
export function EditPlaylistPage() {
  const { t } = useTranslation()
  const params = useParams({ strict: false }) as { id?: string }
  const id = Number(params.id ?? 0) || 0

  const detail = usePlaylistQuery(id)
  const playlist = detail.data

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  /*
   * Seed the inputs once the playlist arrives (and only from `undefined` data,
   * not from a refetch — otherwise typing would be overwritten mid-flight).
   */
  useEffect(() => {
    if (!playlist) return
    setName((prev) => (prev === '' ? playlist.name : prev))
    setDesc((prev) => (prev === '' ? (playlist.description ?? '') : prev))
  }, [playlist])

  const updateMutation = useUpdatePlaylistMutation(id)

  const onSave = () => {
    const trimmed = name.trim()
    if (!trimmed || updateMutation.isPending) return
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

  const cover = playlist?.coverUrl ? buildCoverUrl(playlist.coverUrl, playlist.updatedAt) : ''

  return (
    <view className='edit-playlist'>
      <view className='edit-playlist__topbar'>
        <view className='edit-playlist__back' bindtap={() => performRouteBack()}>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='edit-playlist__title'>{t('playlist.editPageTitle')}</text>
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
                    {cover
                      ? <image className='edit-playlist__cover' src={cover} />
                      : (
                        <view className='edit-playlist__cover edit-playlist__cover--empty'>
                          <Icon name='music' size={32} color={ICON_COLORS.contentMuted} />
                        </view>
                      )}
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
                  </view>

                  <PlaylistFormFields
                    name={name}
                    onNameChange={setName}
                    description={desc}
                    onDescriptionChange={setDesc}
                  />

                  <view className='edit-playlist__btn' bindtap={onSave} data-testid='edit-playlist-save'>
                    <text className='edit-playlist__btn-text'>
                      {updateMutation.isPending ? t('playlist.saving') : t('playlist.save')}
                    </text>
                  </view>
                </view>
              )
              : null}
      </scroll-view>
    </view>
  )
}
