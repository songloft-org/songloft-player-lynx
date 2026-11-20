import { EventEmitter } from 'node:events'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  mkdir,
  open,
  readFile,
  lstat,
  rename,
  unlink,
  copyFile,
  chmod,
} from 'node:fs/promises'
import { join, basename, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { verifyManifest } from './update-manifest.mjs'

export class DesktopUpdater extends EventEmitter {
  #operation = null
  #controller
  #envelope
  #manifest
  #path
  #timer
  #installInProgress = false
  #proxy = ''
  #pendingProxy
  #closed = false
  constructor({
    directory,
    network,
    identity,
    currentVersion,
    currentClientSha,
    currentBuiltAt,
    variant = 'bundled',
    publicKey,
    manifestUrl,
    helper,
    appPath,
    stop,
    backup,
    requestProxy,
    target = { os: process.platform, arch: process.arch },
  }) {
    super()
    Object.assign(this, {
      directory,
      network,
      identity,
      currentVersion,
      currentClientSha,
      currentBuiltAt,
      variant,
      publicKey,
      manifestUrl,
      helper,
      appPath,
      stop,
      backup,
      requestProxy,
      target,
    })
    this.state = {
      state: 'idle',
      version: null,
      bytes: 0,
      total: 0,
      error: null,
    }
  }
  #publish(patch) {
    this.state = { ...this.state, ...patch }
    this.emit('state', this.state)
  }
  resolveProxy({ id, githubProxy }) {
    if (this.#pendingProxy && this.#pendingProxy.id === id)
      this.#pendingProxy.finish(
        typeof githubProxy === 'string' ? githubProxy : '',
      )
    return null
  }
  async #readProxy() {
    if (!this.requestProxy) return ''
    const value = await new Promise((resolve) => {
      const id = randomUUID()
      const finish = (proxy) => {
        clearTimeout(timer)
        this.#pendingProxy = null
        resolve(proxy)
      }
      const timer = setTimeout(() => finish(''), 10000)
      this.#pendingProxy = { id, finish }
      try {
        this.requestProxy({ id })
      } catch {
        finish('')
      }
    })
    const githubProxy = value.trim()
    if (
      githubProxy &&
      !/^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?(?:\/[^\s?#@\\]*)?$/i.test(
        githubProxy,
      )
    )
      throw new Error('invalid_update_proxy')
    return githubProxy
  }
  #url(url, proxy) {
    return proxy &&
      ['github.com', 'raw.githubusercontent.com', 'api.github.com'].includes(
        new URL(url).hostname,
      )
      ? `${proxy.replace(/\/+$/, '')}/${url}`
      : url
  }
  #verify(envelope) {
    return verifyManifest(envelope, {
      publicKey: this.publicKey,
      channel: this.identity.channel,
      os: this.target.os,
      arch: this.target.arch,
      currentVersion: this.currentVersion,
      currentClientSha: this.currentClientSha,
      currentBuiltAt: this.currentBuiltAt,
    })
  }
  async check() {
    if (this.#closed || this.#installInProgress) return this.state
    if (this.#operation) return this.#operation
    this.#operation = (async () => {
      this.#publish({ state: 'checking', error: null })
      const proxy = await this.#readProxy()
      if (this.#closed) return this.state
      const response = await this.network.request({
        url: this.#url(this.manifestUrl, proxy),
        timeoutMs: 30000,
      })
      if (response.status !== 200) throw new Error('update_check_failed')
      const envelope = JSON.parse(response.body)
      const manifest = this.#verify(envelope)
      this.#envelope = envelope
      this.#manifest = manifest
      this.#proxy = proxy
      this.#publish({
        state: manifest.available ? 'available' : 'idle',
        version: manifest.version,
        bytes: 0,
        total: manifest.asset.size,
      })
      return this.state
    })()
    try {
      return await this.#operation
    } catch (error) {
      this.#publish({ state: 'error', error: error.message })
      throw error
    } finally {
      this.#operation = null
    }
  }
  async download() {
    if (this.#closed || this.#installInProgress)
      throw new Error('update_install_in_progress')
    if (this.#operation) return this.#operation
    if (!this.#manifest?.available) throw new Error('update_not_available')
    this.#operation = this.#download()
    try {
      return await this.#operation
    } finally {
      this.#operation = null
    }
  }
  async #download() {
    const manifest = this.#verify(this.#envelope)
    if (!manifest.available) throw new Error('update_not_available')
    this.#controller = new AbortController()
    const controller = this.#controller
    const timeout = setTimeout(() => controller.abort(), 60 * 60 * 1000)
    const path = join(
      this.directory,
      `${manifest.asset.sha256}.${manifest.asset.kind === 'nsis' ? 'exe' : 'zip'}`,
    )
    const temporary = `${path}.part`
    let handle
    this.#publish({
      state: 'downloading',
      error: null,
      bytes: 0,
      total: manifest.asset.size,
    })
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 })
      handle = await open(temporary, 'w', 0o600)
      const response = await this.network.fetch(
        this.#url(manifest.asset.url, this.#proxy),
        {
          signal: controller.signal,
        },
      )
      if (!response.ok || response.status === 206)
        throw new Error('update_download_failed')
      const digest = createHash('sha256')
      let bytes = 0,
        lastProgress = 0
      for await (const chunk of response.body ?? []) {
        bytes += chunk.length
        if (bytes > manifest.asset.size) throw new Error('update_size_mismatch')
        digest.update(chunk)
        await handle.writeFile(chunk)
        if (Date.now() - lastProgress > 200) {
          this.#publish({ bytes })
          lastProgress = Date.now()
        }
      }
      if (
        bytes !== manifest.asset.size ||
        digest.digest('hex') !== manifest.asset.sha256
      )
        throw new Error('update_digest_mismatch')
      await handle.sync()
      await handle.close()
      handle = null
      await rename(temporary, path)
      // Publish the original signed manifest independently of the asset.
      const envelopeFile = await open(
        join(this.directory, 'manifest.json.part'),
        'w',
        0o600,
      )
      try {
        await envelopeFile.writeFile(JSON.stringify(this.#envelope))
        await envelopeFile.sync()
      } finally {
        await envelopeFile.close()
      }
      await rename(
        join(this.directory, 'manifest.json.part'),
        join(this.directory, 'manifest.json'),
      )
      this.#path = path
      this.#publish({ state: 'ready', bytes, error: null })
      return this.state
    } catch (error) {
      this.#publish({
        state: controller.signal.aborted ? 'cancelled' : 'error',
        error: controller.signal.aborted ? null : error.message,
      })
      throw error
    } finally {
      clearTimeout(timeout)
      controller.abort()
      await handle?.close()
      await unlink(temporary).catch(() => {})
    }
  }
  cancel() {
    this.#controller?.abort()
    return null
  }
  async install() {
    if (
      this.#closed ||
      this.#installInProgress ||
      this.#operation ||
      this.state.state !== 'ready' ||
      !this.#path
    )
      throw new Error('update_not_ready')
    this.#installInProgress = true
    try {
      const pending = await lstat(
        join(this.directory, 'pending-startup.json'),
      ).catch((error) => {
        if (error.code !== 'ENOENT') throw error
        return null
      })
      if (pending) throw new Error('update_startup_pending')
      const manifest = this.#verify(
        JSON.parse(
          await readFile(join(this.directory, 'manifest.json'), 'utf8'),
        ),
      )
      if (
        !manifest.available ||
        manifest.asset.sha256 !== this.#manifest.asset.sha256
      )
        throw new Error('update_not_ready')
      const asset = this.#path
      this.#publish({ state: 'checking', error: null })
      try {
        const info = await lstat(asset)
        if (!info.isFile() || info.size !== manifest.asset.size)
          throw new Error('Downloaded update size changed')
        const digest = createHash('sha256')
        // The inclusive end allows one extra byte if the file grows mid-read.
        let bytes = 0
        for await (const chunk of createReadStream(asset, {
          end: manifest.asset.size,
        })) {
          bytes += chunk.length
          digest.update(chunk)
        }
        if (
          bytes !== manifest.asset.size ||
          digest.digest('hex') !== manifest.asset.sha256
        )
          throw new Error('Downloaded update digest changed')
      } catch (cause) {
        this.#path = null
        this.#publish({ state: 'error', error: 'update_digest_mismatch' })
        throw new Error('update_digest_mismatch', { cause })
      }
      if (this.#closed) throw new Error('update_not_ready')
      await this.#runInstaller({
        manifest: 'manifest.json',
        asset,
        version: this.currentVersion,
        clientSha: this.currentClientSha,
        builtAt: this.currentBuiltAt,
      })
      return null
    } catch (error) {
      this.#installInProgress = false
      throw error
    }
  }
  automatic() {
    if (this.#closed || this.#timer) return null
    const run = async () => {
      if (this.#operation || this.state.state === 'ready') return
      try {
        await this.check()
        if (!this.#closed && this.state.state === 'available')
          await this.download()
      } catch {}
    }
    void run()
    this.#timer = setInterval(() => void run(), 6 * 60 * 60 * 1000)
    return null
  }
  async recoveryAvailable() {
    try {
      const pending = JSON.parse(
        await readFile(join(this.directory, 'pending-startup.json'), 'utf8'),
      )
      if (
        !pending.backup ||
        !pending.manifest ||
        !pending.asset ||
        basename(pending.manifest) !== pending.manifest ||
        basename(pending.asset) !== pending.asset
      )
        return null
      const previous = this.appPath.endsWith('.app')
        ? `${this.appPath.slice(0, -4)}.previous.app`
        : `${this.appPath}.previous`
      if (pending.previousApp !== previous) return null
      const envelope = JSON.parse(
        await readFile(join(this.directory, pending.manifest), 'utf8'),
      )
      const manifest = verifyManifest(envelope, {
        publicKey: this.publicKey,
        channel: this.identity.channel,
        ...this.target,
        currentVersion: pending.previousVersion,
        currentClientSha: pending.previousClientSha,
        currentBuiltAt: pending.previousBuiltAt,
        variant: this.variant,
      })
      if (
        manifest.version !== pending.version ||
        manifest.clientSha !== pending.clientSha ||
        manifest.backendSha !== pending.backendSha ||
        manifest.asset.sha256 !== pending.asset.split('.')[0]
      )
        return null
      return pending
    } catch {
      return null
    }
  }
  async recover() {
    if (this.#installInProgress) throw new Error('update_install_in_progress')
    this.#installInProgress = true
    try {
      const pending = await this.recoveryAvailable()
      if (!pending) throw new Error('update_recovery_unavailable')
      this.cancel()
      await this.#operation?.catch(() => {})
      await this.#runInstaller({
        rollback: true,
        manifest: pending.manifest,
        asset: join(this.directory, pending.asset),
        backup: pending.backup,
        version: pending.previousVersion,
        clientSha: pending.previousClientSha,
        builtAt: pending.previousBuiltAt,
      })
    } catch (error) {
      this.#installInProgress = false
      throw error
    }
  }
  async #runInstaller({
    rollback = false,
    manifest,
    asset,
    backup,
    version,
    clientSha,
    builtAt,
  }) {
    this.#publish({ state: 'installing', error: null })
    let releaseSession
    try {
      releaseSession = await this.stop()
      if (!rollback) backup = await this.backup()
      // Run outside the installation directory. Windows locks running binaries.
      const helperCopy = join(
        this.directory,
        `${rollback ? 'recovery' : 'install'}-helper${process.platform === 'win32' ? '.exe' : ''}`,
      )
      await copyFile(this.helper, helperCopy)
      await chmod(helperCopy, 0o700)
      const customDevRoot =
        this.identity.channel === 'dev' &&
        process.env.SONGLOFT_DESKTOP_DATA_ROOT
      const child = spawn(
        helperCopy,
        [
          ...(rollback ? ['-rollback'] : []),
          '-manifest',
          join(this.directory, manifest),
          '-asset',
          asset,
          '-app',
          this.appPath,
          '-parent',
          String(process.pid),
          '-channel',
          this.identity.channel,
          '-version',
          version,
          '-client-sha',
          clientSha ?? '',
          '-built-at',
          builtAt ?? '',
          '-backup',
          backup ?? '',
        ],
        {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          // The helper changes its working directory before restarting.
          env: customDevRoot
            ? {
                ...process.env,
                SONGLOFT_DESKTOP_DATA_ROOT: dirname(this.identity.data),
              }
            : undefined,
        },
      )
      await new Promise((resolve, reject) => {
        child.once('spawn', resolve)
        child.once('error', reject)
      })
      child.unref()
    } catch (error) {
      releaseSession?.()
      this.#publish({ state: 'error', error: 'update_install_failed' })
      throw error
    }
    this.emit('install-started')
  }
  async close() {
    this.#closed = true
    clearInterval(this.#timer)
    this.#pendingProxy?.finish('')
    this.cancel()
    await this.#operation?.catch(() => {})
  }
}
