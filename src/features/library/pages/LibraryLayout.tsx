import { useSyncExternalStore } from '@lynx-js/react'
import { Outlet, useNavigate, useRouterState, useSearch } from '@tanstack/react-router'

import { getSongDetailOrigin } from '../../../shared/nav/navigate-to-song-detail.js'
import { getShellWidth, subscribeShellWidth } from '../../../shared/nav/shell-navigation.js'
import { breakpointFromWidth, isWide as isWideBreakpoint, useBreakpoint } from '../../../shared/responsive/useBreakpoint.js'
import { getLastLibrarySearch } from '../data/last-library-search.js'
import {
  libraryBrowseConfigOrFallback,
  useLibraryBrowseConfigQuery,
} from '../data/library-browse-query.js'
import { railAnchorPath, railSelection, requestedRailView } from '../domain/library-rail-view.js'
import { resolveLibraryView, type LibraryViewKey } from '../domain/library-views.js'
import { LibraryShell } from '../widgets/LibraryShell.js'
import { LibraryViewportProvider } from './library-viewport.js'

/** Width of `.shell__rail`, the app-level nav rail (`ShellLayout.css`). */
const SHELL_RAIL_WIDTH = 220

/**
 * Route layout for the whole library section: the library itself, its two forms
 * (`/library/add`, `/playlists/create`) and its three detail pages (facet
 * drill-in, song detail, playlist detail).
 *
 * It owns the view rail so that drilling into a sub-page does not remount it.
 * Before this existed, `AddSongsPage` and `CreatePlaylistPage` each rendered
 * their **own** copy of `LibraryViewRail`, gated on an async width store and on
 * the browse-config query — three independent reasons for the layout to change
 * one frame after paint, which is what the "flashes on open" report was. A rail
 * that lives above the `<Outlet/>` cannot flash on navigation: it is not
 * re-created.
 *
 * The narrow pill strip is deliberately **not** here — it stays in `LibraryPage`
 * because edit mode (`LibraryViewEditor`) replaces that page's whole body, and a
 * strip owned by the layout would hang above the editor.
 */
export function LibraryLayout() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { view?: LibraryViewKey }

  const browseQuery = useLibraryBrowseConfigQuery()
  const config = libraryBrowseConfigOrFallback(browseQuery)

  /*
   * Seed the measurement with a width we already know, so frame 1 is right.
   *
   * `useBreakpoint` starts at `initialWidth` and only learns the truth after
   * paint (`bindlayoutchange` is a change notification; `boundingClientRect` is
   * an async invoke) — so a `0` seed *guarantees* one narrow frame on every
   * mount. `ShellLayout` has already measured the window and publishes it, and
   * the content area is the window minus the nav rail when the shell is wide.
   *
   * Measured against the **content area**, not the window: two 220px rails side
   * by side leave only 260px of content at a 700px window, so the window-width
   * criterion the drill-in pages used was simply wrong, and it disagreed with
   * `LibraryPage` across the whole 600–820px band.
   */
  const shellWidth = useSyncExternalStore(subscribeShellWidth, getShellWidth)
  const seedWidth = isWideBreakpoint(breakpointFromWidth(shellWidth))
    ? Math.max(0, shellWidth - SHELL_RAIL_WIDTH)
    : shellWidth
  const { isWide, onLayoutChange } = useBreakpoint(seedWidth, '.library-shell')

  /*
   * Which row is lit. Sub-pages carry no `?view=`, so the policy (per route, and
   * pure) lives in `library-rail-view.ts`: a facet drill-in names its own
   * dimension, playlist routes anchor to the playlists group, and the rest fall
   * back to the view the user came from — which `LibraryPage` records on every
   * render. This replaces the local `selectedView` state the drill-ins used to
   * keep in sync by hand.
   *
   * Song detail answers for the page it was opened from instead of for itself
   * (`railAnchorPath`), so reaching it from a playlist keeps the playlists group
   * lit rather than dropping to the last library view.
   */
  const pathname = useRouterState({ select: s => s.location.pathname })
  const anchorPath = railAnchorPath(pathname, getSongDetailOrigin())
  const resolved = config
    ? resolveLibraryView(requestedRailView(anchorPath, search.view, getLastLibrarySearch().view), config)
    : undefined

  return (
    <LibraryViewportProvider value={{ isWide }}>
      <LibraryShell
        isWide={isWide}
        onLayoutChange={onLayoutChange}
        displayKeys={resolved?.displayKeys ?? []}
        selected={resolved ? railSelection(anchorPath, resolved.selected, resolved.displayKeys) : undefined}
        // Same target from every route under this layout: picking a view means
        // "show me the library at that view", leaving the sub-page if we are on one.
        onSelect={(key) => navigate({ to: '/library', search: { view: key } })}
      >
        <Outlet />
      </LibraryShell>
    </LibraryViewportProvider>
  )
}
