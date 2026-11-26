import { useCallback, useEffect, useRef, useState } from '@lynx-js/react'
import type { NodesRef, TouchEvent, WheelEvent } from '@lynx-js/types'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { KaraokeLine } from './KaraokeLine.js'
import { useLyricStore } from '../store/index.js'
import { usePlayerStore } from '../store/index.js'
import { cachedSongIdentity } from '../domain/offline-cache.js'
import './LyricsView.css'

interface VerticalBounds {
  top: number
  height: number
}

function readVerticalBounds(node: NodesRef): Promise<VerticalBounds | undefined> {
  return new Promise(resolve => {
    try {
      node.invoke({
        method: 'boundingClientRect',
        success: (result: VerticalBounds) => resolve(result),
        fail: () => resolve(undefined),
      }).exec()
    } catch {
      resolve(undefined)
    }
  })
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

  const activeLineRef = useRef<NodesRef>(null)
  const viewportRef = useRef<NodesRef>(null)
  const [userScrolled, setUserScrolled] = useState(false)
  const following = useRef(true)
  const checkingBounds = useRef(false)
  const followRevision = useRef(0)
  const touchStart = useRef<{ x: number; y: number } | undefined>(undefined)
  const songId = currentSong?.id

  const scrollToCurrent = useCallback(() => {
    followRevision.current++
    following.current = true
    setUserScrolled(false)
    if (currentIndex < 0 || !activeLineRef.current) return
    try {
      activeLineRef.current.invoke({
        method: 'scrollIntoView',
        params: { scrollIntoViewOptions: { block: 'center', behavior: 'none' } },
      }).exec()
    } catch (_) { /* no-op in test env */ }
  }, [currentIndex])

  useEffect(() => {
    following.current = true
    touchStart.current = undefined
    setUserScrolled(false)
  }, [songId])

  useEffect(() => {
    if (following.current) scrollToCurrent()
  }, [songId, scrollToCurrent])

  // Gesture events distinguish a user scroll from the scrollIntoView animation.
  const pauseFollowing = () => {
    if (!following.current) return
    following.current = false
    setUserScrolled(true)
  }
  const onTouchStart = (event: TouchEvent) => {
    touchStart.current = event.detail
  }
  const onTouchMove = (event: TouchEvent) => {
    const start = touchStart.current
    if (!start || !following.current) return
    const dx = Math.abs(event.detail.x - start.x)
    const dy = Math.abs(event.detail.y - start.y)
    if (dy >= 8 && dy > dx) pauseFollowing()
  }
  const onWheel = (event: WheelEvent) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) pauseFollowing()
  }
  const onScroll = () => {
    const viewport = viewportRef.current
    const active = activeLineRef.current
    if (!following.current || checkingBounds.current || !viewport || !active) return
    checkingBounds.current = true
    const revision = followRevision.current
    // Web can scroll without delivering a wheel gesture to Lynx. Measure after
    // the scroll so an automatic jump and a user's scroll away are distinguishable.
    void Promise.all([readVerticalBounds(viewport), readVerticalBounds(active)]).then(([box, row]) => {
      checkingBounds.current = false
      if (revision !== followRevision.current || activeLineRef.current !== active || !box || !row || box.height <= 0) return
      if (row.top + row.height <= box.top || row.top >= box.top + box.height) pauseFollowing()
    })
  }

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
    <scroll-view key={currentSong?.id ?? 'nosong'} className='player-lyrics'
      ref={viewportRef}
      scroll-y
      bindscroll={onScroll}
      bindtouchstart={onTouchStart}
      bindtouchmove={onTouchMove}
      bindwheel={onWheel}>
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
