import { useState, useSyncExternalStore } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { getShellWidth, subscribeShellWidth } from '../../../shared/nav/shell-navigation.js'
import { BREAKPOINTS } from '../../../shared/responsive/useBreakpoint.js'
import { useLibraryBrowseConfigQuery, libraryBrowseConfigOrFallback } from '../../library/data/library-browse-query.js'
import { resolveLibraryView } from '../../library/domain/library-views.js'
import { LibraryViewRail } from '../../library/widgets/LibraryViewRail.js'
import { useCreatePlaylistMutation } from '../data/playlist-mutations.js'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import './CreatePlaylistPage.css'

type PlaylistType = 'normal' | 'radio'

export function CreatePlaylistPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [playlistType, setPlaylistType] = useState<PlaylistType>('normal')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  const browseQuery = useLibraryBrowseConfigQuery()
  const config = libraryBrowseConfigOrFallback(browseQuery)
  const shellWidth = useSyncExternalStore(subscribeShellWidth, getShellWidth)
  const isWide = shellWidth >= BREAKPOINTS.tablet
  const resolved = config ? resolveLibraryView(undefined, config) : undefined

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

  const formContent = (
    <view>
      <view className='create-playlist__topbar'>
        <view className='create-playlist__back' bindtap={() => performRouteBack()}>
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
        <text className='create-playlist__label'>{t('playlist.namePlaceholder')}</text>
        <Input
          className='create-playlist__input'
          value={name}
          onInput={(v: string) => setName(v)}
          placeholder={t('playlist.namePlaceholder')}
        />

        <text className='create-playlist__label'>{t('playlist.descriptionPlaceholder')}</text>
        <Input
          className='create-playlist__input'
          value={desc}
          onInput={(v: string) => setDesc(v)}
          placeholder={t('playlist.descriptionPlaceholder')}
        />

        <view className='create-playlist__btn' bindtap={onSubmit}>
          <text className='create-playlist__btn-text'>
            {createMutation.isPending ? t('playlist.creating') : t('playlist.create')}
          </text>
        </view>
      </scroll-view>
    </view>
  )

  // selectedView tracks the last-clicked rail item so the highlight
  // doesn't snap back to the first visible view on every render.
  const [selectedView, setSelectedView] = useState(resolved?.selected)

  return (
    <view className={`create-playlist${isWide ? ' create-playlist--wide' : ''}`}>
      {resolved ? (
        <view className={isWide ? undefined : 'create-playlist__rail-hidden'}>
          <LibraryViewRail
            showTitle
            displayKeys={resolved.displayKeys}
            selected={selectedView ?? resolved.selected}
            onSelect={(key) => {
              setSelectedView(key)
              navigate({ to: '/library', search: { view: key } })
            }}
          />
        </view>
      ) : null}
      <view className='create-playlist__content'>
        {formContent}
      </view>
    </view>
  )
}
