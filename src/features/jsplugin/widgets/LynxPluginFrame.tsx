import { createPluginBackBridge } from '../domain/plugin-back-bridge.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { continueHostBack } from '../../../core/navigation/back-controller.js'
import {
  readLynxGlobal,
  readNativeModules,
} from '../../../native/native-modules.js'
import { desktopConfig } from '../../../desktop/client.js'
import { openURL } from '../../../native/native-platform.js'
import { useEffect, useMemo, useRef, useState } from '@lynx-js/react'

import { appConfig } from '../../../core/config/app-config.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import { isWebPlatform } from '../../../native/web-platform.js'
import { getPlatformTarget } from '../../../native/platform-target.js'
import { subscribeAppResumed } from '../../../native/app-lifecycle.js'
import {
  connectNativePluginHost,
  type NativePluginHost,
} from '../../../native/native-plugin-host.js'
import {
  getAppTheme,
  resolveTheme,
  subscribeAppTheme,
} from '../../../shared/theme/theme-model.js'
import { usePlayerStore } from '../../player/store/index.js'
import {
  handlePluginHostCall,
  playerStateToJson,
  pluginPlayerStateChanged,
} from '../domain/plugin-host-dispatch.js'
import { createPluginReplyGate, HOST_REPLY_RECEIVED } from '../domain/plugin-host-reply.js'
import { pluginHostContext as hostContext } from '../domain/plugin-host-context.js'
import { pluginSocketRequest } from '../domain/plugin-socket.js'
import { pluginApiRequest } from '../domain/plugin-api-request.js'
import {
  getLynxFrameModule,
  setLynxFrameBridgeHandlers,
  type LynxFrameHostCallPayload,
} from '../../../native/web-lynx-frame.js'

function buildLynxBundleUrl(entryPath: string): string {
  const base = `${appConfig.baseUrl}${appConfig.basePath}`
  const bundle = isWebPlatform() ? 'main.web.bundle' : 'main.lynx.bundle'
  return `${base}/api/v1/jsplugin/${entryPath}/static/${bundle}`
}

interface Props {
  entryPath: string
  isTabEntry: boolean
  active?: boolean
}

/**
 * Renders a plugin in a child Lynx view. Harmony uses the host's custom element;
 * Android/iOS use <frame>, and Web uses a nested <lynx-view>.
 * Communication flows through NativeModules.SongloftPluginBridge.
 *
 * On native: each child uses SongloftPluginBridgeModule.
 * On Web: <frame> maps to nested <lynx-view>, bridge via lynx-frame-host.js.
 * On Web, we additionally drive the bridge through getLynxFrameModule() for
 * the host-call dispatch path (because the Web nested <lynx-view> needs
 * explicit module configuration from the main thread).
 */
