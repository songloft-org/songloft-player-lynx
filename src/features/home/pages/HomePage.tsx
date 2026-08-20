import { useEffect, useRef, useState } from '@lynx-js/react'
import type { NodesRef } from '@lynx-js/types'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { isWebPlatform } from '../../../native/web-platform.js'
import { useBreakpoint } from '../../../shared/responsive/useBreakpoint.js'

import { EMPTY_LIBRARY_STATS } from '../../../models/library-stats.js'
import type { Playlist } from '../../../models/playlist.js'
import { usePlayerStore } from '../../player/store/index.js'
import { PluginGrid } from '../../jsplugin/widgets/PluginGrid.js'
import { currentGreetingKey } from '../domain/greeting.js'
import { useHomePlaylists } from '../data/home-query.js'
import { useLibraryStatsQuery } from '../data/home-stats-query.js'
import { homeSectionItems } from '../data/home-select.js'
import { HomeSection } from '../widgets/HomeSection.js'
import { StatsStrip } from '../widgets/StatsStrip.js'

import './HomePage.css'

/**
 * Home page (batch 7), rendered inside the shell at `/`. Replaces the batch-1
 * placeholder ("Your songs will appear here").
 *
 * Ported (trimmed) from the Flutter `HomePage`: a time-of-day greeting, a
 * "My Playlists" (normal) section and a "My Radios" (radio) section — each a
 * bounded preview grid of playlist cards with a "View all" hatch into the
 * library — and a bottom stats strip. Data is the batch-6 playlist list filtered
 * by `type` (reused authenticated client + zod models). The JS-plugin grid from
 * the Flutter home is deferred to the jsplugin batch (see PROGRESS).
 *
 * Interactions: tapping a card → `/playlists/$id`; "View all" → the library
 * Playlists view (`/library?view=playlists`). Log out lives in Settings → Account
 * (two-step confirm), not on this page.
 */
