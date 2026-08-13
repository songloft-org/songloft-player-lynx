/**
 * Web platform implementations for SongloftPlatform.
 *
 * Replaces the native module when running in a browser. Used by
 * `native-platform.ts` as a fallback when `NativeModules.SongloftPlatform`
 * is not available.
 */

/**
 * Detect if we're running in a Web environment (browser).
 */
export function isWebEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
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