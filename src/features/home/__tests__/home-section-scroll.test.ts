import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Regression for the batch-18b device bug: the home "My Playlists" / "My Radios"
 * strips could not be swiped on Android (they worked in the iOS simulator).
 *
 * Four independent causes, none of which any render test can see. All four were
 * isolated on an Android emulator, the last two only after `getScrollInfo` proved
 * the strip measured correctly (`scrollRange: 264`) and `scrollTo` moved `scrollX`
 * while nothing visibly moved:
 *
 *  1. `display: flex` + `gap` + `padding` were left on the `<scroll-view>` itself
 *     when a `<view>` was swapped for it. In Lynx `display` is layout-only — it
 *     decides how an element lays out *its own children* — so the cards became flex
 *     items of the scroller's own box. Every working `scroll-y` in this repo splits
 *     these roles (`.home__scroll` sizes, `.home__content` lays out).
 *  2. The attribute was the deprecated `scroll-x`. Its replacement is
 *     `scroll-orientation`, whose default is `vertical`, and the legacy alias is
 *     registered per platform — which is exactly why iOS kept working. Lynx's
 *     hyphenated JSX attributes are exempt from TypeScript's unknown-property
 *     check, so neither `tsc` nor the build said a word (same class of silent
 *     failure as batch 19's `placeholder-color`).
 *  3. The inner row had no `width: max-content`, so it was laid out at the
 *     scroll-view's width and the cards overflowed it. What a scroller translates is
 *     that row — a row exactly as wide as the viewport has nowhere to slide.
 *  4. `<refresh>` swallows horizontal gestures outright. It has no gesture filter,
 *     so the strip disables pull-to-refresh while a finger is on it. Removing
 *     `<refresh>` from the tree was what finally isolated this.
 */

const SRC = path.resolve(__dirname, '../../..')

function filesWithExt(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return filesWithExt(full, ext)
    return entry.endsWith(ext) ? [path.relative(SRC, full)] : []
  })
}

/** Source with comments stripped — prose naming an attribute must not count as using it. */
function code(relPath: string): string {
  return readFileSync(path.join(SRC, relPath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

test('the home strip scrolls horizontally via scroll-orientation, not deprecated scroll-x', () => {
  const src = code('features/home/widgets/HomeSection.tsx')
  expect(src).toMatch(/scroll-orientation='horizontal'/)
  // Coordinate with the vertical page scroller instead of fighting it.
  expect(src).toMatch(/enable-nested-scroll=\{true\}/)
})

test('the vertical scroll-view uses enable-nested-scroll to coordinate with the refresh wrapper', () => {
  const page = code('features/home/pages/HomePage.tsx')
  expect(page).toMatch(/enable-refresh=\{true\}/)
  expect(page).toMatch(/enable-nested-scroll=\{true\}/)
})

/**
 * Web has no `<refresh>`: web-core's `LYNX_TAG_TO_HTML_TAG_MAP` has no entry for
 * it, and web-elements registers `x-refresh-view`/`x-refresh-header` — so both
 * tags reach the DOM as unknown elements and the header's label renders as plain
 * page content ("下拉刷新…" pinned under the greeting).
 *
 * Two earlier attempts failed here. `finishRefresh()` in a mount effect raced the
 * element; then `enable-refresh={!isWeb}` looked right but never fired, twice over
 * — the attribute cannot hide an element web-elements does not know, and `isWeb`
 * came from `isWebEnvironment()`, which probes `window`/`document` and therefore
 * answers `false` in the web-core background *worker* where this render actually
 * runs. So: keep the platform test on `SystemInfo` (`isWebPlatform`), and keep the
 * wrapper out of the tree on Web rather than trying to switch it off.
 */
test('the home page omits the refresh wrapper on Web instead of disabling it', () => {
  const page = code('features/home/pages/HomePage.tsx')
  expect(page).toMatch(/isWebPlatform\(\)/)
  expect(page).not.toMatch(/isWebEnvironment/)
  // The wrapper is a branch, not an always-rendered element with a flag.
  expect(page).toMatch(/isWeb\s*\?\s*<view className='home__scroll-host'>/)
  const platform = code('native/web-platform.ts')
  expect(platform).toMatch(/readSystemInfo\(\)\?\.\['platform'\]/)
})

test('no source file uses the deprecated scroll-x attribute', () => {
  // `scroll-y` is left alone deliberately: it is equally deprecated but harmless,
  // because `scroll-orientation` already defaults to `vertical`. `scroll-x` is the
  // one whose loss silently turns a horizontal scroller into a vertical no-op.
  const offenders = filesWithExt(SRC, '.tsx').filter((f) => /\bscroll-x\b/.test(code(f)))
  expect(offenders).toEqual([])
})

test('the strip separates sizing (scroll-view) from layout (inner row)', () => {
  const css = readFileSync(path.join(SRC, 'features/home/pages/HomePage.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  const scroll = /\.home-section__scroll\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  expect(scroll).toMatch(/width:\s*100%/)
  // A horizontal scroller needs a real height; without one it has no viewport.
  expect(scroll).toMatch(/height:\s*\d/)
  // The whole point: no flex container on the scroll-view itself.
  expect(scroll).not.toMatch(/display:\s*flex/)

  const row = /\.home-section__row\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  expect(row).toMatch(/display:\s*flex/)
  expect(row).toMatch(/flex-direction:\s*row/)
  // Without this the row is viewport-width and there is nothing to translate —
  // measured on device as scrollRange 264 with zero visible movement.
  expect(row).toMatch(/width:\s*max-content/)

  // Lynx skips the web's automatic min-content protection when resolving
  // flex-shrink, so cards without this compress to fit and kill the scroll range.
  const card = /\.home-section__row\s+\.playlist-card\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  expect(card).toMatch(/flex-shrink:\s*0/)

  // Square cover, overriding the library grid's 104px without touching that page.
  const cover = /\.home-section__row\s+\.playlist-card__cover\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  expect(cover).toMatch(/width:\s*120px/)
  expect(cover).toMatch(/height:\s*120px/)
})

/**
 * The attributes above are hyphenated, so TypeScript never checks them and a typo
 * would fail silently on device. The emitted template is the only place that proves
 * they survived — assert against what actually ships (AGENTS §5).
 */
test('the scroll attributes actually reach the emitted template', () => {
  const bundlePath = path.resolve(SRC, '../dist/main.lynx.bundle')
  if (!existsSync(bundlePath)) {
    console.warn('[skip] dist/main.lynx.bundle not built; run `pnpm run build`')
    return
  }
  const bundle = readFileSync(bundlePath, 'latin1')

  expect(bundle).toContain('scroll-orientation')
  expect(bundle).toContain('enable-nested-scroll')

  // `scroll-x` must not survive as an attribute. The bundle also embeds unminified
  // comments, and the ones in `HomeSection.tsx` mention the deprecated name — so
  // count only occurrences that are not inside a `//` comment line.
  const codeOnly = bundle.replace(/\/\/[^\n]*/g, '')
  expect(codeOnly).not.toContain('scroll-x')
})
