import '../../../shims/router-env.js'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { resolveRouteBack, type RouteBackContext } from '../route-back.js'
import { setLastShellLocation, setNavPaths } from '../shell-navigation.js'
import { router } from '../../../router.js'
import { performRouteBack, resetBackRouterForTests, setBackRouter } from '../../../core/navigation/route-back-action.js'

/**
 * The coverage gate for back navigation.
 *
 * Back used to live one copy per page — 20-odd `navigate({ to: … })` calls in back
 * arrows — which is untestable in aggregate and left the hardware key with nothing
 * to read. Now every route's parent is declared in one pure function, so "is every
 * page handled?" becomes an assertion instead of a review question: this file walks
 * the router's **own** leaf routes and requires each to resolve to something
 * deliberate.
 *
 * Walking the router rather than a hand-written list is the point. A new route with
 * no declared parent fails here, rather than shipping and silently exiting the app
 * the first time someone presses back on it.
 */

const BUILT_IN_TABS = ['/', '/library', '/settings']

/** A stand-in value for each dynamic segment, so paths become concrete. */
const PARAM_SAMPLES: Record<string, string> = {
  $field: 'artist',
  $id: '7',
  $entryPath: 'some-plugin',
}

function concretePath(fullPath: string): string {
  return fullPath
    .split('/')
    .map((seg) => (seg.startsWith('$') ? (PARAM_SAMPLES[seg] ?? 'sample') : seg))
    .join('/')
}

/**
 * Every leaf route's path, from the router itself.
 *
 * Non-leaves are dropped: the root and the pathless `shell` layout route both
 * inherit `/` as their `fullPath`, which the Home route already covers.
 */
function leafRoutePaths(): string[] {
  const seen = new Set<string>()
  for (const route of Object.values(router.routesById) as Array<{
    fullPath?: string
    children?: unknown[]
  }>) {
    if (route.children && route.children.length > 0) continue
    const full = route.fullPath
    if (typeof full !== 'string' || full.length === 0) continue
    seen.add(concretePath(full))
  }
  return [...seen].sort()
}

function ctx(overrides: Partial<RouteBackContext> = {}): RouteBackContext {
  return {
    navPaths: BUILT_IN_TABS,
    lastShellLocation: '/',
    lastLibrarySearch: {},
    ...overrides,
  }
}

beforeEach(() => {
  setNavPaths(BUILT_IN_TABS)
  setLastShellLocation('/')
})

afterEach(() => resetBackRouterForTests())

describe('plugins opened from the installed list', () => {
  test('the plugin route keeps the manager source and ignores arbitrary return targets', () => {
    const route = Object.values(router.routesById).find((r) => r.fullPath === '/plugin/$entryPath')!
    const validate = route.options.validateSearch as (search: Record<string, unknown>) => unknown
    expect(validate({ from: 'manager' })).toEqual({ from: 'manager' })
    expect(validate({ from: 'https://example.com' })).toEqual({})
    expect(validate({ tab: true })).toEqual({ tab: true })
  })

  test.each([
    [BUILT_IN_TABS],
    [[...BUILT_IN_TABS, '/plugin/miot']],
  ])(
    'back returns to the manager with nav paths %j', (navPaths) => {
      expect(resolveRouteBack('/plugin/miot', ctx({
        navPaths,
        pluginManagerEntry: true,
        lastShellLocation: '/library',
      }))).toEqual({ kind: 'navigate', to: '/settings/plugins' })
    },
  )

  test('the shared back action reads the route source and returns to the manager', () => {
    const navigate = vi.fn()
    setBackRouter({
      state: { location: { pathname: '/plugin/miot', search: { from: 'manager' } } },
      navigate,
    } as never)
    expect(performRouteBack()).toBe(true)
    expect(navigate).toHaveBeenCalledWith({ to: '/settings/plugins' })
  })

  test('a nav tab entry still follows the tab exit policy', () => {
    expect(resolveRouteBack('/plugin/miot', ctx({
      navPaths: [...BUILT_IN_TABS, '/plugin/miot'],
      pluginTabEntry: true,
      pluginManagerEntry: true,
    }))).toEqual({ kind: 'exit-prompt' })
  })
})

describe('every route the app can be on has a declared back target', () => {
  const paths = leafRoutePaths()

  test('the walk actually found the route tree', () => {
    // Guards the walk itself: if `routesById` / `fullPath` ever change shape, this
    // file must not quietly start asserting over an empty list.
    expect(paths.length).toBeGreaterThanOrEqual(30)
    expect(paths).toContain('/player/eq')
    expect(paths).toContain('/player')
    expect(paths).toContain('/library/category/artist')
  })

  for (const pathname of leafRoutePaths()) {
    test(`${pathname} resolves deliberately`, () => {
      const action = resolveRouteBack(pathname, ctx())
      // `fallback` is the "nobody declared this" branch. It exists so a missed route
      // strands nobody at runtime, not as a legitimate outcome.
      expect(
        action.kind,
        `"${pathname}" has no declared parent — add it to shared/nav/route-back.ts. `
        + 'Without one the back key drops the user on the owning tab and logs a warning.',
      ).not.toBe('fallback')

      if (action.kind === 'navigate') {
        expect(action.to).not.toBe(pathname)
        expect(action.to.startsWith('/')).toBe(true)
      }
    })
  }
})

