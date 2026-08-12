import { useState } from '@lynx-js/react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import type { Song } from '../../models/song.js'
import { usePlayerStore } from '../../features/player/store/index.js'
import { getPlaylistApi } from '../../features/playlist/api/index.js'
import { usePlaylistsInfiniteQuery } from '../../features/playlist/data/playlist-query.js'
import { Icon, ICON_COLORS } from './Icon.js'
import './SongContextMenu.css'

export interface SongContextMenuProps {
  song: Song | null
  onClose: () => void
}

export function SongContextMenu({ song, onClose }: SongContextMenuProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showPlaylists, setShowPlaylists] = useState(false)
  const playlistsQuery = usePlaylistsInfiniteQuery()
  const playlists = playlistsQuery.data?.pages.flatMap(p => p.playlists) ?? []

  if (!song) return null

  const onPlayNext = () => {
    usePlayerStore.getState().insertNextInQueue([song])
    onClose()
  }

  const onAddToQueue = () => {
    usePlayerStore.getState().addToPlaylist([song])
    onClose()
  }

  const onPickPlaylist = (playlistId: number) => {
    void getPlaylistApi().addSongsToPlaylist(playlistId, [song.id]).then(() => {
      void queryClient.invalidateQueries({ queryKey: ['playlist'] })
    })
    onClose()
  }

  return (
    <view className='song-ctx' bindtap={onClose}>
      <view className='song-ctx__backdrop' />
      <view className='song-ctx__panel' catchtap={() => {}}>
        <view className='song-ctx__header'>
          <text className='song-ctx__song-title'>{song.title}</text>
          <text className='song-ctx__song-artist'>{song.artist || ''}</text>
        </view>

        {showPlaylists
          ? (
            <scroll-view className='song-ctx__playlist-list' scroll-y>
              {playlists.filter(p => !p.isBuiltIn).map(p => (
                <view key={String(p.id)} className='song-ctx__item' bindtap={() => onPickPlaylist(p.id)}>
                  <Icon name='music' size={18} color={ICON_COLORS.content2} />
                  <text className='song-ctx__item-text'>{p.name}</text>
                </view>
              ))}
            </scroll-view>
          )
          : (
            <view className='song-ctx__actions'>
              <view className='song-ctx__item' bindtap={onPlayNext}>
                <Icon name='skip-next' size={18} color={ICON_COLORS.content2} />
                <text className='song-ctx__item-text'>{t('songMenu.playNext')}</text>
              </view>
              <view className='song-ctx__item' bindtap={onAddToQueue}>
                <Icon name='plus' size={18} color={ICON_COLORS.content2} />
                <text className='song-ctx__item-text'>{t('songMenu.addToQueue')}</text>
              </view>
              <view className='song-ctx__item' bindtap={() => setShowPlaylists(true)}>
                <Icon name='music' size={18} color={ICON_COLORS.content2} />
                <text className='song-ctx__item-text'>{t('songMenu.addToPlaylist')}</text>
              </view>
            </view>
          )}
      </view>
    </view>
  )
}
