/**
 * Hardware / browser back key.
 *
 * **Why the host needs a flag instead of asking us.** `onBackPressed()` has to
 * decide *synchronously* whether to consume the press or let the system exit the
 * app, and Lynx offers no synchronous call into JS (and native must never block on
 * a Promise — see AGENTS.md). So the direction is inverted: JS keeps a single
 * boolean, `consumable` ("the next press is mine"), mirrored into the host, and
 * the host reads its own cached copy.
 *
 * That flag doubles as the liveness guarantee. The second press of
 * "press back again to exit" is handled by the host itself — JS deliberately
 * lowers `consumable` while the prompt is armed — so a wedged JS thread at a tab
 * root can still be exited, and there is no round trip to race against a fast
 * double tap.
 *
 * {@link notifyBackHandled} is the watchdog's other half: if the host forwards
 * three presses without an answer it stops trusting the flag and falls through to
 * the system default, so a wedged JS thread cannot hold the key hostage anywhere
 * else either.
 *
 * All three methods are fire-and-forget, matching `native-storage`'s writes.
 * There is nothing to read back: the host is the follower here.
 */
import { readLynxGlobal, readNativeModules } from './native-modules.js'

/**
 * Global-event name the host pushes back presses on. Must match
 * `SongloftNavigationModule.EVENT_BACK_PRESSED` (Android) and the Web host's
 * `sendGlobalEvent` call byte for byte.
 */
export const BACK_PRESSED_EVENT = 'SongloftNavigation.backPressed'

/** The native shape: writes with positional args, no callbacks. */
export interface SongloftNavigationNativeModule {
  setBackConsumable(consumable: boolean): void
  notifyBackHandled(seq: number): void
  exitApp(): void
}

const NATIVE_METHODS = ['setBackConsumable', 'notifyBackHandled', 'exitApp'] as const

function readNative(): SongloftNavigationNativeModule | null {
  const mod = readNativeModules()?.SongloftNavigation as Record<string, unknown> | undefined
  if (!mod) return null
  // A partial module is worse than none: `mod?.method?.()` would make the missing
  // half a silent no-op, and the missing half here is "the user can never exit".
  for (const name of NATIVE_METHODS) {
    if (typeof mod[name] !== 'function') return null
  }
  return mod as unknown as SongloftNavigationNativeModule
}

export interface NavigationModule extends SongloftNavigationNativeModule {
  /** False on hosts with no back key to intercept (iOS) or no module at all. */
  readonly available: boolean
}

function createNativeAdapter(native: SongloftNavigationNativeModule): NavigationModule {
  return {
    available: true,
    setBackConsumable(consumable) {
      try {
        native.setBackConsumable(consumable)
      } catch {
        // A failed mirror leaves the host on its previous answer, which is at
        // worst a stale press — never a crash in the middle of navigating.
      }
    },
    notifyBackHandled(seq) {
      try {
        native.notifyBackHandled(seq)
      } catch { /* watchdog only; losing an ack costs at most an early fallthrough */ }
    },
    exitApp() {
      try {
        native.exitApp()
      } catch { /* nothing sensible to do — the user can still use the home key */ }
    },
  }
}

/** Inert stand-in so callers need no platform checks (iOS has no back key). */
function createUnavailableStub(): NavigationModule {
  return {
    available: false,
    setBackConsumable() {},
    notifyBackHandled() {},
    exitApp() {},
  }
}

let cached: NavigationModule | null = null

/**
 * Only the *real* adapter is memoised. The stub deliberately is not: the back
 * controller starts before the first render, and latching "unavailable" there
 * would disable the back key for the whole session if `NativeModules` was not
 * populated yet — the trap `getFloatingLyricModule()` documents having fallen
 * into. Re-probing costs one property read per call.
 */
export function getNavigationModule(): NavigationModule {
  if (cached) return cached
  const native = readNative()
  if (!native) return createUnavailableStub()
  cached = createNativeAdapter(native)
  return cached
}

let listenerInstalled = false

/**
 * Decode the host's payload into a sequence number.
 *
 * `sendGlobalEvent(name, [payload])` delivers the array's first element as the
 * listener's first argument — the same contract `system-appearance` relies on. A
 * missing or malformed `seq` degrades to 0, which the watchdog treats as "no ack",
 * i.e. the safe direction.
 */
export function parseBackSeq(raw: unknown): number {
  const data = (raw ?? {}) as Record<string, unknown>
  const seq = data.seq
  return typeof seq === 'number' && Number.isFinite(seq) ? seq : 0
}

/**
 * Start listening for host back presses. Idempotent — the listener is installed at
 * most once, so calling this twice does not double-handle a press (which would
 * pop two layers per tap).
 */
export function installBackPressedListener(onBack: (seq: number) => void): void {
  if (listenerInstalled) return
  const l = readLynxGlobal()
  if (!l || typeof l.getJSModule !== 'function') return
  try {
    const emitter = l.getJSModule('GlobalEventEmitter')
    if (!emitter || typeof emitter.addListener !== 'function') return
    emitter.addListener(BACK_PRESSED_EVENT, (payload: unknown) => {
      onBack(parseBackSeq(payload))
    })
    listenerInstalled = true
  } catch {
    // No usable emitter (non-Lynx host / tests) — the back key stays with the OS.
  }
}

/** Test hook: drop the memoised module and re-arm listener installation. */
export function resetNavigationModuleForTests(): void {
  cached = null
  listenerInstalled = false
}
