import { desktopCall, desktopConfig, setDesktopSessionKind } from './client.js'
import { appConfig } from '../core/config/app-config.js'
import { readLynxGlobal, readNativeModules } from '../native/native-modules.js'
import { getSongloftStorage } from '../core/storage/index.js'
import {
  PREF_SERVER_URL,
  SECURE_LAST_PASSWORD,
  useAuthStore,
} from '../features/auth/store/index.js'
import { usePlayerStore } from '../features/player/store/index.js'
import { getAudio } from '../native/audio-facade.js'
import { savePlaybackState } from '../features/player/data/playback-persistence.js'
import { releaseAllPluginFrames } from '../features/jsplugin/domain/plugin-frame-release.js'
import {
  getBackStackDepth,
  subscribeBackStack,
} from '../shared/nav/back-stack.js'

interface Session {
  kind: 'local' | 'remote' | null
  address?: string
  credentials?: { username: string; password: string }
  backend?: { error?: string }
}
let installed = false
let changes: Promise<void> = Promise.resolve()
export function requestDesktopMode(
  mode: 'local' | 'remote',
  { chooseMusicDirectory = false } = {},
): Promise<boolean> {
  const operation = changes.then(async () => {
    if (mode === 'local') {
      const session = await desktopCall<Session>('session.local', { chooseMusicDirectory })
      return session.kind === 'local' && !!session.address
    }
    await desktopCall('session.remote')
    setDesktopSessionKind('remote')
    appConfig.bundleBackendBaseUrl = null
    await useAuthStore.getState().hydrate({ resetServer: true })
    return true
  })
  changes = operation.then(
    () => {},
    (error) => {
      const code = error instanceof Error ? error.message : ''
      useAuthStore.setState({
        status: 'unauthenticated',
        isLoading: false,
        error:
          code === 'keychain_interaction_required' ||
          code === 'keychain_signing_required' ||
          code === 'bundle_music_directory_unavailable'
            ? code
            : 'desktop_host_failed',
      })
    },
  )
  return operation
}
/** Resolve auth for a local session even when its backend cannot start. */
export async function restoreDesktopSession(): Promise<boolean> {
  if (!desktopConfig()) return false
  const session = await desktopCall<Session>('session.mode')
  if (session.kind) setDesktopSessionKind(session.kind)
  if (session.kind !== 'local') return false
  if (!session.address || !session.credentials) {
    appConfig.bundleBackendBaseUrl = null
    useAuthStore.setState({
      status: 'unauthenticated',
      isLoading: false,
      error: session.backend?.error === 'bundle_music_directory_unavailable'
        ? session.backend.error
        : 'desktop_host_failed',
    })
    return true
  }
  const storage = getSongloftStorage()
  if (await storage.secure.get(SECURE_LAST_PASSWORD) === session.credentials.password) {
    // Older desktop candidates remembered the generated password and loopback port
    // in the login form's keys. Recover the server address they had saved separately.
    const remote = await storage.prefs.get('desktop.remoteAddress')
    const address = await storage.prefs.get(PREF_SERVER_URL)
    if (address && /^http:\/\/127\.0\.0\.1:\d+$/.test(address) && remote !== address) {
      if (remote) await storage.prefs.set(PREF_SERVER_URL, remote)
      else await storage.prefs.remove(PREF_SERVER_URL)
    }
    await storage.secure.remove(SECURE_LAST_PASSWORD)
  }
  appConfig.bundleBackendBaseUrl = session.address
  await useAuthStore.getState().login({
    ...session.credentials,
    apiBaseUrl: session.address,
    insecureTls: false,
    bundle: true,
  })
  return true
}
export function initializeDesktopSession(): void {
  const config = desktopConfig()
  if (!config || installed) return
  const emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter')
  if (!emitter?.addListener) return
  installed = true
  subscribeBackStack(() => {
    void desktopCall('keyboard.overlay', {
      blocked: getBackStackDepth() > 0,
    }).catch(() => {})
  })
  emitter.addListener(
    'SongloftDesktop.prepare',
    async (payload: { id: string; mode: string }) => {
      try {
        releaseAllPluginFrames()
        if (payload.mode === 'quit' || payload.mode === 'update') {
          const state = usePlayerStore.getState()
          await savePlaybackState({
            playlist: state.playlist,
            currentIndex: state.currentIndex,
            positionMs: state.currentTime,
            context: state.playbackContext,
          })
          await getAudio().stop()
        } else await useAuthStore.getState().logout({ revokeServer: false })
      } finally {
        const bridge = readNativeModules()?.bridge as
          | { call?: (method: string, payload: string, cb: () => void) => void }
          | undefined
        bridge?.call?.(
          'songloft.desktop.prepared',
          JSON.stringify({ token: config.token, id: payload.id }),
          () => {},
        )
      }
    },
  )
  emitter.addListener(
    'SongloftDesktop.switchMode',
    (payload: { mode: string }) => {
      if (payload.mode === 'local' || payload.mode === 'remote')
        void requestDesktopMode(payload.mode).catch(() => {})
    },
  )
  emitter.addListener(
    'SongloftDesktop.sessionChanged',
    (payload: { mode: string }) => {
      if (payload.mode === 'local') void restoreDesktopSession().catch(() => {})
      else if (payload.mode === 'backend-failed')
        usePlayerStore.getState().reset()
    },
  )
}
