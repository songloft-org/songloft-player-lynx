import { useMemo, useState } from '@lynx-js/react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Playlist } from '../../../models/playlist.js'
import type { Song } from '../../../models/song.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { MediaListItem } from '../../../shared/ui/MediaListItem.js'
import { ModalMaterial } from '../../../shared/ui/ModalMaterial.js'
import { ModalScrim } from '../../../shared/ui/ModalScrim.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { useDebounce } from '../../library/data/use-debounce.js'
import { flattenSongs } from '../../library/data/pagination.js'
import { useSongsInfiniteQuery } from '../../library/data/songs-query.js'
import { ALL_MUSIC_TYPE, type SongsFilters } from '../../library/api/index.js'
import { getPlaylistApi } from '../api/index.js'
import { useAddSongsMutation } from '../data/playlist-mutations.js'
import { playlistQueryKeys } from '../data/playlist-query.js'
import '../../../shared/ui/overlay-motion.css'
import './AddSongsToPlaylistSheet.css'

export interface AddSongsToPlaylistSheetProps {
  playlistId: number
  /** Radio playlists only take radio songs; normal ones never take them. */
  playlistType: Playlist['type']
  onClose: () => void
}

/**
 * Song picker for "add songs to this playlist" — the Lynx counterpart of the
 * Flutter build's `SongPickerModal` (`song_picker_modal.dart`).
 *
 * Songs already in the playlist are hidden **before** the list is rendered:
 * the complete id set comes from `/playlists/{id}/song-ids` rather than from
 * the pages the detail list happens to have scrolled through, so a song is
 * never offered twice no matter how deep it sits in a long playlist.
 *
 * The list is the library's own `/songs` feed with paging and keyword search.
 * Type compatibility is settled client-side to match `Playlist.CanAddSong` on
 * the backend (normal: local/remote, radio: radio), so the picker cannot offer
 * a song the server would only count as `skipped`.
 *
 * Rendered by `PlaylistDetailPage` only while open — the mount is the open
 * state, so closing drops the queries with it. Back closes the sheet.
 */
