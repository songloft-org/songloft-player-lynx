import { useMemo } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { flattenSongs } from '../../library/data/pagination.js'
import { usePlaylistSongsInfiniteQuery } from '../data/playlist-query.js'
import { ModalMaterial } from '../../../shared/ui/ModalMaterial.js'
import { ModalScrim } from '../../../shared/ui/ModalScrim.js'
import { ScrollingText } from '../../../shared/ui/ScrollingText.js'
import '../../../shared/ui/overlay-motion.css'
import './SongCoverPicker.css'

export interface SongCoverPickerProps {
  playlistId: number
  onSelect: (songId: number, coverUrl: string) => void
  onClose: () => void
}

export function SongCoverPicker({ playlistId, onSelect, onClose }: SongCoverPickerProps) {
  const { t } = useTranslation()
  const songsQuery = usePlaylistSongsInfiniteQuery(playlistId, {})
  const allSongs = flattenSongs(songsQuery.data?.pages)

  const songsWithCover = useMemo(
    () => allSongs.filter((s): s is Song & { coverUrl: string } => !!s.coverUrl),
    [allSongs],
  )

  useBackHandler(true, () => {
    onClose()
    return true
  })

  const onEndReached = () => {
    if (songsQuery.hasNextPage && !songsQuery.isFetchingNextPage) {
      void songsQuery.fetchNextPage()
    }
  }

  return (
    <view className='song-cover-picker' bindtap={onClose} data-testid='song-cover-picker'>
      {/* Light page dim; the content panel owns its local material. */}

      <ModalScrim className='song-cover-picker__backdrop' />
      <view className='song-cover-picker__panel overlay--enter-up' catchtap={() => {}}>
        <ModalMaterial shape='sheet' />
        <view className='song-cover-picker__header'>
          <text className='song-cover-picker__title'>{t('playlist.pickFromSongs')}</text>
          <view
            className='song-cover-picker__close'
            bindtap={onClose}
            accessibility-element={true}
            accessibility-label={t('common.close')}
            data-testid='song-cover-picker-close'
          >
            <Icon name='x' size={18} color={ICON_COLORS.content2} />
          </view>
        </view>
        <scroll-view
          className='song-cover-picker__scroll'
          scroll-y
          lower-threshold={200}
          bindscrolltolower={onEndReached}
        >
          {songsWithCover.length === 0 && !songsQuery.isLoading
            ? (
              <view className='song-cover-picker__empty'>
                <text className='song-cover-picker__empty-text'>
                  {t('playlist.noSongsWithCover')}
                </text>
              </view>
            )
            : (
              <view className='song-cover-picker__grid'>
                {songsWithCover.map((song) => (
                  <view
                    key={String(song.id)}
                    className='song-cover-picker__item'
                    bindtap={() => onSelect(song.id, song.coverUrl)}
                    data-testid={`song-cover-picker-item-${song.id}`}
                  >
                    <image
                      className='song-cover-picker__cover'
                      src={buildCoverUrl(song.coverUrl, song.updatedAt)}
                      mode='aspectFill'
                    />
                    <ScrollingText textClassName='song-cover-picker__song-title' text={song.title} />
                  </view>
                ))}
              </view>
            )}
          {songsQuery.isFetchingNextPage
            ? (
              <view className='song-cover-picker__loading'>
                <text className='song-cover-picker__loading-text'>{t('common.loadingMore')}</text>
              </view>
            )
            : null}
        </scroll-view>
      </view>
    </view>
  )
}
