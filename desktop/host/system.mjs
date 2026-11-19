import { EventEmitter } from 'node:events'

export class DesktopSystem extends EventEmitter {
  #timer
  constructor(native) {
    super()
    this.current = native.systemAppearance()
    this.#timer = setInterval(() => {
      const next = native.systemAppearance()
      if (JSON.stringify(next) !== JSON.stringify(this.current)) {
        this.current = next
        this.emit('appearance', next)
      }
    }, 1000)
  }
  close() {
    clearInterval(this.#timer)
    this.removeAllListeners()
  }
}

export class DesktopMedia extends EventEmitter {
  #initialized = false
  #timer
  #lastUpdate = 0
  #state = null
  constructor(native) {
    super()
    this.native = native
  }
  initialize(windowHandle) {
    if (this.#initialized) return
    this.native.media('initialize', windowHandle)
    this.#initialized = true
    this.#timer = setInterval(() => {
      for (const intent of this.native.media('drain'))
        this.emit('intent', intent)
      if (this.#state && Date.now() - this.#lastUpdate >= 500) {
        this.native.media('update', this.#state)
        this.#lastUpdate = Date.now()
      }
    }, 100)
  }
  update(state) {
    this.#state = state
  }
  clear() {
    this.#state = null
    if (this.#initialized) this.native.media('clear')
  }
  close() {
    clearInterval(this.#timer)
    if (this.#initialized) this.native.media('close')
    this.#initialized = false
    this.removeAllListeners()
  }
}
