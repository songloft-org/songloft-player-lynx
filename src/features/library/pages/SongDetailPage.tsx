import { useEffect, useState } from '@lynx-js/react'
import { useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { useNavigateToSongEdit } from '../../../shared/nav/navigate-to-song-detail.js'
import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import type { Song } from '../../../models/song.js'
import { formatBytes } from '../../home/domain/stats-format.js'
import { formatDuration } from '../data/format.js'
import { formatBitRate, formatSampleRate } from '../domain/song-tech-format.js'
import { getCacheInfo } from '../../player/data/song-cache.js'
import type { SongCacheStatus } from '../../player/data/song-cache.js'
import { getSongsApi } from '../api/index.js'
import './SongDetailPage.css'

/**
 * `/library/song/$songId` — read-only song detail.
 *
 * Editing is a separate page (`/library/song/$songId/edit`, the Flutter build's
 * `SongEditPage`) reached through this page's edit button — the form used to be
 * an inline render mode here, which made "close the edit form" strand the user
 * on the detail page even when the form had been opened straight from a song
 * menu. As a page, back can follow the recorded origin instead.
 */
export function SongDetailPage() {
  const { t } = useTranslation()
  const goToSongEdit = useNavigateToSongEdit()
  const params = useParams({ strict: false }) as { songId?: string }
  const id = Number(params.songId ?? 0) || 0

  const [song, setSong] = useState<Song | null>(null)
  const [loading, setLoading] = useState(true)
  // On-device cache status (only meaningful where the native cache exists).
  const songCacheCapable = getPlatformCapabilities().songCache
  const [cacheInfo, setCacheInfo] = useState<SongCacheStatus | null>(null)

  useEffect(() => {
    if (!id) return
    void getSongsApi().getSong(id)
      .then(s => setSong(s))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!id || !songCacheCapable) {
      setCacheInfo(null)
      return
    }
    let alive = true
    getCacheInfo(id)
      .then((info) => { if (alive) setCacheInfo(info) })
      .catch(() => { if (alive) setCacheInfo(null) })
    return () => { alive = false }
  }, [id, songCacheCapable])

  const cover = song?.coverUrl ? buildCoverUrl(song.coverUrl, song.updatedAt) : ''

  return (
    <view className='song-detail'>
      <view className='song-detail__topbar'>
        <view className='song-detail__back' bindtap={() => performRouteBack()}>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='song-detail__topbar-title'>{t('songDetail.title')}</text>
        {song
          ? (
            <view className='song-detail__edit-btn' bindtap={() => goToSongEdit(id)} data-testid='song-detail-edit'>
              <text className='song-detail__edit-btn-text'>{t('songDetail.edit')}</text>
            </view>
          )
          : null}
      </view>

      {loading
        ? <text className='song-detail__state'>{t('common.loading')}</text>
        : !song
          ? <text className='song-detail__state'>{t('songDetail.notFound')}</text>
          : (
            <scroll-view className='song-detail__content' scroll-y>
              <view className='song-detail__hero'>
                {cover
                  ? <image className='song-detail__cover' src={cover} />
                  : <view className='song-detail__cover song-detail__cover--empty'><Icon name='music' size={48} color={ICON_COLORS.contentMuted} /></view>}
              </view>

              <view className='song-detail__info'>
                <view className='song-detail__row'>
                  <text className='song-detail__row-label'>{t('songDetail.titleField')}</text>
                  <text className='song-detail__row-value'>{song.title}</text>
                </view>
                <view className='song-detail__row'>
                  <text className='song-detail__row-label'>{t('songDetail.artistField')}</text>
                  <text className='song-detail__row-value'>{song.artist || '—'}</text>
                </view>
                <view className='song-detail__row'>
                  <text className='song-detail__row-label'>{t('songDetail.albumField')}</text>
                  <text className='song-detail__row-value'>{song.album || '—'}</text>
                </view>
                <view className='song-detail__row'>
                  <text className='song-detail__row-label'>{t('songDetail.type')}</text>
                  <text className='song-detail__row-value'>{song.type}{song.isVideo ? ' ▶' : ''}</text>
                </view>
                {song.genre ? (
                  <view className='song-detail__row'>
                    <text className='song-detail__row-label'>{t('songDetail.genre')}</text>
                    <text className='song-detail__row-value'>{song.genre}</text>
                  </view>
                ) : null}
                {song.year ? (
                  <view className='song-detail__row'>
                    <text className='song-detail__row-label'>{t('songDetail.year')}</text>
                    <text className='song-detail__row-value'>{String(song.year)}</text>
                  </view>
                ) : null}
                {/*
                  Technical read-outs (duration / format / bit rate / sample rate /
                  file size). These are the fields the player's "song info" entry
                  exists to surface — the page doubles as that dialog, so they live
                  here rather than in a second, player-only overlay. Each row hides
                  when its value is unknown instead of showing an empty label.
                */}
                {song.duration > 0 ? (
                  <view className='song-detail__row'>
                    <text className='song-detail__row-label'>{t('songDetail.duration')}</text>
                    <text className='song-detail__row-value'>{formatDuration(song.duration)}</text>
                  </view>
                ) : null}
                {song.format ? (
                  <view className='song-detail__row'>
                    <text className='song-detail__row-label'>{t('songDetail.format')}</text>
                    <text className='song-detail__row-value'>{song.format.toUpperCase()}</text>
                  </view>
                ) : null}
                <view className='song-detail__row'>
                  <text className='song-detail__row-label'>{t('songDetail.bitRate')}</text>
                  <text className='song-detail__row-value'>{formatBitRate(song.bitRate) ?? '—'}</text>
                </view>
                <view className='song-detail__row'>
                  <text className='song-detail__row-label'>{t('songDetail.sampleRate')}</text>
                  <text className='song-detail__row-value'>{formatSampleRate(song.sampleRate) ?? '—'}</text>
                </view>
                {song.fileSize > 0 ? (
                  <view className='song-detail__row'>
                    <text className='song-detail__row-label'>{t('songDetail.fileSize')}</text>
                    <text className='song-detail__row-value'>{formatBytes(song.fileSize)}</text>
                  </view>
                ) : null}
                {/*
                  On-device cache status. Replaces the Flutter dialog's "playback
                  source" row: this page is not necessarily playing the song, so
                  "streaming vs not playing" is not knowable here — but whether a
                  local copy exists is. Hidden where the native cache module is
                  absent (Web).
                */}
                {songCacheCapable ? (
                  <view className='song-detail__row'>
                    <text className='song-detail__row-label'>{t('songDetail.localCache')}</text>
                    <text className='song-detail__row-value'>
                      {cacheInfo?.cached
                        ? `${t('songDetail.localCache')} · ${formatBytes(cacheInfo.sizeBytes ?? 0)}`
                        : t('songDetail.notCached')}
                    </text>
                  </view>
                ) : null}
                {songCacheCapable && cacheInfo?.cached ? (
                  <view className='song-detail__cache-note'>
                    <text className='song-detail__cache-note-text'>{t('songDetail.cacheQualityNote')}</text>
                  </view>
                ) : null}
                {song.type === 'local' ? (
                  <view className='song-detail__tags-section'>
                    <view className='song-detail__save-btn' bindtap={() => {
                      void getSongsApi().writeTags(song.id)
                        .then(() => toast.success(t('songDetail.tagsWritten')))
                        .catch(() => toast.error(t('songDetail.tagsFailed')))
                    }}>
                      <text className='song-detail__save-btn-text'>{t('songDetail.writeTags')}</text>
                    </view>
                  </view>
                ) : null}
              </view>
            </scroll-view>
          )}
    </view>
  )
}
