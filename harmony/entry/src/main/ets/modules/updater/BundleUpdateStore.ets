import { common } from '@kit.AbilityKit'
import { fileIo, statfs } from '@kit.CoreFileKit'
import { cryptoFramework } from '@kit.CryptoArchitectureKit'
import { util } from '@kit.ArkTS'
import { systemDateTime } from '@kit.BasicServicesKit'
import { BundleUpdateProtocol, UpdateAsset, UpdateBundle, UpdateHost, UpdateIdentity, UpdateManifest, UpdatePublicKey, UpdateRequest } from './BundleUpdateProtocol'
import { BundleUpdateTransfer } from './BundleUpdateTransfer'

class UpdatePointers {
  host: string = ''
  active?: string = undefined
  previous?: string = undefined
  pending?: string = undefined
  trial?: string = undefined
  last_error?: string = undefined
}
interface UpdateRecord { manifest: UpdateManifest; raw: string; key: string; path: string }
export interface UpdateProgress { task_id: string; bytes: number; total: number }
interface UpdateHostInfo extends UpdateIdentity {
  platform: string
  engine: string
  update_protocol: number
  bridge_version: number
  local_schema: number
  capabilities: string[]
  trusted_key_ids: string[]
}
interface UpdateRunning extends UpdateIdentity { kind: string; assets?: UpdateAsset[]; bundle_update?: UpdateBundle }
interface UpdateInfo {
  host: UpdateHostInfo
  running: UpdateRunning
  active: UpdateManifest | null
  previous: UpdateManifest | null
  pending: UpdateManifest | null
  last_error?: string
  download?: UpdateProgress
}
interface UpdatePrepared { prepared: boolean; bundle_id: string }

/** Process-wide manager shared by the root loader and module; no JS-provided paths or keys. */
export class BundleUpdateStore {
  private static instance?: BundleUpdateStore = undefined
  private readonly host: UpdateHost
  private readonly marker: string
  private readonly root: string
  private readonly bundles: string
  private state: UpdatePointers = new UpdatePointers()
  private persisted: UpdatePointers = new UpdatePointers()
  private selected?: UpdateRecord = undefined
  private launched: boolean = false
  private failed: boolean = false
  private confirmationTimer: number = -1
  private trialStarted: number = 0
  private inflight?: BundleUpdateTransfer = undefined
  private cancelledTasks: string[] = []
  private writeSequence: number = 0

