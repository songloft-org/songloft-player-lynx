import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'

import type { Playlist } from '../../../models/playlist.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { flattenPlaylists } from '../data/pagination.js'
import { usePlaylistsInfiniteQuery } from '../data/playlist-query.js'
import { useCreatePlaylistMutation, useReorderPlaylistsMutation } from '../data/playlist-mutations.js'
import { PlaylistCard } from './PlaylistCard.js'
import './PlaylistsView.css'

function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  const tmp = next[index]!
  next[index] = next[target]!
  next[target] = tmp
  return next
}

export function PlaylistsView() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const query = usePlaylistsInfiniteQuery()
  const playlists = flattenPlaylists(query.data?.pages)
  const createMutation = useCreatePlaylistMutation()
  const reorderMutation = useReorderPlaylistsMutation()

  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [sortMode, setSortMode] = useState(false)
  const [orderedPlaylists, setOrderedPlaylists] = useState<Playlist[]>([])

  const enterSortMode = () => {
    setOrderedPlaylists(playlists)
    setSortMode(true)
  }
  const exitSortMode = () => {
    setSortMode(false)
  }
  const move = (index: number, delta: -1 | 1) => {
    const next = moveItem(orderedPlaylists, index, delta)
    setOrderedPlaylists(next)
    reorderMutation.mutate(next.map((p) => p.id))
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
    void navigate({ to: '/playlists/$id', params: { id: String(playlist.id) } })
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
          <view className='playlists__create-trigger' bindtap={exitSortMode}>
            <text className='playlists__create-trigger-text'>{t('playlist.doneSorting')}</text>
          </view>
        </view>
        <scroll-view className='playlists__scroll' scroll-y>
          <view className='playlists__sort-list'>
            {orderedPlaylists.map((playlist, index) => (
              <view key={String(playlist.id)} className='playlists__sort-row'>
                <text className='playlists__sort-row-name'>
                  {playlist.name || t('common.untitled')}
                </text>
                <view className='playlists__sort-row-actions'>
                  <view
                    className={'playlists__sort-btn' + (index === 0 ? ' playlists__sort-btn--disabled' : '')}
                    bindtap={() => move(index, -1)}
                    data-testid={`playlists-move-up-${playlist.id}`}
                  >
                    <Icon
                      name='chevron-up'
                      size={18}
                      color={index === 0 ? ICON_COLORS.contentMuted : ICON_COLORS.content}
                    />
                  </view>
                  <view
                    className={'playlists__sort-btn' +
                      (index === orderedPlaylists.length - 1 ? ' playlists__sort-btn--disabled' : '')}
                    bindtap={() => move(index, 1)}
                    data-testid={`playlists-move-down-${playlist.id}`}
                  >
                    <Icon
                      name='chevron-down'
                      size={18}
                      color={index === orderedPlaylists.length - 1
                        ? ICON_COLORS.contentMuted
                        : ICON_COLORS.content}
                    />
                  </view>
                </view>
              </view>
            ))}
          </view>
        </scroll-view>
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
        {playlists.length > 1 && !showForm
          ? (
            <view
              className='playlists__create-trigger'
              bindtap={enterSortMode}
              data-testid='playlists-sort-toggle'
            >
              <Icon name='sort' size={18} color={ICON_COLORS.content} />
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
            <PlaylistCard key={String(playlist.id)} playlist={playlist} onTap={onTap} />
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
