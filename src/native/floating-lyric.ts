import { readNativeModules } from './native-modules.js'

export interface FloatingLyricModule {
  /** Is the overlay grant in place? Never opens a system screen. */
  hasPermission(): Promise<boolean>
  /**
   * Ask for the overlay grant. Resolves `true` immediately when it is already
   * held; otherwise the host opens the system screen and this resolves **after
   * the user comes back** with whatever the grant is then. Only call it from a
   * user-initiated enable — see `OverlayPermission.kt`.
   */
  requestPermission(): Promise<boolean>
  show(): Promise<void>
  updateLyric(line: string, nextLine?: string): Promise<void>
  hide(): Promise<void>
  isShowing(): Promise<boolean>
  setFontSize(size: 'small' | 'medium' | 'large'): Promise<void>
  setLocked(locked: boolean): Promise<void>
  setOpacity(opacity: number): Promise<void>
  setTwoLine(twoLine: boolean): Promise<void>
}

/**
 * The native module is callback-based (Lynx convention). Methods take
 * (argsJson: String, callback: Callback). This adapter promisifies them.
 */
interface NativeFloatingLyric {
  hasPermission(args: string, callback: (result: string) => void): void
  requestPermission(args: string, callback: (result: string) => void): void
  show(args: string, callback: (result: string) => void): void
  updateLyric(args: string, callback: (result: string) => void): void
  hide(args: string, callback: (result: string) => void): void
  isShowing(args: string, callback: (result: string) => void): void
  setFontSize(args: string, callback: (result: string) => void): void
  setLocked(args: string, callback: (result: string) => void): void
  setOpacity(args: string, callback: (result: string) => void): void
  setTwoLine(args: string, callback: (result: string) => void): void
}

/**
 * Every method must be guarded against the host predating it: hosts add these
 * incrementally, and an unguarded call to a missing method leaves the promise
 * pending forever. Every progress tick could then leak one from `updateLyric`,
 * so this is not just a startup concern — a stale host running for a while
 * accumulates leaked promises and their JSON payloads.
 */
function createNativeAdapter(native: NativeFloatingLyric): FloatingLyricModule {
  function callBool(
    method: keyof NativeFloatingLyric,
    args: string,
    fallback: boolean,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const fn = native[method]
      if (typeof fn !== 'function') { resolve(fallback); return }
      fn.call(native, args, (result: string) => { resolve(readBooleanResult(result)) })
    })
  }
  function callVoid(method: keyof NativeFloatingLyric, args: string): Promise<void> {
    return new Promise((resolve) => {
      const fn = native[method]
      if (typeof fn !== 'function') { resolve(); return }
      fn.call(native, args, () => resolve())
    })
  }
  return {
    hasPermission: () => callBool('hasPermission', '{}', false),
    requestPermission: () => callBool('requestPermission', '{}', false),
    show: () => callVoid('show', '{}'),
    updateLyric: (line: string, nextLine?: string) =>
      callVoid('updateLyric', JSON.stringify({ line, nextLine: nextLine ?? '' })),
    hide: () => callVoid('hide', '{}'),
    isShowing: () => callBool('isShowing', '{}', false),
    setFontSize: (size: 'small' | 'medium' | 'large') =>
      callVoid('setFontSize', JSON.stringify({ size })),
    setLocked: (locked: boolean) => callVoid('setLocked', JSON.stringify({ locked })),
    setOpacity: (opacity: number) => callVoid('setOpacity', JSON.stringify({ opacity })),
    setTwoLine: (twoLine: boolean) => callVoid('setTwoLine', JSON.stringify({ twoLine })),
  }
}

/** `{result: boolean}` → boolean; anything unparseable counts as `false`. */
function readBooleanResult(result: string): boolean {
  try {
    const obj: unknown = JSON.parse(result)
    return !!obj && typeof obj === 'object' && (obj as Record<string, unknown>).result === true
  } catch {
    return false
  }
}

let cached: FloatingLyricModule | null = null

export function getFloatingLyricModule(): FloatingLyricModule {
  if (cached) return cached
  const nm = readNativeModules()
  if (nm?.SongloftFloatingLyric) {
    cached = createNativeAdapter(nm.SongloftFloatingLyric as unknown as NativeFloatingLyric)
    return cached
  }
  cached = {
    hasPermission: async () => false,
    requestPermission: async () => false,
    show: async () => {},
    updateLyric: async () => {},
    hide: async () => {},
    isShowing: async () => false,
    setFontSize: async () => {},
    setLocked: async () => {},
    setOpacity: async () => {},
    setTwoLine: async () => {},
  }
  return cached
}