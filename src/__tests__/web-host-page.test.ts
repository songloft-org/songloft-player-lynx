import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Gate for the Web deployable: `web/index.html` must reference files that
 * `scripts/copy-bundle-web.mjs` actually produces.
 *
 * **Why.** The host page asked for `/web-core/static/{css/index.css,js/index.js}`
 * — the dev-middleware naming — while the copy script ships @lynx-js/web-core's
 * `client_prod` assets, named `client.css` / `client.js`. So `build:web` emitted a
 * page that 404'd both entry files: `<lynx-view>` was never upgraded, nothing
 * rendered, and **no application-level error was logged**. It went unnoticed
 * because `web/serve.mjs` read a third directory (the dev middleware's
 * `www/static`, which does have `index.js`), so `web:dev` worked fine and even
 * headless-browser verification of Web fixes went through the working path.
 *
 * These assertions resolve against checked-in / installed inputs only, so they
 * need no prior build and cannot rot: if either side is renamed, this fails.
 */

const repoRoot = path.resolve(__dirname, '..', '..')
const read = (relative: string): string => readFileSync(path.join(repoRoot, relative), 'utf8')

/** The web-core asset directory both serve.mjs and copy-bundle-web.mjs use. */
function webCoreStatic(): string {
  const pnpmDir = path.join(repoRoot, 'node_modules', '.pnpm')
  const match = readdirSync(pnpmDir).find((e) => e.startsWith('@lynx-js+web-core@'))
  expect(match, '@lynx-js/web-core is not installed').toBeTruthy()
  return path.join(
    pnpmDir,
    match!,
    'node_modules',
    '@lynx-js',
    'web-core',
    'dist',
    'client_prod',
    'static',
  )
}

describe('web/index.html references files the build actually ships', () => {
  const html = read('web/index.html')

  /** Local (non-http) refs from href="…" / src="…" / url="…". */
  const refs = [...html.matchAll(/(?:href|src|url)="(\/[^"]+)"/g)].map((m) => m[1])

  test('the host page has local refs at all', () => {
    expect(refs.length).toBeGreaterThanOrEqual(4)
  })

  test.each(refs.filter((r) => r.startsWith('/web-core/static/')))(
    '%s exists in web-core client_prod',
    (ref) => {
      const relative = ref.replace('/web-core/static/', '')
      const target = path.join(webCoreStatic(), relative)
      expect(
        existsSync(target),
        `${ref} is not in client_prod/static — copy-bundle-web.mjs will never produce it`,
      ).toBe(true)
    },
  )

  /**
   * The filename mismatch was only half the bug. Once the names lined up, the
   * page was *still* black: client_prod's entry uses `import.meta`, so a classic
   * `<script>` throws "Cannot use 'import.meta' outside a module" — an uncaught
   * exception that never reaches `console.error`, leaving zero diagnostic. Only
   * `type="module"` works. (The dev-middleware build is a plain IIFE, hence the
   * long-lived illusion that `web:dev` proved anything about `build:web`.)
   */
  test('the web-core entry script is loaded as a module', () => {
    const tag = html.match(/<script[^>]*\/web-core\/static\/js\/[^>]*>/)
    expect(tag, 'no <script> tag loads the web-core entry').toBeTruthy()
    expect(
      tag![0],
      'client_prod uses import.meta — a classic script dies before registering <lynx-view>',
    ).toContain('type="module"')
  })

  test('the bundle ref matches the filename the copy script writes', () => {
    const bundleRefs = refs.filter((r) => r.endsWith('.bundle'))
    expect(bundleRefs, 'index.html must load exactly one bundle').toHaveLength(1)
    // copy-bundle-web.mjs renames dist/web/main.web.bundle → <dest>/main.lynx.bundle
    expect(read('scripts/copy-bundle-web.mjs')).toContain(
      `'${bundleRefs[0]!.replace(/^\//, '')}'`,
    )
  })

  test('audio-host.js is referenced and exists in web/', () => {
    const audioRefs = refs.filter((r) => r.endsWith('/audio-host.js'))
    expect(audioRefs, 'index.html must load audio-host.js').toHaveLength(1)
    expect(
      existsSync(path.join(repoRoot, 'web', 'audio-host.js')),
      'web/audio-host.js does not exist',
    ).toBe(true)
    expect(
      read('scripts/copy-bundle-web.mjs'),
      'copy-bundle-web.mjs must copy audio-host.js',
    ).toContain("'audio-host.js'")
  })
})

