import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { getVideoModule } from '../../../native/video.js'
import { Icon } from '../../../shared/ui/Icon.js'
import { setFullVideoActive } from '../../../shared/theme/video-surface-model.js'
import { progressOf, usePlayerStore } from '../store/index.js'
import { openCurrentSongVideo } from '../data/video-open.js'
import { SeekBar } from '../widgets/SeekBar.js'
import './FullVideoPage.css'

function formatPosition(positionMs: number): string {
  const total = Math.max(0, Math.floor(positionMs / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Fullscreen picture page: the host lends a SurfaceView *under* the Lynx view
 * (see MainActivity), and this page paints the whole control layer above it —
 * close, play/pause and a seek bar — so the styling stays identical on every
 * platform. The route's background is transparent by contract.
 */
export function FullVideoPage() {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [previewRatio, setPreviewRatio] = useState<number | null>(null)

  const song = usePlayerStore((s) => s.currentSong)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const progress = usePlayerStore(progressOf)

  useEffect(() => {
    setFullVideoActive(true)
    return () => setFullVideoActive(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void openCurrentSongVideo().then((outcome) => {
      if (cancelled) return
      if (outcome === 'noTrack') setNote(t('player.videoNoTrack'))
      else if (outcome === 'transcodeFailed') setNote(t('player.videoTranscodeFailed'))
    })
    return () => {
      cancelled = true
      void getVideoModule().close().catch(() => null)
    }
  }, [t])

  const close = (): void => {
    void getVideoModule().close().catch(() => null)
    performRouteBack()
  }

  const togglePlayback = (): void => {
    void usePlayerStore.getState().togglePlay()
  }

  const seekTo = (ratio: number): void => {
    if (duration <= 0) return
    void usePlayerStore.getState().seek(Math.round(ratio * duration))
  }

  const shownMs = previewRatio !== null ? previewRatio * duration : currentTime

  return (
    <view
      className='full-video'
      // `position: fixed` is dead when only declared in the class (the class box
      // collapses to 0×0); it must arrive inline — see ConfirmDialog.tsx.
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {note
        ? <view className='full-video__note'><text>{note}</text></view>
        : null}

      <view className='full-video__header'>
        {song ? <text className='full-video__title'>{song.title}</text> : <view />}
        <view
          className='full-video__close'
          bindtap={close}
          data-testid='video-close'
          accessibility-element={true}
          accessibility-label={t('common.close')}
        >
          <Icon name='x' size={24} color='#ffffff' />
        </view>
      </view>

      <view className='full-video__controls'>
        <view className='full-video__times'>
          <text className='full-video__time'>{formatPosition(shownMs)}</text>
          <text className='full-video__time'>{formatPosition(duration)}</text>
        </view>
        <SeekBar
          value={progress}
          onSeek={seekTo}
          onPreview={setPreviewRatio}
          testId='video-seek'
        />
        <view
          className='full-video__play'
          bindtap={togglePlayback}
          data-testid='video-toggle'
          accessibility-element={true}
          accessibility-label={isPlaying ? t('common.pause') : t('common.play')}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={28} color='#ffffff' />
        </view>
      </view>
    </view>
  )
}