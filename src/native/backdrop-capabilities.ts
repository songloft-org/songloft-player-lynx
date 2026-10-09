import { readLynxGlobal, readSystemInfo } from './native-modules.js'
import { getPlatformTarget } from './platform-target.js'

export const BACKDROP_CAPTURE_TARGET = 'songloft-backdrop'

/** Host registration, SDK and OS gates must all pass. Old hosts fail closed. */
export function getBackdropCapabilities() {
  const props = readLynxGlobal()?.__globalProps ?? {}
  const platform = getPlatformTarget()
  const system = readSystemInfo()
  // Runtime engineVersion is authoritative; LynxEnv may report a placeholder.
  const sdkVersion = system?.engineVersion ?? system?.lynxSdkVersion ?? props.backdropSdkVersion
  const version = typeof sdkVersion === 'string' ? /^(\d+)\.(\d+)(?:\.\d+)?(?:$|[-])/.exec(sdkVersion) : null
  const sdkSupported = platform === 'web' || (!!version && Number(version[1]) >= 4)
  const blur = sdkSupported && props.backdropBlurSupported === true
  return {
    blur,
    liquidGlass: blur && platform === 'ios' && props.liquidGlassSupported === true,
    androidCapture: blur && platform === 'android' && props.androidCaptureSupported === true,
    androidGlass:
      blur && platform === 'android' && props.androidCaptureSupported === true && props.androidGlassSupported === true,
    webGlass: blur && platform === 'web' && props.webGlassSupported === true,
    harmonyGlass: blur && platform === 'harmony' && props.harmonyGlassSupported === true,
  }
}
