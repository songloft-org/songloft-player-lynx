import { useEffect, useRef, useState } from '@lynx-js/react'
import type { NodesRef } from '@lynx-js/types'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { appConfig } from '../../../core/config/app-config.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getAppTheme, resolveTheme } from '../../../shared/theme/theme-model.js'
import { usePlayerStore } from '../../player/store/index.js'
import { handlePluginHostCall, type PluginHostContext } from '../domain/plugin-host-dispatch.js'
import { getJSPluginApi } from '../api/index.js'
import { usePluginsQuery } from '../data/jsplugin-query.js'
import { isWebPlatform } from '../../../native/web-platform.js'
import type { Song } from '../../../models/song.js'
import './PluginWebViewPage.css'

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

  // The route only carries `entryPath`, which is a *routing prefix* ("myplugin") —
  // showing it as the title was a porting slip (the Flutter page titled itself with
  // the plugin's display name). `displayName` rather than the raw `name`: the
  // backend may omit `name`, and `displayName` is the null-safe wrapper this repo
  // uses as the user-visible label everywhere else (grid, manager, tab config).
  // Falls back to `entryPath` so the title never flashes empty while the list loads.
  const { data: pluginList } = usePluginsQuery()
  const title = pluginList?.plugins.find((p) => p.entryPath === entryPath)?.displayName || entryPath

  const [src, setSrc] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const webviewRef = useRef<NodesRef>(null)

  useEffect(() => {
    void (async () => {
      try {
        const token = await getAccessToken()
        // Read the app's own theme state. This used to sniff `document.documentElement`
        // for `theme-light`, and Lynx has no DOM — the guard kept it from crashing but
        // pinned every plugin to `theme=dark`, even with light mode selected.
        const theme = resolveTheme(getAppTheme())
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

  // Platform, not realm — on Web this component renders in a worker with no
  // `window`/`document`, so `isWebEnvironment()` would answer `false` here and
  // the fallback below would be skipped in favour of a `<webview>` that Web has
  // no implementation for (blank area). See `isWebPlatform`.
  const isWeb = isWebPlatform()

  if (loading) {
    return (
      <view className='plugin-webview'>
        <view className='plugin-webview__topbar'>
          <view className='plugin-webview__back' bindtap={goBack}>
            <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
          </view>
          <text className='plugin-webview__title' data-testid='plugin-webview-title'>
            {title || t('jsplugin.loading')}
          </text>
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
          <text className='plugin-webview__title' data-testid='plugin-webview-title'>{title}</text>
        </view>
        <view className='plugin-webview__state'>
          <text className='plugin-webview__state-text plugin-webview__state-text--error'>{error}</text>
        </view>
      </view>
    )
  }

  // Web platform: webview is not available, show a fallback
  if (isWeb) {
    return (
      <view className='plugin-webview'>
        <view className='plugin-webview__topbar'>
          <view className='plugin-webview__back' bindtap={goBack} data-testid='plugin-webview-back'>
            <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
          </view>
          <text className='plugin-webview__title' data-testid='plugin-webview-title'>{title}</text>
        </view>
        <view className='plugin-webview__state'>
          <text className='plugin-webview__state-text'>{t('jsplugin.webview_unavailable')}</text>
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
        <text className='plugin-webview__title' data-testid='plugin-webview-title'>{title}</text>
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