export function HomePage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const normal = useHomePlaylists('normal')
  const radio = useHomePlaylists('radio')
  // Library totals come from `/songs/stats`, not from the two sections' `total`
  // fields — those only ever described playlist counts. Falls back to zeroes while
  // loading or if the read fails, so the panel degrades instead of disappearing.
  const statsQuery = useLibraryStatsQuery()
  const playingPlaylistId = usePlayerStore((s) => s.sourcePlaylistId)

  const { isWide: homeIsWide, onLayoutChange: homeLayoutChange } = useBreakpoint(0, '.home')
  const sectionLimit = homeIsWide ? 9 : 6
  const normalItems = homeSectionItems(normal.data?.pages, sectionLimit)
  const radioItems = homeSectionItems(radio.data?.pages, sectionLimit)
  const stats = statsQuery.data ?? EMPTY_LIBRARY_STATS

  const normalFailed = normal.isError
  const radioFailed = radio.isError
  // First load = neither section has data nor an error yet.
  const isFirstLoad =
    (normal.isLoading && !normal.data) && (radio.isLoading && !radio.data)
  const bothFailed = normalFailed && radioFailed &&
    normalItems.length === 0 && radioItems.length === 0

  const [loadingSlow, setLoadingSlow] = useState(false)
  useEffect(() => {
    if (!isFirstLoad) { setLoadingSlow(false); return }
    const timer = setTimeout(() => setLoadingSlow(true), 5000)
    return () => clearTimeout(timer)
  }, [isFirstLoad])

  const openPlaylist = (playlist: Playlist) => {
    void navigate({ to: '/playlists/$id', params: { id: String(playlist.id) } })
  }
  const viewAllPlaylists = () => {
    void navigate({ to: '/library', search: { view: 'playlist_normal' } })
  }
  const viewAllRadios = () => {
    void navigate({ to: '/library', search: { view: 'playlist_radio' } })
  }
  const refreshRef = useRef<NodesRef>(null)
  // Platform, not realm: this render runs on the background thread, which on Web
  // is a worker with no `window`/`document` (see `isWebPlatform`).
  const isWeb = isWebPlatform()
  const onStartRefresh = () => {
    void Promise.all([normal.refetch(), radio.refetch(), statsQuery.refetch()]).finally(() => {
      refreshRef.current?.invoke({ method: 'finishRefresh' }).exec()
    })
  }

  const scroller = (
    <scroll-view className='home__scroll' scroll-y enable-nested-scroll={true}>
      <view className='home__content'>
        {isFirstLoad
          ? loadingSlow
            ? <HomeState text={t('home.loadingSlow')} action={t('common.retry')} onAction={() => { void normal.refetch(); void radio.refetch() }} />
            : <HomeState text={t('common.loading')} />
          : bothFailed
            ? <HomeState text={t('home.loadError')} tone='error' />
            : (normalItems.length === 0 && radioItems.length === 0 &&
                !normalFailed && !radioFailed)
              ? (
                <view className='home__empty'>
                  <text className='home__empty-title'>{t('home.noPlaylistsTitle')}</text>
                  <text className='home__empty-subtitle'>
                    {t('home.noPlaylistsSubtitle')}
                  </text>
                  <view className='home__empty-action' bindtap={viewAllPlaylists}>
                    <text className='home__empty-action-text'>{t('home.browseLibrary')}</text>
                  </view>
                </view>
              )
              : (
                <view>
                  {normalItems.length > 0 || normalFailed
                    ? (
                      <HomeSection
                        title={t('home.myPlaylists')}
                        icon='library'
                        items={normalItems}
                        failed={normalFailed}
                        onViewAll={viewAllPlaylists}
                        onRetry={() => void normal.refetch()}
                        onTapPlaylist={openPlaylist}
                        playingPlaylistId={playingPlaylistId}
                      />
                    )
                    : null}
                  {radioItems.length > 0 || radioFailed
                    ? (
                      <HomeSection
                        title={t('home.myRadios')}
                        icon='music'
                        items={radioItems}
                        failed={radioFailed}
                        onViewAll={viewAllRadios}
                        onRetry={() => void radio.refetch()}
                        onTapPlaylist={openPlaylist}
                        playingPlaylistId={playingPlaylistId}
                      />
                    )
                    : null}
                  <PluginGrid />
                  <StatsStrip stats={stats} />
                </view>
              )}
      </view>
    </scroll-view>
  )

  return (
    <view className='home' bindlayoutchange={homeLayoutChange}>
      <view className='home__topbar'>
        <text className='home__greeting' data-testid='home-greeting'>
          {t(currentGreetingKey())}
        </text>
      </view>

      {/*
        * Web has no `<refresh>`: it is missing from web-core's tag map, so both it
        * and `<refresh-header>` reach the DOM as unknown elements and the header's
        * label renders as plain page content — a permanent "下拉刷新…" line under the
        * greeting. `enable-refresh={false}` cannot suppress that (web-elements'
        * hiding rules target `x-refresh-header`), so the wrapper is left out of the
        * tree entirely and the scroller stands alone in a plain host view.
        */}
      {isWeb
        ? <view className='home__scroll-host'>{scroller}</view>
        : (
          <refresh
            ref={refreshRef}
            className='home__refresh'
            enable-refresh={true}
            bindstartrefresh={onStartRefresh}
          >
            <refresh-header className='home__refresh-header'>
              <text className='home__refresh-header-text'>{t('home.refreshing')}</text>
            </refresh-header>
            {scroller}
          </refresh>
        )}
    </view>
  )
}

function HomeState({ text, tone, action, onAction }: { text: string; tone?: 'error'; action?: string; onAction?: () => void }) {
  return (
    <view className='home__state'>
      <text
        className={tone === 'error'
          ? 'home__state-text home__state-text--error'
          : 'home__state-text'}
      >
        {text}
      </text>
      {action && onAction
        ? (
          <view className='home__state-action' bindtap={onAction}>
            <text className='home__state-action-text'>{action}</text>
          </view>
        )
        : null}
    </view>
  )
}
