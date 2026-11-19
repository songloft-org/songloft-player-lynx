export class DesktopKeyboard {
  #initialized = false
  #timer
  constructor({ native, send, hideWindow }) {
    Object.assign(this, { native, send, hideWindow })
  }
  initialize(handle, closeToTray) {
    if (this.#initialized) return
    this.native.keyboard('initialize', handle, closeToTray)
    this.#initialized = true
    let sequence = 0
    this.#timer = setInterval(() => {
      for (const event of this.native.keyboard('drain')) {
        if (event.type === 'back')
          this.send('SongloftNavigation.backPressed', { seq: ++sequence })
        else if (event.type === 'close') this.hideWindow()
        else
          this.send(
            event.type === 'binding'
              ? 'SongloftKeyboard.binding'
              : 'SongloftKeyboard.action',
            event,
          )
      }
    }, 50)
  }
  configure(state) {
    this.native.keyboard('configure', state)
    return null
  }
  overlay({ blocked }) {
    this.native.keyboard('overlay', blocked === true)
    return null
  }
  close() {
    clearInterval(this.#timer)
    if (this.#initialized) this.native.keyboard('close')
    this.#initialized = false
  }
}
