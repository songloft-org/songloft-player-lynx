import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
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

/**
 * The web-core asset directory both serve.mjs and copy-bundle-web.mjs use.
 *
 * Resolved through the symlink pnpm maintains — after a patch update several
 * `@lynx-js+web-core@…patch_hash=…` directories coexist under .pnpm, and
 * scanning for the first match reads a stale copy the installed tree never
 * references. All three consumers (serve.mjs, copy-bundle-web.mjs,
 * patch-web-core-client.mjs) resolve the same way; a regression here desyncs
 * what is served from what is patched.
 */
function webCoreStatic(): string {
  const link = path.join(repoRoot, 'node_modules', '@lynx-js', 'web-core')
  expect(existsSync(link), '@lynx-js/web-core is not installed').toBe(true)
  return path.join(realpathSync(link), 'dist', 'client_prod', 'static')
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
    // Exactly one ref, not one *distinct* ref: the only legitimate mention of the
    // bundle is `<lynx-view url=…>`. A second one would be a preload hint, which
    // the next test explains can never be served from cache.
    const bundleRefs = refs.filter((r) => r.endsWith('.bundle'))
    expect(bundleRefs, 'index.html must load exactly one bundle').toHaveLength(1)
    // copy-bundle-web.mjs renames dist/web/main.web.bundle → <dest>/main.lynx.bundle
    expect(read('scripts/copy-bundle-web.mjs')).toContain(
      `'${bundleRefs[0]!.replace(/^\//, '')}'`,
    )
  })

  /**
   * Preload hints on this page are a trap, and both halves of it were shipped
   * once before being measured.
   *
   * `crossorigin` makes the hint's credentials mode `omit` while web-core fetches
   * with a bare `fetch()` (`same-origin`); mismatched, the entry is never reused
   * and each asset downloads twice. Preloading `/main.lynx.bundle` is worse — it
   * cannot be reused *at all*, because web-core fetches it from a Worker
   * (`web-core-template-loader-thread.js`) and the preload cache is per-realm.
   * Measured page weight was 5270 KB with that hint vs 3346 KB without, first
   * content unchanged (~0.2 s).
   *
   * Both mistakes are silent apart from a console warning that reads like a
   * tuning suggestion ("preloaded … but not used within a few seconds"), so they
   * need a gate rather than a comment.
   */
  test('preload hints cannot be the self-defeating kind', () => {
    const preloads = [...html.matchAll(/<link\s+rel="preload"[^>]*>/g)].map((m) => m[0])
    for (const tag of preloads) {
      expect(
        tag,
        'a preload with crossorigin cannot match web-core\'s same-origin fetch, so the asset downloads twice',
      ).not.toContain('crossorigin')
      expect(
        tag,
        'the bundle is fetched from a Worker; the document preload cache is per-realm, so this only ever double-downloads 1.9 MB',
      ).not.toContain('.bundle')
    }
  })

  /**
   * Both writers of the deployed/served HTML rewrite the hashed wasm filenames
   * from the installed web-core. Their regexes have to still match the tags in
   * index.html — when the tags lost `crossorigin="anonymous"`, a pattern that
   * required it silently stopped matching, leaving stale hashes (a 404'd preload)
   * in the output with no error anywhere.
   */
  test('the wasm-preload rewriters still match the tags in index.html', () => {
    const wasmTags = [...html.matchAll(/<link\s+rel="preload"[^>]*\.module\.wasm"[^>]*>/g)]
      .map((m) => m[0])
    expect(wasmTags.length, 'expected wasm preload tags to rewrite').toBeGreaterThan(0)

    for (const [name, source] of [
      ['web/serve.mjs', read('web/serve.mjs')],
      ['scripts/copy-bundle-web.mjs', read('scripts/copy-bundle-web.mjs')],
    ] as const) {
      const literal = source.match(
        /\/<link rel="preload" as="fetch" href="\\\/web-core\\\/static\\\/wasm\\\/[^/]*\/g/,
      )
      expect(literal, `${name} must contain the wasm-preload rewrite regex`).toBeTruthy()
      // Rebuild the pattern from the source and check it actually matches.
      const pattern = new RegExp(
        literal![0].replace(/^\//, '').replace(/\/g$/, ''),
        'g',
      )
      for (const tag of wasmTags) {
        expect(
          tag.match(pattern),
          `${name}'s rewrite regex does not match ${tag} — it would leave stale hashes`,
        ).toBeTruthy()
      }
    }
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
 * Gate for the event-dispatch crash chain fixed in two layers:
 *
 * 1. `patches/@lynx-js__web-core@0.23.1.patch` (applied by pnpm) — the
 *    unminified `WASMJSBinding.js` guards `currentTarget` in `runWorklet` /
 *    `publishEvent`.
 * 2. `scripts/patch-web-core-client.mjs` (postinstall) — the same guard
 *    hand-minified into `client_prod`'s `web-core-main-chunk.js`.
 *
 * **Why.** `VerticalSlider` binds `global-bindmouseup`; when its popover is
 * unmounted, the element leaves the wasm DOM registry at flush, while the
 * stale global-bind EventInfo survives until the *next* flush's gc(). A
 * mouseup in that window dispatches with a dead `currentTarget`, and the
 * unguarded `generateTargetObject(undefined)` throws
 * `Cannot read properties of undefined (reading 'Symbol(uniqueId)')`. That
 * TypeError crosses the wasm boundary and poisons wasm-bindgen's externref
 * borrows — every later flush throws "recursive use of an object … unsafe
 * aliasing in rust" until the whole element tree is destroyed (blank page,
 * zero further errors). A guard-less reinstall (a botched `pnpm install`, an
 * upgrade renaming the minified identifiers) resurfaces it only as the
 * original crash, so both layers get asserted here.
 */
describe('web-core event-dispatch guards are applied on both code paths', () => {
  const link = realpathSync(path.join(repoRoot, 'node_modules', '@lynx-js', 'web-core'))

  test('WASMJSBinding drops events whose currentTarget is gone (pnpm patch)', () => {
    const src = readFileSync(
      path.join(link, 'dist', 'client', 'mainthread', 'elementAPIs', 'WASMJSBinding.js'),
      'utf8',
    )
    expect(
      (src.match(/!resolvedTarget \|\| !currentTarget/g) ?? []).length,
      'both runWorklet and publishEvent must early-return on a missing currentTarget '
        + '— see patches/@lynx-js__web-core@0.23.1.patch',
    ).toBe(2)
  })

  test('the minified main-thread chunk carries the same guard (postinstall patch)', () => {
    const src = readFileSync(
      path.join(link, 'dist', 'client_prod', 'static', 'js', 'async', 'web-core-main-chunk.js'),
      'utf8',
    )
    expect(
      src.includes('A=a??o;A&&o&&(') && src.includes('s=o??A;s&&A&&('),
      'runWorklet / publishEvent guard missing from web-core-main-chunk.js — '
        + 'run `node scripts/patch-web-core-client.mjs` and check for identifier renames',
    ).toBe(true)
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
 * The dev server must not serve bytes it read before the last build.
 *
 * `serve.mjs` keeps an in-memory file cache and sends `Cache-Control: no-cache`
 * — but the cache itself had no invalidation, so it held whatever it read first
 * until the process exited. After a `web:sync` the browser kept getting the
 * previous bundle, and a whole round of Web verification "failed" against code
 * that was never loaded (the tell was a Content-Length disagreeing with the file
 * on disk). Keyed by mtime+size, the cache refreshes itself.
 */
test('serve.mjs invalidates its file cache when a file changes on disk', () => {
  const serve = read('web/serve.mjs').replace(/\/\*[\s\S]*?\*\//g, '')
  expect(
    serve,
    'serveFile must stat the file (mtime/size) so a rebuilt bundle is re-read',
  ).toMatch(/statSync\(filePath\)/)
  expect(
    serve,
    'the cache entry must carry the mtime stamp it was read at',
  ).toMatch(/mtimeMs/)
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

/**
 * The standalone deploy-mode tag: three parties must agree, byte for byte.
 *
 * `web/index.html` tags the page as a standalone deploy (static server, no
 * backend behind the origin) via the `global-props` attribute — read
 * synchronously when web-core upgrades the element, so the tag reaches the
 * worker before the bundle runs (a `lynxviewready`-style assignment cannot:
 * that event does not exist in web-core 0.23.1). The worker reads it under
 * `GLOBAL_PROP_DEPLOY_MODE` in `app-config.ts`, and `copy-bundle-web.mjs
 * --embedded` strips the attribute for same-origin builds. If any one drifts,
 * an embedded page shows the API-address field and defaults to the dev
 * backend, or a standalone one hides the field and defaults to a server with
 * no API. Both fail only in a fresh browser (a stale persisted server URL
 * masks them), which is exactly why this needs a gate.
 */
describe('the deployMode host tag is consistent across its three parties', () => {
  const html = read('web/index.html')
  const copy = read('scripts/copy-bundle-web.mjs')
  const appConfig = read('src/core/config/app-config.ts')

  /** The exact attribute string — identical on both sides of the strip. */
  const TAG = `global-props='{"deployMode":"standalone"}'`

  test('the host page tags the standalone deploy as a lynx-view attribute', () => {
    expect(html).toContain(TAG)
  })

  test('the embedded copy pass strips exactly what the page writes', () => {
    // Same literal both sides — a rewording on one side leaves embedded builds
    // shipping the tag (the script throws at build time when the strip misses).
    expect(copy).toContain(TAG)
    expect(copy).toContain('--embedded')
  })

  test('the worker reads the same key the page writes', () => {
    expect(appConfig).toContain("export const GLOBAL_PROP_DEPLOY_MODE = 'deployMode'")
  })
})
