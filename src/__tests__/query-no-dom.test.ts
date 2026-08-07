import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

import { beforeAll, expect, test } from 'vitest'

/**
 * P0 spike (roadmap R11): can TanStack Query run in the Lynx no-DOM runtime?
 *
 * Findings — for query-core 5.101.x (the version bundled here):
 * - `focusManager` / `onlineManager` only touch `window` behind
 *   `typeof window !== "undefined"` guards and read `globalThis.document?.…`
 *   via optional chaining; `utils.isServer` is `typeof window === "undefined"`.
 * - therefore import + `new QueryClient()` + a query + invalidate never
 *   dereference a bare `window`/`document`/`self`/`navigator`. No pnpm patch is
 *   needed (unlike TanStack Router's `self.__TSR_ROUTER__`).
 *
 * We verify this the FAITHFUL way: (1) statically, against the exact dependency
 * source that gets bundled; (2) by executing the (esbuild-bundled, minified)
 * query-core in a realm shaped like the Lynx background thread — `self`,
 * `window`, `document`, `navigator` all `undefined` — and asserting a query
 * resolves + caches. `typeof` semantics are identical in Node and on device, so
 * the guards under test behave the same in this realm as on hardware. jsdom is
 * deliberately NOT used (it would provide a `window` and hide the truth).
 */

const require_ = createRequire(import.meta.url)

function findInPnpm(prefix: string, subpath: string): string {
  const store = path.resolve(__dirname, '../../node_modules/.pnpm')
  const dirs = readdirSync(store).filter((d) => d.startsWith(prefix))
  const dir = dirs.find((d) => d.includes('patch_hash')) ?? dirs[0]
  if (!dir) throw new Error(`cannot find ${prefix} in ${store}`)
  return path.join(store, dir, subpath)
}

// ── FAITHFUL CHECK 1 — the bundled dependency source only uses guarded globals ──

function readQueryCore(file: string): string {
  return readFileSync(
    findInPnpm('@tanstack+query-core@', `node_modules/@tanstack/query-core/build/modern/${file}`),
    'utf8',
  )
}

/**
 * Every `window.` member access in the source must be a `window.addEventListener`
 * / `window.removeEventListener` call — the only window usages, and all inside a
 * `if (typeof window !== "undefined" && ...)` guarded block. Any OTHER shape
 * (e.g. an eager `window.location`) would be an unguarded access that crashes a
 * window-less realm at import/construct time.
 */
function assertOnlyGuardedWindowAccess(src: string) {
  expect(src).toMatch(/typeof window !== "undefined"/)
  const accesses = [...src.matchAll(/\bwindow\.(\w+)/g)].map((m) => m[1])
  for (const member of accesses) {
    expect(['addEventListener', 'removeEventListener']).toContain(member)
  }
}

test('query-core focusManager only touches window behind a typeof guard and reads document optionally', () => {
  const src = readQueryCore('focusManager.js')
  assertOnlyGuardedWindowAccess(src)
  // isFocused() reads visibility via optional chaining — never a bare deref.
  expect(src).toMatch(/globalThis\.document\?\./)
})

test('query-core onlineManager only touches window behind a typeof guard', () => {
  assertOnlyGuardedWindowAccess(readQueryCore('onlineManager.js'))
})

test('query-core utils.isServer derives from typeof window', () => {
  expect(readQueryCore('utils.js')).toMatch(/typeof window === "undefined"/)
})

test('query-core still constructs an unguarded AbortController (our polyfill covers it)', () => {
  // Documents the risk our configureQueryGlobals() polyfill mitigates; if a
  // future query-core guards this, the polyfill simply becomes a no-op.
  expect(readQueryCore('query.js')).toMatch(/new AbortController\(\)/)
})

// ── EXECUTION CHECK — bundle + run in a Lynx-background-shaped realm ──

let minifiedQueryIIFE = ''

beforeAll(async () => {
  interface EsbuildBuildResult {
    outputFiles?: Array<{ text: string }>
  }
  interface EsbuildModule {
    build: (options: Record<string, unknown>) => Promise<EsbuildBuildResult>
  }
  const esbuildMain = findInPnpm('esbuild@', 'node_modules/esbuild/lib/main.js')
  const esbuild = require_(esbuildMain) as EsbuildModule
  const resolveDir = path.resolve(__dirname, '../..')
  // Bundle OUR actual query layer (configureQueryGlobals + createQueryClient),
  // so the no-op managers AND the AbortController polyfill are what run here.
  const queryClientPath = path.resolve(__dirname, '../lib/query/query-client.ts')

  const result = await esbuild.build({
    absWorkingDir: resolveDir,
    stdin: {
      contents: `
        import { configureQueryGlobals, createQueryClient } from ${JSON.stringify(queryClientPath)}
        configureQueryGlobals()
        globalThis.__run = (async () => {
          const qc = createQueryClient({
            defaultOptions: { queries: { gcTime: Infinity, retry: false } },
          })
          const value = await qc.fetchQuery({ queryKey: ['num'], queryFn: async () => 42 })
          const cached = qc.getQueryData(['num'])
          await qc.invalidateQueries({ queryKey: ['num'] })
          return { value, cached, hasAbort: typeof globalThis.AbortController !== 'undefined' }
        })()
      `,
      resolveDir,
      loader: 'ts',
    },
    bundle: true,
    minify: true,
    format: 'iife',
    write: false,
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  })
  minifiedQueryIIFE = result.outputFiles![0]!.text
})

function makeLynxLikeRealm(): Record<string, unknown> {
  const sandbox: Record<string, unknown> = {}
  sandbox.globalThis = sandbox
  // Lynx background thread shape: these are absent.
  sandbox.self = undefined
  sandbox.window = undefined
  sandbox.document = undefined
  sandbox.navigator = undefined
  // Timers/console the Lynx BTS realm does provide.
  sandbox.setTimeout = setTimeout
  sandbox.clearTimeout = clearTimeout
  sandbox.setInterval = setInterval
  sandbox.clearInterval = clearInterval
  sandbox.queueMicrotask = queueMicrotask
  sandbox.console = console
  sandbox.process = { env: { NODE_ENV: 'production' } }
  return sandbox
}

test('QueryClient imports, runs a query and invalidates in a self/window/document/navigator-less realm', async () => {
  const sandbox = makeLynxLikeRealm()
  vm.createContext(sandbox)
  // Constructing + configuring must not throw.
  expect(() => vm.runInContext(minifiedQueryIIFE, sandbox, { timeout: 5000 })).not.toThrow()

  expect(typeof sandbox.self).toBe('undefined')
  expect(typeof sandbox.window).toBe('undefined')
  expect(typeof sandbox.document).toBe('undefined')
  expect(typeof sandbox.navigator).toBe('undefined')

  const out = (await sandbox.__run) as { value: number; cached: number; hasAbort: boolean }
  expect(out.value).toBe(42)
  expect(out.cached).toBe(42)
  // The realm had no AbortController; our polyfill supplied one so the query ran.
  expect(out.hasAbort).toBe(true)
})
