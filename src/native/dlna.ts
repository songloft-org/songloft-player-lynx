import { readNativeModules } from './native-modules.js'

export interface DlnaDevice {
  id: string
  name: string
  location: string
}

export interface DlnaCastOptions {
  deviceId: string
  url: string
  title: string
  mimeType?: string
}

export interface DlnaPlaybackState {
  state: string
  positionMs: number
  durationMs: number
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function mediaMetadata({ url, title, mimeType }: DlnaCastOptions): string {
  const protocol = mimeType ? ` protocolInfo="http-get:*:${escapeXml(mimeType)}:*"` : ''
  const itemClass = mimeType?.startsWith('video/') ? 'object.item.videoItem' : 'object.item.audioItem'
  return '<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">'
    + `<item id="0" parentID="-1" restricted="1"><dc:title>${escapeXml(title)}</dc:title>`
    + `<upnp:class>${itemClass}</upnp:class><res${protocol}>${escapeXml(url)}</res></item></DIDL-Lite>`
}

/** Promise-shaped DLNA API used by the app. */
export interface DlnaModule {
  startDiscovery(): Promise<void>
  stopDiscovery(): Promise<void>
  getDevices(): Promise<DlnaDevice[]>
  cast(options: DlnaCastOptions): Promise<void>
  control(action: DlnaAction, options?: { deviceId?: string; value?: number }): Promise<void>
  getPlaybackState(deviceId: string): Promise<DlnaPlaybackState | null>
  /** False when no native module is present (Web, or a build without the module). */
  readonly available: boolean
}

export type DlnaAction = 'play' | 'pause' | 'stop' | 'seek' | 'volume'

/**
 * The **native** shape: Lynx native methods do not return Promises. Reads and
 * writes alike take a `com.lynx.react.bridge.Callback` that receives a JSON
 * string; `cast`/`control` take their arguments as one JSON string.
 *
 * `dlna.ts` used to skip this entirely and just `as DlnaModule` the native bag,
 * i.e. claim it returned Promises. It does not — `startDiscovery()` returns
 * `undefined`, so `DlnaPage`'s `.then()` threw a TypeError the moment the effect
 * mounted and the cast screen crashed on open for every Android user. The
 * convention this file now follows is spelled out in
 * `core/storage/native-storage.ts`: promisify in the TS adapter, never cast.
 */
interface NativeDlnaModule {
  startDiscovery(callback: (json: string) => void): void
  stopDiscovery(callback: (json: string) => void): void
  getDevices(callback: (json: string) => void): void
  cast(argsJson: string, callback: (json: string) => void): void
  control(argsJson: string, callback: (json: string) => void): void
}

const NATIVE_METHODS = ['startDiscovery', 'stopDiscovery', 'getDevices', 'cast', 'control'] as const

function readNativeDlna(): NativeDlnaModule | null {
  const mod = readNativeModules()?.SongloftDlna as Record<string, unknown> | undefined
  if (!mod) return null
  // A partial module is worse than none: it would fail deep inside a page.
  for (const name of NATIVE_METHODS) {
    if (typeof mod[name] !== 'function') return null
  }
  return mod as unknown as NativeDlnaModule
}

/** Parse a callback payload, tolerating malformed JSON from a wedged host. */
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
    return { error: `malformed DLNA response: ${json.slice(0, 120)}` }
  }
}

/**
 * Wrap one callback-style native call. Rejects on a payload carrying `error`, so
 * callers can surface a real message instead of a silent no-op.
 */
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
        if (error) reject(new Error(`[dlna] ${label}: ${error}`))
        else resolve(value)
      })
    } catch (e) {
      if (settled) return
      settled = true
      reject(e instanceof Error ? e : new Error(`[dlna] ${label} threw`))
    }
  })
}

function toDevices(value: unknown): DlnaDevice[] {
  if (!Array.isArray(value)) return []
  const out: DlnaDevice[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const { id, name, location } = raw as Record<string, unknown>
    if (typeof id !== 'string' || id.length === 0) continue
    out.push({
      id,
      name: typeof name === 'string' && name.length > 0 ? name : id,
      location: typeof location === 'string' ? location : '',
    })
  }
  return out
}

function createNativeAdapter(native: NativeDlnaModule): DlnaModule {
  return {
    available: true,
    async startDiscovery() {
      await invoke((cb) => native.startDiscovery(cb), 'startDiscovery')
    },
    async stopDiscovery() {
      await invoke((cb) => native.stopDiscovery(cb), 'stopDiscovery')
    },
    async getDevices() {
      return toDevices(await invoke((cb) => native.getDevices(cb), 'getDevices'))
    },
    async cast(options) {
      const { deviceId, url, title } = options
      const args = JSON.stringify({ deviceId, url, title, metadata: mediaMetadata(options) })
      await invoke((cb) => native.cast(args, cb), 'cast')
    },
    async control(action, options) {
      const args = JSON.stringify({ action, ...options })
      await invoke((cb) => native.control(args, cb), 'control')
    },
    async getPlaybackState(deviceId) {
      const value = await invoke((cb) => native.control(JSON.stringify({ action: 'status', deviceId }), cb), 'status')
      if (!value || typeof value !== 'object') return null
      const state = value as Partial<DlnaPlaybackState>
      if (typeof state.state !== 'string') return null
      return {
        state: state.state.toUpperCase(),
        positionMs: typeof state.positionMs === 'number' && Number.isFinite(state.positionMs) ? Math.max(0, state.positionMs) : 0,
        durationMs: typeof state.durationMs === 'number' && Number.isFinite(state.durationMs) ? Math.max(0, state.durationMs) : 0,
      }
    },
  }
}

/** Inert stand-in where no native module exists, so callers need no platform checks. */
function createUnavailableStub(): DlnaModule {
  return {
    available: false,
    async startDiscovery() { },
    async stopDiscovery() { },
    async getDevices() {
      return []
    },
    async cast() { },
    async control() { },
    async getPlaybackState() { return null },
  }
}

let cached: DlnaModule | null = null

export function getDlnaModule(): DlnaModule {
  if (cached) return cached
  const native = readNativeDlna()
  cached = native ? createNativeAdapter(native) : createUnavailableStub()
  return cached
}

/** Test hook: drop the memoized module so a scenario can install its own. */
export function resetDlnaModuleForTests(): void {
  cached = null
}
