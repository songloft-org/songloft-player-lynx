import { common } from '@kit.AbilityKit'
import { LynxModule, LynxContext, LynxViewClient, LynxError } from '@lynx/lynx'
import { BundleUpdateStore, UpdateProgress } from './BundleUpdateStore'
import { UpdateRequest } from './BundleUpdateProtocol'
import { UpdateMetadata } from './UpdateMetadata'

interface UpdateError { error: string }

export class SongloftUpdateLifecycle extends LynxViewClient {
  private readonly ability: common.UIAbilityContext
  constructor(ability: common.UIAbilityContext) { super(); this.ability = ability }
  public onReceivedError(error: LynxError): void {
    if (!error.isFatal()) return
    try { BundleUpdateStore.get(this.ability).reportStartupFailure() } catch (_) {}
  }
}

export class SongloftUpdateModule extends LynxModule {
  private readonly ability: common.UIAbilityContext
  private readonly lynxContext: LynxContext
  constructor(context: LynxContext, param?: Object) {
    super(context, param)
    this.ability = param as common.UIAbilityContext
    this.lynxContext = context
  }
  private store(): BundleUpdateStore { return BundleUpdateStore.get(this.ability) }
  private replyError(callback: (result: string) => void, error: Error): void {
    const allowed: string[] = ['invalid_manifest', 'invalid_signature', 'unknown_signing_key',
      'incompatible_channel', 'incompatible_platform', 'incompatible_engine', 'incompatible_host',
      'incompatible_protocol', 'incompatible_schema', 'incompatible_bridge', 'incompatible_capability',
      'invalid_update_url', 'update_not_newer', 'update_busy', 'insufficient_space', 'cancelled',
      'checksum_mismatch', 'download_failed', 'update_storage_unavailable',
      'invalid_metadata_request', 'metadata_failed', 'metadata_too_large']
    const value: UpdateError = { error: allowed.includes(error.message) ? error.message : 'update_failed' }
    callback(JSON.stringify(value))
  }
  public getInfo(callback: (result: string) => void): void {
    try { callback(JSON.stringify(this.store().hostInfo())) } catch (error) { this.replyError(callback, error as Error) }
  }
  public fetchMetadata(requestJSON: string, callback: (result: string) => void): void {
    void UpdateMetadata.fetch(requestJSON).then(result => callback(JSON.stringify(result)))
      .catch((error: Error) => this.replyError(callback, error))
  }
  public getState(callback: (result: string) => void): void {
    try { callback(JSON.stringify(this.store().info())) } catch (error) { this.replyError(callback, error as Error) }
  }
  public inspectManifest(raw: string, signature: string, callback: (result: string) => void): void {
    try { callback(JSON.stringify(this.store().inspect(raw, signature))) } catch (error) { this.replyError(callback, error as Error) }
  }
  public download(requestJSON: string, callback: (result: string) => void): void {
    void this.doDownload(requestJSON, callback)
  }
  private async doDownload(requestJSON: string, callback: (result: string) => void): Promise<void> {
    try {
      const request = JSON.parse(requestJSON) as UpdateRequest
      const result = await this.store().prepare(request, (event: UpdateProgress) => {
        this.lynxContext.sendGlobalEvent('SongloftUpdate.progress', [event])
      })
      callback(JSON.stringify(result))
    } catch (error) { this.replyError(callback, error as Error) }
  }
  public cancel(taskId: string): void { try { this.store().cancel(taskId) } catch (_) {} }
  public confirmStartup(bundleId: string): void { try { this.store().confirmStartup(bundleId) } catch (_) {} }
  public reportStartupFailure(): void { try { this.store().reportStartupFailure() } catch (_) {} }
  public restoreBuiltin(callback: (result: string) => void): void {
    try { this.store().restoreBuiltin(); callback('{}') } catch (error) { this.replyError(callback, error as Error) }
  }
}
