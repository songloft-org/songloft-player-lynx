import { root, useEffect, useState } from '@lynx-js/react'
import { readLynxGlobal, readNativeModules } from '../native/native-modules.js'
import { createProbeDrawer } from './probe-draw.js'
import './probe.css'
import { desktopCall, desktopConfig } from './client.js'

interface ProbeStatus {
  lynxSdkVersion: string
  positionSeconds: number | null
  paused: boolean | null
  submittedFrames: number
  audioOutput: string | null
  error: string
}
interface ProbeModule {
  invoke(
    method: string,
    value: string,
    callback: (error: string | null, status: ProbeStatus | null) => void,
  ): void
}

// This screen deliberately exercises only the phase-one native combination.
// It does not implement SongloftAudio or mark desktop playback as delivered.
function Probe() {
  const options = readLynxGlobal()?.__globalProps?.songloftDesktopProbeOptions
  const initialSource = typeof options?.media === 'string' ? options.media : ''
  const [source, setSource] = useState(initialSource)
  const [status, setStatus] = useState<ProbeStatus | null>(null)
  const [error, setError] = useState('')
  const [cefVisible, setCefVisible] = useState(options?.cef === true)
  const invoke = (
    method: string,
    value = '',
    onStatus?: (next: ProbeStatus) => void,
  ) => {
    'background only'
    const module = readNativeModules()?.SongloftDesktopProbe as
      | ProbeModule
      | undefined
    if (!module || typeof module.invoke !== 'function') {
      setError('SongloftDesktopProbe native module is unavailable')
      return
    }
    module.invoke(method, value, (failure, next) => {
      if (failure !== null) setError(failure)
      else if (next) {
        setStatus(next)
        setError(next.error)
        if (options?.report === true)
          console.info('[SongloftDesktopProbe]', JSON.stringify(next))
        onStatus?.(next)
      }
    })
  }
  useEffect(() => {
    if (desktopConfig())
      void desktopCall('storage.get', {
        area: 'prefs',
        key: 'desktop.mode',
      }).then(
        (value) =>
          console.info(
            '[desktop-host-smoke]',
            JSON.stringify({ result: 'pass', mode: value }),
          ),
        (error) => console.error('[desktop-host-smoke]', error.message),
      )
    let timelineStarted: number | null = null
    let pauseRequested = false
    let resumeRequested = false
    // invoke() dispatches to the native element on the UI thread; all mpv
    // render/surface work stays there. Permit only one draw request at a time.
    const drawer = createProbeDrawer(
      () => readLynxGlobal()?.createSelectorQuery(),
      setError,
    )
    const drawTimer = setInterval(() => drawer.draw(), 33)
    const statusTimer = setInterval(
      () =>
        invoke('status', '', (next) => {
          if (options?.timeline !== true) return
          if (timelineStarted === null && (next.positionSeconds ?? 0) > 0.25)
            timelineStarted = Date.now()
          if (timelineStarted === null) return
          const elapsed = Date.now() - timelineStarted
          if (elapsed >= 1500 && !pauseRequested) {
            pauseRequested = true
            invoke('pause', 'yes')
          }
          if (elapsed >= 3500 && !resumeRequested) {
            resumeRequested = true
            invoke('pause', 'no')
          }
        }),
      500,
    )
    if (initialSource) invoke('load', initialSource)
    return () => {
      drawer.dispose()
      clearInterval(drawTimer)
      clearInterval(statusTimer)
    }
  }, [])

  return (
    <view className="desktop-probe">
      <text className="desktop-probe__title">
        Songloft · Desktop native probe / 桌面原生验证
      </text>
      <text>libmpv 0.41.0 · Lynxtron 0.0.31 · CEF 0.0.31</text>
      <text>
        Enter an absolute media path or HTTP(S) URL / 输入媒体绝对路径或 HTTP(S)
        地址
      </text>
      <input
        className="desktop-probe__input"
        maxlength={8192}
        bindinput={(event) => setSource(event.detail.value)}
      />
      <view className="desktop-probe__actions">
        <view
          className="desktop-probe__button"
          bindtap={() => invoke('load', source)}
        >
          <text>Load / 加载</text>
        </view>
        <view
          className="desktop-probe__button"
          bindtap={() => invoke('pause', 'yes')}
        >
          <text>Pause / 暂停</text>
        </view>
        <view
          className="desktop-probe__button"
          bindtap={() => invoke('pause', 'no')}
        >
          <text>Play / 播放</text>
        </view>
        <view
          className="desktop-probe__button"
          bindtap={() => setCefVisible(!cefVisible)}
        >
          <text>CEF / 浏览器</text>
        </view>
      </view>
      <text>{`Lynx=${status?.lynxSdkVersion ?? 'unknown'} · time=${status?.positionSeconds?.toFixed(3) ?? 'unknown'}s · paused=${status?.paused ?? 'unknown'} · audio=${status?.audioOutput ?? 'unknown'} · submitted frames=${status?.submittedFrames ?? 0}`}</text>
      <text className="desktop-probe__error">{error}</text>
      <view className="desktop-probe__surfaces">
        <songloft-mpv-probe
          id="mpv-probe"
          style={{ width: '60%', height: '100%' }}
        />
        {cefVisible && (
          <webview
            src={
              typeof options?.cefUrl === 'string'
                ? options.cefUrl
                : 'https://lynxjs.org/'
            }
            bindload={() => {
              if (options?.report === true)
                console.info('[SongloftDesktopProbe] CEF loaded')
            }}
            style={{ width: '40%', height: '100%' }}
          />
        )}
      </view>
    </view>
  )
}

root.render(<Probe />)
