import { appConfig } from '../../../core/config/app-config.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import { readNativeModules } from '../../../native/native-modules.js'
import { isWebPlatform } from '../../../native/web-platform.js'
import { desktopPluginSockets } from '../../../desktop/plugin-sockets.js'

const pendingOpens = new Map<string, object>()

/** Native and Web modules receive URLs only from this parent-owned context. */
export async function pluginSocketRequest(
  entryPath: string,
  frameId: string,
  method: string,
  params: Record<string, unknown>,
) {
  const module = (desktopPluginSockets() ?? readNativeModules()?.[
    isWebPlatform() ? 'SongloftLynxFrame' : 'SongloftPluginBridge'
  ]) as Record<string, (...args: unknown[]) => void> | undefined
  if (!module || typeof module[method] !== 'function')
    throw new Error('plugin sockets are unavailable')
  const id = params.id
  if (typeof id !== 'string' || !/^socket-\d+$/.test(id))
    throw new Error('invalid socket id')
  const key = `${frameId}|${id}`
  if (method === 'socketOpen') {
    const path = params.path
    if (
      typeof path !== 'string' ||
      !path.startsWith('/') ||
      path.startsWith('//') ||
      /[\\#\s]/.test(path) ||
      /%/.test(path.split('?')[0]) ||
      path
        .split('?')[0]
        .split('/')
        .some((p) => p === '..' || p === '.')
    )
      throw new Error('invalid plugin socket path')
    const request = {}
    const base = `${appConfig.baseUrl}${appConfig.basePath}`.replace(
      /^http/,
      'ws',
    )
    pendingOpens.set(key, request)
    try {
      const token =
        (await getSongloftStorage().secure.get('access_token')) || ''
      if (pendingOpens.get(key) !== request) return null
      const url = `${base}/api/v1/jsplugin/${encodeURIComponent(entryPath)}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`
      module.socketOpen(frameId, id, url)
    } finally {
      if (pendingOpens.get(key) === request) pendingOpens.delete(key)
    }
  } else if (method === 'socketSend') {
    if (typeof params.data !== 'string' || params.data.length > 65536)
      throw new Error('invalid socket data')
    module.socketSend(frameId, id, params.data)
  } else if (method === 'socketClose') {
    pendingOpens.delete(key)
    module.socketClose(frameId, id)
  } else throw new Error('unknown socket method')
  return null
}
