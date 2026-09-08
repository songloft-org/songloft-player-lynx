/**
 * Patch @lynx-js/web-core's bundled production files (client_prod) in place.
 *
 * Several fixes, all applied the same way — a literal string replacement on the
 * minified bundle — because a unified diff over a single-line 100 KB file would
 * embed two whole lines in the patch. The non-minified twin of each fix lives
 * in `patches/@lynx-js__web-core@0.23.1.patch` (applied by pnpm), which covers
 * the dev-middleware path; this script covers what serve.mjs and
 * copy-bundle-web.mjs actually ship.
 *
 * 1. `client.js` — `nativeModulesMap` is a plain class field on LynxViewElement
 *    (no initializer), overwriting any value set on the element before the
 *    custom element is upgraded. Replaced with a getter/setter, matching the
 *    `onNativeModulesCall` pattern that already works. Without it,
 *    `NativeModules` on the Web platform is always empty (see upstream issue
 *    lynx-stack#3559).
 *
 * 2. `web-core-main-chunk.js` — `runWorklet` / `publishEvent` guard only
 *    `target ?? currentTarget`, then generate `eventObject.currentTarget` from
 *    `currentTarget` unguarded. When the element that registered the handler
 *    was unmounted (its wasm DOM-registry entry is dropped at flush, while the
 *    stale global-bind EventInfo only dies at the next flush's gc()), a DOM
 *    event landing on any surviving element dispatches with a dead
 *    `currentTarget` and `generateTargetObject(undefined)` throws
 *    `Cannot read properties of undefined (reading 'Symbol(uniqueId)')`. That
 *    TypeError crosses the wasm boundary and poisons wasm-bindgen's externref
 *    borrows: every later flush throws "recursive use of an object detected
 *    which would lead to unsafe aliasing in rust" until the whole element tree
 *    is destroyed. The patch makes a missing `currentTarget` drop the event
 *    instead — there is no handler left to deliver to.
 *
 * Invoked by the `postinstall` script in package.json. Idempotent: each
 * replacement is skipped when its output marker is already present.
 */

import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(import.meta.url)
const repoRoot = resolve(here, '..', '..')

// Resolve through the symlink pnpm maintains at node_modules/@lynx-js/web-core.
// Scanning .pnpm for the first `@lynx-js+web-core@…` match instead grabs
// whichever patch-hash directory happens to be listed first — after a patch
// update several coexist, and this script silently patched a stale copy the
// installed tree never read (the tell: serve.mjs kept shipping the bug).
const webCoreLink = resolve(repoRoot, 'node_modules', '@lynx-js', 'web-core')
if (!existsSync(webCoreLink)) {
  console.log('[patch-web-core-client] @lynx-js/web-core not installed, skipping')
  process.exit(0)
}

// The symlink resolves straight to the installed package root.
const webCoreDir = realpathSync(webCoreLink)
if (!existsSync(join(webCoreDir, 'dist', 'client_prod'))) {
  console.log('[patch-web-core-client] Unexpected layout at', webCoreDir, '— skipping')
  process.exit(0)
}

