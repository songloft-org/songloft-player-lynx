import { readNativeModules } from './native-modules.js'

interface SongloftBundleModule {
  start(dataDir: string, musicDir: string, port: number, callback: (error: string | null, port: number | null) => void): void
  stop(callback: (error: string | null) => void): void
  isRunning(callback: (running: boolean) => void): void
  getPort(callback: (port: number) => void): void
  getAdminPassword(dataDir: string, callback: (error: string | null, password: string | null) => void): void
  getDefaultMusicDirectory(callback: (path: string) => void): void
  pickMusicDirectory(callback: (error: string | null, path: string | null) => void): void
  ensureMusicPermission(callback: (error: string | null, granted: boolean) => void): void
}

function bundleModule(): SongloftBundleModule {
  const module = readNativeModules()?.SongloftBundle as SongloftBundleModule | undefined
  if (!module || typeof module.start !== 'function') throw new Error('bundle_backend_unavailable')
  return module
}

function callbackPromise<T>(
  invoke: (callback: (...values: unknown[]) => void) => void,
  parse: (...values: unknown[]) => T,
  timeoutMs = 30000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error: unknown, value?: T) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error instanceof Error ? error : new Error(String(error)))
      else resolve(value as T)
    }
    const timer = setTimeout(() => finish(new Error('bundle_native_timeout')), timeoutMs)
    try {
      invoke((...values) => {
        try { finish(null, parse(...values)) }
        catch (error) { finish(error) }
      })
    } catch (error) { finish(error) }
  })
}

function nativeArgs(values: unknown[]): unknown[] {
  // iOS Lynx callbacks deliver multiple callback arguments as a single NSArray;
  // Android invokes Callback.invoke(error, value) and reaches this facade spread.
  return values.length === 1 && Array.isArray(values[0]) ? values[0] : values
}

function errorValue(value: unknown): Error | null {
  return value == null || value === '' ? null : new Error(String(value))
}

export async function startBundleBackend(dataDir: string, musicDir: string): Promise<number> {
  const mod = bundleModule()
  return callbackPromise(
    (callback) => mod.start(dataDir, musicDir, 0, (...values) => callback(...nativeArgs(values))),
    (error, port) => {
      const failure = errorValue(error)
      if (failure) throw failure
      const actualPort = Number(port)
      if (!Number.isInteger(actualPort) || actualPort < 1 || actualPort > 65535) throw new Error('bundle_invalid_port')
      return actualPort
    },
    60000,
  )
}

export function stopBundleBackend(): Promise<void> {
  const mod = bundleModule()
  return callbackPromise(
    (callback) => mod.stop((...values) => callback(...nativeArgs(values))),
    (error) => { const failure = errorValue(error); if (failure) throw failure },
    15000,
  )
}

export function isBundleBackendRunning(): Promise<boolean> {
  return callbackPromise((callback) => bundleModule().isRunning(callback), (running) => running === true)
}

export function getBundleBackendPort(): Promise<number> {
  return callbackPromise((callback) => bundleModule().getPort(callback), (port) => Number(port) || 0)
}

export function getBundleAdminPassword(dataDir: string): Promise<string> {
  const mod = bundleModule()
  return callbackPromise(
    (callback) => mod.getAdminPassword(dataDir, (...values) => callback(...nativeArgs(values))),
    (error, password) => { const failure = errorValue(error); if (failure) throw failure; if (typeof password !== 'string' || !password) throw new Error('bundle_password_unavailable'); return password },
  )
}

export function getDefaultBundleMusicDirectory(): Promise<string> {
  return callbackPromise((callback) => bundleModule().getDefaultMusicDirectory(callback), (path) => {
    if (typeof path !== 'string' || !path) throw new Error('bundle_music_directory_unavailable')
    return path
  })
}

export function pickBundleMusicDirectory(): Promise<string | null> {
  const mod = bundleModule()
  return callbackPromise(
    (callback) => mod.pickMusicDirectory((...values) => callback(...nativeArgs(values))),
    (error, path) => { const failure = errorValue(error); if (failure) { if (failure.message === 'directory_picker_cancelled') return null; throw failure }; return typeof path === 'string' && path ? path : null },
    300000,
  )
}

export function ensureBundleMusicPermission(): Promise<void> {
  const mod = bundleModule()
  return callbackPromise(
    (callback) => mod.ensureMusicPermission((...values) => callback(...nativeArgs(values))),
    (error, granted) => { const failure = errorValue(error); if (failure) throw failure; if (granted !== true) throw new Error('music_permission_denied') },
    300000,
  )
}
