import { useEffect, useMemo, useRef, useState } from '@lynx-js/react'
import type { NodesRef } from '@lynx-js/types'
import { useTranslation } from 'react-i18next'
import { appConfig } from '../core/config/app-config.js'
import { getSongloftStorage } from '../core/storage/index.js'
import { openURL } from '../native/native-platform.js'
import { readLynxGlobal } from '../native/native-modules.js'
import { useBackHandler } from '../shared/nav/use-back-handler.js'
import { continueHostBack } from '../core/navigation/back-controller.js'
import { usePlayerStore } from '../features/player/store/index.js'
import {
  handlePluginHostCall,
  playerStateToJson,
  pluginPlayerStateChanged,
  type HostCallRequest,
} from '../features/jsplugin/domain/plugin-host-dispatch.js'
import { pluginHostContext } from '../features/jsplugin/domain/plugin-host-context.js'
import { createPluginBackBridge } from '../features/jsplugin/domain/plugin-back-bridge.js'
import {
  buildThemeMessage,
  subscribePluginAppearance,
} from '../features/jsplugin/domain/plugin-appearance-channel.js'
import { desktopCefInit } from './cef.js'
import { desktopCall, desktopConfig } from './client.js'

export function DesktopHtmlPluginFrame({
  entryPath,
  active = true,
  isTabEntry,
}: {
  entryPath: string
  active?: boolean
  isTabEntry: boolean
}) {
  const { t } = useTranslation()
  const node = useRef<NodesRef>(null)
  const activeRef = useRef(active)
  activeRef.current = active
  const windowVisible = useRef(desktopConfig()?.windowVisible !== false)
  const [src, setSrc] = useState('')
  const [canBack, setCanBack] = useState(false)
  const [failed, setFailed] = useState(false)
  const generation = useRef(0)
  const evaluate = (func: string) => {
    'background only'
    node.current?.invoke({ method: 'eval', params: { func } }).exec()
  }
  const send = (data: unknown) => {
    'background only'
    evaluate(
      `window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(data)}}))`,
    )
  }
  const back = useMemo(
    () =>
      createPluginBackBridge({
        send,
        onCanBack: setCanBack,
        onUnhandled: continueHostBack,
      }),
    [entryPath],
  )
  useBackHandler(active && canBack, () => back.requestBack())
  useEffect(() => () => back.dispose(), [back])
  const repaint = () => {
    'background only'
    if (activeRef.current && windowVisible.current && desktopConfig()?.os === 'win32')
      void desktopCall('window.repaintCef').catch(() => {})
  }
  const visibility = () => {
    evaluate(
      `window.__songloftSetVisible&&window.__songloftSetVisible(${activeRef.current && windowVisible.current})`,
    )
    repaint()
  }
  const snapshot = () => {
    send(buildThemeMessage())
    send({ type: 'songloft-player-state', state: playerStateToJson() })
    visibility()
  }
  useEffect(() => {
    let alive = true
    ++generation.current
    void getSongloftStorage()
      .secure.get('access_token')
      .then((token) => {
        if (!alive) return
        const params = `songloft_host=lynx&theme=${buildThemeMessage().theme}${isTabEntry ? '&embed' : ''}${token ? `&access_token=${encodeURIComponent(token)}` : ''}`
        setSrc(
          `${appConfig.baseUrl}${appConfig.basePath}/api/v1/jsplugin/${encodeURIComponent(entryPath)}/?${params}`,
        )
      })
      .catch(() => setFailed(true))
    const emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter')
    const onVisibility = (event: { visible?: boolean }) => {
      windowVisible.current = event.visible !== false
      visibility()
    }
    emitter?.addListener?.('SongloftDesktop.visibility', onVisibility)
    const stops = [
      subscribePluginAppearance(() => {
        if (activeRef.current) send(buildThemeMessage())
      }),
      usePlayerStore.subscribe((state, previous) => {
        if (activeRef.current && pluginPlayerStateChanged(state, previous))
          send({
            type: 'songloft-player-state',
            state: playerStateToJson(state),
          })
      }),
    ]
    return () => {
      alive = false
      ++generation.current
      stops.forEach((stop) => stop())
      emitter?.removeListener?.('SongloftDesktop.visibility', onVisibility)
    }
  }, [entryPath, isTabEntry])
  useEffect(() => {
    visibility()
    if (active) snapshot()
  }, [active])
  const onMessage = (event: { detail?: { msg?: string } }) => {
    'background only'
    try {
      const request = JSON.parse(event.detail?.msg ?? '') as HostCallRequest & {
        type?: string
        id?: unknown
        url?: unknown
      }
      if (
        request.type === 'songloft-desktop-external' &&
        typeof request.url === 'string'
      ) {
        openURL(request.url)
        return
      }
      if (back.receive(request)) return
      if (request.type !== 'songloft-host-call') return
      const current = generation.current
      void handlePluginHostCall(request, pluginHostContext)
        .then((result) => {
          if (generation.current === current)
            send({ type: 'songloft-host-reply', id: request.id, ...result })
        })
        .catch(() => {})
    } catch {
      /* Ignore non-Songloft browser messages. */
    }
  }
  if (failed) return <text>{t('jsplugin.webview_unavailable')}</text>
  if (!src) return <view className="plugin-webview__frame" />
  const initScript = desktopCefInit(src)
  // The Windows OSR renderer requires a shared GPU texture even on a
  // software-only display. Use CEF's native child window for that platform.
  const useOffscreenRenderer = desktopConfig()?.os === 'darwin'
  return (
    <webview
      ref={node}
      className="plugin-webview__frame"
      src={src}
      initjs={initScript}
      use-osr={useOffscreenRenderer}
      bindlayoutchange={repaint}
      bindload={() => {
        // CEF's frame-created hook does not consistently run its init script
        // in the committed document. Safe to repeat when it already ran.
        evaluate(initScript)
        snapshot()
        back.connect()
      }}
      bindmessage={onMessage}
      binderror={() => setFailed(true)}
      bindopenwindow={(event) => {
        if (event.detail?.url) openURL(event.detail.url)
      }}
    />
  )
}
