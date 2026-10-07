import '../../../shims/router-env.js'
import { describe, expect, test } from 'vitest'

import {
  DEFAULT_SUB_PAGE,
  SUB_PAGE_ROUTES,
  parentSubPage,
  type SettingsSubPage,
} from '../domain/sub-page-nav.js'
import { router } from '../../../router.js'

/**
 * Gate on the settings pane's navigation table.
 *
 * Two things can go wrong here and neither is visible on a narrow screen, which is
 * where most work happens:
 *
 * 1. **A sub-page maps to a path the router does not serve.** In dual-column mode
 *    the path is unused (the pane swaps in place), so a typo only surfaces when a
 *    narrow-screen user taps the row — or never, if nobody tests narrow.
 * 2. **A third-level page has no derivable parent.** Then the pane's back key and
 *    its parent-row highlight both fall back to "appearance", silently skipping the
 *    page the user drilled in from. That was the shipped behaviour for four pages
 *    before `parentSubPage` existed.
 *
 * Reverse-verified: pointing any entry at a non-existent path fails the first
 * describe; dropping `/settings/servers/add` from `route-back.ts`'s
 * `EXPLICIT_PARENTS` fails the second.
 */

/** Router leaf paths, with `$id`-style segments left symbolic. */
function routerPaths(): Set<string> {
  const out = new Set<string>()
  for (const route of Object.values(router.routesById) as Array<{
    fullPath?: string
    children?: unknown[]
  }>) {
    if (route.children && route.children.length > 0) continue
    if (typeof route.fullPath === 'string' && route.fullPath.length > 0) {
      out.add(route.fullPath)
    }
  }
  return out
}

const SUB_PAGES = Object.keys(SUB_PAGE_ROUTES) as SettingsSubPage[]

/**
 * The third-level pages: each is reached *through* a second-level page, so its
 * parent must resolve to that page and not to the default.
 */
const EXPECTED_PARENTS: Partial<Record<SettingsSubPage, SettingsSubPage>> = {
  'theme-catalog': 'appearance',
  duplicates: 'library',
  registry: 'plugins',
  'github-discovery': 'registry',
  licenses: 'about',
  'server-form': 'servers',
}

describe('SUB_PAGE_ROUTES', () => {
  const paths = routerPaths()

  test('the router walk actually found the route tree', () => {
    // Guards the walk itself: if `routesById` / `fullPath` change shape, this file
    // must not quietly start asserting over an empty set.
    expect(paths.size).toBeGreaterThanOrEqual(30)
    expect(paths).toContain('/settings/servers/add')
  })

  test('covers every sub-page the pane can show', () => {
    // The type is a total `Record`, so this is really a guard on the count: 17 rows
    // and drill-ins today. A member added to the union without a route here is a
    // compile error; this catches a member *removed* along with its assertions.
    expect(SUB_PAGES.length).toBe(18)
  })

  for (const page of SUB_PAGES) {
    test(`${page} maps to a real route`, () => {
      expect(paths).toContain(SUB_PAGE_ROUTES[page])
    })
  }

  test('no two sub-pages claim the same route', () => {
    const routes = SUB_PAGES.map((p) => SUB_PAGE_ROUTES[p])
    expect(new Set(routes).size).toBe(routes.length)
  })
})

describe('parentSubPage', () => {
  test('the default pane page is itself second-level', () => {
    // It is the fallback target for a back press with nowhere else to go, so a
    // third-level default would leave the pane one level deep with no way out.
    expect(parentSubPage(DEFAULT_SUB_PAGE)).toBeUndefined()
  })


  for (const [page, parent] of Object.entries(EXPECTED_PARENTS) as Array<
    [SettingsSubPage, SettingsSubPage]
  >) {
    test(`${page} returns to ${parent}`, () => {
      // `toBeDefined` is the half that matters: `undefined` is how callers spell
      // "no parent, fall back to the default page", which is the bug this table
      // exists to prevent. Asserting `!== DEFAULT_SUB_PAGE` would not work — the
      // theme store's parent legitimately *is* the default page (appearance).
      expect(parentSubPage(page)).toBeDefined()
      expect(parentSubPage(page)).toBe(parent)
    })
  }

  test('a second-level page has no parent sub-page', () => {
    // Their declared parent is `/settings` itself — the master list, which is not a
    // pane page. Callers read `undefined` as "fall back to the default page".
    for (const page of SUB_PAGES) {
      if (page in EXPECTED_PARENTS) continue
      expect(parentSubPage(page), `${page} should have no parent`).toBeUndefined()
    }
  })

  test('every drill-in ancestry terminates without a cycle', () => {
    for (const page of Object.keys(EXPECTED_PARENTS) as SettingsSubPage[]) {
      const parent = parentSubPage(page)
      expect(parent).toBeDefined()
      const visited = new Set<SettingsSubPage>([page])
      let current = parent
      while (current) {
        expect(visited.has(current)).toBe(false)
        visited.add(current)
        current = parentSubPage(current)
      }
    }
  })
})
