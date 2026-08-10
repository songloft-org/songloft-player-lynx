import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { Playlist } from '../../../models/playlist.js'
import { flattenPlaylists } from '../data/pagination.js'
import { usePlaylistsInfiniteQuery } from '../data/playlist-query.js'
import { PlaylistCard } from './PlaylistCard.js'
import './PlaylistsView.css'

/**
 * The "Playlists" view embedded in the library page (replaces the batch-4
 * placeholder). A responsive grid of {@link PlaylistCard}s fed by the infinite
 * playlist list; tapping a card navigates to the playlist detail route
 * (`/playlists/$id`). Loading / empty / error states are all covered. Uses a
 * `<scroll-view>` grid (children mount into the tree) with `bindscrolltolower`
 * load-more, mirroring the library categories grid.
 */
export function PlaylistsView() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const query = usePlaylistsInfiniteQuery()
  const playlists = flattenPlaylists(query.data?.pages)

  if (query.isLoading) {
    return <PlaylistState text={t('playlist.loadingPlaylists')} />
  }
  if (query.isError && playlists.length === 0) {
    return <PlaylistState text={t('playlist.playlistsError')} tone='error' />
  }
  if (playlists.length === 0) {
    return (
      <PlaylistState
        text={t('playlist.noPlaylistsTitle')}
        subtext={t('playlist.noPlaylistsSubtitle')}
      />
    )
  }

  const onTap = (playlist: Playlist) => {
    void navigate({ to: '/playlists/$id', params: { id: String(playlist.id) } })
  }

  return (
    <view className='playlists'>
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
