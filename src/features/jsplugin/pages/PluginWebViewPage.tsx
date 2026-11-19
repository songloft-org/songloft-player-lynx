import { useEffect, useRef, useState } from '@lynx-js/react'
import type { NodesRef } from '@lynx-js/types'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { appConfig } from '../../../core/config/app-config.js'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import { continueHostBack } from '../../../core/navigation/back-controller.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { dispatchBack } from '../../../shared/nav/back-stack.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getAppTheme, resolveTheme, subscribeAppTheme } from '../../../shared/theme/theme-model.js'
import { subscribeSurfacePolicy } from '../../../shared/theme/surface-policy.js'
import { subscribeMaterialVariant } from '../../../shared/theme/material-model.js'
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
  pluginPlayerStateChanged,
  type HostCallRequest,
  type PluginHostContext,
} from '../domain/plugin-host-dispatch.js'
import { createPluginReplyGate, HOST_REPLY_RECEIVED } from '../domain/plugin-host-reply.js'
import { pluginHostContext as hostContext } from '../domain/plugin-host-context.js'
import {
  pluginThemeAppearance,
  type PluginThemeAppearance,
} from '../domain/plugin-theme-appearance.js'
import { pluginColorSchemeMap } from '../domain/plugin-color-scheme.js'
import { getBuiltInPalette, subscribeBuiltInPalette } from '../../../shared/theme/built-in-palette-model.js'
import { usePluginsQuery } from '../data/jsplugin-query.js'
import { isWebPlatform } from '../../../native/web-platform.js'
import { subscribeAppResumed } from '../../../native/app-lifecycle.js'
import { LynxPluginFrame } from '../widgets/LynxPluginFrame.js'
import { createPluginBackBridge } from '../domain/plugin-back-bridge.js'
import './PluginWebViewPage.css'
import { desktopConfig } from '../../../desktop/client.js'
import { DESKTOP_CEF_BRIDGE } from '../../../desktop/cef.js'
import { useRetainedPluginTabs } from '../widgets/RetainedPluginTabs.js'

async function getAccessToken(): Promise<string> {
  try {
    const storage = getSongloftStorage()
    return (await storage.secure.get('access_token')) ?? ''
  } catch {
    return ''
  }
}

/**
 * Build the plugin page URL. `embed` hides the plugin's own toolbar — right for
 * a chromeless tab entry, wrong for a pushed page, where the plugin keeps its
 * own header under our topbar (both Flutter pages make exactly this
 * distinction: tab_page embeds, webview_page does not).
 */
function buildPluginUrl(entryPath: string, theme: string, token: string, embed: boolean, nativeHost = false): string {
  const base = `${appConfig.baseUrl}${appConfig.basePath}`
  const params = [embed ? 'embed' : '', `theme=${theme}`]
  if (token) params.push(`access_token=${token}`)
  if (nativeHost) params.push('songloft_host=lynx')
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
    colors: pluginColorSchemeMap(pack, resolved, getBuiltInPalette()),
    appearance: pluginThemeAppearance(pack, resolved),
  }
}

/** Every appearance source uses the same complete payload and lifecycle. */
function subscribePluginAppearance(push: () => void): () => void {
  const stops = [
    subscribeAppTheme(push), subscribeActiveThemePack(push),
    subscribeBuiltInPalette(push),
    subscribeSurfacePolicy(push), subscribeMaterialVariant(push),
  ]
  return () => stops.forEach(stop => stop())
}

