import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'
import { SortableRoot, SortableItem, SortableItemArea } from '@lynx-js/lynx-ui-sortable'

import type { Playlist } from '../../../models/playlist.js'
import { AppCheckbox } from '../../../shared/ui/AppCheckbox.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { pinyinCompare } from '../../../shared/sort/pinyin-compare.js'
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
  const batchDelete = () => {
    if (!confirmBatchDelete) { setConfirmBatchDelete(true); return }
    const ids = Array.from(selected).filter((id) => !playlists.find((p) => p.id === id)?.isBuiltIn)
    void Promise.all(ids.map((id) => deleteMutation.mutateAsync(id))).then(exitSelectMode)
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
                  bindtap={() => {
                    const sorted = [...playlists].sort((a, b) => pinyinCompare(a.name, b.name))
                    const sortedIds = sorted.map((p) => p.id)
                    const originalIds = playlists.map((p) => p.id)
                    if (sortedIds.every((id, i) => id === originalIds[i])) return
                    reorderMutation.mutate(sortedIds)
                  }}
                  data-testid='playlists-sort-az'
                >
                  <Icon name='sort' size={18} color={ICON_COLORS.content} />
                  <text className='playlists__create-trigger-text'>{t('playlist.sortAZ')}</text>
                </view>
                <view
                  className='playlists__create-trigger'
                  bindtap={enterSelectMode}
                  data-testid='playlists-select-toggle'
                >
                  <Icon name='check' size={18} color={ICON_COLORS.content} />
                </view>
                <view
                  className='playlists__create-trigger'
                  bindtap={() => setSortMode(true)}
                  data-testid='playlists-sort-toggle'
                >
                  <Icon name='menu' size={18} color={ICON_COLORS.content} />
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
