import { expect, test, vi } from 'vitest'
import { createMemoryStorage } from '../../../core/storage/index.js'
import { OfflineIdentityStore, offlineOwnerKey, readOfflineAddress } from '../data/offline-identity.js'
import { cacheNamespace } from '../domain/cache-identity.js'
import { appConfig } from '../../../core/config/app-config.js'

const address = { profile: 'profile-a', server: 'https://example.com/Music' }
test('only a proven actor is persisted and can be restored without tokens', async () => {
  const storage = createMemoryStorage(), identity = new OfflineIdentityStore(storage)
  await identity.activate(address, null)
  expect(identity.get()).toBeNull()
  await identity.activate(address, 'alice')
  const namespace = cacheNamespace({ ...address, username: 'alice' })
  expect(identity.get()?.namespace).toBe(namespace)
  const restored = new OfflineIdentityStore(storage)
  await restored.activate(address, null)
  expect(restored.get()?.namespace).toBe(namespace)
  expect(await storage.secure.get('access_token')).toBeNull()
})
test('same URL with a different profile, path case and corrupt ownership cannot restore the previous actor', async () => {
  const storage = createMemoryStorage(), identity = new OfflineIdentityStore(storage)
  await identity.activate(address, 'alice')
  await identity.activate({ ...address, profile: 'profile-b' }, null)
  expect(identity.get()).toBeNull()
  await identity.activate({ ...address, server: 'https://example.com/music' }, null)
  expect(identity.get()).toBeNull()
  await storage.prefs.set(offlineOwnerKey(address.profile), '{"version":1,"username":"bob","namespace":"wrong"}')
  await identity.activate(address, null)
  expect(identity.get()).toBeNull()
})
test('expiry preserves offline ownership; explicit revoke removes it across cold starts', async () => {
  const storage = createMemoryStorage(), identity = new OfflineIdentityStore(storage)
  await identity.activate(address, 'alice')
  identity.invalidatePending()
  expect(identity.get()?.username).toBe('alice')
  await identity.revoke(address)
  expect(identity.get()).toBeNull()
  await new OfflineIdentityStore(storage).activate(address, null)
  expect(await storage.prefs.get(offlineOwnerKey(address.profile))).toBeNull()
})
test('revocation waits for an in-flight ownership write and removes its result', async () => {
  const storage = createMemoryStorage(), identity = new OfflineIdentityStore(storage)
  const set = storage.prefs.set.bind(storage.prefs)
  let finish = () => {}
  const pending = new Promise<void>(resolve => { finish = resolve })
  vi.spyOn(storage.prefs, 'set').mockImplementation(async (key, value) => { await pending; await set(key, value) })
  const claim = identity.activate(address, 'alice')
  await Promise.resolve(); await Promise.resolve()
  const revoke = identity.revoke(address)
  expect(identity.get()).toBeNull()
  finish(); await Promise.all([claim, revoke])
  expect(await storage.prefs.get(offlineOwnerKey(address.profile))).toBeNull()
})
test('a late offline restore cannot replace a newly authenticated actor', async () => {
  const storage = createMemoryStorage(), identity = new OfflineIdentityStore(storage)
  await identity.activate(address, 'alice')
  const saved = await storage.prefs.get(offlineOwnerKey(address.profile))
  let finish = (_value: string | null) => {}
  vi.spyOn(storage.prefs, 'get').mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const restore = identity.activate(address, null)
  await Promise.resolve(); await Promise.resolve()
  await identity.activate(address, 'bob')
  finish(saved); await restore
  expect(identity.get()?.username).toBe('bob')
})
test('editable usernames are never ownership proof and unrelated active profiles do not bind tokens', async () => {
  appConfig.reset()
  const storage = createMemoryStorage()
  await storage.prefs.set('server_active_profile', 'profile-a')
  await storage.prefs.set('server_profiles', JSON.stringify([{ id: 'profile-a', url: 'https://example.com/Music', username: 'editable-name' }]))
  expect(await readOfflineAddress(storage, address.server)).toEqual(address)
  expect(await readOfflineAddress(storage, 'https://other/Music')).toEqual({ profile: null, server: 'https://other/Music' })
  const identity = new OfflineIdentityStore(storage)
  await identity.activate(address, null)
  expect(identity.get()).toBeNull()
})