/** A single minified-bundle replacement. `marker` is the patched form. */
const REPLACEMENTS = [
  {
    // Fix 1, on client.js (wasm-bindgen glue):
    // `nativeModulesMap;` class field → getter/setter (lynx-stack#3559).
    file: join('dist', 'client_prod', 'static', 'js', 'client.js'),
    marker: '#nm;get nativeModulesMap',
    oldText: 'nativeModulesMap;',
    newText: '#nm;get nativeModulesMap(){return this.#nm}set nativeModulesMap(e){this.#nm=e};',
  },
  {
    // Fix 2a, on web-core-main-chunk.js: runWorklet — guard currentTarget (minified `o`).
    // Unminified twin: WASMJSBinding.js runWorklet `if (!resolvedTarget || !currentTarget)`.
    file: join('dist', 'client_prod', 'static', 'js', 'async', 'web-core-main-chunk.js'),
    marker: 'A=a??o;A&&o&&(',
    oldText: 'A=a??o;A&&(',
    newText: 'A=a??o;A&&o&&(',
  },
  {
    // Fix 2b, on web-core-main-chunk.js: publishEvent — guard currentTarget (minified `A`).
    // Unminified twin: WASMJSBinding.js publishEvent `if (!resolvedTarget || !currentTarget)`.
    file: join('dist', 'client_prod', 'static', 'js', 'async', 'web-core-main-chunk.js'),
    marker: 's=o??A;s&&A&&(',
    oldText: 's=o??A;s&&(',
    newText: 's=o??A;s&&A&&(',
  },
  {
    // Fix 3a, on web-core-main-chunk.js: x-input placeholder colour.
    // web-elements hard-codes `--placeholder-color: grey` on the input part, and the
    // Lynx `-x-placeholder-color` property never reaches it on Web (the browser drops
    // the unknown property, and a document-scope `::part()` rule cannot pierce
    // lynx-view's shadow root), so every placeholder stayed the library grey. Point
    // the default at the theme's muted text colour — the same value the native side
    // uses (`-x-placeholder-color: var(--content-muted)`) — keeping `grey` as the
    // fallback for when the variable is undefined. Verified via Chrome CDP: the part
    // inherits `--content-muted` from `.theme-root` and the placeholder follows the
    // theme. (Setting the `placeholder-color` attribute per input also works but would
    // need the attribute on all ~16 fields; patching the default is the one-place fix.)
    file: join('dist', 'client_prod', 'static', 'js', 'async', 'web-core-main-chunk.js'),
    marker: 'x-input::part(input){--placeholder-color:var(--content-muted,grey)',
    oldText: 'x-input::part(input){--placeholder-color:grey',
    newText: 'x-input::part(input){--placeholder-color:var(--content-muted,grey)',
  },
  {
    // Fix 3b, same for x-textarea.
    file: join('dist', 'client_prod', 'static', 'js', 'async', 'web-core-main-chunk.js'),
    marker: 'x-textarea::part(textarea){--placeholder-color:var(--content-muted,grey)',
    oldText: 'x-textarea::part(textarea){--placeholder-color:grey',
    newText: 'x-textarea::part(textarea){--placeholder-color:var(--content-muted,grey)',
  },
  {
    // Fix 4, on web-elements.js: horizontal `initial-scroll-offset` restore.
    // `ScrollAttributes` computes `leftScrollDistance` for a `scroll-left` or
    // `initial-scroll-offset` attribute, but its condition tests
    // `scrollOrientation === 'vertical'` instead of `'horizontal'`. On a
    // horizontal scroll-view the initial offset therefore never reaches
    // `scrollLeft` and a remounted strip (the narrow library view switcher)
    // snaps back to the start. Native scrollers apply the offset along the
    // scroll axis; this keeps Web agreeing with them.
    file: join('dist', 'client_prod', 'static', 'js', 'async', 'web-elements.js'),
    marker: 'l=("scroll-left"===i||"initial-scroll-offset"===i)&&(""===o||"true"===o||"horizontal"===n||"both"===n)',
    oldText: 'l=("scroll-left"===i||"initial-scroll-offset"===i)&&(""===o||"true"===o||"vertical"===n||"both"===n)',
    newText: 'l=("scroll-left"===i||"initial-scroll-offset"===i)&&(""===o||"true"===o||"horizontal"===n||"both"===n)',
  },
]

let failures = 0
for (const { file, marker, oldText, newText } of REPLACEMENTS) {
  const filePath = join(webCoreDir, file)
  if (!existsSync(filePath)) {
    console.log(`[patch-web-core-client] ${file} not found, skipping`)
    continue
  }
  const content = readFileSync(filePath, 'utf-8')
  if (content.includes(marker)) {
    console.log(`[patch-web-core-client] ${file}: already patched`)
    continue
  }
  if (!content.includes(oldText)) {
    // A web-core upgrade renamed the minified identifiers: fail loudly rather
    // than ship the unpatched bundle and let the bug resurface at runtime.
    console.error(`[patch-web-core-client] Unexpected: pattern not found in ${file}`)
    failures++
    continue
  }
  writeFileSync(filePath, content.replace(oldText, newText))
  console.log(`[patch-web-core-client] ${file}: patched`)
}

process.exit(failures > 0 ? 1 : 0)
