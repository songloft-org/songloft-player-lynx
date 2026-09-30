import { useEffect, useRef, useState } from '@lynx-js/react'
import type { NodesRef } from '@lynx-js/types'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { appConfig } from '../../../core/config/app-config.js'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getAppTheme, resolveTheme, subscribeAppTheme } from '../../../shared/theme/theme-model.js'
import {
  getActiveThemePack,
  subscribeActiveThemePack,
} from '../../../shared/theme/theme-pack-model.js'
import { openURL } from '../../../native/native-platform.js'
import {
  getWebviewModule,
  setWebviewBridgeHandlers,
} from '../../../native/web-webview.js'
import { usePlayerStore } from '../../player/store/index.js'
import {
  handlePluginHostCall,
  playerStateToJson,
  type HostCallRequest,
  type PluginHostContext,
} from '../domain/plugin-host-dispatch.js'
import {
  pluginThemeAppearance,
  type PluginThemeAppearance,
} from '../domain/plugin-theme-appearance.js'
import { pluginColorSchemeMap } from '../domain/plugin-color-scheme.js'
import { getJSPluginApi } from '../api/index.js'
import { usePluginsQuery } from '../data/jsplugin-query.js'
import { isWebPlatform } from '../../../native/web-platform.js'
import type { Song } from '../../../models/song.js'
import { LynxPluginFrame } from '../widgets/LynxPluginFrame.js'
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

/**
 * Build the plugin page URL. `embed` hides the plugin's own toolbar — right for
 * a chromeless tab entry, wrong for a pushed page, where the plugin keeps its
 * own header under our topbar (both Flutter pages make exactly this
 * distinction: tab_page embeds, webview_page does not).
 */
function buildPluginUrl(entryPath: string, theme: string, token: string, embed: boolean): string {
  const base = `${appConfig.baseUrl}${appConfig.basePath}`
  const params = [embed ? 'embed' : '', `theme=${theme}`]
  if (token) params.push(`access_token=${token}`)
  return `${base}/api/v1/jsplugin/${entryPath}/?${params.filter(Boolean).join('&')}`
}

/** The plugin SDK's host-call envelope, with its reply-correlation id. */
type IncomingHostCall = HostCallRequest & { id?: unknown }

function decodeHostCall(payload: unknown): IncomingHostCall | null {
  if (typeof payload !== 'object' || payload === null) return null
  const req = payload as Record<string, unknown>
  if (req['type'] !== 'songloft-host-call') return null
  return req as unknown as IncomingHostCall
}

/**
 * The `songloft-theme` payload the host pushes — `theme` plus the `colors`
 * and `appearance` objects the WebView SDK's `common.js` turns into
 * `--md-*` / `data-navigation-style` / `--sl-theme-*` (see
 * plugin-color-scheme.ts / plugin-theme-appearance.ts). Built from the live
 * theme AND pack state on every call, so any of their changes can be pushed
 * with one re-send; the receiver re-applies everything idempotently, which is
 * what makes "redundant" pushes harmless.
 */
function buildThemeMessage(): {
  type: 'songloft-theme'
  theme: ReturnType<typeof resolveTheme>
  colors: ReturnType<typeof pluginColorSchemeMap>
  appearance: PluginThemeAppearance
} {
  const resolved = resolveTheme(getAppTheme())
  const pack = getActiveThemePack()?.data
  return {
    type: 'songloft-theme',
    theme: resolved,
    colors: pluginColorSchemeMap(pack, resolved),
    appearance: pluginThemeAppearance(pack, resolved),
  }
}

