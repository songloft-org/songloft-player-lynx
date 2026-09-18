import { useCallback, useEffect, useRef, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import {
  getVideoModule,
  subscribeOrientation,
  subscribeVideoClosed,
  subscribeVideoSize,
  type OrientationPayload,
  type ScaleMode,
  type SurfaceRect,
  type VideoSize,
} from '../../../native/video.js'
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

const AUTO_HIDE_MS = 4_000

/**
 * Compute the letterbox / zoom rectangle for a video of `size` painted inside a
 * `container`. `fit` picks the smaller scale so the whole picture stays visible
 * (black bars on the short axis); `zoom` picks the larger scale and centres the
 * overflow off-screen. Both preserve aspect ratio — the deliberately absent third
 * option is unconditional stretch, which is exactly the bug this feature fixes.
 */
export function computeSurfaceRect(
  size: VideoSize,
  container: { width: number; height: number },
  mode: ScaleMode,
): SurfaceRect {
  if (size.width <= 0 || size.height <= 0 || container.width <= 0 || container.height <= 0) {
    return { x: 0, y: 0, width: container.width, height: container.height }
  }
  const sx = container.width / size.width
  const sy = container.height / size.height
  const scale = mode === 'fit' ? Math.min(sx, sy) : Math.max(sx, sy)
  const w = size.width * scale
  const h = size.height * scale
  return {
    x: (container.width - w) / 2,
    y: (container.height - h) / 2,
    width: w,
    height: h,
  }
}

/**
 * Fullscreen picture page. The host lends a native video view *under* the Lynx
 * page (`SurfaceView` on Android, `AVPlayerLayer` on iOS, `XComponent` on
 * Harmony); this page paints the whole control layer over it, so styling stays
 * identical on every platform.
 *
 * Layout (top-left back, tap-empty toggles the chrome):
 *   ┌ back              ▸ title / subtitle          · ┐   <- header
 *   │                                                 │
 *   │            ▶ / ⏸ / ⟳  (fades with chrome)       │   <- centre affordance
 *   │                                                 │
 *   │  00:00 ────────────────────────────────  03:14  │   <- seek row
 *   └  ⟳ rotate       ⛶ fit / zoom              ⋯    ┘   <- tools row
 */
export function FullVideoPage() {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [previewRatio, setPreviewRatio] = useState<number | null>(null)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [container, setContainer] = useState<{ width: number; height: number } | null>(null)
  const [videoSize, setVideoSize] = useState<VideoSize | null>(null)
  const [orientationLocked, setOrientationLocked] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const song = usePlayerStore((s) => s.currentSong)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isBuffering = usePlayerStore((s) => s.isBuffering)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const progress = usePlayerStore(progressOf)
  const scaleMode = usePlayerStore((s) => s.videoScaleMode)

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const scheduleHide = useCallback(() => {
    clearHideTimer()
    // Auto-hide only while playing — a paused / buffering user is deliberately
    // looking at the controls, and yanking them away in that state is why so
    // many players feel hostile.
    if (!isPlaying || isBuffering) return
    hideTimerRef.current = setTimeout(() => setChromeVisible(false), AUTO_HIDE_MS)
  }, [clearHideTimer, isPlaying, isBuffering])

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
    // Prime video size — if the picture is already decoded we skip the wait
    // for the event and lay out on the first frame instead.
    void getVideoModule().getVideoSize().then((size) => {
      if (!cancelled && size) setVideoSize(size)
    })
    const offSize = subscribeVideoSize((size) => setVideoSize(size))
    const offOrientation = subscribeVideoClosed(() => {
      performRouteBack()
    })
    const offOrient = subscribeOrientation((_: OrientationPayload) => {
      // Container will be re-measured by the layoutchange event; nothing to do
      // here beyond letting the effect re-run when the page reflows.
    })
    return () => {
      cancelled = true
      offSize()
      offOrientation()
      offOrient()
      clearHideTimer()
      void getVideoModule().setOrientation('auto').catch(() => null)
      void getVideoModule().close().catch(() => null)
    }
  }, [t, clearHideTimer])

  // Push surface layout whenever the inputs change. This is the *only* thing
  // stopping a landscape frame from being stretched onto a portrait surface
  // — the host applies the rect verbatim.
  useEffect(() => {
    if (!container || !videoSize) return
    const rect = computeSurfaceRect(videoSize, container, scaleMode)
    void getVideoModule().setSurfaceLayout(rect).catch(() => null)
  }, [container, videoSize, scaleMode])

  // Restart the auto-hide timer whenever state changes something the timer
  // depends on. A paused → playing transition arms it; a playing → paused
  // transition disarms it and reveals the chrome.
  useEffect(() => {
    if (isPlaying && !isBuffering) {
      scheduleHide()
    } else {
      clearHideTimer()
      setChromeVisible(true)
    }
    return clearHideTimer
  }, [isPlaying, isBuffering, scheduleHide, clearHideTimer])

  const onSurfaceLayoutChange = useCallback((event: unknown) => {
    const detail = (event as { detail?: { width?: number; height?: number } } | undefined)?.detail
    if (!detail) return
    const w = typeof detail.width === 'number' ? detail.width : 0
    const h = typeof detail.height === 'number' ? detail.height : 0
    if (w <= 0 || h <= 0) return
    setContainer((prev) => {
      if (prev && prev.width === w && prev.height === h) return prev
      return { width: w, height: h }
    })
  }, [])

  const showChrome = useCallback(() => {
    setChromeVisible(true)
    scheduleHide()
  }, [scheduleHide])

  const toggleChrome = useCallback(() => {
    if (chromeVisible) {
      clearHideTimer()
      setChromeVisible(false)
    } else {
      showChrome()
    }
  }, [chromeVisible, showChrome, clearHideTimer])

  const back = (): void => {
    void getVideoModule().setOrientation('auto').catch(() => null)
    void getVideoModule().close().catch(() => null)
    performRouteBack()
  }

  const togglePlayback = (): void => {
    showChrome()
    // 缓冲态点击是无意义的（状态由播放器被动决定），与 YouTube/B 站等一致
    // 屏蔽这次点击，避免用户以为按了没反应。
    if (isBuffering) return
    void usePlayerStore.getState().togglePlay()
  }

  const seekTo = (ratio: number): void => {
    if (duration <= 0) return
    showChrome()
    void usePlayerStore.getState().seek(Math.round(ratio * duration))
  }

  const toggleScale = (): void => {
    showChrome()
    const next: ScaleMode = scaleMode === 'fit' ? 'zoom' : 'fit'
    usePlayerStore.getState().setVideoScaleMode(next)
  }

  const rotate = (): void => {
    showChrome()
    // Toggle a landscape lock. `'auto'` releases it back to whatever the OS
    // wants — that is the second tap on the same button, so a user who
    // stumbles into landscape can get back out of it.
    const next: 'portrait' | 'landscape' | 'auto' = orientationLocked ? 'auto' : 'landscape'
    setOrientationLocked(!orientationLocked)
    void getVideoModule().setOrientation(next).catch(() => null)
  }

  const shownMs = previewRatio !== null ? previewRatio * duration : currentTime
  const centreIcon = isBuffering ? 'loader' : isPlaying ? 'pause' : 'play'
  const centreLabel = isBuffering
    ? t('common.loading')
    : isPlaying
      ? t('common.pause')
      : t('common.play')

  return (
    <view
      className='full-video'
      // `position: fixed` is dead when only declared in the class (the class
      // box collapses to 0×0); it must arrive inline — see ConfirmDialog.tsx.
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
      bindtap={toggleChrome}
      bindlayoutchange={onSurfaceLayoutChange}
      data-testid='video-root'
    >
      {note
        ? (
          <view className='full-video__note'>
            <text className='full-video__note-text'>{note}</text>
          </view>
        )
        : null}

      <view
        className={`full-video__chrome ${chromeVisible ? '' : 'full-video__chrome--hidden'}`}
      >
        <view
          className='full-video__centre'
          catchtap={togglePlayback}
          data-testid='video-centre-toggle'
          accessibility-element={true}
          accessibility-label={centreLabel}
        >
          <Icon name={centreIcon} size={40} color='#ffffff' />
        </view>
        <view className='full-video__header'>
          <view
            className='full-video__icon-btn'
            catchtap={back}
            data-testid='video-back'
            accessibility-element={true}
            accessibility-label={t('player.videoBack')}
          >
            <Icon name='chevron-left' size={24} color='#ffffff' />
          </view>
          <view className='full-video__title-block'>
            {song ? <text className='full-video__title'>{song.title}</text> : null}
            {song?.artist ? <text className='full-video__subtitle'>{song.artist}</text> : null}
          </view>
          {/* Right slot reserved (cast/more later); keep the header
              symmetric so the title stays centred. */}
          <view className='full-video__icon-btn full-video__icon-btn--ghost' />
        </view>

        <view className='full-video__bottom'>
          <view className='full-video__times'>
            <text className='full-video__time'>{formatPosition(shownMs)}</text>
            <text className='full-video__time'>{formatPosition(duration)}</text>
          </view>
          <SeekBar
            value={progress}
            onSeek={seekTo}
            onPreview={(r) => {
              setPreviewRatio(r)
              showChrome()
            }}
            testId='video-seek'
          />

          <view className='full-video__tools'>
            <view
              className='full-video__tool'
              catchtap={rotate}
              data-testid='video-rotate'
              accessibility-element={true}
              accessibility-label={t('player.videoRotate')}
            >
              <Icon name='rotate' size={22} color='#ffffff' />
            </view>
            <view
              className='full-video__tool'
              catchtap={toggleScale}
              data-testid='video-scale'
              accessibility-element={true}
              accessibility-label={scaleMode === 'fit' ? t('player.videoScaleZoom') : t('player.videoScaleFit')}
            >
              <Icon name={scaleMode === 'fit' ? 'maximize' : 'minimize'} size={22} color='#ffffff' />
            </view>
            <view className='full-video__tool full-video__tool--ghost' />
          </view>
        </view>
      </view>
    </view>
  )
}
