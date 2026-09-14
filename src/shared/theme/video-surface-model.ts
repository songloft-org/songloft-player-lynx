import { useEffect, useState } from '@lynx-js/react'

/**
 * Whether the transparent fullscreen-video route is up.
 *
 * `.theme-root` paints the system background; that would cover the host
 * `<video>`/SurfaceView sitting underneath the Lynx view, so while the video
 * route is mounted ThemeProvider drops that background via the `full-video`
 * class. Kept as a tiny model (not a Zustand store) because it is a transient
 * UI state with no data, mirroring the reduce-motion / increase-contrast
 * subscriptions already wired into ThemeProvider.
 */

let active = false
const listeners = new Set<(next: boolean) => void>()

export function setFullVideoActive(next: boolean): void {
  if (active === next) return
  active = next
  listeners.forEach((listener) => listener(next))
}

export function isFullVideoActive(): boolean {
  return active
}

export function subscribeFullVideoActive(listener: (next: boolean) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useFullVideoActive(): boolean {
  const [value, setValue] = useState(isFullVideoActive())
  useEffect(() => subscribeFullVideoActive(setValue), [])
  return value
}