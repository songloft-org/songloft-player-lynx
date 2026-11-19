import { createPublicKey, generateKeyPairSync } from 'node:crypto'
import { writeFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
const channel = process.env.SONGLOFT_DESKTOP_CHANNEL
if (!['dev', 'stable'].includes(channel)) throw new Error('Invalid channel')
const configured = process.env.UPDATE_PUBLIC_KEY
if (
  !configured &&
  (channel === 'stable' || process.env.REQUIRE_UPDATE_KEY === 'true')
)
  throw new Error(
    'Configure DESKTOP_UPDATE_PUBLIC_KEY for desktop distribution',
  )
const key = configured
  ? createPublicKey(configured)
  : generateKeyPairSync('ed25519').publicKey
if (key.asymmetricKeyType !== 'ed25519')
  throw new Error('DESKTOP_UPDATE_PUBLIC_KEY must be Ed25519')
const path = join(process.env.RUNNER_TEMP, 'desktop-update-public.pem')
await writeFile(path, key.export({ type: 'spki', format: 'pem' }))
await appendFile(
  process.env.GITHUB_ENV,
  `SONGLOFT_DESKTOP_UPDATE_PUBLIC_KEY=${path}\n`,
)
