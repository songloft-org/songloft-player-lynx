import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Input } from '@lynx-js/lynx-ui-input'

import type { SongTag } from '../../../models/song-tag.js'
import { useDebounce } from '../data/use-debounce.js'
import { flattenTags, useTagListInfiniteQuery } from '../data/song-tags-query.js'
import { getSongsApi } from '../api/index.js'
import { usePlayerStore } from '../../player/store/index.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { MediaListItem } from '../../../shared/ui/MediaListItem.js'
import { GridSpacers } from '../../../shared/ui/GridSpacers.js'
import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { TagCard } from './TagCard.js'
import { LibraryStateMessage } from './LibraryStateMessage.js'
import { TagRenameDialog } from './TagRenameDialog.js'
import { TagDeleteDialog } from './TagDeleteDialog.js'
import './TagGridView.css'

const DEBOUNCE_MS = 350

export interface TagGridViewProps {
  viewMode?: 'grid' | 'list'
}

export function TagGridView({ viewMode = 'grid' }: TagGridViewProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchText, setSearchText] = useState('')
  const keyword = useDebounce(searchText, DEBOUNCE_MS).trim()

  const query = useTagListInfiniteQuery(keyword)
  const tags = flattenTags(query.data?.pages)

  const [renameTag, setRenameTag] = useState<SongTag | null>(null)
  const [deleteTag, setDeleteTag] = useState<SongTag | null>(null)

  const onPlayAll = async (tag: SongTag) => {
    try {
      const res = await getSongsApi().getSongs({ tagId: tag.id }, { limit: 9999, offset: 0 })
      if (res.songs.length === 0) {
        toast.show(t('playlist.emptyPlaylist'))
        return
      }
      await usePlayerStore.getState().playAll(
        res.songs,
        { type: 'tag' as const, key: String(tag.id) },
      )
    } catch {
      toast.error(t('playlist.playFailed'))
    }
  }

  const navigateToTag = (tag: SongTag) => {
    navigate({
      to: '/library/tags/$tagId',
      params: { tagId: String(tag.id) },
      search: { name: tag.name, cover: tag.coverUrl || undefined },
    })
  }

  return (
    <view className='library__facets'>
      <view className='library__search-bar'>
        <Input
          className='library__search-input'
          placeholder={t('songTag.searchPlaceholder')}
          value={searchText}
          onInput={(value: string) => setSearchText(value)}
        />
      </view>

      {query.isLoading
        ? <LibraryStateMessage text={t('common.loading')} />
        : query.isError && tags.length === 0
          ? <LibraryStateMessage text={t('library.categoriesError')} tone='error' />
          : tags.length === 0
            ? <LibraryStateMessage text={keyword ? t('library.noCategoryMatch') : t('songTag.noTags')} />
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
                <view className={viewMode === 'list' ? 'library__facet-list' : 'library__grid'}>
                  {tags.map((tag: SongTag) =>
                    viewMode === 'list'
                      ? (
                        <MediaListItem
                          key={`tag:${tag.id}`}
                          name={tag.name}
                          subtitle={t(
                            tag.songCount === 1 ? 'common.songCountOne' : 'common.songCountOther',
                            { count: tag.songCount },
                          )}
                          coverUrl={tag.coverUrl ? buildCoverUrl(tag.coverUrl) : undefined}
                          onTap={() => navigateToTag(tag)}
                          onPlayAll={() => { void onPlayAll(tag) }}
                          onMore={() => setRenameTag(tag)}
                        />
                      )
                      : (
                        <TagCard
                          key={`tag:${tag.id}`}
                          tag={tag}
                          onTap={navigateToTag}
                          onPlayAll={onPlayAll}
                        />
                      ))}
                  {viewMode === 'list' ? null : <GridSpacers />}
                </view>
                              <view className='library__nav-inset' />
</scroll-view>
            )}

      {renameTag
        ? (
          <TagRenameDialog
            tag={renameTag}
            onClose={() => setRenameTag(null)}
            onDelete={() => { setDeleteTag(renameTag); setRenameTag(null) }}
          />
        )
        : null}

      {deleteTag
        ? <TagDeleteDialog tag={deleteTag} onClose={() => setDeleteTag(null)} />
        : null}
    </view>
  )
}
