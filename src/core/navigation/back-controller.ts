/**
 * Wiring for the back key: host event in, layer/route decision out.
 *
 * Lives here rather than in `src/shared/nav/` on purpose. Everything in that folder
 * is a pure function or module-level session state — no React, no router, no
 * components — which is why it can be unit-tested with zero mocks. This file is the
 * one place that holds the router, the toast, i18n, the native module and the
 * platform check together, so that invariant survives.
 *
 * The chain a press walks, top down:
 *   1. {@link dispatchBack} — overlays and page modes, most recently opened first
 *   2. {@link performRouteBack} — the route's declared parent
 *   3. the exit prompt, at a tab root
 *
 * Step 2 is also what every back arrow in the UI calls, so the key and the arrow can
 * never disagree. It lives in `route-back-action.ts` so components can reach it
 * without importing this module's heavier graph.
 */
import { toast } from '../../shared/ui/toast-store.js'
import {
  getNavigationModule,
  installBackPressedListener,
} from '../../native/navigation.js'
import { isWebPlatform } from '../../native/web-platform.js'
import {
  dispatchBack,
  getBackStackDepth,
  subscribeBackStack,
} from '../../shared/nav/back-stack.js'
import {
  EXIT_PROMPT_WINDOW_MS,
  armExitPrompt,
  disarmExitPrompt,
  isExitArmed,
} from '../../shared/nav/exit-prompt.js'
import { i18n } from '../../i18n/index.js'
import {
  currentBackAction,
  performRouteBack,
  setBackRouter,
} from './route-back-action.js'

/** Type-only; see the note in `route-back-action.ts`. */
import type { router as routerSingleton } from '../../router.js'

type AppRouter = typeof routerSingleton

/** Last value mirrored to the host; `null` until the first sync. */
let mirrored: boolean | null = null
let rearmTimer: ReturnType<typeof setTimeout> | null = null
let initialised = false

/**
 * "Press back again to exit."
 *
 * The second press is **not** handled here: arming the prompt lowers `consumable`,
 * so the host itself exits on the next press. That removes the round trip a fast
 * double tap would race against, and it means a wedged JS thread at a tab root can
 * still be dismissed. {@link isExitArmed} is only consulted for the case where the
 * host forwarded the press anyway (a stale flag).
 */
function promptOrExit(): void {
  const now = Date.now()
  if (isExitArmed(now)) {
    getNavigationModule().exitApp()
    return
  }
  armExitPrompt(now)
  toast.show(i18n.t('nav.pressBackAgainToExit'))
  if (rearmTimer !== null) clearTimeout(rearmTimer)
  rearmTimer = setTimeout(() => {
    rearmTimer = null
    disarmExitPrompt()
    syncConsumable()
  }, EXIT_PROMPT_WINDOW_MS)
}

/**
 * Whether the next press belongs to JS.
 *
 * The platforms differ only at a tab root, and deliberately:
 *  - **Web**: false. Browser back should leave the page, which is what a web user
 *    expects and what still works if the worker is wedged — no sentinel history
 *    entry means there is nothing to intercept.
 *  - **Native**: true unless the prompt is armed, so the first press can raise the
 *    toast and the second is executed by the host.
 */
function computeConsumable(): boolean {
  if (getBackStackDepth() > 0) return true
  const action = currentBackAction()
  if (!action) return false
  if (action.kind !== 'exit-prompt') return true
  if (isWebPlatform()) return false
  return !isExitArmed(Date.now())
}

/** Mirror the flag to the host, skipping no-op writes. */
function syncConsumable(): void {
  const next = computeConsumable()
  if (next === mirrored) return
  mirrored = next
  getNavigationModule().setBackConsumable(next)
}

/**
 * Handle one host back press.
 *
 * `notifyBackHandled` runs in a `finally`: it resets the host's watchdog, and if a
 * handler throws we still want the host to keep trusting us rather than start
 * falling through to "exit the app".
 */
function handleHostBack(seq: number): void {
  try {
    if (dispatchBack()) return
    if (!performRouteBack()) promptOrExit()
  } finally {
    getNavigationModule().notifyBackHandled(seq)
    syncConsumable()
  }
}

/**
 * One-time startup. Idempotent, like `initSystemAppearance`.
 *
 * The initial `syncConsumable()` matters: the host boots with `consumable` false
 * (back exits), which is right for the login screen and wrong for everything else.
 */
export function initBackController(router: AppRouter): void {
  if (initialised) return
  initialised = true
  setBackRouter(router)

  installBackPressedListener(handleHostBack)
  subscribeBackStack(syncConsumable)
  router.subscribe('onResolved', () => {
    // Leaving a tab root abandons a half-finished exit prompt; otherwise returning
    // within the window would exit without ever having shown the toast.
    if (currentBackAction()?.kind !== 'exit-prompt') disarmExitPrompt()
    syncConsumable()
  })
  syncConsumable()
}

/** Test hook: module state outlives `render()`. */
export function resetBackControllerForTests(): void {
  mirrored = null
  initialised = false
  if (rearmTimer !== null) {
    clearTimeout(rearmTimer)
    rearmTimer = null
  }
}
