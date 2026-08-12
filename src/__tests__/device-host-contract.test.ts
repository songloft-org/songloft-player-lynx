import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Gates for three device-only failures found in batch 29's on-device pass. Each
 * one built clean, typechecked clean, and passed the whole vitest suite while
 * being broken on a real Android device — which is exactly why they need static
 * gates rather than more render tests.
 */

const repoRoot = path.resolve(__dirname, '../..')

/**
 * GATE 1 — `<refresh>` needs `androidx.viewpager2` on the APK classpath.
 *
 * `xelement-refresh` embeds SmartRefreshLayout, and `SmartUtil.isContentView()`
 * resolves `androidx.viewpager2.widget.ViewPager2` while picking the scrollable
 * child. viewpager2 is NOT a transitive dependency of xelement-refresh, so
 * without an explicit declaration every `<refresh>` element throws
 * `NoClassDefFoundError` from `SmartRefreshLayout.onAttachedToWindow` (LynxError
 * 990200) and dies on attach — taking its whole subtree's gestures with it.
 *
 * Batches 20 and 25 both misdiagnosed this: batch 20 as "`<refresh>` swallows
 * horizontal gestures" (and added a touch-handshake workaround), batch 25 as a
 * "SmartRefreshLayout 3.0.0-alpha nested-scroll regression that cannot be
 * downgraded" (and added a manual refresh button). The container simply never
 * finished attaching. With viewpager2 present, pull-to-refresh works natively:
 * `refreshstatechange` → `startrefresh` → `finishRefresh` all fire on device.
 */
test('Android host declares androidx.viewpager2 (required by <refresh>)', () => {
  const gradle = readFileSync(
    path.join(repoRoot, 'android/app/build.gradle.kts'),
    'utf8',
  )
  expect(
    gradle,
    'androidx.viewpager2 missing — every <refresh> element will crash on attach',
  ).toMatch(/androidx\.viewpager2:viewpager2:/)
})

/**
 * GATE 2 — no dynamic `import()` in app source.
 *
 * A dynamic import makes rspeedy emit a separate lazy bundle under
 * `dist/lazy-bundle/`. Only `main.lynx.bundle` is copied into the app's assets
 * (see `scripts/copy-bundle-android.mjs`), so on a device the lazy fetch can
 * never resolve. Worse, two of these sat in the startup chain in `index.tsx`,
 * so the failure took `auth.hydrate()` / `auth.checkAuth()` down with it and
 * auth status stayed `unknown` forever (the route guard does not redirect on
 * `unknown`, which is why it looked like it worked).
 *
 * If code splitting is ever genuinely wanted, the lazy bundles must be shipped
 * in the host assets and resolvable there FIRST — then this gate can be
 * revisited deliberately rather than regressed into.
 */
test('app source contains no dynamic import() (lazy bundles do not ship in assets)', () => {
  const offenders: string[] = []

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx?$/.test(entry)) continue
      // Tests legitimately use `await import()` — that is the repo's
      // mock-then-load pattern (`vi.mock` must be registered before the module
      // under test is evaluated), and test code never ships to a device.
      if (/\.test\.tsx?$/.test(entry)) continue
      const src = readFileSync(full, 'utf8')
      src.split('\n').forEach((line, i) => {
        const code = line.trim()
        // Skip comment lines — the fix sites document `await import()` in prose.
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return
        // `import.meta` is not a dynamic import.
        const withoutMeta = line.replace(/import\s*\.\s*meta/g, '')
        if (/\bimport\s*\(/.test(withoutMeta)) {
          offenders.push(`${path.relative(repoRoot, full)}:${i + 1}: ${code}`)
        }
      })
    }
  }
  walk(path.join(repoRoot, 'src'))

  expect(
    offenders,
    `dynamic import() emits a lazy bundle that never reaches the device:\n${offenders.join('\n')}`,
  ).toEqual([])
})

/**
 * GATE 2b — and the artifact proves it: the build must emit exactly one bundle.
 * Removing the three dynamic imports also dropped 40 kB of lazy-loading
 * machinery (1516.6 kB → 1476.2 kB).
 */
test('build emits no lazy-bundle directory', () => {
  const dist = path.join(repoRoot, 'dist')
  if (!existsSync(dist)) {
    console.warn('[skip] dist not built; run `pnpm run build`')
    return
  }
  expect(
    existsSync(path.join(dist, 'lazy-bundle')),
    'dist/lazy-bundle exists — those files are not copied into the app assets',
  ).toBe(false)
})
