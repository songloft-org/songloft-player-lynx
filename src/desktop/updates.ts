import { getSettingsApi } from '../features/settings/api/index.js'
import { useAuthStore } from '../features/auth/store/index.js'
import { readLynxGlobal } from '../native/native-modules.js'
import { useAppSessionStore } from '../store/app-session.js'
import { desktopCall, desktopConfig } from './client.js'

export function initializeDesktopUpdates(): void {
  if (!desktopConfig()?.capabilities.updates) return
  const emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter')
  emitter?.addListener?.(
    'SongloftDesktop.updateProxyRequested',
    async ({ id }: { id: string }) => {
      const session = useAppSessionStore.getState()
      let githubProxy = ''
      if (useAuthStore.getState().status === 'authenticated') {
        githubProxy = await getSettingsApi()
          .getGithubProxy()
          .catch(() => '')
        if (
          session !== useAppSessionStore.getState() ||
          useAuthStore.getState().status !== 'authenticated'
        )
          githubProxy = ''
      }
      await desktopCall('update.proxyResolved', { id, githubProxy }).catch(
        () => {},
      )
    },
  )
}

export function startDesktopUpdates(): void {
  if (!desktopConfig()?.capabilities.updates) return
  void desktopCall('update.confirm').catch(() => {})
  void desktopCall('update.startAutomatic').catch(() => {})
}
