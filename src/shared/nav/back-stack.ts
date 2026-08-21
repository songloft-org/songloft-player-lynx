/**
 * LIFO stack of back-key handlers — the layer between the host's back key and
 * the router.
 *
 * **Why a stack rather than z-index.** Every hand-rolled overlay in this app is
 * `position: fixed; z-index: 100` (see `GlobalMenu.css`, `PlayHistoryPanel.css`,
 * `PopoverMenu.css`) — they are all on the same layer and paint by DOM order, so there
 * is nothing to sort by. What the back key actually needs is "close the thing the user
 * opened last", and that is exactly registration order, because an overlay only
 * registers when it opens.
 *
 * **Why priority is activation time and not render order.** Both orderings have
 * one failure mode; this one's cannot happen in practice.
 *  - Render order (parent before child) gets nesting right but **siblings wrong**:
 *    the full player renders the speed popover above the sleep-timer sheet, so
 *    opening the sheet first and the popover second would close the sheet.
 *  - Activation order gets siblings right always, and is only wrong when a parent
 *    and a child activate in the *same commit* (child effects run before parent
 *    effects, so the parent would land on top). Overlays activate on user input,
 *    which is necessarily a later commit than the page's mount — so that case does
 *    not arise. It is pinned by a test regardless.
 *
 * Hence the rule in `docs/reference/back-navigation.md`: **an overlay's `active`
 * flag must be false at mount.**
 */

/** Returns true when it consumed the press; false to let the next layer try. */
export type BackHandler = () => boolean

interface Entry {
  handler: BackHandler
}

let entries: Entry[] = []
const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach((listener) => listener())
}

/**
 * Register `handler` on top of the stack. Returns an unregister function that is
 * safe to call more than once (React may run a cleanup after the stack was
 * already cleared).
 */
export function pushBackHandler(handler: BackHandler): () => void {
  const entry: Entry = { handler }
  entries.push(entry)
  notify()
  return () => {
    const index = entries.indexOf(entry)
    if (index === -1) return
    entries.splice(index, 1)
    notify()
  }
}

/**
 * Offer a back press to the stack, top down. Returns true as soon as a handler
 * consumes it.
 *
 * Iterates a snapshot, because consuming a press routinely unregisters the
 * handler that consumed it (closing an overlay unmounts it) and may unregister
 * others. Entries removed mid-dispatch are skipped rather than called, so a
 * handler cannot be invoked after its own layer went away.
 */
export function dispatchBack(): boolean {
  const snapshot = entries.slice()
  for (let i = snapshot.length - 1; i >= 0; i--) {
    const entry = snapshot[i]
    if (!entry || !entries.includes(entry)) continue
    let consumed = false
    try {
      consumed = entry.handler()
    } catch {
      // A throwing handler must not swallow the press — fall through to the next
      // layer, which is at worst the route-level back.
      consumed = false
    }
    if (consumed) return true
  }
  return false
}

/** How many layers would currently be offered the press. */
export function getBackStackDepth(): number {
  return entries.length
}

/**
 * Subscribe to depth changes. The back controller uses this to recompute the
 * `consumable` flag it mirrors to the host — the host has to know *before* the
 * next press whether JS will handle it.
 */
export function subscribeBackStack(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Test hook: drop every handler (module state outlives `render()`). */
export function clearBackHandlersForTests(): void {
  entries = []
  notify()
}
