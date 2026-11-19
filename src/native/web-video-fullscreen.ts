import { readLynxGlobal, readNativeModules } from './native-modules.js'
import { isWebPlatform } from './web-platform.js'
import { safeClearTimeout } from './safe-timers.js'
import { desktopConfig } from '../desktop/client.js'
import { desktopFullscreenModule } from '../desktop/video.js'

interface FullscreenState {
  supported: boolean
  active: boolean
  needsGesture?: boolean
}
interface FullscreenHost {
  fullscreenState?: (json: string, callback: (json: string) => void) => void
  setFullscreen?: (json: string, callback: (json: string) => void) => void
}

function host(): FullscreenHost | undefined {
  if (desktopConfig()?.capabilities.video) return desktopFullscreenModule
  return isWebPlatform()
    ? (readNativeModules()?.SongloftVideo as FullscreenHost | undefined)
    : undefined
}

export function hasWebVideoFullscreen(): boolean {
  return typeof host()?.setFullscreen === 'function'
}

function invoke(
  method: 'setFullscreen' | 'fullscreenState',
  args: object,
): Promise<FullscreenState> {
  return new Promise((resolve, reject) => {
    const module = host()
    if (!module?.[method]) return resolve({ supported: false, active: false })
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error('Fullscreen request timed out'))
      }
    }, 5000)
    const finish = (raw: string) => {
      if (settled) return
      settled = true
      safeClearTimeout(timer as unknown as number)
      try {
        const result = JSON.parse(raw) as FullscreenState & { error?: string }
        if (result.error) reject(new Error(result.error))
        else
          resolve({
            supported: result.supported === true,
            active: result.active === true,
            needsGesture: result.needsGesture === true,
          })
      } catch (error) {
        reject(error)
      }
    }
    try {
      module[method]!(JSON.stringify(args), finish)
    } catch (error) {
      settled = true
      safeClearTimeout(timer as unknown as number)
      reject(error)
    }
  })
}

export function getWebVideoFullscreen(): Promise<FullscreenState> {
  return invoke('fullscreenState', {})
}
export function setWebVideoFullscreen({
  enabled,
  label = '',
}: {
  enabled: boolean
  label?: string
}): Promise<FullscreenState> {
  return invoke('setFullscreen', { enabled, label })
}

export function subscribeWebVideoFullscreen(listener: (active: boolean) => void): () => void {
  const emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter')
  if (!hasWebVideoFullscreen() || !emitter?.addListener || !emitter.removeListener) return () => {}
  let alive = true
  const callback = (raw: { active?: unknown }) => {
    if (alive) listener(raw?.active === true)
  }
  emitter.addListener('SongloftVideo.fullscreenChanged', callback)
  return () => {
    alive = false
    emitter.removeListener('SongloftVideo.fullscreenChanged', callback)
  }
}
