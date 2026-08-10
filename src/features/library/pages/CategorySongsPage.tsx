import { useMemo } from '@lynx-js/react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
// Import the player store directly (not the player feature barrel) so the
// library graph does not eagerly pull in the full player + its lynx-ui gesture
// leaves.
import { usePlayerStore } from '../../player/store/index.js'
import type { SongsFilters } from '../api/index.js'
import { flattenSongs } from '../data/pagination.js'
import { useSongsInfiniteQuery } from '../data/songs-query.js'
import { SongRow } from '../widgets/SongRow.js'
import { VirtualList } from '../widgets/VirtualList.js'
import './CategorySongsPage.css'

/**
 * Category songs page (Categories → facet drill-in), rendered inside the shell
 * at `/library/category/$field`.
 *
 * Ported (trimmed) from the Flutter `CategorySongsPage`
 * (`features/library/presentation/category_songs_page.dart` + route
 * `/library/categories/:field?value=&cover=`): tapping a facet card in the
 * Categories view opens the flat list of songs in that dimension value. Mirrors
 * the `PlaylistDetailPage` + `SongsView` pattern — a header (field label / value
 * / optional cover) over the songs, paginated via the same `SongRow` +
 * `VirtualList` + `bindscrolltolower` load-more. Tapping a song plays the whole
 * loaded list from that index (`usePlayerStore.playPlaylist`) → the mini-player
 * appears. Styled entirely via LUNA tokens.
 */

type FacetField = 'artist' | 'album' | 'genre'

const FIELD_LABEL_KEYS: Record<FacetField, string> = {
  artist: 'library.facetArtist',
  album: 'library.facetAlbum',
  genre: 'library.facetGenre',
}

function normalizeField(field: string | undefined): FacetField {
  return field === 'album' || field === 'genre' ? field : 'artist'
}

export function CategorySongsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const params = useParams({ strict: false }) as { field?: string }
  const search = useSearch({ strict: false }) as { value?: string; cover?: string }

  const field = normalizeField(params.field)
  const value = search.value ?? ''
  const cover = search.cover ? buildCoverUrl(search.cover) : ''

  // Filter by the drilled dimension, newest first (mirrors the songs view).
  const filters = useMemo<SongsFilters>(
    () => ({ [field]: value, sort: 'added_at', order: 'desc' }),
    [field, value],
  )

  const songsQuery = useSongsInfiniteQuery(filters)
  const songs = flattenSongs(songsQuery.data?.pages)

  const onEndReached = () => {
    if (songsQuery.hasNextPage && !songsQuery.isFetchingNextPage) {
      void songsQuery.fetchNextPage()
    }
  }

  const onTapSong = (_song: Song, index: number) => {
    void usePlayerStore.getState().playPlaylist(songs, index)
  }

  const header = (
    <view className='category-songs__header'>
      <view className='category-songs__topbar'>
        <view
          className='category-songs__back'
          bindtap={() => navigate({ to: '/library', search: { view: 'facets', field } })}
        >
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
      </view>
      <view className='category-songs__hero'>
        {cover
          ? <image className='category-songs__cover' src={cover} />
          : (
            <view className='category-songs__cover category-songs__cover--empty'>
              <Icon name='music' size={40} color={ICON_COLORS.contentMuted} />
            </view>
          )}
        <view className='category-songs__meta'>
          <text className='category-songs__label'>{t(FIELD_LABEL_KEYS[field])}</text>
          <text className='category-songs__name'>{value || t('common.unknown')}</text>
        </view>
      </view>
    </view>
  )

  return (
    <view className='category-songs'>
      {header}
      <view className='category-songs__body'>
        {songsQuery.isLoading
          ? <CategoryState text={t('library.loadingSongs')} />
          : songsQuery.isError && songs.length === 0
            ? <CategoryState text={t('category.songsError')} tone='error' />
            : songs.length === 0
              ? <CategoryState text={t('category.noSongs')} />
              : (
                <VirtualList<Song>
                  className='category-songs__list'
                  items={songs}
                  itemKey={(song) => String(song.id)}
                  renderItem={(song, index) => (
                    <SongRow song={song} index={index} onTap={onTapSong} />
                  )}
                  onEndReached={onEndReached}
                  footer={songsQuery.isFetchingNextPage
                    ? (
                      <view className='category-songs__footer'>
                        <text className='category-songs__footer-text'>{t('common.loadingMore')}</text>
                      </view>
                    )
                    : undefined}
                />
              )}
      </view>
    </view>
  )
}

function CategoryState({ text, tone }: { text: string; tone?: 'error' }) {
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
