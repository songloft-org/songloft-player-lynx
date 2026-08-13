import { useRef, useState } from '@lynx-js/react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'
import { SortableRoot, SortableItem, SortableItemArea } from '@lynx-js/lynx-ui-sortable'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getLastShellLocation } from '../../../shared/nav/shell-navigation.js'
import { getLastLibrarySearch } from '../../library/data/last-library-search.js'
import { useDebounce } from '../../library/data/use-debounce.js'
import { flattenSongs } from '../../library/data/pagination.js'
import { SongRow } from '../../library/widgets/SongRow.js'
import { SongContextMenu } from '../../../shared/ui/SongContextMenu.js'
import { VirtualList } from '../../library/widgets/VirtualList.js'
import { usePlayerStore } from '../../player/store/index.js'
import {
  usePlaylistQuery,
  usePlaylistSongsInfiniteQuery,
} from '../data/playlist-query.js'
import {
  useDeletePlaylistMutation,
  useMoveSongMutation,
  useUpdatePlaylistMutation,
  useRemoveSongMutation,
  useSetVisibilityMutation,
  useUpdateSortMutation,
} from '../data/playlist-mutations.js'
import './PlaylistDetailPage.css'



export function PlaylistDetailPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const params = useParams({ strict: false }) as { id?: string }
  const id = Number(params.id ?? 0) || 0

  const [searchText, setSearchText] = useState('')
  const debouncedKeyword = useDebounce(searchText, 300)

  const detail = usePlaylistQuery(id)
  const playlist = detail.data
  const currentSort = playlist?.sortBy ?? 'position'
  const currentOrder = playlist?.sortOrder ?? 'asc'
  const keyword = debouncedKeyword.trim() || undefined
  const songsQuery = usePlaylistSongsInfiniteQuery(id, { sort: currentSort, order: currentOrder, keyword })
  const songs = flattenSongs(songsQuery.data?.pages)

  // Last-built cover URL keyed by cover path — see `cover` below.
  const coverUrlRef = useRef<{ path: string; built: string }>({
    path: '',
    built: '',
  })

  const cover = (() => {
    const path = playlist?.coverUrl
    if (!path) return ''
    // Rebuild (cache-bust) only when the cover path itself changes. The
    // backend bumps `updatedAt` for unrelated reasons — toggling visibility,
    // changing sort — and feeding that into buildCoverUrl would change the
    // image URL on every such update and reload the <image>, making the cover
    // flash. Same path → keep the already-loaded URL.
    if (coverUrlRef.current.path === path && coverUrlRef.current.built) {
      return coverUrlRef.current.built
    }
    const built = buildCoverUrl(path, playlist?.updatedAt)
    coverUrlRef.current = { path, built }
    return built
  })()
  const songCount = playlist?.songCount ?? songs.length
  const countLabel = t(
    songCount === 1 ? 'common.songCountOne' : 'common.songCountOther',
    { count: songCount },
  )

  const isBuiltIn = playlist?.isBuiltIn ?? false
  const isHidden = playlist?.isHidden ?? false

  const deleteMutation = useDeletePlaylistMutation()
  const updateMutation = useUpdatePlaylistMutation(id)
  const removeSongMutation = useRemoveSongMutation(id)
  const moveSongMutation = useMoveSongMutation(id)
  const visibilityMutation = useSetVisibilityMutation(id)
  const sortMutation = useUpdateSortMutation(id)

  const [contextSong, setContextSong] = useState<Song | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [sortMode, setSortMode] = useState(false)
  const canSort = songs.length > 1

  const enterSortMode = () => {
    setSortMode(true)
  }
  const exitSortMode = () => {
    setSortMode(false)
  }

  const toggleVisibility = () => {
    visibilityMutation.mutate(!isHidden)
  }

  const sortOptions = [
    { key: 'position', order: 'asc', label: t('playlist.sortPosition') },
    { key: 'title', order: 'asc', label: t('playlist.sortTitle') },
    { key: 'artist', order: 'asc', label: t('playlist.sortArtist') },
    { key: 'added_at', order: 'desc', label: t('playlist.sortRecent') },
  ] as const

  const onSelectSort = (sortBy: string, sortOrder: string) => {
    sortMutation.mutate({ sortBy, sortOrder })
  }

  const onDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    deleteMutation.mutate(id, {
      onSuccess: () => {
        void navigate({ to: '/library', search: { view: 'playlists' } })
      },
    })
  }

  const onStartEdit = () => {
    setEditName(playlist?.name ?? '')
    setEditDesc(playlist?.description ?? '')
    setEditing(true)
  }

  const onCancelEdit = () => {
    setEditing(false)
  }

  const onSaveEdit = () => {
    const trimmedName = editName.trim()
    if (!trimmedName || updateMutation.isPending) return
    updateMutation.mutate(
      { name: trimmedName, description: editDesc.trim() },
      { onSuccess: () => setEditing(false) },
    )
  }

  const onRemoveSong = (song: Song) => {
    removeSongMutation.mutate(song.id)
  }

  const onEndReached = () => {
    if (songsQuery.hasNextPage && !songsQuery.isFetchingNextPage) {
      void songsQuery.fetchNextPage()
    }
  }

  const onTapSong = (_song: Song, index: number) => {
    void usePlayerStore.getState().playPlaylist(songs, index, id)
  }

  const header = (
    <view className='playlist-detail__header'>
      <view className='playlist-detail__topbar'>
        <view
          className='playlist-detail__back'
          bindtap={() => {
            // Return to the shell tab the user was on before entering this
            // detail page — Home or Library — rather than always Library.
            const last = getLastShellLocation()
            if (last === '/') {
              navigate({ to: last })
            } else {
              navigate({ to: '/library', search: getLastLibrarySearch() })
            }
          }}
        >
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        {!isBuiltIn
          ? (
            <view className='playlist-detail__topbar-actions'>
              {sortMode
                ? (
                  <view className='playlist-detail__action-btn' bindtap={exitSortMode}>
                    <text className='playlist-detail__action-text'>{t('playlist.doneSorting')}</text>
                  </view>
                )
                : null}
              {!sortMode && !editing && canSort
                ? (
                  <view className='playlist-detail__action-btn' bindtap={enterSortMode}>
                    <text className='playlist-detail__action-text'>{t('playlist.sortSongs')}</text>
                  </view>
                )
                : null}
              {!sortMode && !editing
                ? (
                  <view className='playlist-detail__action-btn' bindtap={onStartEdit}>
                    <text className='playlist-detail__action-text'>{t('playlist.editPlaylist')}</text>
                  </view>
                )
                : null}
              {!sortMode
                ? (
                  <view
                    className={confirmDelete
                      ? 'playlist-detail__action-btn playlist-detail__action-btn--danger'
                      : 'playlist-detail__action-btn'}
                    bindtap={onDelete}
                  >
                    <text
                      className={confirmDelete
                        ? 'playlist-detail__action-text playlist-detail__action-text--danger'
                        : 'playlist-detail__action-text'}
                    >
                      {confirmDelete ? t('playlist.deleteConfirm') : t('playlist.deletePlaylist')}
                    </text>
                  </view>
                )
                : null}
              {!sortMode && !editing
                ? (
                  <view className='playlist-detail__action-btn' bindtap={toggleVisibility} data-testid='playlist-toggle-visibility'>
                    <text className='playlist-detail__action-text'>
                      {isHidden ? t('playlist.showPlaylist') : t('playlist.hidePlaylist')}
                    </text>
                  </view>
                )
                : null}
            </view>
          )
          : null}
      </view>
      {editing
        ? (
          <view className='playlist-detail__edit-form'>
            <Input
              className='playlist-detail__edit-input'
              placeholder={t('playlist.namePlaceholder')}
              value={editName}
              onInput={(value: string) => setEditName(value)}
            />
            <Input
              className='playlist-detail__edit-input'
              placeholder={t('playlist.descriptionPlaceholder')}
              value={editDesc}
              onInput={(value: string) => setEditDesc(value)}
            />
            <view className='playlist-detail__edit-actions'>
              <view className='playlist-detail__edit-btn' bindtap={onCancelEdit}>
                <text className='playlist-detail__edit-btn-text'>{t('playlist.cancel')}</text>
              </view>
              <view className='playlist-detail__edit-btn playlist-detail__edit-btn--primary' bindtap={onSaveEdit}>
                <text className='playlist-detail__edit-btn-text playlist-detail__edit-btn-text--primary'>
                  {updateMutation.isPending ? t('playlist.saving') : t('playlist.save')}
                </text>
              </view>
            </view>
          </view>
        )
        : (
          <view className='playlist-detail__hero'>
            {cover
              ? <image className='playlist-detail__cover' src={cover} />
              : (
                <view className='playlist-detail__cover playlist-detail__cover--empty'>
                  <Icon name='music' size={40} color={ICON_COLORS.contentMuted} />
                </view>
              )}
            <view className='playlist-detail__meta'>
              <text className='playlist-detail__name'>
                {playlist?.name ?? (detail.isLoading ? t('common.loading') : t('playlist.fallbackName'))}
              </text>
              <text className='playlist-detail__count'>{countLabel}</text>
              {playlist?.description
                ? (
                  <scroll-view scroll-y className='playlist-detail__desc-scroll'>
                    <text className='playlist-detail__desc'>{playlist.description}</text>
                  </scroll-view>
                )
                : null}
            </view>
          </view>
        )}
    </view>
  )

  return (
    <view className='playlist-detail'>
      {header}
      {!sortMode && !editing
        ? (
          <view className='playlist-detail__search-bar'>
            <Input
              className='playlist-detail__search-input'
              placeholder={t('library.searchPlaceholder')}
              value={searchText}
              onInput={(value: string) => setSearchText(value)}
            />
          </view>
        )
        : null}
      {!sortMode && !editing && songs.length > 0
        ? (
          <view className='playlist-detail__sort-bar' data-testid='playlist-sort-bar'>
            {sortOptions.map((opt) => (
              <view
                key={opt.key}
                className={currentSort === opt.key
                  ? 'playlist-detail__sort-chip playlist-detail__sort-chip--active'
                  : 'playlist-detail__sort-chip'}
                bindtap={() => onSelectSort(opt.key, opt.order)}
                data-testid={`playlist-sort-${opt.key}`}
              >
                <text
                  className={currentSort === opt.key
                    ? 'playlist-detail__sort-chip-text playlist-detail__sort-chip-text--active'
                    : 'playlist-detail__sort-chip-text'}
                >
                  {opt.label}
                </text>
              </view>
            ))}
          </view>
        )
        : null}
      <view className='playlist-detail__body'>
        {sortMode
          ? (
            <SortableRoot
              as='ScrollView'
              scrollableClassName='playlist-detail__sort-scroll'
              data={songs.map((s) => ({ getSortingKey: () => String(s.id), dataItem: s }))}
              onSortEnd={(sorted) => {
                // Find the moved song by comparing the new order against the
                // original. Only one item moves per drag gesture, so a simple
                // position diff identifies it.
                const origPos = new Map(songs.map((s, i) => [s.id, i]))
                const moved = sorted.find(
                  (s, i) => origPos.get(s.dataItem.id) !== i,
                )?.dataItem
                if (!moved) return
                const newIdx = sorted.findIndex(
                  (s) => s.dataItem.id === moved.id,
                )
                moveSongMutation.mutate({
                  songId: moved.id,
                  afterSongId: newIdx > 0
                    ? sorted[newIdx - 1].dataItem.id
                    : null,
                })
              }}
            >
              {(item) => (
                <SortableItem
                  sortingKey={String(item.dataItem.id)}
                  as='DraggableRoot'
                  className='playlist-detail__sort-row'
                >
                  <SortableItemArea>
                    <view className='playlist-detail__sort-handle' data-testid={`playlist-detail-drag-${item.dataItem.id}`}>
                      <Icon name='menu' size={18} color={ICON_COLORS.content2} />
                    </view>
                  </SortableItemArea>
                  <text className='playlist-detail__sort-row-name'>{item.dataItem.title}</text>
                </SortableItem>
              )}
            </SortableRoot>
          )
          : songsQuery.isLoading
          ? <DetailState text={t('library.loadingSongs')} />
          : songsQuery.isError && songs.length === 0
            ? <DetailState text={t('playlist.songsError')} tone='error' />
            : songs.length === 0
              ? <DetailState text={t('playlist.noSongs')} />
              : (
                <VirtualList<Song>
                  className='playlist-detail__list'
                  items={songs}
                  itemKey={(song) => String(song.id)}
                  renderItem={(song, index) => (
                    <view className='playlist-detail__song-row-wrapper'>
                      <SongRow song={song} index={index} onTap={onTapSong} onLongPress={setContextSong} />
                      {!isBuiltIn
                        ? (
                          <view
                            className='playlist-detail__remove-btn'
                            bindtap={() => onRemoveSong(song)}
                          >
                            <Icon name='x' size={16} color={ICON_COLORS.contentMuted} />
                          </view>
                        )
                        : null}
                    </view>
                  )}
                  onEndReached={onEndReached}
                  footer={songsQuery.isFetchingNextPage
                    ? (
                      <view className='playlist-detail__footer'>
                        <text className='playlist-detail__footer-text'>{t('common.loadingMore')}</text>
                      </view>
                    )
                    : undefined}
                />
              )}
      </view>
      <SongContextMenu song={contextSong} onClose={() => setContextSong(null)} />
    </view>
  )
}

function DetailState({ text, tone }: { text: string; tone?: 'error' }) {
  return (
    <view className='playlist-detail__state'>
      <text
        className={tone === 'error'
          ? 'playlist-detail__state-text playlist-detail__state-text--error'
          : 'playlist-detail__state-text'}
      >
        {text}
      </text>
    </view>
  )
}
