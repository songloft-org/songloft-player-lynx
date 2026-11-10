import { useCallback, useEffect, useMemo, useRef, useState } from '@lynx-js/react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'
import { SortableRoot, SortableItem, SortableItemArea } from '@lynx-js/lynx-ui-sortable'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { ScrollingText } from '../../../shared/ui/ScrollingText.js'
import { useLibraryViewport } from '../../library/pages/library-viewport.js'
import { ManageTagsSheet } from '../../library/widgets/ManageTagsSheet.js'
import { PlaylistTagLine } from '../widgets/PlaylistTagLine.js'
import { playlistDisplayDescription } from '../domain/playlist-description.js'
import { DragHandle } from '../../../shared/ui/DragHandle.js'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { useScrollNotifier } from '../../../shared/nav/scroll-visibility.js'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { DeleteConfirmDialog } from '../../../shared/ui/DeleteConfirmDialog.js'
import { PopoverMenu } from '../../../shared/ui/PopoverMenu.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { useDebounce } from '../../library/data/use-debounce.js'
import { flattenSongs } from '../../library/data/pagination.js'
import { PlaylistDetailSongRow } from '../widgets/PlaylistDetailSongRow.js'
import { PlaylistSongList } from '../widgets/PlaylistSongList.js'
import { PlaylistDescPanel } from '../widgets/PlaylistDescPanel.js'
import { PlaylistToolbar } from '../widgets/PlaylistToolbar.js'
import { AddSongsToPlaylistSheet } from '../widgets/AddSongsToPlaylistSheet.js'
import { getPlaylistApi } from '../api/index.js'
import { songGroupInitial } from '../domain/song-title-initial.js'
import { playlistContext } from '../../player/domain/playback-context.js'
import { usePlayerStore } from '../../player/store/index.js'
import { indexedSongCacheAvailable } from '../../player/data/indexed-song-cache.js'
import { useCacheBatchSubmission } from '../../player/widgets/use-cache-batch.js'
import { PlayHistoryPanel } from '../../player/widgets/PlayHistoryPanel.js'
import {
  usePlaylistQuery,
  usePlaylistSongsInfiniteQuery,
} from '../data/playlist-query.js'
import {
  useDeletePlaylistMutation,
  useMoveSongMutation,
  useRemoveSongMutation,
  useSetPinnedMutation,
  useSetVisibilityMutation,
  useUpdateSortMutation,
} from '../data/playlist-mutations.js'
import './PlaylistDetailPage.css'



