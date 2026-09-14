import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { getVideoModule } from '../../../native/video.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { openCurrentSongVideo } from '../data/video-open.js'
import './FullVideoPage.css'

/**
 * Fullscreen picture page: the host lends a SurfaceView *under* the Lynx view
 * (see MainActivity), and this page only paints controls above it. The route's
 * background is transparent on purpose — the decoded frame is the background.
 */
export function FullVideoPage() {
  const { t } = useTranslation()
  const [note, setNote] = useState('')

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

  return (
    <view className='full-video'>
      {note
        ? <view className='full-video__note'><text>{note}</text></view>
        : null}
      <view
        className='full-video__close'
        bindtap={close}
        data-testid='video-close'
        accessibility-element={true}
        accessibility-label={t('common.close')}
      >
        <Icon name='x' size={22} color={ICON_COLORS.content} />
      </view>
    </view>
  )
}