export function PluginWebViewPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const params = useParams({ strict: false }) as { entryPath?: string }
  const entryPath = params.entryPath ?? ''

  /*
   * `?tab=true` — this navigation came through the nav tab (bar / rail / More
   * sheet), set by those entry points. A tab entry renders chromeless with an
   * `embed` URL (Flutter's `plugin_tab_page`); anything else is a pushed page
   * with the topbar + open-in-browser action (Flutter's `plugin_webview_page`).
   * Derived from the search string, NOT the tab config: opening a tabbed
   * plugin from the grid must still get the pushed treatment.
   */
  const search = useSearch({ strict: false }) as { tab?: boolean }
  const isTabEntry = search.tab === true

  // The route only carries `entryPath`, which is a *routing prefix* ("myplugin") —
  // showing it as the title was a porting slip (the Flutter page titled itself with
  // the plugin's display name). `displayName` rather than the raw `name`: the
  // backend may omit `name`, and `displayName` is the null-safe wrapper this repo
  // uses as the user-visible label everywhere else (grid, manager, tab config).
  // Falls back to `entryPath` so the title never flashes empty while the list loads.
  const { data: pluginList } = usePluginsQuery()
  const title = pluginList?.plugins.find((p) => p.entryPath === entryPath)?.displayName || entryPath

  const [src, setSrc] = useState('')
  /** The plain (non-embed) URL for "open in browser" — pushed pages only. */
  const [browserUrl, setBrowserUrl] = useState('')
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
    /*
     * First-paint delivery of the theme message: `?theme=` carries only
     * light/dark, and appearance has NO URL channel at all — a postMessage to
     * a still-loading document is dropped, so this is the moment the payload
     * can finally land (Flutter's onLoadStop does exactly this re-push). The
     * page is the native `<webview>`'s `bindload`; the Web iframe emits the
     * equivalent via `SongloftWebview.load` (WebPluginFrame's onLoad).
     * Player-state rides the same drop rule (no URL channel either), so it
     * re-sends here too.
     */
    pushThemeMessageRef.current()
    pushPlayerStateRef.current()
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
   * The one `songloft-theme` push both platform branches share. A ref, not a
   * plain function: `onWebViewLoad` outlives any single render (the native
   * `bindload` may fire after re-renders), and the Web branch's onLoad closure
   * would otherwise capture a stale theme/pack snapshot.
   */
  const pushThemeMessageRef = useRef<() => void>(() => {})
  pushThemeMessageRef.current = () => {
    webviewRef.current?.invoke({
      method: 'eval',
      params: { func: `window.postMessage(${JSON.stringify(buildThemeMessage())},'*')` },
    }).exec()
  }

  /*
   * The player-state push for the native branch, same ref pattern and for the
   * same reason (bindload fires after re-renders). The Web branch has its own
   * player push in WebPluginFrame — no cross-branch ref needed there because
   * it only ever fires from that component's own closures.
   */
  const pushPlayerStateRef = useRef<() => void>(() => {})
  pushPlayerStateRef.current = () => {
    webviewRef.current?.invoke({
      method: 'eval',
      params: { func: `window.postMessage(${JSON.stringify({ type: 'songloft-player-state', state: playerStateToJson() })},'*')` },
    }).exec()
  }

  /*
   * Runtime theme / theme-pack changes re-push through BOTH channels:
   * the native `<webview>`'s eval (this component's ref) and, on Web, the
   * iframe module — whichever exists is the one that reaches the plugin.
   * The two subscriptions are shared (not per-branch) because `webviewRef`
   * is null on Web (the eval path no-ops) and the Web module's postMessage
   * no-ops on native — each host ends up with exactly one live channel.
   */
  useEffect(() => {
    const push = () => pushThemeMessageRef.current()
    const pushWeb = () => {
      const webview = getWebviewModule()
      // Only meaningful on the Web host; `available` is false elsewhere, so
      // this degrades to a no-op rather than erroring on native platforms.
      if (webview.available) webview.postMessage(JSON.stringify(buildThemeMessage()))
    }
    const unsubTheme = subscribeAppTheme(() => {
      push()
      pushWeb()
    })
    const unsubPack = subscribeActiveThemePack(() => {
      push()
      pushWeb()
    })
    return () => {
      unsubTheme()
      unsubPack()
    }
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
        setSrc(buildPluginUrl(entryPath, theme, token, isTabEntry))
        setBrowserUrl(buildPluginUrl(entryPath, theme, token, false))
        setLoading(false)
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e))
        setLoading(false)
      }
    })()
  }, [entryPath, isTabEntry])

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

  /** The pushed page's escape hatch — Flutter's `Icons.open_in_browser` action. */
  const openInBrowser = () => {
    if (browserUrl) openURL(browserUrl)
  }

  /*
   * The pushed page's topbar: back + title + open-in-browser. A tab entry
   * renders none of it — the plugin IS the page there (Flutter's plugin_tab_page
   * has no Scaffold/AppBar at all).
   */
  const topbar = isTabEntry ? null : (
    <view className='plugin-webview__topbar'>
      <view
        className='plugin-webview__back'
        bindtap={goBack}
        accessibility-element={true}
        accessibility-label={t('common.back')}
        data-testid='plugin-webview-back'
      >
        <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
      </view>
      <text className='plugin-webview__title' data-testid='plugin-webview-title'>{title}</text>
      <view
        className='plugin-webview__open'
        bindtap={openInBrowser}
        accessibility-element={true}
        accessibility-label={t('jsplugin.openInBrowser')}
        data-testid='plugin-webview-open'
      >
        <Icon name='open-external' size={20} color={ICON_COLORS.content} />
      </view>
    </view>
  )

  // Platform, not realm — on Web this component renders in a worker with no
  // `window`/`document`, so `isWebEnvironment()` would answer `false` here and
  // the fallback below would be skipped in favour of a `<webview>` that Web has
  // no implementation for (blank area). See `isWebPlatform`.
  const isWeb = isWebPlatform()

  if (loading) {
    return (
      <view className='plugin-webview'>
        {topbar}
        <view className='plugin-webview__state'>
          <text className='plugin-webview__state-text'>{t('common.loading')}</text>
        </view>
      </view>
    )
  }

  if (error) {
    return (
      <view className='plugin-webview'>
        {topbar}
        <view className='plugin-webview__state'>
          <text className='plugin-webview__state-text plugin-webview__state-text--error'>{error}</text>
        </view>
      </view>
    )
  }

  /*
   * Lynx native rendering: when renderEngine is "lynx", the plugin ships a
   * .lynx.bundle and renders via <frame> (native) or nested <lynx-view> (Web).
   * Both platforms use the same component since <frame> maps to <lynx-view> on Web.
   */
  const plugin = pluginList?.plugins.find((p) => p.entryPath === entryPath)
  if (plugin?.renderEngine === 'lynx') {
    return (
      <view className='plugin-webview'>
        {topbar}
        <LynxPluginFrame entryPath={entryPath} isTabEntry={isTabEntry} />
      </view>
    )
  }

  /*
   * Web platform: `<webview>` has no implementation there (absent from
   * web-core's tag map — see `isWebPlatform`'s doc comment), so the plugin runs
   * in a main-thread iframe positioned over a placeholder. Everything below
   * the (optional) topbar is owned by `WebPluginFrame` at the bottom of this
   * file.
   */
  if (isWeb) {
    return (
      <view className='plugin-webview'>
        {topbar}
        <WebPluginFrame src={src} frameKey={entryPath} />
      </view>
    )
  }

  return (
    <view className='plugin-webview'>
      {topbar}
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

/**
 * The Web stand-in for the native `<webview>`: a placeholder view plus a
 * main-thread iframe positioned over it.
 *
 * The placeholder carries the real layout (the `--nav-inset` capsule avoidance
 * comes from the same `.plugin-webview__frame` class), and its measured rect is
 * what the iframe is placed on — so the plugin page never covers the nav
 * capsule or mini-player. The iframe itself is created and moved by
 * `web/webview-host.js` through `NativeModules.SongloftWebview`.
 *
 * Message protocol — the one the plugin SDK's `common.js` already speaks, and
 * the same as the Flutter Web build (`plugin_tab_page_stub.dart`):
 *
 *  - host → plugin: `songloft-theme` (runtime dark/light flips plus the
 *    `appearance` object — navigationStyle/radii/glass; the initial theme
 *    travels in the URL's `?theme=`, appearance only via this message) and
 *    `songloft-player-state` (throttled to real changes, same signature as
 *    the native branch below).
 *  - plugin → host: `songloft-host-call` `{id, ns, method, params}`, replied to
 *    with `songloft-host-reply` `{id, ok, data|error}`.
 */
function WebPluginFrame({ src, frameKey }: { src: string; frameKey: string }) {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const webview = getWebviewModule()
    if (!webview.available) {
      // Stale host page (no SongloftWebview module) or a non-Web host: fall
      // back to the old message rather than a silent blank area.
      setFailed(true)
      return
    }

    let closed = false
    let unsubTheme: (() => void) | undefined
    let unsubPlayer: (() => void) | undefined

    const send = (msg: unknown) => webview.postMessage(JSON.stringify(msg))

    /*
     * Placement is entirely the main thread's job now: it resolves the
     * selector below inside lynx-view's shadow root and keeps the iframe glued
     * to that element's live box (ResizeObserver + resize — see
     * `web/webview-host.js`). No rect crosses the bridge, so none can go stale
     * when the nav inset tier or the shell breakpoint flips; if the element
     * never appears, the main thread reports `openFailed` and we degrade.
     */
    webview.open(src, '#plugin-webview-frame', frameKey)

    /*
     * Re-entry has to re-sync, because the frame is kept alive: the document is
     * NOT reloaded, and the theme/player subscriptions below were torn down while
     * the plugin was off screen — so anything that changed in between was missed.
     * On a first open these two pushes are redundant at worst (the initial theme
     * also rides in the URL's `?theme=`, and a message to a still-loading iframe
     * is simply dropped — the `onLoad` re-push below is what lands them).
     */
    send(buildThemeMessage())
    send({ type: 'songloft-player-state', state: playerStateToJson() })

    unsubTheme = subscribeAppTheme(() => {
      send(buildThemeMessage())
    })

    /*
     * A pack activation swaps radii/glass without touching light/dark — the
     * theme subscription above would stay silent, so the pack gets its own.
     */
    const unsubPack = subscribeActiveThemePack(() => {
      send(buildThemeMessage())
    })

    unsubPlayer = usePlayerStore.subscribe((state, prev) => {
      // Same change-signature throttle as the native branch's push.
      const sig = `${state.currentIndex}|${state.isPlaying}|${state.currentSong?.id}|${state.playMode}|${state.playlist.length}`
      const prevSig = `${prev.currentIndex}|${prev.isPlaying}|${prev.currentSong?.id}|${prev.playMode}|${prev.playlist.length}`
      if (sig === prevSig) return
      send({ type: 'songloft-player-state', state: playerStateToJson() })
    })

    setWebviewBridgeHandlers({
      onMessage: (payload) => {
        const req = decodeHostCall(payload)
        if (!req) return
        void handlePluginHostCall(req, hostContext).then((result) => {
          if (closed) return
          send({ type: 'songloft-host-reply', id: req.id, ...result })
        })
      },
      onOpenFailed: () => {
        setFailed(true)
      },
      /*
       * The iframe finished loading — re-send the theme AND player-state
       * payloads. A frame that just navigated drops postMessage aimed at its
       * old/pending document, so the appearance (which has no URL fallback
       * channel) would otherwise never reach a first load; player-state has no
       * URL channel either and the same drop applies. Mirrors the native
       * branch's `bindload` re-push and Flutter's `onLoadStop`.
       */
      onLoad: () => {
        send(buildThemeMessage())
        send({ type: 'songloft-player-state', state: playerStateToJson() })
      },
    })

    return () => {
      closed = true
      unsubTheme?.()
      unsubPack()
      unsubPlayer?.()
      setWebviewBridgeHandlers(null)
      /*
       * `hide`, not `close`. This cleanup runs on every tab switch away from the
       * plugin, and `close` used to detach the iframe — which crashed the
       * renderer (error code 11 / SIGSEGV) with an extension that injects into
       * every frame plus DevTools open. Hiding also means re-entering the tab
       * restores the plugin's own state instead of reloading it. Real teardown
       * is the plugin manager's job (disable / uninstall / update) and the
       * logout path. See docs/archive/web-plugin-tab-crash.md.
       */
      webview.hide(frameKey)
    }
  }, [src, frameKey])

  if (failed) {
    return (
      <view className='plugin-webview__state'>
        <text className='plugin-webview__state-text'>{t('jsplugin.webview_unavailable')}</text>
      </view>
    )
  }
  return (
    <view
      id='plugin-webview-frame'
      className='plugin-webview__frame'
      data-testid='plugin-webview-frame'
    />
  )
}
