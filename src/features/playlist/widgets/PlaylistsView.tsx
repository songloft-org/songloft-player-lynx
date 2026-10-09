import { useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'
import { SortableRoot, SortableItem, SortableItemArea } from '@lynx-js/lynx-ui-sortable'

import type { Playlist } from '../../../models/playlist.js'
import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { AppCheckbox } from '../../../shared/ui/AppCheckbox.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { useScrollNotifier } from '../../../shared/nav/scroll-visibility.js'
import { usePlayerStore } from '../../player/store/index.js'
import { playlistContext } from '../../player/domain/playback-context.js'
import { getPlaylistApi } from '../api/index.js'
import { PopoverMenu } from '../../../shared/ui/PopoverMenu.js'
import type { PopoverMenuItem } from '../../../shared/ui/PopoverMenu.js'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { GlobalMenu } from '../../../shared/ui/GlobalMenu.js'
import { MediaListItem } from '../../../shared/ui/MediaListItem.js'
import { GridSpacers } from '../../../shared/ui/GridSpacers.js'
import type { AnchorMeasurement } from '../../../shared/ui/anchored-overlay.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { sortPlaylistsByName, sortPlaylistsByNumberPrefix } from '../domain/playlist-sort.js'
import { playlistRowMenuKeys } from '../domain/playlist-row-menu.js'
import { flattenPlaylists } from '../data/pagination.js'
import { usePlaylistsInfiniteQuery } from '../data/playlist-query.js'
import {
  useDeletePlaylistMutation,
  useReorderPlaylistsMutation,
  useSetPinnedMutation,
  useSetVisibilityMutation,
} from '../data/playlist-mutations.js'

import { useDebounce } from '../../library/data/use-debounce.js'
import { PlaylistCard } from './PlaylistCard.js'
import './PlaylistsView.css'

export function PlaylistsView(
  { type, songSource, viewMode = 'grid', showHidden = false }: {
    type?: string
    /** `'remote'` / `'local'` — filter by the source of the songs held. */
    songSource?: string
    viewMode?: 'grid' | 'list'
    /** Include hidden playlists; controlled by the library topbar. */
    showHidden?: boolean
  } = {},
) {
  const navigate = useNavigate()
  const { onScroll: onScrollEdge } = useScrollNotifier()
  const { t } = useTranslation()
  const [searchText, setSearchText] = useState('')
  const debouncedSearch = useDebounce(searchText, 350)
  // `type` and `songSource` are independent and never both set by LibraryPage
  // (type views vs source views), but the filter object carries whichever is
  // present. Keys are omitted rather than set to `undefined` so the query key
  // stays identical to what the callers without filters produce.
  const query = usePlaylistsInfiniteQuery({
    ...(type ? { type } : {}),
    ...(songSource ? { songSource } : {}),
    ...(showHidden ? { excludeLabels: 'none' } : {}),
    keyword: debouncedSearch || undefined,
  })
  const allPlaylists = flattenPlaylists(query.data?.pages)
  const playlists = showHidden ? allPlaylists : allPlaylists.filter((p) => !p.isHidden)
  const reorderMutation = useReorderPlaylistsMutation()
  const deleteMutation = useDeletePlaylistMutation()
  const pinnedMutation = useSetPinnedMutation()
  const visibilityMutation = useSetVisibilityMutation()

  const [sortMode, setSortMode] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  useEffect(() => {
    setSelected(new Set())
    setSelectMode(false)
    setSortMode(false)
  }, [showHidden])
  const [confirmDelete, setConfirmDelete] = useState(false)
  /*
   * The row menu's state lives here rather than in a store, and the menu renders
   * at *this page's* root — a sibling of the scroll-view, not inside it. Both
   * choices are forced: a scroll container clips `position: fixed` descendants
   * (measured; see `song-row-overlays.ts`) and the grid cell adds its own
   * `overflow: clip` on top, so a `PopoverMenu` inside a card would be sliced.
   * `PlayHistoryPanel` already mounts a `GlobalMenu` at page level this way, so
   * no store is needed — and `root-overlay-mount.test.ts` is about the *app*
   * root, which this is not.
   */
  const [menuPlaylist, setMenuPlaylist] = useState<Playlist | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<AnchorMeasurement | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Playlist | null>(null)
  const [sortOpen, setSortOpen] = useState(false)
  const [sortType, setSortType] = useState<string | null>(null)
  const sortItems: PopoverMenuItem[] = [
    { key: 'nameAsc',  label: t('playlist.sortNameAsc'),  icon: 'sort', selected: sortType === 'nameAsc' },
    { key: 'nameDesc', label: t('playlist.sortNameDesc'), icon: 'sort', selected: sortType === 'nameDesc' },
    { key: 'number',   label: t('playlist.sortNumberPrefix'), icon: 'sort', selected: sortType === 'number' },
    { key: 'manual',   label: t('playlist.sortManual'),  icon: 'sort', selected: sortType === 'manual' },
  ]

  const onPlayAll = async (playlist: Playlist) => {
    try {
      const res = await getPlaylistApi().getPlaylistSongs(playlist.id, {}, { limit: 9999, offset: 0 })
      if (res.songs.length === 0) {
        toast.show(t('playlist.emptyPlaylist'))
        return
      }
      await usePlayerStore.getState().playAll(
        res.songs,
        playlistContext(playlist.id),
      )
    } catch {
      toast.error(t('playlist.playFailed'))
    }
  }

  if (query.isLoading) {
    return <PlaylistState text={t('playlist.loadingPlaylists')} />
  }
  if (query.isError && playlists.length === 0) {
    return <PlaylistState text={t('playlist.playlistsError')} tone='error' />
  }

  const onTap = (playlist: Playlist) => {
    if (selectMode) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(playlist.id)) next.delete(playlist.id)
        else next.add(playlist.id)
        return next
      })
      return
    }
    void navigate({ to: '/playlists/$id', params: { id: String(playlist.id) } })
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
   * Multi-select peels back with the back key; the delete dialog registers its
   * own layer (see `ConfirmDialog`), so it is absent here on purpose.
   */
  useBackHandler(sortMode || selectMode, () => {
    if (sortMode) {
      setSortMode(false)
      return true
    }
    exitSelectMode()
    return true
  })

  /*
   * The delete button arms a full-screen dialog rather than relabelling itself
   * (the old two-tap pattern): the armed label changed text on a bottom toolbar
   * chip, which read as a glitch and reported as a misplaced confirm.
   */
  const batchDelete = () => {
    setConfirmDelete(true)
  }
  const performBatchDelete = () => {
    setConfirmDelete(false)
    const ids = Array.from(selected).filter((id) => !playlists.find((p) => p.id === id)?.isBuiltIn)
    void Promise.all(ids.map((id) => deleteMutation.mutateAsync(id))).then(exitSelectMode)
  }

  const openRowMenu = (playlist: Playlist, anchor: AnchorMeasurement | null) => {
    setMenuPlaylist(playlist)
    setMenuAnchor(anchor)
  }
  const closeRowMenu = () => {
    setMenuPlaylist(null)
    setMenuAnchor(null)
  }

  /*
   * Pinning is the one item built-in playlists keep: the backend deliberately
   * skips its built-in guard for it, and Flutter's card menu has no guard on the
   * pin entry either. Edit / hide / delete stay owner-playlists-only. The
   * built-in-vs-normal split lives in `playlistRowMenuKeys` so it is unit
   * testable without rendering (the `⋯` that opens this menu is `catchtap`,
   * which the test env does not fire — see the note on the tests).
   */
  const rowMenuKeys = menuPlaylist == null ? [] : playlistRowMenuKeys(menuPlaylist)
  const rowMenuItems: PopoverMenuItem[] = rowMenuKeys.map((key) => {
    switch (key) {
      case 'pin':
        return {
          key,
          label: menuPlaylist!.isPinned ? t('playlist.unpinPlaylist') : t('playlist.pinPlaylist'),
          icon: 'pin' as const,
        }

      case 'edit':
        return { key, label: t('playlist.editPlaylist'), icon: 'brush' as const }
      case 'visibility':
        return {
          key,
          label: menuPlaylist!.isHidden ? t('playlist.showPlaylist') : t('playlist.hidePlaylist'),
          icon: 'eye' as const,
        }
      default:
        return { key, label: t('playlist.deletePlaylist'), icon: 'x' as const, danger: true }
    }
  })

  const onRowMenuSelect = (key: string) => {
    const playlist = menuPlaylist
    if (!playlist) return
    if (key === 'pin') {
      const pinned = !playlist.isPinned
      pinnedMutation.mutate({ id: playlist.id, pinned }, {
        onSuccess: () =>
          toast.success(pinned ? t('playlist.pinnedToast') : t('playlist.unpinnedToast')),
        onError: () => toast.error(t('playlist.pinFailed')),
      })
    } else if (key === 'edit') {
      void navigate({ to: '/playlists/$id/edit', params: { id: String(playlist.id) } })
    } else if (key === 'visibility') {
      visibilityMutation.mutate({ id: playlist.id, hidden: !playlist.isHidden })
    } else if (key === 'delete') {
      setPendingDelete(playlist)
    }
  }

  /**
   * Load all remaining pages so we sort the full playlist set, mirroring
   * Flutter `PlaylistBrowseView.autoSortByName` → `loadAll()`.
   */
  async function loadAllPlaylists() {
    let result = await query.fetchNextPage()
    while (result.hasNextPage) {
      result = await query.fetchNextPage()
    }
    return flattenPlaylists(result.data?.pages)
  }

  const onSortNameAsc = async () => {
    setSortOpen(false)
    const all = await loadAllPlaylists()
    const ids = sortPlaylistsByName(all, true)
    if (!ids) {
      toast.success(t('playlist.alreadySortedPlaylists'))
      return
    }
    reorderMutation.mutate(ids, {
      onSuccess: () => toast.success(t('playlist.sortedByNameAsc')),
      onError: () => toast.error(t('playlist.sortFailed')),
    })
  }

  const onSortNameDesc = async () => {
    setSortOpen(false)
    const all = await loadAllPlaylists()
    const ids = sortPlaylistsByName(all, false)
    if (!ids) {
      toast.success(t('playlist.alreadySortedPlaylists'))
      return
    }
    reorderMutation.mutate(ids, {
      onSuccess: () => toast.success(t('playlist.sortedByNameDesc')),
      onError: () => toast.error(t('playlist.sortFailed')),
    })
  }

  const onSortNumber = async () => {
    setSortOpen(false)
    const all = await loadAllPlaylists()
    const ids = sortPlaylistsByNumberPrefix(all)
    if (!ids) {
      toast.success(t('playlist.alreadySortedPlaylists'))
      return
    }
    reorderMutation.mutate(ids, {
      onSuccess: () => toast.success(t('playlist.sortedByNumber')),
      onError: () => toast.error(t('playlist.sortFailed')),
    })
  }

  if (playlists.length === 0) {
    return (
      <view className='playlists'>
      <view className='playlists__search-bar'>
        <Input
          className='playlists__search-input'
          placeholder={t('playlist.searchPlaceholder')}
          value={searchText}
          onInput={(value: string) => setSearchText(value)}
        />
      </view>
        <view className='playlists__create-bar'>
          <view className='playlists__create-trigger' bindtap={() => navigate({ to: '/playlists/create' })}>
            <Icon name='plus' size={14} color={ICON_COLORS.content} />
            <text className='playlists__create-trigger-text'>{t('playlist.createPlaylist')}</text>
          </view>
        </view>
        <PlaylistState
          text={t('playlist.noPlaylistsTitle')}
          subtext={t('playlist.noPlaylistsSubtitle')}
        />
      </view>
    )
  }

  if (sortMode) {
    return (
      <view className='playlists'>
        <view className='playlists__create-bar'>
          <text className='playlists__sort-title'>{t('playlist.sortPlaylists')}</text>
          <view className='playlists__create-trigger' bindtap={() => setSortMode(false)}>
            <text className='playlists__create-trigger-text'>{t('playlist.doneSorting')}</text>
          </view>
        </view>
        <SortableRoot
          as='ScrollView'
          scrollableClassName='playlists__scroll'
          data={playlists.map((p) => ({ getSortingKey: () => String(p.id), dataItem: p }))}
          onSortEnd={(sorted) => {
            reorderMutation.mutate(sorted.map((d) => d.dataItem.id))
          }}
        >
          {(item) => (
            <SortableItem
              sortingKey={String(item.dataItem.id)}
              as='DraggableRoot'
              className='playlists__sort-row'
            >
              <SortableItemArea>
                <view className='playlists__sort-handle' data-testid={`playlists-drag-${item.dataItem.id}`}>
                  <Icon name='menu' size={18} color={ICON_COLORS.content2} />
                </view>
              </SortableItemArea>
              <text className='playlists__sort-row-name'>
                {item.dataItem.name || t('common.untitled')}
              </text>
            </SortableItem>
          )}
        </SortableRoot>
      </view>
    )
  }

  return (
    <view className='playlists'>
      <view className='playlists__search-bar'>
        <Input
          className='playlists__search-input'
          placeholder={t('playlist.searchPlaceholder')}
          value={searchText}
          onInput={(value: string) => setSearchText(value)}
        />
      </view>
      <view className='playlists__create-bar'>
        <view className='playlists__create-bar-left'>
          <view className='playlists__create-trigger' bindtap={() => navigate({ to: '/playlists/create' })}>
            <Icon name='plus' size={14} color={ICON_COLORS.content} />
            <text className='playlists__create-trigger-text'>{t('playlist.createPlaylist')}</text>
          </view>
          {playlists.length > 1 && !selectMode
            ? (
              <PopoverMenu
                show={sortOpen}
                onShowChange={setSortOpen}
                placement='bottom-start'
                contentClassName='popover-menu--wide'
                hideCheckmark
                triggerClassName='playlists__create-trigger'
                trigger={
                  /* Fragment, not a `<view>` — see the note on `LibraryToolbar`'s
                   * sort trigger: an unstyled wrapper view is column linear layout
                   * and stacks the icon above the label. */
                  <>
                    <Icon name='sort' size={14} color={ICON_COLORS.content} />
                    <text className='playlists__create-trigger-text' data-testid='playlists-sort-menu'>
                      {t('playlist.sort')}
                    </text>
                  </>
                }
                items={sortItems}
                onSelect={(key) => {
                  setSortOpen(false)
                  setSortType(key)
                  if (key === 'nameAsc') onSortNameAsc()
                  else if (key === 'nameDesc') onSortNameDesc()
                  else if (key === 'number') onSortNumber()
                  else if (key === 'manual') setSortMode(true)
                }}
              />
            )
            : null}
        </view>
        <view className='playlists__create-bar-right'>
          {playlists.length > 1
            ? selectMode
              ? (
                <view className='playlists__create-trigger' bindtap={exitSelectMode}>
                  <Icon name='x' size={14} color={ICON_COLORS.content} />
                  <text className='playlists__create-trigger-text'>{t('library.cancelSelect')}</text>
                </view>
              )
              : (
                <view
                  className='playlists__create-trigger'
                  bindtap={enterSelectMode}
                  data-testid='playlists-select-toggle'
                >
                  <Icon name='check' size={14} color={ICON_COLORS.content} />
                  <text className='playlists__create-trigger-text'>{t('library.select')}</text>
                </view>
              )
            : null}
        </view>
      </view>
      <scroll-view
        className='playlists__scroll'
        scroll-y
        lower-threshold={200}
        bindscroll={onScrollEdge}
        bindscrolltolower={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) {
            void query.fetchNextPage()
          }
        }}
      >
        <view className={viewMode === 'list' ? 'playlists__list' : 'playlists__grid'}>
          {playlists.length === 0 && !query.isLoading
            ? (
              <PlaylistState
                text={debouncedSearch ? t('library.noSearchResults') : t('playlist.noPlaylistsTitle')}
                subtext={debouncedSearch ? undefined : t('playlist.noPlaylistsSubtitle')}
              />
            )
            : viewMode === 'grid'
              ? playlists.map((playlist) => (
                <view key={String(playlist.id)} className='playlists__grid-item'>
                  <PlaylistCard
                    playlist={playlist}
                    onTap={onTap}
                    onPlayAll={onPlayAll}
                    onMore={openRowMenu}
                  />
                  {selectMode
                    ? (
                      <view className='playlists__select-badge' bindtap={() => onTap(playlist)}>
                        <AppCheckbox checked={selected.has(playlist.id)} />
                      </view>
                    )
                    : null}
                </view>
              ))
              : playlists.map((playlist) => (
                <MediaListItem
                  key={String(playlist.id)}
                  name={playlist.name || t('common.untitled')}
                  subtitle={t(
                    playlist.songCount === 1 ? 'common.songCountOne' : 'common.songCountOther',
                    { count: playlist.songCount },
                  )}
                  badge={
                    /*
                     * Single badge slot on the shared MediaListItem, so pinned wins
                     * when a playlist is both — keeps the pre-existing pinned
                     * behaviour byte-identical. The grid card shows both chips.
                     */
                    playlist.isPinned
                      ? t('playlist.labelPinned')
                      : playlist.type !== 'radio' && playlist.hasRemoteSongs
                        ? t('playlist.labelRemote')
                        : undefined
                  }
                  coverUrl={playlist.coverUrl ? buildCoverUrl(playlist.coverUrl, playlist.updatedAt) : undefined}
                  onTap={() => onTap(playlist)}
                  onPlayAll={() => onPlayAll(playlist)}
                  onMore={(anchor) => openRowMenu(playlist, anchor)}
                  testIdSuffix={String(playlist.id)}
                  selectMode={selectMode}
                  isSelected={selected.has(playlist.id)}
                />
              ))}
          {viewMode === 'grid' ? <GridSpacers /> : null}
        </view>
        {query.isFetchingNextPage
          ? (
            <view className='playlists__footer'>
              <text className='playlists__footer-text'>{t('common.loadingMore')}</text>
            </view>
          )
          : null}
              <view className='playlists__nav-inset' />
