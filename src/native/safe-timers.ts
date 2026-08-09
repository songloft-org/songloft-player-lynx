/**
 * Lynx-safe timer clear helpers.
 *
 * On Lynx the engine's `clearTimeout` / `clearInterval` are **strict**: passing
 * anything that is not a valid handle (e.g. `undefined` from an unset field)
 * throws `param 0 should be Number` — whereas browsers / Node treat it as a
 * no-op. Any code that stores a timer handle in a nullable field (the mock audio
 * player, the sleep timer) must therefore guard the clear. Batch 3 hit the same
 * trap in TanStack Router's `clearTimeout(session?.[3])` and patched it the same
 * way (`patches/@tanstack__router-core@*.patch`).
 *
 * The guard rejects exactly the crash case — `null` / `undefined` — while
 * forwarding any real handle. Lynx handles are `Number`s, so a live handle is
 * always forwarded there; on Node/jsdom the handle is a `Timeout` object, which
 * those runtimes' clear functions accept. (A stricter `typeof === 'number'`
 * check would silently fail to clear on Node, leaking intervals under Vitest.)
 * These wrappers centralize the guard so every call site is safe and the intent
 * is unit-testable (`clearInterval(undefined)` must NOT reach the host clear).
 */

/** Clear an interval only when `id` is a real handle. Returns `null`. */
export function safeClearInterval(id: number | null | undefined): null {
  if (id != null) clearInterval(id)
  return null
}

/** Clear a timeout only when `id` is a real handle. Returns `null`. */
export function safeClearTimeout(id: number | null | undefined): null {
  if (id != null) clearTimeout(id)
  return null
}
