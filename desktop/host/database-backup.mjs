import {
  mkdir,
  copyFile,
  readFile,
  writeFile,
  open,
  rm,
  rename,
  stat,
  unlink,
} from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'

export async function backupDatabase({
  dataDirectory,
  directory,
  version,
  backendSha,
}) {
  const database = join(dataDirectory, 'songloft.db')
  try {
    await stat(database)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  // Caller must have stopped the backend. A remaining WAL is retained with its
  // database rather than pretending a bare file copy is a consistent backup.
  const backup = join(
    directory,
    'database-backups',
    `${Date.now()}-${randomUUID()}`,
  )
  await mkdir(backup, { recursive: true, mode: 0o700 })
  try {
    const files = []
    for (const suffix of ['', '-wal', '-shm']) {
      const source = `${database}${suffix}`
      const target = join(backup, `songloft.db${suffix}`)
      try {
        await copyFile(source, target)
      } catch (error) {
        if (suffix && error.code === 'ENOENT') continue
        throw error
      }
      const handle = await open(target, 'r+')
      try {
        await handle.sync()
      } finally {
        await handle.close()
      }
      const digest = createHash('sha256')
      for await (const chunk of createReadStream(target)) digest.update(chunk)
      files.push({
        name: `songloft.db${suffix}`,
        sha256: digest.digest('hex'),
      })
    }
    const metadata = join(backup, 'backup.json')
    await writeFile(
      metadata,
      JSON.stringify({ schema: 1, database, version, backendSha, files }),
      { mode: 0o600 },
    )
    return metadata
  } catch (error) {
    try {
      await rm(backup, { recursive: true, force: true })
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Database backup and cleanup failed',
      )
    }
    throw error
  }
}

export async function confirmUpdateStartup({
  directory,
  appPath,
  version,
  clientSha,
  backendSha,
  backendRunning,
  removePrevious = (path) => rm(path, { recursive: true, force: true }),
  onCleanupError = () => {},
}) {
  const pendingPath = join(directory, 'pending-startup.json')
  const confirmedPath = join(directory, 'last-successful-install.json')
  const readRecord = async (path) => {
    try {
      return JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  }
  const pending = await readRecord(pendingPath)
  const record = pending ?? (await readRecord(confirmedPath).catch(() => null))
  if (!record) return null
  if (
    record.version !== version ||
    record.clientSha !== clientSha ||
    record.backendSha !== backendSha
  ) {
    if (pending) throw new Error('update_startup_identity_mismatch')
    return null
  }
  // A remote session cannot validate migration of a retained local library.
  if (record.backup && !backendRunning) return null
  const previous = appPath.endsWith('.app')
    ? `${appPath.slice(0, -4)}.previous.app`
    : `${appPath}.previous`
  if (record.previousApp !== previous) {
    if (!pending) return null
    throw new Error('invalid_previous_application')
  }
  // Record healthy startup before removing the rollback copy. The same
  // confirmed app can retry cleanup after a temporary filesystem error.
  if (pending) await rename(pendingPath, confirmedPath)
  try {
    await removePrevious(previous)
  } catch (error) {
    onCleanupError(error)
  }
  // Recovery needs the original asset until startup has been confirmed.
  if (
    typeof record.asset === 'string' &&
    /^[a-f0-9]{64}\.(?:exe|zip)$/.test(record.asset)
  ) {
    try {
      await unlink(join(directory, record.asset))
    } catch (error) {
      if (error.code !== 'ENOENT') onCleanupError(error)
    }
  }
  return null
}
