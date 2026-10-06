/**
 * Patch @lynx/xelement_webview to enable DOM storage (localStorage) in the
 * HarmonyOS webview.
 *
 * By default, ArkWeb's Web component does not enable DOM storage, which causes
 * `localStorage` to be `null` in plugin pages. This breaks plugins that rely
 * on localStorage for authentication tokens (e.g., miot plugin's common.js
 * tries to call `localStorage.setItem('songloft-auth', ...)` and throws
 * "Cannot read properties of null (reading 'setItem')").
 *
 * The fix adds `.domStorageAccess(true)` to the Web component configuration
 * in UIWebView.ets.
 *
 * Invoked by the `harmony:postinstall` script (or manually after `ohpm install`).
 * Idempotent: skips if the marker is already present.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(import.meta.url)
const repoRoot = resolve(here, '..', '..')

// The xelement_webview package is installed in harmony/oh_modules
const webViewPath = resolve(
  repoRoot,
  'harmony',
  'oh_modules',
  '.ohpm',
  '@lynx+xelement_webview@4.0.1',
  'oh_modules',
  '@lynx',
  'xelement_webview',
  'src',
  'main',
  'ets',
  'UIWebView.ets',
)

if (!existsSync(webViewPath)) {
  if (process.argv.includes('--required'))
    throw new Error('[patch-harmony-webview] required UIWebView.ets not found')
  console.log('[patch-harmony-webview] UIWebView.ets not found, skipping')
  process.exit(0)
}

const content = readFileSync(webViewPath, 'utf-8')

// Check if already patched
if (content.includes('.domStorageAccess(true)')) {
  console.log('[patch-harmony-webview] Already patched')
  process.exit(0)
}

// Find the Web component configuration and add domStorageAccess
const marker = '.backgroundColor(Color.Transparent)'
const oldText = marker
const newText = marker + '\n        .domStorageAccess(true)'

if (!content.includes(oldText)) {
  console.error(
    '[patch-harmony-webview] Unexpected: pattern not found in UIWebView.ets',
  )
  process.exit(1)
}

const patched = content.replace(oldText, newText)
writeFileSync(webViewPath, patched)
console.log(
  '[patch-harmony-webview] Patched UIWebView.ets to enable DOM storage',
)
