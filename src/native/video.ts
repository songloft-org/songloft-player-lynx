import { readLynxGlobal, readNativeModules } from './native-modules.js'

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

/**
 * How the video surface should be sized against its container. `fit` letterboxes to
 * preserve aspect ratio; `zoom` fills the container, cropping the excess. `fill`
 * (unconditional stretch) is deliberately not offered: it is what the Android host
 * used to do by accident, and is never what a user asks for once they can pick.
 */
export type ScaleMode = 'fit' | 'zoom'

/** Which orientation the video screen requests from the OS. */
export type OrientationMode = 'portrait' | 'landscape' | 'auto'

/** Reported by the host after decoder produces the first frame. */
export interface VideoSize {
  width: number
  height: number
}

/** CSS-logical rectangle for the underlay surface, in the same unit Lynx layout uses. */
export interface SurfaceRect {
  x: number
  y: number
  width: number
  height: number
}

/** Payload attached to `orientationChanged` events. */
export interface OrientationPayload {
  orientation: 'portrait' | 'landscape'
  width: number
  height: number
}

/** Global event names — must match the host constants byte-for-byte. */
export const VIDEO_SIZE_EVENT = 'SongloftVideo.videoSizeChanged'
export const VIDEO_ORIENTATION_EVENT = 'SongloftVideo.orientationChanged'
export const VIDEO_CLOSED_EVENT = 'SongloftVideo.closed'

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
  /**
   * Position and size the underlay surface. The page computes this from the video's
   * aspect ratio and the current scale mode; the host applies it to the native view
   * (Android SurfaceView LayoutParams, iOS AVPlayerLayer frame, Harmony XComponent
   * size). Units are CSS-logical pixels — the same unit `boundingClientRect` returns
   * in Lynx — the host converts to whatever its native metric is (px / pt / vp).
   */
  setSurfaceLayout(rect: SurfaceRect): Promise<void>
  /**
   * Request an orientation lock for the host activity/window. `'auto'` releases the
   * lock and returns to the system default (this is what `close()` implicitly does).
   */
  setOrientation(mode: OrientationMode): Promise<void>
  /**
   * Pull the decoded video's pixel dimensions. Usually the page listens to the
   * `videoSizeChanged` event instead; this is a fallback for pages that come up
   * *after* the first frame was decoded (missing the event).
   */
  getVideoSize(): Promise<VideoSize | null>
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
  setSurfaceLayout(argsJson: string, callback: (json: string) => void): void
  setOrientation(argsJson: string, callback: (json: string) => void): void
  getVideoSize(argsJson: string, callback: (json: string) => void): void
}

const NATIVE_METHODS = [
  'open',
  'close',
  'isOpen',
  'setSurfaceLayout',
  'setOrientation',
  'getVideoSize',
] as const

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

function coercePositiveInt(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function videoSizeResult(value: unknown): VideoSize | null {
  if (!value || typeof value !== 'object') return null
  const obj = (value as { result?: unknown }).result
  if (!obj || typeof obj !== 'object') return null
  const width = coercePositiveInt((obj as Record<string, unknown>).width)
  const height = coercePositiveInt((obj as Record<string, unknown>).height)
  if (width === null || height === null) return null
  return { width, height }
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
    async setSurfaceLayout(rect: SurfaceRect) {
      const payload = JSON.stringify({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
      await invoke((cb) => native.setSurfaceLayout(payload, cb), 'setSurfaceLayout')
    },
    async setOrientation(mode: OrientationMode) {
      const payload = JSON.stringify({ mode })
      await invoke((cb) => native.setOrientation(payload, cb), 'setOrientation')
    },
    async getVideoSize() {
      return videoSizeResult(await invoke((cb) => native.getVideoSize('{}', cb), 'getVideoSize'))
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
    async setSurfaceLayout() {},
    async setOrientation() {},
    async getVideoSize() {
      return null
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
  videoSizeListeners.clear()
  orientationListeners.clear()
  closedListeners.clear()
  hostListenersInstalled = false
}

// -- event subscriptions -----------------------------------------------------

type VideoSizeListener = (size: VideoSize) => void
type OrientationListener = (payload: OrientationPayload) => void
type ClosedListener = () => void

const videoSizeListeners = new Set<VideoSizeListener>()
const orientationListeners = new Set<OrientationListener>()
const closedListeners = new Set<ClosedListener>()
let hostListenersInstalled = false

/**
 * Subscribe to `videoSizeChanged` events pushed by the host. Idempotent per
 * listener; returns an unsubscribe function.
 */
export function subscribeVideoSize(listener: VideoSizeListener): () => void {
  installHostListeners()
  videoSizeListeners.add(listener)
  return () => videoSizeListeners.delete(listener)
}

/**
 * Subscribe to `orientationChanged` events — the host tells the page which way it
 * ended up (may differ from what was requested, e.g. system lock refused rotation).
 */
export function subscribeOrientation(listener: OrientationListener): () => void {
  installHostListeners()
  orientationListeners.add(listener)
  return () => orientationListeners.delete(listener)
}

/**
 * Subscribe to `closed` events — the host tells the page that the video screen was
 * closed by a system path (iOS Now Playing dismissal, Harmony back gesture, etc.).
 * The page uses this to keep the route in sync.
 */
export function subscribeVideoClosed(listener: ClosedListener): () => void {
  installHostListeners()
  closedListeners.add(listener)
  return () => closedListeners.delete(listener)
}

function parseVideoSize(payload: unknown): VideoSize | null {
  if (!payload || typeof payload !== 'object') return null
  const width = coercePositiveInt((payload as Record<string, unknown>).width)
  const height = coercePositiveInt((payload as Record<string, unknown>).height)
  if (width === null || height === null) return null
  return { width, height }
}

function parseOrientation(payload: unknown): OrientationPayload | null {
  if (!payload || typeof payload !== 'object') return null
  const raw = payload as Record<string, unknown>
  const orientation = raw.orientation === 'landscape' ? 'landscape' : 'portrait'
  const width = coercePositiveInt(raw.width) ?? 0
  const height = coercePositiveInt(raw.height) ?? 0
  return { orientation, width, height }
}

function installHostListeners(): void {
  if (hostListenersInstalled) return
  const l = readLynxGlobal()
  if (!l || typeof l.getJSModule !== 'function') return
  try {
    const emitter = l.getJSModule('GlobalEventEmitter')
    if (!emitter || typeof emitter.addListener !== 'function') return
    emitter.addListener(VIDEO_SIZE_EVENT, (payload: unknown) => {
      const size = parseVideoSize(payload)
      if (size) videoSizeListeners.forEach((fn) => fn(size))
    })
    emitter.addListener(VIDEO_ORIENTATION_EVENT, (payload: unknown) => {
      const parsed = parseOrientation(payload)
      if (parsed) orientationListeners.forEach((fn) => fn(parsed))
    })
    emitter.addListener(VIDEO_CLOSED_EVENT, () => {
      closedListeners.forEach((fn) => fn())
    })
    hostListenersInstalled = true
  } catch {
    // No usable emitter (non-Lynx host / tests).
  }
}
