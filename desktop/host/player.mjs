import { EventEmitter } from 'node:events'

const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
const finite = (value, min, max) => {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error('Invalid player value')
  return value
}
// mpv string-list options escape commas and backslashes with a backslash.
const listValue = (value) =>
  value.replaceAll('\\', '\\\\').replaceAll(',', '\\,')

export class DesktopPlayer extends EventEmitter {
  #generation = 0
  #sourceId = null
  #ready = false
  #intent = false
  #state = 'idle'
  #timer
  #deadline = 0
  #eq = false
  #bands = frequencies.map(() => 0)
  #pluginBands = null
  #metadata = {}
  constructor({ native, network, media = null }) {
    super()
    Object.assign(this, { native, network, media })
    // Initialize once for the application lifetime, including while all macOS
    // windows are closed. Initialization failure is fatal, never mock playback.
    native.player('status')
    this.#timer = setInterval(() => this.#tick(), 100)
  }
  #emit(type, data = {}) {
    this.emit('event', {
      type,
      ...data,
      ...(this.#sourceId ? { sourceId: this.#sourceId } : {}),
    })
  }
  #setState(state) {
    if (state === this.#state) return
    this.#state = state
    this.#emit('stateChanged', { state })
  }
  #tick() {
    try {
      const status = this.status()
      if (!this.#sourceId || status.generation !== this.#generation) return
      if (status.error) throw new Error(status.error)
      if (!this.#ready && status.ready) {
        this.#ready = true
        this.#setState('ready')
        this.#emit('sourceReady', { positionMs: status.positionMs })
        this.native.player('set', 'pause', this.#intent ? 'no' : 'yes')
      }
      if (!this.#ready && Date.now() > this.#deadline)
        throw new Error('Source preparation timed out')
      if (this.#ready) {
        this.#setState(
          status.completed ? 'completed' : status.paused ? 'paused' : 'playing',
        )
        this.#emit('progress', status)
        this.media?.update({ ...this.#metadata, ...status, state: this.#state })
      }
    } catch (error) {
      if (this.#state !== 'error') {
        this.#setState('error')
        this.#emit('error', { code: 'mpv_error', message: error.message })
        this.media?.clear()
        try {
          this.native.player('command', ['stop'])
        } catch {}
      }
    }
  }
  status() {
    return this.native.player('status')
  }
  async command({ method, value, options = {} }) {
    switch (method) {
      case 'load': {
        if (typeof value !== 'string' || !value || value.includes('\0'))
          throw new Error('Invalid source')
        const id = options.sourceId
        if (typeof id !== 'string' || !id || id.length > 256)
          throw new Error('Source identity required')
        const start = finite(options.initialPositionMs ?? 0, 0, 1e12) / 1000
        const headers = Object.entries(options.headers ?? {})
          .map(([key, value]) => {
            if (
              !/^[!#$%&'*+.^_`|~\w-]+$/.test(key) ||
              typeof value !== 'string' ||
              /[\r\n\0]/.test(value)
            )
              throw new Error('Invalid media header')
            return listValue(`${key}: ${value}`)
          })
          .join(',')
        const settings = this.network.options
        const fileOptions = {
          pause: 'yes',
          start: String(start),
          'http-header-fields': headers,
          'tls-verify': settings.insecureTls ? 'no' : 'yes',
          'http-proxy': settings.proxy ?? '',
          cookies: 'no',
        }
        ++this.#generation
        this.#sourceId = id
        this.#ready = false
        this.#intent = options.autoplay === true
        this.#deadline = Date.now() + 45000
        this.#setState('loading')
        this.native.player('load', value, this.#generation, fileOptions)
        break
      }
      case 'play':
      case 'pause':
        this.#intent = method === 'play'
        if (this.#ready)
          this.native.player('set', 'pause', this.#intent ? 'no' : 'yes')
        break
      case 'stop':
        this.native.player('command', ['stop'])
        this.#ready = false
        this.#intent = false
        this.#setState('idle')
        this.#sourceId = null
        this.media?.clear()
        break
      case 'seek':
        this.native.player('command', [
          'seek',
          String(finite(value, 0, 1e12) / 1000),
          'absolute+exact',
        ])
        break
      case 'volume':
        this.native.player('set', 'volume', String(finite(value, 0, 1) * 100))
        break
      case 'speed':
        this.#metadata.speed = finite(value, 0.5, 3)
        this.native.player('set', 'speed', String(finite(value, 0.5, 3)))
        break
      case 'pluginEqualizerAvailable':
        return true
      case 'pluginEqualizer': {
        const gains = value === '' ? null : JSON.parse(value).gains
        if (gains !== null && (!Array.isArray(gains) || gains.length !== frequencies.length ||
          gains.some((gain) => typeof gain !== 'number' || !Number.isFinite(gain) || gain < -12 || gain > 12)))
          throw new Error('Invalid plugin equalizer profile')
        this.#applyEq(gains)
        this.#pluginBands = gains
        break
      }
      case 'equalizerEnabled':
        this.#eq = value === true
        this.#applyEq()
        break
      case 'equalizerBand': {
        const index = finite(options.index, 0, 9)
        if (!Number.isInteger(index)) throw new Error('Invalid EQ index')
        this.#bands[index] = finite(value, -15, 15)
        this.#applyEq()
        break
      }
      case 'metadata':
        this.#metadata = { speed: this.#metadata.speed ?? 1, ...options }
        break
      case 'favorite':
        this.#metadata.favorite = value === true
        break
      case 'lyric':
        this.#metadata.lyric = value
        this.#metadata.lyricInTitle = options.inTitle === true
        break
      case 'volumeQuery':
        this.#emit('volumeChanged', { volume: this.status().volume * 100 })
        break
      case 'next':
      case 'previous':
        this.remote(method)
        break
      default:
        throw new Error('Unsupported player command')
    }
    return null
  }
  #applyEq(pluginBands = this.#pluginBands) {
    const bands = pluginBands ?? this.#bands
    const filters = pluginBands !== null || this.#eq
      ? frequencies
          .map(
            (frequency, index) =>
              `equalizer=f=${frequency}:t=o:w=1:g=${bands[index]}`,
          )
          .join(',')
      : ''
    this.native.player('set', 'af', filters ? `lavfi=[${filters}]` : '')
  }
  remote(command) {
    if (
      !['play', 'pause', 'stop', 'next', 'previous', 'toggleFavorite'].includes(
        command,
      )
    )
      return
    if (['play', 'pause', 'stop'].includes(command))
      this.command({ method: command }).catch(() => {})
    this.#emit('remoteCommand', { command })
  }
  async close() {
    clearInterval(this.#timer)
    await this.command({ method: 'stop' })
    this.media?.close()
    this.native.player('shutdown')
    this.removeAllListeners()
  }
}
