import type { SongloftStorage } from '../../../core/storage/types.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import { appConfig } from '../../../core/config/app-config.js'
import { cacheNamespace, normalizeCacheServer, type CacheScope } from '../domain/cache-identity.js'

export interface OfflineOwner extends CacheScope { namespace: string }
export type OfflineAddress = Omit<CacheScope, 'username'>
export function offlineOwnerKey(profile: string | null): string { return `device_cache_actor_v1:${profile ?? 'default'}` }

function owner(address: OfflineAddress, username: string): OfflineOwner {
  const scope = { ...address, server: normalizeCacheServer(address.server), username }
  return { ...scope, namespace: cacheNamespace(scope) }
}
function parseOwner(raw: string | null, address: OfflineAddress): OfflineOwner | null {
  try {
    const value = JSON.parse(raw ?? '') as Partial<OfflineOwner> & { version?: number }
    if (value.version !== 1 || typeof value.username !== 'string' || value.profile !== address.profile ||
      value.server !== normalizeCacheServer(address.server)) return null
    const result = owner(address, value.username)
    return value.namespace === result.namespace ? result : null
  } catch { return null }
}

/** Only a successful session may establish an actor. Editable login fields never do. */
export class OfflineIdentityStore {
  private value: OfflineOwner | null = null
  private epoch = 0
  private writes: Promise<void> = Promise.resolve()
  private listeners = new Set<() => void>()
  constructor(private storage: SongloftStorage) {}
  get = (): OfflineOwner | null => this.value
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private set(value: OfflineOwner | null): void {
    this.value = value
    for (const listener of this.listeners) listener()
  }
  private write(run: () => Promise<void>): Promise<void> {
    this.writes = this.writes.catch(() => {}).then(run).catch(() => {})
    return this.writes
  }
  async activate(address: OfflineAddress, authenticatedUsername: string | null): Promise<void> {
    const epoch = ++this.epoch
    this.set(null)
    if (authenticatedUsername) {
      let next: OfflineOwner
      try { next = owner(address, authenticatedUsername) } catch { return }
      this.set(next)
      await this.write(async () => {
        if (epoch === this.epoch) await this.storage.prefs.set(offlineOwnerKey(address.profile), JSON.stringify({ version: 1, ...next }))
      })
      return
    }
    // Wait for older claims/revocations before reading; a delayed read cannot resurrect a signed-out actor.
    await this.writes
    const raw = await this.storage.prefs.get(offlineOwnerKey(address.profile)).catch(() => null)
    if (epoch === this.epoch) this.set(parseOwner(raw, address))
  }
  async revoke(address: OfflineAddress): Promise<void> {
    ++this.epoch
    this.set(null)
    await this.write(() => this.storage.prefs.remove(offlineOwnerKey(address.profile)))
  }
  /** Expiry keeps the already proven actor, while authentication itself becomes unauthenticated. */
  invalidatePending(): void { ++this.epoch }
  clearMemory(): void { ++this.epoch; this.set(null) }
}

export const offlineIdentity = new OfflineIdentityStore(getSongloftStorage())
export function currentOfflineOwner(): OfflineOwner | null {
  const value = offlineIdentity.get()
  try { return value?.server === normalizeCacheServer(`${appConfig.baseUrl}${appConfig.basePath}`) ? value : null }
  catch { return null }
}

/** Resolve the active profile only when its stored address matches the actual session address. */
export async function readOfflineAddress(storage: SongloftStorage, server: string): Promise<OfflineAddress> {
  const [active, profiles] = await Promise.all([
    storage.prefs.get('server_active_profile').catch(() => null),
    storage.prefs.get('server_profiles').catch(() => null),
  ])
  let profile: string | null = null
  try {
    const values = JSON.parse(profiles ?? '[]') as { id?: string; url?: string }[]
    if (Array.isArray(values) && values.some(value => value.id === active && typeof value.url === 'string' &&
      normalizeCacheServer(`${value.url}${appConfig.basePath}`) === normalizeCacheServer(server))) profile = active
  } catch { /* Legacy/default identity, never an unrelated active profile. */ }
  return { profile, server }
}
