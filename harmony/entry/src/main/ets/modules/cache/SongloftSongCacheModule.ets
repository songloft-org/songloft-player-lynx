import { LynxModule, LynxContext } from '@lynx/lynx'
import { common } from '@kit.AbilityKit'
import { CacheContract, CacheError, CacheHistory, CacheLookup, CacheSize, CacheTask } from './SongCacheTypes'
import { SongCacheStore } from './SongCacheStore'

/** Fourteen Callback methods; all writes share the same durable process-wide scheduler. */
export class SongloftSongCacheModule extends LynxModule {
  private readonly ability: common.UIAbilityContext
  private readonly lynxContext: LynxContext
  constructor(context: LynxContext, param?: Object) {
    super(context, param)
    this.ability = param as common.UIAbilityContext
    this.lynxContext = context
  }
  private store(): SongCacheStore { return SongCacheStore.get(this.ability) }
  private error(callback: (result: string) => void, error: Error): void {
    const value: CacheError = { error: SongCacheStore.errorCode(error) }
    callback(JSON.stringify(value))
  }
  private read(callback: (result: string) => void, operation: () => Object): void {
    try { callback(JSON.stringify(operation())) } catch (error) { this.error(callback, error as Error) }
  }
  private downloadResult(callback: (result: string) => void, operation: () => Promise<Object>): void {
    try {
      void operation().then((result: Object) => callback(JSON.stringify(result))).catch((error: Error) => this.error(callback, error))
    } catch (error) { this.error(callback, error as Error) }
  }
  private mutate(callback: (result: string) => void, operation: () => Promise<void>): void {
    try { void operation().then(() => callback('{}')).catch((error: Error) => this.error(callback, error)) }
    catch (error) { this.error(callback, error as Error) }
  }
  public getCacheContract(callback: (result: string) => void): void {
    const value: CacheContract = { version: 2 }
    callback(JSON.stringify(value))
  }
  public cacheEntry(request: string, callback: (result: string) => void): void {
    this.downloadResult(callback, () => this.store().cacheEntry(request, (task: CacheTask) => {
      try { this.lynxContext.sendGlobalEvent('songCacheProgress', [task]) } catch (_) {}
    }))
  }
  public getEntry(request: string, callback: (result: string) => void): void { this.read(callback, () => this.store().getEntry(request)) }
  public listEntries(request: string, callback: (result: string) => void): void { this.read(callback, () => this.store().listEntries(request)) }
  public removeEntry(request: string, callback: (result: string) => void): void { this.mutate(callback, () => this.store().remove(request)) }
  public clearNamespace(request: string, callback: (result: string) => void): void {
    this.mutate(callback, () => {
      const value = JSON.parse(request) as CacheLookup
      return this.store().clearNamespace(value.namespace)
    })
  }
  public clearLegacy(callback: (result: string) => void): void { this.mutate(callback, () => this.store().clearLegacy()) }
  public getTasks(callback: (result: string) => void): void {
    this.read(callback, () => { const history: CacheHistory = { tasks: this.store().getTasks() }; return history })
  }
  public cancelTask(taskId: string): void { try { this.store().cancel(taskId) } catch (_) {} }
  public download(songId: string, remote: string, ext: string, maxBytes: number, callback: (result: string) => void): void {
    this.downloadResult(callback, () => this.store().legacyDownload(songId, remote, ext, maxBytes))
  }
  public getCacheInfo(songId: string, callback: (result: string) => void): void { this.read(callback, () => this.store().legacyInfo(songId)) }
  public remove(songId: string, callback: (result: string) => void): void { this.mutate(callback, () => this.store().legacyRemove(songId)) }
  public getCacheSize(callback: (result: string) => void): void {
    this.read(callback, () => { const size: CacheSize = { bytes: this.store().size() }; return size })
  }
  public clearAll(callback: (result: string) => void): void { this.mutate(callback, () => this.store().clearAll()) }
}
