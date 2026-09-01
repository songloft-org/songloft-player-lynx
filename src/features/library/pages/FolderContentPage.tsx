import { useMemo, useState } from '@lynx-js/react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { FolderInfo } from '../../../models/folder.js'
import type { Song } from '../../../models/song.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { usePlayerStore } from '../../player/store/index.js'
import { getSongsApi } from '../api/index.js'
import { useFoldersQuery } from '../data/folder-query.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { SongListRow } from '../widgets/SongListRow.js'
import { VirtualList } from '../widgets/VirtualList.js'
import { FolderCard } from '../widgets/FolderCard.js'
import { MediaListItem } from '../../../shared/ui/MediaListItem.js'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import './FolderContentPage.css'

export function FolderContentPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const search = useSearch({ strict: false }) as { path?: string }

  const folderPath = search.path ?? ''
  const folderName = folderPath.split('/').filter(Boolean).pop() ?? ''

  const query = useFoldersQuery(folderPath)
  const data = query.data
  const folders = data?.folders ?? []
  const songs = data?.songs ?? []

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const onTapSubfolder = (folder: FolderInfo) => {
    navigate({
      to: '/library/folders',
      search: { path: folder.path },
    })
  }

  const onPlayAllFolder = async (folder: FolderInfo) => {
    try {
      const pathPrefix = data?.musicPath
        ? `${data.musicPath}/${folder.path}/`
        : `${folder.path}/`
      const res = await getSongsApi().getSongs({ pathPrefix }, { limit: 10000, offset: 0 })
      if (res.songs.length === 0) {
        toast.show(t('playlist.emptyPlaylist'))
        return
      }
      await usePlayerStore.getState().playPlaylist(res.songs, 0)
    } catch {
      toast.error(t('playlist.playFailed'))
    }
  }

  const playAll = async () => {
    try {
      const pathPrefix = data?.musicPath
        ? `${data.musicPath}/${folderPath}/`
        : `${folderPath}/`
      const res = await getSongsApi().getSongs({ pathPrefix }, { limit: 10000, offset: 0 })
      if (res.songs.length === 0) {
        toast.show(t('playlist.emptyPlaylist'))
        return
      }
      await usePlayerStore.getState().playPlaylist(res.songs, 0)
    } catch {
      toast.error(t('playlist.playFailed'))
    }
  }

  const onTapSong = (_song: Song, index: number) => {
    void usePlayerStore.getState().playPlaylist(songs, index)
  }

  const allItems = useMemo(() => {
    const items: Array<{ kind: 'folder'; folder: FolderInfo } | { kind: 'song'; song: Song; index: number }> = []
    for (const folder of folders) {
      items.push({ kind: 'folder', folder })
    }
    for (let i = 0; i < songs.length; i++) {
      items.push({ kind: 'song', song: songs[i]!, index: i })
    }
    return items
  }, [folders, songs])

  const header = (
    <view className='folder-content__header'>
      <view className='folder-content__topbar'>
        <view
          className='category-songs__back'
          bindtap={() => performRouteBack()}
        >
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='folder-content__title'>{folderName}</text>
        <view className='folder-content__topbar-right'>
          <view
            className='category-songs__icon-btn'
            bindtap={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
          >
            <Icon name={viewMode === 'grid' ? 'list' : 'grid'} size={20} color={ICON_COLORS.content2} />
          </view>
          {(songs.length > 0 || folders.length > 0)
            ? (
              <view className='category-songs__play-all' bindtap={() => { void playAll() }}>
                <text className='category-songs__play-all-text'>{t('playlist.playAll')}</text>
              </view>
            )
            : null}
        </view>
      </view>
    </view>
  )

  const folderSection = folders.length > 0
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
                onTap={() => onTapSubfolder(folder)}
                onPlayAll={() => { void onPlayAllFolder(folder) }}
              />
            )
            : (
              <FolderCard
                key={folder.path}
                folder={folder}
                onPlayAll={onPlayAllFolder}
                onTap={onTapSubfolder}
              />
            ))}
      </view>
    )
    : null

  const songSection = songs.length > 0
    ? (
      <VirtualList<Song>
        className='category-songs__list'
        items={songs}
        itemKey={(song) => String(song.id)}
        renderItem={(song, index) => (
          <SongListRow song={song} index={index} onTap={onTapSong} />
        )}
        footer={<view className='category-songs__nav-inset' />}
      />
    )
    : null

  return (
    <view className='folder-content'>
      {header}
      <view className='folder-content__body'>
        {query.isLoading
          ? <FolderState text={t('library.loadingFolders')} />
          : query.isError
            ? <FolderState text={t('library.foldersError')} tone='error' />
            : folders.length === 0 && songs.length === 0
              ? <FolderState text={t('library.noFolders')} />
              : (
                <scroll-view className='folder-content__scroll' scroll-y>
                  {folderSection}
                  {folders.length > 0 && songs.length > 0
                    ? <view className='folder-content__divider' />
                    : null}
                  {songSection}
                </scroll-view>
              )}
      </view>
    </view>
  )
}

function FolderState({ text, tone }: { text: string; tone?: 'error' }) {
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
