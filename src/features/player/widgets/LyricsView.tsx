import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { useLyricStore } from '../store/index.js'

/**
 * Scrolling lyrics list with the current line highlighted (driven by
 * `lyricStore.currentIndex`, which the player store updates from playback
 * position). Loading / empty states mirror the Flutter `LyricsView`.
 */
export function LyricsView() {
  const { t } = useTranslation()
  const lyrics = useLyricStore((s) => s.lyrics)
  const currentIndex = useLyricStore((s) => s.currentIndex)
  const isLoading = useLyricStore((s) => s.isLoading)

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

  return (
    <scroll-view className='player-lyrics' scroll-y>
      <view className='player-lyrics__inner'>
        {lyrics.map((line, index) => {
          const active = index === currentIndex
          const cls = active
            ? 'player-lyrics__line player-lyrics__line--active'
            : 'player-lyrics__line'
          // Empty lyric lines (instrumental breaks) show a small note glyph.
          return line.text
            ? (
              <text key={`${index}:${line.timeMs}`} className={cls}>{line.text}</text>
            )
            : (
              <view key={`${index}:${line.timeMs}`} className={`${cls} player-lyrics__line--note`}>
                <Icon
                  name='music'
                  size={16}
                  color={active ? ICON_COLORS.content : ICON_COLORS.contentMuted}
                />
              </view>
            )
        })}
      </view>
    </scroll-view>
  )
}
