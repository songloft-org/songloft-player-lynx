import { useEffect, useRef, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Swiper, SwiperItem, type SwiperRef } from '@lynx-js/lynx-ui-swiper'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
// Direct module import, not the library barrel: that would pull the whole library
// feature (API client included) into the player's graph for one getter.
import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { cachedSongIdentity } from '../domain/offline-cache.js'
import { setShellWidth } from '../../../shared/nav/shell-navigation.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { readAutoEnterLyrics } from '../../settings/data/settings-prefs.js'
import { canWatchVideo, openCurrentSongVideo, usesJsVideoSurface } from '../data/video-open.js'
import { useBreakpoint } from '../../../shared/responsive/useBreakpoint.js'
import { resolvePlayerLayout } from '../domain/player-layout.js'
import { formatSleepRemaining } from '../domain/sleep-timer.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { usePlayerStore } from '../store/index.js'
import { LyricsView } from '../widgets/LyricsView.js'
import { PageDots } from '../widgets/PageDots.js'
import { PlayControls } from '../widgets/PlayControls.js'
import { PlayerBackdrop } from '../widgets/PlayerBackdrop.js'
import { PlayerToolBar } from '../widgets/PlayerToolBar.js'
import { PlayerTopBar } from '../widgets/PlayerTopBar.js'
import { PlaylistDrawer } from '../widgets/PlaylistDrawer.js'
import { ProgressBar } from '../widgets/ProgressBar.js'
import { SleepTimerSheet } from '../widgets/SleepTimerSheet.js'
import './FullPlayerPage.css'

/**
 * Cover, with the ▶ badge doubling as the entry point to fullscreen video.
 *
 * The badge stays visible whenever the song has a video track, because it is also
 * plain metadata ("this is a music video"). It only becomes *tappable* where a
 * fullscreen surface actually exists and the container can be shown — on Web, or in a
 * build without the native module, tapping would be the silent no-op this repo has
 * already shipped three times. That question is `canWatchVideo` (data/video-open.ts),
 * shared with the library's "watch MV" item so the two cannot disagree.
 *
 * Opening is `openCurrentSongVideo`, which switches to the transcoded HLS stream when
 * the container needs it: that request answers only when the whole transcode is done,
 * so the badge shows a pending state and names the failure at the end (no video track
 * vs. the server refusing to transcode).
 */
function CoverArt({ song, size }: { song: Song, size: number }) {
  const cover = song.coverUrl ? buildCoverUrl(song.coverUrl, song.updatedAt) : ''
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [note, setNote] = useState('')

  const canWatch = canWatchVideo(song)

  useEffect(() => {
    setPending(false)
    setNote('')
  }, [song.id])

  const openVideo = async (): Promise<void> => {
    if (usesJsVideoSurface()) {
      void navigate({ to: '/player/video' })
      return
    }
    setNote('')
    setPending(true)
    try {
      const outcome = await openCurrentSongVideo()
      if (outcome === 'noTrack') setNote(t('player.videoNoTrack'))
      else if (outcome === 'transcodeFailed') setNote(t('player.videoTranscodeFailed'))
    } catch {
      setNote(t('player.videoUnavailable'))
    } finally {
      setPending(false)
    }
  }

  // Inline rather than in CSS: the edge length comes from the screen class and the
  // leftover height (see `domain/player-layout.ts`), and this repo has no `@media`.
  const box = { width: `${size}px`, height: `${size}px` }

  return (
    <view className='full-player__cover-wrap'>
      {/*
        * The artwork is an `<image>` **inside** a shadowed `<view>`, not an `<image>`
        * carrying the shadow itself.
        *
        * On Android a `box-shadow` on an `<image>` suppresses the bitmap outright: the
        * element lays out at the right size, paints its background colour, and simply
        * never draws the picture. No warning, and the placeholder never shows either —
        * so the full-screen cover was a blank rounded rectangle, while the same URL in
        * the mini player (no shadow) rendered fine. Found on device; a screenshot is
        * the only thing that can see it.
        *
        * `aspectFill` matches Flutter's `BoxFit.cover`: fill the square and crop,
        * rather than letterbox a non-square cover inside it.
        */}
      <view className='full-player__cover' style={box}>
        {cover
          ? <image className='full-player__cover-img' style={box} src={cover} mode='aspectFill' />
          : (
            <view className='full-player__cover-empty'>
              {/* Flutter scales the placeholder glyph with the cover (`size * 0.4`). */}
              <Icon name='music' size={Math.round(size * 0.4)} color={ICON_COLORS.contentMuted} />
            </view>
          )}
        {song.isVideo
          ? (
            <view
              className='full-player__video-badge'
              bindtap={canWatch && !pending ? () => { void openVideo() } : undefined}
              data-testid={canWatch ? 'video-fullscreen' : undefined}
            >
              {/* Pill badge: the old "▶" text was too small to read at a glance and
                  looked like a rendering artifact. A labelled pill carrying the screen
                  glyph clearly states "this is a music video — tap to watch". (Not the
                  `play` glyph: the song menu has a "play" item of its own, and the two
                  actions must not read as the same one.) */}
              <Icon name='video' size={12} color={ICON_COLORS.content} />
              <text className='full-player__video-badge-text'>
                {pending ? '…' : t('player.videoBadge')}
              </text>
            </view>
          )
          : null}
      </view>
      {note
        ? <text className='full-player__video-note'>{note}</text>
        : null}
    </view>
  )
}

