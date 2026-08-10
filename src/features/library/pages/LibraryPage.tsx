import { useMemo, useState } from '@lynx-js/react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Input } from '@lynx-js/lynx-ui-input'

import { usePlayerStore } from '../../player/store/index.js'
import type { Song, SongFacet } from '../../../models/song.js'
import type { SongsFilters } from '../api/index.js'
import { flattenFacets, flattenSongs } from '../data/pagination.js'
import { useDebounce } from '../data/use-debounce.js'
import {
  useFacetsInfiniteQuery,
  useSongsInfiniteQuery,
} from '../data/songs-query.js'
import { PlaylistsView } from '../../playlist/widgets/PlaylistsView.js'
import { FacetCard } from '../widgets/FacetCard.js'
import { SongRow } from '../widgets/SongRow.js'
import { VirtualList } from '../widgets/VirtualList.js'
import './LibraryPage.css'

type LibraryView = 'songs' | 'facets' | 'playlists'

type FacetField = 'artist' | 'album' | 'genre'

const FACET_FIELDS: readonly FacetField[] = ['artist', 'album', 'genre']

const FACET_LABEL_KEYS: Record<FacetField, string> = {
  artist: 'library.facetArtist',
  album: 'library.facetAlbum',
  genre: 'library.facetGenre',
}

const VIEW_ORDER: readonly LibraryView[] = ['songs', 'facets', 'playlists']

const VIEW_LABEL_KEYS: Record<LibraryView, string> = {
  songs: 'library.tabSongs',
  facets: 'library.tabCategories',
  playlists: 'library.tabPlaylists',
}

export type SortOption = 'added_at' | 'title' | 'artist'

const SORT_OPTIONS: readonly SortOption[] = ['added_at', 'title', 'artist']

const SORT_LABEL_KEYS: Record<SortOption, string> = {
  added_at: 'library.sortRecent',
  title: 'library.sortTitle',
  artist: 'library.sortArtist',
}

const DEBOUNCE_MS = 350

export function LibraryPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const search = useSearch({ strict: false }) as { view?: LibraryView }
  const view: LibraryView = search.view ?? 'songs'

  return (
    <view className='library'>
      <view className='library__switcher'>
        {VIEW_ORDER.map((key) => (
          <view
            key={key}
            className={key === view ? 'library__tab library__tab--active' : 'library__tab'}
            bindtap={() => navigate({ to: '/library', search: { view: key } })}
          >
            <text className='library__tab-text'>{t(VIEW_LABEL_KEYS[key])}</text>
          </view>
        ))}
      </view>

      <view className='library__body'>
        {view === 'songs' ? <SongsView /> : null}
        {view === 'facets' ? <FacetsView /> : null}
        {view === 'playlists' ? <PlaylistsView /> : null}
      </view>
    </view>
  )
}

// ── Songs view (flat, infinite) ──────────────────────────────────────────────

function SongsView() {
  const { t } = useTranslation()
  const [searchText, setSearchText] = useState('')
  const [sortField, setSortField] = useState<SortOption>('added_at')

  const debouncedSearch = useDebounce(searchText, DEBOUNCE_MS)

  const filters = useMemo<SongsFilters>(() => {
    const f: SongsFilters = {
      sort: sortField,
      order: sortField === 'added_at' ? 'desc' : 'asc',
    }
    if (debouncedSearch.trim()) {
      f.keyword = debouncedSearch.trim()
    }
    return f
  }, [sortField, debouncedSearch])

  const query = useSongsInfiniteQuery(filters)
  const songs = flattenSongs(query.data?.pages)

  const onEndReached = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage()
    }
  }

  const onTapSong = (_song: Song, index: number) => {
    void usePlayerStore.getState().playPlaylist(songs, index)
  }

  return (
    <view className='library__songs-view'>
      <view className='library__search-bar'>
        <Input
          className='library__search-input'
          placeholder={t('library.searchPlaceholder')}
          value={searchText}
          onInput={(value: string) => setSearchText(value)}
        />
      </view>

      <view className='library__sort-bar'>
        {SORT_OPTIONS.map((opt) => (
          <view
            key={opt}
            className={opt === sortField ? 'library__chip library__chip--active' : 'library__chip'}
            bindtap={() => setSortField(opt)}
          >
            <text className='library__chip-text'>{t(SORT_LABEL_KEYS[opt])}</text>
          </view>
        ))}
      </view>

      {query.isLoading
        ? <StateMessage text={t('library.loadingSongs')} />
        : query.isError && songs.length === 0
          ? <StateMessage text={t('library.songsError')} tone='error' />
          : songs.length === 0
            ? (
              <StateMessage
                text={debouncedSearch ? t('library.noSearchResults') : t('library.noSongs')}
                subtext={debouncedSearch ? undefined : t('library.noSongsSubtitle')}
              />
            )
            : (
              <VirtualList<Song>
                className='library__list'
                items={songs}
                itemKey={(song) => String(song.id)}
                renderItem={(song, index) => (
                  <SongRow song={song} index={index} onTap={onTapSong} />
                )}
                onEndReached={onEndReached}
                footer={query.isFetchingNextPage
                  ? (
                    <view className='library__footer'>
                      <text className='library__footer-text'>{t('common.loadingMore')}</text>
                    </view>
                  )
                  : undefined}
              />
            )}
    </view>
  )
}

// ── Categories view (facet grid) ─────────────────────────────────────────────

function FacetsView() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const search = useSearch({ strict: false }) as { field?: FacetField }
  const field: FacetField = search.field ?? 'artist'
  const query = useFacetsInfiniteQuery(field)
  const facets = flattenFacets(query.data?.pages)

  return (
    <view className='library__facets'>
      <view className='library__facet-fields'>
        {FACET_FIELDS.map((key) => (
          <view
            key={key}
            className={key === field ? 'library__chip library__chip--active' : 'library__chip'}
            bindtap={() => navigate({ to: '/library', search: { view: 'facets', field: key } })}
          >
            <text className='library__chip-text'>{t(FACET_LABEL_KEYS[key])}</text>
          </view>
        ))}
      </view>

      {query.isLoading
        ? <StateMessage text={t('library.loadingCategories')} />
        : query.isError && facets.length === 0
          ? <StateMessage text={t('library.categoriesError')} tone='error' />
          : facets.length === 0
            ? <StateMessage text={t('library.noCategories')} />
            : (
              <scroll-view
                className='library__grid-scroll'
                scroll-y
                lower-threshold={200}
                bindscrolltolower={() => {
                  if (query.hasNextPage && !query.isFetchingNextPage) {
                    void query.fetchNextPage()
                  }
                }}
              >
                <view className='library__grid'>
                  {facets.map((facet: SongFacet) => (
                    <FacetCard
                      key={`${field}:${facet.value}`}
                      facet={facet}
                      onTap={(f) =>
                        navigate({
                          to: '/library/category/$field',
                          params: { field },
                          search: { value: f.value, cover: f.coverUrl },
                        })}
                    />
                  ))}
                </view>
              </scroll-view>
            )}
    </view>
  )
}

// ── Shared state message (loading / empty / error) ───────────────────────────

function StateMessage({
  text,
  subtext,
  tone,
}: {
  text: string
  subtext?: string
  tone?: 'error'
}) {
  return (
    <view className='library__state'>
      <text className={tone === 'error' ? 'library__state-text library__state-text--error' : 'library__state-text'}>
        {text}
      </text>
      {subtext ? <text className='library__state-subtext'>{subtext}</text> : null}
    </view>
  )
}
