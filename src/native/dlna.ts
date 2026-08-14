import { readNativeModules } from './native-modules.js'

export interface DlnaDevice {
  id: string
  name: string
  location: string
}

/** Promise-shaped DLNA API used by the app. */
export interface DlnaModule {
  startDiscovery(): Promise<void>
  stopDiscovery(): Promise<void>
  getDevices(): Promise<DlnaDevice[]>
  cast(deviceId: string, url: string, title: string): Promise<void>
  control(action: DlnaAction, options?: { deviceId?: string; value?: number }): Promise<void>
  /** False when no native module is present (Web, or a build without the module). */
  readonly available: boolean
}

export type DlnaAction = 'play' | 'pause' | 'stop' | 'seek'

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
    async cast(deviceId, url, title) {
      const args = JSON.stringify({ deviceId, url, title })
      await invoke((cb) => native.cast(args, cb), 'cast')
    },
    async control(action, options) {
      const args = JSON.stringify({ action, ...options })
      await invoke((cb) => native.control(args, cb), 'control')
    },
  }
}

/** Inert stand-in where no native module exists, so callers need no platform checks. */
function createUnavailableStub(): DlnaModule {
  return {
    available: false,
    async startDiscovery() {},
    async stopDiscovery() {},
    async getDevices() {
      return []
    },
    async cast() {},
    async control() {},
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
