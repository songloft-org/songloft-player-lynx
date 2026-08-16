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
 * Category songs page (Categories → facet/source drill-in), rendered inside the
 * shell at `/library/category/$field`.
 *
 * Supports both facet fields (artist/album/genre/year/decade/language/style) and
 * source fields (local/remote/radio/folder/recent/favorites/random). The filter
 * applied to the songs query is determined by the field type.
 */

/** All recognized category field IDs. */
type CategoryField =
  | 'artist' | 'album' | 'genre' | 'year' | 'decade' | 'language' | 'style'
  | 'local' | 'remote' | 'radio' | 'folder' | 'recent' | 'favorites' | 'random'

const FIELD_LABEL_KEYS: Record<CategoryField, string> = {
  artist: 'library.facetArtist',
  album: 'library.facetAlbum',
  genre: 'library.facetGenre',
  year: 'library.browseYear',
  decade: 'library.browseDecade',
  language: 'library.browseLanguage',
  style: 'library.browseStyle',
  local: 'library.browseLocal',
  remote: 'library.browseRemote',
  radio: 'library.browseRadio',
  folder: 'library.browseFolder',
  recent: 'library.browseRecent',
  favorites: 'library.browseFavorites',
  random: 'library.browseRandom',
}

/** Set of valid field IDs for runtime validation. */
const VALID_FIELDS: ReadonlySet<string> = new Set(Object.keys(FIELD_LABEL_KEYS))

/** Source view IDs that filter by song type or special sort. */
const SOURCE_FIELDS: ReadonlySet<string> = new Set([
  'local', 'remote', 'radio', 'folder', 'recent', 'favorites', 'random',
])

function normalizeField(field: string | undefined): CategoryField {
  if (field && VALID_FIELDS.has(field)) return field as CategoryField
  return 'artist'
}

/** Build the SongsFilters for the given field and optional value. */
function buildFiltersForField(field: CategoryField, value: string): SongsFilters {
  const base: SongsFilters = { sort: 'added_at', order: 'desc' }

  if (SOURCE_FIELDS.has(field)) {
    switch (field) {
      case 'local': return { ...base, type: 'local' }
      case 'remote': return { ...base, type: 'remote' }
      case 'radio': return { ...base, type: 'radio' }
      case 'folder': return { ...base, pathPrefix: value || undefined }
      case 'recent': return { sort: 'added_at', order: 'desc' }
      case 'favorites': return { ...base, excludePlaylistLabels: 'none' }
      case 'random': return { ...base, sort: 'random' }
      default: return base
    }
  }

  // Facet fields: filter by dimension value
  switch (field) {
    case 'artist': return { ...base, artist: value }
    case 'album': return { ...base, album: value }
    case 'genre': return { ...base, genre: value }
    case 'year': return { ...base, year: Number(value) || undefined }
    case 'decade': return { ...base, decade: Number(value) || undefined }
    case 'language': return { ...base, language: value }
    case 'style': return { ...base, style: value }
    default: return base
  }
}

export function CategorySongsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const params = useParams({ strict: false }) as { field?: string }
  const search = useSearch({ strict: false }) as { value?: string; cover?: string }

  const field = normalizeField(params.field)
  const value = search.value ?? ''
  const cover = search.cover ? buildCoverUrl(search.cover) : ''

  const filters = useMemo<SongsFilters>(
    () => buildFiltersForField(field, value),
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

  const playAll = () => {
    if (songs.length === 0) return
    void usePlayerStore.getState().playPlaylist(songs, 0)
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
        {songs.length > 0
          ? (
            <view className='category-songs__play-all' bindtap={playAll}>
              <text className='category-songs__play-all-text'>{t('playlist.playAll')}</text>
            </view>
          )
          : null}
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
