import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * `SongRowOverlays` must stay mounted in the root route — inside
 * `ThemeProvider`, i.e. inside the Router tree — and must not hang off the
 * app root as a `<RouterProvider>` sibling.
 *
 * **Why.** It was once a sibling of `<RouterProvider>` in `App.tsx`. Native
 * tolerated it, but on Web that position is outside `.theme-root` — the
 * subtree that defines every Muse CSS variable — so the delete-confirm dialog
 * rendered with every `var(--*)` resolved to empty (transparent body, 0×0
 * backdrop, unclickable feel), and the song menu never mounted at all (its
 * `useNavigateToSongDetail()` needed the Router context that position lacks —
 * the helper has since been retired with the song-detail routes, but the song
 * info/edit dialogs now mount here too and need those vars just as badly).
 * Browser verification found both. The same rule already keeps `ToastHost` in
 * the root route (see its comment in `router.tsx`).
 */

const repoRoot = path.resolve(__dirname, '..', '..')
const read = (relative: string): string => readFileSync(path.join(repoRoot, relative), 'utf8')

describe('SongRowOverlays mounts in the root route, not the app root', () => {
  const routerSrc = read('src/router.tsx')
  const appSrc = read('src/App.tsx')

  test('the root route renders it inside ThemeProvider', () => {
    // The root route's component is the named `RootRouteView` (splash gate +
    // the real tree). Slice that function body — from its definition to the
    // `rootRoute` declaration that follows — so a stray import or a mount
    // outside ThemeProvider cannot satisfy the assertion. `RootRouteView` has
    // TWO return branches (splash / real tree) and hence two ThemeProviders;
    // the overlays live in the last one, so anchor on its opening tag.
    expect(routerSrc, 'root route must use RootRouteView as its component')
      .toContain('component: RootRouteView')
    const start = routerSrc.indexOf('export function RootRouteView()')
    expect(start, 'RootRouteView component not found').toBeGreaterThan(-1)
    const end = routerSrc.indexOf('const rootRoute = createRootRoute({', start)
    expect(end, 'rootRoute declaration not found after RootRouteView').toBeGreaterThan(start)
    const body = routerSrc.slice(start, end)
    const lastThemeProviderOpen = body.lastIndexOf('<ThemeProvider')
    expect(lastThemeProviderOpen, 'no ThemeProvider in RootRouteView').toBeGreaterThan(-1)
    expect(
      body.indexOf('<SongRowOverlays />'),
      '<SongRowOverlays /> must render inside ThemeProvider (needs .theme-root vars + Router context)',
    ).toBeGreaterThan(lastThemeProviderOpen)
  })

  test('the app root does not mount it', () => {
    expect(
      appSrc,
      'SongRowOverlays must not be a <RouterProvider> sibling — it loses theme vars and Router context on Web',
    ).not.toContain('SongRowOverlays')
  })
})
