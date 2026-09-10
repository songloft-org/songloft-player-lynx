import {
  getSystemAppearance,
  subscribeSystemAppearance,
} from '../../native/system-appearance.js'

/**
 * The OS "reduce motion" accessibility flag, surfaced from the host's
 * `SystemAppearance` (the same `lynx.__globalProps` + `appearanceChanged`
 * channel that carries the system theme and locale).
 *
 * `tokens.css` already ships the `.theme-root.reduce-motion` class that zeroes
 * every `--duration-*` token — so any CSS transition or animation that goes
 * through a token is already governed by it. What was missing was the class
 * actually landing on the root: that needed the host to report the flag and a
 * model here to expose it. This is the model half. The host half — populating
 * `systemReduceMotion` on iOS/Android/Harmony — mirrors the existing
 * `systemTheme`/`systemLocale` push; see the batch-5 note in `AGENTS.md`.
 *
 * "Host said nothing" (`null`/`undefined`) resolves to motion ON (the default),
 * never to a surprise motion-off on hosts that have not wired the field.
 */
const listeners = new Set<() => void>()
let followingSystem = false

/** Whether motion should be reduced. `false` when the host said nothing. */
export function getReduceMotion(): boolean {
  return getSystemAppearance().reduceMotion === true
}

/** Subscribe to live reduce-motion changes; returns an unsubscribe function. */
export function subscribeReduceMotion(listener: () => void): () => void {
  maybeFollowSystem()
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Re-notify subscribers when the host flag flips. Subscribes to
 * `SystemAppearance` at most once — the model is process-scoped, and every
 * consumer subscribing once-per-mount would multiply the same host event.
 */
function maybeFollowSystem(): void {
  if (followingSystem) return
  followingSystem = true
  subscribeSystemAppearance(() => {
    listeners.forEach((listener) => listener())
  })
}
