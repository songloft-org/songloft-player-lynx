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
 * backdrop, unclickable feel), and the song menu never mounted at all:
 * `SongRowOverlays`' `useNavigateToSongDetail()` needs the Router context that
 * position lacks. Browser verification found both. The same rule already keeps
 * `ToastHost` in the root route (see its comment in `router.tsx`).
 */

const repoRoot = path.resolve(__dirname, '..', '..')
const read = (relative: string): string => readFileSync(path.join(repoRoot, relative), 'utf8')

describe('SongRowOverlays mounts in the root route, not the app root', () => {
  const routerSrc = read('src/router.tsx')
  const appSrc = read('src/App.tsx')

  test('the root route renders it inside ThemeProvider', () => {
    // Slice the root route's component body so a stray import or a mount
    // outside ThemeProvider cannot satisfy the assertion.
    const start = routerSrc.indexOf('component: () => (')
    expect(start, 'root route component not found').toBeGreaterThan(-1)
    const end = routerSrc.indexOf('</ThemeProvider>', start)
    expect(end, 'ThemeProvider closing tag not found after the component').toBeGreaterThan(start)
    const body = routerSrc.slice(start, end)
    expect(
      body,
      '<SongRowOverlays /> must render inside ThemeProvider (needs .theme-root vars + Router context)',
    ).toContain('<SongRowOverlays />')
  })

  test('the app root does not mount it', () => {
    expect(
      appSrc,
      'SongRowOverlays must not be a <RouterProvider> sibling — it loses theme vars and Router context on Web',
    ).not.toContain('SongRowOverlays')
  })
})
