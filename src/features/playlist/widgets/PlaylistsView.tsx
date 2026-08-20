import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'
import { SortableRoot, SortableItem, SortableItemArea } from '@lynx-js/lynx-ui-sortable'

import type { Playlist } from '../../../models/playlist.js'
import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { AppCheckbox } from '../../../shared/ui/AppCheckbox.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { usePlayerStore } from '../../player/store/index.js'
import { playlistContext } from '../../player/domain/playback-context.js'
import { getPlaylistApi } from '../api/index.js'
import { PopoverMenu } from '../../../shared/ui/PopoverMenu.js'
import type { PopoverMenuItem } from '../../../shared/ui/PopoverMenu.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { sortPlaylistsByName, sortPlaylistsByNumberPrefix } from '../domain/playlist-sort.js'
import { flattenPlaylists } from '../data/pagination.js'
import { usePlaylistsInfiniteQuery } from '../data/playlist-query.js'
import { useCreatePlaylistMutation, useDeletePlaylistMutation, useReorderPlaylistsMutation } from '../data/playlist-mutations.js'
import { useDebounce } from '../../library/data/use-debounce.js'
import { PlaylistCard } from './PlaylistCard.js'
import './PlaylistsView.css'

export function PlaylistsView({ type, viewMode = 'grid' }: { type?: string; viewMode?: 'grid' | 'list' } = {}) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchText, setSearchText] = useState('')
  const debouncedSearch = useDebounce(searchText, 350)
  const query = usePlaylistsInfiniteQuery(
    type ? { type, keyword: debouncedSearch || undefined } : { keyword: debouncedSearch || undefined },
  )
  const allPlaylists = flattenPlaylists(query.data?.pages)
  const [showHidden, setShowHidden] = useState(false)
  const playlists = showHidden ? allPlaylists : allPlaylists.filter((p) => !p.isHidden)
  const hiddenCount = allPlaylists.filter((p) => p.isHidden).length
  const createMutation = useCreatePlaylistMutation()
  const reorderMutation = useReorderPlaylistsMutation()
  const deleteMutation = useDeletePlaylistMutation()

  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [sortMode, setSortMode] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [sortType, setSortType] = useState<string | null>(null)
  const sortItems: PopoverMenuItem[] = [
    { key: 'nameAsc',  label: t('playlist.sortNameAsc'),  icon: 'sort', selected: sortType === 'nameAsc' },
    { key: 'nameDesc', label: t('playlist.sortNameDesc'), icon: 'sort', selected: sortType === 'nameDesc' },
    { key: 'number',   label: t('playlist.sortNumberPrefix'), icon: 'sort', selected: sortType === 'number' },
    { key: 'manual',   label: t('playlist.sortManual'),  icon: 'sort', selected: sortType === 'manual' },
  ]

  const onPlayAll = async (playlist: Playlist) => {
    try {
      const res = await getPlaylistApi().getPlaylistSongs(playlist.id, {}, { limit: 9999, offset: 0 })
      if (res.songs.length === 0) {
        toast.show(t('playlist.emptyPlaylist'))
        return
      }
      await usePlayerStore.getState().playPlaylist(
        res.songs,
        0,
        playlistContext(playlist.id),
      )
    } catch {
      toast.error(t('playlist.playFailed'))
    }
  }

  const onCreateSubmit = () => {
    const trimmed = newName.trim()
    if (!trimmed || createMutation.isPending) return
    createMutation.mutate(
      { name: trimmed, description: newDesc.trim() || undefined },
      {
        onSuccess: () => {
          setShowForm(false)
          setNewName('')
          setNewDesc('')
        },
      },
    )
  }

  const onCancelCreate = () => {
    setShowForm(false)
    setNewName('')
    setNewDesc('')
  }

  if (query.isLoading) {
    return <PlaylistState text={t('playlist.loadingPlaylists')} />
  }
  if (query.isError && playlists.length === 0) {
    return <PlaylistState text={t('playlist.playlistsError')} tone='error' />
  }

  const onTap = (playlist: Playlist) => {
    if (selectMode) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(playlist.id)) next.delete(playlist.id)
        else next.add(playlist.id)
        return next
      })
      return
    }
    void navigate({ to: '/playlists/$id', params: { id: String(playlist.id) } })
  }

  const enterSelectMode = () => {
    setSelectMode(true)
    setSelected(new Set())
    setConfirmBatchDelete(false)
  }
  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
    setConfirmBatchDelete(false)
  }

  /*
   * Peels the armed batch delete before leaving multi-select, so back undoes exactly
   * the last thing the user did rather than throwing away the whole selection.
   *
   * The sort ActionSheet is absent on purpose: `ActionSheet` registers its own layer.
   */
  useBackHandler(showForm || sortMode || selectMode, () => {
    if (showForm) {
      setShowForm(false)
      return true
    }
    if (sortMode) {
      setSortMode(false)
      return true
    }
    if (confirmBatchDelete) {
      setConfirmBatchDelete(false)
      return true
    }
    exitSelectMode()
    return true
  })
  const batchDelete = () => {
    if (!confirmBatchDelete) { setConfirmBatchDelete(true); return }
    const ids = Array.from(selected).filter((id) => !playlists.find((p) => p.id === id)?.isBuiltIn)
    void Promise.all(ids.map((id) => deleteMutation.mutateAsync(id))).then(exitSelectMode)
  }

  /**
   * Load all remaining pages so we sort the full playlist set, mirroring
   * Flutter `PlaylistBrowseView.autoSortByName` → `loadAll()`.
   */
  async function loadAllPlaylists() {
    let result = await query.fetchNextPage()
    while (result.hasNextPage) {
      result = await query.fetchNextPage()
    }
    // Re-flatten after all pages are loaded — use the latest result's full
    // page set. The pages from the last fetchNextPage result include all
    // previously loaded pages.
    return flattenPlaylists(result.data?.pages)
  }

  const onSortNameAsc = async () => {
    setSortOpen(false)
    const all = await loadAllPlaylists()
    const ids = sortPlaylistsByName(all, true)
    if (!ids) {
      toast.success(t('playlist.alreadySortedPlaylists'))
      return
    }
    reorderMutation.mutate(ids, {
      onSuccess: () => toast.success(t('playlist.sortedByNameAsc')),
      onError: () => toast.error(t('playlist.sortFailed')),
    })
  }

  const onSortNameDesc = async () => {
    setSortOpen(false)
    const all = await loadAllPlaylists()
    const ids = sortPlaylistsByName(all, false)
    if (!ids) {
      toast.success(t('playlist.alreadySortedPlaylists'))
      return
    }
    reorderMutation.mutate(ids, {
      onSuccess: () => toast.success(t('playlist.sortedByNameDesc')),
      onError: () => toast.error(t('playlist.sortFailed')),
    })
  }

  const onSortNumber = async () => {
    setSortOpen(false)
    const all = await loadAllPlaylists()
    const ids = sortPlaylistsByNumberPrefix(all)
    if (!ids) {
      toast.success(t('playlist.alreadySortedPlaylists'))
      return
    }
    reorderMutation.mutate(ids, {
      onSuccess: () => toast.success(t('playlist.sortedByNumber')),
      onError: () => toast.error(t('playlist.sortFailed')),
    })
  }

  const createForm = showForm
    ? (
      <view className='playlists__create-form'>
        <Input
          className='playlists__create-input'
          placeholder={t('playlist.namePlaceholder')}
          value={newName}
          onInput={(value: string) => setNewName(value)}
        />
        <Input
          className='playlists__create-input'
          placeholder={t('playlist.descriptionPlaceholder')}
          value={newDesc}
          onInput={(value: string) => setNewDesc(value)}
        />
        <view className='playlists__create-actions'>
          <view className='playlists__create-btn' bindtap={onCancelCreate}>
            <text className='playlists__create-btn-text'>{t('playlist.cancel')}</text>
          </view>
          <view
            className='playlists__create-btn playlists__create-btn--primary'
            bindtap={onCreateSubmit}
          >
            <text className='playlists__create-btn-text playlists__create-btn-text--primary'>
              {createMutation.isPending ? t('playlist.creating') : t('playlist.create')}
            </text>
          </view>
        </view>
      </view>
    )
    : null

  if (playlists.length === 0 && !showForm) {
    return (
      <view className='playlists'>
      <view className='playlists__search-bar'>
        <Input
          className='playlists__search-input'
          placeholder={t('playlist.searchPlaceholder')}
          value={searchText}
          onInput={(value: string) => setSearchText(value)}
        />
      </view>
        <view className='playlists__create-bar'>
          <view className='playlists__create-trigger' bindtap={() => setShowForm(true)}>
            <Icon name='plus' size={14} color={ICON_COLORS.content} />
            <text className='playlists__create-trigger-text'>{t('playlist.createPlaylist')}</text>
          </view>
        </view>
        <PlaylistState
          text={t('playlist.noPlaylistsTitle')}
          subtext={t('playlist.noPlaylistsSubtitle')}
        />
      </view>
    )
  }

  if (sortMode) {
    return (
      <view className='playlists'>
        <view className='playlists__create-bar'>
          <text className='playlists__sort-title'>{t('playlist.sortPlaylists')}</text>
          <view className='playlists__create-trigger' bindtap={() => setSortMode(false)}>
            <text className='playlists__create-trigger-text'>{t('playlist.doneSorting')}</text>
          </view>
        </view>
        <SortableRoot
          as='ScrollView'
          scrollableClassName='playlists__scroll'
          data={playlists.map((p) => ({ getSortingKey: () => String(p.id), dataItem: p }))}
          onSortEnd={(sorted) => {
            reorderMutation.mutate(sorted.map((d) => d.dataItem.id))
          }}
        >
          {(item) => (
            <SortableItem
              sortingKey={String(item.dataItem.id)}
              as='DraggableRoot'
              className='playlists__sort-row'
            >
              <SortableItemArea>
                <view className='playlists__sort-handle' data-testid={`playlists-drag-${item.dataItem.id}`}>
                  <Icon name='menu' size={18} color={ICON_COLORS.content2} />
                </view>
              </SortableItemArea>
              <text className='playlists__sort-row-name'>
                {item.dataItem.name || t('common.untitled')}
              </text>
            </SortableItem>
          )}
        </SortableRoot>
      </view>
    )
  }

  return (
    <view className='playlists'>
      <view className='playlists__search-bar'>
        <Input
          className='playlists__search-input'
          placeholder={t('playlist.searchPlaceholder')}
          value={searchText}
          onInput={(value: string) => setSearchText(value)}
        />
      </view>
      <view className='playlists__create-bar'>
        <view className='playlists__create-bar-left'>
          <view className='playlists__create-trigger' bindtap={() => setShowForm(true)}>
            <Icon name='plus' size={14} color={ICON_COLORS.content} />
            <text className='playlists__create-trigger-text'>{t('playlist.createPlaylist')}</text>
          </view>
          {playlists.length > 1 && !showForm && !selectMode
            ? (
              <PopoverMenu
                show={sortOpen}
                onShowChange={setSortOpen}
                placement='bottom-start'
                contentClassName='popover-menu--wide'
                triggerClassName='playlists__create-trigger'
                trigger={
                  <>
                    <Icon name='sort' size={14} color={ICON_COLORS.content} />
                    <text className='playlists__create-trigger-text'>{t('playlist.sort')}</text>
                  </>
                }
                items={sortItems}
                onSelect={(key) => {
                  setSortOpen(false)
                  setSortType(key)
                  if (key === 'nameAsc') onSortNameAsc()
                  else if (key === 'nameDesc') onSortNameDesc()
                  else if (key === 'number') onSortNumber()
                  else if (key === 'manual') setSortMode(true)
                }}
              />
            )
            : null}
          {hiddenCount > 0
            ? (
              <view className='playlists__create-trigger' bindtap={() => setShowHidden(!showHidden)}>
                <text className='playlists__create-trigger-text'>
                  {showHidden ? t('playlist.hideHidden') : t('playlist.showHidden', { count: hiddenCount })}
                </text>
              </view>
            )
            : null}
        </view>
        <view className='playlists__create-bar-right'>
          {playlists.length > 1 && !showForm
            ? selectMode
              ? (
                <view className='playlists__create-trigger' bindtap={exitSelectMode}>
                  <Icon name='x' size={14} color={ICON_COLORS.content} />
                  <text className='playlists__create-trigger-text'>{t('library.cancelSelect')}</text>
                </view>
              )
              : (
                <view
                  className='playlists__create-trigger'
                  bindtap={enterSelectMode}
                  data-testid='playlists-select-toggle'
                >
                  <Icon name='check' size={14} color={ICON_COLORS.content} />
                  <text className='playlists__create-trigger-text'>{t('library.select')}</text>
                </view>
              )
            : null}
        </view>
      </view>
      {createForm}
      <scroll-view
        className='playlists__scroll'
        scroll-y
        lower-threshold={200}
        bindscrolltolower={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) {
            void query.fetchNextPage()
          }
        }}
      >
        <view className={viewMode === 'list' ? 'playlists__list' : 'playlists__grid'}>
          {playlists.length === 0 && !query.isLoading
            ? (
              <PlaylistState
                text={debouncedSearch ? t('library.noSearchResults') : t('playlist.noPlaylistsTitle')}
                subtext={debouncedSearch ? undefined : t('playlist.noPlaylistsSubtitle')}
              />
            )
            : viewMode === 'grid'
              ? playlists.map((playlist) => (
                <view key={String(playlist.id)} className='playlists__grid-item'>
                  <PlaylistCard playlist={playlist} onTap={onTap} onPlayAll={onPlayAll} />
                  {selectMode
                    ? (
                      <view className='playlists__select-badge'>
                        <AppCheckbox checked={selected.has(playlist.id)} />
                      </view>
                    )
                    : null}
                </view>
              ))
              : playlists.map((playlist) => (
                <PlaylistListItem
                  key={String(playlist.id)}
                  playlist={playlist}
                  onTap={onTap}
                  onPlayAll={onPlayAll}
                  isPlaying={false}
                  selectMode={selectMode}
                  isSelected={selected.has(playlist.id)}
                />
              ))}
        </view>
        {query.isFetchingNextPage
          ? (
            <view className='playlists__footer'>
              <text className='playlists__footer-text'>{t('common.loadingMore')}</text>
            </view>
          )
          : null}
      </scroll-view>
      {selectMode && selected.size > 0
        ? (
          <view className='playlists__select-toolbar'>
            <text className='playlists__select-toolbar-count'>
              {t('library.selectedCount', { count: selected.size })}
            </text>
            <view className='playlists__select-toolbar-btn' bindtap={batchDelete}>
              <text className='playlists__select-toolbar-btn-text'>
                {confirmBatchDelete ? t('playlist.deleteConfirm') : t('playlist.deletePlaylist')}
              </text>
            </view>
          </view>
        )
        : null}

    </view>
  )
}

