/**
 * Shared access to the Lynx `NativeModules` bag.
 *
 * Like `fetch` / `self`, Lynx exposes `NativeModules` as a **bare global** (not
 * `globalThis.NativeModules`), so it must be probed with a `typeof` guard first
 * — reading an undeclared bare identifier throws `ReferenceError` — then fall
 * back to `globalThis` (which is where tests inject it). Used by both the audio
 * (`audio-facade.ts`) and storage (`core/storage`) native bindings so the
 * no-DOM-safe read lives in exactly one place (AGENTS.md §3).
 */
export function readNativeModules(): Record<string, unknown> | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof NativeModules !== 'undefined') return NativeModules as any
  } catch {
    // undeclared bare identifier — fall through to globalThis
  }
  return (globalThis as { NativeModules?: Record<string, unknown> }).NativeModules
}

/**
 * The runtime `lynx` object, or `null` outside a Lynx host (tests / plain node).
 * Same bare-global rule as {@link readNativeModules}: `lynx` is not declared on
 * `globalThis`, so it must be probed with `typeof` before being read.
 *
 * Callers reach for this to get `lynx.getJSModule('GlobalEventEmitter')` (native
 * event delivery) or `lynx.__globalProps` (host-injected page data).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readLynxGlobal(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof lynx !== 'undefined') return lynx as any
  } catch {
    // undeclared bare identifier — fall through to globalThis
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).lynx ?? null
}
