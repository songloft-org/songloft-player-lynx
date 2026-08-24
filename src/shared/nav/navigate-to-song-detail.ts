import { useCallback } from '@lynx-js/react'
import { useNavigate, useRouterState } from '@tanstack/react-router'

/**
 * The origins of the two song pages, for back resolution.
 *
 * `resolveRouteBack` cannot know where `/library/song/:id` (or its `/edit`
 * child) was opened from — the library, a playlist detail, a facet drill-in,
 * the full player, the song detail itself — and the memory history cannot
 * either (every navigation is a push; see the route-back docs). So each
 * navigation helper records the pathname it left, and the back policy reads
 * it back.
 *
 * Two recordings, deliberately: the edit page is reachable *without* passing
 * through the detail page (the song menu opens it straight away), and back
 * must return to wherever the user actually was — opening edit from the
 * library and closing it must land on the library, not on the detail page.
 */
let songDetailOrigin: string | null = null
let songEditOrigin: string | null = null

export function recordSongDetailOrigin(pathname: string): void {
  // A song→song hop keeps the earlier origin: back unwinds to where the user
  // entered the song pages from, not to the previous song.
  if (pathname.startsWith('/library/song/')) return
  songDetailOrigin = pathname
}

export function getSongDetailOrigin(): string | null {
  return songDetailOrigin
}

export function recordSongEditOrigin(pathname: string): void {
  // Opened from the song detail page, the origin IS that detail page — the
  // one song path that is a meaningful back target for the edit form.
  songEditOrigin = pathname
}

export function getSongEditOrigin(): string | null {
  return songEditOrigin
}

/** Test hook: module state outlives `render()`. */
export function resetSongDetailOriginForTests(): void {
  songDetailOrigin = null
  songEditOrigin = null
}

/**
 * Navigate to a song's detail page, recording the page being left so back
 * returns there. Every entry point into the song detail page goes through this
 * hook; a bare `navigate({ to: '/library/song/$songId' })` would strand back
 * on the library tab.
 */
export function useNavigateToSongDetail() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return useCallback((songId: number | string) => {
    recordSongDetailOrigin(pathname)
    void navigate({
      to: '/library/song/$songId',
      params: { songId: String(songId) },
    })
  }, [navigate, pathname])
}

/**
 * Navigate to a song's edit page (`/library/song/:id/edit`), recording the page
 * being left the same way — the edit page's back arrow and the hardware key
 * both return to it (the song detail page when opened from there, the library
 * / playlist / facet page when opened from a song menu).
 */
export function useNavigateToSongEdit() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return useCallback((songId: number | string) => {
    recordSongEditOrigin(pathname)
    void navigate({
      to: '/library/song/$songId/edit',
      params: { songId: String(songId) },
    })
  }, [navigate, pathname])
}
