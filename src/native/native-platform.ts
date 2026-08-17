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
  /** Append one already-formatted line to the client log file (fire-and-forget). */
  logWrite(line: string): void
  /** Read the current client log file; content is `null` when no file exists. */
  logRead(callback: (error: string | null, content: string | null) => void): void
  /** Hand a base64-encoded file to the OS share sheet. */
  shareFile(
    base64: string,
    fileName: string,
    mimeType: string,
    callback: (error: string | null) => void,
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

/**
 * Append one already-formatted line to the native client log file.
 *
 * Fire-and-forget by design: logging must never throw into the code path being
 * logged, and there is nothing useful a caller could do about a write failure.
 * The `typeof` guard is the hot-update bargain (same as `applyInsecureTls`):
 * a JS bundle can land on an older native shell that lacks the method.
 * Returns `false` when the native module (or the method) is unavailable, so
 * the caller can fall back to its in-memory buffer (Web does this always).
 */
export function appendClientLog(line: string): boolean {
  const mod = getModule()
  if (mod && typeof mod.logWrite === 'function') {
    mod.logWrite(line)
    return true
  }
  return false
}

/**
 * Read the native client log file content, or `null` when no log file exists
 * yet / the native module is unavailable. Never rejects: log export treats an
 * unreadable client log as "no frontend logs", same as the Flutter reference.
 */
export function readClientLogFile(): Promise<string | null> {
  const mod = getModule()
  if (!mod || typeof mod.logRead !== 'function') return Promise.resolve(null)
  return new Promise((resolve) => {
    mod.logRead((error, content) => {
      resolve(error ? null : content)
    })
  })
}

/**
 * Hand a base64-encoded file to the OS share sheet (Android `ACTION_SEND`
 * chooser / iOS `UIActivityViewController`). The native side decodes, stages
 * the file in a shareable location and presents the sheet; the promise
 * resolves once the sheet was presented (not when the user finishes sharing —
 * the OS gives no completion signal worth waiting for).
 */
export function shareFile(base64: string, fileName: string, mimeType: string): Promise<void> {
  const mod = getModule()
  if (!mod || typeof mod.shareFile !== 'function') {
    return Promise.reject(new Error('SongloftPlatform.shareFile not available'))
  }
  return new Promise((resolve, reject) => {
    mod.shareFile(base64, fileName, mimeType, (error) => {
      if (error) {
        reject(new Error(error))
      } else {
        resolve()
      }
    })
  })
}
