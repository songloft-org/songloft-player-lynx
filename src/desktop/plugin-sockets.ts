import { desktopCall, desktopConfig } from './client.js'
import { desktopCookies } from './cef.js'
import { readNativeModules } from '../native/native-modules.js'
const opens = new Map<string, object>()
const adapter = {
  socketOpen(frameId: string, id: string, url: string) {
    const key = `${frameId}|${id}`,
      request = {}
    opens.set(key, request)
    void desktopCookies(url.replace(/^ws/, 'http'))
      .catch(() => ({}))
      .then((values) => {
        if (opens.get(key) !== request) return
        const cookies = Object.entries(values)
          .map(([key, value]) => `${key}=${value}`)
          .join('; ')
        return desktopCall('sockets.open', { frameId, id, url, cookies }).then(
          () => {
            if (opens.get(key) !== request)
              return desktopCall('sockets.close', { frameId, id })
          },
        )
      })
      .catch(() => {
        if (opens.get(key) !== request) return
        const bridge = readNativeModules()?.SongloftPluginBridge as
          | {
              pushToChild?: (
                frameId: string,
                event: string,
                data: string,
              ) => void
            }
          | undefined
        try {
          bridge?.pushToChild?.(
            frameId,
            'pluginSocket',
            JSON.stringify({ frameId, id, type: 'error', data: '' }),
          )
        } catch {}
      })
      .finally(() => {
        if (opens.get(key) === request) opens.delete(key)
      })
  },
  socketSend(frameId: string, id: string, data: string) {
    void desktopCall('sockets.send', { frameId, id, data }).catch(() => {})
  },
  socketClose(frameId: string, id: string) {
    opens.delete(`${frameId}|${id}`)
    void desktopCall('sockets.close', { frameId, id }).catch(() => {})
  },
  closeFrame(frameId: string) {
    for (const key of opens.keys())
      if (key.startsWith(`${frameId}|`)) opens.delete(key)
    void desktopCall('sockets.closeFrame', { frameId }).catch(() => {})
  },
}
export function desktopPluginSockets() {
  return desktopConfig() ? adapter : null
}
