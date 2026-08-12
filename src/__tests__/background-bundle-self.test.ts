import { createRequire } from 'node:module'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

import { beforeAll, expect, test } from 'vitest'

/**
 * Regression for the TanStack Router `self.__TSR_ROUTER__` device crash.
 *
 * Root cause: rspeedy resolves `@tanstack/router-core/isServer` via the `browser`
 * export condition, so the module constant `isServer === false`. router-core then
 * runs `self.__TSR_ROUTER__ = this` in the `RouterCore` constructor (the SWC
 * minifier even DCE-drops the `!(isServer ?? ...)` guard, making it
 * unconditional, and aliases the global `self` to a scope-hoisted local `x`). The
 * Lynx background (BTS) realm has `self` declared-but-`undefined`, so the write
 * throws `undefined is not an object (evaluating 'self.__TSR_ROUTER__ = this')`.
 *
 * Why earlier fixes failed: setting `globalThis.self = globalThis` (a shim import,
 * then a lynx.config BannerPlugin) does NOT make the *bare* identifier `self`
 * resolve in the Lynx BTS realm — bare `self` is a distinct binding from
 * `globalThis.self` there. A Node `vm` realm hid this because Node resolves bare
 * globals through `globalThis` properties, so those fixes passed locally yet
 * crashed on device.
 *
 * The actual fix: a pnpm patch of `@tanstack/router-core` guards the write with
 * `typeof self !== "undefined"` (`patches/@tanstack__router-core@*.patch`,
 * recorded in `pnpm-workspace.yaml`). `typeof` never throws on a
 * declared-but-undefined (or even undeclared) binding, so on device the write is
 * simply skipped. This removes the crash independent of Lynx global-resolution
 * semantics.
 *
 * These tests verify the fix the FAITHFUL way — statically, against the code that
 * actually runs on device (the patched dependency source and the emitted bundle)
 * — plus one execution check whose behaviour (`typeof`) is identical in Node and
 * on device.
 */

const require_ = createRequire(import.meta.url)

/** Resolve a package's directory inside the pnpm store by name prefix. */
function findInPnpm(prefix: string, subpath: string): string {
  const store = path.resolve(__dirname, '../../node_modules/.pnpm')
  // Prefer the patched instance (dir name contains `_patch_hash=`).
  const dirs = readdirSync(store).filter((d) => d.startsWith(prefix))
  const dir = dirs.find((d) => d.includes('patch_hash')) ?? dirs[0]
  if (!dir) throw new Error(`cannot find ${prefix} in ${store}`)
  return path.join(store, dir, subpath)
}

/**
 * FAITHFUL CHECK 1 — the dependency source that gets bundled is patched.
 * This is the code rspeedy compiles into the background bundle.
 */
test('router-core dependency source guards the __TSR_ROUTER__ write with typeof self', () => {
  const routerJs = findInPnpm(
    '@tanstack+router-core@',
    'node_modules/@tanstack/router-core/dist/esm/router.js',
  )
  const src = readFileSync(routerJs, 'utf8')
  const line = src
    .split('\n')
    .find((l) => l.includes('.__TSR_ROUTER__ = this'))
  expect(line, 'expected a __TSR_ROUTER__ write line').toBeTruthy()
  // Guard must precede the write on the same statement.
  expect(line).toMatch(/typeof self !== "undefined"[\s\S]*__TSR_ROUTER__ = this/)
})

/**
 * FAITHFUL CHECK 2 — the emitted device artifact has NO unguarded write.
 * Inspects the real minified `dist/main.lynx.bundle`. In minified form the guard
 * `typeof self !== "undefined"` becomes `void 0!==<id>` (or `<id>!==void 0`).
 */
