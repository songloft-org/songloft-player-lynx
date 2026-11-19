import { appConfig } from '../config/app-config.js'
import { getSongloftStorage } from '../storage/index.js'
import { desktopCall, desktopConfig } from '../../desktop/client.js'
import { requestDesktopMode, restoreDesktopSession } from '../../desktop/session.js'
import { useAuthStore } from '../../features/auth/store/index.js'
import { usePlayerStore } from '../../features/player/store/index.js'
import { getAudio } from '../../native/audio-facade.js'
import { getPlatformCapabilities } from '../../native/platform-capabilities.js'
import {
  ensureBundleMusicPermission,
  getBundleAdminPassword,
  getBundleBackendPort,
  getDefaultBundleMusicDirectory,
  isBundleBackendRunning,
  pickBundleMusicDirectory,
  startBundleBackend,
  stopBundleBackend,
} from '../../native/native-bundle.js'
import { releaseAllPluginFrames } from '../../features/jsplugin/domain/plugin-frame-release.js'
import type { SongloftStorage } from '../storage/types.js'

const MODE_KEY = 'desktop.mode'
const MUSIC_DIRECTORY_KEY = 'desktop.musicDirectory'
const BACKEND_DIR_NAME = 'songloft-backend'

export type BundleRunMode = 'local' | 'remote'

export function bundleModeAvailable(): boolean {
  return getPlatformCapabilities().bundleMode
}

async function readPreference(storage: SongloftStorage, key: string): Promise<string | null> {
  try { return await storage.prefs.get(key) } catch { return null }
}

async function writePreference(storage: SongloftStorage, key: string, value: string): Promise<void> {
  await storage.prefs.set(key, value)
}

function dataDirectory(storage: SongloftStorage): Promise<string> {
  return storage.paths.appData().then((base) => `${base.replace(/\/+$/, '')}/${BACKEND_DIR_NAME}`)
}

