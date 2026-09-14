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
/** Why `open()` could or could not put the picture on screen — see `VideoModule.open`. */
export type VideoOpenReason = 'opened' | 'noTrack' | 'failed'

export interface VideoModule {
  /**
   * Show the fullscreen video screen.
   *
   * Answers **why** rather than a bare boolean. `'noTrack'` means the stream is ready
   * and simply carries no picture — real, because `songs.is_video` is recorded from
   * the original file at scan time while a remote song may be served from a cache
   * entry transcoded with `-vn`. `'failed'` means the stream itself could not be
   * loaded (a transcode the server refused, a 404 on the HLS playlist): the song has
   * a picture in principle, it is just not playable here and now. Callers report the
   * two differently rather than leaving either one as "this file has no video track".
   */
  open(): Promise<VideoOpenReason>
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

/**
 * `open()` results cross a deploy boundary: the bundle can be newer than the native
 * binary it runs against, so old hosts still answer a boolean while new ones answer a
 * reason string. Booleans keep their old meaning (`true`/`false` were "opened" and
 * "no track" respectively); strings pass through; anything unrecognised is
 * `'failed'` — saying "we could not show a picture" beats inventing a specific lie.
 */
function openReason(value: unknown): VideoOpenReason {
  const result = value && typeof value === 'object' ? (value as { result?: unknown }).result : undefined
  if (result === true) return 'opened'
  if (result === false) return 'noTrack'
  if (result === 'opened' || result === 'noTrack' || result === 'failed') return result
  return 'failed'
}

function createNativeAdapter(native: NativeVideoModule): VideoModule {
  return {
    available: true,
    async open() {
      return openReason(await invoke((cb) => native.open('{}', cb), 'open'))
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
      return 'failed'
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
