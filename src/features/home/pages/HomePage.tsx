import { useNavigate } from '@tanstack/react-router'

// Vanilla store readers (no subscription) — same pattern as LibraryPage — so the
// home graph does not pull in a zustand subscription (which crashes the
// ReactLynx Vitest snapshot tree) and stays free of the player barrel.
import { useAuthStore } from '../../auth/store/index.js'
import type { Playlist } from '../../../models/playlist.js'
import { currentGreeting } from '../domain/greeting.js'
import { useHomePlaylists } from '../data/home-query.js'
import { homeSectionItems, homeSectionTotal, homeStats } from '../data/home-select.js'
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
 * Playlists view (`/library?view=playlists`); "Log out" → `useAuthStore.logout()`
 * then `/login`.
 */
export function HomePage() {
  const navigate = useNavigate()
  const normal = useHomePlaylists('normal')
  const radio = useHomePlaylists('radio')

  const normalItems = homeSectionItems(normal.data?.pages)
  const radioItems = homeSectionItems(radio.data?.pages)
  const stats = homeStats(
    homeSectionTotal(normal.data?.pages),
    homeSectionTotal(radio.data?.pages),
  )

  const normalFailed = normal.isError
  const radioFailed = radio.isError
  // First load = neither section has data nor an error yet.
  const isFirstLoad =
    (normal.isLoading && !normal.data) && (radio.isLoading && !radio.data)
  const bothFailed = normalFailed && radioFailed &&
    normalItems.length === 0 && radioItems.length === 0

  const openPlaylist = (playlist: Playlist) => {
    void navigate({ to: '/playlists/$id', params: { id: String(playlist.id) } })
  }
  // Both sections' "View all" lead to the library Playlists view. Lynx's library
  // has no separate radio sub-view (Flutter used `?view=playlist_radio`), so
  // radio maps to the same tab — noted in PROGRESS.
  const viewAllPlaylists = () => {
    void navigate({ to: '/library', search: { view: 'playlists' } })
  }
  const logout = () => {
    void useAuthStore.getState().logout()
    void navigate({ to: '/login' })
  }

  return (
    <view className='home'>
      <view className='home__topbar'>
        <text className='home__greeting' data-testid='home-greeting'>
          {currentGreeting()}
        </text>
        <view className='home__spacer' />
        <view className='home__logout' bindtap={logout}>
          <text className='home__logout-text'>Log out</text>
        </view>
      </view>

      <scroll-view className='home__scroll' scroll-y>
        <view className='home__content'>
          {isFirstLoad
            ? <HomeState text='Loading…' />
            : bothFailed
              ? <HomeState text='Couldn’t load your home.' tone='error' />
              : (normalItems.length === 0 && radioItems.length === 0 &&
                  !normalFailed && !radioFailed)
                ? (
                  <view className='home__empty'>
                    <text className='home__empty-title'>No playlists yet</text>
                    <text className='home__empty-subtitle'>
                      Playlists you create will appear here.
                    </text>
                    <view className='home__empty-action' bindtap={viewAllPlaylists}>
                      <text className='home__empty-action-text'>Browse library</text>
                    </view>
                  </view>
                )
                : (
                  <view>
                    {normalItems.length > 0 || normalFailed
                      ? (
                        <HomeSection
                          title='My Playlists'
                          icon='library'
                          items={normalItems}
                          failed={normalFailed}
                          onViewAll={viewAllPlaylists}
                          onRetry={() => void normal.refetch()}
                          onTapPlaylist={openPlaylist}
                        />
                      )
                      : null}
                    {radioItems.length > 0 || radioFailed
                      ? (
                        <HomeSection
                          title='My Radios'
                          icon='music'
                          items={radioItems}
                          failed={radioFailed}
                          onViewAll={viewAllPlaylists}
                          onRetry={() => void radio.refetch()}
                          onTapPlaylist={openPlaylist}
                        />
                      )
                      : null}
                    <StatsStrip stats={stats} />
                  </view>
                )}
        </view>
      </scroll-view>
    </view>
  )
}

function HomeState({ text, tone }: { text: string; tone?: 'error' }) {
  return (
    <view className='home__state'>
      <text
        className={tone === 'error'
          ? 'home__state-text home__state-text--error'
          : 'home__state-text'}
      >
        {text}
      </text>
    </view>
  )
}
