import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

import { classTokens, openingTags } from '../../testing/jsx-classes.js'

/**
 * `--nav-inset` (the floating-capsule tail) may only be consumed in the three
 * shapes that actually reserve space, and must always carry `--safe-bottom`.
 *
 * Both halves of this gate come from a defect that was invisible in every other
 * check. Since the host renders full-screen, a scrolling page has to keep its last
 * row clear of the floating capsule *and* the home indicator; two ways of writing
 * that silently reserve nothing at all:
 *
 *  1. **On the scroller.** A `<scroll-view>`'s own `padding-bottom` does not extend
 *     its scroll range on iOS Lynx. Measured: `scrollRange` stayed at the child's
 *     height (910) and `maxScrollOffset` at `child − viewport` with that padding at
 *     `var(--nav-inset)` and at a literal `200px` alike — the value is never
 *     consulted. Nine pages shipped like this; the tail they thought they had was
 *     always 0, so the last row ended under the capsule.
 *  2. **On the page root.** `padding-bottom` there shortens the whole page box, so
 *     the scroller inside stops ~114px above the screen edge. Nothing is occluded,
 *     but content no longer runs under the home indicator — the bottom band shows
 *     bare background, which reads as "底部区域没有内容".
 *
 * The shapes that do work are a spacer element's `height` (what AGENTS.md §3.4
 * already prescribed for `<list>` pages), an in-flow toolbar's `margin-bottom`, and
 * `padding-bottom` on the scroller's *content* wrapper. The scroller set is derived
 * from the TSX rather than hand-listed, so a new `<scroll-view>` is covered the
 * moment it is written.
 *
 * `--safe-bottom` is required at every site because `.shell__body` deliberately does
 * NOT absorb it (that would shorten every viewport, i.e. defect 2 all over again),
 * and it has to be added at the use site rather than baked into `--nav-inset` — a
 * `calc()` inside a custom property never sees an inline override on iOS, which
 * makes the token invalid at computed-value time and drops the declaration to 0
 * (see ShellLayout.css and `inline-token-indirection.test.ts`).
 */

const SRC = path.resolve(__dirname, '../../..')

function files(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return files(full, ext)
    return entry.endsWith(ext) ? [full] : []
  })
}

/**
 * Every class used on a `<scroll-view>` / `<list>` / `VirtualList`, derived from the
 * TSX through the **shared** JSX scanner.
 *
 * Not a local regex: `className` here is routinely a ternary or a template
 * (`className={isDualColumn ? 'settings__scroll settings__scroll--dual' :
 * 'settings__scroll'}`), and a naive pattern captures only `isDualColumn ?` — so the
 * scroller set comes back missing exactly the pages that need it most, and the gate
 * passes while blind. `jsx-classes.ts` already handles interpolation and ternaries
 * (it was written for the a11y gate after that same class of miss), so reuse it:
 * "反推清单只有它的解析器那么宽".
 */
function scrollerClasses(): Set<string> {
  const found = new Set<string>()
  for (const file of files(SRC, '.tsx')) {
    const src = readFileSync(file, 'utf8')
    for (const tag of openingTags(src)) {
      if (!/^<(?:scroll-view|list|VirtualList)\b/.test(tag)) continue
      for (const cls of classTokens(tag)) found.add(cls)
    }
  }
  return found
}

interface NavInsetUse {
  file: string
  selector: string
  property: string
  value: string
}

function navInsetUses(): NavInsetUse[] {
  const uses: NavInsetUse[] = []
  for (const file of files(SRC, '.css')) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].split(/\s+/).filter(Boolean).join(' ')
      for (const decl of m[2].matchAll(/([\w-]+)\s*:\s*([^;]*--nav-inset[^;]*)/g)) {
        uses.push({
          file: path.relative(SRC, file),
          selector,
          property: decl[1]!,
          value: decl[2]!.trim(),
        })
      }
    }
  }
  return uses
}

test('the derivation is non-empty and catches the known scrollers', () => {
  const scrollers = scrollerClasses()
  // Guards the scan itself: an empty set would make every assertion below pass.
  expect(scrollers.size).toBeGreaterThan(5)
  for (const cls of ['home__scroll', 'settings__scroll', 'subpage__scroll', 'add-songs__form']) {
    expect(scrollers, `${cls} should be derived from the TSX`).toContain(cls)
  }
})

test('every --nav-inset consumer also carries --safe-bottom', () => {
  const uses = navInsetUses()
  expect(uses.length).toBeGreaterThanOrEqual(12)
  const missing = uses.filter((u) => !u.value.includes('--safe-bottom'))
  expect(
    missing.map((u) => `${u.file} ${u.selector} { ${u.property}: ${u.value} }`),
    'the home-indicator inset has to be added at the use site — .shell__body does '
    + 'not absorb it, and --nav-inset itself must stay a plain length',
  ).toEqual([])
})

/**
 * The classes on the selector's **target** element only.
 *
 * A descendant selector like `.shell--narrow .home__scroll .home__content` mentions
 * a scroller but targets the content wrapper, which is exactly the legal case — so
 * scanning every class in the selector would flag the fix instead of the defect.
 * Comma groups are handled by the caller splitting first.
 */
function targetClasses(selector: string): string[] {
  return selector.split(',').flatMap((part) => {
    const last = part.trim().split(/[\s>+~]+/).filter(Boolean).pop() ?? ''
    return [...last.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!)
  })
}

test('no scroller reserves the tail with its own padding', () => {
  const scrollers = scrollerClasses()
  const uses = navInsetUses()
  const bad = uses.filter((u) => targetClasses(u.selector).some((c) => scrollers.has(c)))
  expect(
    bad.map((u) => `${u.file} ${u.selector} { ${u.property}: … }`),
    'a <scroll-view>/<list> padding-bottom does not extend its scroll range on iOS; '
    + 'use a spacer element (height), or put the padding on the content wrapper',
  ).toEqual([])
})

test('the tail is only reserved by height, margin-bottom, or a content wrapper', () => {
  const uses = navInsetUses()
  const bad = uses.filter((u) => {
    if (u.property === 'height' || u.property === 'margin-bottom') return false
    if (u.property === 'padding-bottom') {
      // The scroller's content wrapper — the one place padding is real content height.
      return !targetClasses(u.selector).some((c) => c.endsWith('__content'))
    }
    return true
  })
  expect(
    bad.map((u) => `${u.file} ${u.selector} { ${u.property}: ${u.value} }`),
    'padding-bottom on a page root shortens the viewport so content stops above the '
    + 'screen edge; only a __content wrapper may pad',
  ).toEqual([])
})
