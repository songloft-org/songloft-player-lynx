import { useEffect, useRef, useState } from '@lynx-js/react'
import type { NodesRef } from '@lynx-js/types'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { isWebPlatform } from '../../../native/web-platform.js'
import { useShellSeededBreakpoint } from '../../../shared/responsive/use-shell-seeded-breakpoint.js'

import { EMPTY_LIBRARY_STATS } from '../../../models/library-stats.js'
import type { Playlist } from '../../../models/playlist.js'
import { usePlayerStore } from '../../player/store/index.js'
import { playlistContext } from '../../player/domain/playback-context.js'
import { getPlaylistApi } from '../../playlist/api/index.js'
import { toast } from '../../../shared/ui/toast-store.js'
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

  const { isWide: homeIsWide, breakpoint: homeBreakpoint, onLayoutChange: homeLayoutChange } = useShellSeededBreakpoint('.home')
  // Bento (the two sections side by side) only at desktop/tv: at tablet the
  // half-width cramps the 30%-width grid cards. `breakpoint` reflects the
  // measured `.home` content rect, so `desktop` means content ≥ 900px — not the
  // shell window, which is why `shell--wide` (≥600) is the wrong gate here.
  const isBento = homeBreakpoint === 'desktop' || homeBreakpoint === 'tv'
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
  const createPlaylist = () => {
    void navigate({ to: '/playlists/create' })
  }
  // One-tap "play this playlist" from the home cover disc — mirrors PlaylistsView's
  // onPlayAll: fetch up to 9999 songs, playAll with the playlist context so the play
  // event lands in that playlist's history. Empty → toast; failure → toast. The
  // cover's catchtap already stops this from also navigating into the detail page.
  const onPlayAll = async (playlist: Playlist) => {
    try {
      const res = await getPlaylistApi().getPlaylistSongs(playlist.id, {}, { limit: 9999, offset: 0 })
      if (res.songs.length === 0) {
        toast.show(t('playlist.emptyPlaylist'))
        return
      }
      await usePlayerStore.getState().playAll(res.songs, playlistContext(playlist.id))
    } catch {
      toast.error(t('playlist.playFailed'))
    }
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
            : (
              <view>
                <view className='home__sections'>
                  <HomeSection
                    title={t('home.myPlaylists')}
                    icon='library'
                    items={normalItems}
                    failed={normalFailed}
                    loading={normal.isLoading && !normal.data}
                    onViewAll={viewAllPlaylists}
                    onRetry={() => void normal.refetch()}
                    onTapPlaylist={openPlaylist}
                    onPlayAll={onPlayAll}
                    playingPlaylistId={playingPlaylistId}
                    isWide={homeIsWide}
                    emptyTitle={t('home.sectionEmptyPlaylists')}
                    emptyActionLabel={t('home.sectionCreatePlaylist')}
                    onEmptyAction={createPlaylist}
                  />
                  <HomeSection
                    title={t('home.myRadios')}
                    icon='music'
                    items={radioItems}
                    failed={radioFailed}
                    loading={radio.isLoading && !radio.data}
                    onViewAll={viewAllRadios}
                    onRetry={() => void radio.refetch()}
                    onTapPlaylist={openPlaylist}
                    onPlayAll={onPlayAll}
                    playingPlaylistId={playingPlaylistId}
                    isWide={homeIsWide}
                    emptyTitle={t('home.sectionEmptyRadios')}
                  />
                </view>
                <PluginGrid />
                <StatsStrip stats={stats} />
              </view>
            )}
      </view>
    </scroll-view>
  )

  return (
    <view className={isBento ? 'home home--bento' : 'home'} bindlayoutchange={homeLayoutChange}>
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
