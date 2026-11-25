import { useCallback, useEffect, useRef, useState } from '@lynx-js/react'
import type { NodesRef, ScrollEvent } from '@lynx-js/types'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { KaraokeLine } from './KaraokeLine.js'
import { useLyricStore } from '../store/index.js'
import { usePlayerStore } from '../store/index.js'
import { cachedSongIdentity } from '../domain/offline-cache.js'
import { markLyricsScreenBeforeAdjust } from '../domain/lyrics-return-screen.js'
import './LyricsView.css'

/**
 * Placeholder for the loading / failed / empty states. Mirrors the Flutter
 * `_buildStatusPlaceholder`: the failed and empty states offer a "re-fetch
 * lyrics" button whenever the current song allows one.
 */
function StatusPlaceholder({
  message,
  canRefetch,
  onRefetch,
  refetchLabel,
}: {
  message: string
  canRefetch: boolean
  onRefetch: () => void
  refetchLabel: string
}) {
  return (
    <view className='player-lyrics player-lyrics--state'>
      <text className='player-lyrics__state-text'>{message}</text>
      {canRefetch
        ? (
          <view className='player-lyrics__refetch' bindtap={onRefetch}>
            <Icon name='refresh' size={14} color={ICON_COLORS.primary} />
            <text className='player-lyrics__refetch-text'>{refetchLabel}</text>
          </view>
        )
        : null}
    </view>
  )
}