export function PluginWebViewPage() {
  const retainedTabs = useRetainedPluginTabs()
  const desktop = desktopConfig()
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
  const plugin = pluginList?.plugins.find((p) => p.entryPath === entryPath)
  const title = plugin?.displayName || entryPath

  const [src, setSrc] = useState('')
  /** The plain (non-embed) URL for "open in browser" — pushed pages only. */
  const [browserUrl, setBrowserUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const webviewRef = useRef<NodesRef>(null)
  const nativePageGeneration = useRef(0)
  const nativeReplies = useRef(createPluginReplyGate()).current
  useEffect(() => {
    nativePageGeneration.current++
    return () => {
      nativePageGeneration.current++
      nativeReplies.clear()
    }
  }, [src, nativeReplies])
  const backBridgeRef = useRef<ReturnType<typeof createPluginBackBridge> | null>(null)
  const canPluginBackRef = useRef(false)
  const [canPluginBack, setCanPluginBack] = useState(false)
  const fallbackBackRef = useRef<() => void>(() => { })
  const continuingBackRef = useRef(false)

  useEffect(() => {
    canPluginBackRef.current = false
    setCanPluginBack(false)
    if (!src || plugin?.renderEngine === 'lynx') return
    const bridge = createPluginBackBridge({
      send: (message) => {
        if (isWebPlatform()) {
          getWebviewModule().postMessage(JSON.stringify(message))
        } else {
          const node = webviewRef.current
          if (!node) throw new Error('WebView is unavailable')
          node.invoke({
            method: 'eval',
            params: { func: `document.dispatchEvent(new CustomEvent(${JSON.stringify(message.type)}, {detail:${JSON.stringify(message)}}))` },
            fail: () => { /* Only a correlated page reply confirms consumption; timeout owns fallback. */ },
          }).exec()
        }
      },
      onCanBack: (value) => {
        canPluginBackRef.current = value
        setCanPluginBack(value)
      },
      onUnhandled: () => fallbackBackRef.current(),
    })
    backBridgeRef.current = bridge
    bridge.connect()
    return () => {
      backBridgeRef.current = null
      canPluginBackRef.current = false
      bridge.dispose()
    }
  }, [src, plugin?.renderEngine])

  useEffect(() => {
    if (!src || isWebPlatform() || plugin?.renderEngine === 'lynx') return
    return subscribeAppResumed(() => {
      'background only'
      // Run in the hosted browser after its drawing resumes. MIoT uses this
      // notification to replace a silent, stale status connection (#493).
      try {
        webviewRef.current?.invoke({
          method: 'eval',
          params: {
            func: "requestAnimationFrame(function(){document.dispatchEvent(new Event('visibilitychange'))})",
          },
        }).exec()
      } catch { /* The platform view may already be tearing down. */ }
    })
  }, [src, plugin?.renderEngine])

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
   *  - This legacy history path only activates while {@link webDepth} > 0. On a host where
   *    `locationchange` never fires (the type marks it `@PC`-only, so Android is
   *    unverified), `webDepth` stays 0. Plugins supporting the back bridge still
   *    report their internal state; others retain the existing route fallback.
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
    // This is load *completion*. SDK calls made during document startup may
    // still be awaiting the host; invalidating here would discard their replies.
    // A new document ignores old replies through common.js's pending request IDs.
    console.info('[plugin] native page loaded:', entryPath)
    setDepth(0)
    selfBackPendingRef.current = false
    if (backConfirmTimerRef.current) {
      clearTimeout(backConfirmTimerRef.current)
      backConfirmTimerRef.current = null
    }
    backBridgeRef.current?.connect()
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
  const pushThemeMessageRef = useRef<() => void>(() => { })
  pushThemeMessageRef.current = () => {
    webviewRef.current?.invoke({
      method: 'eval',
      params: { func: `window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(buildThemeMessage())}}))` },
    }).exec()
  }

  /*
   * The player-state push for the native branch, same ref pattern and for the
   * same reason (bindload fires after re-renders). The Web branch has its own
   * player push in WebPluginFrame — no cross-branch ref needed there because
   * it only ever fires from that component's own closures.
   */
  const pushPlayerStateRef = useRef<() => void>(() => { })
  pushPlayerStateRef.current = () => {
    webviewRef.current?.invoke({
      method: 'eval',
      params: { func: `window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify({ type: 'songloft-player-state', state: playerStateToJson() })}}))` },
    }).exec()
  }

  /*
   * Native WebView appearance changes use eval. WebPluginFrame owns the Web
   * channel so an event is not sent twice to the same iframe.
   */
  useEffect(() => {
    if (isWebPlatform()) return
    const push = () => pushThemeMessageRef.current()
    return subscribePluginAppearance(push)
  }, [])

  /*
   * Legacy history fallback, after the plugin declines or times out.
   *
   * After triggering `history.back()` we arm a short watchdog: if no `locationchange`
   * confirms it, the webview had no history to give. When that exhausts our count we
   * route-back rather than dead-ending the key. (We only force the route-back once the
   * count reaches zero — with levels still counted, a slow event should not yank the
   * user out of the plugin.)
   */
  const historyBack = () => {
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
      if (next <= 0) fallbackBackRef.current()
    }, 400)
    return true
  }
  fallbackBackRef.current = () => {
    // The stack may have changed during the reply/watchdog wait. Offer the
    // press to current overlays without requesting this plugin a second time.
    continuingBackRef.current = true
    try {
      if (dispatchBack()) return
      if (webDepthRef.current > 0) historyBack()
      else continueHostBack()
    } finally {
      continuingBackRef.current = false
    }
  }
  useBackHandler(canPluginBack || webDepth > 0, () => {
    'background only'
    if (continuingBackRef.current) return false
    if (!canPluginBackRef.current && webDepthRef.current <= 0) return false
    return backBridgeRef.current?.requestBack() ?? historyBack()
  })

  useEffect(() => {
    void (async () => {
      try {
        const token = await getAccessToken()
        // Read the app's own theme state. This used to sniff `document.documentElement`
        // for `theme-light`, and Lynx has no DOM — the guard kept it from crashing but
        // pinned every plugin to `theme=dark`, even with light mode selected.
        const theme = resolveTheme(getAppTheme())
        setSrc(buildPluginUrl(entryPath, theme, token, isTabEntry, !isWebPlatform()))
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
      if (!pluginPlayerStateChanged(state, prev)) return
      const stateJson = JSON.stringify(playerStateToJson(state))
      webviewRef.current?.invoke({
        method: 'eval',
        params: { func: `window.dispatchEvent(new MessageEvent('message',{data:{type:'songloft-player-state',state:${stateJson}}}))` },
      }).exec()
    })
    return unsub
  }, [src])

  const onMessage = (e: { detail?: { msg?: string } }) => {
    try {
      const raw = e.detail?.msg
      if (!raw) return
      const req = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (backBridgeRef.current?.receive(req)) return
      const call = decodeHostCall(req)
      if (!call) return
      if (call.ns === 'lifecycle' && call.method === HOST_REPLY_RECEIVED) {
        if (typeof call.id === 'string') nativeReplies.confirm(call.id)
        return
      }
      const node = webviewRef.current
      const generation = nativePageGeneration.current
      const callerContext = Object.create(hostContext) as PluginHostContext
      callerContext.pluginEntryPath = entryPath
      callerContext.isPluginActive = () =>
        !!node && webviewRef.current === node && generation === nativePageGeneration.current
      void handlePluginHostCall(call, callerContext).then(result => {
        if (!node || webviewRef.current !== node || generation !== nativePageGeneration.current) return
        const reply = JSON.stringify({
          type: 'songloft-host-reply',
          id: call.id,
          ...(typeof call.id === 'string' ? nativeReplies.stage(call.id, result) : result),
        })
        node.invoke({ method: 'eval', params: { func: `window.dispatchEvent(new MessageEvent('message',{data:${reply}}))` } }).exec()
      }).catch(() => {
        // The native view can disappear before eval executes. The requesting
        // document owns the RPC timeout; never leak an unhandled rejection.
      })
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

  // The routed page owns the pushed topbar; the shell owns the stable frame
  // beneath it. Return before loading/error UI so no transient full-height page
  // can cover or squeeze the retained instance during a home-grid round-trip.
  if (retainedTabs && plugin?.isActive && (plugin.renderEngine === 'lynx' || desktop))
    return topbar

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
        <WebPluginFrame
          src={src}
          frameKey={entryPath}
          onBackMessage={(payload) => {
            'background only'
            return backBridgeRef.current?.receive(payload) ?? false
          }}
          onConnectBack={() => {
            'background only'
            backBridgeRef.current?.connect()
          }}
        />
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
        initjs={desktop ? DESKTOP_CEF_BRIDGE : undefined}
        use-osr={desktop ? desktop.os === 'darwin' : undefined}
        bindopenwindow={desktop ? event => { if (event.detail?.url) openURL(event.detail.url) } : undefined}
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
function WebPluginFrame({ src, frameKey, onBackMessage, onConnectBack }: {
  src: string
  frameKey: string
  onBackMessage: (payload: unknown) => boolean
  onConnectBack: () => void
}) {
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
    const replies = createPluginReplyGate()
    const callerContext = Object.create(hostContext) as PluginHostContext
    callerContext.pluginEntryPath = frameKey
    callerContext.isPluginActive = () => !closed
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

    unsubTheme = subscribePluginAppearance(() => {
      send(buildThemeMessage())
    })

    unsubPlayer = usePlayerStore.subscribe((state, prev) => {
      // Same change-signature throttle as the native branch's push.
      if (!pluginPlayerStateChanged(state, prev)) return
      send({ type: 'songloft-player-state', state: playerStateToJson() })
    })

    setWebviewBridgeHandlers({
      onMessage: (payload) => {
        if (onBackMessage(payload)) return
        const req = decodeHostCall(payload)
        if (!req) return
        if (req.ns === 'lifecycle' && req.method === HOST_REPLY_RECEIVED) {
          if (typeof req.id === 'string') replies.confirm(req.id)
          return
        }
        void handlePluginHostCall(req, callerContext).then((result) => {
          if (closed) return
          const reply = typeof req.id === 'string' ? replies.stage(req.id, result) : result
          send({ type: 'songloft-host-reply', id: req.id, ...reply })
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
        onConnectBack()
        send(buildThemeMessage())
        send({ type: 'songloft-player-state', state: playerStateToJson() })
      },
    })

    return () => {
      closed = true
      replies.clear()
      unsubTheme?.()
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
