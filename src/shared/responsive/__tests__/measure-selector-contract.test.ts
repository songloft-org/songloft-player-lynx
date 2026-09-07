import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Every `useBreakpoint()` / `useShellSeededBreakpoint()` call must pass a `measureSelector`.
 *
 * `bindlayoutchange` reports *changes*, and on Web it only ever fires for elements
 * present at first paint. A page that mounts on navigation therefore receives
 * nothing at all, leaving `width` at its initial `0` — which reads as breakpoint
 * `mobile` and silently kills every wide-screen branch on that page. The one-shot
 * `boundingClientRect` measurement the second argument enables is the only thing
 * that closes that hole (see the long comment in `useBreakpoint.ts`).
 *
 * This has now shipped twice: `SettingsPage`'s master–detail layout was dead on Web
 * from the day it shipped, and `FullPlayerPage` never reached its Swiper branch, so
 * the lyrics screen was unreachable and "auto-enter lyrics" could never fire. Both
 * were found by reading the hook, not by using the app — a wrong-but-plausible
 * narrow layout looks exactly like a correct narrow layout.
 *
 * Shell-internal pages now go through `useShellSeededBreakpoint(selector)`, which
 * both seeds from the shell cache (anti-flash, songloft-player-lynx#6) and always
 * forwards the selector to `useBreakpoint`. This contract checks both hook variants.
 *
 * Three assertions, each catching something the others cannot.
 */

const SRC = path.resolve(__dirname, '../../..')

/**
 * Files allowed to call a breakpoint hook without a selector, with the reason.
 *
 * Currently empty — `HomeSection` used to be here (it called `useBreakpoint()`
 * with no selector because `select()` returns only the first of several
 * instances), but that call was removed: `HomeSection` now receives `isWide` as
 * a prop from `HomePage`, which measures once via `useShellSeededBreakpoint`
 * (songloft-player-lynx#6). Kept as a set so a future exemption has a home.
 */
const MEASURE_EXEMPT = new Set<string>()

/**
 * Lower bound on call sites, so a broken regex cannot assert over an empty list.
 *
 * Counts both `useBreakpoint` and `useShellSeededBreakpoint` calls in `.tsx`
 * files. The shared hook's own internal `useBreakpoint` call lives in a `.ts`
 * file and is not scanned — it is structurally guaranteed to pass the selector.
 * Only counts real calls: `LibraryShell` mentions `useBreakpoint()` in a doc
 * comment and must not be counted, which is what the comment-stripping below
 * buys. Pages under a route layout that owns the breakpoint for them
 * (`AddSongsPage`, `CreatePlaylistPage`, `LibraryPage` — all under
 * `LibraryLayout`) are outside this gate by construction: they read its context
 * and never call the hook.
 */
const MIN_CALL_SITES = 6

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' ? [] : tsxFiles(full)
    }
    return entry.endsWith('.tsx') ? [full] : []
  })
}

interface CallSite {
  file: string
  /** Everything between the parentheses of the `useBreakpoint(...)` call. */
  args: string
}

/** `useBreakpoint(` or `useShellSeededBreakpoint(` … `)` — the argument list. */
const CALL = /(?:useBreakpoint|useShellSeededBreakpoint)\(([^)]*)\)/g
/** A string-literal class selector, e.g. `'.full-player'`. The selector is the
 *  second arg of `useBreakpoint` (after a comma) but the only arg of
 *  `useShellSeededBreakpoint`, so the match is position-independent. */
const SELECTOR_ARG = /'\.([\w-]+)'/

/**
 * `.tsx` files reachable from `file` through one hop of relative imports.
 *
 * One hop, not the transitive closure: a page composing the component whose root it
 * measures is the case to allow, and widening further would dilute the check until
 * almost any string passed.
 */
function localImports(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const dir = path.dirname(file)
  const out: string[] = []
  for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
    // Written as `.js` in source (NodeNext resolution), authored as `.tsx`.
    const resolved = path.resolve(dir, m[1]!.replace(/\.js$/, '.tsx'))
    if (resolved.endsWith('.tsx') && existsSync(resolved)) out.push(resolved)
  }
  return out
}

function callSites(): CallSite[] {
  const sites: CallSite[] = []
  for (const full of tsxFiles(SRC)) {
    // Strip comments so a call quoted in prose cannot be mistaken for a real one.
    const src = readFileSync(full, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const m of src.matchAll(CALL)) {
      sites.push({ file: path.basename(full), args: m[1]! })
    }
  }
  return sites
}

describe('useBreakpoint call sites pass a measureSelector', () => {
  const sites = callSites()

  test('the detection found the call sites it should have', () => {
    expect(
      sites.length,
      'Found fewer `useBreakpoint(...)` call sites than exist. The regex has probably '
      + 'gone stale — fix it rather than lowering the bound, or the two assertions '
      + 'below start passing over an empty list.',
    ).toBeGreaterThanOrEqual(MIN_CALL_SITES)
  })

  test.each(sites.map((s, i) => [`${s.file}#${i}`, s] as const))(
    '%s passes a selector',
    (_label, site) => {
      if (MEASURE_EXEMPT.has(site.file)) return
      expect(
        SELECTOR_ARG.test(site.args),
        `${site.file} calls useBreakpoint without a '.selector' second argument. On Web `
        + 'this page will never learn its width if it mounts on navigation, so every '
        + 'wide-screen branch in it is dead. Add the root element\'s class, or add the '
        + 'file to MEASURE_EXEMPT with a reason.',
      ).toBe(true)
    },
  )

  /**
   * The selector must name a class something in the caller's own subtree renders.
   *
   * A stale selector fails exactly like a missing one — `select()` matches nothing,
   * `fail` is a no-op by design, and the page keeps `width: 0`. Renaming a root
   * element's class is the obvious way to get there, and the assertion above cannot
   * see it, because the argument is still present and still well-formed.
   *
   * Scoped to the calling file **plus the local modules it imports**, not the file
   * alone: measuring the root of a child component is the normal arrangement
   * (`LibraryLayout` owns the hook, `LibraryShell` renders `.library-shell`).
   * Searching all of `src` instead would let a typo pass whenever it happened to
   * collide with some unrelated class.
   */
  test.each(sites.map((s, i) => [`${s.file}#${i}`, s] as const))(
    '%s measures a class its subtree renders',
    (_label, site) => {
      if (MEASURE_EXEMPT.has(site.file)) return
      const selector = SELECTOR_ARG.exec(site.args)?.[1]
      if (selector == null) return // already reported by the assertion above
      const full = tsxFiles(SRC).find((f) => path.basename(f) === site.file)!
      const rendered = new RegExp(
        `className=(?:'[^']*\\b${selector}\\b|\\{[^}]*\\b${selector}\\b)`,
      )
      const searched = [full, ...localImports(full)]
      expect(
        searched.some((f) => rendered.test(readFileSync(f, 'utf8'))),
        `${site.file} measures '.${selector}', but neither it nor any component it `
        + 'imports renders that class. The selector matches nothing, `select()` fails '
        + 'silently, and the page keeps width 0.',
      ).toBe(true)
    },
  )
})