test('built bundle contains no unguarded __TSR_ROUTER__ write', () => {
  const bundlePath = path.resolve(__dirname, '../../dist/main.lynx.bundle')
  if (!existsSync(bundlePath)) {
    console.warn('[skip] dist/main.lynx.bundle not built; run `pnpm run build`')
    return
  }
  const data = readFileSync(bundlePath, 'latin1')
  // The .lynx.bundle is a container: minified executable code PLUS an embedded
  // unminified debug-source section (doc-comments + the router's error-message
  // string literal both mention `self.__TSR_ROUTER__ = this`). We only care that
  // no *executable, unguarded* write survives — the guarded/patched write may
  // even be DCE'd (nothing reads it) and the device has confirmed no crash.
  const writes = [...data.matchAll(/__TSR_ROUTER__\s*=\s*this/g)]
  for (const w of writes) {
    const at = w.index ?? 0
    const before = data.slice(Math.max(0, at - 50), at)
    // Guarded executable write (minified `void 0!==X&&(` / unminified `typeof self`).
    const guarded = /typeof \w+ ?!==|void 0!==\w+&&\(|!==void 0&&\(/.test(before)
    // Non-executable: a doc-comment (`//`, `/*`, ` * `, backtick) or the
    // router's `evaluating '…'` error-message string literal.
    const nonExecutable = /\/\/|\/\*|\*\s|`|evaluating ['"]/.test(before)
    expect(
      guarded || nonExecutable,
      `unguarded executable __TSR_ROUTER__ write near: ${JSON.stringify(before)}`,
    ).toBe(true)
  }
})

/**
 * FAITHFUL CHECK 3 — the `AbortController` polyfill (lynx.config banner) lands in
 * the emitted bundle and is DEFINED BEFORE any `new AbortController` use.
 * TanStack Router's `loadClientRoute` + Query's fetch path do `new AbortController()`
 * unconditionally; Lynx's engine has none → `ReferenceError` on device without this.
 */
test('built bundle defines AbortController before it is used', () => {
  const bundlePath = path.resolve(__dirname, '../../dist/main.lynx.bundle')
  if (!existsSync(bundlePath)) {
    console.warn('[skip] dist/main.lynx.bundle not built; run `pnpm run build`')
    return
  }
  const data = readFileSync(bundlePath, 'latin1')
  // Polyfill assignment (minified: `<g>.AbortController=<C>`), and its first use.
  const defineAt = data.search(/\.AbortController\s*=/)
  const firstUseAt = data.search(/new\s+AbortController/)
  expect(defineAt, 'AbortController polyfill assignment missing from bundle').toBeGreaterThanOrEqual(0)
  if (firstUseAt >= 0) {
    expect(
      defineAt,
      'AbortController must be defined before the first `new AbortController`',
    ).toBeLessThan(firstUseAt)
  }
})

/**
 * FAITHFUL CHECK 4 — the `lynx.queueMicrotask` substitution (lynx.config banner)
 * lands in the bundle and is installed BEFORE anything reads that property.
 *
 * Lynx 4.0.0's host `lynx.queueMicrotask` throws from inside its own
 * implementation on device (`cannot read property 'getNativeLynx' of undefined`,
 * LynxError 20100). ReactLynx picks it up unconditionally when present —
 * `if (lynx.queueMicrotask) return (fn) => lynx.queueMicrotask(fn)` in
 * `runtime/lib/utils.js`, then `options.requestAnimationFrame = lynxQueueMicrotask`
 * in `runtime/lib/lynx.js` — so the broken function becomes **Preact's effect
 * scheduler** and every flush it schedules is silently dropped. The banner swaps
 * in the resolved-Promise microtask that ReactLynx itself falls back to.
 */
test('built bundle installs the lynx.queueMicrotask substitute before any use', () => {
  const bundlePath = path.resolve(__dirname, '../../dist/main.lynx.bundle')
  if (!existsSync(bundlePath)) {
    console.warn('[skip] dist/main.lynx.bundle not built; run `pnpm run build`')
    return
  }
  const data = readFileSync(bundlePath, 'latin1')
  // The banner is minified along with everything else: the bare global `lynx`
  // becomes a scope-hoisted alias, so match on the property write itself.
  const installAt = data.search(/\.queueMicrotask\s*=\s*function/)
  expect(
    installAt,
    'queueMicrotask substitution missing from bundle (lynx.config banner)',
  ).toBeGreaterThanOrEqual(0)

  // The banner guards itself with a `typeof lynx.queueMicrotask` check before
  // assigning, so a bare property read is expected *inside* the banner. What
  // must not precede the install is an actual CALL — that is how ReactLynx uses
  // it (`(fn) => lynx.queueMicrotask(fn)`).
  const calls = [...data.matchAll(/\.queueMicrotask\s*\(/g)].map((m) => m.index ?? 0)
  const earliestCall = calls.length > 0 ? Math.min(...calls) : -1
  if (earliestCall >= 0) {
    expect(
      installAt,
      'the substitute must be installed before anything calls lynx.queueMicrotask',
    ).toBeLessThan(earliestCall)
  }

  // And the banner must keep its own existence guard: substituting
  // unconditionally would break hosts that legitimately lack the property.
  const guardWindow = data.slice(Math.max(0, installAt - 400), installAt)
  expect(
    /typeof\s+\w+\.queueMicrotask|\.queueMicrotask\s*(?:!==?|==)/.test(guardWindow),
    'expected a typeof guard on lynx.queueMicrotask before the substitution',
  ).toBe(true)
})

/**
 * SECONDARY (execution) — the patched, minified createRouter does not throw in a
 * realm shaped like the Lynx background thread. `typeof self` behaves identically
 * in Node and on device, so this check is faithful for the guard under test.
 */
let minifiedRouterIIFE = ''

beforeAll(async () => {
  interface EsbuildBuildResult {
    outputFiles?: Array<{ text: string }>
  }
  interface EsbuildModule {
    build: (options: Record<string, unknown>) => Promise<EsbuildBuildResult>
  }
  const esbuildMain = findInPnpm('esbuild@', 'node_modules/esbuild/lib/main.js')
  const esbuild = require_(esbuildMain) as EsbuildModule

  const reactRouterDir = findInPnpm(
    '@tanstack+react-router@',
    'node_modules/@tanstack/react-router',
  )

  const result = await esbuild.build({
    absWorkingDir: reactRouterDir,
    stdin: {
      contents: `
        import { createRouter, createRootRoute, createMemoryHistory } from '@tanstack/react-router'
        const r = createRouter({
          routeTree: createRootRoute({}),
          history: createMemoryHistory({ initialEntries: ['/'] }),
          isServer: false,
        })
        globalThis.__OK__ = !!r
      `,
      resolveDir: reactRouterDir,
      loader: 'js',
    },
    bundle: true,
    minify: true,
    format: 'iife',
    write: false,
    conditions: ['browser'],
    define: { 'process.env.NODE_ENV': '"production"' },
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    logLevel: 'silent',
  })
  minifiedRouterIIFE = result.outputFiles![0]!.text
})

function makeReactStub(): Record<string, unknown> {
  const keys = [
    'createContext', 'createElement', 'cloneElement', 'isValidElement',
    'Component', 'PureComponent', 'Fragment', 'StrictMode', 'Suspense',
    'forwardRef', 'memo', 'lazy', 'useState', 'useEffect', 'useLayoutEffect',
    'useInsertionEffect', 'useRef', 'useMemo', 'useCallback', 'useReducer',
    'useContext', 'useSyncExternalStore', 'useDebugValue',
    'useImperativeHandle', 'useId', 'useTransition', 'startTransition',
    'useDeferredValue',
  ]
  const stub: Record<string, unknown> = { __esModule: true, version: '19.0.0' }
  stub.Children = { map: () => [], forEach: () => {} }
  for (const k of keys) stub[k] = () => ({})
  return stub
}

/**
 * Realm shaped like the Lynx background thread: `self`/`window`/`document` are
 * declared but `undefined`. Returns the thrown message, or null on success.
 */
function runInLynxLikeRealm(src: string): string | null {
  const sandbox: Record<string, unknown> = {}
  sandbox.globalThis = sandbox
  sandbox.process = { env: { NODE_ENV: 'production' } }
  sandbox.URLSearchParams = URLSearchParams
  sandbox.self = undefined
  sandbox.window = undefined
  sandbox.document = undefined
  // Lynx DOES provide timers (its clearTimeout is strict about Number args,
  // which our router-core patch guards). Provide standard ones here.
  sandbox.setTimeout = setTimeout
  sandbox.clearTimeout = clearTimeout
  const react = makeReactStub()
  sandbox.require = () => react
  vm.createContext(sandbox)
  try {
    vm.runInContext(src, sandbox, { timeout: 5000 })
    return null
  } catch (e) {
    return (e as Error).message
  }
}

test('patched minified router-core constructs without throwing in a self-less realm', () => {
  // Guard survives minification: the `typeof self` short-circuit skips the write.
  const err = runInLynxLikeRealm(minifiedRouterIIFE)
  expect(err).toBeNull()
})
