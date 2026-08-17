/**
 * Patch @lynx-js/web-core's bundled client.js to fix nativeModulesMap.
 *
 * web-core's LynxViewElement declares `nativeModulesMap` as a plain class field
 * (no initializer), which overwrites any value set on the DOM element before the
 * custom element is upgraded. This script replaces the class field with a
 * getter/setter, matching the `onNativeModulesCall` pattern that already works.
 *
 * Without this patch, `NativeModules` on the Web platform is always empty,
 * because `audio-host.js` sets `nativeModulesMap` on the element before upgrade,
 * but the constructor then overwrites it to `undefined`.
 *
 * Invoked by the `postinstall` script in package.json.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(import.meta.url)
const repoRoot = resolve(here, '..', '..')

const pnpmDir = resolve(repoRoot, 'node_modules', '.pnpm')
if (!existsSync(pnpmDir)) {
  console.log('[patch-web-core-client] No .pnpm directory, skipping')
  process.exit(0)
}

const entries = readdirSync(pnpmDir)
const match = entries.find(e => e.startsWith('@lynx-js+web-core@'))
if (!match) {
  console.log('[patch-web-core-client] @lynx-js/web-core not found, skipping')
  process.exit(0)
}

const clientJsPath = join(pnpmDir, match, 'node_modules', '@lynx-js', 'web-core', 'dist', 'client_prod', 'static', 'js', 'client.js')
if (!existsSync(clientJsPath)) {
  console.log('[patch-web-core-client] client.js not found at', clientJsPath)
  process.exit(0)
}

const content = readFileSync(clientJsPath, 'utf-8')

// Check if already patched
if (content.includes('#nm;get nativeModulesMap')) {
  console.log('[patch-web-core-client] Already patched')
  process.exit(0)
}

// Replace the class field `nativeModulesMap;` with a getter/setter
const OLD = 'nativeModulesMap;'
const NEW = '#nm;get nativeModulesMap(){return this.#nm}set nativeModulesMap(e){this.#nm=e};'

if (!content.includes(OLD)) {
  console.log('[patch-web-core-client] Unexpected: pattern not found in client.js')
  process.exit(1)
}

const patched = content.replace(OLD, NEW)
writeFileSync(clientJsPath, patched)
console.log('[patch-web-core-client] Patched client.js successfully')