function PlaylistState({
  text,
  subtext,
  tone,
}: {
  text: string
  subtext?: string
  tone?: 'error'
}) {
  return (
    <view className='playlists__state'>
      <text
        className={tone === 'error'
          ? 'playlists__state-text playlists__state-text--error'
          : 'playlists__state-text'}
      >
        {text}
      </text>
      {subtext ? <text className='playlists__state-subtext'>{subtext}</text> : null}
    </view>
  )
}

function PlaylistListItem({
  playlist,
  onTap,
  onPlayAll,
  isPlaying,
  selectMode,
  isSelected,
}: {
  playlist: Playlist
  onTap?: (playlist: Playlist) => void
  onPlayAll?: (playlist: Playlist) => void
  isPlaying?: boolean
  selectMode?: boolean
  isSelected?: boolean
}) {
  const { t } = useTranslation()
  const cover = playlist.coverUrl ? buildCoverUrl(playlist.coverUrl, playlist.updatedAt) : ''
  const count = t(
    playlist.songCount === 1 ? 'common.songCountOne' : 'common.songCountOther',
    { count: playlist.songCount },
  )

  return (
    <view
      className={'playlist-list-item' + (isPlaying ? ' playlist-list-item--playing' : '')}
      bindtap={() => onTap?.(playlist)}
    >
      {selectMode
        ? (
          <view className='playlist-list-item__check'>
            <AppCheckbox checked={isSelected ?? false} />
          </view>
        )
        : null}
      <view className='playlist-list-item__cover-wrap'>
        {cover
          ? <image className='playlist-list-item__cover' src={cover} mode='aspectFill' />
          : (
            <view className='playlist-list-item__cover playlist-list-item__cover--empty'>
              <Icon name='music' size={20} color={ICON_COLORS.contentMuted} />
            </view>
          )}
      </view>
      <view className='playlist-list-item__info'>
        <text className='playlist-list-item__name'>{playlist.name || t('common.untitled')}</text>
        <text className='playlist-list-item__count'>{count}</text>
      </view>
      {onPlayAll && !selectMode
        ? (
          <view
            className='playlist-list-item__play-btn'
            catchtap={() => { onPlayAll(playlist) }}
          >
            <Icon name='play' size={16} color={ICON_COLORS.content} />
          </view>
        )
        : null}
    </view>
  )
}
