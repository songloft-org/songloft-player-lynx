import { createContext, useContext } from '@lynx-js/react'

export interface LibraryViewport {
  /** Wide (>= tablet) — the section shows the left rail instead of the pill strip. */
  isWide: boolean
}

/**
 * The library section's wide/narrow decision, measured **once** by
 * `LibraryLayout` and read by the pages under it.
 *
 * A context rather than a per-page `useBreakpoint`: the rail and the page must
 * never disagree about the breakpoint, and two measurements of two slightly
 * different boxes can (the drill-in pages compared the *window* width to 600
 * while `LibraryPage` compared the content area, so they disagreed across the
 * whole 600–820px band). It is also what removes the flash — a page that reads
 * an already-decided value has nothing to correct after paint.
 *
 * Its own module so `LibraryPage` does not have to import the route component.
 *
 * Defaults to narrow, which is what every page saw from `useBreakpoint(0, …)` on
 * frame 1, so pages rendered standalone (unit tests) behave as before.
 */
export const LibraryViewportContext = createContext<LibraryViewport>({ isWide: false })

export const LibraryViewportProvider = LibraryViewportContext.Provider

export function useLibraryViewport(): LibraryViewport {
  return useContext(LibraryViewportContext)
}
