import { timingSafeEqual } from 'node:crypto'
import { unavailableMusicDirectory } from './backend.mjs'

export function createHostRpc({
  token,
  storage,
  backend,
  platform,
  getLocalCredentials,
  network,
  player,
  lifecycle,
  cache,
  windowServices,
  updater,
  confirmUpdate,
  log,
  keyboard,
  sockets,
}) {
  const methods = new Map([
    ['sockets.open', (args) => sockets.open(args)],
    ['sockets.send', (args) => sockets.sendMessage(args)],
    ['sockets.close', (args) => sockets.closeSocket(args)],
    ['sockets.closeFrame', (args) => sockets.closeFrame(args)],
    ['keyboard.configure', (args) => keyboard.configure(args)],
    ['keyboard.overlay', (args) => keyboard.overlay(args)],
    ['log.write', ({ line }) => log.write(line)],
    ['log.read', () => log.read()],
    ['update.state', () => updater?.state ?? { state: 'unavailable' }],
    ['update.check', () => updater.check()],
    [
      'update.download',
      () => {
        void updater.download().catch(() => {})
        return updater.state
      },
    ],
    ['update.cancel', () => updater.cancel()],
    ['update.install', () => updater.install()],
    ['update.confirm', () => confirmUpdate()],
    ['update.startAutomatic', () => updater.automatic()],
    ['update.proxyResolved', (args) => updater.resolveProxy(args)],
    ['window.fullscreen', (args) => windowServices.fullscreen(args)],
    ['window.fullscreenState', () => windowServices.fullscreenState()],
    ['window.repaintCef', () => windowServices.repaintCef()],
    ...[
      'cacheEntry',
      'getEntry',
      'listEntries',
      'removeEntry',
      'clearNamespace',
      'getTasks',
      'cancelTask',
    ].map((method) => [`cache.${method}`, (args) => cache[method](args)]),
    ['network.request', (args) => network.request(args)],
    ['network.cancelAll', () => network.cancelAll()],
    ['network.configure', (args) => network.configure(args)],
    ['player.command', (args) => player.command(args)],
    ['player.status', () => player.status()],
    ['session.mode', () => lifecycle.mode()],
    [
      'session.local',
      ({ chooseMusicDirectory }) =>
        lifecycle.local({
          chooseMusicDirectory: chooseMusicDirectory === true,
        }),
    ],
    ['session.remote', () => lifecycle.remote()],
    ['storage.get', async ({ area, key }) => areaStore(area).get(key)],
    [
      'storage.set',
      async ({ area, key, value }) => {
        if (typeof value !== 'string') throw new Error('Invalid preference')
        await areaStore(area).set(key, value)
        return null
      },
    ],
    [
      'storage.remove',
      async ({ area, key }) => {
        await areaStore(area).remove(key)
        return null
      },
    ],
    [
      'storage.keys',
      async ({ area }) => {
        if (area !== 'prefs') throw new Error('Invalid storage area')
        return storage.prefs.keys()
      },
    ],
    [
      'storage.path',
      ({ name }) => {
        if (!Object.hasOwn(storage.paths, name))
          throw new Error('Invalid directory')
        return storage.paths[name]
      },
    ],
    ['platform.openURL', ({ url }) => platform.openURL(url)],
    ['platform.clipboard', ({ text }) => platform.clipboard(text)],
    ['platform.pickDirectory', () => platform.pickDirectory()],
    ['platform.pickAndUploadFile', (args) => platform.pickAndUploadFile(args)],
    [
      'platform.setInsecureTls',
      ({ enabled }) => platform.setInsecureTls(enabled === true),
    ],
    ['platform.saveFile', (args) => platform.saveFile(args)],
    ['backend.status', () => backend.state],
    [
      'backend.start',
      async ({ musicDirectory }) => backend.start(musicDirectory),
    ],
    [
      'backend.stop',
      async () => {
        await backend.stop()
        return null
      },
    ],
    ['backend.credentials', () => getLocalCredentials()],
  ])
  function areaStore(area) {
    if (area !== 'prefs' && area !== 'secure')
      throw new Error('Invalid storage area')
    return storage[area]
  }
  return async (raw) => {
    let handling = false
    try {
      if (typeof raw !== 'string' || raw.length > 64 * 1024 * 1024)
        throw new Error('Invalid host request')
      const request = JSON.parse(raw)
      const candidate = Buffer.from(
        typeof request.token === 'string' ? request.token : '',
      )
      const expected = Buffer.from(token)
      if (
        candidate.length !== expected.length ||
        !timingSafeEqual(candidate, expected)
      )
        throw new Error('Host access denied')
      const handler = methods.get(request.method)
      if (!handler) throw new Error('Unsupported host method')
      handling = true
      const args = request.args ?? {}
      if (!args || typeof args !== 'object' || Array.isArray(args))
        throw new Error('Invalid host arguments')
      return JSON.stringify({ ok: true, value: await handler(args) })
    } catch (error) {
      if (handling)
        void log?.write(error?.stack ?? String(error)).catch(() => {})
      const credentialError =
        error.message === 'Keychain error -25308'
          ? 'keychain_interaction_required'
          : error.message === 'Keychain error -34018'
            ? 'keychain_signing_required'
            : null
      // Host errors intentionally contain no payloads, paths, credentials or URLs.
      return JSON.stringify({
        ok: false,
        error:
          error.message === 'Host access denied'
            ? 'host_access_denied'
            : credentialError
              ? credentialError
              : [
                    'limit_exceeded',
                    'cancelled',
                    'cache_download_failed',
                    'invalid_cache_request',
                    'invalid_cache_identity',
                    unavailableMusicDirectory,
                  ].includes(error.message)
                ? error.message
                : 'host_request_failed',
      })
    }
  }
}
