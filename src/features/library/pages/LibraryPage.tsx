import { useState } from '@lynx-js/react'

// Import the store directly (not the player feature barrel) so the library
// graph does not eagerly pull in the full player + its lynx-ui gesture leaves.
import { usePlayerStore } from '../../player/store/index.js'
import type { Song, SongFacet } from '../../../models/song.js'
import type { SongsFilters } from '../api/index.js'
import { flattenFacets, flattenSongs } from '../data/pagination.js'
import {
  useFacetsInfiniteQuery,
  useSongsInfiniteQuery,
} from '../data/songs-query.js'
import { FacetCard } from '../widgets/FacetCard.js'
import { SongRow } from '../widgets/SongRow.js'
import { VirtualList } from '../widgets/VirtualList.js'
import './LibraryPage.css'

/**
 * Library browse page (batch 4), rendered inside the shell at `/library`.
 *
 * Ported (trimmed) from the Flutter `LibraryPage`: a view switcher over a flat
 * **songs** list (infinite pagination) and a **categories** grid (facet
 * aggregation). The **playlists** view is a placeholder — playlists land in a
 * later batch. Multi-select, favourites, search, sort menus and the customize
 * editor from the Flutter page are likewise deferred.
 *
 * List virtualization + load-more uses the native Lynx `<list>` element with
 * `bindscrolltolower` → `fetchNextPage()` (dependency-free vs. lynx-ui
 * FeedList); the container has a resolved height and each row a stable
 * `item-key` per the Lynx `<list>` guardrails. All styling goes through LUNA
 * tokens.
 */

type LibraryView = 'songs' | 'facets' | 'playlists'

type FacetField = 'artist' | 'album' | 'genre'

const FACET_FIELDS: readonly FacetField[] = ['artist', 'album', 'genre']

const FACET_LABELS: Record<FacetField, string> = {
  artist: 'Artist',
  album: 'Album',
  genre: 'Genre',
}

const VIEW_LABELS: Record<LibraryView, string> = {
  songs: 'Songs',
  facets: 'Categories',
  playlists: 'Playlists',
}

/** Default flat-list filters (newest first), mirroring the Flutter default. */
const SONGS_FILTERS: SongsFilters = { sort: 'added_at', order: 'desc' }

export function LibraryPage() {
  const [view, setView] = useState<LibraryView>('songs')

  return (
    <view className='library'>
      <view className='library__switcher'>
        {(Object.keys(VIEW_LABELS) as LibraryView[]).map((key) => (
          <view
            key={key}
            className={key === view ? 'library__tab library__tab--active' : 'library__tab'}
            bindtap={() => setView(key)}
          >
            <text className='library__tab-text'>{VIEW_LABELS[key]}</text>
          </view>
        ))}
      </view>

      <view className='library__body'>
        {view === 'songs' ? <SongsView /> : null}
        {view === 'facets' ? <FacetsView /> : null}
        {view === 'playlists' ? <PlaylistsPlaceholder /> : null}
      </view>
    </view>
  )
}

// ── Songs view (flat, infinite) ──────────────────────────────────────────────

function SongsView() {
  const query = useSongsInfiniteQuery(SONGS_FILTERS)
  const songs = flattenSongs(query.data?.pages)

  if (query.isLoading) {
    return <StateMessage text='Loading songs…' />
  }
  if (query.isError && songs.length === 0) {
    return <StateMessage text='Could not load songs. Pull to retry.' tone='error' />
  }
  if (songs.length === 0) {
    return <StateMessage text='No songs yet' subtext='Songs from your library will appear here.' />
  }

  const onEndReached = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage()
    }
  }

  // Tapping a row plays it with the whole loaded list as the queue, then the
  // mini-player appears (shell). `getState()` avoids a store subscription here.
  const onTapSong = (_song: Song, index: number) => {
    void usePlayerStore.getState().playPlaylist(songs, index)
  }

  return (
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
            <text className='library__footer-text'>Loading more…</text>
          </view>
        )
        : undefined}
    />
  )
}

// ── Categories view (facet grid) ─────────────────────────────────────────────

function FacetsView() {
  const [field, setField] = useState<FacetField>('artist')
  const query = useFacetsInfiniteQuery(field)
  const facets = flattenFacets(query.data?.pages)

  return (
    <view className='library__facets'>
      <view className='library__facet-fields'>
        {FACET_FIELDS.map((key) => (
          <view
            key={key}
            className={key === field ? 'library__chip library__chip--active' : 'library__chip'}
            bindtap={() => setField(key)}
          >
            <text className='library__chip-text'>{FACET_LABELS[key]}</text>
          </view>
        ))}
      </view>

      {query.isLoading
        ? <StateMessage text='Loading categories…' />
        : query.isError && facets.length === 0
          ? <StateMessage text='Could not load categories.' tone='error' />
          : facets.length === 0
            ? <StateMessage text='No categories' />
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
                    <FacetCard key={`${field}:${facet.value}`} facet={facet} />
                  ))}
                </view>
              </scroll-view>
            )}
    </view>
  )
}

// ── Playlists placeholder (later batch) ──────────────────────────────────────

function PlaylistsPlaceholder() {
  return (
    <StateMessage
      text='Playlists coming soon'
      subtext='Playlist browsing arrives in a later batch.'
    />
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
