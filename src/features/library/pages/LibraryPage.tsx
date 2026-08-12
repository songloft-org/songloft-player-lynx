import { useMemo, useState } from '@lynx-js/react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
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
import { setLastLibrarySearch } from '../data/last-library-search.js'
import { getPlaylistApi } from '../../playlist/api/index.js'
import { usePlaylistsInfiniteQuery } from '../../playlist/data/playlist-query.js'
import { PlaylistsView } from '../../playlist/widgets/PlaylistsView.js'
import { SongContextMenu } from '../../../shared/ui/SongContextMenu.js'
import { FacetCard } from '../widgets/FacetCard.js'
import { SongRow } from '../widgets/SongRow.js'
import { FavoriteSongRow } from '../widgets/FavoriteSongRow.js'
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

  setLastLibrarySearch(search as { view?: LibraryView; field?: FacetField })

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
  const queryClient = useQueryClient()
  const [searchText, setSearchText] = useState('')
  const [sortField, setSortField] = useState<SortOption>('added_at')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [contextSong, setContextSong] = useState<Song | null>(null)
  const [filterGenre, setFilterGenre] = useState('')
  const [filterArtist, setFilterArtist] = useState('')
  const [filterAlbum, setFilterAlbum] = useState('')

  const debouncedSearch = useDebounce(searchText, DEBOUNCE_MS)
  const hasFilters = !!(filterGenre || filterArtist || filterAlbum)

  const filters = useMemo<SongsFilters>(() => {
    const f: SongsFilters = {
      sort: sortField,
      order: sortField === 'added_at' ? 'desc' : 'asc',
    }
    if (debouncedSearch.trim()) f.keyword = debouncedSearch.trim()
    if (filterGenre) f.genre = filterGenre
    if (filterArtist) f.artist = filterArtist
    if (filterAlbum) f.album = filterAlbum
    return f
  }, [sortField, debouncedSearch, filterGenre, filterArtist, filterAlbum])

  const query = useSongsInfiniteQuery(filters)
  const songs = flattenSongs(query.data?.pages)

  const playlistsQuery = usePlaylistsInfiniteQuery()
  const playlists = playlistsQuery.data?.pages.flatMap(p => p.playlists) ?? []

  const onEndReached = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage()
    }
  }

  const onTapSong = (song: Song, index: number) => {
    if (selectMode) {
      setSelected(prev => {
        const next = new Set(prev)
        if (next.has(song.id)) next.delete(song.id)
        else next.add(song.id)
        return next
      })
    } else {
      void usePlayerStore.getState().playPlaylist(songs, index)
    }
  }

  const enterSelectMode = () => {
    setSelectMode(true)
    setSelected(new Set())
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
    setShowPlaylistPicker(false)
  }

  const onAddToPlaylist = (playlistId: number) => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    void getPlaylistApi().addSongsToPlaylist(playlistId, ids).then(() => {
      void queryClient.invalidateQueries({ queryKey: ['playlist'] })
      exitSelectMode()
    })
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
        <view className='library__chip-spacer' />
        {selectMode
          ? (
            <view className='library__chip library__chip--active' bindtap={exitSelectMode}>
              <text className='library__chip-text'>{t('library.cancelSelect')}</text>
            </view>
          )
          : (
            <view className='library__chip' bindtap={enterSelectMode}>
              <text className='library__chip-text'>{t('library.select')}</text>
            </view>
          )}
      </view>

      <view className='library__filter-bar'>
        <Input
          className='library__filter-input'
          placeholder={t('library.facetGenre')}
          value={filterGenre}
          onInput={(v: string) => setFilterGenre(v)}
        />
        <Input
          className='library__filter-input'
          placeholder={t('library.facetArtist')}
          value={filterArtist}
          onInput={(v: string) => setFilterArtist(v)}
        />
        <Input
          className='library__filter-input'
          placeholder={t('library.facetAlbum')}
          value={filterAlbum}
          onInput={(v: string) => setFilterAlbum(v)}
        />
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
                  <view className={selectMode && selected.has(song.id) ? 'library__select-row library__select-row--selected' : 'library__select-row'}>
                    {selectMode
                      ? (
                        <view className={selected.has(song.id) ? 'library__select-check library__select-check--on' : 'library__select-check'}>
                          {selected.has(song.id) ? <text className='library__select-check-mark'>✓</text> : null}
                        </view>
                      )
                      : null}
                    <view className='library__select-row-content'>
                      <FavoriteSongRow song={song} index={index} onTap={onTapSong} onLongPress={selectMode ? undefined : setContextSong} />
                    </view>
                  </view>
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

      {selectMode && selected.size > 0 && !showPlaylistPicker
        ? (
          <view className='library__select-toolbar'>
            <text className='library__select-toolbar-count'>
              {t('library.selectedCount', { count: selected.size })}
            </text>
            <view className='library__select-toolbar-btn' bindtap={() => setShowPlaylistPicker(true)}>
              <text className='library__select-toolbar-btn-text'>{t('library.addToPlaylist')}</text>
            </view>
          </view>
        )
        : null}

      {showPlaylistPicker
        ? (
          <view className='library__playlist-picker'>
            <view className='library__playlist-picker-header'>
              <text className='library__playlist-picker-title'>{t('library.addToPlaylist')}</text>
              <view className='library__playlist-picker-close' bindtap={() => setShowPlaylistPicker(false)}>
                <text className='library__playlist-picker-close-text'>✕</text>
              </view>
            </view>
            <scroll-view className='library__playlist-picker-list' scroll-y>
              {playlists.filter(p => !p.isBuiltIn).map(p => (
                <view key={String(p.id)} className='library__playlist-picker-item' bindtap={() => onAddToPlaylist(p.id)}>
                  <text className='library__playlist-picker-item-text'>{p.name}</text>
                </view>
              ))}
            </scroll-view>
          </view>
        )
        : null}

      <SongContextMenu song={contextSong} onClose={() => setContextSong(null)} />
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
