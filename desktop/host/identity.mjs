import { createHash } from 'node:crypto'
import { join } from 'node:path'

export function desktopIdentity({ channel, appData, isolateProfile = false }) {
  if (!['dev', 'stable'].includes(channel))
    throw new Error('Invalid desktop channel')
  const id = `org.songloft.lynx.desktop${channel === 'dev' ? '.dev' : ''}`
  const data = join(appData, id)
  const profileId =
    channel === 'dev' && isolateProfile
      ? `${id}.${createHash('sha256').update(data).digest('hex')}`
      : id
  return Object.freeze({
    id,
    channel,
    data,
    keychainService: profileId,
    appUserModelId: profileId,
    cache: join(data, 'cache'),
    backend: join(data, 'backend'),
  })
}
