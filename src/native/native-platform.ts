import { readNativeModules } from './native-modules.js'
import { isWebEnvironment, webOpenURL, webPickAndUploadFile } from './web-platform.js'

interface SongloftPlatformNative {
  openURL(url: string): void
  pickAndUploadFile(
    uploadUrl: string,
    fieldName: string,
    mimeType: string,
    callback: (error: string | null, responseBody: string | null) => void,
  ): void
  setInsecureTls(enabled: boolean): void
  setClipboard(text: string): void
}

function getModule(): SongloftPlatformNative | null {
  const mods = readNativeModules()
  if (!mods) return null
  const mod = mods.SongloftPlatform as Record<string, unknown> | undefined
  if (!mod) return null
  if (typeof mod.openURL !== 'function') return null
  return mod as unknown as SongloftPlatformNative
}

export function isNativePlatformAvailable(): boolean {
  return getModule() !== null || isWebEnvironment()
}

export function openURL(url: string): void {
  const mod = getModule()
  if (mod) {
    mod.openURL(url)
  } else if (isWebEnvironment()) {
    webOpenURL(url)
  }
}

/**
 * Push the user's "allow insecure TLS" choice into the host transport.
 *
 * The interface declares `setInsecureTls` as **required** so `tsc` and the
 * native-module contract gate keep all three sides (TS / Kotlin / Swift) in
 * step — it was optional before, and the optional chain silently swallowed the
 * fact that iOS never implemented it at all.
 *
 * The runtime `typeof` check stays regardless: a JS bundle can be hot-updated
 * onto an older native shell, and calling a method that shell lacks would throw
 * on a path (login / server switch) where throwing is worse than not relaxing.
 *
 * No-op on Web — the browser owns certificate trust.
 */
export function applyInsecureTls(enabled: boolean): void {
  const mod = getModule()
  if (mod && typeof mod.setInsecureTls === 'function') {
    mod.setInsecureTls(enabled)
  }
}

export function pickAndUploadFile(uploadUrl: string, fieldName: string, mimeType: string): Promise<string> {
  const mod = getModule()
  if (mod) {
    return new Promise((resolve, reject) => {
      mod.pickAndUploadFile(uploadUrl, fieldName, mimeType, (error, responseBody) => {
        if (error) {
          reject(new Error(error))
        } else {
          resolve(responseBody ?? '')
        }
      })
    })
  }
  if (isWebEnvironment()) {
    return webPickAndUploadFile(uploadUrl, fieldName, mimeType)
  }
  return Promise.reject(new Error('SongloftPlatform native module not available'))
}

/**
 * Put `text` on the system clipboard.
 *
 * Lynx has no clipboard API of its own and the render realm has no
 * `navigator.clipboard`, so this goes through the platform module on all three
 * hosts. Fire-and-forget by design: every host's clipboard write is either
 * synchronous or best-effort, and there is nothing useful for a caller to do
 * about a failure — the caller shows its "copied" note either way, which is the
 * same bargain the Flutter reference makes.
 */
export function copyToClipboard(text: string): void {
  getModule()?.setClipboard(text)
}
