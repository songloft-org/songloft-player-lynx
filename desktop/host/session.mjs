import { networkInterfaces } from 'node:os'
export function backendLanAddresses(address, interfaces = networkInterfaces()) {
  if (!address) return []
  const port = new URL(address).port
  return [
    ...new Set(
      Object.values(interfaces)
        .flat()
        .filter((item) => item && !item.internal && !item.scopeid)
        .map(
          (item) =>
            `http://${item.family === 'IPv6' ? `[${item.address}]` : item.address}:${port}`,
        ),
    ),
  ].sort()
}
export class DesktopSession {
  #transition = null
  #retry = 0
  #retryTimer
  #closed = false
  #updating = false
  #modeGeneration = 0
  constructor({
    cache,
    storage,
    backend,
    platform,
    player,
    network,
    credentials,
    prepare,
    publish,
    confirmUpdate = async () => {},
    localFailure = async () => {},
    cancelPluginWork = () => {},
  }) {
    Object.assign(this, {
      cache,
      storage,
      backend,
      platform,
      player,
      network,
      credentials,
      prepare,
      publish,
      confirmUpdate,
      localFailure,
      cancelPluginWork,
    })
    backend.on('unexpected-exit', () => {
      void player.command({ method: 'stop' }).catch(() => {})
      platform.stop()
      network.cancelAll()
      void cache.cancelAll()
      cancelPluginWork()
      publish('backend-failed')
      // Bound crash loops; retain data and leave a manual retry via local mode.
      if (this.#closed || this.#updating || ++this.#retry > 3) return
      const expected = this.#modeGeneration
      this.#retryTimer = setTimeout(() => {
        if (this.#closed || expected !== this.#modeGeneration) return
        void this.storage.prefs
          .get('desktop.mode')
          .then((mode) =>
            mode === 'local' ? this.local({ restart: true }) : null,
          )
          .catch(() => publish('backend-failed'))
      }, this.#retry * 1000)
    })
  }
  async mode() {
    const kind = await this.storage.prefs.get('desktop.mode')
    return {
      kind,
      ...(kind === 'local' && this.backend.state.state === 'running'
        ? {
            address: this.backend.state.address,
            lanAddresses: backendLanAddresses(this.backend.state.address),
            credentials: await this.credentials(),
          }
        : {}),
      backend: this.backend.state,
    }
  }
  async #run(action) {
    const operation = this.#transition
      ? this.#transition.catch(() => {}).then(action)
      : action()
    this.#transition = operation
    try {
      return await operation
    } finally {
      if (this.#transition === operation) this.#transition = null
    }
  }
  async local({
    initial = false,
    restart = false,
    chooseMusicDirectory = false,
  } = {}) {
    if (this.#closed || this.#updating) throw new Error('Session is stopping')
    if (!restart) {
      ++this.#modeGeneration
      clearTimeout(this.#retryTimer)
      this.#retry = 0
    }
    const expected = this.#modeGeneration
    const operation = this.#run(async () => {
      if (restart && expected !== this.#modeGeneration) return this.mode()
      let music = await this.storage.prefs.get('desktop.musicDirectory')
      if (this.#closed) throw new Error('Session is stopping')
      if (chooseMusicDirectory && this.backend.state.state === 'running')
        return this.mode()
      if (chooseMusicDirectory || !music)
        music = await this.platform.pickDirectory()
      if (this.#closed) throw new Error('Session is stopping')
      if (!music) return this.mode()
      if (!initial) await this.prepare('local')
      await this.player.command({ method: 'stop' })
      this.platform.stop()
      this.network.cancelAll()
      await this.cache.cancelAll()
      this.cancelPluginWork()
      if (this.#closed) throw new Error('Session is stopping')
      const state = await this.backend.start(music)
      // The health check only succeeds after backend initialization and schema
      // migrations complete. Keep the previous app until this point, including
      // updates first launched into a remote session.
      await this.confirmUpdate()
      await this.storage.prefs.set('desktop.musicDirectory', music)
      await this.storage.prefs.set('desktop.mode', 'local')
      if (!restart) this.#retry = 0
      if (!initial) this.publish('local')
      return {
        kind: 'local',
        address: state.address,
        credentials: await this.credentials(),
        backend: state,
      }
    })
    try {
      return await operation
    } catch (error) {
      if (!initial && !restart && !this.#closed) await this.localFailure(error)
      throw error
    }
  }
  async remote({ initial = false } = {}) {
    if (this.#closed || this.#updating) throw new Error('Session is stopping')
    ++this.#modeGeneration
    clearTimeout(this.#retryTimer)
    return this.#run(async () => {
      if (!initial) await this.prepare('remote')
      await this.player.command({ method: 'stop' })
      this.platform.stop()
      this.network.cancelAll()
      await this.cache.cancelAll()
      this.cancelPluginWork()
      await this.backend.stop()
      await this.storage.prefs.set('desktop.mode', 'remote')
      clearTimeout(this.#retryTimer)
      this.#retry = 0
      if (!initial) this.publish('remote')
      return this.mode()
    })
  }
  async close() {
    this.#closed = true
    clearTimeout(this.#retryTimer)
    await this.#stopTasks()
  }
  async stopForUpdate() {
    if (this.#closed || this.#updating) throw new Error('Session is stopping')
    this.#updating = true
    ++this.#modeGeneration
    clearTimeout(this.#retryTimer)
    const release = () => {
      this.#updating = false
    }
    try {
      await this.#run(async () => {
        await this.prepare('update')
        await this.#stopTasks()
      })
      return release
    } catch (error) {
      release()
      throw error
    }
  }
  async #stopTasks() {
    await this.player.command({ method: 'stop' })
    this.platform.stop()
    this.network.cancelAll()
    await this.cache.cancelAll()
    this.cancelPluginWork()
    await this.backend.stop()
  }
}
