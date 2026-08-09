import { FullPlayerPage } from '../features/player/index.js'

/**
 * `/player` route entry (chrome-less, not wrapped by the shell). Batch 5
 * replaces the placeholder with the real full-screen player from the player
 * feature. Kept as a thin re-export so the router import path stays stable.
 */
export function PlayerPage() {
  return <FullPlayerPage />
}