describe('tab roots offer to exit rather than navigating', () => {
  for (const tab of BUILT_IN_TABS) {
    test(tab, () => {
      expect(resolveRouteBack(tab, ctx()).kind).toBe('exit-prompt')
    })
  }

  test('login exits — there is nothing behind it', () => {
    expect(resolveRouteBack('/login', ctx()).kind).toBe('exit-prompt')
  })

  /**
   * Plugin tabs come from the backend, so the *same* path is a tab root or a
   * sub-page depending on configuration. Both directions are pinned because getting
   * this wrong is invisible: too eager and back exits the app from a page the user
   * drilled into; too lazy and a tab behaves like a sub-page.
   *
   * A third state exists since the tab/pushed split: a plugin CONFIGURED as a tab
   * can still be pushed from the grid / manager (`?tab=true` absent). There the
   * back arrow must navigate to the last shell tab — the exit-prompt is a back-KEY
   * concern, and the pushed page's arrow used to be swallowed entirely by it.
   */
  test('a plugin page exits when it is a tab, and navigates when it is not', () => {
    const asTab = ctx({ navPaths: [...BUILT_IN_TABS, '/plugin/miot'], pluginTabEntry: true })
    expect(resolveRouteBack('/plugin/miot', asTab).kind).toBe('exit-prompt')

    const notATab = resolveRouteBack('/plugin/miot', ctx())
    expect(notATab.kind).toBe('navigate')
    expect(notATab.kind === 'navigate' && notATab.to).toBe('/')
  })

  test('a tab-configured plugin PUSHED from the grid navigates back, not exit-prompts', () => {
    const pushed = ctx({
      navPaths: [...BUILT_IN_TABS, '/plugin/miot'],
      lastShellLocation: '/',
    })
    const action = resolveRouteBack('/plugin/miot', pushed)
    expect(action.kind).toBe('navigate')
    expect(action.kind === 'navigate' && action.to).toBe('/')
  })
})

describe('the targets each page used to hardcode', () => {
  /** Lifted from the pages' own back arrows before they were unified. */
  const CASES: Array<[pathname: string, to: string]> = [
    ['/player/eq', '/player'],
    ['/settings/cache', '/settings'],
    ['/settings/library', '/settings'],
    ['/settings/plugins', '/settings'],
    ['/settings/tab-config', '/settings'],
    ['/settings/licenses', '/settings/about'],
    ['/settings/servers/add', '/settings/servers'],
    ['/settings/servers/edit/7', '/settings/servers'],
    ['/settings/duplicates', '/settings/library'],
    ['/settings/plugins/registry', '/settings/plugins'],
    ['/settings/theme-catalog', '/settings/appearance'],
    ['/player/lyrics/adjust', '/player'],
    ['/player/dlna', '/player'],
  ]

  for (const [pathname, to] of CASES) {
    test(`${pathname} → ${to}`, () => {
      const action = resolveRouteBack(pathname, ctx())
      expect(action.kind === 'navigate' && action.to).toBe(to)
    })
  }
})

describe('returning to the library restores the sub-view', () => {
  /**
   * "Add songs" used to route to a bare `/library`, which reset the 14-view
   * picker to its first entry. Drilling in and coming straight back out losing
   * your place was reported from the device for the category page; this one had
   * the same bug and no test.
   */
  test('"/library/add" keeps the last view', () => {
    const action = resolveRouteBack('/library/add', ctx({ lastLibrarySearch: { view: 'album' } }))
    expect(action.kind === 'navigate' && action.to).toBe('/library')
    expect(action.kind === 'navigate' && action.librarySearch?.view).toBe('album')
  })

  /**
   * A facet drill-down is the exception: it returns to *that dimension's* view, read
   * off the path, not to whatever the library happened to be showing.
   */
  test('a category page returns to its own dimension', () => {
    const action = resolveRouteBack(
      '/library/category/genre',
      ctx({ lastLibrarySearch: { view: 'album' } }),
    )
    expect(action.kind === 'navigate' && action.librarySearch?.view).toBe('genre')
  })
})

describe('chrome-less pages return to the tab the shell recorded', () => {
  test.each(['/player', '/playlists/7'])('%s follows the last shell tab', (pathname) => {
    const onHome = resolveRouteBack(pathname, ctx({ lastShellLocation: '/' }))
    expect(onHome.kind === 'navigate' && onHome.to).toBe('/')

    const onLibrary = resolveRouteBack(
      pathname,
      ctx({ lastShellLocation: '/library', lastLibrarySearch: { view: 'radio' } }),
    )
    expect(onLibrary.kind === 'navigate' && onLibrary.to).toBe('/library')
    // Restoring the search is what stops "play a song from the radio list, close the
    // player" from dumping you back on the first view.
    expect(onLibrary.kind === 'navigate' && onLibrary.librarySearch?.view).toBe('radio')
  })
})

describe('the fallback branch', () => {
  /**
   * Reverse-checks the gate above: an undeclared path really does reach `fallback`,
   * so a passing suite means the routes are declared rather than that the assertion
   * can never fire.
   */
  test('an unknown path lands on the owning tab, never on exit', () => {
    const action = resolveRouteBack('/totally/unknown', ctx())
    expect(action.kind).toBe('fallback')
    expect(action.kind === 'fallback' && action.to).toBe('/')
  })

  test('an unknown sub-path of a tab lands on that tab', () => {
    const action = resolveRouteBack('/library/brand/new/thing', ctx())
    // `/library/...` is not declared, but the user must not be thrown to Home.
    expect(action.kind === 'fallback' && action.to).toBe('/library')
  })
})
