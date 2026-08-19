import { useEffect, useRef, useState } from '@lynx-js/react'
import type { NodesRef } from '@lynx-js/types'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { appConfig } from '../../../core/config/app-config.js'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
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

  /*
   * Internal-history tracking for the plugin page.
   *
   * A plugin can navigate inside its own page (client-side routing), and the system
   * back key should walk that history before leaving the plugin. Lynx's `<webview>`
   * exposes no `canGoBack`/`goBack`, so we approximate it: `bindlocationchange` tells
   * us the page navigated, and we drive `history.back()` through `eval`.
   *
   * Two subtleties shape the design:
   *  - `locationchange` fires for forward navigation AND as the echo of our own
   *    `history.back()`. {@link selfBackPending} distinguishes them: when we trigger a
   *    back we set the flag, and the next `locationchange` is consumed as the echo
   *    rather than counted as a new level.
   *  - The handler only activates while {@link webDepth} > 0. On a host where
   *    `locationchange` never fires (the type marks it `@PC`-only, so Android is
   *    unverified), `webDepth` stays 0 and the back key falls straight through to the
   *    route level — the pre-existing behaviour. The feature degrades to a no-op rather
   *    than misbehaving.
   */
  const webDepthRef = useRef(0)
  const [webDepth, setWebDepth] = useState(0)
  const selfBackPendingRef = useRef(false)
  const backConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setDepth = (n: number) => {
    webDepthRef.current = n
    setWebDepth(n)
  }

  /** A (re)load resets the page to its entry point, so there is no internal history. */
  const onWebViewLoad = () => {
    setDepth(0)
    selfBackPendingRef.current = false
  }

  const onLocationChange = () => {
    // A confirmed navigation cancels the "did our back() do anything?" watchdog.
    if (backConfirmTimerRef.current) {
      clearTimeout(backConfirmTimerRef.current)
      backConfirmTimerRef.current = null
    }
    if (selfBackPendingRef.current) {
      // Echo of the history.back() we just triggered — already accounted for.
      selfBackPendingRef.current = false
      return
    }
    // The plugin navigated deeper on its own.
    setDepth(webDepthRef.current + 1)
  }

  useEffect(() => () => {
    if (backConfirmTimerRef.current) clearTimeout(backConfirmTimerRef.current)
  }, [])

  /*
   * Back walks the plugin's internal history first, then leaves the page.
   *
   * After triggering `history.back()` we arm a short watchdog: if no `locationchange`
   * confirms it, the webview had no history to give. When that exhausts our count we
   * route-back rather than dead-ending the key. (We only force the route-back once the
   * count reaches zero — with levels still counted, a slow event should not yank the
   * user out of the plugin.)
   */
  useBackHandler(webDepth > 0, () => {
    const next = webDepthRef.current - 1
    setDepth(next)
    selfBackPendingRef.current = true
    webviewRef.current?.invoke({
      method: 'eval',
      params: { func: 'history.back()' },
    }).exec()
    backConfirmTimerRef.current = setTimeout(() => {
      backConfirmTimerRef.current = null
      selfBackPendingRef.current = false
      if (next <= 0) performRouteBack()
    }, 400)
    return true
  })

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

  /**
   * Used to be hardcoded to `/`, so leaving a plugin always dumped you on Home even
   * when you arrived from the library. `route-back.ts` returns to the tab the shell
   * recorded instead, and answers "exit prompt" when this plugin *is* a tab — which
   * is also what the hardware back key needs.
   */
  const goBack = () => {
    performRouteBack()
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
        bindload={onWebViewLoad}
        bindlocationchange={onLocationChange}
        bindmessage={onMessage}
        data-testid='plugin-webview-frame'
      />
    </view>
  )
}
