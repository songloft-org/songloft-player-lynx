/**
 * Web platform implementations for SongloftPlatform.
 *
 * Replaces the native module when running in a browser. Used by
 * `native-platform.ts` as a fallback when `NativeModules.SongloftPlatform`
 * is not available.
 */

import { readSystemInfo } from './native-modules.js'

/**
 * Detect if the **current realm** has a DOM, i.e. whether `window`/`document`
 * may be touched at all.
 *
 * This is NOT a platform check. On Web, `@lynx-js/web-core` runs the app's
 * background thread in a real `Worker` (`new Worker(…, {name:'lynx-bg'})`), and
 * a worker realm has neither `window` nor `document` — so this returns `false`
 * for most application code even though the platform *is* Web. Use it only to
 * guard the DOM calls below; use {@link isWebPlatform} for rendering decisions.
 */
export function isWebEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

/**
 * Detect if we're running **on the Web platform**, from either Lynx thread.
 *
 * `SystemInfo.platform` is `'web'` under `@lynx-js/web-core` (its
 * `systemInfoBase`) and `'Android'`/`'iOS'`/… on device; web-core forwards the
 * same object into the background worker, so unlike {@link isWebEnvironment}
 * this answer does not depend on which realm asks.
 *
 * Why this matters: `<refresh>`/`<refresh-header>` and `<webview>` have **no Web
 * implementation** — they are absent from web-core's `LYNX_TAG_TO_HTML_TAG_MAP`
 * and web-elements registers `x-refresh-view`/`x-webview` instead — so they land
 * in the DOM as unknown elements whose children render as ordinary content. That
 * has to be decided structurally at render time, which is exactly the code that
 * runs in the worker. `isWebEnvironment()` there is `false`, which is how the
 * home page kept shipping a permanently visible "下拉刷新…" label on Web.
 *
 * Read through the untyped bag rather than `SystemInfo.platform` directly: Lynx's
 * own `PlatformType` predates the Web target and does not list `'web'`.
 */
export function isWebPlatform(): boolean {
  const platform = readSystemInfo()?.['platform']
  return typeof platform === 'string' && platform.toLowerCase() === 'web'
}

/**
 * Open a URL in the system browser (new tab/window).
 * Returns `false` if the browser blocked the popup.
 */
export function webOpenURL(url: string): boolean {
  try {
    const w = window.open(url, '_blank', 'noopener,noreferrer')
    return w !== null
  } catch {
    return false
  }
}

/**
 * Pick a file using the browser's file picker, then upload it via HTTP
 * multipart/form-data to the given URL. Returns the server response body.
 *
 * @param uploadUrl - The URL to POST the file to.
 * @param fieldName - The form field name for the file.
 * @param mimeType - The accept MIME type for the file picker.
 */
export function webPickAndUploadFile(
  uploadUrl: string,
  fieldName: string,
  mimeType: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = mimeType
    input.style.display = 'none'
    document.body.appendChild(input)

    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      input.remove()
      if (!file) {
        reject(new Error('No file selected'))
        return
      }
      try {
        const form = new FormData()
        form.append(fieldName, file)
        const resp = await fetch(uploadUrl, {
          method: 'POST',
          body: form,
          // Include credentials if same-origin
          credentials: 'same-origin',
        })
        if (!resp.ok) {
          reject(new Error(`Upload failed: ${resp.status} ${resp.statusText}`))
          return
        }
        const text = await resp.text()
        resolve(text)
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })

    input.addEventListener('cancel', () => {
      input.remove()
      reject(new Error('File picker cancelled'))
    })

    input.click()
  })
}