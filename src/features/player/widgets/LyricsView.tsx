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

export function LyricsView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const lyrics = useLyricStore((s) => s.lyrics)
  const currentIndex = useLyricStore((s) => s.currentIndex)
  const isLoading = useLyricStore((s) => s.isLoading)
  const translationMap = useLyricStore((s) => s.translationMap)
  const romanizationMap = useLyricStore((s) => s.romanizationMap)
  const currentTime = usePlayerStore((s) => s.currentTime)

  if (isLoading) {
    return (
      <view className='player-lyrics player-lyrics--state'>
        <text className='player-lyrics__state-text'>{t('player.loadingLyrics')}</text>
      </view>
    )
  }

  if (lyrics.length === 0) {
    return (
      <view className='player-lyrics player-lyrics--state'>
        <text className='player-lyrics__state-text'>{t('player.noLyrics')}</text>
      </view>
    )
  }

  const scrollTarget = currentIndex >= 0 ? `lyric-line-${currentIndex}` : undefined

  return (
    <view className='player-lyrics__container'>
      <view className='player-lyrics__edit-bar' bindtap={() => void navigate({ to: '/player/lyrics/edit' })}>
        <Icon name='settings' size={14} color={ICON_COLORS.contentMuted} />
        <text className='player-lyrics__edit-text'>{t('lyricEdit.title')}</text>
      </view>
    <scroll-view className='player-lyrics' scroll-y scroll-into-view={scrollTarget} scroll-with-animation>
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
              <view key={`${index}:${line.timeMs}`} id={`lyric-line-${index}`} className={cls}>
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
              <view key={`${index}:${line.timeMs}`} id={`lyric-line-${index}`} className={cls}>
                <text className={cls}>{line.text}</text>
              </view>
            )
          }

          return (
            <view key={`${index}:${line.timeMs}`} id={`lyric-line-${index}`} className='player-lyrics__line-group'>
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
