import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

import { beforeAll, expect, test } from 'vitest'

/**
 * i18n no-DOM / no-Intl safety (batch 9).
 *
 * The Lynx background realm has no `window` / `document` / `navigator` / `self`
 * and may have no `Intl`. We therefore (1) statically assert the bundled
 * i18next + react-i18next sources reference none of those DOM globals, and
 * (2) execute i18next core + our resources in a realm shaped like Lynx BTS —
 * all of those globals AND `Intl` `undefined` — proving init + `t` +
 * `changeLanguage` work with no detector, no DOM and no Intl. `typeof`
 * semantics are identical in Node and on device, so this is faithful. jsdom is
 * deliberately NOT used (it would supply a `window` and hide the truth).
 */

const require_ = createRequire(import.meta.url)

function findInPnpm(prefix: string, subpath: string): string {
  const store = path.resolve(__dirname, '../../node_modules/.pnpm')
  const dirs = readdirSync(store).filter((d) => d.startsWith(prefix))
  const dir = dirs.find((d) => d.includes('patch_hash')) ?? dirs[0]
  if (!dir) throw new Error(`cannot find ${prefix} in ${store}`)
  return path.join(store, dir, subpath)
}

// ── FAITHFUL CHECK 1 — bundled dependency source touches no DOM globals ──

function assertNoDomGlobals(src: string, label: string) {
  // No bare window/document/navigator/self member access anywhere.
  for (const g of ['window', 'document', 'navigator', 'self']) {
    const hits = [...src.matchAll(new RegExp(`\\b${g}\\b`, 'g'))]
    expect(hits.length, `${label} references \`${g}\` (${hits.length}×)`).toBe(0)
  }
}

test('i18next core source references no window/document/navigator/self', () => {
  const file = findInPnpm('i18next@', 'node_modules/i18next/dist/esm/i18next.js')
  assertNoDomGlobals(readFileSync(file, 'utf8'), 'i18next')
})

test('i18next only touches Intl behind typeof guards', () => {
  const src = readFileSync(
    findInPnpm('i18next@', 'node_modules/i18next/dist/esm/i18next.js'),
    'utf8',
  )
  // It DOES use Intl (plural/format), but always guards existence first.
  expect(src).toMatch(/typeof Intl/)
})

test('react-i18next source references no window/document/navigator/self', () => {
  const dir = findInPnpm('react-i18next@', 'node_modules/react-i18next/dist/es')
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    assertNoDomGlobals(readFileSync(path.join(dir, f), 'utf8'), `react-i18next/${f}`)
  }
})

// ── EXECUTION CHECK — i18next core + our resources in a Lynx-BTS-shaped realm ──

let minifiedI18nIIFE = ''

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
  const resourcesPath = path.resolve(__dirname, '../i18n/resources.ts')

  const result = await esbuild.build({
    absWorkingDir: resolveDir,
    stdin: {
      // Mirror `initI18n`'s config (no detector, compatibilityJSON v3 so plurals
      // never hit Intl.PluralRules, initImmediate:false for sync init).
      contents: `
        import i18next from 'i18next'
        import { resources } from ${JSON.stringify(resourcesPath)}
        i18next.init({
          resources, lng: 'en', fallbackLng: 'en',
          supportedLngs: ['en', 'zh'], compatibilityJSON: 'v3',
          initImmediate: false,
          interpolation: { escapeValue: false },
        })
        const home = i18next.t('nav.home')
        // Manual song-count interpolation (English) — proves no Intl.PluralRules.
        const count = i18next.t('common.songCountOther', { count: 5 })
        i18next.changeLanguage('zh')
        const homeZh = i18next.t('nav.home')
        globalThis.__run = { home, homeZh, count, hasIntl: typeof Intl !== 'undefined' }
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
  minifiedI18nIIFE = result.outputFiles![0]!.text
})

function makeLynxLikeRealm(): Record<string, unknown> {
  const sandbox: Record<string, unknown> = {}
  sandbox.globalThis = sandbox
  // Lynx background thread shape: none of these exist — and no Intl either.
  sandbox.self = undefined
  sandbox.window = undefined
  sandbox.document = undefined
  sandbox.navigator = undefined
  sandbox.Intl = undefined
  sandbox.setTimeout = setTimeout
  sandbox.clearTimeout = clearTimeout
  sandbox.queueMicrotask = queueMicrotask
  sandbox.console = console
  sandbox.process = { env: { NODE_ENV: 'production' } }
  return sandbox
}

test('i18next inits + translates + changes language with no DOM and no Intl', () => {
  const sandbox = makeLynxLikeRealm()
  vm.createContext(sandbox)
  expect(() => vm.runInContext(minifiedI18nIIFE, sandbox, { timeout: 5000 })).not.toThrow()

  expect(typeof sandbox.self).toBe('undefined')
  expect(typeof sandbox.window).toBe('undefined')
  expect(typeof sandbox.document).toBe('undefined')
  expect(typeof sandbox.navigator).toBe('undefined')
  expect(typeof sandbox.Intl).toBe('undefined')

  const out = sandbox.__run as {
    home: string
    homeZh: string
    count: string
    hasIntl: boolean
  }
  expect(out.hasIntl).toBe(false)
  expect(out.home).toBe('Home')
  expect(out.homeZh).toBe('首页')
  // Manual song-count interpolation works without Intl.PluralRules.
  expect(out.count).toBe('5 songs')
})
