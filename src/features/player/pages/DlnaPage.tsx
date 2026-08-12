import { useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getDlnaModule, type DlnaDevice } from '../../../native/dlna.js'
import { usePlayerStore } from '../store/index.js'
import { buildSongUrl } from '../../../core/network/url-helper.js'
import './DlnaPage.css'

export function DlnaPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const song = usePlayerStore((s) => s.currentSong)

  const [devices, setDevices] = useState<DlnaDevice[]>([])
  const [scanning, setScanning] = useState(false)
  const [casting, setCasting] = useState<string | null>(null)

  const dlna = getDlnaModule()

  const startScan = () => {
    setScanning(true)
    void dlna.startDiscovery().then(() => {
      setTimeout(() => {
        void dlna.getDevices().then(setDevices).finally(() => setScanning(false))
      }, 3000)
    })
  }

  useEffect(() => {
    startScan()
    return () => { void dlna.stopDiscovery() }
  }, [])

  const onCast = (device: DlnaDevice) => {
    if (!song || !song.url) return
    setCasting(device.id)
    const url = buildSongUrl(song.url ?? '')
    void dlna.cast(device.id, url, song.title)
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
        {scanning
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
          </view>
        )
        : null}
    </view>
  )
}
