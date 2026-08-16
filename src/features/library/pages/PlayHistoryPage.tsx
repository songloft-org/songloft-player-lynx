import { useCallback, useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { PlayHistoryEntry } from '../../../models/song.js'
import type { Song } from '../../../models/song.js'
import { getSongsApi } from '../api/index.js'
import { usePlayerStore } from '../../player/store/index.js'
import { SongRow } from '../widgets/SongRow.js'
import { Icon } from '../../../shared/ui/Icon.js'
import './PlayHistoryPage.css'

export function PlayHistoryPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [entries, setEntries] = useState<PlayHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getSongsApi()
      .getPlayHistory(50)
      .then((res) => {
        if (!cancelled) {
          setEntries(res?.items ?? [])
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unknown error')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  const playSong = useCallback((song: Song, index: number) => {
    const songs = entries.map((e) => e.song).filter(Boolean)
    usePlayerStore.getState().playPlaylist(songs, index)
    void navigate({ to: '/player' })
  }, [entries, navigate])

  const formatTime = (iso: string): string => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffDays === 0) return t('history.today')
    if (diffDays === 1) return t('history.yesterday')
    if (diffDays < 7) return t('history.daysAgo', { count: diffDays })
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  return (
    <view className='play-history'>
      <view className='play-history__topbar'>
        <view className='play-history__back' bindtap={() => void navigate({ to: '/' })}>
          <Icon name='chevron-down' size={20} />
        </view>
        <text className='play-history__title'>{t('settings.playHistory')}</text>
      </view>

      <scroll-view className='play-history__scroll' scroll-y>
        {loading ? (
          <view className='play-history__status'>
            <text className='play-history__status-text'>{t('common.loading')}</text>
          </view>
        ) : error ? (
          <view className='play-history__status'>
            <text className='play-history__status-text'>{error}</text>
          </view>
        ) : entries.length === 0 ? (
          <view className='play-history__status'>
            <text className='play-history__status-text'>{t('history.empty')}</text>
          </view>
        ) : (
          <view className='play-history__list'>
            {entries.filter((e) => e?.song != null).map((entry, idx) => (
              <view key={`${entry.song.id}-${idx}`} className='play-history__entry'>
                <SongRow song={entry.song} index={idx} onTap={playSong} />
                <view className='play-history__entry-meta'>
                  <text className='play-history__entry-time'>{formatTime(entry.playedAt ?? '')}</text>
                  <text className='play-history__entry-count'>×{entry.playCount ?? 0}</text>
                </view>
              </view>
            ))}
          </view>
        )}
      </scroll-view>
    </view>
  )
}
