import { useCallback } from '@lynx-js/react'
import { useNavigate, useRouterState } from '@tanstack/react-router'

/**
 * The origin of the current song-detail navigation, for back resolution.
 *
 * `resolveRouteBack` cannot know where `/library/song/:id` was opened from —
 * the library, a playlist detail, a facet drill-in, the full player — and the
 * memory history cannot either (every navigation is a push; see the route-back
 * docs). So the navigation helper records the pathname it left, and the back
 * policy reads it back.
 */
let songDetailOrigin: string | null = null

export function recordSongDetailOrigin(pathname: string): void {
  // A song→song hop keeps the earlier origin: back unwinds to where the user
  // entered the song pages from, not to the previous song.
  if (pathname.startsWith('/library/song/')) return
  songDetailOrigin = pathname
}

export function getSongDetailOrigin(): string | null {
  return songDetailOrigin
}

/** Test hook: module state outlives `render()`. */
export function resetSongDetailOriginForTests(): void {
  songDetailOrigin = null
}

/**
 * Navigate to a song's detail page, recording the page being left so back
 * returns there. Every entry point into the song pages goes through this hook;
 * a bare `navigate({ to: '/library/song/$songId' })` would strand back on the
 * library tab.
 *
 * `edit` opens the detail page's inline edit form straight away — the song
 * menu's "edit" action, which has no page of its own to go to.
 */
export function useNavigateToSongDetail() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return useCallback((songId: number | string, opts?: { edit?: boolean }) => {
    recordSongDetailOrigin(pathname)
    void navigate({
      to: '/library/song/$songId',
      params: { songId: String(songId) },
      search: opts?.edit ? { edit: true } : {},
    })
  }, [navigate, pathname])
}
