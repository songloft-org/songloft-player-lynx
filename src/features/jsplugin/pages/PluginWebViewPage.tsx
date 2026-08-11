import { useEffect, useRef, useState } from '@lynx-js/react'
import type { NodesRef } from '@lynx-js/types'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { appConfig } from '../../../core/config/app-config.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { usePlayerStore } from '../../player/store/index.js'
import { handlePluginHostCall, type PluginHostContext } from '../domain/plugin-host-dispatch.js'
import { getJSPluginApi } from '../api/index.js'
import type { Song } from '../../../models/song.js'
import './PluginWebViewPage.css'

function resolveTheme(): string {
  const root = typeof document !== 'undefined' ? document.documentElement : null
  if (root?.classList.contains('theme-light')) return 'light'
  return 'dark'
}

async function getAccessToken(): Promise<string> {
  try {
    const storage = getSongloftStorage()
    return (await storage.secure.get('access_token')) ?? ''
  } catch {
    return ''
  }
}

async function resolveSongs(ids: number[]): Promise<Song[]> {
  const api = getJSPluginApi()
  const results: Song[] = []
  for (const id of ids) {
    try {
      const res = await (api as unknown as { client: { get: Function } }).client
        .get(`/api/v1/songs/${id}`)
      if (res?.data) results.push(res.data as Song)
    } catch { /* skip */ }
  }
  return results
}

const hostContext: PluginHostContext = {
  platform: 'lynx',
  version: '1.0.0',
  resolveSongs,
}

export function PluginWebViewPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const params = useParams({ strict: false }) as { entryPath?: string }
  const entryPath = params.entryPath ?? ''

  const [src, setSrc] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const webviewRef = useRef<NodesRef>(null)

  useEffect(() => {
    void (async () => {
      try {
        const token = await getAccessToken()
        const theme = resolveTheme()
        const base = `${appConfig.baseUrl}${appConfig.basePath}`
        const url = `${base}/api/v1/jsplugin/${entryPath}/?embed&theme=${theme}&access_token=${token}`
        setSrc(url)
        setLoading(false)
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e))
        setLoading(false)
      }
    })()
  }, [entryPath])

  useEffect(() => {
    if (!src) return
    const unsub = usePlayerStore.subscribe((state, prev) => {
      const sig = `${state.currentIndex}|${state.isPlaying}|${state.currentSong?.id}|${state.playMode}|${state.playlist.length}`
      const prevSig = `${prev.currentIndex}|${prev.isPlaying}|${prev.currentSong?.id}|${prev.playMode}|${prev.playlist.length}`
      if (sig === prevSig) return
      const stateJson = JSON.stringify({
        queue: state.playlist.map((s) => ({ id: s.id, title: s.title, artist: s.artist })),
        current_index: state.currentIndex,
        current_song: state.currentSong ? { id: state.currentSong.id, title: state.currentSong.title } : null,
        is_playing: state.isPlaying,
        play_mode: state.playMode,
      })
      webviewRef.current?.invoke({
        method: 'eval',
        params: { func: `window.postMessage({type:'songloft-player-state',state:${stateJson}},'*')` },
      }).exec()
    })
    return unsub
  }, [src])

  const onMessage = (e: { detail?: { msg?: string } }) => {
    try {
      const raw = e.detail?.msg
      if (!raw) return
      const req = typeof raw === 'string' ? JSON.parse(raw) : raw
      void handlePluginHostCall(req, hostContext)
    } catch { /* ignore malformed messages */ }
  }

  const goBack = () => {
    navigate({ to: '/' })
  }

  if (loading) {
    return (
      <view className='plugin-webview'>
        <view className='plugin-webview__topbar'>
          <view className='plugin-webview__back' bindtap={goBack}>
            <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
          </view>
          <text className='plugin-webview__title'>{t('jsplugin.loading')}</text>
        </view>
        <view className='plugin-webview__state'>
          <text className='plugin-webview__state-text'>{t('common.loading')}</text>
        </view>
      </view>
    )
  }

  if (error) {
    return (
      <view className='plugin-webview'>
        <view className='plugin-webview__topbar'>
          <view className='plugin-webview__back' bindtap={goBack}>
            <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
          </view>
          <text className='plugin-webview__title'>{entryPath}</text>
        </view>
        <view className='plugin-webview__state'>
          <text className='plugin-webview__state-text plugin-webview__state-text--error'>{error}</text>
        </view>
      </view>
    )
  }

  return (
    <view className='plugin-webview'>
      <view className='plugin-webview__topbar'>
        <view className='plugin-webview__back' bindtap={goBack} data-testid='plugin-webview-back'>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='plugin-webview__title'>{entryPath}</text>
      </view>
      <webview
        ref={webviewRef}
        className='plugin-webview__frame'
        src={src}
        bindmessage={onMessage}
        data-testid='plugin-webview-frame'
      />
    </view>
  )
}
