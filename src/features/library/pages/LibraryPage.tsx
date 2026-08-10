import { useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

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
// The Playlists view lives in the playlist feature (batch 6); import the widget
// directly so the library graph does not pull in the detail page eagerly.
import { PlaylistsView } from '../../playlist/widgets/PlaylistsView.js'
import { FacetCard } from '../widgets/FacetCard.js'
import { SongRow } from '../widgets/SongRow.js'
import { VirtualList } from '../widgets/VirtualList.js'
import './LibraryPage.css'

/**
 * Library browse page (batch 4), rendered inside the shell at `/library`.
 *
 * Ported (trimmed) from the Flutter `LibraryPage`: a view switcher over a flat
 * **songs** list (infinite pagination), a **categories** grid (facet
 * aggregation), and a **playlists** grid (batch 6 — see `PlaylistsView`).
 * Multi-select, favourites, search, sort menus and the customize editor from the
 * Flutter page are deferred.
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

/** i18n keys for facet field chips (localised at render). */
const FACET_LABEL_KEYS: Record<FacetField, string> = {
  artist: 'library.facetArtist',
  album: 'library.facetAlbum',
  genre: 'library.facetGenre',
}

const VIEW_ORDER: readonly LibraryView[] = ['songs', 'facets', 'playlists']

/** i18n keys for the view switcher tabs (localised at render). */
const VIEW_LABEL_KEYS: Record<LibraryView, string> = {
  songs: 'library.tabSongs',
  facets: 'library.tabCategories',
  playlists: 'library.tabPlaylists',
}

/** Default flat-list filters (newest first), mirroring the Flutter default. */
const SONGS_FILTERS: SongsFilters = { sort: 'added_at', order: 'desc' }

export function LibraryPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  // View is URL-driven (`?view=`), so returning from a pushed route (e.g. the
  // playlist detail page → `?view=playlists`) restores the tab the user was on,
  // and it survives remounts. Mirrors the Flutter `?view=` query param.
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
  const query = useSongsInfiniteQuery(SONGS_FILTERS)
  const songs = flattenSongs(query.data?.pages)

  if (query.isLoading) {
    return <StateMessage text={t('library.loadingSongs')} />
  }
  if (query.isError && songs.length === 0) {
    return <StateMessage text={t('library.songsError')} tone='error' />
  }
  if (songs.length === 0) {
    return <StateMessage text={t('library.noSongs')} subtext={t('library.noSongsSubtitle')} />
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
            <text className='library__footer-text'>{t('common.loadingMore')}</text>
          </view>
        )
        : undefined}
    />
  )
}

// ── Categories view (facet grid) ─────────────────────────────────────────────

function FacetsView() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  // Facet field is URL-driven too (`?view=facets&field=album`), so returning
  // from a category drill-in restores the field the user was on (not 'artist').
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