export function FullPlayerPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const song = usePlayerStore((s) => s.currentSong)
  const local = song ? cachedSongIdentity(song) !== null : false
  useBackHandler(local, () => { void navigate({ to: '/device-cache' }); return true })
  const sleepTimer = usePlayerStore((s) => s.sleepTimer)
  /*
   * The `'.full-player'` selector is load-bearing. `/player` mounts on navigation,
   * and on Web `bindlayoutchange` only ever fires for elements present at first
   * paint — so without the one-shot measurement `width` stays 0 forever, the Swiper
   * branch below is never taken, and the lyrics screen is unreachable.
   */
  const { width, breakpoint, isWide, onLayoutChange } = useBreakpoint(0, '.full-player')
  // `/player` is chrome-less and full-screen → its width *is* the window width,
  // which is the shell width. Publishing it keeps the cache fresh while the
  // shell is unmounted (e.g. a rotation during playback), so the shell that
  // remounts on close seeds frame 1 from a current value, not a stale one
  // (songloft-player-lynx#6). Before measurement `width` is 0, which
  // `setShellWidth` rejects — no risk of clobbering a good cache with 0.
  setShellWidth(width)
  /*
   * The stage measures itself, separately from the page.
   *
   * The cover has to fit what is left after the top bar, title, progress and both
   * control rows, and only the stage knows that. Feeding the *page* height to the
   * budget asked for a 220px cover in a 186px column and the frame overflowed upwards
   * under the top bar — visible only on a device in landscape, where the stage is
   * shortest. The stage is `overflow: hidden` and `flex: 1`, so its height is settled by
   * its siblings and does not move when the cover inside it resizes.
   */
  const { height: stageHeight, onLayoutChange: onStageLayout } =
    useBreakpoint(0, '.full-player__stage')
  const layout = resolvePlayerLayout({ width, height: stageHeight, breakpoint })
  const [showSleepTimer, setShowSleepTimer] = useState(false)
  useEffect(() => {
    if (
      typeof __SONGLOFT_TEST_BRIDGE__ === 'undefined' ||
      !__SONGLOFT_TEST_BRIDGE__
    ) return
    const g = globalThis as Record<string, unknown>
    const store = g.__E2E_PLAYER_STORE__ as Record<string, unknown> | undefined
    if (store) store.setShowSleepTimer = setShowSleepTimer
    return () => { if (store) delete store.setShowSleepTimer }
  }, [])
  const swiperRef = useRef<SwiperRef>(null)
  /**
   * Which Swiper screen is showing (0 = cover, 1 = lyrics). Tracked so the back key
   * can slide back to the cover instead of leaving the player. `swipeTo` fires
   * `onChange`, so the auto-enter effect below keeps this in sync without a second
   * write.
   */
  const [swiperIndex, setSwiperIndex] = useState(0)

  /*
   * On the lyrics screen, back returns to the cover first. Only on the narrow
   * layout: wide shows cover and lyrics side by side, so there is no second screen
   * to leave. Registered before any overlay the user can open (they activate later,
   * and the stack is ordered by activation), so an open menu or sheet still closes
   * before the swiper slides.
   */
  useBackHandler(!isWide && swiperIndex === 1, () => {
    swiperRef.current?.swipeTo(0)
    return true
  })

  /*
   * "Open straight to the lyrics", when the preference is on.
   *
   * This has never actually worked. The old version read the pref on mount and called
   * `swipeTo(1)` in the `.then`, but the Swiper only renders once a width is known —
   * and the width was permanently 0, because the page never passed a
   * `measureSelector`. So `swiperRef.current` was null and `swipeTo` was dropped on the
   * floor, silently, every time.
   *
   * Fixing the measurement turns that into a race rather than a certainty: on Web the
   * first frame still has no width, so the pref can resolve before the Swiper exists.
   * Hence two pieces of state and an effect that waits for both — the pref, and the
   * Swiper actually being mounted.
   */
  const [autoEnterLyrics, setAutoEnterLyrics] = useState(false)
  useEffect(() => {
    void readAutoEnterLyrics().then(setAutoEnterLyrics)
  }, [])

  const swiperMounted = !isWide && layout.measured
  const [autoEntered, setAutoEntered] = useState(false)
  useEffect(() => {
    if (!autoEnterLyrics || !swiperMounted || autoEntered) return
    // Once only: re-running on a later layout change would yank the user back to the
    // lyrics after they had swiped to the cover (a rotate is enough to trigger it).
    setAutoEntered(true)
    swiperRef.current?.swipeTo(1)
  }, [autoEnterLyrics, swiperMounted, autoEntered])

  /*
   * Forget which screen we were on when the Swiper goes away or comes back.
   *
   * `swiperIndex` outlives the Swiper — it is page state. Without this, a rotate from
   * wide back to narrow would leave it at 1 while the fresh Swiper starts at 0, so the
   * back key would try to "return to the cover" from the cover and swallow the press.
   */
  useEffect(() => {
    if (!swiperMounted) setSwiperIndex(0)
  }, [swiperMounted])

  useEffect(() => {
    usePlayerStore.getState().closePlaylistDrawer()
    return () => { usePlayerStore.getState().closePlaylistDrawer() }
  }, [])

  /**
   * Return to the tab the player was opened from, not always Home.
   *
   * Not `history.back()`: the memory history's first entry is `/login`, and any
   * navigation the user did before opening the player would make "back" land
   * somewhere arbitrary. The shell records its own last tab instead, which is also
   * how the library remembers its sub-tab — restored so returning to the library
   * does not reset it. That rule now lives in `shared/nav/route-back.ts`, where the
   * hardware back key reads it too.
   */
  const closePlayer = () => {
    if (local) void navigate({ to: '/device-cache' })
    else performRouteBack()
  }

  if (!song) {
    return (
      <view className='full-player full-player--enter full-player--empty'>
        {/* Large glyph gives the empty state presence — text alone reads as an
            error, an icon + text reads as a deliberate resting place. */}
        <view className='full-player__empty-icon'>
          <Icon name='music' size={64} color={ICON_COLORS.contentMuted} />
        </view>
        <text className='full-player__empty-title'>{t('player.nothingPlaying')}</text>
        <text className='full-player__empty-subtitle'>
          {t('player.nothingPlayingSubtitle')}
        </text>
        <view className='full-player__empty-btn' bindtap={() => navigate({ to: '/library' })}>
          <text className='full-player__empty-btn-text'>{t('player.goToLibrary')}</text>
        </view>
      </view>
    )
  }

  // Same URL the cover art uses, so the backdrop is an image-cache hit (see
  // `PlayerBackdrop`). Computed here rather than inside it to keep that guarantee
  // visible at the one place both consumers are in view.
  const coverUrl = song.coverUrl ? buildCoverUrl(song.coverUrl, song.updatedAt) : ''

  const timerActive = sleepTimer != null
  const timerLabel = sleepTimer
    ? sleepTimer.mode === 'duration'
      ? t('player.sleepTimerActive', { time: formatSleepRemaining(sleepTimer.remainingMs ?? 0) })
      : t(sleepTimer.remainingSongs === 1
          ? 'player.sleepTimerSongsLeftOne'
          : 'player.sleepTimerSongsLeft',
        { count: sleepTimer.remainingSongs ?? 0 })
    : undefined

  return (
    <view
      className='full-player full-player--enter'
      bindlayoutchange={onLayoutChange}
      // Scales with the screen class (16 → 64), which CSS cannot express here.
      style={{ paddingLeft: `${layout.padH}px`, paddingRight: `${layout.padH}px` }}
    >
      <view
        className='full-player__scene'
        id='songloft-player-content'
        flatten={false}
        style={{ paddingLeft: `${layout.padH}px`, paddingRight: `${layout.padH}px` }}
      >
        <PlayerBackdrop coverUrl={coverUrl} />

        <view className='full-player__layer'>
          <PlayerTopBar
            song={song}
            isWide={isWide}
            onClose={closePlayer}
            onOpenSleepTimer={() => setShowSleepTimer(true)}
            timerActive={timerActive}
            timerLabel={timerLabel}
          />

          <view className='full-player__stage full-player__stage--enter' bindlayoutchange={onStageLayout}>
            {/*
              * Split (cover beside lyrics) from tablet up; two swiped screens below it.
              * Both branches are gated on `layout.measured`, and the third one is what
              * renders until then — the Swiper caches the `itemWidth` it is first handed,
              * so feeding it a guessed width leaves the page permanently misaligned.
              */}
            {layout.isSplit
              ? (
                <view className='full-player__stage-row'>
                  <view
                    className='full-player__cover-col'
                    style={{ flexGrow: layout.coverFlex, flexShrink: 1, flexBasis: '0%' }}
                  >
                    <CoverArt song={song} size={layout.coverSize} />
                  </view>
                  <view
                    className='full-player__lyrics-pane'
                    style={{ flexGrow: layout.lyricsFlex, flexShrink: 1, flexBasis: '0%' }}
                  >
                    <LyricsView />
                  </view>
                </view>
              )
              : layout.measured
                ? (
                  <>
                    <Swiper
                      ref={swiperRef}
                      data={[0, 1]}
                      itemWidth={width}
                      containerWidth={width}
                      itemHeight='auto'
                      onChange={setSwiperIndex}
                      experimentalHorizontalSwipeOnly
                      consumeSlideEvent={[[-180, -150], [-30, 30], [150, 180]]}
                    >
                      {({ index }: { index: number }) => (
                        <SwiperItem>
                          {index === 0
                            ? <CoverArt song={song} size={layout.coverSize} />
                            : (
                              <view className='full-player__lyrics-page'>
                                <LyricsView />
                              </view>
                            )}
                        </SwiperItem>
                      )}
                    </Swiper>
                    {/* Only meaningful next to a real swiper — the fallback below has
                        one screen, and the wide layout shows both at once. */}
                    <PageDots count={2} index={swiperIndex} />
                  </>
                )
                : <CoverArt song={song} size={layout.coverSize} />}
          </view>

          <view className='full-player__meta full-player__meta--enter'>
            <text className='full-player__title'>{song.title}</text>
            {song.artist ? <text className='full-player__artist'>{song.artist}</text> : null}
          </view>

          <view className='full-player__controls-enter'>
            <ProgressBar />
            <PlayControls
              playBtn={layout.playBtn}
              playRadius={layout.playRadius}
              slot={layout.toolSlot}
              songId={local ? undefined : song.id}
            />
            <PlayerToolBar slot={layout.toolSlot} />
          </view>
        </view>

      </view>

      <PlaylistDrawer />
      <SleepTimerSheet show={showSleepTimer} onClose={() => setShowSleepTimer(false)} />
    </view>
  )
}
