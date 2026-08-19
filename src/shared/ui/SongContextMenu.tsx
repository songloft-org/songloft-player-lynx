import { useState } from '@lynx-js/react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { Song } from '../../models/song.js'
import { useBackHandler } from '../nav/use-back-handler.js'
import { usePlayerStore } from '../../features/player/store/index.js'
import { getPlaylistApi } from '../../features/playlist/api/index.js'
import { getSongsApi } from '../../features/library/api/index.js'
import { usePlaylistsInfiniteQuery } from '../../features/playlist/data/playlist-query.js'
import { Icon, ICON_COLORS } from './Icon.js'
import './SongContextMenu.css'

export interface SongContextMenuProps {
  song: Song | null
  onClose: () => void
}

export function SongContextMenu({ song, onClose }: SongContextMenuProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showPlaylists, setShowPlaylists] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const playlistsQuery = usePlaylistsInfiniteQuery()
  const playlists = playlistsQuery.data?.pages.flatMap(p => p.playlists) ?? []

  /*
   * Closing resets the two sub-views.
   *
   * The component is not unmounted when it closes — the call sites keep rendering it
   * with `song = null` — so `showPlaylists` / `confirmDelete` survived a close and the
   * *next* song's menu opened straight into the playlist picker, or with delete
   * already armed. Latent before, but the back key makes it reachable in one press.
   */
  const close = () => {
    setShowPlaylists(false)
    setConfirmDelete(false)
    onClose()
  }

  /*
   * One handler peels one layer per press: armed delete → playlist picker → the menu
   * itself. Written as an explicit order rather than three registrations so it does
   * not depend on which sub-view happened to be activated last.
   */
  useBackHandler(song != null, () => {
    if (confirmDelete) {
      setConfirmDelete(false)
      return true
    }
    if (showPlaylists) {
      setShowPlaylists(false)
      return true
    }
    close()
    return true
  })

  if (!song) return null

  const onPlayNext = () => {
    usePlayerStore.getState().insertNextInQueue([song])
    close()
  }

  const onAddToQueue = () => {
    usePlayerStore.getState().addToPlaylist([song])
    close()
  }

  const onPickPlaylist = (playlistId: number) => {
    void getPlaylistApi().addSongsToPlaylist(playlistId, [song.id]).then(() => {
      void queryClient.invalidateQueries({ queryKey: ['playlist'] })
    })
    close()
  }

  const onDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    void getSongsApi().deleteSong(song.id).then(() => {
      void queryClient.invalidateQueries({ queryKey: ['songs'] })
      close()
    })
  }

  return (
    <view className='song-ctx' bindtap={close}>
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
              <view className='song-ctx__item' bindtap={() => { close(); void navigate({ to: '/library/song/$songId', params: { songId: String(song.id) } }) }}>
                <Icon name='info' size={18} color={ICON_COLORS.content2} />
                <text className='song-ctx__item-text'>{t('songMenu.viewDetail')}</text>
              </view>
              <view className='song-ctx__item' bindtap={onDelete}>
                <Icon name='x' size={18} color={ICON_COLORS.danger} />
                <text className={confirmDelete ? 'song-ctx__item-text song-ctx__item-text--danger' : 'song-ctx__item-text'}>
                  {confirmDelete ? t('songMenu.deleteConfirm') : t('songMenu.deleteSong')}
                </text>
              </view>
            </view>
          )}
      </view>
    </view>
  )
}
