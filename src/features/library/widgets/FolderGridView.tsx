import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Input } from '@lynx-js/lynx-ui-input'

import type { FolderInfo } from '../../../models/folder.js'
import type { Song } from '../../../models/song.js'
import { useDebounce } from '../data/use-debounce.js'
import { useFoldersQuery } from '../data/folder-query.js'
import { getSongsApi } from '../api/index.js'
import { usePlayerStore } from '../../player/store/index.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { MediaListItem } from '../../../shared/ui/MediaListItem.js'
import { GridSpacers } from '../../../shared/ui/GridSpacers.js'
import { SongListRow } from '../widgets/SongListRow.js'
import { FolderCard } from './FolderCard.js'
import { LibraryStateMessage } from './LibraryStateMessage.js'

const DEBOUNCE_MS = 350

export interface FolderGridViewProps {
  viewMode?: 'grid' | 'list'
}

export function FolderGridView({ viewMode = 'grid' }: FolderGridViewProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchText, setSearchText] = useState('')
  const keyword = useDebounce(searchText, DEBOUNCE_MS).trim()

  const query = useFoldersQuery('', keyword)
  const data = query.data
  const folders = data?.folders ?? []
  const songs = data?.songs ?? []

  const onTapSong = (_song: Song, index: number) => {
    void usePlayerStore.getState().playPlaylist(songs, index)
  }

  const onPlayAll = async (folder: FolderInfo) => {
    try {
      const pathPrefix = data?.musicPath
        ? `${data.musicPath}/${folder.path}/`
        : `${folder.path}/`
      const res = await getSongsApi().getSongs({ pathPrefix }, { limit: 10000, offset: 0 })
      if (res.songs.length === 0) {
        toast.show(t('playlist.emptyPlaylist'))
        return
      }
      await usePlayerStore.getState().playAll(res.songs)
    } catch {
      toast.error(t('playlist.playFailed'))
    }
  }

  const onTapFolder = (folder: FolderInfo) => {
    navigate({
      to: '/library/folders',
      search: { path: folder.path },
    })
  }

  const goToSettings = () => {
    navigate({ to: '/settings' })
  }

  return (
    <view className='library__facets'>
      <view className='library__search-bar'>
        <Input
          className='library__search-input'
          placeholder={t('library.folderSearchPlaceholder')}
          value={searchText}
          onInput={(value: string) => setSearchText(value)}
        />
      </view>

      {query.isLoading
        ? <LibraryStateMessage text={t('library.loadingFolders')} />
        : query.isError && folders.length === 0
          ? <LibraryStateMessage text={t('library.foldersError')} tone='error' />
          : folders.length === 0 && songs.length === 0
            ? (
              <LibraryStateMessage
                text={
                  data && !data.musicPath
                    ? t('library.folderNoMusicPath')
                    : keyword
                      ? t('library.noFolderMatch')
                      : t('library.noFolders')
                }
                actionLabel={data && !data.musicPath ? t('library.configureMusicPath') : undefined}
                onAction={data && !data.musicPath ? goToSettings : undefined}
              />
            )
            : (
              <scroll-view className='library__grid-scroll' scroll-y>
                {folders.length > 0
                  ? (
                    <view className={viewMode === 'list' ? 'library__facet-list' : 'library__grid'}>
                      {folders.map((folder: FolderInfo) =>
                        viewMode === 'list'
                          ? (
                            <MediaListItem
                              key={folder.path}
                              name={folder.name || t('common.unknown')}
                              subtitle={t(
                                folder.songCount === 1 ? 'common.songCountOne' : 'common.songCountOther',
                                { count: folder.songCount },
                              )}
                              onTap={() => onTapFolder(folder)}
                              onPlayAll={() => { void onPlayAll(folder) }}
                            />
                          )
                          : (
                            <FolderCard
                              key={folder.path}
                              folder={folder}
                              onPlayAll={onPlayAll}
                              onTap={onTapFolder}
                            />
                          ))}
                      {viewMode === 'list' ? null : <GridSpacers />}
                    </view>
                  )
                  : null}
                {folders.length > 0 && songs.length > 0
                  ? <view className='folder-content__divider' />
                  : null}
                {songs.length > 0
                  ? (
                    <view className='library__facet-list'>
                      {songs.map((song, index) => (
                        <SongListRow key={song.id} song={song} index={index} onTap={onTapSong} />
                      ))}
                    </view>
                  )
                  : null}
                              <view className='library__nav-inset' />
</scroll-view>
            )}
    </view>
  )
}
