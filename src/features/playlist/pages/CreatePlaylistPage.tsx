import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { useCreatePlaylistMutation } from '../data/playlist-mutations.js'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { PlaylistFormFields } from '../widgets/PlaylistFormFields.js'
import './CreatePlaylistPage.css'

type PlaylistType = 'normal' | 'radio'

/**
 * `/playlists/create` — the new-playlist form (normal / radio).
 *
 * Content only: the wide-screen view rail beside it is rendered by
 * `LibraryLayout`, this route's parent. See `AddSongsPage` for why it no longer
 * carries its own copy.
 */
export function CreatePlaylistPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [playlistType, setPlaylistType] = useState<PlaylistType>('normal')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  const createMutation = useCreatePlaylistMutation()

  const onSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed || createMutation.isPending) return
    createMutation.mutate(
      { name: trimmed, description: desc.trim() || undefined, type: playlistType },
      {
        onSuccess: (playlist) => {
          toast.success(t('createPlaylist.success'))
          navigate({ to: '/playlists/$id', params: { id: String(playlist.id) } })
        },
        onError: (e) => toast.error(String(e instanceof Error ? e.message : e)),
      },
    )
  }

  return (
    <view className='create-playlist'>
      <view className='create-playlist__topbar'>
        <view
          className='create-playlist__back'
          bindtap={() => performRouteBack()}
          accessibility-element={true}
          accessibility-label={t('common.back')}
        >
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='create-playlist__title'>{t('createPlaylist.title')}</text>
      </view>

      <view className='create-playlist__tabs'>
        <view
          className={playlistType === 'normal' ? 'create-playlist__tab create-playlist__tab--active' : 'create-playlist__tab'}
          bindtap={() => setPlaylistType('normal')}
        >
          <text className='create-playlist__tab-text'>{t('createPlaylist.normal')}</text>
        </view>
        <view
          className={playlistType === 'radio' ? 'create-playlist__tab create-playlist__tab--active' : 'create-playlist__tab'}
          bindtap={() => setPlaylistType('radio')}
        >
          <text className='create-playlist__tab-text'>{t('createPlaylist.radio')}</text>
        </view>
      </view>

      <scroll-view className='create-playlist__form' scroll-y>
        <PlaylistFormFields
          name={name}
          onNameChange={setName}
          description={desc}
          onDescriptionChange={setDesc}
        />

        <view className='create-playlist__btn' bindtap={onSubmit}>
          <text className='create-playlist__btn-text'>
            {createMutation.isPending ? t('playlist.creating') : t('playlist.create')}
          </text>
        </view>
              <view className='create-playlist__nav-inset' />
</scroll-view>
    </view>
  )
}
