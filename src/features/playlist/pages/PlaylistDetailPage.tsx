import { useNavigate, useParams } from '@tanstack/react-router'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { flattenSongs } from '../../library/data/pagination.js'
import { SongRow } from '../../library/widgets/SongRow.js'
import { VirtualList } from '../../library/widgets/VirtualList.js'
// Import the player store directly (not the feature barrel) so the playlist
// graph does not eagerly pull in the full player + its lynx-ui gesture leaves.
import { usePlayerStore } from '../../player/store/index.js'
import {
  usePlaylistQuery,
  usePlaylistSongsInfiniteQuery,
} from '../data/playlist-query.js'
import './PlaylistDetailPage.css'

/**
 * Playlist detail page (batch 6), rendered inside the shell at `/playlists/$id`.
 *
 * Ported (trimmed) from the Flutter `PlaylistDetailPage`: a header (cover / name
 * / description / song count) over the playlist's songs, paginated via the same
 * `SongRow` + `VirtualList` + `bindscrolltolower` load-more the library uses.
 * Tapping a song plays the whole loaded list from that index
 * (`usePlayerStore.playPlaylist`) → the mini-player appears. Sort / search /
 * multi-select / edit / reorder from the Flutter page are deferred (see
 * PROGRESS). Styled entirely via LUNA tokens.
 */
export function PlaylistDetailPage() {
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { id?: string }
  const id = Number(params.id ?? 0) || 0

  const detail = usePlaylistQuery(id)
  const songsQuery = usePlaylistSongsInfiniteQuery(id)
  const songs = flattenSongs(songsQuery.data?.pages)

  const playlist = detail.data
  const cover = playlist?.coverUrl ? buildCoverUrl(playlist.coverUrl) : ''
  const songCount = playlist?.songCount ?? songs.length
  const countLabel = `${songCount} ${songCount === 1 ? 'song' : 'songs'}`

  const onEndReached = () => {
    if (songsQuery.hasNextPage && !songsQuery.isFetchingNextPage) {
      void songsQuery.fetchNextPage()
    }
  }

  const onTapSong = (_song: Song, index: number) => {
    void usePlayerStore.getState().playPlaylist(songs, index)
  }

  const header = (
    <view className='playlist-detail__header'>
      <view className='playlist-detail__topbar'>
        <view
          className='playlist-detail__back'
          bindtap={() => navigate({ to: '/library' })}
        >
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
      </view>
      <view className='playlist-detail__hero'>
        {cover
          ? <image className='playlist-detail__cover' src={cover} />
          : (
            <view className='playlist-detail__cover playlist-detail__cover--empty'>
              <Icon name='music' size={40} color={ICON_COLORS.contentMuted} />
            </view>
          )}
        <view className='playlist-detail__meta'>
          <text className='playlist-detail__name'>
            {playlist?.name ?? (detail.isLoading ? 'Loading…' : 'Playlist')}
          </text>
          {playlist?.description
            ? <text className='playlist-detail__desc'>{playlist.description}</text>
            : null}
          <text className='playlist-detail__count'>{countLabel}</text>
        </view>
      </view>
    </view>
  )

  return (
    <view className='playlist-detail'>
      {header}
      <view className='playlist-detail__body'>
        {songsQuery.isLoading
          ? <DetailState text='Loading songs…' />
          : songsQuery.isError && songs.length === 0
            ? <DetailState text='Could not load songs.' tone='error' />
            : songs.length === 0
              ? <DetailState text='No songs in this playlist' />
              : (
                <VirtualList<Song>
                  className='playlist-detail__list'
                  items={songs}
                  itemKey={(song) => String(song.id)}
                  renderItem={(song, index) => (
                    <SongRow song={song} index={index} onTap={onTapSong} />
                  )}
                  onEndReached={onEndReached}
                  footer={songsQuery.isFetchingNextPage
                    ? (
                      <view className='playlist-detail__footer'>
                        <text className='playlist-detail__footer-text'>Loading more…</text>
                      </view>
                    )
                    : undefined}
                />
              )}
      </view>
    </view>
  )
}

function DetailState({ text, tone }: { text: string; tone?: 'error' }) {
  return (
    <view className='playlist-detail__state'>
      <text
        className={tone === 'error'
          ? 'playlist-detail__state-text playlist-detail__state-text--error'
          : 'playlist-detail__state-text'}
      >
        {text}
      </text>
    </view>
  )
}