/**
 * `nativeModulesMap` values are **ESM URLs** the background worker `import()`s.
 * web-core does `Promise.all` over every entry, so a single value that is not a
 * resolvable URL — a plain object, or a path to a file that was never created /
 * copied — rejects the whole lot and `NativeModules` loses *every* custom module.
 * That is exactly how the file picker, the clipboard and Web audio were all
 * silently dead at once. These assertions keep each registered URL pointing at a
 * real file that the copy script ships.
 */
describe('nativeModulesMap points at real, shipped ESM modules', () => {
  const host = read('web/audio-host.js')
  const copyScript = read('scripts/copy-bundle-web.mjs')

  // Registration lines look like `SongloftAudio: '/songloft-audio-module.js',`.
  // Matching the whole file is safe: the dispatch site uses `=== 'SongloftAudio'`
  // (no colon) and the adapter variables are lowercase `songloftAudio`.
  const entries = [...host.matchAll(/Songloft\w+\s*:\s*([^,\n]+)/g)]
    .map((m) => m[1]!.trim())

  test('the map registers at least the platform and audio modules', () => {
    expect(entries).toContain("'/songloft-platform-module.js'")
    expect(entries).toContain("'/songloft-audio-module.js'")
  })

  test('every registered value is a URL string, not a plain object', () => {
    // A non-string value is the regression that sank everything: web-core does
    // `import(value)`, so an object becomes `import("[object Object]")`, rejects,
    // and `Promise.all` drops *every* custom module at once.
    for (const value of entries) {
      expect(
        value.startsWith("'") && value.endsWith("'"),
        `nativeModulesMap entry must be a URL string, got: ${value}`,
      ).toBe(true)
    }
  })

  const moduleUrls = entries
    .filter((v) => v.startsWith("'"))
    .map((v) => v.slice(1, -1))

  test.each(moduleUrls)('%s exists in web/ and is copied by the deploy script', (url) => {
    const file = url.replace(/^\//, '')
    expect(
      existsSync(path.join(repoRoot, 'web', file)),
      `web/${file} is registered in nativeModulesMap but does not exist`,
    ).toBe(true)
    expect(
      copyScript,
      `copy-bundle-web.mjs must copy ${file} or the deployed product 404s on it`,
    ).toContain(`'${file}'`)
  })

  test.each(moduleUrls)('%s has a default-export factory', (url) => {
    const file = url.replace(/^\//, '')
    const src = read(path.join('web', file))
    expect(
      src,
      `${file} must default-export the (nativeModules, call) => module factory web-core invokes`,
    ).toMatch(/export default function/)
  })
})

/**
 * The divergence that hid the bug: two copies of the same web-core, differing
 * only in entry filename. Keep the dev server and the deployable on one set.
 */
test('serve.mjs and copy-bundle-web.mjs resolve the same web-core assets', () => {
  const serve = read('web/serve.mjs')
  const copy = read('scripts/copy-bundle-web.mjs')
  for (const [name, source] of [
    ['serve.mjs', serve],
    ['copy-bundle-web.mjs', copy],
  ] as const) {
    expect(source, `${name} must use web-core's client_prod assets`).toContain('client_prod')
    expect(
      source,
      `${name} must not fall back to the dev middleware — its entry file is named differently`,
    ).not.toContain('web-rsbuild-server-middleware')
  }
})
