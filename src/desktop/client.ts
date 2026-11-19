import { readLynxGlobal, readNativeModules } from '../native/native-modules.js'

export interface DesktopConfig {
  id: string
  token: string
  os: 'darwin' | 'win32'
  build?: { version: string; clientSha: string; builtAt: string }
  capabilities: Record<string, boolean>
  audioFormats?: string[]
  videoFormats?: string[]
  sessionKind?: 'local' | 'remote'
  windowVisible?: boolean
  assetBaseUrl?: string
}
let sessionKind: { token: string; kind: 'local' | 'remote' } | null = null
export function setDesktopSessionKind(kind: 'local' | 'remote'): void {
  const config = desktopConfig()
  if (config) sessionKind = { token: config.token, kind }
}
export function isDesktopLocalSession(): boolean {
  const config = desktopConfig()
  return (
    !!config &&
    (sessionKind?.token === config.token
      ? sessionKind.kind
      : config.sessionKind) === 'local'
  )
}
/** Dynamic listener ports are transport addresses, never a library identity. */
export function stableDesktopServerUrl(raw: string): string {
  return isDesktopLocalSession()
    ? raw.replace(
        /^http:\/\/(?:127\.0\.0\.1|localhost):\d+(?=\/|$)/,
        'http://bundle.songloft.invalid',
      )
    : raw
}
export function desktopConfig(): DesktopConfig | null {
  const value = readLynxGlobal()?.__globalProps?.songloftDesktop
  return value &&
    typeof value.token === 'string' &&
    typeof value.id === 'string'
    ? value
    : null
}
export function desktopCall<T = unknown>(
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const config = desktopConfig()
  const bridge = readNativeModules()?.bridge as
    | {
        call?: (
          method: string,
          args: string,
          callback: (result: string) => void,
        ) => void
      }
    | undefined
  if (!config || typeof bridge?.call !== 'function')
    return Promise.reject(new Error('desktop_host_unavailable'))
  const call = bridge.call.bind(bridge)
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (error: unknown, value?: T) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(value as T)
    }
    const timeout =
      method === 'update.install'
        ? 300000
        : method === 'update.check'
          ? 45000
          : method === 'cache.cacheEntry'
            ? 20 * 60 * 1000 + 1000
            : method.startsWith('platform.pick') ||
                method === 'platform.saveFile'
              ? 300000
              : method === 'backend.start'
                ? 45000
                : method.startsWith('session.')
                  ? 300000
                  : method === 'network.request'
                    ? Math.min(300000, Number(args.timeoutMs) || 30000) + 1000
                    : 20000
    const timer = setTimeout(
      () => finish(new Error('desktop_host_timeout')),
      timeout,
    )
    try {
      call(
        'songloft.desktop.rpc',
        JSON.stringify({ token: config.token, method, args }),
        (result) => {
          try {
            const reply = JSON.parse(result)
            if (!reply.ok) throw new Error(reply.error || 'desktop_host_failed')
            finish(null, reply.value)
          } catch (error) {
            finish(error)
          }
        },
      )
    } catch (error) {
      finish(error)
    }
  })
}
