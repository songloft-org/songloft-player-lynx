import { useEffect, useRef } from '@lynx-js/react'
import type { NodesRef } from '@lynx-js/types'
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

  const activeLineRef = useRef<NodesRef>(null)

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
  }, [currentIndex])

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
    <scroll-view className='player-lyrics' scroll-y>
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
    </view>
  )
}