export function LynxPluginFrame({ entryPath, isTabEntry, active }: Props) {
  const activeRef = useRef(active !== false)
  const desktopWindowVisible = useRef(desktopConfig()?.windowVisible !== false)
  activeRef.current = active !== false
  const frameId = useMemo(() => `frame-${entryPath}-${Date.now()}`, [entryPath])
  const [canBack, setCanBack] = useState(false)
  const backBridge = useMemo(
    () =>
      createPluginBackBridge({
        send: (message) => {
          if (isWebPlatform())
            getLynxFrameModule().sendEvent(
              'SongloftPluginBridge.push',
              JSON.stringify({
                event: 'navigationBack',
                data: JSON.stringify(message),
              }),
            )
          else
            nativeHost.current?.push('navigationBack', JSON.stringify(message))
        },
        onCanBack: setCanBack,
        onUnhandled: continueHostBack,
      }),
    [frameId],
  )
  useBackHandler(active !== false && canBack, () => backBridge.requestBack())
  useEffect(() => () => backBridge.dispose(), [backBridge])
  const frameContext = useMemo(
    () => ({
      ...hostContext,
      pluginNavigation: (method: string, params: Record<string, unknown>) => {
        if (!params.session) {
          backBridge.connect()
          return
        }
        backBridge.receive({
          ...params,
          type:
            method === 'navigationState'
              ? 'songloft-back-state'
              : 'songloft-back-result',
        })
      },
      pluginOpenUrl: (url: string) => {
        if (desktopConfig()) {
          openURL(url)
          return
        }
        const mod = readNativeModules()?.[
          isWebPlatform() ? 'SongloftLynxFrame' : 'SongloftPluginBridge'
        ] as { openUrl?: (frame: string, url: string) => void } | undefined
        if (!mod?.openUrl) throw new Error('opening URLs is unavailable')
        mod.openUrl(frameId, url)
      },
      pluginResourceUrl: async (path: string) => {
        if (!/^\/api\/v1\/songs\/\d+\/cover(?:\?|$)/.test(path))
          throw new Error('invalid cover path')
        const token =
          (await getSongloftStorage().secure.get('access_token')) || ''
        return `${appConfig.baseUrl}${appConfig.basePath}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`
      },
      pluginSocketRequest: (method: string, params: Record<string, unknown>) =>
        pluginSocketRequest(entryPath, frameId, method, params),
      pluginApiRequest: (params: Record<string, unknown>) =>
        pluginApiRequest(entryPath, params),
    }),
    [entryPath],
  )
  const bundleUrl = buildLynxBundleUrl(entryPath)
  const [theme, setTheme] = useState(() => resolveTheme(getAppTheme()))
  const [accessToken, setAccessToken] = useState('')
  const isWeb = isWebPlatform()
  const nativeHost = useRef<NativePluginHost | null>(null)

  // Load access token for Lynx bundle plugins (they don't get it via URL query params)
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const storage = getSongloftStorage()
        const token = (await storage.secure.get('access_token')) ?? ''
        console.error(
          '[LynxPluginFrame] Loaded token, length=' +
            (token ? token.length : 0),
        )
        if (active) setAccessToken(token)
      } catch (e) {
        console.error('[LynxPluginFrame] Failed to load token: ' + e)
        if (active) setAccessToken('')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (isWeb) return
    let connected = true
    const host = connectNativePluginHost(frameId, (request) =>
      handlePluginHostCall(request, {
        ...frameContext,
        pluginEntryPath: entryPath,
        isPluginActive: () => connected && activeRef.current,
      }),
    )
    nativeHost.current = host
    if (desktopConfig())
      host.push(
        'lifecycle',
        JSON.stringify({
          state:
            activeRef.current && desktopWindowVisible.current
              ? 'resumed'
              : 'paused',
        }),
      )
    host.push('playerState', JSON.stringify(playerStateToJson()))
    host.push('theme', JSON.stringify({ theme: resolveTheme(getAppTheme()) }))
    const unsubscribe = subscribeAppResumed(() => {
      if (activeRef.current && desktopWindowVisible.current)
        host.push('lifecycle', JSON.stringify({ state: 'resumed' }))
    })
    return () => {
      connected = false
      unsubscribe()
      host.dispose()
      if (nativeHost.current === host) nativeHost.current = null
    }
  }, [frameId, isWeb])

  useEffect(() => {
    if (!isWeb && active !== undefined)
      nativeHost.current?.push(
        'lifecycle',
        JSON.stringify({
          state: active && desktopWindowVisible.current ? 'resumed' : 'paused',
        }),
      )
  }, [active, isWeb])
  useEffect(() => {
    if (!desktopConfig()) return
    const emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter')
    const update = (event: { visible?: boolean }) => {
      desktopWindowVisible.current = event.visible !== false
      nativeHost.current?.push(
        'lifecycle',
        JSON.stringify({
          state:
            desktopWindowVisible.current && activeRef.current
              ? 'resumed'
              : 'paused',
        }),
      )
    }
    emitter?.addListener?.('SongloftDesktop.visibility', update)
    return () => emitter?.removeListener?.('SongloftDesktop.visibility', update)
  }, [frameId])

  /*
   * `playerState` rides along with the initial props on purpose.
   *
   * The push channel below only carries *changes*, so a child that boots after a
   * change — or is re-entered after being kept alive off screen — would otherwise
   * never learn the current state. globalProps is the one delivery that is
   * guaranteed: the host sets it before `url` (so the first render sees it) and
   * merges a fresh snapshot on every `open`, which is what a re-entry is.
   *
   * Web renders a placeholder without a native bindload event. Native pushes
   * wait for the SDK's lifecycle.ready call after its listener is installed;
   * snapshots travel in props and the latest queued values flush on readiness.
   */
  const globalProps = {
    // A child may inherit parent props in some frame implementations. Explicitly
    // erase host credentials even there; plugins use only SongloftPluginBridge.
    ...(desktopConfig()
      ? { songloftDesktop: null, songloftDesktopProbe: false }
      : {}),
    frameId,
    serverUrl: `${appConfig.baseUrl}${appConfig.basePath}`,
    theme,
    hostVersion: hostContext.version,
    embed: isTabEntry,
    playerState: playerStateToJson(),
    access_token: accessToken,
  }

  // Web path: manage the nested <lynx-view> via the frame host module
  useEffect(() => {
    if (!isWeb) return
    const mod = getLynxFrameModule()
    if (!mod.available) return

    mod.open(
      bundleUrl,
      '#plugin-lynx-frame',
      JSON.stringify(globalProps),
      entryPath,
    )
    let active = true
    const replies = createPluginReplyGate()
    const callerContext = {
      ...frameContext,
      pluginEntryPath: entryPath,
      isPluginActive: () => active && activeRef.current,
    }

    // Handle host calls from the child frame
    setLynxFrameBridgeHandlers({
      onMessage: (payload: LynxFrameHostCallPayload) => {
        if (!active || payload.frameId !== frameId) return
        if (payload.ns === 'lifecycle' && payload.method === HOST_REPLY_RECEIVED) {
          replies.confirm(payload.callId)
          return
        }
        try {
          const req = {
            ns: payload.ns,
            method: payload.method,
            params: JSON.parse(payload.params || '{}'),
          }
          void handlePluginHostCall(req, callerContext)
            .then((result) => {
              if (active) mod.hostReply(payload.callId, JSON.stringify(replies.stage(payload.callId, result)))
            })
            .catch(() => {
              if (active)
                mod.hostReply(
                  payload.callId,
                  JSON.stringify({ ok: false, error: 'host_call_failed' }),
                )
            })
        } catch {
          mod.hostReply(
            payload.callId,
            JSON.stringify({ ok: false, error: 'invalid_params' }),
          )
        }
      },
    })

    return () => {
      active = false
      replies.clear()
      setLynxFrameBridgeHandlers(null)
      /*
       * `hide`, not `close`. Detaching the child <lynx-view> on every tab switch
       * is what crashed the renderer (error code 11), and it also started an
       * async dispose that the next `open` raced. Hiding keeps the child's
       * worker and state; real teardown belongs to the plugin manager and the
       * logout path. See docs/archive/web-plugin-tab-crash.md.
       */
      mod.hide(entryPath)
    }
  }, [bundleUrl, isWeb, entryPath])

  // Track theme changes
  useEffect(() => {
    const unsub = subscribeAppTheme(() => {
      const newTheme = resolveTheme(getAppTheme())
      setTheme(newTheme)
      if (isWeb) {
        const mod = getLynxFrameModule()
        if (mod.available)
          mod.updateGlobalProps(JSON.stringify({ theme: newTheme }))
      } else {
        nativeHost.current?.push('theme', JSON.stringify({ theme: newTheme }))
      }
    })
    return unsub
  }, [isWeb])

  // Push player state changes to the child (the initial snapshot travels in
  // globalProps — see above).
  useEffect(() => {
    return usePlayerStore.subscribe((state, prev) => {
      if (!pluginPlayerStateChanged(state, prev)) return
      const stateJson = JSON.stringify(playerStateToJson())
      if (isWeb) {
        const mod = getLynxFrameModule()
        if (mod.available)
          mod.sendEvent(
            'SongloftPluginBridge.push',
            JSON.stringify({ event: 'playerState', data: stateJson }),
          )
      } else nativeHost.current?.push('playerState', stateJson)
    })
  }, [frameId, isWeb])

  // On Web, the nested <lynx-view> is managed by lynx-frame-host.js; this
  // placeholder is what it positions over.
  if (isWeb) {
    return (
      <view
        id="plugin-lynx-frame"
        className="plugin-webview__frame"
        data-testid="plugin-lynx-frame"
      />
    )
  }

  // Harmony 4.0.1 has no native frame. Use a custom tag so the core's
  // unsupported FrameElement bundle/data pipeline does not run as well.
  if (getPlatformTarget() === 'harmony') {
    return (
      <songloft-plugin-frame
        src={bundleUrl}
        global-props={globalProps}
        className="plugin-webview__frame"
        data-testid="plugin-lynx-frame"
      />
    )
  }

  // Android/iOS: the SDK's <frame> directly loads the bundle.
  if (desktopConfig())
    return (
      <songloft-desktop-plugin-frame
        src={bundleUrl}
        frame-id={frameId}
        global-props-json={JSON.stringify(globalProps)}
        visible={active !== false}
        className="plugin-webview__frame"
        data-testid="plugin-lynx-frame"
      />
    )
  return (
    <frame
      src={bundleUrl}
      global-props={globalProps}
      className="plugin-webview__frame"
      data-testid="plugin-lynx-frame"
    />
  )
}
