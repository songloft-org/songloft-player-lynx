// A locked/suspended display must not acquire presentation buffers. Playback
// remains owned by the same engine and continues without a video surface.
export class DesktopVisibility {
  #powerHandlers = new Map()
  #windowHandlers = new Map()
  #window
  #windowVisible = false
  #screenActive = true
  constructor({ native, send, powerMonitor, config }) {
    Object.assign(this, { native, send, powerMonitor, config })
    this.#screenActive = powerMonitor?.getSystemIdleState?.(1) !== 'locked'
    for (const name of ['lock-screen', 'suspend', 'user-did-resign-active'])
      this.#listen(name, () => {
        this.#screenActive = false
        this.#publish()
      })
    for (const name of ['unlock-screen', 'resume', 'user-did-become-active'])
      this.#listen(name, () => {
        this.#screenActive = powerMonitor?.getSystemIdleState?.(1) !== 'locked'
        this.#publish()
      })
    this.#publish()
  }
  #listen(name, handler) {
    this.#powerHandlers.set(name, handler)
    this.powerMonitor?.on(name, handler)
  }
  #publish() {
    const visible = this.#screenActive && this.#windowVisible
    this.config.windowVisible = visible
    this.native.player('visible', visible)
    this.send('SongloftDesktop.visibility', { visible })
    if (visible) this.send('SongloftLifecycle.resumed', {})
  }
  attach(window) {
    for (const [name, handler] of this.#windowHandlers)
      this.#window?.removeListener(name, handler)
    this.#windowHandlers.clear()
    this.#window = window
    this.#windowVisible = window.isVisible() && !window.isMinimized()
    for (const [name, visible] of [
      ['show', true],
      ['hide', false],
      ['minimize', false],
      ['restore', true],
    ]) {
      const handler = () => {
        this.#windowVisible = visible
        this.#publish()
      }
      this.#windowHandlers.set(name, handler)
      window.on(name, handler)
    }
    this.#publish()
  }
  close() {
    for (const [name, handler] of this.#powerHandlers)
      this.powerMonitor?.removeListener(name, handler)
    for (const [name, handler] of this.#windowHandlers)
      this.#window?.removeListener(name, handler)
    this.#powerHandlers.clear()
    this.#windowHandlers.clear()
    this.#window = null
  }
}
