import { useEffect, useMemo, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Input } from '@lynx-js/lynx-ui-input'

import { AppCheckbox } from '../../../shared/ui/AppCheckbox.js'
import type { Song } from '../../../models/song.js'
import { getSongsApi, type SongsFilters } from '../api/index.js'
import { flattenSongs } from '../data/pagination.js'
import { useDebounce } from '../data/use-debounce.js'
import { useSongsInfiniteQuery } from '../data/songs-query.js'
import { librarySortFilters, type LibrarySortId } from '../domain/library-sort.js'
import { usePlayerStore } from '../../player/store/index.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { songRowOverlays } from '../../../shared/ui/song-row-overlays.js'
import { SongRow } from './SongRow.js'
import { SongListRow } from './SongListRow.js'
import { VirtualList } from './VirtualList.js'
import { LibraryToolbar } from './LibraryToolbar.js'
import { LibraryStateMessage } from './LibraryStateMessage.js'

const DEBOUNCE_MS = 350

export interface FlatSongsViewProps {
  /** Song source filter; `undefined` for the `all` view (no `type` param). */
  type?: 'local' | 'remote' | 'radio'
  /** Sort choice, lifted to the page so it persists + survives view switches. */
  sortId: LibrarySortId
  onSortChange: (id: LibrarySortId) => void
}

/**
 * The flat, infinitely-scrolling song list — one of the three content kinds in
 * the 14-view library (the `songs` group: all/local/remote/radio). The sort
 * choice is owned by the page (persisted to prefs, kept across view switches);
 * this view only reports changes upward.
 */
export function FlatSongsView({ type, sortId, onSortChange }: FlatSongsViewProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const debouncedSearch = useDebounce(searchText, DEBOUNCE_MS)

  // Autocomplete: fetch names matching prefix for suggestions
  const [namesCache, setNamesCache] = useState<string[]>([])
  const [namesFetched, setNamesFetched] = useState(false)
  if (searchText.length >= 2 && !namesFetched) {
    setNamesFetched(true)
    void getSongsApi().getSongNames('title').then(setNamesCache).catch(() => {})
  }
  const activeSuggestions = searchText.length >= 2
    ? namesCache.filter(n => n.toLowerCase().includes(searchText.toLowerCase())).slice(0, 5)
    : []

  const filters = useMemo<SongsFilters>(() => {
    const f: SongsFilters = { ...librarySortFilters(sortId) }
    if (type) f.type = type
    if (debouncedSearch.trim()) f.keyword = debouncedSearch.trim()
    return f
  }, [sortId, debouncedSearch, type])

  // Clear multi-select when the visible song list changes (search / sort /
  // source view). Otherwise selected IDs from the previous result set linger
  // and get added to playlists even though they are no longer visible.
  useEffect(() => {
    setSelected(new Set())
  }, [debouncedSearch, sortId, type])

  const query = useSongsInfiniteQuery(filters)
  const songs = flattenSongs(query.data?.pages)

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

  const playAll = () => {
    if (songs.length === 0) return
    void usePlayerStore.getState().playPlaylist(songs, 0)
  }

  const enterSelectMode = () => {
    setSelectMode(true)
    setSelected(new Set())
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  /*
   * The per-song context menu is not listed — `SongListRow` mounts it only while
   * open and registers its own layer (including its two sub-views). Neither is
   * the add-to-playlist sheet: it lives in the root route and arms its own layer
   * when it opens, which is after this one — so back peels the sheet first and
   * the selection survives it.
   */
  useBackHandler(selectMode, () => {
    exitSelectMode()
    return true
  })

  /*
   * The selection goes to the same sheet a single row opens (covers, playlist
   * type, "new playlist", paging) rather than the bare name list this view used
   * to inline. `onAdded` is what makes cancelling non-destructive: only a
   * successful add drops the selection.
   */
  const addSelectedToPlaylist = () => {
    const songIds = Array.from(selected)
    if (songIds.length === 0) return
    songRowOverlays.openAddToPlaylist({ songIds, onAdded: exitSelectMode })
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
        {activeSuggestions.length > 0
          ? (
            <view className='library__suggestions'>
              {activeSuggestions.map(s => (
                <view key={s} className='library__suggestion-item' bindtap={() => { setSearchText(s) }}>
                  <text className='library__suggestion-text'>{s}</text>
                </view>
              ))}
            </view>
          )
          : null}
      </view>

      <LibraryToolbar
        sortId={sortId}
        onSortChange={onSortChange}
        onPlayAll={playAll}
        onAdd={() => navigate({ to: '/library/add' })}
        selectMode={selectMode}
        onToggleSelect={selectMode ? exitSelectMode : enterSelectMode}
        hasSongs={songs.length > 0}
      />

      {query.isLoading
        ? <LibraryStateMessage text={t('library.loadingSongs')} />
        : query.isError && songs.length === 0
          ? <LibraryStateMessage text={t('library.songsError')} tone='error' />
          : songs.length === 0
            ? (
              <LibraryStateMessage
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
                        <view className='library__select-box' bindtap={() => onTapSong(song, index)}>
                          <AppCheckbox checked={selected.has(song.id)} />
                        </view>
                      )
                      : null}
                    <view className='library__select-row-content'>
                      <SongListRow song={song} index={index} onTap={onTapSong} selectionMode={selectMode} />
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

      {selectMode && selected.size > 0
        ? (
          <view className='library__select-toolbar'>
            <text className='library__select-toolbar-count'>
              {t('library.selectedCount', { count: selected.size })}
            </text>
            <view
              className='library__select-toolbar-btn'
              bindtap={addSelectedToPlaylist}
              data-testid='library-select-add-to-playlist'
            >
              <text className='library__select-toolbar-btn-text'>{t('library.addToPlaylist')}</text>
            </view>
          </view>
        )
        : null}
    </view>
  )
}
