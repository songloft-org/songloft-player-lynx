import { createHash } from 'node:crypto'
import { createServer, createConnection } from 'node:net'
import { mkdir, lstat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export async function singleInstance(id, activate, acquire) {
  const hash = createHash('sha256')
    .update(`${process.getuid?.() ?? process.env.USERNAME}:${id}`)
    .digest('hex')
    .slice(0, 20)
  const directory = join(tmpdir(), `songloft-${hash}`)
  if (process.platform !== 'win32') {
    await mkdir(directory, { mode: 0o700, recursive: true })
    const info = await lstat(directory)
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.uid !== process.getuid() ||
      info.mode & 0o077
    )
      throw new Error('Unsafe instance directory')
  }
  const path =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\songloft-${hash}`
      : join(directory, 'host.sock')
  const owned = acquire
    ? acquire(
        process.platform === 'win32' ? hash : join(directory, 'instance.lock'),
      )
    : null
  if (owned === true && process.platform !== 'win32')
    await unlink(path).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
  if (owned === false) {
    // The primary may still be creating its activation socket. Never unlink a
    // socket without holding the operating-system lock.
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await new Promise((resolve, reject) => {
          const socket = createConnection(path)
          socket.once('connect', () => {
            socket.end('activate')
            resolve()
          })
          socket.once('error', reject)
          socket.setTimeout(1000, () =>
            socket.destroy(new Error('Instance did not respond')),
          )
        })
        return { primary: false, close: async () => {} }
      } catch (error) {
        if (attempt === 29) throw error
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
  }
  const server = createServer((socket) => {
    socket.setTimeout(1000, () => socket.destroy())
    socket.once('data', (data) => {
      if (data.toString() === 'activate') activate()
      socket.end()
    })
  })
  for (let attempt = 0; attempt < 3; ++attempt) {
    try {
      await new Promise((resolve, reject) => {
        const fail = (error) => {
          server.off('listening', done)
          reject(error)
        }
        const done = () => {
          server.off('error', fail)
          resolve()
        }
        server.once('error', fail)
        server.once('listening', done)
        server.listen(path)
      })
      return {
        primary: true,
        close: () => new Promise((resolve) => server.close(resolve)),
      }
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error
      try {
        await new Promise((resolve, reject) => {
          const socket = createConnection(path)
          socket.once('connect', () => {
            socket.end('activate')
            resolve()
          })
          socket.once('error', reject)
          socket.setTimeout(1000, () =>
            socket.destroy(new Error('Instance did not respond')),
          )
        })
        return { primary: false, close: async () => {} }
      } catch (error) {
        if (error.code !== 'ECONNREFUSED' || process.platform === 'win32')
          throw error
        await unlink(path).catch((error) => {
          if (error.code !== 'ENOENT') throw error
        })
      }
    }
  }
  throw new Error('Could not acquire application instance')
}
