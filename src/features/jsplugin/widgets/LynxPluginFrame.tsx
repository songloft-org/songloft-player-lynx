import { useEffect, useRef, useState } from '@lynx-js/react'

import { appConfig } from '../../../core/config/app-config.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import { isWebPlatform } from '../../../native/web-platform.js'
import { getAppTheme, resolveTheme, subscribeAppTheme } from '../../../shared/theme/theme-model.js'
import { usePlayerStore } from '../../player/store/index.js'
import {
  handlePluginHostCall,
  playerStateToJson,
  type PluginHostContext,
} from '../domain/plugin-host-dispatch.js'
import { getJSPluginApi } from '../api/index.js'
import {
  getLynxFrameModule,
  setLynxFrameBridgeHandlers,
  type LynxFrameHostCallPayload,
} from '../../../native/web-lynx-frame.js'
import type { Song } from '../../../models/song.js'

async function resolveSongs(ids: number[]): Promise<Song[]> {
  const api = getJSPluginApi()
  const results: Song[] = []
  for (const id of ids) {
    try {
      const res = await (api as unknown as { client: { get: Function } }).client.get(`/api/v1/songs/${id}`)
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

function buildLynxBundleUrl(entryPath: string): string {
  const base = `${appConfig.baseUrl}${appConfig.basePath}`
  const bundle = isWebPlatform() ? 'main.web.bundle' : 'main.lynx.bundle'
  return `${base}/api/v1/jsplugin/${entryPath}/static/${bundle}`
}

interface Props {
  entryPath: string
  isTabEntry: boolean
}

/**
 * Renders a plugin via Lynx's <frame> element (native: real frame, Web: nested
 * <lynx-view>). Communication flows through NativeModules.SongloftPluginBridge.
 *
 * On native: <frame> is a real Lynx frame, bridge via SongloftPluginBridgeModule.
 * On Web: <frame> maps to nested <lynx-view>, bridge via lynx-frame-host.js.
 * Both platforms use the same component — the frame element is cross-platform.
 * On Web, we additionally drive the bridge through getLynxFrameModule() for
 * the host-call dispatch path (because the Web nested <lynx-view> needs
 * explicit module configuration from the main thread).
 */
export function LynxPluginFrame({ entryPath, isTabEntry }: Props) {
  const frameId = useRef(`frame-${entryPath}-${Date.now()}`).current
  const bundleUrl = buildLynxBundleUrl(entryPath)
  const [theme, setTheme] = useState(() => resolveTheme(getAppTheme()))
  const [accessToken, setAccessToken] = useState('')
  const isWeb = isWebPlatform()

  // Load access token for Lynx bundle plugins (they don't get it via URL query params)
  useEffect(() => {
    void (async () => {
      try {
        const storage = getSongloftStorage()
        const token = (await storage.secure.get('access_token')) ?? ''
        console.error('[LynxPluginFrame] Loaded token, length=' + (token ? token.length : 0))
        setAccessToken(token)
      } catch (e) {
        console.error('[LynxPluginFrame] Failed to load token: ' + e)
        setAccessToken('')
      }
    })()
  }, [])

  /*
   * `playerState` rides along with the initial props on purpose.
   *
   * The push channel below only carries *changes*, so a child that boots after a
   * change — or is re-entered after being kept alive off screen — would otherwise
   * never learn the current state. globalProps is the one delivery that is
   * guaranteed: the host sets it before `url` (so the first render sees it) and
   * merges a fresh snapshot on every `open`, which is what a re-entry is.
   *
   * This replaces a `loaded` gate that never opened on Web: it was set from the
   * native `<frame>`'s `bindload`, and the Web branch renders a placeholder
   * `<view>` with no such event — so the player-state subscription was never
   * installed there at all. When the native push path gets wired, it should use
   * the same shape (snapshot in props, deltas over the bridge) rather than
   * reviving the gate.
   */
  const globalProps = {
    frameId,
    theme,
    hostVersion: '1.0.0',
    embed: isTabEntry,
    playerState: playerStateToJson(),
    access_token: accessToken,
  }

  // Web path: manage the nested <lynx-view> via the frame host module
  useEffect(() => {
    const mod = getLynxFrameModule()
    if (!mod.available) return

    mod.open(bundleUrl, '#plugin-lynx-frame', JSON.stringify(globalProps), entryPath)

    // Handle host calls from the child frame
    setLynxFrameBridgeHandlers({
      onMessage: (payload: LynxFrameHostCallPayload) => {
        const req = { ns: payload.ns, method: payload.method, params: JSON.parse(payload.params || '{}') }
        void handlePluginHostCall(req, hostContext).then((result) => {
          mod.hostReply(payload.callId, JSON.stringify(result))
        })
      },
    })

    return () => {
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
        if (mod.available) mod.updateGlobalProps(JSON.stringify({ theme: newTheme }))
      }
    })
    return unsub
  }, [isWeb])

  // Push player state changes to the child (the initial snapshot travels in
  // globalProps — see above).
  useEffect(() => {
    if (!isWeb) return
    return usePlayerStore.subscribe((state, prev) => {
      const sig = `${state.currentIndex}|${state.isPlaying}|${state.currentSong?.id}|${state.playMode}|${state.playlist.length}`
      const prevSig = `${prev.currentIndex}|${prev.isPlaying}|${prev.currentSong?.id}|${prev.playMode}|${prev.playlist.length}`
      if (sig === prevSig) return
      const stateJson = JSON.stringify(playerStateToJson())
      if (isWeb) {
        const mod = getLynxFrameModule()
        if (mod.available) mod.sendEvent('SongloftPluginBridge.push', JSON.stringify({ event: 'playerState', data: stateJson }))
      }
      // Native path: NativeModules.SongloftPluginBridge.pushToChild(frameId, 'playerState', stateJson)
      // Will be wired in Phase 5 when the TS NativeModule facade is complete
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

  // Native: <frame> directly loads the bundle
  return (
    <frame
      src={bundleUrl}
      global-props={globalProps}
      className="plugin-webview__frame"
      data-testid="plugin-lynx-frame"
    />
  )
}