  static get(context: common.UIAbilityContext): BundleUpdateStore {
    if (!BundleUpdateStore.instance) BundleUpdateStore.instance = new BundleUpdateStore(context)
    return BundleUpdateStore.instance
  }
  private constructor(context: common.UIAbilityContext) {
    const metadata = context.resourceManager.getRawFileContentSync('native-host.json')
    this.host = JSON.parse(util.TextDecoder.create('utf-8').decodeToString(metadata)) as UpdateHost
    this.marker = BundleUpdateProtocol.hash(metadata)
    this.root = context.filesDir + '/bundle_updates'
    this.bundles = this.root + '/bundles'
    if (!fileIo.accessSync(this.bundles)) fileIo.mkdirSync(this.bundles, true)
    try { this.state = JSON.parse(this.readText(this.root + '/state.json', 16384)) as UpdatePointers } catch (_) { /* First launch. */ }
    this.persisted = this.cloneState()
    for (const name of fileIo.listFileSync(this.root)) {
      if (/^download-[A-Za-z0-9-]+$/.test(name)) this.removeDirectory(this.root + '/' + name)
      if (/^write-[A-Za-z0-9-]+$/.test(name)) { try { fileIo.unlinkSync(this.root + '/' + name) } catch (_) {} }
    }
  }
  private cloneState(): UpdatePointers { return JSON.parse(JSON.stringify(this.state)) as UpdatePointers }
  private readText(path: string, maximum: number): string {
    const stat = fileIo.statSync(path)
    if (!stat.isFile() || stat.size < 1 || stat.size > maximum) throw new Error('invalid_manifest')
    const data = fileIo.readTextSync(path)
    if (BundleUpdateProtocol.bytes(data).length !== stat.size) throw new Error('checksum_mismatch')
    return data
  }
  private hashFile(path: string): string {
    const file = fileIo.openSync(path, fileIo.OpenMode.READ_ONLY)
    const digest = cryptoFramework.createMd('SHA256')
    try {
      const buffer = new ArrayBuffer(64 * 1024)
      let position = 0
      while (true) {
        const count = fileIo.readSync(file.fd, buffer, { offset: position })
        if (count === 0) break
        position += count
        if (position > BundleUpdateProtocol.maximumBundle) throw new Error('checksum_mismatch')
        digest.updateSync({ data: new Uint8Array(buffer.slice(0, count)) })
      }
      return BundleUpdateProtocol.hex(digest.digestSync().data)
    } finally { fileIo.closeSync(file.fd) }
  }
  private writeAtomic(path: string, data: string): void {
    const temporary = this.root + '/write-' + Date.now() + '-' + (++this.writeSequence)
    const file = fileIo.openSync(temporary, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC)
    try {
      const bytes = BundleUpdateProtocol.bytes(data)
      let offset = 0
      while (offset < bytes.length) {
        const count = fileIo.writeSync(file.fd, bytes.buffer.slice(offset))
        if (count <= 0) throw new Error('update_storage_unavailable')
        offset += count
      }
      fileIo.fsyncSync(file.fd)
    } catch (error) {
      try { fileIo.unlinkSync(temporary) } catch (_) {}
      throw error as Error
    } finally { fileIo.closeSync(file.fd) }
    try { fileIo.renameSync(temporary, path) }
    finally { try { fileIo.unlinkSync(temporary) } catch (_) {} }
  }
  private save(): void {
    try { this.writeAtomic(this.root + '/state.json', JSON.stringify(this.state)); this.persisted = this.cloneState() }
    catch (_) { this.state = this.persisted; this.persisted = this.cloneState(); throw new Error('update_storage_unavailable') }
  }
  private removeDirectory(path: string): void { try { fileIo.rmdirSync(path) } catch (_) {} }
  private record(key?: string): UpdateRecord | undefined {
    if (!key || !/^[0-9a-f]{64}-[A-Za-z0-9._-]{1,96}$/.test(key)) return undefined
    try {
      const directory = this.bundles + '/' + key
      const raw = this.readText(directory + '/version.json', BundleUpdateProtocol.maximumManifest)
      const signature = this.readText(directory + '/version.json.sig', 8192)
      const manifest = BundleUpdateProtocol.verify(raw, signature, this.host)
      const path = directory + '/main.lynx.bundle'
      const stat = fileIo.statSync(path)
      if (BundleUpdateProtocol.key(manifest) !== key || !stat.isFile() || stat.size !== manifest.bundle_update.size ||
        this.hashFile(path) !== manifest.bundle_update.sha256) return undefined
      const result: UpdateRecord = { manifest: manifest, raw: raw, key: key, path: path }
      return result
    } catch (_) { return undefined }
  }
  private prune(): void {
    const keep: (string | undefined)[] = [this.state.active, this.state.previous, this.state.pending, this.state.trial, this.selected?.key]
    for (const name of fileIo.listFileSync(this.bundles)) {
      if (/^[0-9a-f]{64}-[A-Za-z0-9._-]{1,96}$/.test(name) && !keep.includes(name)) this.removeDirectory(this.bundles + '/' + name)
    }
  }
  private keepAfterShellChange(key: string | undefined, changed: boolean): string | undefined {
    const record = this.record(key)
    if (!record) return undefined
    if (!changed) return key
    if (this.host.channel === 'stable') {
      return BundleUpdateProtocol.compare(record.manifest.version, this.host.version) > 0 ? key : undefined
    }
    return BundleUpdateProtocol.time(record.manifest.build_time) > BundleUpdateProtocol.time(this.host.build_time) ? key : undefined
  }
  beginLaunch(): ArrayBuffer | undefined {
    if (!this.launched) {
      this.launched = true
      const changed = this.state.host !== this.marker
      if (this.state.trial) {
        this.state.trial = undefined; this.state.pending = undefined; this.state.last_error = 'rollback_unconfirmed'
      }
      this.state.active = this.keepAfterShellChange(this.state.active, changed)
      this.state.previous = this.keepAfterShellChange(this.state.previous, changed)
      this.state.pending = this.keepAfterShellChange(this.state.pending, changed)
      this.state.host = this.marker
      const pending = this.record(this.state.pending)
      if (pending) {
        this.selected = pending; this.state.trial = pending.key; this.state.pending = undefined
        this.trialStarted = systemDateTime.getUptime(systemDateTime.TimeType.STARTUP)
        this.confirmationTimer = setTimeout(() => { try { this.reportStartupFailure() } catch (_) {} }, 120000)
      } else {
        this.selected = this.record(this.state.active) ?? this.record(this.state.previous)
        if (this.selected) this.state.active = this.selected.key
      }
      try { this.save(); this.prune() }
      catch (error) { this.selected = undefined; this.failed = true; throw error as Error }
    }
    if (!this.selected) return undefined
    const file = fileIo.openSync(this.selected.path, fileIo.OpenMode.READ_ONLY)
    try {
      const data = new ArrayBuffer(this.selected.manifest.bundle_update.size)
      let position = 0
      while (position < data.byteLength) {
        const chunk = new ArrayBuffer(Math.min(64 * 1024, data.byteLength - position))
        const count = fileIo.readSync(file.fd, chunk, { offset: position })
        if (count <= 0) throw new Error('checksum_mismatch')
        new Uint8Array(data).set(new Uint8Array(chunk, 0, count), position)
        position += count
      }
      return data
    } catch (error) { this.reportStartupFailure(); throw error as Error }
    finally { fileIo.closeSync(file.fd) }
  }
  confirmStartup(id: string): void {
    const selected = this.selected
    if (!selected || this.failed || this.state.trial !== selected.key || id !== selected.manifest.bundle_update.bundle_id) return
    if (systemDateTime.getUptime(systemDateTime.TimeType.STARTUP) - this.trialStarted > 120000) {
      this.reportStartupFailure()
      return
    }
    if (this.state.active && this.state.active !== selected.key) this.state.previous = this.state.active
    this.state.active = selected.key; this.state.trial = undefined; this.state.last_error = undefined
    this.save()
    clearTimeout(this.confirmationTimer)
  }
  reportStartupFailure(): void {
    if (!this.state.trial) return
    this.failed = true; this.state.last_error = 'startup_failed'; this.save()
  }
  useBuiltinAfterFailure(): void {
    try { this.reportStartupFailure() } finally { this.selected = undefined }
  }
  restoreBuiltin(): void {
    if (this.inflight) this.inflight.cancel()
    this.state.active = undefined; this.state.previous = undefined; this.state.pending = undefined; this.state.trial = undefined
    this.state.last_error = 'restore_builtin'; this.save()
    clearTimeout(this.confirmationTimer)
  }
  hostInfo(): UpdateHostInfo {
    const host = this.host
    const result: UpdateHostInfo = {
      version: host.version, package_version: host.package_version, native_version: host.native_version,
      build_number: host.build_number, git_commit: host.git_commit, build_time: host.build_time,
      channel: host.channel, release_tag: host.release_tag, platform: 'harmony', engine: host.engines.harmony,
      update_protocol: host.update_protocol, bridge_version: host.bridge_version, local_schema: host.local_schema,
      capabilities: host.capabilities, trusted_key_ids: host.trusted_keys.map((key: UpdatePublicKey) => key.key_id)
    }
    return result
  }
  info(): UpdateInfo {
    const running = JSON.parse(this.selected ? this.selected.raw : JSON.stringify(this.hostInfo())) as UpdateRunning
    running.kind = this.selected ? (this.state.trial === this.selected.key ? 'trial' : 'active') : 'builtin'
    const download: UpdateProgress | undefined = this.inflight ? {
      task_id: this.inflight.id, bytes: this.inflight.bytes, total: this.inflight.total
    } : undefined
    const result: UpdateInfo = {
      host: this.hostInfo(), running: running, active: this.record(this.state.active)?.manifest ?? null,
      previous: this.record(this.state.previous)?.manifest ?? null, pending: this.record(this.state.pending)?.manifest ?? null,
      last_error: this.state.last_error, download: download
    }
    return result
  }
  inspect(raw: string, signature: string): UpdateManifest { return BundleUpdateProtocol.verify(raw, signature, this.host) }
  cancel(id: string): void {
    if (this.inflight?.id === id) this.inflight.cancel()
    else if (id) { this.cancelledTasks.push(id); if (this.cancelledTasks.length > 64) this.cancelledTasks.shift() }
  }
  async prepare(request: UpdateRequest, progress: (value: UpdateProgress) => void): Promise<UpdatePrepared> {
    const manifest = this.inspect(request.manifest, request.signature)
    if (!/^[A-Za-z0-9-]{1,96}$/.test(request.task_id) || !BundleUpdateTransfer.validURL(request.url)) throw new Error('invalid_update_url')
    BundleUpdateProtocol.newUpdate(manifest, this.selected?.manifest ?? this.host, this.host)
    if (this.cancelledTasks.includes(request.task_id)) {
      this.cancelledTasks = this.cancelledTasks.filter((id: string) => id !== request.task_id)
      throw new Error('cancelled')
    }
    if (this.inflight) throw new Error('update_busy')
    this.prune()
    const free = statfs.getFreeSizeSync(this.root)
    if (!Number.isFinite(free) || free < manifest.bundle_update.size + 512 * 1024) throw new Error('insufficient_space')
    const temporary = this.root + '/download-' + request.task_id
    fileIo.mkdirSync(temporary)
    const transfer = new BundleUpdateTransfer(request.task_id, manifest.bundle_update.size)
    this.inflight = transfer
    try {
      const file = temporary + '/main.lynx.bundle'
      await transfer.download(request.url, file, (bytes: number, total: number) => {
        const event: UpdateProgress = { task_id: request.task_id, bytes: bytes, total: total }
        progress(event)
      })
      if (transfer.cancelled) throw new Error('cancelled')
      if (this.hashFile(file) !== manifest.bundle_update.sha256) throw new Error('checksum_mismatch')
      this.writeAtomic(temporary + '/version.json', request.manifest)
      this.writeAtomic(temporary + '/version.json.sig', request.signature)
      const key = BundleUpdateProtocol.key(manifest)
      if (!this.record(key)) {
        this.removeDirectory(this.bundles + '/' + key)
        fileIo.renameSync(temporary, this.bundles + '/' + key)
      }
      this.state.pending = key; this.save(); this.prune()
      const result: UpdatePrepared = { prepared: true, bundle_id: manifest.bundle_update.bundle_id }
      return result
    } finally { this.removeDirectory(temporary); this.inflight = undefined }
  }
}