export function LyricsView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const lyrics = useLyricStore((s) => s.lyrics)
  const currentIndex = useLyricStore((s) => s.currentIndex)
  const isLoading = useLyricStore((s) => s.isLoading)
  const loadFailed = useLyricStore((s) => s.loadFailed)
  const synced = useLyricStore((s) => s.synced)
  const translationMap = useLyricStore((s) => s.translationMap)
  const romanizationMap = useLyricStore((s) => s.romanizationMap)
  const refetch = useLyricStore((s) => s.refetch)
  const currentSong = usePlayerStore((s) => s.currentSong)
  const seek = usePlayerStore((s) => s.seek)

  // Tapping a lyric line jumps playback to that timestamp — table stakes for
  // a music player. Only meaningful for time-stamped lyrics; unsynced lines all
  // report timeMs 0 and would just rewind to the start.
  const seekToLine = useCallback((line: { timeMs: number }) => {
    if (!synced) return
    void seek(line.timeMs)
  }, [synced, seek])

  // Local songs always allow a re-fetch (the endpoint can be assembled from the
  // id); remote/radio songs need an explicit lyric URL. Same gate as the
  // Flutter `_canRefetch`.
  const canRefetch =
    currentSong != null && !cachedSongIdentity(currentSong) && (currentSong.type === 'local' || !!currentSong.lyricUrl)

  // Timing adjustment only makes sense for time-stamped lyrics of a local song
  // (the save writes `lyric_source: 'manual'`). Same gate as the Flutter
  // `_shouldShowEditButton`.
  const canAdjust =
    currentSong?.type === 'local' &&
    !cachedSongIdentity(currentSong) &&
    lyrics.length > 0 &&
    synced &&
    !isLoading &&
    !loadFailed

  const onRefetch = () => {
    void refetch(currentSong)
  }

  /*
   * All hooks must run on every render regardless of the placeholder branches
   * below. React fibers require a stable hook call order; toggling between
   * loading / failed / empty / loaded across song changes would otherwise
   * shift the hook order and corrupt state.
   *
   * "Back to current line" button.
   *
   * Auto-scroll centres the active line when `currentIndex` changes, but a user
   * scrolling ahead or behind loses it in the viewport. The button surfaces only
   * when the scroll position has drifted more than `DRIFT_PX` from the last
   * auto-scroll position — enough to have moved the current line off-screen,
   * not so little that it flickers on every finger twitch.
   *
   * `lastAutoScrollTop` is a ref (not state): it is write-mostly and only read
   * inside the scroll callback, so re-rendering on every write would be waste.
   * `userScrolled` is state because it drives the button's visibility.
   */
  const DRIFT_PX = 150
  const activeLineRef = useRef<NodesRef>(null)
  const [userScrolled, setUserScrolled] = useState(false)
  const lastAutoScrollTopRef = useRef(0)
  // Ref mirror so the current-line effect can read the latest value without
  // listing it as a dependency (which would re-scroll on every drift change).
  const userScrolledRef = useRef(false)
  const markUserScrolled = useCallback((value: boolean) => {
    userScrolledRef.current = value
    setUserScrolled(value)
  }, [])

  // A new song is a fresh reading context: clear the deliberate scroll-away so
  // its lyrics follow the current line from the start and the "back to current"
  // button disappears. The scroll-view's key remounts its position, but this
  // component-level flag survives that remount without this reset.
  const currentSongId = currentSong?.id
  useEffect(() => {
    markUserScrolled(false)
    lastAutoScrollTopRef.current = 0
  }, [currentSongId, markUserScrolled])

  useEffect(() => {
    // Respect a deliberate scroll-away: if the reader has moved off the current
    // line, do not yank the view back on every line change. The "back to current"
    // button is the explicit way to resume following. Previously this effect
    // reset userScrolled unconditionally, so the button vanished within a line
    // or two and reading ahead was impossible — the same feel-breaking class of
    // bug as the player's back navigation.
    if (userScrolledRef.current) return
    if (currentIndex >= 0 && activeLineRef.current) {
      try {
        activeLineRef.current
          .invoke({
            method: 'scrollIntoView',
            params: {
              scrollIntoViewOptions: {
                block: 'center',
                behavior: 'smooth',
              },
            },
          })
          .exec()
      } catch (_) { /* no-op in test env */ }
    }
    // No reset of userScrolled here: staying in follow mode is the normal case
    // (the flag is already false), and when the reader has scrolled away we
    // returned above. handleScroll keeps the drift anchor fresh while following.
  }, [currentIndex])

  const handleScroll = useCallback((e: ScrollEvent) => {
    const top = e.detail.scrollTop
    // Anchor the first scroll after an auto-scroll: we don't know the final
    // position until the smooth animation lands, so keep updating the anchor
    // while the user hasn't drifted yet.
    if (!userScrolled) {
      lastAutoScrollTopRef.current = top
    }
    const drift = Math.abs(top - lastAutoScrollTopRef.current)
    if (drift > DRIFT_PX && !userScrolled) markUserScrolled(true)
    else if (drift <= DRIFT_PX && userScrolled) markUserScrolled(false)
  }, [userScrolled, markUserScrolled])

  const scrollToCurrent = useCallback(() => {
    if (currentIndex >= 0 && activeLineRef.current) {
      try {
        activeLineRef.current
          .invoke({
            method: 'scrollIntoView',
            params: {
              scrollIntoViewOptions: { block: 'center', behavior: 'smooth' },
            },
          })
          .exec()
      } catch (_) { /* no-op in test env */ }
    }
    // Re-arm following: the explicit button is the only way back into auto mode
    // after the reader scrolled away. Anchor from the current top so the smooth
    // scroll landing is not mistaken for another deliberate drift.
    lastAutoScrollTopRef.current = 0
    markUserScrolled(false)
  }, [currentIndex, markUserScrolled])

  if (isLoading) {
    return (
      <StatusPlaceholder
        message={t('player.loadingLyrics')}
        canRefetch={false}
        onRefetch={onRefetch}
        refetchLabel={t('lyricAdjust.refetch')}
      />
    )
  }

  if (loadFailed) {
    return (
      <StatusPlaceholder
        message={t('lyricAdjust.loadFailed')}
        canRefetch={canRefetch}
        onRefetch={onRefetch}
        refetchLabel={t('lyricAdjust.refetch')}
      />
    )
  }

  if (lyrics.length === 0) {
    return (
      <StatusPlaceholder
        message={t('player.noLyrics')}
        canRefetch={canRefetch}
        onRefetch={onRefetch}
        refetchLabel={t('lyricAdjust.refetch')}
      />
    )
  }

  return (
    <view className='player-lyrics__container'>
      {canAdjust || canRefetch
        ? (
          <view className='player-lyrics__tools'>
            {canRefetch
              ? (
                <view className='player-lyrics__tool' bindtap={onRefetch}>
                  <Icon name='refresh' size={14} color={ICON_COLORS.contentMuted} />
                  <text className='player-lyrics__tool-text'>{t('lyricAdjust.refetch')}</text>
                </view>
              )
              : null}
            {canAdjust
              ? (
                <view
                  className='player-lyrics__tool'
                  bindtap={() => { markLyricsScreenBeforeAdjust(); void navigate({ to: '/player/lyrics/adjust' }) }}
                >
                  <Icon name='tune' size={14} color={ICON_COLORS.contentMuted} />
                  <text className='player-lyrics__tool-text'>{t('lyricAdjust.title')}</text>
                </view>
              )
              : null}
          </view>
        )
        : null}
    {/*
      * `key` remounts the scroller when the song changes: `scroll-view` retains
      * its scroll position across content swaps, so without a remount the user
      * would see the previous song's tail scroll position for the split second
      * before `currentIndex` becomes valid and `scrollIntoView` re-centres.
      */}
    <scroll-view key={currentSong?.id ?? 'nosong'} className='player-lyrics' scroll-y bindscroll={handleScroll}>
      <view className='player-lyrics__inner'>
        {lyrics.map((line, index) => {
          const active = index === currentIndex
          const translation = translationMap.get(index)
          const romanization = romanizationMap.get(index)
          const hasWords = active && line.words && line.words.length > 0

          if (!line.text && !hasWords) {
            const cls = active
              ? 'player-lyrics__line player-lyrics__line--active player-lyrics__line--note'
              : 'player-lyrics__line player-lyrics__line--note'
            return (
              <view
                key={`${index}:${line.timeMs}`}
                ref={active ? activeLineRef : null}
                className={cls}
                bindtap={synced ? () => seekToLine(line) : undefined}
                accessibility-element={true}
                accessibility-label={t('player.lyricJumpLine')}
              >
                <Icon
                  name='music'
                  size={16}
                  color={active ? ICON_COLORS.content : ICON_COLORS.contentMuted}
                />
              </view>
            )
          }

          const hasExtra = translation || romanization || hasWords
          if (!hasExtra) {
            const cls = active
              ? 'player-lyrics__line player-lyrics__line--active'
              : 'player-lyrics__line'
            return (
              <view
                key={`${index}:${line.timeMs}`}
                ref={active ? activeLineRef : null}
                className={cls}
                bindtap={synced ? () => seekToLine(line) : undefined}
              >
                <text className={cls}>{line.text}</text>
              </view>
            )
          }

          return (
            <view
              key={`${index}:${line.timeMs}`}
              ref={active ? activeLineRef : null}
              className={active ? 'player-lyrics__line-group player-lyrics__line-group--active' : 'player-lyrics__line-group'}
              bindtap={synced ? () => seekToLine(line) : undefined}
            >
              {romanization
                ? <text className='player-lyrics__romanization'>{romanization}</text>
                : null}
              {hasWords
                ? <KaraokeLine line={line} />
                : (
                  <text
                    className={active
                      ? 'player-lyrics__line player-lyrics__line--active'
                      : 'player-lyrics__line'}
                  >
                    {line.text}
                  </text>
                )}
              {translation
                ? <text className='player-lyrics__translation'>{translation}</text>
                : null}
            </view>
          )
        })}
      </view>
    </scroll-view>
      {userScrolled && currentIndex >= 0
        ? (
          <view
            className='player-lyrics__back-to-current'
            bindtap={scrollToCurrent}
            accessibility-element={true}
            accessibility-label={t('common.backToCurrent')}
            data-testid='lyrics-back-to-current'
          >
            <Icon name='arrow-down' size={16} color={ICON_COLORS.content} />
          </view>
        )
        : null}
    </view>
  )
}