export function PlaylistDetailPage() {
  const { isWide } = useLibraryViewport()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { onScroll: onScrollEdge } = useScrollNotifier()
  const { t } = useTranslation()
  const cacheBatch = useCacheBatchSubmission()
  const canCacheBatch = indexedSongCacheAvailable()
  const params = useParams({ strict: false }) as { id?: string }
  const id = Number(params.id ?? 0) || 0
  /** Playback context for this playlist; `undefined` when the route param is missing. */
  const playlistCtx = playlistContext(id)

  const [searchText, setSearchText] = useState('')
  const debouncedKeyword = useDebounce(searchText, 300)

  const detail = usePlaylistQuery(id)
  const playlist = detail.data
  const description = playlistDisplayDescription(playlist?.description)
  const currentSort = playlist?.sortBy ?? 'position'
  const currentOrder = playlist?.sortOrder ?? 'asc'
  const keyword = debouncedKeyword.trim() || undefined
  const songsQuery = usePlaylistSongsInfiniteQuery(id, { sort: currentSort, order: currentOrder, keyword })
  const songs = useMemo(() => flattenSongs(songsQuery.data?.pages), [songsQuery.data?.pages])
  const songTitles = songs.map(song => song.title)
  const total = songsQuery.data?.pages[0]?.total ?? 0

  /**
   * Background-fill the rest of the playlist (same pages the infinite query
   * would have fetched, but driven by the store so playback continues past
   * the scrolled-in window — songloft-player-lynx#9). Call synchronously
   * right after the play; see the store action doc.
   */
  const fillRemainingQueue = () => {
    if (total <= songs.length) return
    usePlayerStore.getState().loadRemainingSongsForCurrentPlaylist({
      loadedCount: songs.length,
      total,
      fetch: (offset, limit) =>
        getPlaylistApi()
          .getPlaylistSongs(id, { sort: currentSort, order: currentOrder, keyword }, { limit, offset })
          .then((res) => res.songs),
    })
  }

  // Last-built cover URL keyed by cover path — see `cover` below.
  const coverUrlRef = useRef<{ path: string; built: string }>({
    path: '',
    built: '',
  })

  const cover = (() => {
    const path = playlist?.coverUrl
    if (!path) return ''
    // Rebuild (cache-bust) only when the cover path itself changes. The
    // backend bumps `updatedAt` for unrelated reasons — toggling visibility,
    // changing sort — and feeding that into buildCoverUrl would change the
    // image URL on every such update and reload the <image>, making the cover
    // flash. Same path → keep the already-loaded URL.
    if (coverUrlRef.current.path === path && coverUrlRef.current.built) {
      return coverUrlRef.current.built
    }
    const built = buildCoverUrl(path, playlist?.updatedAt)
    coverUrlRef.current = { path, built }
    return built
  })()
  const songCount = playlist?.songCount ?? songs.length
  const countLabel = t(
    songCount === 1 ? 'common.songCountOne' : 'common.songCountOther',
    { count: songCount },
  )

  const isBuiltIn = playlist?.isBuiltIn ?? false
  const isHidden = playlist?.isHidden ?? false
  const isPinned = playlist?.isPinned ?? false

  const deleteMutation = useDeletePlaylistMutation()
  const removeSongMutation = useRemoveSongMutation(id)
  const moveSongMutation = useMoveSongMutation(id)
  const visibilityMutation = useSetVisibilityMutation()
  const pinnedMutation = useSetPinnedMutation()
  const sortMutation = useUpdateSortMutation(id)

  const [showHistory, setShowHistory] = useState(false)
  const [showDesc, setShowDesc] = useState(false)
  const [showTags, setShowTags] = useState(false)
  useEffect(() => {
    const g = globalThis as Record<string, unknown>
    const prev = g.__E2E_PLAYLIST_DETAIL__ as Record<string, unknown> | undefined
    const obj = prev ?? {}
    obj.setShowDesc = setShowDesc
    g.__E2E_PLAYLIST_DETAIL__ = obj
    return () => { delete obj.setShowDesc }
  }, [])
  const [menuOpen, setMenuOpen] = useState(false)
  const [showAddSongs, setShowAddSongs] = useState(false)
  const [permanentSortBusy, setPermanentSortBusy] = useState(false)
  const [pendingSort, setPendingSort] = useState<'name_asc' | 'name_desc' | 'number_prefix' | 'shuffle' | null>(null)
  const [sortMode, setSortMode] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const canSort = songs.length > 1

  /*
   * One dialog for every destructive action on this page — deleting the
   * playlist (from the overflow menu), removing one song (the row-tail ×) or
   * removing the multi-selection. A single `show` flag is what the back-stack's
   * activation-order priority expects, and one state cannot get out of sync
   * with itself the way three booleans could.
   */
  const [pendingConfirm, setPendingConfirm] = useState<
    { kind: 'delete-playlist' } | { kind: 'remove-song'; song: Song } | { kind: 'remove-batch' } | null
  >(null)
  /*
   * The dialog stays mounted through its close animation, so `pendingConfirm`
   * going null must not re-derive its text — otherwise cancelling flashes the
   * fall-through branch (the multi-select "移除所选歌曲" copy) for a frame before
   * unmounting. Render from the last non-null payload so the content is frozen
   * while it fades out.
   */
  const lastConfirmRef = useRef(pendingConfirm)
  if (pendingConfirm != null) lastConfirmRef.current = pendingConfirm
  const confirmContent = pendingConfirm ?? lastConfirmRef.current

  const enterSortMode = () => {
    if (currentSort === 'position' && currentOrder === 'asc') {
      setSortMode(true)
      return
    }
    // Member positions can only be edited against the custom ascending view.
    sortMutation.mutate({ sortBy: 'position', sortOrder: 'asc' }, {
      onSuccess: () => setSortMode(true),
      onError: (error) => toast.error(String(error instanceof Error ? error.message : error)),
    })
  }
  const exitSortMode = () => {
    setSortMode(false)
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
   * Explicit peel order for this page's modes. Neither the context menu nor the
   * history / description panels nor the more menu / delete dialog appear here:
   * all of those are components that register their own layers and are only
   * mounted (or active) while open.
   */
  useBackHandler(showDesc || sortMode || selectMode, () => {
    if (showDesc) {
      setShowDesc(false)
      return true
    }
    if (sortMode) {
      exitSortMode()
      return true
    }
    exitSelectMode()
    return true
  })
  const batchRemove = () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    void Promise.all(ids.map((songId) => removeSongMutation.mutateAsync(songId))).then(exitSelectMode)
  }
  const toggleVisibility = () => {
    visibilityMutation.mutate({ id, hidden: !isHidden })
  }
  const togglePin = () => {
    const pinned = !isPinned
    pinnedMutation.mutate({ id, pinned }, {
      onSuccess: () =>
        toast.success(pinned ? t('playlist.pinnedToast') : t('playlist.unpinnedToast')),
      onError: () => toast.error(t('playlist.pinFailed')),
    })
  }

  const sortOptions = [
    { key: 'position', defaultOrder: 'asc', label: t('playlist.sortPosition') },
    { key: 'title', defaultOrder: 'asc', label: t('playlist.sortTitle') },
    { key: 'artist', defaultOrder: 'asc', label: t('playlist.sortArtist') },
    { key: 'added_at', defaultOrder: 'desc', label: t('playlist.sortRecent') },
  ] as const

  const onSelectSort = (key: string) => {
    const opt = sortOptions.find((o) => o.key === key)
    if (!opt) return
    const order = key === currentSort
      ? (currentOrder === 'asc' ? 'desc' : 'asc')
      : opt.defaultOrder
    sortMutation.mutate({ sortBy: opt.key, sortOrder: order })
  }

  const onDelete = (deleteSongs: boolean) => {
    deleteMutation.mutate(deleteSongs ? { id, deleteSongs } : id, {
      onSuccess: () => {
        void navigate({ to: '/library', search: { view: 'playlist_normal' } })
      },
    })
  }

  const permanentlySort = async () => {
    const action = pendingSort
    setPendingSort(null)
    if (!action || permanentSortBusy) return
    setPermanentSortBusy(true)
    try {
      await getPlaylistApi().sortPlaylistSongs(id, action)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['playlist', 'songs', id] }),
        queryClient.invalidateQueries({ queryKey: ['playlist', 'detail', id] }),
      ])
      toast.success(t('playlist.permanentSorted'))
    } catch (error) {
      toast.error(String(error instanceof Error ? error.message : error))
    } finally { setPermanentSortBusy(false) }
  }

  /* Editing lives on its own route now — the detail page is render-mode-free
   * apart from sort / select. */
  const onStartEdit = () => {
    void navigate({ to: '/playlists/$id/edit', params: { id: String(id) } })
  }

  const onRemoveSong = (song: Song) => {
    setPendingConfirm({ kind: 'remove-song', song })
  }

  const onEndReached = () => {
    if (songsQuery.hasNextPage && !songsQuery.isFetchingNextPage) {
      void songsQuery.fetchNextPage({ cancelRefetch: false })
    }
  }

  const onTapSong = (song: Song, index: number) => {
    if (selectMode) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(song.id)) next.delete(song.id)
        else next.add(song.id)
        return next
      })
    } else {
      void usePlayerStore.getState().playPlaylist(songs, index, playlistCtx)
      fillRemainingQueue()
    }
  }

  // Stable row callbacks still read the latest pages, selection and playback context.
  const songActions = useRef({ onTapSong, onRemoveSong })
  songActions.current = { onTapSong, onRemoveSong }
  const handleSongTap = useCallback((song: Song, index: number) => songActions.current.onTapSong(song, index), [])
  const handleSongRemove = useCallback((song: Song) => songActions.current.onRemoveSong(song), [])

  const playAll = () => {
    if (songs.length === 0) return
    void usePlayerStore.getState().playAll(songs, playlistCtx)
    fillRemainingQueue()
  }

  const header = (
    <view className='playlist-detail__header'>
      <view className='playlist-detail__topbar'>
        <view
          className='playlist-detail__back'
          // Returns to the shell tab the user was on before entering this detail
          // page — Home or Library — rather than always Library. The rule lives in
          // `shared/nav/route-back.ts` so the hardware back key matches.
          bindtap={() => performRouteBack()}
          accessibility-element={true}
          accessibility-label={t('common.back')}
        >
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        {/*
          Right-hand group. It exists unconditionally so that the single
          `margin-left: auto` lives here: the actions block below is built-in-only,
          and giving the history button its own auto margin would make the two
          split the free space instead of both sitting flush right.
        */}
        <view className='playlist-detail__topbar-right'>
        {/*
          Play history is available for **every** playlist, built-in ones
          included (the Flutter menu item is unconditional), so this sits outside
          the `!isBuiltIn` block below. Hidden while sorting, where the topbar
          belongs to that mode.
        */}
        {playlistCtx && !sortMode
          ? (
            <view
              className='playlist-detail__icon-btn'
              bindtap={() => setShowHistory(true)}
              accessibility-element={true}
              accessibility-label={t('history.title')}
              data-testid='playlist-detail-history'
            >
              <Icon name='history' size={20} color={ICON_COLORS.content2} />
            </view>
          )
          : null}
        {/*
          The actions group is no longer built-in-only: pinning applies to the
          built-in playlists too (the backend deliberately skips its usual
          built-in guard for it), so Favorites and Radio favorites now get a menu
          holding just that one item. Everything else stays `!isBuiltIn`.
        */}
        <view className='playlist-detail__topbar-actions'>
              {sortMode
                ? (
                  /* In sort mode the whole group collapses to the single Done button. */
                  <view className='playlist-detail__action-btn' bindtap={exitSortMode}>
                    <text className='playlist-detail__action-text'>{t('playlist.doneSorting')}</text>
                  </view>
                )
                : null}
              {/*
                The overflow menu replaces the old six-text-button row, which at
                390px had its labels broken mid-word ("排/序"). Play-all and sort
                moved to the `PlaylistToolbar` under the search bar; select moved
                there too. What is left here is the low-frequency, page-level
                stuff: pin, manual reorder, edit, visibility, delete.
              */}
              {!sortMode
                ? (
                  <PopoverMenu
                    show={menuOpen}
                    onShowChange={setMenuOpen}
                    placement='bottom-end'
                    triggerClassName='playlist-detail__icon-btn'
                    trigger={
                      <Icon name='more' size={20} color={ICON_COLORS.content2} />
                    }
                    items={[
                      /*
                       * Add songs first: it is the one create action in this
                       * menu. Available for built-in playlists too — adding to
                       * Favorites is a legitimate destination, and the backend
                       * accepts it (only its usual *update* guards skip
                       * built-ins).
                       */
                      { key: 'addSongs', label: t('playlist.addSongs'), icon: 'plus' as const },
                      { key: 'tags', label: t('songTag.manageTags'), icon: 'label' as const },
                      ...(canCacheBatch && playlist?.type !== 'radio'
                        ? [{ key: 'cache', label: cacheBatch.busy ? t('common.loading') : t('cacheTasks.wholePlaylist'), icon: 'download' as const }]
                        : []),
                      {
                        key: 'pin',
                        label: isPinned ? t('playlist.unpinPlaylist') : t('playlist.pinPlaylist'),
                        icon: 'pin' as const,
                      },
                      ...(isBuiltIn
                        ? [{ key: 'editCover', label: t('playlist.editCoverPageTitle'), icon: 'brush' as const }]
                        : []),
                      ...(canSort
                        ? [{ key: 'sort', label: t('playlist.sortSongs'), icon: 'sort' as const }]
                        : []),
                      ...(!keyword && canSort && !permanentSortBusy
                        ? (['name_asc', 'name_desc', 'number_prefix', 'shuffle'] as const).map(action => ({
                          key: `permanent_${action}`, label: t(`playlist.permanent_${action}`), icon: 'sort' as const,
                        })) : []),
                      ...(!isBuiltIn
                        ? [
                          { key: 'edit', label: t('playlist.editPlaylist'), icon: 'brush' as const },
                          {
                            key: 'visibility',
                            label: isHidden ? t('playlist.showPlaylist') : t('playlist.hidePlaylist'),
                            icon: 'eye' as const,
                          },
                          {
                            key: 'delete',
                            label: t('playlist.deletePlaylist'),
                            icon: 'x' as const,
                            danger: true,
                          },
                        ]
                        : []),
                    ]}
                    onSelect={(key) => {
                      if (key === 'addSongs') setShowAddSongs(true)
                      else if (key === 'tags') setShowTags(true)
                      else if (key === 'cache') { if (!cacheBatch.busy) void cacheBatch.beginPlaylist(id) }
                      else if (key === 'pin') togglePin()
                      else if (key === 'editCover') void navigate({ to: '/playlists/$id/edit', params: { id: String(id) }, search: { coverOnly: true } })
                      else if (key === 'sort') enterSortMode()
                      else if (key.startsWith('permanent_')) setPendingSort(key.slice(10) as typeof pendingSort)
                      else if (key === 'edit') onStartEdit()
                      else if (key === 'visibility') toggleVisibility()
                      else if (key === 'delete') setPendingConfirm({ kind: 'delete-playlist' })
                    }}
                  />
                )
                : null}
        </view>
        </view>
      </view>
      {/*
        Hero — cover + name / count / clamped description. Cover management
        moved to the edit page; this is display only.
      */}
      <view className='playlist-detail__hero'>
        <view className='playlist-detail__cover-wrapper'>
          {cover
            ? <image className='playlist-detail__cover' src={cover} mode='aspectFill' />
            : (
              <view className='playlist-detail__cover playlist-detail__cover--empty'>
                <Icon name='music' size={40} color={ICON_COLORS.contentMuted} />
              </view>
            )}
        </view>
        <view className='playlist-detail__meta'>
          <ScrollingText text={playlist?.name ?? (detail.isLoading ? t('common.loading') : t('playlist.fallbackName'))} textClassName='playlist-detail__name' />
          <text className='playlist-detail__count'>{countLabel}</text>
          <PlaylistTagLine labels={playlist?.labels} />
          {description
            ? (
              /* Clamped to two lines in CSS; tapping opens the full text in a
               * bottom panel (a ~35px nested scroll area is not a usable touch
               * target and competes with the song list for gestures). */
              <text
                className='playlist-detail__desc'
                /* The two-line clamp itself — see the CSS rule. */
                text-maxline='2'
                bindtap={() => setShowDesc(true)}
                data-testid='playlist-detail-desc'
              >
                {description}
              </text>
            )
            : null}
        </view>
      </view>
    </view>
  )

  return (
    <view className={`playlist-detail${isWide ? '' : ' playlist-detail--compact'}`}>
      {header}
      {!sortMode
        ? (
          <view className='playlist-detail__search-bar'>
            <Input
              className='playlist-detail__search-input'
              placeholder={t('library.searchPlaceholder')}
              value={searchText}
              onInput={(value: string) => setSearchText(value)}
            />
          </view>
        )
        : null}
      {/*
        Toolbar row (play-all | sort popover | multi-select) — the counterpart of
        the flat-songs `LibraryToolbar`, replacing the old chip-row sort bar.
      */}
      {!sortMode && songs.length > 0
        ? (
          <PlaylistToolbar
            currentSort={currentSort}
            currentOrder={currentOrder}
            sortOptions={sortOptions}
            onSelectSort={onSelectSort}
            onPlayAll={playAll}
            onAddSongs={() => setShowAddSongs(true)}
            selectMode={selectMode}
            onToggleSelect={selectMode ? exitSelectMode : enterSelectMode}
            hasSongs={songs.length > 0}
          />
        )
        : null}
      <view className='playlist-detail__body'>
        {sortMode
          ? (
              <SortableRoot
                as='ScrollView'
                scrollableBoundaryId='playlist-detail-sort-scroll'
                scrollableClassName='playlist-detail__sort-scroll'
                scrollableProps={{
                  'lower-threshold': 200,
                  bindscroll: onScrollEdge,
                  bindscrolltolower: onEndReached,
                }}
                scrollableFooter={<view className='playlist-detail__nav-inset' />}
                data={songs.map((s) => ({ getSortingKey: () => String(s.id), dataItem: s }))}
              onSortEnd={(sorted) => {
                // A drag shifts every intervening row by one. The dragged row
                // has the greatest displacement; choosing the first changed row
                // would turn a downward drag across several rows into one swap.
                const origPos = new Map(songs.map((s, i) => [s.id, i]))
                let newIdx = -1
                let maxDistance = 0
                sorted.forEach((item, i) => {
                  const distance = Math.abs((origPos.get(item.dataItem.id) ?? i) - i)
                  if (distance > maxDistance) {
                    maxDistance = distance
                    newIdx = i
                  }
                })
                if (newIdx < 0) return
                moveSongMutation.mutate({
                  songId: sorted[newIdx].dataItem.id,
                  afterSongId: newIdx > 0
                    ? sorted[newIdx - 1].dataItem.id
                    : null,
                })
              }}
            >
              {(item) => (
                <SortableItem
                  key={String(item.dataItem.id)}
                  sortingKey={String(item.dataItem.id)}
                  as='DraggableRoot'
                  className='playlist-detail__sort-row'
                >
                  <SortableItemArea>
                    <DragHandle
                      className='playlist-detail__sort-handle'
                      testId={`playlist-detail-drag-${item.dataItem.id}`}
                    >
                      <Icon name='menu' size={18} color={ICON_COLORS.content2} />
                    </DragHandle>
                  </SortableItemArea>
                  <text className='playlist-detail__sort-row-name'>{item.dataItem.title}</text>
                </SortableItem>
              )}
            </SortableRoot>
          )
          : songsQuery.isLoading
          ? <DetailState text={t('library.loadingSongs')} />
          : songsQuery.isError && songs.length === 0
            ? <DetailState text={t('playlist.songsError')} tone='error' />
            : songs.length === 0
              ? <DetailState text={t('playlist.noSongs')} />
              : (
                <PlaylistSongList<Song> key={`${id}:${currentSort}:${currentOrder}:${keyword ?? ''}`}
                  total={total}
                  enabled={!selectMode}
                  loadingMore={songsQuery.isFetchingNextPage}
                  hasMore={!!songsQuery.hasNextPage}
                  loadFailed={songsQuery.isFetchNextPageError}
                  className='playlist-detail__list'
                  items={songs}
                  itemKey={(song) => String(song.id)}
                  onScroll={onScrollEdge}
                  renderItem={(song, index) => (
                    <PlaylistDetailSongRow song={song} index={index}
                      titleInitial={songGroupInitial(songTitles, index)}
                      selectMode={selectMode} selected={selectMode && selected.has(song.id)}
                      isBuiltIn={isBuiltIn} onTap={handleSongTap} onRemove={handleSongRemove} />
                  )}
                  onEndReached={onEndReached}
                  footer={<view className='playlist-detail__nav-inset'>
                    {songsQuery.isFetchingNextPage ? (
                      <view className='playlist-detail__footer'>
                        <text className='playlist-detail__footer-text'>{t('common.loadingMore')}</text>
                      </view>
                    ) : null}
                  </view>}
                />
              )}
      </view>
      {selectMode && selected.size > 0
        ? (
          <view className={canCacheBatch ? 'playlist-detail__select-toolbar playlist-detail__select-toolbar--cache' : 'playlist-detail__select-toolbar'}>
            <text className='playlist-detail__select-toolbar-count'>
              {t('library.selectedCount', { count: selected.size })}
            </text>
            <view className='playlist-detail__select-toolbar-btn' bindtap={() => setPendingConfirm({ kind: 'remove-batch' })}>
              <text className='playlist-detail__select-toolbar-btn-text'>{t('playlist.removeSong')}</text>
            </view>
            {canCacheBatch && <view
              className={cacheBatch.busy ? 'playlist-detail__select-toolbar-btn playlist-detail__cache-btn playlist-detail__cache-btn--disabled' : 'playlist-detail__select-toolbar-btn playlist-detail__cache-btn'}
              bindtap={() => { if (!cacheBatch.busy) cacheBatch.beginSongs(songs.filter(song => selected.has(song.id))) }}
              data-testid='playlist-select-cache'>
              <text className='playlist-detail__select-toolbar-btn-text playlist-detail__cache-btn-text'>
                {cacheBatch.busy ? t('common.loading') : t('player.cacheToDevice')}
              </text>
            </view>}
          </view>
        )
        : null}
      {/*
        Destructive confirm for the whole page — one dialog, three payloads
        (delete playlist / remove one song / remove the selection). The old
        row-tail × removed immediately; removing from a playlist is not as final
        as deleting a song but it still deserves a stated consequence.
      */}
      <DeleteConfirmDialog
        option={confirmContent?.kind === 'delete-playlist' ? 'orphanSongs' : undefined}
        targetKey={id}
        show={pendingConfirm != null}
        title={confirmContent?.kind === 'delete-playlist'
          ? t('playlist.deleteTitle')
          : t('playlist.removeSongTitle')}
        message={confirmContent?.kind === 'delete-playlist'
          ? t('playlist.deleteMessage')
          : confirmContent?.kind === 'remove-song'
            ? t('playlist.removeSongMessage')
            : t('playlist.removeSongsMessage')}
        confirmLabel={confirmContent?.kind === 'delete-playlist'
          ? t('playlist.deletePlaylist')
          : t('playlist.removeSong')}
        onConfirm={(deleteSongs) => {
          const pending = pendingConfirm
          setPendingConfirm(null)
          if (pending?.kind === 'delete-playlist') onDelete(deleteSongs)
          else if (pending?.kind === 'remove-song') removeSongMutation.mutate(pending.song.id)
          else if (pending?.kind === 'remove-batch') batchRemove()
        }}
        onCancel={() => setPendingConfirm(null)}
        testId='playlist-delete-dialog'
        confirmTestId='playlist-delete-confirm'
        cancelTestId='playlist-delete-cancel'
      />
      <ConfirmDialog
        show={pendingSort != null}
        title={t('playlist.permanentSortTitle')}
        message={t('playlist.permanentSortMessage')}
        confirmLabel={t('playlist.sortSongs')}
        onConfirm={() => { void permanentlySort() }}
        onCancel={() => setPendingSort(null)}
        testId='playlist-permanent-sort-dialog'
        confirmTestId='playlist-permanent-sort-confirm'
      />
      {/* Mounted only while open, so entering the page costs no history request. */}
      {showHistory && playlistCtx
        ? (
          <PlayHistoryPanel
            context={playlistCtx}
            title={t('history.titleFor', { name: playlist?.name ?? '' })}
            queue={songs}
            onClose={() => setShowHistory(false)}
          />
        )
        : null}
      {/* Same mount-only-while-open pattern as the history panel above. */}
      {cacheBatch.confirmation}
      {showAddSongs && id > 0
        ? (
          <AddSongsToPlaylistSheet
            playlistId={id}
            playlistType={playlist?.type ?? 'normal'}
            onClose={() => setShowAddSongs(false)}
          />
        )
        : null}
      <ManageTagsSheet playlistIds={showTags ? [id] : []} onClose={() => setShowTags(false)} />
      {showDesc && description
        ? (
          <PlaylistDescPanel
            title={t('playlist.descriptionTitle')}
            description={description}
            onClose={() => setShowDesc(false)}
          />
        )
        : null}
    </view>
  )
}

function DetailState({ text, tone }: { text: string; tone?: 'error' }) {
  return (
    <view className='playlist-detail__state'>
      <text
        className={tone === 'error'
          ? 'playlist-detail__state-text playlist-detail__state-text--error'
          : 'playlist-detail__state-text'}
      >
        {text}
      </text>
    </view>
  )
}
