import { readNativeModules } from './native-modules.js'

interface SongloftPlatformNative {
  openURL(url: string): void
  pickAndUploadFile(
    uploadUrl: string,
    fieldName: string,
    mimeType: string,
    callback: (error: string | null, responseBody: string | null) => void,
  ): void
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
  return getModule() !== null
}

export function openURL(url: string): void {
  getModule()?.openURL(url)
}

export function pickAndUploadFile(uploadUrl: string, fieldName: string, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = getModule()
    if (!mod) {
      reject(new Error('SongloftPlatform native module not available'))
      return
    }
    mod.pickAndUploadFile(uploadUrl, fieldName, mimeType, (error, responseBody) => {
      if (error) {
        reject(new Error(error))
      } else {
        resolve(responseBody ?? '')
      }
    })
  })
}
