import { useMemo, useState } from '@lynx-js/react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
// Import the player store directly (not the player feature barrel) so the
// library graph does not eagerly pull in the full player + its lynx-ui gesture
// leaves. Same reason for reaching into the domain module for the context
// helper.
import { facetContext } from '../../player/domain/playback-context.js'
import { usePlayerStore } from '../../player/store/index.js'
// Safe with respect to the note above: the panel is built from plain views, not
// lynx-ui gesture components.
import { PlayHistoryPanel } from '../../player/widgets/PlayHistoryPanel.js'
import type { SongsFilters } from '../api/index.js'
import { flattenSongs } from '../data/pagination.js'
import { useSongsInfiniteQuery } from '../data/songs-query.js'
import {
  LIBRARY_VIEW_LABEL_KEY,
} from '../domain/library-views.js'
import { SongListRow } from '../widgets/SongListRow.js'
import { VirtualList } from '../widgets/VirtualList.js'
import './CategorySongsPage.css'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'

/**
 * Category songs page (facet drill-in), rendered inside the shell at
 * `/library/category/$field`.
 *
 * `field` is one of the 7 facet dimensions (artist/album/genre/year/decade/
 * language/style); the songs are filtered by that dimension's value. The
 * pre-refactor "source" pseudo-fields (local/remote/radio/folder/recent/
 * favorites/random) are gone: the first four are proper flat views in the
 * 14-view library page now, and the last three never worked (folder matched a
 * localized label against `path_prefix`, favorites showed the whole library,
 * random sent a sort value the backend whitelist rejects).
 */

/** All recognized category field IDs (= the facet-group view keys). */
type CategoryField =
  | 'artist' | 'album' | 'genre' | 'year' | 'decade' | 'language' | 'style'

/** Set of valid field IDs for runtime validation. */
const VALID_FIELDS: ReadonlySet<string> = new Set([
  'artist', 'album', 'genre', 'year', 'decade', 'language', 'style',
])

function normalizeField(field: string | undefined): CategoryField {
  if (field && VALID_FIELDS.has(field)) return field as CategoryField
  return 'artist'
}

/** Build the SongsFilters for the given facet field and value. */
function buildFiltersForField(field: CategoryField, value: string): SongsFilters {
  const base: SongsFilters = { sort: 'added_at', order: 'desc' }
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

  /**
   * Playback context for this drill-in. `undefined` for the empty
   * "unknown <dimension>" bucket — that is not a history context, so playback
   * there is not recorded.
   */
  const playbackCtx = useMemo(() => facetContext(field, value), [field, value])
  const [showHistory, setShowHistory] = useState(false)

  const onTapSong = (_song: Song, index: number) => {
    void usePlayerStore.getState().playPlaylist(songs, index, playbackCtx)
  }

  const playAll = () => {
    if (songs.length === 0) return
    void usePlayerStore.getState().playAll(songs, playbackCtx)
  }

  const header = (
    <view className='category-songs__header'>
      <view className='category-songs__topbar'>
        <view
          className='category-songs__back'
          bindtap={() => performRouteBack()}
        >
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <view className='category-songs__topbar-right'>
          {songs.length > 0
            ? (
              <view className='category-songs__play-all' bindtap={playAll}>
                <text className='category-songs__play-all-text'>{t('playlist.playAll')}</text>
              </view>
            )
            : null}
          {/*
            One entry point covers all seven facet dimensions — every facet
            field is a history context (`playbackCtx` is what decides that).
          */}
          {playbackCtx
            ? (
              <view
                className='category-songs__icon-btn'
                bindtap={() => setShowHistory(true)}
                data-testid='category-songs-history'
              >
                <Icon name='history' size={20} color={ICON_COLORS.content2} />
              </view>
            )
            : null}
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
          <text className='category-songs__label'>{t(LIBRARY_VIEW_LABEL_KEY[field])}</text>
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
      {/* Mounted only while open, so entering the page costs no history request. */}
      {showHistory && playbackCtx
        ? (
          <PlayHistoryPanel
            context={playbackCtx}
            title={t('history.titleFor', { name: value || t('common.unknown') })}
            queue={songs}
            onClose={() => setShowHistory(false)}
          />
        )
        : null}
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
