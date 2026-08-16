import { readNativeModules } from './native-modules.js'

/**
 * Fullscreen native video playback for the song the audio engine already holds.
 *
 * There is no `url` anywhere in this API, and that is the design: `player-store`
 * loads a video song with the picture already in the stream (`?media=video`, or the
 * transcoded HLS playlist after `enterVideoSource()`), so the host only has to lend
 * the running player a surface. Passing a URL would invite a second player, and with
 * it audio/video drift, two `MediaSession`s fighting over the lock screen, and a
 * playback path that neither the EQ nor the insecure-TLS switch reaches.
 */
export interface VideoModule {
  /**
   * Show the fullscreen video screen.
   *
   * Resolves `false` when the host found no video track to draw — which happens for
   * real: `songs.is_video` is recorded from the original file at scan time, while a
   * remote song may be served from a cache entry that was transcoded with `-vn`.
   * Callers should say so rather than leaving a black rectangle up.
   */
  open(): Promise<boolean>
  close(): Promise<void>
  isOpen(): Promise<boolean>
  /** False when no native module is present (Web, or a build without it). */
  readonly available: boolean
}

/**
 * The **native** shape: Lynx methods are callback-style and take their arguments as
 * one JSON string. Promisifying happens here, never by casting the native bag to
 * {@link VideoModule} — see `dlna.ts` for what that cast cost once.
 */
interface NativeVideoModule {
  open(argsJson: string, callback: (json: string) => void): void
  close(argsJson: string, callback: (json: string) => void): void
  isOpen(argsJson: string, callback: (json: string) => void): void
}

const NATIVE_METHODS = ['open', 'close', 'isOpen'] as const

function readNativeVideo(): NativeVideoModule | null {
  const mod = readNativeModules()?.SongloftVideo as Record<string, unknown> | undefined
  if (!mod) return null
  // A partial module is worse than none: it would fail deep inside a page.
  for (const name of NATIVE_METHODS) {
    if (typeof mod[name] !== 'function') return null
  }
  return mod as unknown as NativeVideoModule
}

function parsePayload(json: string): { error?: string; value?: unknown } {
  if (typeof json !== 'string' || json.length === 0) return {}
  try {
    const parsed: unknown = JSON.parse(json)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const err = (parsed as { error?: unknown }).error
      if (typeof err === 'string' && err.length > 0) return { error: err }
    }
    return { value: parsed }
  } catch {
    return { error: `malformed video response: ${json.slice(0, 120)}` }
  }
}

function invoke(
  run: (callback: (json: string) => void) => void,
  label: string,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false
    try {
      run((json) => {
        if (settled) return
        settled = true
        const { error, value } = parsePayload(json)
        if (error) reject(new Error(`[video] ${label}: ${error}`))
        else resolve(value)
      })
    } catch (e) {
      if (settled) return
      settled = true
      reject(e instanceof Error ? e : new Error(`[video] ${label} threw`))
    }
  })
}

function boolResult(value: unknown): boolean {
  return !!(value && typeof value === 'object' && (value as { result?: unknown }).result === true)
}

function createNativeAdapter(native: NativeVideoModule): VideoModule {
  return {
    available: true,
    async open() {
      return boolResult(await invoke((cb) => native.open('{}', cb), 'open'))
    },
    async close() {
      await invoke((cb) => native.close('{}', cb), 'close')
    },
    async isOpen() {
      return boolResult(await invoke((cb) => native.isOpen('{}', cb), 'isOpen'))
    },
  }
}

/** Inert stand-in where no native module exists, so callers need no platform checks. */
function createUnavailableStub(): VideoModule {
  return {
    available: false,
    async open() {
      return false
    },
    async close() {},
    async isOpen() {
      return false
    },
  }
}

let cached: VideoModule | null = null

export function getVideoModule(): VideoModule {
  if (cached) return cached
  const native = readNativeVideo()
  cached = native ? createNativeAdapter(native) : createUnavailableStub()
  return cached
}

/** Test hook: drop the memoised module so a test can swap the native bag. */
export function resetVideoModuleForTests(): void {
  cached = null
}
