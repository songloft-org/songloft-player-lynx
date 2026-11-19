import { createHash } from 'node:crypto'
import { join } from 'node:path'

export function desktopIdentity({ channel, appData, isolateKeychain = false }) {
  if (!['dev', 'stable'].includes(channel))
    throw new Error('Invalid desktop channel')
  const id = `org.songloft.lynx.desktop${channel === 'dev' ? '.dev' : ''}`
  const data = join(appData, id)
  return Object.freeze({
    id,
    channel,
    data,
    keychainService:
      channel === 'dev' && isolateKeychain
        ? `${id}.${createHash('sha256').update(data).digest('hex')}`
        : id,
    cache: join(data, 'cache'),
    backend: join(data, 'backend'),
  })
}