</scroll-view>
      {selectMode && selected.size > 0
        ? (
          <view className='playlists__select-toolbar'>
            <text className='playlists__select-toolbar-count'>
              {t('library.selectedCount', { count: selected.size })}
            </text>
            <view className='playlists__select-toolbar-btn' bindtap={batchDelete}>
              <text className='playlists__select-toolbar-btn-text'>
                {t('playlist.deletePlaylist')}
              </text>
            </view>
          </view>
        )
        : null}
      {/*
        * Full-screen delete confirm for the multi-selection — mounted at the
        * page root, outside the scroll-view, so the dialog centres on the
        * viewport instead of being laid out inside the scrolling column.
        */}
      <ConfirmDialog
        show={confirmDelete}
        title={t('playlist.deleteTitle')}
        message={t('playlist.deletePlaylistsMessage')}
        confirmLabel={t('playlist.deletePlaylist')}
        onConfirm={performBatchDelete}
        onCancel={() => setConfirmDelete(false)}
        testId='playlists-delete-dialog'
        confirmTestId='playlists-delete-confirm'
        cancelTestId='playlists-delete-cancel'
      />
      {/*
        * Single-row delete confirm, armed by the row menu — the batch dialog
        * above is for select mode only.
        */}
      <ConfirmDialog
        show={pendingDelete != null}
        title={t('playlist.deleteTitle')}
        message={t('playlist.deleteMessage')}
        confirmLabel={t('playlist.deletePlaylist')}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target) void deleteMutation.mutateAsync(target.id)
        }}
        onCancel={() => setPendingDelete(null)}
        testId='playlists-row-delete-dialog'
        confirmTestId='playlists-row-delete-confirm'
        cancelTestId='playlists-row-delete-cancel'
      />
      {/*
        * The row menu itself — page-level, outside the scroll-view (see the
        * state declaration above for why).
        */}
      <GlobalMenu
        show={menuPlaylist != null}
        onClose={closeRowMenu}
        items={rowMenuItems}
        onSelect={onRowMenuSelect}
        anchor={menuAnchor ?? undefined}
        testId='playlists-row-menu'
      />

    </view>
  )
}

function PlaylistState({
  text,
  subtext,
  tone,
}: {
  text: string
  subtext?: string
  tone?: 'error'
}) {
  return (
    <view className='playlists__state'>
      <text
        className={tone === 'error'
          ? 'playlists__state-text playlists__state-text--error'
          : 'playlists__state-text'}
      >
        {text}
      </text>
      {subtext ? <text className='playlists__state-subtext'>{subtext}</text> : null}
    </view>
  )
}
