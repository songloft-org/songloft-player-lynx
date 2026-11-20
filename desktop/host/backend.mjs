import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { mkdir, stat, realpath, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, isAbsolute, join, relative, sep } from 'node:path'

export const unavailableMusicDirectory = 'bundle_music_directory_unavailable'

/** Own exactly one child; readiness is the announced port plus a health check. */
export class DesktopBackend extends EventEmitter {
  #child = null
  #stopRequested = false
  #startPromise = null
  #generation = 0
  constructor({
    executable,
    toolsDirectory,
    dataDirectory,
    credentials,
    spawnProcess = spawn,
    request = fetch,
    timeoutMs = 30000,
  }) {
    super()
    for (const path of [executable, toolsDirectory, dataDirectory])
      if (!isAbsolute(path)) throw new Error('Backend paths must be absolute')
    Object.assign(this, {
      executable,
      toolsDirectory,
      dataDirectory,
      credentials,
      spawnProcess,
      request,
      timeoutMs,
    })
    this.state = { state: 'stopped', address: null, error: null }
  }
  #publish(state) {
    this.state = { ...this.state, ...state }
    this.emit('state', this.state)
  }
  async start(musicDirectory) {
    if (!isAbsolute(musicDirectory))
      throw new Error('Music directory must be absolute')
    if (this.#startPromise) return this.#startPromise
    if (this.#child) {
      if (this.state.state === 'running') return this.state
      throw new Error('Backend is already starting or stopping')
    }
    this.#stopRequested = false
    const generation = ++this.#generation
    this.#startPromise = this.#launch(musicDirectory, generation)
    try {
      return await this.#startPromise
    } catch (error) {
      if (generation === this.#generation && !this.#stopRequested) {
        await this.stop()
        this.#publish({
          state: 'failed',
          address: null,
          error:
            error?.message === unavailableMusicDirectory
              ? unavailableMusicDirectory
              : 'Backend could not start',
        })
      }
      throw error
    } finally {
      this.#startPromise = null
    }
  }
  async #launch(musicDirectory, generation) {
    await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 })
    let musicPath
    try {
      musicPath = await realpath(musicDirectory)
      if (!(await stat(musicPath)).isDirectory())
        throw new Error('Not a directory')
      await access(musicPath, constants.R_OK)
    } catch (cause) {
      throw new Error(unavailableMusicDirectory, { cause })
    }
    const dataPath = await realpath(this.dataDirectory)
    const contains = (parent, child) => {
      const path = relative(parent, child)
      return (
        path === '' ||
        (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))
      )
    }
    if (contains(musicPath, dataPath) || contains(dataPath, musicPath))
      throw new Error('Music and application data directories must be separate')
    const credentials = await this.credentials()
    if (this.#stopRequested || generation !== this.#generation)
      throw new Error('Backend start cancelled')
    this.#publish({ state: 'starting', address: null, error: null })
    const child = this.spawnProcess(
      this.executable,
      [
        '-port',
        '0',
        '-db',
        join(this.dataDirectory, 'songloft.db'),
        '-music',
        musicPath,
        '-parent-watch-stdin',
      ],
      {
        cwd: this.dataDirectory,
        env: {
          ...process.env,
          SONGLOFT_BUNDLE_FFMPEG: join(this.toolsDirectory, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
          SONGLOFT_BUNDLE_FFPROBE: join(this.toolsDirectory, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'),
          PATH: `${this.toolsDirectory}${delimiter}${process.env.PATH || ''}`,
          ADMIN_USERNAME: credentials.username,
          ADMIN_PASSWORD: credentials.password,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    )
    this.#child = child
    let exited = false
    let port = null
    const buffers = new Map()
    let failure = null
    const consume = (stream, chunk) => {
      let pending = (buffers.get(stream) || '') + chunk
      const lines = pending.split(/\r?\n/)
      pending = lines.pop().slice(-16384)
      buffers.set(stream, pending)
      for (const line of lines) {
        const match = line.match(/HTTP 访问地址: http:\/\/localhost:(\d+)\//)
        if (match && Number(match[1]) > 0 && Number(match[1]) <= 65535)
          port = Number(match[1])
        this.emit('log', line)
      }
    }
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8')
      stream.on('data', (chunk) => consume(stream, chunk))
    }
    child.on('error', (error) => {
      failure = error
      exited = true
    })
    child.stdin.on('error', () => {})
    child.once('exit', () => {
      exited = true
    })
    child.once('close', (code, signal) => {
      exited = true
      if (this.#child === child) this.#child = null
      if (generation !== this.#generation) return
      if (this.#stopRequested)
        this.#publish({ state: 'stopped', address: null })
      else {
        this.#publish({
          state: 'failed',
          address: null,
          error: `Backend exited (${code ?? signal})`,
        })
        this.emit('unexpected-exit')
      }
    })
    const deadline = Date.now() + this.timeoutMs
    while (Date.now() < deadline) {
      if (exited)
        throw new Error('Backend exited before ready', { cause: failure })
      if (this.#stopRequested || generation !== this.#generation)
        throw new Error('Backend start cancelled')
      if (port) {
        const address = `http://127.0.0.1:${port}`
        try {
          const response = await this.request(`${address}/api/v1/health`, {
            signal: AbortSignal.timeout(1000),
          })
          if (response.ok) {
            if (
              exited ||
              this.#stopRequested ||
              generation !== this.#generation
            )
              throw new Error('Backend start cancelled')
            this.#publish({ state: 'running', address, error: null })
            return this.state
          }
        } catch {
          /* retry until bounded deadline */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 75))
    }
    await this.stop()
    this.#publish({ state: 'failed', error: 'Backend startup timed out' })
    throw new Error('Backend startup timed out')
  }
  async stop() {
    this.#stopRequested = true
    ++this.#generation
    const child = this.#child
    if (!child) {
      this.#publish({ state: 'stopped', address: null })
      return
    }
    this.#publish({ state: 'stopping', address: null })
    // EOF is portable to Windows, unlike relying on Unix SIGTERM semantics.
    const exit = new Promise((resolve) => child.once('close', resolve))
    child.stdin.end()
    let timer
    await Promise.race([
      exit,
      new Promise((resolve) => {
        timer = setTimeout(resolve, 20000)
      }),
    ])
    clearTimeout(timer)
    if (this.#child === child) {
      child.kill('SIGKILL')
      await exit
    }
    this.#child = null
    this.#publish({ state: 'stopped', address: null })
  }
}
