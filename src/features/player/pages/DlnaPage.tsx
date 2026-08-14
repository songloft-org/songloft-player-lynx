import { useCallback, useEffect, useRef, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getDlnaModule, type DlnaDevice } from '../../../native/dlna.js'
import { safeClearTimeout } from '../../../native/safe-timers.js'
import { usePlayerStore } from '../store/index.js'
import { buildSongUrl } from '../../../core/network/url-helper.js'
import './DlnaPage.css'

/** SSDP replies trickle in; give them this long before reading the device list. */
const DISCOVERY_SETTLE_MS = 3000

export function DlnaPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const song = usePlayerStore((s) => s.currentSong)

  const [devices, setDevices] = useState<DlnaDevice[]>([])
  const [scanning, setScanning] = useState(false)
  const [casting, setCasting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const dlna = getDlnaModule()
  /** Pending "collect results" timer, so unmounting mid-scan cannot setState. */
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startScan = useCallback(() => {
    if (!dlna.available) return
    setError(null)
    setScanning(true)
    // Every call here can reject now that the native adapter surfaces `{error}`
    // payloads instead of pretending to be a Promise. Unhandled, a rejection here
    // is what crashed this page on mount for every Android user.
    void dlna
      .startDiscovery()
      .then(() => {
        settleTimer.current = setTimeout(() => {
          settleTimer.current = null
          void dlna
            .getDevices()
            .then(setDevices)
            .catch((e: unknown) => setError(String(e instanceof Error ? e.message : e)))
            .then(() => setScanning(false))
        }, DISCOVERY_SETTLE_MS)
      })
      .catch((e: unknown) => {
        setScanning(false)
        setError(String(e instanceof Error ? e.message : e))
      })
  }, [dlna])

  useEffect(() => {
    startScan()
    return () => {
      settleTimer.current = safeClearTimeout(settleTimer.current as unknown as number)
      if (dlna.available) void dlna.stopDiscovery().catch(() => {})
    }
  }, [startScan, dlna])

  const onCast = (device: DlnaDevice) => {
    if (!song || !song.url) return
    setError(null)
    setCasting(device.id)
    const url = buildSongUrl(song.url ?? '')
    void dlna.cast(device.id, url, song.title).then(() => {
      // Pause local playback so we don't get dual audio.
      void usePlayerStore.getState().togglePlay()
    }).catch((e: unknown) => {
      setCasting(null)
      setError(String(e instanceof Error ? e.message : e))
    })
  }

  const onDisconnect = () => {
    if (casting) {
      void dlna.control('stop', { deviceId: casting }).catch(() => {})
      setCasting(null)
    }
  }

  return (
    <view className='dlna-page'>
      <view className='dlna-page__topbar'>
        <view className='dlna-page__back' bindtap={() => navigate({ to: '/player' })}>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='dlna-page__title'>{t('dlna.title')}</text>
        <view className='dlna-page__refresh' bindtap={startScan}>
          <Icon name='refresh' size={18} color={ICON_COLORS.content} />
        </view>
      </view>

      <scroll-view className='dlna-page__list' scroll-y>
        {!dlna.available
          ? <text className='dlna-page__state'>{t('dlna.unavailable')}</text>
          : error
          ? <text className='dlna-page__state'>{t('dlna.failed', { error })}</text>
          : scanning
          ? <text className='dlna-page__state'>{t('dlna.scanning')}</text>
          : devices.length === 0
            ? <text className='dlna-page__state'>{t('dlna.noDevices')}</text>
            : devices.map(d => (
              <view key={d.id} className='dlna-page__device' bindtap={() => onCast(d)}>
                <Icon name='volume' size={20} color={ICON_COLORS.content2} />
                <text className='dlna-page__device-name'>{d.name}</text>
                {casting === d.id
                  ? <Icon name='check' size={16} color={ICON_COLORS.primary} />
                  : null}
              </view>
            ))}
      </scroll-view>

      {song
        ? (
          <view className='dlna-page__now'>
            <text className='dlna-page__now-label'>{t('dlna.casting')}</text>
            <text className='dlna-page__now-song'>{song.title}</text>
            {casting
              ? (
                <view className='dlna-page__disconnect' bindtap={onDisconnect}>
                  <text className='dlna-page__disconnect-text'>{t('dlna.disconnect')}</text>
                </view>
              )
              : null}
          </view>
        )
        : null}
    </view>
  )
}
