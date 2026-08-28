import { useEffect, useState } from '@lynx-js/react'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { readPlaylistViewMode, writePlaylistViewMode, type PlaylistViewMode } from '../../playlist/data/playlist-view-prefs.js'
import { setLastLibrarySearch } from '../data/last-library-search.js'
import {
  libraryBrowseConfigOrFallback,
  useLibraryBrowseConfigQuery,
} from '../data/library-browse-query.js'
import { readLibrarySort, writeLibrarySort } from '../data/library-sort-prefs.js'
import {
  DEFAULT_LIBRARY_SORT_ID,
  type LibrarySortId,
} from '../domain/library-sort.js'
import {
  flatViewType,
  LIBRARY_VIEW_GROUP,
  playlistViewType,
  resolveLibraryView,
  type LibraryViewKey,
} from '../domain/library-views.js'
import { FlatSongsView } from '../widgets/FlatSongsView.js'
import { FacetGridView } from '../widgets/FacetGridView.js'
import { TagGridView } from '../widgets/TagGridView.js'
import { LibraryStateMessage } from '../widgets/LibraryStateMessage.js'
import { LibraryViewEditor } from '../widgets/LibraryViewEditor.js'
import { LibraryViewSwitcher } from '../widgets/LibraryViewSwitcher.js'
import { useLibraryViewport } from './library-viewport.js'
import { PlaylistsView } from '../../playlist/widgets/PlaylistsView.js'
import './LibraryPage.css'

/**
 * The library page — a single page hosting the 14 configurable views (Lynx
 * counterpart of the Flutter `LibraryPage`). Which views exist, in which
 * order, and which are visible all come from the `/settings/library-browse`
 * config; this component resolves the URL's `?view=` against that config and
 * dispatches one of three content kinds:
 *   - songs group    → `FlatSongsView` (all/local/remote/radio)
 *   - facets group   → `FacetGridView` (artist/album/genre/year/…)
 *   - playlists group→ `PlaylistsView` (playlist/playlist_normal/playlist_radio)
 *
 * View customization (visibility + order) is edited **in-page** via the topbar
 * `tune` button → `LibraryViewEditor` (replaces the whole body), not in
 * settings. The pre-refactor page hardcoded four tabs and a separate chip row;
 * both are gone.
 */
export function LibraryPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const search = useSearch({ strict: false }) as { view?: LibraryViewKey }
  const browseQuery = useLibraryBrowseConfigQuery()
  const config = libraryBrowseConfigOrFallback(browseQuery)
  // Measured once by `LibraryLayout` for the whole section, not here: this page
  // and the rail must never disagree about the breakpoint, and a second
  // measurement of a slightly different box could.
  const { isWide } = useLibraryViewport()

  // Song-list sort: owned here (not by the flat view) so it persists to prefs
  // and survives switching between the 14 views. Seeded from prefs once.
  const [sortId, setSortId] = useState<LibrarySortId>(DEFAULT_LIBRARY_SORT_ID)
  useEffect(() => {
    void readLibrarySort().then(setSortId)
  }, [])
  const onSortChange = (id: LibrarySortId) => {
    setSortId(id)
    void writeLibrarySort(id)
  }

  const [viewMode, setViewMode] = useState<PlaylistViewMode>('grid')
  useEffect(() => {
    void readPlaylistViewMode().then(setViewMode)
  }, [])
  const onToggleViewMode = () => {
    const next = viewMode === 'grid' ? 'list' : 'grid'
    setViewMode(next)
    void writePlaylistViewMode(next)
  }

  const [editMode, setEditMode] = useState(false)

  // Edit mode replaces the entire page body with `LibraryViewEditor`, so back has to
  // leave the mode before it can mean "leave the page".
  useBackHandler(editMode, () => {
    setEditMode(false)
    return true
  })

  setLastLibrarySearch(search)

  // Config still pending (deliberately no placeholderData — see the query
  // module). Render a bare loading state, never the default 14 views.
  if (!config) {
    return (
      <view className='library'>
        <LibraryStateMessage text={t('common.loading')} />
      </view>
    )
  }

  // Edit mode replaces the whole body (Flutter `_buildEditor`).
  if (editMode) {
    return (
      <LibraryViewEditor
        initialConfig={config}
        onCancel={() => setEditMode(false)}
        onSaved={() => setEditMode(false)}
      />
    )
  }

  const { selected, displayKeys } = resolveLibraryView(search.view, config)

  const onSelect = (key: LibraryViewKey) => {
    navigate({ to: '/library', search: { view: key } })
  }


  // Compute showViewToggle from selected (available before group).
  const selectedGroup = selected ? LIBRARY_VIEW_GROUP[selected] : 'songs'
  const showViewToggle = selectedGroup === 'facets' || selectedGroup === 'playlists'
  const topbar = (
    <view className='library__topbar'>
      <text className='library__topbar-title'>{t('nav.library')}</text>
      {showViewToggle
        ? (
          <view
            className='library__topbar-toggle'
            bindtap={onToggleViewMode}
            data-testid='library-view-toggle'
          >
            <Icon name={viewMode === 'grid' ? 'list' : 'grid'} size={20} color={ICON_COLORS.content2} />
          </view>
        )
        : null}
      <view
        className='library__topbar-customize'
        bindtap={() => setEditMode(true)}
        data-testid='library-customize'
      >
        <Icon name='tune' size={20} color={ICON_COLORS.content2} />
      </view>
    </view>
  )

  // Every view hidden → nothing to dispatch. The editor (reachable from the
  // topbar) is the way back out.
  if (!selected) {
    return (
      <view className='library'>
        {topbar}
        <LibraryStateMessage text={t('library.viewsMinOne')} />
      </view>
    )
  }

  const group = LIBRARY_VIEW_GROUP[selected]

  const content = group === 'songs'
    ? (
      <FlatSongsView
        key={selected}
        type={flatViewType(selected)}
        sortId={sortId}
        onSortChange={onSortChange}
      />
    )
    : group === 'facets'
      ? selected === 'tag'
        ? <TagGridView key='tag' viewMode={viewMode} />
        : <FacetGridView key={selected} field={selected} viewMode={viewMode} />
      : <PlaylistsView key={selected} type={playlistViewType(selected)} viewMode={viewMode} />

  return (
    <view className='library'>
      {topbar}
      {/*
        Narrow only — on wide screens the same choice is offered by the rail that
        `LibraryLayout` renders beside this page. The strip lives here rather than
        in the layout so edit mode above can replace the whole body.
      */}
      {isWide
        ? null
        : <LibraryViewSwitcher displayKeys={displayKeys} selected={selected} onSelect={onSelect} />}
      <view className='library__content'>{content}</view>
    </view>
  )
}
