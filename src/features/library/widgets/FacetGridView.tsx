import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Input } from '@lynx-js/lynx-ui-input'

import type { SongFacet } from '../../../models/song.js'
import { useScrollNotifier } from '../../../shared/nav/scroll-visibility.js'
import { flattenFacets } from '../data/pagination.js'
import { useDebounce } from '../data/use-debounce.js'
import { useFacetsInfiniteQuery } from '../data/songs-query.js'
import type { LibraryViewKey } from '../domain/library-views.js'
import { getSongsApi } from '../api/index.js'
import { usePlayerStore } from '../../player/store/index.js'
import { facetContext } from '../../player/domain/playback-context.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { MediaListItem } from '../../../shared/ui/MediaListItem.js'
import { GridSpacers } from '../../../shared/ui/GridSpacers.js'
import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { FacetCard } from './FacetCard.js'
import { LibraryStateMessage } from './LibraryStateMessage.js'

const DEBOUNCE_MS = 350

export interface FacetGridViewProps {
  /** The facet dimension to aggregate (`artist` / `album` / `genre` / …). */
  field: LibraryViewKey
  viewMode?: 'grid' | 'list'
}

/**
 * The category grid — one of the three content kinds in the 14-view library
 * (the `facets` group). Shows every aggregated value of `field` as a card,
 * with a server-side search box (the `/songs/facets` endpoint takes `keyword`;
 * the pre-refactor view wired the param but never exposed it). Dimension
 * selection lives in the view switcher now, so this renders a single field.
 */
export function FacetGridView({ field, viewMode = 'grid' }: FacetGridViewProps) {
  const navigate = useNavigate()
  const { onScroll: onScrollEdge } = useScrollNotifier()
  const { t } = useTranslation()
  const [searchText, setSearchText] = useState('')
  const keyword = useDebounce(searchText, DEBOUNCE_MS).trim()

  const query = useFacetsInfiniteQuery(field, keyword)

  const onPlayAll = async (facet: SongFacet) => {
    try {
      const filters: Record<string, string> = { [field]: facet.value }
      const res = await getSongsApi().getSongs(filters, { limit: 9999, offset: 0 })
      if (res.songs.length === 0) {
        toast.show(t('playlist.emptyPlaylist'))
        return
      }
      await usePlayerStore.getState().playAll(
        res.songs,
        facetContext(field, facet.value),
      )
    } catch {
      toast.error(t('playlist.playFailed'))
    }
  }
  const facets = flattenFacets(query.data?.pages)

  // Dynamic search placeholder — scoped to the current facet dimension.
  const searchPlaceholder =
    field === 'artist' ? t('library.searchArtistPlaceholder') :
    field === 'album' ? t('library.searchAlbumPlaceholder') :
    field === 'genre' ? t('library.searchGenrePlaceholder') :
    field === 'year' || field === 'decade' ? t('library.searchYearPlaceholder') :
    t('library.categorySearchPlaceholder')

  return (
    <view className='library__facets'>
      <view className='library__search-bar'>
        <Input
          className='library__search-input'
          placeholder={searchPlaceholder}
          value={searchText}
          onInput={(value: string) => setSearchText(value)}
        />
      </view>

      {query.isLoading
        ? <LibraryStateMessage text={t('library.loadingCategories')} />
        : query.isError && facets.length === 0
          ? <LibraryStateMessage text={t('library.categoriesError')} tone='error' />
          : facets.length === 0
            ? (
              <LibraryStateMessage
                text={keyword ? t('library.noCategoryMatch') : t('library.noCategories')}
              />
            )
            : (
              <scroll-view
                className='library__grid-scroll'
                scroll-y
                lower-threshold={200}
                bindscroll={onScrollEdge}
                bindscrolltolower={() => {
                  if (query.hasNextPage && !query.isFetchingNextPage) {
                    void query.fetchNextPage()
                  }
                }}
              >
                <view className={viewMode === 'list' ? 'library__facet-list' : 'library__grid'}>
                  {facets.map((facet: SongFacet) =>
                    viewMode === 'list'
                      ? (
                        <MediaListItem
                          key={`${field}:${facet.value}`}
                          name={facet.value || t('common.unknown')}
                          subtitle={t(
                            facet.count === 1 ? 'common.songCountOne' : 'common.songCountOther',
                            { count: facet.count },
                          )}
                          coverUrl={facet.coverUrl ? buildCoverUrl(facet.coverUrl) : undefined}
                          onTap={() =>
                            navigate({
                              to: '/library/category/$field',
                              params: { field },
                              search: { value: facet.value, cover: facet.coverUrl },
                            })}
                          onPlayAll={() => { void onPlayAll(facet) }}
                        />
                      )
                      : (
                        <FacetCard
                          key={`${field}:${facet.value}`}
                          facet={facet}
                          onPlayAll={onPlayAll}
                          onTap={(f) =>
                            navigate({
                              to: '/library/category/$field',
                              params: { field },
                              search: { value: f.value, cover: f.coverUrl },
                            })}
                        />
                      ))}
                  {viewMode === 'list' ? null : <GridSpacers />}
                </view>
                              <view className='library__nav-inset' />
</scroll-view>
            )}
    </view>
  )
}
