import { join } from 'node:path'
import { JsonStore } from './json-store.mjs'

export function createDesktopStorage({
  identity,
  native,
  platform = process.platform,
}) {
  const prefs = new JsonStore(join(identity.data, 'preferences.json'))
  const secrets = new JsonStore(join(identity.data, 'credentials.dpapi.json'))
  const keyName = (key) => {
    if (typeof key !== 'string' || key.length > 2048 || key.includes('\0'))
      throw new Error('Invalid storage key')
    return key
  }
  const service = (key) => `${identity.id}:${keyName(key)}`
  return {
    prefs,
    secure: {
      async get(key) {
        keyName(key)
        if (platform === 'darwin')
          return await native.secureGet(identity.keychainService, key)
        if (platform !== 'win32')
          throw new Error('System credential storage unavailable')
        const encrypted = await secrets.get(key)
        return encrypted === null
          ? null
          : native
              .unprotectSecret(service(key), Buffer.from(encrypted, 'base64'))
              .toString('utf8')
      },
      async set(key, value) {
        keyName(key)
        if (typeof value !== 'string' || Buffer.byteLength(value) > 1024 * 1024)
          throw new Error('Invalid credential value')
        if (platform === 'darwin') {
          await native.secureSet(identity.keychainService, key, value)
          return
        }
        if (platform !== 'win32')
          throw new Error('System credential storage unavailable')
        const encrypted = native.protectSecret(
          service(key),
          Buffer.from(value, 'utf8'),
        )
        await secrets.set(key, encrypted.toString('base64'))
      },
      async remove(key) {
        keyName(key)
        if (platform === 'darwin') {
          await native.secureRemove(identity.keychainService, key)
          return
        }
        if (platform !== 'win32')
          throw new Error('System credential storage unavailable')
        await secrets.remove(key)
      },
    },
    paths: {
      appData: identity.data,
      cache: identity.cache,
      documents: join(identity.data, 'documents'),
    },
  }
}
