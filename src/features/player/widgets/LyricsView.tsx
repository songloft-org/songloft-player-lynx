import { useCallback, useEffect, useRef, useState } from '@lynx-js/react'
import type { NodesRef, ScrollEvent } from '@lynx-js/types'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { findCurrentWord, type LyricLine } from '../domain/lyric-parser.js'
import { useLyricStore } from '../store/index.js'
import { usePlayerStore } from '../store/index.js'
import './LyricsView.css'

function WordHighlightLine({
  line,
  positionMs,
}: {
  line: LyricLine
  positionMs: number
}) {
  const words = line.words!
  const currentWordIdx = findCurrentWord(words, positionMs)
  return (
    <view className='player-lyrics__words-row'>
      {words.map((word, wi) => {
        let cls = 'player-lyrics__word'
        if (wi === currentWordIdx) {
          cls = 'player-lyrics__word player-lyrics__word--active'
        } else if (wi < currentWordIdx) {
          cls = 'player-lyrics__word player-lyrics__word--past'
        }
        return (
          <text key={`w-${wi}`} className={cls}>{word.text}</text>
        )
      })}
    </view>
  )
}

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
  const currentTime = usePlayerStore((s) => s.currentTime)

  // Local songs always allow a re-fetch (the endpoint can be assembled from the
  // id); remote/radio songs need an explicit lyric URL. Same gate as the
  // Flutter `_canRefetch`.
  const canRefetch =
    currentSong != null && (currentSong.type === 'local' || !!currentSong.lyricUrl)

  // Timing adjustment only makes sense for time-stamped lyrics of a local song
  // (the save writes `lyric_source: 'manual'`). Same gate as the Flutter
  // `_shouldShowEditButton`.
  const canAdjust =
    currentSong?.type === 'local' &&
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

  useEffect(() => {
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
    // The auto-scroll is about to land; reset the drift anchor so the next
    // scroll callback measures from the new position. A small delay would be
    // more precise, but smooth scroll finishes within `--duration-normal` and
    // the next scroll event will just re-anchor.
    setUserScrolled(false)
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
    if (drift > DRIFT_PX && !userScrolled) setUserScrolled(true)
    else if (drift <= DRIFT_PX && userScrolled) setUserScrolled(false)
  }, [userScrolled])

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
    setUserScrolled(false)
  }, [currentIndex])

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
                  bindtap={() => void navigate({ to: '/player/lyrics/adjust' })}
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
              <view key={`${index}:${line.timeMs}`} ref={active ? activeLineRef : null} className={cls}>
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
              <view key={`${index}:${line.timeMs}`} ref={active ? activeLineRef : null} className={cls}>
                <text className={cls}>{line.text}</text>
              </view>
            )
          }

          return (
            <view key={`${index}:${line.timeMs}`} ref={active ? activeLineRef : null} className='player-lyrics__line-group'>
              {romanization
                ? <text className='player-lyrics__romanization'>{romanization}</text>
                : null}
              {hasWords
                ? <WordHighlightLine line={line} positionMs={currentTime} />
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