async function waitForBackend(address: string): Promise<void> {
  if (typeof fetch === 'undefined') throw new Error('bundle_fetch_unavailable')
  let lastError: unknown
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const response = await fetch(`${address}/api/v1/health`)
      if (response.ok) return
      lastError = new Error(`bundle_health_${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(lastError instanceof Error ? `bundle_health_failed:${lastError.message}` : 'bundle_health_failed')
}

async function startMobileBackend(musicDirectory: string): Promise<{ address: string; dataDir: string }> {
  const storage = getSongloftStorage()
  const dataDir = await dataDirectory(storage)
  await ensureBundleMusicPermission()
  const running = await isBundleBackendRunning()
  let port = running ? await getBundleBackendPort() : 0
  if (!port) port = await startBundleBackend(dataDir, musicDirectory)
  if (!port) throw new Error('bundle_invalid_port')
  const address = `http://127.0.0.1:${port}`
  await waitForBackend(address)
  appConfig.bundleBackendBaseUrl = address
  return { address, dataDir }
}

async function authenticateMobileAdmin(address: string, dataDir: string): Promise<void> {
  const password = await getBundleAdminPassword(dataDir)
  await useAuthStore.getState().login({
    username: 'admin',
    password,
    apiBaseUrl: address,
    insecureTls: false,
    bundle: true,
  })
  const auth = useAuthStore.getState()
  if (auth.status !== 'authenticated') throw new Error(auth.error || 'bundle_login_failed')
}

async function stopCurrentSession(): Promise<void> {
  releaseAllPluginFrames()
  try { await getAudio().stop() } catch { /* No active player on first login. */ }
  await useAuthStore.getState().logout({ revokeServer: false })
  usePlayerStore.getState().reset()
  appConfig.bundleBackendBaseUrl = null
}

async function switchMobileToLocal(): Promise<boolean> {
  const storage = getSongloftStorage()
  const savedDirectory = await readPreference(storage, MUSIC_DIRECTORY_KEY)
  const musicDirectory = savedDirectory || await pickBundleMusicDirectory()
  if (!musicDirectory) return false

  await stopCurrentSession()
  const { address, dataDir } = await startMobileBackend(musicDirectory)
  await writePreference(storage, MUSIC_DIRECTORY_KEY, musicDirectory)
  await writePreference(storage, MODE_KEY, 'local')
  await authenticateMobileAdmin(address, dataDir)
  return true
}

export async function switchBundleMode(mode: BundleRunMode, options: { chooseMusicDirectory?: boolean } = {}): Promise<boolean> {
  if (!bundleModeAvailable()) throw new Error('bundle_backend_unavailable')
  if (desktopConfig()) {
    if (!(await requestDesktopMode(mode, options))) return false
    if (mode === 'local') {
      for (let attempt = 0; attempt < 600; attempt++) {
        const auth = useAuthStore.getState()
        if (auth.status === 'authenticated') return true
        if (!auth.isLoading && auth.error) throw new Error(auth.error)
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      throw new Error('bundle_login_timeout')
    }
    return true
  }

  const storage = getSongloftStorage()
  if (mode === 'local') {
    if (options.chooseMusicDirectory) {
      const selected = await pickBundleMusicDirectory()
      if (!selected) return false
      await writePreference(storage, MUSIC_DIRECTORY_KEY, selected)
    }
    return switchMobileToLocal()
  }

  await writePreference(storage, MODE_KEY, 'remote')
  await stopCurrentSession()
  if (await isBundleBackendRunning()) await stopBundleBackend()
  await useAuthStore.getState().hydrate({ resetServer: true })
  await useAuthStore.getState().checkAuth()
  return true
}

export async function restoreBundleSession(): Promise<boolean> {
  if (!bundleModeAvailable()) return false
  if (desktopConfig()) return restoreDesktopSession()

  const storage = getSongloftStorage()
  if (await readPreference(storage, MODE_KEY) !== 'local') return false
  let musicDirectory = await readPreference(storage, MUSIC_DIRECTORY_KEY)
  if (!musicDirectory) {
    // iOS is sandboxed to Documents and does not show a directory picker.
    try { musicDirectory = await getDefaultBundleMusicDirectory() } catch { return false }
  }
  try {
    const { address, dataDir } = await startMobileBackend(musicDirectory)
    await writePreference(storage, MUSIC_DIRECTORY_KEY, musicDirectory)
    await authenticateMobileAdmin(address, dataDir)
    return true
  } catch (error) {
    useAuthStore.setState({ status: 'unauthenticated', isLoading: false, error: error instanceof Error ? error.message : 'bundle_start_failed' })
    return false
  }
}

export async function readBundleMode(): Promise<BundleRunMode> {
  if (desktopConfig()) {
    try {
      const state = await desktopCall<{ kind?: BundleRunMode }>('session.mode')
      return state.kind === 'local' ? 'local' : 'remote'
    } catch { return 'remote' }
  }
  return await readPreference(getSongloftStorage(), MODE_KEY) === 'local' ? 'local' : 'remote'
}

export async function readBundleMusicDirectory(): Promise<string | null> {
  return readPreference(getSongloftStorage(), MUSIC_DIRECTORY_KEY)
}

export async function chooseBundleMusicDirectory(): Promise<string | null> {
  if (!bundleModeAvailable()) return null
  const current = await readBundleMusicDirectory()
  if (desktopConfig()) {
    const picked = await desktopCall<string | null>('platform.pickDirectory', { initialPath: current ?? '' })
    return picked || null
  }
  const selected = await pickBundleMusicDirectory()
  return selected
}

export async function changeBundleMusicDirectory(): Promise<string | null> {
  const selected = await chooseBundleMusicDirectory()
  if (!selected) return null
  if (desktopConfig()) return selected
  const storage = getSongloftStorage()
  await writePreference(storage, MUSIC_DIRECTORY_KEY, selected)
  if (await readPreference(storage, MODE_KEY) === 'local') {
    await stopCurrentSession()
    if (await isBundleBackendRunning()) await stopBundleBackend()
    const { address, dataDir } = await startMobileBackend(selected)
    await authenticateMobileAdmin(address, dataDir)
  }
  return selected
}
