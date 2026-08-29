import { useCallback, useEffect, useRef, useState } from '@lynx-js/react'

import { appConfig } from '../../../core/config/app-config.js'
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
  const [loaded, setLoaded] = useState(false)
  const [theme, setTheme] = useState(() => resolveTheme(getAppTheme()))
  const isWeb = isWebPlatform()

  const globalProps = {
    frameId,
    theme,
    hostVersion: '1.0.0',
    embed: isTabEntry,
  }

  const onLoad = useCallback(() => {
    setLoaded(true)
  }, [])

  // Web path: manage the nested <lynx-view> via the frame host module
  useEffect(() => {
    if (!isWeb) return
    const mod = getLynxFrameModule()
    if (!mod.available) return

    mod.open(bundleUrl, '#plugin-lynx-frame', JSON.stringify(globalProps))

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
      mod.close()
    }
  }, [bundleUrl, isWeb])

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

  // Push player state to child
  useEffect(() => {
    if (!loaded) return
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
  }, [loaded, frameId, isWeb])

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
      bindload={onLoad}
      className="plugin-webview__frame"
      data-testid="plugin-lynx-frame"
    />
  )
}
