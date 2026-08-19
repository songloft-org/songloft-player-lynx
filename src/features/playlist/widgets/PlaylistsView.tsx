import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'
import { SortableRoot, SortableItem, SortableItemArea } from '@lynx-js/lynx-ui-sortable'

import type { Playlist } from '../../../models/playlist.js'
import { AppCheckbox } from '../../../shared/ui/AppCheckbox.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { ActionSheet, ActionSheetItem } from '../../../shared/ui/ActionSheet.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { sortPlaylistsByName, sortPlaylistsByNumberPrefix } from '../domain/playlist-sort.js'
import { flattenPlaylists } from '../data/pagination.js'
import { usePlaylistsInfiniteQuery } from '../data/playlist-query.js'
import { useCreatePlaylistMutation, useDeletePlaylistMutation, useReorderPlaylistsMutation } from '../data/playlist-mutations.js'
import { PlaylistCard } from './PlaylistCard.js'
import './PlaylistsView.css'

export function PlaylistsView({ type }: { type?: string } = {}) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const query = usePlaylistsInfiniteQuery(type ? { type } : {})
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
        <view className='playlists__create-bar'>
          <view className='playlists__create-trigger' bindtap={() => setShowForm(true)}>
            <Icon name='plus' size={18} color={ICON_COLORS.content} />
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
      <view className='playlists__create-bar'>
        <view className='playlists__create-trigger' bindtap={() => setShowForm(true)}>
          <Icon name='plus' size={18} color={ICON_COLORS.content} />
          <text className='playlists__create-trigger-text'>{t('playlist.createPlaylist')}</text>
        </view>
        {hiddenCount > 0
          ? (
            <view className='playlists__create-trigger' bindtap={() => setShowHidden(!showHidden)}>
              <text className='playlists__create-trigger-text'>
                {showHidden ? t('playlist.hideHidden') : t('playlist.showHidden', { count: hiddenCount })}
              </text>
            </view>
          )
          : null}
        {playlists.length > 1 && !showForm
          ? selectMode
            ? (
              <view className='playlists__sort-actions'>
                <view className='playlists__create-trigger' bindtap={exitSelectMode}>
                  <text className='playlists__create-trigger-text'>{t('library.cancelSelect')}</text>
                </view>
              </view>
            )
            : (
              <view className='playlists__sort-actions'>
                <view
                  className='playlists__create-trigger'
                  bindtap={() => setSortOpen(true)}
                  data-testid='playlists-sort-menu'
                >
                  <Icon name='sort' size={18} color={ICON_COLORS.content} />
                  <text className='playlists__create-trigger-text'>{t('playlist.sort')}</text>
                </view>
                <view
                  className='playlists__create-trigger'
                  bindtap={enterSelectMode}
                  data-testid='playlists-select-toggle'
                >
                  <text className='playlists__create-trigger-text'>{t('library.select')}</text>
                </view>
              </view>
            )
          : null}
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
        <view className='playlists__grid'>
          {playlists.map((playlist) => (
            <view key={String(playlist.id)} className='playlists__grid-item'>
              <PlaylistCard playlist={playlist} onTap={onTap} />
              {selectMode
                ? (
                  <view className='playlists__select-badge'>
                    <AppCheckbox checked={selected.has(playlist.id)} />
                  </view>
                )
                : null}
            </view>
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
      <ActionSheet open={sortOpen} onClose={() => setSortOpen(false)} title={t('playlist.sort')}>
        <ActionSheetItem
          label={t('playlist.sortNameAsc')}
          onTap={onSortNameAsc}
        />
        <ActionSheetItem
          label={t('playlist.sortNameDesc')}
          onTap={onSortNameDesc}
        />
        <ActionSheetItem
          label={t('playlist.sortNumberPrefix')}
          onTap={onSortNumber}
        />
        <ActionSheetItem
          label={t('playlist.sortManual')}
          onTap={() => { setSortOpen(false); setSortMode(true) }}
        />
      </ActionSheet>
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
