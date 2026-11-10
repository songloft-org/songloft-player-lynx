import { useState } from '@lynx-js/react'
import { useParams, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { usePlayerStore } from '../../player/store/index.js'
import { playAllWithBackgroundFill } from '../../player/data/play-all.js'
import { PlayHistoryPanel } from '../../player/widgets/PlayHistoryPanel.js'
import { flattenSongs } from '../data/pagination.js'
import { useTagSongsInfiniteQuery } from '../data/song-tags-query.js'
import { getSongsApi } from '../api/index.js'
import { SongListRow } from '../widgets/SongListRow.js'
import { VirtualList } from '../widgets/VirtualList.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { PlaylistsView } from '../../playlist/widgets/PlaylistsView.js'
import './TagSongsPage.css'

export function TagSongsPage() {
  const { t } = useTranslation()
  const params = useParams({ strict: false }) as { tagId?: string }
  const search = useSearch({ strict: false }) as { name?: string; cover?: string; view?: 'playlists' | 'songs' }

  const tagId = Number(params.tagId) || 0
  const tagName = search.name ?? ''
  const cover = search.cover ? buildCoverUrl(search.cover) : ''

  const [tab, setTab] = useState<'playlists' | 'songs'>(search.view ?? 'songs')
  const songsQuery = useTagSongsInfiniteQuery(tagId, tab === 'songs')
  const songs = flattenSongs(songsQuery.data?.pages)
  const total = songsQuery.data?.pages[0]?.total ?? 0

  const playbackCtx = { type: 'tag' as const, key: String(tagId) }
  const [showHistory, setShowHistory] = useState(false)

  const onEndReached = () => {
    if (songsQuery.hasNextPage && !songsQuery.isFetchingNextPage) {
      void songsQuery.fetchNextPage()
    }
  }

  const onTapSong = (_song: Song, index: number) => {
    void usePlayerStore.getState().playPlaylist(songs, index, playbackCtx)
    // Tap plays the scrolled-in pages immediately; the rest of the tag comes
    // in as a background fill so the queue is not truncated at page size
    // (songloft-player-lynx#9). Sync call right after the play — see the
    // store action doc. Same filter as `useTagSongsInfiniteQuery` above.
    if (total > songs.length) {
      usePlayerStore.getState().loadRemainingSongsForCurrentPlaylist({
        loadedCount: songs.length,
        total,
        fetch: (offset, limit) =>
          getSongsApi().getSongs({ tagId }, { limit, offset }).then((res) => res.songs),
      })
    }
  }

  const playAll = async () => {
    try {
      const started = await playAllWithBackgroundFill(
        (offset, limit) => getSongsApi().getSongs({ tagId }, { limit, offset }),
        playbackCtx,
      )
      if (!started) toast.show(t('playlist.emptyPlaylist'))
    } catch {
      toast.error(t('playlist.playFailed'))
    }
  }

  const header = (
    <view className='category-songs__header'>
      <view className='category-songs__topbar'>
        <view
          className='category-songs__back'
          bindtap={() => performRouteBack()}
          accessibility-element={true}
          accessibility-label={t('common.back')}
        >
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <view className='category-songs__topbar-right'>
          {tab === 'songs' && songs.length > 0
            ? (
              <view className='category-songs__play-all' bindtap={() => { void playAll() }}>
                <text className='category-songs__play-all-text'>{t('playlist.playAll')}</text>
              </view>
            )
            : null}
          {tab === 'songs' ? <view
            className='category-songs__icon-btn'
            bindtap={() => setShowHistory(true)}
            accessibility-element={true}
            accessibility-label={t('history.title')}
            data-testid='tag-songs-history'
          >
            <Icon name='history' size={20} color={ICON_COLORS.content2} />
          </view> : null}
        </view>
      </view>
      <view className='category-songs__hero'>
        {cover
          ? <image className='category-songs__cover' mode='aspectFill' src={cover} />
          : (
            <view className='category-songs__cover category-songs__cover--empty'>
              <Icon name='label' size={40} color={ICON_COLORS.contentMuted} />
            </view>
          )}
        <view className='category-songs__meta'>
          <text className='category-songs__label'>
            {tab === 'songs' ? t('songTag.subtitle', { count: total }) : t('songTag.tags')}
          </text>
          <text className='category-songs__name'>{tagName || t('common.unknown')}</text>
        </view>
      </view>
      <view className='tag-collections__tabs'>
        {(['playlists', 'songs'] as const).map(value => (
          <view key={value} className={`tag-collections__tab${tab === value ? ' tag-collections__tab--active' : ''}`} bindtap={() => setTab(value)} data-testid={`tag-tab-${value}`}>
            <text className='tag-collections__tab-text'>{value === 'playlists' ? t('songTag.playlists') : t('songTag.songs')}</text>
          </view>
        ))}
      </view>
    </view>
  )

  return (
    <view className='category-songs'>
      {header}
      <view className='category-songs__body'>
        {tab === 'playlists' ? <PlaylistsView tagId={tagId} /> : songsQuery.isLoading
          ? <TagState text={t('library.loadingSongs')} />
          : songsQuery.isError && songs.length === 0
            ? <TagState text={t('category.songsError')} tone='error' />
            : songs.length === 0
              ? <TagState text={t('playlist.emptyPlaylist')} />
              : (
                <VirtualList<Song>
                  className='category-songs__list'
                  items={songs}
                  itemKey={(song) => String(song.id)}
                  renderItem={(song, index) => (
                    <SongListRow song={song} index={index} onTap={onTapSong} />
                  )}
                  onEndReached={onEndReached}
                  footer={songsQuery.isFetchingNextPage
                    ? (
                      <view className='category-songs__footer'>
                        <text className='category-songs__footer-text'>{t('common.loadingMore')}</text>
                      </view>
                    )
                    : <view className='category-songs__nav-inset' />}
                />
              )}
      </view>
      {showHistory
        ? (
          <PlayHistoryPanel
            context={playbackCtx}
            title={t('history.titleFor', { name: tagName || t('common.unknown') })}
            queue={songs}
            onClose={() => setShowHistory(false)}
          />
        )
        : null}
    </view>
  )
}

function TagState({ text, tone }: { text: string; tone?: 'error' }) {
  return (
    <view className='category-songs__state'>
      <text
        className={tone === 'error'
          ? 'category-songs__state-text category-songs__state-text--error'
          : 'category-songs__state-text'}
      >
        {text}
      </text>
    </view>
  )
}