export function AddSongsToPlaylistSheet({
  playlistId,
  playlistType,
  onClose,
}: AddSongsToPlaylistSheetProps) {
  const { t } = useTranslation()
  const [searchText, setSearchText] = useState('')
  const keyword = useDebounce(searchText, 300).trim()
  const [selected, setSelected] = useState<Set<number>>(new Set())

  /*
   * `excludePlaylistLabels: 'none'` is deliberate: this is a management
   * surface, and a song sitting in a hidden playlist must still be addable
   * here (same reasoning as the Flutter picker).
   */
  const filters = useMemo<SongsFilters>(() => ({
    keyword: keyword || undefined,
    type: playlistType === 'radio' ? 'radio' : ALL_MUSIC_TYPE,
    excludePlaylistLabels: 'none',
  }), [keyword, playlistType])

  const songsQuery = useSongsInfiniteQuery(filters)
  const addedIdsQuery = useQuery({
    queryKey: playlistQueryKeys.songIds(playlistId),
    queryFn: () => getPlaylistApi().getPlaylistSongIds(playlistId),
  })
  const addMutation = useAddSongsMutation(playlistId)

  const addedIds = useMemo(
    () => new Set(addedIdsQuery.data ?? []),
    [addedIdsQuery.data],
  )
  const songs = flattenSongs(songsQuery.data?.pages)
  // Mirrors `Playlist.CanAddSong`: radio playlists take radio only, normal
  // ones take everything else.
  const typeAllowed = (song: Song) => playlistType === 'radio'
    ? song.type === 'radio'
    : song.type !== 'radio'
  const available = songs.filter((song) => !addedIds.has(song.id) && typeAllowed(song))

  useBackHandler(true, () => {
    onClose()
    return true
  })

  const toggle = (songId: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(songId)) next.delete(songId)
      else next.add(songId)
      return next
    })
  }

  const confirm = () => {
    if (selected.size === 0 || addMutation.isPending) return
    void addMutation.mutateAsync(Array.from(selected))
      .then(({ added, skipped }) => {
        toast.success(skipped > 0
          ? t('playlist.addedWithSkipped', { added, skipped })
          : t(
              added === 1 ? 'playlist.addedCountOne' : 'playlist.addedCountOther',
              { count: added },
            ))
        onClose()
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error && error.message
          ? error.message
          : t('playlist.addSongsFailed'))
      })
  }

  const onEndReached = () => {
    if (songsQuery.hasNextPage && !songsQuery.isFetchingNextPage) {
      void songsQuery.fetchNextPage()
    }
  }

  const idsFailed = addedIdsQuery.isError
  const songsFailed = songsQuery.isError && songs.length === 0
  const loading = addedIdsQuery.isPending || (songsQuery.isPending && !songsFailed)
  const canConfirm = selected.size > 0 && !addMutation.isPending

  return (
    <view className='playlist-add-songs' data-testid='add-songs-sheet'>
      <ModalScrim className='playlist-add-songs__backdrop' bindtap={onClose} data-testid='add-songs-backdrop' />
      <view className='playlist-add-songs__panel overlay--enter-up'>
        <ModalMaterial shape='sheet' />
        <view className='playlist-add-songs__handle-wrap'>
          <view className='playlist-add-songs__handle' />
        </view>

        <view className='playlist-add-songs__header'>
          <text className='playlist-add-songs__title'>{t('playlist.pickerTitle')}</text>
          <view
            className={canConfirm
              ? 'playlist-add-songs__confirm'
              : 'playlist-add-songs__confirm playlist-add-songs__confirm--disabled'}
            bindtap={confirm}
            accessibility-element={true}
            accessibility-label={t('playlist.addSongs')}
            data-testid='add-songs-confirm'
          >
            <text className='playlist-add-songs__confirm-text'>
              {addMutation.isPending
                ? t('common.loading')
                : t('playlist.pickerConfirm', { count: selected.size })}
            </text>
          </view>
        </view>

        <view className='playlist-add-songs__search-bar'>
          <Input
            className='playlist-add-songs__search'
            placeholder={t('playlist.pickerSearchPlaceholder')}
            value={searchText}
            onInput={(value: string) => setSearchText(value)}
          />
        </view>

        {loading
          ? <text className='playlist-add-songs__state'>{t('common.loading')}</text>
          : idsFailed || songsFailed
            ? (
              <view className='playlist-add-songs__state-block'>
                <Icon name='x' size={32} color={ICON_COLORS.danger} />
                <text className='playlist-add-songs__state'>{t('playlist.songsError')}</text>
                <view
                  className='playlist-add-songs__retry'
                  bindtap={() => {
                    if (idsFailed) void addedIdsQuery.refetch()
                    if (songsFailed) void songsQuery.refetch()
                  }}
                  data-testid='add-songs-retry'
                >
                  <text className='playlist-add-songs__retry-text'>{t('common.retry')}</text>
                </view>
              </view>
            )
            : available.length === 0
              ? (
                <view className='playlist-add-songs__state-block'>
                  <Icon name='music' size={40} color={ICON_COLORS.contentMuted} />
                  <text className='playlist-add-songs__state' data-testid='add-songs-empty'>
                    {t('playlist.pickerEmpty')}
                  </text>
                </view>
              )
              : (
                <scroll-view
                  className='playlist-add-songs__list'
                  scroll-y
                  lower-threshold={200}
                  bindscrolltolower={onEndReached}
                >
                  {available.map((song: Song) => (
                    <MediaListItem
                      key={String(song.id)}
                      name={song.title}
                      subtitle={[song.artist, song.album].filter(Boolean).join(' · ')}
                      coverUrl={song.coverUrl ? buildCoverUrl(song.coverUrl, song.updatedAt) : undefined}
                      selectMode={true}
                      isSelected={selected.has(song.id)}
                      onTap={() => toggle(song.id)}
                      testIdSuffix={`add-song-${song.id}`}
                    />
                  ))}
                  {songsQuery.isFetchingNextPage
                    ? <text className='playlist-add-songs__footer'>{t('common.loadingMore')}</text>
                    : songsQuery.isError
                      ? (
                        <view
                          className='playlist-add-songs__footer-retry'
                          bindtap={() => void songsQuery.fetchNextPage()}
                        >
                          <text className='playlist-add-songs__footer'>{t('addToPlaylist.loadFailedTapRetry')}</text>
                        </view>
                      )
                      : songsQuery.hasNextPage
                        ? null
                        : <text className='playlist-add-songs__footer'>{t('addToPlaylist.loadedAll')}</text>}
                </scroll-view>
              )}
      </view>
    </view>
  )
}
